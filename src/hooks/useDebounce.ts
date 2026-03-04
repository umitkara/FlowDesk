import { useCallback, useEffect, useRef } from "react";

/**
 * Returns a debounced version of the provided callback.
 * The callback is invoked after `delayMs` milliseconds of inactivity.
 * Automatically cancelled on unmount.
 */
export function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
    },
    [delayMs],
  );
}
