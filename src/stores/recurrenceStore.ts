import { create } from "zustand";
import type { RecurrenceRule, CreateRecurrenceRuleInput, UpdateRecurrenceRuleInput } from "../lib/types";
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
}));
