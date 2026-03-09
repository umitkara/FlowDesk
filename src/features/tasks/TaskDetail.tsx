import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { useRecurrenceStore } from "../../stores/recurrenceStore";
import { SubtaskTree } from "./SubtaskTree";
import { RecurrenceEditor } from "./RecurrenceEditor";
import { BacklinksPanel } from "../../components/shared/BacklinksPanel";
import { EntityReminders } from "../../components/shared/EntityReminders";
import { ReferencesSection } from "./ReferencesSection";
import { CollapsibleSection } from "../../components/shared/CollapsibleSection";
import { StatusBadge } from "./StatusBadge";
import { PriorityBadge } from "./PriorityBadge";
import { TimeProgress } from "./TimeProgress";
import { TaskTimeLog } from "./TaskTimeLog";
import { ActionZone } from "./ActionZone";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import type { TaskStatus, RecurrenceRule, CreateRecurrenceRuleInput, UpdateRecurrenceRuleInput } from "../../lib/types";
import { timeAgo } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTrackerStore } from "../../stores/trackerStore";
import { MoveToWorkspaceMenu } from "../../components/shared/MoveToWorkspaceMenu";
import * as ipc from "../../lib/ipc";

/** Compute a relative date label (overdue, today, tomorrow, in N days). */
function relativeDateLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `in ${diff}d`;
}

