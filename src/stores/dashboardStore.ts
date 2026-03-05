import { create } from "zustand";
import { useWorkspaceStore } from "./workspaceStore";

/** All available widget types for the dashboard. */
export const WIDGET_TYPES = [
  "today_plan",
  "pending_tasks",
  "recent_notes",
  "time_today",
  "sticky_tasks",
  "upcoming_deadlines",
  "quick_capture",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Human-readable metadata for each widget type. */
export const WIDGET_META: Record<
  WidgetType,
  { label: string; description: string }
> = {
  today_plan: {
    label: "Today's Plan",
    description: "Scheduled plan blocks for today",
  },
  pending_tasks: {
    label: "Pending Tasks",
    description: "Tasks awaiting completion",
  },
  recent_notes: {
    label: "Recent Notes",
    description: "Recently updated notes",
  },
  time_today: {
    label: "Time Tracked",
    description: "Time tracking summary for today",
  },
  sticky_tasks: {
    label: "Sticky Tasks",
    description: "Pinned tasks for quick access",
  },
  upcoming_deadlines: {
    label: "Upcoming Deadlines",
    description: "Tasks with approaching due dates",
  },
  quick_capture: {
    label: "Quick Capture",
    description: "Quickly create notes or tasks",
  },
};

interface DashboardState {
  /** Ordered list of active widget types. */
  widgets: string[];
  /** Whether the dashboard is in edit mode. */
  isEditing: boolean;
  /** Snapshot of widgets before entering edit mode (for cancel). */
  snapshot: string[] | null;

  /** Loads widget layout from the active workspace config. */
  loadLayout: () => void;
  /** Enters edit mode, saving a snapshot for cancel. */
  startEditing: () => void;
  /** Saves the current layout to workspace config and exits edit mode. */
  saveLayout: () => Promise<void>;
  /** Reverts to the snapshot and exits edit mode. */
  cancelEditing: () => void;
  /** Adds a widget type at the end. */
  addWidget: (type: string) => void;
  /** Removes a widget by type. */
  removeWidget: (type: string) => void;
  /** Sets a new widget order (from drag-and-drop). */
  reorderWidgets: (newOrder: string[]) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: [],
  isEditing: false,
  snapshot: null,

  loadLayout: () => {
    const ws = useWorkspaceStore.getState().activeWorkspace;
    if (ws) {
      set({ widgets: [...ws.config.dashboard_widgets] });
    }
  },

  startEditing: () => {
    set({ isEditing: true, snapshot: [...get().widgets] });
  },

  saveLayout: async () => {
    const { widgets } = get();
    await useWorkspaceStore.getState().updateConfig({
      dashboard_widgets: widgets,
    });
    set({ isEditing: false, snapshot: null });
    // Reload dashboard data with the new widget list
    useWorkspaceStore.getState().loadDashboard();
  },

  cancelEditing: () => {
    const { snapshot } = get();
    set({
      isEditing: false,
      widgets: snapshot ?? get().widgets,
      snapshot: null,
    });
  },

  addWidget: (type: string) => {
    const { widgets } = get();
    if (!widgets.includes(type)) {
      set({ widgets: [...widgets, type] });
    }
  },

  removeWidget: (type: string) => {
    set({ widgets: get().widgets.filter((w) => w !== type) });
  },

  reorderWidgets: (newOrder: string[]) => {
    set({ widgets: newOrder });
  },
}));
