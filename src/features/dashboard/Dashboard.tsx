import { useEffect, useState, useCallback } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useUIStore } from "../../stores/uiStore";
import { useNoteStore } from "../../stores/noteStore";
import { useTaskStore } from "../../stores/taskStore";
import { formatMinutes } from "../../stores/trackerStore";
import { DashboardEditor } from "./DashboardEditor";
import type {
  DashboardData,
  DashboardPlan,
  DashboardTask,
  DashboardNote,
  TimeSummary,
} from "../../lib/types";

/** Workspace dashboard with configurable widgets. */
export function Dashboard() {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const dashboardData = useWorkspaceStore((s) => s.dashboardData);
  const loadDashboard = useWorkspaceStore((s) => s.loadDashboard);
  const setActiveView = useUIStore((s) => s.setActiveView);

  const isEditing = useDashboardStore((s) => s.isEditing);
  const loadLayout = useDashboardStore((s) => s.loadLayout);
  const startEditing = useDashboardStore((s) => s.startEditing);
  const widgets = useDashboardStore((s) => s.widgets);

  useEffect(() => {
    if (activeWorkspace) {
      loadDashboard();
      loadLayout();
    }
  }, [activeWorkspace?.id, loadDashboard, loadLayout]);

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        No workspace selected
      </div>
    );
  }

  if (isEditing) {
    return <DashboardEditor />;
  }

  if (!dashboardData) {
    return <DashboardSkeleton name={activeWorkspace.name} icon={activeWorkspace.icon} />;
  }

  // Use ordered widgets from the store (synced from config)
  const widgetOrder = widgets.length > 0 ? widgets : activeWorkspace.config.dashboard_widgets;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {activeWorkspace.icon && (
                <span className="mr-2">{activeWorkspace.icon}</span>
              )}
              {activeWorkspace.name}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Welcome to your workspace dashboard.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              title="Customize dashboard layout"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
              </svg>
              Edit Layout
            </button>
            <button
              onClick={() => setActiveView("workspace-settings")}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              title="Workspace settings"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </div>
        </div>

        {/* Widget Grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {widgetOrder.map((type) => (
            <WidgetRenderer key={type} type={type} data={dashboardData} />
          ))}
        </div>

        {widgetOrder.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-16 dark:border-gray-700">
            <p className="mb-3 text-sm text-gray-400 dark:text-gray-500">
              No widgets on this dashboard.
            </p>
            <button
              onClick={startEditing}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: "var(--workspace-accent)" }}
            >
              Add Widgets
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Routes a widget type string to the correct widget component. */
function WidgetRenderer({ type, data }: { type: string; data: DashboardData }) {
  switch (type) {
    case "today_plan":
      return <TodayPlanWidget plans={data.today_plan} />;
    case "pending_tasks":
      return <PendingTasksWidget tasks={data.pending_tasks} />;
    case "recent_notes":
      return <RecentNotesWidget notes={data.recent_notes} />;
    case "time_today":
      return <TimeTodayWidget summary={data.time_today} />;
    case "sticky_tasks":
      return <StickyTasksWidget tasks={data.sticky_tasks} />;
    case "upcoming_deadlines":
      return <UpcomingDeadlinesWidget tasks={data.upcoming_deadlines} />;
    case "quick_capture":
      return <QuickCaptureWidget />;
    default:
      return null;
  }
}

/** Loading skeleton for the dashboard. */
function DashboardSkeleton({ name, icon }: { name: string; icon: string | null }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {icon && <span className="mr-2">{icon}</span>}
            {name}
          </h1>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Reusable dashboard card wrapper. */
function DashboardCard({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800/80">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </h3>
        {count !== undefined && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** Formats an ISO time string to a short display time. */
function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(11, 16);
  }
}

/** Returns a relative time string like "2h ago". */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Priority indicator dot. */
function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    urgent: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-400",
    none: "bg-gray-300 dark:bg-gray-600",
  };
  return (
    <span
      className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${colors[priority] ?? colors.none}`}
      title={priority}
    />
  );
}

/** Status indicator label. */
function StatusLabel({ status }: { status: string }) {
  const colors: Record<string, string> = {
    inbox: "text-gray-400",
    todo: "text-blue-500",
    in_progress: "text-amber-500",
    done: "text-green-500",
  };
  return (
    <span className={`text-[10px] font-medium uppercase ${colors[status] ?? "text-gray-400"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function TodayPlanWidget({ plans }: { plans: DashboardPlan[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <DashboardCard title="Today's Plan" count={plans.length}>
      {plans.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No plans for today
        </p>
      ) : (
        <ul className="space-y-1.5">
          {plans.map((plan) => (
            <li key={plan.id} className="flex items-center gap-2 text-sm">
              <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                {formatTime(plan.start_time)}
              </span>
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: plan.color ?? "var(--workspace-accent)" }}
              />
              <span className="truncate text-gray-700 dark:text-gray-300">
                {plan.title}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setActiveView("daily-plan")}
        className="mt-2 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
      >
        View daily plan &rarr;
      </button>
    </DashboardCard>
  );
}

function PendingTasksWidget({ tasks }: { tasks: DashboardTask[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <DashboardCard title="Pending Tasks" count={tasks.length}>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          All caught up!
        </p>
      ) : (
        <ul className="space-y-1">
          {tasks.slice(0, 8).map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-sm">
              <PriorityDot priority={task.priority} />
              <span className="truncate text-gray-700 dark:text-gray-300">
                {task.title}
              </span>
              <StatusLabel status={task.status} />
            </li>
          ))}
          {tasks.length > 8 && (
            <li className="text-xs text-gray-400">
              +{tasks.length - 8} more
            </li>
          )}
        </ul>
      )}
      <button
        onClick={() => setActiveView("tasks")}
        className="mt-2 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
      >
        View all tasks &rarr;
      </button>
    </DashboardCard>
  );
}

function RecentNotesWidget({ notes }: { notes: DashboardNote[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <DashboardCard title="Recent Notes">
      {notes.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No recent notes
        </p>
      ) : (
        <ul className="space-y-1">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center justify-between text-sm">
              <span className="truncate text-gray-700 dark:text-gray-300">
                {note.title || "Untitled"}
              </span>
              <span className="flex-shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                {relativeTime(note.updated_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setActiveView("notes")}
        className="mt-2 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
      >
        View all notes &rarr;
      </button>
    </DashboardCard>
  );
}

function TimeTodayWidget({ summary }: { summary: TimeSummary }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <DashboardCard title="Time Today">
      <div
        className="text-3xl font-mono font-bold"
        style={{ color: "var(--workspace-accent)" }}
      >
        {formatMinutes(summary.active_mins)}
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {summary.entry_count} session{summary.entry_count !== 1 ? "s" : ""} &middot;{" "}
        {formatMinutes(summary.total_mins)} total
      </p>
      <button
        onClick={() => setActiveView("time-reports")}
        className="mt-2 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
      >
        View time reports &rarr;
      </button>
    </DashboardCard>
  );
}

function StickyTasksWidget({ tasks }: { tasks: DashboardTask[] }) {
  return (
    <DashboardCard title="Sticky Tasks" count={tasks.length}>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No sticky tasks
        </p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-sm">
              <PriorityDot priority={task.priority} />
              <span className="truncate text-gray-700 dark:text-gray-300">
                {task.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function UpcomingDeadlinesWidget({ tasks }: { tasks: DashboardTask[] }) {
  return (
    <DashboardCard title="Upcoming Deadlines" count={tasks.length}>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No upcoming deadlines
        </p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <PriorityDot priority={task.priority} />
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {task.title}
                </span>
              </span>
              {task.due_date && (
                <span className="flex-shrink-0 text-[10px] text-gray-400">
                  {task.due_date}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

/** Quick capture widget — create a note or task with one keystroke. */
function QuickCaptureWidget() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"note" | "task">("task");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createNote = useNoteStore((s) => s.createNote);
  const createTask = useTaskStore((s) => s.createTask);
  const loadDashboard = useWorkspaceStore((s) => s.loadDashboard);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      if (mode === "task") {
        // workspace_id is auto-filled by the store
        await createTask({ workspace_id: "", title: trimmed });
      } else {
        await createNote({ workspace_id: "", title: trimmed, note_type: "note" });
      }
      setText("");
      loadDashboard();
    } finally {
      setIsSubmitting(false);
    }
  }, [text, mode, createNote, createTask, loadDashboard]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <DashboardCard title="Quick Capture">
      <div className="space-y-2">
        {/* Mode toggle */}
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5 dark:bg-gray-700/60">
          <button
            onClick={() => setMode("task")}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              mode === "task"
                ? "bg-white text-gray-700 shadow-sm dark:bg-gray-600 dark:text-gray-200"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Task
          </button>
          <button
            onClick={() => setMode("note")}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              mode === "note"
                ? "bg-white text-gray-700 shadow-sm dark:bg-gray-600 dark:text-gray-200"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            Note
          </button>
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "task" ? "New task..." : "New note title..."}
            className="flex-1 rounded-md border border-gray-200 bg-transparent px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-gray-300 dark:border-gray-600 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:border-gray-500"
            disabled={isSubmitting}
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isSubmitting}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: "var(--workspace-accent)" }}
          >
            {isSubmitting ? "..." : "Add"}
          </button>
        </div>

        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          Press Enter to add
        </p>
      </div>
    </DashboardCard>
  );
}
