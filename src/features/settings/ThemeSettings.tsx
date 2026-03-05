import { useState, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import * as ipc from "../../lib/ipc";
import type { ThemeSettings as ThemeSettingsType } from "../../lib/types";

const ACCENT_COLORS = [
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Rose", value: "#f43f5e" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Pink", value: "#ec4899" },
];

const MODES: { value: ThemeSettingsType["mode"]; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" },
  { value: "dark", label: "Dark", icon: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" },
  { value: "system", label: "System", icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
];

/** Theme configuration panel with mode selector and accent color swatches. */
export function ThemeSettings() {
  const { setTheme } = useTheme();
  const [currentMode, setCurrentMode] = useState<ThemeSettingsType["mode"]>("system");
  const [currentAccent, setCurrentAccent] = useState("#3b82f6");

  useEffect(() => {
    ipc.getTheme().then((theme) => {
      setCurrentMode(theme.mode);
      setCurrentAccent(theme.accent_color);
    }).catch(() => {});
  }, []);

  const handleModeChange = (mode: ThemeSettingsType["mode"]) => {
    setCurrentMode(mode);
    setTheme({ mode, accent_color: currentAccent });
  };

  const handleAccentChange = (color: string) => {
    setCurrentAccent(color);
    setTheme({ mode: currentMode, accent_color: color });
  };

  return (
    <div>
      {/* Mode selector */}
      <div className="mb-4">
        <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          Mode
        </div>
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => handleModeChange(m.value)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors ${
                currentMode === m.value
                  ? "border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800"
              }`}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={m.icon} />
              </svg>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div>
        <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          Accent Color
        </div>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => handleAccentChange(c.value)}
              title={c.name}
              className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                currentAccent === c.value
                  ? "border-gray-800 dark:border-white"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
