import { invoke } from "@tauri-apps/api/core";
import type {
  Note,
  NoteListItem,
  CreateNoteInput,
  UpdateNoteInput,
  NoteQuery,
  FolderNode,
  SearchQuery,
  SearchResult,
  ExportOptions,
  ExportResult,
  Workspace,
  Task,
  TaskWithChildren,
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilter,
  TaskSort,
  Reference,
  CreateReferenceInput,
  ReferenceFilter,
  Backlink,
  Plan,
  CreatePlanInput,
  UpdatePlanInput,
  PlanQuery,
  PlanWithLinks,
  PlanLinkedTask,
  PlanLinkedNote,
  DailyPlanSummary,
  AgendaItem,
  SpawnTaskInput,
  SpawnNoteInput,
  TrackerState,
  SessionNote,
  TimeEntry,
  BreakConfig,
  DailySummary,
  WeeklySummary,
  CreateTaskFromSession,
  CreateNoteFromSession,
} from "./types";

// --- Notes ---

/** Creates a new note. */
export const createNote = (input: CreateNoteInput) =>
  invoke<Note>("create_note", { input });

/** Gets a note by ID. */
export const getNote = (id: string) => invoke<Note>("get_note", { id });

/** Updates fields on an existing note. */
export const updateNote = (id: string, input: UpdateNoteInput) =>
  invoke<Note>("update_note", { id, input });

/** Soft-deletes a note. */
export const deleteNote = (id: string) => invoke<void>("delete_note", { id });

/** Restores a soft-deleted note. */
export const restoreNote = (id: string) => invoke<void>("restore_note", { id });

/** Permanently deletes a note from the database. */
export const hardDeleteNote = (id: string) =>
  invoke<void>("hard_delete_note", { id });

/** Lists notes matching the given query filters. */
export const listNotes = (query: NoteQuery) =>
  invoke<NoteListItem[]>("list_notes", { query });

/** Gets the virtual folder tree for a workspace. */
export const getFolderTree = (workspaceId: string) =>
  invoke<FolderNode[]>("get_folder_tree", { workspaceId });

/** Gets the daily note for a specific date, if one exists. */
export const getDailyNote = (workspaceId: string, date: string) =>
  invoke<Note | null>("get_daily_note", { workspaceId, date });

/** Creates a daily note for the given date, or returns the existing one. */
export const createDailyNote = (workspaceId: string, date: string) =>
  invoke<Note>("create_daily_note", { workspaceId, date });

/** Returns dates in the given month that have notes. */
export const getDatesWithNotes = (
  workspaceId: string,
  year: number,
  month: number,
) => invoke<string[]>("get_dates_with_notes", { workspaceId, year, month });

/** Moves a note to a different folder. */
export const moveNoteToFolder = (id: string, folder: string) =>
  invoke<void>("move_note_to_folder", { id, folder });

/** Returns the total count of non-deleted notes in a workspace. */
export const getNoteCount = (workspaceId: string) =>
  invoke<number>("get_note_count", { workspaceId });

// --- Search ---

/** Performs a full-text search across notes. */
export const searchNotes = (query: SearchQuery) =>
  invoke<SearchResult[]>("search_notes", { query });

// --- Export ---

/** Exports notes to markdown files. */
export const exportNotes = (options: ExportOptions) =>
  invoke<ExportResult>("export_notes", { options });

/** Returns the markdown string for a single note. */
export const exportSingleNote = (id: string) =>
  invoke<string>("export_single_note", { id });

// --- Settings ---

/** Gets a single setting value by key. */
export const getSetting = (key: string) =>
  invoke<string | null>("get_setting", { key });

/** Sets a single setting value. */
export const setSetting = (key: string, value: string) =>
  invoke<void>("set_setting", { key, value });

/** Returns all settings as a key-value map. */
export const getAllSettings = () =>
  invoke<Record<string, string>>("get_all_settings");

/** Sets multiple settings at once. */
export const setManySettings = (settings: Record<string, string>) =>
  invoke<void>("set_many_settings", { settings });

// --- Workspaces ---

/** Returns all workspaces. */
export const listWorkspaces = () => invoke<Workspace[]>("list_workspaces");

/** Gets a workspace by ID. */
export const getWorkspace = (id: string) =>
  invoke<Workspace>("get_workspace", { id });

// --- Tasks ---

/** Creates a new task. */
export const createTask = (task: CreateTaskInput) =>
  invoke<Task>("create_task", { task });

/** Gets a task by ID. */
export const getTask = (id: string) => invoke<Task>("get_task", { id });

