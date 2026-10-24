// @vitest-environment jsdom
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseCsv, parseImport } from "./importers";

const text = (s: string) => strToU8(s);

describe("Pocket", () => {
  it("reads the CSV export with read/archived state and dates", () => {
    const csv = [
      "title,url,time_added,tags,status",
      '"Hello, world",https://example.com/a,1700000000,,unread',
      "Second,https://example.com/b,1600000000,tech|ai,archive",
      "No link,,1600000000,,unread",
    ].join("\n");
    const { source, items } = parseImport("part_000000.csv", text(csv));
    expect(source).toBe("Pocket");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: "https://example.com/a", title: "Hello, world", archived: false });
    expect(items[0].savedAt).toBe(new Date(1700000000 * 1000).toISOString());
    expect(items[1].archived).toBe(true);
  });

  it("reads CSV parts inside the downloaded zip", () => {
    const zip = zipSync({
      "part_000000.csv": text("title,url,time_added,tags,status\nA,https://example.com/a,1,,unread\n"),
      "part_000001.csv": text("title,url,time_added,tags,status\nB,https://example.com/b,2,,archive\n"),
    });
    expect(parseImport("pocket.zip", zip).items.map((i) => i.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("reads the older HTML export", () => {
    const html = `<!DOCTYPE html><html><body>
      <h1>Unread</h1><ul><li><a href="https://example.com/u" time_added="1700000000" tags="">Unread one</a></li></ul>
      <h1>Read Archive</h1><ul><li><a href="https://example.com/r" time_added="1600000000">Read one</a></li></ul>
      </body></html>`;
    const { items } = parseImport("ril_export.html", text(html));
    expect(items).toEqual([
      expect.objectContaining({ url: "https://example.com/u", title: "Unread one", archived: false }),
      expect.objectContaining({ url: "https://example.com/r", archived: true }),
    ]);
  });
});

describe("Omnivore", () => {
  it("reads metadata and uses the saved article content", () => {
    const zip = zipSync({
      "metadata_0_to_1.json": text(
        JSON.stringify([
          { slug: "a-post", url: "https://example.com/a", title: "A post", savedAt: "2024-05-01T10:00:00Z", state: "SUCCEEDED", readingProgress: 40 },
          { slug: "old", url: "https://example.com/old", title: "Old", savedAt: "2023-01-01T00:00:00Z", state: "ARCHIVED", readingProgress: 100 },
        ]),
      ),
      "content/a-post.html": text("<p>The article</p>"),
    });
    const { source, items } = parseImport("omnivore-export.zip", zip);
    expect(source).toBe("Omnivore");
    expect(items[0]).toMatchObject({ title: "A post", archived: false, progress: 0.4, html: "<p>The article</p>" });
    expect(items[1]).toMatchObject({ archived: true, progress: 1, html: null });
  });
});

describe("Instapaper", () => {
  it("reads the CSV export", () => {
    const csv = "URL,Title,Selection,Folder,Timestamp\nhttps://example.com/i,Insta,,Archive,1700000000\n";
    const { source, items } = parseImport("instapaper-export.csv", text(csv));
    expect(source).toBe("Instapaper");
    expect(items[0]).toMatchObject({ url: "https://example.com/i", title: "Insta", archived: true });
  });
});

it("rejects files from somewhere else", () => {
  expect(() => parseImport("notes.csv", text("name,email\nAda,ada@example.com\n"))).toThrow(/isn't a Pocket/);
  expect(() => parseImport("photos.zip", zipSync({ "a.jpg": new Uint8Array([1, 2]) }))).toThrow(/isn't a Pocket/);
});

it("parses quoted CSV fields", () => {
  expect(parseCsv('a,"b, c","say ""hi"""\r\n"multi\nline",2,3')).toEqual([
    ["a", "b, c", 'say "hi"'],
    ["multi\nline", "2", "3"],
  ]);
});
