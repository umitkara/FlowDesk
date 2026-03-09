import { useState, useEffect, useCallback, useMemo } from "react";
import { usePlanStore } from "../../stores/planStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTrackerStore } from "../../stores/trackerStore";
import { BulkMoveToWorkspaceMenu } from "../../components/shared/BulkMoveToWorkspaceMenu";
import { PLAN_TYPE_CONFIG, PLAN_STATUS_CONFIG, STATUS_CONFIG } from "../../lib/types";
import type { Plan, PlanLinkedTask, TaskStatus, Task, PlanStatus } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { openEntity } from "../../lib/openEntity";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Utilities ───────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateToMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function minsToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().slice(0, 10);
}

type PlanTiming = "past" | "current" | "upcoming" | "future";

function getPlanTiming(plan: Plan, nowMins: number, todayDate: string): PlanTiming {
  if (plan.start_time.slice(0, 10) !== todayDate) return "future";
  const start = dateToMinutes(plan.start_time);
  const end = dateToMinutes(plan.end_time);
  if (nowMins >= start && nowMins < end) return "current";
  if (nowMins >= end) return "past";
  if (start - nowMins <= 30) return "upcoming";
  return "future";
}

// ─── Sub-components ──────────────────────────────────────────

/** Inline task row with checkbox toggle for status. */
function DailyPlanTaskRow({
  taskId,
  title,
  status,
  onStatusToggled,
}: {
  taskId: string;
  title: string;
  status: string;
  onStatusToggled?: () => void;
}) {
  const [localStatus, setLocalStatus] = useState(status);
  const isDone = localStatus === "done" || localStatus === "cancelled";
  const statusCfg = STATUS_CONFIG[localStatus as TaskStatus];

  useEffect(() => {
    setLocalStatus(status);
  }, [status]);

  const handleToggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const newStatus = isDone ? "todo" : "done";
      setLocalStatus(newStatus);
      try {
        await ipc.toggleTaskStatus(taskId);
        onStatusToggled?.();
      } catch {
        setLocalStatus(status); // revert on error
      }
    },
    [taskId, isDone, status, onStatusToggled],
  );

  return (
    <div className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      <button
        onClick={handleToggle}
        className={`flex-shrink-0 text-[10px] ${statusCfg?.color || "text-zinc-400"}`}
        title={isDone ? "Mark incomplete" : "Mark complete"}
      >
        {isDone ? "☑" : "☐"}
      </button>
      <button
        onClick={() => openEntity({ type: "task", id: taskId })}
        className={`min-w-0 flex-1 truncate text-left text-[11px] ${
          isDone ? "text-zinc-400 line-through" : "text-zinc-600 hover:text-blue-500 dark:text-zinc-400"
        }`}
      >
        {title}
      </button>
    </div>
  );
}

/** Plan status control: checkbox + hover actions. */
function PlanStatusControl({
  plan,
  onStatusChange,
}: {
  plan: Plan;
  onStatusChange: (id: string, status: PlanStatus) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const isCompleted = plan.status === "completed";
  const isSkipped = plan.status === "skipped";
  const isDeferred = plan.status === "deferred";

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStatusChange(plan.id, isCompleted ? "scheduled" : "completed");
        }}
        className={`flex-shrink-0 rounded text-[10px] ${
          isCompleted
            ? "text-green-500"
            : isSkipped
              ? "text-zinc-400"
              : isDeferred
                ? "text-amber-500"
                : "text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400"
        }`}
        title={isCompleted ? "Mark incomplete" : "Mark complete"}
      >
        {isCompleted ? "✓" : isSkipped ? "⊘" : isDeferred ? "⏳" : "○"}
      </button>
      {hovering && !isCompleted && (
        <div className="absolute left-5 z-10 flex gap-0.5 rounded border border-zinc-200 bg-white px-1 py-0.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(plan.id, "skipped");
            }}
            className="rounded px-1 py-0.5 text-[9px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="Skip"
          >
            Skip
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(plan.id, "deferred");
            }}
            className="rounded px-1 py-0.5 text-[9px] text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="Defer"
          >
            Defer
          </button>
        </div>
      )}
    </div>
  );
}

