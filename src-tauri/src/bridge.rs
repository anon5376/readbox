//! A tiny HTTP endpoint the browser extension sends pages to. It only listens
//! on 127.0.0.1 and only accepts requests from browser extensions, so web
//! pages can't save things into the library behind your back.
//!
//! Cleaning a page happens in the webview (Readability is JavaScript), so a
//! save request is forwarded to the frontend as an event and the HTTP reply
//! waits until the frontend reports back through `complete_save`.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Condvar, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Method, Request, Response, Server};

pub const PORT: u16 = 47612;
const MAX_BODY_BYTES: u64 = 30 * 1024 * 1024;
const SAVE_TIMEOUT: Duration = Duration::from_secs(120);
const STARTUP_WAIT: Duration = Duration::from_secs(20);
const EXTENSION_ORIGINS: [&str; 3] = ["chrome-extension://", "moz-extension://", "safari-web-extension://"];

#[derive(Default)]
pub struct Bridge {
    next_id: AtomicU64,
    /// False when the port was taken (e.g. a second copy of Readbox is open).
    listening: AtomicBool,
    waiting: Mutex<HashMap<u64, mpsc::Sender<Value>>>,
    /// Set once the frontend listens for save requests. A click in the
    /// browser right after launch waits for this instead of being lost.
    ready: Mutex<bool>,
    ready_changed: Condvar,
}

impl Bridge {
    fn wait_until_ready(&self) -> bool {
        let ready = self.ready.lock().unwrap();
        let (ready, _) = self.ready_changed.wait_timeout_while(ready, STARTUP_WAIT, |ready| !*ready).unwrap();
        *ready
    }
}

/// Whether the browser extension can reach this copy of Readbox.
#[tauri::command]
pub fn bridge_status(bridge: State<Bridge>) -> bool {
    bridge.listening.load(Ordering::Relaxed)
}

/// Called by the frontend once it is listening for `save-request` events.
#[tauri::command]
pub fn bridge_ready(bridge: State<Bridge>) {
    *bridge.ready.lock().unwrap() = true;
    bridge.ready_changed.notify_all();
}

#[derive(Deserialize)]
struct SaveBody {
    url: String,
    /// The page as the browser rendered it. Missing when saving a link the
    /// user right-clicked, in which case the app fetches the page itself.
    html: Option<String>,
}

#[derive(Serialize, Clone)]
struct SaveRequest {
    id: u64,
    url: String,
    html: Option<String>,
}

/// Called by the frontend once it has finished (or failed) a save.
#[tauri::command]
pub fn complete_save(bridge: State<Bridge>, id: u64, outcome: Value) {
    if let Some(reply) = bridge.waiting.lock().unwrap().remove(&id) {
        let _ = reply.send(outcome);
    }
}

pub fn start(app: AppHandle) {
    let server = match Server::http(("127.0.0.1", PORT)) {
        Ok(server) => server,
        Err(e) => {
            eprintln!("Readbox: browser extension bridge unavailable on port {PORT}: {e}");
            return;
        }
    };
    app.state::<Bridge>().listening.store(true, Ordering::Relaxed);
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let app = app.clone();
            std::thread::spawn(move || handle(&app, request));
        }
    });
}

fn handle(app: &AppHandle, mut request: Request) {
    let header = |name: &'static str| header_value(&request, name);
    let (host, origin, content_type) = (header("Host"), header("Origin"), header("Content-Type"));
    if !is_allowed(host.as_deref(), origin.as_deref()) {
        return respond(request, 403, json!({ "ok": false, "error": "Not allowed" }));
    }
    if (request.method(), request.url()) != (&Method::Post, "/save") {
        return respond(request, 404, json!({ "ok": false, "error": "Not found" }));
    }
    // Requiring JSON means a web page can't send this without a CORS
    // preflight, which this server never approves.
    let is_json = content_type.is_some_and(|t| t.starts_with("application/json"));
    if !is_json {
        return respond(request, 415, json!({ "ok": false, "error": "Expected JSON" }));
    }

    let mut body = Vec::new();
    let read = request.as_reader().take(MAX_BODY_BYTES + 1).read_to_end(&mut body);
    if read.is_err() || body.len() as u64 > MAX_BODY_BYTES {
        return respond(request, 413, json!({ "ok": false, "error": "Page too large" }));
    }
    let Ok(save) = serde_json::from_slice::<SaveBody>(&body) else {
        return respond(request, 400, json!({ "ok": false, "error": "Bad request" }));
    };
    if let Err(error) = crate::parse_web_url(&save.url) {
        return respond(request, 400, json!({ "ok": false, "error": error }));
    }

    let bridge = app.state::<Bridge>();
    if !bridge.wait_until_ready() {
        return respond(request, 503, json!({ "ok": false, "error": "Readbox is still starting. Try again in a moment." }));
    }
    let id = bridge.next_id.fetch_add(1, Ordering::Relaxed);
    let (reply, outcome) = mpsc::channel();
    bridge.waiting.lock().unwrap().insert(id, reply);

    let event = SaveRequest { id, url: save.url, html: save.html };
    if let Err(e) = app.emit_to("main", "save-request", event) {
        bridge.waiting.lock().unwrap().remove(&id);
        return respond(request, 500, json!({ "ok": false, "error": e.to_string() }));
    }
    match outcome.recv_timeout(SAVE_TIMEOUT) {
        Ok(outcome) => respond(request, 200, outcome),
        Err(_) => {
            bridge.waiting.lock().unwrap().remove(&id);
            respond(request, 504, json!({ "ok": false, "error": "Readbox took too long to save" }))
        }
    }
}

/// Accepts only requests addressed to this machine by name (blocking DNS
/// rebinding) that come from a browser extension or a local tool with no origin.
fn is_allowed(host: Option<&str>, origin: Option<&str>) -> bool {
    let host_ok = host.is_some_and(|h| h == format!("127.0.0.1:{PORT}") || h == format!("localhost:{PORT}"));
    let origin_ok = origin.is_none_or(|o| EXTENSION_ORIGINS.iter().any(|prefix| o.starts_with(prefix)));
    host_ok && origin_ok
}

fn header_value(request: &Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str().to_string())
}

fn respond(request: Request, status: u16, body: Value) {
    let content_type = Header::from_bytes("Content-Type", "application/json").unwrap();
    let response = Response::from_string(body.to_string())
        .with_status_code(status)
        .with_header(content_type);
    let _ = request.respond(response);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extensions_and_local_tools_are_allowed() {
        let host = Some("127.0.0.1:47612");
        assert!(is_allowed(host, Some("chrome-extension://abcdef")));
        assert!(is_allowed(host, Some("moz-extension://1234-5678")));
        assert!(is_allowed(Some("localhost:47612"), None));
    }

    #[test]
    fn web_pages_and_rebound_hosts_are_rejected() {
        assert!(!is_allowed(Some("127.0.0.1:47612"), Some("https://evil.example")));
        assert!(!is_allowed(Some("127.0.0.1:47612"), Some("null")));
        assert!(!is_allowed(Some("evil.example:47612"), Some("chrome-extension://abcdef")));
        assert!(!is_allowed(None, None));
    }
}
