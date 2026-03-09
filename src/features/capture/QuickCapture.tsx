import { useState, useRef, useEffect, useCallback } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";

type CaptureTab = "note" | "task";

/** Floating quick capture widget for creating notes/tasks. */
export function QuickCapture() {
  const isOpen = useUIStore((s) => s.quickCaptureOpen);
  const toggle = useUIStore((s) => s.toggleQuickCapture);
  const createNote = useNoteStore((s) => s.createNote);
  const createTask = useTaskStore((s) => s.createTask);
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const [tab, setTab] = useState<CaptureTab>("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setTitle("");
      setBody("");
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !workspaceId) return;

    if (tab === "note") {
      await createNote({
        workspace_id: workspaceId,
        title: title.trim(),
        body: body.trim() || undefined,
        folder: "/inbox",
      });
    } else {
      await createTask({
        workspace_id: workspaceId,
        title: title.trim(),
        description: body.trim() || undefined,
      });
    }

    setTitle("");
    setBody("");
    toggle();
  }, [tab, title, body, workspaceId, createNote, createTask, toggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        toggle();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        handleSubmit();
      }
    },
    [toggle, handleSubmit],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[20vh] backdrop-blur-sm" onClick={toggle}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setTab("note")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium ${
              tab === "note"
                ? "border-b-2 border-primary-500 text-primary-600 dark:text-primary-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Note
          </button>
          <button
            onClick={() => setTab("task")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium ${
              tab === "task"
                ? "border-b-2 border-primary-500 text-primary-600 dark:text-primary-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Task
          </button>
        </div>

        {/* Input area */}
        <div className="p-4">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tab === "note" ? "Note title..." : "Task title..."}
            className="mb-3 w-full bg-transparent text-sm font-medium text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-200"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tab === "note" ? "Write something..." : "Description (optional)..."}
            rows={3}
            className="w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-primary-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 dark:border-gray-700">
          <span className="text-[10px] text-gray-400">
            Ctrl+Enter to save
          </span>
          <div className="flex gap-2">
            <button
              onClick={toggle}
              className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim()}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Create {tab === "note" ? "Note" : "Task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
