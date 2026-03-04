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
  entityType: "task" | "note";
  id: string;
  title: string;
  status?: string;
  priority?: string;
}

interface EntitySuggestionListProps {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
}

/** Autocomplete dropdown for @task / @note references in the editor. */
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
      if (event.key === "Enter") {
        if (items[selectedIndex]) {
          command(items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <div className="px-2 py-1 text-xs text-gray-400">No matching tasks</div>
      </div>
    );
  }

  return (
    <div className="max-h-60 min-w-[260px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
      {items.map((item, index) => {
        const statusCfg = item.status
          ? STATUS_CONFIG[item.status as TaskStatus]
          : null;

        return (
          <button
            key={`${item.entityType}-${item.id}`}
            onClick={() => command(item)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
              index === selectedIndex
                ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            <span
              className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${
                item.entityType === "task"
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              }`}
            >
              {item.entityType}
            </span>
            <span className="flex-1 truncate">{item.title}</span>
            {statusCfg && (
              <span className={`flex-shrink-0 text-[10px] ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

EntitySuggestionList.displayName = "EntitySuggestionList";
