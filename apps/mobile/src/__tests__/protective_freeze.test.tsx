import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useProtectiveFreeze } from '../hooks/useProtectiveFreeze';
import {
  BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE,
  PROTECTIVE_LOCK_EVENT_KIND,
  isProtectiveFreeze,
} from '../utils/protectiveFreeze';

interface MockChannel {
  name: string;
  table?: string;
  handler?: (payload: { new?: Record<string, unknown> }) => void;
}

const mockGetUser = jest.fn();
const mockFetchSettings = jest.fn();
const mockFetchTimeline = jest.fn();
const mockChannels: MockChannel[] = [];
const mockRemoveChannel = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    removeChannel: (channel: unknown) => mockRemoveChannel(channel),
    channel: (name: string) => {
      const entry: MockChannel = { name };
      mockChannels.push(entry);
      const builder = {
        on: (
          _event: string,
          config: { table?: string },
          handler: (payload: { new?: Record<string, unknown> }) => void
        ) => {
          entry.table = config.table;
          entry.handler = handler;
          return builder;
        },
        subscribe: () => builder,
      };
      return builder;
    },
  },
}));

jest.mock('../hooks/usePhase8Contracts', () => ({
  fetchSecuritySettings: (...args: unknown[]) => mockFetchSettings(...args),
  fetchSecurityTimeline: (...args: unknown[]) => mockFetchTimeline(...args),
}));

const event = (kind: string) =>
  ({ id: 'evt-1', kind, severity: 'high', created_at: '2026-11-26T10:00:00Z' }) as never;

describe('Bantay protective freeze state (Stage 8L)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannels.length = 0;
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'usr-1' } },
      error: null,
    });
    mockFetchSettings.mockResolvedValue({
      data: { locked: true, unlock_after: null },
      error: null,
    });
    mockFetchTimeline.mockResolvedValue({
      data: [event(PROTECTIVE_LOCK_EVENT_KIND)],
      error: null,
    });
  });

  it('only treats a lock plus a real protective_lock event as protective', () => {
    expect(isProtectiveFreeze(false, [event(PROTECTIVE_LOCK_EVENT_KIND)])).toBe(false);
    expect(isProtectiveFreeze(true, [event('account_locked')])).toBe(false);
    expect(isProtectiveFreeze(true, [event(PROTECTIVE_LOCK_EVENT_KIND)])).toBe(true);
  });

  it('derives the freeze from existing RPCs and refetches on both Realtime tables', async () => {
    const { result } = await renderHook(() => useProtectiveFreeze());

    await waitFor(() => expect(result.current.protective).toBe(true));
    expect(result.current.locked).toBe(true);
    expect(mockFetchSettings).toHaveBeenCalledTimes(1);
    expect(mockFetchTimeline).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockChannels).toHaveLength(2));
    expect(mockChannels.map((channel) => channel.table)).toEqual([
      'security_events',
      'notifications',
    ]);

    const security = mockChannels.find((channel) => channel.table === 'security_events');
    await act(async () => {
      security?.handler?.({
        new: { kind: PROTECTIVE_LOCK_EVENT_KIND, severity: 'high' },
      });
    });
    await waitFor(() => expect(mockFetchSettings).toHaveBeenCalledTimes(2));

    const notices = mockChannels.find((channel) => channel.table === 'notifications');
    await act(async () => {
      notices?.handler?.({
        new: { type: BANTAY_PROTECTIVE_LOCK_NOTIFICATION_TYPE },
      });
    });
    await waitFor(() => expect(mockFetchSettings).toHaveBeenCalledTimes(3));

    await act(async () => {
      notices?.handler?.({ new: { type: 'transfer_in' } });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchSettings).toHaveBeenCalledTimes(3);
  });

  it('leaves an ordinary lock non-protective', async () => {
    mockFetchTimeline.mockResolvedValue({ data: [event('account_locked')], error: null });
    const { result } = await renderHook(() => useProtectiveFreeze());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);
    expect(result.current.protective).toBe(false);
  });
});
