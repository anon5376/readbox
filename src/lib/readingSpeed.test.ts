import { describe, expect, it } from "vitest";
import { TRAINING, TYPICAL_WPM, addSitting, estimateWpm, learnedFrom, type Sample } from "./readingSpeed";

// An article read at `wpm`, for five minutes.
const read = (dir: string, wpm: number): Sample => ({ dir, words: wpm * 5, seconds: 300 });
const many = (count: number, wpm: number) => Array.from({ length: count }, (_, i) => read(`a${i}`, wpm));

describe("estimateWpm", () => {
  it("starts at a typical speed", () => {
    expect(estimateWpm([])).toBe(TYPICAL_WPM);
  });

  it("moves part of the way towards yours while training", () => {
    // 5 of 10 articles at 450 wpm: halfway from 250 to 450.
    expect(estimateWpm(many(5, 450))).toBe(350);
  });

  it("uses only your speed once trained", () => {
    expect(estimateWpm(many(TRAINING, 400))).toBe(400);
  });

  it("follows your most recent articles after training", () => {
    const old = many(TRAINING, 200);
    const recent = Array.from({ length: TRAINING }, (_, i) => read(`b${i}`, 500));
    expect(estimateWpm([...old, ...recent])).toBe(500);
  });

  it("ignores quick looks and skims", () => {
    const glance = { dir: "g", words: 100, seconds: 20 };
    const skim = { dir: "s", words: 6000, seconds: 120 }; // 3000 wpm
    const idle = { dir: "i", words: 400, seconds: 600 }; // 40 wpm: walked away
    expect(learnedFrom([glance, skim, idle])).toEqual([]);
    expect(estimateWpm([glance, skim, idle, ...many(TRAINING, 300)])).toBe(300);
  });
});

describe("addSitting", () => {
  it("adds up an article read over several sittings", () => {
    const once = addSitting([], { dir: "a", words: 200, seconds: 40 });
    expect(learnedFrom(once)).toEqual([]); // too little yet
    const twice = addSitting(once, { dir: "a", words: 300, seconds: 60 });
    expect(twice).toEqual([{ dir: "a", words: 500, seconds: 100 }]);
    expect(learnedFrom(twice)).toHaveLength(1);
  });

  it("moves the article just read to the end", () => {
    const samples = addSitting([read("a", 300), read("b", 300)], { dir: "a", words: 10, seconds: 2 });
    expect(samples.map((s) => s.dir)).toEqual(["b", "a"]);
  });
});
