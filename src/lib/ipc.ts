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
