import { create } from "zustand";

/** Active view identifier. */
export type ActiveView = "notes" | "settings" | "daily" | "trash" | "tasks" | "about" | "plans" | "daily-plan" | "time-reports" | "dashboard" | "workspace-settings" | "faceted-search" | "graph" | "timeline" | "grouped" | "planned-vs-actual" | "templates" | "import-wizard" | "version-history";

/** Views that are secondary (not reachable without sidebar or direct navigation). */
export const SECONDARY_VIEWS: readonly ActiveView[] = [
  "settings",
  "workspace-settings",
  "about",
  "trash",
  "templates",
  "import-wizard",
  "faceted-search",
  "graph",
  "timeline",
  "grouped",
  "planned-vs-actual",
  "time-reports",
  "version-history",
] as const;

/** Returns true if the given view is a secondary view. */
export function isSecondaryView(view: ActiveView): boolean {
  return (SECONDARY_VIEWS as readonly string[]).includes(view);
}

/** Active sidebar section identifier. */
export type SidebarSection = "folders" | "calendar" | "search";

/** UI layout and navigation state. */
interface UIState {
  /** Whether the sidebar is visible. */
  sidebarOpen: boolean;
  /** Current sidebar width in pixels. */
  sidebarWidth: number;
  /** Whether the detail panel is visible. */
  detailPanelOpen: boolean;
  /** The currently displayed main view. */
  activeView: ActiveView;
  /** The active section in the sidebar. */
  activeSidebarSection: SidebarSection;
  /** Stack of visited note IDs for back/forward navigation. */
  navigationHistory: string[];
  /** Current position in the navigation history. */
  historyIndex: number;
  /** Whether the quick switcher overlay is shown. */
  quickSwitcherOpen: boolean;
  /** Whether the command palette is open. */
  commandPaletteOpen: boolean;
  /** Whether the quick capture widget is open. */
  quickCaptureOpen: boolean;
  /** Whether the secondary sidebar section is expanded. */
  sidebarSecondaryExpanded: boolean;
  /** Whether the sidebar was auto-collapsed due to narrow window. */
  sidebarAutoCollapsed: boolean;
  /** Whether the export dialog is open. */
  showExportDialog: boolean;
  /** The previous view before navigating to a secondary view. */
  previousView: ActiveView | null;

  /** Toggles sidebar visibility. */
  toggleSidebar: () => void;
  /** Sets the sidebar width in pixels. */
  setSidebarWidth: (width: number) => void;
  /** Switches the main content view. */
  setActiveView: (view: ActiveView) => void;
  /** Records a note visit in navigation history. */
  navigateTo: (noteId: string) => void;
  /** Navigates to the previous note in history. */
  goBack: () => string | null;
  /** Navigates to the next note in history. */
  goForward: () => string | null;
  /** Toggles the detail panel (metadata drawer). */
  toggleDetailPanel: () => void;
  /** Toggles the quick switcher overlay. */
  toggleQuickSwitcher: () => void;
  /** Toggles the command palette. */
  toggleCommandPalette: () => void;
  /** Toggles the quick capture widget. */
  toggleQuickCapture: () => void;
  /** Toggles the secondary sidebar section. */
  toggleSidebarSecondary: () => void;
  /** Sets the sidebar auto-collapsed state. */
  setSidebarAutoCollapsed: (collapsed: boolean) => void;
  /** Toggles the export dialog. */
  toggleExportDialog: () => void;
  /** Navigates back from a secondary view. */
  goBackView: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: true,
  sidebarWidth: 260,
  detailPanelOpen: false,
  activeView: "dashboard",
  activeSidebarSection: "folders",
  navigationHistory: [],
  historyIndex: -1,
  quickSwitcherOpen: false,
  commandPaletteOpen: false,
  quickCaptureOpen: false,
  sidebarSecondaryExpanded: false,
  sidebarAutoCollapsed: false,
  showExportDialog: false,
  previousView: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setActiveView: (view) => {
    const current = get().activeView;
    if (isSecondaryView(view) && current !== view) {
      set({ activeView: view, previousView: current });
    } else {
      set({ activeView: view });
    }
  },

  navigateTo: (noteId) => {
    const { navigationHistory, historyIndex } = get();
    // Trim forward history when navigating to a new note
    const trimmed = navigationHistory.slice(0, historyIndex + 1);
    trimmed.push(noteId);
    set({
      navigationHistory: trimmed,
      historyIndex: trimmed.length - 1,
    });
  },

  goBack: () => {
    const { historyIndex, navigationHistory } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      set({ historyIndex: newIndex });
      return navigationHistory[newIndex];
    }
    return null;
  },

  goForward: () => {
    const { historyIndex, navigationHistory } = get();
    if (historyIndex < navigationHistory.length - 1) {
      const newIndex = historyIndex + 1;
      set({ historyIndex: newIndex });
      return navigationHistory[newIndex];
    }
    return null;
  },

  toggleDetailPanel: () =>
    set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),

  toggleQuickSwitcher: () =>
    set((s) => ({ quickSwitcherOpen: !s.quickSwitcherOpen })),

  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  toggleQuickCapture: () =>
    set((s) => ({ quickCaptureOpen: !s.quickCaptureOpen })),

  toggleSidebarSecondary: () =>
    set((s) => ({ sidebarSecondaryExpanded: !s.sidebarSecondaryExpanded })),

  setSidebarAutoCollapsed: (collapsed) => set({ sidebarAutoCollapsed: collapsed }),

  toggleExportDialog: () =>
    set((s) => ({ showExportDialog: !s.showExportDialog })),

  goBackView: () => {
    const prev = get().previousView ?? "dashboard";
    set({ activeView: prev, previousView: null });
  },
}));
