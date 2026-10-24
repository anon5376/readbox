import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState, type FormEvent } from "react";
import { api, type ArticleMeta, type Status } from "../lib/api";
import { readingMinutes } from "../lib/extract";
import { hostname } from "./Reader";

export interface PendingSave {
  key: number;
  link: string;
  /** The page as the browser showed it, when it came from the extension. */
  html?: string;
  error?: string;
}

interface Props {
  articles: ArticleMeta[];
  pending: PendingSave[];
  libraryDir: string;
  onSave: (link: string) => void;
  onRetry: (save: PendingSave) => void;
  onDismiss: (save: PendingSave) => void;
  onOpen: (article: ArticleMeta) => void;
  onChange: (article: ArticleMeta) => void;
  onTrashed: (article: ArticleMeta) => void;
  onLibraryChanged: () => void;
}

export function LibraryView(props: Props) {
  const { articles, pending, libraryDir, onSave } = props;
  const [tab, setTab] = useState<Status>("unread");
  const [link, setLink] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const unread = articles.filter((a) => a.status === "unread");
  const archived = articles.filter((a) => a.status === "archived");
  const shown = tab === "unread" ? unread : archived;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    onSave(link);
    setLink("");
    setTab("unread");
  };

  return (
    <div className="library">
      <header className="toolbar">
        <span className="wordmark">Readbox</span>
        <div className="segmented tabs">
          <button className={tab === "unread" ? "selected" : ""} onClick={() => setTab("unread")}>
            Unread <span className="count">{unread.length}</span>
          </button>
          <button className={tab === "archived" ? "selected" : ""} onClick={() => setTab("archived")}>
            Archive <span className="count">{archived.length}</span>
          </button>
        </div>
        <div className="toolbar-spacer" />
        <button className="ghost" onClick={() => setShowSettings((v) => !v)} aria-expanded={showSettings}>
          Settings
        </button>
        {showSettings && <SettingsPanel libraryDir={libraryDir} onLibraryChanged={props.onLibraryChanged} />}
      </header>

      <div className="library-scroll">
        <div className="library-column">
          <form className="save-bar" onSubmit={submit}>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a link to save it for later"
              spellCheck={false}
              autoFocus
            />
            <button type="submit" className="primary" disabled={!link.trim()}>
              Save
            </button>
          </form>

          {tab === "unread" &&
            pending.map((save) => (
              <div key={save.key} className={`row pending ${save.error ? "failed" : ""}`}>
                <div className="row-main">
                  <div className="row-title">{save.error ? "Couldn't save this link" : "Saving…"}</div>
                  <div className="row-details">{save.link}</div>
                  {save.error && <div className="row-error">{save.error}</div>}
                </div>
                {save.error && (
                  <div className="row-actions visible">
                    <button className="ghost" onClick={() => props.onRetry(save)}>Try again</button>
                    <button className="ghost" onClick={() => props.onDismiss(save)}>Dismiss</button>
                  </div>
                )}
              </div>
            ))}

          {shown.length === 0 && pending.length === 0 && (
            <p className="empty">
              {tab === "unread"
                ? "Nothing to read yet. Paste a link above, or anywhere in this window."
                : "Articles you archive end up here."}
            </p>
          )}

          {shown.map((article) => (
            <ArticleRow key={article.dir} article={article} {...props} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ArticleRow({ article, onOpen, onChange, onTrashed }: { article: ArticleMeta } & Props) {
  const toggleArchive = async () => {
    const status = article.status === "archived" ? "unread" : "archived";
    onChange(await api.updateArticle(article.dir, { status }));
  };
  const trash = async () => {
    await api.trashArticle(article.dir);
    onTrashed(article);
  };
  const started = article.progress > 0.02 && article.progress < 0.98;

  return (
    <div className="row" onClick={() => onOpen(article)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(article)}>
      <div className="row-main">
        <div className="row-title">{article.title}</div>
        <div className="row-details">
          {article.siteName ?? hostname(article.url)} · {readingMinutes(article.wordCount)} min · {savedLabel(article.savedAt)}
        </div>
        {article.excerpt && <div className="row-excerpt">{article.excerpt}</div>}
        {started && (
          <div className="progress" aria-label={`${Math.round(article.progress * 100)}% read`}>
            <div style={{ width: `${article.progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button className="ghost" onClick={toggleArchive}>
          {article.status === "archived" ? "Unarchive" : "Archive"}
        </button>
        <button className="ghost" onClick={() => openUrl(article.url)} title={article.url}>
          Original ↗
        </button>
        <button className="ghost danger" onClick={trash} title="Moves the article to the Trash">
          Delete
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({ libraryDir, onLibraryChanged }: { libraryDir: string; onLibraryChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    const picked = await open({ directory: true, defaultPath: libraryDir, title: "Choose library folder" });
    if (typeof picked !== "string") return;
    try {
      await api.setLibraryDir(picked);
      onLibraryChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="settings-panel" role="dialog" aria-label="Settings">
      <div className="settings-label">Library folder</div>
      <div className="settings-path">{libraryDir}</div>
      <button onClick={choose}>Change folder…</button>
      <p className="settings-hint">
        Everything you save lives in this folder as plain files. Put it inside Dropbox, iCloud Drive or OneDrive
        to sync between computers. Changing it doesn't move existing articles.
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function savedLabel(iso: string): string {
  const saved = new Date(iso);
  const days = Math.floor((startOfDay(new Date()) - startOfDay(saved)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return saved.toLocaleDateString(undefined, { month: "short", day: "numeric", year: days > 300 ? "numeric" : undefined });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
