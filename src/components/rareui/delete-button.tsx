// Ported from Rare UI's Delete Button (https://rareui.com/components/deletebutton).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Readbox with CSS transitions instead of Motion and sized for a row's action cluster.
// Styles are in App.css.

import { useEffect, useRef, useState } from "react";

// Long enough for the tick to draw before the row goes.
const CONFIRM_HOLD_MS = 420;

/** A trash button that asks for confirmation in place: the lid opens and a tick and a cross slide out. */
export function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const keep = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const confirm = () => {
    setOpen(false);
    setDone(true);
    timer.current = window.setTimeout(onConfirm, CONFIRM_HOLD_MS);
  };

  return (
    <div
      className="ui-del"
      data-open={open}
      data-done={done}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          keep();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="ui-del-trigger"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => (open ? keep() : setOpen(true))}
        disabled={done}
      >
        {done ? (
          <svg className="ui-del-tick" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12.5 9.5 18 20 7" />
          </svg>
        ) : (
          <svg className="ui-del-bin" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <g className="ui-del-lid">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </g>
          </svg>
        )}
      </button>
      <span role="status" aria-live="polite" className="visually-hidden">
        {done ? "Moved to Trash" : ""}
      </span>
      <div className="ui-del-panel" aria-hidden={!open}>
        <button type="button" className="ui-del-choice confirm" onClick={confirm} tabIndex={open ? 0 : -1} title="Move to Trash">
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12.5 9.5 18 20 7" />
          </svg>
          <span className="visually-hidden">Confirm</span>
        </button>
        <button type="button" className="ui-del-choice" onClick={keep} tabIndex={open ? 0 : -1} title="Keep">
          <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6 18 18M18 6 6 18" />
          </svg>
          <span className="visually-hidden">Keep</span>
        </button>
      </div>
    </div>
  );
}
