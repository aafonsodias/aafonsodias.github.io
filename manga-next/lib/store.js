// Thin wrappers around chrome.storage. Settings live in sync (tiny), everything else in local.

export const DEFAULT_SETTINGS = {
  folderName: 'Manga',
  intervalHours: 6,
  notify: true,
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
  const s = await chrome.storage.local.get(['entries', 'matches', 'results', 'lastRun', 'running', 'folderFound']);
  return {
    entries: s.entries || [],
    matches: s.matches || {},
    results: s.results || {},
    lastRun: s.lastRun || null,
    running: !!s.running && Date.now() - Number(s.running) < 10 * 60 * 1000,
    folderFound: s.folderFound !== false,
  };
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
