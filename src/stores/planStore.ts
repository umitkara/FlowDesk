import { create } from "zustand";
import * as ipc from "../lib/ipc";
import { logActivity } from "../lib/activityLog";
import type {
  Plan,
  CreatePlanInput,
  UpdatePlanInput,
  PlanQuery,
  PlanWithLinks,
  DailyPlanSummary,
  AgendaItem,
  SpawnTaskInput,
  SpawnNoteInput,
} from "../lib/types";
import { useWorkspaceStore } from "./workspaceStore";

/** Reads the active workspace ID synchronously from the workspace store. */
function getWorkspaceId(): string {
  const id = useWorkspaceStore.getState().activeWorkspaceId;
  if (!id) throw new Error("No active workspace");
  return id;
}

/** Calendar view type. */
export type CalendarViewType = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek";

/** State and actions for plan/calendar management. */
interface PlanState {
  /** Plans matching the current calendar view date range. */
  plans: Plan[];
  /** Selected plan with linked entities (for detail panel). */
  selectedPlan: PlanWithLinks | null;
  /** Daily summary for the daily plan view. */
  dailySummary: DailyPlanSummary | null;
  /** Agenda items. */
  agendaItems: AgendaItem[];

  /** Current calendar view type. */
  currentView: CalendarViewType;
  /** Current date in ISO format. */
  currentDate: string;
  /** Current daily plan view date. */
  dailyPlanDate: string;

  /** Whether data is loading. */
  loading: boolean;
  /** Error message. */
  error: string | null;
  /** Whether the detail panel is open. */
  isDetailOpen: boolean;
  /** Whether the create/edit dialog is open. */
  isDialogOpen: boolean;
  /** Pre-filled data for the plan dialog. */
  dialogDefaults: Partial<CreatePlanInput> | null;
  /** Plan being edited (null for create mode). */
  editingPlan: Plan | null;

  /** Fetches plans for the given query. */
  fetchPlans: (query: PlanQuery) => Promise<void>;
  /** Fetches a plan with links and opens the detail panel. */
  fetchPlanWithLinks: (id: string) => Promise<void>;
  /** Creates a new plan. */
  createPlan: (input: CreatePlanInput) => Promise<Plan>;
  /** Updates an existing plan. */
  updatePlan: (input: UpdatePlanInput) => Promise<Plan>;
  /** Soft-deletes a plan. */
  deletePlan: (id: string) => Promise<void>;
  /** Fetches the daily plan summary for a date. */
  fetchDailySummary: (date: string) => Promise<void>;
  /** Fetches agenda items for a date range. */
  fetchAgenda: (startDate: string, endDate: string) => Promise<void>;
  /** Spawns a task from the selected plan. */
  spawnTask: (input: SpawnTaskInput) => Promise<void>;
  /** Spawns a note from the selected plan. */
  spawnNote: (input: SpawnNoteInput) => Promise<void>;
  /** Links an existing task to a plan. */
  linkTask: (planId: string, taskId: string, relation: string) => Promise<void>;
  /** Unlinks a task from a plan. */
  unlinkTask: (planId: string, taskId: string) => Promise<void>;

  /** Sets the calendar view type. */
  setCurrentView: (view: CalendarViewType) => void;
  /** Sets the current calendar date. */
  setCurrentDate: (date: string) => void;
  /** Sets the daily plan view date. */
  setDailyPlanDate: (date: string) => void;
  /** Closes the detail panel. */
  closeDetail: () => void;
  /** Opens the plan creation/edit dialog. */
  openDialog: (defaults?: Partial<CreatePlanInput>, editPlan?: Plan) => void;
  /** Closes the plan dialog. */
  closeDialog: () => void;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  selectedPlan: null,
  dailySummary: null,
  agendaItems: [],

  currentView: "timeGridWeek",
  currentDate: new Date().toISOString(),
  dailyPlanDate: new Date().toISOString().slice(0, 10),

  loading: false,
  error: null,
  isDetailOpen: false,
  isDialogOpen: false,
  dialogDefaults: null,
  editingPlan: null,

