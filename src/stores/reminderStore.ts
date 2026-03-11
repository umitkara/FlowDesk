import { create } from "zustand";
import type { ReminderDefaults, ReminderFiredPayload } from "../lib/types";
import * as ipc from "../lib/ipc";

/** A fired reminder with its resolved entity title. */
export interface FiredReminderEntry {
  id: string;
  entityType: "task" | "plan";
  entityId: string;
  title: string;
}

/** State and actions for reminder management. */
interface ReminderState {
  /** Global reminder defaults. */
  defaults: ReminderDefaults;
  /** Recently fired reminders for in-app display. */
  firedReminders: FiredReminderEntry[];

  /** Loads global reminder defaults. */
  loadDefaults: () => Promise<void>;
  /** Updates global reminder defaults. */
  updateDefaults: (defaults: ReminderDefaults) => Promise<void>;
  /** Dismisses a fired reminder. */
  dismissReminder: (reminderId: string) => Promise<void>;
  /** Adds a fired reminder to the in-app list (called by event listener). */
  addFiredReminder: (payload: ReminderFiredPayload) => void;
  /** Removes a reminder from the in-app fired list. */
  removeFiredReminder: (reminderId: string) => void;
}

export const useReminderStore = create<ReminderState>((set) => ({
  defaults: { task_due: ["1hr_before"], plan_start: ["15min_before"], enabled: true },
  firedReminders: [],

  loadDefaults: async () => {
    try {
      const defaults = await ipc.getReminderDefaults();
      set({ defaults });
    } catch {
      // Use local defaults if backend fails
    }
  },

  updateDefaults: async (defaults) => {
    await ipc.updateReminderDefaults(defaults);
    set({ defaults });
  },

  dismissReminder: async (reminderId) => {
    await ipc.dismissReminder(reminderId);
    set((s) => ({
      firedReminders: s.firedReminders.filter((r) => r.id !== reminderId),
    }));
  },

  addFiredReminder: (payload) => {
    const entry: FiredReminderEntry = {
      id: payload.reminder.id,
      entityType: payload.reminder.entity_type,
      entityId: payload.reminder.entity_id,
      title: payload.title,
    };
    set((s) => ({
      firedReminders: [...s.firedReminders, entry],
    }));
  },

  removeFiredReminder: (reminderId) => {
    set((s) => ({
      firedReminders: s.firedReminders.filter((r) => r.id !== reminderId),
    }));
  },
}));
