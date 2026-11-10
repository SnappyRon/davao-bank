import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { Sheet } from '../components/Sheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

function pressBackdrop() {
  return fireEvent.press(screen.getByTestId('sheet-backdrop'));
}

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
    await act(async () => {
      fireGestureHandler(getByGestureTestId('sheet-swipe'), [
        { state: State.BEGAN, translationY: 0, velocityY: 0 },
        { state: State.ACTIVE, translationY: 400, velocityY: 1500 },
        { state: State.END, translationY: 400, velocityY: 1500 },
      ]);
    });
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

  it('a swipe past the threshold goes through the guard; a short swipe does not', async () => {
    const onClose = jest.fn();
    const onRequestDismiss = jest.fn();
    await render(
      <Sheet visible onClose={onClose} onRequestDismiss={onRequestDismiss}>
        <Text>Body</Text>
      </Sheet>
    );
    // Short, slow drag (default height is the window height): springs back.
    await act(async () => {
      fireGestureHandler(getByGestureTestId('sheet-swipe'), [
        { state: State.BEGAN, translationY: 0, velocityY: 0 },
        { state: State.ACTIVE, translationY: 20, velocityY: 100 },
        { state: State.END, translationY: 20, velocityY: 100 },
      ]);
    });
    expect(onRequestDismiss).not.toHaveBeenCalled();
    // Fast fling: closes through onRequestDismiss, never onClose directly.
    await act(async () => {
      fireGestureHandler(getByGestureTestId('sheet-swipe'), [
        { state: State.BEGAN, translationY: 0, velocityY: 0 },
        { state: State.ACTIVE, translationY: 40, velocityY: 1500 },
        { state: State.END, translationY: 40, velocityY: 1500 },
      ]);
    });
    expect(onRequestDismiss).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
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

    // The Reanimated mock completes timing animations at once, so the exit
    // callback runs and the Modal is hidden.
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
});
