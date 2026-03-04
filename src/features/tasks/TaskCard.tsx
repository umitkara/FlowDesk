import type { TaskWithChildren, TaskPriority } from "../../lib/types";
import { PRIORITY_CONFIG } from "../../lib/types";
import { useTaskStore } from "../../stores/taskStore";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Props for an individual task card in the Kanban board. */
interface TaskCardProps {
  task: TaskWithChildren;
}

/** Formats a due date for compact card display with overdue detection. */
function formatCardDueDate(dueDate: string | null): { text: string; isOverdue: boolean } {
  if (!dueDate) return { text: "", isOverdue: false };
  const due = new Date(dueDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (diff < 0) return { text: "Overdue", isOverdue: true };
  if (diff === 0) return { text: "Today", isOverdue: false };
  if (diff === 1) return { text: "Tomorrow", isOverdue: false };
  if (diff <= 7) return { text: `${diff}d`, isOverdue: false };
  return {
    text: due.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    isOverdue: false,
  };
}

/** Draggable task card for the Kanban board view. */
export function TaskCard({ task }: TaskCardProps) {
  const openDetail = useTaskStore((s) => s.openDetail);
  const toggleTaskStatus = useTaskStore((s) => s.toggleTaskStatus);

  const priorityCfg = PRIORITY_CONFIG[task.priority as TaskPriority] ?? PRIORITY_CONFIG.none;
  const { text: dueText, isOverdue } = formatCardDueDate(task.due_date);
  const isDone = task.status === "done" || task.status === "cancelled";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group cursor-grab rounded-lg border bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing dark:bg-gray-900 ${
        isOverdue && !isDone
          ? "border-red-200 dark:border-red-800/50"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      {/* Title row */}
      <div className="flex items-start gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskStatus(task.id);
          }}
          className={`mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border ${
            isDone
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 hover:border-gray-400 dark:border-gray-600"
          }`}
        >
          {isDone && (
            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
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
            e.stopPropagation();
            openDetail(task.id);
          }}
          className={`text-left text-xs font-medium leading-tight ${
            isDone
              ? "text-gray-400 line-through dark:text-gray-500"
              : "text-gray-800 dark:text-gray-200"
          }`}
        >
          {task.is_sticky && (
            <span className="mr-0.5 text-amber-500" title="Sticky">
              &#128204;
            </span>
          )}
          {task.title}
        </button>
      </div>

      {/* Meta row */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {task.priority !== "none" && (
          <span className={`text-[10px] font-medium ${priorityCfg.color}`}>
            {priorityCfg.label}
          </span>
        )}
        {dueText && (
          <span
            className={`text-[10px] ${
              isOverdue && !isDone
                ? "font-medium text-red-500"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {dueText}
          </span>
        )}
        {task.subtask_count > 0 && (
          <span className="text-[10px] text-gray-400">
            {task.completed_subtask_count}/{task.subtask_count}
          </span>
        )}
      </div>

      {/* Tags */}
      {(task.tags ?? []).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(task.tags ?? []).slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
          {(task.tags ?? []).length > 2 && (
            <span className="text-[9px] text-gray-400">
              +{(task.tags ?? []).length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
