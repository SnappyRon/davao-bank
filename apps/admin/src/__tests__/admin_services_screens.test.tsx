import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

interface FakeBackend {
  assurance: { data: { currentLevel: string }; error: unknown };
  online: boolean;
  requests: unknown[];
  appointments: unknown[];
  listError: unknown;
  updateError: unknown;
  rpc: jest.Mock;
}

const backend: FakeBackend = {
  assurance: { data: { currentLevel: 'aal2' }, error: null },
  online: true,
  requests: [],
  appointments: [],
  listError: null,
  updateError: null,
  rpc: jest.fn(),
};

jest.mock('@/lib/supabase-browser', () => ({
  createAdminBrowserClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      backend.rpc(name, args);
      if (
        name === 'admin_update_service_request' ||
        name === 'admin_update_appointment'
      ) {
        return Promise.resolve({ data: { success: true }, error: backend.updateError });
      }
      if (backend.listError) {
        return Promise.resolve({ data: null, error: backend.listError });
      }
      const rows =
        name === 'admin_list_service_requests' ? backend.requests : backend.appointments;
      return Promise.resolve({ data: rows, error: null });
    },
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: () => Promise.resolve(backend.assurance),
      },
    },
  }),
}));

import { ServiceRequestsClient } from '../app/service-requests/ServiceRequestsClient';
import { AppointmentsClient } from '../app/appointments/AppointmentsClient';

const REQUEST_ID = '123e4567-e89b-12d3-a456-426614174000';
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const APPOINTMENT_ID = '11111111-2222-3333-4444-555555555555';

const REQUEST = {
  id: REQUEST_ID,
  user_id: USER_ID,
  type: 'account_update',
  details: { field: 'email', new_value: 'private@davaobank.ph' },
  status: 'submitted',
  staff_note: null,
  reference: REQUEST_ID,
  created_at: '2026-11-26T01:00:00Z',
  updated_at: '2026-11-26T01:00:00Z',
};

const APPOINTMENT = {
  id: APPOINTMENT_ID,
  user_id: USER_ID,
  user_name: 'Juan dela Cruz',
  slot_id: REQUEST_ID,
  branch_name: 'Buhangin',
  branch_area: 'Agdao',
  starts_at: '2026-11-27T16:30:00Z',
  ends_at: '2026-11-27T17:00:00Z',
  status: 'booked',
  staff_note: null,
  created_at: '2026-11-26T01:00:00Z',
};

function reset() {
  backend.assurance = { data: { currentLevel: 'aal2' }, error: null };
  backend.online = true;
  backend.requests = [];
  backend.appointments = [];
  backend.listError = null;
  backend.updateError = null;
  backend.rpc.mockClear();
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
}

describe('Phase 9 admin service screens', () => {
  beforeEach(reset);

  it('lists service requests with masked customer data and sentence-case statuses', async () => {
    backend.requests = [REQUEST];
    render(<ServiceRequestsClient />);

    expect(
      await screen.findByRole('button', { name: /open details for request/i })
    ).toBeVisible();
    expect(screen.getByText('Simulation')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeVisible();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Submitted').length).toBeGreaterThan(0);
    expect(within(table).getByText('Account details update')).toBeVisible();
    expect(screen.queryByText(REQUEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(USER_ID)).not.toBeInTheDocument();
    expect(screen.queryByText('private@davaobank.ph')).not.toBeInTheDocument();
    expect(backend.rpc).toHaveBeenCalledWith('admin_list_service_requests', {
      p_status: null,
    });
  });

  it('opens a detail drawer with whitelisted fields and sends aal2 status update', async () => {
    backend.requests = [REQUEST];
    render(<ServiceRequestsClient />);

    fireEvent.click(
      await screen.findByRole('button', { name: /open details for request/i })
    );
    const dialog = await screen.findByRole('dialog', { name: /request db-/i });
    expect(within(dialog).getByText('Account details update')).toBeVisible();
    expect(within(dialog).getByText('Provided')).toBeVisible();
    expect(within(dialog).queryByText('private@davaobank.ph')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(REQUEST_ID)).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Staff note'), {
      target: { value: 'Reviewed in the demo console' },
    });
    const save = within(dialog).getByRole('button', { name: 'Save status' });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(backend.rpc).toHaveBeenCalledWith('admin_update_service_request', {
        p_id: REQUEST_ID,
        p_status: 'in_review',
        p_note: 'Reviewed in the demo console',
      })
    );
  });

  it('applies status and type filters through the aal2 list rpc', async () => {
    backend.requests = [REQUEST];
    render(<ServiceRequestsClient initialStatus="completed" />);

    await screen.findByRole('button', { name: /open details for request/i });
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('completed');
    expect(backend.rpc).toHaveBeenCalledWith('admin_list_service_requests', {
      p_status: 'completed',
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'statement' },
    });
    expect(await screen.findByText('No requests in this view')).toBeVisible();
  });

  it('shows empty, retry, offline and step-up states for service requests', async () => {
    const first = render(<ServiceRequestsClient />);
    expect(await screen.findByText('No service requests')).toBeVisible();
    first.unmount();

    backend.listError = { message: 'rpc failed' };
    const second = render(<ServiceRequestsClient />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/something went wrong/i)).toBeVisible();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(backend.rpc).toHaveBeenCalledTimes(2);
    second.unmount();

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    backend.listError = null;
    const third = render(<ServiceRequestsClient />);
    expect(await screen.findByText(/offline/i)).toBeVisible();
    third.unmount();

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    backend.assurance = { data: { currentLevel: 'aal1' }, error: null };
    const fourth = render(<ServiceRequestsClient />);
    expect(
      await screen.findByRole('link', { name: 'Go to verification' })
    ).toHaveAttribute('href', '/mfa/verify');
    fourth.unmount();
  });

  it('masks appointment customer names and filters by branch and date', async () => {
    backend.appointments = [APPOINTMENT];
    render(<AppointmentsClient />);

    expect(
      await screen.findByRole('button', { name: /change status for appointment/i })
    ).toBeVisible();
    expect(screen.getByText('Simulation')).toBeVisible();
    expect(screen.getByText('J*** d*** C***')).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Branch' })).toBeVisible();
    expect(screen.getByLabelText('Date')).toBeVisible();
    expect(screen.queryByText('Juan dela Cruz')).not.toBeInTheDocument();
    expect(screen.queryByText(APPOINTMENT_ID)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), {
      target: { value: 'Buhangin' },
    });
    expect(
      screen.getByRole('button', { name: /change status for appointment/i })
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-01' } });
    expect(await screen.findByText('No appointments in this view')).toBeVisible();
  });

  it('updates an appointment status with an optional staff note', async () => {
    backend.appointments = [APPOINTMENT];
    render(<AppointmentsClient />);

    fireEvent.click(
      await screen.findByRole('button', { name: /change status for appointment/i })
    );
    const dialog = await screen.findByRole('dialog', { name: /appointment db-/i });
    expect(within(dialog).getByText('J*** d*** C***')).toBeVisible();
    expect(within(dialog).queryByText('Juan dela Cruz')).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/staff note/i), {
      target: { value: 'Customer arrived late' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save status' }));

    await waitFor(() =>
      expect(backend.rpc).toHaveBeenCalledWith('admin_update_appointment', {
        p_id: APPOINTMENT_ID,
        p_status: 'cancelled',
        p_staff_note: 'Customer arrived late',
      })
    );
  });

  it('shows the appointment empty state', async () => {
    render(<AppointmentsClient />);
    expect(await screen.findByText('No appointments')).toBeVisible();
  });
});
