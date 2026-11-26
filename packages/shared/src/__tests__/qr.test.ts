import {
  generateDavaoBankQRPayload,
  parseDavaoBankQRPayload,
  MAX_QR_AMOUNT_CENTAVOS,
} from '../utils/qr';

describe('QR Encode & Parse (Davao Bank Standard)', () => {
  it('encodes standard davaobank://pay URI format', () => {
    const payload = generateDavaoBankQRPayload({
      accountNumber: '1012345678',
      amountCentavos: 250000,
      note: 'Durian feast split',
    });
    expect(payload).toBe(
      'davaobank://pay?v=1&acct=1012345678&amt=250000&note=Durian%20feast%20split'
    );
  });

  it('correctly extracts account number, centavos amount, and note', () => {
    const raw =
      'davaobank://pay?v=1&acct=1012345678&amt=250000&note=Durian%20feast%20split';
    const result = parseDavaoBankQRPayload(raw);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.accountNumber).toBe('1012345678');
      expect(result.amountCentavos).toBe(250000);
      expect(result.note).toBe('Durian feast split');
    }
  });

  it('handles minimal QR payload with account number only', () => {
    const payload = generateDavaoBankQRPayload({
      accountNumber: '1098765432',
    });
    expect(payload).toBe('davaobank://pay?v=1&acct=1098765432');

    const result = parseDavaoBankQRPayload(payload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.accountNumber).toBe('1098765432');
      expect(result.amountCentavos).toBeUndefined();
      expect(result.note).toBeUndefined();
    }
  });

  it('rejects non-davaobank schemes with exact copy: "This isn\'t a Davao Bank QR code"', () => {
    const foreignUrls = [
      'https://gcash.com/pay?amount=500',
      'maya://qr/pay?user=123',
      'otherbank://transfer?to=1012345678',
      'random text string',
      '',
    ];

    for (const url of foreignUrls) {
      const result = parseDavaoBankQRPayload(url);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe("This isn't a Davao Bank QR code");
      }
    }
  });

  it('rejects unrecognized version number (v=2)', () => {
    const result = parseDavaoBankQRPayload('davaobank://pay?v=2&acct=1012345678');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("This isn't a Davao Bank QR code");
    }
  });

  it('strictly requires exactly 10 numeric digits for account number', () => {
    const invalidAccounts = [
      '101234567', // 9 digits
      '10123456789', // 11 digits
      '101234567a', // letter
      'abcdefghij', // non-numeric
      '',
    ];

    for (const acct of invalidAccounts) {
      expect(() => generateDavaoBankQRPayload({ accountNumber: acct })).toThrow();

      const parseResult = parseDavaoBankQRPayload(`davaobank://pay?v=1&acct=${acct}`);
      expect(parseResult.valid).toBe(false);
    }
  });

  it('rejects negative, zero, float, or excessive amounts exceeding transfer cap', () => {
    const invalidAmts = [
      '0',
      '-500',
      '100.50',
      '00123',
      String(MAX_QR_AMOUNT_CENTAVOS + 1),
    ];

    for (const amt of invalidAmts) {
      const parseResult = parseDavaoBankQRPayload(
        `davaobank://pay?v=1&acct=1012345678&amt=${amt}`
      );
      expect(parseResult.valid).toBe(false);
    }
  });

  it('rejects note exceeding 60 character maximum', () => {
    const longNote = 'A'.repeat(61);
    const parseResult = parseDavaoBankQRPayload(
      `davaobank://pay?v=1&acct=1012345678&note=${encodeURIComponent(longNote)}`
    );
    expect(parseResult.valid).toBe(false);
  });
});
