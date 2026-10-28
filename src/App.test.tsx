// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleMeta } from "./lib/api";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme: async () => {} }),
}));
vi.mock("./lib/api", () => ({
  api: {
    getLibraryDir: async () => "/test/library",
    listArticles: async () => articles,
    readArticle: async () => "<p>The saved article is available offline.</p>",
  },
  localFileUrl: (_library: string, _dir: string, path: string) => path,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("matchMedia", () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
}));
vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
const { default: App } = await import("./App");

const article = (dir: string, fields: Partial<ArticleMeta>): ArticleMeta => ({
  id: dir, dir, title: "Untitled", url: "https://example.com", byline: null,
  siteName: null, excerpt: null, wordCount: 300, savedAt: "2026-10-01T12:00:00Z",
  status: "unread", progress: 0, thumbnail: null, ...fields,
});
const articles = [
  article("git", { title: "Popular git config options", byline: "Julia Evans", siteName: "Wizard Zines", url: "https://jvns.ca/blog/git-config" }),
  article("work", { title: "How to Do Great Work", siteName: "Paul Graham", url: "https://paulgraham.com/greatwork.html" }),
  article("archived", { title: "Git notes from last year", byline: "Julia Evans", status: "archived" }),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function searchInput() {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search articles"]');
  expect(input, "The library needs an accessible search field").not.toBeNull();
  return input!;
}

async function search(query: string) {
  const input = searchInput();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const titles = () => Array.from(container.querySelectorAll(".row .row-title"), (el) => el.textContent);

describe("library search", () => {
  it.each(["  GIT  ", "Julia", "wizard", "jvns.ca", "julia   config"])(
    "finds an unread article by metadata: %s", async (query) => {
      await search(query);
      expect(titles()).toEqual(["Popular git config options"]);
      expect(container.querySelector('[role="status"]')?.textContent).toBe("1 result");
    },
  );

  it("shows no matches without pretending the library is empty, and clears by button or Escape", async () => {
    await search("git missing");
    expect(titles()).toEqual([]);
    expect(container.textContent).toContain("No matching articles");
    expect(container.textContent).not.toContain("Save your first article");
    const clear = container.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]');
    expect(clear).not.toBeNull();
    await act(async () => clear!.click());
    expect(titles()).toEqual(["Popular git config options", "How to Do Great Work"]);
    expect(document.activeElement).toBe(searchInput());

    await search("great");
    await act(async () => searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(searchInput().value).toBe("");
    expect(titles()).toHaveLength(2);
    await search("   ");
    expect(titles()).toHaveLength(2);
  });

  it("keeps the query and Archive selection after opening a result and returning", async () => {
    await search("git");
    const archive = Array.from(container.querySelectorAll<HTMLButtonElement>('nav[aria-label="Library"] button'))
      .find((button) => button.textContent === "Archive")!;
    await act(async () => archive.click());
    expect(titles()).toEqual(["Git notes from last year"]);
    await act(async () => container.querySelector<HTMLElement>(".row")!.click());
    expect(container.querySelector(".reader h1")?.textContent).toBe("Git notes from last year");
    await act(async () => container.querySelector<HTMLButtonElement>('button[title="Back to the list (Esc)"]')!.click());
    expect(searchInput().value).toBe("git");
    expect(titles()).toEqual(["Git notes from last year"]);
    expect(container.querySelector('nav [aria-current="page"]')?.textContent).toBe("Archive");
  });

  it.each(["ctrlKey", "metaKey"])("focuses search with %s+F", async (modifier) => {
    const key = new KeyboardEvent("keydown", { key: "f", [modifier]: true, bubbles: true, cancelable: true });
    await act(async () => window.dispatchEvent(key));
    expect(document.activeElement).toBe(searchInput());
    expect(key.defaultPrevented).toBe(true);
  });
});
