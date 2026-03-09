import { useNoteStore } from "../../stores/noteStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTrackerStore, formatElapsed } from "../../stores/trackerStore";
import { wordCount } from "../../lib/utils";

/** Bottom status bar showing contextual information per active view. */
export function StatusBar() {
  const activeNote = useNoteStore((s) => s.activeNote);
  const isSaving = useNoteStore((s) => s.isSaving);
  const saveError = useNoteStore((s) => s.saveError);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeView = useUIStore((s) => s.activeView);
  const tasks = useTaskStore((s) => s.tasks);
  const trackerStatus = useTrackerStore((s) => s.status);
  const elapsedSeconds = useTrackerStore((s) => s.elapsedSeconds);

  const wsName = activeWorkspace?.name ?? "FlowDesk";
  const wsColor = activeWorkspace?.config.accent_color ?? "#3b82f6";

  function getViewContent(): React.ReactNode {
    switch (activeView) {
      case "notes": {
        if (!activeNote) return null;
        const wc = wordCount(activeNote.body);
        return <span>Words: {wc}</span>;
      }
      case "tasks": {
        const inProgress = tasks.filter((t) => t.status === "in_progress").length;
        return (
          <span>
            {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            {inProgress > 0 && `, ${inProgress} in progress`}
          </span>
        );
      }
      case "daily-plan":
      case "dashboard": {
        const today = new Date().toLocaleDateString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        return <span>{today}</span>;
      }
      default:
        return null;
    }
  }

  const viewContent = getViewContent();
  const leftContent = trackerStatus !== "idle" ? (
    <>
      <span className="flex items-center gap-1">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
        <span className="font-mono font-medium text-green-600 dark:text-green-400">
          {formatElapsed(elapsedSeconds)}
        </span>
      </span>
      {viewContent}
    </>
  ) : viewContent;

  // Save status (notes view only)
  let saveStatus: string | null = null;
  let saveColor = "";
  if (activeView === "notes" && activeNote) {
    if (saveError) {
      saveStatus = "Error";
      saveColor = "text-red-500";
    } else if (isSaving) {
      saveStatus = "Saving...";
      saveColor = "text-yellow-500 dark:text-yellow-400";
    } else {
      saveStatus = "Saved";
      saveColor = "text-green-500 dark:text-green-400";
    }
  }

  return (
    <div className="flex h-6 flex-shrink-0 items-center justify-between border-t border-gray-200 bg-gray-50 px-3 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: wsColor }}
          />
          <span className="font-medium">{wsName}</span>
        </span>
        {leftContent}
      </div>
      <div className="flex items-center gap-3">
        {saveStatus && <span className={saveColor}>{saveStatus}</span>}
        <span>UTF-8</span>
      </div>
    </div>
  );
}
