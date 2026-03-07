import { useCallback } from "react";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { BulkMoveToWorkspaceMenu } from "../../components/shared/BulkMoveToWorkspaceMenu";
import { timeAgo, truncate } from "../../lib/utils";
import type { NoteListItem } from "../../lib/types";

/** List of notes with sorting and selection. */
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

  const allSelected = notes.length > 0 && selectedNoteIds.size === notes.length;
  const hasSelection = selectedNoteIds.size > 0;

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

      {/* List */}
      <div className="flex-1 overflow-y-auto">
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
        {notes.map((note) => (
          <NoteListCard
            key={note.id}
            note={note}
            isActive={activeNote?.id === note.id}
            isSelected={selectedNoteIds.has(note.id)}
            hasSelection={hasSelection}
            onSelect={handleSelect}
            onToggleSelect={toggleNoteSelection}
            onDelete={deleteNote}
          />
        ))}
      </div>

      {/* Bulk action bar */}
      {hasSelection && (
        <div className="flex items-center gap-3 border-t border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            {selectedNoteIds.size} selected
          </span>
          <BulkMoveToWorkspaceMenu
            entityIds={Array.from(selectedNoteIds)}
            entityType="note"
            onMoved={() => { clearNoteSelection(); loadNotes(); }}
          />
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
  hasSelection,
  onSelect,
  onToggleSelect,
  onDelete,
}: {
  note: NoteListItem;
  isActive: boolean;
  isSelected: boolean;
  hasSelection: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect(note.id)}
      className={`group relative w-full cursor-pointer border-b border-gray-100 px-3 py-2.5 text-left transition-colors dark:border-gray-800/50 ${
        isSelected
          ? "bg-primary-50/70 dark:bg-primary-900/30"
          : isActive
            ? "bg-primary-50 dark:bg-primary-900/20"
            : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
      }`}
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
          <h3
            className={`text-sm font-medium leading-snug ${
              isActive
                ? "text-primary-900 dark:text-primary-100"
                : "text-gray-800 dark:text-gray-200"
            }`}
          >
            {note.title || "Untitled"}
          </h3>
        </div>
        <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
          {timeAgo(note.updated_at)}
        </span>
      </div>
      {note.preview && (
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {truncate(note.preview, 120)}
        </p>
      )}
      {note.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
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
