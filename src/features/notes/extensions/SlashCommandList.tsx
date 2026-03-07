import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from "react";
import { useTaskStore } from "../../../stores/taskStore";
import { getCachedTasks, invalidateCache } from "./suggestionCache";
import type { TaskWithChildren } from "../../../lib/types";

export interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  /** The title text typed after the command (e.g., "Buy milk" in "/task Buy milk"). */
  title: string;
}

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem & { taskId?: string }) => void;
}

export const SlashCommandList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  SlashCommandListProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [phase, setPhase] = useState<"command" | "pick_parent">("command");
  const [pendingTitle, setPendingTitle] = useState("");
  const [parentCandidates, setParentCandidates] = useState<TaskWithChildren[]>([]);
  const [parentFilter, setParentFilter] = useState("");
  const [parentIndex, setParentIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const filteredParents = parentFilter
    ? parentCandidates.filter((t) =>
        t.title.toLowerCase().includes(parentFilter.toLowerCase())
      )
    : parentCandidates;

  useEffect(() => {
    setParentIndex(0);
  }, [parentFilter]);

  const createTask = useCallback(
    async (title: string, parentTaskId?: string) => {
      if (!title.trim()) {
        command({ id: "", label: "", description: "", title: "" });
        return;
      }
      try {
        const task = await useTaskStore.getState().createTask({
          workspace_id: "",
          title: title.trim(),
          parent_task_id: parentTaskId,
        });
        invalidateCache();
        command({
          id: parentTaskId ? "subtask" : "task",
          label: "",
          description: "",
          title,
          taskId: task.id,
        });
      } catch {
        command({ id: "", label: "", description: "", title: "" });
      }
    },
    [command]
  );

  const handleCommandSelect = useCallback(
    (item: SlashCommandItem) => {
      if (item.id === "subtask") {
        if (!item.title.trim()) {
          // No title yet — cancel
          command({ id: "", label: "", description: "", title: "" });
          return;
        }
        setPendingTitle(item.title.trim());
        setParentCandidates(getCachedTasks());
        setPhase("pick_parent");
      } else {
        createTask(item.title);
      }
    },
    [command, createTask]
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (phase === "pick_parent") {
        if (event.key === "ArrowUp") {
          setParentIndex((i) =>
            (i + filteredParents.length - 1) % filteredParents.length
          );
          return true;
        }
        if (event.key === "ArrowDown") {
          setParentIndex((i) => (i + 1) % filteredParents.length);
          return true;
        }
        if (event.key === "Enter") {
          const parent = filteredParents[parentIndex];
          if (parent) {
            createTask(pendingTitle, parent.id);
          }
          return true;
        }
        if (event.key === "Backspace" && parentFilter.length > 0) {
          setParentFilter((f) => f.slice(0, -1));
          return true;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          setParentFilter((f) => f + event.key);
          return true;
        }
        return false;
      }

      // Phase: command
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
          handleCommandSelect(items[selectedIndex]);
        }
        return true;
      }
      return false;
    },
  }));

  // Parent picker phase
  if (phase === "pick_parent") {
    return (
      <div className="max-h-72 min-w-[280px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-700/50">
          <div className="text-[10px] font-medium uppercase text-gray-400 dark:text-gray-500">
            Pick parent for: <span className="text-gray-600 dark:text-gray-300">{pendingTitle}</span>
          </div>
          {parentFilter && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Filter: {parentFilter}
            </div>
          )}
        </div>
        {filteredParents.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">No tasks found</div>
        ) : (
          filteredParents.slice(0, 10).map((task, index) => (
            <button
              key={task.id}
              onClick={() => createTask(pendingTitle, task.id)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                index === parentIndex
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              <span className="flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                TASK
              </span>
              <span className="flex-1 truncate">{task.title}</span>
            </button>
          ))
        )}
      </div>
    );
  }

  // Command phase
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <div className="px-2 py-1 text-xs text-gray-400">No commands</div>
      </div>
    );
  }

  return (
    <div className="max-h-60 min-w-[280px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
      {items.map((item, index) => (
        <button
          key={item.id}
          onClick={() => handleCommandSelect(item)}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
            index === selectedIndex
              ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          <span className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            /{item.id}
          </span>
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">
              {item.title
                ? `${item.label}: ${item.title}`
                : item.label}
            </div>
            <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">
              {item.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
});

SlashCommandList.displayName = "SlashCommandList";
