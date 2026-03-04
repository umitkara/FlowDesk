import { useState, useEffect, useRef } from "react";
import { useTaskStore } from "../../stores/taskStore";
import * as ipc from "../../lib/ipc";
import type { TaskStatus, TaskPriority } from "../../lib/types";

/** Quick-add task modal accessible via Ctrl+Shift+T from anywhere. */
export function TaskQuickAdd() {
  const isOpen = useTaskStore((s) => s.isQuickAddOpen);
  const closeQuickAdd = useTaskStore((s) => s.closeQuickAdd);
  const createTask = useTaskStore((s) => s.createTask);
  const openDetail = useTaskStore((s) => s.openDetail);
  const quickAddInitialStatus = useTaskStore((s) => s.quickAddInitialStatus);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>("inbox");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [isSticky, setIsSticky] = useState(false);
  const [parentTaskOptions, setParentTaskOptions] = useState<{ id: string; title: string }[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStatus(quickAddInitialStatus ?? "inbox");
      setPriority("none");
      setDueDate("");
      setCategory("");
      setTags("");
      setTitle("");
      setParentTaskId("");
      setIsSticky(false);
      setTimeout(() => titleRef.current?.focus(), 50);
      // Load parent task options
      ipc.listWorkspaces().then(async (ws) => {
        if (!ws.length) return;
        const tasks = await ipc.listTasks(
          { workspace_id: ws[0].id },
          { field: "updated_at", direction: "desc" },
        );
        setParentTaskOptions(tasks.map((t) => ({ id: t.id, title: t.title })));
      }).catch(() => {});
    }
  }, [isOpen, quickAddInitialStatus]);

  if (!isOpen) return null;

  const resetForm = () => {
    setTitle("");
    setDueDate("");
    setCategory("");
    setTags("");
    setParentTaskId("");
    setIsSticky(false);
  };

  const handleCreate = async (keepOpen: boolean, openDetailAfter: boolean) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    try {
      const task = await createTask({
        workspace_id: "",
        title: trimmed,
        status,
        priority,
        due_date: dueDate || undefined,
        category: category || undefined,
        tags: tags
          ? tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
        parent_task_id: parentTaskId || undefined,
        is_sticky: isSticky || undefined,
      });

      if (openDetailAfter) {
        closeQuickAdd();
        openDetail(task.id);
      } else if (keepOpen) {
        resetForm();
        titleRef.current?.focus();
      } else {
        closeQuickAdd();
      }
    } catch {
      // silently fail
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closeQuickAdd();
      return;
    }
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        handleCreate(false, true);
      } else if (e.shiftKey) {
        handleCreate(true, false);
      } else {
        handleCreate(false, false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50"
        onClick={closeQuickAdd}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Quick Add Task
          </h3>
          <button
            onClick={closeQuickAdd}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form body */}
        <div className="space-y-3 px-4 py-3">
          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          />

          {/* Status + Priority row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                <option value="inbox">Inbox</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Due date + Category row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Optional..."
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Tags
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma-separated tags..."
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
          </div>

          {/* Parent Task */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Parent Task
            </label>
            <select
              value={parentTaskId}
              onChange={(e) => setParentTaskId(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="">None (top-level)</option>
              {parentTaskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          {/* Sticky */}
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Sticky
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={isSticky}
              onClick={() => setIsSticky((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                isSticky ? "bg-primary-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isSticky ? "translate-x-4" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex gap-2 text-[10px] text-gray-400">
            <span>
              <kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-gray-800">Enter</kbd> Create
            </span>
            <span>
              <kbd className="rounded bg-gray-100 px-1 py-0.5 font-mono dark:bg-gray-800">Shift+Enter</kbd> Create & New
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeQuickAdd}
              className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={() => handleCreate(false, false)}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              Create Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
