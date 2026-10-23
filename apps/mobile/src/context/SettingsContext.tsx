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

interface SettingsContextType {
  hideBalance: boolean;
  toggleHideBalance: () => Promise<void>;
  biometricEnabled: boolean;
  setBiometricEnabled: (enabled: boolean) => Promise<boolean>;
  isBiometricSupported: boolean;
  biometricType: string;
  confirmBiometricPayment: (promptMessage?: string) => Promise<{
    success: boolean;
    cancelled?: boolean;
    requiresPasswordFallback?: boolean;
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
      // "Turning it off requires one successful check first."
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

  const confirmBiometricPayment = useCallback(
    async (
      promptMessage = 'Confirm transaction with Face ID / Fingerprint'
    ): Promise<{
      success: boolean;
      cancelled?: boolean;
      requiresPasswordFallback?: boolean;
      error?: string;
    }> => {
      if (!biometricEnabled || !isBiometricSupported) {
        // Fallback to password or proceed
        return { success: true };
      }

      try {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage,
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

        return { success: false, requiresPasswordFallback: true, error: result.error };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, requiresPasswordFallback: true, error: msg };
      }
    },
    [biometricEnabled, isBiometricSupported]
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
