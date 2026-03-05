import { useState, useEffect, useCallback } from "react";
import type {
  RecurrencePattern,
  RecurrenceRule,
  CreateRecurrenceRuleInput,
  UpdateRecurrenceRuleInput,
} from "../../lib/types";

interface RecurrenceEditorProps {
  /** Current rule (null = no recurrence). */
  rule: RecurrenceRule | null;
  /** Called when the user changes recurrence settings. null = remove recurrence. */
  onChange: (input: CreateRecurrenceRuleInput | UpdateRecurrenceRuleInput | null) => void;
  /** Entity type this editor is for. */
  entityType: "task" | "plan";
  /** Workspace ID for creating new rules. */
  workspaceId: string;
  /** Entity ID for creating new rules. */
  entityId: string;
}

const PATTERNS: { value: RecurrencePattern | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

const PERIOD_LABELS: Record<RecurrencePattern, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
  custom: ["week", "weeks"],
};

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

type EndMode = "never" | "date" | "count";

/** Compact recurrence rule editor for side panels. */
export function RecurrenceEditor({
  rule,
  onChange,
  entityType,
  workspaceId,
  entityId,
}: RecurrenceEditorProps) {
  const [pattern, setPattern] = useState<RecurrencePattern | "none">(
    rule?.pattern ?? "none",
  );
  const [interval, setInterval] = useState(rule?.interval ?? 1);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    rule?.days_of_week ?? [],
  );
  const [dayOfMonth, setDayOfMonth] = useState(rule?.day_of_month ?? 1);
  const [endMode, setEndMode] = useState<EndMode>(
    rule?.end_date ? "date" : rule?.end_after_count ? "count" : "never",
  );
  const [endDate, setEndDate] = useState(rule?.end_date ?? "");
  const [endAfterCount, setEndAfterCount] = useState(
    rule?.end_after_count ?? 10,
  );

  // Sync from prop changes
  useEffect(() => {
    setPattern(rule?.pattern ?? "none");
    setInterval(rule?.interval ?? 1);
    setDaysOfWeek(rule?.days_of_week ?? []);
    setDayOfMonth(rule?.day_of_month ?? 1);
    setEndMode(
      rule?.end_date ? "date" : rule?.end_after_count ? "count" : "never",
    );
    setEndDate(rule?.end_date ?? "");
    setEndAfterCount(rule?.end_after_count ?? 10);
  }, [rule]);

  const emit = useCallback(
    (overrides: Partial<{
      pattern: RecurrencePattern | "none";
      interval: number;
      daysOfWeek: number[];
      dayOfMonth: number;
      endMode: EndMode;
      endDate: string;
      endAfterCount: number;
    }>) => {
      const p = overrides.pattern ?? pattern;
      if (p === "none") {
        onChange(null);
        return;
      }
      const iv = overrides.interval ?? interval;
      const dow = overrides.daysOfWeek ?? daysOfWeek;
      const dom = overrides.dayOfMonth ?? dayOfMonth;
      const em = overrides.endMode ?? endMode;
      const ed = overrides.endDate ?? endDate;
      const eac = overrides.endAfterCount ?? endAfterCount;

      if (rule) {
        // Update existing rule
        const update: UpdateRecurrenceRuleInput = {
          pattern: p,
          interval: iv,
          days_of_week: p === "weekly" || p === "custom" ? (dow.length > 0 ? dow : null) : null,
          day_of_month: p === "monthly" ? dom : null,
          end_date: em === "date" && ed ? ed : null,
          end_after_count: em === "count" ? eac : null,
        };
        onChange(update);
      } else {
        // Create new rule
        const input: CreateRecurrenceRuleInput = {
          workspace_id: workspaceId,
          entity_type: entityType,
          parent_entity_id: entityId,
          pattern: p,
          interval: iv,
          days_of_week: p === "weekly" || p === "custom" ? (dow.length > 0 ? dow : undefined) : undefined,
          day_of_month: p === "monthly" ? dom : undefined,
          end_date: em === "date" && ed ? ed : undefined,
          end_after_count: em === "count" ? eac : undefined,
        };
        onChange(input);
      }
    },
    [pattern, interval, daysOfWeek, dayOfMonth, endMode, endDate, endAfterCount, rule, onChange, workspaceId, entityType, entityId],
  );

  const handlePatternChange = (value: string) => {
    const p = value as RecurrencePattern | "none";
    setPattern(p);
    emit({ pattern: p });
  };

  const handleIntervalChange = (value: number) => {
    const v = Math.max(1, value);
    setInterval(v);
    emit({ interval: v });
  };

  const toggleDay = (day: number) => {
    const next = daysOfWeek.includes(day)
      ? daysOfWeek.filter((d) => d !== day)
      : [...daysOfWeek, day].sort();
    setDaysOfWeek(next);
    emit({ daysOfWeek: next });
  };

  const handleDayOfMonthChange = (value: number) => {
    setDayOfMonth(value);
    emit({ dayOfMonth: value });
  };

  const handleEndModeChange = (mode: EndMode) => {
    setEndMode(mode);
    emit({ endMode: mode });
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    emit({ endDate: value });
  };

  const handleEndCountChange = (value: number) => {
    const v = Math.max(1, value);
    setEndAfterCount(v);
    emit({ endAfterCount: v });
  };

  const showDetails = pattern !== "none";
  const periodLabel = pattern !== "none" ? PERIOD_LABELS[pattern] : ["", ""];

  return (
    <div className="space-y-2.5">
      {/* Pattern selector */}
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
          Repeat
        </label>
        <select
          value={pattern}
          onChange={(e) => handlePatternChange(e.target.value)}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          {PATTERNS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {showDetails && (
        <>
          {/* Interval */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 dark:text-gray-400">Every</span>
            <input
              type="number"
              min={1}
              max={999}
              value={interval}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              className="w-14 rounded border border-gray-200 px-2 py-1 text-xs text-center dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {interval === 1 ? periodLabel[0] : periodLabel[1]}
            </span>
          </div>

          {/* Weekly / Custom: day-of-week toggles */}
          {(pattern === "weekly" || pattern === "custom") && (
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                On Days
              </label>
              <div className="flex gap-0.5">
                {DOW_LABELS.map((label, i) => {
                  const active = daysOfWeek.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium transition-colors ${
                        active
                          ? "bg-blue-600 text-white dark:bg-blue-500"
                          : "border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monthly: day-of-month */}
          {pattern === "monthly" && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">On day</span>
              <select
                value={dayOfMonth}
                onChange={(e) => handleDayOfMonthChange(Number(e.target.value))}
                className="rounded border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">of the month</span>
            </div>
          )}

          {/* End condition */}
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Ends
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400">
                <input
                  type="radio"
                  name="end-mode"
                  checked={endMode === "never"}
                  onChange={() => handleEndModeChange("never")}
                  className="h-3 w-3"
                />
                Never
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400">
                <input
                  type="radio"
                  name="end-mode"
                  checked={endMode === "date"}
                  onChange={() => handleEndModeChange("date")}
                  className="h-3 w-3"
                />
                On date
                {endMode === "date" && (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="ml-1 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  />
                )}
              </label>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400">
                <input
                  type="radio"
                  name="end-mode"
                  checked={endMode === "count"}
                  onChange={() => handleEndModeChange("count")}
                  className="h-3 w-3"
                />
                After
                {endMode === "count" && (
                  <input
                    type="number"
                    min={1}
                    value={endAfterCount}
                    onChange={(e) => handleEndCountChange(Number(e.target.value))}
                    className="mx-1 w-12 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-center dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  />
                )}
                occurrences
              </label>
            </div>
          </div>

          {/* Status line when rule exists */}
          {rule && rule.is_active && (
            <div className="rounded bg-gray-50 px-2 py-1.5 text-[10px] text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
              <span className="mr-1">&#x21BB;</span>
              {rule.occurrences_created} created
              {rule.end_after_count
                ? ` of ${rule.end_after_count}`
                : ", unlimited"}
              {rule.next_occurrence_date && (
                <span className="ml-1">
                  · next: {rule.next_occurrence_date}
                </span>
              )}
            </div>
          )}

          {/* Remove recurrence */}
          {rule && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-[10px] text-red-400 hover:text-red-500 dark:text-red-500 dark:hover:text-red-400"
            >
              Remove Recurrence
            </button>
          )}
        </>
      )}
    </div>
  );
}
