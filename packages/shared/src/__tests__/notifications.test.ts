import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchNotifications } from '../supabase/client';

function fakeClient(user: { id: string } | null) {
  const eq = jest.fn();
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (column: string, value: unknown) => {
    eq(column, value);
    return builder;
  };
  builder.order = async () => ({ data: [{ id: 'n-1' }], error: null });
  const client = {
    auth: { getUser: jest.fn(async () => ({ data: { user }, error: null })) },
    from: jest.fn(() => builder),
  };
  return {
    client: client as unknown as SupabaseClient,
    eq,
    getUser: client.auth.getUser,
  };
}

describe('fetchNotifications', () => {
  it('scopes the query to the signed-in user', async () => {
    const { client, eq } = fakeClient({ id: 'usr-1' });
    const res = await fetchNotifications(client);
    expect(eq).toHaveBeenCalledWith('user_id', 'usr-1');
    expect(res).toEqual({ data: [{ id: 'n-1' }], error: null });
  });

  it('uses the user id the caller passes without asking auth', async () => {
    const { client, eq, getUser } = fakeClient({ id: 'other' });
    await fetchNotifications(client, 'usr-2');
    expect(eq).toHaveBeenCalledWith('user_id', 'usr-2');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('returns an error and does not query without a signed-in user', async () => {
    const { client, eq } = fakeClient(null);
    const res = await fetchNotifications(client);
    expect(res).toEqual({ data: null, error: 'Authentication required' });
    expect(eq).not.toHaveBeenCalled();
  });
});
