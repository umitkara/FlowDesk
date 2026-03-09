import { useEffect } from "react";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { FolderTree } from "../../features/notes/FolderTree";
import { DailyCalendar } from "../../features/notes/DailyCalendar";
import { PlanMiniCalendar } from "../../features/plans/PlanMiniCalendar";
import { WorkspaceSwitcher } from "../../features/workspaces/WorkspaceSwitcher";
import { todayISO } from "../../lib/utils";

const activeClass =
  "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300";
const inactiveClass =
  "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800";

const SECONDARY_VIEWS = [
  "time-reports",
  "planned-vs-actual",
  "faceted-search",
  "graph",
  "timeline",
  "grouped",
  "templates",
  "import-wizard",
  "trash",
] as const;

/** Left sidebar with workspace info, primary navigation, and collapsible secondary sections. */
export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const secondaryExpanded = useUIStore((s) => s.sidebarSecondaryExpanded);
  const toggleSecondary = useUIStore((s) => s.toggleSidebarSecondary);
  const setFolder = useNoteStore((s) => s.setFolder);
  const currentFolder = useNoteStore((s) => s.currentFolder);
  const openDailyNote = useNoteStore((s) => s.openDailyNote);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const folderTree = useNoteStore((s) => s.folderTree);
  const loadFolderTree = useNoteStore((s) => s.loadFolderTree);

  useEffect(() => {
    loadFolderTree();
  }, [loadFolderTree]);

  const isSecondaryView = (SECONDARY_VIEWS as readonly string[]).includes(activeView);
  const showSecondary = secondaryExpanded || isSecondaryView;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Workspace Switcher */}
      <WorkspaceSwitcher />

      {/* Scrollable middle section */}
      <div className="flex-1 overflow-y-auto">
        {/* Primary navigation */}
        <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
          {/* Today */}
          <button
            onClick={() => setActiveView("dashboard")}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
              activeView === "dashboard" ? activeClass : inactiveClass
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Today
          </button>

          {/* Notes */}
          <button
            onClick={() => {
              setFolder(null);
              loadNotes({});
              setActiveView("notes");
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
              activeView === "notes" ? activeClass : inactiveClass
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Notes
          </button>

          {/* Notes sub-items (contextual) */}
          {activeView === "notes" && (
            <div className="space-y-0.5 pl-8">
              <button
                onClick={() => {
                  setFolder(null);
                  loadNotes({});
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
                  !currentFolder ? "text-primary-600 dark:text-primary-400" : inactiveClass
                }`}
              >
                All Notes
              </button>
              <button
                onClick={() => {
                  setFolder(null);
                  loadNotes({ note_type: "journal" });
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${inactiveClass}`}
              >
                Daily Notes
              </button>
              <button
                onClick={() => {
                  setFolder(null);
                  loadNotes({});
                  openDailyNote(todayISO());
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${inactiveClass}`}
              >
                Today&apos;s Note
              </button>
            </div>
          )}

          {/* Tasks */}
          <button
            onClick={() => setActiveView("tasks")}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
              activeView === "tasks" ? activeClass : inactiveClass
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Tasks
          </button>

          {/* Daily Plan */}
          <button
            onClick={() => setActiveView("daily-plan")}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
              activeView === "daily-plan" ? activeClass : inactiveClass
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Daily Plan
          </button>

          {/* Calendar */}
          <button
            onClick={() => setActiveView("plans")}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
              activeView === "plans" ? activeClass : inactiveClass
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Calendar
          </button>
        </div>

        {/* Secondary toggle */}
        <div className="border-b border-gray-200 px-2 py-1.5 dark:border-gray-800">
          <button
            onClick={toggleSecondary}
            className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-xs font-medium text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <svg
              className={`h-3 w-3 transition-transform ${showSecondary ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            More
          </button>
        </div>

        {/* Secondary groups */}
        {showSecondary && (
          <>
            {/* Analytics */}
            <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
              <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Analytics
              </div>
              <button
                onClick={() => setActiveView("time-reports")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "time-reports" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Time Reports
              </button>
              <button
                onClick={() => setActiveView("planned-vs-actual")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "planned-vs-actual" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Plan vs Actual
              </button>
            </div>

            {/* Discovery */}
            <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
              <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Discovery
              </div>
              <button
                onClick={() => setActiveView("faceted-search")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "faceted-search" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Advanced Search
              </button>
              <button
                onClick={() => setActiveView("graph")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "graph" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Graph
              </button>
              <button
                onClick={() => setActiveView("timeline")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "timeline" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Timeline
              </button>
              <button
                onClick={() => setActiveView("grouped")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "grouped" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Grouped View
              </button>
            </div>

            {/* Tools */}
            <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
              <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Tools
              </div>
              <button
                onClick={() => setActiveView("templates")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "templates" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Templates
              </button>
              <button
                onClick={() => setActiveView("import-wizard")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "import-wizard" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import
              </button>
              <button
                onClick={() => setActiveView("trash")}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                  activeView === "trash" ? activeClass : inactiveClass
                }`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Trash
              </button>
            </div>
          </>
        )}

        {/* Folder tree (only in notes view) */}
        {activeView === "notes" && (
          <div className="px-2 py-2">
            <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Folders
            </div>
            <FolderTree
              tree={folderTree}
              selectedFolder={currentFolder}
              onSelect={(path) => {
                setFolder(path);
                setActiveView("notes");
              }}
            />
          </div>
        )}
      </div>

      {/* Mini calendars */}
      <div className="border-t border-gray-200 p-2 dark:border-gray-800">
        {activeView === "plans" || activeView === "daily-plan" ? (
          <PlanMiniCalendar />
        ) : (
          <DailyCalendar />
        )}
      </div>
    </div>
  );
}
