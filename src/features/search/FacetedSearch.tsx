import { useEffect, useCallback, useRef, useState } from "react";
import { useSearchStore } from "../../stores/searchStore";
import type { FacetedSearchResult, SavedFilter, EntityType } from "../../lib/types";
import { openEntity } from "../../lib/openEntity";

/* ------------------------------------------------------------------ */
/*  Inline SVG icon helpers                                            */
/* ------------------------------------------------------------------ */

function NoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

function TaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function PlanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function entityIcon(type: string) {
  const cls = "h-4 w-4 flex-shrink-0";
  switch (type) {
    case "task":
      return <TaskIcon className={cls} />;
    case "plan":
      return <PlanIcon className={cls} />;
    default:
      return <NoteIcon className={cls} />;
  }
}

/* ------------------------------------------------------------------ */
/*  Small helper: relative time                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ENTITY_TYPES = ["note", "task", "plan"];
const STATUSES = ["inbox", "todo", "in_progress", "done", "cancelled"];
const PRIORITIES = ["urgent", "high", "medium", "low", "none"];
const IMPORTANCES = ["critical", "high", "medium", "low"];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "updated_at:desc", label: "Recently updated" },
  { value: "updated_at:asc", label: "Oldest updated" },
  { value: "title:asc", label: "Title A\u2013Z" },
  { value: "title:desc", label: "Title Z\u2013A" },
  { value: "rank:asc", label: "Relevance" },
];

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

/** Faceted search view with sidebar facets, filter chips, and result list. */
export function FacetedSearch() {
  const filter = useSearchStore((s) => s.filter);
  const results = useSearchStore((s) => s.results);
  const facets = useSearchStore((s) => s.facets);
  const totalCount = useSearchStore((s) => s.totalCount);
  const isSearching = useSearchStore((s) => s.isSearching);
  const savedFilters = useSearchStore((s) => s.savedFilters);
  const setFilter = useSearchStore((s) => s.setFilter);
  const clearFilter = useSearchStore((s) => s.clearFilter);
  const search = useSearchStore((s) => s.search);
  const loadSavedFilters = useSearchStore((s) => s.loadSavedFilters);
  const saveCurrentFilter = useSearchStore((s) => s.saveCurrentFilter);
  const applySavedFilter = useSearchStore((s) => s.applySavedFilter);
  const removeSavedFilter = useSearchStore((s) => s.removeSavedFilter);

  const [savedDropdownOpen, setSavedDropdownOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [queryValue, setQueryValue] = useState(filter.query ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved filters on mount
  useEffect(() => {
    loadSavedFilters();
  }, [loadSavedFilters]);

  // Trigger search when filter changes
  useEffect(() => {
    search();
  }, [filter, search]);

  // Debounced text search
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setQueryValue(v);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setFilter({ query: v || undefined });
      }, 300);
    },
    [setFilter],
  );

  // Navigate to entity
  const handleSelectResult = useCallback(
    (result: FacetedSearchResult) => {
      openEntity({ type: result.entity_type as EntityType, id: result.id });
    },
    [],
  );

  // Toggle a value in an array-based filter
  const toggleArrayFilter = useCallback(
    (key: "entity_types" | "tags" | "categories" | "statuses" | "priorities" | "importance", value: string) => {
      const current = filter[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      setFilter({ [key]: next.length > 0 ? next : undefined });
    },
    [filter, setFilter],
  );

  // Remove a single filter chip
  const removeChip = useCallback(
    (key: string, value?: string) => {
      if (key === "query") {
        setFilter({ query: undefined });
        setQueryValue("");
      } else if (key === "date_from" || key === "date_to") {
        setFilter({ [key]: undefined });
      } else if (value) {
        const arr = (filter[key as keyof typeof filter] as string[] | undefined) ?? [];
        const next = arr.filter((v) => v !== value);
        setFilter({ [key]: next.length > 0 ? next : undefined });
      }
    },
    [filter, setFilter],
  );

  // Save current filter
  const handleSaveFilter = useCallback(() => {
    const name = saveFilterName.trim();
    if (!name) return;
    saveCurrentFilter(name);
    setSaveFilterName("");
    setSaveDialogOpen(false);
  }, [saveCurrentFilter, saveFilterName]);

  // Collect active chips
  const chips: { key: string; value: string; label: string }[] = [];
  if (filter.query) {
    chips.push({ key: "query", value: filter.query, label: `"${filter.query}"` });
  }
  for (const type of filter.entity_types ?? []) {
    chips.push({ key: "entity_types", value: type, label: type });
  }
  for (const tag of filter.tags ?? []) {
    chips.push({ key: "tags", value: tag, label: `#${tag}` });
  }
  for (const cat of filter.categories ?? []) {
    chips.push({ key: "categories", value: cat, label: cat });
  }
  for (const status of filter.statuses ?? []) {
    chips.push({ key: "statuses", value: status, label: status.replace("_", " ") });
  }
  for (const priority of filter.priorities ?? []) {
    chips.push({ key: "priorities", value: priority, label: priority });
  }
  for (const imp of filter.importance ?? []) {
    chips.push({ key: "importance", value: imp, label: imp });
  }
  if (filter.date_from) {
    chips.push({ key: "date_from", value: filter.date_from, label: `from ${filter.date_from}` });
  }
  if (filter.date_to) {
    chips.push({ key: "date_to", value: filter.date_to, label: `to ${filter.date_to}` });
  }

  const hasFilters = chips.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex-shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Advanced Search
        </h1>
      </div>
      {/* Top bar: search input + actions */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <svg
          className="h-4 w-4 flex-shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={queryValue}
          onChange={handleQueryChange}
          placeholder="Search across notes, tasks, plans..."
          autoFocus
          className="w-full bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500"
        />

        {/* Filter dropdowns */}
        <FilterDropdown
          label="Type"
          options={ENTITY_TYPES}
          selected={filter.entity_types ?? []}
          onToggle={(v) => toggleArrayFilter("entity_types", v)}
        />
        <FilterDropdown
          label="Status"
          options={STATUSES}
          selected={filter.statuses ?? []}
          onToggle={(v) => toggleArrayFilter("statuses", v)}
          formatLabel={(v) => v.replace("_", " ")}
        />
        <FilterDropdown
          label="Priority"
          options={PRIORITIES}
          selected={filter.priorities ?? []}
          onToggle={(v) => toggleArrayFilter("priorities", v)}
        />
        <FilterDropdown
          label="Importance"
          options={IMPORTANCES}
          selected={filter.importance ?? []}
          onToggle={(v) => toggleArrayFilter("importance", v)}
        />

        {/* Sort */}
        <select
          value={`${filter.sort_by ?? "updated_at"}:${filter.sort_order ?? "desc"}`}
          onChange={(e) => {
            const [sort_by, dir] = e.target.value.split(":");
            setFilter({ sort_by, sort_order: dir as "asc" | "desc" });
          }}
          className="flex-shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Date range */}
        <input
          type="date"
          title="Date from"
          value={filter.date_from ?? ""}
          onChange={(e) => setFilter({ date_from: e.target.value || undefined })}
          className="w-28 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />
        <span className="text-[10px] text-gray-400">to</span>
        <input
          type="date"
          title="Date to"
          value={filter.date_to ?? ""}
          onChange={(e) => setFilter({ date_to: e.target.value || undefined })}
          className="w-28 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
        />

        {/* Save filter */}
        {saveDialogOpen ? (
          <div className="flex flex-shrink-0 items-center gap-1">
            <input
              type="text"
              value={saveFilterName}
              onChange={(e) => setSaveFilterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveFilter();
                if (e.key === "Escape") { setSaveDialogOpen(false); setSaveFilterName(""); }
              }}
              placeholder="Filter name..."
              autoFocus
              className="w-28 rounded-md border border-primary-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary-400 dark:border-primary-700 dark:bg-gray-900 dark:text-gray-200"
            />
            <button
              onClick={handleSaveFilter}
              disabled={!saveFilterName.trim()}
              className="rounded-md bg-primary-500 px-2 py-1 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => { setSaveDialogOpen(false); setSaveFilterName(""); }}
              className="px-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              &times;
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSaveDialogOpen(true)}
            disabled={!hasFilters}
            title="Save current filter"
            className="flex-shrink-0 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Save
          </button>
        )}

        {/* Saved filters dropdown */}
        <div className="relative">
          <button
            onClick={() => setSavedDropdownOpen(!savedDropdownOpen)}
            title="Saved filters"
            className="flex-shrink-0 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </button>
          {savedDropdownOpen && (
            <SavedFiltersDropdown
              filters={savedFilters}
              onApply={(f) => {
                applySavedFilter(f);
                setQueryValue(f.filter_config.query ?? "");
                setSavedDropdownOpen(false);
              }}
              onRemove={removeSavedFilter}
              onClose={() => setSavedDropdownOpen(false)}
            />
          )}
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              clearFilter();
              setQueryValue("");
            }}
            className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-1.5 dark:border-gray-800/50">
          {chips.map((chip, i) => (
            <span
              key={`${chip.key}-${chip.value}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              {chip.label}
              <button
                onClick={() => removeChip(chip.key, chip.key === "query" || chip.key === "date_from" || chip.key === "date_to" ? undefined : chip.value)}
                className="ml-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          <span className="text-[10px] text-gray-400">
            {totalCount} result{totalCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Main content: facet sidebar + results */}
      <div className="flex flex-1 overflow-hidden">
        {/* Facet sidebar */}
        <div className="w-[200px] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
          {facets && (
            <div className="p-3 text-xs">
              <FacetSection
                title="Type"
                counts={facets.entity_type_counts}
                selected={filter.entity_types ?? []}
                onToggle={(v) => toggleArrayFilter("entity_types", v)}
              />
              <FacetSection
                title="Status"
                counts={facets.status_counts}
                selected={filter.statuses ?? []}
                onToggle={(v) => toggleArrayFilter("statuses", v)}
                formatLabel={(v) => v.replace("_", " ")}
              />
              <FacetSection
                title="Priority"
                counts={facets.priority_counts}
                selected={filter.priorities ?? []}
                onToggle={(v) => toggleArrayFilter("priorities", v)}
              />
              <FacetSection
                title="Importance"
                counts={facets.importance_counts}
                selected={filter.importance ?? []}
                onToggle={(v) => toggleArrayFilter("importance", v)}
              />
              <FacetSection
                title="Category"
                counts={facets.category_counts}
                selected={filter.categories ?? []}
                onToggle={(v) => toggleArrayFilter("categories", v)}
              />
              <FacetSection
                title="Tag"
                counts={facets.tag_counts}
                selected={filter.tags ?? []}
                onToggle={(v) => toggleArrayFilter("tags", v)}
                prefix="#"
              />
            </div>
          )}
          {!facets && !isSearching && (
            <div className="p-4 text-center text-xs text-gray-400 dark:text-gray-500">
              Enter a search or select filters to see facets
            </div>
          )}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {isSearching && (
            <div className="p-4 text-center text-sm text-gray-400">Searching...</div>
          )}

          {!isSearching && results.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {hasFilters ? "No results match your filters" : "Start typing or select filters to search"}
              </p>
            </div>
          )}

          {!isSearching &&
            results.map((result) => (
              <ResultRow
                key={`${result.entity_type}-${result.id}`}
                result={result}
                onClick={() => handleSelectResult(result)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Dropdown                                                    */
/* ------------------------------------------------------------------ */

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  formatLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  formatLabel?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hasSelection = selected.length > 0;
  const fmt = formatLabel ?? ((v: string) => v);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex-shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
          hasSelection
            ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
            : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        }`}
      >
        {label}
        {hasSelection && (
          <span className="ml-1 rounded-full bg-primary-200 px-1 text-[10px] dark:bg-primary-800">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {options.map((opt) => {
            const isActive = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => onToggle(opt)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  isActive
                    ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50"
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                    isActive
                      ? "border-primary-500 bg-primary-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {isActive && (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="capitalize">{fmt(opt)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Facet sidebar section                                              */
/* ------------------------------------------------------------------ */

function FacetSection({
  title,
  counts,
  selected,
  onToggle,
  formatLabel,
  prefix,
}: {
  title: string;
  counts: Record<string, number>;
  selected: string[];
  onToggle: (value: string) => void;
  formatLabel?: (value: string) => string;
  prefix?: string;
}) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  const fmt = formatLabel ?? ((v: string) => v);

  return (
    <div className="mb-3">
      <h4 className="mb-1 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h4>
      <ul className="space-y-0.5">
        {entries.map(([value, count]) => {
          const isActive = selected.includes(value);
          return (
            <li key={value}>
              <button
                onClick={() => onToggle(value)}
                className={`flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left transition-colors ${
                  isActive
                    ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                }`}
              >
                <span className="truncate capitalize">
                  {prefix ?? ""}{fmt(value)}
                </span>
                <span className="ml-2 flex-shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single result row                                                  */
/* ------------------------------------------------------------------ */

function ResultRow({
  result,
  onClick,
}: {
  result: FacetedSearchResult;
  onClick: () => void;
}) {
  const snippet = result.snippet ? sanitizeSnippet(result.snippet) : null;

  return (
    <button
      onClick={onClick}
      className="w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-gray-900/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`${
              result.entity_type === "task"
                ? "text-amber-500 dark:text-amber-400"
                : result.entity_type === "plan"
                  ? "text-violet-500 dark:text-violet-400"
                  : "text-blue-500 dark:text-blue-400"
            }`}
          >
            {entityIcon(result.entity_type)}
          </span>
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {result.title || "Untitled"}
          </h3>
          {result.status && (
            <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {result.status.replace("_", " ")}
            </span>
          )}
          {result.priority && result.priority !== "none" && (
            <span className={`text-[10px] font-medium uppercase ${priorityColor(result.priority)}`}>
              {result.priority}
            </span>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {result.folder && (
            <span className="text-[10px] text-gray-400">{result.folder}</span>
          )}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {relativeTime(result.updated_at)}
          </span>
        </div>
      </div>

      {snippet && (
        <p
          className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400 [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-0.5 dark:[&_mark]:bg-yellow-700/60"
          dangerouslySetInnerHTML={{ __html: snippet }}
        />
      )}

      {/* Tags and metadata row */}
      {(result.tags.length > 0 || result.category || result.importance) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {result.category && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {result.category}
            </span>
          )}
          {result.importance && (
            <span className={`text-[10px] font-medium ${importanceColor(result.importance)}`}>
              {result.importance}
            </span>
          )}
          {result.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] text-blue-500 dark:text-blue-400"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Saved filters dropdown                                             */
/* ------------------------------------------------------------------ */

function SavedFiltersDropdown({
  filters,
  onApply,
  onRemove,
  onClose,
}: {
  filters: SavedFilter[];
  onApply: (filter: SavedFilter) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
    >
      {filters.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
          No saved filters
        </div>
      ) : (
        filters.map((f) => (
          <div
            key={f.id}
            className="group flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <button
              onClick={() => onApply(f)}
              className="flex-1 text-left text-xs text-gray-700 dark:text-gray-300"
              title={f.description ?? undefined}
            >
              {f.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(f.id);
              }}
              className="hidden text-gray-400 hover:text-red-500 group-hover:block dark:hover:text-red-400"
              title="Delete saved filter"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

/** Strips all HTML except <mark> tags to prevent XSS from stored content. */
function sanitizeSnippet(snippet: string): string {
  // Replace allowed <mark> and </mark> with placeholders, strip all other tags, then restore
  return snippet
    .replace(/<mark>/gi, "___MARK_OPEN___")
    .replace(/<\/mark>/gi, "___MARK_CLOSE___")
    .replace(/<[^>]*>/g, "")
    .replace(/___MARK_OPEN___/g, "<mark>")
    .replace(/___MARK_CLOSE___/g, "</mark>");
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "urgent":
      return "text-red-500 dark:text-red-400";
    case "high":
      return "text-orange-500 dark:text-orange-400";
    case "medium":
      return "text-yellow-600 dark:text-yellow-400";
    case "low":
      return "text-blue-400 dark:text-blue-300";
    default:
      return "text-gray-400";
  }
}

function importanceColor(importance: string): string {
  switch (importance) {
    case "critical":
      return "text-red-500 dark:text-red-400";
    case "high":
      return "text-orange-500 dark:text-orange-400";
    case "medium":
      return "text-yellow-600 dark:text-yellow-400";
    case "low":
      return "text-blue-400 dark:text-blue-300";
    default:
      return "text-gray-400";
  }
}
