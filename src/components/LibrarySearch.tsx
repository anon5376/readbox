import { useEffect, useRef } from "react";
import type { Status } from "../lib/api";
import { shortcut } from "../lib/platform";
import { Icon } from "./Icon";

export function LibrarySearch({ query, onChange, tab, count, active }: {
  query: string;
  onChange: (query: string) => void;
  tab: Status;
  count: number;
  active: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange("");
    input.current?.focus();
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div className="library-search" role="search" aria-label="Library search">
      <div className="link-field search-field">
        <Icon name="search" size={15} />
        <input
          ref={input}
          type="search"
          aria-label="Search articles"
          placeholder={`Search ${tab === "unread" ? "Unread" : "Archive"}`}
          title={`Search by title, author, site or link (${shortcut("F")})`}
          spellCheck={false}
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              clear();
            }
          }}
        />
        {query && (
          <button className="icon-button" onClick={clear} aria-label="Clear search" title="Clear search (Esc)">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <span className="search-count" role="status" aria-atomic="true">
        {query.trim() ? `${count} ${count === 1 ? "result" : "results"}` : ""}
      </span>
    </div>
  );
}
