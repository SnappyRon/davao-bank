import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-blur', () => ({
  BlurView: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

const mockListFactors = jest.fn();
const mockEnroll = jest.fn();
const mockUnenroll = jest.fn();
const mockChallengeAndVerify = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: () => mockListFactors(),
        enroll: (params: unknown) => mockEnroll(params),
        unenroll: (params: unknown) => mockUnenroll(params),
        challengeAndVerify: (params: unknown) => mockChallengeAndVerify(params),
      },
      refreshSession: () => mockRefreshSession(),
    },
  },
}));

import { TwoStepSetupScreen } from '../screens/TwoStepSetupScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('TwoStepSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders initial setup state and proceeds through Step 1 and Step 2', async () => {
    mockListFactors.mockResolvedValueOnce({
      data: { totp: [] },
      error: null,
    });
    mockEnroll.mockResolvedValueOnce({
      data: {
        id: 'factor-123',
        totp: {
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/Davao%20Bank:user?secret=JBSWY3DPEHPK3PXP&issuer=Davao%20Bank',
        },
      },
      error: null,
    });

    await render(<TwoStepSetupScreen />);

    expect(await screen.findByText('Two-step verification')).toBeTruthy();
    const setupBtn = await screen.findByRole('button', { name: 'Set up authenticator' });
    expect(setupBtn).toBeTruthy();

    // Start setup
    fireEvent.press(setupBtn);

    // Step 1
    expect(await screen.findByText('Step 1 of 2: add to your app')).toBeTruthy();
    expect(screen.getByText('Open in authenticator app')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();

    const continueBtn = screen.getByRole('button', { name: 'Continue' });
    expect(continueBtn).toBeTruthy();

    // Move to Step 2
    fireEvent.press(continueBtn);

    expect(await screen.findByText('Step 2 of 2: enter the code')).toBeTruthy();
    expect(screen.getByLabelText('Authenticator code')).toBeTruthy();
  });
});
