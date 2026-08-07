import { useEffect, useRef } from 'react';
import { subscribeAutoRefresh } from './autoRefreshCoordinator';

export default function useAutoRefresh(enabled: boolean, callback: () => void): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeAutoRefresh(() => callbackRef.current());
  }, [enabled]);
}
