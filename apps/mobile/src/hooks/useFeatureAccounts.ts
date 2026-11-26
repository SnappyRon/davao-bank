import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAccountBalances,
  toUserMessage,
  type AccountBalance,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';
import { reportNetworkResult } from '../lib/networkStatus';

export function useFeatureAccounts(enabled = true) {
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const mounted = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const loadAccounts = useCallback(async () => {
    // A protective freeze short-circuits the whole flow: no account read and
    // no money RPCs are attempted while Bantay holds the account.
    if (!enabledRef.current) {
      if (mounted.current) setAccountsLoading(false);
      return;
    }
    setAccountsLoading(true);
    setAccountError(null);
    try {
      const { data, error } = await fetchAccountBalances(supabase);
      reportNetworkResult(error);
      if (!mounted.current) return;
      if (error) throw error;
      setAccounts(data ?? []);
    } catch (error) {
      reportNetworkResult(error);
      if (mounted.current) setAccountError(toUserMessage(error));
    } finally {
      if (mounted.current) setAccountsLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (enabled) void loadAccounts();
    else setAccountsLoading(false);
    return () => {
      mounted.current = false;
    };
  }, [enabled, loadAccounts]);
  return { accounts, accountsLoading, accountError, loadAccounts };
}
