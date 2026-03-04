import { useState, useEffect, useCallback } from "react";
import { formatMinutes } from "../../stores/trackerStore";
import * as ipc from "../../lib/ipc";
import type {
  DailySummary,
  WeeklySummary,
  CategoryTime,
  TagTime,
  TimeEntry,
} from "../../lib/types";

/** Date navigation helpers. */
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Daily/weekly time report view. */
export function TimeReports() {
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  const [date, setDate] = useState(todayISO());
  const [daily, setDaily] = useState<DailySummary | null>(null);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDaily = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const [summary, entryList] = await Promise.all([
        ipc.getDailySummary("", d),
        ipc.listTimeEntries({ workspaceId: "", startDate: d, endDate: d }),
      ]);
      setDaily(summary);
      setEntries(entryList);
    } catch {
      setDaily(null);
      setEntries([]);
    }
    setLoading(false);
  }, []);

  const fetchWeekly = useCallback(async (d: string) => {
    setLoading(true);
    const monday = getMonday(d);
    const sunday = shiftDate(monday, 6);
    try {
      const [summary, entryList] = await Promise.all([
        ipc.getWeeklySummary("", monday),
        ipc.listTimeEntries({
          workspaceId: "",
          startDate: monday,
          endDate: sunday,
        }),
      ]);
      setWeekly(summary);
      setEntries(entryList);
    } catch {
      setWeekly(null);
      setEntries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "daily") {
      fetchDaily(date);
    } else {
      fetchWeekly(date);
    }
  }, [mode, date, fetchDaily, fetchWeekly]);

  const navigateDate = (delta: number) => {
    if (mode === "daily") {
      setDate((d) => shiftDate(d, delta));
    } else {
      setDate((d) => shiftDate(d, delta * 7));
    }
  };

  const summary = mode === "daily" ? daily : weekly;
  const totalMins = summary?.total_mins ?? 0;
  const categories = summary?.by_category ?? [];
  const tags = summary?.by_tag ?? [];

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Time Reports
        </h1>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setMode("daily")}
              className={`rounded-l-lg px-3 py-1 text-xs font-medium ${
                mode === "daily"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setMode("weekly")}
              className={`rounded-r-lg px-3 py-1 text-xs font-medium ${
                mode === "weekly"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              Weekly
            </button>
          </div>
        </div>
      </div>

      {/* Date navigation */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => navigateDate(-1)}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {mode === "daily"
            ? formatDateLabel(date)
            : `${formatDateLabel(getMonday(date))} — ${formatDateLabel(shiftDate(getMonday(date), 6))}`}
        </span>
        <button
          onClick={() => navigateDate(1)}
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => setDate(todayISO())}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
        >
          Today
        </button>
      </div>

      {loading && (
        <div className="mt-8 text-center text-sm text-gray-400">Loading...</div>
      )}

      {!loading && (
        <>
          {/* Total summary */}
          <div className="mt-5 rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatMinutes(totalMins)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              across {entries.length} session{entries.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Weekly day-by-day breakdown */}
          {mode === "weekly" && weekly && weekly.daily_breakdown.length > 0 && (
            <div className="mt-5">
              <SectionHeader>Daily Breakdown</SectionHeader>
              <div className="mt-2 space-y-1">
                {weekly.daily_breakdown.map((day) => {
                  const pct = weekly.total_mins > 0 ? (day.total_mins / weekly.total_mins) * 100 : 0;
                  return (
                    <div key={day.date} className="flex items-center gap-3 text-xs">
                      <span className="w-16 text-gray-500 dark:text-gray-400">
                        {new Date(day.date + "T00:00:00").toLocaleDateString([], { weekday: "short" })}
                      </span>
                      <div className="flex-1">
                        <div className="h-4 rounded bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-4 rounded bg-blue-500/70 dark:bg-blue-400/50"
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                      </div>
                      <span className="w-14 text-right font-medium text-gray-700 dark:text-gray-300">
                        {formatMinutes(day.total_mins)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {categories.length > 0 && (
            <div className="mt-5">
              <SectionHeader>By Category</SectionHeader>
              <div className="mt-2 space-y-1.5">
                {categories.map((cat) => (
                  <CategoryBar
                    key={cat.category ?? "__none__"}
                    category={cat}
                    totalMins={totalMins}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tag breakdown */}
          {tags.length > 0 && (
            <div className="mt-5">
              <SectionHeader>By Tag</SectionHeader>
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <TagBadge key={tag.tag} tag={tag} />
                ))}
              </div>
            </div>
          )}

          {/* Entry list */}
          <div className="mt-5">
            <SectionHeader>Entries</SectionHeader>
            {entries.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                No time entries for this {mode === "daily" ? "day" : "week"}.
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Sub-components ---

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {children}
    </div>
  );
}

const BAR_COLORS = [
  "bg-blue-500 dark:bg-blue-400",
  "bg-emerald-500 dark:bg-emerald-400",
  "bg-amber-500 dark:bg-amber-400",
  "bg-rose-500 dark:bg-rose-400",
  "bg-violet-500 dark:bg-violet-400",
  "bg-cyan-500 dark:bg-cyan-400",
];

function CategoryBar({
  category,
  totalMins,
}: {
  category: CategoryTime;
  totalMins: number;
}) {
  const pct = totalMins > 0 ? (category.total_mins / totalMins) * 100 : 0;
  const colorIdx =
    category.category
      ? Math.abs(hashStr(category.category)) % BAR_COLORS.length
      : 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="h-5 rounded bg-gray-100 dark:bg-gray-800">
          <div
            className={`h-5 rounded ${BAR_COLORS[colorIdx]} opacity-70`}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        </div>
      </div>
      <div className="flex w-48 items-center justify-between text-xs">
        <span className="truncate font-medium text-gray-700 dark:text-gray-300">
          {category.category || "Uncategorized"}
        </span>
        <span className="ml-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
          {formatMinutes(category.total_mins)}{" "}
          <span className="text-gray-400 dark:text-gray-500">
            ({Math.round(pct)}%)
          </span>
        </span>
      </div>
    </div>
  );
}

function TagBadge({ tag }: { tag: TagTime }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-800">
      <span className="font-medium text-gray-700 dark:text-gray-300">
        {tag.tag}
      </span>
      <span className="text-gray-400 dark:text-gray-500">
        {formatMinutes(tag.total_mins)}
      </span>
    </span>
  );
}

function EntryRow({ entry }: { entry: TimeEntry }) {
  const startTime = entry.start_time
    ? new Date(entry.start_time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const endTime = entry.end_time
    ? new Date(entry.end_time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "...";

  const preview =
    entry.notes?.trim().split("\n")[0]?.slice(0, 60) || "No notes";

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50">
      <span className="w-24 font-mono text-gray-500 dark:text-gray-400">
        {startTime}–{endTime}
      </span>
      <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
        {preview}
      </span>
      <span className="font-medium text-gray-900 dark:text-gray-100">
        {entry.active_mins != null ? formatMinutes(entry.active_mins) : "—"}
      </span>
      {entry.category && (
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {entry.category}
        </span>
      )}
    </div>
  );
}

/** Simple string hash for color assignment. */
function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
