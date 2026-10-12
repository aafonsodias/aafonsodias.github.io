import { getSettings, getState, primaryEntries } from './lib/store.js';
import { DAY } from './lib/predict.js';

const listEl = document.getElementById('list');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refresh');
const optionsBtn = document.getElementById('options');

const openFix = new Set();

refreshBtn.addEventListener('click', () => {
  refreshBtn.disabled = true;
  chrome.runtime.sendMessage({ type: 'refresh', force: true }).finally(() => (refreshBtn.disabled = false));
});
optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
chrome.storage.onChanged.addListener(() => render());

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

function describeNext(entry, res, now) {
  // returns { text, tone }
  if (!res) return { text: 'not checked yet', tone: '' };
  if (res.error && res.latestChapter == null) return { text: res.error, tone: 'bad' };
  if (res.status === 'completed') return { text: 'completed', tone: '' };
  if (res.status === 'hiatus') return { text: 'on hiatus', tone: 'warn' };
  if (res.status === 'cancelled') return { text: 'cancelled', tone: '' };
  if (!res.cadenceDays) {
    const when = res.latestDate ? ` on ${fmtDate(res.latestDate)}` : '';
    return { text: `latest came out${when}. Not enough history to predict the next one`, tone: '' };
  }
  const cadence = res.cadenceLabel ? ` · ${res.cadenceLabel}` : '';
  if (res.suspectHiatus) {
    return { text: `no chapter for ${Math.round(res.daysSince)} days, probably on a break${cadence}`, tone: 'warn' };
  }
  if (res.late && res.nextChance) {
    const lateBy = Math.round((now - res.nextExpected) / DAY);
    return { text: `was expected ${fmtDate(res.nextExpected)}, ${lateBy} days late. Next chance ${fmtDate(res.nextChance)} (${relDays(res.nextChance, now)})${cadence}`, tone: 'warn' };
  }
  const target = res.nextChance || res.nextExpected;
  const rel = relDays(target, now);
  const tone = rel === 'today' || rel === 'tomorrow' ? 'ok' : '';
  return { text: `next: ${fmtDate(target)} (${rel})${cadence}`, tone };
}

function sortKey(entry, res, now) {
  // new chapters first, then soonest expected, then unknowns, then errors
  if (res && res.latestChapter != null && entry.chapter != null && res.latestChapter > entry.chapter) return [0, 0];
  if (!res) return [3, 0];
  if (res.error && res.latestChapter == null) return [4, 0];
  if (res.status === 'completed' || res.status === 'cancelled') return [5, 0];
  if (res.status === 'hiatus' || res.suspectHiatus) return [2, res.daysSince || 0];
  const target = res.nextChance || res.nextExpected;
  if (target) return [1, target - now];
  return [3, 0];
}

async function render() {
  const [state, settings] = await Promise.all([getState(), getSettings()]);
  const now = Date.now();

  statusEl.textContent = state.running
    ? 'checking…'
    : state.lastRun
      ? `checked ${agoShort(state.lastRun, now)}`
      : '';
  refreshBtn.disabled = state.running;

  listEl.textContent = '';
  if (!state.folderFound) {
    listEl.innerHTML = `<div class="empty">No bookmarks folder named “${escapeHtml(settings.folderName)}” found.<br><a href="#" id="go-options">Change the folder name in settings</a>.</div>`;
    listEl.querySelector('#go-options').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    return;
  }
  if (!state.entries.length) {
    listEl.innerHTML = `<div class="empty">The “${escapeHtml(settings.folderName)}” folder is empty. Bookmark a chapter page into it and come back.</div>`;
    return;
  }

  const rows = primaryEntries(state.entries)
    .map((entry) => ({ entry, res: state.results[entry.key] }))
    .sort((a, b) => {
      const ka = sortKey(a.entry, a.res, now);
      const kb = sortKey(b.entry, b.res, now);
      return ka[0] - kb[0] || ka[1] - kb[1] || (a.entry.series || '').localeCompare(b.entry.series || '');
    });

  for (const { entry, res } of rows) listEl.appendChild(renderRow(entry, res, settings, now));
}

function renderRow(entry, res, settings, now) {
  const isNew = res && res.latestChapter != null && entry.chapter != null && res.latestChapter > entry.chapter;
  const row = el('div', { class: `row${isNew ? ' new' : ''}` });

  const main = el('div', { class: 'main', title: entry.url });
  main.addEventListener('click', () => chrome.tabs.create({ url: entry.url }));

  const title = el('div', { class: 'title' });
  title.appendChild(el('span', { class: 'name' }, entry.series || entry.title));
  if (isNew) title.appendChild(el('span', { class: 'pill' }, `NEW ${res.latestChapter}`));
  else if (res?.status === 'hiatus') title.appendChild(el('span', { class: 'pill warn' }, 'HIATUS'));
  else if (res?.suspectHiatus) title.appendChild(el('span', { class: 'pill warn' }, 'BREAK?'));
  else if (res?.status === 'completed') title.appendChild(el('span', { class: 'pill muted' }, 'DONE'));
  else if (res?.error && res.latestChapter == null) title.appendChild(el('span', { class: 'pill bad' }, 'ERROR'));
  if (res?.uncertain) title.appendChild(el('span', { class: 'pill warn', title: 'The matched series title does not look like your bookmark. Check the “via” link, or press fix.' }, 'CHECK MATCH'));
  main.appendChild(title);

  const you = entry.chapter != null ? `you: ${entry.chapter}` : 'you: ?';
  const latest = res?.latestChapter != null
    ? `latest: ${res.latestChapter}${res.latestDate ? ` (${relDays(res.latestDate, now)})` : ''}`
    : 'latest: ?';
  main.appendChild(el('div', { class: 'meta' }, `${you} · ${latest}`));

  const d = describeNext(entry, res, now);
  main.appendChild(el('div', { class: `next ${d.tone}` }, d.text));

  if (res?.matchTitle) {
    const via = el('div', { class: 'via' });
    via.append(`via ${res.providerLabel || res.provider}: `);
    const a = el('a', { href: res.matchUrl || '#', target: '_blank' }, res.matchTitle);
    a.addEventListener('click', (e) => e.stopPropagation());
    via.appendChild(a);
    main.appendChild(via);
  }

  const fixbox = el('div', { class: `fixbox${openFix.has(entry.key) ? ' open' : ''}` });
  const input = el('input', {
    type: 'text',
    placeholder: 'Search as… or paste a comick.io / mangaupdates.com link',
    value: settings.overrides?.[entry.key] || '',
  });
  input.addEventListener('click', (e) => e.stopPropagation());
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
  main.appendChild(fixbox);

  row.appendChild(main);

  const fix = el('button', { class: 'fix', title: 'Wrong series matched? Search with a different name or paste a link' }, 'fix');
  fix.addEventListener('click', () => {
    if (openFix.has(entry.key)) openFix.delete(entry.key);
    else openFix.add(entry.key);
    fixbox.classList.toggle('open');
    if (fixbox.classList.contains('open')) input.focus();
  });
  row.appendChild(fix);
  return row;
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

render();
