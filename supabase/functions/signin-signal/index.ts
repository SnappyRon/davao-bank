/**
 * Davao Bank — Edge Function: signin-signal (Phase 8 · Stage 8E).
 *
 * Hosted evidence showed no failed-password rows in auth.audit_log_entries, so
 * the app calls this function after a failed sign-in. It accepts only an email,
 * keyed-hashes the email and caller IP, records the hashed attempt, and raises
 * one signin_failures event after 5 failures in 15 minutes. The response is the
 * same for known users, unknown users and rate-limited callers, so it cannot be
 * used to enumerate accounts. Nothing here logs the email, IP or service key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  deriveSigninHashes,
  shouldEmitSigninEvent,
  SIGNIN_SIGNAL_RESPONSE,
} from '../_shared/signin.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

/** Admin listUsers has no email filter; scan bounded pages without logging users. */
async function findUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) return null;

    const match = data.users.find(
      (user) => typeof user.email === 'string' && user.email.toLowerCase() === email
    );
    if (match) return match.id;
    if (!data.users.length || page >= data.lastPage) return null;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Function not configured' }, 500);
  }

  let email: unknown;
  try {
    const body: unknown = await req.json();
    email = isRecord(body) ? body.email : undefined;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (typeof email !== 'string' || !email.trim() || email.length > 254) {
    return json({ error: 'Invalid request' }, 400);
  }

  const hashes = await deriveSigninHashes(email, clientIp(req), serviceKey);
  if (!hashes) {
    return json({ error: 'Invalid request' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = await findUserIdByEmail(supabase, email.trim().toLowerCase());
  const { data, error } = await supabase.rpc('record_signin_failure_signal', {
    p_email_hash: hashes.emailHash,
    p_ip_hash: hashes.ipHash,
    p_user_id: userId,
  });

  if (!error && userId) {
    const row = Array.isArray(data) ? data[0] : data;
    const emailAttempts = Number(isRecord(row) ? row.email_attempts : 0);
    const ipAttempts = Number(isRecord(row) ? row.ip_attempts : 0);
    if (shouldEmitSigninEvent(emailAttempts, ipAttempts)) {
      // Errors are ignored: the caller must never learn whether a user exists.
      await supabase.rpc('write_signin_failure_event', {
        p_user_id: userId,
        p_email_hash: hashes.emailHash,
        p_attempt_count: Math.max(emailAttempts, ipAttempts),
      });
    }
  }

  return json(SIGNIN_SIGNAL_RESPONSE);
});
