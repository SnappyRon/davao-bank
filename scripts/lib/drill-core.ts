/**
 * Davao Bank — Phase 8K Bantay drill core.
 *
 * Pure, dependency-free rules shared by the local console and its unit tests.
 * No secrets, no clients and no network calls live in this module.
 */

export const ALLOWED_TARGETS = [
  'test-customer-a@davaobank.ph',
  'test-customer-b@davaobank.ph',
] as const;

export type DrillTarget = (typeof ALLOWED_TARGETS)[number];

export const TARGET_GUARD_MESSAGE =
  'NOT VERIFIED — drill target must be test-customer-a@davaobank.ph or test-customer-b@davaobank.ph';

export type GuardResult =
  { ok: true; target: DrillTarget } | { ok: false; reason: string };

/** The allow-list is literal: an env override of either address refuses the run. */
export function guardDrillTarget(
  requested: unknown,
  resolvedA: unknown,
  resolvedB: unknown
): GuardResult {
  if (resolvedA !== ALLOWED_TARGETS[0] || resolvedB !== ALLOWED_TARGETS[1]) {
    return { ok: false, reason: TARGET_GUARD_MESSAGE };
  }
  if (
    typeof requested !== 'string' ||
    !ALLOWED_TARGETS.includes(requested as DrillTarget)
  ) {
    return { ok: false, reason: TARGET_GUARD_MESSAGE };
  }
  return { ok: true, target: requested as DrillTarget };
}

export const STEP_IDS = [1, 2, 3, 4, 5] as const;

export const STEP_NAMES: Record<number, string> = {
  1: 'Failed password sign-ins',
  2: 'New-device sign-in',
  3: 'Wrong TOTP codes',
  4: 'Large transfer to a new payee',
  5: 'RLS probes',
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function parseSteps(input: unknown): ParseResult<number[]> {
  if (input === undefined || input === null || input === '') {
    return { ok: true, value: [...STEP_IDS] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, reason: 'Steps must be a list of 1..5.' };
  }
  const steps = new Set<number>();
  for (const entry of input) {
    const value = typeof entry === 'string' ? Number(entry) : entry;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      !STEP_IDS.includes(value as (typeof STEP_IDS)[number])
    ) {
      return { ok: false, reason: 'Steps must be a subset of 1..5.' };
    }
    steps.add(value);
  }
  return { ok: true, value: [...steps].sort((a, b) => a - b) };
}

export type Intensity = 'standard' | 'minimal';

export function parseIntensity(input: unknown): ParseResult<Intensity> {
  if (input === undefined || input === null || input === '') {
    return { ok: true, value: 'standard' };
  }
  if (input === 'standard' || input === 'minimal') {
    return { ok: true, value: input };
  }
  return { ok: false, reason: 'Intensity must be Standard or Minimal.' };
}

export type DrillCommand = 'start' | 'pause' | 'resume' | 'stop' | 'reset';

export function parseCommand(input: unknown): ParseResult<DrillCommand> {
  const allowed: DrillCommand[] = ['start', 'pause', 'resume', 'stop', 'reset'];
  if (typeof input === 'string' && allowed.includes(input as DrillCommand)) {
    return { ok: true, value: input as DrillCommand };
  }
  return { ok: false, reason: 'Unknown console command.' };
}

export type DrillStatus =
  'idle' | 'running' | 'paused' | 'stopped' | 'frozen' | 'resetting' | 'not verified';

export function statusLabel(status: DrillStatus, activeStep?: number | null): string {
  if (status === 'running') return `Attacking step ${activeStep ?? 1} of 5`;
  return status;
}

export function canStart(status: DrillStatus): boolean {
  return status === 'idle' || status === 'stopped' || status === 'not verified';
}

/** Server-side state machine; the page only sends commands. */
export function transition(
  status: DrillStatus,
  command: DrillCommand
): ParseResult<DrillStatus> {
  if (command === 'start' && canStart(status)) return { ok: true, value: 'running' };
  if (command === 'pause' && status === 'running') return { ok: true, value: 'paused' };
  if (command === 'resume' && status === 'paused') return { ok: true, value: 'running' };
  if (command === 'stop' && ['running', 'paused', 'frozen'].includes(status)) {
    return { ok: true, value: 'stopped' };
  }
  if (command === 'reset' && status !== 'resetting') {
    return { ok: true, value: 'resetting' };
  }
  return { ok: false, reason: `Command ${command} is not valid while ${status}.` };
}

