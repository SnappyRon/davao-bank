import React from 'react';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppLockProvider } from '../context/AppLockContext';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(),
}));
jest.mock('expo-local-authentication', () => ({
  isEnrolledAsync: jest.fn(async () => true),
}));
jest.mock('../screens/LockScreen', () => ({
  LockScreen: ({ onUnlock }: { onUnlock: () => void }) => {
    const { Button } = jest.requireActual('react-native');
    return <Button title="Unlock fixture" onPress={onUnlock} />;
  },
}));
it('does not mount balances until a restored session is unlocked', async () => {
  const mounted = jest.fn();
  function Balances() {
    mounted();
    return <Text>Balances</Text>;
  }
  await render(
    <AppLockProvider restoredSession>
      <Balances />
    </AppLockProvider>
  );
  expect(mounted).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Unlock fixture'));
  expect(screen.getByText('Balances')).toBeTruthy();
});
it('locks after more than two minutes but not a shorter background interval', async () => {
  let listener: ((state: AppStateStatus) => void) | undefined;
  const spy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      listener = callback;
      return { remove: jest.fn() };
    });
  const now = jest.spyOn(Date, 'now');
  try {
    await render(
      <AppLockProvider restoredSession={false}>
        <Text>Balances</Text>
      </AppLockProvider>
    );
    now.mockReturnValue(1000);
    await act(async () => listener?.('background'));
    now.mockReturnValue(120000);
    await act(async () => listener?.('active'));
    expect(screen.getByText('Balances')).toBeTruthy();
    now.mockReturnValue(200000);
    await act(async () => listener?.('background'));
    now.mockReturnValue(320001);
    await act(async () => listener?.('active'));
    expect(screen.queryByText('Balances')).toBeNull();
    expect(screen.getByText('Unlock fixture')).toBeTruthy();
  } finally {
    spy.mockRestore();
    now.mockRestore();
  }
});
