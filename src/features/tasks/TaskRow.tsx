import { useState } from "react";
import type { TaskWithChildren, TaskStatus, TaskPriority } from "../../lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "../../lib/types";
import { useTaskStore } from "../../stores/taskStore";

/** Props for an individual task row component. */
interface TaskRowProps {
  task: TaskWithChildren;
  depth?: number;
  isFocused?: boolean;
  onFocus?: () => void;
  hasChildren?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** Formats a due date for display with overdue highlighting. */
function formatDueDate(dueDate: string | null): { text: string; isOverdue: boolean } {
  if (!dueDate) return { text: "-", isOverdue: false };
  const due = new Date(dueDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (diff < 0) return { text: "Overdue", isOverdue: true };
  if (diff === 0) return { text: "Today", isOverdue: false };
  if (diff === 1) return { text: "Tomorrow", isOverdue: false };
  if (diff <= 7) return { text: `In ${diff} days`, isOverdue: false };
  return {
    text: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    isOverdue: false,
  };
}

/** Individual task row for the list view with inline status/priority editing. */
export function TaskRow({ task, depth = 0, isFocused, onFocus, hasChildren, isCollapsed, onToggleCollapse }: TaskRowProps) {
  const toggleTaskStatus = useTaskStore((s) => s.toggleTaskStatus);
  const toggleTaskSelection = useTaskStore((s) => s.toggleTaskSelection);
  const selectedTaskIds = useTaskStore((s) => s.selectedTaskIds);
  const openDetail = useTaskStore((s) => s.openDetail);
  const updateTask = useTaskStore((s) => s.updateTask);

  const [editingStatus, setEditingStatus] = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);

  const isSelected = selectedTaskIds.has(task.id);
  const statusCfg = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.inbox;
  const priorityCfg = PRIORITY_CONFIG[task.priority as TaskPriority] ?? PRIORITY_CONFIG.none;
  const { text: dueText, isOverdue } = formatDueDate(task.due_date);
  const isDone = task.status === "done" || task.status === "cancelled";

  return (
    <tr
      onClick={onFocus}
      draggable
      data-task-id={task.id}
      data-task-title={task.title}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.setData("application/x-task-id", task.id);
        e.dataTransfer.setData("application/x-task-title", task.title);
      }}
      className={`task-draggable group border-b border-gray-100 text-sm transition-colors hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-gray-900/50 ${
        isOverdue && !isDone ? "bg-red-50/50 dark:bg-red-950/20" : ""
      } ${isFocused ? "ring-1 ring-inset ring-primary-300 dark:ring-primary-700" : ""}`}
    >
      {/* Checkbox */}
      <td className="w-8 px-2 py-2">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleTaskSelection(task.id)}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
        />
      </td>

      {/* Status toggle */}
      <td className="w-8 px-1 py-2">
        <button
          onClick={() => toggleTaskStatus(task.id)}
          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
            isDone
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 hover:border-gray-400 dark:border-gray-600"
          }`}
          title={isDone ? "Mark incomplete" : "Mark complete"}
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
      </td>

      {/* Title */}
      <td className="px-2 py-2" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <div className="flex items-center gap-1">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
              className="flex h-3 w-3 items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? "▶" : "▼"}
            </button>
          ) : (
            <span className="w-3" />
          )}
        <button
          onClick={() => openDetail(task.id)}
          className={`text-left text-sm font-medium ${
            isDone
              ? "text-gray-400 line-through dark:text-gray-500"
              : "text-gray-800 dark:text-gray-200"
          }`}
        >
          {task.is_sticky && (
            <span className="mr-1 text-xs text-amber-500" title="Sticky task">
              &#128204;
            </span>
          )}
          {task.title}
        </button>
        {task.subtask_count > 0 && (
          <span className="ml-2 text-xs text-gray-400">
            {task.completed_subtask_count}/{task.subtask_count}
          </span>
        )}
        </div>
      </td>

      {/* Status — inline editable */}
      <td className="w-24 px-2 py-2">
        {editingStatus ? (
          <select
            value={task.status}
            autoFocus
            onChange={async (e) => {
              await updateTask(task.id, { status: e.target.value as TaskStatus });
              setEditingStatus(false);
            }}
            onBlur={() => setEditingStatus(false)}
            className="w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {(Object.entries(STATUS_CONFIG) as [TaskStatus, (typeof STATUS_CONFIG)[TaskStatus]][]).map(
              ([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ),
            )}
          </select>
        ) : (
          <button
            onClick={() => setEditingStatus(true)}
            className={`text-xs ${statusCfg.color} hover:underline`}
          >
            {statusCfg.label}
          </button>
        )}
      </td>

      {/* Priority — inline editable */}
      <td className="w-20 px-2 py-2">
        {editingPriority ? (
          <select
            value={task.priority}
            autoFocus
            onChange={async (e) => {
              await updateTask(task.id, { priority: e.target.value as TaskPriority });
              setEditingPriority(false);
            }}
            onBlur={() => setEditingPriority(false)}
            className="w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, (typeof PRIORITY_CONFIG)[TaskPriority]][]).map(
              ([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ),
            )}
          </select>
        ) : (
          <button
            onClick={() => setEditingPriority(true)}
            className={`text-xs font-medium ${priorityCfg.color} hover:underline`}
          >
            {priorityCfg.label}
          </button>
        )}
      </td>

      {/* Due Date */}
      <td className={`w-24 px-2 py-2 text-xs ${isOverdue && !isDone ? "font-medium text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
        {dueText}
      </td>

      {/* Tags */}
      <td className="w-32 px-2 py-2">
        <div className="flex flex-wrap gap-1">
          {(task.tags ?? []).slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
          {(task.tags ?? []).length > 2 && (
            <span className="text-[10px] text-gray-400">
              +{(task.tags ?? []).length - 2}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
