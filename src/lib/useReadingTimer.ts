import { useEffect, useRef } from "react";
import { recordReading } from "./readingSpeed";

// A pause longer than this between scrolls counts as this long: you'd stopped reading.
const IDLE_MS = 90_000;

interface Timer {
  scrolled: (progress: number) => void;
}

/**
 * Times how long you actively read an article, to learn your reading speed: the time between
 * scrolls while the window is in front (each gap capped at IDLE_MS) and how much of the article you
 * moved through. Recorded when you leave the article. Returns the reader's scroll callback.
 */
export function useReadingTimer(dir: string, wordCount: number, startProgress: number) {
  const timer = useRef<Timer | null>(null);

  useEffect(() => {
    let furthest = startProgress;
    let activeMs = 0;
    let last = performance.now();
    let away = document.visibilityState !== "visible";
    const tick = () => {
      const now = performance.now();
      if (!away) activeMs += Math.min(now - last, IDLE_MS);
      last = now;
    };
    const pause = () => {
      tick();
      away = true;
    };
    const resume = () => {
      away = false;
      last = performance.now();
    };
    const onVisibility = () => (document.visibilityState === "visible" ? resume() : pause());
    timer.current = {
      scrolled: (progress) => {
        tick();
        furthest = Math.max(furthest, progress);
      },
    };
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", onVisibility);
      tick(); // the last screen, read before leaving
      if (wordCount) recordReading(dir, wordCount * (furthest - startProgress), activeMs / 1000);
    };
    // One timing per article; later progress saves change startProgress but not this sitting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  return (progress: number) => timer.current?.scrolled(progress);
}
