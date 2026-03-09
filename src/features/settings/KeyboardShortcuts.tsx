import { useState, useEffect, useCallback } from "react";
import * as ipc from "../../lib/ipc";

const DEFAULT_SHORTCUTS: Record<string, { label: string; default: string }> = {
  "new_note": { label: "New Note", default: "Ctrl+N" },
  "quick_switcher": { label: "Quick Switcher", default: "Ctrl+P" },
  "global_search": { label: "Global Search", default: "Ctrl+Shift+F" },
  "command_palette": { label: "Command Palette", default: "Ctrl+K" },
  "quick_capture": { label: "Quick Capture", default: "Ctrl+Shift+Space" },
  "settings": { label: "Settings", default: "Ctrl+," },
  "daily_note": { label: "Today's Note", default: "Ctrl+Shift+D" },
  "undo": { label: "Undo", default: "Ctrl+Z" },
  "redo": { label: "Redo", default: "Ctrl+Shift+Z" },
};

/** Keyboard shortcuts configuration panel. */
export function KeyboardShortcuts() {
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({});
  const [capturing, setCapturing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [globalHotkey, setGlobalHotkey] = useState("Ctrl+Shift+Space");
  const [capturingGlobal, setCapturingGlobal] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    ipc.getKeyboardShortcuts().then(setShortcuts).catch(() => {});
    ipc.getSetting("global_hotkey").then((v) => {
      if (v) setGlobalHotkey(v);
    }).catch(() => {});
  }, []);

  const handleCapture = useCallback(
    (e: KeyboardEvent) => {
      if (!capturing) return;
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.key !== "Control" && e.key !== "Shift" && e.key !== "Alt" && e.key !== "Meta") {
        parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      }

      if (parts.length > 1 || (parts.length === 1 && parts[0].length > 1)) {
        const binding = parts.join("+");
        const newShortcuts = { ...shortcuts, [capturing]: binding };
        setShortcuts(newShortcuts);
        setCapturing(null);
        ipc.updateKeyboardShortcuts(newShortcuts).catch((err) => {
          setError(String(err));
        });
      }
    },
    [capturing, shortcuts],
  );

  useEffect(() => {
    if (capturing) {
      window.addEventListener("keydown", handleCapture);
      return () => window.removeEventListener("keydown", handleCapture);
    }
  }, [capturing, handleCapture]);

  const handleCaptureGlobal = useCallback(
    (e: KeyboardEvent) => {
      if (!capturingGlobal) return;
      e.preventDefault();
      e.stopPropagation();

      const parts: string[] = [];
      if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.key !== "Control" && e.key !== "Shift" && e.key !== "Alt" && e.key !== "Meta") {
        parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      }

      if (parts.length > 1 || (parts.length === 1 && parts[0].length > 1)) {
        const binding = parts.join("+");
        setGlobalHotkey(binding);
        setCapturingGlobal(false);
        ipc.updateGlobalHotkey(binding).catch((err) => {
          setGlobalError(String(err));
        });
      }
    },
    [capturingGlobal],
  );

  useEffect(() => {
    if (capturingGlobal) {
      window.addEventListener("keydown", handleCaptureGlobal);
      return () => window.removeEventListener("keydown", handleCaptureGlobal);
    }
  }, [capturingGlobal, handleCaptureGlobal]);

  const resetShortcut = useCallback(
    (action: string) => {
      const newShortcuts = { ...shortcuts };
      delete newShortcuts[action];
      setShortcuts(newShortcuts);
      ipc.updateKeyboardShortcuts(newShortcuts).catch(() => {});
    },
    [shortcuts],
  );

  return (
    <div>
      {error && (
        <div className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
        {Object.entries(DEFAULT_SHORTCUTS).map(([action, config]) => {
          const currentBinding = shortcuts[action] || config.default;
          const isCapturing = capturing === action;

          return (
            <div key={action} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {config.label}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (capturingGlobal) setCapturingGlobal(false);
                    setCapturing(isCapturing ? null : action);
                  }}
                  className={`rounded px-2 py-1 text-xs font-mono ${
                    isCapturing
                      ? "animate-pulse bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  }`}
                >
                  {isCapturing ? "Press keys..." : currentBinding}
                </button>
                {shortcuts[action] && (
                  <button
                    onClick={() => resetShortcut(action)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Reset to default"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* System-Wide Shortcuts */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          System-Wide Shortcuts
        </div>
        {globalError && (
          <div className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300">
            {globalError}
          </div>
        )}
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Quick Capture (Global)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (capturing) setCapturing(null);
                  setCapturingGlobal(!capturingGlobal);
                }}
                className={`rounded px-2 py-1 text-xs font-mono ${
                  capturingGlobal
                    ? "animate-pulse bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {capturingGlobal ? "Press keys..." : globalHotkey}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
