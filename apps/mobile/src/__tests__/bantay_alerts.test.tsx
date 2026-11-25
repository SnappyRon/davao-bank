import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockChannels: Array<{
  name: string;
  onHandler?: (payload: unknown) => void;
  statusHandler?: (status: string) => void;
}> = [];
const mockRemoveChannel = jest.fn();
const mockChannel = jest.fn((name: string) => {
  const entry: (typeof mockChannels)[number] = { name };
  mockChannels.push(entry);
  const builder = {
    on: (_event: string, _config: unknown, handler: (payload: unknown) => void) => {
      entry.onHandler = handler;
      return builder;
    },
    subscribe: (handler: (status: string) => void) => {
      entry.statusHandler = handler;
      return builder;
    },
  };
  return builder;
});

jest.mock('../lib/supabase', () => ({
  supabase: {
    channel: (name: string) => mockChannel(name),
    removeChannel: (channel: unknown) => mockRemoveChannel(channel),
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import { BantayRealtimeBridge } from '../components/BantayRealtimeBridge';
import { ToastProvider } from '../components/Toast';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const mockOnAlert = jest.fn();
const mockOpenBantay = jest.fn();

async function renderBridge(userId: string | null) {
  return await render(
    <ToastProvider>
      <BantayRealtimeBridge
        userId={userId}
        onAlert={mockOnAlert}
        onOpenBantay={mockOpenBantay}
      />
    </ToastProvider>
  );
}

describe('Bantay Realtime alerts (8F item 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChannels.length = 0;
  });

  it('shows an actionable Bantay toast and refreshes the badge on a high event', async () => {
    const view = await renderBridge('usr-1');
    expect(mockChannel).toHaveBeenCalledTimes(1);
    expect(mockChannels[0].name).toBe('security_events:usr-1');

    await act(async () => {
      mockChannels[0].onHandler?.({ new: { kind: 'new_device', severity: 'high' } });
    });

    expect(await screen.findByText('Bantay: New device sign-in')).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Open Bantay' });
    await fireEvent.press(open);
    expect(mockOpenBantay).toHaveBeenCalledTimes(1);
    expect(mockOnAlert).toHaveBeenCalledTimes(1);

    await view.unmount();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('ignores warning and info events and filters on the signed-in user', async () => {
    await renderBridge('usr-1');
    await act(async () => {
      mockChannels[0].onHandler?.({
        new: { kind: 'password_changed', severity: 'info' },
      });
      mockChannels[0].onHandler?.({
        new: { kind: 'risky_payment_warning', severity: 'warning' },
      });
    });
    expect(mockOnAlert).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Bantay:/)).toBeNull();
  });

  it('unsubscribes on sign-out and reconnects once after a channel error', async () => {
    jest.useFakeTimers();
    try {
      const view = await renderBridge('usr-1');
      await act(async () => {
        mockChannels[0].statusHandler?.('CHANNEL_ERROR');
      });
      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(mockChannel).toHaveBeenCalledTimes(2);

      await view.rerender(
        <ToastProvider>
          <BantayRealtimeBridge
            userId={null}
            onAlert={mockOnAlert}
            onOpenBantay={mockOpenBantay}
          />
        </ToastProvider>
      );
      expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
      expect(mockChannel).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not call back after unmount', async () => {
    const view = await renderBridge('usr-1');
    const handler = mockChannels[0].onHandler!;
    await view.unmount();
    await act(async () => {
      handler({ new: { kind: 'new_device', severity: 'high' } });
    });
    await waitFor(() => expect(mockOnAlert).not.toHaveBeenCalled());
  });
});
