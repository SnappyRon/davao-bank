import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { ResultView, type ResultOutcome } from '../components/ResultView';
import { resultRows, isConfirmedRejection } from '../utils/resultReceipt';

jest.mock('lucide-react-native', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return Object.fromEntries(
    ['Check', 'Calendar', 'Send', 'AlertCircle'].map((name) => [
      name,
      () => React.createElement(View, { testID: `icon-${name}` }),
    ])
  );
});
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

beforeEach(() => jest.clearAllMocks());

it.each<[ResultOutcome, string]>([
  ['completed', 'Transfer sent'],
  ['scheduled', 'Transfer scheduled for Nov 10'],
  ['request_sent', 'Request sent'],
  ['failed', 'Not sent'],
])('renders %s with its required haptic and labelled Done', async (outcome, title) => {
  await render(<ResultView outcome={outcome} title={title} onDone={jest.fn()} />);
  expect(screen.getByRole('header', { name: title })).toBeTruthy();
  const icon = {
    completed: 'Check',
    scheduled: 'Calendar',
    request_sent: 'Send',
    failed: 'AlertCircle',
  }[outcome];
  expect(
    screen.getByTestId(`icon-${icon}`, { includeHiddenElements: true })
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  if (outcome === 'completed' || outcome === 'failed') {
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      outcome === 'completed'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  } else {
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  }
});

it('shares only server rows and masks a hidden amount', async () => {
  const details = resultRows({
    id: '8f043910-1234-4567-8901-123456789012',
    amount: 50000,
    to_account: '1012345678',
    reference: 'Rent',
  });
  await render(
    <ResultView
      outcome="completed"
      title="Transfer sent"
      amountCentavos={50000}
      hideBalance
      details={details}
      shareReceipt
      onDone={jest.fn()}
    />
  );
  expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
  expect(screen.getByText('•• 5678')).toBeTruthy();
  expect(screen.getByLabelText('Amount hidden')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Share receipt' }));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  const text = jest.mocked(FileSystem.writeAsStringAsync).mock.calls[0][1];
  expect(text).toContain('Amount: Hidden');
  expect(text).not.toContain('₱500.00');
  expect(text).toContain('To: •• 5678');
});

it('does not classify transport or step-up errors as a confirmed rejection', () => {
  expect(isConfirmedRejection({ code: 'P0001', message: 'insufficient funds' })).toBe(
    true
  );
  expect(isConfirmedRejection({ code: 'P0001', message: 'STEP_UP_REQUIRED' })).toBe(
    false
  );
  expect(
    isConfirmedRejection({ code: 'FETCH_ERROR', message: 'Network request failed' })
  ).toBe(false);
  expect(isConfirmedRejection('insufficient funds')).toBe(false);
});

it('omits rows absent from the server response', () => {
  expect(resultRows({})).toEqual([]);
  expect(resultRows({ amount: 100 })).toEqual([]);
});
