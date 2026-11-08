import React from 'react';
import { Button } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import {
  PasswordPromptProvider,
  useTotpPrompt,
  PROMPT_UNAVAILABLE,
} from '../context/PasswordPromptContext';
import { BottomSheet } from '../components/BottomSheet';
import { supabase } from '../lib/supabase';
import { retryStepUp } from '../utils/stepUpRetry';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: jest.fn(async () => ({
          data: { totp: [{ id: 'fixture', status: 'verified' }] },
          error: null,
        })),
        challengeAndVerify: jest.fn(async () => ({ error: null })),
        getAuthenticatorAssuranceLevel: jest.fn(async () => ({
          data: { currentLevel: 'aal2' },
          error: null,
        })),
      },
      refreshSession: jest.fn(async () => ({ error: null })),
    },
  },
}));
function Trigger({ result }: { result: jest.Mock }) {
  const prompt = useTotpPrompt();
  return (
    <Button
      title="Request code"
      onPress={() => {
        void prompt().then(result);
      }}
    />
  );
}
afterEach(() => jest.useRealTimers());
it('renders only inside the top sheet; Cancel never authorizes', async () => {
  const result = jest.fn();
  await render(
    <PasswordPromptProvider>
      <BottomSheet visible onClose={jest.fn()}>
        <Trigger result={result} />
      </BottomSheet>
    </PasswordPromptProvider>
  );
  const sheet = screen.getByTestId('bottom-sheet-modal');
  await fireEvent(sheet, 'show');
  await fireEvent.press(screen.getByText('Request code'));
  expect(screen.getAllByTestId('totp-prompt')).toHaveLength(1);
  expect(within(sheet).getByTestId('totp-prompt')).toBeTruthy();
  await fireEvent.press(screen.getByText('Cancel'));
  expect(result).toHaveBeenCalledWith({ success: false, cancelled: true });
  expect(supabase.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
});
it('fails closed when the sheet does not present within two seconds', async () => {
  jest.useFakeTimers();
  const result = jest.fn();
  await render(
    <PasswordPromptProvider>
      <BottomSheet visible onClose={jest.fn()}>
        <Trigger result={result} />
      </BottomSheet>
    </PasswordPromptProvider>
  );
  await fireEvent.press(screen.getByText('Request code'));
  await act(async () => {
    jest.advanceTimersByTime(2000);
  });
  expect(result).toHaveBeenCalledWith({ success: false, error: PROMPT_UNAVAILABLE });
});
it('retries an expired step-up at most once using the same operation', async () => {
  const send = jest.fn(async () => ({ error: 'STEP_UP_EXPIRED' }));
  const confirm = jest.fn(async () => ({ success: true }));
  expect(await retryStepUp(send, confirm)).toEqual({ error: 'STEP_UP_EXPIRED' });
  expect(send).toHaveBeenCalledTimes(2);
  expect(confirm).toHaveBeenCalledTimes(1);
});
it('does not retry when code entry is cancelled', async () => {
  const send = jest.fn(async () => ({ error: 'STEP_UP_REQUIRED' }));
  const result = await retryStepUp(send, async () => ({
    success: false,
    cancelled: true,
  }));
  expect(result.error).toContain('cancelled');
  expect(send).toHaveBeenCalledTimes(1);
});
