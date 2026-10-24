//! The library is a plain folder, so any sync tool (Dropbox, iCloud Drive,
//! OneDrive, Syncthing) can sync it:
//!
//! ```text
//! <library>/articles/<slug>-<shortid>/meta.json
//!                                    /article.html
//!                                    /images/<sha256>.<ext>
//! ```
//!
//! Each article lives in its own folder so two devices editing different
//! articles never touch the same file.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const META_FILE: &str = "meta.json";
const HTML_FILE: &str = "article.html";
const IMAGES_DIR: &str = "images";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArticleMeta {
    pub id: String,
    /// Folder name inside `articles/`; the key the UI uses to address an article.
    pub dir: String,
    pub url: String,
    pub title: String,
    #[serde(default)]
    pub byline: Option<String>,
    #[serde(default)]
    pub site_name: Option<String>,
    #[serde(default)]
    pub excerpt: Option<String>,
    #[serde(default)]
    pub word_count: u32,
    pub saved_at: String,
    #[serde(default = "default_status")]
    pub status: Status,
    /// How far the reader has scrolled, 0.0 to 1.0.
    #[serde(default)]
    pub progress: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Unread,
    Archived,
}

fn default_status() -> Status {
    Status::Unread
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewArticle {
    pub url: String,
    pub title: String,
    pub byline: Option<String>,
    pub site_name: Option<String>,
    pub excerpt: Option<String>,
    pub word_count: u32,
    pub saved_at: String,
    pub html: String,
    /// Imports keep the state they had in the other app.
    #[serde(default)]
    pub status: Option<Status>,
    #[serde(default)]
    pub progress: Option<f64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaPatch {
    pub status: Option<Status>,
    pub progress: Option<f64>,
}

pub struct Library {
    root: PathBuf,
}

impl Library {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    fn articles_dir(&self) -> PathBuf {
        self.root.join("articles")
    }

    /// Resolves an article folder, rejecting anything that could escape the library.
    fn article_path(&self, dir: &str) -> io::Result<PathBuf> {
        let valid = !dir.is_empty()
            && dir != "."
            && dir != ".."
            && !dir.contains(['/', '\\', '\0'])
            && !dir.starts_with('.');
        if !valid {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid article folder"));
        }
        Ok(self.articles_dir().join(dir))
    }

    pub fn create(&self, new: NewArticle) -> io::Result<ArticleMeta> {
        let id = uuid::Uuid::new_v4().simple().to_string();
        let dir = format!("{}-{}", slugify(&new.title), &id[..8]);
        let path = self.article_path(&dir)?;
        fs::create_dir_all(&path)?;

        let meta = ArticleMeta {
            id,
            dir,
            url: new.url,
            title: new.title,
            byline: new.byline,
            site_name: new.site_name,
            excerpt: new.excerpt,
            word_count: new.word_count,
            saved_at: new.saved_at,
            status: new.status.unwrap_or(Status::Unread),
            progress: new.progress.unwrap_or(0.0).clamp(0.0, 1.0),
        };
        write_atomic(&path.join(HTML_FILE), new.html.as_bytes())?;
        self.write_meta(&path, &meta)?;
        Ok(meta)
    }

    /// Every readable article, newest first. Folders with a missing or broken
    /// meta.json (e.g. mid-sync) are skipped rather than failing the whole list.
    pub fn list(&self) -> io::Result<Vec<ArticleMeta>> {
        let entries = match fs::read_dir(self.articles_dir()) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e),
        };
        let mut articles: Vec<ArticleMeta> = entries
            .filter_map(Result::ok)
            .filter(|e| e.path().is_dir())
            .filter_map(|e| {
                let raw = fs::read(e.path().join(META_FILE)).ok()?;
                let mut meta: ArticleMeta = serde_json::from_slice(&raw).ok()?;
                // Trust the folder name over the stored one in case it was renamed.
                meta.dir = e.file_name().to_string_lossy().into_owned();
                Some(meta)
            })
            .collect();
        articles.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
        Ok(articles)
    }

    pub fn read_html(&self, dir: &str) -> io::Result<String> {
        fs::read_to_string(self.article_path(dir)?.join(HTML_FILE))
    }

    pub fn write_html(&self, dir: &str, html: &str) -> io::Result<()> {
        write_atomic(&self.article_path(dir)?.join(HTML_FILE), html.as_bytes())
    }

    pub fn update(&self, dir: &str, patch: MetaPatch) -> io::Result<ArticleMeta> {
        let path = self.article_path(dir)?;
        let raw = fs::read(path.join(META_FILE))?;
        let mut meta: ArticleMeta = serde_json::from_slice(&raw)?;
        meta.dir = dir.to_string();
        if let Some(status) = patch.status {
            meta.status = status;
        }
        if let Some(progress) = patch.progress {
            meta.progress = progress.clamp(0.0, 1.0);
        }
        self.write_meta(&path, &meta)?;
        Ok(meta)
    }

    /// Moves the article folder to the OS trash so a mistaken delete can be undone.
    pub fn trash(&self, dir: &str) -> io::Result<()> {
        let path = self.article_path(dir)?;
        trash::delete(&path).map_err(|e| io::Error::other(e.to_string()))
    }

    /// Stores image bytes under a content hash and returns the path relative to
    /// the article folder, e.g. `images/ab12….jpg`.
    pub fn save_image(&self, dir: &str, bytes: &[u8], ext: &str) -> io::Result<String> {
        let images = self.article_path(dir)?.join(IMAGES_DIR);
        fs::create_dir_all(&images)?;
        let name = format!("{}.{}", &hex::encode(Sha256::digest(bytes))[..32], ext);
        let target = images.join(&name);
        if !target.exists() {
            write_atomic(&target, bytes)?;
        }
        Ok(format!("{IMAGES_DIR}/{name}"))
    }

    fn write_meta(&self, path: &Path, meta: &ArticleMeta) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(meta)?;
        write_atomic(&path.join(META_FILE), &json)
    }
}

