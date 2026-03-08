import { useEffect, useState } from "react";
import type { Backlink, BacklinkWithContext, EntityType } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { openEntity } from "../../lib/openEntity";

/** Props for the shared backlinks panel. */
interface BacklinksPanelProps {
  targetType: EntityType;
  targetId: string;
}

/** Reusable panel that displays incoming references with context snippets. */
export function BacklinksPanel({ targetType, targetId }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [contextBacklinks, setContextBacklinks] = useState<BacklinkWithContext[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [useContext, setUseContext] = useState(true);

  useEffect(() => {
    const fetchBacklinks = async () => {
      setIsLoading(true);
      try {
        const [basic, withContext] = await Promise.all([
          ipc.getBacklinks(targetType, targetId),
          ipc.getBacklinksWithContext(targetType, targetId),
        ]);
        setBacklinks(basic);
        setContextBacklinks(withContext);
      } catch {
        // silently fail
      } finally {
        setIsLoading(false);
      }
    };
    fetchBacklinks();
  }, [targetType, targetId]);

  const handleClickContext = (bl: BacklinkWithContext) => {
    openEntity({ type: bl.source_type as EntityType, id: bl.source_id });
  };

  const handleClickBasic = (backlink: Backlink) => {
    openEntity({
      type: backlink.reference.source_type as EntityType,
      id: backlink.reference.source_id,
    });
  };

  if (isLoading) {
    return <div className="text-xs text-gray-400">Loading backlinks...</div>;
  }

  const totalCount = useContext ? contextBacklinks.length : backlinks.length;

  if (totalCount === 0) {
    return <div className="text-xs text-gray-400 dark:text-gray-500">No references found</div>;
  }

  const typeIcons: Record<string, string> = {
    note: "text-blue-500",
    task: "text-green-500",
    plan: "text-purple-500",
    time_entry: "text-orange-500",
  };

  const typeLabels: Record<string, string> = {
    note: "Note",
    task: "Task",
    plan: "Plan",
    time_entry: "Time Entry",
  };

  // Context-aware view
  if (useContext && contextBacklinks.length > 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Referenced By ({contextBacklinks.length})
          </span>
          <button
            onClick={() => setUseContext(false)}
            className="text-[9px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Simple view
          </button>
        </div>
        {contextBacklinks.map((bl) => (
          <button
            key={bl.reference_id}
            onClick={() => handleClickContext(bl)}
            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-medium ${typeIcons[bl.source_type] ?? "text-gray-400"}`}>
                {typeLabels[bl.source_type] ?? bl.source_type}
              </span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                {bl.source_title || "Untitled"}
              </span>
            </div>
            {bl.context_snippet && (
              <div className="mt-0.5 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500 line-clamp-2">
                {bl.context_snippet}
              </div>
            )}
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-400 dark:bg-gray-800">
                {bl.relation}
              </span>
              {bl.source_updated_at && (
                <span className="text-[9px] text-gray-400">
                  {bl.source_updated_at.slice(0, 10)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // Fallback: simple grouped view
  const grouped = backlinks.reduce<Record<string, Backlink[]>>((acc, bl) => {
    const key = bl.reference.source_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(bl);
    return acc;
  }, {});

  const groupLabels: Record<string, string> = {
    note: "Notes",
    task: "Tasks",
    plan: "Plans",
    time_entry: "Time Entries",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Referenced By ({backlinks.length})
        </span>
        {contextBacklinks.length > 0 && (
          <button
            onClick={() => setUseContext(true)}
            className="text-[9px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Context view
          </button>
        )}
      </div>
      {Object.entries(grouped).map(([type, links]) => (
        <div key={type}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {groupLabels[type] ?? type}
          </div>
          <div className="space-y-1">
            {links.map((bl) => (
              <button
                key={bl.reference.id}
                onClick={() => handleClickBasic(bl)}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {bl.source_title || "Untitled"}
                </div>
                {bl.source_snippet && (
                  <div className="mt-0.5 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                    {bl.source_snippet}
                  </div>
                )}
                <span className="mt-0.5 inline-block rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-400 dark:bg-gray-800">
                  {bl.reference.relation}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
