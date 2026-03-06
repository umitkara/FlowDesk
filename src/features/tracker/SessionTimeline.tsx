import { useState } from "react";
import type { SessionNote } from "../../lib/types";

/** Props for the SessionTimeline component. */
interface SessionTimelineProps {
  /** Session notes to display. */
  sessionNotes: SessionNote[];
  /** Whether to show wall-clock times. */
  showWallTime?: boolean;
  /** Whether to use compact mode (for widget dropdown). */
  compact?: boolean;
  /** Callback to edit a session note's text. */
  onEdit?: (index: number, text: string) => void;
  /** Callback to delete a session note. */
  onDelete?: (index: number) => void;
}

/** Formats a wall-clock ISO string to a short time (HH:MM). */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Renders a vertical timeline of timestamped session notes. */
export function SessionTimeline({
  sessionNotes,
  showWallTime = true,
  compact = false,
  onEdit,
  onDelete,
}: SessionTimelineProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  if (sessionNotes.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">
        No session notes yet
      </p>
    );
  }

  const startEditing = (index: number, text: string) => {
    setEditingIndex(index);
    setEditText(text);
  };

  const saveEdit = (index: number) => {
    if (editText.trim()) {
      onEdit?.(index, editText.trim());
    }
    setEditingIndex(null);
  };

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

      {sessionNotes.map((sn, i) => (
        <div key={i} className={`group relative flex items-start gap-2 ${compact ? "py-0.5" : "py-1"}`}>
          {/* Dot */}
          <div className="relative z-10 mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-blue-400 dark:bg-blue-500 ring-2 ring-white dark:ring-gray-900" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {/* Elapsed badge */}
              <span className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                +{Math.round(sn.elapsed_mins)}min
              </span>

              {/* Wall time */}
              {showWallTime && sn.wall_time && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {formatTime(sn.wall_time)}
                </span>
              )}

              {/* Edit/Delete buttons (only when callbacks provided) */}
              {(onEdit || onDelete) && editingIndex !== i && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {onEdit && (
                    <button
                      onClick={() => startEditing(i, sn.text)}
                      className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                      title="Edit note"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(i)}
                      className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Delete note"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Note text or inline edit */}
            {editingIndex === i ? (
              <div className="mt-0.5 flex gap-1">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit(i);
                    if (e.key === "Escape") setEditingIndex(null);
                  }}
                  className="flex-1 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-xs dark:border-blue-700 dark:bg-gray-800 dark:text-gray-300"
                  autoFocus
                />
                <button
                  onClick={() => saveEdit(i)}
                  className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            ) : (
              <p className={`text-gray-700 dark:text-gray-300 ${compact ? "text-xs" : "text-sm"} mt-0.5 leading-snug`}>
                {sn.text}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
