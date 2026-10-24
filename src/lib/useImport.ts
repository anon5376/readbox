import { useCallback, useRef, useState } from "react";
import type { ArticleMeta } from "./api";
import { parseImport } from "./importers";
import { importItem, sameLink } from "./save";

const IMPORTS_AT_ONCE = 3;

export interface ImportJob {
  source: string | null;
  total: number;
  done: number;
  /** Saved as title + link because the article couldn't be downloaded. */
  linkOnly: number;
  /** Couldn't be saved at all (e.g. the library folder isn't writable). */
  failed: number;
  alreadySaved: number;
  running: boolean;
  stopped: boolean;
  error: string | null;
}

/** Runs an import in the background, a few items at a time, and reports progress. */
export function useImport(getArticles: () => ArticleMeta[], onSaved: (article: ArticleMeta) => void) {
  const [job, setJob] = useState<ImportJob | null>(null);
  const stopRequested = useRef(false);
  const running = useRef(false);

  const start = useCallback(
    async (file: File) => {
      if (running.current) return;
      const blank: ImportJob = {
        source: null, total: 0, done: 0, linkOnly: 0, failed: 0, alreadySaved: 0,
        running: false, stopped: false, error: null,
      };
      let parsed;
      try {
        parsed = parseImport(file.name, new Uint8Array(await file.arrayBuffer()));
      } catch (e) {
        setJob({ ...blank, error: e instanceof Error ? e.message : String(e) });
        return;
      }

      const existing = getArticles();
      const queue = parsed.items.filter((item) => !existing.some((a) => sameLink(a.url, item.url)));
      running.current = true;
      stopRequested.current = false;
      setJob({
        ...blank,
        source: parsed.source,
        total: queue.length,
        alreadySaved: parsed.items.length - queue.length,
        running: true,
      });

      const worker = async () => {
        for (let item = queue.shift(); item && !stopRequested.current; item = queue.shift()) {
          let linkOnly = 0;
          let failed = 0;
          try {
            const result = await importItem(item);
            onSaved(result.meta);
            if (!result.downloaded) linkOnly = 1;
          } catch {
            failed = 1;
          }
          setJob((j) => j && { ...j, done: j.done + 1, linkOnly: j.linkOnly + linkOnly, failed: j.failed + failed });
        }
      };
      await Promise.all(Array.from({ length: IMPORTS_AT_ONCE }, worker));
      running.current = false;
      setJob((j) => j && { ...j, running: false, stopped: stopRequested.current });
    },
    [getArticles, onSaved],
  );

  const stop = useCallback(() => {
    stopRequested.current = true;
  }, []);
  const dismiss = useCallback(() => setJob(null), []);

  return { job, start, stop, dismiss };
}
