import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
  within,
} from '@testing-library/react-native';

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
const mockSignOut = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: () => mockSignOut(),
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      mfa: { listFactors: () => mockListFactors() },
    },
  },
}));

const mockSetAppLock = jest.fn();
let mockAppLockEnabled = false;
jest.mock('../context/AppLockContext', () => ({
  useAppLock: () => ({ enabled: mockAppLockEnabled, setEnabled: mockSetAppLock }),
}));

const mockToggleHideBalance = jest.fn();
const mockSetBiometric = jest.fn();
let mockHideBalance = false;
let mockBiometricSupported = true;
jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    biometricEnabled: true,
    setBiometricEnabled: mockSetBiometric,
    isBiometricSupported: mockBiometricSupported,
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

import {
  ProfileScreen,
  APP_VERSION_CAPTION,
  APP_LOCK_SAVE_ERROR,
  BIOMETRIC_VERIFY_ERROR,
  BIOMETRIC_UNSUPPORTED,
  SIGN_OUT_ERROR,
  biometricSaveError,
} from '../screens/ProfileScreen';

const isChecked = (el: { props: { accessibilityState?: { checked?: unknown } } }) =>
  el.props.accessibilityState?.checked;

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    mockAppLockEnabled = false;
    mockBiometricSupported = true;
    mockSignOut.mockResolvedValue({ error: null });
    mockSetBiometric.mockResolvedValue(true);
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

  it('Statements opens Export statement, Bantay opens BantaySecurity and Change password opens its page', async () => {
    await render(<ProfileScreen profile={null} userEmail={null} />);
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Bantay security center, Daily transfer limit & protections',
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('BantaySecurity');
    await fireEvent.press(screen.getByRole('button', { name: 'Statements' }));
    expect(mockNavigate).toHaveBeenCalledWith('ExportStatement');
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }));
    expect(mockNavigate).toHaveBeenCalledWith('ChangePassword');
  });

  it('each switch row is one accessible switch element (native Switch hidden)', async () => {
    await render(<ProfileScreen profile={null} userEmail={null} />);
    expect(screen.getAllByRole('switch', { name: 'App lock' })).toHaveLength(1);
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    const lock = screen.getByRole('switch', { name: 'App lock' });
    expect(lock.props.accessibilityHint).toBe('Lock after 2 minutes in the background');
  });

  it('Hide balances switch toggles the existing setting', async () => {
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const toggle = screen.getByRole('switch', { name: 'Hide balances' });
    expect(isChecked(toggle)).toBe(false);
    await fireEvent.press(toggle);
    expect(mockToggleHideBalance).toHaveBeenCalledTimes(1);
  });

  it('App lock switch saves and stays on when saving succeeds', async () => {
    mockSetAppLock.mockResolvedValue(undefined);
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const lock = () => screen.getByRole('switch', { name: 'App lock' });
    await fireEvent.press(lock());
    expect(mockSetAppLock).toHaveBeenCalledWith(true);
    await waitFor(() => expect(isChecked(lock())).toBe(true));
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('App lock switch moves immediately and reverts with a toast when saving fails', async () => {
    const save = deferred();
    mockSetAppLock.mockReturnValue(save.promise);
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const lock = () => screen.getByRole('switch', { name: 'App lock' });
    expect(isChecked(lock())).toBe(false);

    await fireEvent.press(lock());
    expect(mockSetAppLock).toHaveBeenCalledWith(true);
    expect(isChecked(lock())).toBe(true); // optimistic

    await act(async () => {
      save.reject(new Error('storage unavailable'));
    });
    await waitFor(() => expect(isChecked(lock())).toBe(false));
    expect(mockToastShow).toHaveBeenCalledWith(APP_LOCK_SAVE_ERROR, 'error');
  });

  it('rapid App lock toggles: only the latest failed save reverts, to the stored value', async () => {
    mockAppLockEnabled = true;
    const first = deferred();
    const second = deferred();
    mockSetAppLock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const lock = () => screen.getByRole('switch', { name: 'App lock' });
    expect(isChecked(lock())).toBe(true);

    await fireEvent.press(lock()); // -> false (save 1)
    await fireEvent.press(lock()); // -> true (save 2)
    expect(mockSetAppLock.mock.calls).toEqual([[false], [true]]);

    await act(async () => {
      first.reject(new Error('older save failed'));
    });
    expect(isChecked(lock())).toBe(true); // older failure ignored
    expect(mockToastShow).not.toHaveBeenCalled();

    await act(async () => {
      second.reject(new Error('latest save failed'));
    });
    // Reverts to the stored value (true), not to !value (false).
    await waitFor(() => expect(mockToastShow).toHaveBeenCalledTimes(1));
    expect(isChecked(lock())).toBe(true);
  });

  it('biometric switch: success, verification refused, and a thrown save error', async () => {
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const bio = () => screen.getByRole('switch', { name: 'Confirm with Face ID' });
    expect(isChecked(bio())).toBe(true);

    await fireEvent.press(bio());
    await waitFor(() => expect(mockSetBiometric).toHaveBeenCalledWith(false));
    expect(mockToastShow).not.toHaveBeenCalled();

    mockSetBiometric.mockResolvedValueOnce(false);
    await fireEvent.press(bio());
    await waitFor(() =>
      expect(mockToastShow).toHaveBeenCalledWith(BIOMETRIC_VERIFY_ERROR, 'error')
    );

    mockSetBiometric.mockRejectedValueOnce(new Error('storage unavailable'));
    await fireEvent.press(bio());
    await waitFor(() =>
      expect(mockToastShow).toHaveBeenCalledWith(biometricSaveError('Face ID'), 'error')
    );
  });

  it('biometric switch is disabled with setup copy when the phone has no biometrics', async () => {
    mockBiometricSupported = false;
    await render(<ProfileScreen profile={null} userEmail={null} />);
    const bio = screen.getByRole('switch', { name: 'Confirm with Face ID' });
    expect(bio.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText(BIOMETRIC_UNSUPPORTED)).toBeTruthy();
    expect(BIOMETRIC_UNSUPPORTED).toBe(
      "Set up Face ID or fingerprint in your phone's settings first."
    );
    await fireEvent.press(bio);
    expect(mockSetBiometric).not.toHaveBeenCalled();
  });

  it('shows no Two-step subtitle when the factor list cannot be read', async () => {
    mockListFactors.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await render(<ProfileScreen profile={null} userEmail={null} />);
    await waitFor(() => expect(mockListFactors).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Two-step verification' })).toBeTruthy();
    expect(screen.queryByText('On')).toBeNull();
    expect(screen.queryByText('Off')).toBeNull();
  });

  it('sign-out sheet uses the wording-table message and a failed sign-out shows a toast', async () => {
    mockSignOut.mockRejectedValueOnce(new Error('raw network text'));
    await render(<ProfileScreen profile={null} userEmail={null} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    const sheet = screen.getByTestId('bottom-sheet-modal');
    expect(within(sheet).getByText('Sign out of Davao Bank?')).toBeTruthy();
    await fireEvent.press(within(sheet).getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(mockToastShow).toHaveBeenCalledWith(SIGN_OUT_ERROR, 'error')
    );
    expect(screen.queryByText('raw network text')).toBeNull();
  });
});
