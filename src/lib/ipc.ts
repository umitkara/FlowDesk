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
  WorkspaceSummary,
  WorkspaceConfig,
  WorkspaceBadge,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  DashboardData,
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
  FilterConfig,
  CreateFilterInput,
  UpdateFilterInput,
  SavedFilter,
  ActivityQuery,
  ActivityEntry,
  GraphQuery,
  GraphData,
  FacetedSearchResponse,
  GroupedViewResult,
  PlannedVsActualData,
  BacklinkWithContext,
  RecurrenceRule,
  CreateRecurrenceRuleInput,
  UpdateRecurrenceRuleInput,
  EntitySummary,
  NoteTemplate,
  CreateTemplateInput,
  UpdateTemplateInput,
  Reminder,
  ReminderDefaults,
  UpdateReminderInput,
  Suggestion,
  NoteVersion,
  NoteVersionSummary,
  VersionDiff,
  VersionStorageStats,
  PruneResult,
  VersionHistoryConfig,
  ImportResult,
  MarkdownImportOptions,
  ObsidianImportOptions,
  CsvImportOptions,
  CsvPreview,
  EnhancedExportResult,
  JsonExportOptions,
  CsvExportOptions,
  MarkdownExportOptions,
  UndoRedoState,
  ThemeSettings,
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

/** Performs a full-text search across notes, tasks, and plans. */
export const searchEntities = (query: SearchQuery) =>
  invoke<SearchResult[]>("search_entities", { query });

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

/** Returns all active workspaces with note/task counts. */
export const listWorkspaces = () =>
  invoke<WorkspaceSummary[]>("list_workspaces");

/** Gets a workspace by ID with full config. */
export const getWorkspace = (id: string) =>
  invoke<Workspace>("get_workspace", { id });

/** Creates a new workspace. */
export const createWorkspace = (input: CreateWorkspaceInput) =>
  invoke<Workspace>("create_workspace", { input });

/** Updates workspace metadata and/or config. */
export const updateWorkspace = (input: UpdateWorkspaceInput) =>
  invoke<Workspace>("update_workspace", { input });

/** Soft-deletes a workspace and all its entities. */
export const deleteWorkspace = (id: string) =>
  invoke<void>("delete_workspace", { id });

/** Reorders workspaces by updating sort_order. */
export const reorderWorkspaces = (workspaceIds: string[]) =>
  invoke<void>("reorder_workspaces", { input: { workspace_ids: workspaceIds } });

/** Updates only the config JSON for a workspace. */
export const updateWorkspaceConfig = (
  workspaceId: string,
  config: WorkspaceConfig,
) => invoke<WorkspaceConfig>("update_workspace_config", { workspaceId, config });

/** Gets workspace badge info for cross-workspace reference display. */
export const getWorkspaceBadge = (workspaceId: string) =>
  invoke<WorkspaceBadge>("get_workspace_badge", { workspaceId });

/** Resolves a cross-workspace reference. Returns badge if cross-workspace. */
export const resolveCrossWorkspaceRef = (
  entityId: string,
  entityType: string,
  activeWorkspaceId: string,
) =>
  invoke<WorkspaceBadge | null>("resolve_cross_workspace_ref", {
    entityId,
    entityType,
    activeWorkspaceId,
  });

/** Moves an entity (note, task, or plan) to a different workspace. */
export const moveEntityToWorkspace = (
  entityId: string,
  entityType: "note" | "task" | "plan" | "time_entry",
  targetWorkspaceId: string,
) => invoke<void>("move_entity_to_workspace", { entityId, entityType, targetWorkspaceId });

/** Moves multiple entities of the same type to a different workspace. */
export const bulkMoveEntitiesToWorkspace = (
  entityIds: string[],
  entityType: "note" | "task" | "plan" | "time_entry",
  targetWorkspaceId: string,
) => invoke<number>("bulk_move_entities_to_workspace", { entityIds, entityType, targetWorkspaceId });

/** Gets dashboard data for a workspace. */
export const getDashboardData = (workspaceId: string, widgets: string[]) =>
  invoke<DashboardData>("get_dashboard_data", { workspaceId, widgets });

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

/** Batch soft-delete multiple plans. */
export const bulkDeletePlans = (planIds: string[]) =>
  invoke<void>("bulk_delete_plans", { planIds });

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

