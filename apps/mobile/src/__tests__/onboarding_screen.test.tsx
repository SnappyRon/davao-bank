import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { OnboardingScreen, ONBOARDING_SEEN_KEY } from '../screens/OnboardingScreen';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithSafeArea(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
  );
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the 3 slides in sequence with Back, Next, and Get started', async () => {
    const onFinishMock = jest.fn();
    await renderWithSafeArea(<OnboardingScreen onFinish={onFinishMock} />);

    // Slide 1
    expect(screen.getByRole('header', { name: 'Bank the Davao way' })).toBeTruthy();
    expect(
      screen.getByText('Send and receive play money safely between Davao Bank accounts.')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip onboarding' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();

    // Advance to Slide 2
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('header', { name: 'Pay bills in a few taps' })).toBeTruthy();
    expect(
      screen.getByText(
        'Manage your electricity, water and internet utilities in one simple place.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();

    // Advance to Slide 3
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('header', {
        name: 'Protected by Face ID and two-step codes',
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Every payment is secured with your device biometrics and authenticator.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Simulated money — for learning only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeTruthy();

    // Go back to Slide 2
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('header', { name: 'Pay bills in a few taps' })).toBeTruthy();

    // Go to Slide 3 and finish
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));

    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY, 'true');
      expect(onFinishMock).toHaveBeenCalledTimes(1);
    });
  });

  it('allows skipping directly to finish from Slide 1', async () => {
    const onFinishMock = jest.fn();
    await renderWithSafeArea(<OnboardingScreen onFinish={onFinishMock} />);

    const skipBtn = screen.getByRole('button', { name: 'Skip onboarding' });
    fireEvent.press(skipBtn);

    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY, 'true');
      expect(onFinishMock).toHaveBeenCalledTimes(1);
    });
  });
});
