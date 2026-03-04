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

/** A single full-text search result (notes and tasks). */
export interface SearchResult {
  entity_type: "note" | "task";
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
export type RelationType = "references" | "blocks" | "blocked_by" | "subtask_of" | "related_to";

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
