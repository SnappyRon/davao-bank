import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FeatureScreen } from '../components/FeatureScreen';
import { Button } from '../components/Button';
import { useConfirmSheet } from '../hooks/useConfirmSheet';
import {
  PasswordPromptProvider,
  usePasswordPrompt,
} from '../context/PasswordPromptContext';
import { ConfirmSheet } from '../components/ConfirmSheet';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

it('shows labelled actions and only confirms on confirm', async () => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await render(
    <ConfirmSheet
      visible
      title="Remove recipient"
      message="Remove this recipient?"
      confirmLabel="Remove"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  expect(screen.getByRole('header', { name: 'Remove recipient' })).toBeTruthy();
  expect(screen.getByText('Remove this recipient?')).toBeTruthy();
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('uses the custom cancel label and routes close through cancel', async () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  await render(
    <ConfirmSheet
      visible
      title="Discard changes?"
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(onCancel).toHaveBeenCalledTimes(2);
  expect(onConfirm).not.toHaveBeenCalled();
});

function ConfirmationThenPassword({ result }: { result: jest.Mock }) {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  const prompt = usePasswordPrompt();
  return (
    <FeatureScreen title="Schedule details">
      <Button
        title="Cancel schedule"
        onPress={() =>
          showConfirmation({
            title: 'Cancel scheduled payment',
            confirmLabel: 'Cancel payment',
            onConfirm: () => {
              void prompt({
                title: 'Authorize cancellation',
                message: 'Confirm identity',
              }).then(result);
            },
          })
        }
      />
      {confirmSheet}
    </FeatureScreen>
  );
}

it('closes the confirmation before opening the password prompt in the feature host', async () => {
  const result = jest.fn();
  await render(
    <PasswordPromptProvider>
      <ConfirmationThenPassword result={result} />
    </PasswordPromptProvider>
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel schedule' }));
  await fireEvent(screen.getByTestId('bottom-sheet-modal'), 'show');
  expect(screen.queryByTestId('password-prompt')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel payment' }));
  expect(screen.queryByTestId('bottom-sheet-modal')).toBeNull();
  expect(screen.getAllByTestId('password-prompt')).toHaveLength(1);
  expect(result).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(result).toHaveBeenCalledWith({ success: false, cancelled: true });
});

function DoubleTapConfirm({ onConfirm }: { onConfirm: jest.Mock }) {
  const { showConfirmation, confirmSheet } = useConfirmSheet();
  return (
    <>
      <Button
        title="Remove"
        onPress={() =>
          showConfirmation({
            title: 'Remove recipient',
            confirmLabel: 'Yes, remove',
            onConfirm,
          })
        }
      />
      {confirmSheet}
    </>
  );
}

it('runs the confirmed action once when Confirm is pressed twice', async () => {
  const onConfirm = jest.fn();
  await render(
    <PasswordPromptProvider>
      <DoubleTapConfirm onConfirm={onConfirm} />
    </PasswordPromptProvider>
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
  // The open sheet hides the trigger; press it anyway to prove a second open is ignored.
  await fireEvent.press(
    screen.getByRole('button', { name: 'Remove', includeHiddenElements: true })
  );
  expect(screen.getAllByRole('button', { name: 'Yes, remove' })).toHaveLength(1);
  const confirm = screen.getByRole('button', { name: 'Yes, remove' });
  await fireEvent.press(confirm);
  await fireEvent.press(confirm);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
