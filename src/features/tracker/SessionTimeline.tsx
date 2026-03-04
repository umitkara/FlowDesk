import type { SessionNote } from "../../lib/types";

/** Props for the SessionTimeline component. */
interface SessionTimelineProps {
  /** Session notes to display. */
  sessionNotes: SessionNote[];
  /** Whether to show wall-clock times. */
  showWallTime?: boolean;
  /** Whether to use compact mode (for widget dropdown). */
  compact?: boolean;
}

/** Formats a wall-clock ISO string to a short time (HH:MM). */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Renders a vertical timeline of timestamped session notes. */
export function SessionTimeline({
  sessionNotes,
  showWallTime = true,
  compact = false,
}: SessionTimelineProps) {
  if (sessionNotes.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 italic">
        No session notes yet
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

      {sessionNotes.map((sn, i) => (
        <div key={i} className={`relative flex items-start gap-2 ${compact ? "py-0.5" : "py-1"}`}>
          {/* Dot */}
          <div className="relative z-10 mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-blue-400 dark:bg-blue-500 ring-2 ring-white dark:ring-gray-900" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {/* Elapsed badge */}
              <span className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                +{Math.round(sn.elapsed_mins)}min
              </span>

              {/* Wall time */}
              {showWallTime && sn.wall_time && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {formatTime(sn.wall_time)}
                </span>
              )}
            </div>

            {/* Note text */}
            <p className={`text-gray-700 dark:text-gray-300 ${compact ? "text-xs" : "text-sm"} mt-0.5 leading-snug`}>
              {sn.text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
