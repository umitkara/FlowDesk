import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { ReminderSettings } from "./ReminderSettings";
import { ThemeSettings } from "./ThemeSettings";
import { KeyboardShortcuts } from "./KeyboardShortcuts";

/** Settings panel with grouped configuration options. */
export function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const setActiveView = useUIStore((s) => s.setActiveView);

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Settings
        </h1>
        <button
          onClick={() => setActiveView("notes")}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Editor section */}
      <SettingsSection title="Editor">
        <SettingRow label="Font Size" description="Editor text size in pixels">
          <input
            type="number"
            min={10}
            max={24}
            value={settings.font_size ?? "14"}
            onChange={(e) => setSetting("font_size", e.target.value)}
            className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </SettingRow>
        <SettingRow label="Editor Mode" description="WYSIWYG, split, or source view">
          <select
            value={settings.editor_mode ?? "wysiwyg"}
            onChange={(e) => setSetting("editor_mode", e.target.value)}
            className="rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="wysiwyg">WYSIWYG</option>
            <option value="split">Split</option>
            <option value="source">Source</option>
          </select>
        </SettingRow>
        <SettingRow label="Auto-save Delay" description="Milliseconds of inactivity before saving">
          <input
            type="number"
            min={200}
            max={5000}
            step={100}
            value={settings.auto_save_debounce_ms ?? "1000"}
            onChange={(e) => setSetting("auto_save_debounce_ms", e.target.value)}
            className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </SettingRow>
      </SettingsSection>

      {/* Appearance section */}
      <SettingsSection title="Appearance">
        <div className="px-4 py-3">
          <ThemeSettings />
        </div>
        <SettingRow label="Sidebar Width" description="Default width in pixels">
          <input
            type="number"
            min={180}
            max={400}
            value={settings.sidebar_width ?? "260"}
            onChange={(e) => setSetting("sidebar_width", e.target.value)}
            className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </SettingRow>
      </SettingsSection>

      {/* Keyboard Shortcuts */}
      <SettingsSection title="Keyboard Shortcuts">
        <div className="p-3">
          <KeyboardShortcuts />
        </div>
      </SettingsSection>

      {/* Backup section */}
      <SettingsSection title="Backup">
        <SettingRow label="Enabled" description="Automatically back up the database">
          <input
            type="checkbox"
            checked={settings.backup_enabled === "true"}
            onChange={(e) =>
              setSetting("backup_enabled", e.target.checked ? "true" : "false")
            }
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        </SettingRow>
        <SettingRow label="Interval (hours)" description="Time between backups">
          <input
            type="number"
            min={1}
            max={168}
            value={settings.backup_interval_hours ?? "24"}
            onChange={(e) => setSetting("backup_interval_hours", e.target.value)}
            className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </SettingRow>
        <SettingRow label="Retention (days)" description="How long to keep old backups">
          <input
            type="number"
            min={1}
            max={365}
            value={settings.backup_retention_days ?? "30"}
            onChange={(e) => setSetting("backup_retention_days", e.target.value)}
            className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </SettingRow>
      </SettingsSection>

      {/* Calendar section */}
      <SettingsSection title="Calendar">
        <SettingRow label="Start Hour" description="First visible hour in calendar view (0–23)">
          <input
            type="number"
            min={0}
            max={23}
            value={settings.calendar_start_hour ?? "0"}
            onChange={(e) => {
              const val = Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0));
              setSetting("calendar_start_hour", String(val));
            }}
            className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </SettingRow>
        <SettingRow label="End Hour" description="Last visible hour in calendar view (1–24)">
          <input
            type="number"
            min={1}
            max={24}
            value={settings.calendar_end_hour ?? "24"}
            onChange={(e) => {
              const start = parseInt(settings.calendar_start_hour ?? "0", 10) || 0;
              const val = Math.max(start + 1, Math.min(24, parseInt(e.target.value, 10) || 24));
              setSetting("calendar_end_hour", String(val));
            }}
            className="w-20 rounded border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </SettingRow>
      </SettingsSection>

      {/* Reminders & Automation */}
      <ReminderSettings />

      {/* Data section */}
      <SettingsSection title="Data">
        <div className="px-4 py-3">
          <button
            onClick={() => setActiveView("import-wizard")}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Import Data...
          </button>
        </div>
      </SettingsSection>

      {/* About link */}
      <div className="mb-6">
        <button
          onClick={() => setActiveView("about")}
          className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          About FlowDesk
        </button>
      </div>
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
