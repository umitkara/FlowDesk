import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useActivityStore } from "../../stores/activityStore";
import type { ActivityEntry, EntityType } from "../../lib/types";
import { openEntity } from "../../lib/openEntity";

/** Date range preset identifiers. */
type DatePreset = "today" | "week" | "month";

/** Entity type filter options. */
const ENTITY_TYPES = ["all", "note", "task", "plan", "time_entry"] as const;
type EntityTypeFilter = (typeof ENTITY_TYPES)[number];

/** Labels for entity type filter options. */
const ENTITY_TYPE_LABELS: Record<EntityTypeFilter, string> = {
  all: "All Types",
  note: "Notes",
  task: "Tasks",
  plan: "Plans",
  time_entry: "Time Entries",
};

/** Dot color classes for each entity type. */
const ENTITY_DOT_COLORS: Record<string, string> = {
  note: "bg-blue-500",
  task: "bg-green-500",
  plan: "bg-purple-500",
  time_entry: "bg-orange-500",
};

/** Returns ISO date string (YYYY-MM-DD) for the start of a date preset range. */
function getPresetDateFrom(preset: DatePreset): string {
  const now = new Date();
  switch (preset) {
    case "today":
      return formatDateISO(now);
    case "week": {
      const day = now.getDay();
      // getDay() returns 0 for Sunday; shift to Monday-based week
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      return formatDateISO(monday);
    }
    case "month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return formatDateISO(first);
    }
  }
}

/** Formats a Date object as YYYY-MM-DD. */
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Extracts YYYY-MM-DD from an ISO datetime string. */
function extractDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Formats an ISO datetime to a short time string (HH:MM). */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

/** Formats a YYYY-MM-DD date string to a human-readable heading. */
function formatDateHeading(dateStr: string): string {
  const today = formatDateISO(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDateISO(yesterday);

  if (dateStr === today) return "Today";
  if (dateStr === yesterdayStr) return "Yesterday";

  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/** Builds a human-readable action description for an activity entry. */
function describeAction(entry: ActivityEntry): string {
  const title = entry.entity_title || "Untitled";
  switch (entry.action) {
    case "created":
      return `Created ${title}`;
    case "updated":
      return `Updated ${title}`;
    case "deleted":
      return `Deleted ${title}`;
    case "completed":
      return `Completed ${title}`;
    case "archived":
      return `Archived ${title}`;
    case "restored":
      return `Restored ${title}`;
    case "started":
      return `Started ${title}`;
    case "stopped":
      return `Stopped ${title}`;
    case "moved":
      return `Moved ${title}`;
    default:
      return `${entry.action.charAt(0).toUpperCase()}${entry.action.slice(1)} ${title}`;
  }
}

/** Discriminated union for collapsed/single timeline items. */
type TimelineItem =
  | { kind: "single"; entry: ActivityEntry }
  | {
      kind: "collapsed";
      entries: ActivityEntry[];
      entity_id: string;
      entity_title: string;
      action: string;
      entity_type: string;
    };

/** Groups an array of entries by their date (YYYY-MM-DD). */
function groupByDate(
  entries: ActivityEntry[],
): { date: string; entries: ActivityEntry[] }[] {
  const map = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const date = extractDate(entry.created_at);
    const group = map.get(date);
    if (group) {
      group.push(entry);
    } else {
      map.set(date, [entry]);
    }
  }
  // Return groups ordered by date descending (most recent first)
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, entries }));
}

/**
 * Collapses sequential "updated" entries for the same entity into a single
 * collapsed item. Entries are assumed sorted newest-first.
 */
