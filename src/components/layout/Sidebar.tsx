import { useEffect } from "react";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { FolderTree } from "../../features/notes/FolderTree";
import { DailyCalendar } from "../../features/notes/DailyCalendar";
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
      {/* Workspace header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
        <span className="text-base">&#128211;</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Personal
        </span>
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

      {/* Folder tree */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
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

      {/* Mini calendar */}
      <div className="border-t border-gray-200 p-2 dark:border-gray-800">
        <DailyCalendar />
      </div>
    </div>
  );
}
