// Service worker: reads the bookmarks folder, checks each series, stores results, badges and notifies.

import { parseBookmark, seriesKey } from './lib/parse.js';
import { predict } from './lib/predict.js';
import { providers, providerOrder, pickBest } from './lib/providers.js';
import { getSettings, saveSettings, getState, setState, primaryEntries, addToTrash } from './lib/store.js';

const ALARM = 'manga-next-refresh';
const SMART_ALARM = 'manga-next-smart';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let refreshing = null;

chrome.runtime.onInstalled.addListener(async () => {
  await scheduleAlarm();
  refreshAll();
});
chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  refreshAll();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) refreshAll();
  if (a.name === SMART_ALARM) refreshDue();
});

// Re-read the folder when bookmarks change (you re-bookmark after each chapter). Only new series hit the network.
let bookmarkTimer = null;
const onBookmarkChange = () => {
  clearTimeout(bookmarkTimer);
  bookmarkTimer = setTimeout(() => syncBookmarks(), 1500);
};
chrome.bookmarks.onCreated.addListener(onBookmarkChange);
chrome.bookmarks.onChanged.addListener(onBookmarkChange);
chrome.bookmarks.onRemoved.addListener((id, info) => {
  recordUserRemoval(id, info).finally(onBookmarkChange);
});
chrome.bookmarks.onMoved.addListener(onBookmarkChange);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse, (e) => sendResponse({ error: String(e?.message || e) }));
  return true;
});

async function handleMessage(msg) {
  switch (msg?.type) {
    case 'refresh':
      refreshAll({ force: !!msg.force }); // runs on; the popup follows progress through storage
      return { ok: true };
    case 'reschedule':
      await scheduleAlarm();
      return { ok: true };
    case 'restore':
      return restoreFromTrash(msg.trashId);
    case 'emptyTrash':
      await setState({ trash: [] });
      return { ok: true };
    case 'setOverride': {
      const settings = await getSettings();
      const overrides = { ...settings.overrides };
      if (msg.value) overrides[msg.key] = msg.value;
      else delete overrides[msg.key];
      await saveSettings({ overrides });
      const state = await getState();
      delete state.matches[msg.key];
      delete state.results[msg.key];
      await setState({ matches: state.matches, results: state.results });
      refreshKeys([msg.key]);
      return { ok: true };
    }
    default:
      return { error: 'unknown message' };
  }
}

async function scheduleAlarm() {
  const settings = await getSettings();
  const hours = Math.max(1, Number(settings.intervalHours) || 6);
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { periodInMinutes: hours * 60, delayInMinutes: hours * 60 });
}

// ---------- smart checks around the expected release ----------

// When is this series worth checking next? Two hours before the expected time, then hourly until it
// shows up or the window closes two days later. Series that already have a new chapter, are finished,
// or are on hiatus are left to the regular schedule.
function smartDue(entry, res, now) {
  if (!res || res.latestChapter == null || hasNew(entry, res)) return null;
  if (res.status === 'completed' || res.status === 'cancelled' || res.status === 'hiatus') return null;
  const target = res.nextChance || res.nextExpected;
  if (!target) return null;
  const start = target - 2 * HOUR;
  const end = target + 2 * DAY;
  if (now < start) return start;
  if (now <= end) return Math.max(now, (res.checkedAt || 0) + HOUR);
  return null;
}

async function scheduleSmart() {
  const { entries, results } = await getState();
  const now = Date.now();
  let next = null;
  for (const e of primaryEntries(entries)) {
    const due = smartDue(e, results[e.key], now);
    if (due != null && (next == null || due < next)) next = due;
  }
  await chrome.alarms.clear(SMART_ALARM);
  if (next == null) {
    await setState({ smartNext: null });
    return;
  }
  const when = Math.max(next, now + 15 * 60000); // never more often than every 15 minutes
  await chrome.alarms.create(SMART_ALARM, { when });
  await setState({ smartNext: when });
}

// Smart alarm fired: check only the series whose window is open right now.
async function refreshDue() {
  if (refreshing) await refreshing;
  const state = await getState();
  const now = Date.now();
  const keys = primaryEntries(state.entries)
    .filter((e) => {
      const due = smartDue(e, state.results[e.key], now);
      return due != null && due <= now + 5 * 60000;
    })
    .map((e) => e.key);
  if (keys.length) await refreshKeys(keys, { state });
  else await scheduleSmart();
}

// ---------- bookmarks ----------

function findFolder(nodes, name) {
  const want = String(name || '').trim().toLowerCase();
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.shift();
    if (!n.url && String(n.title || '').trim().toLowerCase() === want) return n;
    if (n.children) stack.push(...n.children);
  }
  return null;
}

function collectBookmarks(node, out = []) {
  for (const c of node.children || []) {
    if (c.url) out.push(c);
    else collectBookmarks(c, out);
  }
  return out;
}

