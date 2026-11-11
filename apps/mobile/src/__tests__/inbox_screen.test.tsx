import React from 'react';
import { AppState } from 'react-native';
import {
  act,
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import {
  colors,
  fetchNotifications,
  fetchTransactionHistory,
  type Notification,
  type TransactionHistoryItem,
} from '@davao-bank/shared';

const mockNavigate = jest.fn();
// The latest focus callback, so a test can simulate the tab regaining focus.
let mockFocusCallback: (() => void) | null = null;

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (callback: () => void) => {
      mockFocusCallback = callback;
      useEffect(() => callback(), [callback]);
    },
    useIsFocused: () => true,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

// supabase.from(...) chains: update().eq() for mark-as-read, and
// select(..., { head: true }).eq() for the unread count. `.eq` calls are
// recorded; with `mockHoldUpdates` the update queries wait until released.
const mockUpdate = jest.fn();
const mockEq = jest.fn();
let mockUnreadCount = 0;
let mockHoldUpdates = false;
const mockPendingUpdates: (() => void)[] = [];
let mockHoldCounts = false;
const mockPendingCounts: ((count: number) => void)[] = [];
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'usr-1' } } })) },
    from: () => {
      const builder: Record<string, unknown> = {};
      let isUpdate = false;
      builder.update = (values: unknown) => {
        isUpdate = true;
        mockUpdate(values);
        return builder;
      };
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        mockEq(column, value);
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (isUpdate && mockHoldUpdates) {
          return new Promise((release) => {
            mockPendingUpdates.push(() => release({ error: null }));
          }).then(resolve);
        }
        if (!isUpdate && mockHoldCounts) {
          return new Promise((release) => {
            mockPendingCounts.push((count) => release({ error: null, count }));
          }).then(resolve);
        }
        return Promise.resolve({ error: null, count: mockUnreadCount }).then(resolve);
      };
      return builder;
    },
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return { ...actual, fetchNotifications: jest.fn(), fetchTransactionHistory: jest.fn() };
});

import { InboxScreen, receiptRowFor } from '../screens/InboxScreen';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

function note(overrides: Partial<Notification>): Notification {
  return {
    id: 'n',
    user_id: 'usr-1',
    type: 'transfer_out',
    message: 'You sent ₱500.00 to •• 7943.',
    read: true,
    created_at: '2026-11-08T02:41:00',
    ...overrides,
  };
}

const items = [
  note({ id: 'n-unread', type: 'transfer_out', read: false }),
  note({ id: 'n-read', type: 'transaction_reversed', read: true }),
  note({ id: 'n-req', type: 'payment_request_received', read: true }),
  note({ id: 'n-paid', type: 'payment_request_paid', read: true }),
];

