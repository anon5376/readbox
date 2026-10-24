import { SIZE_RANGE, type PageTheme, type ReaderPrefs } from "../lib/prefs";
import { isMac } from "../lib/platform";
import { SegmentedControl } from "./affectui/segmented-control";

const PAGES: [PageTheme, string][] = [
  ["auto", "Auto"],
  ["light", "White"],
  ["sepia", "Sepia"],
  ["dark", "Night"],
];

/** Text size, font, width and page colour; shared by the reader's Aa menu and Settings. */
export function ReadingControls({
  prefs,
  onPrefs,
}: {
  prefs: ReaderPrefs;
  onPrefs: (patch: Partial<ReaderPrefs>) => void;
}) {
  const step = (delta: number) =>
    onPrefs({ size: Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, prefs.size + delta)) });

  return (
    <div className="reading-controls">
      <div className="size-stepper" role="group" aria-label="Text size">
        <button onClick={() => step(-2)} disabled={prefs.size <= SIZE_RANGE.min} aria-label="Smaller text">
          <span className="size-small">A</span>
        </button>
        <span className="size-value" aria-live="polite">
          {prefs.size} pt
        </span>
        <button onClick={() => step(2)} disabled={prefs.size >= SIZE_RANGE.max} aria-label="Larger text">
          <span className="size-large">A</span>
        </button>
      </div>
      <SegmentedControl
        aria-label="Font"
        size="sm"
        fullWidth
        value={prefs.font}
        onChange={(font) => onPrefs({ font })}
        options={[
          // Named after the faces each system actually shows (see --serif and --sans in App.css).
          { value: "serif", label: isMac ? "New York" : "Georgia" },
          { value: "sans", label: isMac ? "San Francisco" : "Segoe UI" },
        ]}
      />
      <SegmentedControl
        aria-label="Line width"
        size="sm"
        fullWidth
        value={prefs.width}
        onChange={(width) => onPrefs({ width })}
        options={[
          { value: "narrow", label: "Narrow" },
          { value: "medium", label: "Medium" },
          { value: "wide", label: "Wide" },
        ]}
      />
      <div className="page-swatches" role="radiogroup" aria-label="Page colour">
        {PAGES.map(([theme, label]) => (
          <button
            key={theme}
            role="radio"
            aria-checked={prefs.theme === theme}
            className={`page-swatch page-swatch-${theme}`}
            onClick={() => onPrefs({ theme })}
          >
            <span className="page-swatch-chip">{theme === "auto" ? null : "Aa"}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
