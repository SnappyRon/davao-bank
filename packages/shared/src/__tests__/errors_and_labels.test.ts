import { toUserMessage } from '../utils/errors';
import { typeLabel } from '../utils/transactions';

describe('toUserMessage error sanitizer', () => {
  it('maps insufficient funds errors with and without available balance', () => {
    expect(toUserMessage('Insufficient funds')).toBe(
      'Not enough balance. Please check your available funds.'
    );
    expect(toUserMessage('insufficient funds in account', 50000)).toBe(
      'Not enough balance. You have ₱500.00 available.'
    );
  });

  it('maps recipient not found error safely', () => {
    expect(toUserMessage('Recipient account number not found')).toBe(
      "We couldn't find that account. Check the 10 digits."
    );
  });

  it('maps inactive account error safely', () => {
    expect(toUserMessage('Source account is not active')).toBe(
      "This account can't send or receive money right now."
    );
  });

  it('maps invalid reference error safely', () => {
    expect(toUserMessage('Invalid reference format for biller')).toBe(
      "That reference doesn't look right. Check your bill and try again."
    );
  });

  it('maps request no longer pending error safely', () => {
    expect(toUserMessage('Payment request is no longer pending')).toBe(
      'This request was already paid, declined or cancelled.'
    );
  });

  it('maps invalid login credentials error safely', () => {
    expect(toUserMessage('Invalid login credentials')).toBe(
      "That email and password don't match. Try again."
    );
  });

  it('maps offline and network failures safely', () => {
    expect(toUserMessage('Network request failed')).toBe(
      'You appear to be offline. Nothing was sent.'
    );
    expect(toUserMessage('Failed to fetch')).toBe(
      'You appear to be offline. Nothing was sent.'
    );
  });

  it('maps unexpected backend exceptions to generic safe fallback', () => {
    expect(toUserMessage('psql error: foreign key constraint violation')).toBe(
      'Something went wrong. No money was sent. Try again.'
    );
  });
});

describe('typeLabel formatter', () => {
  it('maps all 7 transaction types correctly', () => {
    expect(typeLabel('transfer')).toBe('Transfer');
    expect(typeLabel('deposit')).toBe('Deposit');
    expect(typeLabel('withdrawal')).toBe('Withdrawal');
    expect(typeLabel('bill_payment')).toBe('Bill payment');
    expect(typeLabel('adjustment')).toBe('Adjustment');
    expect(typeLabel('reversal')).toBe('Reversal');
    expect(typeLabel('payment_request')).toBe('Payment request');
  });

  it('handles unknown or empty types safely', () => {
    expect(typeLabel('')).toBe('Transaction');
    expect(typeLabel('custom_type')).toBe('Custom type');
  });
});
