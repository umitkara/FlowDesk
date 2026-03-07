/** A complete note entity including body content and metadata. */
export interface Note {
  id: string;
  workspace_id: string;
  title: string | null;
  date: string | null;
  body: string;
  folder: string | null;
  category: string | null;
  note_type: string | null;
  color: string | null;
  importance: string | null;
  front_matter: Record<string, unknown> | null;
  body_hash: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A lightweight note representation for list views. */
export interface NoteListItem {
  id: string;
  title: string | null;
  date: string | null;
  folder: string | null;
  category: string | null;
  note_type: string | null;
  color: string | null;
  importance: string | null;
  tags: string[];
  updated_at: string;
  created_at: string;
  word_count: number;
  preview: string;
}

/** Input for creating a new note. */
export interface CreateNoteInput {
  workspace_id: string;
  title?: string;
  date?: string;
  body?: string;
  folder?: string;
  category?: string;
  note_type?: string;
  color?: string;
  importance?: string;
  front_matter?: Record<string, unknown>;
  tags?: string[];
}

/** Input for updating an existing note (partial update). */
export interface UpdateNoteInput {
  title?: string;
  date?: string;
  body?: string;
  folder?: string;
  category?: string;
  note_type?: string;
  color?: string;
  importance?: string;
  front_matter?: Record<string, unknown>;
  tags?: string[];
}

/** Query parameters for filtering and paginating notes. */
export interface NoteQuery {
  workspace_id: string;
  folder?: string;
  category?: string;
  note_type?: string;
  importance?: string;
  date_from?: string;
  date_to?: string;
  tag?: string;
  sort_by?: "updated_at" | "created_at" | "title" | "date";
  sort_order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  include_deleted?: boolean;
  only_deleted?: boolean;
}

/** A node in the virtual folder tree hierarchy. */
export interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
  note_count: number;
}

/** Input parameters for a full-text search query. */
export interface SearchQuery {
  workspace_id: string;
  query: string;
  limit?: number;
  offset?: number;
  entity_types?: string[];
}

/** A single full-text search result (notes, tasks, and plans). */
export interface SearchResult {
  entity_type: "note" | "task" | "plan";
  id: string;
  title: string | null;
  snippet: string;
  rank: number;
  note_type: string | null;
  folder: string | null;
  updated_at: string;
  metadata: Record<string, unknown>;
}

/** Options for a batch note export operation. */
export interface ExportOptions {
  workspace_id: string;
  note_ids?: string[];
  folder?: string;
  output_dir: string;
  include_front_matter: boolean;
}

/** Result of a batch export operation. */
export interface ExportResult {
  exported_count: number;
  output_dir: string;
  errors: string[];
}

/** Per-workspace configuration stored in the config JSON column. */
export interface WorkspaceConfig {
  categories: string[];
  note_types: string[];
  task_categories: string[];
  default_note_template: string | null;
  accent_color: string;
  dashboard_widgets: string[];
}

/** A workspace context (e.g. "Personal", "Work"). */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  export_path: string | null;
  attachment_path: string | null;
  sort_order: number;
  config: WorkspaceConfig;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Lightweight workspace info for the workspace switcher list. */
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  note_count: number;
  task_count: number;
}

/** Minimal workspace info for cross-workspace reference badges. */
export interface WorkspaceBadge {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

/** Input for creating a new workspace. */
export interface CreateWorkspaceInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  export_path?: string | null;
  config?: WorkspaceConfig;
}

/** Input for updating an existing workspace. */
export interface UpdateWorkspaceInput {
  id: string;
  name?: string;
  icon?: string;
  color?: string;
  export_path?: string;
  attachment_path?: string;
  sort_order?: number;
  config?: WorkspaceConfig;
}

/** A plan item for the dashboard. */
export interface DashboardPlan {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  plan_type: string;
  color: string | null;
}

/** A task item for the dashboard. */
export interface DashboardTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  color: string | null;
}

/** A note item for the dashboard. */
export interface DashboardNote {
  id: string;
  title: string | null;
  note_type: string | null;
  folder: string | null;
  updated_at: string;
}

