import { getSettings, getState, primaryEntries } from './lib/store.js';
import { DAY } from './lib/predict.js';
import { bumpChapterUrl } from './lib/parse.js';
import { KOFI_URL } from './lib/links.js';

const listEl = document.getElementById('list');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const refreshBtn = document.getElementById('refresh');
const optionsBtn = document.getElementById('options');
const supportBtn = document.getElementById('support');
const binBtn = document.getElementById('bin');
const filterBtn = document.getElementById('filter');

const openFix = new Set();
let showBin = false;
let newOnly = false;
try {
  newOnly = localStorage.getItem('newOnly') === '1';
} catch {
  // storage unavailable; default off
}

refreshBtn.addEventListener('click', () => {
  refreshBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'refresh', force: true }).finally(() => (refreshBtn.disabled = false));
});
optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
supportBtn.addEventListener('click', () => chrome.tabs.create({ url: KOFI_URL }));
binBtn.addEventListener('click', () => {
  showBin = !showBin;
  render();
});
filterBtn.addEventListener('click', () => {
  newOnly = !newOnly;
  try {
    localStorage.setItem('newOnly', newOnly ? '1' : '0');
  } catch {
    // ignore
  }
  showBin = false;
  render();
});
chrome.storage.onChanged.addListener(() => render());

// ---------- formatting ----------

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function relDays(ts, now) {
  const diff = Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1) return `in ${diff} days`;
  return `${-diff} days ago`;
}

