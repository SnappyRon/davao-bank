import React from 'react';
import { AppState } from 'react-native';
import {
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { colors, fetchNotifications, type Notification } from '@davao-bank/shared';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (callback: () => void) => {
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
// select(..., { head: true }).eq() for the unread count.
const mockUpdate = jest.fn();
let mockUnreadCount = 0;
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'usr-1' } } })) },
    from: () => {
      const builder: Record<string, unknown> = {};
      builder.update = (values: unknown) => {
        mockUpdate(values);
        return builder;
      };
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ error: null, count: mockUnreadCount }).then(resolve);
      return builder;
    },
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return { ...actual, fetchNotifications: jest.fn() };
});

import { InboxScreen } from '../screens/InboxScreen';
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
    // Transaction notifications have no related id yet: no navigation.
    expect(mockNavigate).not.toHaveBeenCalled();
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
