import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useCommandPaletteStore } from "../../stores/commandPaletteStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { usePlanStore } from "../../stores/planStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { searchEntities } from "../../lib/ipc";
import { filterCommands } from "./fuzzyMatch";
import type { SearchResult } from "../../lib/types";
import { STATUS_CONFIG } from "../../lib/types";

type ResultItem =
  | { kind: "command"; id: string; title: string; category: string; shortcut?: string; handler: () => void }
  | { kind: "entity"; result: SearchResult };

/** Unified command palette — searches commands, notes, tasks, and plans. */
export function CommandPalette() {
  const isOpen = useUIStore((s) => s.commandPaletteOpen);
  const toggle = useUIStore((s) => s.toggleCommandPalette);
  const commands = useCommandPaletteStore((s) => s.commands);
  const selectNote = useNoteStore((s) => s.selectNote);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const openTaskDetail = useTaskStore((s) => s.openDetail);
  const fetchPlanWithLinks = usePlanStore((s) => s.fetchPlanWithLinks);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setSearchResults([]);
      setIsSearching(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced backend FTS search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let cancelled = false;

    timerRef.current = setTimeout(() => {
      const wsId = useWorkspaceStore.getState().activeWorkspaceId;
      if (!wsId || cancelled) {
        setIsSearching(false);
        return;
      }
      searchEntities({ workspace_id: wsId, query: trimmed })
        .then((res) => {
          if (!cancelled) setSearchResults(res);
        })
        .catch((err) => {
          console.error("[CommandPalette] search failed:", err);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // Build merged results: commands (instant) + search results (async)
  const results = useMemo<ResultItem[]>(() => {
    const matchedCmds = filterCommands(commands, query, 30).map(
      (cmd): ResultItem => ({ kind: "command", ...cmd }),
    );

    const entityItems: ResultItem[] = searchResults.map(
      (result): ResultItem => ({ kind: "entity", result }),
    );

    return [...matchedCmds, ...entityItems];
  }, [commands, query, searchResults]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const execute = useCallback(
    async (item: ResultItem) => {
      toggle();
      if (item.kind === "command") {
        item.handler();
      } else {
        const { result } = item;
        if (result.entity_type === "task") {
          setActiveView("tasks");
          openTaskDetail(result.id);
        } else if (result.entity_type === "plan") {
          setActiveView("plans");
          fetchPlanWithLinks(result.id);
        } else {
          await selectNote(result.id);
          navigateTo(result.id);
          setActiveView("notes");
        }
      }
    },
    [toggle, selectNote, navigateTo, setActiveView, openTaskDetail, fetchPlanWithLinks],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) execute(results[selectedIndex]);
          break;
        case "Escape":
          e.preventDefault();
          toggle();
          break;
      }
    },
    [results, selectedIndex, execute, toggle],
  );

  // Scroll selected into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector(`[data-idx="${selectedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!isOpen) return null;

  // Separate commands and entities
  const commandItems = results.filter((r) => r.kind === "command") as Extract<ResultItem, { kind: "command" }>[];
  const entityItems = results.filter((r) => r.kind === "entity") as Extract<ResultItem, { kind: "entity" }>[];

  // Group commands by category
  const commandGroups: Record<string, typeof commandItems> = {};
  for (const cmd of commandItems) {
    const cat = cmd.category || "General";
    if (!commandGroups[cat]) commandGroups[cat] = [];
    commandGroups[cat].push(cmd);
  }

  // Group entities by type
  const noteResults = entityItems.filter((e) => e.result.entity_type === "note");
  const taskResults = entityItems.filter((e) => e.result.entity_type === "task");
  const planResults = entityItems.filter((e) => e.result.entity_type === "plan");

  const badgeClass = (type: string) =>
    type === "task"
      ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
      : type === "plan"
        ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
        : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";

  let flatIdx = 0;

  const renderEntitySection = (label: string, items: typeof entityItems) => {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {label}
        </div>
        {items.map((item) => {
          const idx = flatIdx++;
          const { result } = item;
          return (
            <button
              key={`${result.entity_type}-${result.id}`}
              data-idx={idx}
              onClick={() => execute(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left ${
                idx === selectedIndex
                  ? "bg-primary-50 dark:bg-primary-900/30"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <span className={`flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase ${badgeClass(result.entity_type)}`}>
                {result.entity_type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {result.title || "Untitled"}
                  </span>
                  {result.entity_type === "task" && typeof result.metadata?.status === "string" && (
                    <span className={`text-[10px] ${STATUS_CONFIG[result.metadata.status as keyof typeof STATUS_CONFIG]?.color ?? "text-gray-400"}`}>
                      {STATUS_CONFIG[result.metadata.status as keyof typeof STATUS_CONFIG]?.label ?? result.metadata.status}
                    </span>
                  )}
                </div>
                {result.snippet && (
                  <p
                    className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={toggle}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search..."
              className="flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200"
            />
            {isSearching && (
              <span className="text-[10px] text-gray-400">searching...</span>
            )}
            <kbd className="hidden rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:inline dark:bg-gray-800 dark:text-gray-400">
              ESC
            </kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {query ? (isSearching ? "Searching..." : "No results found") : "Type to search..."}
            </div>
          ) : (
            <>
              {/* Command groups */}
              {Object.entries(commandGroups).map(([category, cmds]) => (
                <div key={category}>
                  <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {category}
                  </div>
                  {cmds.map((cmd) => {
                    const idx = flatIdx++;
                    return (
                      <button
                        key={cmd.id}
                        data-idx={idx}
                        onClick={() => execute(cmd)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                          idx === selectedIndex
                            ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                            : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                        }`}
                      >
                        <span>{cmd.title}</span>
                        {cmd.shortcut && (
                          <kbd className="ml-4 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Entity results grouped by type */}
              {renderEntitySection("Notes", noteResults)}
              {renderEntitySection("Tasks", taskResults)}
              {renderEntitySection("Plans", planResults)}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-4 py-1.5 text-[10px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
          <span className="mr-3">
            <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">&uarr;&darr;</kbd>{" "}
            navigate
          </span>
          <span className="mr-3">
            <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">&crarr;</kbd>{" "}
            select
          </span>
          <span>
            <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">esc</kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
