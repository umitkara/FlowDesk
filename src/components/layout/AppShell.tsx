import { Suspense, lazy, useEffect } from "react";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { usePlanStore } from "../../stores/planStore";
import { useTrackerStore } from "../../stores/trackerStore";
import { useAppShortcuts } from "../../hooks/useAppShortcuts";
import { useAppCommands } from "../../hooks/useAppCommands";
import { useWindowWidth } from "../../hooks/useWindowSize";

// Static imports (primary views + overlays)
import { NoteEditor } from "../../features/notes/NoteEditor";
import { NoteList } from "../../features/notes/NoteList";
import { TaskList } from "../../features/tasks/TaskList";
import { TaskBoard } from "../../features/tasks/TaskBoard";
import { TaskDetail } from "../../features/tasks/TaskDetail";
import { TaskQuickAdd } from "../../features/tasks/TaskQuickAdd";
import CalendarView from "../../features/plans/CalendarView";
import DailyPlanView from "../../features/plans/DailyPlanView";
import PlanDetail from "../../features/plans/PlanDetail";
import PlanDialog from "../../features/plans/PlanDialog";
import { TrackerDetailForm } from "../../features/tracker/TrackerDetailForm";
import { TrackerRecoveryDialog } from "../../features/tracker/TrackerRecoveryDialog";
import { Dashboard } from "../../features/dashboard/Dashboard";
import { CommandPalette } from "../../features/command-palette/CommandPalette";
import { QuickCapture } from "../../features/capture/QuickCapture";
import { BreakNotificationBanner } from "../../features/tracker/BreakNotificationBanner";
import { ReminderNotificationBanner } from "../../features/reminders/ReminderNotificationBanner";
import { ExportDialog } from "../../features/export/ExportDialog";

// Lazy-loaded secondary views
const TimeReports = lazy(() => import("../../features/tracker/TimeReports").then(m => ({ default: m.TimeReports })));
const FacetedSearch = lazy(() => import("../../features/search/FacetedSearch").then(m => ({ default: m.FacetedSearch })));
const GraphView = lazy(() => import("../../features/discovery/GraphView"));
const TimelineView = lazy(() => import("../../features/discovery/TimelineView"));
const GroupedView = lazy(() => import("../../features/discovery/GroupedView"));
const PlannedVsActual = lazy(() => import("../../features/discovery/PlannedVsActual"));
const TemplateManager = lazy(() => import("../../features/notes/TemplateManager").then(m => ({ default: m.TemplateManager })));
const ImportWizard = lazy(() => import("../../features/import/ImportWizard").then(m => ({ default: m.ImportWizard })));
const SettingsPanel = lazy(() => import("../../features/settings/SettingsPanel").then(m => ({ default: m.SettingsPanel })));
const TrashView = lazy(() => import("../../features/notes/TrashView").then(m => ({ default: m.TrashView })));
const AboutPanel = lazy(() => import("../../features/about/AboutPanel").then(m => ({ default: m.AboutPanel })));
const WorkspaceSettings = lazy(() => import("../../features/workspaces/WorkspaceSettings").then(m => ({ default: m.WorkspaceSettings })));

/** Loading fallback for lazy-loaded views. */
function ViewLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-sm text-gray-400 dark:text-gray-500">Loading...</div>
    </div>
  );
}

/** Root layout container with sidebar, main content, and status bar. */
export function AppShell() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const activeView = useUIStore((s) => s.activeView);
  const sidebarAutoCollapsed = useUIStore((s) => s.sidebarAutoCollapsed);
  const setSidebarAutoCollapsed = useUIStore((s) => s.setSidebarAutoCollapsed);
  const activeNote = useNoteStore((s) => s.activeNote);
  const viewMode = useTaskStore((s) => s.viewMode);
  const isDetailOpen = useTaskStore((s) => s.isDetailOpen);
  const isPlanDetailOpen = usePlanStore((s) => s.isDetailOpen);
  const breakNotification = useTrackerStore((s) => s.breakNotification);

  // Register shortcuts & commands
  useAppShortcuts();
  useAppCommands();

  // Responsive sidebar auto-collapse
  const windowWidth = useWindowWidth();
  useEffect(() => {
    if (windowWidth < 1024 && !sidebarAutoCollapsed) {
      setSidebarAutoCollapsed(true);
      useUIStore.getState().toggleSidebar();
    } else if (windowWidth >= 1024 && sidebarAutoCollapsed) {
      setSidebarAutoCollapsed(false);
      useUIStore.getState().toggleSidebar();
    }
  }, [windowWidth, sidebarAutoCollapsed, setSidebarAutoCollapsed]);

  const showSidebar = sidebarOpen && !sidebarAutoCollapsed;
  const showNoteList = activeView === "notes" && windowWidth >= 768;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-gray-950">
      {breakNotification && <BreakNotificationBanner />}
      <ReminderNotificationBanner />
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        {showSidebar && (
          <div
            className="flex-shrink-0 border-r border-gray-200 dark:border-gray-800"
            style={{ width: sidebarWidth }}
          >
            <Sidebar />
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Note list panel */}
          {showNoteList && (
            <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800">
              <NoteList />
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 overflow-auto">
            {/* Primary views (static imports) */}
            {activeView === "notes" && activeNote && <NoteEditor />}
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
            {activeView === "tasks" && viewMode === "list" && <TaskList />}
            {activeView === "tasks" && viewMode === "board" && <TaskBoard />}
            {activeView === "plans" && <CalendarView />}
            {activeView === "daily-plan" && <DailyPlanView />}
            {activeView === "dashboard" && <Dashboard />}

            {/* Secondary views (lazy-loaded) */}
            <Suspense fallback={<ViewLoadingFallback />}>
              {activeView === "settings" && <SettingsPanel />}
              {activeView === "trash" && <TrashView />}
              {activeView === "about" && <AboutPanel />}
              {activeView === "time-reports" && <TimeReports />}
              {activeView === "workspace-settings" && <WorkspaceSettings />}
              {activeView === "faceted-search" && <FacetedSearch />}
              {activeView === "graph" && <GraphView />}
              {activeView === "timeline" && <TimelineView />}
              {activeView === "grouped" && <GroupedView />}
              {activeView === "planned-vs-actual" && <PlannedVsActual />}
              {activeView === "templates" && <TemplateManager />}
              {activeView === "import-wizard" && <ImportWizard />}
            </Suspense>
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
      <ExportDialog />
      <TaskQuickAdd />
      <PlanDialog />
      <TrackerDetailForm />
      <TrackerRecoveryDialog />
    </div>
  );
}
