import { create } from "zustand";
import type {
  TrackerStatus,
  Pause,
  SessionNote,
  BreakMode,
  BreakConfig,
  TimeEntry,
  CreateTaskFromSession,
  CreateNoteFromSession,
} from "../lib/types";
import * as ipc from "../lib/ipc";
import { useWorkspaceStore } from "./workspaceStore";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// ---------------------------------------------------------------------------
// Elapsed time calculation (client-side, updated every second)
// ---------------------------------------------------------------------------

/** Computes total active seconds from start, subtracting completed and ongoing pauses. */
export function calculateElapsedSeconds(
  startedAt: string,
  pauses: Pause[],
  pausedAt: string | null,
): number {
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) return 0;

  const effectiveEnd = pausedAt ? new Date(pausedAt).getTime() : Date.now();
  const totalMs = Math.max(0, effectiveEnd - start);

  let pauseMs = 0;
  for (const p of pauses) {
    const pStart = new Date(p.paused_at).getTime();
    const pEnd = p.resumed_at ? new Date(p.resumed_at).getTime() : effectiveEnd;
    pauseMs += Math.max(0, pEnd - pStart);
  }

  return Math.max(0, Math.floor((totalMs - pauseMs) / 1000));
}

/** Formats seconds as HH:MM:SS. */
export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Formats minutes as a human-readable duration (e.g. "1h 23m"). */
export function formatMinutes(mins: number): string {
  if (mins < 1) return "< 1m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Store definition
// ---------------------------------------------------------------------------

/** Tracker store state and actions. */
interface TrackerStore {
  // --- Backend-mirrored state ---
  status: TrackerStatus;
  timeEntryId: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  pauses: Pause[];
  notes: string;
  sessionNotes: SessionNote[];
  linkedPlanId: string | null;
  linkedTaskId: string | null;
  category: string | null;
  tags: string[];
  breakMode: BreakMode;
  breakConfig: BreakConfig;
  pomodoroCycle: number;

  // --- Frontend-only state ---
  /** Active elapsed seconds, updated every second. */
  elapsedSeconds: number;
  /** Whether the detail form modal is shown (after stop). */
  showDetailForm: boolean;
  /** Whether the recovery dialog is shown (on startup with interrupted session). */
  showRecoveryDialog: boolean;
  /** Whether the running notes dropdown is expanded. */
  isNotesExpanded: boolean;
  /** Computed active_mins from the stop response (for detail form). */
  stoppedActiveMins: number | null;
  /** End time from the stop response (for detail form). */
  stoppedEndTime: string | null;
  /** Loading indicator. */
  isLoading: boolean;
  /** Error message. */
  error: string | null;
  /** In-app break notification (title + body). */
  breakNotification: { title: string; body: string } | null;
  /** Whether the user is currently on a break. */
  isOnBreak: boolean;
  /** Elapsed seconds at which the break ends (for "break over" notification). */
  breakEndsAtSeconds: number | null;
  /** The workspace ID where the current tracking session was started. */
  trackerWorkspaceId: string | null;

  // --- Actions ---
  start: (params?: {
    linkedPlanId?: string;
    linkedTaskId?: string;
    category?: string;
    tags?: string[];
  }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  saveDetail: (params: {
    notes?: string;
    category?: string;
    tags?: string[];
    linkedPlanId?: string;
    linkedTaskId?: string;
    createTask?: CreateTaskFromSession;
    createNote?: CreateNoteFromSession;
  }) => Promise<TimeEntry | null>;
  discard: () => Promise<void>;
  updateNotes: (notes: string) => Promise<void>;
  addSessionNote: (
    text: string,
    refType?: string,
    refId?: string,
  ) => Promise<SessionNote | null>;
  editSessionNote: (index: number, text: string) => Promise<void>;
  deleteSessionNote: (index: number) => Promise<void>;
  setBreakMode: (mode: BreakMode, config?: BreakConfig) => Promise<void>;
  snoozeBreak: () => Promise<void>;
  recoverSession: (action: "resume" | "stop") => Promise<void>;
  toggleNotesExpanded: () => void;
  openSessionNoteInput: () => void;
  dismissBreakNotification: () => void;
  setBreakNotification: (notif: { title: string; body: string }) => void;
  fetchState: () => Promise<void>;
}

// Timer management (module-level to avoid GC issues)
let intervalId: number | null = null;

/** Starts the 1-second elapsed timer. */
function startElapsedTimer(get: () => TrackerStore, set: (partial: Partial<TrackerStore>) => void) {
  stopElapsedTimer();
  initBreakReminder(get);
  let trayCounter = 0;
  intervalId = window.setInterval(() => {
    const { startedAt, pauses, pausedAt, status } = get();
    if (!startedAt || status === "idle") return;
    const elapsed = calculateElapsedSeconds(startedAt, pauses, pausedAt);
    set({ elapsedSeconds: elapsed });
    // Check break reminder on every tick
    checkBreakReminder(get, set);
    // Update tray tooltip every 5 seconds to avoid excessive IPC
    trayCounter++;
    if (trayCounter % 5 === 0) {
      ipc.updateTrayStatus(status, formatElapsed(elapsed)).catch(() => {});
    }
  }, 1000);
}

/** Stops the elapsed timer. */
function stopElapsedTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// ---------------------------------------------------------------------------
// Break reminder logic (frontend-driven)
// ---------------------------------------------------------------------------

/** Tracks the next break threshold in active seconds so we fire exactly once per interval. */
let nextBreakAtSeconds: number | null = null;

/** Sends an OS notification for break reminders (if sound_enabled) and always sets in-app banner. */
async function fireBreakNotification(title: string, body: string, set: (partial: Partial<TrackerStore>) => void, get: () => TrackerStore) {
  // Always set in-app break notification banner
  set({ breakNotification: { title, body } });

  // Only send OS notification if sound_enabled
  if (!get().breakConfig.sound_enabled) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // notification unavailable — silently ignore
  }
}

/** Computes the next break threshold (in active seconds) based on mode + config. */
function computeNextBreakSeconds(
  mode: BreakMode,
  config: BreakConfig,
  _pomodoroCycle: number,
  currentElapsed: number,
): number | null {
  if (mode === "none") return null;

  if (mode === "custom") {
    const intervalSec = config.custom.interval_mins * 60;
    if (intervalSec <= 0) return null;
    // Next multiple of interval after current elapsed
    return (Math.floor(currentElapsed / intervalSec) + 1) * intervalSec;
  }

  if (mode === "pomodoro") {
    const workSec = config.pomodoro.work_mins * 60;
    if (workSec <= 0) return null;
    // In Pomodoro mode, each work interval triggers a break notification
    // The cycle count determines short vs long break messaging
    return (Math.floor(currentElapsed / workSec) + 1) * workSec;
  }

  return null;
}

/** Checks whether a break should fire and sends notification if so. Also checks for break-over. */
function checkBreakReminder(get: () => TrackerStore, set: (partial: Partial<TrackerStore>) => void) {
  const { breakMode, breakConfig, pomodoroCycle, elapsedSeconds, status, isOnBreak, breakEndsAtSeconds } = get();

  // Check break-over first
  if (isOnBreak && breakEndsAtSeconds !== null && elapsedSeconds >= breakEndsAtSeconds) {
    fireBreakNotification("Break Over!", "Time to get back to work.", set, get);
    set({ isOnBreak: false, breakEndsAtSeconds: null });
    return;
  }

  if (status !== "running" || breakMode === "none") return;
  if (nextBreakAtSeconds === null) return;

  if (elapsedSeconds >= nextBreakAtSeconds) {
    // Compute break duration for the break-over timer
    let breakDurationSecs: number;
    if (breakMode === "pomodoro") {
      const cyclesBeforeLong = breakConfig.pomodoro.cycles_before_long || 4;
      const currentCycle = Math.floor(nextBreakAtSeconds / (breakConfig.pomodoro.work_mins * 60));
      const isLongBreak = currentCycle % cyclesBeforeLong === 0;
      const breakMins = isLongBreak
        ? breakConfig.pomodoro.long_break_mins
        : breakConfig.pomodoro.short_break_mins;
      breakDurationSecs = breakMins * 60;
      fireBreakNotification(
        isLongBreak ? "Long Break Time!" : "Short Break Time!",
        `You've been working for ${breakConfig.pomodoro.work_mins} minutes. Take a ${breakMins}-minute break.`,
        set, get,
      );
    } else {
      breakDurationSecs = breakConfig.custom.interval_mins * 60;
      fireBreakNotification(
        "Break Reminder",
        `You've been working for ${breakConfig.custom.interval_mins} minutes. Time for a break!`,
        set, get,
      );
    }

    // Set break-over timer
    set({ isOnBreak: true, breakEndsAtSeconds: elapsedSeconds + breakDurationSecs });

    // Advance to next threshold
    nextBreakAtSeconds = computeNextBreakSeconds(
      breakMode,
      breakConfig,
      pomodoroCycle,
      elapsedSeconds,
    );
  }
}

/** Initializes the break reminder threshold based on current state. */
function initBreakReminder(get: () => TrackerStore) {
  const { breakMode, breakConfig, pomodoroCycle, elapsedSeconds } = get();
  nextBreakAtSeconds = computeNextBreakSeconds(breakMode, breakConfig, pomodoroCycle, elapsedSeconds);
}

/** Resets the break reminder state. */
function resetBreakReminder() {
  nextBreakAtSeconds = null;
}

/** Syncs the store from a backend TrackerState response. */
function syncFromBackend(
  state: {
    status: TrackerStatus;
    time_entry_id: string | null;
    started_at: string | null;
    paused_at: string | null;
    pauses: Pause[];
    notes: string;
    session_notes: SessionNote[];
    linked_plan_id: string | null;
    linked_task_id: string | null;
    category: string | null;
    tags: string[];
    break_mode: BreakMode;
    break_config: BreakConfig;
    pomodoro_cycle: number;
    active_mins?: number | null;
    end_time?: string | null;
  },
): Partial<TrackerStore> {
  return {
    status: state.status,
    timeEntryId: state.time_entry_id,
    startedAt: state.started_at,
    pausedAt: state.paused_at,
    pauses: state.pauses,
    notes: state.notes,
    sessionNotes: state.session_notes,
    linkedPlanId: state.linked_plan_id,
    linkedTaskId: state.linked_task_id,
    category: state.category,
    tags: state.tags,
    breakMode: state.break_mode,
    breakConfig: state.break_config,
    pomodoroCycle: state.pomodoro_cycle,
  };
}

const DEFAULT_BREAK_CONFIG: BreakConfig = {
  pomodoro: { work_mins: 25, short_break_mins: 5, long_break_mins: 15, cycles_before_long: 4 },
  custom: { interval_mins: 45 },
  sound_enabled: true,
  snooze_mins: 5,
};

export const useTrackerStore = create<TrackerStore>((set, get) => ({
  // Initial state
  status: "idle",
  timeEntryId: null,
  startedAt: null,
  pausedAt: null,
  pauses: [],
  notes: "",
  sessionNotes: [],
  linkedPlanId: null,
  linkedTaskId: null,
  category: null,
  tags: [],
  breakMode: "none",
  breakConfig: DEFAULT_BREAK_CONFIG,
  pomodoroCycle: 0,
  elapsedSeconds: 0,
  showDetailForm: false,
  showRecoveryDialog: false,
  isNotesExpanded: false,
  stoppedActiveMins: null,
  stoppedEndTime: null,
  isLoading: false,
  error: null,
  breakNotification: null,
  isOnBreak: false,
  breakEndsAtSeconds: null,
  trackerWorkspaceId: null,

  start: async (params) => {
    try {
      set({ isLoading: true, error: null });
      const wsId = useWorkspaceStore.getState().activeWorkspaceId ?? "";
      const result = await ipc.trackerStart({
        workspaceId: wsId,
        linkedPlanId: params?.linkedPlanId,
        linkedTaskId: params?.linkedTaskId,
        category: params?.category,
        tags: params?.tags,
      });
      set({
        ...syncFromBackend(result),
        elapsedSeconds: 0,
        showDetailForm: false,
        isLoading: false,
        trackerWorkspaceId: wsId,
        breakNotification: null,
        isOnBreak: false,
        breakEndsAtSeconds: null,
      });
      startElapsedTimer(get, set);
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  pause: async () => {
    try {
      const result = await ipc.trackerPause();
      set(syncFromBackend(result));
      // Timer keeps running but pausedAt means elapsed won't increase
    } catch (e) {
      set({ error: String(e) });
    }
  },

  resume: async () => {
    try {
      const result = await ipc.trackerResume();
      set(syncFromBackend(result));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  stop: async () => {
    try {
      const result = await ipc.trackerStop();
      stopElapsedTimer();
      resetBreakReminder();
      ipc.updateTrayStatus("idle", "").catch(() => {});
      set({
        ...syncFromBackend(result),
        showDetailForm: true,
        stoppedActiveMins: result.active_mins ?? null,
        stoppedEndTime: result.end_time ?? null,
        breakNotification: null,
        isOnBreak: false,
        breakEndsAtSeconds: null,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  saveDetail: async (params) => {
    const { timeEntryId } = get();
    if (!timeEntryId) return null;
    try {
      set({ isLoading: true, error: null });
      const entry = await ipc.trackerSaveDetail({
        timeEntryId,
        ...params,
      });
      ipc.updateTrayStatus("idle", "").catch(() => {});
      resetBreakReminder();
      set({
        status: "idle",
        timeEntryId: null,
        startedAt: null,
        pausedAt: null,
        pauses: [],
        notes: "",
        sessionNotes: [],
        linkedPlanId: null,
        linkedTaskId: null,
        category: null,
        tags: [],
        elapsedSeconds: 0,
        showDetailForm: false,
        stoppedActiveMins: null,
        stoppedEndTime: null,
        isLoading: false,
        breakNotification: null,
        isOnBreak: false,
        breakEndsAtSeconds: null,
        trackerWorkspaceId: null,
      });
      return entry;
    } catch (e) {
      set({ error: String(e), isLoading: false });
      return null;
    }
  },

  discard: async () => {
    const { timeEntryId } = get();
    if (!timeEntryId) return;
    try {
      await ipc.trackerDiscard(timeEntryId);
      stopElapsedTimer();
      resetBreakReminder();
      ipc.updateTrayStatus("idle", "").catch(() => {});
      set({
        status: "idle",
        timeEntryId: null,
        startedAt: null,
        pausedAt: null,
        pauses: [],
        notes: "",
        sessionNotes: [],
        linkedPlanId: null,
        linkedTaskId: null,
        category: null,
        tags: [],
        elapsedSeconds: 0,
        showDetailForm: false,
        stoppedActiveMins: null,
        stoppedEndTime: null,
        breakNotification: null,
        isOnBreak: false,
        breakEndsAtSeconds: null,
        trackerWorkspaceId: null,
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  updateNotes: async (notes) => {
    set({ notes });
    try {
      await ipc.trackerUpdateNotes(notes);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addSessionNote: async (text, refType, refId) => {
    try {
      const note = await ipc.trackerAddSessionNote(text, refType, refId);
      set((s) => ({ sessionNotes: [...s.sessionNotes, note] }));
      return note;
    } catch (e) {
      set({ error: String(e) });
      return null;
    }
  },

  setBreakMode: async (mode, config) => {
    try {
      await ipc.trackerSetBreakMode(mode, config);
      set({ breakMode: mode });
      if (config) set({ breakConfig: config });
      // Reinitialize break reminder with new settings
      initBreakReminder(get);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  snoozeBreak: async () => {
    try {
      await ipc.trackerSnoozeBreak();
      // Delay next break by snooze_mins from current elapsed
      const { elapsedSeconds, breakConfig } = get();
      nextBreakAtSeconds = elapsedSeconds + breakConfig.snooze_mins * 60;
    } catch (e) {
      set({ error: String(e) });
    }
  },

  recoverSession: async (action) => {
    try {
      set({ isLoading: true, error: null, showRecoveryDialog: false });
      const result = await ipc.trackerRecoverSession(action);
      if (action === "resume") {
        set({
          ...syncFromBackend(result),
          isLoading: false,
        });
        startElapsedTimer(get, set);
      } else {
        stopElapsedTimer();
        set({
          ...syncFromBackend(result),
          showDetailForm: true,
          stoppedActiveMins: result.active_mins ?? null,
          stoppedEndTime: result.end_time ?? null,
          isLoading: false,
        });
      }
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  editSessionNote: async (index, text) => {
    try {
      const note = await ipc.trackerEditSessionNote(index, text);
      set((s) => {
        const updated = [...s.sessionNotes];
        updated[index] = note;
        return { sessionNotes: updated };
      });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteSessionNote: async (index) => {
    try {
      await ipc.trackerDeleteSessionNote(index);
      set((s) => ({
        sessionNotes: s.sessionNotes.filter((_, i) => i !== index),
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  dismissBreakNotification: () => set({ breakNotification: null }),

  setBreakNotification: (notif) => set({ breakNotification: notif }),

  toggleNotesExpanded: () => set((s) => ({ isNotesExpanded: !s.isNotesExpanded })),

  openSessionNoteInput: () => set({ isNotesExpanded: true }),

  fetchState: async () => {
    try {
      const result = await ipc.trackerGetState();
      const synced = syncFromBackend(result);
      set(synced);

      if (result.status === "running" || result.status === "paused") {
        // Check if this is a recovery situation (session was interrupted)
        // by checking if updated_at is more than 5 minutes ago
        const updatedAt = new Date(result.updated_at).getTime();
        const now = Date.now();
        const gapMs = now - updatedAt;
        const fiveMinutes = 5 * 60 * 1000;

        if (gapMs > fiveMinutes) {
          set({ showRecoveryDialog: true });
        } else {
          // Just resume the timer normally
          if (result.started_at) {
            const elapsed = calculateElapsedSeconds(
              result.started_at,
              result.pauses,
              result.paused_at,
            );
            set({ elapsedSeconds: elapsed });
          }
          startElapsedTimer(get, set);
        }
      }
    } catch {
      // Tracker state not available yet, ignore
    }
  },
}));
