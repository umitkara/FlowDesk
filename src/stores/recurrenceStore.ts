import { create } from "zustand";
import type { RecurrenceRule, CreateRecurrenceRuleInput, UpdateRecurrenceRuleInput, EntitySummary } from "../lib/types";
import * as ipc from "../lib/ipc";

/** State and actions for recurrence rule management. */
interface RecurrenceState {
  /** Cached rules keyed by rule ID. */
  rules: Record<string, RecurrenceRule>;
  /** Loading state. */
  isLoading: boolean;

  /** Loads the recurrence rule for an entity (task/plan). */
  loadRuleForEntity: (entityType: string, entityId: string) => Promise<RecurrenceRule | null>;
  /** Creates a new recurrence rule. */
  createRule: (input: CreateRecurrenceRuleInput) => Promise<RecurrenceRule>;
  /** Updates a recurrence rule. */
  updateRule: (ruleId: string, update: UpdateRecurrenceRuleInput) => Promise<RecurrenceRule>;
  /** Deletes a recurrence rule. */
  deleteRule: (ruleId: string) => Promise<void>;
  /** Skips the next occurrence. */
  skipNext: (ruleId: string) => Promise<RecurrenceRule>;
  /** Postpones the next occurrence to a specific date. */
  postponeNext: (ruleId: string, newDate: string) => Promise<RecurrenceRule>;
  /** Detaches a single occurrence from its rule. */
  detachOccurrence: (entityType: string, entityId: string) => Promise<void>;
  /** Updates rule for all future occurrences. */
  editFuture: (ruleId: string, update: UpdateRecurrenceRuleInput) => Promise<void>;
  /** Soft-deletes all occurrences after a given index. */
  deleteFuture: (ruleId: string, afterIndex: number) => Promise<void>;
  /** Lists occurrences within a date range. */
  getOccurrences: (ruleId: string, fromDate: string, toDate: string) => Promise<EntitySummary[]>;
}

export const useRecurrenceStore = create<RecurrenceState>((set) => ({
  rules: {},
  isLoading: false,

  loadRuleForEntity: async (entityType, entityId) => {
    set({ isLoading: true });
    try {
      const rule = await ipc.getRecurrenceRuleForEntity(entityType, entityId);
      if (rule) {
        set((s) => ({ rules: { ...s.rules, [rule.id]: rule } }));
      }
      return rule;
    } finally {
      set({ isLoading: false });
    }
  },

  createRule: async (input) => {
    const rule = await ipc.createRecurrenceRule(input);
    set((s) => ({ rules: { ...s.rules, [rule.id]: rule } }));
    return rule;
  },

  updateRule: async (ruleId, update) => {
    const rule = await ipc.updateRecurrenceRule(ruleId, update);
    set((s) => ({ rules: { ...s.rules, [rule.id]: rule } }));
    return rule;
  },

  deleteRule: async (ruleId) => {
    await ipc.deleteRecurrenceRule(ruleId);
    set((s) => {
      const { [ruleId]: _, ...rest } = s.rules;
      return { rules: rest };
    });
  },

  skipNext: async (ruleId) => {
    const rule = await ipc.skipNextOccurrence(ruleId);
    set((s) => ({ rules: { ...s.rules, [rule.id]: rule } }));
    return rule;
  },

  postponeNext: async (ruleId, newDate) => {
    const rule = await ipc.postponeNextOccurrence(ruleId, newDate);
    set((s) => ({ rules: { ...s.rules, [rule.id]: rule } }));
    return rule;
  },

  detachOccurrence: async (entityType, entityId) => {
    await ipc.detachOccurrence(entityType, entityId);
  },

  editFuture: async (ruleId, update) => {
    await ipc.editFutureOccurrences(ruleId, update);
    // Reload the rule to get updated state
    try {
      const rule = await ipc.getRecurrenceRule(ruleId);
      set((s) => ({ rules: { ...s.rules, [rule.id]: rule } }));
    } catch { /* rule may have been deleted */ }
  },

  deleteFuture: async (ruleId, afterIndex) => {
    await ipc.deleteFutureOccurrences(ruleId, afterIndex);
  },

  getOccurrences: async (ruleId, fromDate, toDate) => {
    return ipc.getOccurrences(ruleId, fromDate, toDate);
  },
}));
