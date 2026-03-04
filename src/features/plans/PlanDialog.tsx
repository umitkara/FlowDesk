import { useState, useEffect, useCallback, useRef } from "react";
import { usePlanStore } from "../../stores/planStore";
import { PLAN_TYPE_CONFIG, IMPORTANCE_CONFIG } from "../../lib/types";
import type { PlanType, Importance } from "../../lib/types";
import * as ipc from "../../lib/ipc";

/** Color swatches for the color picker. */
const COLOR_SWATCHES = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

/** Formats a datetime-local input value from an ISO string. */
function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // Format as YYYY-MM-DDTHH:mm
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${mins}`;
  } catch {
    return "";
  }
}

/** Formats a date-only input value from an ISO string. */
function toDateOnly(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Modal dialog for creating or editing a plan. */
export default function PlanDialog() {
  const {
    isDialogOpen,
    dialogDefaults,
    editingPlan,
    closeDialog,
    createPlan,
    updatePlan,
  } = usePlanStore();

  const [title, setTitle] = useState("");
  const [planType, setPlanType] = useState<string>("time_block");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState("");
  const [importance, setImportance] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);

  // Get workspace ID
  useEffect(() => {
    ipc.listWorkspaces().then((ws) => {
      if (ws.length > 0) setWorkspaceId(ws[0].id);
    });
  }, []);

  // Initialize form from defaults or editing plan
  useEffect(() => {
    if (!isDialogOpen) return;

    if (editingPlan) {
      setTitle(editingPlan.title);
      setPlanType(editingPlan.type);
      setStartTime(editingPlan.all_day ? toDateOnly(editingPlan.start_time) : toDatetimeLocal(editingPlan.start_time));
      setEndTime(editingPlan.all_day ? toDateOnly(editingPlan.end_time) : toDatetimeLocal(editingPlan.end_time));
      setAllDay(editingPlan.all_day);
      setDescription(editingPlan.description || "");
      setCategory(editingPlan.category || "");
      setColor(editingPlan.color || "");
      setImportance(editingPlan.importance || "");
      setTags(
        editingPlan.tags && Array.isArray(editingPlan.tags)
          ? editingPlan.tags.join(", ")
          : ""
      );
    } else {
      setTitle("");
      setPlanType(dialogDefaults?.type || "time_block");
      const start = dialogDefaults?.start_time || "";
      const end = dialogDefaults?.end_time || "";
      const isAllDay = dialogDefaults?.all_day ?? false;
      setAllDay(isAllDay);
      setStartTime(isAllDay ? toDateOnly(start) : toDatetimeLocal(start));
      setEndTime(isAllDay ? toDateOnly(end) : toDatetimeLocal(end));
      setDescription("");
      setCategory("");
      setColor("");
      setImportance("");
      setTags("");
    }

    setError(null);
    setSubmitting(false);

    // Focus title after render
    requestAnimationFrame(() => {
      titleRef.current?.focus();
    });
  }, [isDialogOpen, editingPlan, dialogDefaults]);

  // When type changes to milestone, sync end = start
  useEffect(() => {
    if (planType === "milestone" && startTime) {
      setEndTime(startTime);
    }
  }, [planType, startTime]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    // Build ISO times
    let startIso: string;
    let endIso: string;

    if (allDay) {
      startIso = `${startTime}T00:00:00`;
      endIso = `${endTime || startTime}T23:59:59`;
    } else {
      startIso = startTime ? new Date(startTime).toISOString() : "";
      endIso = endTime ? new Date(endTime).toISOString() : "";
    }

    if (!startIso) {
      setError("Start time is required");
      return;
    }
    if (!endIso) {
      endIso = startIso;
    }

    if (new Date(endIso) < new Date(startIso) && planType !== "milestone") {
      setError("End time must be after start time");
      return;
    }

    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    setError(null);

    try {
      if (editingPlan) {
        await updatePlan({
          id: editingPlan.id,
          title: title.trim(),
          description: description || undefined,
          start_time: startIso,
          end_time: endIso,
          all_day: allDay,
          type: planType as PlanType,
          category: category || undefined,
          color: color || undefined,
          importance: (importance || undefined) as Importance | undefined,
          tags: parsedTags.length > 0 ? parsedTags : undefined,
        });
      } else {
        await createPlan({
          workspace_id: dialogDefaults?.workspace_id || workspaceId,
          title: title.trim(),
          description: description || undefined,
          start_time: startIso,
          end_time: endIso,
          all_day: allDay,
          type: planType as PlanType,
          category: category || undefined,
          color: color || undefined,
          importance: (importance || undefined) as Importance | undefined,
          tags: parsedTags.length > 0 ? parsedTags : undefined,
        });
      }
      closeDialog();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }, [
    title, planType, startTime, endTime, allDay, description,
    category, color, importance, tags, editingPlan,
    workspaceId, dialogDefaults, createPlan, updatePlan, closeDialog,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
    },
    [closeDialog, handleSubmit]
  );

  if (!isDialogOpen) return null;

  const isMilestone = planType === "milestone";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {editingPlan ? "Edit Plan" : "Create Plan"}
          </h2>
          <button
            onClick={closeDialog}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Title *
            </label>
            <input
              ref={titleRef}
              className="w-full rounded border border-zinc-300 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Plan title..."
            />
          </div>

          {/* Type + Importance row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Type
              </label>
              <select
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                value={planType}
                onChange={(e) => setPlanType(e.target.value)}
              >
                {Object.entries(PLAN_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Importance
              </label>
              <select
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                value={importance}
                onChange={(e) => setImportance(e.target.value)}
              >
                <option value="">None</option>
                {Object.entries(IMPORTANCE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* All Day toggle */}
          <div className="flex items-center gap-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                  if (e.target.checked && startTime) {
                    setStartTime(startTime.slice(0, 10));
                    setEndTime((endTime || startTime).slice(0, 10));
                  }
                }}
                className="peer sr-only"
              />
              <div className="h-4 w-7 rounded-full bg-zinc-300 after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all peer-checked:bg-blue-500 peer-checked:after:translate-x-full dark:bg-zinc-600" />
            </label>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">All day</span>
          </div>

          {/* Date / Time pickers */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Start *
              </label>
              <input
                type={allDay ? "date" : "datetime-local"}
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            {!isMilestone && (
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  End
                </label>
                <input
                  type={allDay ? "date" : "datetime-local"}
                  className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Description
            </label>
            <textarea
              className="w-full rounded border border-zinc-300 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description (markdown supported)..."
            />
          </div>

          {/* Category + Tags row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Category
              </label>
              <input
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Work, Personal"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Tags
              </label>
              <input
                className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, ..."
              />
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Color
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setColor("")}
                className={`h-6 w-6 rounded-full border-2 ${
                  !color ? "border-blue-500" : "border-zinc-300 dark:border-zinc-700"
                } bg-zinc-200 dark:bg-zinc-700`}
                title="Default"
              />
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${
                    color === c ? "border-blue-500" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            onClick={closeDialog}
            className="rounded px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? "Saving..." : editingPlan ? "Update" : "Create"}
          </button>
          <span className="text-[10px] text-zinc-400">Ctrl+Enter</span>
        </div>
      </div>
    </div>
  );
}
