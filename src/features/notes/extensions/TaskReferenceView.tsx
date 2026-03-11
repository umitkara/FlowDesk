import { useEffect, useState, useCallback } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import type { Task, Plan, TimeEntry, TaskStatus, EntityType } from "../../../lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG, PLAN_TYPE_CONFIG } from "../../../lib/types";
import * as ipc from "../../../lib/ipc";
import { openEntity } from "../../../lib/openEntity";

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
  const [plan, setPlan] = useState<Plan | null>(null);
  const [timeEntry, setTimeEntry] = useState<TimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchEntity = useCallback(async () => {
    try {
      if (entityType === "task") {
        const t = await ipc.getTask(entityId);
        setTask(t);
      } else if (entityType === "plan") {
        const p = await ipc.getPlan(entityId);
        setPlan(p);
      } else if (entityType === "time_entry") {
        const te = await ipc.getTimeEntry(entityId);
        setTimeEntry(te);
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchEntity();
  }, [fetchEntity]);

  // Keep backward-compatible alias
  const fetchTask = fetchEntity;

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
      openEntity({ type: "task", id: entityId });
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
  if (error || (entityType === "task" && !task) || (entityType === "plan" && !plan) || (entityType === "time_entry" && !timeEntry)) {
    return (
      <NodeViewWrapper as="span" className="entity-ref-chip entity-ref-error">
        <span className="entity-ref-text">
          @{entityType}[{entityId.length > 12 ? entityId.slice(0, 8) + "..." : entityId}]
        </span>
      </NodeViewWrapper>
    );
  }

  // Plan reference chip
  if (entityType === "plan" && plan) {
    const typeCfg = PLAN_TYPE_CONFIG[plan.type as keyof typeof PLAN_TYPE_CONFIG];
    return (
      <NodeViewWrapper as="span" className="entity-ref-chip entity-ref-plan">
        <span
          className="inline-block h-2 w-2 rounded-sm"
          style={{ backgroundColor: plan.color || typeCfg?.color || "#6b7280" }}
        />
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openEntity({ type: "plan", id: entityId });
          }}
          className="entity-ref-title"
          title={`${plan.title} — ${typeCfg?.label || plan.type}`}
        >
          {plan.title}
        </span>
        <span className="entity-ref-badge">{typeCfg?.label || plan.type}</span>
      </NodeViewWrapper>
    );
  }

  // Time entry reference chip
  if (entityType === "time_entry" && timeEntry) {
    const mins = timeEntry.active_mins ?? 0;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    const durationStr = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
    const dateStr = (() => {
      try {
        return new Date(timeEntry.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      } catch {
        return "";
      }
    })();
    const label = timeEntry.category || "Session";

    return (
      <NodeViewWrapper as="span" className="entity-ref-chip entity-ref-time-entry">
        <span className="entity-ref-badge">
          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="inline-block mr-0.5">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          {durationStr}
        </span>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openEntity({ type: "time_entry", id: entityId });
          }}
          className="entity-ref-title"
          title={`${label} — ${dateStr} — ${durationStr}`}
        >
          {label}
        </span>
        {dateStr && (
          <span className="entity-ref-status text-gray-400 dark:text-gray-500">{dateStr}</span>
        )}
      </NodeViewWrapper>
    );
  }

  // Non-task/plan entity types (note) — render as simple badge
  if (entityType !== "task" || !task) {
    return (
      <NodeViewWrapper as="span" className="entity-ref-chip">
        <span className="entity-ref-badge">{entityType}</span>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openEntity({ type: entityType as EntityType, id: entityId });
          }}
          className="entity-ref-text cursor-pointer hover:underline"
        >
          @{entityType}[{entityId.slice(0, 8)}...]
        </span>
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
