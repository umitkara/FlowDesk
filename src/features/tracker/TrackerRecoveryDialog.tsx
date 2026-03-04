import { useTrackerStore, formatMinutes, calculateElapsedSeconds } from "../../stores/trackerStore";

/** Modal dialog shown on app startup when a previous session was interrupted. */
export function TrackerRecoveryDialog() {
  const showRecoveryDialog = useTrackerStore((s) => s.showRecoveryDialog);
  const startedAt = useTrackerStore((s) => s.startedAt);
  const pauses = useTrackerStore((s) => s.pauses);
  const linkedTaskId = useTrackerStore((s) => s.linkedTaskId);
  const linkedPlanId = useTrackerStore((s) => s.linkedPlanId);
  const recoverSession = useTrackerStore((s) => s.recoverSession);
  const isLoading = useTrackerStore((s) => s.isLoading);

  if (!showRecoveryDialog || !startedAt) return null;

  const activeSoFar = Math.round(
    calculateElapsedSeconds(startedAt, pauses, null) / 60,
  );

  const startDate = new Date(startedAt);
  const startStr = startDate.toLocaleString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Session Recovery
        </h2>

        <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>A tracking session was interrupted.</p>

          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Started</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {startStr}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Duration so far</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {formatMinutes(activeSoFar)}
              </span>
            </div>
            {(linkedTaskId || linkedPlanId) && (
              <div className="mt-1 flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Linked to</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {linkedTaskId ? "Task" : "Plan"}
                </span>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-500">
            The time between the interruption and now will be recorded as a
            pause if you choose to resume.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => recoverSession("resume")}
            disabled={isLoading}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Resume Tracking
          </button>
          <button
            onClick={() => recoverSession("stop")}
            disabled={isLoading}
            className="flex-1 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Stop &amp; Review
          </button>
        </div>
      </div>
    </div>
  );
}
