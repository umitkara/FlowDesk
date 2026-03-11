import { useState, useEffect, useCallback } from "react";
import { useNoteStore } from "../../stores/noteStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { todayISO } from "../../lib/utils";

const DAYS_OF_WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Mini calendar widget for daily note navigation. */
export function DailyCalendar() {
  const datesWithNotes = useNoteStore((s) => s.datesWithNotes);
  const loadDatesWithNotes = useNoteStore((s) => s.loadDatesWithNotes);
  const openDailyNote = useNoteStore((s) => s.openDailyNote);
  const activeNoteDate = useNoteStore((s) => s.activeNote?.date ?? null);

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const today = todayISO();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  useEffect(() => {
    loadDatesWithNotes(year, month);
  }, [year, month, activeWorkspaceId, loadDatesWithNotes]);

  const handlePrevMonth = useCallback(() => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }, [month]);

  const handleNextMonth = useCallback(() => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }, [month]);

  // Build the calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = new Date(year, month - 1).toLocaleString("en-US", {
    month: "long",
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const noteDateSet = new Set(datesWithNotes);

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <button
          onClick={handlePrevMonth}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {monthName} {year}
        </span>
        <button
          onClick={handleNextMonth}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0">
        {DAYS_OF_WEEK.map((d) => (
          <div
            key={d}
            className="py-0.5 text-center text-[10px] font-medium text-gray-400 dark:text-gray-500"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="h-6" />;
          }

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === today;
          const isSelected = !isToday && dateStr === activeNoteDate;
          const hasNote = noteDateSet.has(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => openDailyNote(dateStr)}
              className={`relative flex h-6 items-center justify-center rounded text-[11px] transition-colors ${
                isToday
                  ? "bg-primary-500 font-bold text-white"
                  : isSelected
                    ? "bg-primary-100 font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                    : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              {day}
              {hasNote && !isToday && (
                <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
