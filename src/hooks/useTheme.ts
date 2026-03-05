import { useEffect, useCallback } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import * as ipc from "../lib/ipc";
import type { ThemeSettings } from "../lib/types";

/** Resolves the effective dark/light mode from a theme setting. */
function resolveIsDark(mode: string): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies the theme to the document root. */
function applyTheme(mode: string, accentColor: string) {
  const root = document.documentElement;
  const isDark = resolveIsDark(mode);

  // Add transition class briefly
  root.classList.add("theme-transitioning");

  // Set dark class for Tailwind
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Set data-theme for CSS custom properties
  root.setAttribute("data-theme", isDark ? "dark" : "light");

  // Apply accent color
  root.style.setProperty("--workspace-accent", accentColor);
  root.style.setProperty("--workspace-accent-light", accentColor + "20");
  // Derive a darker version
  root.style.setProperty("--workspace-accent-dark", accentColor);

  // Remove transition class after animation completes
  setTimeout(() => {
    root.classList.remove("theme-transitioning");
  }, 200);
}

/** Hook that manages theme state, applies it to the DOM, and handles system preference changes. */
export function useTheme() {
  const settings = useSettingsStore((s) => s.settings);
  const mode = settings.theme ?? "system";
  const accentColor = "#3b82f6"; // Default, overridden by theme_settings

  // Load theme settings from backend on mount
  useEffect(() => {
    ipc.getTheme().then((theme: ThemeSettings) => {
      applyTheme(theme.mode, theme.accent_color);
    }).catch(() => {
      applyTheme(mode, accentColor);
    });
  }, []);

  // React to settings changes
  useEffect(() => {
    applyTheme(mode, accentColor);
  }, [mode, accentColor]);

  // Listen for system preference changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system", accentColor);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode, accentColor]);

  const setTheme = useCallback(async (newTheme: ThemeSettings) => {
    applyTheme(newTheme.mode, newTheme.accent_color);
    await ipc.updateTheme(newTheme);
  }, []);

  return { mode, accentColor, setTheme };
}
