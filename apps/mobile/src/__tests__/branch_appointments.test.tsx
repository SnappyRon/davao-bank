import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import {
  bookBranchAppointment,
  cancelBranchAppointment,
  fetchBranches,
  fetchMyAppointments,
  fetchOpenAppointmentSlots,
  formatManilaDateISO,
  type Branch,
  type MyAppointment,
  type OpenAppointmentSlot,
} from '@davao-bank/shared';

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: { branchId?: string } | undefined = undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    replace: mockReplace,
    goBack: mockGoBack,
    setOptions: jest.fn(),
  }),
  useRoute: () => ({ params: mockRouteParams }),
  useIsFocused: () => true,
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockToastShow = jest.fn();
jest.mock('../components/Toast', () => {
  const actual = jest.requireActual('../components/Toast');
  return { ...actual, useToast: () => ({ show: mockToastShow, dismiss: jest.fn() }) };
});

jest.mock('@davao-bank/shared', () => {
  const actual = jest.requireActual('@davao-bank/shared');
  return {
    ...actual,
    fetchBranches: jest.fn(),
    fetchOpenAppointmentSlots: jest.fn(),
    bookBranchAppointment: jest.fn(),
    fetchMyAppointments: jest.fn(),
    cancelBranchAppointment: jest.fn(),
  };
});

import { reportNetworkOnline } from '../lib/networkStatus';
import { BranchAppointmentsScreen } from '../screens/BranchAppointmentsScreen';
import { BookAppointmentScreen } from '../screens/BookAppointmentScreen';

const futureIso = new Date(Date.now() + 24 * 3_600_000).toISOString();
const futureEndIso = new Date(Date.now() + 24 * 3_600_000 + 1_800_000).toISOString();
const pastIso = new Date(Date.now() - 24 * 3_600_000).toISOString();
const pastEndIso = new Date(Date.now() - 24 * 3_600_000 + 1_800_000).toISOString();

const demoBranches: Branch[] = [
  {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Davao Bank – City Main (Demo)',
    area: 'Poblacion, Davao City',
    address: 'CM Recto St, Poblacion, Davao City 8000',
    is_active: true,
  },
  {
    id: '66666666-7777-8888-9999-000000000000',
    name: 'Davao Bank – Matina (Demo)',
    area: 'Matina, Davao City',
    address: 'Matina Town Center, Davao City',
    is_active: true,
  },
];

const demoSlots: OpenAppointmentSlot[] = [
  {
    id: 'aaaa1111-bbbb-cccc-dddd-eeeeffff0001',
    branch_id: demoBranches[0].id,
    starts_at: '2026-12-01T01:00:00.000Z',
    ends_at: '2026-12-01T01:30:00.000Z',
    capacity: 2,
    available: 1,
  },
  {
    id: 'aaaa1111-bbbb-cccc-dddd-eeeeffff0002',
    branch_id: demoBranches[0].id,
    starts_at: '2026-12-01T01:30:00.000Z',
    ends_at: '2026-12-01T02:00:00.000Z',
    capacity: 2,
    available: 2,
  },
];

