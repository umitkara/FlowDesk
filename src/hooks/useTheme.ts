import { useEffect, useCallback, useRef } from "react";
import * as ipc from "../lib/ipc";
import { applyPrimaryPalette } from "../lib/colors";
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
  root.style.setProperty("--workspace-accent-dark", accentColor);

  // Generate primary palette from accent color
  applyPrimaryPalette(accentColor);

  // Remove transition class after animation completes
  setTimeout(() => {
    root.classList.remove("theme-transitioning");
  }, 200);
}

/** Hook that manages theme state, applies it to the DOM, and handles system preference changes. */
export function useTheme() {
  const themeRef = useRef<ThemeSettings>({ mode: "system", accent_color: "#3b82f6" });

  // Load theme settings from backend on mount and apply
  useEffect(() => {
    ipc.getTheme().then((theme: ThemeSettings) => {
      themeRef.current = theme;
      applyTheme(theme.mode, theme.accent_color);
    }).catch(() => {
      applyTheme("system", "#3b82f6");
    });
  }, []);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const t = themeRef.current;
      if (t.mode === "system") {
        applyTheme("system", t.accent_color);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = useCallback(async (newTheme: ThemeSettings) => {
    themeRef.current = newTheme;
    applyTheme(newTheme.mode, newTheme.accent_color);
    await ipc.updateTheme(newTheme);
  }, []);

  return { setTheme };
}
