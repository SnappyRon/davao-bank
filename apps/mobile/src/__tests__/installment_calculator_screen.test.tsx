import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, goBackMock: mockGoBack }),
  useIsFocused: () => true,
  usePreventRemove: () => undefined,
}));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

let mockOffline = false;
jest.mock('../lib/networkStatus', () => ({
  getIsOffline: () => mockOffline,
  installFetchNetworkMonitor: () => jest.fn(),
  probeNetworkConnectivity: jest.fn(),
  subscribeNetworkStatus: () => jest.fn(),
  reportNetworkResult: jest.fn(),
}));

import {
  InstallmentCalculatorScreen,
  SIMULATION_BADGE,
  SIMULATION_NOTICE,
} from '../screens/InstallmentCalculatorScreen';

const getItem = AsyncStorage.getItem as jest.Mock;

describe('Installment calculator (9G, client-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOffline = false;
    getItem.mockReset().mockResolvedValue(null);
  });

  it('shows a skeleton while the saved quote loads', async () => {
    getItem.mockImplementationOnce(() => new Promise(() => undefined));
    const view = await render(<InstallmentCalculatorScreen />);
    expect(screen.getByTestId('installment-skeleton')).toBeTruthy();
    await view.unmount();
  });

  it('shows the empty state and simulation disclosure', async () => {
    const view = await render(<InstallmentCalculatorScreen />);
    expect(await screen.findByText('No quote yet')).toBeTruthy();
    expect(screen.getByText(SIMULATION_BADGE)).toBeTruthy();
    expect(screen.getByText(SIMULATION_NOTICE)).toBeTruthy();
    expect(screen.getByLabelText('Amount in pesos')).toBeTruthy();
    expect(screen.getByRole('button', { name: '3 months' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annual' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save quote on this device' })
    ).toBeTruthy();
    await view.unmount();
  });

  it('computes the quote and schedule on the device and switches rate basis', async () => {
    const view = await render(<InstallmentCalculatorScreen />);
    await screen.findByText('No quote yet');

    await fireEvent.changeText(screen.getByLabelText('Amount in pesos'), '10000');
    expect(await screen.findByText('Payment schedule')).toBeTruthy();
    expect(screen.getAllByText('₱929.16').length).toBeGreaterThan(0);
    expect(screen.getByText('₱1,150.00')).toBeTruthy();
    expect(screen.getByText('₱11,150.00')).toBeTruthy();
    expect(screen.getByText('Month 12 of 12')).toBeTruthy();
    expect(screen.getByTestId('installment-schedule')).toBeTruthy();
    expect(screen.getByText('11.5%')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: '3 months' }));
    expect(await screen.findByText('2.9%')).toBeTruthy();
    expect(screen.getByText('Month 3 of 3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Annual' }));
    expect(screen.getByText('11.6%')).toBeTruthy();
    await view.unmount();
  });

  it('offers Try again for an invalid amount', async () => {
    const view = await render(<InstallmentCalculatorScreen />);
    await screen.findByText('No quote yet');
    await fireEvent.changeText(screen.getByLabelText('Amount in pesos'), '50');
    expect(
      await screen.findByText('Enter an amount from ₱100 to ₱1,000,000.')
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Try again with a different amount' })
    );
    expect(await screen.findByText('No quote yet')).toBeTruthy();
    await view.unmount();
  });

  it('offers Try again when the locally saved quote cannot be read', async () => {
    getItem.mockRejectedValueOnce(new Error('storage unavailable'));
    const view = await render(<InstallmentCalculatorScreen />);
    expect(await screen.findByText("Couldn't load your saved quote")).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No quote yet')).toBeTruthy();
    await view.unmount();
  });

  it('keeps the calculator usable while offline', async () => {
    mockOffline = true;
    const view = await render(<InstallmentCalculatorScreen />);
    expect(
      await screen.findByText("You're offline — showing your last update")
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Amount in pesos'), '1000');
    expect(await screen.findByText('Payment schedule')).toBeTruthy();
    await view.unmount();
  });

  it('saves the quote only on this device', async () => {
    const view = await render(<InstallmentCalculatorScreen />);
    await screen.findByText('No quote yet');
    await fireEvent.changeText(screen.getByLabelText('Amount in pesos'), '10000');
    await screen.findByText('Payment schedule');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save quote on this device' })
    );
    expect(await screen.findByText('Saved on this device.')).toBeTruthy();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@davao-bank/installment-quote',
      expect.stringContaining('10,000')
    );
    await view.unmount();
  });

  it('restores a locally saved quote on the next visit', async () => {
    getItem.mockResolvedValueOnce(
      JSON.stringify({ amountText: '10,000', termMonths: 3 })
    );
    const view = await render(<InstallmentCalculatorScreen />);
    expect(await screen.findByText('Payment schedule')).toBeTruthy();
    expect(screen.getByLabelText('Amount in pesos')).toHaveProp('value', '10,000');
    expect(screen.getByText('Month 3 of 3')).toBeTruthy();
    await view.unmount();
  });
});
