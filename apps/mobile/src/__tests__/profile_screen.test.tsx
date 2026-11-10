import React from 'react';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    // Run the focus callback once on mount, like a first focus.
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockListFactors = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: jest.fn().mockResolvedValue({ error: null }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      mfa: { listFactors: () => mockListFactors() },
    },
  },
}));

const mockSetAppLock = jest.fn();
jest.mock('../context/AppLockContext', () => ({
  useAppLock: () => ({ enabled: false, setEnabled: mockSetAppLock }),
}));

const mockToggleHideBalance = jest.fn();
const mockSetBiometric = jest.fn();
let mockHideBalance = false;
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    biometricEnabled: true,
    setBiometricEnabled: mockSetBiometric,
    isBiometricSupported: true,
    biometricType: 'Face ID',
    hideBalance: mockHideBalance,
    toggleHideBalance: mockToggleHideBalance,
  }),
}));

const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => ({
  ...jest.requireActual('../components/Toast'),
  useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }),
}));

import { ProfileScreen, APP_VERSION_CAPTION } from '../screens/ProfileScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const verifiedFactors = {
  data: { totp: [{ id: 'f-1', status: 'verified' }] },
  error: null,
};
const noFactors = { data: { totp: [] }, error: null };

describe('ProfileScreen (7B.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHideBalance = false;
    mockListFactors.mockResolvedValue(verifiedFactors);
  });

  it('renders the Money, Security and Settings groups with their rows', async () => {
    await render(<ProfileScreen profile={null} userEmail="customer@example.test" />);
    for (const title of ['Profile', 'Money', 'Security', 'Settings']) {
      expect(screen.getByRole('header', { name: title })).toBeTruthy();
    }
    for (const row of [
      'Saved recipients',
      'Scheduled payments',
      'Payment requests',
      'Statements',
      'Change password',
      'Personal details',
      'About',
    ]) {
      expect(screen.getByRole('button', { name: row })).toBeTruthy();
    }
    expect(screen.getByRole('switch', { name: 'App lock' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Confirm with Face ID' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Hide balances' })).toBeTruthy();
    expect(screen.getByText('Lock after 2 minutes in the background')).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Two-step verification, On' })
      ).toBeTruthy()
    );
  });

  it('shows Two-step verification Off when no verified factor exists', async () => {
    mockListFactors.mockResolvedValue(noFactors);
    await render(<ProfileScreen profile={null} userEmail={null} />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Two-step verification, Off' })
      ).toBeTruthy()
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Two-step verification, Off' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('TwoStepSetup');
  });

  it('has no floating two-step button and shows the footer version caption', async () => {
    await render(<ProfileScreen profile={null} userEmail={null} />);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Two-step verification, On' })
      ).toBeTruthy()
    );
    expect(screen.queryByRole('button', { name: 'Two-step verification' })).toBeNull();
    expect(screen.getByText(APP_VERSION_CAPTION)).toBeTruthy();
    expect(APP_VERSION_CAPTION).toBe('Version 1.0.0 · Simulated prototype');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('Statements opens Export statement and Change password opens its page', async () => {
    await render(<ProfileScreen profile={null} userEmail={null} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Statements' }));
    expect(mockNavigate).toHaveBeenCalledWith('ExportStatement');
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(mockNavigate).toHaveBeenCalledWith('ChangePassword');
  });

  it('Hide balances switch toggles the existing setting', async () => {
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const toggle = screen.getByRole('switch', { name: 'Hide balances' });
    expect(toggle.props.value).toBe(false);
    await fireEvent(toggle, 'valueChange', true);
    expect(mockToggleHideBalance).toHaveBeenCalledTimes(1);
  });

  it('App lock switch moves immediately and reverts with a toast when saving fails', async () => {
    let rejectSave: (err: Error) => void = () => {};
    mockSetAppLock.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        })
    );
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const lock = () => screen.getByRole('switch', { name: 'App lock' });
    expect(lock().props.value).toBe(false);

    await fireEvent(lock(), 'valueChange', true);
    expect(mockSetAppLock).toHaveBeenCalledWith(true);
    expect(lock().props.value).toBe(true); // optimistic

    await act(async () => {
      rejectSave(new Error('storage unavailable'));
    });
    await waitFor(() => expect(lock().props.value).toBe(false));
    expect(mockToastShow).toHaveBeenCalledWith(
      "Couldn't save the app lock setting. Try again.",
      'error'
    );
  });
});
