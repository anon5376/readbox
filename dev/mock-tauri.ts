// Stands in for the Tauri backend so the interface can run in a normal
// browser with sample articles: `npm run design` then open
// http://localhost:1430/design-preview.html (add ?view=reader, ?panel=settings,
// ?theme=dark, ?empty).
import type { ArticleMeta } from "../src/lib/api";

const params = new URLSearchParams(location.search);

const swatch = (a: string, b: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="700" fill="url(#g)"/></svg>`,
  );

const now = Date.now();
const day = 86_400_000;
const article = (i: number, m: Partial<ArticleMeta>): ArticleMeta => ({
  id: `id${i}`,
  dir: `article-${i}`,
  url: "https://example.com/post",
  title: "Untitled",
  byline: null,
  siteName: null,
  excerpt: null,
  wordCount: 1800,
  savedAt: new Date(now - i * day * 1.3).toISOString(),
  status: "unread",
  progress: 0,
  thumbnail: null,
  ...m,
});

const articles: ArticleMeta[] = params.has("empty")
  ? []
  : [
      article(0, { title: "How to Do Great Work", siteName: "Paul Graham", url: "https://paulgraham.com/greatwork.html", wordCount: 11619, excerpt: "If you collected lists of techniques for doing great work in a lot of different fields, what would the intersection look like?", thumbnail: swatch("#d9a273", "#8b4a2b") }),
      article(1, { title: "Popular git config options", siteName: "Julia Evans", byline: "Julia Evans", url: "https://jvns.ca/blog/2024/02/16/popular-git-config-options/", wordCount: 2227, progress: 0.42, excerpt: "I always wish that command line tools came with data about how popular their various options are." }),
      article(2, { title: "Things we learned about LLMs in 2024", siteName: "Simon Willison’s Weblog", url: "https://simonwillison.net/2024/Dec/31/llms-in-2024/", wordCount: 6836, excerpt: "A lot has happened in the world of Large Language Models over the course of 2024. Here’s a review of things we figured out.", thumbnail: swatch("#6f8fb3", "#2b3f5c") }),
      article(3, { title: "The quiet joy of slow software", siteName: "Field Notes", url: "https://example.org/slow-software", wordCount: 950, excerpt: "Not every tool needs to be a platform. Some of the best ones just sit there and do one thing well." }),
      article(4, { title: "Cocktail party ideas", siteName: "danluu.com", url: "https://danluu.com/cocktail-ideas/", wordCount: 6924, progress: 0.08, thumbnail: swatch("#9bb38a", "#3e5a35") }),
      article(5, { title: "Why the Pocket shutdown hurt", siteName: "The Reader", url: "https://example.net/pocket", wordCount: 1400, status: "archived", excerpt: "Millions of saved articles, one export button and a deadline." }),
    ];

const body = `
<p>If you collected lists of techniques for doing great work in a lot of different fields, what would the intersection look like? I decided to find out by making it.</p>
<p>Partly my goal was to create a guide that could be used by someone working in any field. But I was also curious about the shape of the intersection. And one thing this exercise shows is that it does have a definite shape; it's not just a point labelled "work hard."</p>
<figure><img src="${swatch("#d9a273", "#8b4a2b")}" alt=""><figcaption>The intersection has a definite shape.</figcaption></figure>
<h2>Choosing what to work on</h2>
<p>The first step is to decide what to work on. The work you choose needs to have three qualities: it has to be something you have a natural aptitude for, that you have a deep interest in, and that offers scope to do great work.</p>
<blockquote><p>Develop a habit of working on your own projects. Don't let "work" mean something other people tell you to do.</p></blockquote>
<p>In practice you don't have to worry much about the third criterion. Ambitious people are if anything already too conservative about it. So all you need to do is find something you have an aptitude for and great interest in.</p>
<p>That sounds straightforward, but it's often quite difficult. When you're young you don't know what you're good at or what different kinds of work are like. Some kinds of work you end up doing may not even exist yet.</p>
<pre><code>git config --global pull.rebase true</code></pre>
<p>Curiosity, delight, and the desire to do something impressive are the three forces that drive great work.</p>`.repeat(2);

let nextCallback = 1;
(window as any).__TAURI_INTERNALS__ = {
  transformCallback: (fn: unknown) => {
    const id = nextCallback++;
    (window as any)[`_${id}`] = fn;
    return id;
  },
  // Sample thumbnails are data: URLs; the app joins them onto a folder path.
  convertFileSrc: (path: string) => (path.includes("data:") ? path.slice(path.indexOf("data:")) : path),
  invoke: async (cmd: string, args: any) => {
    switch (cmd) {
      case "get_library_dir":
        return "/Users/you/Documents/Readbox Library";
      case "list_articles":
        return articles;
      case "read_article":
        return body;
      case "update_article": {
        const a = articles.find((x) => x.dir === args.dir)!;
        Object.assign(a, args.patch);
        return { ...a };
      }
      case "plugin:event|listen":
        return nextCallback++;
      case "bridge_status":
        return true;
      case "plugin:app|version":
        return "0.1.0";
      default:
        return null;
    }
  },
};

document.documentElement.dataset.platform = params.get("platform") ?? "macos";
// Headless screenshots would otherwise catch dialogs mid-animation.
const still = document.createElement("style");
still.textContent = `
  *, *::before, *::after { animation: none !important; transition: none !important; }
`;
document.head.append(still);
localStorage.setItem(
  "readbox.readerPrefs",
  JSON.stringify({ appearance: params.get("theme") ?? "light", theme: params.get("page") ?? "auto" }),
);

// Jump straight to a screen for screenshots.
const clickWhenReady = (selector: string) => {
  const timer = setInterval(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) {
      clearInterval(timer);
      el.click();
    }
  }, 50);
};
if (params.get("view") === "reader") clickWhenReady(".row:not(.pending)");
if (params.get("panel")?.startsWith("settings")) {
  clickWhenReady("[data-panel=settings]");
  const section = params.get("panel")!.split("-")[1];
  if (section) setTimeout(() => clickWhenReady(`.settings-tabs [aria-controls=settings-${section}]`), 300);
}
if (params.get("panel") === "text") {
  clickWhenReady(".row:not(.pending)");
  setTimeout(() => clickWhenReady("[data-panel=text]"), 300);
}
