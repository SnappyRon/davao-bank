import React, { useState } from 'react';
import { AccessibilityInfo, Button, Text } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { motion } from '@davao-bank/shared';
import { Sheet } from '../components/Sheet';
import { SettingsProvider, useSettings } from '../context/SettingsContext';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(),
}));
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { email: 'fixture@example.invalid' } },
      })),
      signInWithPassword: jest.fn(async () => ({ error: null })),
    },
  },
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => false),
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
  authenticateAsync: jest.fn(),
  AuthenticationType: { FACIAL_RECOGNITION: 2, FINGERPRINT: 1 },
}));

// The Jest renderer has no native tags; resolve refs to a fake tag so the
// focus call can be observed. Everything else in the renderer proxy is real.
const mockFindNodeHandle = jest.fn((_ref: unknown) => 42);
jest.mock('react-native/Libraries/ReactNative/RendererProxy', () => ({
  ...jest.requireActual('react-native/Libraries/ReactNative/RendererProxy'),
  findNodeHandle: (ref: unknown) => mockFindNodeHandle(ref),
}));

// The global Reanimated mock (tests/setup/mobile-setup.ts). Spied per test
// below; the global mock itself is left unchanged.
const Reanimated = jest.requireMock('react-native-reanimated');

function pressBackdrop() {
  return fireEvent.press(screen.getByTestId('sheet-backdrop'));
}

function swipe(translationY: number, velocityY: number) {
  return act(async () => {
    fireGestureHandler(getByGestureTestId('sheet-swipe'), [
      { state: State.BEGAN, translationY: 0, velocityY: 0 },
      { state: State.ACTIVE, translationY, velocityY },
      { state: State.END, translationY, velocityY },
    ]);
  });
}

/** A parent that really closes the sheet when asked, like a screen would. */
function ClosingParent({ onClose }: { onClose?: () => void }) {
  const [visible, setVisible] = useState(true);
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        onClose?.();
        setVisible(false);
      }}
      title="Pick account"
    >
      <Text>Body</Text>
    </Sheet>
  );
}

