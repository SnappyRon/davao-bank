import type { QRPayloadResult } from '../types';

export const DAVAO_BANK_SCHEME = 'davaobank';
export const DAVAO_BANK_QR_VERSION = '1';
export const MAX_QR_NOTE_LENGTH = 60;
export const MAX_QR_AMOUNT_CENTAVOS = 50000000; // PHP 500,000.00 single transfer cap

export interface GenerateQROptions {
  accountNumber: string;
  amountCentavos?: number | null;
  note?: string | null;
}

/**
 * Encodes Davao Bank transfer details into standard custom-scheme URI format:
 * davaobank://pay?v=1&acct=<10-digit>&amt=<centavos>&note=<urlencoded>
 */
export function generateDavaoBankQRPayload(options: GenerateQROptions): string {
  const cleanAccount = (options.accountNumber || '').trim();
  if (!/^[0-9]{10}$/.test(cleanAccount)) {
    throw new Error('Invalid account number. Davao Bank account numbers must be exactly 10 digits.');
  }

  const queryParts: string[] = [
    `v=${DAVAO_BANK_QR_VERSION}`,
    `acct=${cleanAccount}`,
  ];

  if (options.amountCentavos && options.amountCentavos > 0) {
    const intAmount = Math.floor(options.amountCentavos);
    if (intAmount > MAX_QR_AMOUNT_CENTAVOS) {
      throw new Error(`Amount exceeds maximum transfer limit of PHP 500,000.00.`);
    }
    queryParts.push(`amt=${intAmount}`);
  }

  if (options.note && options.note.trim()) {
    const trimmedNote = options.note.trim().slice(0, MAX_QR_NOTE_LENGTH);
    queryParts.push(`note=${encodeURIComponent(trimmedNote)}`);
  }

  return `${DAVAO_BANK_SCHEME}://pay?${queryParts.join('&')}`;
}

/**
 * Strictly parses and validates a scanned QR code payload.
 * Rejects any non-Davao Bank QR code, malformed scheme, wrong version, or invalid account.
 */
export function parseDavaoBankQRPayload(rawPayload: string): QRPayloadResult {
  const DEFAULT_ERROR = "This isn't a Davao Bank QR code";

  if (!rawPayload || typeof rawPayload !== 'string') {
    return { valid: false, error: DEFAULT_ERROR };
  }

  const trimmed = rawPayload.trim();

  // Must start with davaobank://pay? or davaobank:pay?
  if (!trimmed.startsWith('davaobank://pay?') && !trimmed.startsWith('davaobank:pay?')) {
    return { valid: false, error: DEFAULT_ERROR };
  }

  try {
    const queryString = trimmed.split('?')[1];
    if (!queryString) {
      return { valid: false, error: DEFAULT_ERROR };
    }

    const params = new URLSearchParams(queryString);

    // 1. Version check
    const version = params.get('v');
    if (version !== DAVAO_BANK_QR_VERSION) {
      return { valid: false, error: DEFAULT_ERROR };
    }

    // 2. Account number check (strictly 10 digits)
    const account = params.get('acct');
    if (!account || !/^[0-9]{10}$/.test(account)) {
      return { valid: false, error: DEFAULT_ERROR };
    }

    // 3. Amount check (optional, but if present must be positive int <= limit)
    let amountCentavos: number | undefined;
    if (params.has('amt')) {
      const amtStr = params.get('amt');
      if (!amtStr || !/^[1-9][0-9]*$/.test(amtStr)) {
        return { valid: false, error: DEFAULT_ERROR };
      }
      const parsedAmt = parseInt(amtStr, 10);
      if (isNaN(parsedAmt) || parsedAmt <= 0 || parsedAmt > MAX_QR_AMOUNT_CENTAVOS) {
        return { valid: false, error: DEFAULT_ERROR };
      }
      amountCentavos = parsedAmt;
    }

    // 4. Note check (optional, max 60 chars)
    let note: string | undefined;
    if (params.has('note')) {
      const rawNote = params.get('note') || '';
      try {
        const decoded = decodeURIComponent(rawNote).trim();
        if (decoded.length > MAX_QR_NOTE_LENGTH) {
          return { valid: false, error: DEFAULT_ERROR };
        }
        note = decoded;
      } catch {
        return { valid: false, error: DEFAULT_ERROR };
      }
    }

    return {
      valid: true,
      accountNumber: account,
      amountCentavos,
      note,
    };
  } catch {
    return { valid: false, error: DEFAULT_ERROR };
  }
}
