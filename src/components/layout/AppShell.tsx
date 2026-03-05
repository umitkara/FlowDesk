import { useCallback, useMemo, useEffect } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboard";
import { useCommandPaletteStore } from "../../stores/commandPaletteStore";
import { NoteEditor } from "../../features/notes/NoteEditor";
import { NoteList } from "../../features/notes/NoteList";

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
import { FacetedSearch } from "../../features/search/FacetedSearch";
import GraphView from "../../features/discovery/GraphView";
import TimelineView from "../../features/discovery/TimelineView";
import GroupedView from "../../features/discovery/GroupedView";
import PlannedVsActual from "../../features/discovery/PlannedVsActual";
import { TemplateManager } from "../../features/notes/TemplateManager";
import { ImportWizard } from "../../features/import/ImportWizard";
import { CommandPalette } from "../../features/command-palette/CommandPalette";
import { QuickCapture } from "../../features/capture/QuickCapture";
import { usePlanStore } from "../../stores/planStore";
import { useTrackerStore } from "../../stores/trackerStore";
import { todayISO } from "../../lib/utils";

/** Root layout container with sidebar, main content, and status bar. */
export function AppShell() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const toggleQuickCapture = useUIStore((s) => s.toggleQuickCapture);
  const registerCommands = useCommandPaletteStore((s) => s.registerCommands);
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
      { key: "p", ctrl: true, handler: () => toggleCommandPalette() },
      {
        key: "f",
        ctrl: true,
        shift: true,
        handler: () => toggleCommandPalette(),
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
      { key: "k", ctrl: true, handler: () => toggleCommandPalette() },
      {
        key: " ",
        ctrl: true,
        shift: true,
        handler: () => toggleQuickCapture(),
      },
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
      toggleCommandPalette,
      toggleQuickCapture,
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

  // Register commands for the command palette
  useEffect(() => {
    registerCommands([
      // Navigation
      { id: "nav:notes", title: "Go to Notes", category: "Navigation", shortcut: "Ctrl+P", handler: () => setActiveView("notes"), keywords: ["notes", "view"] },
      { id: "nav:tasks", title: "Go to Tasks", category: "Navigation", handler: () => setActiveView("tasks"), keywords: ["tasks", "todo"] },
      { id: "nav:plans", title: "Go to Calendar", category: "Navigation", handler: () => setActiveView("plans"), keywords: ["plans", "calendar"] },
      { id: "nav:daily-plan", title: "Go to Daily Plan", category: "Navigation", handler: () => setActiveView("daily-plan"), keywords: ["daily", "plan", "today"] },
      { id: "nav:dashboard", title: "Go to Dashboard", category: "Navigation", handler: () => setActiveView("dashboard"), keywords: ["dashboard", "home"] },
      { id: "nav:time-reports", title: "Go to Time Reports", category: "Navigation", handler: () => setActiveView("time-reports"), keywords: ["time", "reports", "tracker"] },
      { id: "nav:templates", title: "Go to Templates", category: "Navigation", handler: () => setActiveView("templates"), keywords: ["templates"] },
      { id: "nav:settings", title: "Open Settings", category: "Navigation", shortcut: "Ctrl+,", handler: () => setActiveView("settings"), keywords: ["settings", "preferences", "config"] },
      { id: "nav:trash", title: "Go to Trash", category: "Navigation", handler: () => setActiveView("trash"), keywords: ["trash", "deleted"] },
      // Discovery
      { id: "nav:search", title: "Global Search", category: "Discovery", shortcut: "Ctrl+Shift+F", handler: () => toggleCommandPalette(), keywords: ["search", "find"] },
      { id: "nav:faceted", title: "Advanced Search", category: "Discovery", handler: () => setActiveView("faceted-search"), keywords: ["faceted", "filter", "advanced"] },
      { id: "nav:graph", title: "Knowledge Graph", category: "Discovery", handler: () => setActiveView("graph"), keywords: ["graph", "links", "connections"] },
      { id: "nav:timeline", title: "Timeline", category: "Discovery", handler: () => setActiveView("timeline"), keywords: ["timeline", "history"] },
      { id: "nav:grouped", title: "Grouped View", category: "Discovery", handler: () => setActiveView("grouped"), keywords: ["grouped", "categories"] },
      { id: "nav:planned-vs-actual", title: "Plan vs Actual", category: "Discovery", handler: () => setActiveView("planned-vs-actual"), keywords: ["planned", "actual", "compare"] },
      // Actions
      { id: "action:new-note", title: "New Note", category: "Actions", shortcut: "Ctrl+N", handler: handleNewNote, keywords: ["create", "new", "note"] },
      { id: "action:daily-note", title: "Open Today's Note", category: "Actions", shortcut: "Ctrl+Shift+D", handler: () => openDailyNote(todayISO()), keywords: ["today", "daily", "journal"] },
      { id: "action:quick-capture", title: "Quick Capture", category: "Actions", shortcut: "Ctrl+Shift+Space", handler: () => toggleQuickCapture(), keywords: ["capture", "quick", "inbox"] },
      { id: "action:new-task", title: "New Task", category: "Actions", shortcut: "Ctrl+Shift+T", handler: () => openQuickAdd(), keywords: ["create", "new", "task", "todo"] },
      { id: "action:import", title: "Import Data", category: "Actions", handler: () => setActiveView("import-wizard"), keywords: ["import", "csv", "markdown", "obsidian"] },
    ]);
  }, [registerCommands, setActiveView, handleNewNote, openDailyNote, toggleQuickCapture, openQuickAdd]);

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
            {activeView === "faceted-search" && <FacetedSearch />}
            {activeView === "graph" && <GraphView />}
            {activeView === "timeline" && <TimelineView />}
            {activeView === "grouped" && <GroupedView />}
            {activeView === "planned-vs-actual" && <PlannedVsActual />}
            {activeView === "templates" && <TemplateManager />}
            {activeView === "import-wizard" && <ImportWizard />}
          </div>

          {/* Task detail panel */}
          {activeView === "tasks" && isDetailOpen && <TaskDetail />}

          {/* Plan detail panel */}
          {(activeView === "plans" || activeView === "daily-plan") && isPlanDetailOpen && <PlanDetail />}
        </div>
      </div>

      <StatusBar />

      <CommandPalette />
      <QuickCapture />
      <TaskQuickAdd />
      <PlanDialog />
      <TrackerDetailForm />
      <TrackerRecoveryDialog />
    </div>
  );
}
