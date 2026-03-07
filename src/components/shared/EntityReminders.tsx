import { useCallback, useEffect, useState } from "react";
import type { Reminder } from "../../lib/types";
import * as ipc from "../../lib/ipc";

const TIMING_OPTIONS = [
  { value: "at_time", label: "At time" },
  { value: "15min_before", label: "15 min before" },
  { value: "1hr_before", label: "1 hour before" },
  { value: "1day_before", label: "1 day before" },
] as const;

interface EntityRemindersProps {
  entityType: "task" | "plan";
  entityId: string;
  referenceTime: string | null;
  workspaceId: string;
  /** Whether reminders are muted for this plan (plans only). */
  remindersMuted?: boolean;
  /** Callback when mute toggle changes (plans only). */
  onMuteChange?: (muted: boolean) => void;
}

export function EntityReminders({
  entityType,
  entityId,
  referenceTime,
  workspaceId,
  remindersMuted,
  onMuteChange,
}: EntityRemindersProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!referenceTime || remindersMuted) {
      setReminders([]);
      return;
    }
    setLoading(true);
    ipc
      .getRemindersForEntity(entityType, entityId)
      .then(setReminders)
      .catch(() => setReminders([]))
      .finally(() => setLoading(false));
  }, [entityType, entityId, referenceTime, remindersMuted]);

  const activeOffsets = new Set<string>(
    reminders.filter((r) => !r.is_fired && !r.is_dismissed).map((r) => r.offset_type),
  );

  const handleToggle = useCallback(
    async (offsetValue: string) => {
      if (!referenceTime) return;
      const current = [...activeOffsets];
      const newOffsets = current.includes(offsetValue)
        ? current.filter((o) => o !== offsetValue)
        : [...current, offsetValue];

      try {
        const updated = await ipc.syncEntityReminders(
          entityType,
          entityId,
          referenceTime,
          workspaceId,
          newOffsets,
        );
        setReminders(updated);
      } catch {
        // best-effort
      }
    },
    [entityType, entityId, referenceTime, workspaceId, activeOffsets],
  );

  const count = activeOffsets.size;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <label className="block text-[10px] font-medium uppercase tracking-wider text-gray-400 cursor-pointer">
          Reminders {count > 0 && `(${count})`}
        </label>
        <svg
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {entityType === "plan" && onMuteChange && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!remindersMuted}
                onChange={(e) => onMuteChange(e.target.checked)}
                className="h-3 w-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">Do not remind</span>
            </label>
          )}
          {remindersMuted ? (
            <p className="text-xs text-gray-400 italic">Reminders are muted for this plan</p>
          ) : !referenceTime ? (
            <p className="text-xs text-gray-400 italic">
              Set a {entityType === "task" ? "due date" : "start time"} to enable reminders
            </p>
          ) : loading ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {TIMING_OPTIONS.map((opt) => {
                const active = activeOffsets.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleToggle(opt.value)}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
