import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState } from 'react-native';
import { PasswordPromptProvider, usePasswordPrompt } from './PasswordPromptContext';

export interface ConfirmMoneyOptions {
  title?: string;
  message?: string;
  promptMessage?: string;
}

export interface DecideConfirmationParams {
  biometricEnabled: boolean;
  isBiometricSupported: boolean;
  authenticateBiometric: () => Promise<{ success: boolean; error?: string }>;
  promptPassword: () => Promise<{
    success: boolean;
    cancelled?: boolean;
    error?: string;
  }>;
}

/**
 * Pure decision evaluator for money confirmation (§0.9 / Fix F10).
 * Invariant: Never returns { success: true } without a successful biometric or password check.
 */
export async function decideConfirmation({
  biometricEnabled,
  isBiometricSupported,
  authenticateBiometric,
  promptPassword,
}: DecideConfirmationParams): Promise<{
  success: boolean;
  cancelled?: boolean;
  error?: string;
}> {
  if (biometricEnabled && isBiometricSupported) {
    try {
      const bioResult = await authenticateBiometric();
      if (bioResult.success) {
        return { success: true };
      }
      if (bioResult.error === 'user_cancel' || bioResult.error === 'app_cancel') {
        return { success: false, cancelled: true };
      }
      // Biometric error or fallback chosen -> proceed to password
    } catch {
      // Proceed to password
    }
  }

  const pwdResult = await promptPassword();
  if (pwdResult.success) {
    return { success: true };
  }
  return {
    success: false,
    cancelled: pwdResult.cancelled,
    error: pwdResult.error || 'Authentication required',
  };
}

interface SettingsContextType {
  hideBalance: boolean;
  toggleHideBalance: () => Promise<void>;
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => Promise<boolean>;
  isBiometricSupported: boolean;
  biometricType: string;
  confirmBiometricPayment: (
    promptMessageOrOptions?: string | ConfirmMoneyOptions
  ) => Promise<{
    success: boolean;
    cancelled?: boolean;
    error?: string;
  }>;
  confirmMoneyAction: (options?: ConfirmMoneyOptions) => Promise<{
    success: boolean;
    cancelled?: boolean;
    error?: string;
  }>;
}

const HIDE_BALANCE_KEY = '@davao_bank_hide_balance';
const BIOMETRIC_ENABLED_KEY = '@davao_bank_biometric_enabled';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  return (
    <PasswordPromptProvider>
      <SettingsContent>{children}</SettingsContent>
    </PasswordPromptProvider>
  );
}

function SettingsContent({ children }: { children: ReactNode }) {
  const promptPassword = usePasswordPrompt();
  const [hideBalance, setHideBalanceState] = useState<boolean>(false);
  const [biometricEnabled, setBiometricEnabledState] = useState<boolean>(true);
  const [isBiometricSupported, setIsBiometricSupported] = useState<boolean>(false);
  const [biometricType, setBiometricType] = useState<string>('Biometrics');

  const refreshBiometricSupport = useCallback(async () => {
    try {
      const supported =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      setIsBiometricSupported(supported);
      const types = supported
        ? await LocalAuthentication.supportedAuthenticationTypesAsync()
        : [];
      setBiometricType(
        types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
          ? 'Face ID'
          : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
            ? 'Fingerprint'
            : 'Biometrics'
      );
    } catch {
      setIsBiometricSupported(false);
      setBiometricType('Biometrics');
    }
  }, []);

  useEffect(() => {
    async function loadSettings() {
      try {
        const storedHide = await AsyncStorage.getItem(HIDE_BALANCE_KEY);
        if (storedHide !== null) setHideBalanceState(storedHide === 'true');
        const storedBiometric = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
        // Keep the preference separate from enrollment; new enrollment can take effect immediately.
        setBiometricEnabledState(storedBiometric === null || storedBiometric === 'true');
      } catch (err) {
        console.warn('Error loading settings:', err);
      }
    }
    void loadSettings();
    void refreshBiometricSupport();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshBiometricSupport();
    });
    return () => subscription.remove();
  }, [refreshBiometricSupport]);

  const toggleHideBalance = useCallback(async () => {
    setHideBalanceState((prev) => {
      const next = !prev;
      AsyncStorage.setItem(HIDE_BALANCE_KEY, String(next)).catch(console.warn);
      return next;
    });
  }, []);

  const setBiometricEnabled = useCallback(
    async (nextVal: boolean): Promise<boolean> => {
      // Turning off requires one successful check first
      if (!nextVal && biometricEnabled && isBiometricSupported) {
        try {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Authenticate to disable biometric confirmation',
            fallbackLabel: 'Use Passcode',
            cancelLabel: 'Cancel',
          });
          if (!result.success) {
            return false;
          }
        } catch {
          return false;
        }
      }

      setBiometricEnabledState(nextVal);
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, String(nextVal));
      return true;
    },
    [biometricEnabled, isBiometricSupported]
  );

  /**
   * Universal money movement confirmation helper (Fix 6).
   *
   * 1. If biometrics available & enabled: prompts biometric check (may fall back to device passcode).
   * 2. Otherwise (no biometrics, setting turned off, or biometric failure/fallback requested):
   *    requires password re-entry verified via supabase.auth.signInWithPassword for the caller's email.
   * 3. Never returns success: true without one of those two checks succeeding.
   */
  const confirmMoneyAction = useCallback(
    async (
      options?: ConfirmMoneyOptions
    ): Promise<{
      success: boolean;
      cancelled?: boolean;
      error?: string;
    }> => {
      const promptTitle = options?.title || 'Authorize Transaction';
      const promptMsg =
        options?.promptMessage ||
        options?.message ||
        'Please confirm your identity to authorize this transaction.';

      return decideConfirmation({
        biometricEnabled,
        isBiometricSupported,
        authenticateBiometric: async () => {
          return LocalAuthentication.authenticateAsync({
            promptMessage: promptMsg,
            fallbackLabel: 'Enter Password',
            cancelLabel: 'Cancel',
            disableDeviceFallback: false,
          });
        },
        promptPassword: () => promptPassword({ title: promptTitle, message: promptMsg }),
      });
    },
    [biometricEnabled, isBiometricSupported, promptPassword]
  );

  const confirmBiometricPayment = useCallback(
    async (
      promptMessageOrOptions?: string | ConfirmMoneyOptions
    ): Promise<{
      success: boolean;
      cancelled?: boolean;
      error?: string;
    }> => {
      const opts: ConfirmMoneyOptions =
        typeof promptMessageOrOptions === 'string'
          ? { promptMessage: promptMessageOrOptions }
          : promptMessageOrOptions || {};
      return confirmMoneyAction(opts);
    },
    [confirmMoneyAction]
  );

  return (
    <SettingsContext.Provider
      value={{
        hideBalance,
        toggleHideBalance,
        biometricEnabled,
        setBiometricEnabled,
        isBiometricSupported,
        biometricType,
        confirmBiometricPayment,
        confirmMoneyAction,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
