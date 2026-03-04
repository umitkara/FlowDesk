import { useEffect, useState, useCallback } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import type { Task, TaskStatus } from "../../../lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "../../../lib/types";
import * as ipc from "../../../lib/ipc";
import { useTaskStore } from "../../../stores/taskStore";
import { useUIStore } from "../../../stores/uiStore";

/**
 * React NodeView component for rendering entity reference nodes
 * as interactive inline chips inside the Tiptap editor.
 *
 * Renders a checkbox, task title, and status badge for @task[id] references.
 * Clicking the checkbox toggles the task status. Clicking the title opens
 * the task detail panel.
 */
export function TaskReferenceView({ node }: NodeViewProps) {
  const entityType: string = node.attrs.entityType;
  const entityId: string = node.attrs.entityId;

  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const openDetail = useTaskStore((s) => s.openDetail);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const fetchTask = useCallback(async () => {
    if (entityType !== "task") {
      setIsLoading(false);
      return;
    }
    try {
      const t = await ipc.getTask(entityId);
      setTask(t);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!task || entityType !== "task") return;

    // Optimistic update
    const isDone = task.status === "done" || task.status === "cancelled";
    setTask({
      ...task,
      status: isDone ? "todo" : "done",
      completed_at: isDone ? null : new Date().toISOString(),
    });

    try {
      const updated = await ipc.toggleTaskStatus(entityId);
      setTask(updated);
    } catch {
      // Revert on error
      await fetchTask();
    }
  };

  const handleOpenDetail = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entityType === "task") {
      setActiveView("tasks");
      openDetail(entityId);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <NodeViewWrapper as="span" className="entity-ref-chip entity-ref-loading">
        <span className="entity-ref-text">Loading...</span>
      </NodeViewWrapper>
    );
  }

  // Error / not found state
  if (error || (entityType === "task" && !task)) {
    return (
      <NodeViewWrapper as="span" className="entity-ref-chip entity-ref-error">
        <span className="entity-ref-text">
          @{entityType}[{entityId.length > 12 ? entityId.slice(0, 8) + "..." : entityId}]
        </span>
      </NodeViewWrapper>
    );
  }

  // Non-task entity types (note, plan) — render as simple badge
  if (entityType !== "task" || !task) {
    return (
      <NodeViewWrapper as="span" className="entity-ref-chip">
        <span className="entity-ref-badge">{entityType}</span>
        <span className="entity-ref-text">@{entityType}[{entityId.slice(0, 8)}...]</span>
      </NodeViewWrapper>
    );
  }

  // Task reference chip
  const isDone = task.status === "done" || task.status === "cancelled";
  const statusCfg = STATUS_CONFIG[task.status as TaskStatus] ?? STATUS_CONFIG.inbox;
  const priorityCfg = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG];

  return (
    <NodeViewWrapper as="span" className="entity-ref-chip entity-ref-task">
      {/* Status checkbox */}
      <span
        role="button"
        tabIndex={-1}
        onClick={handleToggle}
        className={`entity-ref-checkbox ${isDone ? "entity-ref-checkbox-done" : ""}`}
        title={isDone ? "Mark incomplete" : "Mark complete"}
      >
        {isDone && (
          <svg width="8" height="8" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>

      {/* Task title */}
      <span
        role="button"
        tabIndex={-1}
        onClick={handleOpenDetail}
        className={`entity-ref-title ${isDone ? "entity-ref-title-done" : ""}`}
        title={`${task.title} — ${statusCfg.label}${priorityCfg && task.priority !== "none" ? ` · ${priorityCfg.label} priority` : ""}${task.due_date ? ` · Due: ${task.due_date}` : ""}`}
      >
        {task.title}
      </span>

      {/* Status badge */}
      <span className={`entity-ref-status ${statusCfg.color}`}>
        {statusCfg.label}
      </span>
    </NodeViewWrapper>
  );
}
