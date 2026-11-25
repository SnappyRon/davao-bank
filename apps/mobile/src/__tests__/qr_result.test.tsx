import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QRHubScreen } from '../screens/QRHubScreen';

const mockRpc = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), replace: jest.fn() }),
  useRoute: () => ({ params: { initialTab: 'request' } }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-camera', () => ({ useCameraPermissions: () => [null, jest.fn()] }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../screens/qr/MyQRTab', () => ({ MyQRTab: () => null }));
jest.mock('../screens/qr/ScanQRTab', () => ({ ScanQRTab: () => null }));
jest.mock('../hooks/useFeatureAccounts', () => ({
  useFeatureAccounts: () => ({
    accounts: [{ account_id: 'acc-1' }],
    accountsLoading: false,
    accountError: null,
    loadAccounts: jest.fn(),
  }),
}));
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ hideBalance: false }),
}));
jest.mock('../lib/supabase', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));

it('shows the request result from the server response', async () => {
  mockRpc.mockResolvedValueOnce({
    data: {
      id: '8f043910-1234-4567-8901-123456789012',
      amount: 12345,
      payer_account_number: '1099997943',
    },
    error: null,
  });
  await render(<QRHubScreen />);
  await fireEvent.changeText(screen.getByLabelText('Payer Account Number'), '1099997943');
  await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
  await fireEvent.press(screen.getByRole('button', { name: 'Send Payment Request' }));
  expect(await screen.findByRole('header', { name: 'Request sent' })).toBeTruthy();
  expect(screen.getByText('₱123.45')).toBeTruthy();
  expect(screen.getByText('•• 7943')).toBeTruthy();
  expect(screen.getByText('DB-8F04-3910')).toBeTruthy();
  expect(mockRpc).toHaveBeenCalledWith(
    'create_payment_request',
    expect.objectContaining({ p_amount: 50000, p_payer_account_number: '1099997943' })
  );
});

it('shows Not sent for an explicit database rejection without exposing raw errors', async () => {
  mockRpc.mockResolvedValueOnce({
    data: null,
    error: { code: 'P0001', message: 'account number not found' },
  });
  await render(<QRHubScreen />);
  await fireEvent.changeText(screen.getByLabelText('Payer Account Number'), '1099997943');
  await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '500');
  await fireEvent.press(screen.getByRole('button', { name: 'Send Payment Request' }));
  expect(await screen.findByRole('header', { name: 'Not sent' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  expect(screen.queryByText('account number not found')).toBeNull();
});