async function readFolder(folderName) {
  const tree = await chrome.bookmarks.getTree();
  const folder = findFolder(tree, folderName);
  if (!folder) return { found: false, entries: [] };
  const sub = await chrome.bookmarks.getSubTree(folder.id);
  const bookmarks = collectBookmarks(sub[0]);
  const entries = bookmarks.map((b) => {
    const parsed = parseBookmark({ title: b.title, url: b.url });
    return {
      bookmarkId: b.id,
      title: b.title,
      url: b.url,
      series: parsed.series,
      chapter: parsed.chapter,
      dateAdded: b.dateAdded || 0,
      parentId: b.parentId,
      key: parsed.key || seriesKey(b.url),
    };
  });
  return { found: true, entries };
}

// You bookmark a chapter; every other bookmark of the same series goes away.
// The most recently added bookmark wins, even if its chapter is lower: your latest save is where you are.
// Highest chapter breaks a tie. Bookmarks without a chapter are left alone.
const selfRemoving = new Set();

async function pruneOldBookmarks(entries, settings, keep = []) {
  if (!settings.autoClean) return entries;
  const kept = new Set(keep);
  const byKey = new Map();
  for (const e of entries) {
    if (e.chapter == null || kept.has(e.bookmarkId)) continue;
    if (!byKey.has(e.key)) byKey.set(e.key, []);
    byKey.get(e.key).push(e);
  }
  const removed = new Set();
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.dateAdded - a.dateAdded || b.chapter - a.chapter);
    for (const old of list.slice(1)) {
      try {
        selfRemoving.add(old.bookmarkId);
        await addToTrash({ title: old.title, url: old.url, parentId: old.parentId, series: old.series, key: old.key, chapter: old.chapter, removedAt: Date.now(), by: 'auto', replacedBy: list[0].chapter });
        await chrome.bookmarks.remove(old.bookmarkId);
        removed.add(old.bookmarkId);
      } catch (e) {
        selfRemoving.delete(old.bookmarkId);
        console.warn('Manga Next: could not remove old bookmark', old.title, e);
      }
    }
  }
  return removed.size ? entries.filter((e) => !removed.has(e.bookmarkId)) : entries;
}

// A bookmark you deleted yourself, if it was one of ours, goes to the bin as well.
async function recordUserRemoval(id, info) {
  if (selfRemoving.delete(id)) return;
  const node = info?.node;
  if (!node?.url) return;
  const { entries } = await getState();
  const known = entries.find((e) => e.bookmarkId === id);
  if (!known) return;
  await addToTrash({ title: node.title || known.title, url: node.url, parentId: info.parentId || known.parentId, series: known.series, key: known.key, chapter: known.chapter, removedAt: Date.now(), by: 'you' });
}

async function restoreFromTrash(trashId) {
  const settings = await getSettings();
  const state = await getState();
  const item = state.trash.find((t) => t.id === trashId);
  if (!item) return { error: 'Not in the bin any more' };
  let parentId = item.parentId;
  try {
    await chrome.bookmarks.get(parentId);
  } catch {
    const tree = await chrome.bookmarks.getTree();
    const folder = findFolder(tree, settings.folderName);
    if (!folder) return { error: `No folder named ${settings.folderName} to restore into` };
    parentId = folder.id;
  }
  const created = await chrome.bookmarks.create({ parentId, title: item.title, url: item.url });
  const keep = [...new Set([...state.keep, created.id])];
  await setState({ keep, trash: state.trash.filter((t) => t.id !== trashId) });
  return { ok: true, bookmarkId: created.id };
}

// ---------- matching + checking ----------

async function findMatch(query, settings) {
  const errors = [];
  if (/^https?:\/\//i.test(query)) {
    for (const p of Object.values(providers)) {
      try {
        const m = await p.fromUrl(query, settings);
        if (m) return { match: { ...m, query }, errors };
      } catch (e) {
        errors.push(`${p.label}: ${e.message}`);
      }
    }
    return { match: null, errors: errors.length ? errors : ['link not recognised'] };
  }
  // Take the first provider whose best hit matches the title well; otherwise the best weak hit, flagged uncertain.
  let best = null;
  for (const p of providerOrder(settings)) {
    try {
      const candidates = await p.search(query, settings);
      const pick = pickBest(candidates, query);
      if (!pick) {
        errors.push(`${p.label}: no results`);
        continue;
      }
      if (!best || pick.matchScore > best.matchScore) best = pick;
      if (best.matchScore >= 2) break;
    } catch (e) {
      errors.push(`${p.label}: ${e.message}`);
    }
  }
  if (best) return { match: { ...best, query, uncertain: best.matchScore < 2 }, errors };
  return { match: null, errors };
}

