import * as ipc from "../../../lib/ipc";
import type { TaskFilter, TaskWithChildren, Plan, TimeEntry } from "../../../lib/types";
import type { SuggestionItem } from "./EntitySuggestionList";
import { useWorkspaceStore } from "../../../stores/workspaceStore";

let cachedTasks: TaskWithChildren[] | null = null;
let cachedPlans: Plan[] | null = null;
let cachedTimeEntries: TimeEntry[] | null = null;
let cacheExpiry = 0;
let cachedWorkspaceId = "";

export function invalidateCache(): void {
  cacheExpiry = 0;
}

export function getCachedTasks(): TaskWithChildren[] {
  return cachedTasks ?? [];
}

export async function getSuggestionItems(query: string): Promise<SuggestionItem[]> {
  try {
    const wsId = useWorkspaceStore.getState().activeWorkspaceId;
    if (!wsId) return [];
    // Invalidate cache if workspace changed
    if (wsId !== cachedWorkspaceId) {
      cachedTasks = null;
      cachedPlans = null;
      cachedTimeEntries = null;
      cachedWorkspaceId = wsId;
    }
    if (!cachedTasks || !cachedPlans || !cachedTimeEntries || Date.now() > cacheExpiry) {
      const filter: TaskFilter = { workspace_id: wsId };
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      const monthAhead = new Date(now.getTime() + 30 * 86400000);
      const [tasks, plans, timeEntries] = await Promise.all([
        ipc.listTasks(filter, { field: "updated_at", direction: "desc" }),
        ipc.listPlans({
          workspace_id: wsId,
          start_after: monthAgo.toISOString(),
          end_before: monthAhead.toISOString(),
        }),
        ipc.listTimeEntries({ workspaceId: wsId, limit: 20 }),
      ]);
      cachedTasks = tasks;
      cachedPlans = plans;
      cachedTimeEntries = timeEntries;
      cacheExpiry = Date.now() + 30000;
    }

    const q = query.toLowerCase();

    const taskResults: SuggestionItem[] = (q
      ? cachedTasks.filter((t) => t.title.toLowerCase().includes(q))
      : cachedTasks
    ).slice(0, 6).map((t) => ({
      entityType: "task" as const,
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
    }));

    const planResults: SuggestionItem[] = (q
      ? cachedPlans.filter((p) => p.title.toLowerCase().includes(q))
      : cachedPlans
    ).slice(0, 4).map((p) => ({
      entityType: "plan" as const,
      id: p.id,
      title: p.title,
      planType: p.type,
      startTime: p.start_time,
    }));

    const timeEntryResults: SuggestionItem[] = (q
      ? cachedTimeEntries.filter((te) => {
          const label = formatTimeEntryLabel(te);
          return label.toLowerCase().includes(q);
        })
      : cachedTimeEntries
    ).slice(0, 4).map((te) => ({
      entityType: "time_entry" as const,
      id: te.id,
      title: formatTimeEntryLabel(te),
      duration: formatDuration(te.active_mins),
      startTime: te.start_time,
    }));

    return [...taskResults, ...planResults, ...timeEntryResults].slice(0, 10);
  } catch {
    return [];
  }
}

function formatTimeEntryLabel(te: TimeEntry): string {
  if (te.category) return te.category;
  try {
    const d = new Date(te.start_time);
    return `Session on ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  } catch {
    return "Session";
  }
}

function formatDuration(mins: number | null): string {
  if (mins == null || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
