import {
  APPOINTMENT_STATUSES,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_TYPES,
  appointmentStatusVariant,
  describeRequestDetails,
  displayReference,
  formatAppointmentTime,
  isAppointmentStatus,
  isServiceRequestStatus,
  isServiceRequestType,
  manilaDateKey,
  maskAccountId,
  maskCustomerId,
  maskCustomerName,
  serviceRequestStatusVariant,
  serviceRequestTypeLabel,
} from '@/lib/adminServices';

const REQUEST_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('Phase 9 staff service presentation helpers', () => {
  it('uses the migration status vocabularies', () => {
    expect(SERVICE_REQUEST_STATUSES).toEqual([
      'submitted',
      'in_review',
      'completed',
      'rejected',
      'cancelled',
    ]);
    expect(SERVICE_REQUEST_TYPES).toEqual([
      'statement',
      'certificate',
      'card_replacement',
      'account_update',
      'remit_status',
    ]);
    expect(APPOINTMENT_STATUSES).toEqual(['booked', 'cancelled', 'completed']);
    expect(isServiceRequestStatus('submitted')).toBe(true);
    expect(isServiceRequestStatus('pending')).toBe(false);
    expect(isServiceRequestType('card_replacement')).toBe(true);
    expect(isServiceRequestType('unknown')).toBe(false);
    expect(isAppointmentStatus('booked')).toBe(true);
    expect(isAppointmentStatus('pending')).toBe(false);
  });

  it('renders sentence-case labels and neutral-safe status variants', () => {
    expect(serviceRequestTypeLabel('card_replacement')).toBe('Card replacement');
    expect(serviceRequestTypeLabel('mystery')).toBe('Mystery');
    expect(serviceRequestStatusVariant('completed')).toBe('success');
    expect(serviceRequestStatusVariant('in_review')).toBe('warning');
    expect(serviceRequestStatusVariant('cancelled')).toBe('danger');
    expect(appointmentStatusVariant('booked')).toBe('info');
    expect(appointmentStatusVariant('completed')).toBe('success');
  });

  it('never exposes a raw uuid or a full customer name', () => {
    const reference = displayReference(REQUEST_ID);
    expect(reference).toMatch(/^DB-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(reference).not.toContain(REQUEST_ID);
    expect(displayReference(null)).toBe('Reference unavailable');
    expect(maskCustomerId(OTHER_ID)).toMatch(/^Customer •• [0-9A-F]{4}$/);
    expect(maskAccountId(OTHER_ID)).toMatch(/^Account •• [0-9A-F]{4}$/);
    expect(maskCustomerName('Juan dela Cruz')).toBe('J*** d*** C***');
    expect(maskCustomerName(null)).toBe('C***');
  });

  it('whitelists request detail keys and suppresses contact values', () => {
    expect(
      describeRequestDetails('statement', {
        account_id: OTHER_ID,
        start_date: '2026-11-01',
        end_date: '2026-11-30',
        secret: 'do not show',
      })
    ).toEqual([
      { label: 'Account', value: maskAccountId(OTHER_ID) },
      { label: 'From', value: '2026-11-01' },
      { label: 'To', value: '2026-11-30' },
    ]);
    expect(
      describeRequestDetails('account_update', {
        field: 'email',
        new_value: 'private@davaobank.ph',
      })
    ).toEqual([
      { label: 'Field', value: 'Email' },
      { label: 'New value', value: 'Provided' },
    ]);
    expect(
      describeRequestDetails('card_replacement', {
        reason: 'Lost somewhere private',
        last4: '1234',
      })
    ).toEqual([
      { label: 'Reason', value: 'Provided' },
      { label: 'Card', value: 'Card •• 1234' },
    ]);
    expect(describeRequestDetails('certificate', null)).toEqual([
      { label: 'Purpose', value: 'Not provided' },
    ]);
    expect(describeRequestDetails('remit_status', { reference: 'secret-ref' })).toEqual([
      { label: 'Reference', value: 'Provided' },
    ]);
    expect(describeRequestDetails('mystery', { anything: 'value' })).toEqual([]);
  });

  it('formats Manila calendar days and appointment times', () => {
    expect(manilaDateKey('2026-11-26T16:30:00Z')).toBe('2026-11-27');
    expect(manilaDateKey('not-a-date')).toBe('');
    expect(formatAppointmentTime('2026-11-26T16:30:00Z')).toContain('Nov 27');
    expect(formatAppointmentTime('bad')).toBe('Time unavailable');
  });
});