describe('BranchAppointmentsScreen (Stage 9D)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = undefined;
    reportNetworkOnline();
  });

  it('shows loading skeletons while fetching appointments', async () => {
    let resolveLoad!: (val: { data: MyAppointment[]; error: null }) => void;
    jest.mocked(fetchMyAppointments).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );

    await render(<BranchAppointmentsScreen />);

    expect(screen.getByTestId('appointments-simulation-badge')).toBeTruthy();
    expect(screen.getByTestId('appointments-skeleton-0')).toBeTruthy();

    resolveLoad({ data: [], error: null });
    expect(await screen.findByText('No appointments yet')).toBeTruthy();
  });

  it('renders empty state and navigates to BookAppointment', async () => {
    jest.mocked(fetchMyAppointments).mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await render(<BranchAppointmentsScreen />);

    expect(await screen.findByText('No appointments yet')).toBeTruthy();
    expect(
      screen.getByText(
        'Simulation — demo branches and slots. No real appointment is booked.'
      )
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Book appointment' }));
    expect(mockNavigate).toHaveBeenCalledWith('BookAppointment');
  });

  it('handles offline / load error with Try again recovery', async () => {
    jest
      .mocked(fetchMyAppointments)
      .mockResolvedValueOnce({ data: null, error: 'Failed to fetch' })
      .mockResolvedValueOnce({ data: [], error: null });

    await render(<BranchAppointmentsScreen />);

    expect(await screen.findByText('Appointments unavailable')).toBeTruthy();
    expect(screen.getByText('You appear to be offline.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No appointments yet')).toBeTruthy();
    expect(fetchMyAppointments).toHaveBeenCalledTimes(2);
  });

  it('displays statuses, formatted references, and cancels only future booked appointments', async () => {
    const futureAppt: MyAppointment = {
      id: '8f043910-1a2b-4c3d-8e9f-0123456789ab',
      slot_id: 'slot-future',
      starts_at: futureIso,
      ends_at: futureEndIso,
      branch_name: 'Davao Bank – City Main (Demo)',
      branch_area: 'Poblacion, Davao City',
      status: 'booked',
      staff_note: null,
      created_at: new Date().toISOString(),
    };
    const pastBookedAppt: MyAppointment = {
      id: '7a112233-1a2b-4c3d-8e9f-0123456789ab',
      slot_id: 'slot-past',
      starts_at: pastIso,
      ends_at: pastEndIso,
      branch_name: 'Davao Bank – Buhangin (Demo)',
      branch_area: 'Buhangin, Davao City',
      status: 'booked',
      staff_note: null,
      created_at: pastIso,
    };
    const completedAppt: MyAppointment = {
      id: '9b445566-1a2b-4c3d-8e9f-0123456789ab',
      slot_id: 'slot-done',
      starts_at: pastIso,
      ends_at: pastEndIso,
      branch_name: 'Davao Bank – Matina (Demo)',
      branch_area: 'Matina, Davao City',
      status: 'completed',
      staff_note: 'Served at counter 2',
      created_at: pastIso,
    };

    jest
      .mocked(fetchMyAppointments)
      .mockResolvedValueOnce({
        data: [futureAppt, pastBookedAppt, completedAppt],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ ...futureAppt, status: 'cancelled' }, pastBookedAppt, completedAppt],
        error: null,
      });

    jest.mocked(cancelBranchAppointment).mockResolvedValueOnce({
      data: { success: true, id: futureAppt.id, status: 'cancelled' },
      error: null,
    });

    await render(<BranchAppointmentsScreen />);

    expect(await screen.findByText('Davao Bank – City Main (Demo)')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Staff note · Served at counter 2')).toBeTruthy();

    // Formatted reference shown; raw UUID never shown.
    expect(screen.getByText('Queue reference · DB-8F04-3910')).toBeTruthy();
    expect(screen.queryByText(futureAppt.id)).toBeNull();

    // Only the future booked appointment gets a Cancel button (1 total, not 3).
    const cancelButtons = screen.getAllByRole('button', {
      name: /Cancel appointment at/i,
    });
    expect(cancelButtons).toHaveLength(1);

    await fireEvent.press(cancelButtons[0]);

    // Confirm sheet opens
    expect(await screen.findByText('Cancel appointment?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel appointment' }));

    await waitFor(() =>
      expect(cancelBranchAppointment).toHaveBeenCalledWith(
        expect.anything(),
        futureAppt.id
      )
    );
    expect(mockToastShow).toHaveBeenCalledWith('Appointment cancelled');
    expect(await screen.findByText('Cancelled')).toBeTruthy();
  });
});