function agoShort(ts, now) {
  const mins = Math.max(0, Math.round((now - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function inShort(ts, now) {
  const mins = Math.round((ts - now) / 60000);
  if (mins <= 1) return 'any minute';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 36) return `in ${h} h`;
  return relDays(ts, now);
}

function isNew(entry, res) {
  return !!res && res.latestChapter != null && entry.chapter != null && res.latestChapter > entry.chapter;
}

// Which section a row belongs to, in display order.
const SECTIONS = [
  { id: 'new', label: 'New chapters' },
  { id: 'soon', label: 'Coming up' },
  { id: 'quiet', label: 'Quiet' },
  { id: 'done', label: 'Finished' },
  { id: 'unknown', label: 'Needs attention' },
];

function classify(entry, res, now) {
  if (isNew(entry, res)) return { section: 'new', order: 0 };
  if (!res) return { section: 'unknown', order: 1 };
  if (res.error && res.latestChapter == null) return { section: 'unknown', order: 0 };
  if (res.status === 'completed' || res.status === 'cancelled') return { section: 'done', order: 0 };
  if (res.status === 'hiatus' || res.suspectHiatus) return { section: 'quiet', order: -(res.daysSince || 0) };
  const target = res.nextChance || res.nextExpected;
  if (target) return { section: 'soon', order: target - now };
  return { section: 'unknown', order: 2 };
}

function describeNext(res, now) {
  if (!res) return { text: 'Not checked yet', tone: '' };
  if (res.error && res.latestChapter == null) return { text: res.error, tone: 'bad' };
  if (res.status === 'completed') return { text: 'Completed', tone: '' };
  if (res.status === 'cancelled') return { text: 'Cancelled', tone: '' };
  if (res.status === 'hiatus') return { text: 'On hiatus', tone: 'warn' };
  if (!res.cadenceDays) {
    const when = res.latestDate ? ` ${fmtDate(res.latestDate)}` : '';
    return { text: `Latest came out${when}. Not enough history to predict the next one`, tone: '' };
  }
  const cadence = res.cadenceLabel ? ` · ${res.cadenceLabel}` : '';
  if (res.suspectHiatus) {
    return { text: `No chapter for ${Math.round(res.daysSince)} days, probably on a break${cadence}`, tone: 'warn' };
  }
  if (res.late && res.nextChance) {
    const lateBy = Math.round((now - res.nextExpected) / DAY);
    return { text: `Expected ${fmtDate(res.nextExpected)}, ${lateBy} days late. Next chance ${fmtDate(res.nextChance)} (${relDays(res.nextChance, now)})${cadence}`, tone: 'warn' };
  }
  const target = res.nextChance || res.nextExpected;
  const rel = relDays(target, now);
  const tone = rel === 'today' || rel === 'tomorrow' ? 'ok' : '';
  return { text: `Next ${fmtDate(target)} (${rel})${cadence}`, tone };
}

function recentTooltip(res) {
  if (!res?.recent?.length) return '';
  return 'Recent releases:\n' + res.recent.map((r) => `ch ${r.chapter} · ${fmtDate(r.date)}${r.group ? ` · ${r.group}` : ''}`).join('\n');
}

// ---------- rendering ----------

async function render() {
  const [state, settings] = await Promise.all([getState(), getSettings()]);
  const now = Date.now();

  statusEl.textContent = state.running
    ? 'checking…'
    : state.lastRun
      ? `checked ${agoShort(state.lastRun, now)}${state.smartNext ? `, next ${inShort(state.smartNext, now)}` : ''}`
      : '';
  refreshBtn.disabled = state.running;
  binBtn.textContent = state.trash.length ? `Bin (${state.trash.length})` : 'Bin';
  binBtn.classList.toggle('active', showBin);
  filterBtn.setAttribute('aria-pressed', String(newOnly));

  listEl.textContent = '';
  if (showBin) {
    renderBin(state, now);
    return;
  }
  if (state.pendingFolder?.candidates?.length) {
    summaryEl.textContent = '';
    renderFolderChooser(state.pendingFolder.candidates, settings);
    return;
  }
  if (state.adoptedFolder) {
    const note = el('div', { class: 'binbar' });
    note.appendChild(el('span', {}, `Using your “${state.adoptedFolder.title}” folder (${state.adoptedFolder.count} chapters found). Change it in settings.`));
    const ok = el('button', {}, 'OK');
    ok.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'dismissAdopted' }));
    note.appendChild(ok);
    listEl.appendChild(note);
  }
  if (!state.folderFound) {
    summaryEl.textContent = '';
    const box = el('div', { class: 'empty' });
    box.appendChild(el('strong', {}, `No bookmarks folder named “${settings.folderName}”`));
    box.append('Create one, or ');
    const a = el('a', { href: '#' }, 'change the folder name in settings');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    box.appendChild(a);
    box.append('.');
    listEl.appendChild(box);
    return;
  }

  const entries = primaryEntries(state.entries);
  if (!entries.length) {
    summaryEl.textContent = '';
    const box = el('div', { class: 'empty' });
    box.appendChild(el('strong', {}, `Your “${settings.folderName}” folder is ready`));
    box.append('It is in your bookmarks bar. When you stop reading a chapter, bookmark that page into it. Come back here to see when the next one is out.');
    listEl.appendChild(box);
    return;
  }

  const rows = entries.map((entry) => {
    const res = state.results[entry.key];
    return { entry, res, ...classify(entry, res, now) };
  });
  const newCount = rows.filter((r) => r.section === 'new').length;
  summaryEl.textContent = `${entries.length} series · ${newCount} new`;

  const visible = newOnly ? rows.filter((r) => r.section === 'new') : rows;
  if (!visible.length) {
    const box = el('div', { class: 'empty' });
    box.appendChild(el('strong', {}, 'Nothing new'));
    box.append('You are caught up on every series. Turn off “New only” to see the rest.');
    listEl.appendChild(box);
    return;
  }

  for (const section of SECTIONS) {
    const items = visible.filter((r) => r.section === section.id).sort((a, b) => a.order - b.order || (a.entry.series || '').localeCompare(b.entry.series || ''));
    if (!items.length) continue;
    if (!newOnly) {
      const h = el('div', { class: 'section' }, section.label);
      h.appendChild(el('span', { class: 'count' }, String(items.length)));
      listEl.appendChild(h);
    }
    for (const { entry, res } of items) listEl.appendChild(renderRow(entry, res, settings, now));
  }
}

