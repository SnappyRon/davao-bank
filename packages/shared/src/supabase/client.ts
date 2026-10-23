import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';
import type {
  HealthCheck,
  Profile,
  AccountBalance,
  TransactionHistoryItem,
  TransferParams,
  DepositParams,
  WithdrawParams,
  MoneyOperationResult,
  Notification,
  AdminDashboardStats,
  AdminUserItem,
  AdminSetUserStatusParams,
  AdminOpenAccountParams,
  AdminSetAccountStatusParams,
  AdminAdjustBalanceParams,
  AdminReverseTransactionParams,
  AdminOperationResult,
} from '../types';

/**
 * Options for Supabase client factory.
 * Supports custom storage adapters (e.g. AsyncStorage for React Native, cookies for Web).
 */
export interface SupabaseClientFactoryOptions {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  storage?: SupportedStorage;
  persistSession?: boolean;
  autoRefreshToken?: boolean;
  detectSessionInUrl?: boolean;
}

/**
 * Framework-agnostic Supabase Client Factory.
 *
 * Supports both:
 * - Simple overload: createSupabaseClient(customUrl, customAnonKey)
 * - Config object overload: createSupabaseClient({ storage, persistSession, ... })
 *
 * Defaults to persisted sessions and auto-refresh for authentication.
 */
export function createSupabaseClient(
  urlOrOptions?: string | SupabaseClientFactoryOptions,
  customAnonKey?: string
): SupabaseClient {
  let url: string | undefined;
  let anonKey: string | undefined;
  let storage: SupportedStorage | undefined;
  let persistSession = true;
  let autoRefreshToken = true;
  let detectSessionInUrl = true;

  if (typeof urlOrOptions === 'object' && urlOrOptions !== null) {
    url = urlOrOptions.supabaseUrl;
    anonKey = urlOrOptions.supabaseAnonKey;
    storage = urlOrOptions.storage;
    if (urlOrOptions.persistSession !== undefined) {
      persistSession = urlOrOptions.persistSession;
    }
    if (urlOrOptions.autoRefreshToken !== undefined) {
      autoRefreshToken = urlOrOptions.autoRefreshToken;
    }
    if (urlOrOptions.detectSessionInUrl !== undefined) {
      detectSessionInUrl = urlOrOptions.detectSessionInUrl;
    }
  } else if (typeof urlOrOptions === 'string') {
    url = urlOrOptions;
    anonKey = customAnonKey;
  }

  const resolvedUrl =
    url ||
    (typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.SUPABASE_URL
      : undefined) ||
    'http://127.0.0.1:54321';

  const resolvedAnonKey =
    anonKey ||
    (typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_ANON_KEY
      : undefined) ||
    'placeholder-anon-key';

  return createClient(resolvedUrl, resolvedAnonKey, {
    auth: {
      persistSession,
      autoRefreshToken,
      detectSessionInUrl,
      ...(storage ? { storage } : {}),
    },
  });
}

/**
 * Standardized function to query the health_check scaffold table.
 * Used by both mobile and admin apps to prove end-to-end connectivity.
 */
