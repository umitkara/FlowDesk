import { useState, useEffect, useCallback } from "react";
import { usePlanStore } from "../../stores/planStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUIStore } from "../../stores/uiStore";
import { useTrackerStore } from "../../stores/trackerStore";
import { BulkMoveToWorkspaceMenu } from "../../components/shared/BulkMoveToWorkspaceMenu";
import { PLAN_TYPE_CONFIG, STATUS_CONFIG } from "../../lib/types";
import type { Plan, PlanLinkedTask, PlanWithLinks, TaskStatus, Task } from "../../lib/types";
import * as ipc from "../../lib/ipc";

/** Formats a date string for display. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Formats time from ISO string. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Shifts a date string by the given number of days. */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dedicated view for planning and reviewing a single day. */
export default function DailyPlanView() {
  const {
    dailySummary,
    dailyPlanDate,
    loading,
    fetchDailySummary,
    setDailyPlanDate,
    openDialog,
    fetchPlanWithLinks,
  } = usePlanStore();
  const stickyTasks = useTaskStore((s) => s.stickyTasks);
  const fetchStickyTasks = useTaskStore((s) => s.fetchStickyTasks);
  const { setActiveView } = useUIStore();

  const [initialized, setInitialized] = useState(false);
  /** Map from plan ID to its linked tasks (fetched per time block/event). */
  const [planLinkedTasks, setPlanLinkedTasks] = useState<Record<string, PlanLinkedTask[]>>({});
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());

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

  // Fetch linked tasks for each duration-based plan
  useEffect(() => {
    if (!dailySummary) return;
    const planIds = [
      ...dailySummary.time_blocks,
      ...dailySummary.events,
      ...dailySummary.meetings,
      ...dailySummary.reviews,
    ].map((p) => p.id);
    if (planIds.length === 0) {
      setPlanLinkedTasks({});
      return;
    }
    let cancelled = false;
    Promise.all(
      planIds.map((id) =>
        ipc.getPlanWithLinks(id).then((pw: PlanWithLinks) => [id, pw.linked_tasks] as const)
      )
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, PlanLinkedTask[]> = {};
      for (const [id, tasks] of results) {
        map[id] = tasks;
      }
      setPlanLinkedTasks(map);
    });
    return () => { cancelled = true; };
  }, [dailySummary]);

  const handlePrevDay = useCallback(() => {
    setDailyPlanDate(shiftDate(dailyPlanDate, -1));
  }, [dailyPlanDate, setDailyPlanDate]);

  const handleNextDay = useCallback(() => {
    setDailyPlanDate(shiftDate(dailyPlanDate, 1));
  }, [dailyPlanDate, setDailyPlanDate]);

  const handleToday = useCallback(() => {
    setDailyPlanDate(new Date().toISOString().slice(0, 10));
  }, [setDailyPlanDate]);

  const handlePlanClick = useCallback(
    (planId: string) => {
      fetchPlanWithLinks(planId);
    },
    [fetchPlanWithLinks]
  );

  const handleAddTimeBlock = useCallback(() => {
    const startTime = `${dailyPlanDate}T09:00:00`;
    const endTime = `${dailyPlanDate}T10:00:00`;
    openDialog({
      workspace_id: "",
      start_time: startTime,
      end_time: endTime,
      type: "time_block",
    });
  }, [dailyPlanDate, openDialog]);

  const handleAddEvent = useCallback(() => {
    const startTime = `${dailyPlanDate}T09:00:00`;
    const endTime = `${dailyPlanDate}T10:00:00`;
    openDialog({
      workspace_id: "",
      start_time: startTime,
      end_time: endTime,
      type: "event",
    });
  }, [dailyPlanDate, openDialog]);

  const handleAddMilestone = useCallback(() => {
    openDialog({
      workspace_id: "",
      start_time: `${dailyPlanDate}T09:00:00`,
      end_time: `${dailyPlanDate}T09:00:00`,
      type: "milestone",
    });
  }, [dailyPlanDate, openDialog]);

  const handleAddMeeting = useCallback(() => {
    openDialog({
      workspace_id: "",
      start_time: `${dailyPlanDate}T09:00:00`,
      end_time: `${dailyPlanDate}T10:00:00`,
      type: "meeting",
    });
  }, [dailyPlanDate, openDialog]);

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

  const handleAddReminder = useCallback(() => {
    openDialog({
      workspace_id: "",
      start_time: `${dailyPlanDate}T09:00:00`,
      end_time: `${dailyPlanDate}T09:00:00`,
      type: "reminder",
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

  if (!initialized && loading) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-400">
        Loading...
      </div>
    );
  }

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

  // Merge and sort duration-based plans chronologically
  const chronological = [...timeBlocks, ...events, ...meetings, ...reviews].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Merge point-in-time markers
  const markers = [...milestones, ...deadlines, ...reminders].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const allPlanIds = [
    ...(dailyPlan ? [dailyPlan.id] : []),
    ...chronological.map((p) => p.id),
    ...habits.map((h) => h.id),
    ...markers.map((m) => m.id),
  ];
  const allPlansSelected = allPlanIds.length > 0 && selectedPlanIds.size === allPlanIds.length;
  const hasSelection = selectedPlanIds.size > 0;

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
          <button
            onClick={handleToday}
            className="mt-0.5 text-[10px] text-blue-500 hover:text-blue-600"
          >
            Today
          </button>
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

        {/* Time Blocks & Events */}
        <section>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            Schedule ({chronological.length})
          </div>
          {chronological.length === 0 ? (
            <div className="text-xs text-zinc-400">No scheduled blocks</div>
          ) : (
            <div className="space-y-1.5">
              {chronological.map((plan: Plan) => {
                const typeCfg = PLAN_TYPE_CONFIG[plan.type as keyof typeof PLAN_TYPE_CONFIG];
                const linkedTasks = planLinkedTasks[plan.id] ?? [];
                return (
                  <div key={plan.id}>
                    <div className="group relative flex items-start gap-2">
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
                        className="flex w-full items-start gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
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
                          </div>
                          <div className="mt-0.5 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {plan.title}
                          </div>
                        </div>
                      </button>
                      {useTrackerStore.getState().status === "idle" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            useTrackerStore.getState().start({ linkedPlanId: plan.id });
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
                    {/* Nested linked tasks */}
                    {linkedTasks.length > 0 && (
                      <div className="ml-5 mt-0.5 space-y-0.5 border-l-2 border-zinc-100 pl-2 dark:border-zinc-800">
                        {linkedTasks.map((lt: PlanLinkedTask) => {
                          const sCfg = STATUS_CONFIG[lt.status as TaskStatus];
                          const done = lt.status === "done" || lt.status === "cancelled";
                          return (
                            <button
                              key={lt.task_id}
                              onClick={() => setActiveView("tasks")}
                              className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                            >
                              <span className={`text-[10px] ${sCfg?.color || "text-zinc-400"}`}>
                                {done ? "☑" : "☐"}
                              </span>
                              <span className={`truncate text-[11px] ${done ? "text-zinc-400 line-through" : "text-zinc-600 dark:text-zinc-400"}`}>
                                {lt.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Scheduled Tasks */}
        {scheduledTasks.length > 0 && (
          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Scheduled Tasks ({scheduledTasks.length})
            </div>
            <div className="space-y-0.5">
              {scheduledTasks.map((lt: PlanLinkedTask) => {
                const statusCfg = STATUS_CONFIG[lt.status as TaskStatus];
                const isDone = lt.status === "done" || lt.status === "cancelled";
                return (
                  <button
                    key={lt.task_id}
                    onClick={() => {
                      setActiveView("tasks");
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <span className={`text-[10px] ${statusCfg?.color || "text-zinc-400"}`}>
                      {isDone ? "☑" : "☐"}
                    </span>
                    <span
                      className={`truncate text-xs ${
                        isDone
                          ? "text-zinc-400 line-through"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {lt.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Sticky Tasks */}
        {stickyTasks.length > 0 && (
          <section>
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
              Sticky Tasks ({stickyTasks.filter((t: Task) => t.status !== "done" && t.status !== "cancelled").length})
            </div>
            <div className="space-y-0.5">
              {stickyTasks
                .filter((t: Task) => t.status !== "done" && t.status !== "cancelled")
                .map((t: Task) => {
                  const statusCfg = STATUS_CONFIG[t.status as TaskStatus];
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveView("tasks")}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <span className={`text-[10px] ${statusCfg?.color || "text-zinc-400"}`}>☐</span>
                      <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                        {t.title}
                      </span>
                      <svg className="ml-auto h-3 w-3 flex-shrink-0 text-zinc-300 dark:text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  );
                })}
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
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <span style={{ color: "#a855f7" }} className="text-[10px]">↻</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
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

        {/* Markers: milestones, deadlines, reminders */}
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
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <span style={{ color: typeCfg?.color }} className="text-[10px]">{markerIcon}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
            <button
              onClick={handleAddTimeBlock}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Time Block
            </button>
            <button
              onClick={handleAddEvent}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Event
            </button>
            <button
              onClick={handleAddMilestone}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Milestone
            </button>
            <button
              onClick={handleAddMeeting}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Meeting
            </button>
            <button
              onClick={handleAddReview}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Review
            </button>
            <button
              onClick={handleAddHabit}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Habit
            </button>
            <button
              onClick={handleAddDeadline}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Deadline
            </button>
            <button
              onClick={handleAddReminder}
              className="rounded border border-zinc-200 px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              + Reminder
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
