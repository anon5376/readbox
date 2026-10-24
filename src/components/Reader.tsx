import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { api, localFileUrl, type ArticleMeta } from "../lib/api";
import { readingMinutes, toDisplayHtml } from "../lib/extract";
import type { ReaderPrefs } from "../lib/prefs";
import { Skeleton } from "./affectui/shimmer-loader";
import { Icon } from "./Icon";
import { ReadingControls } from "./ReadingControls";

const PROGRESS_SAVE_DELAY_MS = 600;

interface Props {
  article: ArticleMeta;
  libraryDir: string;
  prefs: ReaderPrefs;
  onPrefs: (patch: Partial<ReaderPrefs>) => void;
  onBack: () => void;
  onChange: (article: ArticleMeta) => void;
}

export function Reader({ article, libraryDir, prefs, onPrefs, onBack, onChange }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  // The title moves into the toolbar once the article's own heading scrolls away.
  const [titleInToolbar, setTitleInToolbar] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const progressBar = useRef<HTMLDivElement>(null);
  const pendingProgress = useRef<number | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    api
      .readArticle(article.dir)
      .then((raw) => {
        if (!cancelled) {
          setHtml(toDisplayHtml(raw, (path) => localFileUrl(libraryDir, article.dir, path)));
        }
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [article.dir, libraryDir]);

  // Return to where the reader left off once the text is on screen.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (html === null || !el) return;
    if (article.progress > 0) el.scrollTop = article.progress * (el.scrollHeight - el.clientHeight);
    showProgress(article.progress);
    // Only on first render of this article's text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  const showProgress = (progress: number) => {
    if (progressBar.current) progressBar.current.style.transform = `scaleX(${progress})`;
  };

  const flushProgress = () => {
    window.clearTimeout(saveTimer.current);
    const progress = pendingProgress.current;
    if (progress === null) return;
    pendingProgress.current = null;
    api.updateArticle(article.dir, { progress }).then(onChange).catch(() => {});
  };

  useEffect(() => flushProgress, [article.dir]); // save on leaving the article

  const onScroll = () => {
    const el = scroller.current!;
    const scrollable = el.scrollHeight - el.clientHeight;
    const progress = scrollable <= 0 ? 1 : el.scrollTop / scrollable;
    showProgress(progress);
    setTitleInToolbar(el.scrollTop > 160);
    pendingProgress.current = progress;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushProgress, PROGRESS_SAVE_DELAY_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") showPrefs ? setShowPrefs(false) : onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPrefs, onBack]);

  // Links in an article open in the normal browser, never inside the app.
  const onContentClick = (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest("a[href]");
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute("href")!;
    if (/^https?:\/\//i.test(href)) openUrl(href);
  };

  const archived = article.status === "archived";
  const toggleArchive = async () => {
    onChange(await api.updateArticle(article.dir, { status: archived ? "unread" : "archived" }));
    if (!archived) onBack();
  };

  const site = article.siteName ?? hostname(article.url);
  const details = [article.byline, article.wordCount ? `${readingMinutes(article.wordCount)} min read` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`reader page-${prefs.theme}`}>
      <header className="toolbar reader-toolbar" data-tauri-drag-region>
        <button className="ghost back-button" onClick={onBack} title="Back to the list (Esc)">
          <Icon name="chevronLeft" size={20} />
          {archived ? "Archive" : "Unread"}
        </button>
        <div className={`toolbar-title ${titleInToolbar ? "visible" : ""}`} data-tauri-drag-region>
          {article.title}
        </div>
        <div className="toolbar-actions">
          <button
            className={`icon-button ${showPrefs ? "active" : ""}`}
            onClick={() => setShowPrefs((v) => !v)}
            aria-expanded={showPrefs}
            title="Text settings"
            data-panel="text"
          >
            <Icon name="text" />
          </button>
          <button className="icon-button" onClick={toggleArchive} title={archived ? "Move to Unread" : "Archive"}>
            <Icon name={archived ? "unarchive" : "archive"} />
          </button>
          <button className="icon-button" onClick={() => openUrl(article.url)} title="Open the original">
            <Icon name="external" />
          </button>
        </div>
        <div className="reading-progress" aria-hidden="true">
          <div ref={progressBar} />
        </div>
        {showPrefs && <PrefsPanel prefs={prefs} onPrefs={onPrefs} />}
      </header>

      <div className="reader-scroll" ref={scroller} onScroll={onScroll}>
        <article
          className={`reader-article font-${prefs.font} width-${prefs.width}`}
          style={{ fontSize: `${prefs.size}px` }}
        >
          <p className="reader-site">{site}</p>
          <h1>{article.title}</h1>
          {details && <p className="reader-details">{details}</p>}
          {error && <p className="error">Couldn't open this article: {error}</p>}
          {html === null && !error && (
            <div className="reader-loading" aria-label="Loading the article">
              {[100, 94, 97, 60, 0, 98, 91, 85].map((w, i) =>
                w ? <Skeleton key={i} width={`${w}%`} height="0.9em" radius={4} /> : <div key={i} className="gap" />,
              )}
            </div>
          )}
          {html !== null && (
            <div className="reader-body" onClick={onContentClick} dangerouslySetInnerHTML={{ __html: html }} />
          )}
          {html !== null && (
            <footer className="reader-end">
              <button className={archived ? "" : "primary"} onClick={toggleArchive}>
                <Icon name={archived ? "unarchive" : "check"} />
                {archived ? "Move back to Unread" : "Done, archive it"}
              </button>
              <button className="ghost" onClick={() => openUrl(article.url)}>
                Open the original
              </button>
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}

function PrefsPanel({ prefs, onPrefs }: { prefs: ReaderPrefs; onPrefs: Props["onPrefs"] }) {
  return (
    <div className="popover prefs-panel" role="dialog" aria-label="Text settings">
      <ReadingControls prefs={prefs} onPrefs={onPrefs} />
    </div>
  );
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
