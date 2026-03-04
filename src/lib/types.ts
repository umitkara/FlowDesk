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
}

/** A single full-text search result. */
export interface SearchResult {
  id: string;
  title: string | null;
  snippet: string;
  rank: number;
  note_type: string | null;
  folder: string | null;
  updated_at: string;
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
