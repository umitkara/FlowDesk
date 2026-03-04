import { useCallback, useMemo } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboard";
import { NoteEditor } from "../../features/notes/NoteEditor";
import { NoteList } from "../../features/notes/NoteList";
import { QuickSwitcher } from "../../features/notes/QuickSwitcher";
import { SearchResults } from "../../features/search/SearchResults";
import { SettingsPanel } from "../../features/settings/SettingsPanel";
import { TrashView } from "../../features/notes/TrashView";
import { todayISO } from "../../lib/utils";

/** Root layout container with sidebar, main content, and status bar. */
export function AppShell() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const toggleQuickSwitcher = useUIStore((s) => s.toggleQuickSwitcher);
  const quickSwitcherOpen = useUIStore((s) => s.quickSwitcherOpen);
  const goBack = useUIStore((s) => s.goBack);
  const goForward = useUIStore((s) => s.goForward);
  const activeNote = useNoteStore((s) => s.activeNote);
  const createNote = useNoteStore((s) => s.createNote);
  const selectNote = useNoteStore((s) => s.selectNote);
  const openDailyNote = useNoteStore((s) => s.openDailyNote);

  const handleNewNote = useCallback(async () => {
    const note = await createNote({
      workspace_id: "",
      title: "Untitled",
    });
    await selectNote(note.id);
    setActiveView("notes");
  }, [createNote, selectNote, setActiveView]);

  const handleBack = useCallback(() => {
    const noteId = goBack();
    if (noteId) selectNote(noteId);
  }, [goBack, selectNote]);

  const handleForward = useCallback(() => {
    const noteId = goForward();
    if (noteId) selectNote(noteId);
  }, [goForward, selectNote]);

  const shortcuts = useMemo(
    () => [
      { key: "n", ctrl: true, handler: handleNewNote },
      { key: "p", ctrl: true, handler: toggleQuickSwitcher },
      {
        key: "f",
        ctrl: true,
        shift: true,
        handler: () => setActiveView("search"),
      },
      {
        key: "d",
        ctrl: true,
        shift: true,
        handler: () => openDailyNote(todayISO()),
      },
      { key: "ArrowLeft", alt: true, handler: handleBack },
      { key: "ArrowRight", alt: true, handler: handleForward },
      { key: ",", ctrl: true, handler: () => setActiveView("settings") },
    ],
    [
      handleNewNote,
      toggleQuickSwitcher,
      setActiveView,
      openDailyNote,
      handleBack,
      handleForward,
    ],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div
            className="flex-shrink-0 border-r border-gray-200 dark:border-gray-800"
            style={{ width: sidebarWidth }}
          >
            <Sidebar />
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Note list panel */}
          {activeView === "notes" && (
            <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800">
              <NoteList />
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 overflow-auto">
            {activeView === "notes" && activeNote && (
              <NoteEditor />
            )}
            {activeView === "notes" && !activeNote && (
              <div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-600">
                <div className="text-center">
                  <div className="mb-2 text-4xl">
                    <span role="img" aria-label="notebook">&#128211;</span>
                  </div>
                  <p className="text-lg font-medium">No note selected</p>
                  <p className="mt-1 text-sm">
                    Select a note from the list or press{" "}
                    <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono dark:bg-gray-800">
                      Ctrl+N
                    </kbd>{" "}
                    to create one
                  </p>
                </div>
              </div>
            )}
            {activeView === "search" && <SearchResults />}
            {activeView === "settings" && <SettingsPanel />}
            {activeView === "trash" && <TrashView />}
          </div>
        </div>
      </div>

      <StatusBar />

      {quickSwitcherOpen && <QuickSwitcher />}
    </div>
  );
}
