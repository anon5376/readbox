mod bridge;
mod library;

use library::{ArticleMeta, Library, MetaPatch, NewArticle};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};

const MAX_PAGE_BYTES: u64 = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES: u64 = 15 * 1024 * 1024;
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
    (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

struct LibraryRoot(Mutex<PathBuf>);

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    library_dir: Option<PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchedPage {
    html: String,
    final_url: String,
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build HTTP client")
    })
}

pub(crate) fn parse_web_url(raw: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(raw.trim()).map_err(|_| format!("Not a valid link: {raw}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        other => Err(format!("Only web links can be saved, not {other}: links")),
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_config_dir().map_err(err)?.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or_default()
}

fn default_library_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .unwrap_or_else(|_| app.path().home_dir().unwrap_or_default())
        .join("Readbox Library")
}

/// Lets the webview load saved images from the library via the asset protocol.
fn allow_assets(app: &AppHandle, dir: &Path) -> Result<(), String> {
    app.asset_protocol_scope().allow_directory(dir, true).map_err(err)
}

fn library(root: &State<LibraryRoot>) -> Library {
    Library::new(root.0.lock().unwrap().clone())
}

#[tauri::command]
fn get_library_dir(root: State<LibraryRoot>) -> String {
    root.0.lock().unwrap().to_string_lossy().into_owned()
}

#[tauri::command]
fn set_library_dir(app: AppHandle, root: State<LibraryRoot>, path: String) -> Result<(), String> {
    let dir = PathBuf::from(path);
    std::fs::create_dir_all(&dir).map_err(err)?;
    allow_assets(&app, &dir)?;

    let config = settings_path(&app)?;
    std::fs::create_dir_all(config.parent().unwrap()).map_err(err)?;
    let settings = Settings { library_dir: Some(dir.clone()) };
    std::fs::write(config, serde_json::to_vec_pretty(&settings).map_err(err)?).map_err(err)?;

    *root.0.lock().unwrap() = dir;
    Ok(())
}

#[tauri::command]
async fn fetch_page(url: String) -> Result<FetchedPage, String> {
    let url = parse_web_url(&url)?;
    let response = http()
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Couldn't reach the page: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("The site answered with an error ({})", response.status()));
    }
    if response.content_length().is_some_and(|len| len > MAX_PAGE_BYTES) {
        return Err("That page is too large to save".into());
    }
    let final_url = response.url().to_string();
    let html = response.text().await.map_err(err)?;
    Ok(FetchedPage { html, final_url })
}

#[tauri::command]
fn create_article(root: State<LibraryRoot>, article: NewArticle) -> Result<ArticleMeta, String> {
    library(&root).create(article).map_err(err)
}

#[tauri::command]
fn list_articles(root: State<LibraryRoot>) -> Result<Vec<ArticleMeta>, String> {
    library(&root).list().map_err(err)
}

#[tauri::command]
fn read_article(root: State<LibraryRoot>, dir: String) -> Result<String, String> {
    library(&root).read_html(&dir).map_err(err)
}

#[tauri::command]
fn write_article(root: State<LibraryRoot>, dir: String, html: String) -> Result<(), String> {
    library(&root).write_html(&dir, &html).map_err(err)
}

#[tauri::command]
fn update_article(
    root: State<LibraryRoot>,
    dir: String,
    patch: MetaPatch,
) -> Result<ArticleMeta, String> {
    library(&root).update(&dir, patch).map_err(err)
}

#[tauri::command]
fn trash_article(root: State<LibraryRoot>, dir: String) -> Result<(), String> {
    library(&root).trash(&dir).map_err(err)
}

/// Downloads one image into the article folder and returns its relative path.
#[tauri::command]
async fn download_image(
    root: State<'_, LibraryRoot>,
    dir: String,
    url: String,
) -> Result<String, String> {
    let url = parse_web_url(&url)?;
    let response = http().get(url).send().await.map_err(err)?;
    if !response.status().is_success() {
        return Err(format!("image request failed ({})", response.status()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let ext = image_extension(&content_type).ok_or("not an image")?;
    if response.content_length().is_some_and(|len| len > MAX_IMAGE_BYTES) {
        return Err("image too large".into());
    }
    let bytes = response.bytes().await.map_err(err)?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("image too large".into());
    }
    library(&root).save_image(&dir, &bytes, ext).map_err(err)
}

fn image_extension(content_type: &str) -> Option<&'static str> {
    let mime = content_type.split(';').next().unwrap_or("").trim();
    Some(match mime {
        "image/jpeg" | "image/jpg" | "image/pjpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/avif" => "avif",
        "image/svg+xml" => "svg",
        _ => return None,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();
            // READBOX_LIBRARY points a test run at a throwaway folder without
            // touching the saved setting.
            let dir = std::env::var_os("READBOX_LIBRARY")
                .map(PathBuf::from)
                .or_else(|| load_settings(handle).library_dir)
                .unwrap_or_else(|| default_library_dir(handle));
            std::fs::create_dir_all(&dir)?;
            allow_assets(handle, &dir)?;
            app.manage(LibraryRoot(Mutex::new(dir)));
            app.manage(bridge::Bridge::default());
            bridge::start(handle.clone());
            Ok(())
        })
        // On a Mac, closing the window keeps Readbox running in the Dock so the
        // browser extension can still save; ⌘Q quits.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if cfg!(target_os = "macos") {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            bridge::complete_save,
            get_library_dir,
            set_library_dir,
            fetch_page,
            create_article,
            list_articles,
            read_article,
            write_article,
            update_article,
            trash_article,
            download_image,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Clicking the Dock icon brings the hidden window back.
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = event {
                show_main_window(app);
            }
            let _ = (app, event);
        });
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_web_links_are_accepted() {
        assert!(parse_web_url("https://example.com/a").is_ok());
        assert!(parse_web_url("  http://example.com  ").is_ok());
        assert!(parse_web_url("file:///etc/passwd").is_err());
        assert!(parse_web_url("javascript:alert(1)").is_err());
        assert!(parse_web_url("not a url").is_err());
    }

    #[test]
    fn image_types_map_to_extensions() {
        assert_eq!(image_extension("image/jpeg"), Some("jpg"));
        assert_eq!(image_extension("image/png; charset=binary"), Some("png"));
        assert_eq!(image_extension("text/html"), None);
    }
}