/** Edits a session note at the given index. */
export const trackerEditSessionNote = (index: number, text: string) =>
  invoke<SessionNote>("tracker_edit_session_note", { index, text });

/** Deletes a session note at the given index. */
export const trackerDeleteSessionNote = (index: number) =>
  invoke<void>("tracker_delete_session_note", { index });

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

// --- Faceted Search ---

/** Performs a multi-entity faceted search. */
export const facetedSearch = (workspaceId: string, filter: FilterConfig) =>
  invoke<FacetedSearchResponse>("faceted_search", { workspaceId, filter });

// --- Saved Filters ---

/** Creates a saved filter. */
export const createSavedFilter = (input: CreateFilterInput) =>
  invoke<SavedFilter>("create_saved_filter", { input });

/** Gets a saved filter by ID. */
export const getSavedFilter = (id: string) =>
  invoke<SavedFilter>("get_saved_filter", { id });

/** Updates a saved filter. */
export const updateSavedFilter = (id: string, input: UpdateFilterInput) =>
  invoke<SavedFilter>("update_saved_filter", { id, input });

/** Deletes a saved filter. */
export const deleteSavedFilter = (id: string) =>
  invoke<void>("delete_saved_filter", { id });

/** Lists saved filters for a workspace. */
export const listSavedFilters = (workspaceId: string) =>
  invoke<SavedFilter[]>("list_saved_filters", { workspaceId });

/** Reorders saved filters. */
export const reorderSavedFilters = (ids: string[]) =>
  invoke<void>("reorder_saved_filters", { ids });

// --- Activity Log ---

/** Queries the activity log. */
export const listActivity = (query: ActivityQuery) =>
  invoke<ActivityEntry[]>("list_activity", { query });

/** Gets activity for a specific entity. */
export const getEntityActivity = (entityType: string, entityId: string, limit?: number) =>
  invoke<ActivityEntry[]>("get_entity_activity", { entityType, entityId, limit });

// --- Graph ---

/** Gets graph nodes and edges for visualization. */
export const getGraphData = (query: GraphQuery) =>
  invoke<GraphData>("get_graph_data", { query });

// --- Grouped View ---

/** Gets entities grouped by a field. */
export const getGroupedView = (workspaceId: string, entityType: string, groupBy: string, filter?: FilterConfig) =>
  invoke<GroupedViewResult>("get_grouped_view", { workspaceId, entityType, groupBy, filter });

// --- Planned vs Actual ---

/** Gets planned vs actual comparison for a single day. */
export const getPlannedVsActual = (workspaceId: string, date: string) =>
  invoke<PlannedVsActualData>("get_planned_vs_actual", { workspaceId, date });

/** Gets planned vs actual comparison for a date range. */
export const getPlannedVsActualRange = (workspaceId: string, dateFrom: string, dateTo: string) =>
  invoke<PlannedVsActualData[]>("get_planned_vs_actual_range", { workspaceId, dateFrom, dateTo });

// --- Backlinks with Context ---

/** Gets backlinks with surrounding context snippets. */
export const getBacklinksWithContext = (entityType: string, entityId: string) =>
  invoke<BacklinkWithContext[]>("get_backlinks_with_context", { entityType, entityId });

// --- Recurrence ---

/** Creates a new recurrence rule. */
export const createRecurrenceRule = (input: CreateRecurrenceRuleInput) =>
  invoke<RecurrenceRule>("create_recurrence_rule", { input });

/** Gets a recurrence rule by ID. */
export const getRecurrenceRule = (ruleId: string) =>
  invoke<RecurrenceRule>("get_recurrence_rule", { ruleId });

/** Gets the recurrence rule for a specific entity. */
export const getRecurrenceRuleForEntity = (entityType: string, entityId: string) =>
  invoke<RecurrenceRule | null>("get_recurrence_rule_for_entity", { entityType, entityId });

/** Updates a recurrence rule. */
export const updateRecurrenceRule = (ruleId: string, update: UpdateRecurrenceRuleInput) =>
  invoke<RecurrenceRule>("update_recurrence_rule", { ruleId, update });

/** Deletes a recurrence rule. */
export const deleteRecurrenceRule = (ruleId: string) =>
  invoke<void>("delete_recurrence_rule", { ruleId });

