import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  registerDeviceRpc,
  registerPasswordChangeRpc,
} from '../hooks/usePhase8Contracts';

const INSTALL_ID_KEY = 'davao_device_install_id';
let sessionRegistered = false;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getOrCreateInstallId(): Promise<string> {
  try {
    let id = await SecureStore.getItemAsync(INSTALL_ID_KEY);
    if (!id) {
      id = generateUUID();
      await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
    }
    return id;
  } catch {
    return 'fallback-install-id';
  }
}

export async function registerDeviceOncePerSession(): Promise<void> {
  if (sessionRegistered) return;
  try {
    const installId = await getOrCreateInstallId();
    const label =
      Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Mobile';
    const { error } = await registerDeviceRpc(installId, label);
    if (!error) {
      sessionRegistered = true;
    }
  } catch {
    // Non-blocking
  }
}

export function resetDeviceSessionFlag(): void {
  sessionRegistered = false;
}

export { registerPasswordChangeRpc };
