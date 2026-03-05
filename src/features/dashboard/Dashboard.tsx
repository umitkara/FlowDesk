import { useEffect } from "react";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useUIStore } from "../../stores/uiStore";
import { formatMinutes } from "../../stores/trackerStore";
import type {
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

  useEffect(() => {
    if (activeWorkspace) {
      loadDashboard();
    }
  }, [activeWorkspace?.id, loadDashboard]);

  if (!activeWorkspace) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        No workspace selected
      </div>
    );
  }

  if (!dashboardData) {
    return <DashboardSkeleton name={activeWorkspace.name} icon={activeWorkspace.icon} />;
  }

  const widgets = activeWorkspace.config.dashboard_widgets;

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

        {/* Widget Grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {widgets.includes("today_plan") && (
            <TodayPlanWidget plans={dashboardData.today_plan} />
          )}
          {widgets.includes("pending_tasks") && (
            <PendingTasksWidget tasks={dashboardData.pending_tasks} />
          )}
          {widgets.includes("recent_notes") && (
            <RecentNotesWidget notes={dashboardData.recent_notes} />
          )}
          {widgets.includes("time_today") && (
            <TimeTodayWidget summary={dashboardData.time_today} />
          )}
          {widgets.includes("sticky_tasks") && (
            <StickyTasksWidget tasks={dashboardData.sticky_tasks} />
          )}
          {widgets.includes("upcoming_deadlines") && (
            <UpcomingDeadlinesWidget tasks={dashboardData.upcoming_deadlines} />
          )}
        </div>
      </div>
    </div>
  );
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
