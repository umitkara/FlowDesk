import { create } from "zustand";

/** Active view identifier. */
export type ActiveView = "notes" | "search" | "settings" | "daily" | "trash" | "tasks";

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
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: true,
  sidebarWidth: 260,
  detailPanelOpen: false,
  activeView: "notes",
  activeSidebarSection: "folders",
  navigationHistory: [],
  historyIndex: -1,
  quickSwitcherOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setActiveView: (view) => set({ activeView: view }),

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
}));
