import { useEffect, useRef } from "react";
import { useReminderStore } from "../../stores/reminderStore";
import type { FiredReminderEntry } from "../../stores/reminderStore";

/** Auto-dismiss timeout per reminder in ms. */
const AUTO_DISMISS_MS = 60_000;

function ReminderItem({ entry }: { entry: FiredReminderEntry }) {
  const dismissReminder = useReminderStore((s) => s.dismissReminder);
  const removeFiredReminder = useReminderStore((s) => s.removeFiredReminder);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      removeFiredReminder(entry.id);
    }, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [entry.id, removeFiredReminder]);

  const label = entry.entityType === "task" ? "Task due" : "Plan starting";

  return (
    <div className="flex items-center justify-between gap-2 bg-blue-500 px-4 py-2 text-white dark:bg-blue-600">
      <div className="flex items-center gap-2 min-w-0">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span className="text-sm font-semibold truncate">{label}: {entry.title}</span>
      </div>
      <button
        onClick={() => dismissReminder(entry.id)}
        className="rounded px-2.5 py-1 text-xs font-medium text-blue-100 hover:bg-blue-600/50 dark:hover:bg-blue-700/50 flex-shrink-0"
      >
        Dismiss
      </button>
    </div>
  );
}

export function ReminderNotificationBanner() {
  const firedReminders = useReminderStore((s) => s.firedReminders);

  if (firedReminders.length === 0) return null;

  return (
    <div className="relative z-50 flex flex-col">
      {firedReminders.map((entry) => (
        <ReminderItem key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
