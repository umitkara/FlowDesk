import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { useSettingsStore } from "./stores/settingsStore";
import { useNoteStore } from "./stores/noteStore";
import { useUIStore } from "./stores/uiStore";

/** Root application component. Loads settings and initial data on mount. */
function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const loadFolderTree = useNoteStore((s) => s.loadFolderTree);

  useEffect(() => {
    loadSettings();
    loadNotes();
    loadFolderTree();
  }, [loadSettings, loadNotes, loadFolderTree]);

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