beforeEach(() => {
  // Spies on the same function can carry calls across tests; start clean.
  jest.clearAllMocks();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Sheet', () => {
  it('closes through onClose from the X and the backdrop', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose} title="Pick account">
        <Text>Body</Text>
      </Sheet>
    );
    expect(screen.getByRole('header', { name: 'Pick account' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await pressBackdrop();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('routes Android back through the same guard', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose}>
        <Text>Body</Text>
      </Sheet>
    );
    await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks every dismiss path when dismissible is false', async () => {
    const onClose = jest.fn();
    const onRequestDismiss = jest.fn();
    await render(
      <Sheet
        visible
        onClose={onClose}
        onRequestDismiss={onRequestDismiss}
        dismissible={false}
      >
        <Text>Body</Text>
      </Sheet>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await pressBackdrop();
    await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'requestClose');
    await swipe(400, 1500);
    expect(onClose).not.toHaveBeenCalled();
    expect(onRequestDismiss).not.toHaveBeenCalled();
  });

  it('prefers onRequestDismiss over onClose', async () => {
    const onClose = jest.fn();
    const onRequestDismiss = jest.fn();
    await render(
      <Sheet visible onClose={onClose} onRequestDismiss={onRequestDismiss}>
        <Text>Body</Text>
      </Sheet>
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await pressBackdrop();
    expect(onRequestDismiss).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a swipe that closes continues down: no spring back before hiding', async () => {
    const withSpring = jest.spyOn(Reanimated, 'withSpring');
    const onClose = jest.fn();
    await render(<ClosingParent onClose={onClose} />);
    await swipe(40, 1500);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(withSpring).not.toHaveBeenCalled();
    expect(screen.queryByTestId('bottom-sheet-modal')).toBeNull();
  });

  it('a swipe the guard declines springs back with spring.sheet', async () => {
    const withSpring = jest.spyOn(Reanimated, 'withSpring');
    const onClose = jest.fn();
    const onRequestDismiss = jest.fn(); // e.g. opens a confirmation; stays open
    await render(
      <Sheet visible onClose={onClose} onRequestDismiss={onRequestDismiss}>
        <Text>Body</Text>
      </Sheet>
    );
    await swipe(40, 1500);
    expect(onRequestDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(withSpring).toHaveBeenCalledWith(0, motion.spring.sheet);
    expect(screen.getByTestId('bottom-sheet-modal')).toBeTruthy();
  });

  it('a short, slow drag springs back without calling the guard', async () => {
    const withSpring = jest.spyOn(Reanimated, 'withSpring');
    const onClose = jest.fn();
    await render(<ClosingParent onClose={onClose} />);
    // Default height is the window height, so 20 pt is well under 25%.
    await swipe(20, 100);
    expect(onClose).not.toHaveBeenCalled();
    expect(withSpring).toHaveBeenCalledWith(0, motion.spring.sheet);
  });

  it('moves accessibility focus to the title when presented and on step change', async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => {});
    const tree = (step: number) => (
      <Sheet visible onClose={jest.fn()} title="Repeat" step={step} stepCount={2}>
        <Text>Body</Text>
      </Sheet>
    );
    const view = await render(tree(1));
    expect(focus).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'show');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(42);
    await view.rerender(tree(2));
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('does not move focus when there is no title to focus', async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, 'setAccessibilityFocus')
      .mockImplementation(() => {});
    await render(
      <Sheet visible onClose={jest.fn()}>
        <Text>Body</Text>
      </Sheet>
    );
    await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'show');
    expect(focus).not.toHaveBeenCalled();
  });

  it('hides the Modal once the exit animation completes, and reopens', async () => {
    const tree = (visible: boolean) => (
      <Sheet visible={visible} onClose={jest.fn()} title="Sign out">
        <Text>Body</Text>
      </Sheet>
    );
    const view = await render(tree(true));
    expect(screen.getByTestId('bottom-sheet-modal')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();

    // The global Reanimated mock completes timing animations at once, so the
    // exit callback runs and the Modal is hidden.
    await view.rerender(tree(false));
    expect(screen.queryByTestId('bottom-sheet-modal')).toBeNull();
    expect(screen.queryByText('Body')).toBeNull();

    await view.rerender(tree(true));
    expect(screen.getByTestId('bottom-sheet-modal')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('starts hidden when mounted with visible false', async () => {
    await render(
      <Sheet visible={false} onClose={jest.fn()}>
        <Text>Body</Text>
      </Sheet>
    );
    expect(screen.queryByTestId('bottom-sheet-modal')).toBeNull();
  });

  it('reopening during the exit keeps the Modal and the prompt host ready', async () => {
    // Hold timing callbacks so the exit is still running when the sheet reopens.
    const held: Array<(finished: boolean) => void> = [];
    jest
      .spyOn(Reanimated, 'withTiming')
      .mockImplementation((toValue: unknown, _config: unknown, cb: unknown) => {
        if (typeof cb === 'function') held.push(cb as (finished: boolean) => void);
        return toValue;
      });
    const result = jest.fn();
    function Trigger() {
      const settings = useSettings();
      return (
        <Button
          title="Request confirmation"
          onPress={() => {
            void settings
              .confirmMoneyAction({
                title: 'Test authorization',
                requireTotp: false,
                message: 'Confirm fixture action',
              })
              .then(result);
          }}
        />
      );
    }
    const tree = (visible: boolean) => (
      <SettingsProvider>
        <Sheet visible={visible} onClose={jest.fn()}>
          <Trigger />
        </Sheet>
      </SettingsProvider>
    );
    const view = await render(tree(true));
    await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'show');

    await view.rerender(tree(false));
    // Exit is running: the Modal is still mounted.
    expect(held).toHaveLength(1);
    expect(
      screen.getByTestId('bottom-sheet-modal', { includeHiddenElements: true })
    ).toBeTruthy();

    // Reopen before the exit ends. Reanimated reports a cancelled animation as
    // finished = false.
    await view.rerender(tree(true));
    await act(async () => {
      held.forEach((cb) => cb(false));
    });
    const modal = screen.getByTestId('bottom-sheet-modal');
    expect(modal).toBeTruthy();

    // No new onShow fires (the native Modal never hid), yet the prompt opens
    // inside this sheet.
    await fireEvent.press(within(modal).getByText('Request confirmation'));
    expect(within(modal).getByTestId('password-prompt')).toBeTruthy();
    expect(result).not.toHaveBeenCalled();
  });
});