describe('BookAppointmentScreen (Stage 9D)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = undefined;
    reportNetworkOnline();
    jest.mocked(fetchBranches).mockResolvedValue({ data: demoBranches, error: null });
    jest
      .mocked(fetchOpenAppointmentSlots)
      .mockResolvedValue({ data: demoSlots, error: null });
  });

  it('completes branch → date → open slot → purpose → review → book → ResultView', async () => {
    jest.mocked(bookBranchAppointment).mockResolvedValueOnce({
      data: {
        id: 'abcd1234-5678-90ab-cdef-111122223333',
        status: 'booked',
        slot_id: demoSlots[0].id,
        branch_id: demoBranches[0].id,
        idempotency_key: 'appt_key_1',
        idempotent_replay: false,
      },
      error: null,
    });

    await render(<BookAppointmentScreen />);

    expect(screen.getByTestId('book-appointment-simulation-badge')).toBeTruthy();

    // Step 1: Branch
    const branchBtn = await screen.findByRole('button', {
      name: /Davao Bank – City Main \(Demo\)/i,
    });
    await fireEvent.press(branchBtn);

    // Step 2: Date
    expect(await screen.findByText('Pick a banking date')).toBeTruthy();
    const todayManila = formatManilaDateISO();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(fetchOpenAppointmentSlots).toHaveBeenCalledWith(
      expect.anything(),
      demoBranches[0].id,
      todayManila
    );

    // Step 3: Open slot
    const firstSlotBtn = await screen.findByRole('button', {
      name: /9:00 AM – 9:30 AM, 1 spot open/i,
    });
    await fireEvent.press(firstSlotBtn);

    // Step 4: Purpose
    expect(await screen.findByText('Choose visit purpose')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Document pickup/i }));

    // Step 5: Review
    expect(await screen.findByText('Your appointment')).toBeTruthy();
    expect(screen.getByText('Document pickup')).toBeTruthy();
    expect(screen.getByText('Davao Bank – City Main (Demo)')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Book appointment' }));

    await waitFor(() =>
      expect(bookBranchAppointment).toHaveBeenCalledWith(expect.anything(), {
        branchId: demoBranches[0].id,
        slotId: demoSlots[0].id,
        idempotencyKey: expect.stringMatching(/^appt_/),
      })
    );

    // ResultView
    expect(await screen.findByText('Appointment booked')).toBeTruthy();
    expect(screen.getByText('DB-ABCD-1234')).toBeTruthy();
    expect(screen.queryByText('abcd1234-5678-90ab-cdef-111122223333')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'View my appointments' }));
    expect(mockReplace).toHaveBeenCalledWith('BranchAppointments');
  });

  it('handles "slot just taken" gracefully by returning to open slots, refreshing, and booking with a new key', async () => {
    let firstAttemptKey = '';

    jest
      .mocked(fetchOpenAppointmentSlots)
      .mockResolvedValueOnce({ data: demoSlots, error: null })
      .mockResolvedValueOnce({ data: [demoSlots[1]], error: null });

    jest
      .mocked(bookBranchAppointment)
      .mockImplementationOnce(async (_client, params) => {
        firstAttemptKey = params.idempotencyKey;
        return { data: null, error: 'Slot is fully booked' };
      })
      .mockImplementationOnce(async (_client, params) => {
        expect(params.idempotencyKey).not.toBe(firstAttemptKey);
        return {
          data: {
            id: 'eeee9999-0000-1111-2222-333344445555',
            status: 'booked',
            slot_id: demoSlots[1].id,
            branch_id: demoBranches[0].id,
            idempotency_key: params.idempotencyKey,
            idempotent_replay: false,
          },
          error: null,
        };
      });

    await render(<BookAppointmentScreen />);

    // Branch -> Date -> Slot 1 -> Purpose -> Review
    await fireEvent.press(
      await screen.findByRole('button', {
        name: /Davao Bank – City Main \(Demo\)/i,
      })
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: /9:00 AM – 9:30 AM, 1 spot open/i,
      })
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: /Account inquiry/i })
    );

    // Attempt to book slot 1 -> taken by another customer
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Book appointment' })
    );

    // Gracefully returned to Open slot step with alert + refreshed slots
    expect(
      await screen.findByText('That time slot was just taken. Choose another open slot.')
    ).toBeTruthy();
    expect(fetchOpenAppointmentSlots).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: /9:00 AM – 9:30 AM/i })).toBeNull();

    // Pick remaining open slot 2 -> Purpose -> Review -> Book succeeds
    await fireEvent.press(
      await screen.findByRole('button', {
        name: /9:30 AM – 10:00 AM, 2 spots open/i,
      })
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: /Account inquiry/i })
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Book appointment' })
    );

    expect(await screen.findByText('Appointment booked')).toBeTruthy();
    expect(screen.getByText('DB-EEEE-9999')).toBeTruthy();
  });

  it('preserves the same idempotency key when retrying after a network error on Review', async () => {
    const keys: string[] = [];
    jest
      .mocked(bookBranchAppointment)
      .mockImplementationOnce(async (_client, params) => {
        keys.push(params.idempotencyKey);
        return { data: null, error: 'Network request failed' };
      })
      .mockImplementationOnce(async (_client, params) => {
        keys.push(params.idempotencyKey);
        return {
          data: {
            id: '1234abcd-0000-1111-2222-333344445555',
            status: 'booked',
            slot_id: demoSlots[0].id,
            idempotent_replay: true,
          },
          error: null,
        };
      });

    await render(<BookAppointmentScreen />);

    await fireEvent.press(
      await screen.findByRole('button', {
        name: /Davao Bank – City Main \(Demo\)/i,
      })
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));
    await fireEvent.press(
      await screen.findByRole('button', {
        name: /9:00 AM – 9:30 AM, 1 spot open/i,
      })
    );
    await fireEvent.press(
      await screen.findByRole('button', { name: /General banking/i })
    );

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Book appointment' })
    );

    expect(
      await screen.findByText(
        'You appear to be offline. Check your connection and try again.'
      )
    ).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Book appointment' }));

    expect(await screen.findByText('Appointment booked')).toBeTruthy();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('renders empty open slots state and allows choosing another date', async () => {
    jest
      .mocked(fetchOpenAppointmentSlots)
      .mockResolvedValueOnce({ data: [], error: null });

    await render(<BookAppointmentScreen />);

    await fireEvent.press(
      await screen.findByRole('button', {
        name: /Davao Bank – City Main \(Demo\)/i,
      })
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('No open slots')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose another date' }));
    expect(await screen.findByText('Pick a banking date')).toBeTruthy();
  });
});
