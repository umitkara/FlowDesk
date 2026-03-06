import { useState, useCallback, useRef, useEffect } from "react";
import { useTrackerStore, formatElapsed } from "../../stores/trackerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { SessionTimeline } from "./SessionTimeline";
import { debounce } from "../../lib/utils";

/** Persistent time tracker widget rendered in the TopBar. Always visible. */
export function TrackerWidget() {
  const status = useTrackerStore((s) => s.status);
  const elapsedSeconds = useTrackerStore((s) => s.elapsedSeconds);
  const notes = useTrackerStore((s) => s.notes);
  const sessionNotes = useTrackerStore((s) => s.sessionNotes);
  const isNotesExpanded = useTrackerStore((s) => s.isNotesExpanded);
  const linkedTaskId = useTrackerStore((s) => s.linkedTaskId);
  const linkedPlanId = useTrackerStore((s) => s.linkedPlanId);
  const breakMode = useTrackerStore((s) => s.breakMode);
  const breakConfig = useTrackerStore((s) => s.breakConfig);
  const pomodoroCycle = useTrackerStore((s) => s.pomodoroCycle);
  const trackerWorkspaceId = useTrackerStore((s) => s.trackerWorkspaceId);
  const start = useTrackerStore((s) => s.start);
  const pause = useTrackerStore((s) => s.pause);
  const resume = useTrackerStore((s) => s.resume);
  const stop = useTrackerStore((s) => s.stop);
  const toggleNotesExpanded = useTrackerStore((s) => s.toggleNotesExpanded);
  const updateNotes = useTrackerStore((s) => s.updateNotes);
  const addSessionNote = useTrackerStore((s) => s.addSessionNote);
  const editSessionNote = useTrackerStore((s) => s.editSessionNote);
  const deleteSessionNote = useTrackerStore((s) => s.deleteSessionNote);

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const [sessionNoteText, setSessionNoteText] = useState("");
  const [showSessionNoteInput, setShowSessionNoteInput] = useState(false);

  // When notes panel opens via keyboard shortcut (Ctrl+Shift+N), also show the input
  const prevExpanded = useRef(isNotesExpanded);
  useEffect(() => {
    if (isNotesExpanded && !prevExpanded.current) {
      setShowSessionNoteInput(true);
    }
    prevExpanded.current = isNotesExpanded;
  }, [isNotesExpanded]);

  // Debounced notes save
  const debouncedSave = useRef(debounce((text: string) => updateNotes(text), 500));

  // Clean up debounce on unmount
  useEffect(() => {
    return () => debouncedSave.current.cancel();
  }, []);

  const handleNotesChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      debouncedSave.current.run(e.target.value);
    },
    [],
  );

  const handleAddSessionNote = useCallback(async () => {
    if (!sessionNoteText.trim()) return;
    await addSessionNote(sessionNoteText.trim());
    setSessionNoteText("");
    setShowSessionNoteInput(false);
  }, [sessionNoteText, addSessionNote]);

  // --- Idle state ---
  if (status === "idle") {
    return (
      <button
        onClick={() => start()}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
        title="Start Tracking (Ctrl+Shift+S)"
      >
        <PlayIcon />
        <span>Start Tracking</span>
      </button>
    );
  }

  const isPaused = status === "paused";

  return (
    <div className="relative">
      {/* Main widget bar */}
      <div className="flex items-center gap-1.5">
        {/* Status indicator dot */}
        <div
          className={`h-2 w-2 rounded-full ${
            isPaused
              ? "bg-amber-400 animate-pulse"
              : "bg-emerald-400"
          }`}
        />

        {/* Elapsed time */}
        <span
          className={`font-mono text-sm font-semibold tabular-nums tracking-tight ${
            isPaused
              ? "text-amber-600 dark:text-amber-400"
              : "text-gray-900 dark:text-gray-100"
          }`}
        >
          {formatElapsed(elapsedSeconds)}
        </span>

        {/* PAUSED label */}
        {isPaused && (
          <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Paused
          </span>
        )}

        {/* Break mode badge */}
        {breakMode === "pomodoro" && (
          <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-900/30 dark:text-red-400">
            P {pomodoroCycle + 1}/{breakConfig.pomodoro.cycles_before_long || 4}
          </span>
        )}
        {breakMode === "custom" && (
          <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
            {breakConfig.custom.interval_mins}m
          </span>
        )}

        {/* Linked entity indicator */}
        {(linkedTaskId || linkedPlanId) && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500" title={linkedTaskId ? "Linked to task" : "Linked to plan"}>
            {linkedTaskId ? "📋" : "📅"}
          </span>
        )}

        {/* Pause / Resume button */}
        {isPaused ? (
          <button
            onClick={() => resume()}
            className="rounded-md p-1 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
            title="Resume (Ctrl+Shift+P)"
          >
            <PlayIcon />
          </button>
        ) : (
          <button
            onClick={() => pause()}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            title="Pause (Ctrl+Shift+P)"
          >
            <PauseIcon />
          </button>
        )}

        {/* Stop button */}
        <button
          onClick={() => stop()}
          className="rounded-md p-1 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          title="Stop (Ctrl+Shift+X)"
        >
          <StopIcon />
        </button>

        {/* Notes toggle */}
        <button
          onClick={toggleNotesExpanded}
          className={`rounded-md p-1 ${
            isNotesExpanded
              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
          title="Session Notes"
        >
          <NoteIcon />
        </button>
      </div>

      {/* Workspace mismatch warning */}
      {trackerWorkspaceId && activeWorkspaceId && trackerWorkspaceId !== activeWorkspaceId && (() => {
        const ws = workspaces.find((w) => w.id === trackerWorkspaceId);
        return (
          <div className="mt-0.5 text-center text-[9px] text-amber-600 dark:text-amber-400">
            tracking in {ws?.name || "another workspace"}
          </div>
        );
      })()}

      {/* Notes dropdown */}
      {isNotesExpanded && (
        <div className="absolute left-1/2 top-full z-40 mt-1 w-80 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          {/* Session notes timeline */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Session Notes
            </span>
            <button
              onClick={() => setShowSessionNoteInput(!showSessionNoteInput)}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              + Add
            </button>
          </div>

          {/* Session note input */}
          {showSessionNoteInput && (
            <div className="mb-2 flex gap-1">
              <input
                type="text"
                value={sessionNoteText}
                onChange={(e) => setSessionNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSessionNote();
                  if (e.key === "Escape") setShowSessionNoteInput(false);
                }}
                placeholder="What are you doing now?"
                className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
                autoFocus
              />
              <button
                onClick={handleAddSessionNote}
                className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          )}

          <div className="max-h-40 overflow-y-auto">
            <SessionTimeline
              sessionNotes={sessionNotes}
              compact
              onEdit={editSessionNote}
              onDelete={deleteSessionNote}
            />
          </div>

          {/* Running notes */}
          <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-800">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Running Notes
            </span>
            <textarea
              defaultValue={notes}
              onChange={handleNotesChange}
              placeholder="Type notes here..."
              rows={3}
              className="mt-1 w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs leading-relaxed text-gray-700 placeholder:text-gray-400 focus:border-blue-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// --- SVG Icons ---

function PlayIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}
