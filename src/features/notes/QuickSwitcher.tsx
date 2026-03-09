import { useState, useEffect, useCallback, useRef } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import * as ipc from "../../lib/ipc";

interface QuickSwitcherResult {
  id: string;
  title: string | null;
  folder: string | null;
  snippet: string | null;
  updated_at: string;
}

/** Quick note switcher overlay (Ctrl+P). */
export function QuickSwitcher() {
  const toggleQuickSwitcher = useUIStore((s) => s.toggleQuickSwitcher);
  const notes = useNoteStore((s) => s.notes);
  const selectNote = useNoteStore((s) => s.selectNote);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [results, setResults] = useState<QuickSwitcherResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Show store notes when query is short; search backend when >= 2 chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setResults(
        notes.slice(0, 10).map((n) => ({
          id: n.id,
          title: n.title,
          folder: n.folder,
          snippet: n.preview || null,
          updated_at: n.updated_at,
        })),
      );
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const searchResults = await ipc.searchEntities({
          workspace_id: activeWorkspaceId ?? "",
          query,
          entity_types: ["note"],
          limit: 20,
        });
        setResults(
          searchResults.map((r) => ({
            id: r.id,
            title: r.title,
            folder: r.folder,
            snippet: r.snippet || null,
            updated_at: r.updated_at,
          })),
        );
      } catch {
        // Fallback to in-memory filter
        const q = query.toLowerCase();
        setResults(
          notes
            .filter(
              (n) =>
                (n.title ?? "").toLowerCase().includes(q) ||
                n.preview.toLowerCase().includes(q),
            )
            .slice(0, 20)
            .map((n) => ({
              id: n.id,
              title: n.title,
              folder: n.folder,
              snippet: n.preview || null,
              updated_at: n.updated_at,
            })),
        );
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, notes, activeWorkspaceId]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleSelect = useCallback(
    (id: string) => {
      selectNote(id);
      navigateTo(id);
      setActiveView("notes");
      toggleQuickSwitcher();
    },
    [selectNote, navigateTo, setActiveView, toggleQuickSwitcher],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        toggleQuickSwitcher();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        handleSelect(results[selectedIndex].id);
      }
    },
    [results, selectedIndex, handleSelect, toggleQuickSwitcher],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50"
        onClick={toggleQuickSwitcher}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* Search input */}
        <div className="flex items-center border-b border-gray-200 px-4 dark:border-gray-700">
          <svg className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes..."
            className="w-full bg-transparent py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200 dark:placeholder:text-gray-500"
          />
          {isSearching && (
            <span className="ml-2 text-xs text-gray-400">...</span>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && !isSearching && (
            <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              No notes found
            </div>
          )}
          {results.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                index === selectedIndex
                  ? "bg-primary-50 dark:bg-primary-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {item.title || "Untitled"}
                </div>
                {item.folder && (
                  <div className="truncate text-xs text-gray-400 dark:text-gray-500">
                    {item.folder}
                  </div>
                )}
              </div>
              {item.updated_at && (
                <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {item.updated_at.slice(0, 10)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="border-t border-gray-200 px-4 py-1.5 text-[10px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
          <span className="mr-3">
            <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">&#8593;&#8595;</kbd>{" "}
            navigate
          </span>
          <span className="mr-3">
            <kbd className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">&#9166;</kbd>{" "}
            open
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
