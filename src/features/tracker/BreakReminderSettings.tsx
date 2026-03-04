import { useState } from "react";
import { useTrackerStore } from "../../stores/trackerStore";
import type { BreakMode, BreakConfig } from "../../lib/types";

/** Break reminder settings panel (popover or embedded). */
export function BreakReminderSettings({ onClose }: { onClose?: () => void }) {
  const breakMode = useTrackerStore((s) => s.breakMode);
  const breakConfig = useTrackerStore((s) => s.breakConfig);
  const setBreakMode = useTrackerStore((s) => s.setBreakMode);

  const [mode, setMode] = useState<BreakMode>(breakMode);
  const [workMins, setWorkMins] = useState(breakConfig.pomodoro.work_mins);
  const [shortBreak, setShortBreak] = useState(breakConfig.pomodoro.short_break_mins);
  const [longBreak, setLongBreak] = useState(breakConfig.pomodoro.long_break_mins);
  const [cyclesBeforeLong, setCyclesBeforeLong] = useState(breakConfig.pomodoro.cycles_before_long);
  const [customInterval, setCustomInterval] = useState(breakConfig.custom.interval_mins);
  const [soundEnabled, setSoundEnabled] = useState(breakConfig.sound_enabled);
  const [snoozeMins, setSnoozeMins] = useState(breakConfig.snooze_mins);

  const handleSave = async () => {
    const config: BreakConfig = {
      pomodoro: {
        work_mins: workMins,
        short_break_mins: shortBreak,
        long_break_mins: longBreak,
        cycles_before_long: cyclesBeforeLong,
      },
      custom: { interval_mins: customInterval },
      sound_enabled: soundEnabled,
      snooze_mins: snoozeMins,
    };
    await setBreakMode(mode, config);
    onClose?.();
  };

  const radioClass = (active: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-medium text-center cursor-pointer transition-colors ${
      active
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
    }`;

  return (
    <div className="w-72 space-y-3 p-3">
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
        Break Reminders
      </div>

      {/* Mode selector */}
      <div className="flex gap-1">
        {(["none", "pomodoro", "custom"] as BreakMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={radioClass(mode === m)}
          >
            {m === "none" ? "Off" : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Pomodoro settings */}
      {mode === "pomodoro" && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-800">
          <NumberInput label="Work" value={workMins} onChange={setWorkMins} suffix="min" />
          <NumberInput label="Short break" value={shortBreak} onChange={setShortBreak} suffix="min" />
          <NumberInput label="Long break" value={longBreak} onChange={setLongBreak} suffix="min" />
          <NumberInput label="Cycles before long" value={cyclesBeforeLong} onChange={setCyclesBeforeLong} />
        </div>
      )}

      {/* Custom settings */}
      {mode === "custom" && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-800">
          <NumberInput label="Remind every" value={customInterval} onChange={setCustomInterval} suffix="min" />
        </div>
      )}

      {/* Notification settings */}
      {mode !== "none" && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-800">
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="rounded border-gray-300"
            />
            Sound enabled
          </label>
          <NumberInput label="Snooze" value={snoozeMins} onChange={setSnoozeMins} suffix="min" />
        </div>
      )}

      <button
        onClick={handleSave}
        className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
      >
        Save
      </button>
    </div>
  );
}

/** Small labeled number input. */
function NumberInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-14 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-center text-xs dark:border-gray-700 dark:bg-gray-900"
          min={1}
        />
        {suffix && (
          <span className="text-[10px] text-gray-400">{suffix}</span>
        )}
      </div>
    </div>
  );
}
