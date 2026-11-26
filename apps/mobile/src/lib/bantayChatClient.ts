import { createBantayChatClient } from '@davao-bank/shared';
import { reportNetworkResult } from './networkStatus';
import { supabase } from './supabase';

/**
 * App-side transport for the shared Bantay chat client. The screen imports this
 * single object so RNTL tests can mock the whole client without touching JWTs.
 */
export const bantayChatClient = createBantayChatClient({
  async invoke(name, options) {
    const result = await supabase.functions.invoke(name, { body: options.body });
    reportNetworkResult(result.error);
    return result as { data: unknown; error: unknown | null };
  },
  async rpc(name, params) {
    const result = await supabase.rpc(name, params);
    return result as { data: unknown; error: unknown | null };
  },
});