/** Lists tasks with filtering and sorting. */
export const listTasks = (filter: TaskFilter, sort?: TaskSort) =>
  invoke<TaskWithChildren[]>("list_tasks", { filter, sort });

/** Updates fields on an existing task. */
export const updateTask = (id: string, updates: UpdateTaskInput) =>
  invoke<Task>("update_task", { id, updates });

/** Soft-deletes a task (and its subtasks). */
export const deleteTask = (id: string) =>
  invoke<void>("delete_task", { id });

/** Restores a soft-deleted task. */
export const restoreTask = (id: string) =>
  invoke<Task>("restore_task", { id });

/** Toggles a task between todo and done. */
export const toggleTaskStatus = (id: string) =>
  invoke<Task>("toggle_task_status", { id });

/** Gets the recursive subtask tree for a task. */
export const getSubtaskTree = (taskId: string) =>
  invoke<TaskWithChildren[]>("get_subtask_tree", { taskId });

/** Batch status change for multiple tasks. */
export const bulkUpdateTaskStatus = (taskIds: string[], status: string) =>
  invoke<Task[]>("bulk_update_task_status", { taskIds, status });

/** Batch tag addition for multiple tasks. */
export const bulkAddTaskTags = (taskIds: string[], tags: string[]) =>
  invoke<Task[]>("bulk_add_task_tags", { taskIds, tags });

/** Batch soft-delete multiple tasks. */
export const bulkDeleteTasks = (taskIds: string[]) =>
  invoke<void>("bulk_delete_tasks", { taskIds });

/** Gets active sticky tasks for a workspace. */
export const getStickyTasks = (workspaceId: string) =>
  invoke<Task[]>("get_sticky_tasks", { workspaceId });

/** Moves a task to a new status (Kanban drag-and-drop). */
export const moveTaskStatus = (id: string, newStatus: string) =>
  invoke<Task>("move_task_status", { id, newStatus });

// --- References ---

/** Creates a reference between two entities. */
export const createReference = (reference: CreateReferenceInput) =>
  invoke<Reference>("create_reference", { reference });

/** Deletes a reference by ID. */
export const deleteReference = (id: string) =>
  invoke<void>("delete_reference", { id });

/** Lists references with filter. */
export const listReferences = (filter: ReferenceFilter) =>
  invoke<Reference[]>("list_references", { filter });

/** Gets incoming references (backlinks) for an entity. */
export const getBacklinks = (targetType: string, targetId: string) =>
  invoke<Backlink[]>("get_backlinks", { targetType, targetId });

/** Syncs inline references for a note. */
export const syncNoteReferences = (noteId: string, body: string) =>
  invoke<Reference[]>("sync_note_references", { noteId, body });

// --- Plans ---

/** Creates a new plan. */
export const createPlan = (input: CreatePlanInput) =>
  invoke<Plan>("create_plan", { input });

/** Gets a plan by ID. */
export const getPlan = (id: string) => invoke<Plan>("get_plan", { id });

/** Updates fields on an existing plan. */
export const updatePlan = (input: UpdatePlanInput) =>
  invoke<Plan>("update_plan", { input });

/** Soft-deletes a plan. */
export const deletePlan = (id: string) =>
  invoke<void>("delete_plan", { id });

/** Lists plans matching the given query parameters. */
export const listPlans = (query: PlanQuery) =>
  invoke<Plan[]>("list_plans", { query });

/** Gets the aggregated daily plan summary for a date. */
export const getDailyPlanSummary = (workspaceId: string, date: string) =>
  invoke<DailyPlanSummary>("get_daily_plan_summary", { workspaceId, date });

/** Gets a plan with all linked entities. */
export const getPlanWithLinks = (id: string) =>
  invoke<PlanWithLinks>("get_plan_with_links", { id });

/** Spawns a task from a plan. */
export const spawnTaskFromPlan = (input: SpawnTaskInput) =>
  invoke<PlanLinkedTask>("spawn_task_from_plan", { input });

/** Spawns a note from a plan. */
export const spawnNoteFromPlan = (input: SpawnNoteInput) =>
  invoke<PlanLinkedNote>("spawn_note_from_plan", { input });

/** Links an existing task to a plan. */
export const linkTaskToPlan = (planId: string, taskId: string, relation: string) =>
  invoke<void>("link_task_to_plan", { planId, taskId, relation });

/** Removes references between a task and a plan. */
export const unlinkTaskFromPlan = (planId: string, taskId: string) =>
  invoke<void>("unlink_task_from_plan", { planId, taskId });

