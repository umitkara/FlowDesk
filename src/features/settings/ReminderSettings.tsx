import { useCallback, useEffect, useState } from "react";
import { useReminderStore } from "../../stores/reminderStore";
import type { ReminderDefaults } from "../../lib/types";
import type { NoteTemplate } from "../../lib/types";
import * as ipc from "../../lib/ipc";

/** Reminder timing options shared between task due and plan start. */
const TIMING_OPTIONS = [
  { value: "at_time", label: "At time" },
  { value: "15min_before", label: "15 minutes before" },
  { value: "1hr_before", label: "1 hour before" },
  { value: "1day_before", label: "1 day before" },
] as const;

interface AutoDailyNoteConfig {
  enabled: boolean;
  template: string;
}

const DEFAULT_AUTO_DAILY: AutoDailyNoteConfig = { enabled: false, template: "" };

/** Settings section for reminders and auto daily note configuration. */
export function ReminderSettings() {
  const defaults = useReminderStore((s) => s.defaults);
  const loadDefaults = useReminderStore((s) => s.loadDefaults);
  const updateDefaults = useReminderStore((s) => s.updateDefaults);

  const [draft, setDraft] = useState<ReminderDefaults>(defaults);
  const [autoDailyNote, setAutoDailyNote] = useState<AutoDailyNoteConfig>(DEFAULT_AUTO_DAILY);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  // Load reminder defaults, auto daily note setting, and templates on mount.
  useEffect(() => {
    loadDefaults();
    ipc.listTemplates().then(setTemplates).catch(() => {});
    ipc
      .getSetting("auto_daily_note")
      .then((val) => {
        if (val) {
          try {
            setAutoDailyNote(JSON.parse(val) as AutoDailyNoteConfig);
          } catch {
            // Ignore malformed JSON
          }
        }
      })
      .catch(() => {});
  }, [loadDefaults]);

  // Sync draft when store defaults change (e.g. after loadDefaults resolves).
  useEffect(() => {
    setDraft(defaults);
  }, [defaults]);

  const toggleTimingOption = useCallback(
    (field: "task_due" | "plan_start", value: string) => {
      setDraft((prev) => {
        const arr = prev[field];
        const next = arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value];
        return { ...prev, [field]: next };
      });
    },
    [],
  );

  const handleSaveReminders = useCallback(async () => {
    setSaving(true);
    try {
      await updateDefaults(draft);
    } finally {
      setSaving(false);
    }
  }, [draft, updateDefaults]);

  const handleToggleEnabled = useCallback(
    async (checked: boolean) => {
      const next = { ...draft, enabled: checked };
      setDraft(next);
      await updateDefaults(next);
    },
    [draft, updateDefaults],
  );

  const handleAutoDailyToggle = useCallback(
    async (checked: boolean) => {
      const next = { ...autoDailyNote, enabled: checked };
      setAutoDailyNote(next);
      await ipc.setSetting("auto_daily_note", JSON.stringify(next));
    },
    [autoDailyNote],
  );

  const handleAutoDailyTemplate = useCallback(
    async (template: string) => {
      const next = { ...autoDailyNote, template };
      setAutoDailyNote(next);
      await ipc.setSetting("auto_daily_note", JSON.stringify(next));
    },
    [autoDailyNote],
  );

  return (
    <div className="space-y-0">
      {/* Reminders section */}
      <SettingsSection title="Reminders">
        <SettingRow label="Enable Reminders" description="Show notifications for upcoming tasks and plans">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        </SettingRow>

        <SettingRow
          label="Task Due Date Reminders"
          description="When to remind you about upcoming task deadlines"
        >
          <div className="flex flex-col items-end gap-1">
            {TIMING_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>{opt.label}</span>
                <input
                  type="checkbox"
                  checked={draft.task_due.includes(opt.value)}
                  onChange={() => toggleTimingOption("task_due", opt.value)}
                  disabled={!draft.enabled}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Plan Start Reminders"
          description="When to remind you about upcoming plan start times"
        >
          <div className="flex flex-col items-end gap-1">
            {TIMING_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>{opt.label}</span>
                <input
                  type="checkbox"
                  checked={draft.plan_start.includes(opt.value)}
                  onChange={() => toggleTimingOption("plan_start", opt.value)}
                  disabled={!draft.enabled}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
            ))}
          </div>
        </SettingRow>

        <div className="flex justify-end px-4 py-3">
          <button
            onClick={handleSaveReminders}
            disabled={saving}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </SettingsSection>

      {/* Auto Daily Note section */}
      <SettingsSection title="Auto Daily Note">
        <SettingRow
          label="Auto-create Daily Note"
          description="Automatically create a note when opening a date with no existing note"
        >
          <input
            type="checkbox"
            checked={autoDailyNote.enabled}
            onChange={(e) => handleAutoDailyToggle(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        </SettingRow>

        <SettingRow label="Template" description="Template to use for auto-created daily notes">
          <select
            value={autoDailyNote.template}
            onChange={(e) => handleAutoDailyTemplate(e.target.value)}
            disabled={!autoDailyNote.enabled}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t.file_name} value={t.file_name}>
                {t.name}
              </option>
            ))}
          </select>
        </SettingRow>
      </SettingsSection>
    </div>
  );
}

/** A grouped section of settings with a title. */
function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {title}
      </h2>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
        {children}
      </div>
    </div>
  );
}

/** A single setting row with label, description, and control. */
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">
          {description}
        </div>
      </div>
      {children}
    </div>
  );
}