/** Time tracked today summary. */
export interface TimeSummary {
  total_mins: number;
  active_mins: number;
  entry_count: number;
}

/** Aggregated dashboard data for a workspace. */
export interface DashboardData {
  today_plan: DashboardPlan[];
  pending_tasks: DashboardTask[];
  recent_notes: DashboardNote[];
  time_today: TimeSummary;
  sticky_tasks: DashboardTask[];
  upcoming_deadlines: DashboardTask[];
}

/** A workspace-scoped tag. */
export interface Tag {
  id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// --- Task Types ---

/** Valid task status values. */
export type TaskStatus = "inbox" | "todo" | "in_progress" | "done" | "cancelled";

/** Valid task priority values. */
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

/** A complete task entity. */
export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  category: string | null;
  color: string | null;
  tags: string[] | null;
  estimated_mins: number | null;
  actual_mins: number;
  recurrence: RecurrenceRule | null;
  parent_task_id: string | null;
  is_sticky: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A task with subtask count information for tree rendering. */
export interface TaskWithChildren extends Task {
  subtask_count: number;
  completed_subtask_count: number;
}

/** Input for creating a new task. */
export interface CreateTaskInput {
  workspace_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  scheduled_date?: string;
  category?: string;
  color?: string;
  tags?: string[];
  estimated_mins?: number;
  recurrence?: RecurrenceRule;
  parent_task_id?: string;
  is_sticky?: boolean;
}

/** Input for updating an existing task (partial update). */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  scheduled_date?: string | null;
  category?: string | null;
  color?: string | null;
  tags?: string[];
  estimated_mins?: number | null;
  actual_mins?: number;
  recurrence?: RecurrenceRule | null;
  parent_task_id?: string | null;
  is_sticky?: boolean;
}

/** Filters for querying tasks. */
export interface TaskFilter {
  workspace_id: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  category?: string;
  tag?: string;
  due_before?: string;
  due_after?: string;
  scheduled_date?: string;
  parent_task_id?: string | null;
  is_sticky?: boolean;
  include_done?: boolean;
  include_deleted?: boolean;
  search_query?: string;
}

/** Sort configuration for task queries. */
export interface TaskSort {
  field: "title" | "status" | "priority" | "due_date" | "created_at" | "updated_at";
  direction: "asc" | "desc";
}

/** Recurrence pattern values. */
export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly" | "custom";

/** A full recurrence rule stored in the `recurrence_rules` table. */
export interface RecurrenceRule {
  id: string;
  workspace_id: string;
  entity_type: "task" | "plan";
  parent_entity_id: string;
  pattern: RecurrencePattern;
  interval: number;
  days_of_week: number[] | null;
  day_of_month: number | null;
  month_of_year: number | null;
  end_date: string | null;
  end_after_count: number | null;
  occurrences_created: number;
  next_occurrence_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Input for creating a recurrence rule. */
export interface CreateRecurrenceRuleInput {
  workspace_id: string;
  entity_type: "task" | "plan";
  parent_entity_id: string;
  pattern: RecurrencePattern;
  interval?: number;
  days_of_week?: number[];
  day_of_month?: number;
  month_of_year?: number;
  end_date?: string;
  end_after_count?: number;
}

/** Input for updating a recurrence rule. */
export interface UpdateRecurrenceRuleInput {
  pattern?: RecurrencePattern;
  interval?: number;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  month_of_year?: number | null;
  end_date?: string | null;
  end_after_count?: number | null;
  is_active?: boolean;
}

/** Summary of an entity occurrence in a recurrence chain. */
export interface EntitySummary {
  id: string;
  entity_type: string;
  title: string;
  occurrence_index: number | null;
  date: string | null;
  status: string | null;
}

// --- Reference Types ---

/** Valid source/target entity types. */
export type EntityType = "note" | "task" | "plan" | "time_entry";

/** Valid target-only types (includes external). */
export type TargetType = EntityType | "url" | "file";

/** Valid relation types. */
export type RelationType =
  | "references"
  | "blocks"
  | "blocked_by"
  | "subtask_of"
  | "related_to"
  | "spawned"
  | "spawned_from"
  | "implements"
  | "daily_note_for"
  | "scheduled_in"
  | "documents"
  | "continues"
  | "time_logged";

/** A reference (link) between two entities. */
export interface Reference {
  id: string;
  source_type: EntityType;
  source_id: string;
  target_type: TargetType;
  target_id: string | null;
  target_uri: string | null;
  relation: RelationType;
  created_at: string;
}

/** Input for creating a reference. */
export interface CreateReferenceInput {
  source_type: EntityType;
  source_id: string;
  target_type: TargetType;
  target_id?: string;
  target_uri?: string;
  relation?: RelationType;
}

/** Filter for querying references. */
export interface ReferenceFilter {
  source_type?: string;
  source_id?: string;
  target_type?: string;
  target_id?: string;
  relation?: string;
}

/** A backlink: an entity that references the queried entity. */
export interface Backlink {
  reference: Reference;
  source_title: string;
  source_snippet: string | null;
}

// --- Status/Priority Display Configuration ---

/** Display configuration for a task status. */
export interface StatusConfig {
  label: string;
  icon: string;
  color: string;
}

/** Display configuration for a task priority. */
export interface PriorityConfig {
  label: string;
  color: string;
  sortOrder: number;
}

/** Status display configuration map. */
export const STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  inbox:       { label: "Inbox",       icon: "inbox",        color: "text-zinc-400" },
  todo:        { label: "To Do",       icon: "circle",       color: "text-blue-500" },
  in_progress: { label: "In Progress", icon: "play-circle",  color: "text-amber-500" },
  done:        { label: "Done",        icon: "check-circle", color: "text-green-500" },
  cancelled:   { label: "Cancelled",   icon: "x-circle",     color: "text-zinc-400" },
};

