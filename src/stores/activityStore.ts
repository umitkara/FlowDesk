import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type { ActivityEntry, ActivityQuery } from "../lib/types";
import { useWorkspaceStore } from "./workspaceStore";

/** Activity timeline state. */
interface ActivityState {
  entries: ActivityEntry[];
  isLoading: boolean;
  hasMore: boolean;
  currentQuery: ActivityQuery | null;

  loadActivity: (query?: Partial<ActivityQuery>) => Promise<void>;
  loadMore: () => Promise<void>;
}

const PAGE_SIZE = 50;

function getWorkspaceId(): string {
  return useWorkspaceStore.getState().activeWorkspaceId ?? "";
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  entries: [],
  isLoading: false,
  hasMore: true,
  currentQuery: null,

  loadActivity: async (query) => {
    const wid = getWorkspaceId();
    if (!wid) return;
    const fullQuery: ActivityQuery = {
      workspace_id: wid,
      limit: PAGE_SIZE,
      offset: 0,
      ...query,
    };
    set({ isLoading: true, currentQuery: fullQuery });
    try {
      const entries = await ipc.listActivity(fullQuery);
      set({
        entries,
        hasMore: entries.length >= PAGE_SIZE,
      });
    } catch {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },

  loadMore: async () => {
    const { currentQuery, entries, isLoading } = get();
    if (isLoading || !currentQuery) return;
    const nextQuery: ActivityQuery = {
      ...currentQuery,
      offset: entries.length,
    };
    set({ isLoading: true });
    try {
      const more = await ipc.listActivity(nextQuery);
      set((s) => ({
        entries: [...s.entries, ...more],
        hasMore: more.length >= PAGE_SIZE,
        currentQuery: nextQuery,
      }));
    } catch {
      // ignore
    } finally {
      set({ isLoading: false });
    }
  },
}));
