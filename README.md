# Readbox (working name)

A calm read-later app for Mac and Windows. Save an article, read it later, offline, without ads or clutter.

- **No account, no server.** Nothing you save leaves your computer.
- **Your library is a folder of plain files.** Put it in Dropbox, iCloud Drive or OneDrive to sync between computers. You can open the files without the app.
- **Small and fast.** Built with [Tauri](https://tauri.app), not a bundled Chrome.

> **Status:** early, Phase 1. Saving by pasting a link, the reading list and the reader work. The browser extension, Pocket/Omnivore import and Windows builds come next.

> **Built with AI.** Most of the code is written by AI coding agents, directed and tested by a human. Bugs are likely at this stage; please open an issue.

## Using it

- Paste a link into the box at the top (or press ⌘V / Ctrl+V anywhere in the window) to save it.
- Click an article to read it. **Aa** changes text size, font, width and theme. Esc goes back.
- Archive what you've read; Delete moves an article to the system Trash.
- **Settings** shows where your library lives and lets you pick another folder.

## The library folder

By default it's `Documents/Readbox Library`:

```text
Readbox Library/
  articles/
    how-to-do-great-work-1a2b3c4d/
      meta.json      title, link, saved date, read/archived, reading position
      article.html   the cleaned article
      images/        pictures, downloaded when you save
```

Every article is its own folder, so syncing two computers rarely conflicts.

## Development

Needs [Node.js](https://nodejs.org) and [Rust](https://rustup.rs).

```bash
npm install
npm run tauri dev    # run the app
npm test             # frontend tests
cd src-tauri && cargo test   # library/storage tests
```

Article cleaning uses Mozilla's [Readability](https://github.com/mozilla/readability) (the engine behind Firefox's reader view) and [DOMPurify](https://github.com/cure53/DOMPurify).

## License

[MIT](LICENSE)
