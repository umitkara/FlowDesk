import { useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import * as ipc from "../../lib/ipc";

interface MoveToWorkspaceMenuProps {
  entityId: string;
  entityType: "note" | "task" | "plan" | "time_entry";
  onMoved: () => void;
}

/**
 * A dropdown button that lets the user move an entity to a different workspace.
 * Hidden when there is only one workspace.
 */
export function MoveToWorkspaceMenu({ entityId, entityType, onMoved }: MoveToWorkspaceMenuProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  // Don't show if there's only one workspace
  if (workspaces.length <= 1) return null;

  const otherWorkspaces = workspaces.filter((ws) => ws.id !== activeWorkspaceId);

  const handleMove = async (targetWorkspaceId: string) => {
    setMoving(true);
    try {
      await ipc.moveEntityToWorkspace(entityId, entityType, targetWorkspaceId);
      await loadWorkspaces();
      onMoved();
    } catch (e) {
      console.error("Failed to move entity:", e);
    } finally {
      setMoving(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={moving}
        title="Move to workspace"
        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Move to workspace
            </div>
            {otherWorkspaces.map((ws) => {
              const color = ws.color ?? "#3b82f6";
              return (
                <button
                  key={ws.id}
                  onClick={() => handleMove(ws.id)}
                  disabled={moving}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <span
                    className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px]"
                    style={{ backgroundColor: color + "20", color }}
                  >
                    {ws.icon ?? ws.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{ws.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
