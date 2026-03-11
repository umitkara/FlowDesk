import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { useSettingsStore } from "./stores/settingsStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { useNoteStore } from "./stores/noteStore";
import { useUIStore } from "./stores/uiStore";
import { useTaskStore } from "./stores/taskStore";
import { useTrackerStore } from "./stores/trackerStore";
import { useReminderStore } from "./stores/reminderStore";
import { useTheme } from "./hooks/useTheme";
import type { ReminderFiredPayload } from "./lib/types";
import * as ipc from "./lib/ipc";

/** Root application component. Loads settings, workspaces, and initial data on mount. */
function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const loadFolderTree = useNoteStore((s) => s.loadFolderTree);
  const clearActiveNote = useNoteStore((s) => s.clearActiveNote);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const fetchStickyTasks = useTaskStore((s) => s.fetchStickyTasks);
  const fetchTrackerState = useTrackerStore((s) => s.fetchState);

  // Initial load: settings + workspaces
  useEffect(() => {
    loadSettings();
    fetchTrackerState();

    // Load workspaces, then restore or pick the first workspace
    loadWorkspaces().then(async () => {
      const ws = useWorkspaceStore.getState().workspaces;
      if (ws.length === 0) return;

      // Try to restore last active workspace from settings
      const lastId = await ipc.getSetting("last_workspace_id").catch(() => null);
      const target = lastId && ws.some((w) => w.id === lastId) ? lastId : ws[0].id;
      await setActiveWorkspace(target);
    });
  }, [loadSettings, loadWorkspaces, setActiveWorkspace, fetchTrackerState]);

  // When the active workspace changes, reload all entity stores
  useEffect(() => {
    if (!activeWorkspaceId) return;
    clearActiveNote();
    loadNotes();
    loadFolderTree();
    fetchTasks();
    fetchStickyTasks();
  }, [activeWorkspaceId, clearActiveNote, loadNotes, loadFolderTree, fetchTasks, fetchStickyTasks]);

  // Apply theme via hook (replaces inline theme effect)
  useTheme();

  // Load reminder defaults
  const loadReminderDefaults = useReminderStore((s) => s.loadDefaults);
  const addFiredReminder = useReminderStore((s) => s.addFiredReminder);
  useEffect(() => {
    loadReminderDefaults();
  }, [loadReminderDefaults]);

  // Listen for reminder-fired events from backend
  useEffect(() => {
    const unlisten = listen<ReminderFiredPayload>("reminder-fired", (event) => {
      addFiredReminder(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [addFiredReminder]);

  // Listen for global hotkey quick-capture activation
  const toggleQuickCapture = useUIStore((s) => s.toggleQuickCapture);
  useEffect(() => {
    const unlisten = listen("quick-capture:activate", () => {
      toggleQuickCapture();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [toggleQuickCapture]);

  // Listen for backend break reminder events
  const setBreakNotification = useTrackerStore((s) => s.setBreakNotification);
  useEffect(() => {
    const unlisten = listen<{ title: string; body: string }>("break-reminder-fired", (event) => {
      setBreakNotification(event.payload);
      useTrackerStore.setState({ isOnBreak: true });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [setBreakNotification]);

  // Listen for backend break-over events
  useEffect(() => {
    const unlisten = listen<{ title: string; body: string }>("break-over", (event) => {
      setBreakNotification(event.payload);
      useTrackerStore.setState({ isOnBreak: false });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [setBreakNotification]);

  // Listen for system tray tracker actions
  const trackerStart = useTrackerStore((s) => s.start);
  const trackerPause = useTrackerStore((s) => s.pause);
  const trackerResume = useTrackerStore((s) => s.resume);
  const trackerStop = useTrackerStore((s) => s.stop);
  useEffect(() => {
    const unlisten = listen<string>("tray-tracker-action", (event) => {
      switch (event.payload) {
        case "tray_start": trackerStart(); break;
        case "tray_pause": trackerPause(); break;
        case "tray_resume": trackerResume(); break;
        case "tray_stop": trackerStop(); break;
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [trackerStart, trackerPause, trackerResume, trackerStop]);

  // Sync sidebar_width setting into UI store
  const sidebarWidthSetting = useSettingsStore(
    (s) => s.settings.sidebar_width,
  );
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  useEffect(() => {
    if (sidebarWidthSetting) {
      const w = parseInt(sidebarWidthSetting, 10);
      if (!isNaN(w) && w >= 180 && w <= 400) setSidebarWidth(w);
    }
  }, [sidebarWidthSetting, setSidebarWidth]);

  // Don't render until a workspace is active
  if (!activeWorkspaceId && workspaces.length > 0) {
    return (
      <div className="flex h-full items-center justify-center bg-white dark:bg-gray-950">
        <div className="text-sm text-gray-400">Loading workspace...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

export default App;
