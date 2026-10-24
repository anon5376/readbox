import { api, type ArticleMeta, type SavedImage, type Status } from "./api";
import { collectImageUrls, extractArticle, replaceImageSources } from "./extract";
import type { ImportItem } from "./importers";

const IMAGE_DOWNLOADS_AT_ONCE = 4;
/** Smaller pictures are usually icons, avatars or tracking pixels. */
const THUMBNAIL_MIN = { width: 320, height: 160 };

/** Imports keep when and how an item was saved in the other app. */
export interface SaveOptions {
  savedAt?: string;
  status?: Status;
  progress?: number;
}

/** Accepts what people paste: bare domains, links with stray spaces or quotes. */
export function normalizeLink(input: string): string {
  const trimmed = input.trim().replace(/^["'<]+|["'>]+$/g, "");
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Whether two links point at the same article, ignoring `#section` anchors and a trailing slash. */
export function sameLink(a: string, b: string): boolean {
  const key = (link: string) => {
    try {
      const url = new URL(normalizeLink(link));
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch {
      return link.trim();
    }
  };
  return key(a) === key(b);
}

/** Fetches a link and saves it. */
export async function saveLink(input: string, options: SaveOptions = {}): Promise<ArticleMeta> {
  const page = await api.fetchPage(normalizeLink(input));
  return savePage(page.html, page.finalUrl, options);
}

/**
 * Cleans a page, saves it, then downloads its images so the article reads
 * fine offline. A failed image just stays as a remote link.
 */
export async function savePage(pageHtml: string, url: string, options: SaveOptions = {}): Promise<ArticleMeta> {
  const article = extractArticle(pageHtml, url);

  const meta = await api.createArticle({
    url,
    title: article.title,
    byline: article.byline,
    siteName: article.siteName,
    excerpt: article.excerpt,
    wordCount: article.wordCount,
    savedAt: options.savedAt ?? new Date().toISOString(),
    html: article.html,
    status: options.status,
    progress: options.progress,
  });

  const imageUrls = collectImageUrls(article.html);
  const saved: Record<string, SavedImage> = {};
  const queue = [...imageUrls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        saved[url] = await api.downloadImage(meta.dir, url);
      } catch {
        // Keep the remote URL; the image still shows when online.
      }
    }
  };
  await Promise.all(Array.from({ length: IMAGE_DOWNLOADS_AT_ONCE }, worker));
  if (Object.keys(saved).length === 0) return meta;

  const localPaths = Object.fromEntries(Object.entries(saved).map(([url, image]) => [url, image.path]));
  await api.writeArticle(meta.dir, replaceImageSources(article.html, localPaths));

  const thumbnail = imageUrls
    .map((url) => saved[url])
    .find((image) => image && image.width >= THUMBNAIL_MIN.width && image.height >= THUMBNAIL_MIN.height);
  return thumbnail ? api.updateArticle(meta.dir, { thumbnail: thumbnail.path }) : meta;
}

/**
 * Saves one item from another app's export. Uses the article the export
 * carries if there is one, otherwise downloads it, and if that fails keeps
 * the title and link so nothing from the old list is lost.
 */
export async function importItem(item: ImportItem): Promise<{ meta: ArticleMeta; downloaded: boolean }> {
  const options: SaveOptions = {
    savedAt: item.savedAt ?? undefined,
    status: item.archived ? "archived" : "unread",
    progress: item.progress,
  };
  if (item.html) {
    try {
      return { meta: await savePage(item.html, item.url, options), downloaded: true };
    } catch {
      // Fall through to downloading the original.
    }
  }
  try {
    return { meta: await saveLink(item.url, options), downloaded: true };
  } catch {
    return { meta: await saveLinkOnly(item, options), downloaded: false };
  }
}

async function saveLinkOnly(item: ImportItem, options: SaveOptions): Promise<ArticleMeta> {
  const note = document.createElement("p");
  note.append("Readbox couldn't download this article when it was imported. ");
  const link = document.createElement("a");
  link.href = item.url;
  link.textContent = "Open the original";
  note.append(link, ".");
  return api.createArticle({
    url: item.url,
    title: item.title ?? new URL(item.url).hostname,
    byline: null,
    siteName: null,
    excerpt: null,
    wordCount: 0,
    savedAt: options.savedAt ?? new Date().toISOString(),
    html: note.outerHTML,
    status: options.status,
    progress: 0,
  });
}