  fetchPlans: async (query) => {
    set({ loading: true, error: null });
    try {
      const plans = await ipc.listPlans(query);
      set({ plans, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchPlanWithLinks: async (id) => {
    try {
      const data = await ipc.getPlanWithLinks(id);
      set({ selectedPlan: data, isDetailOpen: true });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  createPlan: async (input) => {
    const plan = await ipc.createPlan(input);
    logActivity(`Created plan: ${plan.title}`, "plan", plan.id);
    set((s) => ({ plans: [...s.plans, plan] }));
    // Best-effort refresh of daily summary if the daily plan view has been used
    const { dailySummary, dailyPlanDate } = get();
    if (dailySummary) {
      const wsId = getWorkspaceId();
      ipc.getDailyPlanSummary(wsId, dailyPlanDate).then((s) => set({ dailySummary: s })).catch(() => {});
    }
    return plan;
  },

  updatePlan: async (input) => {
    const updated = await ipc.updatePlan(input);
    set((s) => ({
      plans: s.plans.map((p) => (p.id === updated.id ? updated : p)),
      selectedPlan:
        s.selectedPlan?.plan.id === updated.id
          ? { ...s.selectedPlan, plan: updated }
          : s.selectedPlan,
    }));
    // Best-effort refresh of daily summary if the daily plan view has been used
    const { dailySummary, dailyPlanDate } = get();
    if (dailySummary) {
      const wsId = getWorkspaceId();
      ipc.getDailyPlanSummary(wsId, dailyPlanDate).then((s) => set({ dailySummary: s })).catch(() => {});
    }
    return updated;
  },

  deletePlan: async (id) => {
    const title = get().plans.find((p) => p.id === id)?.title ?? "Untitled";
    await ipc.deletePlan(id);
    logActivity(`Deleted plan: ${title}`, "plan", id);
    set((s) => ({
      plans: s.plans.filter((p) => p.id !== id),
      selectedPlan: s.selectedPlan?.plan.id === id ? null : s.selectedPlan,
      isDetailOpen: s.selectedPlan?.plan.id === id ? false : s.isDetailOpen,
    }));
    // Best-effort refresh of daily summary if the daily plan view has been used
    const { dailySummary, dailyPlanDate } = get();
    if (dailySummary) {
      const wsId = getWorkspaceId();
      ipc.getDailyPlanSummary(wsId, dailyPlanDate).then((s) => set({ dailySummary: s })).catch(() => {});
    }
  },

  fetchDailySummary: async (date) => {
    set({ loading: true, error: null });
    try {
      const wsId = getWorkspaceId();
      const summary = await ipc.getDailyPlanSummary(wsId, date);
      set({ dailySummary: summary, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchAgenda: async (startDate, endDate) => {
    try {
      const wsId = getWorkspaceId();
      const items = await ipc.getAgenda(wsId, startDate, endDate);
      set({ agendaItems: items });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  spawnTask: async (input) => {
    try {
      const linked = await ipc.spawnTaskFromPlan(input);
      logActivity(`Spawned task from plan: ${input.title}`, "task", linked.task_id);
      // Refresh plan links
      const { selectedPlan } = get();
      if (selectedPlan) {
        set({
          selectedPlan: {
            ...selectedPlan,
            linked_tasks: [...selectedPlan.linked_tasks, linked],
          },
        });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  spawnNote: async (input) => {
    try {
      const linked = await ipc.spawnNoteFromPlan(input);
      logActivity(`Spawned note from plan: ${input.title}`, "note", linked.note_id);
      const { selectedPlan } = get();
      if (selectedPlan) {
        set({
          selectedPlan: {
            ...selectedPlan,
            linked_notes: [...selectedPlan.linked_notes, linked],
          },
        });
      }
    } catch (e) {
      set({ error: String(e) });
    }
  },

  linkTask: async (planId, taskId, relation) => {
    await ipc.linkTaskToPlan(planId, taskId, relation);
    // Refresh plan links if this is the selected plan
    const { selectedPlan } = get();
    if (selectedPlan?.plan.id === planId) {
      get().fetchPlanWithLinks(planId);
    }
  },

  unlinkTask: async (planId, taskId) => {
    await ipc.unlinkTaskFromPlan(planId, taskId);
    const { selectedPlan } = get();
    if (selectedPlan?.plan.id === planId) {
      set({
        selectedPlan: {
          ...selectedPlan,
          linked_tasks: selectedPlan.linked_tasks.filter(
            (t) => t.task_id !== taskId
          ),
        },
      });
    }
  },

  setCurrentView: (view) => set({ currentView: view }),
  setCurrentDate: (date) => set({ currentDate: date }),
  setDailyPlanDate: (date) => set({ dailyPlanDate: date }),
  closeDetail: () => set({ isDetailOpen: false, selectedPlan: null }),
  openDialog: (defaults, editPlan) =>
    set({ isDialogOpen: true, dialogDefaults: defaults || null, editingPlan: editPlan || null }),
  closeDialog: () =>
    set({ isDialogOpen: false, dialogDefaults: null, editingPlan: null }),
}));