/** Sortable wrapper for plan rows in the chronological section. */
function SortablePlanRow({
  plan,
  children,
}: {
  plan: Plan;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: plan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-start gap-1">
        <button
          {...listeners}
          className="mt-2.5 flex-shrink-0 cursor-grab touch-none rounded p-0.5 text-zinc-300 hover:text-zinc-500 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
          title="Drag to reorder"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/** Day summary section with progress bars. */
function DaySummarySection({
  chronological,
  scheduledTasks,
  stickyTasks,
  dateStr,
}: {
  chronological: Plan[];
  scheduledTasks: PlanLinkedTask[];
  stickyTasks: Task[];
  dateStr: string;
}) {
  const now = new Date();
  const autoExpand = isPast(dateStr) || (isToday(dateStr) && now.getHours() >= 16);
  const [expanded, setExpanded] = useState(autoExpand);

  useEffect(() => {
    setExpanded(autoExpand);
  }, [autoExpand]);

  const plansDone = chronological.filter((p) => p.status === "completed").length;
  const plansTotal = chronological.length;
  const tasksDone = scheduledTasks.filter(
    (t) => t.status === "done" || t.status === "cancelled",
  ).length;
  const tasksTotal = scheduledTasks.length;
  const stickyActive = stickyTasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  ).length;

  if (plansTotal === 0 && tasksTotal === 0) return null;

  const planPct = plansTotal > 0 ? Math.round((plansDone / plansTotal) * 100) : 0;
  const taskPct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          Day Summary
        </span>
        <svg
          className={`h-3 w-3 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {plansTotal > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>Plans</span>
                <span>
                  {plansDone}/{plansTotal} ({planPct}%)
                </span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${planPct}%` }}
                />
              </div>
            </div>
          )}
          {tasksTotal > 0 && (
            <div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>Tasks</span>
                <span>
                  {tasksDone}/{tasksTotal} ({taskPct}%)
                </span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${taskPct}%` }}
                />
              </div>
            </div>
          )}
          {stickyActive > 0 && (
            <div className="text-[10px] text-zinc-400">
              {stickyActive} sticky task{stickyActive !== 1 ? "s" : ""} still active
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Main Component ──────────────────────────────────────────

/** Dedicated view for planning and reviewing a single day. */
export default function DailyPlanView() {
  const {
    dailySummary,
    dailyPlanDate,
    loading,
    fetchDailySummary,
    setDailyPlanDate,
    openDialog,
    updatePlan,
  } = usePlanStore();
  const stickyTasks = useTaskStore((s) => s.stickyTasks);
  const fetchStickyTasks = useTaskStore((s) => s.fetchStickyTasks);

  // Step 5: reactive tracker selectors
  const trackerStatus = useTrackerStore((s) => s.status);
  const trackerStart = useTrackerStore((s) => s.start);

  const [initialized, setInitialized] = useState(false);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [chronologicalOrder, setChronologicalOrder] = useState<string[]>([]);

  // Step 8: "Now" indicator (updates every 60s, only on today)
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    if (!isToday(dailyPlanDate)) return;
    const interval = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(interval);
  }, [dailyPlanDate]);

  const togglePlanSelection = useCallback((id: string) => {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    fetchDailySummary(dailyPlanDate);
    fetchStickyTasks();
    setInitialized(true);
    setSelectedPlanIds(new Set());
  }, [dailyPlanDate, fetchDailySummary, fetchStickyTasks]);

  const handlePrevDay = useCallback(() => {
    setDailyPlanDate(shiftDate(dailyPlanDate, -1));
  }, [dailyPlanDate, setDailyPlanDate]);

  const handleNextDay = useCallback(() => {
    setDailyPlanDate(shiftDate(dailyPlanDate, 1));
  }, [dailyPlanDate, setDailyPlanDate]);

  const handleToday = useCallback(() => {
    setDailyPlanDate(new Date().toISOString().slice(0, 10));
  }, [setDailyPlanDate]);

  const handlePlanClick = useCallback((planId: string) => {
    openEntity({ type: "plan", id: planId });
  }, []);

  // Step 4: plan status change handler
  const handlePlanStatusChange = useCallback(
    (planId: string, status: PlanStatus) => {
      updatePlan({ id: planId, status });
      // Refresh after a short delay to update the summary
      setTimeout(() => fetchDailySummary(dailyPlanDate), 200);
    },
    [updatePlan, fetchDailySummary, dailyPlanDate],
  );

  // Step 2: task status toggle handler (refresh daily summary)
  const handleTaskStatusToggled = useCallback(() => {
    setTimeout(() => fetchDailySummary(dailyPlanDate), 300);
  }, [fetchDailySummary, dailyPlanDate]);

  // Step 6: Smart defaults — find next free 30-min slot
  const getNextFreeSlot = useCallback(
    (durationMins: number = 60): { start: string; end: string } => {
      const chronoPlans = dailySummary
        ? [...dailySummary.time_blocks, ...dailySummary.events, ...dailySummary.meetings, ...dailySummary.reviews]
        : [];
      const occupied = chronoPlans
        .map((p) => ({ start: dateToMinutes(p.start_time), end: dateToMinutes(p.end_time) }))
        .sort((a, b) => a.start - b.start);

      // Start from 9:00 or current time (whichever is later) if today
      let candidate = 9 * 60;
      if (isToday(dailyPlanDate)) {
        candidate = Math.max(candidate, nowMinutes);
        // Round up to next 15-min
        candidate = Math.ceil(candidate / 15) * 15;
      }

      for (const slot of occupied) {
        if (candidate + durationMins <= slot.start) break;
        if (candidate < slot.end) candidate = slot.end;
      }

      // Clamp to before midnight
      if (candidate + durationMins > 24 * 60) {
        candidate = Math.max(9 * 60, 24 * 60 - durationMins);
      }

      return {
        start: `${dailyPlanDate}T${minsToTimeStr(candidate)}`,
        end: `${dailyPlanDate}T${minsToTimeStr(candidate + durationMins)}`,
      };
    },
    [dailySummary, dailyPlanDate, nowMinutes],
  );

  const handleAddTimeBlock = useCallback(() => {
    const slot = getNextFreeSlot(60);
    openDialog({ workspace_id: "", start_time: slot.start, end_time: slot.end, type: "time_block" });
  }, [getNextFreeSlot, openDialog]);

  const handleAddEvent = useCallback(() => {
    const slot = getNextFreeSlot(60);
    openDialog({ workspace_id: "", start_time: slot.start, end_time: slot.end, type: "event" });
  }, [getNextFreeSlot, openDialog]);

  const handleAddMilestone = useCallback(() => {
    const slot = getNextFreeSlot(0);
    openDialog({ workspace_id: "", start_time: slot.start, end_time: slot.start, type: "milestone" });
  }, [getNextFreeSlot, openDialog]);

  const handleAddMeeting = useCallback(() => {
    const slot = getNextFreeSlot(60);
    openDialog({ workspace_id: "", start_time: slot.start, end_time: slot.end, type: "meeting" });
  }, [getNextFreeSlot, openDialog]);

  const handleAddReminder = useCallback(() => {
    const slot = getNextFreeSlot(0);
    openDialog({ workspace_id: "", start_time: slot.start, end_time: slot.start, type: "reminder" });
  }, [getNextFreeSlot, openDialog]);

  // These keep fixed defaults
  const handleAddReview = useCallback(() => {
    openDialog({
      workspace_id: "",
      start_time: `${dailyPlanDate}T17:00:00`,
      end_time: `${dailyPlanDate}T17:30:00`,
      type: "review",
    });
  }, [dailyPlanDate, openDialog]);

  const handleAddHabit = useCallback(() => {
    openDialog({
      workspace_id: "",
      start_time: `${dailyPlanDate}T07:00:00`,
      end_time: `${dailyPlanDate}T07:30:00`,
      type: "habit",
    });
  }, [dailyPlanDate, openDialog]);

  const handleAddDeadline = useCallback(() => {
    openDialog({
      workspace_id: "",
      start_time: `${dailyPlanDate}T23:59:00`,
      end_time: `${dailyPlanDate}T23:59:00`,
      type: "deadline",
    });
  }, [dailyPlanDate, openDialog]);

  const handleCreateDailyPlan = useCallback(() => {
    openDialog({
      workspace_id: "",
      start_time: `${dailyPlanDate}T00:00:00`,
      end_time: `${dailyPlanDate}T23:59:59`,
      all_day: true,
      type: "daily_plan",
    });
  }, [dailyPlanDate, openDialog]);

  // Derived data
  const timeBlocks = dailySummary?.time_blocks ?? [];
  const events = dailySummary?.events ?? [];
  const milestones = dailySummary?.milestones ?? [];
  const deadlines = dailySummary?.deadlines ?? [];
  const meetings = dailySummary?.meetings ?? [];
  const reviews = dailySummary?.reviews ?? [];
  const habits = dailySummary?.habits ?? [];
  const reminders = dailySummary?.reminders ?? [];
  const scheduledTasks = dailySummary?.scheduled_tasks ?? [];
  const dailyPlan = dailySummary?.daily_plan;
  const planLinkedTasks = dailySummary?.plan_linked_tasks ?? {};

  // Step 9: maintain chronological order for DnD
  const naturalChronological = useMemo(
    () =>
      [...timeBlocks, ...events, ...meetings, ...reviews].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      ),
    [timeBlocks, events, meetings, reviews],
  );

  // Sync chronologicalOrder when summary changes
  useEffect(() => {
    setChronologicalOrder(naturalChronological.map((p) => p.id));
  }, [naturalChronological]);

  // Ordered chronological based on drag state
  const chronological = useMemo(() => {
    const planMap = new Map(naturalChronological.map((p) => [p.id, p]));
    const ordered: Plan[] = [];
    for (const id of chronologicalOrder) {
      const p = planMap.get(id);
      if (p) ordered.push(p);
    }
    // Append any new plans not yet in the order
    for (const p of naturalChronological) {
      if (!chronologicalOrder.includes(p.id)) ordered.push(p);
    }
    return ordered;
  }, [naturalChronological, chronologicalOrder]);

  const markers = useMemo(
    () =>
      [...milestones, ...deadlines, ...reminders].sort(
        (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
      ),
    [milestones, deadlines, reminders],
  );

  const allPlanIds = [
    ...(dailyPlan ? [dailyPlan.id] : []),
    ...chronological.map((p) => p.id),
    ...habits.map((h) => h.id),
    ...markers.map((m) => m.id),
  ];
  const allPlansSelected = allPlanIds.length > 0 && selectedPlanIds.size === allPlanIds.length;
  const hasSelection = selectedPlanIds.size > 0;

  // Step 9: DnD sensors and handler
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setChronologicalOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const reordered = arrayMove(prev, oldIndex, newIndex);

        // Recalculate times: shift plans to maintain original durations
        const planMap = new Map(naturalChronological.map((p) => [p.id, p]));
        let cursor = 9 * 60; // Start at 09:00
        for (const id of reordered) {
          const p = planMap.get(id);
          if (!p) continue;
          const duration = dateToMinutes(p.end_time) - dateToMinutes(p.start_time);
          const newStart = `${dailyPlanDate}T${minsToTimeStr(cursor)}`;
          const newEnd = `${dailyPlanDate}T${minsToTimeStr(cursor + duration)}`;
          if (newStart !== p.start_time || newEnd !== p.end_time) {
            updatePlan({ id, start_time: newStart, end_time: newEnd });
          }
          cursor += duration;
        }

        // Refresh after updates
        setTimeout(() => fetchDailySummary(dailyPlanDate), 500);
        return reordered;
      });
    },
    [naturalChronological, dailyPlanDate, updatePlan, fetchDailySummary],
  );

  // Step 8: Now indicator helpers
  const todayDate = new Date().toISOString().slice(0, 10);
  const showNowIndicator = isToday(dailyPlanDate);

  // Header progress for today
  const headerProgress = useMemo(() => {
    if (!showNowIndicator || chronological.length === 0) return null;
    const done = chronological.filter((p) => p.status === "completed").length;
    const past = chronological.filter((p) => getPlanTiming(p, nowMinutes, todayDate) === "past" && p.status !== "completed").length;
    return { done, past, total: chronological.length };
  }, [showNowIndicator, chronological, nowMinutes, todayDate]);

  if (!initialized && loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Date navigation header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <button
          onClick={handlePrevDay}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {formatDate(dailyPlanDate)}
          </h2>
          <div className="mt-0.5 flex items-center justify-center gap-2">
            <button
              onClick={handleToday}
              className="text-[10px] text-blue-500 hover:text-blue-600"
            >
              Today
            </button>
            {headerProgress && (
              <span className="text-[10px] text-zinc-400">
                {headerProgress.done}/{headerProgress.total} done
                {headerProgress.past > 0 && ` · ${headerProgress.past} overdue`}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleNextDay}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Select all */}
        {allPlanIds.length > 0 && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allPlansSelected}
              onChange={() =>
                allPlansSelected
                  ? setSelectedPlanIds(new Set())
                  : setSelectedPlanIds(new Set(allPlanIds))
              }
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600"
            />
            <span className="text-[10px] text-zinc-400">Select all plans</span>
          </div>
        )}

        {/* Step 10: Day Summary */}
        <DaySummarySection
          chronological={chronological}
          scheduledTasks={scheduledTasks}
          stickyTasks={stickyTasks.filter((t: Task) => t.status !== "done" && t.status !== "cancelled")}
          dateStr={dailyPlanDate}
        />

        {/* Daily Plan */}
        <section>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Daily Plan
          </div>
          {dailyPlan ? (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedPlanIds.has(dailyPlan.id)}
                onChange={() => togglePlanSelection(dailyPlan.id)}
                className={`mt-2.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 ${
                  hasSelection ? "opacity-100" : "opacity-0 hover:opacity-100"
                } transition-opacity`}
              />
              <button
                onClick={() => handlePlanClick(dailyPlan.id)}
                className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
              >
                <div className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {dailyPlan.title}
                </div>
                {dailyPlan.description && (
                  <div className="mt-0.5 text-xs text-emerald-600/70 dark:text-emerald-500/60 line-clamp-2">
                    {dailyPlan.description}
                  </div>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={handleCreateDailyPlan}
              className="w-full rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-600"
            >
              + Create Daily Plan
            </button>
          )}
        </section>

        {/* Schedule with DnD */}
        <section>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Schedule ({chronological.length})
          </div>
          {chronological.length === 0 ? (
            <div className="text-xs text-zinc-400">No scheduled blocks</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={chronological.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {chronological.map((plan: Plan) => {
                    const typeCfg = PLAN_TYPE_CONFIG[plan.type as keyof typeof PLAN_TYPE_CONFIG];
                    const linkedTasks = planLinkedTasks[plan.id] ?? [];
                    const timing = showNowIndicator ? getPlanTiming(plan, nowMinutes, todayDate) : null;
                    const statusCfg = PLAN_STATUS_CONFIG[plan.status as PlanStatus];
                    const isDone = plan.status === "completed" || plan.status === "skipped";

                    return (
                      <SortablePlanRow key={plan.id} plan={plan}>
                        <div>
                          <div
                            className={`group relative flex items-start gap-2 ${
                              timing === "past" && !isDone ? "opacity-50" : ""
                            } ${timing === "current" ? "rounded-lg ring-2 ring-emerald-400/50" : ""}`}
                          >
                            {/* Step 4: Status control */}
                            <div className="mt-2.5">
                              <PlanStatusControl plan={plan} onStatusChange={handlePlanStatusChange} />
                            </div>
                            <input
                              type="checkbox"
                              checked={selectedPlanIds.has(plan.id)}
                              onChange={() => togglePlanSelection(plan.id)}
                              className={`mt-2.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 ${
                                hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              } transition-opacity`}
                            />
                            <button
                              onClick={() => handlePlanClick(plan.id)}
                              className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                                isDone
                                  ? "border-zinc-100 bg-zinc-50/50 dark:border-zinc-800/50 dark:bg-zinc-900/30"
                                  : timing === "current"
                                    ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20"
                                    : "border-zinc-200 dark:border-zinc-800"
                              }`}
                            >
                              <div
                                className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                                style={{ backgroundColor: plan.color || typeCfg?.color || "#6b7280" }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-zinc-400">
                                    {formatTime(plan.start_time)} – {formatTime(plan.end_time)}
                                  </span>
                                  <span
                                    className="rounded px-1 py-0.5 text-[9px] font-medium text-white"
                                    style={{ backgroundColor: typeCfg?.color || "#6b7280" }}
                                  >
                                    {typeCfg?.label || plan.type}
                                  </span>
                                  {isDone && (
                                    <span className={`text-[9px] font-medium ${statusCfg?.color}`}>
                                      {statusCfg?.label}
                                    </span>
                                  )}
                                  {timing === "upcoming" && (
                                    <span className="rounded bg-blue-100 px-1 py-0.5 text-[9px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                      Next up
                                    </span>
                                  )}
                                </div>
                                <div
                                  className={`mt-0.5 truncate text-xs font-medium ${
                                    isDone
                                      ? "text-zinc-400 line-through"
                                      : "text-zinc-700 dark:text-zinc-300"
                                  }`}
                                >
                                  {plan.title}
                                </div>
                              </div>
                            </button>
                            {trackerStatus === "idle" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  trackerStart({ linkedPlanId: plan.id });
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 opacity-0 transition-opacity hover:bg-emerald-50 hover:text-emerald-600 group-hover:opacity-100 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                                title="Start tracking this plan"
                              >
                                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              </button>
                            )}
                          </div>
                          {/* Step 2: Inline task toggle for linked tasks */}
                          {linkedTasks.length > 0 && (
                            <div className="ml-7 mt-0.5 space-y-0.5 border-l-2 border-zinc-100 pl-2 dark:border-zinc-800">
                              {linkedTasks.map((lt: PlanLinkedTask) => (
                                <DailyPlanTaskRow
                                  key={lt.task_id}
                                  taskId={lt.task_id}
                                  title={lt.title}
                                  status={lt.status}
                                  onStatusToggled={handleTaskStatusToggled}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </SortablePlanRow>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Step 8: Now separator line */}
          {showNowIndicator && chronological.length > 0 && (() => {
            // Find if "now" falls between any plans
            const lastPast = chronological.filter(
              (p) => dateToMinutes(p.end_time) <= nowMinutes,
            ).length;
            const firstFuture = chronological.findIndex(
              (p) => dateToMinutes(p.start_time) > nowMinutes,
            );
            // Show if there's a gap between last past and first future
            if (lastPast > 0 && firstFuture > lastPast) {
              return null; // Already shown via current plan highlight
            }
            return null;
          })()}
        </section>

        {/* Scheduled Tasks — Step 2: with inline toggle */}
        {scheduledTasks.length > 0 && (
          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Scheduled Tasks ({scheduledTasks.length})
            </div>
            <div className="space-y-0.5">
              {scheduledTasks.map((lt: PlanLinkedTask) => (
                <DailyPlanTaskRow
                  key={lt.task_id}
                  taskId={lt.task_id}
                  title={lt.title}
                  status={lt.status}
                  onStatusToggled={handleTaskStatusToggled}
                />
              ))}
            </div>
          </section>
        )}

        {/* Sticky Tasks — Step 2: with inline toggle */}
        {stickyTasks.length > 0 && (
          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Sticky Tasks ({stickyTasks.filter((t: Task) => t.status !== "done" && t.status !== "cancelled").length})
            </div>
            <div className="space-y-0.5">
              {stickyTasks
                .filter((t: Task) => t.status !== "done" && t.status !== "cancelled")
                .map((t: Task) => (
                  <div key={t.id} className="flex items-center gap-0.5">
                    <DailyPlanTaskRow
                      taskId={t.id}
                      title={t.title}
                      status={t.status}
                      onStatusToggled={handleTaskStatusToggled}
                    />
                    <svg className="h-3 w-3 flex-shrink-0 text-zinc-300 dark:text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* Habits */}
        {habits.length > 0 && (
          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Habits ({habits.length})
            </div>
            <div className="space-y-1">
              {habits.map((h: Plan) => (
                <div key={h.id} className="group flex items-center gap-2">
                  <PlanStatusControl plan={h} onStatusChange={handlePlanStatusChange} />
                  <input
                    type="checkbox"
                    checked={selectedPlanIds.has(h.id)}
                    onChange={() => togglePlanSelection(h.id)}
                    className={`rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 ${
                      hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    } transition-opacity`}
                  />
                  <button
                    onClick={() => handlePlanClick(h.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                      h.status === "completed" || h.status === "skipped" ? "opacity-50" : ""
                    }`}
                  >
                    <span style={{ color: "#a855f7" }} className="text-[10px]">↻</span>
                    <span className={`min-w-0 flex-1 truncate text-xs font-medium ${
                      h.status === "completed" ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-300"
                    }`}>
                      {h.title}
                    </span>
                    <span className="text-[9px] text-zinc-400">
                      {formatTime(h.start_time)}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Markers */}
        {markers.length > 0 && (
          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Markers ({markers.length})
            </div>
            <div className="space-y-1">
              {markers.map((m: Plan) => {
                const typeCfg = PLAN_TYPE_CONFIG[m.type as keyof typeof PLAN_TYPE_CONFIG];
                const markerIcon = m.type === "deadline" ? "⚑" : m.type === "reminder" ? "🔔" : "◆";
                return (
                  <div key={m.id} className="group flex items-center gap-2">
                    <PlanStatusControl plan={m} onStatusChange={handlePlanStatusChange} />
                    <input
                      type="checkbox"
                      checked={selectedPlanIds.has(m.id)}
                      onChange={() => togglePlanSelection(m.id)}
                      className={`rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 ${
                        hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      } transition-opacity`}
                    />
                    <button
                      onClick={() => handlePlanClick(m.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                        m.status === "completed" || m.status === "skipped" ? "opacity-50" : ""
                      }`}
                    >
                      <span style={{ color: typeCfg?.color }} className="text-[10px]">{markerIcon}</span>
                      <span className={`min-w-0 flex-1 truncate text-xs font-medium ${
                        m.status === "completed" ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-300"
                      }`}>
                        {m.title}
                      </span>
                      <span
                        className="rounded px-1 py-0.5 text-[9px] font-medium text-white"
                        style={{ backgroundColor: typeCfg?.color || "#6b7280" }}
                      >
                        {typeCfg?.label || m.type}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Bulk action bar */}
        {hasSelection && (
          <div className="flex items-center gap-3 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {selectedPlanIds.size} selected
            </span>
            <BulkMoveToWorkspaceMenu
              entityIds={Array.from(selectedPlanIds)}
              entityType="plan"
              onMoved={() => {
                setSelectedPlanIds(new Set());
                fetchDailySummary(dailyPlanDate);
              }}
            />
            <button
              onClick={() => setSelectedPlanIds(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Clear
            </button>
          </div>
        )}

        {/* Actions */}
        <section className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Actions
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={handleAddTimeBlock} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Time Block
            </button>
            <button onClick={handleAddEvent} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Event
            </button>
            <button onClick={handleAddMilestone} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Milestone
            </button>
            <button onClick={handleAddMeeting} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Meeting
            </button>
            <button onClick={handleAddReview} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Review
            </button>
            <button onClick={handleAddHabit} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Habit
            </button>
            <button onClick={handleAddDeadline} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Deadline
            </button>
            <button onClick={handleAddReminder} className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
              + Reminder
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
