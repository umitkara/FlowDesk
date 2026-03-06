import { useEffect, useRef } from "react";
import { useTrackerStore } from "../../stores/trackerStore";

/** Fixed banner at the top of the window when a break notification is active. */
export function BreakNotificationBanner() {
  const breakNotification = useTrackerStore((s) => s.breakNotification);
  const dismissBreakNotification = useTrackerStore((s) => s.dismissBreakNotification);
  const snoozeBreak = useTrackerStore((s) => s.snoozeBreak);
  const timerRef = useRef<number | null>(null);

  // Auto-dismiss after 60 seconds
  useEffect(() => {
    if (breakNotification) {
      timerRef.current = window.setTimeout(() => {
        dismissBreakNotification();
      }, 60_000);
    }
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [breakNotification, dismissBreakNotification]);

  if (!breakNotification) return null;

  const handleSnooze = () => {
    snoozeBreak();
    dismissBreakNotification();
  };

  return (
    <div className="relative z-50 flex items-center justify-between bg-amber-400 px-4 py-2 text-amber-900 dark:bg-amber-600 dark:text-amber-50">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <span className="text-sm font-semibold">{breakNotification.title}</span>
          <span className="ml-2 text-sm">{breakNotification.body}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSnooze}
          className="rounded px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-500/50 dark:text-amber-100 dark:hover:bg-amber-700/50"
        >
          Snooze
        </button>
        <button
          onClick={dismissBreakNotification}
          className="rounded px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-500/50 dark:text-amber-100 dark:hover:bg-amber-700/50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
