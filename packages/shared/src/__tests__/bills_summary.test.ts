import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteSavedBiller,
  fetchBillReminders,
  fetchMonthlySummary,
  fetchSavedBillers,
  registerPushToken,
  saveBiller,
} from '../supabase/client';

describe('Phase 8 Stage B shared client wrappers', () => {
  describe('fetchSavedBillers', () => {
    it('queries saved_billers ordered by created_at desc', async () => {
      const order = jest.fn(async () => ({
        data: [{ id: 'sb-1', nickname: 'Home Power' }],
        error: null,
      }));
      const select = jest.fn(() => ({ order }));
      const from = jest.fn(() => ({ select }));
      const client = { from } as unknown as SupabaseClient;

      const res = await fetchSavedBillers(client);
      expect(from).toHaveBeenCalledWith('saved_billers');
      expect(select).toHaveBeenCalledWith('*');
      expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(res).toEqual({
        data: [{ id: 'sb-1', nickname: 'Home Power' }],
        error: null,
      });
    });

    it('returns error when query fails', async () => {
      const order = jest.fn(async () => ({ data: null, error: { message: 'db fail' } }));
      const select = jest.fn(() => ({ order }));
      const from = jest.fn(() => ({ select }));
      const client = { from } as unknown as SupabaseClient;

      const res = await fetchSavedBillers(client);
      expect(res).toEqual({ data: null, error: 'db fail' });
    });
  });

  describe('saveBiller', () => {
    it('inserts a trimmed saved biller for the signed-in user', async () => {
      const single = jest.fn(async () => ({
        data: { id: 'sb-1', user_id: 'usr-1', nickname: 'Home Power' },
        error: null,
      }));
      const select = jest.fn(() => ({ single }));
      const insert = jest.fn(() => ({ select }));
      const from = jest.fn(() => ({ insert }));
      const getUser = jest.fn(async () => ({
        data: { user: { id: 'usr-1' } },
        error: null,
      }));
      const client = { auth: { getUser }, from } as unknown as SupabaseClient;

      const res = await saveBiller(client, {
        biller_id: 'b-1',
        reference: ' 1234567890 ',
        nickname: ' Home Power ',
        due_day: 15,
        remind: true,
      });

      expect(insert).toHaveBeenCalledWith({
        user_id: 'usr-1',
        biller_id: 'b-1',
        reference: '1234567890',
        nickname: 'Home Power',
        due_day: 15,
        remind: true,
      });
      expect(res.error).toBeNull();
      expect(res.data?.id).toBe('sb-1');
    });

    it('updates an existing saved biller when id is provided', async () => {
      const single = jest.fn(async () => ({
        data: { id: 'sb-1', nickname: 'Updated Power' },
        error: null,
      }));
      const select = jest.fn(() => ({ single }));
      const eq = jest.fn(() => ({ select }));
      const update = jest.fn(() => ({ eq }));
      const from = jest.fn(() => ({ update }));
      const getUser = jest.fn();
      const client = { auth: { getUser }, from } as unknown as SupabaseClient;

      const res = await saveBiller(client, {
        id: 'sb-1',
        biller_id: 'b-1',
        reference: '1234567890',
        nickname: 'Updated Power',
        due_day: null,
        remind: false,
      });

      expect(getUser).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({
        biller_id: 'b-1',
        reference: '1234567890',
        nickname: 'Updated Power',
        due_day: null,
        remind: false,
      });
      expect(eq).toHaveBeenCalledWith('id', 'sb-1');
      expect(res.error).toBeNull();
    });

    it('validates nickname length and due_day range before querying', async () => {
      const from = jest.fn();
      const client = { from } as unknown as SupabaseClient;

      const badNick = await saveBiller(client, {
        biller_id: 'b-1',
        reference: '12345',
        nickname: ' ',
      });
      expect(badNick).toEqual({
        data: null,
        error: 'Nickname must be between 1 and 40 characters',
      });

      const badDueDay = await saveBiller(client, {
        biller_id: 'b-1',
        reference: '12345',
        nickname: 'Water',
        due_day: 29,
      });
      expect(badDueDay).toEqual({
        data: null,
        error: 'Due day must be between 1 and 28',
      });
      expect(from).not.toHaveBeenCalled();
    });

    it('requires authentication on insert', async () => {
      const from = jest.fn();
      const getUser = jest.fn(async () => ({ data: { user: null }, error: null }));
      const client = { auth: { getUser }, from } as unknown as SupabaseClient;

      const res = await saveBiller(client, {
        biller_id: 'b-1',
        reference: '12345',
        nickname: 'Water',
      });
      expect(res).toEqual({ data: null, error: 'Authentication required' });
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe('deleteSavedBiller', () => {
    it('deletes by id', async () => {
      const eq = jest.fn(async () => ({ error: null }));
      const del = jest.fn(() => ({ eq }));
      const from = jest.fn(() => ({ delete: del }));
      const client = { from } as unknown as SupabaseClient;

      const res = await deleteSavedBiller(client, 'sb-1');
      expect(from).toHaveBeenCalledWith('saved_billers');
      expect(eq).toHaveBeenCalledWith('id', 'sb-1');
      expect(res).toEqual({ success: true, error: null });
    });

    it('rejects empty id', async () => {
      const from = jest.fn();
      const client = { from } as unknown as SupabaseClient;
      const res = await deleteSavedBiller(client, '');
      expect(res).toEqual({ success: false, error: 'Saved biller ID is required' });
      expect(from).not.toHaveBeenCalled();
    });
  });

  describe('fetchBillReminders', () => {
    it('calls get_bill_reminders RPC', async () => {
      const rpc = jest.fn(async () => ({
        data: [{ id: 'sb-1', biller_name: 'Mindanao Power', days_until_due: 2 }],
        error: null,
      }));
      const client = { rpc } as unknown as SupabaseClient;

      const res = await fetchBillReminders(client);
      expect(rpc).toHaveBeenCalledWith('get_bill_reminders');
      expect(res).toEqual({
        data: [{ id: 'sb-1', biller_name: 'Mindanao Power', days_until_due: 2 }],
        error: null,
      });
    });
  });

  describe('fetchMonthlySummary', () => {
    it('passes null when month is omitted and normalizes numeric fields', async () => {
      const rpc = jest.fn(async () => ({
        data: [
          { category: 'money_in', total_centavos: '100000', count: '2' },
          { category: 'bills', total_centavos: 5000, count: 1 },
        ],
        error: null,
      }));
      const client = { rpc } as unknown as SupabaseClient;

      const res = await fetchMonthlySummary(client);
      expect(rpc).toHaveBeenCalledWith('get_monthly_summary', { p_month: null });
      expect(res).toEqual({
        data: [
          { category: 'money_in', total_centavos: 100000, count: 2 },
          { category: 'bills', total_centavos: 5000, count: 1 },
        ],
        error: null,
      });
    });

    it('normalizes YYYY-MM strings and Date instances', async () => {
      const rpc = jest.fn(async () => ({ data: [], error: null }));
      const client = { rpc } as unknown as SupabaseClient;

      await fetchMonthlySummary(client, '2026-11');
      expect(rpc).toHaveBeenLastCalledWith('get_monthly_summary', {
        p_month: '2026-11-01',
      });

      await fetchMonthlySummary(client, new Date(2026, 9, 15));
      expect(rpc).toHaveBeenLastCalledWith('get_monthly_summary', {
        p_month: '2026-10-15',
      });
    });
  });

  describe('registerPushToken', () => {
    it('upserts push token for authenticated user', async () => {
      const upsert = jest.fn(async () => ({ error: null }));
      const from = jest.fn(() => ({ upsert }));
      const getUser = jest.fn(async () => ({
        data: { user: { id: 'usr-1' } },
        error: null,
      }));
      const client = { auth: { getUser }, from } as unknown as SupabaseClient;

      const res = await registerPushToken(client, ' ExponentPushToken[abc] ', 'ios');
      expect(from).toHaveBeenCalledWith('push_tokens');
      expect(upsert).toHaveBeenCalledWith(
        {
          user_id: 'usr-1',
          token: 'ExponentPushToken[abc]',
          platform: 'ios',
        },
        { onConflict: 'user_id,token' }
      );
      expect(res).toEqual({ success: true, error: null });
    });

    it('rejects empty token and unauthenticated callers', async () => {
      const from = jest.fn();
      const getUser = jest.fn(async () => ({ data: { user: null }, error: null }));
      const client = { auth: { getUser }, from } as unknown as SupabaseClient;

      expect(await registerPushToken(client, '   ', 'android')).toEqual({
        success: false,
        error: 'Push token is required',
      });
      expect(await registerPushToken(client, 'tok-1', 'android')).toEqual({
        success: false,
        error: 'Authentication required',
      });
      expect(from).not.toHaveBeenCalled();
    });
  });
});
