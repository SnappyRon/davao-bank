/**
 * Davao Bank — Phase 8K Bantay drill console.
 *
 * Local-only controller for the owner-driven Bantay drill. Starts one plain
 * node:http server on 127.0.0.1:4400 with a single inline page, SSE status and
 * a read-only Bantay observation panel. All attacker requests are sequential,
 * bounded and abortable. Secrets stay inside this process.
 *
 * Run with: npm run drill
 * .env is injected by npm (`node --env-file=.env`), never read by this file.
 */

import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import {
  ALLOWED_TARGETS,
  STEP_NAMES,
  guardDrillTarget,
  manilaTime,
  parseCommand,
  parseIntensity,
  parseSteps,
  runDrillSteps,
  safeError,
  statusLabel,
  transition,
} from './lib/drill-core.ts';
import { PAGE_HTML } from './lib/drill-page.ts';
import { temporaryStepUp } from './lib/step-up.ts';
import { TEST_CUSTOMER_A, TEST_CUSTOMER_B } from './lib/test-accounts.ts';

const PORT = 4400;
const HOST = '127.0.0.1';
const MAX_TOTAL_REQUESTS = 25;
const MAX_REQUESTS_PER_STEP = 10;
const MAX_TIMELINE_ROWS = 200;
const WRONG_TOTP_CODE = '000000';

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PASSWORD = process.env.SEED_PASSWORD || process.env.E2E_PASSWORD || '';

// Refuse before creating any client or making any request. Env overrides of
// the test addresses cannot widen the allow-list.
const startupGuard = guardDrillTarget(
  ALLOWED_TARGETS[0],
  TEST_CUSTOMER_A,
  TEST_CUSTOMER_B
);
if (!startupGuard.ok) {
  console.log(startupGuard.reason);
  process.exit(2);
}

const makeClient = (key) =>
  createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const state = {
  status: 'idle',
  activeStep: null,
  target: ALLOWED_TARGETS[0],
  steps: [1, 2, 3, 4, 5],
  intensity: 'standard',
  observe: true,
  requests: 0,
  message: 'Ready. Start a drill when the owner is watching.',
  timeline: [],
  observation: {},
  lastEvents: [],
  revision: 0,
};

const sseClients = new Set();
let controller = new AbortController();
let resumeWaiters = [];
let observationTimer = null;
let observing = false;
let deps = null;
let seenEventIds = new Set();

const stopped = () => controller.signal.aborted || state.status === 'stopped';
const observationHalted = () =>
  !deps || !state.observe || state.status === 'stopped' || state.status === 'resetting';

function snapshot() {
  return {
    status: state.status,
    statusLabel: statusLabel(state.status, state.activeStep),
    target: state.target,
    steps: state.steps,
    intensity: state.intensity,
    observe: state.observe,
    requests: state.requests,
    maxTotalRequests: MAX_TOTAL_REQUESTS,
    timeline: state.timeline,
    observation: state.observation,
    message: state.message,
    canStart: ['idle', 'stopped', 'not verified'].includes(state.status),
    revision: state.revision,
  };
}

function broadcast() {
  state.revision += 1;
  const payload = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

function appendTimeline(result, response) {
  state.timeline.push({
    at: result.at,
    name: result.name,
    status: result.status,
    detail: result.detail,
    response: response || 'No new Bantay response observed.',
  });
  if (state.timeline.length > MAX_TIMELINE_ROWS) {
    state.timeline.splice(0, state.timeline.length - MAX_TIMELINE_ROWS);
  }
}

function resolveResume() {
  const waiters = resumeWaiters;
  resumeWaiters = [];
  for (const resolve of waiters) resolve();
}

function waitForResume() {
  if (stopped() || state.status !== 'paused') return Promise.resolve();
  return new Promise((resolve) => {
    resumeWaiters.push(resolve);
    controller.signal.addEventListener(
      'abort',
      () => {
        resumeWaiters = resumeWaiters.filter((item) => item !== resolve);
        resolve();
      },
      { once: true }
    );
  });
}

function withAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

async function findUserId(client, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data) return null;
    const match = data.users.find(
      (user) => typeof user.email === 'string' && user.email.toLowerCase() === email
    );
    if (match) return match.id;
    if (!data.users.length || page >= data.lastPage) return null;
  }
  return null;
}

