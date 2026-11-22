import { useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "cadence-theme";

type ThemeRoot = { classList: { toggle(token: string, force: boolean): void } };
type ThemeStorage = { setItem(key: string, value: string): void };

/**
 * Puts the page in dark or light mode and remembers the choice for the
 * inline script in `root.tsx`. A storage that throws (private mode) still
 * switches the page.
 */
export function applyTheme(
  root: ThemeRoot,
  storage: ThemeStorage,
  dark: boolean
) {
  root.classList.toggle("dark", dark);
  try {
    storage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
  } catch {}
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !isDark;
    setIsDark(next);
    applyTheme(document.documentElement, localStorage, next);
  }

  return { isDark, toggleDarkMode };
}
