import { useEffect, useState } from "react";
import type { Backlink, EntityType } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useNoteStore } from "../../stores/noteStore";
import { useUIStore } from "../../stores/uiStore";
import { useTaskStore } from "../../stores/taskStore";

/** Props for the shared backlinks panel. */
interface BacklinksPanelProps {
  targetType: EntityType;
  targetId: string;
}

/** Reusable panel that displays incoming references (backlinks) for any entity. */
export function BacklinksPanel({ targetType, targetId }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const selectNote = useNoteStore((s) => s.selectNote);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const openDetail = useTaskStore((s) => s.openDetail);

  useEffect(() => {
    const fetchBacklinks = async () => {
      setIsLoading(true);
      try {
        const result = await ipc.getBacklinks(targetType, targetId);
        setBacklinks(result);
      } catch {
        // silently fail
      } finally {
        setIsLoading(false);
      }
    };
    fetchBacklinks();
  }, [targetType, targetId]);

  const handleClick = async (backlink: Backlink) => {
    if (backlink.reference.source_type === "note") {
      await selectNote(backlink.reference.source_id);
      navigateTo(backlink.reference.source_id);
      setActiveView("notes");
    } else if (backlink.reference.source_type === "task") {
      openDetail(backlink.reference.source_id);
    }
  };

  if (isLoading) {
    return <div className="text-xs text-gray-400">Loading backlinks...</div>;
  }

  if (backlinks.length === 0) {
    return <div className="text-xs text-gray-400 dark:text-gray-500">No references found</div>;
  }

  // Group backlinks by source type
  const grouped = backlinks.reduce<Record<string, Backlink[]>>((acc, bl) => {
    const key = bl.reference.source_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(bl);
    return acc;
  }, {});

  const typeLabels: Record<string, string> = {
    note: "Notes",
    task: "Tasks",
    plan: "Plans",
    time_entry: "Time Entries",
  };

  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([type, links]) => (
        <div key={type}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {typeLabels[type] ?? type}
          </div>
          <div className="space-y-1">
            {links.map((bl) => (
              <button
                key={bl.reference.id}
                onClick={() => handleClick(bl)}
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
