import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';
import { FXRatesScreen } from '../screens/FXRatesScreen';

const mockNavigate = jest.fn();
let mockFocusCallback: (() => void) | null = null;

jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate, setParams: jest.fn() }),
    useRoute: () => ({ params: { mode: 'convert' } }),
    useFocusEffect: (callback: () => void) => {
      mockFocusCallback = callback;
      useEffect(() => callback(), [callback]);
    },
    useIsFocused: () => true,
  };
});

jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('expo-blur', () => ({ BlurView: () => null }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [
                {
                  rate: 58.95,
                  rate_date: '2026-11-20',
                  base: 'USD',
                  quote: 'PHP',
                },
              ],
              error: null,
            }),
        }),
      }),
    }),
  },
}));

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('FXRatesScreen — converter access (§4.1 review fix #2)', () => {
  it('opens the converter when route mode is convert', async () => {
    render(<FXRatesScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('Simulation — reference rate only. No money moves.')
      ).toBeTruthy()
    );
    expect(screen.getByLabelText('Amount (PHP)')).toBeTruthy();
  });

  it('renders a Convert action at the top', () => {
    render(<FXRatesScreen />);
    expect(screen.getByRole('button', { name: 'Open FX converter' })).toBeTruthy();
  });
});
