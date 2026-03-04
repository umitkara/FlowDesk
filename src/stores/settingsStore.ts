import { create } from "zustand";
import * as ipc from "../lib/ipc";

/** Settings state and management actions. */
interface SettingsState {
  /** All settings as a key-value map. */
  settings: Record<string, string>;
  /** Whether settings have been loaded from the backend. */
  isLoaded: boolean;

  /** Loads all settings from the backend. */
  loadSettings: () => Promise<void>;
  /** Gets a setting value with an optional default. */
  getSetting: (key: string, defaultValue?: string) => string;
  /** Sets a single setting and persists it. */
  setSetting: (key: string, value: string) => Promise<void>;
  /** Sets multiple settings at once. */
  setMany: (settings: Record<string, string>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  isLoaded: false,

  loadSettings: async () => {
    const settings = await ipc.getAllSettings();
    set({ settings, isLoaded: true });
  },

  getSetting: (key, defaultValue = "") => {
    return get().settings[key] ?? defaultValue;
  },

  setSetting: async (key, value) => {
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
    await ipc.setSetting(key, value);
  },

  setMany: async (settings) => {
    set((s) => ({ settings: { ...s.settings, ...settings } }));
    await ipc.setManySettings(settings);
  },
}));
