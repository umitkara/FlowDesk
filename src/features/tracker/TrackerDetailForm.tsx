import { useState, useEffect } from "react";
import { useTrackerStore, formatMinutes } from "../../stores/trackerStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { SessionTimeline } from "./SessionTimeline";
import type { Task, Plan, Suggestion } from "../../lib/types";
import * as ipc from "../../lib/ipc";

/** Modal dialog shown after stopping the tracker, for finalizing the session. */
export function TrackerDetailForm() {
  const showDetailForm = useTrackerStore((s) => s.showDetailForm);
  const stoppedActiveMins = useTrackerStore((s) => s.stoppedActiveMins);
  const stoppedEndTime = useTrackerStore((s) => s.stoppedEndTime);
  const startedAt = useTrackerStore((s) => s.startedAt);
  const pauses = useTrackerStore((s) => s.pauses);
  const sessionNotes = useTrackerStore((s) => s.sessionNotes);
  const notes = useTrackerStore((s) => s.notes);
  const linkedPlanId = useTrackerStore((s) => s.linkedPlanId);
  const linkedTaskId = useTrackerStore((s) => s.linkedTaskId);
  const categoryFromTracker = useTrackerStore((s) => s.category);
  const tagsFromTracker = useTrackerStore((s) => s.tags);
  const saveDetail = useTrackerStore((s) => s.saveDetail);
  const discard = useTrackerStore((s) => s.discard);
  const isLoading = useTrackerStore((s) => s.isLoading);

  // Form state
  const [summary, setSummary] = useState(notes);
  const [category, setCategory] = useState(categoryFromTracker || "");
  const [tagsStr, setTagsStr] = useState(tagsFromTracker.join(", "));
  const [taskId, setTaskId] = useState(linkedTaskId || "");
  const [planId, setPlanId] = useState(linkedPlanId || "");
  const [createTask, setCreateTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [createNote, setCreateNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Task/plan suggestions
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  useEffect(() => {
    setSummary(notes);
    setCategory(categoryFromTracker || "");
    setTagsStr(tagsFromTracker.join(", "));
    setTaskId(linkedTaskId || "");
    setPlanId(linkedPlanId || "");
  }, [notes, categoryFromTracker, tagsFromTracker, linkedTaskId, linkedPlanId]);

  // Load suggested tasks and plans
  useEffect(() => {
    if (!showDetailForm) return;
    ipc
      .listTasks(
        { workspace_id: "", include_done: false },
        { field: "updated_at", direction: "desc" },
      )
      .then((result) => setTasks(result.map((t) => t as unknown as Task)))
      .catch(() => {});
    ipc
      .listPlans({ workspace_id: "" })
      .then(setPlans)
      .catch(() => {});

    // Auto-suggestions
    if (activeWorkspaceId && stoppedEndTime) {
      ipc
        .suggestOnTrackerStop(
          activeWorkspaceId,
          tagsFromTracker,
          notes,
          stoppedEndTime,
        )
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }
  }, [showDetailForm, activeWorkspaceId, stoppedEndTime, tagsFromTracker, notes]);

  if (!showDetailForm) return null;

  const activeMins = stoppedActiveMins ?? 0;
  const totalPauseCount = pauses.length;
  const totalPauseMins = pauses.reduce((sum, p) => {
    if (!p.paused_at) return sum;
    const ps = new Date(p.paused_at).getTime();
    const pe = p.resumed_at ? new Date(p.resumed_at).getTime() : (stoppedEndTime ? new Date(stoppedEndTime).getTime() : Date.now());
    return sum + Math.max(0, pe - ps) / 60000;
  }, 0);

  const startStr = startedAt
    ? new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const endStr = stoppedEndTime
    ? new Date(stoppedEndTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const handleSave = async () => {
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    await saveDetail({
      notes: summary,
      category: category || undefined,
      tags: tags.length > 0 ? tags : undefined,
      linkedPlanId: planId || undefined,
      linkedTaskId: taskId || undefined,
      createTask: createTask && taskTitle.trim()
        ? { title: taskTitle.trim() }
        : undefined,
      createNote: createNote && noteTitle.trim()
        ? { title: noteTitle.trim() }
        : undefined,
    });
  };

  const handleDiscard = () => {
    if (activeMins >= 5) {
      setShowDiscardConfirm(true);
    } else {
      discard();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-2xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Session Complete
          </h2>
          <button
            onClick={handleDiscard}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Discard"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Duration summary */}
        <div className="mt-3 flex items-center gap-4 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Duration: </span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {formatMinutes(activeMins)}
            </span>
            <span className="text-gray-400"> active</span>
          </div>
          <div className="text-gray-300 dark:text-gray-600">|</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {startStr} — {endStr}
          </div>
          {totalPauseCount > 0 && (
            <>
              <div className="text-gray-300 dark:text-gray-600">|</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {totalPauseCount} pause{totalPauseCount > 1 ? "s" : ""} ({Math.round(totalPauseMins)}m)
              </div>
            </>
          )}
        </div>

        {/* Session timeline */}
        {sessionNotes.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Session Timeline
            </div>
            <div className="max-h-32 overflow-y-auto rounded-lg bg-gray-50 p-2 dark:bg-gray-800">
              <SessionTimeline sessionNotes={sessionNotes} />
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Summary
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            placeholder="What did you work on?"
          />
        </div>

        {/* Auto-suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Suggested Links
            </label>
            <div className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              {suggestions.map((s) => (
                <button
                  key={`${s.entity_type}-${s.entity_id}`}
                  onClick={() => {
                    if (s.entity_type === "task") setTaskId(s.entity_id);
                    else setPlanId(s.entity_id);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    (s.entity_type === "task" && taskId === s.entity_id) ||
                    (s.entity_type === "plan" && planId === s.entity_id)
                      ? "bg-blue-50 dark:bg-blue-900/20"
                      : ""
                  }`}
                >
                  <span className="flex-shrink-0 text-[10px] text-gray-400">
                    {s.entity_type === "task" ? "&#9744;" : "&#128197;"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-gray-700 dark:text-gray-300">
                      {s.title}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {s.reason}
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-[10px] text-gray-300 dark:text-gray-600">
                    {Math.round(s.score * 100)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Link to task/plan */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Link Task
            </label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="">None</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Link Plan
            </label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="">None</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Create actions */}
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={createTask}
              onChange={(e) => setCreateTask(e.target.checked)}
              className="rounded border-gray-300"
            />
            Create task from this session
          </label>
          {createTask && (
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
            />
          )}

          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={createNote}
              onChange={(e) => setCreateNote(e.target.checked)}
              className="rounded border-gray-300"
            />
            Create note from this session
          </label>
          {createNote && (
            <input
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Note title"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
            />
          )}
        </div>

        {/* Category & Tags */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Category
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. development"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Tags
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="comma, separated"
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={handleDiscard}
            disabled={isLoading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Saving..." : "Save Entry"}
          </button>
        </div>

        {/* Discard confirmation overlay */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/95 dark:bg-gray-900/95">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Discard {formatMinutes(activeMins)} of tracked time?
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This cannot be undone.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={() => setShowDiscardConfirm(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={() => discard()}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
