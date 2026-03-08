import { useState, useEffect, useCallback } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { useRecurrenceStore } from "../../stores/recurrenceStore";
import { SubtaskTree } from "./SubtaskTree";
import { RecurrenceEditor } from "./RecurrenceEditor";
import { BacklinksPanel } from "../../components/shared/BacklinksPanel";
import { EntityReminders } from "../../components/shared/EntityReminders";
import { ReferencesSection } from "./ReferencesSection";
import type { TaskStatus, TaskPriority, RecurrenceRule, CreateRecurrenceRuleInput, UpdateRecurrenceRuleInput } from "../../lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "../../lib/types";
import { timeAgo } from "../../lib/utils";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useTrackerStore } from "../../stores/trackerStore";
import { MoveToWorkspaceMenu } from "../../components/shared/MoveToWorkspaceMenu";

/** Slide-over panel showing full task details with inline editing. */
export function TaskDetail() {
  const isDetailOpen = useTaskStore((s) => s.isDetailOpen);
  const selectedTask = useTaskStore((s) => s.selectedTask);
  const closeDetail = useTaskStore((s) => s.closeDetail);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { loadRuleForEntity, createRule, updateRule, deleteRule, skipNext, detachOccurrence } = useRecurrenceStore();

  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);
  const [localCategory, setLocalCategory] = useState("");
  const [localColor, setLocalColor] = useState("");
  const [localEstimatedMins, setLocalEstimatedMins] = useState("");
  const [localActualMins, setLocalActualMins] = useState("0");

  useEffect(() => {
    if (selectedTask) {
      setTitle(selectedTask.title);
      setDescription(selectedTask.description ?? "");
      setEditingTitle(false);
      setEditingDescription(false);
      setLocalCategory(selectedTask.category ?? "");
      setLocalColor(selectedTask.color ?? "");
      setLocalEstimatedMins(selectedTask.estimated_mins != null ? String(selectedTask.estimated_mins) : "");
      setLocalActualMins(String(selectedTask.actual_mins));
      // Load recurrence rule if task has one
      loadRuleForEntity("task", selectedTask.id).then(setRecurrenceRule).catch(() => setRecurrenceRule(null));
    }
  }, [selectedTask?.id, loadRuleForEntity]);

  const handleUpdate = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!selectedTask) return;
      await updateTask(selectedTask.id, updates);
    },
    [selectedTask, updateTask],
  );

  const handleTitleSave = async () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== selectedTask?.title) {
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isDetailOpen) {
        closeDetail();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDetailOpen, closeDetail]);

  if (!isDetailOpen || !selectedTask) return null;

  const isDone = selectedTask.status === "done" || selectedTask.status === "cancelled";

  return (
    <div className="flex h-full w-80 flex-shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          Task Detail
        </span>
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
        <div className="space-y-4 p-3">
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
          </div>

          {/* Status + Priority */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Status
              </label>
              <select
                value={selectedTask.status}
                onChange={(e) => handleUpdate({ status: e.target.value })}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {(Object.entries(STATUS_CONFIG) as [TaskStatus, (typeof STATUS_CONFIG)[TaskStatus]][]).map(
                  ([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ),
                )}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Priority
              </label>
              <select
                value={selectedTask.priority}
                onChange={(e) => handleUpdate({ priority: e.target.value })}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, (typeof PRIORITY_CONFIG)[TaskPriority]][]).map(
                  ([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ),
                )}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
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
                className="w-full min-h-[40px] rounded border border-transparent px-2 py-1 text-left text-xs text-gray-600 hover:border-gray-200 dark:text-gray-400 dark:hover:border-gray-700"
              >
                {selectedTask.description || "Add description..."}
              </button>
            )}
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
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
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
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
            </div>
          </div>

          {/* Category + Color */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Category
              </label>
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
                placeholder="Category..."
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Color
              </label>
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
                placeholder="Color..."
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Tags
            </label>
            <TagEditor
              tags={selectedTask.tags ?? []}
              onChange={(tags) => handleUpdate({ tags })}
            />
          </div>

          {/* Time tracking */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
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
                    handleUpdate({ estimated_mins: val });
                  }
                }}
                min={0}
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Actual (min)
              </label>
              <input
                type="number"
                value={localActualMins}
                onChange={(e) => setLocalActualMins(e.target.value)}
                onBlur={() => {
                  const val = Number(localActualMins) || 0;
                  if (val !== selectedTask.actual_mins) {
                    handleUpdate({ actual_mins: val });
                  }
                }}
                min={0}
                className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              />
            </div>
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

          {/* Start Tracking */}
          {(() => {
            const trackerStatus = useTrackerStore.getState().status;
            const trackerLinkedTaskId = useTrackerStore.getState().linkedTaskId;
            const trackerStart = useTrackerStore.getState().start;
            const isTrackingThis = trackerStatus !== "idle" && trackerLinkedTaskId === selectedTask.id;
            return (
              <button
                onClick={() => trackerStart({ linkedTaskId: selectedTask.id, category: selectedTask.category || undefined })}
                disabled={trackerStatus !== "idle"}
                className={`w-full rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  isTrackingThis
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {isTrackingThis ? "Tracking..." : "Start Tracking"}
              </button>
            );
          })()}

          {/* Reminders */}
          <EntityReminders
            entityType="task"
            entityId={selectedTask.id}
            referenceTime={selectedTask.due_date ?? null}
            workspaceId={activeWorkspaceId || ""}
          />

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-800" />

          {/* Recurrence */}
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Recurrence
            </label>
            <RecurrenceEditor
              rule={recurrenceRule}
              entityType="task"
              workspaceId={activeWorkspaceId || ""}
              entityId={selectedTask.id}
              onChange={async (input) => {
                if (!input) {
                  // Remove recurrence
                  if (recurrenceRule) {
                    await deleteRule(recurrenceRule.id);
                    setRecurrenceRule(null);
                  }
                } else if (recurrenceRule) {
                  // Update existing rule
                  const updated = await updateRule(recurrenceRule.id, input as UpdateRecurrenceRuleInput);
                  setRecurrenceRule(updated);
                } else {
                  // Create new rule
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
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-800" />

          {/* Subtasks */}
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Subtasks
            </label>
            <SubtaskTree parentTaskId={selectedTask.id} />
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-800" />

          {/* Outgoing References */}
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              References
            </label>
            <ReferencesSection entityType="task" entityId={selectedTask.id} />
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-800" />

          {/* Backlinks */}
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Referenced By
            </label>
            <BacklinksPanel targetType="task" targetId={selectedTask.id} />
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-800" />

          {/* Metadata */}
          <div className="space-y-1 text-[10px] text-gray-400">
            <div>Created: {new Date(selectedTask.created_at).toLocaleString()}</div>
            <div>Updated: {timeAgo(selectedTask.updated_at)}</div>
            {selectedTask.completed_at && (
              <div>Completed: {new Date(selectedTask.completed_at).toLocaleString()}</div>
            )}
          </div>

          {/* Delete */}
          <button
            onClick={() => deleteTask(selectedTask.id)}
            className="w-full rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
          >
            Delete Task
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline tag editor component for the task detail panel. */
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const tag = inputValue.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInputValue("");
  };

  const handleRemove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
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
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        onBlur={handleAdd}
        placeholder="+ Add"
        className="w-16 border-none bg-transparent px-1 py-0.5 text-[10px] text-gray-500 outline-none placeholder:text-gray-400"
      />
    </div>
  );
}