async function checkSeries(entry, matches, settings) {
  const key = entry.key;
  const query = (settings.overrides && settings.overrides[key]) || entry.series || entry.title;
  let match = matches[key];
  let errors = [];
  if (!match || match.query !== query) {
    ({ match, errors } = await findMatch(query, settings));
    if (match) matches[key] = match;
    else delete matches[key];
  }
  const checkedAt = Date.now();
  if (!match) return { checkedAt, error: `No match (${errors.join('; ')})`, query };

  const provider = providers[match.provider];
  try {
    const [releases, info] = await Promise.all([provider.releases(match), provider.info(match)]);
    const p = predict(releases);
    const latestChapter = Math.max(p.latestChapter ?? -Infinity, info.latestChapter ?? -Infinity);
    return {
      ...p,
      latestChapter: Number.isFinite(latestChapter) ? latestChapter : null,
      status: info.status || null,
      statusText: info.statusText || null,
      provider: match.provider,
      providerLabel: provider.label,
      matchTitle: match.title,
      matchUrl: match.url,
      uncertain: !!match.uncertain,
      query,
      recent: releases.slice(0, 5),
      checkedAt,
      error: releases.length || info.latestChapter != null ? null : 'No English releases listed',
    };
  } catch (e) {
    return { checkedAt, error: `${provider.label}: ${e.message}`, matchTitle: match.title, matchUrl: match.url, provider: match.provider, query };
  }
}

async function refreshKeys(keys, { settings, state } = {}) {
  settings = settings || (await getSettings());
  state = state || (await getState());
  const { matches, results, entries } = state;
  for (const key of keys) {
    const entry = entries.find((e) => e.key === key);
    if (!entry) continue;
    const prevNotified = results[key]?.notifiedChapter ?? null;
    const res = await checkSeries(entry, matches, settings);
    res.notifiedChapter = prevNotified;
    results[key] = res;
    await setState({ matches, results }); // write per series so the popup updates live
    await sleep(400);
  }
  await updateBadgeAndNotify(entries, results, settings, state.lastRun);
  await scheduleSmart();
}

async function syncBookmarks() {
  if (refreshing) await refreshing; // let a running full check finish so we read fresh results
  const settings = await getSettings();
  const { found, entries: raw } = await readFolder(settings.folderName);
  const state = await getState();
  const entries = await pruneOldBookmarks(raw, settings, state.keep);
  const liveIds = new Set(entries.map((e) => e.bookmarkId));
  state.keep = state.keep.filter((id) => liveIds.has(id));
  const keys = new Set(entries.map((e) => e.key));
  for (const k of Object.keys(state.results)) if (!keys.has(k)) delete state.results[k];
  await setState({ entries, folderFound: found, results: state.results, keep: state.keep });
  const missing = [...keys].filter((k) => !state.results[k]);
  if (missing.length) {
    await refreshKeys(missing, { settings, state: { ...state, entries } });
  } else {
    await updateBadgeAndNotify(entries, state.results, settings, state.lastRun);
    await scheduleSmart();
  }
}

function refreshAll(opts = {}) {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    await setState({ running: Date.now() });
    try {
      const settings = await getSettings();
      const { found, entries: raw } = await readFolder(settings.folderName);
      const state = await getState();
      const entries = await pruneOldBookmarks(raw, settings, state.keep);
      const keys = [...new Set(entries.map((e) => e.key))];
      for (const k of Object.keys(state.results)) if (!keys.includes(k)) delete state.results[k];
      await setState({ entries, folderFound: found, results: state.results });
      await refreshKeys(keys, { settings, state: { ...state, entries } });
      await setState({ lastRun: Date.now() });
    } finally {
      await setState({ running: 0 });
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---------- badge + notifications ----------

function hasNew(entry, res) {
  return res?.latestChapter != null && entry.chapter != null && res.latestChapter > entry.chapter;
}

async function updateBadgeAndNotify(entries, results, settings, lastRun) {
  let count = 0;
  const toNotify = [];
  for (const e of primaryEntries(entries)) {
    const res = results[e.key];
    if (!res || !hasNew(e, res)) continue;
    count++;
    if (res.notifiedChapter == null || res.latestChapter > res.notifiedChapter) {
      if (lastRun) toNotify.push({ entry: e, res });
      res.notifiedChapter = res.latestChapter;
    }
  }
  await setState({ results });
  await chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });

  if (!settings.notify) return;
  for (const { entry, res } of toNotify) {
    chrome.notifications.create(`manga-next:${entry.key}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: `New chapter: ${entry.series || entry.title}`,
      message: `Chapter ${res.latestChapter} is out (you bookmarked ${entry.chapter}).`,
    });
  }
}

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith('manga-next:')) return;
  const key = id.slice('manga-next:'.length);
  const { entries } = await getState();
  const entry = entries.find((e) => e.key === key);
  if (entry) chrome.tabs.create({ url: entry.url });
  chrome.notifications.clear(id);
});
