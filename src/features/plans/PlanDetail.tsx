import { useState, useCallback, useEffect, useRef } from "react";
import { usePlanStore } from "../../stores/planStore";
import { useTaskStore } from "../../stores/taskStore";

import { useRecurrenceStore } from "../../stores/recurrenceStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { RecurrenceEditor } from "../tasks/RecurrenceEditor";
import { PLAN_TYPE_CONFIG, IMPORTANCE_CONFIG, STATUS_CONFIG } from "../../lib/types";
import type { PlanLinkedTask, PlanLinkedNote, TaskStatus, TaskWithChildren, RecurrenceRule, CreateRecurrenceRuleInput, UpdateRecurrenceRuleInput } from "../../lib/types";
import { BacklinksPanel } from "../../components/shared/BacklinksPanel";
import { EntityReminders } from "../../components/shared/EntityReminders";
import { useTrackerStore } from "../../stores/trackerStore";
import { MoveToWorkspaceMenu } from "../../components/shared/MoveToWorkspaceMenu";
import { openEntity } from "../../lib/openEntity";

/** Side panel showing plan details and linked entities. */
export default function PlanDetail() {
  const {
    selectedPlan,
    isDetailOpen,
    closeDetail,
    updatePlan,
    deletePlan,
    spawnTask,
    spawnNote,
    unlinkTask,
    linkTask,
    openDialog,
    fetchPlans,
  } = usePlanStore();
  const tasks = useTaskStore((s) => s.tasks);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const { loadRuleForEntity, createRule, updateRule, deleteRule, skipNext, detachOccurrence: detachOcc } = useRecurrenceStore();
  const trackerStatus = useTrackerStore((s) => s.status);
  const trackerLinkedPlanId = useTrackerStore((s) => s.linkedPlanId);
  const trackerStart = useTrackerStore((s) => s.start);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [showSpawnTask, setShowSpawnTask] = useState(false);
  const [spawnTaskTitle, setSpawnTaskTitle] = useState("");
  const [showSpawnNote, setShowSpawnNote] = useState(false);
  const [spawnNoteTitle, setSpawnNoteTitle] = useState("");
  const [showScheduleTask, setShowScheduleTask] = useState(false);
  const [scheduleQuery, setScheduleQuery] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedPlan) {
      loadRuleForEntity("plan", selectedPlan.plan.id).then(setRecurrenceRule).catch(() => setRecurrenceRule(null));
    }
  }, [selectedPlan?.plan.id, loadRuleForEntity]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const handleTitleSave = useCallback(() => {
    if (!selectedPlan || !titleValue.trim()) return;
    updatePlan({ id: selectedPlan.plan.id, title: titleValue.trim() });
    setEditingTitle(false);
  }, [selectedPlan, titleValue, updatePlan]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!selectedPlan) return;
    await deletePlan(selectedPlan.plan.id);
    setShowDeleteConfirm(false);
  }, [selectedPlan, deletePlan]);

  const handleSpawnTask = useCallback(async () => {
    if (!selectedPlan || !spawnTaskTitle.trim()) return;
    await spawnTask({
      plan_id: selectedPlan.plan.id,
      title: spawnTaskTitle.trim(),
    });
    setSpawnTaskTitle("");
    setShowSpawnTask(false);
  }, [selectedPlan, spawnTaskTitle, spawnTask]);

  const handleSpawnNote = useCallback(async () => {
    if (!selectedPlan) return;
    await spawnNote({
      plan_id: selectedPlan.plan.id,
      title: spawnNoteTitle.trim() || undefined,
    });
    setSpawnNoteTitle("");
    setShowSpawnNote(false);
  }, [selectedPlan, spawnNoteTitle, spawnNote]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    },
    [closeDetail]
  );

  if (!isDetailOpen || !selectedPlan) return null;

  const { plan, linked_tasks, linked_notes } = selectedPlan;
  const typeConfig = PLAN_TYPE_CONFIG[plan.type as keyof typeof PLAN_TYPE_CONFIG];
  const importanceConfig = plan.importance
    ? IMPORTANCE_CONFIG[plan.importance as keyof typeof IMPORTANCE_CONFIG]
    : null;

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="flex w-80 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        {editingTitle ? (
          <input
            ref={titleInputRef}
            className="flex-1 rounded border border-blue-500 bg-transparent px-1 py-0.5 text-sm font-semibold outline-none dark:text-white"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTitleSave();
              if (e.key === "Escape") setEditingTitle(false);
            }}
          />
        ) : (
          <h3
            className="flex-1 cursor-pointer truncate text-sm font-semibold dark:text-white"
            onClick={() => {
              setTitleValue(plan.title);
              setEditingTitle(true);
            }}
            title="Click to edit"
          >
            {plan.title}
          </h3>
        )}
        <div className="ml-2 flex items-center gap-1">
          <MoveToWorkspaceMenu
            entityId={plan.id}
            entityType="plan"
            onMoved={() => {
              closeDetail();
              if (activeWorkspaceId) fetchPlans({ workspace_id: activeWorkspaceId });
            }}
          />
          <button
            onClick={() => openDialog(undefined, plan)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Edit"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={closeDetail}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* Type + Importance */}
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: typeConfig?.color || "#6b7280" }}
          >
            {typeConfig?.label || plan.type}
          </span>
          {importanceConfig && (
            <span className={`text-[10px] font-medium ${importanceConfig.color}`}>
              {importanceConfig.label}
            </span>
          )}
          {plan.color && (
            <span
              className="inline-block h-3 w-3 rounded-full border border-zinc-300 dark:border-zinc-600"
              style={{ backgroundColor: plan.color }}
            />
          )}
        </div>

        {/* Times */}
        <div className="space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Schedule
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            {plan.all_day ? (
              <span>All day · {new Date(plan.start_time).toLocaleDateString()}</span>
            ) : (
              <>
                <div>{formatTime(plan.start_time)}</div>
                <div className="text-zinc-400">→ {formatTime(plan.end_time)}</div>
              </>
            )}
          </div>
        </div>

        {/* Category + Tags */}
        {plan.category && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Category
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-300">{plan.category}</div>
          </div>
        )}
        {plan.tags && Array.isArray(plan.tags) && plan.tags.length > 0 && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Tags
            </div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {plan.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {plan.description && (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Description
            </div>
            <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap">
              {plan.description}
            </div>
          </div>
        )}

        {/* Reminders */}
        <EntityReminders
          entityType="plan"
          entityId={plan.id}
          referenceTime={plan.start_time}
          workspaceId={activeWorkspaceId || ""}
          remindersMuted={plan.reminders_muted}
          onMuteChange={(muted) => {
            updatePlan({ id: plan.id, reminders_muted: muted });
          }}
        />

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        {/* Actions */}
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Actions
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(() => {
              const isTrackingThis = trackerStatus !== "idle" && trackerLinkedPlanId === selectedPlan.plan.id;
              return (
                <button
                  onClick={() => trackerStart({ linkedPlanId: selectedPlan.plan.id })}
                  disabled={trackerStatus !== "idle"}
                  className={`rounded border px-2 py-1 text-[10px] font-medium ${
                    isTrackingThis
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {isTrackingThis ? "Tracking..." : "Start Tracking"}
                </button>
              );
            })()}
            <button
              onClick={() => setShowSpawnTask(true)}
              className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Create Task
            </button>
            <button
              onClick={() => setShowSpawnNote(true)}
              className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Create Note
            </button>
            <button
              onClick={() => setShowScheduleTask(!showScheduleTask)}
              className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Schedule Task
            </button>
          </div>
          {showSpawnTask && (
            <div className="mt-2 flex gap-1">
              <input
                className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                placeholder="Task title..."
                value={spawnTaskTitle}
                onChange={(e) => setSpawnTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSpawnTask();
                  if (e.key === "Escape") setShowSpawnTask(false);
                }}
                autoFocus
              />
              <button
                onClick={handleSpawnTask}
                className="rounded bg-blue-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-blue-600"
              >
                Add
              </button>
            </div>
          )}
          {showSpawnNote && (
            <div className="mt-2 flex gap-1">
              <input
                className="flex-1 rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                placeholder="Note title (optional)..."
                value={spawnNoteTitle}
                onChange={(e) => setSpawnNoteTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSpawnNote();
                  if (e.key === "Escape") setShowSpawnNote(false);
                }}
                autoFocus
              />
              <button
                onClick={handleSpawnNote}
                className="rounded bg-blue-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-blue-600"
              >
                Add
              </button>
            </div>
          )}
          {showScheduleTask && (
            <div className="mt-2">
              <input
                className="mb-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                placeholder="Search tasks..."
                value={scheduleQuery}
                onChange={(e) => setScheduleQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowScheduleTask(false);
                    setScheduleQuery("");
                  }
                }}
                autoFocus
              />
              <div className="max-h-32 overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700">
                {tasks
                  .filter((t: TaskWithChildren) => {
                    // Exclude already-linked tasks
                    const linkedIds = new Set(linked_tasks.map((lt) => lt.task_id));
                    if (linkedIds.has(t.id)) return false;
                    // Filter by search query
                    if (scheduleQuery && !t.title.toLowerCase().includes(scheduleQuery.toLowerCase())) return false;
                    return true;
                  })
                  .slice(0, 10)
                  .map((t: TaskWithChildren) => (
                    <button
                      key={t.id}
                      onClick={async () => {
                        await linkTask(plan.id, t.id, "scheduled_in");
                        setShowScheduleTask(false);
                        setScheduleQuery("");
                      }}
                      className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    >
                      <span className={`text-[10px] ${STATUS_CONFIG[t.status as TaskStatus]?.color || "text-zinc-400"}`}>
                        {t.status === "done" ? "☑" : "☐"}
                      </span>
                      <span className="truncate text-zinc-700 dark:text-zinc-300">{t.title}</span>
                    </button>
                  ))}
                {tasks.filter((t: TaskWithChildren) => {
                  const linkedIds = new Set(linked_tasks.map((lt) => lt.task_id));
                  if (linkedIds.has(t.id)) return false;
                  if (scheduleQuery && !t.title.toLowerCase().includes(scheduleQuery.toLowerCase())) return false;
                  return true;
                }).length === 0 && (
                  <div className="px-2 py-1 text-[10px] text-zinc-400">No matching tasks</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        {/* Linked Tasks */}
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Linked Tasks ({linked_tasks.length})
          </div>
          {linked_tasks.length === 0 ? (
            <div className="mt-1 text-[10px] text-zinc-400">No linked tasks</div>
          ) : (
            <div className="mt-1 space-y-1">
              {linked_tasks.map((lt: PlanLinkedTask) => {
                const statusCfg = STATUS_CONFIG[lt.status as TaskStatus];
                return (
                  <div
                    key={lt.task_id}
                    className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] ${statusCfg?.color || "text-zinc-400"}`}>
                        {lt.status === "done" ? "☑" : "☐"}
                      </span>
                      <button
                        className="truncate text-xs text-zinc-700 hover:text-blue-500 dark:text-zinc-300"
                        onClick={() => openEntity({ type: "task", id: lt.task_id })}
                      >
                        {lt.title}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-zinc-400">{lt.relation}</span>
                      <button
                        onClick={() => unlinkTask(plan.id, lt.task_id)}
                        className="text-[10px] text-zinc-400 hover:text-red-500"
                        title="Unlink"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Linked Notes */}
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Linked Notes ({linked_notes.length})
          </div>
          {linked_notes.length === 0 ? (
            <div className="mt-1 text-[10px] text-zinc-400">No linked notes</div>
          ) : (
            <div className="mt-1 space-y-1">
              {linked_notes.map((ln: PlanLinkedNote) => (
                <div
                  key={ln.note_id}
                  className="flex items-center justify-between rounded px-1.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <button
                    className="flex items-center gap-1.5 min-w-0 truncate text-xs text-zinc-700 hover:text-blue-500 dark:text-zinc-300"
                    onClick={() => openEntity({ type: "note", id: ln.note_id })}
                  >
                    <span className="text-[10px]">📝</span>
                    {ln.title || "Untitled"}
                  </button>
                  <span className="text-[9px] text-zinc-400">{ln.relation}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        {/* Recurrence */}
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Recurrence
          </div>
          <div className="mt-1">
            <RecurrenceEditor
              rule={recurrenceRule}
              entityType="plan"
              workspaceId={activeWorkspaceId || ""}
              entityId={plan.id}
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
                  className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Skip Next
                </button>
                <button
                  onClick={async () => {
                    await detachOcc("plan", plan.id);
                    setRecurrenceRule(null);
                  }}
                  className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Detach
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        {/* Backlinks */}
        <BacklinksPanel targetType="plan" targetId={plan.id} />

        <div className="border-t border-zinc-200 dark:border-zinc-800" />

        {/* Metadata */}
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Metadata
          </div>
          <div className="mt-1 space-y-0.5 text-[10px] text-zinc-400">
            <div>Created: {new Date(plan.created_at).toLocaleString()}</div>
            <div>Updated: {new Date(plan.updated_at).toLocaleString()}</div>
            <div className="truncate" title={plan.id}>ID: {plan.id}</div>
          </div>
        </div>

        {/* Delete */}
        {showDeleteConfirm ? (
          <div className="space-y-1.5 rounded border border-red-200 p-2 dark:border-red-900">
            <p className="text-[10px] text-red-500">Are you sure you want to delete this plan?</p>
            <div className="flex gap-1">
              <button
                onClick={handleDelete}
                className="flex-1 rounded bg-red-500 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-600"
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded border border-red-200 px-2 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
          >
            Delete Plan
          </button>
        )}
      </div>
    </div>
  );
}
