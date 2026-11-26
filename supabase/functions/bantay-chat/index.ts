/**
 * Davao Bank — Edge Function: bantay-chat (Phase 8 · Stage 8N).
 *
 * Read-only assistant for the caller's own masked security context and curated
 * help articles. No tools, no function calling, no money or settings RPCs.
 * The quota and global provider cap are checked and reserved by atomic RPCs
 * before each provider attempt. Errors return user-safe copy only.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  handleBantayChat,
  type BantayChatResult,
  type ChatCallerClient,
  type ChatServiceClient,
} from '../_shared/bantay.ts';

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const result: BantayChatResult = await handleBantayChat({
    body,
    jwt,
    caller: caller as unknown as ChatCallerClient,
    service: service as unknown as ChatServiceClient,
    apiKey: Deno.env.get('GEMINI_API_KEY') ?? undefined,
    fetchImpl: fetch,
  });

  return json(result.body, result.status);
});
