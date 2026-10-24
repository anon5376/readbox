import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { LibraryView, type PendingSave } from "./components/LibraryView";
import { Reader } from "./components/Reader";
import { api, type ArticleMeta } from "./lib/api";
import { useReaderPrefs } from "./lib/prefs";
import { sameLink, saveLink, savePage } from "./lib/save";
import { useImport } from "./lib/useImport";
import "./App.css";

interface SaveOutcome {
  ok: boolean;
  title?: string;
  error?: string;
  alreadySaved?: boolean;
}

export default function App() {
  const [articles, setArticles] = useState<ArticleMeta[]>([]);
  const [libraryDir, setLibraryDir] = useState("");
  const [openDir, setOpenDir] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSave[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prefs, updatePrefs] = useReaderPrefs();
  const nextKey = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [dir, list] = await Promise.all([api.getLibraryDir(), api.listArticles()]);
      setLibraryDir(dir);
      setArticles(list);
      setLoadError(null);
    } catch (e) {
      setLoadError(String(e));
    }
  }, []);

  // Re-read the folder when the window comes back into focus, to pick up
  // articles another computer synced in.
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const articlesRef = useRef(articles);
  articlesRef.current = articles;

  const addArticle = useCallback(
    (meta: ArticleMeta) => setArticles((list) => [meta, ...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt))),
    [],
  );
  const imports = useImport(useCallback(() => articlesRef.current, []), addArticle);

  const runSave = useCallback(async (save: PendingSave): Promise<SaveOutcome> => {
    const existing = articlesRef.current.find((a) => sameLink(a.url, save.link));
    if (existing) {
      setPending((list) => list.filter((s) => s.key !== save.key));
      return { ok: true, title: existing.title, alreadySaved: true };
    }
    setPending((list) => [save, ...list.filter((s) => s.key !== save.key)]);
    try {
      const meta = save.html ? await savePage(save.html, save.link) : await saveLink(save.link);
      addArticle(meta);
      setPending((list) => list.filter((s) => s.key !== save.key));
      return { ok: true, title: meta.title };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setPending((list) => list.map((s) => (s.key === save.key ? { ...save, error } : s)));
      return { ok: false, error };
    }
  }, [addArticle]);

  const save = useCallback(
    (link: string, html?: string) => runSave({ key: nextKey.current++, link: link.trim(), html }),
    [runSave],
  );

  // Saves sent by the browser extension arrive as events; the extension waits
  // for the outcome to show a ✓ or an error on its button.
  useEffect(() => {
    const unlisten = listen<{ id: number; url: string; html: string | null }>("save-request", async (event) => {
      const { id, url, html } = event.payload;
      const outcome = await save(url, html ?? undefined);
      await invoke("complete_save", { id, outcome });
    });
    unlisten.then(() => invoke("bridge_ready"));
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [save]);

  // Pasting a link anywhere outside a text field saves it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]") || openDir) return;
      const text = e.clipboardData?.getData("text/plain").trim() ?? "";
      if (/^https?:\/\/\S+$/i.test(text)) {
        e.preventDefault();
        save(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [save, openDir]);

  const replace = useCallback(
    (updated: ArticleMeta) => setArticles((list) => list.map((a) => (a.dir === updated.dir ? updated : a))),
    [],
  );
  const closeReader = useCallback(() => setOpenDir(null), []);

  const current = articles.find((a) => a.dir === openDir);

  return (
    <main className="app">
      {loadError && <div className="banner error">Couldn't read your library: {loadError}</div>}
      {current ? (
        <Reader
          article={current}
          libraryDir={libraryDir}
          prefs={prefs}
          onPrefs={updatePrefs}
          onBack={closeReader}
          onChange={replace}
        />
      ) : (
        <LibraryView
          articles={articles}
          pending={pending}
          libraryDir={libraryDir}
          onSave={save}
          onRetry={runSave}
          onDismiss={(s) => setPending((list) => list.filter((p) => p.key !== s.key))}
          onOpen={(a) => setOpenDir(a.dir)}
          onChange={replace}
          onTrashed={(a) => setArticles((list) => list.filter((x) => x.dir !== a.dir))}
          onLibraryChanged={refresh}
          importJob={imports.job}
          onImport={imports.start}
          onStopImport={imports.stop}
          onDismissImport={imports.dismiss}
        />
      )}
    </main>
  );
}
