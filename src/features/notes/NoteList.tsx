import { useCallback, useState, useEffect, useRef } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { BulkMoveToWorkspaceMenu } from "../../components/shared/BulkMoveToWorkspaceMenu";
import { timeAgo, truncate } from "../../lib/utils";
import * as ipc from "../../lib/ipc";
import type { NoteListItem } from "../../lib/types";

/** Helper to get a Tailwind color for importance levels. */
function importanceColor(imp: string | null): string {
  switch (imp) {
    case "critical": return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
    case "high": return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400";
    case "medium": return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
    default: return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  }
}

/** List of notes with sorting, filtering, and selection. */
export function NoteList() {
  const notes = useNoteStore((s) => s.notes);
  const activeNote = useNoteStore((s) => s.activeNote);
  const selectNote = useNoteStore((s) => s.selectNote);
  const createNote = useNoteStore((s) => s.createNote);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const isLoading = useNoteStore((s) => s.isLoading);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const selectedNoteIds = useNoteStore((s) => s.selectedNoteIds);
  const toggleNoteSelection = useNoteStore((s) => s.toggleNoteSelection);
  const selectAllNotes = useNoteStore((s) => s.selectAllNotes);
  const clearNoteSelection = useNoteStore((s) => s.clearNoteSelection);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const folderTree = useNoteStore((s) => s.folderTree);

  const noteTypes = useWorkspaceStore(
    (s) => s.activeWorkspace?.config.note_types ?? [],
  );

  // Sort & filter local state
  const [sortBy, setSortBy] = useState<string>("updated_at");
  const [sortDir, setSortDir] = useState<string>("desc");
  const [filterType, setFilterType] = useState<string>("");
  const [filterImportance, setFilterImportance] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Reload notes when sort/filter changes
  useEffect(() => {
    loadNotes({
      sort_by: sortBy as "updated_at" | "created_at" | "title" | "date",
      sort_order: sortDir as "asc" | "desc",
      note_type: filterType || undefined,
      importance: filterImportance || undefined,
    });
  }, [sortBy, sortDir, filterType, filterImportance, loadNotes]);

  // Reset focused index when notes change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [notes]);

  // Auto-scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-note-card]");
      items[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const handleSelect = useCallback(
    async (id: string) => {
      await selectNote(id);
      navigateTo(id);
    },
    [selectNote, navigateTo],
  );

  const handleNewNote = useCallback(async () => {
    const note = await createNote({
      workspace_id: "",
      title: "Untitled",
    });
    await selectNote(note.id);
    navigateTo(note.id);
  }, [createNote, selectNote, navigateTo]);

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, notes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && focusedIndex >= 0 && notes[focusedIndex]) {
        e.preventDefault();
        handleSelect(notes[focusedIndex].id);
      }
    },
    [notes, focusedIndex, handleSelect],
  );

  const handleBulkDelete = useCallback(async () => {
    const count = selectedNoteIds.size;
    const confirmed = await ask(`Delete ${count} selected note${count > 1 ? "s" : ""}?`, {
      title: "Confirm Bulk Delete",
      kind: "warning",
    });
    if (!confirmed) return;
    for (const id of selectedNoteIds) {
      try {
        await ipc.deleteNote(id);
      } catch {
        // continue
      }
    }
    clearNoteSelection();
    loadNotes();
  }, [selectedNoteIds, clearNoteSelection, loadNotes]);

  // Collect folder paths for move dropdown
  const folderPaths: string[] = [];
  const collectFolders = (nodes: typeof folderTree) => {
    for (const node of nodes) {
      folderPaths.push(node.path);
      if (node.children.length > 0) collectFolders(node.children);
    }
  };
  collectFolders(folderTree);

  const handleBulkMoveToFolder = useCallback(
    async (folder: string) => {
      for (const id of selectedNoteIds) {
        try {
          await ipc.moveNoteToFolder(id, folder);
        } catch {
          // continue
        }
      }
      clearNoteSelection();
      loadNotes();
    },
    [selectedNoteIds, clearNoteSelection, loadNotes],
  );

  const allSelected = notes.length > 0 && selectedNoteIds.size === notes.length;
  const hasSelection = selectedNoteIds.size > 0;

  const hasActiveFilters = filterType !== "" || filterImportance !== "";

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <div className="flex items-center gap-2">
          {notes.length > 0 && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => (allSelected ? clearNoteSelection() : selectAllNotes())}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
              title={allSelected ? "Deselect all" : "Select all"}
            />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Notes
            {notes.length > 0 && (
              <span className="ml-1.5 font-normal">{notes.length}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            title="Sort & filter"
            className={`rounded-md p-1 ${
              showFilters || hasActiveFilters
                ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </button>
          <button
            onClick={handleNewNote}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            title="New note (Ctrl+N)"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sort & filter toolbar */}
      {showFilters && (
        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="updated_at">Updated</option>
              <option value="created_at">Created</option>
              <option value="title">Title</option>
              <option value="date">Date</option>
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <svg className={`h-3.5 w-3.5 transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="">All types</option>
              {noteTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={filterImportance}
              onChange={(e) => setFilterImportance(e.target.value)}
              className="rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="">All importance</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterType(""); setFilterImportance(""); }}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        className="flex-1 overflow-y-auto outline-none"
      >
        {isLoading && notes.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-400 dark:text-gray-500">
            Loading...
          </div>
        )}
        {!isLoading && notes.length === 0 && (
          <div className="p-4 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No notes found
            </p>
            <button
              onClick={handleNewNote}
              className="mt-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              Create your first note
            </button>
          </div>
        )}
        {notes.map((note, index) => (
          <NoteListCard
            key={note.id}
            note={note}
            isActive={activeNote?.id === note.id}
            isSelected={selectedNoteIds.has(note.id)}
            isFocused={focusedIndex === index}
            hasSelection={hasSelection}
            onSelect={handleSelect}
            onToggleSelect={toggleNoteSelection}
            onDelete={deleteNote}
          />
        ))}
      </div>

      {/* Bulk action bar */}
      {hasSelection && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {selectedNoteIds.size} selected
          </span>
          <BulkMoveToWorkspaceMenu
            entityIds={Array.from(selectedNoteIds)}
            entityType="note"
            onMoved={() => { clearNoteSelection(); loadNotes(); }}
          />
          {folderPaths.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) handleBulkMoveToFolder(e.target.value);
                e.target.value = "";
              }}
              className="rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="" disabled>Move to folder...</option>
              {folderPaths.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleBulkDelete}
            className="rounded px-2 py-1 text-[11px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            Delete
          </button>
          <button
            onClick={clearNoteSelection}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

/** A single note card in the note list. */
function NoteListCard({
  note,
  isActive,
  isSelected,
  isFocused,
  hasSelection,
  onSelect,
  onToggleSelect,
  onDelete,
}: {
  note: NoteListItem;
  isActive: boolean;
  isSelected: boolean;
  isFocused: boolean;
  hasSelection: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      data-note-card
      onClick={() => onSelect(note.id)}
      className={`group relative w-full cursor-pointer border-b border-gray-100 px-3 py-2.5 text-left transition-colors dark:border-gray-800/50 ${
        isFocused
          ? "ring-2 ring-inset ring-primary-400"
          : ""
      } ${
        isSelected
          ? "bg-primary-50/70 dark:bg-primary-900/30"
          : isActive
            ? "bg-primary-50 dark:bg-primary-900/20"
            : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
      }`}
      style={note.color ? { borderLeft: `3px solid ${note.color}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(note.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className={`mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 ${
              hasSelection || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            } transition-opacity`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {note.pinned && (
                <svg className="h-3 w-3 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              )}
              <h3
                className={`text-sm font-medium leading-snug ${
                  isActive
                    ? "text-primary-900 dark:text-primary-100"
                    : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {note.title || "Untitled"}
              </h3>
              {note.note_type && (
                <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                  {note.note_type}
                </span>
              )}
              {note.importance && note.importance !== "low" && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${importanceColor(note.importance)}`}>
                  {note.importance}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
          {timeAgo(note.updated_at)}
        </span>
      </div>
      {note.preview && (
        <p className="mt-0.5 pl-6 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {truncate(note.preview, 120)}
        </p>
      )}
      {note.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
          {note.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {/* Delete button — visible on hover or when active */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(note.id);
        }}
        title="Delete note"
        className={`absolute right-2 top-2 rounded p-0.5 text-gray-400 transition-opacity hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
