import { create } from "zustand";
import * as ipc from "../lib/ipc";
import type {
  FilterConfig,
  FacetedSearchResult,
  SearchFacets,
  SavedFilter,
} from "../lib/types";
import { useWorkspaceStore } from "./workspaceStore";

/** Faceted search and saved filters state. */
interface SearchState {
  filter: FilterConfig;
  results: FacetedSearchResult[];
  facets: SearchFacets | null;
  totalCount: number;
  isSearching: boolean;
  savedFilters: SavedFilter[];

  setFilter: (partial: Partial<FilterConfig>) => void;
  clearFilter: () => void;
  search: () => Promise<void>;
  loadSavedFilters: () => Promise<void>;
  saveCurrentFilter: (name: string, description?: string) => Promise<SavedFilter>;
  applySavedFilter: (filter: SavedFilter) => void;
  removeSavedFilter: (id: string) => Promise<void>;
}

function getWorkspaceId(): string {
  return useWorkspaceStore.getState().activeWorkspaceId ?? "";
}

export const useSearchStore = create<SearchState>((set, get) => ({
  filter: {},
  results: [],
  facets: null,
  totalCount: 0,
  isSearching: false,
  savedFilters: [],

  setFilter: (partial) =>
    set((s) => ({ filter: { ...s.filter, ...partial } })),

  clearFilter: () => set({ filter: {}, results: [], facets: null, totalCount: 0 }),

  search: async () => {
    const wid = getWorkspaceId();
    if (!wid) return;
    set({ isSearching: true });
    try {
      const response = await ipc.facetedSearch(wid, get().filter);
      set({
        results: response.results,
        facets: response.facets,
        totalCount: response.total_count,
      });
    } catch (err) {
      console.error("Faceted search failed:", err);
    } finally {
      set({ isSearching: false });
    }
  },

  loadSavedFilters: async () => {
    const wid = getWorkspaceId();
    if (!wid) return;
    try {
      const filters = await ipc.listSavedFilters(wid);
      set({ savedFilters: filters });
    } catch {
      // ignore
    }
  },

  saveCurrentFilter: async (name, description) => {
    const wid = getWorkspaceId();
    const saved = await ipc.createSavedFilter({
      workspace_id: wid,
      name,
      description,
      filter_config: get().filter,
    });
    set((s) => ({ savedFilters: [...s.savedFilters, saved] }));
    return saved;
  },

  applySavedFilter: (filter) => {
    set({ filter: filter.filter_config });
    get().search();
  },

  removeSavedFilter: async (id) => {
    await ipc.deleteSavedFilter(id);
    set((s) => ({
      savedFilters: s.savedFilters.filter((f) => f.id !== id),
    }));
  },
}));
