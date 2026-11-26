import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import type { AccountBalance, ServiceRequest } from '@davao-bank/shared';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: { initialType?: string } | undefined = undefined;

jest.mock('@react-navigation/native', () => {
  const ReactActual = jest.requireActual('react');
  return {
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      setOptions: jest.fn(),
    }),
    useRoute: () => ({ params: mockRouteParams }),
    useIsFocused: () => true,
    useFocusEffect: (cb: () => void) => {
      ReactActual.useEffect(() => {
        cb();
      }, [cb]);
    },
    usePreventRemove: jest.fn(),
  };
});

jest.mock('expo-blur', () => ({
  BlurView: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
    from: (table: string) => mockFrom(table),
  },
}));

jest.mock('../context/SettingsContext', () => ({
  useSettings: () => ({
    hideBalance: false,
    confirmBiometricPayment: jest.fn(),
  }),
}));

import { ServiceRequestsScreen } from '../screens/ServiceRequestsScreen';
import { NewServiceRequestScreen } from '../screens/NewServiceRequestScreen';

declare const global: { IS_REACT_ACT_ENVIRONMENT?: boolean };
global.IS_REACT_ACT_ENVIRONMENT = true;

const sampleAccounts: AccountBalance[] = [
  {
    account_id: 'acc-1111-2222-3333-444444444444',
    user_id: 'usr-1',
    account_number: '1000008921',
    type: 'savings',
    currency: 'PHP',
    status: 'active',
    balance: 150000,
    ledger_entry_count: 5,
    last_activity_at: null,
  },
  {
    account_id: 'acc-5555-6666-7777-888888888888',
    user_id: 'usr-1',
    account_number: '1000004455',
    type: 'checking',
    currency: 'PHP',
    status: 'active',
    balance: 250000,
    ledger_entry_count: 2,
    last_activity_at: null,
  },
];

const sampleRequests: ServiceRequest[] = [
  {
    id: '8f043910-1111-2222-3333-444444444444',
    type: 'statement',
    details: {
      account_id: 'acc-1111-2222-3333-444444444444',
      start_date: '2026-11-01',
      end_date: '2026-11-26',
    },
    status: 'submitted',
    staff_note: null,
    reference: 'DB-A1B2-C3D4',
    created_at: '2026-11-26T01:00:00Z',
    updated_at: '2026-11-26T01:00:00Z',
  },
  {
    id: '9a154021-1111-2222-3333-444444444444',
    type: 'remit_status',
    details: { reference: 'DB-7788-9900' },
    status: 'in_review',
    staff_note: 'Checking sample remittance batch.',
    reference: 'DB-E5F6-G7H8',
    created_at: '2026-11-25T01:00:00Z',
    updated_at: '2026-11-26T02:00:00Z',
  },
  {
    id: 'ab265132-1111-2222-3333-444444444444',
    type: 'certificate',
    details: { purpose: 'Visa application' },
    status: 'completed',
    staff_note: null,
    reference: '',
    created_at: '2026-11-20T01:00:00Z',
    updated_at: '2026-11-21T01:00:00Z',
  },
];

function mockAccountBalancesSelect(data: AccountBalance[] | null, error: unknown = null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'account_balances') {
      return {
        select: () => Promise.resolve({ data, error }),
      };
    }
    return { select: () => Promise.resolve({ data: [], error: null }) };
  });
}

