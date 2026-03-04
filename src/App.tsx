import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "./components/layout/AppShell";
import { useSettingsStore } from "./stores/settingsStore";
import { useNoteStore } from "./stores/noteStore";
import { useUIStore } from "./stores/uiStore";
import { useTaskStore } from "./stores/taskStore";
import { useTrackerStore } from "./stores/trackerStore";

/** Root application component. Loads settings and initial data on mount. */
function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const loadFolderTree = useNoteStore((s) => s.loadFolderTree);
  const fetchStickyTasks = useTaskStore((s) => s.fetchStickyTasks);
  const fetchTrackerState = useTrackerStore((s) => s.fetchState);

  useEffect(() => {
    loadSettings();
    loadNotes();
    loadFolderTree();
    fetchStickyTasks();
    fetchTrackerState();
  }, [loadSettings, loadNotes, loadFolderTree, fetchStickyTasks, fetchTrackerState]);

  // Apply theme setting to the document
  const theme = useSettingsStore((s) => s.settings.theme ?? "system");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // system
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = () => {
        if (mq.matches) root.classList.add("dark");
        else root.classList.remove("dark");
      };
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

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

  return <AppShell />;
}

export default App;
