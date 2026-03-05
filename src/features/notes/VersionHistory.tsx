import { useEffect, useCallback } from "react";
import { useVersionHistory } from "../../hooks/useVersionHistory";
import { formatDate } from "../../lib/utils";
import type { NoteVersionSummary, DiffLine } from "../../lib/types";

interface Props {
  noteId: string;
  onClose: () => void;
  onRestore: () => void;
}

/** Side panel displaying version history with diff viewer. */
export function VersionHistory({ noteId, onClose, onRestore }: Props) {
  const {
    versions,
    selectedVersion,
    diff,
    loading,
    loadVersions,
    viewVersion,
    computeDiff,
    restoreVersion,
    deleteVersion,
    setDiff,
  } = useVersionHistory(noteId);

  useEffect(() => {
    loadVersions();
  }, [loadVersions]);

  const handleSelect = useCallback(
    (v: NoteVersionSummary) => {
      viewVersion(v.id);
      setDiff(null);
      // Auto-compute diff with the next version
      const idx = versions.findIndex((ver) => ver.id === v.id);
      if (idx < versions.length - 1) {
        computeDiff(versions[idx + 1].id, v.id);
      }
    },
    [viewVersion, computeDiff, versions, setDiff],
  );

  const handleRestore = useCallback(
    async (versionId: string) => {
      await restoreVersion(versionId);
      onRestore();
    },
    [restoreVersion, onRestore],
  );

  return (
    <div className="flex h-full w-80 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Version History
        </h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-gray-400">Loading...</span>
          </div>
        ) : versions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-gray-400">
            No versions saved yet
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => handleSelect(v)}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  selectedVersion?.id === v.id
                    ? "bg-primary-50 dark:bg-primary-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-gray-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    v{v.version_number}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {formatBytes(v.body_size)}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-gray-400">
                  {formatDate(v.created_at)}
                </div>
                {v.title && (
                  <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                    {v.title}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected version actions */}
      {selectedVersion && (
        <div className="border-t border-gray-200 dark:border-gray-800">
          {/* Diff view */}
          {diff && (
            <div className="max-h-48 overflow-auto border-b border-gray-200 bg-gray-50 px-3 py-2 font-mono text-[10px] dark:border-gray-800 dark:bg-gray-900">
              {diff.hunks.map((hunk, hi) => (
                <div key={hi} className="mb-1">
                  {hunk.lines.map((line, li) => (
                    <DiffLineRow key={li} line={line} />
                  ))}
                </div>
              ))}
              <div className="mt-1 text-gray-400">
                +{diff.stats.additions} -{diff.stats.deletions}
              </div>
            </div>
          )}

          <div className="flex gap-2 px-4 py-3">
            <button
              onClick={() => handleRestore(selectedVersion.id)}
              className="flex-1 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              Restore
            </button>
            <button
              onClick={() => deleteVersion(selectedVersion.id)}
              className="rounded-md px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const cls =
    line.kind === "Added"
      ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
      : line.kind === "Removed"
        ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
        : "text-gray-500";

  const prefix = line.kind === "Added" ? "+" : line.kind === "Removed" ? "-" : " ";

  return (
    <div className={`whitespace-pre-wrap ${cls}`}>
      <span className="select-none">{prefix}</span>
      {line.content}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
