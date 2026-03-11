import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { TaskStatus } from "../../../lib/types";
import { STATUS_CONFIG } from "../../../lib/types";

/** A single suggestion item displayed in the autocomplete dropdown. */
export interface SuggestionItem {
  entityType: "task" | "note" | "plan" | "time_entry";
  id: string;
  title: string;
  status?: string;
  priority?: string;
  /** Plan type (time_block, event, etc.) — only set for plan items. */
  planType?: string;
  /** Start time ISO string — only set for plan items. */
  startTime?: string;
  /** Duration string — only set for time_entry items. */
  duration?: string;
}

interface EntitySuggestionListProps {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
}

/** Formats a plan start time for display in the suggestion dropdown. */
function formatPlanTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Today ${time}`;
    if (isTomorrow) return `Tomorrow ${time}`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ` ${time}`;
  } catch {
    return "";
  }
}

/** Autocomplete dropdown for @task / @note / @plan references in the editor. */
export const EntitySuggestionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  EntitySuggestionListProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }), [items, selectedIndex, command]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <div className="px-2 py-1 text-xs text-gray-400">No results</div>
      </div>
    );
  }

  return (
    <div className="max-h-60 min-w-[260px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
      {items.map((item, index) => {
        const isCreate = item.id === "__create__";
        const statusCfg = item.status
          ? STATUS_CONFIG[item.status as TaskStatus]
          : null;

        return (
          <button
            key={`${item.entityType}-${item.id}`}
            onClick={() => command(item)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
              isCreate ? "border-t border-gray-100 dark:border-gray-700/50 " : ""
            }${
              index === selectedIndex
                ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {isCreate ? (
              <>
                <span className="flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  + NEW
                </span>
                <span className="flex-1 truncate">
                  Create task: <span className="font-medium">{item.title}</span>
                </span>
              </>
            ) : (
              <>
                <span
                  className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${
                    item.entityType === "task"
                      ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                      : item.entityType === "plan"
                        ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                        : item.entityType === "time_entry"
                          ? "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400"
                          : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  }`}
                >
                  {item.entityType === "plan" ? (item.planType ?? "plan") : item.entityType === "time_entry" ? "session" : item.entityType}
                </span>
                <span className="flex-1 truncate">{item.title}</span>
                {statusCfg && (
                  <span className={`flex-shrink-0 text-[10px] ${statusCfg.color}`}>
                    {statusCfg.label}
                  </span>
                )}
                {item.startTime && (
                  <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                    {formatPlanTime(item.startTime)}
                  </span>
                )}
                {item.duration && (
                  <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                    {item.duration}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
});

EntitySuggestionList.displayName = "EntitySuggestionList";