function renderRow(entry, res, settings, now) {
  const fresh = isNew(entry, res);
  const d = describeNext(res, now);
  const row = el('div', { class: `row${fresh ? ' new' : d.tone ? ` ${d.tone}` : ''}` });

  const main = el('div', { class: 'main', title: recentTooltip(res) || entry.url });
  main.addEventListener('click', () => chrome.tabs.create({ url: entry.url }));

  const title = el('div', { class: 'title' });
  title.appendChild(el('span', { class: 'name' }, entry.series || entry.title));
  if (fresh) title.appendChild(el('span', { class: 'pill' }, `NEW ${res.latestChapter}`));
  else if (res?.status === 'hiatus') title.appendChild(el('span', { class: 'pill warn' }, 'HIATUS'));
  else if (res?.suspectHiatus) title.appendChild(el('span', { class: 'pill warn' }, 'BREAK?'));
  else if (res?.status === 'completed') title.appendChild(el('span', { class: 'pill muted' }, 'DONE'));
  else if (res?.error && res.latestChapter == null) title.appendChild(el('span', { class: 'pill bad' }, 'ERROR'));
  if (res?.uncertain) title.appendChild(el('span', { class: 'pill warn', title: 'The matched series title does not look like your bookmark. Check the “via” link, or press fix.' }, 'CHECK MATCH'));
  main.appendChild(title);

  const meta = el('div', { class: 'meta' });
  const you = el('span');
  you.append('you ');
  you.appendChild(el('b', {}, entry.chapter != null ? String(entry.chapter) : '?'));
  meta.appendChild(you);
  const latest = el('span');
  latest.append('latest ');
  latest.appendChild(el('b', {}, res?.latestChapter != null ? String(res.latestChapter) : '?'));
  if (res?.latestDate) latest.append(` (${relDays(res.latestDate, now)})`);
  meta.appendChild(latest);
  main.appendChild(meta);

  main.appendChild(el('div', { class: `next ${d.tone}` }, d.text));

  if (res?.matchTitle) {
    const via = el('div', { class: 'via' });
    via.append(`via ${res.providerLabel || res.provider}: `);
    const a = el('a', { href: res.matchUrl || '#', target: '_blank', rel: 'noopener' }, res.matchTitle);
    a.addEventListener('click', (e) => e.stopPropagation());
    via.appendChild(a);
    main.appendChild(via);
  }
  row.appendChild(main);

  const side = el('div', { class: 'side' });
  if (fresh) {
    const nextCh = entry.chapter + 1 <= res.latestChapter ? entry.chapter + 1 : res.latestChapter;
    const url = bumpChapterUrl(entry.url, entry.chapter, nextCh);
    const read = el('button', { class: 'read', title: url ? `Open ${url}` : 'Opens your bookmark; this site does not put the chapter number in the URL' }, `Read ch ${nextCh}`);
    read.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: url || entry.url });
    });
    side.appendChild(read);
  }
  const fix = el('button', { class: 'fix', title: 'Wrong series matched? Search with a different name or paste a link' }, 'fix');
  side.appendChild(fix);
  row.appendChild(side);

  const fixbox = el('div', { class: `fixbox${openFix.has(entry.key) ? ' open' : ''}` });
  const input = el('input', {
    type: 'text',
    placeholder: 'Search as… or paste a comick.io / mangaupdates.com link, then Enter',
    value: settings.overrides?.[entry.key] || '',
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      openFix.delete(entry.key);
      chrome.runtime.sendMessage({ type: 'setOverride', key: entry.key, value: input.value.trim() });
    }
    if (e.key === 'Escape') {
      openFix.delete(entry.key);
      fixbox.classList.remove('open');
    }
  });
  fixbox.appendChild(input);
  row.appendChild(fixbox);
  fix.addEventListener('click', () => {
    if (openFix.has(entry.key)) openFix.delete(entry.key);
    else openFix.add(entry.key);
    fixbox.classList.toggle('open');
    if (fixbox.classList.contains('open')) input.focus();
  });
  return row;
}

