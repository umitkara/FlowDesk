import { useState, useRef, useEffect } from "react";
import type { TaskPriority } from "../../lib/types";
import { PRIORITY_CONFIG } from "../../lib/types";

const DOT_COLORS: Record<TaskPriority, string> = {
  none: "bg-zinc-400",
  low: "bg-blue-400",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

/** Compact clickable priority pill with dropdown. */
export function PriorityBadge({
  priority,
  onChange,
}: {
  priority: TaskPriority;
  onChange: (p: TaskPriority) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const cfg = PRIORITY_CONFIG[priority];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${DOT_COLORS[priority]}`} />
        {cfg.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[100px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, (typeof PRIORITY_CONFIG)[TaskPriority]][]).map(
            ([key, c]) => (
              <button
                key={key}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  key === priority ? "font-semibold" : ""
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${DOT_COLORS[key]}`} />
                <span className="text-gray-700 dark:text-gray-300">{c.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
