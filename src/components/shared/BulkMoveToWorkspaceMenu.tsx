import { useState } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import * as ipc from "../../lib/ipc";

interface BulkMoveToWorkspaceMenuProps {
  entityIds: string[];
  entityType: "note" | "task" | "plan" | "time_entry";
  onMoved: () => void;
}

/**
 * A dropdown button that lets the user move multiple entities to a different workspace.
 * Hidden when there is only one workspace or no entities are selected.
 */
export function BulkMoveToWorkspaceMenu({ entityIds, entityType, onMoved }: BulkMoveToWorkspaceMenuProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  if (workspaces.length <= 1 || entityIds.length === 0) return null;

  const otherWorkspaces = workspaces.filter((ws) => ws.id !== activeWorkspaceId);

  const handleMove = async (targetWorkspaceId: string) => {
    setMoving(true);
    try {
      await ipc.bulkMoveEntitiesToWorkspace(entityIds, entityType, targetWorkspaceId);
      await loadWorkspaces();
      onMoved();
    } catch (e) {
      console.error("Failed to bulk move entities:", e);
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
        className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        {moving ? "Moving..." : "Move to Workspace"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-50 mb-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Move {entityIds.length} to workspace
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
