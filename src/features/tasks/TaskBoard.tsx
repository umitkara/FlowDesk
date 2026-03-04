import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { useTaskStore } from "../../stores/taskStore";
import { TaskCard } from "./TaskCard";
import { TaskFilters } from "./TaskFilters";
import type { TaskWithChildren, TaskStatus } from "../../lib/types";
import { STATUS_CONFIG } from "../../lib/types";

/** Kanban column status order. */
const BOARD_COLUMNS: TaskStatus[] = ["inbox", "todo", "in_progress", "done", "cancelled"];

/** Props for a single Kanban column. */
interface BoardColumnProps {
  status: TaskStatus;
  tasks: TaskWithChildren[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

/** A single droppable Kanban column. */
function BoardColumn({ status, tasks, isCollapsed, onToggleCollapse }: BoardColumnProps) {
  const cfg = STATUS_CONFIG[status];
  const openQuickAdd = useTaskStore((s) => s.openQuickAdd);

  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className={`flex w-56 flex-shrink-0 flex-col rounded-lg bg-gray-50 dark:bg-gray-900/50 ${
        isOver ? "ring-2 ring-primary-400" : ""
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5"
        >
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
          <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            {tasks.length}
          </span>
          <svg
            className={`h-3 w-3 text-gray-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          onClick={() => openQuickAdd(status)}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          title={`Add task to ${cfg.label}`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Cards container */}
      {!isCollapsed && (
        <div ref={setNodeRef} className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </SortableContext>
          {tasks.length === 0 && (
            <div className="py-4 text-center text-[10px] text-gray-400 dark:text-gray-500">
              No tasks
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Kanban board view with drag-and-drop between status columns. */
export function TaskBoard() {
  const tasks = useTaskStore((s) => s.tasks);
  const moveTaskStatus = useTaskStore((s) => s.moveTaskStatus);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const [activeTask, setActiveTask] = useState<TaskWithChildren | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    done: true,
    cancelled: true,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Group tasks by status
  const tasksByStatus: Record<string, TaskWithChildren[]> = {};
  for (const status of BOARD_COLUMNS) {
    tasksByStatus[status] = [];
  }
  for (const task of tasks) {
    const col = tasksByStatus[task.status];
    if (col) col.push(task);
    else if (tasksByStatus.inbox) tasksByStatus.inbox.push(task);
  }

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    let targetStatus: string | null = null;

    // Check if dropped onto a column (droppable ID is the status)
    if (BOARD_COLUMNS.includes(over.id as TaskStatus)) {
      targetStatus = over.id as string;
    } else {
      // Dropped onto a task card — find which column that task is in
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) targetStatus = overTask.status;
    }

    if (targetStatus) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== targetStatus) {
        await moveTaskStatus(taskId, targetStatus);
        await fetchTasks();
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TaskFilters />

      <div className="flex flex-1 gap-3 overflow-x-auto p-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {BOARD_COLUMNS.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              isCollapsed={!!collapsed[status]}
              onToggleCollapse={() =>
                setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }))
              }
            />
          ))}

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} />}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
