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

/** A workspace context (e.g. "Personal", "Work"). */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  export_path: string | null;
  sort_order: number;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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

/** Recurrence rule for repeating tasks (structural only in Phase 2). */
export interface RecurrenceRule {
  pattern: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval: number;
  days_of_week?: number[];
  end_date?: string;
  end_after_count?: number;
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
export type PlanType = "time_block" | "event" | "daily_plan" | "milestone";

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
};

/** Importance display configuration. */
export const IMPORTANCE_CONFIG: Record<Importance, { label: string; color: string }> = {
  low:      { label: "Low",      color: "text-blue-400" },
  medium:   { label: "Medium",   color: "text-amber-400" },
  high:     { label: "High",     color: "text-orange-500" },
  critical: { label: "Critical", color: "text-red-500" },
};
