import { create } from "zustand";
import { ask } from "@tauri-apps/plugin-dialog";
import * as ipc from "../lib/ipc";
import { logActivity } from "../lib/activityLog";
import type {
  Note,
  NoteListItem,
  NoteQuery,
  FolderNode,
  CreateNoteInput,
  UpdateNoteInput,
} from "../lib/types";

/** State and actions for note management. */
interface NoteState {
  /** Listed notes matching current filters. */
  notes: NoteListItem[];
  /** The currently selected note with full body content. */
  activeNote: Note | null;
  /** Virtual folder tree for the current workspace. */
  folderTree: FolderNode[];
  /** Dates that have notes in the currently viewed month. */
  datesWithNotes: string[];
  /** Current folder filter (null = show all). */
  currentFolder: string | null;
  /** Active query parameters for list filtering. */
  currentQuery: Partial<NoteQuery>;
  /** Whether a note list load is in progress. */
  isLoading: boolean;
  /** Whether a save operation is in progress. */
  isSaving: boolean;
  /** Error message from the last save attempt. */
  saveError: string | null;

  /** Loads notes matching the given query merged with current filters. */
  loadNotes: (query?: Partial<NoteQuery>) => Promise<void>;
  /** Refreshes the virtual folder tree. */
  loadFolderTree: () => Promise<void>;
  /** Loads dates with notes for a given month. */
  loadDatesWithNotes: (year: number, month: number) => Promise<void>;
  /** Refreshes the note list, folder tree, and calendar dates. */
  refreshAll: () => Promise<void>;
  /** Selects and loads the full content of a note by ID. */
  selectNote: (id: string) => Promise<void>;
  /** Creates a new note. */
  createNote: (input: CreateNoteInput) => Promise<Note>;
  /** Updates an existing note. */
  updateNote: (id: string, input: UpdateNoteInput) => Promise<void>;
  /** Soft-deletes a note and refreshes the list. */
  deleteNote: (id: string) => Promise<void>;
  /** Restores a soft-deleted note. */
  restoreNote: (id: string) => Promise<void>;
  /** Permanently deletes a note from the database. */
  hardDeleteNote: (id: string) => Promise<void>;
  /** Opens or creates a daily note for the given date. */
  openDailyNote: (date: string) => Promise<void>;
  /** Moves a note to a folder and refreshes. */
  moveToFolder: (id: string, folder: string) => Promise<void>;
  /** Sets the active folder filter and reloads notes. */
  setFolder: (folder: string | null) => void;
  /** Clears the active note selection. */
  clearActiveNote: () => void;

  /** IDs of notes selected for bulk operations. */
  selectedNoteIds: Set<string>;
  /** Toggles a note in/out of the selection set. */
  toggleNoteSelection: (id: string) => void;
  /** Selects all notes in the current list. */
  selectAllNotes: () => void;
  /** Clears the note selection. */
  clearNoteSelection: () => void;
}

import { useWorkspaceStore } from "./workspaceStore";

