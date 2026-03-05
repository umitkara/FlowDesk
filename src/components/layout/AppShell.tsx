import { useCallback, useMemo, useEffect } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboard";
import { NoteEditor } from "../../features/notes/NoteEditor";
import { NoteList } from "../../features/notes/NoteList";
import { QuickSwitcher } from "../../features/notes/QuickSwitcher";
import { SearchResults } from "../../features/search/SearchResults";
import { SettingsPanel } from "../../features/settings/SettingsPanel";
import { TrashView } from "../../features/notes/TrashView";
import { AboutPanel } from "../../features/about/AboutPanel";
import { TaskList } from "../../features/tasks/TaskList";
import { TaskBoard } from "../../features/tasks/TaskBoard";
import { TaskDetail } from "../../features/tasks/TaskDetail";
import { TaskQuickAdd } from "../../features/tasks/TaskQuickAdd";
import CalendarView from "../../features/plans/CalendarView";
import DailyPlanView from "../../features/plans/DailyPlanView";
import PlanDetail from "../../features/plans/PlanDetail";
import PlanDialog from "../../features/plans/PlanDialog";
import { TimeReports } from "../../features/tracker/TimeReports";
import { TrackerDetailForm } from "../../features/tracker/TrackerDetailForm";
import { TrackerRecoveryDialog } from "../../features/tracker/TrackerRecoveryDialog";
import { Dashboard } from "../../features/dashboard/Dashboard";
import { WorkspaceSettings } from "../../features/workspaces/WorkspaceSettings";
import { usePlanStore } from "../../stores/planStore";
import { useTrackerStore } from "../../stores/trackerStore";
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
  const viewMode = useTaskStore((s) => s.viewMode);
  const isDetailOpen = useTaskStore((s) => s.isDetailOpen);
  const openQuickAdd = useTaskStore((s) => s.openQuickAdd);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const isPlanDetailOpen = usePlanStore((s) => s.isDetailOpen);

  const trackerStatus = useTrackerStore((s) => s.status);
  const trackerStart = useTrackerStore((s) => s.start);
  const trackerPause = useTrackerStore((s) => s.pause);
  const trackerResume = useTrackerStore((s) => s.resume);
  const trackerStop = useTrackerStore((s) => s.stop);
  const openSessionNoteInput = useTrackerStore((s) => s.openSessionNoteInput);

  useEffect(() => {
    if (activeView === "tasks") {
      fetchTasks();
    }
  }, [activeView, fetchTasks]);

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
      {
        key: "t",
        ctrl: true,
        shift: true,
        handler: () => {
          // When tracker is active, Ctrl+Shift+T is handled by the editor for timestamp insertion
          if (trackerStatus === "idle") openQuickAdd();
        },
      },
      {
        key: "s",
        ctrl: true,
        shift: true,
        handler: () => {
          if (trackerStatus === "idle") trackerStart();
        },
      },
      {
        key: "p",
        ctrl: true,
        shift: true,
        handler: () => {
          if (trackerStatus === "running") trackerPause();
          else if (trackerStatus === "paused") trackerResume();
        },
      },
      {
        key: "x",
        ctrl: true,
        shift: true,
        handler: () => {
          if (trackerStatus === "running" || trackerStatus === "paused") trackerStop();
        },
      },
      {
        key: "n",
        ctrl: true,
        shift: true,
        handler: () => {
          if (trackerStatus !== "idle") openSessionNoteInput();
        },
      },
    ],
    [
      handleNewNote,
      toggleQuickSwitcher,
      setActiveView,
      openDailyNote,
      handleBack,
      handleForward,
      openQuickAdd,
      trackerStatus,
      trackerStart,
      trackerPause,
      trackerResume,
      trackerStop,
      openSessionNoteInput,
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
            {activeView === "about" && <AboutPanel />}
            {activeView === "tasks" && viewMode === "list" && <TaskList />}
            {activeView === "tasks" && viewMode === "board" && <TaskBoard />}
            {activeView === "plans" && <CalendarView />}
            {activeView === "daily-plan" && <DailyPlanView />}
            {activeView === "time-reports" && <TimeReports />}
            {activeView === "dashboard" && <Dashboard />}
            {activeView === "workspace-settings" && <WorkspaceSettings />}
          </div>

          {/* Task detail panel */}
          {activeView === "tasks" && isDetailOpen && <TaskDetail />}

          {/* Plan detail panel */}
          {(activeView === "plans" || activeView === "daily-plan") && isPlanDetailOpen && <PlanDetail />}
        </div>
      </div>

      <StatusBar />

      {quickSwitcherOpen && <QuickSwitcher />}
      <TaskQuickAdd />
      <PlanDialog />
      <TrackerDetailForm />
      <TrackerRecoveryDialog />
    </div>
  );
}
