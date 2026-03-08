import * as ipc from "../../../lib/ipc";
import type { TaskFilter, TaskWithChildren, Plan } from "../../../lib/types";
import type { SuggestionItem } from "./EntitySuggestionList";
import { useWorkspaceStore } from "../../../stores/workspaceStore";

let cachedTasks: TaskWithChildren[] | null = null;
let cachedPlans: Plan[] | null = null;
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
      cachedWorkspaceId = wsId;
    }
    if (!cachedTasks || !cachedPlans || Date.now() > cacheExpiry) {
      const filter: TaskFilter = { workspace_id: wsId };
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      const monthAhead = new Date(now.getTime() + 30 * 86400000);
      const [tasks, plans] = await Promise.all([
        ipc.listTasks(filter, { field: "updated_at", direction: "desc" }),
        ipc.listPlans({
          workspace_id: wsId,
          start_after: monthAgo.toISOString(),
          end_before: monthAhead.toISOString(),
        }),
      ]);
      cachedTasks = tasks;
      cachedPlans = plans;
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

    return [...taskResults, ...planResults].slice(0, 8);
  } catch {
    return [];
  }
}
