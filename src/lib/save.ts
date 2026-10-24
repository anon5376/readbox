import { api, type ArticleMeta } from "./api";
import { collectImageUrls, extractArticle, replaceImageSources } from "./extract";

const IMAGE_DOWNLOADS_AT_ONCE = 4;

/** Accepts what people paste: bare domains, links with stray spaces or quotes. */
export function normalizeLink(input: string): string {
  const trimmed = input.trim().replace(/^["'<]+|["'>]+$/g, "");
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Fetches a page, cleans it, saves it, then downloads its images so the
 * article reads fine offline. A failed image just stays as a remote link.
 */
export async function saveLink(input: string): Promise<ArticleMeta> {
  const page = await api.fetchPage(normalizeLink(input));
  const article = extractArticle(page.html, page.finalUrl);

  const meta = await api.createArticle({
    url: page.finalUrl,
    title: article.title,
    byline: article.byline,
    siteName: article.siteName,
    excerpt: article.excerpt,
    wordCount: article.wordCount,
    savedAt: new Date().toISOString(),
    html: article.html,
  });

  const localPaths: Record<string, string> = {};
  const queue = collectImageUrls(article.html);
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        localPaths[url] = await api.downloadImage(meta.dir, url);
      } catch {
        // Keep the remote URL; the image still shows when online.
      }
    }
  };
  await Promise.all(Array.from({ length: IMAGE_DOWNLOADS_AT_ONCE }, worker));

  if (Object.keys(localPaths).length > 0) {
    await api.writeArticle(meta.dir, replaceImageSources(article.html, localPaths));
  }
  return meta;
}
