/**
 * Fetch-failure and Supabase-error based network connectivity detector.
 * No third-party NetInfo dependency is required.
 */

type Listener = (offline: boolean) => void;

const listeners = new Set<Listener>();
let offlineState = false;
let rawFetchRef: typeof fetch | null = null;
let installedCount = 0;

function notify() {
  for (const listener of listeners) {
    listener(offlineState);
  }
}

export function getIsOffline(): boolean {
  return offlineState;
}

export function subscribeNetworkStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportNetworkOffline(): void {
  if (!offlineState) {
    offlineState = true;
    notify();
  }
}

export function reportNetworkOnline(): void {
  if (offlineState) {
    offlineState = false;
    notify();
  }
}

export function isOfflineError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: string } | null)?.name;
  if (name === 'AuthRetryableFetchError') return true;
  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: string; error_description?: string; details?: string })
          ?.message ||
        (error as { error_description?: string })?.error_description ||
        (error as { details?: string })?.details ||
        String(error);
  const lower = raw.toLowerCase();
  return (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('internet connection appears to be offline') ||
    lower.includes('err_network') ||
    lower.includes('fetch failed')
  );
}

/**
 * Updates offline status from a query/RPC result:
 * - null/undefined error clears offline state;
 * - network/fetch errors mark the app offline;
 * - domain/server errors (e.g. insufficient funds) indicate the server IS reachable, so they clear offline state.
 */
export function reportNetworkResult(error: unknown): void {
  if (!error) {
    reportNetworkOnline();
    return;
  }
  if (isOfflineError(error)) {
    reportNetworkOffline();
  }
}

/**
 * Wraps `globalThis.fetch` so any rejected network fetch marks the app offline
 * and any HTTP response clears it automatically. Safe to call multiple times;
 * reference-counted cleanup restores the original `fetch`.
 */
export function installFetchNetworkMonitor(): () => void {
  if (typeof globalThis.fetch !== 'function') {
    return () => {};
  }

  if (installedCount === 0) {
    const originalFetch = globalThis.fetch;
    rawFetchRef = originalFetch;

    globalThis.fetch = async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ): Promise<Response> => {
      try {
        const response = await originalFetch(input, init);
        reportNetworkOnline();
        return response;
      } catch (err) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (!isAbort && (isOfflineError(err) || err instanceof TypeError)) {
          reportNetworkOffline();
        }
        throw err;
      }
    };
  }

  installedCount += 1;
  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    installedCount = Math.max(0, installedCount - 1);
    if (installedCount === 0 && rawFetchRef) {
      globalThis.fetch = rawFetchRef;
      rawFetchRef = null;
    }
  };
}

/**
 * Lightweight connectivity check used while offline to clear the banner
 * automatically once connectivity returns.
 */
export async function probeNetworkConnectivity(probeUrl?: string): Promise<boolean> {
  const fetchFn = rawFetchRef ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') return false;

  const baseUrl =
    probeUrl ||
    (typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_SUPABASE_URL : undefined) ||
    'http://127.0.0.1:54321';
  const anonKey =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
      : undefined;

  try {
    await fetchFn(`${baseUrl.replace(/\/$/, '')}/rest/v1/`, {
      method: 'HEAD',
      headers: anonKey ? { apikey: anonKey } : undefined,
    });
    reportNetworkOnline();
    return true;
  } catch {
    return false;
  }
}

/** Test-only helper to reset singleton state between Jest cases. */
export function resetNetworkStatusForTests(): void {
  offlineState = false;
  installedCount = 0;
  rawFetchRef = null;
  listeners.clear();
}