/** Priority display configuration map. */
export const PRIORITY_CONFIG: Record<TaskPriority, PriorityConfig> = {
  none:   { label: "-",       color: "text-zinc-400",  sortOrder: 0 },
  low:    { label: "Low",     color: "text-blue-400",  sortOrder: 1 },
  medium: { label: "Medium",  color: "text-amber-400", sortOrder: 2 },
  high:   { label: "High",    color: "text-orange-500", sortOrder: 3 },
  urgent: { label: "Urgent",  color: "text-red-500",   sortOrder: 4 },
};

// --- Plan Types ---

/** Valid plan type values. */
export type PlanType = "time_block" | "event" | "daily_plan" | "milestone" | "deadline" | "meeting" | "review" | "habit" | "reminder";

/** Valid importance levels. */
export type Importance = "low" | "medium" | "high" | "critical";

/** A complete plan entity — a calendar-bound block of time. */
export interface Plan {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  type: PlanType;
  category: string | null;
  color: string | null;
  importance: Importance | null;
  tags: string[] | null;
  recurrence: RecurrenceRule | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  reminders_muted: boolean;
}

/** Input for creating a new plan. */
export interface CreatePlanInput {
  workspace_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  all_day?: boolean;
  type?: PlanType;
  category?: string;
  color?: string;
  importance?: Importance;
  tags?: string[] | null;
  recurrence?: RecurrenceRule;
  reminders_muted?: boolean;
}

/** Input for updating an existing plan (partial update). */
export interface UpdatePlanInput {
  id: string;
  title?: string;
  description?: string | null;
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  type?: PlanType;
  category?: string | null;
  color?: string | null;
  importance?: Importance | null;
  tags?: string[] | null;
  recurrence?: RecurrenceRule | null;
  reminders_muted?: boolean;
}

/** Query parameters for listing plans. */
export interface PlanQuery {
  workspace_id: string;
  start_after?: string;
  end_before?: string;
  plan_type?: PlanType;
  category?: string;
  importance?: string;
  include_deleted?: boolean;
}

/** A plan with its linked entities for the detail view. */
export interface PlanWithLinks {
  plan: Plan;
  linked_tasks: PlanLinkedTask[];
  linked_notes: PlanLinkedNote[];
}

/** A task linked to a plan (summary view). */
export interface PlanLinkedTask {
  task_id: string;
  title: string;
  status: string;
  priority: string;
  relation: string;
}

/** A note linked to a plan (summary view). */
export interface PlanLinkedNote {
  note_id: string;
  title: string | null;
  date: string | null;
  relation: string;
}

