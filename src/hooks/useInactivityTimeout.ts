import { useEffect, useRef, useCallback } from 'react';

interface UseInactivityTimeoutOptions {
  timeoutMs: number;
  onTimeout: () => void;
  enabled?: boolean;
}

/**
 * Hook that triggers a callback after a period of user inactivity.
 * Tracks mouse, keyboard, scroll, and touch events.
 */
export function useInactivityTimeout({
  timeoutMs,
  onTimeout,
  enabled = true
}: UseInactivityTimeoutOptions) {
  const timeoutRef = useRef<number | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  // Keep callback ref updated to avoid stale closures
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    
    if (enabled) {
      timeoutRef.current = window.setTimeout(() => {
        onTimeoutRef.current();
      }, timeoutMs);
    }
  }, [timeoutMs, enabled]);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Events that indicate user activity
    const events = [
      'mousedown',
      'mousemove', 
      'keydown', 
      'scroll', 
      'touchstart', 
      'click'
    ];

    const handleActivity = () => resetTimer();

    // Add listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Start timer
    resetTimer();

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimer]);

  return { resetTimer };
}