/** FTS5 search across plans. */
export const searchPlans = (workspaceId: string, query: string) =>
  invoke<Plan[]>("search_plans", { workspaceId, query });

/** Gets a unified agenda of plans and tasks in date range. */
export const getAgenda = (workspaceId: string, startDate: string, endDate: string) =>
  invoke<AgendaItem[]>("get_agenda", { workspaceId, startDate, endDate });

// --- Time Tracker ---

/** Starts a new tracking session. */
export const trackerStart = (params: {
  workspaceId: string;
  linkedPlanId?: string;
  linkedTaskId?: string;
  category?: string;
  tags?: string[];
  breakMode?: string;
}) => invoke<TrackerState>("tracker_start", params);

/** Pauses the active tracking session. */
export const trackerPause = () => invoke<TrackerState>("tracker_pause");

/** Resumes a paused tracking session. */
export const trackerResume = () => invoke<TrackerState>("tracker_resume");

/** Stops the active tracking session. */
export const trackerStop = () => invoke<TrackerState>("tracker_stop");

/** Gets the current tracker state. */
export const trackerGetState = () => invoke<TrackerState>("tracker_get_state");

/** Updates the running notes on an active session. */
export const trackerUpdateNotes = (notes: string) =>
  invoke<void>("tracker_update_notes", { notes });

/** Adds a timestamped session note. */
export const trackerAddSessionNote = (
  text: string,
  refType?: string,
  refId?: string,
) => invoke<SessionNote>("tracker_add_session_note", { text, refType, refId });

/** Saves the detail form for a completed session. */
export const trackerSaveDetail = (params: {
  timeEntryId: string;
  notes?: string;
  category?: string;
  tags?: string[];
  linkedPlanId?: string;
  linkedTaskId?: string;
  createTask?: CreateTaskFromSession;
  createNote?: CreateNoteFromSession;
}) => invoke<TimeEntry>("tracker_save_detail", params);

/** Discards a time entry and resets the tracker to idle. */
export const trackerDiscard = (timeEntryId: string) =>
  invoke<void>("tracker_discard", { timeEntryId });

/** Updates the break reminder mode and configuration. */
export const trackerSetBreakMode = (mode: string, config?: BreakConfig) =>
  invoke<void>("tracker_set_break_mode", { mode, config });

/** Snoozes the next break reminder. */
export const trackerSnoozeBreak = () =>
  invoke<void>("tracker_snooze_break");

/** Recovers an interrupted tracking session. */
export const trackerRecoverSession = (action: "resume" | "stop") =>
  invoke<TrackerState>("tracker_recover_session", { action });

// --- Time Entry CRUD ---

/** Gets a time entry by ID. */
export const getTimeEntry = (id: string) =>
  invoke<TimeEntry>("get_time_entry", { id });

/** Lists time entries with filters. */
export const listTimeEntries = (params: {
  workspaceId: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  tag?: string;
  linkedTaskId?: string;
  linkedPlanId?: string;
  limit?: number;
  offset?: number;
}) => invoke<TimeEntry[]>("list_time_entries", params);

/** Updates a saved time entry. */
export const updateTimeEntry = (params: {
  id: string;
  notes?: string;
  category?: string | null;
  tags?: string[];
  linkedPlanId?: string | null;
  linkedTaskId?: string | null;
}) => invoke<TimeEntry>("update_time_entry", params);

/** Soft-deletes a time entry. */
export const deleteTimeEntry = (id: string) =>
  invoke<void>("delete_time_entry", { id });

// --- Time Reports ---

/** Gets a daily time summary. */
export const getDailySummary = (workspaceId: string, date: string) =>
  invoke<DailySummary>("get_daily_summary", { workspaceId, date });

/** Gets a weekly time summary. */
export const getWeeklySummary = (workspaceId: string, weekStart: string) =>
  invoke<WeeklySummary>("get_weekly_summary", { workspaceId, weekStart });

/** Gets time entries for a specific task. */
export const getEntriesForTask = (taskId: string) =>
  invoke<TimeEntry[]>("get_entries_for_task", { taskId });

/** Gets time entries for a specific plan. */
export const getEntriesForPlan = (planId: string) =>
  invoke<TimeEntry[]>("get_entries_for_plan", { planId });

/** Updates the system tray tooltip with current tracker status and elapsed time. */
export const updateTrayStatus = (status: string, elapsed: string) =>
  invoke<void>("update_tray_status", { status, elapsed });
