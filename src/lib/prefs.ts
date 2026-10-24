import { useEffect, useState } from "react";

/** The whole app: follow the system, or force light or dark. */
export type Appearance = "system" | "light" | "dark";
/** The reading page only, like Apple Books' page colours. */
export type PageTheme = "auto" | "light" | "sepia" | "dark";
export type Font = "serif" | "sans";
export type Width = "narrow" | "medium" | "wide";

export interface ReaderPrefs {
  appearance: Appearance;
  theme: PageTheme;
  font: Font;
  size: number;
  width: Width;
}

const KEY = "readbox.readerPrefs";
const DEFAULTS: ReaderPrefs = { appearance: "system", theme: "auto", font: "serif", size: 20, width: "medium" };
export const SIZE_RANGE = { min: 14, max: 30 };

function load(): ReaderPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // Before the Apple-style redesign the page theme also set the app's look.
    if (stored.theme === "system") stored.theme = "auto";
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

/**
 * Look-and-feel is per computer, so it lives in local storage, not the
 * library. Sets `data-theme` and a `.dark` class on <html>; the affectUI
 * components follow `.dark`.
 */
export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Not fatal: preferences just won't be remembered.
    }
    const root = document.documentElement;
    const apply = () => {
      const dark = prefs.appearance === "dark" || (prefs.appearance === "system" && systemDark.matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.classList.toggle("dark", dark);
    };
    apply();
    systemDark.addEventListener("change", apply);
    return () => systemDark.removeEventListener("change", apply);
  }, [prefs]);

  const update = (patch: Partial<ReaderPrefs>) => setPrefs((p) => ({ ...p, ...patch }));
  return [prefs, update] as const;
}
