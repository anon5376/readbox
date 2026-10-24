// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewArticle } from "./api";
import type { ImportItem } from "./importers";

const created: NewArticle[] = [];
const fetchPage = vi.fn();

vi.mock("./api", () => ({
  api: {
    fetchPage: (url: string) => fetchPage(url),
    createArticle: async (article: NewArticle) => {
      created.push(article);
      return { ...article, id: "id", dir: "dir", status: article.status ?? "unread", progress: article.progress ?? 0 };
    },
    downloadImage: async () => {
      throw new Error("offline");
    },
    writeArticle: async () => {},
  },
}));

const { importItem } = await import("./save");

const body = `<p>${"A real paragraph with enough words in it to count as part of an article. ".repeat(5)}</p>`;
const articleHtml = `<html><head><title>Saved post</title></head><body><article>${body.repeat(4)}</article></body></html>`;

const item = (overrides: Partial<ImportItem> = {}): ImportItem => ({
  url: "https://example.com/post",
  title: "From the export",
  savedAt: "2021-03-04T05:06:07.000Z",
  archived: true,
  progress: 0.5,
  html: null,
  ...overrides,
});

describe("importItem", () => {
  beforeEach(() => {
    created.length = 0;
    fetchPage.mockReset();
  });

  it("uses the article the export carries, without downloading", async () => {
    const result = await importItem(item({ html: articleHtml }));
    expect(result.downloaded).toBe(true);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ savedAt: "2021-03-04T05:06:07.000Z", status: "archived", progress: 0.5 });
  });

  it("downloads the article when the export has only a link", async () => {
    fetchPage.mockResolvedValue({ html: articleHtml, finalUrl: "https://example.com/post" });
    const result = await importItem(item());
    expect(result.downloaded).toBe(true);
    expect(created[0].title).toBe("Saved post");
    expect(created[0].status).toBe("archived");
  });

  it("keeps the title and link when the article can't be downloaded", async () => {
    fetchPage.mockRejectedValue(new Error("404"));
    const result = await importItem(item());
    expect(result.downloaded).toBe(false);
    expect(created[0]).toMatchObject({ title: "From the export", savedAt: "2021-03-04T05:06:07.000Z", wordCount: 0 });
    expect(created[0].html).toContain('href="https://example.com/post"');
  });
});
