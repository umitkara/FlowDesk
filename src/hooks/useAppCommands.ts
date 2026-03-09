import { useEffect } from "react";
import { useCommandPaletteStore } from "../stores/commandPaletteStore";
import { useUIStore } from "../stores/uiStore";
import { useNoteStore } from "../stores/noteStore";
import { useTaskStore } from "../stores/taskStore";
import { useTrackerStore } from "../stores/trackerStore";
import { todayISO } from "../lib/utils";
import * as ipc from "../lib/ipc";

/** Registers all command palette commands. Extracted from AppShell. */
export function useAppCommands() {
  const registerCommands = useCommandPaletteStore((s) => s.registerCommands);

  useEffect(() => {
    registerCommands([
      // Navigation
      { id: "nav:notes", title: "Go to Notes", category: "Navigation", shortcut: "Ctrl+P", handler: () => useUIStore.getState().setActiveView("notes"), keywords: ["notes", "view"] },
      { id: "nav:tasks", title: "Go to Tasks", category: "Navigation", handler: () => useUIStore.getState().setActiveView("tasks"), keywords: ["tasks", "todo"] },
      { id: "nav:plans", title: "Go to Calendar", category: "Navigation", handler: () => useUIStore.getState().setActiveView("plans"), keywords: ["plans", "calendar"] },
      { id: "nav:daily-plan", title: "Go to Daily Plan", category: "Navigation", handler: () => useUIStore.getState().setActiveView("daily-plan"), keywords: ["daily", "plan", "today"] },
      { id: "nav:dashboard", title: "Go to Today", category: "Navigation", handler: () => useUIStore.getState().setActiveView("dashboard"), keywords: ["dashboard", "home", "today"] },
      { id: "nav:time-reports", title: "Go to Time Reports", category: "Navigation", handler: () => useUIStore.getState().setActiveView("time-reports"), keywords: ["time", "reports", "tracker"] },
      { id: "nav:templates", title: "Go to Templates", category: "Navigation", handler: () => useUIStore.getState().setActiveView("templates"), keywords: ["templates"] },
      { id: "nav:settings", title: "Open Settings", category: "Navigation", shortcut: "Ctrl+,", handler: () => useUIStore.getState().setActiveView("settings"), keywords: ["settings", "preferences", "config"] },
      { id: "nav:trash", title: "Go to Trash", category: "Navigation", handler: () => useUIStore.getState().setActiveView("trash"), keywords: ["trash", "deleted"] },
      // Discovery
      { id: "nav:search", title: "Global Search", category: "Discovery", shortcut: "Ctrl+Shift+F", handler: () => useUIStore.getState().toggleCommandPalette(), keywords: ["search", "find"] },
      { id: "nav:faceted", title: "Advanced Search", category: "Discovery", handler: () => useUIStore.getState().setActiveView("faceted-search"), keywords: ["faceted", "filter", "advanced"] },
      { id: "nav:graph", title: "Knowledge Graph", category: "Discovery", handler: () => useUIStore.getState().setActiveView("graph"), keywords: ["graph", "links", "connections"] },
      { id: "nav:timeline", title: "Timeline", category: "Discovery", handler: () => useUIStore.getState().setActiveView("timeline"), keywords: ["timeline", "history"] },
      { id: "nav:grouped", title: "Grouped View", category: "Discovery", handler: () => useUIStore.getState().setActiveView("grouped"), keywords: ["grouped", "categories"] },
      { id: "nav:planned-vs-actual", title: "Plan vs Actual", category: "Discovery", handler: () => useUIStore.getState().setActiveView("planned-vs-actual"), keywords: ["planned", "actual", "compare"] },
      // Actions
      {
        id: "action:new-note",
        title: "New Note",
        category: "Actions",
        shortcut: "Ctrl+N",
        handler: async () => {
          const ns = useNoteStore.getState();
          const note = await ns.createNote({ workspace_id: "", title: "Untitled" });
          await ns.selectNote(note.id);
          useUIStore.getState().setActiveView("notes");
        },
        keywords: ["create", "new", "note"],
      },
      { id: "action:daily-note", title: "Open Today's Note", category: "Actions", shortcut: "Ctrl+Shift+D", handler: () => useNoteStore.getState().openDailyNote(todayISO()), keywords: ["today", "daily", "journal"] },
      { id: "action:quick-capture", title: "Quick Capture", category: "Actions", shortcut: "Ctrl+Shift+Space", handler: () => useUIStore.getState().toggleQuickCapture(), keywords: ["capture", "quick", "inbox"] },
      { id: "action:new-task", title: "New Task", category: "Actions", shortcut: "Ctrl+Shift+T", handler: () => useTaskStore.getState().openQuickAdd(), keywords: ["create", "new", "task", "todo"] },
      { id: "action:import", title: "Import Data", category: "Actions", handler: () => useUIStore.getState().setActiveView("import-wizard"), keywords: ["import", "csv", "markdown", "obsidian"] },
      {
        id: "action:snooze-break",
        title: "Snooze Break Reminder",
        category: "Actions",
        shortcut: "Ctrl+Shift+B",
        handler: () => {
          const ts = useTrackerStore.getState();
          ts.snoozeBreak();
          ts.dismissBreakNotification();
        },
        keywords: ["break", "snooze", "reminder"],
      },
      {
        id: "action:undo",
        title: "Undo",
        category: "Actions",
        shortcut: "Ctrl+Z",
        handler: async () => { await ipc.undoOperation(); },
        keywords: ["undo", "revert"],
      },
      {
        id: "action:redo",
        title: "Redo",
        category: "Actions",
        shortcut: "Ctrl+Shift+Z",
        handler: async () => { await ipc.redoOperation(); },
        keywords: ["redo", "repeat"],
      },
    ]);
  }, [registerCommands]);
}
