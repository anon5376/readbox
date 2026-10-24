# Readbox: notes for AI agents

## How to work with the owner

- The owner doesn't code and wants **you to make the decisions**: product, design and technical. Pick the best option, do it, then say in a line or two what you chose and why. Don't ask them to choose between options.
- When a phase is done and tested, move on to the next one on the roadmap without waiting to be told.
- Work on a feature branch; merge it into `main` yourself once all tests pass.
- **Still ask first** for anything that:
  - costs money,
  - is public or leaves this computer (pushing to GitHub, making a repo public, publishing to extension or app stores, posting anywhere),
  - deletes or moves the owner's saved articles or other files outside this repo,
  - needs their password, their hands (installing something in their browser), or their taste ("does this feel right?").
- Test before saying something works: `npm test`, `cd src-tauri && cargo test`, and real pages. Say plainly what wasn't tested.
- Talk to the owner in short, plain language. No jargon, no code in messages unless they ask.

## UI work

Before building or restyling any UI, follow the sourcing rules in @docs/ui-sourcing.md.

## Project facts

- Working name **Readbox** (placeholder). MIT license. The README says it's AI-built; keep that honest.
- Tauri 2 desktop app: React + TypeScript in `src/`, Rust in `src-tauri/`, browser extension in `extension/`.
- The library is a plain folder (see README). For test runs set `READBOX_LIBRARY=<temp folder>` so the owner's real library is never touched.
- The extension talks to the app on `127.0.0.1:47612` (`src-tauri/src/bridge.rs`); keep its origin/host/JSON checks.
- No paid accounts: no Apple Developer Program, so no iCloud, notarization or App Store for now.
- The owner uses Firefox (extension loaded temporarily via `about:debugging`).

## Roadmap

1. ~~Save links, reading list, offline reader~~
2. ~~Browser extension~~
3. ~~Import from Pocket, Omnivore and Instapaper~~ (export isn't needed: the library is already plain files)
4. Windows build and installers (unsigned for now; SignPath Foundation for free signing later)
5. Beta, then launch
6. Later: phone (web version, or iPhone once there's budget)
