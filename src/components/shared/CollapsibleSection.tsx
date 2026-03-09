import { useState, type ReactNode } from "react";

/** Reusable collapsible section with chevron toggle, title, and optional badge. */
export function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{title}</span>
        {badge != null && (
          <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0 text-[9px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
