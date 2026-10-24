/**
 * How fast you read, learned on this computer. Estimates start from a typical adult's silent
 * reading speed and move towards yours with each article you read; once TRAINING articles have
 * been read they use only yours, from the most recent TRAINING.
 */

export const TYPICAL_WPM = 250;
export const TRAINING = 10;
const KEY = "readbox.readingSpeed";
const KEEP = 40;

// An article counts once you've read a real stretch of it at a pace people can read at, so a quick
// look or a skim down the page doesn't teach Readbox you're slow or superhuman.
const MIN_WORDS = 300;
const MIN_SECONDS = 60;
const MIN_WPM = 80;
const MAX_WPM = 1000;

/** Words read and active seconds spent on one article, over all its sittings. */
export interface Sample {
  dir: string;
  words: number;
  seconds: number;
}

const pace = (s: Sample) => s.words / (s.seconds / 60);
const counts = (s: Sample) => s.words >= MIN_WORDS && s.seconds >= MIN_SECONDS && pace(s) >= MIN_WPM && pace(s) <= MAX_WPM;

/** The articles that taught Readbox your speed, most recent last, at most TRAINING of them. */
export function learnedFrom(samples: Sample[]): Sample[] {
  return samples.filter(counts).slice(-TRAINING);
}

export function estimateWpm(samples: Sample[]): number {
  const learned = learnedFrom(samples);
  if (!learned.length) return TYPICAL_WPM;
  const words = learned.reduce((sum, s) => sum + s.words, 0);
  const minutes = learned.reduce((sum, s) => sum + s.seconds, 0) / 60;
  const share = learned.length / TRAINING;
  return Math.round(TYPICAL_WPM + (words / minutes - TYPICAL_WPM) * share);
}

/** Adds a sitting to that article's sample (moving it to the end, as the most recent). */
export function addSitting(samples: Sample[], sitting: Sample): Sample[] {
  const previous = samples.find((s) => s.dir === sitting.dir);
  const merged = previous
    ? { dir: sitting.dir, words: previous.words + sitting.words, seconds: previous.seconds + sitting.seconds }
    : sitting;
  return [...samples.filter((s) => s.dir !== sitting.dir), merged].slice(-KEEP);
}

let cache: Sample[] | undefined;

function load(): Sample[] {
  if (cache) return cache;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(stored) ? stored : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(samples: Sample[]) {
  cache = samples;
  try {
    localStorage.setItem(KEY, JSON.stringify(samples));
  } catch {
    // Not fatal: the speed just won't be remembered.
  }
}

export const wordsPerMinute = () => estimateWpm(load());

/** How many of the training articles have been read so far (TRAINING when learned). */
export const articlesLearned = () => learnedFrom(load()).length;

export function recordReading(dir: string, words: number, seconds: number) {
  if (words <= 0 || seconds <= 0) return;
  save(addSitting(load(), { dir, words, seconds }));
}

export const resetReadingSpeed = () => save([]);
