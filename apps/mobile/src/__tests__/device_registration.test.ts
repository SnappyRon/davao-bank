import * as SecureStore from 'expo-secure-store';
import {
  getOrCreateInstallId,
  registerDeviceOncePerSession,
  resetDeviceSessionFlag,
  registerPasswordChangeRpc,
} from '../utils/deviceRegistration';

const secureStoreMock: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => secureStoreMock[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    secureStoreMock[key] = value;
  }),
}));

const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, params?: unknown) => mockRpc(fn, params),
  },
}));

describe('deviceRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(secureStoreMock)) delete secureStoreMock[k];
    resetDeviceSessionFlag();
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('generates and persists a UUID if install_id does not exist', async () => {
    const id1 = await getOrCreateInstallId();
    expect(id1).toBeTruthy();
    expect(secureStoreMock['davao_device_install_id']).toBe(id1);

    // Second call should return the exact same persisted ID
    const id2 = await getOrCreateInstallId();
    expect(id2).toBe(id1);
    expect(SecureStore.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it('registers device once per session', async () => {
    await registerDeviceOncePerSession();
    expect(mockRpc).toHaveBeenCalledWith('register_device', {
      p_install_id: expect.any(String),
      p_label: expect.any(String),
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // Second call in same session does not repeat RPC
    await registerDeviceOncePerSession();
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // After reset, it can register again
    resetDeviceSessionFlag();
    await registerDeviceOncePerSession();
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('calls register_password_change RPC', async () => {
    await registerPasswordChangeRpc();
    expect(mockRpc).toHaveBeenCalledWith('register_password_change', undefined);
  });
});
