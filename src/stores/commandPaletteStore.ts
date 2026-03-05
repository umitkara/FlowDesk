import { create } from "zustand";
import type { Command } from "../lib/types";

interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  commands: Command[];
  selectedIndex: number;

  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (q: string) => void;
  setSelectedIndex: (i: number) => void;
  registerCommands: (cmds: Command[]) => void;
  unregisterCommands: (ids: string[]) => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  query: "",
  commands: [],
  selectedIndex: 0,

  open: () => set({ isOpen: true, query: "", selectedIndex: 0 }),
  close: () => set({ isOpen: false, query: "", selectedIndex: 0 }),
  toggle: () => set((s) => ({
    isOpen: !s.isOpen,
    query: s.isOpen ? s.query : "",
    selectedIndex: 0,
  })),
  setQuery: (q) => set({ query: q, selectedIndex: 0 }),
  setSelectedIndex: (i) => set({ selectedIndex: i }),
  registerCommands: (cmds) => set((s) => {
    const existingIds = new Set(s.commands.map((c) => c.id));
    const newCmds = cmds.filter((c) => !existingIds.has(c.id));
    return { commands: [...s.commands, ...newCmds] };
  }),
  unregisterCommands: (ids) => set((s) => ({
    commands: s.commands.filter((c) => !ids.includes(c.id)),
  })),
}));