async function requireDeployment(signal) {
  const probes = [
    ['get_security_timeline', () => deps.anon.rpc('get_security_timeline', { p_limit: 1 })],
    ['get_security_settings', () => deps.anon.rpc('get_security_settings')],
    ['prepare_risk_challenge', () => deps.anon.rpc('prepare_risk_challenge', { p_to_account: null, p_amount: 1, p_idempotency_key: 'deployment-probe' })],
    ['admin_unlock_user', () => deps.anon.rpc('admin_unlock_user', { p_user_id: null, p_note: 'deployment-probe' })],
  ];
  for (const [name, call] of probes) {
    const { error } = await withAbort(call(), signal);
    if (error?.code === 'PGRST202') {
      throw new Error(`NOT VERIFIED — Phase 8 deployment absent (${name} is missing).`);
    }
  }
  const { error: tableError } = await withAbort(
    deps.anon.from('security_events').select('id').limit(0),
    signal
  );
  if (tableError && ['42P01', 'PGRST205'].includes(tableError.code)) {
    throw new Error('NOT VERIFIED — Phase 8 deployment absent (security_events is missing).');
  }
}

async function ensureObserverSession() {
  const { data } = await deps.observer.auth.getUser();
  if (data?.user) return true;
  const { error } = await deps.observer.auth.signInWithPassword({
    email: state.target,
    password: PASSWORD,
  });
  return !error && !observationHalted();
}

function summariseEvents(rows) {
  const fresh = [];
  const labels = [];
  for (const event of rows || []) {
    if (!event?.id || seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);
    fresh.push(event);
    labels.push(`${event.kind} (${event.severity || 'unknown'})`);
  }
  return { fresh, labels };
}

async function observe() {
  if (observationHalted()) return;
  if (observing) return;
  observing = true;
  try {
    if (!(await ensureObserverSession())) {
      state.observation = { updated: manilaTime(), note: 'Observer session unavailable.' };
      broadcast();
      return;
    }
    const [timelineResult, settingsResult] = await Promise.all([
      deps.observer.rpc('get_security_timeline', { p_limit: 20 }),
      deps.observer.rpc('get_security_settings'),
    ]);
    if (observationHalted()) return;
    const events = Array.isArray(timelineResult.data) ? timelineResult.data : [];
    const { labels } = summariseEvents(events);
    const settings = settingsResult.data || {};
    const observations = {
      updated: manilaTime(),
      locked: settings.locked === true,
      unlock_after: settings.unlock_after || null,
      events: events.slice(0, 6).map((event) => `${event.kind} (${event.severity || 'unknown'})`),
      notifications: [],
      cases: [],
    };

    const notifications = await deps.observer
      .from('notifications')
      .select('message')
      .order('created_at', { ascending: false })
      .limit(4);
    if (observationHalted()) return;
    observations.notifications = (notifications.data || []).map((row) => row.message);

    if (deps.service && deps.targetUserId) {
      const cases = await deps.service
        .from('security_cases')
        .select('id, status, opened_by')
        .eq('user_id', deps.targetUserId)
        .eq('opened_by', 'system')
        .order('created_at', { ascending: false })
        .limit(4);
      if (observationHalted()) return;
      observations.cases = (cases.data || []).map(
        (row) => `${String(row.id).slice(0, 8)} ${row.status}`
      );
    }

    state.observation = observations;
    state.lastEvents = observations.events;
    const protective = events.some(
      (event) =>
        event.kind === 'protective_lock' &&
        event.status !== 'resolved' &&
        (event.created_at || '') !== ''
    );
    if (settings.locked === true && protective && state.status !== 'frozen') {
      state.status = 'frozen';
      state.message = 'Frozen by Bantay. Attacker loop stopped; Reset to unlock the test account.';
      controller.abort();
    } else if (state.message === 'Ready. Start a drill when the owner is watching.') {
      state.message = labels.length ? `Bantay recorded: ${labels.join(', ')}.` : state.message;
    }
    broadcast();
  } catch (error) {
    if (!observationHalted()) {
      state.observation = { updated: manilaTime(), note: safeError(error) };
      broadcast();
    }
  } finally {
    observing = false;
  }
}

