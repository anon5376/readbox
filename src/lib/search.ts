import type { ArticleMeta } from "./api";

/** Each word can match the title, author, site or URL of a saved article. */
export function searchArticles(articles: ArticleMeta[], query: string): ArticleMeta[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return articles;
  return articles.filter((article) => {
    const text = [article.title, article.byline, article.siteName, article.url].join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