function collapseSequentialUpdates(entries: ActivityEntry[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let buffer: ActivityEntry[] = [];

  function flushBuffer() {
    if (buffer.length === 0) return;
    if (buffer.length === 1) {
      items.push({ kind: "single", entry: buffer[0] });
    } else {
      items.push({
        kind: "collapsed",
        entries: [...buffer],
        entity_id: buffer[0].entity_id,
        entity_title: buffer[0].entity_title || "Untitled",
        action: "updated",
        entity_type: buffer[0].entity_type,
      });
    }
    buffer = [];
  }

  for (const entry of entries) {
    if (entry.action === "updated") {
      if (
        buffer.length > 0 &&
        buffer[0].entity_id === entry.entity_id
      ) {
        buffer.push(entry);
      } else {
        flushBuffer();
        buffer = [entry];
      }
    } else {
      flushBuffer();
      items.push({ kind: "single", entry });
    }
  }
  flushBuffer();
  return items;
}

/** Entity type label for display. */
function entityTypeLabel(type: string): string {
  switch (type) {
    case "note":
      return "Note";
    case "task":
      return "Task";
    case "plan":
      return "Plan";
    case "time_entry":
      return "Time Entry";
    default:
      return type;
  }
}

export default function TimelineView() {
  const entries = useActivityStore((s) => s.entries);
  const isLoading = useActivityStore((s) => s.isLoading);
  const hasMore = useActivityStore((s) => s.hasMore);
  const loadActivity = useActivityStore((s) => s.loadActivity);
  const loadMore = useActivityStore((s) => s.loadMore);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activePreset, setActivePreset] = useState<DatePreset>("week");
  const [activeFilter, setActiveFilter] = useState<EntityTypeFilter>("all");

  // Load initial data
  useEffect(() => {
    loadActivity({
      date_from: getPresetDateFrom("week"),
    });
  }, [loadActivity]);

  /** Reloads entries with the given preset and filter. */
  const reload = useCallback(
    (preset: DatePreset, filter: EntityTypeFilter) => {
      const query: Record<string, unknown> = {
        date_from: getPresetDateFrom(preset),
      };
      if (filter !== "all") {
        query.entity_type = filter;
      }
      loadActivity(query);
    },
    [loadActivity],
  );

  /** Handles a date preset button click. */
  const handlePreset = useCallback(
    (preset: DatePreset) => {
      setActivePreset(preset);
      reload(preset, activeFilter);
    },
    [reload, activeFilter],
  );

  /** Handles an entity type filter change. */
  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const filter = e.target.value as EntityTypeFilter;
      setActiveFilter(filter);
      reload(activePreset, filter);
    },
    [reload, activePreset],
  );

  /** Infinite scroll handler. */
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      loadMore();
    }
  }, [isLoading, hasMore, loadMore]);

  /** Navigates to the entity associated with an activity entry. */
  const handleEntryClick = useCallback(
    (entry: ActivityEntry) => {
      if (entry.action === "deleted") return;
      openEntity({ type: entry.entity_type as EntityType, id: entry.entity_id });
    },
    [],
  );

  const grouped = groupByDate(entries);

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Activity Timeline
        </h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Chronological history of your workspace activity
        </p>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* Date preset buttons */}
          <div className="flex rounded-md border border-gray-200 dark:border-gray-700">
            {(["today", "week", "month"] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => handlePreset(preset)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                  activePreset === preset
                    ? "bg-blue-500 text-white dark:bg-blue-600"
                    : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-750"
                }`}
              >
                {preset === "today"
                  ? "Today"
                  : preset === "week"
                    ? "This Week"
                    : "This Month"}
              </button>
            ))}
          </div>

          {/* Entity type filter */}
          <select
            onChange={handleFilterChange}
            value={activeFilter}
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {ENTITY_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline content */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {/* Initial loading state */}
        {isLoading && entries.length === 0 && (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-3 w-3 flex-shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <svg
              className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No activity found for the selected range.
            </p>
          </div>
        )}

        {/* Grouped timeline entries */}
        {grouped.map((group) => (
          <div key={group.date} className="mb-6">
            {/* Date header */}
            <div className="sticky top-0 z-10 -mx-2 mb-3 flex items-center gap-2 bg-gray-50/95 px-2 py-1 backdrop-blur-sm dark:bg-gray-900/95">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
              <span className="flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {formatDateHeading(group.date)}
              </span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            </div>

            {/* Entries with vertical line */}
            <div className="relative ml-1.5">
              {/* Vertical timeline line */}
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

              {collapseSequentialUpdates(group.entries).map((item, idx) =>
                item.kind === "single" ? (
                  <TimelineEntry
                    key={item.entry.id}
                    entry={item.entry}
                    onClick={handleEntryClick}
                  />
                ) : (
                  <CollapsedTimelineEntry
                    key={`collapsed-${item.entity_id}-${idx}`}
                    item={item}
                    onClick={handleEntryClick}
                  />
                ),
              )}
            </div>
          </div>
        ))}

        {/* Load more / bottom spinner */}
        {isLoading && entries.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <svg
              className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              Loading more...
            </span>
          </div>
        )}

        {/* End-of-list indicator */}
        {!hasMore && entries.length > 0 && (
          <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-600">
            No more activity to show
          </p>
        )}
      </div>
    </div>
  );
}

/** Chevron icon that rotates when expanded. */
function ChevronIcon({ expanded }: { expanded: boolean }): ReactNode {
  return (
    <svg
      className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${
        expanded ? "rotate-180" : ""
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

/** A collapsed group of sequential update entries for the same entity. */
function CollapsedTimelineEntry({
  item,
  onClick,
}: {
  item: Extract<TimelineItem, { kind: "collapsed" }>;
  onClick: (entry: ActivityEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dotColor = ENTITY_DOT_COLORS[item.entity_type] ?? "bg-gray-400";
  const count = item.entries.length;
  // Entries are newest-first; oldest is last
  const newest = item.entries[0];
  const oldest = item.entries[count - 1];
  const timeRange = `${formatTime(oldest.created_at)} – ${formatTime(newest.created_at)}`;

  return (
    <div>
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="relative flex w-full items-start gap-3 rounded-md px-1 py-2 text-left transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/60"
      >
        <div
          className={`relative z-10 mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotColor} ring-2 ring-gray-50 dark:ring-gray-900`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 text-[11px] font-medium text-gray-400 dark:text-gray-500">
              {timeRange}
            </span>
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {entityTypeLabel(item.entity_type)}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">
            Updated {item.entity_title} &middot; {count} edits
          </p>
        </div>
        <div className="mt-1.5">
          <ChevronIcon expanded={expanded} />
        </div>
      </button>

      {/* Expanded sub-entries */}
      {expanded && (
        <div className="ml-4 border-l-2 border-gray-200 pl-2 dark:border-gray-700">
          {item.entries.map((entry) => (
            <TimelineEntry key={entry.id} entry={entry} onClick={onClick} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single timeline entry row. */
function TimelineEntry({
  entry,
  onClick,
}: {
  entry: ActivityEntry;
  onClick: (entry: ActivityEntry) => void;
}) {
  const dotColor = ENTITY_DOT_COLORS[entry.entity_type] ?? "bg-gray-400";
  const isClickable = entry.action !== "deleted";
  const description = describeAction(entry);
  const details = entry.details;

  return (
    <button
      type="button"
      onClick={() => onClick(entry)}
      disabled={!isClickable}
      className={`relative flex w-full items-start gap-3 rounded-md px-1 py-2 text-left transition-colors ${
        isClickable
          ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/60"
          : "cursor-default opacity-70"
      }`}
    >
      {/* Dot on the timeline */}
      <div
        className={`relative z-10 mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotColor} ring-2 ring-gray-50 dark:ring-gray-900`}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {/* Time */}
          <span className="flex-shrink-0 text-[11px] font-medium text-gray-400 dark:text-gray-500">
            {formatTime(entry.created_at)}
          </span>
          {/* Entity type badge */}
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {entityTypeLabel(entry.entity_type)}
          </span>
        </div>
        {/* Action description */}
        <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">
          {description}
        </p>
        {/* Details (if any) */}
        {details && Object.keys(details).length > 0 && (
          <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
            {Object.entries(details)
              .map(([k, v]) => `${k}: ${String(v)}`)
              .join(" \u00B7 ")}
          </p>
        )}
      </div>

      {/* Navigate arrow for clickable entries */}
      {isClickable && (
        <svg
          className="mt-1.5 h-3.5 w-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600"
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
      )}
    </button>
  );
}