/** Reads the active workspace ID synchronously from the workspace store. */
function getWorkspaceId(): string {
  const id = useWorkspaceStore.getState().activeWorkspaceId;
  if (!id) throw new Error("No active workspace");
  return id;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  activeNote: null,
  folderTree: [],
  datesWithNotes: [],
  currentFolder: null,
  currentQuery: {},
  isLoading: false,
  isSaving: false,
  saveError: null,

  loadNotes: async (query) => {
    set({ isLoading: true });
    try {
      const wsId = getWorkspaceId();
      // When query is provided, it replaces currentQuery (new filter).
      // When query is omitted, reload with existing currentQuery (refresh).
      const baseQuery = query !== undefined ? query : get().currentQuery;
      const { workspace_id: _old, ...rest } = baseQuery as NoteQuery;
      const merged: NoteQuery = {
        ...rest,
        workspace_id: wsId,
      };
      if (get().currentFolder) {
        merged.folder = get().currentFolder ?? undefined;
      }
      const notes = await ipc.listNotes(merged);
      set({ notes, currentQuery: merged, isLoading: false, selectedNoteIds: new Set() });
    } catch {
      set({ isLoading: false });
    }
  },

  loadFolderTree: async () => {
    try {
      const wsId = getWorkspaceId();
      const folderTree = await ipc.getFolderTree(wsId);
      set({ folderTree });
    } catch {
      // silently fail
    }
  },

  loadDatesWithNotes: async (year, month) => {
    try {
      const wsId = getWorkspaceId();
      const dates = await ipc.getDatesWithNotes(wsId, year, month);
      set({ datesWithNotes: dates });
    } catch {
      // silently fail
    }
  },

  refreshAll: async () => {
    const now = new Date();
    await Promise.all([
      get().loadNotes(),
      get().loadFolderTree(),
      get().loadDatesWithNotes(now.getFullYear(), now.getMonth() + 1),
    ]);
  },

  selectNote: async (id) => {
    try {
      const note = await ipc.getNote(id);
      set({ activeNote: note });
    } catch {
      set({ activeNote: null });
    }
  },

  createNote: async (input) => {
    const wsId = getWorkspaceId();
    const note = await ipc.createNote({ ...input, workspace_id: wsId });
    set({ activeNote: note });
    logActivity(`Created note: ${note.title}`, "note", note.id);
    await get().refreshAll();
    useWorkspaceStore.getState().loadWorkspaces();
    return note;
  },

  updateNote: async (id, input) => {
    set({ isSaving: true, saveError: null });
    try {
      const updated = await ipc.updateNote(id, input);
      set({ activeNote: updated, isSaving: false });
      // Refresh list + folder tree — await to ensure UI stays in sync
      await Promise.all([get().loadNotes(), get().loadFolderTree()]);
    } catch (e) {
      set({ isSaving: false, saveError: String(e) });
    }
  },

  deleteNote: async (id) => {
    const title =
      get().activeNote?.id === id
        ? get().activeNote!.title
        : get().notes.find((n) => n.id === id)?.title ?? "Untitled";
    const confirmed = await ask("Delete this note?", {
      title: "Confirm Delete",
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      await ipc.deleteNote(id);
      logActivity(`Deleted note: ${title}`, "note", id);
      const activeNote = get().activeNote;
      if (activeNote?.id === id) {
        set({ activeNote: null });
      }
      await get().refreshAll();
      useWorkspaceStore.getState().loadWorkspaces();
    } catch (e) {
      console.error("Failed to delete note:", e);
    }
  },

  restoreNote: async (id) => {
    await ipc.restoreNote(id);
    await get().refreshAll();
    useWorkspaceStore.getState().loadWorkspaces();
  },

  hardDeleteNote: async (id) => {
    const confirmed = await ask(
      "Permanently delete this note? This cannot be undone.",
      { title: "Confirm Permanent Delete", kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await ipc.hardDeleteNote(id);
      const activeNote = get().activeNote;
      if (activeNote?.id === id) {
        set({ activeNote: null });
      }
      await get().refreshAll();
      useWorkspaceStore.getState().loadWorkspaces();
    } catch (e) {
      console.error("Failed to permanently delete note:", e);
    }
  },

  openDailyNote: async (date) => {
    const wsId = getWorkspaceId();
    let note = await ipc.getDailyNote(wsId, date);
    if (!note) {
      // Check auto_daily_note setting for template-based creation
      let useTemplate = false;
      let templateName = "";
      try {
        const raw = await ipc.getSetting("auto_daily_note");
        if (raw) {
          const config = JSON.parse(raw) as { enabled: boolean; template: string };
          if (config.enabled && config.template) {
            useTemplate = true;
            templateName = config.template;
          }
        }
      } catch {
        // Ignore parse errors, fall back to default creation
      }

      if (useTemplate) {
        note = await ipc.createNoteFromTemplate(wsId, templateName, {}, date);
      } else {
        note = await ipc.createDailyNote(wsId, date);
      }
      logActivity(`Created daily note: ${date}`, "note", note.id);
      await get().refreshAll();
      useWorkspaceStore.getState().loadWorkspaces();
    }
    set({ activeNote: note });
  },

  moveToFolder: async (id, folder) => {
    await ipc.moveNoteToFolder(id, folder);
    await get().refreshAll();
  },

  setFolder: (folder) => {
    set({ currentFolder: folder, currentQuery: {} });
    get().loadNotes();
  },

  clearActiveNote: () => set({ activeNote: null }),

  selectedNoteIds: new Set<string>(),
  toggleNoteSelection: (id) => {
    const next = new Set(get().selectedNoteIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selectedNoteIds: next });
  },
  selectAllNotes: () => {
    const ids = new Set(get().notes.map((n) => n.id));
    set({ selectedNoteIds: ids });
  },
  clearNoteSelection: () => set({ selectedNoteIds: new Set() }),
}));
