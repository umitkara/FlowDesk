import { useState, useEffect, useCallback } from "react";
import * as ipc from "../../lib/ipc";
import type {
  PlannedVsActualData,
  PlannedBlock,
  ActualEntry,
  UnplannedGroup,
} from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaceStore";

function formatMins(totalMins: number): string {
  const sign = totalMins < 0 ? "-" : "";
  const abs = Math.abs(totalMins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };
  return `${fmt(start)} - ${fmt(end)}`;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  development: "#3b82f6",
  design: "#a855f7",
  meeting: "#f59e0b",
  research: "#10b981",
  writing: "#6366f1",
  review: "#ec4899",
  admin: "#78716c",
  break: "#94a3b8",
};

function categoryColor(category: string | null): string {
  if (!category) return "#6b7280";
  return CATEGORY_COLORS[category.toLowerCase()] ?? "#6b7280";
}

function PlanTypeBadge({ planType }: { planType: string }) {
  const config: Record<string, { label: string; className: string }> = {
    time_block: {
      label: "Work",
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    review: {
      label: "Work",
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    meeting: {
      label: "Meeting",
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    event: {
      label: "Event",
      className:
        "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
    },
  };
  const c = config[planType] ?? config.time_block;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}

function VarianceBadge({ variance }: { variance: number }) {
  if (variance > 0) {
    return (
      <span className="text-[11px] font-medium text-green-600 dark:text-green-400">
        +{formatMins(variance)}
      </span>
    );
  }
  if (variance < 0) {
    return (
      <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
        {formatMins(variance)}
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
      on target
    </span>
  );
}

function ActualEntryRow({ entry }: { entry: ActualEntry }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-gray-50 dark:bg-gray-800/50 text-xs">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: categoryColor(entry.category) }}
      />
      <span className="text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
        {formatTimeRange(entry.start_time, entry.end_time)}
      </span>
      <span className="font-medium tabular-nums">{formatMins(entry.active_mins)}</span>
      {entry.in_progress && (
        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px] font-medium">
          tracking
        </span>
      )}
      {entry.category && (
        <span className="text-gray-400 dark:text-gray-500 truncate">
          {entry.category}
        </span>
      )}
      {entry.notes_preview && (
        <span className="text-gray-400 dark:text-gray-500 truncate ml-auto max-w-[12rem]">
          {entry.notes_preview}
        </span>
      )}
    </div>
  );
}

export default function PlannedVsActual() {
  const [date, setDate] = useState(todayISO);
  const [data, setData] = useState<PlannedVsActualData | null>(null);
  const [loading, setLoading] = useState(true);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const result = await ipc.getPlannedVsActual(activeWorkspaceId, date);
      setData(result);
    } catch (err) {
      console.error("Failed to load planned vs actual data:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const goBack = () => setDate((d) => shiftDate(d, -1));
  const goForward = () => setDate((d) => shiftDate(d, 1));

  const utilization =
    data && data.planned_total_mins > 0
      ? Math.round((data.actual_total_mins / data.planned_total_mins) * 100)
      : null;

  const isEmpty =
    data &&
    data.planned_blocks.length === 0 &&
    data.actual_entries.length === 0;

  return (
    <div className="flex h-full flex-col text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Plan vs Actual
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={goBack}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
            aria-label="Previous day"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <span className="text-sm font-semibold min-w-[7rem] text-center tabular-nums">
            {date}
          </span>
          <button
            onClick={goForward}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
            aria-label="Next day"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-primary-600 rounded-full animate-spin" />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Loading...
            </span>
          </div>
        </div>
      ) : !data ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          No data available for this date.
        </div>
      ) : (
        <>
          {/* Summary Bar */}
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <div className="flex items-center justify-between text-sm flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Planned:{" "}
                  </span>
                  <span className="font-semibold">
                    {formatMins(data.planned_total_mins)}
                  </span>
                  {(data.planned_work_mins > 0 ||
                    data.planned_commitment_mins > 0) && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">
                      ({formatMins(data.planned_work_mins)} work
                      {data.planned_commitment_mins > 0 &&
                        `, ${formatMins(data.planned_commitment_mins)} commit.`}
                      )
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Tracked:{" "}
                  </span>
                  <span className="font-semibold">
                    {formatMins(data.actual_total_mins)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {utilization !== null && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {utilization}% utilization
                  </span>
                )}
                <span
                  className={`font-semibold ${
                    data.difference_mins > 0
                      ? "text-green-600 dark:text-green-400"
                      : data.difference_mins < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {data.difference_mins > 0 ? "+" : ""}
                  {formatMins(data.difference_mins)}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-auto">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full py-16">
                <svg className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No plans or tracked time for this day.
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-6">
                {/* Matched Section */}
                {data.matched.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                      Matched ({data.matched.length})
                    </h3>
                    <div className="space-y-3">
                      {data.matched.map((block: PlannedBlock) => (
                        <div
                          key={block.plan_id}
                          className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: block.color ?? "#3b82f6",
                                }}
                              />
                              <span className="text-sm font-medium truncate">
                                {block.title}
                              </span>
                              <PlanTypeBadge planType={block.plan_type} />
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                {formatMins(block.duration_mins)} planned
                              </span>
                              <span className="text-xs font-medium tabular-nums">
                                {formatMins(block.actual_mins)} actual
                              </span>
                              <VarianceBadge variance={block.variance_mins} />
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            {formatTimeRange(block.start_time, block.end_time)}
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{
                                width: `${Math.min(Math.max((block.actual_mins / Math.max(block.duration_mins, 1)) * 100, 0), 150)}%`,
                                backgroundColor: block.color ?? "#3b82f6",
                              }}
                            />
                          </div>
                          {/* Linked entries */}
                          {block.linked_entries.length > 0 && (
                            <div className="space-y-1 mt-2">
                              {block.linked_entries.map((entry) => (
                                <ActualEntryRow
                                  key={entry.time_entry_id}
                                  entry={entry}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Unplanned Section */}
                {data.unplanned.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                      Unplanned
                    </h3>
                    <div className="space-y-3">
                      {data.unplanned.map(
                        (group: UnplannedGroup, idx: number) => (
                          <div
                            key={group.category ?? `uncat-${idx}`}
                            className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor: categoryColor(
                                      group.category
                                    ),
                                  }}
                                />
                                <span className="text-sm font-medium">
                                  {group.category ?? "Uncategorized"}
                                </span>
                              </div>
                              <span className="text-xs font-medium tabular-nums">
                                {formatMins(group.total_mins)}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {group.entries.map((entry) => (
                                <ActualEntryRow
                                  key={entry.time_entry_id}
                                  entry={entry}
                                />
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </section>
                )}

                {/* Missed Section */}
                {data.missed.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                      Missed ({data.missed.length})
                    </h3>
                    <div className="space-y-2">
                      {data.missed.map((block: PlannedBlock) => (
                        <div
                          key={block.plan_id}
                          className="rounded-lg border border-gray-200 dark:border-gray-700 border-dashed p-3 opacity-70"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: block.color ?? "#3b82f6",
                                }}
                              />
                              <span className="text-sm font-medium truncate">
                                {block.title}
                              </span>
                              <PlanTypeBadge planType={block.plan_type} />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">
                              {formatMins(block.duration_mins)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {formatTimeRange(block.start_time, block.end_time)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
