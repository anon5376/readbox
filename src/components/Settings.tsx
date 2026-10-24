import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useState, type ReactNode } from "react";
import appIcon from "../../src-tauri/icons/128x128@2x.png";
import { api } from "../lib/api";
import { isMac } from "../lib/platform";
import type { ReaderPrefs } from "../lib/prefs";
import { SegmentedControl } from "./affectui/segmented-control";
import { Icon, type IconName } from "./Icon";
import { ReadingControls } from "./ReadingControls";

export const REPO = "https://github.com/anon5376/readbox";

type Tab = "general" | "reading" | "browser" | "import" | "about";
const TABS: { value: Tab; label: string; icon: IconName }[] = [
  { value: "general", label: "General", icon: "settings" },
  { value: "reading", label: "Reading", icon: "book" },
  { value: "browser", label: "Browser", icon: "globe" },
  { value: "import", label: "Import", icon: "import" },
  { value: "about", label: "About", icon: "info" },
];

interface Props {
  libraryDir: string;
  prefs: ReaderPrefs;
  onPrefs: (patch: Partial<ReaderPrefs>) => void;
  onLibraryChanged: () => void;
  onImport: () => void;
  importing: boolean;
  onClose: () => void;
}

/** A Mac-style settings sheet: tabs along the top, grouped rows below. */
export function Settings(props: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const { onClose } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog settings" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} title="Close (Esc)">
            <Icon name="close" />
          </button>
        </header>
        <div className="settings-tabs">
          <SegmentedControl
            kind="tabs"
            variant="underline"
            aria-label="Settings sections"
            size="sm"
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({
              value: t.value,
              label: t.label,
              controls: `settings-${t.value}`,
            }))}
          />
        </div>
        <div className="settings-body" id={`settings-${tab}`} role="tabpanel">
          {tab === "general" && <General {...props} />}
          {tab === "reading" && <Reading {...props} />}
          {tab === "browser" && <Browser />}
          {tab === "import" && <ImportTab {...props} />}
          {tab === "about" && <About />}
        </div>
      </div>
    </div>
  );
}

