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
import { supabase } from '../lib/supabase';
import { PasswordConfirmationModal } from '../components/PasswordConfirmationModal';

export interface ConfirmMoneyOptions {
  title?: string;
  message?: string;
  promptMessage?: string;
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
  const [hideBalance, setHideBalanceState] = useState<boolean>(false);
  const [biometricEnabled, setBiometricEnabledState] = useState<boolean>(true);
  const [isBiometricSupported, setIsBiometricSupported] = useState<boolean>(false);
  const [biometricType, setBiometricType] = useState<string>('Biometrics');

  // Password confirmation modal state
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordModalConfig, setPasswordModalConfig] = useState<{
    title: string;
    message: string;
    resolve: (val: { success: boolean; cancelled?: boolean; error?: string }) => void;
  } | null>(null);

  // Load initial settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const storedHide = await AsyncStorage.getItem(HIDE_BALANCE_KEY);
        if (storedHide !== null) {
          setHideBalanceState(storedHide === 'true');
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const supported = hasHardware && isEnrolled;
        setIsBiometricSupported(supported);

        if (supported) {
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType('Face ID');
          } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
            setBiometricType('Fingerprint');
          } else {
            setBiometricType('Biometrics');
          }
        }

        const storedBiometric = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
        if (storedBiometric !== null) {
          setBiometricEnabledState(storedBiometric === 'true');
        } else {
          // Default to true if device supports biometrics
          setBiometricEnabledState(supported);
        }
      } catch (err) {
        console.warn('Error loading settings:', err);
      }
    }
    loadSettings();
  }, []);

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

      if (biometricEnabled && isBiometricSupported) {
        try {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: promptMsg,
            fallbackLabel: 'Enter Password',
            cancelLabel: 'Cancel',
            disableDeviceFallback: false,
          });

          if (result.success) {
            return { success: true };
          }

          if (result.error === 'user_cancel' || result.error === 'app_cancel') {
            return { success: false, cancelled: true };
          }
          // Biometric failed or user selected password fallback; proceed to password modal
        } catch {
          // Proceed to password modal fallback
        }
      }

      // Fallback: in-app password re-entry modal
      return new Promise((resolve) => {
        setPasswordModalConfig({
          title: promptTitle,
          message: promptMsg,
          resolve,
        });
        setPasswordModalVisible(true);
      });
    },
    [biometricEnabled, isBiometricSupported]
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

  const handlePasswordModalConfirm = async (password: string): Promise<boolean> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        return false;
      }

      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (authErr) {
        return false;
      }

      setPasswordModalVisible(false);
      passwordModalConfig?.resolve({ success: true });
      return true;
    } catch {
      return false;
    }
  };

  const handlePasswordModalCancel = () => {
    setPasswordModalVisible(false);
    passwordModalConfig?.resolve({ success: false, cancelled: true });
  };

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
      <PasswordConfirmationModal
        visible={passwordModalVisible}
        title={passwordModalConfig?.title}
        message={passwordModalConfig?.message}
        onConfirm={handlePasswordModalConfirm}
        onCancel={handlePasswordModalCancel}
      />
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
