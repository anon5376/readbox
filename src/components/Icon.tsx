/** Small line icons drawn for Readbox, 24×24 grid, stroked with the text colour. */
const PATHS = {
  inbox: "M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20M6.2 5h11.6L20 13.5V19H4v-5.5z",
  archive: "M3.5 4.5h17v4h-17zM5.5 8.5V19.5h13V8.5M10 12.5h4",
  unarchive: "M3.5 4.5h17v4h-17zM5.5 8.5V19.5h13V8.5M12 17.5v-6M9.5 14 12 11.5 14.5 14",
  external: "M13.5 4.5h6v6M19.5 4.5 11 13M17.5 14v5.5h-13v-13H10",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7M10.5 11v5M13.5 11v5",
  back: "M19 12H5.5M11 6l-6 6 6 6",
  chevronLeft: "M14.5 5.5 8 12l6.5 6.5",
  sidebar: "M4.5 5.5h15v13h-15zM9.5 5.5v13",
  globe: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5M12 3.5C9.7 5.9 8.6 8.7 8.6 12s1.1 6.1 3.4 8.5",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.8v.2",
  book: "M5 5.5c2.6-.9 5-.6 7 .9v12.1c-2-1.5-4.4-1.8-7-.9zM19 5.5c-2.6-.9-5-.6-7 .9v12.1c2-1.5 4.4-1.8 7-.9z",
  import: "M12 4v10.5M7.5 10 12 14.5 16.5 10M4.5 16v3.5h15V16",
  settings: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  folder: "M3.5 6.5h6l2 2h9v10h-17z",
  text: "M4 18 8.5 6 13 18M5.6 14h5.8M15 18v-5.5a2.5 2.5 0 0 1 5 0V18M15 15h5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  check: "M5 12.5 10 17.5 19 7",
  puzzle: "M9 4.5h3.5v2a1.75 1.75 0 0 0 3.5 0v-2h3.5V8h-2a1.75 1.75 0 0 0 0 3.5h2v8H16v-2a1.75 1.75 0 0 0-3.5 0v2H4.5V11h2a1.75 1.75 0 0 0 0-3.5h-2v-3z",
  close: "M6 6l12 12M18 6 6 18",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
