import { useState, useEffect, useCallback } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import { WorkspaceCreate } from "./WorkspaceCreate";
import type { WorkspaceSummary } from "../../lib/types";

/** Sidebar workspace switcher with Ctrl+1-9 keyboard shortcuts. */
export function WorkspaceSwitcher() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const [showCreate, setShowCreate] = useState(false);

  // Ctrl+1-9 shortcuts for workspace switching
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key) - 1;
        if (index < workspaces.length) {
          e.preventDefault();
          setActiveWorkspace(workspaces[index].id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [workspaces, setActiveWorkspace]);

  const handleSwitch = useCallback(
    (ws: WorkspaceSummary) => {
      if (ws.id !== activeWorkspaceId) {
        setActiveWorkspace(ws.id);
      }
    },
    [activeWorkspaceId, setActiveWorkspace],
  );

  return (
    <div className="border-b border-gray-200 px-2 py-2 dark:border-gray-800">
      <div className="space-y-0.5">
        {workspaces.map((ws, index) => {
          const isActive = ws.id === activeWorkspaceId;
          const color = ws.color ?? "#3b82f6";
          return (
            <div
              key={ws.id}
              className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors cursor-pointer ${
                isActive
                  ? "font-medium text-gray-900 dark:text-gray-100"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
              style={
                isActive
                  ? {
                      backgroundColor: color + "18",
                      borderLeft: `2px solid ${color}`,
                      paddingLeft: "8px",
                    }
                  : { borderLeft: "2px solid transparent", paddingLeft: "8px" }
              }
              title={`${ws.name} (Ctrl+${index + 1})`}
              onClick={() => handleSwitch(ws)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSwitch(ws);
                }
              }}
            >
              <span
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs"
                style={
                  isActive
                    ? { backgroundColor: color, color: "#fff" }
                    : { backgroundColor: color + "20", color }
                }
              >
                {ws.icon ?? ws.name.charAt(0).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{ws.name}</span>
              <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                {ws.note_count}N&middot;{ws.task_count}T
              </span>
              {isActive && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveView("workspace-settings");
                  }}
                  className="flex-shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:text-gray-600 group-hover:opacity-100 dark:text-gray-500 dark:hover:text-gray-300"
                  title="Workspace settings"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={() => setShowCreate(true)}
        className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New workspace
      </button>
      {showCreate && <WorkspaceCreate onClose={() => setShowCreate(false)} />}
    </div>
  );
}
