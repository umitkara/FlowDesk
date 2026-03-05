import { useEffect, useState } from "react";
import type { Reference, EntityType, RelationType } from "../../lib/types";
import * as ipc from "../../lib/ipc";
import { useTaskStore } from "../../stores/taskStore";

interface ReferencesSectionProps {
  entityType: EntityType;
  entityId: string;
}

const RELATION_LABELS: Record<string, { label: string; color: string }> = {
  references: { label: "References", color: "text-blue-500" },
  blocks: { label: "Blocks", color: "text-red-500" },
  blocked_by: { label: "Blocked by", color: "text-orange-500" },
  related_to: { label: "Related to", color: "text-purple-500" },
  subtask_of: { label: "Subtask of", color: "text-gray-500" },
};

/** Outgoing references section for the task detail panel. */
export function ReferencesSection({ entityType, entityId }: ReferencesSectionProps) {
  const [references, setReferences] = useState<Reference[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addRelation, setAddRelation] = useState<RelationType>("blocks");
  const [addTargetId, setAddTargetId] = useState("");
  const [addTargetType, setAddTargetType] = useState<EntityType>("task");
  const [allTasks, setAllTasks] = useState<{ id: string; title: string }[]>([]);

  const openDetail = useTaskStore((s) => s.openDetail);

  const fetchRefs = async () => {
    setIsLoading(true);
    try {
      const result = await ipc.listReferences({
        source_type: entityType,
        source_id: entityId,
      });
      // Filter out auto-generated "references" from inline refs (those are managed by sync)
      setReferences(result.filter((r) => r.relation !== "references"));
    } catch {
      // silently fail
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRefs();
  }, [entityType, entityId]);

  const handleAdd = async () => {
    if (!addTargetId) return;
    try {
      await ipc.createReference({
        source_type: entityType,
        source_id: entityId,
        target_type: addTargetType,
        target_id: addTargetId,
        relation: addRelation,
      });
      setShowAdd(false);
      setAddTargetId("");
      await fetchRefs();
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (refId: string) => {
    try {
      await ipc.deleteReference(refId);
      await fetchRefs();
    } catch {
      // silently fail
    }
  };

  const loadTasks = async () => {
    try {
      const workspaces = await ipc.listWorkspaces();
      if (!workspaces.length) return;
      const tasks = await ipc.listTasks(
        { workspace_id: workspaces[0].id },
        { field: "updated_at", direction: "desc" },
      );
      setAllTasks(
        tasks.filter((t) => t.id !== entityId).map((t) => ({ id: t.id, title: t.title })),
      );
    } catch {
      // silently fail
    }
  };

  if (isLoading) {
    return <div className="text-xs text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-1">
      {references.length === 0 && !showAdd && (
        <div className="text-xs text-gray-400 dark:text-gray-500">No references</div>
      )}

      {references.map((ref) => {
        const relCfg = RELATION_LABELS[ref.relation] ?? RELATION_LABELS.references;
        return (
          <div
            key={ref.id}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className={`font-medium ${relCfg.color}`}>{relCfg.label}:</span>
            <button
              onClick={() => {
                if (ref.target_type === "task" && ref.target_id) {
                  openDetail(ref.target_id);
                }
              }}
              className="flex-1 truncate text-left text-gray-700 hover:underline dark:text-gray-300"
            >
              {ref.target_type}#{ref.target_id?.slice(0, 8)}...
            </button>
            <button
              onClick={() => handleDelete(ref.id)}
              className="text-gray-400 hover:text-red-500"
              title="Remove"
            >
              &times;
            </button>
          </div>
        );
      })}

      {showAdd ? (
        <div className="space-y-1.5 rounded border border-gray-200 p-2 dark:border-gray-700">
          <div className="flex gap-1">
            <select
              value={addRelation}
              onChange={(e) => setAddRelation(e.target.value as RelationType)}
              className="rounded border border-gray-200 px-1 py-0.5 text-[10px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="blocks">Blocks</option>
              <option value="blocked_by">Blocked by</option>
              <option value="related_to">Related to</option>
            </select>
            <select
              value={addTargetType}
              onChange={(e) => setAddTargetType(e.target.value as EntityType)}
              className="rounded border border-gray-200 px-1 py-0.5 text-[10px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="task">Task</option>
              <option value="note">Note</option>
            </select>
          </div>
          <select
            value={addTargetId}
            onChange={(e) => setAddTargetId(e.target.value)}
            onFocus={() => {
              if (allTasks.length === 0) loadTasks();
            }}
            className="w-full rounded border border-gray-200 px-1 py-0.5 text-[10px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="">Select target...</option>
            {allTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <button
              onClick={handleAdd}
              className="rounded bg-primary-600 px-2 py-0.5 text-[10px] text-white hover:bg-primary-700"
            >
              Add
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="text-[10px] text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-[10px] text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          + Add reference
        </button>
      )}
    </div>
  );
}
