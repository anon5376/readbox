// Ported from Rare UI's Scroll Progress (https://rareui.com/components/scrollprogressindicator).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Readbox without Motion and cut down to the ring and the time left: no section list
// for now. It sits in the reader's toolbar rather than floating over the text. Styles are in App.css.

import { useEffect, useRef, useState, type RefObject } from "react";

const RING = 2 * Math.PI * 9;

/** A reading-position pill: a ring that fills as you read and the minutes left. */
export function ScrollProgress({ scroller, minutes }: { scroller: RefObject<HTMLElement | null>; minutes: number }) {
  const ring = useRef<SVGCircleElement>(null);
  const [left, setLeft] = useState(minutes);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const scrollable = el.scrollHeight - el.clientHeight;
      const progress = scrollable <= 0 ? 1 : el.scrollTop / scrollable;
      if (ring.current) ring.current.style.strokeDashoffset = String(RING * (1 - progress));
      setLeft(Math.ceil(minutes * (1 - progress)));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scroller, minutes]);

  const label = left > 0 ? `${left} min left` : "Finished";

  return (
    <div className="ui-progress">
      <div className="ui-progress-pill" aria-label={`Reading position: ${label}`}>
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
        <span className="ui-progress-label">{label}</span>
      </div>
    </div>
  );
}
