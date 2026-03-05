import { useState, useEffect, useCallback } from "react";
import * as ipc from "../lib/ipc";
import type { UndoRedoState } from "../lib/types";

/** Hook for managing undo/redo operations. */
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
    // Poll every 2 seconds
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
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
