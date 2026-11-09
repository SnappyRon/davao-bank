import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { fetchUserProfile, type Profile } from '@davao-bank/shared';

const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockPreventRemove = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, dispatch: mockDispatch }),
  useIsFocused: () => true,
  usePreventRemove: (enabled: boolean, cb: (e: unknown) => void) =>
    mockPreventRemove(enabled, cb),
}));

jest.mock('expo-blur', () => ({
  BlurView: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSingle = jest.fn();
const mockSelect = jest.fn(() => ({ single: mockSingle }));
const mockEq = jest.fn((_col?: string, _val?: unknown) => ({ select: mockSelect }));
const mockUpdate = jest.fn((_values?: unknown) => ({ eq: mockEq }));
const mockFrom = jest.fn((_table?: string) => ({ update: mockUpdate }));
const mockGetUser = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => mockFrom(table),
  },
}));

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchUserProfile: jest.fn(),
  };
});

import { PersonalDetailsScreen } from '../screens/PersonalDetailsScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const sampleProfile: Profile = {
  id: 'usr-1',
  full_name: 'Maria Santos',
  phone: '+639171234567',
  role: 'customer',
  status: 'active',
  created_at: '2026-11-01T00:00:00Z',
};

describe('PersonalDetailsScreen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'usr-1', email: 'maria@davaobank.ph' } },
      error: null,
    });
    (fetchUserProfile as jest.Mock).mockResolvedValue({
      data: sampleProfile,
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: sampleProfile,
      error: null,
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('load error shows Try again and recovers on retry', async () => {
    (fetchUserProfile as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });

    await render(<PersonalDetailsScreen />);

    expect(
      await screen.findByText('You appear to be offline. Nothing was sent.')
    ).toBeTruthy();

    const tryAgainBtn = screen.getByRole('button', { name: 'Try again' });
    expect(tryAgainBtn).toBeTruthy();

    (fetchUserProfile as jest.Mock).mockResolvedValueOnce({
      data: sampleProfile,
      error: null,
    });

    fireEvent.press(tryAgainBtn);

    expect(await screen.findByDisplayValue('Maria Santos')).toBeTruthy();
    expect(screen.getByDisplayValue('+639171234567')).toBeTruthy();
  });

  it('empty name shows validation without saving', async () => {
    await render(<PersonalDetailsScreen />);

    const nameInput = await screen.findByDisplayValue('Maria Santos');
    await fireEvent.changeText(nameInput, '   ');

    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    await fireEvent.press(saveBtn);

    expect(await screen.findByText('Full name cannot be empty')).toBeTruthy();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('save success does not trigger the discard prompt and navigates back', async () => {
    await render(<PersonalDetailsScreen />);

    const nameInput = await screen.findByDisplayValue('Maria Santos');
    await fireEvent.changeText(nameInput, 'Maria Santos Reyes');

    mockSingle.mockResolvedValueOnce({
      data: {
        ...sampleProfile,
        full_name: 'Maria Santos Reyes',
      },
      error: null,
    });

    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    await fireEvent.press(saveBtn);

    expect(await screen.findByText('Profile updated successfully')).toBeTruthy();

    // Verify confirmDiscard alert was NOT triggered
    expect(alertSpy).not.toHaveBeenCalled();

    // Timeout advances to navigate back
    await waitFor(
      () => {
        expect(mockGoBack).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 }
    );
  });

  it('save error is mapped through toUserMessage', async () => {
    await render(<PersonalDetailsScreen />);

    const nameInput = await screen.findByDisplayValue('Maria Santos');
    await fireEvent.changeText(nameInput, 'Maria Gomez');

    mockSingle.mockResolvedValueOnce({
      data: null,
      error: 'Network request failed',
    });

    const saveBtn = screen.getByRole('button', { name: 'Save Changes' });
    await fireEvent.press(saveBtn);

    expect(
      await screen.findByText('You appear to be offline. Nothing was sent.')
    ).toBeTruthy();
  });
});
