import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type Status = "unread" | "archived";

export interface ArticleMeta {
  id: string;
  dir: string;
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  wordCount: number;
  savedAt: string;
  status: Status;
  progress: number;
}

export interface NewArticle {
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  wordCount: number;
  savedAt: string;
  html: string;
}

export const api = {
  getLibraryDir: () => invoke<string>("get_library_dir"),
  setLibraryDir: (path: string) => invoke<void>("set_library_dir", { path }),
  fetchPage: (url: string) => invoke<{ html: string; finalUrl: string }>("fetch_page", { url }),
  createArticle: (article: NewArticle) => invoke<ArticleMeta>("create_article", { article }),
  listArticles: () => invoke<ArticleMeta[]>("list_articles"),
  readArticle: (dir: string) => invoke<string>("read_article", { dir }),
  writeArticle: (dir: string, html: string) => invoke<void>("write_article", { dir, html }),
  updateArticle: (dir: string, patch: { status?: Status; progress?: number }) =>
    invoke<ArticleMeta>("update_article", { dir, patch }),
  trashArticle: (dir: string) => invoke<void>("trash_article", { dir }),
  downloadImage: (dir: string, url: string) => invoke<string>("download_image", { dir, url }),
};

/** URL the webview can load for a file inside an article folder. */
export function localFileUrl(libraryDir: string, articleDir: string, relativePath: string): string {
  const sep = libraryDir.includes("\\") ? "\\" : "/";
  const path = [libraryDir, "articles", articleDir, ...relativePath.split("/")].join(sep);
  return convertFileSrc(path);
}
