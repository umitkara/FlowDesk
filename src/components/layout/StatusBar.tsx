import { useNoteStore } from "../../stores/noteStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { wordCount } from "../../lib/utils";

/** Bottom status bar showing workspace, word count, and save state. */
export function StatusBar() {
  const activeNote = useNoteStore((s) => s.activeNote);
  const isSaving = useNoteStore((s) => s.isSaving);
  const saveError = useNoteStore((s) => s.saveError);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const wc = activeNote ? wordCount(activeNote.body) : 0;

  let saveStatus: string;
  let saveColor: string;
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

  const wsName = activeWorkspace?.name ?? "FlowDesk";
  const wsColor = activeWorkspace?.config.accent_color ?? "#3b82f6";

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
        {activeNote && (
          <span>Words: {wc}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {activeNote && <span className={saveColor}>{saveStatus}</span>}
        <span>UTF-8</span>
      </div>
    </div>
  );
}
