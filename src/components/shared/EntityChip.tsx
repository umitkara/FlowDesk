import { useEffect, useState } from "react";
import type { Task, TaskStatus } from "../../lib/types";
import { STATUS_CONFIG } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useTaskStore } from "../../stores/taskStore";

/** Props for the inline entity reference chip. */
interface EntityChipProps {
  entityType: "task" | "note";
  entityId: string;
}

/** Inline entity reference chip rendered in the note editor for @task[id] references. */
export function EntityChip({ entityType, entityId }: EntityChipProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const toggleTaskStatus = useTaskStore((s) => s.toggleTaskStatus);
  const openDetail = useTaskStore((s) => s.openDetail);

  useEffect(() => {
    if (entityType !== "task") {
      setIsLoading(false);
      return;
    }
    const fetchTask = async () => {
      try {
        const t = await ipc.getTask(entityId);
        setTask(t);
      } catch {
        // task not found
      } finally {
        setIsLoading(false);
      }
    };
    fetchTask();
  }, [entityType, entityId]);

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400 dark:bg-gray-800">
        Loading...
      </span>
    );
  }

  if (entityType === "task" && task) {
    const isDone = task.status === "done" || task.status === "cancelled";
    const statusCfg = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.inbox;

    return (
      <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTaskStatus(entityId);
          }}
          className={`flex h-3 w-3 items-center justify-center rounded-sm border ${
            isDone
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 dark:border-gray-600"
          }`}
        >
          {isDone && (
            <svg className="h-2 w-2" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openDetail(entityId);
          }}
          className={`text-[10px] font-medium ${
            isDone
              ? "text-gray-400 line-through"
              : "text-gray-700 dark:text-gray-300"
          }`}
        >
          {task.title}
        </button>
        <span className={`text-[9px] ${statusCfg.color}`}>{statusCfg.label}</span>
      </span>
    );
  }

  // Fallback for unknown entity types or missing entities
  return (
    <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-400 dark:bg-red-900/20">
      {entityType}:{entityId.slice(0, 8)}...
    </span>
  );
}
