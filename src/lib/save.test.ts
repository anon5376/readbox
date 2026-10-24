import { describe, expect, it } from "vitest";
import { normalizeLink, sameLink } from "./save";

describe("sameLink", () => {
  it("ignores anchors, trailing slashes and missing schemes", () => {
    expect(sameLink("https://example.com/post/", "https://example.com/post#comments")).toBe(true);
    expect(sameLink("example.com/post", "https://example.com/post")).toBe(true);
  });

  it("tells different articles apart", () => {
    expect(sameLink("https://example.com/a", "https://example.com/b")).toBe(false);
    expect(sameLink("https://example.com/a?page=2", "https://example.com/a")).toBe(false);
  });
});

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
