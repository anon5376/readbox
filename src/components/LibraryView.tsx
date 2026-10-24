import { openUrl } from "@tauri-apps/plugin-opener";
import { useRef, useState, type FormEvent } from "react";
import { api, localFileUrl, type ArticleMeta, type Status } from "../lib/api";
import { readingMinutes } from "../lib/extract";
import { shortcut } from "../lib/platform";
import type { ReaderPrefs } from "../lib/prefs";
import type { ImportJob } from "../lib/useImport";
import { SegmentedControl } from "./affectui/segmented-control";
import { ShimmerText } from "./affectui/shimmer-loader";
import { TabOverload } from "./affectui/tab-overload";
import { Icon, type IconName } from "./Icon";
import { hostname } from "./Reader";
import { Settings } from "./Settings";

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
  prefs: ReaderPrefs;
  onPrefs: (patch: Partial<ReaderPrefs>) => void;
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

  return (
    <div className="library">
      <aside className="sidebar">
        <div className="titlebar-space" data-tauri-drag-region />
        <div className="sidebar-section" data-tauri-drag-region>
          Library
        </div>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`nav-item ${tab === t.key ? "selected" : ""}`}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
            >
              <Icon name={t.icon} />
              <span className="nav-label">{t.label}</span>
              <span className="count">{counts[t.key] || ""}</span>
            </button>
          ))}
        </nav>
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
        <header className="main-toolbar" data-tauri-drag-region>
          <div className="compact-tabs">
            <SegmentedControl
              aria-label="Show"
              size="sm"
              value={tab}
              onChange={setTab}
              options={TABS.map((t) => ({ value: t.key, label: t.label, count: counts[t.key] || undefined }))}
            />
          </div>
          <div className="toolbar-heading" data-tauri-drag-region>
            <h1 data-tauri-drag-region>{tab === "unread" ? "Unread" : "Archive"}</h1>
            <span className="toolbar-subtitle" data-tauri-drag-region>
              {summary(shown)}
            </span>
          </div>
          <div className="toolbar-spacer" data-tauri-drag-region />
          <form className="link-field" onSubmit={submit} role="search">
            <Icon name="link" size={15} />
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste a link to save"
              aria-label="Link to save"
              spellCheck={false}
            />
            {link.trim() && (
              <button type="submit" className="link-field-save">
                Save
              </button>
            )}
          </form>
          <button className="icon-button compact-only" onClick={chooseImport} title="Import" disabled={importing}>
            <Icon name="import" />
          </button>
          <button className="icon-button compact-only" onClick={() => setShowSettings(true)} title="Settings">
            <Icon name="settings" />
          </button>
        </header>

        <div className="main-scroll">
          {props.importJob && (
            <ImportBanner job={props.importJob} onStop={props.onStopImport} onDismiss={props.onDismissImport} />
          )}

          {(shown.length > 0 || pending.length > 0) && (
            <div className="list">
              {tab === "unread" &&
                pending.map((save) => (
                  <div key={save.key} className={`row pending ${save.error ? "failed" : ""}`}>
                    <div className="row-main">
                      <div className="row-title">
                        {save.error ? "Couldn't save this link" : <ShimmerText>Saving…</ShimmerText>}
                      </div>
                      <div className="row-meta">{hostname(save.link)}</div>
                      {save.error && <div className="row-error">{save.error}</div>}
                    </div>
                    {save.error && (
                      <div className="row-actions visible">
                        <button onClick={() => props.onRetry(save)}>Try Again</button>
                        <button className="ghost" onClick={() => props.onDismiss(save)}>
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              {shown.map((article) => (
                <ArticleRow key={article.dir} {...props} article={article} libraryDir={libraryDir} />
              ))}
            </div>
          )}

          {shown.length === 0 && pending.length === 0 && !importing && (
            <EmptyState tab={tab} onImport={chooseImport} />
          )}
        </div>
      </section>

      {showSettings && (
        <Settings
          libraryDir={libraryDir}
          prefs={props.prefs}
          onPrefs={props.onPrefs}
          onLibraryChanged={props.onLibraryChanged}
          onImport={chooseImport}
          importing={importing}
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
            setShowSettings(false);
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
  const site = article.siteName ?? hostname(article.url);

  return (
    <div
      className="row"
      onClick={() => onOpen(article)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(article)}
    >
      <div className="row-main">
        <div className="row-title">{article.title}</div>
        <div className="row-meta">
          {site} — {linkOnly ? "link only" : `${readingMinutes(article.wordCount)} min`}
          <span className="row-date">{savedLabel(article.savedAt)}</span>
          {started && <span className="row-progress">{Math.round(article.progress * 100)}% read</span>}
        </div>
        {article.excerpt && <div className="row-excerpt">{article.excerpt}</div>}
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
        <button className="icon-button" onClick={() => openUrl(article.url)} title="Open the Original">
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
        <Icon name="archive" size={40} />
        <h2>No Archived Articles</h2>
        <p>When you finish an article, archive it and it moves here.</p>
      </div>
    );
  }
  return (
    <div className="empty">
      <TabOverload className="empty-art" label="Overlapping browser windows full of pages" />
      <h2>Nothing to Read Yet</h2>
      <p>Too many tabs open? Save them here and read them later, even offline.</p>
      <ul className="tips">
        <li>
          <Icon name="link" />
          <span>Paste a link in the toolbar, or press {shortcut("V")} anywhere in this window.</span>
        </li>
        <li>
          <Icon name="globe" />
          <span>Click the Readbox button in your browser to save the page you're on.</span>
        </li>
        <li>
          <Icon name="import" />
          <span>
            Bring your list from Pocket, Omnivore or Instapaper.{" "}
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
        <button className="ghost" onClick={onDismiss}>
          Dismiss
        </button>
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
        <button className="ghost" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}

function summary(articles: ArticleMeta[]): string {
  if (articles.length === 0) return "No articles";
  const minutes = articles.reduce((sum, a) => sum + (a.wordCount ? readingMinutes(a.wordCount) : 0), 0);
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return `${articles.length} ${articles.length === 1 ? "article" : "articles"}, ${time}`;
}

function savedLabel(iso: string): string {
  const saved = new Date(iso);
  const days = Math.floor((startOfDay(new Date()) - startOfDay(saved)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return saved.toLocaleDateString(undefined, { weekday: "long" });
  return saved.toLocaleDateString(undefined, { month: "short", day: "numeric", year: days > 300 ? "numeric" : undefined });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