/** Aggregated daily plan data for a single day. */
export interface DailyPlanSummary {
  date: string;
  daily_plan: Plan | null;
  time_blocks: Plan[];
  events: Plan[];
  milestones: Plan[];
  deadlines: Plan[];
  meetings: Plan[];
  reviews: Plan[];
  habits: Plan[];
  reminders: Plan[];
  scheduled_tasks: PlanLinkedTask[];
}

/** A unified agenda item (plan or task). */
export interface AgendaItem {
  item_type: "plan" | "task";
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  date: string | null;
  plan_type: PlanType | null;
  task_status: string | null;
  task_priority: string | null;
  color: string | null;
  importance: string | null;
  all_day: boolean | null;
}

/** Input for spawning a task from a plan. */
export interface SpawnTaskInput {
  plan_id: string;
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  scheduled_date?: string;
}

/** Input for spawning a note from a plan. */
export interface SpawnNoteInput {
  plan_id: string;
  title?: string;
  template_body?: string;
  note_type?: string;
  folder?: string;
}

/** Plan type display configuration. */
export interface PlanTypeConfig {
  label: string;
  icon: string;
  color: string;
}

/** Plan type display configuration map. */
export const PLAN_TYPE_CONFIG: Record<PlanType, PlanTypeConfig> = {
  time_block: { label: "Time Block", icon: "clock",    color: "#3b82f6" },
  event:      { label: "Event",      icon: "calendar", color: "#8b5cf6" },
  daily_plan: { label: "Daily Plan", icon: "sun",      color: "#10b981" },
  milestone:  { label: "Milestone",  icon: "diamond",  color: "#f59e0b" },
  deadline:   { label: "Deadline",   icon: "flag",     color: "#ef4444" },
  meeting:    { label: "Meeting",    icon: "users",    color: "#6366f1" },
  review:     { label: "Review",     icon: "refresh",  color: "#14b8a6" },
  habit:      { label: "Habit",      icon: "repeat",   color: "#a855f7" },
  reminder:   { label: "Reminder",   icon: "bell",     color: "#f97316" },
};

/** Importance display configuration. */
export const IMPORTANCE_CONFIG: Record<Importance, { label: string; color: string }> = {
  low:      { label: "Low",      color: "text-blue-400" },
  medium:   { label: "Medium",   color: "text-amber-400" },
  high:     { label: "High",     color: "text-orange-500" },
  critical: { label: "Critical", color: "text-red-500" },
};

// --- Time Tracker Types ---

/** A pause interval within a tracking session. */
export interface Pause {
  paused_at: string;
  resumed_at: string | null;
}

/** A timestamped note taken during an active tracking session. */
export interface SessionNote {
  elapsed_mins: number;
  wall_time: string;
  text: string;
  ref_type?: string;
  ref_id?: string;
}

