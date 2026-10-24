#!/usr/bin/env node
// Checks the design preview in headless Chrome: every kind of button reacts to the pointer, and the
// reader's Narrow / Medium / Wide come out as three different widths. Needs `npm run design`
// running and Google Chrome. Usage: node scripts/ui-check.mjs   (exits 1 on any failure)

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:1430/design-preview.html";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "readbox-ui-check-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let failures = 0;

try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(100);
    targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => undefined);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    waiting.get(d.id)?.(d);
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      waiting.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.result?.value;
  const viewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  const open = async (query) => {
    await send("Page.navigate", { url: `${BASE}?${query}` });
    await sleep(1500);
  };
  const move = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  const check = (ok, label) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) failures++;
  };

  // Moves the pointer onto the element (twice, so things that appear on row hover are hit) and
  // compares its background, opacity and colour with the pointer away.
  const hovers = async (selector, label) => {
    const at = await ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!at) return check(false, `${label}: not found (${selector})`);
    const look = `(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(selector)})); return [s.backgroundColor, s.backgroundImage, s.opacity, s.color].join("|"); })()`;
    await move(1, 1);
    await sleep(120);
    const away = await ev(look);
    await move(at[0] - 1, at[1]);
    await sleep(120);
    await move(at[0], at[1]);
    await sleep(150);
    check(away !== (await ev(look)), `${label} reacts to the pointer`);
  };

  await viewport(1100, 760);
  await open("empty");
  await hovers(".ui-bounce-item:not([data-active=true])", "sidebar item");
  await hovers(".nav-item", "sidebar button");
  await hovers(".start-row button", "plain button");
  await ev(`(() => { const i = document.querySelector(".link-field input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "https://example.com"); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(200);
  await hovers(".link-form button.primary", "Save button");
  await open("");
  await hovers(".row .row-actions .icon-button", "row icon button");
  await hovers(".row .ui-del-trigger", "trash button");
  await open("panel=settings");
  await hovers(".settings-header .icon-button", "Settings close button");
  await hovers(".group-row-control button", "Settings button");
  await hovers(".dialog .ui-seg:not([data-variant=underline]) .ui-seg__opt:not([data-active])", "segmented option");
  await hovers(".dialog .ui-seg[data-variant=underline] .ui-seg__opt:not([data-active])", "Settings tab");
  await open("panel=text");
  await sleep(400);
  await hovers(".page-swatch:not([aria-checked=true])", "page colour swatch");
  await hovers(".size-stepper button", "text size button");
  await open("view=reader");
  await hovers(".reader-toolbar .back-button", "reader back button");
  await hovers(".reader-toolbar .toolbar-actions .icon-button", "reader toolbar button");

  // Narrow < Medium < Wide, in a roomy window and in a small one with large text.
  for (const [w, h, size] of [[1100, 760, 20], [760, 700, 28]]) {
    await viewport(w, h);
    const widths = [];
    for (const width of ["narrow", "medium", "wide"]) {
      await open(`view=reader&width=${width}&size=${size}`);
      widths.push(await ev(`Math.round(document.querySelector(".reader-article").getBoundingClientRect().width)`));
    }
    check(widths[0] < widths[1] && widths[1] < widths[2], `widths differ at ${w}px, ${size}pt text: ${widths.join(" < ")}`);
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
