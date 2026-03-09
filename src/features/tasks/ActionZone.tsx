import { useState, useRef, useEffect } from "react";
import type { Task } from "../../lib/types";
import { useTrackerStore } from "../../stores/trackerStore";
import { useTaskStore } from "../../stores/taskStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import * as ipc from "../../lib/ipc";

/** Context-aware action buttons for the task detail panel. */
export function ActionZone({ task }: { task: Task }) {
  const trackerStatus = useTrackerStore((s) => s.status);
  const trackerLinkedTaskId = useTrackerStore((s) => s.linkedTaskId);
  const elapsedSeconds = useTrackerStore((s) => s.elapsedSeconds);
  const start = useTrackerStore((s) => s.start);
  const stop = useTrackerStore((s) => s.stop);
  const updateTask = useTaskStore((s) => s.updateTask);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const isDone = task.status === "done" || task.status === "cancelled";
  const isTrackingThis = trackerStatus !== "idle" && trackerLinkedTaskId === task.id;

  // State 3: Task done/cancelled
  if (isDone) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {task.status === "done" ? "Completed" : "Cancelled"}{" "}
          {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : ""}
        </span>
        <button
          onClick={() => updateTask(task.id, { status: "todo" })}
          className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-white dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Reopen
        </button>
      </div>
    );
  }

  // State 2: Tracker running on THIS task
  if (isTrackingThis) {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/20">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {display}
          </span>
        </div>
        <button
          onClick={() => stop()}
          className="rounded-md bg-red-100 px-3 py-1 text-[11px] font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
        >
          Stop
        </button>
      </div>
    );
  }

  // State 1: Not done, tracker idle or tracking a different task
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={async () => {
          if (task.status === "inbox" || task.status === "todo") {
            await updateTask(task.id, { status: "in_progress" });
          }
          start({ linkedTaskId: task.id, category: task.category || undefined });
        }}
        disabled={trackerStatus !== "idle"}
        className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Start Work
      </button>
      <DeferMenu task={task} />
      <ConvertToPlanButton task={task} workspaceId={activeWorkspaceId || ""} />
    </div>
  );
}

/** Defer dropdown: Tomorrow / Next Monday / Next Week / Pick date / Remove */
function DeferMenu({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const updateTask = useTaskStore((s) => s.updateTask);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const defer = (date: string | null) => {
    updateTask(task.id, { scheduled_date: date });
    setOpen(false);
  };

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  };

  const nextMonday = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  };

  const nextWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        title="Defer"
      >
        Defer
        <svg className="ml-1 inline-block h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          <button onClick={() => defer(tomorrow())} className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800">
            Tomorrow
          </button>
          <button onClick={() => defer(nextMonday())} className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800">
            Next Monday
          </button>
          <button onClick={() => defer(nextWeek())} className="block w-full px-3 py-1 text-left text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800">
            Next Week
          </button>
          <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
          {task.scheduled_date && (
            <button onClick={() => defer(null)} className="block w-full px-3 py-1 text-left text-xs text-red-500 hover:bg-gray-50 dark:hover:bg-gray-800">
              Remove Date
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Convert task to plan block button. */
function ConvertToPlanButton({
  task,
  workspaceId,
}: {
  task: Task;
  workspaceId: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleConvert = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const now = new Date();
      const estMins = task.estimated_mins ?? 30;
      const end = new Date(now.getTime() + estMins * 60000);
      const plan = await ipc.createPlan({
        workspace_id: workspaceId,
        title: task.title,
        start_time: now.toISOString(),
        end_time: end.toISOString(),
        type: "time_block",
        category: task.category ?? undefined,
      });
      await ipc.createReference({
        source_type: "task",
        source_id: task.id,
        target_type: "plan",
        target_id: plan.id,
        relation: "scheduled_in",
      });
    } catch {
      // best effort
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleConvert}
      disabled={loading}
      className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
      title="Convert to Plan Block"
    >
      {loading ? "..." : "→ Plan"}
    </button>
  );
}
