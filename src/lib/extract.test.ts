// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  collectImageUrls,
  extractArticle,
  readingMinutes,
  replaceImageSources,
  toDisplayHtml,
} from "./extract";

const paragraph =
  "Reading later is a habit worth keeping, and this paragraph exists to look like a real article body. ".repeat(6);

const page = `<!doctype html>
<html><head><title>A Calm Article | Example Blog</title>
<meta property="og:site_name" content="Example Blog">
<style>body { color: red }</style></head>
<body>
  <nav><a href="/">Home</a> <a href="/about">About</a></nav>
  <article>
    <h1>A Calm Article</h1>
    <p class="byline">By Ada Lovelace</p>
    <p>${paragraph}</p>
    <img src="/img/hero-small.jpg" srcset="/img/hero-small.jpg 400w, /img/hero-large.jpg 1600w" alt="Hero">
    <p style="color: red" onclick="alert(1)">${paragraph} <a href="/next">Next</a></p>
    <script>alert("x")</script>
    <p>${paragraph}</p>
  </article>
  <footer>Subscribe to our newsletter!</footer>
</body></html>`;

describe("extractArticle", () => {
  const article = extractArticle(page, "https://blog.example.com/posts/calm");

  it("finds the title, site and byline", () => {
    expect(article.title).toContain("A Calm Article");
    expect(article.siteName).toBe("Example Blog");
    expect(article.byline).toContain("Ada Lovelace");
  });

  it("removes scripts, inline handlers and inline styles", () => {
    expect(article.html).not.toContain("<script");
    expect(article.html).not.toContain("onclick");
    expect(article.html).not.toContain("style=");
    expect(article.html).not.toContain("Subscribe to our newsletter");
  });

  it("makes links and images absolute and keeps the largest image", () => {
    expect(article.html).toContain('href="https://blog.example.com/next"');
    expect(article.html).toContain('src="https://blog.example.com/img/hero-large.jpg"');
    expect(article.html).not.toContain("srcset");
  });

  it("counts words", () => {
    expect(article.wordCount).toBeGreaterThan(200);
  });

  it("rejects pages with no article", () => {
    expect(() => extractArticle("<html><body></body></html>", "https://example.com")).toThrow();
  });
});

describe("refusing pages that aren't articles", () => {
  const notAnArticle = /doesn't look like an article/;

  it("refuses an inbox-style list", () => {
    const rows = Array.from(
      { length: 60 },
      (_, i) => `<div class="item"><span>Sender ${i}</span> <span>Subject line ${i} about something</span></div>`,
    ).join("");
    const inbox = `<html><head><title>Inbox</title></head><body><div role="main">${rows}</div></body></html>`;
    expect(() => extractArticle(inbox, "https://webmail.example.com/inbox")).toThrow(notAnArticle);
  });

  it("refuses a login screen", () => {
    const login = "<html><body><form><p>Loading your mail</p><input name=user></form></body></html>";
    expect(() => extractArticle(login, "https://example.com/login")).toThrow(notAnArticle);
  });

  it("refuses a page that is mostly links", () => {
    const links = Array.from(
      { length: 40 },
      (_, i) => `<p><a href="/story/${i}">Story number ${i} with a long and descriptive headline that goes on</a></p>`,
    ).join("");
    const feed = `<html><body><main>${links}</main></body></html>`;
    expect(() => extractArticle(feed, "https://news.example.com/")).toThrow(notAnArticle);
  });

  it("never saves pages from email apps", () => {
    expect(() => extractArticle(page, "https://mail.proton.me/u/0/inbox")).toThrow(/email apps/);
    expect(() => extractArticle(page, "https://mail.google.com/mail/u/0/")).toThrow(/email apps/);
  });

  it("accepts essays written with line breaks instead of paragraphs", () => {
    const essay = `<html><head><title>An Essay</title></head><body><table><tr><td><font>${
      `${paragraph}<br><br>`.repeat(8)
    }</font></td></tr></table></body></html>`;
    expect(extractArticle(essay, "https://essays.example.com/essay.html").wordCount).toBeGreaterThan(500);
  });
});

describe("image handling", () => {
  const html =
    '<p><img src="https://a.com/1.png"><img src="https://a.com/1.png"><img src="data:image/png;base64,xx"><img src="https://a.com/2.jpg"></p>';

  it("collects unique remote images", () => {
    expect(collectImageUrls(html)).toEqual(["https://a.com/1.png", "https://a.com/2.jpg"]);
  });

  it("swaps in downloaded copies and leaves the rest alone", () => {
    const out = replaceImageSources(html, { "https://a.com/1.png": "images/aa.png" });
    expect(out.match(/images\/aa\.png/g)).toHaveLength(2);
    expect(out).toContain("https://a.com/2.jpg");
  });

  it("resolves local images for display and re-sanitizes", () => {
    const out = toDisplayHtml('<img src="images/aa.png"><img src="x" onerror="alert(1)">', (p) => `asset://lib/${p}`);
    expect(out).toContain('src="asset://lib/images/aa.png"');
    expect(out).not.toContain("onerror");
  });
});

it("estimates reading time", () => {
  expect(readingMinutes(0, 250)).toBe(1);
  expect(readingMinutes(2500, 250)).toBe(10);
  expect(readingMinutes(2500, 500)).toBe(5);
});
