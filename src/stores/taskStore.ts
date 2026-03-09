import { create } from "zustand";
import { ask } from "@tauri-apps/plugin-dialog";
import * as ipc from "../lib/ipc";
import { logActivity } from "../lib/activityLog";
import { reportError } from "../lib/errorReporting";
import type {
  Task,
  TaskWithChildren,
  TaskFilter,
  TaskSort,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
} from "../lib/types";

/** State and actions for task management. */
interface TaskState {
  /** Listed tasks matching current filters. */
  tasks: TaskWithChildren[];
  /** The currently selected/detail task. */
  selectedTask: Task | null;
  /** Set of task IDs selected for bulk operations. */
  selectedTaskIds: Set<string>;
  /** Active sticky tasks. */
  stickyTasks: Task[];

  /** Current view mode. */
  viewMode: "list" | "board";
  /** Whether the list view is in hierarchical tree mode. */
  treeMode: boolean;
  /** Active filter configuration. */
  filter: Partial<TaskFilter>;
  /** Active sort configuration. */
  sort: TaskSort;
  /** Whether the detail panel is open. */
  isDetailOpen: boolean;
  /** Whether the quick-add modal is open. */
  isQuickAddOpen: boolean;
  /** Initial status for quick-add (set when adding from board column). */
  quickAddInitialStatus: TaskStatus | undefined;
  /** Whether a task list load is in progress. */
  isLoading: boolean;
  /** Error message from the last operation. */
  error: string | null;

  /** Fetches tasks matching current filter and sort. */
  fetchTasks: () => Promise<void>;
  /** Fetches sticky tasks for the workspace. */
  fetchStickyTasks: () => Promise<void>;
  /** Creates a new task. */
  createTask: (input: CreateTaskInput) => Promise<Task>;
  /** Updates an existing task. */
  updateTask: (id: string, updates: UpdateTaskInput) => Promise<Task>;
  /** Soft-deletes a task. */
  deleteTask: (id: string) => Promise<void>;
  /** Restores a soft-deleted task. */
  restoreTask: (id: string) => Promise<Task>;
  /** Toggles a task between todo and done. */
  toggleTaskStatus: (id: string) => Promise<Task>;
  /** Moves a task to a new status (Kanban). */
  moveTaskStatus: (id: string, newStatus: string) => Promise<Task>;

  /** Bulk update status for selected tasks. */
  bulkUpdateStatus: (status: string) => Promise<void>;
  /** Bulk add tags to selected tasks. */
  bulkAddTags: (tags: string[]) => Promise<void>;
  /** Bulk delete selected tasks. */
  bulkDelete: () => Promise<void>;

  /** Select a single task for detail view. */
  selectTask: (id: string) => void;
  /** Toggle task in multi-select set. */
  toggleTaskSelection: (id: string) => void;
  /** Select all visible tasks. */
  selectAll: () => void;
  /** Clear multi-select. */
  clearSelection: () => void;

  /** Switch view mode. */
  setViewMode: (mode: "list" | "board") => void;
  /** Set tree mode for list view. */
  setTreeMode: (v: boolean) => void;
  /** Update filter and refetch. */
  setFilter: (filter: Partial<TaskFilter>) => void;
  /** Update sort and refetch. */
  setSort: (sort: TaskSort) => void;
  /** Open detail panel for a task. */
  openDetail: (taskId: string) => void;
  /** Fetch a task by ID (from memory or backend) and open its detail panel. */
  fetchAndOpenDetail: (taskId: string) => Promise<void>;
  /** Close detail panel. */
  closeDetail: () => void;
  /** Open quick-add modal. */
  openQuickAdd: (initialStatus?: TaskStatus) => void;
  /** Close quick-add modal. */
  closeQuickAdd: () => void;
}

import { useWorkspaceStore } from "./workspaceStore";

