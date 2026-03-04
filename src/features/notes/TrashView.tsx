import { useCallback, useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useNoteStore } from "../../stores/noteStore";
import { timeAgo, truncate } from "../../lib/utils";
import * as ipc from "../../lib/ipc";
import type { NoteListItem } from "../../lib/types";

/** View for browsing, restoring, and permanently deleting soft-deleted notes. */
export function TrashView() {
  const [trashedNotes, setTrashedNotes] = useState<NoteListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const restoreNote = useNoteStore((s) => s.restoreNote);
  const hardDeleteNote = useNoteStore((s) => s.hardDeleteNote);

  const loadTrashed = useCallback(async () => {
    setIsLoading(true);
    try {
      const workspaces = await ipc.listWorkspaces();
      if (workspaces.length === 0) return;
      const notes = await ipc.listNotes({
        workspace_id: workspaces[0].id,
        only_deleted: true,
        sort_by: "updated_at",
        sort_order: "desc",
        limit: 200,
      });
      setTrashedNotes(notes);
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrashed();
  }, [loadTrashed]);

  const handleRestore = useCallback(
    async (id: string) => {
      await restoreNote(id);
      await loadTrashed();
    },
    [restoreNote, loadTrashed],
  );

  const handleHardDelete = useCallback(
    async (id: string) => {
      await hardDeleteNote(id);
      await loadTrashed();
    },
    [hardDeleteNote, loadTrashed],
  );

  const handleEmptyTrash = useCallback(async () => {
    const confirmed = await ask(
      `Permanently delete all ${trashedNotes.length} notes in trash? This cannot be undone.`,
      { title: "Empty Trash", kind: "warning" },
    );
    if (!confirmed) return;
    for (const note of trashedNotes) {
      try {
        await ipc.hardDeleteNote(note.id);
      } catch (e) {
        console.error("Failed to delete note:", e);
      }
    }
    await loadTrashed();
  }, [trashedNotes, loadTrashed]);

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Trash
          </h1>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {trashedNotes.length} deleted {trashedNotes.length === 1 ? "note" : "notes"}
          </p>
        </div>
        {trashedNotes.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Empty Trash
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      )}

      {!isLoading && trashedNotes.length === 0 && (
        <div className="py-12 text-center">
          <div className="mb-2 text-3xl text-gray-300 dark:text-gray-600">
            <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">Trash is empty</p>
        </div>
      )}

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {trashedNotes.map((note) => (
          <div
            key={note.id}
            className="flex items-start justify-between gap-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {note.title || "Untitled"}
              </h3>
              {note.preview && (
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  {truncate(note.preview, 100)}
                </p>
              )}
              <span className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                Deleted {timeAgo(note.updated_at)}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                onClick={() => handleRestore(note.id)}
                title="Restore note"
                className="rounded-md p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button
                onClick={() => handleHardDelete(note.id)}
                title="Delete permanently"
                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
