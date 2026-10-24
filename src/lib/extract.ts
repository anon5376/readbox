import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

export interface ExtractedArticle {
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  html: string;
  wordCount: number;
}

/**
 * Turns a full web page into a clean article: Readability (the engine behind
 * Firefox's reader view) finds the content, then DOMPurify strips anything
 * that could run code or restyle the reader.
 */
export function extractArticle(pageHtml: string, pageUrl: string): ExtractedArticle {
  const doc = new DOMParser().parseFromString(pageHtml, "text/html");
  setBaseUrl(doc, pageUrl);

  const parsed = new Readability(doc).parse();
  if (!parsed?.content) {
    throw new Error("Couldn't find an article on that page.");
  }

  const html = sanitize(parsed.content);
  const text = parsed.textContent ?? "";
  return {
    title: clean(parsed.title) ?? new URL(pageUrl).hostname,
    byline: clean(parsed.byline),
    siteName: clean(parsed.siteName),
    excerpt: clean(parsed.excerpt),
    html: pickSingleImageSources(html),
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

/** Readability resolves relative links and images against the document's base URL. */
function setBaseUrl(doc: Document, pageUrl: string) {
  let base = doc.querySelector("base");
  const declared = base?.getAttribute("href");
  if (!base) {
    base = doc.createElement("base");
    doc.head.prepend(base);
  }
  base.href = declared ? new URL(declared, pageUrl).href : pageUrl;
}

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
  });
}

/**
 * Responsive images list several candidates in `srcset`. Keep only the largest
 * as a plain `src` so there is exactly one file to download for offline reading.
 */
function pickSingleImageSources(html: string): string {
  const doc = parseFragment(html);
  doc.querySelectorAll("picture source").forEach((source) => source.remove());
  doc.querySelectorAll("img").forEach((img) => {
    const best = largestCandidate(img.getAttribute("srcset"), img.baseURI);
    if (best) img.setAttribute("src", best);
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.setAttribute("loading", "lazy");
  });
  return doc.body.innerHTML;
}

function largestCandidate(srcset: string | null, baseUri: string): string | null {
  if (!srcset) return null;
  let best: { url: string; size: number } | null = null;
  for (const candidate of srcset.split(/,\s+/)) {
    const [url, descriptor = "1x"] = candidate.trim().split(/\s+/);
    const size = parseFloat(descriptor) * (descriptor.endsWith("w") ? 1 : 1000);
    if (url && !Number.isNaN(size) && (!best || size > best.size)) {
      best = { url, size };
    }
  }
  if (!best) return null;
  try {
    return new URL(best.url, baseUri).href;
  } catch {
    return null;
  }
}

/** Remote image URLs in the article, in order of appearance, without duplicates. */
export function collectImageUrls(html: string): string[] {
  const urls = new Set<string>();
  parseFragment(html)
    .querySelectorAll("img[src]")
    .forEach((img) => {
      const src = img.getAttribute("src")!;
      if (/^https?:\/\//i.test(src)) urls.add(src);
    });
  return [...urls];
}

/** Points images at their downloaded copies, e.g. `images/ab12.jpg`. */
export function replaceImageSources(html: string, localPaths: Record<string, string>): string {
  const doc = parseFragment(html);
  doc.querySelectorAll("img[src]").forEach((img) => {
    const local = localPaths[img.getAttribute("src")!];
    if (local) img.setAttribute("src", local);
  });
  return doc.body.innerHTML;
}

/**
 * Prepares stored article HTML for the reader. It is sanitized again because
 * the library folder may have been synced or edited outside the app.
 */
export function toDisplayHtml(html: string, resolveLocal: (relativePath: string) => string): string {
  const doc = parseFragment(sanitize(html));
  doc.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src")!;
    if (src.startsWith("images/")) img.setAttribute("src", resolveLocal(src));
  });
  return doc.body.innerHTML;
}

function parseFragment(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 230));
}