/** Skips the next occurrence without generating it. */
export const skipNextOccurrence = (ruleId: string) =>
  invoke<RecurrenceRule>("skip_next_occurrence", { ruleId });

/** Postpones the next occurrence to a specific date. */
export const postponeNextOccurrence = (ruleId: string, newDate: string) =>
  invoke<RecurrenceRule>("postpone_next_occurrence", { ruleId, newDate });

/** Detaches a single occurrence from its recurrence rule. */
export const detachOccurrence = (entityType: string, entityId: string) =>
  invoke<void>("detach_occurrence", { entityType, entityId });

/** Updates the rule for all future occurrences. */
export const editFutureOccurrences = (ruleId: string, update: UpdateRecurrenceRuleInput) =>
  invoke<void>("edit_future_occurrences", { ruleId, update });

/** Soft-deletes all occurrences after a given index. */
export const deleteFutureOccurrences = (ruleId: string, afterIndex: number) =>
  invoke<void>("delete_future_occurrences", { ruleId, afterIndex });

/** Lists occurrences of a rule within a date range. */
export const getOccurrences = (ruleId: string, fromDate: string, toDate: string) =>
  invoke<EntitySummary[]>("get_occurrences", { ruleId, fromDate, toDate });

// --- Templates ---

/** Lists all available note templates. */
export const listTemplates = () =>
  invoke<NoteTemplate[]>("list_templates");

/** Loads a single template by file name. */
export const loadTemplate = (fileName: string) =>
  invoke<NoteTemplate>("load_template", { fileName });

/** Creates a new template file. */
export const createTemplate = (input: CreateTemplateInput) =>
  invoke<string>("create_template", { input });

/** Updates an existing template. */
export const updateTemplate = (fileName: string, update: UpdateTemplateInput) =>
  invoke<void>("update_template", { fileName, update });

/** Deletes a template file. */
export const deleteTemplate = (fileName: string) =>
  invoke<void>("delete_template", { fileName });

/** Applies a template with variable substitution. */
export const applyTemplate = (
  fileName: string,
  variables: Record<string, string>,
  workspaceId: string,
  date?: string,
) => invoke<[string, Record<string, unknown>]>("apply_template", { fileName, variables, workspaceId, date });

/** Creates a note from a template in one step. */
export const createNoteFromTemplate = (
  workspaceId: string,
  templateName: string,
  variables: Record<string, string>,
  date?: string,
) => invoke<Note>("create_note_from_template", { workspaceId, templateName, variables, date });

// --- Reminders ---

/** Gets global reminder default settings. */
export const getReminderDefaults = () =>
  invoke<ReminderDefaults>("get_reminder_defaults");

/** Updates global reminder default settings. */
export const updateReminderDefaults = (defaults: ReminderDefaults) =>
  invoke<void>("update_reminder_defaults", { defaults });

/** Gets all reminders for an entity. */
export const getRemindersForEntity = (entityType: string, entityId: string) =>
  invoke<Reminder[]>("get_reminders_for_entity", { entityType, entityId });

/** Updates a reminder. */
export const updateReminder = (reminderId: string, update: UpdateReminderInput) =>
  invoke<Reminder>("update_reminder", { reminderId, update });

/** Dismisses a fired reminder. */
export const dismissReminder = (reminderId: string) =>
  invoke<void>("dismiss_reminder", { reminderId });

/** Replaces unfired reminders for an entity with new offsets. */
export const syncEntityReminders = (
  entityType: string,
  entityId: string,
  referenceTime: string,
  workspaceId: string,
  offsets: string[],
) => invoke<Reminder[]>("sync_entity_reminders", { entityType, entityId, referenceTime, workspaceId, offsets });

// --- Suggestions ---

/** Gets auto-suggestions when the time tracker stops. */
export const suggestOnTrackerStop = (
  workspaceId: string,
  tags: string[],
  notes: string,
  stoppedAt: string,
) => invoke<Suggestion[]>("suggest_on_tracker_stop", { workspaceId, tags, notes, stoppedAt });

// --- Version History ---

/** Creates a version snapshot of a note. */
export const createVersion = (noteId: string, workspaceId: string, title: string | null, body: string) =>
  invoke<NoteVersion | null>("create_version", { noteId, workspaceId, title, body });