/** Reads the active workspace ID synchronously from the workspace store. */
function getWorkspaceId(): string {
  const id = useWorkspaceStore.getState().activeWorkspaceId;
  if (!id) throw new Error("No active workspace");
  return id;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTask: null,
  selectedTaskIds: new Set<string>(),
  stickyTasks: [],

  viewMode: "list",
  treeMode: false,
  filter: {},
  sort: { field: "priority", direction: "desc" },
  isDetailOpen: false,
  isQuickAddOpen: false,
  quickAddInitialStatus: undefined,
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const wsId = getWorkspaceId();
      const filter: TaskFilter = {
        workspace_id: wsId,
        ...get().filter,
      };
      const tasks = await ipc.listTasks(filter, get().sort);
      set({ tasks, isLoading: false });
    } catch (e) {
      set({ isLoading: false, error: String(e) });
    }
  },

  fetchStickyTasks: async () => {
    try {
      const wsId = getWorkspaceId();
      const stickyTasks = await ipc.getStickyTasks(wsId);
      set({ stickyTasks });
    } catch (e) {
      reportError("taskStore.fetchStickyTasks", e);
    }
  },

  createTask: async (input) => {
    const wsId = getWorkspaceId();
    const task = await ipc.createTask({ ...input, workspace_id: wsId });
    logActivity(`Created task: ${task.title}`, "task", task.id);
    await get().fetchTasks();
    useWorkspaceStore.getState().loadWorkspaces();
    return task;
  },

  updateTask: async (id, updates) => {
    const task = await ipc.updateTask(id, updates);
    // Update selected task if it's the one being updated
    if (get().selectedTask?.id === id) {
      set({ selectedTask: task });
    }

    // Patch the task in the list instead of full refetch
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...task } : t
      ),
    }));

    // Full refetch only for structural changes that affect list shape
    if ('status' in updates || 'parent_id' in updates) {
      await get().fetchTasks();
    }

    return task;
  },

  deleteTask: async (id) => {
    const title =
      get().selectedTask?.id === id
        ? get().selectedTask!.title
        : get().tasks.find((t) => t.id === id)?.title ?? "Untitled";
    const confirmed = await ask("Delete this task and all its subtasks?", {
      title: "Confirm Delete",
      kind: "warning",
    });
    if (!confirmed) return;
    await ipc.deleteTask(id);
    logActivity(`Deleted task: ${title}`, "task", id);
    if (get().selectedTask?.id === id) {
      set({ selectedTask: null, isDetailOpen: false });
    }
    get().selectedTaskIds.delete(id);
    await get().fetchTasks();
    useWorkspaceStore.getState().loadWorkspaces();
  },

  restoreTask: async (id) => {
    const task = await ipc.restoreTask(id);
    await get().fetchTasks();
    useWorkspaceStore.getState().loadWorkspaces();
    return task;
  },

  toggleTaskStatus: async (id) => {
    const task = await ipc.toggleTaskStatus(id);
    const verb = task.status === "done" ? "Completed" : "Reopened";
    logActivity(`${verb} task: ${task.title}`, "task", task.id);
    if (get().selectedTask?.id === id) {
      set({ selectedTask: task });
    }
    await get().fetchTasks();
    return task;
  },

  moveTaskStatus: async (id, newStatus) => {
    const task = await ipc.moveTaskStatus(id, newStatus);
    logActivity(`Moved task to ${newStatus}: ${task.title}`, "task", task.id);
    if (get().selectedTask?.id === id) {
      set({ selectedTask: task });
    }
    await get().fetchTasks();
    return task;
  },

  bulkUpdateStatus: async (status) => {
    const ids = Array.from(get().selectedTaskIds);
    if (ids.length === 0) return;
    await ipc.bulkUpdateTaskStatus(ids, status);
    set({ selectedTaskIds: new Set() });
    await get().fetchTasks();
  },

  bulkAddTags: async (tags) => {
    const ids = Array.from(get().selectedTaskIds);
    if (ids.length === 0) return;
    await ipc.bulkAddTaskTags(ids, tags);
    await get().fetchTasks();
  },

  bulkDelete: async () => {
    const ids = Array.from(get().selectedTaskIds);
    if (ids.length === 0) return;
    const confirmed = await ask(
      `Delete ${ids.length} task(s) and their subtasks?`,
      { title: "Confirm Bulk Delete", kind: "warning" },
    );
    if (!confirmed) return;
    await ipc.bulkDeleteTasks(ids);
    set({ selectedTaskIds: new Set() });
    if (get().selectedTask && ids.includes(get().selectedTask!.id)) {
      set({ selectedTask: null, isDetailOpen: false });
    }
    await get().fetchTasks();
    useWorkspaceStore.getState().loadWorkspaces();
  },

  selectTask: (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (task) {
      set({ selectedTask: task });
    }
  },

  toggleTaskSelection: (id) => {
    const next = new Set(get().selectedTaskIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedTaskIds: next });
  },

  selectAll: () => {
    const ids = new Set(get().tasks.map((t) => t.id));
    set({ selectedTaskIds: ids });
  },

  clearSelection: () => set({ selectedTaskIds: new Set() }),

  setViewMode: (mode) => set({ viewMode: mode, treeMode: false }),

  setTreeMode: (v) => set({ treeMode: v }),

  setFilter: (filter) => {
    set({ filter });
    get().fetchTasks();
  },

  setSort: (sort) => {
    set({ sort });
    get().fetchTasks();
  },

  openDetail: (taskId) => {
    const task = get().tasks.find((t) => t.id === taskId);
    if (task) {
      set({ selectedTask: task, isDetailOpen: true });
    }
  },

  fetchAndOpenDetail: async (taskId) => {
    const local = get().tasks.find((t) => t.id === taskId);
    if (local) {
      set({ selectedTask: local, isDetailOpen: true });
      return;
    }
    try {
      const task = await ipc.getTask(taskId);
      set({ selectedTask: task, isDetailOpen: true });
    } catch {
      console.warn(`Failed to open task ${taskId}`);
    }
  },

  closeDetail: () => set({ isDetailOpen: false }),

  openQuickAdd: (initialStatus) =>
    set({ isQuickAddOpen: true, quickAddInitialStatus: initialStatus }),

  closeQuickAdd: () =>
    set({ isQuickAddOpen: false, quickAddInitialStatus: undefined }),
}));
