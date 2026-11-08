'use server';

import { revalidatePath } from 'next/cache';
import {
  executeAdminSetUserStatus,
  executeAdminOpenAccount,
  executeAdminSetAccountStatus,
  executeAdminAdjustBalance,
  executeAdminReverseTransaction,
  toUserMessage,
  type ProfileStatus,
  type AccountStatus,
  type AccountType,
  type LedgerDirection,
} from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';

async function requireAdminAal2() {
  const client = await createAdminCookieServerClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error('Authentication required');
  const { data: profile } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Admin privilege required');
  const { data: assurance, error: aalError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || assurance?.currentLevel !== 'aal2') throw new Error('STEP_UP_REQUIRED');
  return client;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Server Action: Suspend or activate a user profile.
 * Runs under the admin's cookie session so auth.uid() is the admin actor.
 */
export async function setUserStatusAction(
  userId: string,
  status: ProfileStatus,
  reason: string
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await executeAdminSetUserStatus(supabase, {
      userId,
      status,
      reason,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/users');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Open a new account for a customer.
 */
export async function openAccountAction(
  userId: string,
  type: AccountType = 'savings',
  currency: string = 'PHP'
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await executeAdminOpenAccount(supabase, {
      userId,
      type,
      currency,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/accounts');
    revalidatePath('/users');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Freeze, unfreeze, or close an account.
 */
export async function setAccountStatusAction(
  accountId: string,
  status: AccountStatus,
  reason: string
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await executeAdminSetAccountStatus(supabase, {
      accountId,
      status,
      reason,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/accounts');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Manual balance adjustment (credit/debit).
 */
export async function adjustBalanceAction(
  accountId: string,
  amountCentavos: number,
  direction: LedgerDirection,
  reason: string,
  idempotencyKey: string
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await executeAdminAdjustBalance(supabase, {
      accountId,
      amount: amountCentavos,
      direction,
      reason,
      idempotencyKey,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/accounts');
    revalidatePath('/transactions');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Reverse a completed transaction.
 */
export async function reverseTransactionAction(
  transactionId: string,
  reason: string,
  idempotencyKey: string
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await executeAdminReverseTransaction(supabase, {
      transactionId,
      reason,
      idempotencyKey,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/transactions');
    revalidatePath('/accounts');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Trigger due scheduled payments immediately.
 */
export async function adminRunDueSchedulesAction(): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await supabase.rpc('admin_run_due_schedules_now');

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/schedules');
    revalidatePath('/transactions');
    revalidatePath('/accounts');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Cancel a scheduled payment with mandatory reason.
 */
export async function adminCancelScheduleAction(
  scheduleId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await supabase.rpc('cancel_scheduled_payment', {
      p_id: scheduleId,
      p_reason: reason,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/schedules');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Create a new biller settlement account and biller definition.
 */
export async function adminCreateBillerAction(
  name: string,
  category: string,
  referenceLabel: string,
  referencePattern: string
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await supabase.rpc('admin_create_biller', {
      p_name: name,
      p_category: category,
      p_reference_label: referenceLabel,
      p_reference_pattern: referencePattern,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/billers');
    revalidatePath('/accounts');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

/**
 * Server Action: Activate or deactivate a biller.
 */
export async function adminSetBillerActiveAction(
  billerId: string,
  isActive: boolean
): Promise<ActionResult> {
  try {
    const supabase = await requireAdminAal2();
    const { data, error } = await supabase.rpc('admin_set_biller_active', {
      p_biller_id: billerId,
      p_is_active: isActive,
    });

    if (error) {
      return { success: false, error: toUserMessage(error) };
    }

    revalidatePath('/billers');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: toUserMessage(err) };
  }
}

export async function resetUserMfaAction(
  userId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const client = await requireAdminAal2();
    if (reason.trim().length < 10)
      return { success: false, error: 'Enter a reason of at least 10 characters.' };
    const { error } = await client.rpc('admin_reset_user_mfa', {
      target_user: userId,
      reason: reason.trim(),
    });
    if (error) return { success: false, error: toUserMessage(error) };
    revalidatePath('/users');
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error) };
  }
}
