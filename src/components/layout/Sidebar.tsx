import { useEffect } from "react";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { useTaskStore } from "../../stores/taskStore";
import { FolderTree } from "../../features/notes/FolderTree";
import { DailyCalendar } from "../../features/notes/DailyCalendar";
import { PlanMiniCalendar } from "../../features/plans/PlanMiniCalendar";
import { WorkspaceSwitcher } from "../../features/workspaces/WorkspaceSwitcher";
import { todayISO } from "../../lib/utils";

/** Sidebar quick-filter identifiers. */
type SidebarItem = "all" | "daily" | "today" | "trash" | "folder";

const activeClass =
  "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300";
const inactiveClass =
  "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800";

/** Left sidebar with workspace info, quick filters, folder tree, and calendar. */
export function Sidebar() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setFolder = useNoteStore((s) => s.setFolder);
  const currentFolder = useNoteStore((s) => s.currentFolder);
  const currentQuery = useNoteStore((s) => s.currentQuery);
  const openDailyNote = useNoteStore((s) => s.openDailyNote);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const folderTree = useNoteStore((s) => s.folderTree);
  const loadFolderTree = useNoteStore((s) => s.loadFolderTree);
  const viewMode = useTaskStore((s) => s.viewMode);
  const setViewMode = useTaskStore((s) => s.setViewMode);
  const treeMode = useTaskStore((s) => s.treeMode);
  const setTreeMode = useTaskStore((s) => s.setTreeMode);
  const filter = useTaskStore((s) => s.filter);
  const setFilter = useTaskStore((s) => s.setFilter);

  useEffect(() => {
    loadFolderTree();
  }, [loadFolderTree]);

  // Derive which sidebar item is active
  let active: SidebarItem = "all";
  if (activeView === "trash") {
    active = "trash";
  } else if (currentFolder) {
    active = "folder";
  } else if (currentQuery.note_type === "journal") {
    active = "daily";
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Workspace Switcher */}
      <WorkspaceSwitcher />

      {/* Scrollable middle section */}
      <div className="flex-1 overflow-y-auto">
      {/* Dashboard link */}
      <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
        <button
          onClick={() => setActiveView("dashboard")}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            activeView === "dashboard" ? activeClass : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </button>
      </div>

      {/* Quick filters */}
      <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
        <button
          onClick={() => {
            setFolder(null);
            loadNotes({});
            setActiveView("notes");
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            active === "all" ? activeClass : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          All Notes
        </button>
        <button
          onClick={() => {
            setFolder(null);
            loadNotes({ note_type: "journal" });
            setActiveView("notes");
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            active === "daily" ? activeClass : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Daily Notes
        </button>
        <button
          onClick={() => {
            setFolder(null);
            loadNotes({});
            openDailyNote(todayISO());
            setActiveView("notes");
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${inactiveClass}`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Today
        </button>
        <button
          onClick={() => setActiveView("trash")}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            active === "trash" ? activeClass : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Trash
        </button>
      </div>

      {/* Tasks section */}
      <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
        <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Tasks
        </div>
        <button
          onClick={() => {
            setFilter({});
            setViewMode("list");
            setTreeMode(false);
            setActiveView("tasks");
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            activeView === "tasks" && viewMode === "list" && !treeMode && filter.is_sticky !== true
              ? activeClass
              : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          List View
        </button>
        <button
          onClick={() => {
            setFilter({});
            setViewMode("board");
            setTreeMode(false);
            setActiveView("tasks");
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            activeView === "tasks" && viewMode === "board" ? activeClass : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
          Board View
        </button>
        <button
          onClick={() => {
            setFilter({});
            setViewMode("list");
            setTreeMode(true);
            setActiveView("tasks");
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            activeView === "tasks" && viewMode === "list" && treeMode
              ? activeClass
              : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h4m0 0v4m0-4h10m0 0v4m-10 4v4m0 0h4m-4 0H3m10-4v4m0 0h4m-4 0h-4" />
          </svg>
          Tree View
        </button>
        <button
          onClick={() => {
            setFilter({ is_sticky: true });
            setViewMode("list");
            setTreeMode(false);
            setActiveView("tasks");
          }}
          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
            activeView === "tasks" && viewMode === "list" && filter.is_sticky === true
              ? activeClass
              : inactiveClass
          }`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Sticky Tasks
        </button>
      </div>

      {/* Plans & Calendar section */}
      <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
        <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Plans
        </div>
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
      </div>

      {/* Time Tracker section */}
      <div className="space-y-0.5 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
        <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Time Tracker
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
      </div>

      {/* Folder tree */}
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
