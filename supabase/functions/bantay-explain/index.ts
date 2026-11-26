/**
 * Davao Bank — Edge Function: bantay-explain (Phase 8 · Stage 8E).
 *
 * The caller sends { event_id } with their user JWT. The event is read as the
 * caller (RLS), reduced to masked facts, explained by Gemini Flash with a fixed
 * system prompt and a 4-second timeout, and written back to only two columns.
 * Missing key, timeout, quota or any error falls back to the template. The key
 * is read from Deno.env only and is never logged.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  bantayTemplate,
  buildMaskedFacts,
  explainBantayEvent,
  GEMINI_TIMEOUT_MS,
} from '../_shared/bantay.ts';

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const jwt = authorization.slice('Bearer '.length).trim();
  if (!jwt) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Function not configured' }, 500);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // getUser verifies the JWT with Auth; an invalid token cannot read an event.
  const { data: authData, error: authError } = await caller.auth.getUser(jwt);
  if (authError || !authData.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let eventId: unknown;
  try {
    const body: unknown = await req.json();
    eventId = isRecord(body) ? body.event_id : undefined;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (typeof eventId !== 'string' || !UUID_PATTERN.test(eventId)) {
    return json({ error: 'Invalid request' }, 400);
  }

  const { data: event, error: eventError } = await caller
    .from('security_events')
    .select('id,kind,severity,score,facts,created_at,explanation,explanation_source')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError || !event) {
    return json({ error: 'Event not found' }, 404);
  }

  if (typeof event.explanation === 'string' && event.explanation.length > 0) {
    return json({
      explanation: event.explanation,
      explanation_source: event.explanation_source === 'ai' ? 'ai' : 'template',
      persisted: true,
    });
  }

  const facts = buildMaskedFacts(event as Parameters<typeof buildMaskedFacts>[0]);
  const template = bantayTemplate(String(event.kind), facts);
  const result = await explainBantayEvent({
    apiKey: Deno.env.get('GEMINI_API_KEY') ?? undefined,
    facts,
    template,
    fetchImpl: fetch,
    timeoutMs: GEMINI_TIMEOUT_MS,
  });

  // Service role is needed because customers have no UPDATE grant. The extra
  // user_id filter keeps the write scoped even with the elevated client.
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: updateError } = await service
    .from('security_events')
    .update({
      explanation: result.explanation,
      explanation_source: result.explanation_source,
    })
    .eq('id', eventId)
    .eq('user_id', authData.user.id);

  if (updateError) {
    console.error('[bantay-explain] explanation write failed');
  }

  return json({ ...result, persisted: !updateError });
});
