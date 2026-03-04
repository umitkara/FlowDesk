import { useState } from "react";
import type { FolderNode } from "../../lib/types";

/** Props for the FolderTree component. */
interface FolderTreeProps {
  /** Tree nodes to render. */
  tree: FolderNode[];
  /** Currently selected folder path. */
  selectedFolder: string | null;
  /** Called when a folder is clicked. */
  onSelect: (path: string) => void;
}

/** Virtual folder tree sidebar with expand/collapse and selection. */
export function FolderTree({ tree, selectedFolder, onSelect }: FolderTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500">
        No folders yet
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <FolderNodeItem
          key={node.path}
          node={node}
          depth={0}
          selectedFolder={selectedFolder}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

/** A single folder node with recursive children. */
function FolderNodeItem({
  node,
  depth,
  selectedFolder,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  selectedFolder: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedFolder === node.path;

  return (
    <div>
      <button
        onClick={() => onSelect(node.path)}
        className={`flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-sm transition-colors ${
          isSelected
            ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
            : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex-shrink-0 cursor-pointer"
          >
            <svg
              className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        )}
        {!hasChildren && <span className="w-3" />}
        <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {node.note_count > 0 && (
          <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
            {node.note_count}
          </span>
        )}
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <FolderNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
