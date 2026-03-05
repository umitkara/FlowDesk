import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type {
  Workspace,
  WorkspaceSummary,
  WorkspaceConfig,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  DashboardData,
} from "../lib/types";

/** Applies workspace accent color as CSS custom properties. */
function applyAccentColor(color: string) {
  document.documentElement.style.setProperty("--workspace-accent", color);
  document.documentElement.style.setProperty(
    "--workspace-accent-light",
    color + "20",
  );
  // Slightly darker variant
  document.documentElement.style.setProperty(
    "--workspace-accent-dark",
    adjustBrightness(color, -20),
  );
}

/** Adjusts the brightness of a hex colour by the given percentage. */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0xff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** State and actions for workspace management. */
interface WorkspaceState {
  /** All active workspaces (lightweight summaries). */
  workspaces: WorkspaceSummary[];
  /** ID of the active workspace. */
  activeWorkspaceId: string | null;
  /** Full record of the active workspace including config. */
  activeWorkspace: Workspace | null;
  /** Dashboard widget data for the active workspace. */
  dashboardData: DashboardData | null;
  /** Whether the workspace list is loading. */
  isLoading: boolean;
  /** Whether a workspace switch is in progress. */
  isSwitching: boolean;

  /** Loads the list of active workspaces. */
  loadWorkspaces: () => Promise<void>;
  /** Switches to a workspace by ID. */
  setActiveWorkspace: (id: string) => Promise<void>;
  /** Creates a new workspace and reloads the list. */
  createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>;
  /** Updates workspace metadata and reloads. */
  updateWorkspace: (input: UpdateWorkspaceInput) => Promise<Workspace>;
  /** Soft-deletes a workspace and handles active switch. */
  deleteWorkspace: (id: string) => Promise<void>;
  /** Reorders workspaces. */
  reorderWorkspaces: (ids: string[]) => Promise<void>;
  /** Updates only the config for the active workspace. */
  updateConfig: (config: Partial<WorkspaceConfig>) => Promise<void>;
  /** Loads dashboard data for the active workspace. */
  loadDashboard: () => Promise<void>;

  /** Returns the accent color from the active workspace config. */
  getAccentColor: () => string;
  /** Returns categories from the active workspace config. */
  getCategories: () => string[];
  /** Returns note types from the active workspace config. */
  getNoteTypes: () => string[];
  /** Returns task categories from the active workspace config. */
  getTaskCategories: () => string[];
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activeWorkspace: null,
  dashboardData: null,
  isLoading: false,
  isSwitching: false,

  loadWorkspaces: async () => {
    set({ isLoading: true });
    try {
      const workspaces = await ipc.listWorkspaces();
      set({ workspaces, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveWorkspace: async (id: string) => {
    set({ isSwitching: true });
    try {
      const workspace = await ipc.getWorkspace(id);
      set({
        activeWorkspaceId: id,
        activeWorkspace: workspace,
        isSwitching: false,
        dashboardData: null,
      });
      // Persist last active workspace to settings
      ipc.setSetting("last_workspace_id", id).catch(() => {});
      // Apply accent color
      applyAccentColor(workspace.config.accent_color);
    } catch {
      set({ isSwitching: false });
    }
  },

  createWorkspace: async (input) => {
    const workspace = await ipc.createWorkspace(input);
    await get().loadWorkspaces();
    return workspace;
  },

  updateWorkspace: async (input) => {
    const workspace = await ipc.updateWorkspace(input);
    await get().loadWorkspaces();
    if (get().activeWorkspaceId === input.id) {
      set({ activeWorkspace: workspace });
      applyAccentColor(workspace.config.accent_color);
    }
    return workspace;
  },

  deleteWorkspace: async (id) => {
    await ipc.deleteWorkspace(id);
    await get().loadWorkspaces();
    // If deleted workspace was active, switch to first available
    if (get().activeWorkspaceId === id) {
      const remaining = get().workspaces.filter((w) => w.id !== id);
      if (remaining.length > 0) {
        await get().setActiveWorkspace(remaining[0].id);
      }
    }
  },

  reorderWorkspaces: async (ids) => {
    await ipc.reorderWorkspaces(ids);
    await get().loadWorkspaces();
  },

  updateConfig: async (configPatch) => {
    const current = get().activeWorkspace;
    if (!current) return;
    const merged: WorkspaceConfig = { ...current.config, ...configPatch };
    const config = await ipc.updateWorkspaceConfig(current.id, merged);
    set({ activeWorkspace: { ...current, config } });
    applyAccentColor(config.accent_color);
  },

  loadDashboard: async () => {
    const ws = get().activeWorkspace;
    if (!ws) return;
    try {
      const data = await ipc.getDashboardData(
        ws.id,
        ws.config.dashboard_widgets,
      );
      set({ dashboardData: data });
    } catch {
      // silently fail
    }
  },

  getAccentColor: () =>
    get().activeWorkspace?.config.accent_color ?? "#3b82f6",
  getCategories: () =>
    get().activeWorkspace?.config.categories ?? ["general"],
  getNoteTypes: () => get().activeWorkspace?.config.note_types ?? [],
  getTaskCategories: () =>
    get().activeWorkspace?.config.task_categories ?? [],
}));
