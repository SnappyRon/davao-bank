import type { SupabaseClient } from '@supabase/supabase-js';
import {
  appointmentErrorMessage,
  bookBranchAppointment,
  cancelBranchAppointment,
  fetchBranches,
  fetchMyAppointments,
  fetchOpenAppointmentSlots,
  formatManilaAppointmentDate,
  formatManilaDateISO,
  formatManilaSlotWindow,
  getUpcomingManilaDates,
  isFutureAppointment,
  isSlotTakenError,
  validateAppointmentDate,
} from '../supabase/appointments';

function makeClient(rpcImpl: jest.Mock): SupabaseClient {
  return { rpc: rpcImpl } as unknown as SupabaseClient;
}

describe('branch appointments shared helpers and RPC wrappers', () => {
  describe('date and time helpers (Asia/Manila)', () => {
    it('formats UTC timestamps in Asia/Manila date ISO (UTC+8)', () => {
      // 2026-11-26 18:30 UTC -> 2026-11-27 02:30 Asia/Manila
      const utcDate = new Date('2026-11-26T18:30:00.000Z');
      expect(formatManilaDateISO(utcDate)).toBe('2026-11-27');
    });

    it('validates banking dates against Asia/Manila today', () => {
      const now = new Date('2026-11-26T04:00:00.000Z'); // 2026-11-26 in Manila
      expect(validateAppointmentDate('2026-11-26', now)).toEqual({
        valid: true,
        error: null,
      });
      expect(validateAppointmentDate('2026-11-28', now)).toEqual({
        valid: true,
        error: null,
      });
      expect(validateAppointmentDate('2026-11-25', now)).toEqual({
        valid: false,
        error: 'Choose today or a future banking date.',
      });
      expect(validateAppointmentDate('26-11-2026', now)).toEqual({
        valid: false,
        error: 'Enter a valid date in YYYY-MM-DD format.',
      });
      expect(validateAppointmentDate('2026-02-30', now)).toEqual({
        valid: false,
        error: 'Enter a valid calendar date.',
      });
    });

    it('returns upcoming Manila dates with Today and Tomorrow labels', () => {
      const now = new Date('2026-11-26T04:00:00.000Z');
      const dates = getUpcomingManilaDates(3, now);
      expect(dates).toEqual([
        { isoDate: '2026-11-26', label: 'Today · Nov 26' },
        { isoDate: '2026-11-27', label: 'Tomorrow · Nov 27' },
        { isoDate: '2026-11-28', label: 'Nov 28' },
      ]);
    });

    it('formats Manila appointment dates and 30-minute slot windows', () => {
      expect(formatManilaAppointmentDate('2026-11-26')).toBe('Nov 26, 2026');
      // 01:00 UTC = 09:00 Asia/Manila
      expect(
        formatManilaSlotWindow('2026-11-26T01:00:00.000Z', '2026-11-26T01:30:00.000Z')
      ).toBe('9:00 AM – 9:30 AM');
    });

    it('identifies only future booked appointments as cancellable', () => {
      const nowMs = Date.parse('2026-11-26T02:00:00.000Z');
      expect(
        isFutureAppointment(
          { status: 'booked', starts_at: '2026-11-26T03:00:00.000Z' },
          nowMs
        )
      ).toBe(true);
      expect(
        isFutureAppointment(
          { status: 'booked', starts_at: '2026-11-26T01:00:00.000Z' },
          nowMs
        )
      ).toBe(false);
      expect(
        isFutureAppointment(
          { status: 'cancelled', starts_at: '2026-11-26T05:00:00.000Z' },
          nowMs
        )
      ).toBe(false);
      expect(
        isFutureAppointment(
          { status: 'completed', starts_at: '2026-11-26T05:00:00.000Z' },
          nowMs
        )
      ).toBe(false);
    });
  });

  describe('error classification and user messages', () => {
    it('detects slot-taken errors from server responses', () => {
      expect(isSlotTakenError('Slot is fully booked')).toBe(true);
      expect(isSlotTakenError(new Error('Slot just taken'))).toBe(true);
      expect(isSlotTakenError({ message: 'Slot is in the past' })).toBe(true);
      expect(isSlotTakenError('Failed to fetch')).toBe(false);
    });

    it('maps domain and network errors without money-transfer copy', () => {
      expect(appointmentErrorMessage('Slot is fully booked')).toBe(
        'That time slot was just taken. Choose another open slot.'
      );
      expect(
        appointmentErrorMessage(
          'You already have the maximum number of upcoming appointments'
        )
      ).toBe(
        'You already have 5 upcoming appointments. Cancel one before booking another.'
      );
      expect(appointmentErrorMessage('Failed to fetch', 'load')).toBe(
        'You appear to be offline.'
      );
      expect(appointmentErrorMessage('Unexpected DB fault', 'action')).toBe(
        'Something went wrong. Try again.'
      );
    });
  });

  describe('RPC client wrappers', () => {
    it('fetchBranches calls list_branches', async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'br-1',
            name: 'Davao Bank – City Main',
            area: 'Poblacion, Davao City',
            address: 'CM Recto St',
            is_active: true,
          },
        ],
        error: null,
      });
      const res = await fetchBranches(makeClient(rpc));
      expect(rpc).toHaveBeenCalledWith('list_branches');
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(1);
    });

    it('fetchOpenAppointmentSlots validates arguments and calls list_open_slots', async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: [
          {
            id: 'slot-1',
            branch_id: 'br-1',
            starts_at: '2026-11-27T01:00:00Z',
            ends_at: '2026-11-27T01:30:00Z',
            capacity: '2',
            available: '1',
          },
        ],
        error: null,
      });
      const client = makeClient(rpc);

      expect(await fetchOpenAppointmentSlots(client, '', '2026-11-27')).toEqual({
        data: null,
        error: 'Branch is required',
      });
      expect(await fetchOpenAppointmentSlots(client, 'br-1', 'bad')).toEqual({
        data: null,
        error: 'Valid date is required',
      });

      const res = await fetchOpenAppointmentSlots(client, 'br-1', '2026-11-27');
      expect(rpc).toHaveBeenCalledWith('list_open_slots', {
        p_branch_id: 'br-1',
        p_date: '2026-11-27',
      });
      expect(res).toEqual({
        data: [
          {
            id: 'slot-1',
            branch_id: 'br-1',
            starts_at: '2026-11-27T01:00:00Z',
            ends_at: '2026-11-27T01:30:00Z',
            capacity: 2,
            available: 1,
          },
        ],
        error: null,
      });
    });

    it('bookBranchAppointment calls book_appointment with exact 3-arg signature', async () => {
      const rpc = jest.fn().mockResolvedValue({
        data: {
          id: '8f043910-1a2b-4c3d-8e9f-0123456789ab',
          status: 'booked',
          slot_id: 'slot-1',
          branch_id: 'br-1',
          idempotency_key: 'appt_123',
          idempotent_replay: false,
        },
        error: null,
      });

      const res = await bookBranchAppointment(makeClient(rpc), {
        branchId: 'br-1',
        slotId: 'slot-1',
        idempotencyKey: 'appt_123',
      });

      expect(rpc).toHaveBeenCalledWith('book_appointment', {
        p_branch_id: 'br-1',
        p_slot_id: 'slot-1',
        p_idempotency_key: 'appt_123',
      });
      expect(res).toEqual({
        data: {
          id: '8f043910-1a2b-4c3d-8e9f-0123456789ab',
          status: 'booked',
          slot_id: 'slot-1',
          branch_id: 'br-1',
          idempotency_key: 'appt_123',
          idempotent_replay: false,
        },
        error: null,
      });
    });

    it('fetchMyAppointments and cancelBranchAppointment call their RPCs', async () => {
      const rpc = jest
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              id: 'appt-1',
              slot_id: 'slot-1',
              starts_at: '2026-11-27T01:00:00Z',
              ends_at: '2026-11-27T01:30:00Z',
              branch_name: 'Davao Bank – City Main',
              branch_area: 'Poblacion, Davao City',
              status: 'booked',
              staff_note: null,
              created_at: '2026-11-26T00:00:00Z',
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          data: { success: true, id: 'appt-1', status: 'cancelled' },
          error: null,
        });

      const client = makeClient(rpc);
      const listRes = await fetchMyAppointments(client);
      expect(rpc).toHaveBeenNthCalledWith(1, 'get_my_appointments');
      expect(listRes.data).toHaveLength(1);

      const cancelRes = await cancelBranchAppointment(client, 'appt-1');
      expect(rpc).toHaveBeenNthCalledWith(2, 'cancel_appointment', {
        p_id: 'appt-1',
      });
      expect(cancelRes).toEqual({
        data: { success: true, id: 'appt-1', status: 'cancelled' },
        error: null,
      });
    });
  });
});
