import { useState, useEffect, useCallback } from "react";
import * as ipc from "../../lib/ipc";
import type { GroupedViewResult, GroupEntry, FacetedSearchResult, EntityType } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { openEntity } from "../../lib/openEntity";

/** Group-by field options per entity type. */
const GROUP_BY_OPTIONS: Record<string, { value: string; label: string }[]> = {
  note: [
    { value: "category", label: "Category" },
    { value: "note_type", label: "Note Type" },
    { value: "importance", label: "Importance" },
    { value: "folder", label: "Folder" },
  ],
  task: [
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    { value: "category", label: "Category" },
  ],
  plan: [
    { value: "type", label: "Type" },
    { value: "category", label: "Category" },
    { value: "importance", label: "Importance" },
  ],
};

/** Entity type selector options. */
const ENTITY_TYPES = [
  { value: "note", label: "Notes" },
  { value: "task", label: "Tasks" },
  { value: "plan", label: "Plans" },
];

/** Returns a relative time string like "2h ago". */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Grouped entity view with collapsible accordion sections. */
export default function GroupedView() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [entityType, setEntityType] = useState("note");
  const [groupBy, setGroupBy] = useState("category");
  const [result, setResult] = useState<GroupedViewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  /** Fetch grouped data from the backend. */
  const fetchGrouped = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const data = await ipc.getGroupedView(activeWorkspaceId, entityType, groupBy);
      setResult(data);
      // Expand all groups by default
      setExpandedGroups(new Set(data.groups.map((g) => g.key)));
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, entityType, groupBy]);

  useEffect(() => {
    fetchGrouped();
  }, [fetchGrouped]);

  /** Reset group-by to first option when entity type changes. */
  const handleEntityTypeChange = useCallback((newType: string) => {
    setEntityType(newType);
    const options = GROUP_BY_OPTIONS[newType];
    if (options && options.length > 0) {
      setGroupBy(options[0].value);
    }
  }, []);

  /** Toggle a group's expanded/collapsed state. */
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /** Navigate to an entity when clicked. */
  const handleItemClick = useCallback(
    (item: FacetedSearchResult) => {
      openEntity({ type: item.entity_type as EntityType, id: item.id });
    },
    [],
  );

  const groupByOptions = GROUP_BY_OPTIONS[entityType] ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header with selectors */}
      <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h1 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Grouped View
        </h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Type</span>
            <select
              value={entityType}
              onChange={(e) => handleEntityTypeChange(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              {ENTITY_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">Group by</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              {groupByOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="mb-2 h-8 rounded bg-gray-100 dark:bg-gray-800" />
                <div className="ml-4 space-y-1.5">
                  <div className="h-5 w-3/4 rounded bg-gray-50 dark:bg-gray-800/50" />
                  <div className="h-5 w-1/2 rounded bg-gray-50 dark:bg-gray-800/50" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && result && result.groups.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <svg className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No items found
            </p>
          </div>
        )}

        {!loading && result && result.groups.length > 0 && (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {result.groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                expanded={expandedGroups.has(group.key)}
                onToggle={() => toggleGroup(group.key)}
                onItemClick={handleItemClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A single collapsible group section. */
function GroupSection({
  group,
  expanded,
  onToggle,
  onItemClick,
}: {
  group: GroupEntry;
  expanded: boolean;
  onToggle: () => void;
  onItemClick: (item: FacetedSearchResult) => void;
}) {
  return (
    <div>
      {/* Group header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
      >
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {group.key || "(none)"}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          {group.count}
        </span>
      </button>

      {/* Group items */}
      {expanded && (
        <div className="pb-1">
          {group.items.map((item) => (
            <GroupItem key={item.id} item={item} onClick={() => onItemClick(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single clickable item within a group. */
function GroupItem({
  item,
  onClick,
}: {
  item: FacetedSearchResult;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 px-4 py-1.5 pl-9 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50"
    >
      <div className="flex min-w-0 items-center gap-2">
        <EntityBadge type={item.entity_type} />
        <span className="truncate text-sm text-gray-700 dark:text-gray-300">
          {item.title || "Untitled"}
        </span>
        {item.status && (
          <span className="flex-shrink-0 text-[10px] font-medium uppercase text-gray-400">
            {item.status.replace("_", " ")}
          </span>
        )}
        {item.priority && item.priority !== "none" && (
          <PriorityDot priority={item.priority} />
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {item.folder && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {item.folder}
          </span>
        )}
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {relativeTime(item.updated_at)}
        </span>
      </div>
    </button>
  );
}

/** Tiny colored badge indicating the entity type. */
function EntityBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    note: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    task: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    plan: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  };
  return (
    <span
      className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${styles[type] ?? "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"}`}
    >
      {type}
    </span>
  );
}

/** Priority indicator dot. */
function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-400",
    none: "bg-gray-300 dark:bg-gray-600",
  };
  return (
    <span
      className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${colors[priority] ?? colors.none}`}
      title={priority}
    />
  );
}
