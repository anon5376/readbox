// Ported from Rare UI's Scroll Progress (https://rareui.com/components/scrollprogressindicator).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Readbox with CSS transitions instead of Motion. It sits in the reader's toolbar rather
// than floating over the text, opens downwards, and shows the time left when an article has no
// sections. Styles are in App.css.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export interface Section {
  id: string;
  label: string;
}

const RING = 2 * Math.PI * 9;
// The section whose heading has passed this far below the top of the scroller is the current one.
const ANCHOR = 120;

/** A reading-position pill: a ring that fills as you read and the current section, opening into a list of sections. */
export function ScrollProgress({
  scroller,
  sections,
  minutes,
}: {
  scroller: RefObject<HTMLElement | null>;
  sections: Section[];
  minutes: number;
}) {
  const ring = useRef<SVGCircleElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | undefined>();
  const [left, setLeft] = useState(minutes);
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<{ pill: [number, number]; list: [number, number] } | null>(null);
  const canOpen = sections.length > 1;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const scrollable = el.scrollHeight - el.clientHeight;
      const progress = scrollable <= 0 ? 1 : el.scrollTop / scrollable;
      if (ring.current) ring.current.style.strokeDashoffset = String(RING * (1 - progress));
      setLeft(Math.ceil(minutes * (1 - progress)));
      const anchor = el.getBoundingClientRect().top + ANCHOR;
      const passed = sections.filter(({ id }) => {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        return top !== undefined && top <= anchor;
      });
      // Before the first heading there is no section yet; the pill shows the time left instead.
      setActive(passed[passed.length - 1]?.id);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scroller, sections, minutes]);

  const label = sections.find((s) => s.id === active)?.label ?? (left > 0 ? `${left} min left` : "Finished");

  // Both shapes are measured from copies laid out off-screen, so the surface can morph between them.
  useLayoutEffect(() => {
    const measure = () => {
      if (!pill.current || !list.current) return;
      setSize({
        pill: [pill.current.offsetWidth, pill.current.offsetHeight],
        list: [list.current.offsetWidth, Math.min(list.current.offsetHeight, window.innerHeight * 0.6)],
      });
    };
    measure();
    document.fonts?.ready.then(measure);
  }, [label, sections]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    // Registered before the reader's own Escape (which leaves the article), and stops it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  };

  const [w, h] = (open ? size?.list : size?.pill) ?? [0, 0];

  return (
    <div className="ui-progress" ref={root}>
      <div className="ui-progress-measure" aria-hidden="true">
        <div ref={pill} className="ui-progress-pill">
          <span className="ui-progress-ring" />
          <span className="ui-progress-label">{label}</span>
        </div>
        <div ref={list} className="ui-progress-list">
          {sections.map((s) => (
            <div key={s.id} className="ui-progress-option">
              <span className="ui-progress-dot" />
              <span className="ui-progress-option-label">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="ui-progress-surface"
        data-open={open}
        style={size ? { width: w, height: h, borderRadius: open ? 8 : h / 2 } : { visibility: "hidden" }}
      >
        <button
          type="button"
          className="ui-progress-pill ui-progress-layer"
          data-shown={!open}
          onClick={() => canOpen && setOpen(true)}
          aria-label={canOpen ? `Reading position: ${label}. Show sections` : `Reading position: ${label}`}
          aria-expanded={canOpen ? open : undefined}
          tabIndex={open ? -1 : 0}
        >
          <svg className="ui-progress-ring" viewBox="0 0 22 22" aria-hidden="true">
            <circle cx="11" cy="11" r="9" className="ui-progress-ring-track" />
            <circle
              ref={ring}
              cx="11"
              cy="11"
              r="9"
              className="ui-progress-ring-fill"
              strokeDasharray={RING}
              strokeDashoffset={RING}
            />
          </svg>
          <span className="ui-progress-label" key={label}>
            {label}
          </span>
        </button>
        {canOpen && (
          <div className="ui-progress-list ui-progress-layer" data-shown={open} role="menu" aria-label="Sections">
            {sections.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                className="ui-progress-option"
                data-active={s.id === active}
                style={{ ["--i" as string]: i }}
                onClick={() => go(s.id)}
                tabIndex={open ? 0 : -1}
              >
                <span className="ui-progress-dot" />
                <span className="ui-progress-option-label">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
