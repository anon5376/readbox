import { useCallback, useEffect, useRef, useState } from "react";
import { LibraryView, type PendingSave } from "./components/LibraryView";
import { Reader } from "./components/Reader";
import { api, type ArticleMeta } from "./lib/api";
import { useReaderPrefs } from "./lib/prefs";
import { saveLink } from "./lib/save";
import "./App.css";

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

  const runSave = useCallback(async (save: PendingSave) => {
    setPending((list) => [save, ...list.filter((s) => s.key !== save.key)]);
    try {
      const meta = await saveLink(save.link);
      setArticles((list) => [meta, ...list]);
      setPending((list) => list.filter((s) => s.key !== save.key));
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setPending((list) => list.map((s) => (s.key === save.key ? { ...save, error } : s)));
    }
  }, []);

  const save = useCallback((link: string) => runSave({ key: nextKey.current++, link: link.trim() }), [runSave]);

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
        />
      )}
    </main>
  );
}
