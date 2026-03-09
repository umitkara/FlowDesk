import { useState, useRef, useEffect } from "react";
import type { TaskStatus } from "../../lib/types";
import { STATUS_CONFIG } from "../../lib/types";

const DOT_COLORS: Record<TaskStatus, string> = {
  inbox: "bg-zinc-400",
  todo: "bg-blue-500",
  in_progress: "bg-amber-500",
  done: "bg-green-500",
  cancelled: "bg-zinc-400",
};

/** Compact clickable status pill with dropdown. */
export function StatusBadge({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (s: TaskStatus) => void;
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

  const cfg = STATUS_CONFIG[status];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <span className={`inline-block h-2 w-2 rounded-full ${DOT_COLORS[status]}`} />
        {cfg.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {(Object.entries(STATUS_CONFIG) as [TaskStatus, (typeof STATUS_CONFIG)[TaskStatus]][]).map(
            ([key, c]) => (
              <button
                key={key}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                  key === status ? "font-semibold" : ""
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