describe('ServiceRequestsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = undefined;
    mockAccountBalancesSelect(sampleAccounts);
  });

  it('renders status badges, formatted references, masked accounts and remittance timeline', async () => {
    mockRpc.mockResolvedValueOnce({
      data: sampleRequests,
      error: null,
    });

    await render(<ServiceRequestsScreen />);

    expect(screen.getByText('Statement copy')).toBeTruthy();
    expect(screen.getByText('Remittance status inquiry')).toBeTruthy();
    expect(screen.getByText('Bank certificate')).toBeTruthy();

    // Status badges
    expect(screen.getByText('Submitted')).toBeTruthy();
    expect(screen.getByText('In review')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();

    // References via formatReferenceId (no double DB- prefix, fallback UUID formatted)
    expect(screen.getByText(/DB-A1B2-C3D4/)).toBeTruthy();
    expect(screen.queryByText(/DB-8F04-3910/)).toBeNull();
    expect(screen.getByText(/DB-AB26-5132/)).toBeTruthy();

    // Masked account label instead of raw account_id UUID
    expect(screen.getByText(/Savings •• 8921/)).toBeTruthy();
    expect(screen.queryByText(/acc-1111-2222/)).toBeNull();

    // Remittance timeline & staff note
    expect(screen.getByText('Received')).toBeTruthy();
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.getByText('Ready for credit')).toBeTruthy();
    expect(screen.getByText('Note: Checking sample remittance batch.')).toBeTruthy();

    // Only the submitted request gets a Cancel request button
    const cancelButtons = screen.getAllByRole('button', { name: /Cancel .* DB-/ });
    expect(cancelButtons).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Cancel Statement copy DB-A1B2-C3D4' })
    ).toBeTruthy();
  });

  it('cancels a submitted request after confirmation and reloads the list', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: [sampleRequests[0]],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { success: true, id: sampleRequests[0].id, status: 'cancelled' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ ...sampleRequests[0], status: 'cancelled' }],
        error: null,
      });

    await render(<ServiceRequestsScreen />);

    const cancelBtn = await screen.findByRole('button', {
      name: 'Cancel Statement copy DB-A1B2-C3D4',
    });
    await fireEvent.press(cancelBtn);

    expect(await screen.findByText('Cancel service request?')).toBeTruthy();
    const confirmCancelBtn = screen.getByRole('button', { name: 'Cancel request' });
    await fireEvent.press(confirmCancelBtn);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('cancel_service_request', {
        p_id: sampleRequests[0].id,
      });
    });

    expect(await screen.findByText('Cancelled')).toBeTruthy();
  });

  it('shows empty state and navigates to NewServiceRequest on pressing New request', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await render(<ServiceRequestsScreen />);

    expect(await screen.findByText('No service requests yet')).toBeTruthy();
    const newBtn = screen.getByRole('button', { name: 'New request' });
    await fireEvent.press(newBtn);
    expect(mockNavigate).toHaveBeenCalledWith('NewServiceRequest');
  });

  it('shows offline load error and retries when Try again is pressed', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Network request failed' },
      })
      .mockResolvedValueOnce({
        data: [sampleRequests[2]],
        error: null,
      });

    await render(<ServiceRequestsScreen />);

    expect(await screen.findByText('Service requests unavailable')).toBeTruthy();
    expect(screen.getByText('You appear to be offline.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Bank certificate')).toBeTruthy();
  });
});

