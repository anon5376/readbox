// Sends pages to the Readbox app running on this computer. The app listens
// only on 127.0.0.1, so nothing leaves the machine.
const ENDPOINT = "http://127.0.0.1:47612/save";

const BADGES = {
  saving: { text: "…", color: "#6f6b64" },
  saved: { text: "✓", color: "#2e7d32" },
  error: { text: "!", color: "#b3261e" },
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "save-page", title: "Save page to Readbox", contexts: ["page"] });
  chrome.contextMenus.create({ id: "save-link", title: "Save link to Readbox", contexts: ["link"] });
});

chrome.action.onClicked.addListener((tab) => savePage(tab));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-link" && info.linkUrl) {
    send(tab, { url: info.linkUrl, html: null });
  } else if (info.menuItemId === "save-page") {
    savePage(tab);
  }
});

async function savePage(tab) {
  if (!/^https?:\/\//.test(tab.url ?? "")) {
    return show(tab, "error", "Only web pages can be saved.");
  }
  // Sending the page as it is on screen means articles you're logged into
  // save correctly. Some pages (browser stores, PDFs) can't be read; the app
  // then downloads the link itself.
  let html = null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });
    html = result?.result ?? null;
  } catch {
    html = null;
  }
  await send(tab, { url: tab.url, html });
}

async function send(tab, body) {
  show(tab, "saving", "Saving to Readbox…");
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return show(tab, "error", "Readbox isn't open. Start the app and try again.");
  }
  const outcome = await response.json().catch(() => ({ ok: false, error: "Unexpected reply from Readbox." }));
  if (outcome.ok) {
    show(tab, "saved", outcome.alreadySaved ? `Already in Readbox: ${outcome.title}` : `Saved: ${outcome.title}`);
  } else {
    show(tab, "error", outcome.error || "Couldn't save this page.");
  }
}

function show(tab, state, message) {
  const tabId = tab?.id;
  const badge = BADGES[state];
  chrome.action.setBadgeText({ tabId, text: badge.text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  chrome.action.setTitle({ tabId, title: message });

  if (state === "error") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Couldn't save to Readbox",
      message,
    });
  }
  if (state !== "saving") {
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: "" }), state === "saved" ? 2500 : 6000);
  }
}