function General({ libraryDir, prefs, onPrefs, onLibraryChanged }: Props) {
  const [error, setError] = useState<string | null>(null);

  const choose = async () => {
    const picked = await open({ directory: true, defaultPath: libraryDir, title: "Choose library folder" });
    if (typeof picked !== "string") return;
    try {
      await api.setLibraryDir(picked);
      onLibraryChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <>
      <Group>
        <Row label="Appearance" hint="Auto follows your system's light or dark mode.">
          <SegmentedControl
            aria-label="Appearance"
            size="sm"
            value={prefs.appearance}
            onChange={(appearance) => onPrefs({ appearance })}
            options={[
              { value: "system", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
        <Row label="Style" hint={prefs.palette === "ink" ? "Warm paper white with ink blue." : "Apple greys and black."}>
          <SegmentedControl
            aria-label="Style"
            size="sm"
            value={prefs.palette}
            onChange={(palette) => onPrefs({ palette })}
            options={[
              { value: "graphite", label: "Graphite" },
              { value: "ink", label: "Ink" },
            ]}
          />
        </Row>
      </Group>

      <Group title="Library">
        <Row label="Folder" hint={libraryDir} hintIsPath>
          <div className="row-buttons">
            <button onClick={() => revealItemInDir(libraryDir)}>{isMac ? "Show in Finder" : "Show in Explorer"}</button>
            <button onClick={choose}>Change…</button>
          </div>
        </Row>
      </Group>
      {error && <p className="error">{error}</p>}
      <p className="settings-footnote">
        Everything you save is plain files in this folder. Keep it in iCloud Drive, Dropbox or OneDrive to sync between
        computers. Changing the folder doesn't move what's already saved.
      </p>
    </>
  );
}

function Reading({ prefs, onPrefs }: Props) {
  return (
    <>
      <Group>
        <div className="settings-preview" data-page={prefs.theme}>
          <div className={`settings-preview-text font-${prefs.font} width-${prefs.width}`} style={{ fontSize: `${Math.round(prefs.size * 0.8)}px` }}>
            The best way to read later is to actually read it. Here's how your articles will look.
          </div>
        </div>
      </Group>
      <Group>
        <div className="settings-controls">
          <ReadingControls prefs={prefs} onPrefs={onPrefs} />
        </div>
      </Group>
      <p className="settings-footnote">You can also change these while reading, with the Aa button.</p>
    </>
  );
}

function Browser() {
  const [listening, setListening] = useState<boolean | null>(null);
  useEffect(() => {
    invoke<boolean>("bridge_status").then(setListening, () => setListening(false));
  }, []);
  const key = isMac ? "⌥⇧S" : "Alt+Shift+S";

  return (
    <>
      <Group>
        <Row
          label="Browser button"
          hint={
            listening === null
              ? "Checking…"
              : listening
                ? "Readbox is ready to receive pages from your browser."
                : "Another copy of Readbox is already receiving pages. Quit it and reopen this one."
          }
        >
          <span className={`status-dot ${listening ? "on" : listening === false ? "off" : ""}`} aria-hidden="true" />
        </Row>
        <Row label="Save the page you're reading" hint="Click the Readbox button in the toolbar, or press the shortcut.">
          <kbd>{key}</kbd>
        </Row>
        <Row label="Save a link without opening it" hint="Right-click the link and choose Save link to Readbox.">
          <Icon name="link" />
        </Row>
      </Group>
      <Group title="Install">
        <Row label="Firefox, Chrome, Brave, Edge, Helium" hint="The extension isn't in the browser stores yet. Setup takes a minute.">
          <button onClick={() => openUrl(`${REPO}#browser-extension`)}>How to install</button>
        </Row>
      </Group>
      <p className="settings-footnote">
        The browser sends pages only to Readbox on this computer, and Readbox only accepts them from browser extensions.
      </p>
    </>
  );
}

function ImportTab({ onImport, importing }: Props) {
  return (
    <>
      <Group>
        <Row
          label="Pocket, Omnivore or Instapaper"
          hint="Choose the .csv, .html or .zip file you downloaded from them."
        >
          <button className="primary" onClick={onImport} disabled={importing}>
            {importing ? "Importing…" : "Choose File…"}
          </button>
        </Row>
      </Group>
      <p className="settings-footnote">
        Readbox keeps each article's original date and whether you'd archived it. It downloads every article again so it
        works offline; anything that's gone from the web is kept as a title and link.
      </p>
    </>
  );
}

function About() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion, () => setVersion("0.1.0"));
  }, []);

  return (
    <div className="about">
      <img src={appIcon} alt="" width={88} height={88} />
      <h3>Readbox</h3>
      <p className="about-version">Version {version}</p>
      <p className="about-text">A calm place to read later. No account, no tracking, your library is a folder you own.</p>
      <div className="row-buttons centered">
        <button onClick={() => openUrl(REPO)}>Source Code</button>
        <button onClick={() => openUrl(`${REPO}/issues`)}>Report a Problem</button>
      </div>
      <p className="about-credits">
        Open source under the MIT license. Built with Tauri, Mozilla Readability and DOMPurify, with components from{" "}
        <button className="link-button" onClick={() => openUrl("https://www.affectui.com")}>
          affectUI
        </button>{" "}
        and animations from{" "}
        <button className="link-button" onClick={() => openUrl("https://rareui.com")}>
          Rare UI
        </button>
        .
      </p>
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="group">
      {title && <h4 className="group-title">{title}</h4>}
      <div className="group-box">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  hintIsPath,
  children,
}: {
  label: string;
  hint?: string;
  hintIsPath?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="group-row">
      <div className="group-row-text">
        <div className="group-row-label">{label}</div>
        {hint && <div className={`group-row-hint ${hintIsPath ? "path" : ""}`}>{hint}</div>}
      </div>
      <div className="group-row-control">{children}</div>
    </div>
  );
}
