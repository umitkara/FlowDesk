/** Visual progress bar for estimate vs actual time. */
export function TimeProgress({
  estimatedMins,
  actualMins,
  liveElapsed,
}: {
  estimatedMins: number | null;
  actualMins: number;
  liveElapsed?: number;
}) {
  const total = actualMins + (liveElapsed ? Math.floor(liveElapsed / 60) : 0);

  if (estimatedMins == null || estimatedMins <= 0) {
    if (total === 0) return null;
    return (
      <span className="text-[10px] text-gray-500 dark:text-gray-400">
        {total} min tracked
      </span>
    );
  }

  const pct = Math.round((total / estimatedMins) * 100);
  const barPct = Math.min(pct, 100);
  const barColor =
    pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500";

  return (
    <div className="space-y-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="text-[10px] text-gray-500 dark:text-gray-400">
        {total} / {estimatedMins} min ({pct}%)
      </div>
    </div>
  );
}