/** Lists version summaries for a note. */
export const listVersions = (noteId: string) =>
  invoke<NoteVersionSummary[]>("list_versions", { noteId });

/** Gets a full version by ID. */
export const getVersion = (versionId: string) =>
  invoke<NoteVersion>("get_version", { versionId });

/** Restores a note to a specific version. */
export const restoreVersion = (versionId: string) =>
  invoke<NoteVersion>("restore_version", { versionId });

/** Deletes a specific version. */
export const deleteVersion = (versionId: string) =>
  invoke<void>("delete_version", { versionId });

/** Prunes old versions for a note. */
export const pruneVersions = (noteId: string, maxKeep?: number) =>
  invoke<PruneResult>("prune_versions", { noteId, maxKeep });

/** Gets storage statistics for version history. */
export const getVersionStorageStats = (workspaceId: string) =>
  invoke<VersionStorageStats>("get_version_storage_stats", { workspaceId });

/** Computes a diff between two versions. */
export const diffVersions = (fromVersionId: string, toVersionId: string) =>
  invoke<VersionDiff>("diff_versions", { fromVersionId, toVersionId });

// --- Import ---

/** Imports a folder of markdown files as notes. */
export const importMarkdownFolder = (options: MarkdownImportOptions) =>
  invoke<ImportResult>("import_markdown_folder", { options });

/** Imports an Obsidian vault. */
export const importObsidianVault = (options: ObsidianImportOptions) =>
  invoke<ImportResult>("import_obsidian_vault", { options });

/** Imports tasks from a CSV file. */
export const importCsvTasks = (options: CsvImportOptions) =>
  invoke<ImportResult>("import_csv_tasks", { options });

/** Previews a CSV file for field mapping. */
export const previewCsv = (filePath: string, delimiter?: string) =>
  invoke<CsvPreview>("preview_csv", { filePath, delimiter });

// --- Enhanced Export ---

/** Exports workspace data as JSON. */
export const exportWorkspaceJson = (options: JsonExportOptions) =>
  invoke<EnhancedExportResult>("export_workspace_json", { options });

/** Exports tasks as CSV. */
export const exportTasksCsv = (options: CsvExportOptions) =>
  invoke<EnhancedExportResult>("export_tasks_csv", { options });

/** Enhanced markdown export. */
export const exportNotesMarkdown = (options: MarkdownExportOptions) =>
  invoke<EnhancedExportResult>("export_notes_markdown", { options });

/** Exports a single note as markdown string. */
export const exportSingleNoteMarkdown = (id: string) =>
  invoke<string>("export_single_note_markdown", { id });

// --- Undo/Redo ---

/** Undoes the most recent operation. */
export const undoOperation = () =>
  invoke<UndoRedoState>("undo_operation");

/** Redoes the most recently undone operation. */
export const redoOperation = () =>
  invoke<UndoRedoState>("redo_operation");

/** Gets the current undo/redo state. */
export const getUndoRedoState = () =>
  invoke<UndoRedoState>("get_undo_redo_state");

// --- Extended Settings ---

/** Gets customized keyboard shortcuts. */
export const getKeyboardShortcuts = () =>
  invoke<Record<string, string>>("get_keyboard_shortcuts");

/** Updates keyboard shortcuts. */
export const updateKeyboardShortcuts = (shortcuts: Record<string, string>) =>
  invoke<void>("update_keyboard_shortcuts", { shortcuts });

/** Gets theme settings. */
export const getTheme = () =>
  invoke<ThemeSettings>("get_theme");

/** Updates theme settings. */
export const updateTheme = (theme: ThemeSettings) =>
  invoke<void>("update_theme", { theme });

/** Gets version history configuration. */
export const getVersionHistoryConfig = () =>
  invoke<VersionHistoryConfig>("get_version_history_config");

/** Updates version history configuration. */
export const updateVersionHistoryConfig = (config: VersionHistoryConfig) =>
  invoke<void>("update_version_history_config", { config });

// --- Global Hotkey ---

/** Updates the global hotkey binding. */
export const updateGlobalHotkey = (hotkey: string) =>
  invoke<void>("update_global_hotkey", { hotkey });
