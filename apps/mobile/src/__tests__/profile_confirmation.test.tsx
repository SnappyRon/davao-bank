import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { ProfileScreen } from '../screens/ProfileScreen';
import { supabase } from '../lib/supabase';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: jest.fn().mockResolvedValue({ error: null }) } },
}));
jest.mock('../context/AppLockContext', () => ({
  useAppLock: () => ({
    enabled: false,
    biometricEnabled: false,
    setEnabled: jest.fn(),
    setBiometricEnabled: jest.fn(),
  }),
}));
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    biometricEnabled: false,
    setBiometricEnabled: jest.fn(),
    isBiometricSupported: false,
  }),
}));

it('shows a sign-out sheet, cancels without signing out, and signs out only on confirm', async () => {
  const onSignOut = jest.fn();
  await render(<ProfileScreen profile={null} userEmail={null} onSignOut={onSignOut} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign Out' }));
  let sheet = screen.getByTestId('bottom-sheet-modal');
  expect(within(sheet).getByRole('header', { name: 'Sign out' })).toBeTruthy();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  await fireEvent.press(within(sheet).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByTestId('bottom-sheet-modal')).toBeNull();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign Out' }));
  sheet = screen.getByTestId('bottom-sheet-modal');
  await fireEvent.press(within(sheet).getByRole('button', { name: 'Sign out' }));
  expect(screen.queryByTestId('bottom-sheet-modal')).toBeNull();
  expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  expect(onSignOut).toHaveBeenCalledTimes(1);
});
