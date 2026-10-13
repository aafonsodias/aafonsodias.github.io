// Thin wrappers around chrome.storage. Settings live in sync (tiny), everything else in local.

export const DEFAULT_SETTINGS = {
  folderName: 'Manga',
  intervalHours: 6,
  notify: true,
  autoClean: true, // remove the older bookmark of a series when a newer chapter is bookmarked
  providerOrder: 'comick', // or 'mangaupdates'
  comickBase: '',
  overrides: {}, // seriesKey -> search text or pasted comick/mangaupdates link
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.sync.set({ settings: next });
  return next;
}

export async function getState() {
  const s = await chrome.storage.local.get(['entries', 'matches', 'results', 'lastRun', 'running', 'folderFound', 'trash', 'keep']);
  return {
    entries: s.entries || [],
    matches: s.matches || {},
    results: s.results || {},
    lastRun: s.lastRun || null,
    running: !!s.running && Date.now() - Number(s.running) < 10 * 60 * 1000,
    folderFound: s.folderFound !== false,
    trash: s.trash || [], // removed bookmarks, newest first
    keep: s.keep || [], // bookmark ids restored from the bin; auto-cleanup leaves them alone
  };
}

export const TRASH_MAX = 200;
export const TRASH_DAYS = 60;

export async function addToTrash(item) {
  const { trash } = await chrome.storage.local.get('trash');
  const cutoff = Date.now() - TRASH_DAYS * 86400000;
  const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...item }, ...(trash || [])]
    .filter((t) => t.removedAt >= cutoff)
    .slice(0, TRASH_MAX);
  await chrome.storage.local.set({ trash: next });
}

export function setState(patch) {
  return chrome.storage.local.set(patch);
}

// If the same series is bookmarked more than once (old chapter kept), keep the bookmark with the highest chapter.
export function primaryEntries(entries) {
  const byKey = new Map();
  for (const e of entries || []) {
    const cur = byKey.get(e.key);
    if (!cur || (e.chapter ?? -Infinity) > (cur.chapter ?? -Infinity)) byKey.set(e.key, e);
  }
  return [...byKey.values()];
}