describe('InboxScreen (7B.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHoldUpdates = false;
    mockPendingUpdates.length = 0;
    (fetchNotifications as jest.Mock).mockResolvedValue({ data: items, error: null });
  });

  it('uses sentence-case titles from the wording table', async () => {
    await render(<InboxScreen />);
    expect(await screen.findByText('Money sent')).toBeTruthy();
    expect(screen.getByText('Transfer reversed')).toBeTruthy();
    expect(screen.queryByText('TRANSFER OUT')).toBeNull();
  });

  it('marks unread items with an 8 pt green dot and a bold title', async () => {
    await render(<InboxScreen />);
    await screen.findByText('Money sent');

    expect(screen.getByTestId('inbox-unread-n-unread')).toHaveStyle({
      width: 8,
      height: 8,
      backgroundColor: colors.primary,
    });
    expect(screen.queryByTestId('inbox-unread-n-read')).toBeNull();
    expect(screen.getByTestId('inbox-title-n-unread')).toHaveStyle({
      fontFamily: 'PlusJakartaSans_600SemiBold',
    });
    expect(screen.getByTestId('inbox-title-n-read')).toHaveStyle({
      fontFamily: 'PlusJakartaSans_500Medium',
    });
    // No left border on unread rows any more.
    expect(screen.getByTestId('inbox-row-n-unread')).not.toHaveStyle({
      borderLeftWidth: 4,
    });
  });

  it('reports the unread count and lowers it when an item is opened', async () => {
    const onUnread = jest.fn();
    await render(<InboxScreen onUnreadCountChange={onUnread} />);
    await screen.findByText('Money sent');
    expect(onUnread).toHaveBeenLastCalledWith(1);

    await fireEvent.press(screen.getByTestId('inbox-row-n-unread'));

    await waitFor(() => expect(onUnread).toHaveBeenLastCalledWith(0));
    expect(mockUpdate).toHaveBeenCalledWith({ read: true });
    // This notification has no related transaction id: no navigation.
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fetchTransactionHistory).not.toHaveBeenCalled();
  });

  it('opens Payment requests on the right tab for request notifications', async () => {
    await render(<InboxScreen />);
    await screen.findByText('Payment request');

    await fireEvent.press(screen.getByTestId('inbox-row-n-req'));
    expect(mockNavigate).toHaveBeenLastCalledWith('PaymentRequests', {
      initialTab: 'incoming',
    });

    await fireEvent.press(screen.getByTestId('inbox-row-n-paid'));
    expect(mockNavigate).toHaveBeenLastCalledWith('PaymentRequests', {
      initialTab: 'outgoing',
    });
  });

  describe('deep link to the receipt (7B.9)', () => {
    const historyRow = (
      overrides: Partial<TransactionHistoryItem>
    ): TransactionHistoryItem => ({
      ledger_entry_id: 'le-1',
      transaction_id: 'tx-1',
      account_id: 'acc-savings',
      account_number: '1012348921',
      type: 'transfer',
      direction: 'debit',
      amount: 50000,
      signed_amount: -50000,
      status: 'completed',
      reference: null,
      counterparty_account_number: '1078957943',
      created_at: '2026-11-08T02:41:00',
      biller_name: null,
      ...overrides,
    });

    it('opens the receipt for a notification with a related transaction and marks it read', async () => {
      (fetchNotifications as jest.Mock).mockResolvedValue({
        data: [note({ id: 'n-tx', read: false, related_transaction_id: 'tx-1' })],
        error: null,
      });
      (fetchTransactionHistory as jest.Mock).mockResolvedValue({
        data: [
          historyRow({}),
          historyRow({ transaction_id: 'tx-other', account_id: 'acc-x' }),
        ],
        error: null,
      });
      await render(<InboxScreen />);
      await screen.findByText('Money sent');

      await fireEvent.press(screen.getByTestId('inbox-row-n-tx'));

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('Receipt', {
          transactionId: 'tx-1',
          accountId: 'acc-savings',
        })
      );
      expect(mockUpdate).toHaveBeenCalledWith({ read: true });
      expect(mockEq).toHaveBeenCalledWith('id', 'n-tx');
    });

    it("does not navigate when the transaction is not in the caller's history", async () => {
      (fetchNotifications as jest.Mock).mockResolvedValue({
        data: [
          note({ id: 'n-tx', read: true, related_transaction_id: 'tx-someone-else' }),
        ],
        error: null,
      });
      (fetchTransactionHistory as jest.Mock).mockResolvedValue({
        data: [historyRow({})],
        error: null,
      });
      await render(<InboxScreen />);
      await screen.findByText('Money sent');

      await fireEvent.press(screen.getByTestId('inbox-row-n-tx'));

      await waitFor(() => expect(fetchTransactionHistory).toHaveBeenCalledTimes(1));
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('a notification without a related id only marks it read', async () => {
      (fetchNotifications as jest.Mock).mockResolvedValue({
        data: [note({ id: 'n-old', read: false, related_transaction_id: null })],
        error: null,
      });
      await render(<InboxScreen />);
      await screen.findByText('Money sent');

      await fireEvent.press(screen.getByTestId('inbox-row-n-old'));

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({ read: true }));
      expect(fetchTransactionHistory).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('picks the credit row for money received and the debit row otherwise', () => {
      const rows = [
        historyRow({ ledger_entry_id: 'debit', direction: 'debit', account_id: 'acc-a' }),
        historyRow({
          ledger_entry_id: 'credit',
          direction: 'credit',
          account_id: 'acc-b',
        }),
      ];
      expect(receiptRowFor(note({ type: 'transfer_in' }), 'tx-1', rows)?.account_id).toBe(
        'acc-b'
      );
      expect(
        receiptRowFor(note({ type: 'transfer_out' }), 'tx-1', rows)?.account_id
      ).toBe('acc-a');
      expect(receiptRowFor(note({ type: 'transfer_out' }), 'tx-9', rows)).toBeNull();
    });
  });

  it('two quick taps on unread items mark both read (no revert) and the count is 0', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValue({
      data: [
        note({ id: 'a', read: false }),
        note({ id: 'b', type: 'deposit', read: false }),
      ],
      error: null,
    });
    const onUnread = jest.fn();
    await render(<InboxScreen onUnreadCountChange={onUnread} />);
    await screen.findByText('Money sent');
    expect(onUnread).toHaveBeenLastCalledWith(2);

    mockHoldUpdates = true;
    await fireEvent.press(screen.getByTestId('inbox-row-a'));
    await fireEvent.press(screen.getByTestId('inbox-row-b'));
    expect(mockPendingUpdates).toHaveLength(2);

    await act(async () => {
      mockPendingUpdates.forEach((release) => release());
    });

    await waitFor(() => expect(onUnread).toHaveBeenLastCalledWith(0));
    expect(screen.queryByTestId('inbox-unread-a')).toBeNull();
    expect(screen.queryByTestId('inbox-unread-b')).toBeNull();
  });

  it('"Mark all as read" updates only this user\'s unread rows and sets the count to 0', async () => {
    const onUnread = jest.fn();
    await render(<InboxScreen onUnreadCountChange={onUnread} />);
    await screen.findByText('Money sent');

    await fireEvent.press(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => expect(onUnread).toHaveBeenLastCalledWith(0));
    expect(mockUpdate).toHaveBeenCalledWith({ read: true });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'usr-1');
    expect(mockEq).toHaveBeenCalledWith('read', false);
    expect(screen.queryByTestId('inbox-unread-n-unread')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
  });

  it('ignores an older load that resolves after a newer one', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    (fetchNotifications as jest.Mock)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({
        data: [note({ id: 'new', type: 'deposit' })],
        error: null,
      });

    await render(<InboxScreen />);
    // The tab regains focus while the first load is still running.
    await act(async () => {
      mockFocusCallback?.();
    });
    expect(await screen.findByText('Money added')).toBeTruthy();

    await act(async () => {
      resolveFirst({ data: [note({ id: 'old', type: 'withdrawal' })], error: null });
    });
    expect(screen.getByText('Money added')).toBeTruthy();
    expect(screen.queryByText('Cash out')).toBeNull();
  });

  it('shows a load error with Try again instead of an empty inbox', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });
    await render(<InboxScreen />);
    expect(await screen.findByText('Inbox unavailable')).toBeTruthy();
    expect(screen.queryByText("You're all caught up")).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Money sent')).toBeTruthy();
  });

  it('shows the empty state copy', async () => {
    (fetchNotifications as jest.Mock).mockResolvedValueOnce({ data: [], error: null });
    await render(<InboxScreen />);
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });
});

