import { useState, useEffect, useCallback } from "react";
import type { ActivityEntry } from "../../lib/types";
import * as ipc from "../../lib/ipc";

interface SessionActivityLogProps {
  startedAt: string;
  endTime?: string | null;
  workspaceId: string;
  compact?: boolean;
  collapsible?: boolean;
}

const ACTION_COLORS: Record<string, string> = {
  created: "text-emerald-600 dark:text-emerald-400",
  updated: "text-blue-500 dark:text-blue-400",
  deleted: "text-red-500 dark:text-red-400",
  completed: "text-emerald-600 dark:text-emerald-400",
  status_changed: "text-amber-500 dark:text-amber-400",
  restored: "text-violet-500 dark:text-violet-400",
  hard_deleted: "text-red-600 dark:text-red-500",
};

const ENTITY_ICONS: Record<string, string> = {
  note: "N",
  task: "T",
  plan: "P",
};

const ENTITY_COLORS: Record<string, string> = {
  note: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  task: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  plan: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
};

function formatAction(action: string): string {
  switch (action) {
    case "created": return "Created";
    case "updated": return "Updated";
    case "deleted": return "Deleted";
    case "completed": return "Completed";
    case "status_changed": return "Status changed";
    case "restored": return "Restored";
    case "hard_deleted": return "Permanently deleted";
    default: return action;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function filterEntries(entries: ActivityEntry[]): ActivityEntry[] {
  return entries.filter(
    (e) => !(e.entity_type === "note" && e.action === "updated"),
  );
}

export function SessionActivityLog({
  startedAt,
  endTime,
  workspaceId,
  compact,
  collapsible,
}: SessionActivityLogProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!collapsible);

  const fetchActivity = useCallback(async () => {
    if (!workspaceId || !startedAt) return;
    setIsLoading(true);
    try {
      const raw = await ipc.listActivity({
        workspace_id: workspaceId,
        date_from: startedAt,
        date_to: endTime || new Date().toISOString(),
        limit: 200,
      });
      setEntries(filterEntries(raw));
    } catch {
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, startedAt, endTime]);

  // Non-collapsible: fetch on mount
  useEffect(() => {
    if (!collapsible) {
      fetchActivity();
    }
  }, [collapsible, fetchActivity]);

  // Collapsible: fetch on expand
  useEffect(() => {
    if (collapsible && isExpanded) {
      fetchActivity();
    }
  }, [collapsible, isExpanded, fetchActivity]);

  const handleToggle = () => {
    setIsExpanded((prev) => !prev);
  };

  const textSize = compact ? "text-[10px]" : "text-xs";

  return (
    <div className={collapsible ? "mt-3 border-t border-gray-100 pt-2 dark:border-gray-800" : "mt-4"}>
      {/* Header */}
      <button
        type="button"
        onClick={collapsible ? handleToggle : undefined}
        className={`flex w-full items-center gap-1.5 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
      >
        {collapsible && (
          <svg
            className={`h-3 w-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
        <span className={`${compact ? "text-[10px]" : "text-xs"} font-semibold uppercase tracking-wider text-gray-400`}>
          Session Activity
        </span>
        {entries.length > 0 && (
          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
            {entries.length}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className={`mt-1 ${compact ? "max-h-32" : "max-h-36"} overflow-y-auto ${!compact ? "rounded-lg bg-gray-50 p-2 dark:bg-gray-800" : ""}`}>
          {isLoading ? (
            <p className={`${textSize} text-gray-400`}>Loading...</p>
          ) : entries.length === 0 ? (
            <p className={`${textSize} text-gray-400`}>No activity recorded</p>
          ) : (
            <div className="space-y-0.5">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-1.5 ${compact ? "py-0.5" : "py-1"}`}
                >
                  {/* Entity type pill */}
                  <span
                    className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-bold leading-none ${ENTITY_COLORS[entry.entity_type] || "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"}`}
                  >
                    {ENTITY_ICONS[entry.entity_type] || "?"}
                  </span>

                  {/* Action */}
                  <span
                    className={`flex-shrink-0 ${textSize} font-medium ${ACTION_COLORS[entry.action] || "text-gray-500"}`}
                  >
                    {formatAction(entry.action)}
                  </span>

                  {/* Title */}
                  <span className={`min-w-0 flex-1 truncate ${textSize} text-gray-600 dark:text-gray-300`}>
                    {entry.entity_title || entry.entity_id}
                  </span>

                  {/* Time */}
                  <span className={`flex-shrink-0 ${textSize} text-gray-400`}>
                    {formatTime(entry.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
