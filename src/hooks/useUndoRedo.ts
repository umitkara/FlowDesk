import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import * as ipc from "../lib/ipc";
import type { UndoRedoState } from "../lib/types";

/** Hook for managing undo/redo operations via event-driven state. */
export function useUndoRedo() {
  const [state, setState] = useState<UndoRedoState>({
    can_undo: false,
    can_redo: false,
    undo_description: null,
    redo_description: null,
  });

  const refresh = useCallback(async () => {
    try {
      const s = await ipc.getUndoRedoState();
      setState(s);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen<UndoRedoState>("undo-state-changed", (event) => {
      setState(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [refresh]);

  const undo = useCallback(async () => {
    try {
      const s = await ipc.undoOperation();
      setState(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  const redo = useCallback(async () => {
    try {
      const s = await ipc.redoOperation();
      setState(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  return { ...state, undo, redo, refresh };
}
