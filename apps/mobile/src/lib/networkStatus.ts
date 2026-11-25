import { useEffect, useState } from 'react';

/**
 * Network status tracking for real-time updates.
 * Used by the offline banner and skeleton loading states.
 */

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setLastUpdate(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, lastUpdate };
}

/**
 * Reports a network result - called when a money operation completes
 * or when the app regains connectivity.
 * Shows "You're offline — showing your last update" banner when connectivity is lost.
 */
export function reportNetworkResult(success: boolean, error?: Error) {
  if (!success && error) {
    console.error('Network result error:', error.message);
    // In a real implementation, this would show the offline banner
  }
}

export default useNetworkStatus;
