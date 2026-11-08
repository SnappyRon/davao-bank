import React from 'react';
import { Alert, Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, dispatch: mockDispatch }),
  useIsFocused: () => true,
  usePreventRemove: (enabled: boolean, cb: (e: unknown) => void) =>
    mockPreventRemove(enabled, cb),
}));

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

import { FeatureScreen } from '../components/FeatureScreen';

type AlertButton = { text?: string; onPress?: () => void };

function pressDiscard(alertSpy: jest.SpyInstance) {
  const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
  buttons.find((b) => b.text === 'Discard')?.onPress?.();
}

function lastPreventRemove() {
  const calls = mockPreventRemove.mock.calls;
  return calls[calls.length - 1] as [boolean, (e: unknown) => void];
}

describe('FeatureScreen single back guard', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  describe('modal path (onBack passed)', () => {
    it('never enables usePreventRemove, so the host tab is not blocked', async () => {
      await render(
        <FeatureScreen title="Cash Out" onBack={jest.fn()} isDirty>
          <Text>body</Text>
        </FeatureScreen>
      );
      expect(lastPreventRemove()[0]).toBe(false);
    });

    it('dirty: Back shows exactly one prompt, Discard closes once', async () => {
      const onBack = jest.fn();
      await render(
        <FeatureScreen title="Cash Out" onBack={onBack} isDirty>
          <Text>body</Text>
        </FeatureScreen>
      );
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
      pressDiscard(alertSpy);
      expect(onBack).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('Android back via backHandlerRef uses the same single guard', async () => {
      const onBack = jest.fn();
      const ref: React.MutableRefObject<(() => void) | null> = { current: null };
      await render(
        <FeatureScreen title="Cash Out" onBack={onBack} isDirty backHandlerRef={ref}>
          <Text>body</Text>
        </FeatureScreen>
      );
      ref.current?.();
      expect(alertSpy).toHaveBeenCalledTimes(1);
      pressDiscard(alertSpy);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('clean: Back closes without a prompt', async () => {
      const onBack = jest.fn();
      await render(
        <FeatureScreen title="Cash Out" onBack={onBack}>
          <Text>body</Text>
        </FeatureScreen>
      );
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(alertSpy).not.toHaveBeenCalled();
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('step 2: Back returns to step 1 instead of closing', async () => {
      const onBack = jest.fn();
      const onPrevStep = jest.fn();
      await render(
        <FeatureScreen
          title="Review"
          step={2}
          stepCount={2}
          onBack={onBack}
          onPrevStep={onPrevStep}
          isDirty
        >
          <Text>body</Text>
        </FeatureScreen>
      );
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(onPrevStep).toHaveBeenCalledTimes(1);
      expect(onBack).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('processing: Back and Android back are blocked', async () => {
      const onBack = jest.fn();
      const ref: React.MutableRefObject<(() => void) | null> = { current: null };
      await render(
        <FeatureScreen
          title="Cash Out"
          onBack={onBack}
          isDirty
          isProcessing
          backHandlerRef={ref}
        >
          <Text>body</Text>
        </FeatureScreen>
      );
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      ref.current?.();
      expect(onBack).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });
  });

  describe('stack path (no onBack)', () => {
    it('dirty: usePreventRemove owns the prompt; Discard dispatches the action', async () => {
      await render(
        <FeatureScreen title="Cash Out" isDirty>
          <Text>body</Text>
        </FeatureScreen>
      );
      const [enabled, onPrevent] = lastPreventRemove();
      expect(enabled).toBe(true);

      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();

      // Simulates the navigator calling back for Back / Android back / swipe.
      const action = { type: 'GO_BACK' };
      onPrevent({ data: { action } });
      expect(alertSpy).toHaveBeenCalledTimes(1);
      pressDiscard(alertSpy);
      expect(mockDispatch).toHaveBeenCalledWith(action);
    });

    it('processing: removal is blocked without a prompt', async () => {
      await render(
        <FeatureScreen title="Cash Out" isProcessing>
          <Text>body</Text>
        </FeatureScreen>
      );
      const [enabled, onPrevent] = lastPreventRemove();
      expect(enabled).toBe(true);
      onPrevent({ data: { action: { type: 'GO_BACK' } } });
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('clean: navigation is not prevented', async () => {
      await render(
        <FeatureScreen title="Cash Out">
          <Text>body</Text>
        </FeatureScreen>
      );
      expect(lastPreventRemove()[0]).toBe(false);
    });
  });
});
