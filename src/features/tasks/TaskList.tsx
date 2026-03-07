import { useEffect, useState, useCallback } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { TaskRow } from "./TaskRow";
import { TaskFilters } from "./TaskFilters";
import { BulkMoveToWorkspaceMenu } from "../../components/shared/BulkMoveToWorkspaceMenu";
import type { TaskPriority, TaskSort, TaskWithChildren } from "../../lib/types";

/** Builds a flat list of rows in depth-first order for tree display. */
function buildTreeRows(tasks: TaskWithChildren[], collapsedIds: Set<string>) {
  const childrenMap = new Map<string | null, TaskWithChildren[]>();
  const visibleIds = new Set(tasks.map((t) => t.id));

  for (const task of tasks) {
    const key =
      task.parent_task_id && visibleIds.has(task.parent_task_id)
        ? task.parent_task_id
        : null;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(task);
  }

  const rows: { task: TaskWithChildren; depth: number; hasChildren: boolean }[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const task of childrenMap.get(parentId) ?? []) {
      const kids = childrenMap.get(task.id) ?? [];
      rows.push({ task, depth, hasChildren: kids.length > 0 });
      if (!collapsedIds.has(task.id)) visit(task.id, depth + 1);
    }
  }
  visit(null, 0);
  return rows;
}

/** Column header configuration for task list sorting. */
const SORTABLE_COLUMNS: { field: TaskSort["field"]; label: string; className: string }[] = [
  { field: "title", label: "Title", className: "text-left" },
  { field: "status", label: "Status", className: "w-24" },
  { field: "priority", label: "Priority", className: "w-20" },
  { field: "due_date", label: "Due Date", className: "w-24" },
];

/** Sortable, filterable task table with bulk operations. */
export function TaskList() {
  const tasks = useTaskStore((s) => s.tasks);
  const isLoading = useTaskStore((s) => s.isLoading);
  const sort = useTaskStore((s) => s.sort);
  const setSort = useTaskStore((s) => s.setSort);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const selectedTaskIds = useTaskStore((s) => s.selectedTaskIds);
  const selectAll = useTaskStore((s) => s.selectAll);
  const clearSelection = useTaskStore((s) => s.clearSelection);
  const bulkUpdateStatus = useTaskStore((s) => s.bulkUpdateStatus);
  const bulkAddTags = useTaskStore((s) => s.bulkAddTags);
  const bulkDelete = useTaskStore((s) => s.bulkDelete);
  const openQuickAdd = useTaskStore((s) => s.openQuickAdd);
  const toggleTaskStatus = useTaskStore((s) => s.toggleTaskStatus);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const treeMode = useTaskStore((s) => s.treeMode);

  const [bulkTagInput, setBulkTagInput] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [showBulkTagInput, setShowBulkTagInput] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSort = (field: TaskSort["field"]) => {
    if (sort.field === field) {
      setSort({ field, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      setSort({ field, direction: "desc" });
    }
  };

  const handleBulkTagSubmit = async () => {
    const tags = bulkTagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length > 0) {
      await bulkAddTags(tags);
    }
    setBulkTagInput("");
    setShowBulkTagInput(false);
  };

  // Keyboard shortcuts for task list
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle when not focused on an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      // Ctrl+A / Cmd+A: select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        selectAll();
        return;
      }

      // Space: toggle focused task status
      if (e.key === " " && focusedTaskId) {
        e.preventDefault();
        toggleTaskStatus(focusedTaskId);
        return;
      }

      // Delete/Backspace: delete selected or focused task
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedTaskIds.size > 0) {
          e.preventDefault();
          bulkDelete();
        } else if (focusedTaskId) {
          e.preventDefault();
          deleteTask(focusedTaskId);
        }
        return;
      }

      // 1-5: set priority for focused task
      const priorityMap: Record<string, string> = {
        "1": "none",
        "2": "low",
        "3": "medium",
        "4": "high",
        "5": "urgent",
      };
      if (priorityMap[e.key] && focusedTaskId && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        updateTask(focusedTaskId, { priority: priorityMap[e.key] as TaskPriority });
        return;
      }
    },
    [focusedTaskId, selectedTaskIds, selectAll, toggleTaskStatus, bulkDelete, deleteTask, updateTask],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const allSelected = tasks.length > 0 && selectedTaskIds.size === tasks.length;

  return (
    <div className="flex h-full flex-col">
      <TaskFilters />

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-1.5 dark:border-gray-800">
        <button
          onClick={() => openQuickAdd()}
          className="rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700"
        >
          + New Task
        </button>
        <span className="text-xs text-gray-400">{tasks.length} tasks</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading && tasks.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">No tasks found</p>
              <p className="mt-1 text-xs text-gray-400">
                Create one with{" "}
                <kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[10px] dark:bg-gray-800">
                  Ctrl+Shift+T
                </kbd>
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => (allSelected ? clearSelection() : selectAll())}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
                  />
                </th>
                <th className="w-8 px-1 py-2" />
                {SORTABLE_COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    className={`cursor-pointer px-2 py-2 text-left font-medium hover:text-gray-700 dark:hover:text-gray-300 ${col.className}`}
                    onClick={() => handleSort(col.field)}
                  >
                    {col.label}
                    {sort.field === col.field && (
                      <span className="ml-1">{sort.direction === "asc" ? "\u2191" : "\u2193"}</span>
                    )}
                  </th>
                ))}
                <th className="w-32 px-2 py-2 text-left font-medium">Tags</th>
              </tr>
            </thead>
            <tbody>
              {treeMode
                ? buildTreeRows(tasks, collapsedIds).map(({ task, depth, hasChildren }) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      depth={depth}
                      hasChildren={hasChildren}
                      isCollapsed={collapsedIds.has(task.id)}
                      onToggleCollapse={() => {
                        setCollapsedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(task.id)) next.delete(task.id);
                          else next.add(task.id);
                          return next;
                        });
                      }}
                      isFocused={focusedTaskId === task.id}
                      onFocus={() => setFocusedTaskId(task.id)}
                    />
                  ))
                : tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isFocused={focusedTaskId === task.id}
                      onFocus={() => setFocusedTaskId(task.id)}
                    />
                  ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedTaskIds.size > 0 && (
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {selectedTaskIds.size} selected
          </span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkUpdateStatus(e.target.value);
              e.target.value = "";
            }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="" disabled>
              Set Status...
            </option>
            <option value="inbox">Inbox</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {showBulkTagInput ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleBulkTagSubmit();
                  if (e.key === "Escape") setShowBulkTagInput(false);
                }}
                placeholder="tag1, tag2..."
                autoFocus
                className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
              <button
                onClick={handleBulkTagSubmit}
                className="rounded-md bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-700"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowBulkTagInput(true)}
              className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Add Tags
            </button>
          )}
          <BulkMoveToWorkspaceMenu
            entityIds={Array.from(selectedTaskIds)}
            entityType="task"
            onMoved={() => { clearSelection(); fetchTasks(); }}
          />
          <button
            onClick={() => bulkDelete()}
            className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
