jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { decideConfirmation } from '../context/SettingsContext';

describe('decideConfirmation (F10 Real Decision Logic)', () => {
  it('succeeds via biometric when biometrics are supported, enabled, and authenticate successfully', async () => {
    const authenticateBiometric = jest.fn().mockResolvedValue({ success: true });
    const promptPassword = jest.fn();

    const result = await decideConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      authenticateBiometric,
      promptPassword,
    });

    expect(result.success).toBe(true);
    expect(authenticateBiometric).toHaveBeenCalledTimes(1);
    expect(promptPassword).not.toHaveBeenCalled();
  });

  it('cancels immediately without prompting password if user cancelled biometric prompt', async () => {
    const authenticateBiometric = jest
      .fn()
      .mockResolvedValue({ success: false, error: 'user_cancel' });
    const promptPassword = jest.fn();

    const result = await decideConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      authenticateBiometric,
      promptPassword,
    });

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(promptPassword).not.toHaveBeenCalled();
  });

  it('cancels immediately if app cancelled biometric prompt', async () => {
    const authenticateBiometric = jest
      .fn()
      .mockResolvedValue({ success: false, error: 'app_cancel' });
    const promptPassword = jest.fn();

    const result = await decideConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      authenticateBiometric,
      promptPassword,
    });

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(promptPassword).not.toHaveBeenCalled();
  });

  it('falls back to password verification if biometrics are disabled', async () => {
    const authenticateBiometric = jest.fn();
    const promptPassword = jest.fn().mockResolvedValue({ success: true });

    const result = await decideConfirmation({
      biometricEnabled: false,
      isBiometricSupported: true,
      authenticateBiometric,
      promptPassword,
    });

    expect(result.success).toBe(true);
    expect(authenticateBiometric).not.toHaveBeenCalled();
    expect(promptPassword).toHaveBeenCalledTimes(1);
  });

  it('falls back to password verification if biometrics are unsupported by device hardware', async () => {
    const authenticateBiometric = jest.fn();
    const promptPassword = jest.fn().mockResolvedValue({ success: true });

    const result = await decideConfirmation({
      biometricEnabled: true,
      isBiometricSupported: false,
      authenticateBiometric,
      promptPassword,
    });

    expect(result.success).toBe(true);
    expect(authenticateBiometric).not.toHaveBeenCalled();
    expect(promptPassword).toHaveBeenCalledTimes(1);
  });

  it('falls back to password verification if biometric authentication throws or fails with error', async () => {
    const authenticateBiometric = jest
      .fn()
      .mockResolvedValue({ success: false, error: 'not_recognized' });
    const promptPassword = jest.fn().mockResolvedValue({ success: true });

    const result = await decideConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      authenticateBiometric,
      promptPassword,
    });

    expect(result.success).toBe(true);
    expect(authenticateBiometric).toHaveBeenCalledTimes(1);
    expect(promptPassword).toHaveBeenCalledTimes(1);
  });

  it('INVARIANT: Never succeeds without either a successful biometric or password check', async () => {
    // Both fail
    const authBioFail = jest.fn().mockResolvedValue({ success: false, error: 'failed' });
    const promptPwdFail = jest
      .fn()
      .mockResolvedValue({ success: false, error: 'Incorrect password' });

    const res1 = await decideConfirmation({
      biometricEnabled: true,
      isBiometricSupported: true,
      authenticateBiometric: authBioFail,
      promptPassword: promptPwdFail,
    });
    expect(res1.success).toBe(false);

    // Password cancelled
    const promptPwdCancel = jest
      .fn()
      .mockResolvedValue({ success: false, cancelled: true });
    const res2 = await decideConfirmation({
      biometricEnabled: false,
      isBiometricSupported: false,
      authenticateBiometric: jest.fn(),
      promptPassword: promptPwdCancel,
    });
    expect(res2.success).toBe(false);
    expect(res2.cancelled).toBe(true);
  });
});
