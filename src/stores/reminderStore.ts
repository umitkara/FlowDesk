import { create } from "zustand";
import type { Reminder, ReminderDefaults } from "../lib/types";
import * as ipc from "../lib/ipc";

/** State and actions for reminder management. */
interface ReminderState {
  /** Global reminder defaults. */
  defaults: ReminderDefaults;
  /** Recently fired reminders for in-app display. */
  firedReminders: Reminder[];

  /** Loads global reminder defaults. */
  loadDefaults: () => Promise<void>;
  /** Updates global reminder defaults. */
  updateDefaults: (defaults: ReminderDefaults) => Promise<void>;
  /** Dismisses a fired reminder. */
  dismissReminder: (reminderId: string) => Promise<void>;
  /** Adds a fired reminder to the in-app list (called by event listener). */
  addFiredReminder: (reminder: Reminder) => void;
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

  addFiredReminder: (reminder) => {
    set((s) => ({
      firedReminders: [...s.firedReminders, reminder],
    }));
  },

  removeFiredReminder: (reminderId) => {
    set((s) => ({
      firedReminders: s.firedReminders.filter((r) => r.id !== reminderId),
    }));
  },
}));