function startObservation() {
  stopObservation();
  if (!state.observe) return;
  void observe();
  observationTimer = setInterval(() => {
    if (!['running', 'paused', 'frozen'].includes(state.status)) {
      stopObservation();
      return;
    }
    void observe();
  }, 2000);
}

function stopObservation() {
  if (observationTimer) clearInterval(observationTimer);
  observationTimer = null;
}

function otherTarget() {
  return state.target === ALLOWED_TARGETS[0] ? ALLOWED_TARGETS[1] : ALLOWED_TARGETS[0];
}

function buildSteps(profile, signal) {
  const minimal = profile === 'minimal';
  const target = state.target;
  const other = otherTarget();
  const observer = deps.observer;
  const password = PASSWORD;

  const expectedDenied = (result) => Boolean(result?.error);

  return [
    {
      id: 1,
      name: STEP_NAMES[1],
      requests: minimal ? 1 : 5,
      run: async () => {
        const count = minimal ? 1 : 5;
        for (let index = 0; index < count; index += 1) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const result = await withAbort(
            deps.anon.functions.invoke('signin-signal', { body: { email: target } }),
            signal
          );
          if (result.error) throw result.error;
        }
        return {
          status: 'signal recorded',
          detail: `${count} failed-password signal${count === 1 ? '' : 's'} reported through signin-signal.`,
        };
      },
    },
    {
      id: 2,
      name: STEP_NAMES[2],
      requests: minimal ? 1 : 2,
      run: async () => {
        if (!minimal) {
          const auth = await withAbort(
            observer.auth.signInWithPassword({ email: target, password }),
            signal
          );
          if (auth.error) throw auth.error;
          deps.targetUserId = auth.data?.user?.id || deps.targetUserId;
        }
        const device = await withAbort(
          observer.rpc('register_device', {
            p_install_id: `bantay-drill-${randomUUID()}`,
            p_label: 'Bantay drill console',
          }),
          signal
        );
        if (device.error) throw device.error;
        return {
          status: device.data?.new_device ? 'signal recorded' : 'attempted',
          detail: device.data?.new_device
            ? 'New-device sign-in signal recorded.'
            : 'Device was already known to the account.',
        };
      },
    },
    {
      id: 3,
      name: STEP_NAMES[3],
      requests: minimal ? 1 : 6,
      run: async () => {
        deps.fixture = await temporaryStepUp(observer, { email: target, password });
        const rounds = minimal ? 1 : 3;
        for (let index = 0; index < rounds; index += 1) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const verify = await withAbort(
            observer.auth.mfa.challengeAndVerify({
              factorId: deps.fixture.factorId,
              code: WRONG_TOTP_CODE,
            }),
            signal
          );
          if (!verify.error) {
            return {
              status: 'error',
              detail: 'Wrong TOTP code was unexpectedly accepted; drill stopped.',
            };
          }
          const recorded = await withAbort(observer.rpc('record_step_up_failure'), signal);
          if (recorded.error) throw recorded.error;
        }
        return {
          status: 'signal recorded',
          detail: `${rounds} wrong TOTP code${rounds === 1 ? '' : 's'} rejected on the temporary test factor.`,
        };
      },
    },
    {
      id: 4,
      name: STEP_NAMES[4],
      requests: minimal ? 1 : 2,
      run: async () => {
        const amount = 1_200_000; // PHP 12,000.00 in centavos
        const key = `bantay-drill-${randomUUID()}`;
        const from = await deps.service
          .from('accounts')
          .select('id')
          .eq('user_id', deps.targetUserId)
          .eq('status', 'active')
          .limit(1);
        if (from.error || !from.data?.[0]) {
          return { status: 'error', detail: 'Target account could not be resolved.' };
        }
        if (!deps.otherUserId) deps.otherUserId = await findUserId(deps.service, other);
        const to = await deps.service
          .from('accounts')
          .select('id')
          .eq('user_id', deps.otherUserId)
          .eq('status', 'active')
          .limit(1);
        if (to.error || !to.data?.[0]) {
          return { status: 'error', detail: 'Payee account could not be resolved.' };
        }
        const args = {
          p_from_account: from.data[0].id,
          p_to_account: to.data[0].id,
          p_amount: amount,
          p_idempotency_key: key,
          p_reference: 'Bantay drill',
        };
        const prepared = await withAbort(observer.rpc('prepare_risk_challenge', {
          p_to_account: args.p_to_account,
          p_amount: args.p_amount,
          p_idempotency_key: key,
        }), signal);
        if (prepared.error) throw prepared.error;
        if (prepared.data?.challenge_required !== true) {
          return {
            status: 'error',
            detail: 'Risk challenge was not raised; transfer was not attempted.',
          };
        }
        const transfer = await withAbort(observer.rpc('transfer', args), signal);
        if (!transfer.error) {
          return {
            status: 'error',
            detail: 'Transfer was accepted unexpectedly; drill stopped.',
          };
        }
        return {
          status: 'blocked',
          detail: 'Large transfer to a new payee was refused. No money moved.',
        };
      },
    },
    {
      id: 5,
      name: STEP_NAMES[5],
      requests: minimal ? 1 : 5,
      run: async () => {
        if (!deps.otherUserId) deps.otherUserId = await findUserId(deps.service, other);
        const empty = (result) => !result.error && (result.data || []).length === 0;
        const deniedProbes = [
          empty(
            await withAbort(
              observer.from('security_events').select('id').eq('user_id', deps.otherUserId).limit(1),
              signal
            )
          ),
        ];
        if (!minimal) {
          deniedProbes.push(
            empty(
              await withAbort(
                observer.from('notifications').select('id').eq('user_id', deps.otherUserId).limit(1),
                signal
              )
            )
          );
          deniedProbes.push(
            expectedDenied(
              await withAbort(
                observer.rpc('_bantay_maybe_protective_lock', { p_user_id: deps.targetUserId }),
                signal
              )
            )
          );
          deniedProbes.push(
            expectedDenied(
              await withAbort(
                observer.rpc('_bantay_event', {
                  p_user_id: deps.targetUserId,
                  p_kind: 'code_failures',
                  p_severity: 'high',
                }),
                signal
              )
            )
          );
          deniedProbes.push(
            expectedDenied(
              await withAbort(
                observer.rpc('admin_unlock_user', {
                  p_user_id: deps.targetUserId,
                  p_note: 'Bantay drill RLS probe',
                }),
                signal
              )
            )
          );
        }
        const denied = deniedProbes.filter(Boolean).length;
        const total = deniedProbes.length;
        return denied === total
          ? { status: 'blocked', detail: `${denied}/${total} RLS probes denied as expected.` }
          : { status: 'error', detail: `${denied}/${total} probes denied; review access rules.` };
      },
    },
  ];
}

