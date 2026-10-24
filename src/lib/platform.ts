export const isMac = /Mac/.test(navigator.userAgent);

/** "⌘V" on a Mac, "Ctrl+V" elsewhere. */
export const shortcut = (key: string) => (isMac ? `⌘${key}` : `Ctrl+${key}`);
