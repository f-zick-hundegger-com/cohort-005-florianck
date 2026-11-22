import { useState, useEffect, useCallback } from "react";

export const AUTOPLAY_KEY = "cadence-autoplay";

export function useAutoplay() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(AUTOPLAY_KEY) === "true");
    } catch {
      /* silently fail */
    }
  }, []);

  // The write happens here, not in the setEnabled updater: React may call an
  // updater twice, and it must stay pure.
  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(AUTOPLAY_KEY, String(next));
    } catch {
      /* silently fail */
    }
  }, [enabled]);

  return [enabled, toggle] as const;
}
