import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAccountBalances,
  toUserMessage,
  type AccountBalance,
} from '@davao-bank/shared';
import { supabase } from '../lib/supabase';

export function useFeatureAccounts() {
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const mounted = useRef(false);
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountError(null);
    try {
      const { data, error } = await fetchAccountBalances(supabase);
      if (!mounted.current) return;
      if (error) throw error;
      setAccounts(data ?? []);
    } catch (error) {
      if (mounted.current) setAccountError(toUserMessage(error));
    } finally {
      if (mounted.current) setAccountsLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void loadAccounts();
    return () => {
      mounted.current = false;
    };
  }, [loadAccounts]);
  return { accounts, accountsLoading, accountError, loadAccounts };
}
