import { useState, useCallback } from "react";
import { SearchBar } from "./SearchBar";
import { searchNotes } from "../../lib/ipc";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { useTaskStore } from "../../stores/taskStore";
import type { SearchResult } from "../../lib/types";
import { STATUS_CONFIG } from "../../lib/types";
import { listWorkspaces } from "../../lib/ipc";

/** Full-text search view with results display. */
export function SearchResults() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const selectNote = useNoteStore((s) => s.selectNote);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const openDetail = useTaskStore((s) => s.openDetail);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    try {
      const workspaces = await listWorkspaces();
      if (workspaces.length === 0) return;
      const res = await searchNotes({
        workspace_id: workspaces[0].id,
        query,
      });
      setResults(res);
      setHasSearched(true);
    } catch {
      // silently fail
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSelectResult = useCallback(
    async (result: SearchResult) => {
      if (result.entity_type === "task") {
        setActiveView("tasks");
        openDetail(result.id);
      } else {
        await selectNote(result.id);
        navigateTo(result.id);
        setActiveView("notes");
      }
    },
    [selectNote, navigateTo, setActiveView, openDetail],
  );

  return (
    <div className="flex h-full flex-col">
      <SearchBar onSearch={handleSearch} />

      <div className="flex-1 overflow-y-auto">
        {isSearching && (
          <div className="p-4 text-center text-sm text-gray-400">
            Searching...
          </div>
        )}
        {!isSearching && hasSearched && results.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No results found
            </p>
          </div>
        )}
        {results.map((result) => (
          <button
            key={`${result.entity_type}-${result.id}`}
            onClick={() => handleSelectResult(result)}
            className="w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-gray-900/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded px-1 py-0.5 text-[9px] font-medium uppercase ${
                    result.entity_type === "task"
                      ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  }`}
                >
                  {result.entity_type}
                </span>
                <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {result.title || "Untitled"}
                </h3>
                {result.entity_type === "task" && typeof result.metadata?.status === "string" ? (
                  <span className={`text-[10px] ${STATUS_CONFIG[result.metadata.status as keyof typeof STATUS_CONFIG]?.color ?? "text-gray-400"}`}>
                    {STATUS_CONFIG[result.metadata.status as keyof typeof STATUS_CONFIG]?.label ?? result.metadata.status}
                  </span>
                ) : null}
              </div>
              {result.folder && (
                <span className="flex-shrink-0 text-[10px] text-gray-400">
                  {result.folder}
                </span>
              )}
            </div>
            <p
              className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400"
              dangerouslySetInnerHTML={{ __html: result.snippet }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