async function runDrill() {
  const signal = controller.signal;
  try {
    if (!SUPABASE_URL || !ANON_KEY || !PASSWORD || !SERVICE_KEY) {
      throw new Error(
        'NOT VERIFIED — live URL, keys and SEED_PASSWORD/E2E_PASSWORD are required.'
      );
    }
    deps = {
      anon: makeClient(ANON_KEY),
      observer: makeClient(ANON_KEY),
      service: SERVICE_KEY ? makeClient(SERVICE_KEY) : null,
      fixture: null,
      targetUserId: null,
      otherUserId: null,
    };
    await requireDeployment(signal);
    if (stopped()) return;
    if (state.intensity === 'minimal') {
      const auth = await withAbort(
        deps.observer.auth.signInWithPassword({ email: state.target, password: PASSWORD }),
        signal
      );
      if (auth.error) throw auth.error;
      deps.targetUserId = auth.data?.user?.id || null;
    }
    const outcome = await runDrillSteps(buildSteps(state.intensity, signal), {
      signal,
      isStopped: () => stopped(),
      isPaused: () => state.status === 'paused',
      waitForResume,
      maxTotalRequests: MAX_TOTAL_REQUESTS,
      maxRequestsPerStep: MAX_REQUESTS_PER_STEP,
      now: manilaTime,
      onStepStart: (step) => {
        state.activeStep = step.id;
        broadcast();
      },
      onResult: (result) => {
        appendTimeline(result, state.lastEvents.join(', ') || null);
        state.requests += result.requests;
        console.log(
          `[${result.id}/5] ${result.name} — ${result.status} · ${result.detail}`
        );
        broadcast();
        if (!stopped()) void observe();
      },
    });
    state.requests = outcome.requests;
    if (state.status !== 'frozen' && !stopped()) {
      state.status = 'idle';
      state.message =
        outcome.status === 'completed'
          ? 'Drill finished. Observation continues while the page is open.'
          : `Drill ended (${outcome.status}).`;
    }
  } catch (error) {
    if (!stopped()) {
      state.status = 'not verified';
      state.message = safeError(error);
      console.log(state.message);
    }
  } finally {
    broadcast();
  }
}

