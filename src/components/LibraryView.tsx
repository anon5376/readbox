import { open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, localFileUrl, type ArticleMeta, type Status } from "../lib/api";
import { readingMinutes } from "../lib/extract";
import { isMac, shortcut } from "../lib/platform";
import type { ImportJob } from "../lib/useImport";
import { Icon, type IconName } from "./Icon";
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
  importJob: ImportJob | null;
  onImport: (file: File) => void;
  onStopImport: () => void;
  onDismissImport: () => void;
}

const TABS: { key: Status; label: string; icon: IconName }[] = [
  { key: "unread", label: "Unread", icon: "inbox" },
  { key: "archived", label: "Archive", icon: "archive" },
];

export function LibraryView(props: Props) {
  const { articles, pending, libraryDir, onSave } = props;
  const [tab, setTab] = useState<Status>("unread");
  const [link, setLink] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const counts = {
    unread: articles.filter((a) => a.status === "unread").length,
    archived: articles.filter((a) => a.status === "archived").length,
  };
  const shown = articles.filter((a) => a.status === tab);
  const importing = props.importJob?.running ?? false;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    onSave(link);
    setLink("");
    setTab("unread");
  };
  const chooseImport = () => fileInput.current?.click();

  const tabButtons = (className: string) =>
    TABS.map((t) => (
      <button key={t.key} className={`${className} ${tab === t.key ? "selected" : ""}`} onClick={() => setTab(t.key)}>
        <Icon name={t.icon} />
        <span className="nav-label">{t.label}</span>
        <span className="count">{counts[t.key] || ""}</span>
      </button>
    ));

  return (
    <div className="library">
      <aside className="sidebar">
        <div className="titlebar-space" data-tauri-drag-region />
        <div className="brand" data-tauri-drag-region>
          <AppMark />
          Readbox
        </div>
        <nav className="nav">{tabButtons("nav-item")}</nav>
        <div className="sidebar-spacer" data-tauri-drag-region />
        <button className="nav-item" onClick={chooseImport} disabled={importing}>
          <Icon name="import" />
          <span className="nav-label">Import…</span>
        </button>
        <button className="nav-item" onClick={() => setShowSettings(true)} data-panel="settings">
          <Icon name="settings" />
          <span className="nav-label">Settings</span>
        </button>
      </aside>

      <section className="main">
        <header className="main-header" data-tauri-drag-region>
          <div className="compact-tabs segmented">{tabButtons("")}</div>
          <h1 data-tauri-drag-region>{tab === "unread" ? "Unread" : "Archive"}</h1>
          <span className="header-summary" data-tauri-drag-region>
            {summary(shown)}
          </span>
          <div className="toolbar-spacer" data-tauri-drag-region />
          <button className="icon-button compact-only" onClick={chooseImport} title="Import" disabled={importing}>
            <Icon name="import" />
          </button>
          <button className="icon-button compact-only" onClick={() => setShowSettings(true)} title="Settings">
            <Icon name="settings" />
          </button>
        </header>

        <div className="main-scroll">
          <div className="column">
            <form className="save-bar" onSubmit={submit}>
              <Icon name="link" />
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Paste a link to save it for later"
                spellCheck={false}
              />
              {link.trim() ? (
                <button type="submit" className="primary small">
                  Save
                </button>
              ) : (
                <kbd>{shortcut("V")}</kbd>
              )}
            </form>

            {props.importJob && (
              <ImportBanner job={props.importJob} onStop={props.onStopImport} onDismiss={props.onDismissImport} />
            )}

            {tab === "unread" &&
              pending.map((save) => (
                <div key={save.key} className={`row pending ${save.error ? "failed" : ""}`}>
                  <div className="row-main">
                    <div className="row-site">{hostname(save.link)}</div>
                    <div className="row-title">{save.error ? "Couldn't save this link" : "Saving…"}</div>
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

            {shown.length === 0 && pending.length === 0 && !props.importJob?.running && (
              <EmptyState tab={tab} onImport={chooseImport} />
            )}

            {shown.map((article) => (
              <ArticleRow key={article.dir} {...props} article={article} libraryDir={libraryDir} />
            ))}
          </div>
        </div>
      </section>

      {showSettings && (
        <SettingsDialog
          libraryDir={libraryDir}
          onLibraryChanged={props.onLibraryChanged}
          onClose={() => setShowSettings(false)}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".csv,.html,.htm,.zip"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            setTab("unread");
            props.onImport(file);
          }
        }}
      />
    </div>
  );
}

function ArticleRow({
  article,
  libraryDir,
  onOpen,
  onChange,
  onTrashed,
}: { article: ArticleMeta; libraryDir: string } & Props) {
  const toggleArchive = async () => {
    const status = article.status === "archived" ? "unread" : "archived";
    onChange(await api.updateArticle(article.dir, { status }));
  };
  const trash = async () => {
    await api.trashArticle(article.dir);
    onTrashed(article);
  };
  const started = article.progress > 0.02 && article.progress < 0.98;
  const linkOnly = article.wordCount === 0;

  return (
    <div
      className="row"
      onClick={() => onOpen(article)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(article)}
    >
      <div className="row-main">
        <div className="row-site">{article.siteName ?? hostname(article.url)}</div>
        <div className="row-title">{article.title}</div>
        {article.excerpt && <div className="row-excerpt">{article.excerpt}</div>}
        <div className="row-details">
          {linkOnly ? "Link only" : `${readingMinutes(article.wordCount)} min read`}
          <span className="dot">·</span>
          {savedLabel(article.savedAt)}
          {started && (
            <>
              <span className="dot">·</span>
              <span className="row-progress">{Math.round(article.progress * 100)}% read</span>
            </>
          )}
        </div>
      </div>
      {article.thumbnail && (
        <img
          className="row-thumb"
          src={localFileUrl(libraryDir, article.dir, article.thumbnail)}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="icon-button"
          onClick={toggleArchive}
          title={article.status === "archived" ? "Move to Unread" : "Archive"}
        >
          <Icon name={article.status === "archived" ? "unarchive" : "archive"} />
        </button>
        <button className="icon-button" onClick={() => openUrl(article.url)} title="Open the original">
          <Icon name="external" />
        </button>
        <button className="icon-button danger" onClick={trash} title="Move to Trash">
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ tab, onImport }: { tab: Status; onImport: () => void }) {
  if (tab === "archived") {
    return (
      <div className="empty">
        <div className="empty-mark">
          <Icon name="archive" size={26} />
        </div>
        <h2>Nothing archived yet</h2>
        <p>When you finish an article, archive it and it moves here.</p>
      </div>
    );
  }
  return (
    <div className="empty">
      <div className="empty-mark">
        <Icon name="inbox" size={26} />
      </div>
      <h2>Nothing to read yet</h2>
      <p>Save articles now, read them later, even offline. Three ways to start:</p>
      <ul className="tips">
        <li>
          <Icon name="link" />
          <span>
            <strong>Paste a link</strong> into the box above, or press {shortcut("V")} anywhere in this window.
          </span>
        </li>
        <li>
          <Icon name="puzzle" />
          <span>
            <strong>Use the browser button</strong> to save the page you're reading.
          </span>
        </li>
        <li>
          <Icon name="import" />
          <span>
            <strong>Bring your old list</strong> from Pocket, Omnivore or Instapaper.{" "}
            <button className="link-button" onClick={onImport}>
              Import…
            </button>
          </span>
        </li>
      </ul>
    </div>
  );
}

function ImportBanner({ job, onStop, onDismiss }: { job: ImportJob; onStop: () => void; onDismiss: () => void }) {
  if (job.error) {
    return (
      <div className="import-banner failed">
        <div className="import-text">{job.error}</div>
        <button className="ghost" onClick={onDismiss}>Dismiss</button>
      </div>
    );
  }
  const n = (count: number) => count.toLocaleString();
  const notes = [
    job.linkOnly > 0 && `${n(job.linkOnly)} couldn't be downloaded and were kept as links.`,
    job.failed > 0 && `${n(job.failed)} couldn't be saved.`,
    job.alreadySaved > 0 && `${n(job.alreadySaved)} were already in Readbox.`,
  ].filter(Boolean);

  return (
    <div className="import-banner">
      <div className="import-text">
        <div className="import-title">
          {job.running
            ? `Importing from ${job.source}: ${n(job.done)} of ${n(job.total)}`
            : `${job.stopped ? "Import stopped" : "Import finished"}: ${n(job.done - job.failed)} articles from ${job.source}.`}
        </div>
        {job.running && (
          <div className="progress">
            <div style={{ width: `${job.total ? (job.done / job.total) * 100 : 100}%` }} />
          </div>
        )}
        {notes.length > 0 && <div className="import-notes">{notes.join(" ")}</div>}
        {job.running && <div className="import-notes">You can keep reading while this runs.</div>}
      </div>
      {job.running ? (
        <button onClick={onStop}>Stop</button>
      ) : (
        <button className="ghost" onClick={onDismiss}>Dismiss</button>
      )}
    </div>
  );
}

function SettingsDialog({
  libraryDir,
  onLibraryChanged,
  onClose,
}: {
  libraryDir: string;
  onLibraryChanged: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="dialog-header">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} title="Close (Esc)">
            <Icon name="close" />
          </button>
        </header>

        <section className="dialog-section">
          <div className="settings-label">Library folder</div>
          <div className="settings-path">
            <Icon name="folder" />
            <span>{libraryDir}</span>
          </div>
          <div className="settings-buttons">
            <button onClick={choose}>Change folder…</button>
            <button onClick={() => revealItemInDir(libraryDir)}>{isMac ? "Show in Finder" : "Show in Explorer"}</button>
          </div>
          <p className="settings-hint">
            Everything you save lives in this folder as plain files. Put it inside Dropbox, iCloud Drive or OneDrive to
            sync between computers. Changing it doesn't move existing articles.
          </p>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="dialog-section about">
          <AppMark />
          <div>
            <div className="settings-label">Readbox 0.1</div>
            <p className="settings-hint">
              Free and open source. No account, no tracking.{" "}
              <button className="link-button" onClick={() => openUrl("https://github.com/anon5376/readbox")}>
                Source code
              </button>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** The app's mark: a tray holding a page with a folded corner. */
export function AppMark() {
  return (
    <svg className="app-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M10.5 6.5h8l3 3V19h-11z" fill="var(--mark-paper)" />
      <path d="M18.5 6.5v3h3" fill="none" stroke="var(--accent)" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6.5 16.5h5.2l1.6 2.6h5.4l1.6-2.6h5.2V25.5h-19z" fill="var(--mark-paper)" />
    </svg>
  );
}

function summary(articles: ArticleMeta[]): string {
  if (articles.length === 0) return "";
  const minutes = articles.reduce((sum, a) => sum + (a.wordCount ? readingMinutes(a.wordCount) : 0), 0);
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return `${articles.length} ${articles.length === 1 ? "article" : "articles"} · ${time}`;
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
