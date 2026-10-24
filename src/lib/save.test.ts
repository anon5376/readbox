import { describe, expect, it } from "vitest";
import { normalizeLink } from "./save";

describe("normalizeLink", () => {
  it("adds https to bare domains", () => {
    expect(normalizeLink("example.com/post")).toBe("https://example.com/post");
  });

  it("keeps existing schemes and trims junk around pasted links", () => {
    expect(normalizeLink("  http://example.com  ")).toBe("http://example.com");
    expect(normalizeLink('"https://example.com/a"')).toBe("https://example.com/a");
    expect(normalizeLink("<https://example.com/a>")).toBe("https://example.com/a");
  });
});
