import { strFromU8, unzipSync } from "fflate";

/** One saved item from another app's export. */
export interface ImportItem {
  url: string;
  title: string | null;
  savedAt: string | null;
  archived: boolean;
  /** 0 to 1, when the other app tracked it. */
  progress: number;
  /** The article itself, when the export includes it (Omnivore does). */
  html: string | null;
}

export interface ParsedImport {
  source: "Pocket" | "Omnivore" | "Instapaper";
  items: ImportItem[];
}

const UNSUPPORTED =
  "This file isn't a Pocket, Omnivore or Instapaper export. Choose the .csv, .html or .zip file you downloaded from them.";

/**
 * Reads an export file. Supported:
 * - Pocket: CSV (2024+) or the older ril_export.html, either alone or zipped
 * - Omnivore: the export zip (metadata_*.json plus content/*.html)
 * - Instapaper: CSV
 */
export function parseImport(fileName: string, bytes: Uint8Array): ParsedImport {
  if (fileName.toLowerCase().endsWith(".zip") || isZip(bytes)) {
    return parseZip(bytes);
  }
  return parseText(fileName, strFromU8(bytes));
}

function parseZip(bytes: Uint8Array): ParsedImport {
  const files = unzipSync(bytes);
  const names = Object.keys(files).filter((n) => !n.startsWith("__MACOSX/"));

  const metadata = names.filter((n) => /(^|\/)metadata_[^/]*\.json$/i.test(n));
  if (metadata.length > 0) {
    const content = new Map<string, string>();
    for (const name of names) {
      const match = name.match(/(?:^|\/)content\/([^/]+)\.html$/i);
      if (match) content.set(match[1], strFromU8(files[name]));
    }
    const records = metadata.flatMap((n) => JSON.parse(strFromU8(files[n])) as unknown[]);
    return { source: "Omnivore", items: dedupe(records.map((r) => omnivoreItem(r, content)).filter(isItem)) };
  }

  // Pocket's download is a zip holding one or more CSV parts.
  const textFiles = names.filter((n) => /\.(csv|html?)$/i.test(n));
  if (textFiles.length === 0) throw new Error(UNSUPPORTED);
  const parts = textFiles.map((n) => parseText(n, strFromU8(files[n])));
  return { source: parts[0].source, items: dedupe(parts.flatMap((p) => p.items)) };
}

function parseText(fileName: string, text: string): ParsedImport {
  if (/\.html?$/i.test(fileName) || /^\s*<(!doctype|html)/i.test(text)) {
    return { source: "Pocket", items: dedupe(pocketHtml(text)) };
  }
  const rows = parseCsv(text);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const url = col("url");
  if (url < 0) throw new Error(UNSUPPORTED);

  const isInstapaper = header.includes("folder");
  const title = col("title");
  const time = col("time_added", "timestamp");
  const state = col("status", "folder");
  const items = rows.map((row): ImportItem | null => {
    const link = row[url]?.trim();
    if (!link || !/^https?:\/\//i.test(link)) return null;
    return {
      url: link,
      title: row[title]?.trim() || null,
      savedAt: fromUnixSeconds(row[time]),
      archived: /archive/i.test(row[state] ?? ""),
      progress: 0,
      html: null,
    };
  });
  return { source: isInstapaper ? "Instapaper" : "Pocket", items: dedupe(items.filter(isItem)) };
}

/** Pocket's older export: an "Unread" list and a "Read Archive" list of links. */
function pocketHtml(text: string): ImportItem[] {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const items: ImportItem[] = [];
  let archived = false;
  doc.body.querySelectorAll("h1, a[href]").forEach((el) => {
    if (el.tagName === "H1") {
      archived = /archive/i.test(el.textContent ?? "");
      return;
    }
    const url = el.getAttribute("href")!;
    if (!/^https?:\/\//i.test(url)) return;
    items.push({
      url,
      title: el.textContent?.trim() || null,
      savedAt: fromUnixSeconds(el.getAttribute("time_added")),
      archived,
      progress: 0,
      html: null,
    });
  });
  return items;
}

function omnivoreItem(record: unknown, content: Map<string, string>): ImportItem | null {
  const r = record as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url : null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const progress = Number(r.readingProgress ?? 0);
  const slug = typeof r.slug === "string" ? r.slug : "";
  return {
    url,
    title: typeof r.title === "string" ? r.title : null,
    savedAt: typeof r.savedAt === "string" ? r.savedAt : null,
    archived: /archiv/i.test(String(r.state ?? "")) || Boolean(r.archivedAt),
    progress: Number.isFinite(progress) ? Math.min(1, Math.max(0, progress > 1 ? progress / 100 : progress)) : 0,
    html: content.get(slug) ?? null,
  };
}

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

function fromUnixSeconds(value: string | null | undefined): string | null {
  const seconds = Number(value);
  return value && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function isItem(item: ImportItem | null): item is ImportItem {
  return item !== null;
}

function dedupe(items: ImportItem[]): ImportItem[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.url) && seen.add(item.url));
}
