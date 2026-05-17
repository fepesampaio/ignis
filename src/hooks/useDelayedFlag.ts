import { useEffect, useState } from 'react';

/**
 * Returns `true` only if `active` stays true for longer than `delayMs`.
 * Useful for hiding loading indicators on fast responses (<300ms),
 * giving a "snappy / invisible loading" feel.
 */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);

  return shown;
}
