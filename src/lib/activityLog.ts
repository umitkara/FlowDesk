import { useTrackerStore } from "../stores/trackerStore";

/** Logs an activity as a session note when the tracker is running. No-op when idle. */
export function logActivity(text: string, refType?: string, refId?: string): void {
  const { status, addSessionNote } = useTrackerStore.getState();
  if (status === "idle") return;
  addSessionNote(text, refType, refId).catch(() => {});
}