export async function fetchHealthCheck(
  client: SupabaseClient
): Promise<{ data: HealthCheck | null; error: string | null }> {
  try {
    const { data, error } = await client
      .from('health_check')
      .select('id, status, checked_at')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: 'No health_check record found' };
    }

    return { data: data as HealthCheck, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Helper to fetch profile of the currently logged-in user.
 */
export async function fetchUserProfile(
  client: SupabaseClient,
  userId: string
): Promise<{ data: Profile | null; error: string | null }> {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as Profile | null, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Helper to fetch accounts with derived balances for the authenticated caller.
 */
export async function fetchAccountBalances(
  client: SupabaseClient
): Promise<{ data: AccountBalance[] | null; error: string | null }> {
  try {
    const { data, error } = await client.from('account_balances').select('*');

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: (data || []) as AccountBalance[], error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

// ------------------------------------------------------------------------------
// Phase 3: Server-Authoritative Money Operations (RPCs)
// ------------------------------------------------------------------------------

/**
 * Executes an atomic server-side peer-to-peer transfer via RPC.
 * Supports transferring either by destination UUID (to_account) or account number (to_account_number).
 */
export async function executeTransfer(
  client: SupabaseClient,
  params: TransferParams
): Promise<{ data: MoneyOperationResult | null; error: string | null }> {
  try {
    let rpcName = 'transfer';
    let rpcArgs: Record<string, unknown> = {
      p_from_account: params.from_account,
      p_to_account: params.to_account,
      p_amount: params.amount,
      p_idempotency_key: params.idempotency_key,
      p_reference: params.reference || null,
    };

    if (params.to_account_number && !params.to_account) {
      rpcName = 'transfer_by_account_number';
      rpcArgs = {
        p_from_account: params.from_account,
        p_to_account_number: params.to_account_number,
        p_amount: params.amount,
        p_idempotency_key: params.idempotency_key,
        p_reference: params.reference || null,
      };
    }

    const { data, error } = await client.rpc(rpcName, rpcArgs);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as MoneyOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Executes an atomic simulated deposit via RPC.
 */
export async function executeDeposit(
  client: SupabaseClient,
  params: DepositParams
): Promise<{ data: MoneyOperationResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('deposit', {
      p_account: params.account,
      p_amount: params.amount,
      p_idempotency_key: params.idempotency_key,
      p_reference: params.reference || null,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as MoneyOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Executes an atomic simulated cash withdrawal via RPC.
 */
export async function executeWithdraw(
  client: SupabaseClient,
  params: WithdrawParams
): Promise<{ data: MoneyOperationResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('withdraw', {
      p_account: params.account,
      p_amount: params.amount,
      p_idempotency_key: params.idempotency_key,
      p_reference: params.reference || null,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data as MoneyOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Fetches transaction history for the authenticated user via get_account_transactions RPC.
 */
export async function fetchTransactionHistory(
  client: SupabaseClient,
  accountId?: string
): Promise<{ data: TransactionHistoryItem[] | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('get_account_transactions', {
      p_account_id: accountId || null,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: (data || []) as TransactionHistoryItem[], error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Fetches in-app notifications for the logged-in customer.
 */
export async function fetchNotifications(
  client: SupabaseClient
): Promise<{ data: Notification[] | null; error: string | null }> {
  try {
    const { data, error } = await client
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: (data || []) as Notification[], error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Marks a single notification as read.
 */
export async function markNotificationAsRead(
  client: SupabaseClient,
  notificationId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await client
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Marks all notifications for current user as read.
 */
export async function markAllNotificationsAsRead(
  client: SupabaseClient
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await client
      .from('notifications')
      .update({ read: true })
      .eq('read', false);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ------------------------------------------------------------------------------
// Phase 4: Server-Side Admin Management Helpers (RPCs)
// ------------------------------------------------------------------------------

/**
 * Fetches real-time dashboard KPIs calculated directly from the database.
 */
export async function fetchAdminDashboardStats(
  client: SupabaseClient
): Promise<{ data: AdminDashboardStats | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_get_dashboard_stats');
    if (error) return { data: null, error: error.message };
    return { data: data as AdminDashboardStats, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Fetches all users joined with email verification status from auth.users.
 */
export async function fetchAdminUsers(
  client: SupabaseClient
): Promise<{ data: AdminUserItem[] | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_get_users');
    if (error) return { data: null, error: error.message };
    return { data: (data || []) as AdminUserItem[], error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Updates a user's profile status (active/suspended) with mandatory reason.
 */
export async function executeAdminSetUserStatus(
  client: SupabaseClient,
  params: AdminSetUserStatusParams
): Promise<{ data: AdminOperationResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_set_user_status', {
      p_user_id: params.userId,
      p_status: params.status,
      p_reason: params.reason,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as AdminOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Opens a new account for a customer.
 */
export async function executeAdminOpenAccount(
  client: SupabaseClient,
  params: AdminOpenAccountParams
): Promise<{ data: AdminOperationResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_open_account', {
      p_user_id: params.userId,
      p_type: params.type || 'savings',
      p_currency: params.currency || 'PHP',
    });
    if (error) return { data: null, error: error.message };
    return { data: data as AdminOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Freezes, unfreezes, or closes an account with mandatory reason.
 */
export async function executeAdminSetAccountStatus(
  client: SupabaseClient,
  params: AdminSetAccountStatusParams
): Promise<{ data: AdminOperationResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_set_account_status', {
      p_account_id: params.accountId,
      p_status: params.status,
      p_reason: params.reason,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as AdminOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Performs manual balance adjustment (credit/debit) with mandatory reason & idempotency key.
 */
export async function executeAdminAdjustBalance(
  client: SupabaseClient,
  params: AdminAdjustBalanceParams
): Promise<{ data: MoneyOperationResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_adjust_balance', {
      p_account_id: params.accountId,
      p_amount: params.amount,
      p_direction: params.direction,
      p_reason: params.reason,
      p_idempotency_key: params.idempotencyKey,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as MoneyOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}

/**
 * Reverses a completed transaction with mandatory reason & idempotency key.
 */
export async function executeAdminReverseTransaction(
  client: SupabaseClient,
  params: AdminReverseTransactionParams
): Promise<{ data: MoneyOperationResult | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc('admin_reverse_transaction', {
      p_transaction_id: params.transactionId,
      p_reason: params.reason,
      p_idempotency_key: params.idempotencyKey,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as MoneyOperationResult, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: null, error: message };
  }
}