export type StepResultStatus =
  'attempted' | 'blocked' | 'signal recorded' | 'error' | 'skipped';

export type StepResult = {
  id: number;
  name: string;
  status: StepResultStatus;
  detail: string;
  requests: number;
  at: string;
};

export type StepOutcome = {
  status: StepResultStatus;
  detail: string;
};

export type StepContext = {
  signal: AbortSignal;
};

export type DrillStep = {
  id: number;
  name: string;
  requests: number;
  run: (context: StepContext) => Promise<StepOutcome>;
};

export type RunnerControl = {
  signal: AbortSignal;
  isStopped: () => boolean;
  isPaused?: () => boolean;
  waitForResume?: () => Promise<void>;
  maxTotalRequests: number;
  maxRequestsPerStep: number;
  onStepStart?: (step: DrillStep) => void;
  onResult?: (result: StepResult, requestsUsed: number) => void;
  now?: () => string;
};

export type RunSummary = {
  status: 'completed' | 'stopped' | 'aborted' | 'cap-exceeded' | 'error';
  results: StepResult[];
  requests: number;
};

/** Never exposes raw backend text to the page. */
export function safeError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
  const lower = raw.toLowerCase();
  if (lower.includes('abort')) return 'Stopped by owner.';
  if (lower.includes('not verified')) return 'NOT VERIFIED — precondition not met.';
  if (lower.includes('locked')) return 'Blocked by Bantay account lock.';
  if (lower.includes('confirmation required')) {
    return 'Risk challenge raised. No money moved.';
  }
  if (
    lower.includes('permission denied') ||
    lower.includes('insufficient privilege') ||
    lower.includes('jwt') ||
    lower.includes('admin privilege')
  ) {
    return 'Permission denied.';
  }
  if (lower.includes('fetch') || lower.includes('network')) {
    return 'Network unavailable. Nothing was sent.';
  }
  return 'Request failed. Details withheld.';
}

export function manilaTime(date = new Date()): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Sequential step runner: no concurrency, no retries, fixed caps. Pause is
 * honoured before the next step; Stop/abort prevents any further step or
 * observation call.
 */
export async function runDrillSteps(
  steps: DrillStep[],
  control: RunnerControl
): Promise<RunSummary> {
  const results: StepResult[] = [];
  let requests = 0;
  const ordered = [...steps].sort((a, b) => a.id - b.id);
  const stopped = () => control.signal.aborted || control.isStopped();

  for (const step of ordered) {
    if (stopped()) return { status: 'stopped', results, requests };
    if (control.isPaused?.() && control.waitForResume) {
      await control.waitForResume();
      if (stopped()) return { status: 'stopped', results, requests };
    }
    if (step.requests > control.maxRequestsPerStep) {
      results.push({
        id: step.id,
        name: step.name,
        status: 'error',
        detail: 'Request cap exceeded for this step.',
        requests: 0,
        at: (control.now ?? manilaTime)(),
      });
      return { status: 'cap-exceeded', results, requests };
    }
    if (requests + step.requests > control.maxTotalRequests) {
      results.push({
        id: step.id,
        name: step.name,
        status: 'error',
        detail: 'Total request cap exceeded.',
        requests: 0,
        at: (control.now ?? manilaTime)(),
      });
      return { status: 'cap-exceeded', results, requests };
    }

    control.onStepStart?.(step);
    let outcome: StepOutcome;
    try {
      outcome = await step.run({ signal: control.signal });
    } catch (error) {
      outcome = { status: 'error', detail: safeError(error) };
      requests += step.requests;
      results.push({
        id: step.id,
        name: step.name,
        status: outcome.status,
        detail: outcome.detail,
        requests: step.requests,
        at: (control.now ?? manilaTime)(),
      });
      control.onResult?.(results[results.length - 1], requests);
      if (stopped()) return { status: 'stopped', results, requests };
      return { status: 'error', results, requests };
    }

    requests += step.requests;
    const result: StepResult = {
      id: step.id,
      name: step.name,
      status: outcome.status,
      detail: outcome.detail,
      requests: step.requests,
      at: (control.now ?? manilaTime)(),
    };
    results.push(result);
    control.onResult?.(result, requests);
    if (stopped()) return { status: 'stopped', results, requests };
  }
  return { status: 'completed', results, requests };
}