/** A recorded time tracking session. */
export interface TimeEntry {
  id: string;
  workspace_id: string;
  start_time: string;
  end_time: string | null;
  pauses: Pause[];
  active_mins: number | null;
  notes: string;
  category: string | null;
  tags: string[];
  session_notes: SessionNote[];
  linked_plan_id: string | null;
  linked_task_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Tracker status values. */
export type TrackerStatus = "idle" | "running" | "paused";

/** Break reminder modes. */
export type BreakMode = "none" | "pomodoro" | "custom";

/** Pomodoro break configuration. */
export interface PomodoroConfig {
  work_mins: number;
  short_break_mins: number;
  long_break_mins: number;
  cycles_before_long: number;
}

/** Custom break configuration. */
export interface CustomBreakConfig {
  interval_mins: number;
}

/** Combined break configuration for all modes. */
export interface BreakConfig {
  pomodoro: PomodoroConfig;
  custom: CustomBreakConfig;
  sound_enabled: boolean;
  snooze_mins: number;
}

/** Persisted tracker state for crash recovery and frontend sync. */
export interface TrackerState {
  status: TrackerStatus;
  time_entry_id: string | null;
  started_at: string | null;
  paused_at: string | null;
  pauses: Pause[];
  notes: string;
  session_notes: SessionNote[];
  linked_plan_id: string | null;
  linked_task_id: string | null;
  category: string | null;
  tags: string[];
  break_mode: BreakMode;
  break_config: BreakConfig;
  pomodoro_cycle: number;
  active_mins?: number | null;
  end_time?: string | null;
  updated_at: string;
}

/** Input parameters for starting a tracking session. */
export interface StartTrackerInput {
  workspace_id: string;
  linked_plan_id?: string;
  linked_task_id?: string;
  category?: string;
  tags?: string[];
  break_mode?: BreakMode;
}

/** Input parameters for saving a completed session's details. */
export interface SaveDetailInput {
  time_entry_id: string;
  notes?: string;
  category?: string;
  tags?: string[];
  linked_plan_id?: string;
  linked_task_id?: string;
  create_task?: CreateTaskFromSession;
  create_note?: CreateNoteFromSession;
}

/** Parameters for creating a task from a tracking session. */
export interface CreateTaskFromSession {
  title: string;
  description?: string;
}

/** Parameters for creating a note from a tracking session. */
export interface CreateNoteFromSession {
  title: string;
  folder?: string;
}

/** A daily time summary. */
export interface DailySummary {
  date: string;
  total_mins: number;
  entry_count: number;
  by_category: CategoryTime[];
  by_tag: TagTime[];
}

/** A weekly time summary. */
export interface WeeklySummary {
  week_start: string;
  week_end: string;
  total_mins: number;
  daily_breakdown: DailySummary[];
  by_category: CategoryTime[];
  by_tag: TagTime[];
}

/** Time totals for a single category. */
export interface CategoryTime {
  category: string | null;
  total_mins: number;
  entry_count: number;
}

/** Time totals for a single tag. */
export interface TagTime {
  tag: string;
  total_mins: number;
  entry_count: number;
}

// --- Phase 6: Discovery & Advanced Views ---

/** A persisted search filter configuration. */
export interface SavedFilter {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  filter_config: FilterConfig;
  sort_order: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

/** Filter configuration for faceted search. */
export interface FilterConfig {
  entity_types?: string[];
  query?: string;
  tags?: string[];
  tags_mode?: "any" | "all";
  categories?: string[];
  statuses?: string[];
  priorities?: string[];
  importance?: string[];
  date_field?: string;
  date_from?: string;
  date_to?: string;
  folders?: string[];
  note_types?: string[];
  front_matter_filters?: FrontMatterFilter[];
  has_references_to?: string;
  referenced_by?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  limit?: number;
}

/** A filter on a custom front matter field. */
export interface FrontMatterFilter {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte" | "exists" | "not_exists";
  value?: string;
}

/** Input for creating a saved filter. */
export interface CreateFilterInput {
  workspace_id: string;
  name: string;
  description?: string;
  filter_config: FilterConfig;
  pinned?: boolean;
}

/** Input for updating a saved filter. */
export interface UpdateFilterInput {
  name?: string;
  description?: string;
  filter_config?: FilterConfig;
  pinned?: boolean;
}

/** A single entry in the activity timeline. */
export interface ActivityEntry {
  id: string;
  workspace_id: string;
  entity_type: string;
  entity_id: string;
  entity_title: string | null;
  action: string;
  details: Record<string, unknown> | null;
  actor: string;
  created_at: string;
}

/** Query parameters for the activity log. */
export interface ActivityQuery {
  workspace_id: string;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

/** Graph data containing nodes and edges for visualization. */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** A node in the entity relationship graph. */
export interface GraphNode {
  id: string;
  entity_type: string;
  title: string;
  color: string | null;
  importance: string | null;
  workspace_id: string;
}

/** An edge in the entity relationship graph. */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

/** Query parameters for graph data retrieval. */
export interface GraphQuery {
  workspace_id: string;
  entity_types?: string[];
  center_entity_id?: string;
  depth?: number;
  date_from?: string;
  date_to?: string;
  max_nodes?: number;
}

/** A single result from faceted search. */
export interface FacetedSearchResult {
  id: string;
  entity_type: string;
  title: string;
  snippet: string | null;
  rank: number;
  category: string | null;
  tags: string[];
  status: string | null;
  priority: string | null;
  importance: string | null;
  folder: string | null;
  date: string | null;
  workspace_id: string;
  updated_at: string;
}

/** Full response from a faceted search including facet counts. */
export interface FacetedSearchResponse {
  results: FacetedSearchResult[];
  total_count: number;
  facets: SearchFacets;
}

/** Aggregated counts for each facet dimension. */
export interface SearchFacets {
  entity_type_counts: Record<string, number>;
  category_counts: Record<string, number>;
  tag_counts: Record<string, number>;
  status_counts: Record<string, number>;
  priority_counts: Record<string, number>;
  importance_counts: Record<string, number>;
}

/** Result of a grouped view query. */
export interface GroupedViewResult {
  groups: GroupEntry[];
}

/** A single group in a grouped view. */
export interface GroupEntry {
  key: string;
  count: number;
  items: FacetedSearchResult[];
}

/** Comparison data between planned blocks and actual time entries for a day. */
export interface PlannedVsActualData {
  date: string;
  planned_blocks: PlannedBlock[];
  actual_entries: ActualEntry[];
  planned_total_mins: number;
  actual_total_mins: number;
  difference_mins: number;
}

/** A planned time block from a plan entity. */
export interface PlannedBlock {
  plan_id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_mins: number;
  color: string | null;
}

/** An actual time entry recorded for the day. */
export interface ActualEntry {
  time_entry_id: string;
  start_time: string;
  end_time: string;
  active_mins: number;
  category: string | null;
  linked_plan_id: string | null;
  linked_task_id: string | null;
  notes_preview: string | null;
}

/** A backlink with surrounding context from the source entity. */
export interface BacklinkWithContext {
  reference_id: string;
  source_type: string;
  source_id: string;
  source_title: string;
  relation: string;
  context_snippet: string;
  source_updated_at: string;
}

// --- Phase 7: Recurrence, Templates & Automation ---

/** Reminder offset type values. */
export type ReminderOffsetType = "at_time" | "15min_before" | "1hr_before" | "1day_before" | "custom";

/** A reminder for a task or plan. */
export interface Reminder {
  id: string;
  workspace_id: string;
  entity_type: "task" | "plan";
  entity_id: string;
  remind_at: string;
  offset_type: ReminderOffsetType;
  offset_mins: number | null;
  is_fired: boolean;
  is_dismissed: boolean;
  created_at: string;
  updated_at: string;
}

/** Global reminder default settings. */
export interface ReminderDefaults {
  task_due: string[];
  plan_start: string[];
  enabled: boolean;
}

/** Input for creating a reminder. */
export interface CreateReminderInput {
  workspace_id: string;
  entity_type: "task" | "plan";
  entity_id: string;
  offset_type: ReminderOffsetType;
  offset_mins?: number;
  reference_time: string;
}

/** Input for updating a reminder. */
export interface UpdateReminderInput {
  offset_type?: string;
  offset_mins?: number | null;
  reference_time?: string;
}

/** A note template loaded from disk. */
export interface NoteTemplate {
  file_name: string;
  name: string;
  description: string;
  version: number;
  defaults: Record<string, unknown>;
  variables: TemplateVariable[];
  body: string;
}

/** A variable definition within a note template. */
export interface TemplateVariable {
  name: string;
  label: string;
  var_type: "text" | "select" | "date" | "number" | "boolean";
  default: unknown | null;
  options: string[] | null;
}

/** Input for creating a template. */
export interface CreateTemplateInput {
  file_name: string;
  name: string;
  description: string;
  defaults: Record<string, unknown>;
  variables: TemplateVariable[];
  body: string;
}

/** Input for updating a template. */
export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  defaults?: Record<string, unknown>;
  variables?: TemplateVariable[];
  body?: string;
}

/** An auto-suggestion when the time tracker stops. */
export interface Suggestion {
  entity_type: "task" | "plan";
  entity_id: string;
  title: string;
  score: number;
  reason: string;
}

/** Auto-daily-note configuration. */
export interface AutoDailyNoteConfig {
  enabled: boolean;
  template: string;
}

// --- Phase 8: Polish & Power Features ---

/** A snapshot of a note's content at a point in time. */
export interface NoteVersion {
  id: string;
  note_id: string;
  workspace_id: string;
  title: string | null;
  body: string;
  body_hash: string;
  version_number: number;
  created_at: string;
}

/** Lightweight version info for timeline display. */
export interface NoteVersionSummary {
  id: string;
  version_number: number;
  title: string | null;
  body_hash: string;
  created_at: string;
  body_size: number;
}

/** A computed diff between two versions. */
export interface VersionDiff {
  from_version_id: string;
  to_version_id: string;
  hunks: DiffHunk[];
  stats: DiffStats;
}

/** Diff statistics. */
export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
}

/** A contiguous region of changes. */
export interface DiffHunk {
  lines: DiffLine[];
}

/** A single diff line. */
export interface DiffLine {
  kind: "Added" | "Removed" | "Unchanged";
  content: string;
}

/** Storage stats for version history. */
export interface VersionStorageStats {
  total_versions: number;
  total_size_bytes: number;
  notes_with_versions: number;
  largest_notes: NoteVersionSizeEntry[];
}

/** Per-note version size info. */
export interface NoteVersionSizeEntry {
  note_id: string;
  title: string | null;
  version_count: number;
  total_size_bytes: number;
}

/** Result of a prune operation. */
export interface PruneResult {
  pruned_count: number;
  freed_bytes: number;
}

/** Configuration for version history. */
export interface VersionHistoryConfig {
  enabled: boolean;
  max_versions_per_note: number;
  auto_prune: boolean;
  snapshot_debounce_secs: number;
}

/** Result of an import operation. */
export interface ImportResult {
  imported_count: number;
  skipped_count: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

/** An import error. */
export interface ImportError {
  file_path: string;
  message: string;
}

/** An import warning. */
export interface ImportWarning {
  file_path: string;
  message: string;
}

/** Options for markdown folder import. */
export interface MarkdownImportOptions {
  source_dir: string;
  workspace_id: string;
  target_folder?: string;
  preserve_folder_structure: boolean;
  overwrite_existing: boolean;
}

/** Options for Obsidian vault import. */
export interface ObsidianImportOptions {
  vault_path: string;
  workspace_id: string;
  target_folder?: string;
  convert_wikilinks: boolean;
  import_tags: boolean;
}

/** Options for CSV task import. */
export interface CsvImportOptions {
  file_path: string;
  workspace_id: string;
  delimiter?: string;
  has_header: boolean;
  field_mapping: CsvFieldMapping;
}

/** CSV column to task field mapping. */
export interface CsvFieldMapping {
  title: number;
  description?: number;
  status?: number;
  priority?: number;
  due_date?: number;
  category?: number;
  tags?: number;
}

/** CSV file preview. */
export interface CsvPreview {
  headers: string[];
  rows: string[][];
  total_rows: number;
}

/** Enhanced export result. */
export interface EnhancedExportResult {
  exported_count: number;
  output_path: string;
  format: string;
  errors: string[];
}

/** JSON export options. */
export interface JsonExportOptions {
  workspace_id: string;
  output_path: string;
  include_notes: boolean;
  include_tasks: boolean;
  include_plans: boolean;
  include_time_entries: boolean;
  pretty_print: boolean;
}

/** CSV export options. */
export interface CsvExportOptions {
  workspace_id: string;
  output_path: string;
  include_done: boolean;
  include_cancelled: boolean;
  delimiter?: string;
}

/** Markdown export options. */
export interface MarkdownExportOptions {
  workspace_id: string;
  output_dir: string;
  note_ids?: string[];
  folder?: string;
  include_front_matter: boolean;
  flatten_folders: boolean;
}

/** Undo/redo state. */
export interface UndoRedoState {
  can_undo: boolean;
  can_redo: boolean;
  undo_description: string | null;
  redo_description: string | null;
}

/** Theme settings. */
export interface ThemeSettings {
  mode: "system" | "light" | "dark";
  accent_color: string;
}

/** A command palette command. */
export interface Command {
  id: string;
  title: string;
  category: string;
  shortcut?: string;
  handler: () => void;
  keywords?: string[];
}
