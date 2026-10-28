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
use std::io::{self, Write};
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
    /// A picture from the article for the list, e.g. `images/ab12….jpg`.
    #[serde(default)]
    pub thumbnail: Option<String>,
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
    pub thumbnail: Option<String>,
}

/// A saved image and its size, so the UI can skip icons when picking a thumbnail.
#[derive(Debug, Serialize, PartialEq)]
pub struct SavedImage {
    pub path: String,
    pub width: u32,
    pub height: u32,
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
            thumbnail: None,
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
        // Keep a stable lock file: meta.json is replaced on every save. Hold the
        // lock through the read and write so other processes cannot lose a patch.
        let lock = fs::OpenOptions::new().write(true).create(true).truncate(false)
            .open(path.join(".meta.lock"))?;
        lock.lock()?;
        let raw = fs::read(path.join(META_FILE))?;
        let mut meta: ArticleMeta = serde_json::from_slice(&raw)?;
        meta.dir = dir.to_string();
        if let Some(status) = patch.status {
            meta.status = status;
        }
        if let Some(progress) = patch.progress {
            meta.progress = progress.clamp(0.0, 1.0);
        }
        if let Some(thumbnail) = patch.thumbnail {
            let inside_images = thumbnail.strip_prefix("images/").is_some_and(|name| {
                !name.is_empty() && !name.contains(['/', '\\']) && !name.starts_with('.')
            });
            if !inside_images {
                return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid thumbnail path"));
            }
            meta.thumbnail = Some(thumbnail);
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
    /// the article folder, e.g. `images/ab12….jpg`, with the image's size.
    pub fn save_image(&self, dir: &str, bytes: &[u8], ext: &str) -> io::Result<SavedImage> {
        let images = self.article_path(dir)?.join(IMAGES_DIR);
        fs::create_dir_all(&images)?;
        let name = format!("{}.{}", &hex::encode(Sha256::digest(bytes))[..32], ext);
        let target = images.join(&name);
        if !target.exists() {
            write_atomic(&target, bytes)?;
        }
        let (width, height) = imagesize::blob_size(bytes)
            .map(|size| (size.width as u32, size.height as u32))
            .unwrap_or((0, 0));
        Ok(SavedImage { path: format!("{IMAGES_DIR}/{name}"), width, height })
    }

    fn write_meta(&self, path: &Path, meta: &ArticleMeta) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(meta)?;
        write_atomic(&path.join(META_FILE), &json)
    }
}