/** Slide-over panel showing full task details with inline editing. */
export function TaskDetail() {
  const isDetailOpen = useTaskStore((s) => s.isDetailOpen);
  const selectedTask = useTaskStore((s) => s.selectedTask);
  const closeDetail = useTaskStore((s) => s.closeDetail);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const tasks = useTaskStore((s) => s.tasks);

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceConfig = useWorkspaceStore((s) => s.activeWorkspace?.config);
  const taskCategories: string[] = workspaceConfig?.task_categories ?? [];
  const { loadRuleForEntity, createRule, updateRule, deleteRule, skipNext, detachOccurrence } = useRecurrenceStore();

  const trackerStatus = useTrackerStore((s) => s.status);
  const trackerLinkedTaskId = useTrackerStore((s) => s.linkedTaskId);
  const elapsedSeconds = useTrackerStore((s) => s.elapsedSeconds);
  const showDetailForm = useTrackerStore((s) => s.showDetailForm);
  const prevShowDetailForm = useRef(showDetailForm);

  const { can_undo, undo } = useUndoRedo();

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);
  const [localCategory, setLocalCategory] = useState("");
  const [customCategory, setCustomCategory] = useState(false);
  const [localColor, setLocalColor] = useState("");
  const [localEstimatedMins, setLocalEstimatedMins] = useState("");
  const [localActualMins, setLocalActualMins] = useState("0");
  const [editingActual, setEditingActual] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedTask) {
      setTitle(selectedTask.title);
      setDescription(selectedTask.description ?? "");
      setEditingTitle(false);
      setEditingDescription(false);
      const cat = selectedTask.category ?? "";
      setLocalCategory(cat);
      setCustomCategory(cat !== "" && !taskCategories.includes(cat));
      setLocalColor(selectedTask.color ?? "");
      setLocalEstimatedMins(selectedTask.estimated_mins != null ? String(selectedTask.estimated_mins) : "");
      setLocalActualMins(String(selectedTask.actual_mins));
      setEditingActual(false);
      setSaveStatus("idle");
      setErrors({});
      loadRuleForEntity("task", selectedTask.id).then(setRecurrenceRule).catch(() => setRecurrenceRule(null));
    }
  }, [selectedTask?.id, loadRuleForEntity, taskCategories]);

  // Refresh task data after tracker detail form closes (so actual_mins updates)
  useEffect(() => {
    if (prevShowDetailForm.current && !showDetailForm && selectedTask) {
      ipc.getTask(selectedTask.id).then((task) => {
        useTaskStore.setState({ selectedTask: task });
      }).catch(() => {});
    }
    prevShowDetailForm.current = showDetailForm;
  }, [showDetailForm, selectedTask?.id]);

  const handleUpdate = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!selectedTask) return;
      try {
        await updateTask(selectedTask.id, updates);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    },
    [selectedTask, updateTask],
  );

  const handleTitleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setErrors((e) => ({ ...e, title: "Title is required" }));
      return;
    }
    setErrors((e) => { const { title: _, ...rest } = e; return rest; });
    if (trimmed !== selectedTask?.title) {
      await handleUpdate({ title: trimmed });
    }
    setEditingTitle(false);
  };

  const handleDescriptionSave = async () => {
    const val = description.trim();
    if (val !== (selectedTask?.description ?? "")) {
      await handleUpdate({ description: val || null });
    }
    setEditingDescription(false);
  };

  const handleUndo = useCallback(async () => {
    const result = await undo();
    if (result && selectedTask) {
      try {
        const task = await ipc.getTask(selectedTask.id);
        useTaskStore.setState({ selectedTask: task });
      } catch { /* ignore */ }
    }
  }, [undo, selectedTask]);

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isDetailOpen || !selectedTask) return;
      // Skip shortcuts when focus is in input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }
      if (e.key === "Escape") {
        closeDetail();
        return;
      }
      const isDone = selectedTask.status === "done" || selectedTask.status === "cancelled";
      // Ctrl+Shift+Enter: Start Work
      if (e.ctrlKey && e.shiftKey && e.key === "Enter" && !isDone && trackerStatus === "idle") {
        e.preventDefault();
        if (selectedTask.status === "inbox" || selectedTask.status === "todo") {
          updateTask(selectedTask.id, { status: "in_progress" as TaskStatus });
        }
        useTrackerStore.getState().start({ linkedTaskId: selectedTask.id, category: selectedTask.category || undefined });
        return;
      }
      // Ctrl+Enter: Toggle done/undone
      if (e.ctrlKey && !e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        handleUpdate({ status: isDone ? "todo" : "done" });
        return;
      }
      // Ctrl+Shift+D: Defer to tomorrow
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        const d = new Date();
        d.setDate(d.getDate() + 1);
        handleUpdate({ scheduled_date: d.toISOString().split("T")[0] });
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDetailOpen, selectedTask, closeDetail, handleUpdate, trackerStatus, updateTask]);

  if (!isDetailOpen || !selectedTask) return null;

  const isDone = selectedTask.status === "done" || selectedTask.status === "cancelled";
  const isTrackingThis = trackerStatus !== "idle" && trackerLinkedTaskId === selectedTask.id;
  const liveElapsed = isTrackingThis ? elapsedSeconds : undefined;
  const dueLabel = relativeDateLabel(selectedTask.due_date);
  const scheduledLabel = relativeDateLabel(selectedTask.scheduled_date);

  return (
    <div className="flex h-full w-80 flex-shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
            Task Detail
          </span>
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
              Saved
              {can_undo && (
                <button
                  onClick={handleUndo}
                  className="underline hover:text-green-700 dark:hover:text-green-300"
                >
                  Undo
                </button>
              )}
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-[10px] text-red-500">Save failed</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <MoveToWorkspaceMenu
            entityId={selectedTask.id}
            entityType="task"
            onMoved={() => {
              closeDetail();
              fetchTasks();
            }}
          />
          <button
            onClick={closeDetail}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
            title="Close (Esc)"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3 p-3">
          {/* Title */}
          <div>
            {editingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitle(selectedTask.title);
                    setEditingTitle(false);
                  }
                }}
                autoFocus
                className="w-full rounded border border-gray-200 px-2 py-1 text-sm font-semibold dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              />
            ) : (
              <button
                onClick={() => setEditingTitle(true)}
                className={`w-full text-left text-sm font-semibold ${
                  isDone
                    ? "text-gray-400 line-through dark:text-gray-500"
                    : "text-gray-800 dark:text-gray-200"
                }`}
              >
                {selectedTask.is_sticky && (
                  <span className="mr-1 text-amber-500" title="Sticky task">
                    &#128204;
                  </span>
                )}
                {selectedTask.title}
              </button>
            )}
            {errors.title && (
              <div className="mt-0.5 text-[10px] text-red-500">{errors.title}</div>
            )}
          </div>

          {/* Status + Priority badges */}
          <div className="flex items-center gap-2">
            <StatusBadge
              status={selectedTask.status}
              onChange={(s) => handleUpdate({ status: s })}
            />
            <PriorityBadge
              priority={selectedTask.priority}
              onChange={(p) => handleUpdate({ priority: p })}
            />
          </div>

          {/* Action Zone */}
          <ActionZone task={selectedTask} />

          {/* Context: Dates + TimeProgress */}
          <div className="space-y-2">
            {/* Dates */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Due Date
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={selectedTask.due_date ?? ""}
                    onChange={(e) =>
                      handleUpdate({ due_date: e.target.value || null })
                    }
                    className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  />
                  {selectedTask.due_date && (
                    <button
                      onClick={() => handleUpdate({ due_date: null })}
                      className="text-xs text-gray-400 hover:text-gray-600"
                      title="Clear"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {dueLabel && (
                  <span className={`text-[10px] ${dueLabel.includes("overdue") ? "text-red-500" : dueLabel === "Today" ? "text-amber-500" : "text-gray-400"}`}>
                    {dueLabel}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Scheduled
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={selectedTask.scheduled_date ?? ""}
                    onChange={(e) =>
                      handleUpdate({ scheduled_date: e.target.value || null })
                    }
                    className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  />
                  {selectedTask.scheduled_date && (
                    <button
                      onClick={() => handleUpdate({ scheduled_date: null })}
                      className="text-xs text-gray-400 hover:text-gray-600"
                      title="Clear"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {scheduledLabel && (
                  <span className="text-[10px] text-gray-400">{scheduledLabel}</span>
                )}
              </div>
            </div>

            {/* Time Progress */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <TimeProgress
                  estimatedMins={selectedTask.estimated_mins}
                  actualMins={selectedTask.actual_mins}
                  liveElapsed={liveElapsed}
                />
              </div>
              {!editingActual && selectedTask.actual_mins > 0 && (
                <button
                  onClick={() => setEditingActual(true)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Edit
                </button>
              )}
            </div>
            {editingActual && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-gray-400">Actual (min):</label>
                <input
                  type="number"
                  value={localActualMins}
                  onChange={(e) => setLocalActualMins(e.target.value)}
                  onBlur={() => {
                    const val = Number(localActualMins) || 0;
                    if (val !== selectedTask.actual_mins) {
                      handleUpdate({ actual_mins: val });
                    }
                    setEditingActual(false);
                  }}
                  min={0}
                  autoFocus
                  className="w-20 rounded border border-gray-200 px-2 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Description
            </label>
            {editingDescription ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={handleDescriptionSave}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDescription(selectedTask.description ?? "");
                    setEditingDescription(false);
                  }
                }}
                autoFocus
                rows={4}
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            ) : (
              <button
                onClick={() => setEditingDescription(true)}
                className="w-full min-h-[32px] rounded border border-transparent px-2 py-1 text-left text-xs text-gray-600 hover:border-gray-200 dark:text-gray-400 dark:hover:border-gray-700"
              >
                {selectedTask.description || "Add description..."}
              </button>
            )}
          </div>

          {/* Collapsible: Time Log */}
          <CollapsibleSection title="Time Log">
            <TaskTimeLog taskId={selectedTask.id} />
          </CollapsibleSection>

          {/* Collapsible: Subtasks */}
          <CollapsibleSection title="Subtasks" defaultOpen>
            <SubtaskTree parentTaskId={selectedTask.id} />
          </CollapsibleSection>

          {/* Collapsible: Details (category, tags, color, sticky, estimate, reminders) */}
          <CollapsibleSection title="Details">
            <div className="space-y-3">
              {/* Category */}
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Category
                </label>
                {customCategory ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={localCategory}
                      onChange={(e) => setLocalCategory(e.target.value)}
                      onBlur={() => {
                        const val = localCategory || null;
                        if (val !== (selectedTask.category ?? null)) {
                          handleUpdate({ category: val });
                        }
                      }}
                      placeholder="Custom category..."
                      autoFocus
                      className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    />
                    <button
                      onClick={() => setCustomCategory(false)}
                      className="text-[10px] text-gray-400 hover:text-gray-600"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <select
                    value={localCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__custom__") {
                        setCustomCategory(true);
                        setLocalCategory("");
                        return;
                      }
                      setLocalCategory(val);
                      handleUpdate({ category: val || null });
                    }}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    <option value="">None</option>
                    {taskCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__custom__">Custom...</option>
                  </select>
                )}
              </div>

              {/* Tags */}
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Tags
                </label>
                <TagEditor
                  tags={selectedTask.tags ?? []}
                  onChange={(tags) => handleUpdate({ tags })}
                  allTasks={tasks}
                />
              </div>

              {/* Color */}
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={localColor || "#808080"}
                    onChange={(e) => {
                      setLocalColor(e.target.value);
                      handleUpdate({ color: e.target.value });
                    }}
                    className="h-6 w-8 cursor-pointer rounded border border-gray-200 p-0.5 dark:border-gray-700"
                  />
                  <input
                    type="text"
                    value={localColor}
                    onChange={(e) => setLocalColor(e.target.value)}
                    onBlur={() => {
                      const val = localColor || null;
                      if (val !== (selectedTask.color ?? null)) {
                        handleUpdate({ color: val });
                      }
                    }}
                    placeholder="e.g. #3b82f6"
                    className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  />
                  {localColor && (
                    <button
                      onClick={() => {
                        setLocalColor("");
                        handleUpdate({ color: null });
                      }}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* Estimate */}
              <div>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Estimate (min)
                </label>
                <input
                  type="number"
                  value={localEstimatedMins}
                  onChange={(e) => setLocalEstimatedMins(e.target.value)}
                  onBlur={() => {
                    const val = localEstimatedMins ? Number(localEstimatedMins) : null;
                    const prev = selectedTask.estimated_mins ?? null;
                    if (val !== prev) {
                      if (val != null && val < 0) {
                        setErrors((e) => ({ ...e, estimated_mins: "Must be >= 0" }));
                        return;
                      }
                      setErrors((e) => { const { estimated_mins: _, ...rest } = e; return rest; });
                      handleUpdate({ estimated_mins: val });
                    }
                  }}
                  min={0}
                  className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                />
                {errors.estimated_mins && (
                  <div className="mt-0.5 text-[10px] text-red-500">{errors.estimated_mins}</div>
                )}
              </div>

              {/* Sticky toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Sticky
                </label>
                <button
                  role="switch"
                  aria-checked={selectedTask.is_sticky}
                  onClick={() => handleUpdate({ is_sticky: !selectedTask.is_sticky })}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    selectedTask.is_sticky
                      ? "bg-primary-600"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      selectedTask.is_sticky ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Reminders */}
              <EntityReminders
                entityType="task"
                entityId={selectedTask.id}
                referenceTime={selectedTask.due_date ?? null}
                workspaceId={activeWorkspaceId || ""}
              />
            </div>
          </CollapsibleSection>

          {/* Collapsible: Recurrence */}
          <CollapsibleSection title="Recurrence" defaultOpen={!!recurrenceRule}>
            <RecurrenceEditor
              rule={recurrenceRule}
              entityType="task"
              workspaceId={activeWorkspaceId || ""}
              entityId={selectedTask.id}
              onChange={async (input) => {
                if (!input) {
                  if (recurrenceRule) {
                    await deleteRule(recurrenceRule.id);
                    setRecurrenceRule(null);
                  }
                } else if (recurrenceRule) {
                  const updated = await updateRule(recurrenceRule.id, input as UpdateRecurrenceRuleInput);
                  setRecurrenceRule(updated);
                } else {
                  const created = await createRule(input as CreateRecurrenceRuleInput);
                  setRecurrenceRule(created);
                }
              }}
            />
            {recurrenceRule && (
              <div className="mt-1.5 flex gap-1">
                <button
                  onClick={async () => {
                    const updated = await skipNext(recurrenceRule.id);
                    setRecurrenceRule(updated);
                  }}
                  className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Skip Next
                </button>
                <button
                  onClick={async () => {
                    await detachOccurrence("task", selectedTask.id);
                    setRecurrenceRule(null);
                  }}
                  className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Detach
                </button>
              </div>
            )}
          </CollapsibleSection>

          {/* Collapsible: Links (References + Backlinks) */}
          <CollapsibleSection title="Links">
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  References
                </label>
                <ReferencesSection entityType="task" entityId={selectedTask.id} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  Referenced By
                </label>
                <BacklinksPanel targetType="task" targetId={selectedTask.id} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Meta footer */}
          <div className="border-t border-gray-200 pt-2 dark:border-gray-800">
            <div className="space-y-1 text-[10px] text-gray-400">
              <div>Created: {new Date(selectedTask.created_at).toLocaleString()}</div>
              <div>Updated: {timeAgo(selectedTask.updated_at)}</div>
              {selectedTask.completed_at && (
                <div>Completed: {new Date(selectedTask.completed_at).toLocaleString()}</div>
              )}
            </div>
            <button
              onClick={() => deleteTask(selectedTask.id)}
              className="mt-2 w-full rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              Delete Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inline tag editor with autocomplete from existing tags. */
function TagEditor({
  tags,
  onChange,
  allTasks,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  allTasks: Array<{ tags: string[] | null }>;
}) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestRef = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTasks) {
      if (t.tags) t.tags.forEach((tag) => set.add(tag));
    }
    return Array.from(set).sort();
  }, [allTasks]);

  const filtered = useMemo(() => {
    if (inputValue.length < 1) return [];
    const lower = inputValue.toLowerCase();
    return allTags.filter((t) => t.toLowerCase().includes(lower) && !tags.includes(t)).slice(0, 8);
  }, [inputValue, allTags, tags]);

  const handleAdd = (val?: string) => {
    const tag = (val ?? inputValue).trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const handleRemove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  useEffect(() => {
    if (!showSuggestions) return;
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSuggestions]);

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          >
            {tag}
            <button
              onClick={() => handleRemove(tag)}
              className="text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(e.target.value.length >= 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          onBlur={() => {
            // Delay to allow suggestion click
            setTimeout(() => handleAdd(), 150);
          }}
          onFocus={() => {
            if (inputValue.length >= 1) setShowSuggestions(true);
          }}
          placeholder="+ Add"
          className="w-16 border-none bg-transparent px-1 py-0.5 text-[10px] text-gray-500 outline-none placeholder:text-gray-400"
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div
          ref={suggestRef}
          className="absolute left-0 top-full z-20 mt-1 max-h-32 min-w-[120px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {filtered.map((tag) => (
            <button
              key={tag}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdd(tag);
              }}
              className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
