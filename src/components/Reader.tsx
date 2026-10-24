import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { api, localFileUrl, type ArticleMeta } from "../lib/api";
import { readingMinutes, toDisplayHtml } from "../lib/extract";
import { SIZE_RANGE, type ReaderPrefs } from "../lib/prefs";

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
  const scroller = useRef<HTMLDivElement>(null);
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
    if (html === null || !el || article.progress <= 0) return;
    el.scrollTop = article.progress * (el.scrollHeight - el.clientHeight);
    // Only on first render of this article's text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

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
    pendingProgress.current = scrollable <= 0 ? 1 : el.scrollTop / scrollable;
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

  const toggleArchive = async () => {
    const status = article.status === "archived" ? "unread" : "archived";
    onChange(await api.updateArticle(article.dir, { status }));
    if (status === "archived") onBack();
  };

  const details = [article.siteName ?? hostname(article.url), article.byline, `${readingMinutes(article.wordCount)} min read`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="reader">
      <header className="toolbar">
        <button className="ghost" onClick={onBack} title="Back to list (Esc)">
          ← Back
        </button>
        <div className="toolbar-spacer" />
        <button className="ghost" onClick={() => setShowPrefs((v) => !v)} aria-expanded={showPrefs} title="Text settings">
          Aa
        </button>
        <button className="ghost" onClick={toggleArchive}>
          {article.status === "archived" ? "Move to Unread" : "Archive"}
        </button>
        <button className="ghost" onClick={() => openUrl(article.url)} title={article.url}>
          Original ↗
        </button>
        {showPrefs && <PrefsPanel prefs={prefs} onPrefs={onPrefs} />}
      </header>

      <div className="reader-scroll" ref={scroller} onScroll={onScroll}>
        <article
          className={`reader-article font-${prefs.font} width-${prefs.width}`}
          style={{ fontSize: `${prefs.size}px` }}
        >
          <h1>{article.title}</h1>
          <p className="reader-details">{details}</p>
          {error && <p className="error">Couldn't open this article: {error}</p>}
          {html !== null && <div className="reader-body" onClick={onContentClick} dangerouslySetInnerHTML={{ __html: html }} />}
        </article>
      </div>
    </div>
  );
}

function PrefsPanel({ prefs, onPrefs }: { prefs: ReaderPrefs; onPrefs: Props["onPrefs"] }) {
  const step = (delta: number) =>
    onPrefs({ size: Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, prefs.size + delta)) });

  return (
    <div className="prefs-panel" role="dialog" aria-label="Text settings">
      <div className="prefs-row">
        <button onClick={() => step(-2)} disabled={prefs.size <= SIZE_RANGE.min} aria-label="Smaller text">
          A−
        </button>
        <span className="prefs-value">{prefs.size}</span>
        <button onClick={() => step(2)} disabled={prefs.size >= SIZE_RANGE.max} aria-label="Larger text">
          A+
        </button>
      </div>
      <Segmented
        value={prefs.font}
        options={[["serif", "Serif"], ["sans", "Sans"]]}
        onChange={(font) => onPrefs({ font })}
      />
      <Segmented
        value={prefs.width}
        options={[["narrow", "Narrow"], ["medium", "Medium"], ["wide", "Wide"]]}
        onChange={(width) => onPrefs({ width })}
      />
      <Segmented
        value={prefs.theme}
        options={[["system", "Auto"], ["light", "Light"], ["sepia", "Sepia"], ["dark", "Dark"]]}
        onChange={(theme) => onPrefs({ theme })}
      />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([key, label]) => (
        <button key={key} className={key === value ? "selected" : ""} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
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
