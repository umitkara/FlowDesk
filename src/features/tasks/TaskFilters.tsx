import { useTaskStore } from "../../stores/taskStore";
import type { TaskStatus, TaskPriority } from "../../lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "../../lib/types";

/** Filter bar for task list and board views. */
export function TaskFilters() {
  const filter = useTaskStore((s) => s.filter);
  const setFilter = useTaskStore((s) => s.setFilter);
  const viewMode = useTaskStore((s) => s.viewMode);
  const setViewMode = useTaskStore((s) => s.setViewMode);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "") {
      const { status: _, ...rest } = filter;
      setFilter(rest);
    } else {
      setFilter({ ...filter, status: [value as TaskStatus] });
    }
  };

  const handlePriorityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "") {
      const { priority: _, ...rest } = filter;
      setFilter(rest);
    } else {
      setFilter({ ...filter, priority: [value as TaskPriority] });
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (value === "") {
      const { category: _, ...rest } = filter;
      setFilter(rest);
    } else {
      setFilter({ ...filter, category: value });
    }
  };

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (value === "") {
      const { tag: _, ...rest } = filter;
      setFilter(rest);
    } else {
      setFilter({ ...filter, tag: value });
    }
  };

  const handleDueAfterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") {
      const { due_after: _, ...rest } = filter;
      setFilter(rest);
    } else {
      setFilter({ ...filter, due_after: value });
    }
  };

  const handleDueBeforeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "") {
      const { due_before: _, ...rest } = filter;
      setFilter(rest);
    } else {
      setFilter({ ...filter, due_before: value });
    }
  };

  const handleStickyToggle = () => {
    if (filter.is_sticky) {
      const { is_sticky: _, ...rest } = filter;
      setFilter(rest);
    } else {
      setFilter({ ...filter, is_sticky: true });
    }
  };

  const clearFilters = () => setFilter({});

  const hasFilters =
    filter.status ||
    filter.priority ||
    filter.category ||
    filter.tag ||
    filter.due_after ||
    filter.due_before ||
    filter.is_sticky;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
      <select
        value={filter.status?.[0] ?? ""}
        onChange={handleStatusChange}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      >
        <option value="">All Statuses</option>
        {(Object.entries(STATUS_CONFIG) as [TaskStatus, (typeof STATUS_CONFIG)[TaskStatus]][]).map(
          ([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ),
        )}
      </select>

      <select
        value={filter.priority?.[0] ?? ""}
        onChange={handlePriorityChange}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      >
        <option value="">All Priorities</option>
        {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, (typeof PRIORITY_CONFIG)[TaskPriority]][]).map(
          ([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ),
        )}
      </select>

      <input
        type="text"
        placeholder="Category..."
        value={filter.category ?? ""}
        onChange={handleCategoryChange}
        className="w-24 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      />

      <input
        type="text"
        placeholder="Tag..."
        value={filter.tag ?? ""}
        onChange={handleTagChange}
        className="w-20 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      />

      <input
        type="date"
        title="Due after"
        value={filter.due_after ?? ""}
        onChange={handleDueAfterChange}
        className="w-28 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      />
      <span className="text-[10px] text-gray-400">to</span>
      <input
        type="date"
        title="Due before"
        value={filter.due_before ?? ""}
        onChange={handleDueBeforeChange}
        className="w-28 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      />

      <button
        onClick={handleStickyToggle}
        title="Sticky tasks only"
        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          filter.is_sticky
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        }`}
      >
        📌 Sticky
      </button>

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Clear filters
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => setViewMode("list")}
          className={`rounded-md p-1 ${viewMode === "list" ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
          title="List view"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={() => setViewMode("board")}
          className={`rounded-md p-1 ${viewMode === "board" ? "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
          title="Board view"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
