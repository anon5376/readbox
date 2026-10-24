// Ported from Rare UI's Bounce Sidebar (https://rareui.com/components/bouncesidebar).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Readbox with CSS transitions instead of Motion's arc path: the dot's vertical move and
// a sideways hop run as two transforms on nested elements. Styles are in App.css.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const DOT = 6;

export interface BounceNavItem<T extends string> {
  value: T;
  label: string;
  trailing?: ReactNode;
}

/** A vertical navigation list whose active dot hops along a small arc to the chosen item. */
export function BounceNav<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: BounceNavItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());
  const [dot, setDot] = useState<{ y: number; hop: number; turn: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = refs.current.get(value);
      if (!el) return;
      const y = Math.round(el.offsetTop + el.offsetHeight / 2 - DOT / 2);
      setDot((prev) => {
        if (!prev) return { y, hop: 0, turn: 0, moved: false };
        if (prev.y === y) return prev;
        const distance = Math.abs(y - prev.y);
        // Motion's arc strength, min(0.8, 14 / distance), as the bulge at the midpoint.
        const hop = (Math.min(0.8, 14 / distance) * distance) / 2;
        return { y, hop: y > prev.y ? -hop : hop, turn: prev.turn + 1, moved: true };
      });
    };
    place();
    document.fonts?.ready.then(place);
  }, [value]);

  return (
    <nav className="ui-bounce" aria-label={label}>
      {dot && (
        <span
          className={`ui-bounce-track ${dot.moved ? "moved" : ""}`}
          style={{ transform: `translateY(${dot.y}px)` }}
          aria-hidden="true"
        >
          <span key={dot.turn} className="ui-bounce-dot" style={{ ["--hop" as string]: `${dot.hop}px` }} />
        </span>
      )}
      {items.map((item) => (
        <button
          key={item.value}
          ref={(el) => {
            if (el) refs.current.set(item.value, el);
            else refs.current.delete(item.value);
          }}
          type="button"
          className="ui-bounce-item"
          data-active={item.value === value}
          aria-current={item.value === value ? "page" : undefined}
          onClick={() => onChange(item.value)}
        >
          <span className="ui-bounce-label">{item.label}</span>
          {item.trailing}
        </button>
      ))}
    </nav>
  );
}
