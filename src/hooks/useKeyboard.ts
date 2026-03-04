import { useEffect } from "react";

/** A keyboard shortcut binding. */
interface ShortcutBinding {
  /** Key identifier (e.g. "n", "p", "f", ","). */
  key: string;
  /** Whether Ctrl (or Cmd on macOS) must be held. */
  ctrl?: boolean;
  /** Whether Shift must be held. */
  shift?: boolean;
  /** Whether Alt must be held. */
  alt?: boolean;
  /** Handler to invoke when the shortcut is triggered. */
  handler: () => void;
}

/**
 * Registers global keyboard shortcuts.
 * Shortcuts are active while the component is mounted and are cleaned up on unmount.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutBinding[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl
          ? e.ctrlKey || e.metaKey
          : !e.ctrlKey && !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;

        if (
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          shiftMatch &&
          altMatch
        ) {
          e.preventDefault();
          shortcut.handler();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}
