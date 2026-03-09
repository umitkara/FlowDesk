import { useCallback, useMemo, useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useNoteStore } from "../stores/noteStore";
import { useTaskStore } from "../stores/taskStore";
import { useTrackerStore } from "../stores/trackerStore";
import { useKeyboardShortcuts } from "./useKeyboard";
import { useUndoRedo } from "./useUndoRedo";
import { todayISO } from "../lib/utils";

function isEditorFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest?.(".ProseMirror")) return true;
  return false;
}

/** Registers all global keyboard shortcuts. Extracted from AppShell. */
export function useAppShortcuts() {
  const { undo, redo } = useUndoRedo();

  const handleNewNote = useCallback(async () => {
    const { createNote, selectNote } = useNoteStore.getState();
    const note = await createNote({ workspace_id: "", title: "Untitled" });
    await selectNote(note.id);
    useUIStore.getState().setActiveView("notes");
  }, []);

  const handleBack = useCallback(() => {
    const noteId = useUIStore.getState().goBack();
    if (noteId) useNoteStore.getState().selectNote(noteId);
  }, []);

  const handleForward = useCallback(() => {
    const noteId = useUIStore.getState().goForward();
    if (noteId) useNoteStore.getState().selectNote(noteId);
  }, []);

  const shortcuts = useMemo(
    () => [
      { key: "n", ctrl: true, handler: handleNewNote },
      { key: "p", ctrl: true, handler: () => useUIStore.getState().toggleCommandPalette() },
      { key: "f", ctrl: true, shift: true, handler: () => useUIStore.getState().toggleCommandPalette() },
      { key: "d", ctrl: true, shift: true, handler: () => useNoteStore.getState().openDailyNote(todayISO()) },
      { key: "ArrowLeft", alt: true, handler: handleBack },
      { key: "ArrowRight", alt: true, handler: handleForward },
      { key: ",", ctrl: true, handler: () => useUIStore.getState().setActiveView("settings") },
      { key: "k", ctrl: true, handler: () => useUIStore.getState().toggleCommandPalette() },
      { key: " ", ctrl: true, shift: true, handler: () => useUIStore.getState().toggleQuickCapture() },
      {
        key: "t",
        ctrl: true,
        shift: true,
        handler: () => {
          if (useTrackerStore.getState().status === "idle") useTaskStore.getState().openQuickAdd();
        },
      },
      {
        key: "s",
        ctrl: true,
        shift: true,
        handler: () => {
          if (useTrackerStore.getState().status === "idle") useTrackerStore.getState().start();
        },
      },
      {
        key: "p",
        ctrl: true,
        shift: true,
        handler: () => {
          const s = useTrackerStore.getState();
          if (s.status === "running") s.pause();
          else if (s.status === "paused") s.resume();
        },
      },
      {
        key: "x",
        ctrl: true,
        shift: true,
        handler: () => {
          const s = useTrackerStore.getState();
          if (s.status === "running" || s.status === "paused") s.stop();
        },
      },
      {
        key: "n",
        ctrl: true,
        shift: true,
        handler: () => {
          const s = useTrackerStore.getState();
          if (s.status !== "idle") s.openSessionNoteInput();
        },
      },
      {
        key: "b",
        ctrl: true,
        shift: true,
        handler: () => {
          const s = useTrackerStore.getState();
          if (s.breakNotification) {
            s.snoozeBreak();
            s.dismissBreakNotification();
          }
        },
      },
    ],
    [handleNewNote, handleBack, handleForward],
  );

  useKeyboardShortcuts(shortcuts);

  // Undo/Redo shortcuts — separate to avoid preventDefault when editor is focused
  useEffect(() => {
    const handleUndoRedo = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (isEditorFocused()) return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener("keydown", handleUndoRedo);
    return () => window.removeEventListener("keydown", handleUndoRedo);
  }, [undo, redo]);
}