function renderFolderChooser(candidates, settings) {
  const box = el('div', { class: 'empty' });
  box.appendChild(el('strong', {}, 'Which folder holds your manga bookmarks?'));
  box.append('These folders already look like one. Pick it, or start a fresh folder.');
  listEl.appendChild(box);
  for (const c of candidates) {
    const row = el('div', { class: 'row' });
    const main = el('div', { class: 'main' });
    const title = el('div', { class: 'title' });
    title.appendChild(el('span', { class: 'name' }, c.title));
    title.appendChild(el('span', { class: 'pill muted' }, `${c.count} chapters`));
    main.appendChild(title);
    row.appendChild(main);
    const side = el('div', { class: 'side' });
    const use = el('button', { class: 'read' }, 'Use this');
    use.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'chooseFolder', id: c.id }));
    side.appendChild(use);
    row.appendChild(side);
    main.addEventListener('click', () => use.click());
    listEl.appendChild(row);
  }
  const bar = el('div', { class: 'binbar' });
  bar.appendChild(el('span', {}, `None of these. Create a new “${settings.folderName}” folder in the bookmarks bar.`));
  const create = el('button', {}, 'Create');
  create.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'chooseFolder' }));
  bar.appendChild(create);
  listEl.appendChild(bar);
}

function renderBin(state, now) {
  summaryEl.textContent = state.trash.length ? `${state.trash.length} in the bin · kept 60 days` : '';
  const bar = el('div', { class: 'binbar' });
  bar.appendChild(el('span', {}, state.trash.length ? 'Bookmarks removed from the folder. Restore puts one back and protects it from auto-cleanup.' : 'Nothing in the bin.'));
  if (state.trash.length) {
    const empty = el('button', { title: 'Forget everything in the bin' }, 'Empty');
    empty.addEventListener('click', () => {
      if (confirm('Empty the bin? These cannot be restored afterwards.')) chrome.runtime.sendMessage({ type: 'emptyTrash' });
    });
    bar.appendChild(empty);
  }
  listEl.appendChild(bar);

  const live = new Set(state.entries.map((e) => e.key));
  const items = [...state.trash].sort((a, b) => Number(!live.has(b.key)) - Number(!live.has(a.key)) || b.removedAt - a.removedAt);
  for (const t of items) {
    const gone = !!t.key && !live.has(t.key);
    const row = el('div', { class: `row${gone ? ' warn' : ''}` });
    const main = el('div', { class: 'main', title: t.url });
    main.addEventListener('click', () => chrome.tabs.create({ url: t.url }));
    const title = el('div', { class: 'title' });
    title.appendChild(el('span', { class: 'name' }, t.series || t.title));
    if (t.chapter != null) title.appendChild(el('span', { class: 'pill muted' }, `ch ${t.chapter}`));
    if (gone) title.appendChild(el('span', { class: 'pill warn', title: 'No bookmark of this series is left in the folder' }, 'GONE FROM FOLDER'));
    main.appendChild(title);
    const why = t.by === 'auto' ? `Removed by Manga Next, replaced by chapter ${t.replacedBy}` : 'Deleted by you';
    main.appendChild(el('div', { class: 'when' }, `${why} · ${agoShort(t.removedAt, now)}`));
    row.appendChild(main);
    const side = el('div', { class: 'side' });
    const restore = el('button', { class: 'restore' }, 'Restore');
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      const r = await chrome.runtime.sendMessage({ type: 'restore', trashId: t.id });
      if (r?.error) {
        restore.disabled = false;
        restore.textContent = r.error;
      }
    });
    side.appendChild(restore);
    row.appendChild(side);
    listEl.appendChild(row);
  }
}

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v);
  }
  if (text != null) n.textContent = text;
  return n;
}

render();
