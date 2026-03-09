import { useState, useEffect } from "react";
import type { TimeEntry } from "../../lib/types";
import * as ipc from "../../lib/ipc";

/** Compact list of time entry sessions for a task. */
export function TaskTimeLog({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    ipc
      .getEntriesForTask(taskId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return <div className="text-[10px] text-gray-400">Loading...</div>;
  }

  if (entries.length === 0) {
    return <div className="text-[10px] text-gray-400">No tracked time yet</div>;
  }

  const totalMins = entries.reduce((sum, e) => sum + (e.active_mins ?? 0), 0);

  return (
    <div className="space-y-1">
      {entries.map((e) => {
        const date = new Date(e.start_time).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        const mins = e.active_mins ?? 0;
        const hrs = Math.floor(mins / 60);
        const rem = Math.round(mins % 60);
        const dur = hrs > 0 ? `${hrs}h ${rem}m` : `${rem}m`;
        const note = e.notes ? e.notes.slice(0, 60) : "";

        return (
          <div
            key={e.id}
            className="flex items-center gap-2 rounded px-1 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <span className="flex-shrink-0 text-gray-400">{date}</span>
            <span className="flex-shrink-0 font-medium">{dur}</span>
            {note && (
              <span className="min-w-0 flex-1 truncate text-gray-400">
                {note}
              </span>
            )}
          </div>
        );
      })}
      <div className="border-t border-gray-100 pt-1 text-[10px] font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Total: {Math.floor(totalMins / 60)}h {Math.round(totalMins % 60)}m across{" "}
        {entries.length} session{entries.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