/// Writes to a temp file and renames it into place, so a sync tool or a crash
/// never sees a half-written file.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

fn slugify(title: &str) -> String {
    let mut slug = String::new();
    for c in title.chars() {
        if c.is_alphanumeric() {
            slug.extend(c.to_lowercase());
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
        if slug.chars().count() >= 60 {
            break;
        }
    }
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() { "article".to_string() } else { slug.to_string() }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(title: &str, saved_at: &str) -> NewArticle {
        NewArticle {
            url: "https://example.com/post".into(),
            title: title.into(),
            byline: Some("Ada".into()),
            site_name: None,
            excerpt: None,
            word_count: 1200,
            saved_at: saved_at.into(),
            html: "<p>Hello</p>".into(),
            status: None,
            progress: None,
        }
    }

    #[test]
    fn create_list_and_read_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let older = lib.create(sample("Older post", "2026-10-01T00:00:00Z")).unwrap();
        let newer = lib.create(sample("Newer: post!", "2026-10-02T00:00:00Z")).unwrap();

        assert!(newer.dir.starts_with("newer-post-"));
        let listed = lib.list().unwrap();
        assert_eq!(listed, vec![newer.clone(), older]);
        assert_eq!(lib.read_html(&newer.dir).unwrap(), "<p>Hello</p>");
    }

    #[test]
    fn imports_keep_their_state() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let mut new = sample("Imported", "2020-01-01T00:00:00Z");
        new.status = Some(Status::Archived);
        new.progress = Some(0.4);
        let meta = lib.create(new).unwrap();
        assert_eq!((meta.status, meta.progress), (Status::Archived, 0.4));
    }

    #[test]
    fn list_on_missing_library_is_empty() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(Library::new(tmp.path().join("nope")).list().unwrap().is_empty());
    }

    #[test]
    fn list_skips_broken_meta() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        lib.create(sample("Good", "2026-10-01T00:00:00Z")).unwrap();
        let broken = tmp.path().join("articles/broken");
        fs::create_dir_all(&broken).unwrap();
        fs::write(broken.join(META_FILE), "{not json").unwrap();
        assert_eq!(lib.list().unwrap().len(), 1);
    }

    #[test]
    fn update_patches_status_and_clamps_progress() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let meta = lib.create(sample("Post", "2026-10-01T00:00:00Z")).unwrap();
        let updated = lib
            .update(&meta.dir, MetaPatch { status: Some(Status::Archived), progress: Some(1.7) })
            .unwrap();
        assert_eq!(updated.status, Status::Archived);
        assert_eq!(updated.progress, 1.0);
        assert_eq!(lib.list().unwrap()[0], updated);
    }

    #[test]
    fn rejects_path_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        for bad in ["..", "../x", "a/b", "a\\b", ".hidden", ""] {
            assert!(lib.read_html(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn images_are_deduplicated_by_content() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let meta = lib.create(sample("Post", "2026-10-01T00:00:00Z")).unwrap();
        let a = lib.save_image(&meta.dir, b"png-bytes", "png").unwrap();
        let b = lib.save_image(&meta.dir, b"png-bytes", "png").unwrap();
        assert_eq!(a, b);
        assert!(a.starts_with("images/") && a.ends_with(".png"));
        assert!(tmp.path().join("articles").join(&meta.dir).join(&a).exists());
    }

    #[test]
    fn slugify_handles_symbols_and_empty_titles() {
        assert_eq!(slugify("Hello, World!"), "hello-world");
        assert_eq!(slugify("  ***  "), "article");
        assert_eq!(slugify("Café & Crème"), "café-crème");
    }
}