describe('NewServiceRequestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = undefined;
    mockAccountBalancesSelect(sampleAccounts);
  });

  it('opens type picker Sheet, submits a bank certificate request through Review → ResultView', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        id: '12345678-aaaa-bbbb-cccc-dddddddddddd',
        type: 'certificate',
        status: 'submitted',
        reference: 'DB-9988-7766',
        created_at: '2026-11-26T03:00:00Z',
      },
      error: null,
    });

    await render(<NewServiceRequestScreen />);

    expect(screen.getByText('Step 1 of 2')).toBeTruthy();

    // Open type picker sheet
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Request type: Statement copy. Change request type',
      })
    );
    expect(await screen.findByText('Choose request type')).toBeTruthy();

    // Choose Bank certificate and wait for the sheet to close
    await fireEvent.press(screen.getByRole('button', { name: 'Bank certificate' }));
    await waitFor(() => {
      expect(screen.queryByText('Choose request type')).toBeNull();
    });

    // Select a purpose chip
    await fireEvent.press(screen.getByRole('button', { name: 'Visa application' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Purpose').props.value).toBe('Visa application');
    });

    // Proceed to Review (Step 2 of 2)
    await fireEvent.press(screen.getByRole('button', { name: 'Review request' }));

    expect(await screen.findByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByText("You're requesting")).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();

    // Submit
    await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('create_service_request', {
        p_type: 'certificate',
        p_details: { purpose: 'Visa application' },
      });
    });

    // ResultView shown with formatted reference
    expect(screen.getAllByText('Request submitted').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('DB-9988-7766')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('submits statement request with selected account and handles account load retry', async () => {
    mockAccountBalancesSelect(null, { message: 'Network request failed' });

    await render(<NewServiceRequestScreen />);

    expect(await screen.findByText('You appear to be offline.')).toBeTruthy();

    mockAccountBalancesSelect(sampleAccounts);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    const accountSelector = await screen.findByRole('button', {
      name: 'Account: Savings •• 8921. Change account',
    });
    expect(accountSelector).toBeTruthy();

    // Switch account via AccountPickerSheet
    await fireEvent.press(accountSelector);
    await fireEvent.press(
      await screen.findByRole('button', { name: /Checking •• 4455/ })
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('Checking •• 4455')).toBeTruthy();
  });

  it('supports remit_status initialType, validates reference and stays on Review on submit error', async () => {
    mockRouteParams = { initialType: 'remit_status' };
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Daily service request limit reached (maximum 10 requests per day)',
      },
    });

    await render(<NewServiceRequestScreen />);

    // Empty reference triggers inline validation
    await fireEvent.press(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('Enter a remittance reference.')).toBeTruthy();

    // Enter lowercase 8-char alphanumeric reference -> normalized to DB-1A2B-3C4D
    await fireEvent.changeText(
      screen.getByLabelText('Remittance reference'),
      'db-1a2b-3c4d'
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Remittance reference').props.value).toBe(
        'db-1a2b-3c4d'
      );
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Review request' }));

    expect(await screen.findByText('DB-1A2B-3C4D')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));

    expect(
      await screen.findByText(
        'Daily request limit reached. You can submit up to 10 requests per day.'
      )
    ).toBeTruthy();
    // Remains on Review step so user does not lose input
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
  });

  it('validates card_replacement (blocks full card number, masks last4) and account_update fields', async () => {
    mockRouteParams = { initialType: 'card_replacement' };
    mockRpc.mockResolvedValueOnce({
      data: {
        id: '55555555-aaaa-bbbb-cccc-dddddddddddd',
        type: 'account_update',
        status: 'submitted',
        reference: 'DB-5566-7788',
        created_at: '2026-11-26T04:00:00Z',
      },
      error: null,
    });

    await render(<NewServiceRequestScreen />);

    // Enter a full 16-digit card number in reason -> blocked
    await fireEvent.changeText(
      await screen.findByLabelText('Reason for replacement'),
      'Card 4532 1234 5678 9012 lost'
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Reason for replacement').props.value).toBe(
        'Card 4532 1234 5678 9012 lost'
      );
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('Do not enter a full card number.')).toBeTruthy();

    // Switch to Account details update via Sheet
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Request type: Card replacement. Change request type',
      })
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Account details update' })
    );
    await waitFor(() => {
      expect(screen.queryByText('Choose request type')).toBeNull();
    });

    // Switch field to Mobile number and submit
    await fireEvent.press(screen.getByRole('button', { name: 'Mobile number' }));
    await fireEvent.changeText(
      await screen.findByLabelText('New mobile number'),
      '+63 917 555 0199'
    );
    await waitFor(() => {
      expect(screen.getByLabelText('New mobile number').props.value).toBe(
        '+63 917 555 0199'
      );
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByText('+63 917 555 0199')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Submit request' }));
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('create_service_request', {
        p_type: 'account_update',
        p_details: { field: 'phone_number', new_value: '+63 917 555 0199' },
      });
    });
    expect(await screen.findByText('DB-5566-7788')).toBeTruthy();
  });
});
