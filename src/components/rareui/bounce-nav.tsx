// Ported from Rare UI's Bounce Sidebar (https://rareui.com/components/bouncesidebar).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Readbox with a CSS transition instead of Motion: the dot became the selection
// itself, and it slides straight to the chosen item. Styles are in App.css.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface BounceNavItem<T extends string> {
  value: T;
  label: string;
  trailing?: ReactNode;
}

/** A vertical navigation list whose selection slides to the chosen item. */
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
  const [mark, setMark] = useState<{ y: number; height: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = refs.current.get(value);
      if (!el) return;
      const y = el.offsetTop;
      const height = el.offsetHeight;
      setMark((prev) => {
        if (!prev) return { y, height, moved: false };
        if (prev.y === y && prev.height === height) return prev;
        return { y, height, moved: true };
      });
    };
    place();
    document.fonts?.ready.then(place);
  }, [value]);

  return (
    <nav className="ui-bounce" aria-label={label}>
      {mark && (
        <span
          className={`ui-bounce-track ${mark.moved ? "moved" : ""}`}
          style={{ height: mark.height, transform: `translateY(${mark.y}px)` }}
          aria-hidden="true"
        />
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
