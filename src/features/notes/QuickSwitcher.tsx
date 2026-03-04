import { useState, useEffect, useCallback, useRef } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import type { NoteListItem } from "../../lib/types";

/** Quick note switcher overlay (Ctrl+P). */
export function QuickSwitcher() {
  const toggleQuickSwitcher = useUIStore((s) => s.toggleQuickSwitcher);
  const notes = useNoteStore((s) => s.notes);
  const selectNote = useNoteStore((s) => s.selectNote);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered: NoteListItem[] = query
    ? notes.filter(
        (n) =>
          (n.title ?? "").toLowerCase().includes(query.toLowerCase()) ||
          n.preview.toLowerCase().includes(query.toLowerCase()),
      )
    : notes.slice(0, 10);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

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
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex].id);
      }
    },
    [filtered, selectedIndex, handleSelect, toggleQuickSwitcher],
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
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
              No notes found
            </div>
          )}
          {filtered.map((note, index) => (
            <button
              key={note.id}
              onClick={() => handleSelect(note.id)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                index === selectedIndex
                  ? "bg-primary-50 dark:bg-primary-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                  {note.title || "Untitled"}
                </div>
                {note.folder && (
                  <div className="truncate text-xs text-gray-400 dark:text-gray-500">
                    {note.folder}
                  </div>
                )}
              </div>
              {note.date && (
                <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {note.date}
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
