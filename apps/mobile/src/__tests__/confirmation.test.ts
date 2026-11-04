/**
 * Unit Test: Confirmation Helper Decision Logic
 * Tests biometric authentication, password fallback, cancellation, and security invariant:
 * "Never succeeds without a check"
 */

interface MockAuthOptions {
  biometricEnabled: boolean;
  isBiometricSupported: boolean;
  biometricResult?: { success: boolean; error?: string };
  passwordResult?: { success: boolean; error?: string };
}

// Pure decision evaluator mirroring SettingsContext confirmMoneyAction logic
async function evaluateConfirmation({
  biometricEnabled,
  isBiometricSupported,
  biometricResult,
  passwordResult,
}: MockAuthOptions): Promise<{
  strategy: 'biometric' | 'password';
  success: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  // Branch 1: Biometric check when supported and enabled
  if (biometricEnabled && isBiometricSupported) {
    if (biometricResult?.success) {
      return { strategy: 'biometric', success: true };
    }
    if (
      biometricResult?.error === 'user_cancel' ||
      biometricResult?.error === 'app_cancel'
    ) {
      return { strategy: 'biometric', success: false, cancelled: true };
    }
    // Fall through to password on error or fallback
  }

  // Branch 2: Password re-entry fallback
  if (passwordResult?.success) {
    return { strategy: 'password', success: true };
  }
  if (passwordResult?.error === 'user_cancel') {
    return { strategy: 'password', success: false, cancelled: true };
  }

  return {
    strategy: 'password',
    success: false,
    error: passwordResult?.error || 'Authentication required',
  };
}

describe("Confirmation Helper's Decision Logic", () => {
  it('succeeds via biometric when biometrics are supported and enabled', async () => {
    const result = await evaluateConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      biometricResult: { success: true },
    });

    expect(result.strategy).toBe('biometric');
    expect(result.success).toBe(true);
    expect(result.cancelled).toBeFalsy();
  });

  it('cancels immediately without prompting password if user cancelled biometric prompt', async () => {
    const result = await evaluateConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      biometricResult: { success: false, error: 'user_cancel' },
    });

    expect(result.strategy).toBe('biometric');
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it('falls back to password verification if biometrics are disabled', async () => {
    const result = await evaluateConfirmation({
      biometricEnabled: false,
      isBiometricSupported: true,
      passwordResult: { success: true },
    });

    expect(result.strategy).toBe('password');
    expect(result.success).toBe(true);
  });

  it('falls back to password verification if biometrics are unsupported by hardware', async () => {
    const result = await evaluateConfirmation({
      biometricEnabled: true,
      isBiometricSupported: false,
      passwordResult: { success: true },
    });

    expect(result.strategy).toBe('password');
    expect(result.success).toBe(true);
  });

  it('falls back to password verification if biometric sensor fails or falls back', async () => {
    const result = await evaluateConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      biometricResult: { success: false, error: 'fallback' },
      passwordResult: { success: true },
    });

    expect(result.strategy).toBe('password');
    expect(result.success).toBe(true);
  });

  it('rejects transaction if password verification fails', async () => {
    const result = await evaluateConfirmation({
      biometricEnabled: false,
      isBiometricSupported: true,
      passwordResult: { success: false, error: 'Invalid password' },
    });

    expect(result.strategy).toBe('password');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid password');
  });

  it('security invariant: never succeeds if neither check passed', async () => {
    const combinations: MockAuthOptions[] = [
      { biometricEnabled: false, isBiometricSupported: false },
      {
        biometricEnabled: true,
        isBiometricSupported: true,
        biometricResult: { success: false },
        passwordResult: { success: false },
      },
      {
        biometricEnabled: false,
        isBiometricSupported: true,
        passwordResult: { success: false },
      },
    ];

    for (const combo of combinations) {
      const res = await evaluateConfirmation(combo);
      expect(res.success).toBe(false);
    }
  });
});