describe('useUnreadNotificationCount (Inbox badge at start)', () => {
  it('loads the count as soon as there is a signed-in user, without opening Inbox', async () => {
    mockUnreadCount = 3;
    const { result } = await renderHook(() => useUnreadNotificationCount('usr-1'));
    await waitFor(() => expect(result.current.count).toBe(3));
  });

  it('stays 0 with no user and resets on sign-out', async () => {
    mockUnreadCount = 2;
    const { result, rerender } = await renderHook(
      ({ userId }: { userId: string | null }) => useUnreadNotificationCount(userId),
      { initialProps: { userId: 'usr-1' as string | null } }
    );
    await waitFor(() => expect(result.current.count).toBe(2));
    await rerender({ userId: null });
    await waitFor(() => expect(result.current.count).toBe(0));
  });

  it('scopes the count query to the signed-in user', async () => {
    mockEq.mockClear();
    mockUnreadCount = 1;
    const { result } = await renderHook(() => useUnreadNotificationCount('usr-1'));
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(mockEq).toHaveBeenCalledWith('user_id', 'usr-1');
    expect(mockEq).toHaveBeenCalledWith('read', false);
  });

  it("Inbox's reported count wins over a refresh still in flight", async () => {
    mockHoldCounts = true;
    mockPendingCounts.length = 0;
    const { result } = await renderHook(() => useUnreadNotificationCount('usr-1'));
    expect(mockPendingCounts).toHaveLength(1);

    // Inbox reports 0 while the start-up refresh is still running…
    await act(async () => {
      result.current.setCount(0);
    });
    // …then the older refresh resolves with a stale 5.
    await act(async () => {
      mockPendingCounts[0](5);
    });
    expect(result.current.count).toBe(0);
    mockHoldCounts = false;
  });

  it('refreshes when the app returns to the foreground', async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: (state: string) => void
    ) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }) as unknown as typeof AppState.addEventListener);

    mockUnreadCount = 1;
    const { result } = await renderHook(() => useUnreadNotificationCount('usr-1'));
    await waitFor(() => expect(result.current.count).toBe(1));

    mockUnreadCount = 4;
    listeners.forEach((listener) => listener('active'));
    await waitFor(() => expect(result.current.count).toBe(4));
    spy.mockRestore();
  });
});
