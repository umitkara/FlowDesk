import { useState, useEffect, useCallback } from "react";
import * as ipc from "../../lib/ipc";
import type {
  PlannedVsActualData,
  PlannedBlock,
  ActualEntry,
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

  const maxDuration = data
    ? Math.max(
        ...data.planned_blocks.map((b) => b.duration_mins),
        ...data.actual_entries.map((e) => e.active_mins),
        1
      )
    : 1;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Date Navigation */}
      <div className="flex items-center justify-center gap-4 py-3 px-4 border-b border-gray-200 dark:border-gray-700">
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

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin" />
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
          {/* Two-Column Layout */}
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 gap-0 min-h-0">
              {/* Planned Column */}
              <div className="border-r border-gray-200 dark:border-gray-700">
                <div className="sticky top-0 bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Planned
                  </h3>
                </div>
                <div className="p-3 space-y-2">
                  {data.planned_blocks.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">
                      No planned blocks
                    </p>
                  ) : (
                    data.planned_blocks.map((block: PlannedBlock) => (
                      <div
                        key={block.plan_id}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-sm font-medium truncate">
                            {block.title}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatMins(block.duration_mins)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          {formatTimeRange(block.start_time, block.end_time)}
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.max((block.duration_mins / maxDuration) * 100, 4)}%`,
                              backgroundColor: block.color ?? "#3b82f6",
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Actual Column */}
              <div>
                <div className="sticky top-0 bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Actual
                  </h3>
                </div>
                <div className="p-3 space-y-2">
                  {data.actual_entries.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">
                      No tracked entries
                    </p>
                  ) : (
                    data.actual_entries.map((entry: ActualEntry) => (
                      <div
                        key={entry.time_entry_id}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-sm font-medium truncate">
                            {entry.category ?? "Uncategorized"}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatMins(entry.active_mins)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {formatTimeRange(entry.start_time, entry.end_time)}
                        </div>
                        {entry.notes_preview && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 truncate mb-2">
                            {entry.notes_preview}
                          </div>
                        )}
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.max((entry.active_mins / maxDuration) * 100, 4)}%`,
                              backgroundColor: categoryColor(entry.category),
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Summary Bar */}
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Planned:{" "}
                  </span>
                  <span className="font-semibold">
                    {formatMins(data.planned_total_mins)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Actual:{" "}
                  </span>
                  <span className="font-semibold">
                    {formatMins(data.actual_total_mins)}
                  </span>
                </div>
              </div>
              <div
                className={`font-semibold ${
                  data.difference_mins > 0
                    ? "text-green-600 dark:text-green-400"
                    : data.difference_mins < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {data.difference_mins > 0 ? "+" : ""}
                {formatMins(data.difference_mins)} difference
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
