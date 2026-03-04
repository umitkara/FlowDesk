import { useEffect, useState } from "react";
import type { TaskWithChildren, TaskStatus } from "../../lib/types";
import { STATUS_CONFIG } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useTaskStore } from "../../stores/taskStore";

/** Props for the subtask tree component. */
interface SubtaskTreeProps {
  parentTaskId: string;
}

/** Recursive subtask tree renderer for the task detail panel. */
export function SubtaskTree({ parentTaskId }: SubtaskTreeProps) {
  const [subtasks, setSubtasks] = useState<TaskWithChildren[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const createTask = useTaskStore((s) => s.createTask);
  const toggleTaskStatus = useTaskStore((s) => s.toggleTaskStatus);
  const openDetail = useTaskStore((s) => s.openDetail);

  const loadSubtasks = async () => {
    setIsLoading(true);
    try {
      const tree = await ipc.getSubtaskTree(parentTaskId);
      setSubtasks(tree);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSubtasks();
  }, [parentTaskId]);

  const handleAddSubtask = async () => {
    const title = newSubtaskTitle.trim();
    if (!title) return;
    try {
      await createTask({
        workspace_id: "",
        title,
        parent_task_id: parentTaskId,
      });
      setNewSubtaskTitle("");
      setIsAdding(false);
      await loadSubtasks();
    } catch {
      // silently fail
    }
  };

  const handleToggle = async (id: string) => {
    await toggleTaskStatus(id);
    await loadSubtasks();
  };

  if (isLoading && subtasks.length === 0) {
    return <div className="text-xs text-gray-400">Loading subtasks...</div>;
  }

  return (
    <div className="space-y-1">
      {subtasks.map((subtask) => {
        const isDone = subtask.status === "done" || subtask.status === "cancelled";
        const statusCfg = STATUS_CONFIG[subtask.status as TaskStatus] ?? STATUS_CONFIG.inbox;

        return (
          <div key={subtask.id} className="flex items-center gap-2 py-0.5">
            <button
              onClick={() => handleToggle(subtask.id)}
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                isDone
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-gray-300 hover:border-gray-400 dark:border-gray-600"
              }`}
            >
              {isDone && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => openDetail(subtask.id)}
              className={`flex-1 text-left text-xs ${
                isDone
                  ? "text-gray-400 line-through dark:text-gray-500"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {subtask.title}
            </button>
            <span className={`text-[10px] ${statusCfg.color}`}>{statusCfg.label}</span>
          </div>
        );
      })}

      {/* Add subtask input */}
      {isAdding ? (
        <div className="flex items-center gap-1 pt-1">
          <input
            type="text"
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSubtask();
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewSubtaskTitle("");
              }
            }}
            placeholder="Subtask title..."
            autoFocus
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
          <button
            onClick={handleAddSubtask}
            className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700"
          >
            Add
          </button>
          <button
            onClick={() => {
              setIsAdding(false);
              setNewSubtaskTitle("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="mt-1 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
        >
          + Add subtask
        </button>
      )}
    </div>
  );
}
