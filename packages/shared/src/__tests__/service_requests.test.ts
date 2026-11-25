import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchMyServiceRequests,
  createServiceRequest,
  cancelServiceRequest,
  formatServiceRequestReference,
  normalizeRemitReference,
  validateServiceRequestDraft,
  getRemitTimelineSteps,
  serviceRequestTypeLabel,
  serviceRequestStatusLabel,
  toServiceRequestErrorMessage,
  type ServiceRequestDraft,
} from '../serviceRequests';

function baseDraft(overrides: Partial<ServiceRequestDraft> = {}): ServiceRequestDraft {
  return {
    type: 'statement',
    accountId: 'acc-uuid-1',
    startDate: '2026-11-01',
    endDate: '2026-11-26',
    purpose: '',
    reason: '',
    last4: '',
    updateField: 'email',
    newValue: '',
    remitReference: '',
    ...overrides,
  };
}

describe('serviceRequests shared helpers and client wrappers', () => {
  describe('formatServiceRequestReference and normalizeRemitReference', () => {
    it('formats server reference without duplicating DB- prefix', () => {
      expect(
        formatServiceRequestReference(
          'DB-ABCD-1234',
          '8f043910-0000-0000-0000-000000000000'
        )
      ).toBe('DB-ABCD-1234');
      expect(formatServiceRequestReference('db-a1b2-c3d4')).toBe('DB-A1B2-C3D4');
    });

    it('falls back to formatting UUID via formatReferenceId when reference is empty', () => {
      expect(
        formatServiceRequestReference('', '8f043910-1234-5678-9abc-def012345678')
      ).toBe('DB-8F04-3910');
    });

    it('normalizes user remittance references cleanly', () => {
      expect(normalizeRemitReference('db-1a2b-3c4d')).toBe('DB-1A2B-3C4D');
      expect(normalizeRemitReference('1a2b3c4d')).toBe('DB-1A2B-3C4D');
      expect(normalizeRemitReference('db1a2b3c4d')).toBe('DB-1A2B-3C4D');
      expect(normalizeRemitReference('')).toBe('');
    });
  });

  describe('labels and remittance timeline', () => {
    it('returns sentence-case labels for types and statuses', () => {
      expect(serviceRequestTypeLabel('statement')).toBe('Statement copy');
      expect(serviceRequestTypeLabel('certificate')).toBe('Bank certificate');
      expect(serviceRequestTypeLabel('card_replacement')).toBe('Card replacement');
      expect(serviceRequestTypeLabel('account_update')).toBe('Account details update');
      expect(serviceRequestTypeLabel('remit_status')).toBe('Remittance status inquiry');

      expect(serviceRequestStatusLabel('submitted')).toBe('Submitted');
      expect(serviceRequestStatusLabel('in_review')).toBe('In review');
      expect(serviceRequestStatusLabel('completed')).toBe('Ready');
      expect(serviceRequestStatusLabel('rejected')).toBe('Declined');
      expect(serviceRequestStatusLabel('cancelled')).toBe('Cancelled');
    });

    it('builds remittance timeline steps for each status', () => {
      expect(getRemitTimelineSteps('submitted')).toEqual([
        { label: 'Received', state: 'current' },
        { label: 'Processing', state: 'upcoming' },
        { label: 'Ready for credit', state: 'upcoming' },
      ]);
      expect(getRemitTimelineSteps('in_review')[1]).toEqual({
        label: 'Processing',
        state: 'current',
      });
      expect(getRemitTimelineSteps('completed')[2]).toEqual({
        label: 'Ready for credit',
        state: 'done',
      });
      expect(getRemitTimelineSteps('cancelled')).toEqual([
        { label: 'Received', state: 'done' },
        { label: 'Cancelled', state: 'stopped' },
      ]);
      expect(getRemitTimelineSteps('rejected')[2]).toEqual({
        label: 'Declined',
        state: 'stopped',
      });
    });
  });

  describe('validateServiceRequestDraft', () => {
    it('validates statement details and rejects inverted or invalid dates', () => {
      const ok = validateServiceRequestDraft(baseDraft());
      expect(ok).toEqual({
        valid: true,
        details: {
          account_id: 'acc-uuid-1',
          start_date: '2026-11-01',
          end_date: '2026-11-26',
        },
      });

      const inverted = validateServiceRequestDraft(
        baseDraft({ startDate: '2026-11-26', endDate: '2026-11-01' })
      );
      expect(inverted.valid).toBe(false);
      if (!inverted.valid) {
        expect(inverted.errors.endDate).toContain('on or after');
      }

      const invalidDate = validateServiceRequestDraft(
        baseDraft({ startDate: '2026-02-30' })
      );
      expect(invalidDate.valid).toBe(false);
    });

    it('validates certificate purpose and blocks full card numbers in free text', () => {
      const ok = validateServiceRequestDraft(
        baseDraft({ type: 'certificate', purpose: '  Visa application  ' })
      );
      expect(ok).toEqual({ valid: true, details: { purpose: 'Visa application' } });

      const withPan = validateServiceRequestDraft(
        baseDraft({ type: 'certificate', purpose: 'Card 4532 1234 5678 9012 proof' })
      );
      expect(withPan.valid).toBe(false);
      if (!withPan.valid) {
        expect(withPan.errors.purpose).toContain('full card');
      }
    });

    it('omits empty last4 on card_replacement and validates 4-digit last4 when provided', () => {
      const withoutLast4 = validateServiceRequestDraft(
        baseDraft({ type: 'card_replacement', reason: 'Lost card', last4: '' })
      );
      expect(withoutLast4).toEqual({
        valid: true,
        details: { reason: 'Lost card' },
      });

      const withLast4 = validateServiceRequestDraft(
        baseDraft({ type: 'card_replacement', reason: 'Damaged card', last4: '4321' })
      );
      expect(withLast4).toEqual({
        valid: true,
        details: { reason: 'Damaged card', last4: '4321' },
      });

      const badLast4 = validateServiceRequestDraft(
        baseDraft({ type: 'card_replacement', reason: 'Damaged card', last4: '43' })
      );
      expect(badLast4.valid).toBe(false);
    });

    it('validates account_update email and phone_number formats', () => {
      const okEmail = validateServiceRequestDraft(
        baseDraft({
          type: 'account_update',
          updateField: 'email',
          newValue: 'customer@example.com',
        })
      );
      expect(okEmail).toEqual({
        valid: true,
        details: { field: 'email', new_value: 'customer@example.com' },
      });

      const badEmail = validateServiceRequestDraft(
        baseDraft({
          type: 'account_update',
          updateField: 'email',
          newValue: 'not-an-email',
        })
      );
      expect(badEmail.valid).toBe(false);

      const okPhone = validateServiceRequestDraft(
        baseDraft({
          type: 'account_update',
          updateField: 'phone_number',
          newValue: '+63 917 123 4567',
        })
      );
      expect(okPhone).toEqual({
        valid: true,
        details: { field: 'phone_number', new_value: '+63 917 123 4567' },
      });
    });

    it('validates remit_status DB-XXXX-XXXX reference', () => {
      const ok = validateServiceRequestDraft(
        baseDraft({ type: 'remit_status', remitReference: 'db-9x8y-7z6w' })
      );
      expect(ok).toEqual({
        valid: true,
        details: { reference: 'DB-9X8Y-7Z6W' },
      });

      const bad = validateServiceRequestDraft(
        baseDraft({ type: 'remit_status', remitReference: 'WRONG' })
      );
      expect(bad.valid).toBe(false);
    });
  });

  describe('toServiceRequestErrorMessage', () => {
    it('maps service-request domain errors and network errors cleanly without money claims', () => {
      expect(
        toServiceRequestErrorMessage(
          'Daily service request limit reached (maximum 10 requests per day)'
        )
      ).toBe('Daily request limit reached. You can submit up to 10 requests per day.');

      expect(
        toServiceRequestErrorMessage('Only submitted requests can be cancelled')
      ).toBe('Only submitted requests can be cancelled.');

      expect(toServiceRequestErrorMessage('Network request failed', 'load')).toBe(
        'You appear to be offline.'
      );

      expect(toServiceRequestErrorMessage('Network request failed', 'action')).toBe(
        'You appear to be offline. Check your connection and try again.'
      );

      expect(toServiceRequestErrorMessage('unexpected_sql_constraint', 'action')).toBe(
        'Something went wrong. Try again.'
      );
    });
  });

  describe('RPC client wrappers', () => {
    it('calls get_my_service_requests, create_service_request and cancel_service_request', async () => {
      const rpc = jest.fn();
      const client = { rpc } as unknown as SupabaseClient;

      rpc.mockResolvedValueOnce({
        data: [
          {
            id: 'req-1',
            type: 'certificate',
            details: { purpose: 'Visa' },
            status: 'submitted',
            staff_note: null,
            reference: 'DB-1111-2222',
            created_at: '2026-11-26T00:00:00Z',
            updated_at: '2026-11-26T00:00:00Z',
          },
        ],
        error: null,
      });
      const listRes = await fetchMyServiceRequests(client);
      expect(rpc).toHaveBeenCalledWith('get_my_service_requests');
      expect(listRes.error).toBeNull();
      expect(listRes.data).toHaveLength(1);

      rpc.mockResolvedValueOnce({
        data: {
          id: 'req-2',
          type: 'certificate',
          status: 'submitted',
          reference: 'DB-3333-4444',
          created_at: '2026-11-26T00:00:00Z',
        },
        error: null,
      });
      const createRes = await createServiceRequest(client, {
        type: 'certificate',
        details: { purpose: 'Employment' },
      });
      expect(rpc).toHaveBeenCalledWith('create_service_request', {
        p_type: 'certificate',
        p_details: { purpose: 'Employment' },
      });
      expect(createRes.data?.reference).toBe('DB-3333-4444');

      rpc.mockResolvedValueOnce({
        data: { success: true, id: 'req-2', status: 'cancelled' },
        error: null,
      });
      const cancelRes = await cancelServiceRequest(client, 'req-2');
      expect(rpc).toHaveBeenCalledWith('cancel_service_request', { p_id: 'req-2' });
      expect(cancelRes.data?.status).toBe('cancelled');
    });

    it('returns error strings when RPCs return errors or throw', async () => {
      const rpc = jest.fn().mockResolvedValueOnce({
        data: null,
        error: { message: 'Authentication required' },
      });
      const client = { rpc } as unknown as SupabaseClient;

      const res = await fetchMyServiceRequests(client);
      expect(res).toEqual({ data: null, error: 'Authentication required' });

      rpc.mockRejectedValueOnce(new Error('Network request failed'));
      const createErr = await createServiceRequest(client, {
        type: 'certificate',
        details: { purpose: 'Visa' },
      });
      expect(createErr).toEqual({ data: null, error: 'Network request failed' });
    });
  });
});
