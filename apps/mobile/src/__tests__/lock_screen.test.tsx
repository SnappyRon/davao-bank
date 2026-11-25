import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  supportedAuthenticationTypesAsync: jest.fn().mockResolvedValue([1]), // 1 = FACIAL_RECOGNITION
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  AuthenticationType: {
    FINGERPRINT: 2,
    FACIAL_RECOGNITION: 1,
    IRIS: 3,
  },
}));

const mockSignOut = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { email: 'user@davaobank.ph' } },
        error: null,
      }),
      signInWithPassword: jest.fn().mockResolvedValue({ error: null }),
      signOut: () => mockSignOut(),
    },
  },
}));

import { LockScreen } from '../screens/LockScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('LockScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders logo, title, and biometrics-first mode without showing password field', async () => {
    const onUnlock = jest.fn();
    await render(<LockScreen onUnlock={onUnlock} />);

    expect(screen.getByText('Davao Bank is locked')).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Unlock with Face ID' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use password' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();

    // Password field should not be visible initially
    expect(screen.queryByLabelText('Account password')).toBeNull();
  });

  it('reveals password field and "Unlock with password" button when "Use password" is tapped', async () => {
    const onUnlock = jest.fn();
    await render(<LockScreen onUnlock={onUnlock} />);

    const usePasswordBtn = screen.getByRole('button', { name: 'Use password' });
    fireEvent.press(usePasswordBtn);

    expect(await screen.findByLabelText('Account password')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock with password' })).toBeTruthy();
  });

  it('calls signOut when "Sign out" is pressed', async () => {
    const onUnlock = jest.fn();
    await render(<LockScreen onUnlock={onUnlock} />);

    const signOutBtn = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.press(signOutBtn);

    expect(mockSignOut).toHaveBeenCalled();
  });
});
