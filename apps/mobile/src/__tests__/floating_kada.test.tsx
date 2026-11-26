import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';
import {
  clampKadaPosition,
  FloatingKada,
  kadaBubbleLeft,
  kadaBubbleWidth,
  kadaBottomOffset,
  kadaRestingOrigin,
  type KadaDragBounds,
} from '../components/FloatingKada';
import { fetchSecurityTimeline } from '../hooks/usePhase8Contracts';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

let mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => mockSafeAreaInsets,
  };
});

jest.mock('../hooks/usePhase8Contracts', () => ({
  fetchSecurityTimeline: jest.fn(async () => ({ data: [], error: null })),
}));

const bounds: KadaDragBounds = {
  windowWidth: 390,
  windowHeight: 844,
  insetTop: 0,
  insetRight: 0,
  insetBottom: 0,
  insetLeft: 0,
  bottomOffset: 88,
};

function todayEvents(count: number) {
  return Array.from({ length: count }, () => ({
    created_at: new Date().toISOString(),
  }));
}

describe('Phase 8 · Stage 8I — interactive floating Kada', () => {
  const onOpenBantay = jest.fn();
  const onOpenChat = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    jest.mocked(fetchSecurityTimeline).mockResolvedValue({
      data: todayEvents(2) as never,
      error: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders one labelled Kada button with decorative art and no chat gesture', async () => {
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);

    const kada = screen.getByRole('button', {
      name: 'Bantay, watching your account',
    });
    expect(kada).toBeTruthy();
    expect(screen.getByTestId('floating-kada-anchor').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ zIndex: 90 })])
    );
    expect(screen.getByRole('button', { name: 'Hide Bantay' })).toBeTruthy();
    // Chat is a bubble button, never a tap/long-press gesture (§7.1).
    expect(screen.queryByRole('button', { name: 'Ask Bantay' })).toBeNull();
    expect(onOpenChat).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Bantay, watching your account' })
    );
    expect(onOpenBantay).not.toHaveBeenCalled();
    expect(onOpenChat).not.toHaveBeenCalled();
  });

  it('tap shows a real-data status bubble with Dismiss and Open Bantay', async () => {
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Bantay, watching your account' })
    );

    expect(
      await screen.findByText('Watching your account · 2 alerts today')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open Bantay' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByText('Watching your account · 2 alerts today')).toBeNull()
    );
    expect(onOpenBantay).not.toHaveBeenCalled();
  });

  it('opens the chat only from the bubble Ask Bantay button', async () => {
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Bantay, watching your account' })
    );
    const ask = await screen.findByRole('button', { name: 'Ask Bantay' });
    await fireEvent.press(ask);

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onOpenBantay).not.toHaveBeenCalled();
    expect(screen.queryByTestId('floating-kada-bubble')).toBeNull();
  });

  it('omits the count when the timeline RPC fails instead of showing 0', async () => {
    jest.mocked(fetchSecurityTimeline).mockResolvedValue({
      data: [],
      error: new Error('rpc failed'),
    });
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Bantay, watching your account' })
    );
    expect(await screen.findByText('Watching your account')).toBeTruthy();
    expect(screen.queryByText(/0 alerts today/)).toBeNull();
  });

  it('uses the locked label and locked bubble copy', async () => {
    jest.mocked(fetchSecurityTimeline).mockResolvedValue({
      data: todayEvents(1) as never,
      error: null,
    });
    await render(
      <FloatingKada locked onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Bantay, account locked' }));
    expect(
      await screen.findByText('Your account is locked · 1 alerts today')
    ).toBeTruthy();
  });

  it('shows the protective-freeze bubble and skips the ordinary timeline read', async () => {
    await render(
      <FloatingKada
        locked
        protective
        onOpenBantay={onOpenBantay}
        onOpenChat={onOpenChat}
      />
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Bantay, account frozen' }));
    expect(
      await screen.findByText(
        /I froze your account to keep your money safe\. Tap to see what happened\. Davao Bank will never ask you to move your money\./
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/Bantay froze your account to protect your money\. Check Bantay\./)
    ).toBeTruthy();
    expect(fetchSecurityTimeline).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Open Bantay' }));
    expect(onOpenBantay).toHaveBeenCalledTimes(1);
  });

  it('long-press opens Bantay security center without a bubble', async () => {
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);

    await fireEvent(
      screen.getByRole('button', { name: 'Bantay, watching your account' }),
      'longPress'
    );

    expect(onOpenBantay).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('floating-kada-bubble')).toBeNull();
  });

  it('dismisses to a 32 pt badge and restores the widget', async () => {
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Hide Bantay' }));
    expect(screen.queryByTestId('floating-kada')).toBeNull();
    const show = screen.getByRole('button', { name: 'Show Bantay' });
    expect(show.props.style).toEqual(expect.objectContaining({ width: 32, height: 32 }));

    await fireEvent.press(show);
    expect(screen.getByTestId('floating-kada')).toBeTruthy();
  });

  it('does not start the idle loop under Reduce Motion', async () => {
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);

    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);

    expect(withRepeatSpy).not.toHaveBeenCalled();
  });

  it('clamps a drag translation inside the safe area', () => {
    const rest = kadaRestingOrigin(bounds);
    expect(rest).toEqual({ x: 306, y: 692 });

    expect(clampKadaPosition({ x: -1000, y: -1000 }, bounds)).toEqual({
      x: -298,
      y: -676,
    });
    expect(clampKadaPosition({ x: 1000, y: 1000 }, bounds)).toEqual({ x: 0, y: 0 });
  });

  it('caps the bubble at 280 pt and never past the screen gutters', () => {
    expect(kadaBubbleWidth(390)).toBe(280);
    expect(kadaBubbleWidth(320)).toBe(280);
    expect(kadaBubbleWidth(300)).toBe(260);
    expect(kadaBubbleLeft(390)).toBe(90);
    expect(kadaBubbleLeft(300)).toBe(20);
  });

  it('renders the bubble as a horizontal card above Kada with a 3-line cap', async () => {
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Bantay, watching your account' })
    );

    const bubble = await screen.findByTestId('floating-kada-bubble');
    expect(bubble.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 280, right: 0, bottom: 72 }),
      ])
    );

    const copy = screen.getByText('Watching your account · 2 alerts today');
    expect(copy.props.numberOfLines).toBe(3);

    // The old narrow bubble collapsed the primary button into an empty green
    // circle; the intended shield icon now renders inside a full-width card.
    expect(screen.getByTestId('floating-kada-action-icon')).toBeTruthy();
    expect(screen.getByTestId('floating-kada-hide').props.style).toEqual(
      expect.objectContaining({ top: 0, right: 0 })
    );
  });

  it('does not double-count the safe-area inset when anchoring above the tab bar', async () => {
    expect(kadaBottomOffset(0)).toBe(96);
    expect(kadaBottomOffset(34)).toBe(88);

    mockSafeAreaInsets = { top: 0, bottom: 34, left: 0, right: 0 };
    await render(<FloatingKada onOpenBantay={onOpenBantay} onOpenChat={onOpenChat} />);
    expect(screen.getByTestId('floating-kada-anchor').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ bottom: 88 })])
    );
  });
});
