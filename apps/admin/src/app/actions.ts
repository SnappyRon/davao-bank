'use server';

import { revalidatePath } from 'next/cache';
import {
  executeAdminSetUserStatus,
  executeAdminOpenAccount,
  executeAdminSetAccountStatus,
  executeAdminAdjustBalance,
  executeAdminReverseTransaction,
  type ProfileStatus,
  type AccountStatus,
  type AccountType,
  type LedgerDirection,
} from '@davao-bank/shared';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';

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
    const supabase = await createAdminCookieServerClient();
    const { data, error } = await executeAdminSetUserStatus(supabase, {
      userId,
      status,
      reason,
    });

    if (error) {
      return { success: false, error };
    }

    revalidatePath('/users');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
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
    const supabase = await createAdminCookieServerClient();
    const { data, error } = await executeAdminOpenAccount(supabase, {
      userId,
      type,
      currency,
    });

    if (error) {
      return { success: false, error };
    }

    revalidatePath('/accounts');
    revalidatePath('/users');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
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
    const supabase = await createAdminCookieServerClient();
    const { data, error } = await executeAdminSetAccountStatus(supabase, {
      accountId,
      status,
      reason,
    });

    if (error) {
      return { success: false, error };
    }

    revalidatePath('/accounts');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
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
    const supabase = await createAdminCookieServerClient();
    const { data, error } = await executeAdminAdjustBalance(supabase, {
      accountId,
      amount: amountCentavos,
      direction,
      reason,
      idempotencyKey,
    });

    if (error) {
      return { success: false, error };
    }

    revalidatePath('/accounts');
    revalidatePath('/transactions');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
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
    const supabase = await createAdminCookieServerClient();
    const { data, error } = await executeAdminReverseTransaction(supabase, {
      transactionId,
      reason,
      idempotencyKey,
    });

    if (error) {
      return { success: false, error };
    }

    revalidatePath('/transactions');
    revalidatePath('/accounts');
    revalidatePath('/');
    return { success: true, data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