async function cleanup() {
  const notes = [];
  try {
    if (deps?.fixture) {
      try {
        await deps.fixture.cleanup();
      } catch {
        notes.push('Temporary factor cleanup needs review.');
      }
      deps.fixture = null;
    }
    if (!SERVICE_KEY) {
      notes.push('NOT VERIFIED — service role key absent; unlock was not performed.');
    } else {
      const service = makeClient(SERVICE_KEY);
      const id = deps?.targetUserId || (await findUserId(service, state.target));
      if (!id) {
        notes.push('NOT VERIFIED — target account was not resolved; unlock was not performed.');
      } else {
        const unlock = await service
          .from('security_limits')
          .update({
            locked_at: null,
            unlock_after: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', id);
        if (unlock.error) notes.push('Unlock needs review.');
        const cases = await service
          .from('security_cases')
          .update({
            status: 'resolved',
            staff_note: 'Bantay drill cleanup',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', id)
          .eq('opened_by', 'system')
          .in('status', ['open', 'investigating']);
        if (cases.error) notes.push('Case closure needs review.');
      }
    }
    if (deps?.observer) await deps.observer.auth.signOut({ scope: 'local' });
    if (deps?.anon) await deps.anon.auth.signOut({ scope: 'local' });
  } catch {
    notes.push('Cleanup needs review.');
  }
  deps = null;
  seenEventIds = new Set();
  state.timeline = [];
  state.observation = {};
  state.lastEvents = [];
  state.requests = 0;
  state.activeStep = null;
  state.status = notes.length ? 'not verified' : 'idle';
  state.message = notes.length
    ? notes.join(' ')
    : 'Reset complete. The selected test account is unlocked and ready.';
  console.log(state.message);
  broadcast();
}

async function handleCommand(body) {
  const parsed = parseCommand(body?.command);
  if (!parsed.ok) return { httpStatus: 400, payload: { ok: false, reason: parsed.reason } };

  if (parsed.value === 'start') {
    const guard = guardDrillTarget(body.target, TEST_CUSTOMER_A, TEST_CUSTOMER_B);
    if (!guard.ok) {
      state.status = 'not verified';
      state.message = guard.reason;
      console.log(guard.reason);
      broadcast();
      return { httpStatus: 403, payload: { ok: false, reason: guard.reason } };
    }
    const steps = parseSteps(body.steps);
    const intensity = parseIntensity(body.intensity);
    if (!steps.ok || !intensity.ok) {
      return {
        httpStatus: 400,
        payload: { ok: false, reason: !steps.ok ? steps.reason : intensity.reason },
      };
    }
    const next = transition(state.status, 'start');
    if (!next.ok) return { httpStatus: 409, payload: { ok: false, reason: next.reason } };

    controller = new AbortController();
    resumeWaiters = [];
    deps = null;
    seenEventIds = new Set();
    state.target = guard.target;
    state.steps = steps.value;
    state.intensity = intensity.value;
    state.observe = body.observe !== false;
    state.requests = 0;
    state.timeline = [];
    state.observation = {};
    state.lastEvents = [];
    state.activeStep = state.steps[0];
    state.status = next.value;
    state.message = 'Drill started. Only test accounts are in scope.';
    broadcast();
    startObservation();
    void runDrill();
    return { httpStatus: 200, payload: { ok: true } };
  }

  if (parsed.value === 'pause') {
    const next = transition(state.status, 'pause');
    if (!next.ok) return { httpStatus: 409, payload: { ok: false, reason: next.reason } };
    state.status = next.value;
    state.message = 'Paused. No new step starts until Resume.';
    broadcast();
    return { httpStatus: 200, payload: { ok: true } };
  }

  if (parsed.value === 'resume') {
    const next = transition(state.status, 'resume');
    if (!next.ok) return { httpStatus: 409, payload: { ok: false, reason: next.reason } };
    state.status = next.value;
    state.message = 'Resumed.';
    resolveResume();
    broadcast();
    return { httpStatus: 200, payload: { ok: true } };
  }

  if (parsed.value === 'stop') {
    if (state.status !== 'stopped') {
      const next = transition(state.status, 'stop');
      if (!next.ok) return { httpStatus: 409, payload: { ok: false, reason: next.reason } };
      state.status = next.value;
    }
    controller.abort();
    resolveResume();
    stopObservation();
    state.activeStep = null;
    state.message = 'Stopped. No further step or observation call will run.';
    console.log(state.message);
    broadcast();
    return { httpStatus: 200, payload: { ok: true } };
  }

  const next = transition(state.status, 'reset');
  if (!next.ok) return { httpStatus: 409, payload: { ok: false, reason: next.reason } };
  controller.abort();
  resolveResume();
  stopObservation();
  state.status = next.value;
  state.message = 'Resetting the selected test account…';
  broadcast();
  void cleanup();
  return { httpStatus: 200, payload: { ok: true } };
}

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function sendJson(res, httpStatus, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(httpStatus, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid request body.'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
    });
    res.end(PAGE_HTML);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, 200, { ok: true, snapshot: snapshot() });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/command') {
    try {
      const body = await readBody(req);
      const result = await handleCommand(body);
      sendJson(res, result.httpStatus, result.payload);
    } catch (error) {
      sendJson(res, 400, { ok: false, reason: safeError(error) });
    }
    return;
  }
  sendJson(res, 404, { ok: false, reason: 'Not found.' });
});

server.on('error', (error) => {
  console.log(`Console could not start: ${error.code || 'unknown error'}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`Bantay Drill Console → http://localhost:${PORT}`);
  console.log('Local only — not reachable from the network');
  console.log('No credentials are shown by this console.');
});

process.on('SIGINT', () => {
  controller.abort();
  stopObservation();
  server.close(() => process.exit(0));
});
