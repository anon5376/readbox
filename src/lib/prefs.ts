import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "sepia" | "dark";
export type Font = "serif" | "sans";
export type Width = "narrow" | "medium" | "wide";

export interface ReaderPrefs {
  theme: Theme;
  font: Font;
  size: number;
  width: Width;
}

const KEY = "readbox.readerPrefs";
const DEFAULTS: ReaderPrefs = { theme: "system", font: "serif", size: 20, width: "medium" };
export const SIZE_RANGE = { min: 14, max: 30 };

function load(): ReaderPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULTS, ...stored };
  } catch {
    return DEFAULTS;
  }
}

/** Reader look-and-feel is per computer, so it lives in local storage, not the library. */
export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Not fatal: preferences just won't be remembered.
    }
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs]);

  const update = (patch: Partial<ReaderPrefs>) => setPrefs((p) => ({ ...p, ...patch }));
  return [prefs, update] as const;
}
