// Ported from Rare UI's Animated Counter (https://rareui.com/components/animatedcounter).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Readbox with CSS transitions instead of Motion; whole numbers only. Styles are in App.css.

import { useEffect, useRef, useState } from "react";

// Three turns of the wheel. A digit rests in the middle turn, so it can roll a whole step up or
// down and then snap back to the same face in the middle without a visible jump.
const FACES = [...Array(30).keys()].map((n) => n % 10);
const mod = (n: number, m: number) => ((n % m) + m) % m;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A count that rolls to its new value on a wheel of digits, like an odometer. */
export function AnimatedCounter({ value, className = "" }: { value: number; className?: string }) {
  const whole = Math.max(0, Math.trunc(value));
  const digits = String(whole).split("").map(Number);
  const previous = useRef(whole);
  const direction = whole >= previous.current ? 1 : -1;
  useEffect(() => {
    previous.current = whole;
  }, [whole]);

  return (
    <span className={`ui-counter ${className}`}>
      <span className="visually-hidden">{whole}</span>
      <span aria-hidden="true" className="ui-counter-digits">
        {digits.map((digit, i) => (
          // Keyed by place from the right, so gaining a place adds a column instead of remounting them.
          <Wheel key={digits.length - i} digit={digit} direction={direction} />
        ))}
      </span>
    </span>
  );
}

function Wheel({ digit, direction }: { digit: number; direction: number }) {
  const [index, setIndex] = useState(10 + digit);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (mod(index, 10) === digit) return;
    if (reducedMotion()) {
      setIndex(10 + digit);
      return;
    }
    setRolling(true);
    setIndex((at) => (direction > 0 ? at + mod(digit - at, 10) : at - mod(at - digit, 10)));
    // Only the digit should restart the roll; a reversal alone must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digit]);

  return (
    <span className="ui-counter-wheel">
      <span className="ui-counter-sizer">0</span>
      <span
        className={`ui-counter-stack ${rolling ? "rolling" : ""}`}
        style={{ transform: `translateY(${-index * 1.5}em)` }}
        onTransitionEnd={() => {
          setRolling(false);
          setIndex(10 + digit);
        }}
      >
        {FACES.map((face, i) => (
          <span key={i}>{face}</span>
        ))}
      </span>
    </span>
  );
}