/// Writes to a temp file and renames it into place, so a sync tool or a crash
/// never sees a half-written file. Each writer owns its temp file so concurrent
/// saves cannot truncate or rename each other's data.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4().simple()));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&tmp)?;
    let written = file.write_all(bytes);
    drop(file);
    let result = written.and_then(|()| fs::rename(&tmp, path));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
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
    fn concurrent_article_writes_keep_complete_content() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let meta = lib.create(sample("Post", "2026-10-01T00:00:00Z")).unwrap();
        let bodies: Vec<String> = (b'a'..=b'p')
            .map(|letter| format!("<p>{}</p>", char::from(letter).to_string().repeat(128 * 1024)))
            .collect();
        let ready = std::sync::Barrier::new(bodies.len());
        let results: Vec<_> = std::thread::scope(|scope| {
            let writers: Vec<_> = bodies.iter().map(|html| scope.spawn(|| {
                ready.wait();
                lib.write_html(&meta.dir, html)
            })).collect();
            writers.into_iter().map(|writer| writer.join().unwrap()).collect()
        });

        assert!(results.iter().all(Result::is_ok), "concurrent saves failed: {results:?}");
        assert!(bodies.contains(&lib.read_html(&meta.dir).unwrap()), "saved content was mixed or truncated");
        let article = tmp.path().join("articles").join(&meta.dir);
        assert_eq!(fs::read_dir(article).unwrap().count(), 2, "save left temporary files");
    }

    #[test]
    fn failed_article_write_preserves_destination_and_cleans_up() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let article = tmp.path().join("articles/post");
        // A sync conflict has put a directory where the article file should be.
        let existing = article.join(HTML_FILE).join("keep.txt");
        fs::create_dir_all(existing.parent().unwrap()).unwrap();
        fs::write(&existing, "keep this content").unwrap();

        assert!(lib.write_html("post", "<p>Replacement</p>").is_err());
        assert_eq!(fs::read_to_string(existing).unwrap(), "keep this content");
        assert_eq!(fs::read_dir(article).unwrap().count(), 1, "failed save left temporary files");
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
            .update(&meta.dir, MetaPatch { status: Some(Status::Archived), progress: Some(1.7), thumbnail: None })
            .unwrap();
        assert_eq!(updated.status, Status::Archived);
        assert_eq!(updated.progress, 1.0);
        assert_eq!(lib.list().unwrap()[0], updated);
    }

    #[test]
    fn concurrent_metadata_patches_are_preserved() {
        use std::io::{BufRead, BufReader, Read};
        use std::process::{Command, Stdio};

        // Run each patch in a separate process, as with two copies of Readbox.
        if let Ok(patch) = std::env::var("READBOX_TEST_METADATA_PATCH") {
            let lib = Library::new(std::env::var_os("READBOX_LIBRARY").unwrap());
            let dir = std::env::var("READBOX_TEST_ARTICLE_DIR").unwrap();
            println!("READBOX_METADATA_READY");
            std::io::stdout().flush().unwrap();
            let mut start = String::new();
            std::io::stdin().read_line(&mut start).unwrap();
            assert_eq!(start, "go\n");
            lib.update(&dir, serde_json::from_str(&patch).unwrap()).unwrap();
            return;
        }

        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let mut article = sample("Post", "2026-10-01T00:00:00Z");
        // Keep the read/modify/write windows overlapping without sleeps.
        article.excerpt = Some("Saved excerpt. ".repeat(64 * 1024));
        let meta = lib.create(article).unwrap();
        let mut writers = Vec::new();
        for patch in [r#"{"status":"archived"}"#, r#"{"progress":0.75}"#, r#"{"thumbnail":"images/cover.jpg"}"#] {
            let mut child = Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "library::tests::concurrent_metadata_patches_are_preserved", "--nocapture"])
                .env("READBOX_LIBRARY", tmp.path())
                .env("READBOX_TEST_ARTICLE_DIR", &meta.dir)
                .env("READBOX_TEST_METADATA_PATCH", patch)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn().unwrap();
            let mut output = BufReader::new(child.stdout.take().unwrap());
            let mut line = String::new();
            loop {
                line.clear();
                assert!(output.read_line(&mut line).unwrap() > 0, "metadata writer exited before starting");
                if line.trim_end().ends_with("READBOX_METADATA_READY") {
                    break;
                }
            }
            writers.push((child, output));
        }
        for (child, _) in &mut writers {
            child.stdin.take().unwrap().write_all(b"go\n").unwrap();
        }
        for (mut child, mut output) in writers {
            let mut log = String::new();
            output.read_to_string(&mut log).unwrap();
            assert!(child.wait().unwrap().success(), "metadata writer failed: {log}");
        }

        let updated = lib.list().unwrap().pop().unwrap();
        assert_eq!(updated.status, Status::Archived);
        assert_eq!(updated.progress, 0.75);
        assert_eq!(updated.thumbnail.as_deref(), Some("images/cover.jpg"));
        assert_eq!(updated.excerpt, meta.excerpt);
    }

    #[test]
    fn thumbnail_must_be_one_of_the_articles_images() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let meta = lib.create(sample("Post", "2026-10-01T00:00:00Z")).unwrap();
        let patch = |t: &str| MetaPatch { thumbnail: Some(t.into()), ..Default::default() };
        assert!(lib.update(&meta.dir, patch("images/ab.jpg")).is_ok());
        for bad in ["../meta.json", "images/../../x", "images/", "/etc/passwd", "images/a\\b"] {
            assert!(lib.update(&meta.dir, patch(bad)).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn reads_image_sizes() {
        let tmp = tempfile::tempdir().unwrap();
        let lib = Library::new(tmp.path());
        let meta = lib.create(sample("Post", "2026-10-01T00:00:00Z")).unwrap();
        // Smallest valid GIF header: 3 x 2 pixels.
        let gif = b"GIF89a\x03\x00\x02\x00\x00\x00\x00";
        let saved = lib.save_image(&meta.dir, gif, "gif").unwrap();
        assert_eq!((saved.width, saved.height), (3, 2));
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
        assert!(a.path.starts_with("images/") && a.path.ends_with(".png"));
        assert_eq!((a.width, a.height), (0, 0), "unreadable images report no size");
        assert!(tmp.path().join("articles").join(&meta.dir).join(&a.path).exists());
    }

    #[test]
    fn slugify_handles_symbols_and_empty_titles() {
        assert_eq!(slugify("Hello, World!"), "hello-world");
        assert_eq!(slugify("  ***  "), "article");
        assert_eq!(slugify("Café & Crème"), "café-crème");
    }
}
