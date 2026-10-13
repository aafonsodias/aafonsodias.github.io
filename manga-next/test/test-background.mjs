// End-to-end smoke test of background.js with a fake chrome API and fake network.
const DAY = 86400000;
const store = { local: {}, sync: {} };
const listeners = {};
const notes = [];
const removedIds = [];
const alarms = {};
let newId = 0;
let badge = null;
let latestPickMeUp = 223;

const tree = [{ id: '0', children: [{ id: '1', title: 'Bookmarks bar', children: [{ id: '5', title: 'manga', children: [
  { id: '10', title: 'Pick Me Up, Infinite Gacha Chapter 222 – Pick Me Up, Infinite Gacha', url: 'https://w19.pickmeupgacha.com/pick-me-up-infinite-gacha-chapter-222/', dateAdded: 1000 },
  { id: '11', title: 'Dungeon Odyssey Chapter 27 - Read Online | Asura Scans', url: 'https://asuracomic.net/series/dungeon-odyssey-1f2e/chapter/27' },
  { id: '12', title: 'Unknown Thing Chapter 3', url: 'https://x.com/unknown-thing-chapter-3' },
  { id: '13', title: 'Pick Me Up, Infinite Gacha Chapter 221 – re-read, saved later', url: 'https://w19.pickmeupgacha.com/pick-me-up-infinite-gacha-chapter-221/', dateAdded: 2000 },
] }] }] }];
const findNode = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; const r = n.children ? findNode(n.children, id) : null; if (r) return r; } return null; };
const pick = (obj, keys) => { if (keys == null) return structuredClone(obj); const ks = Array.isArray(keys) ? keys : [keys]; const out = {}; for (const k of ks) if (k in obj) out[k] = structuredClone(obj[k]); return out; };

globalThis.chrome = {
  runtime: { onInstalled: { addListener: (f) => (listeners.installed = f) }, onStartup: { addListener() {} }, onMessage: { addListener: (f) => (listeners.message = f) } },
  alarms: { onAlarm: { addListener: (f) => (listeners.alarm = f) }, clear: async (n) => { delete alarms[n]; }, create: async (n, o) => { alarms[n] = o; } },
  bookmarks: { onCreated: { addListener() {} }, onChanged: { addListener() {} }, onRemoved: { addListener: (f) => (listeners.removed = f) }, get: async (id) => { const n = findNode(tree, id); if (!n) throw new Error('nope'); return [n]; }, create: async ({ parentId, title, url }) => { const f = findNode(tree, parentId); const n = url ? { id: 'new' + (++newId), title, url, dateAdded: Date.now() } : { id: 'new' + (++newId), title, children: [] }; f.children.push(n); return n; }, onMoved: { addListener() {} }, getTree: async () => tree, getSubTree: async (id) => [findNode(tree, id)], remove: async (id) => { const f = findNode(tree, '5'); const i = f.children.findIndex((c) => c.id === id); if (i < 0) throw new Error('no such bookmark'); f.children.splice(i, 1); removedIds.push(id); } },
  storage: {
    sync: { get: async (k) => pick(store.sync, k), set: async (o) => { Object.assign(store.sync, structuredClone(o)); } },
    local: { get: async (k) => pick(store.local, k), set: async (o) => { Object.assign(store.local, structuredClone(o)); } },
  },
  action: { setBadgeText: async (o) => (badge = o.text), setBadgeBackgroundColor: async () => {} },
  notifications: { create: (id, o) => notes.push({ id, ...o }), onClicked: { addListener() {} }, clear() {} },
  tabs: { create() {} },
};

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const weekly = (latest, n = 8) => ({ chapters: Array.from({ length: n }, (_, i) => ({ chap: String(latest - i), created_at: new Date(Date.now() - 2 * DAY - i * 7 * DAY).toISOString(), group_name: ['Asura'] })) });
const log = [];
globalThis.fetch = async (url, opts = {}) => {
  log.push(`${opts.method || 'GET'} ${url}`);
  const u = new URL(url);
  if (u.host === 'api.comick.dev') {
    if (u.pathname === '/v1.0/search') {
      const q = u.searchParams.get('q').toLowerCase();
      if (q.includes('pick me up')) return json([{ hid: 'hOther', slug: 'pick-me-up-side', title: 'Pick Me Up Side Story', md_titles: [] }, { hid: 'h1', slug: 'pick-me-up-infinite-gacha', title: 'Pick Me Up, Infinite Gacha', md_titles: [{ title: '나를 주워줘' }] }]);
      if (q.includes('dungeon')) return json([{ hid: 'h2', slug: 'dungeon-odyssey', title: 'Dungeon Odyssey' }]);
      return json([]);
    }
    if (u.pathname === '/comic/h1/chapters') return json(weekly(latestPickMeUp));
    if (u.pathname === '/comic/h2/chapters') return json(weekly(27, 3));
    if (u.pathname === '/comic/h9/chapters') return json(weekly(5));
    if (u.pathname === '/comic/pick-me-up-infinite-gacha') return json({ comic: { hid: 'h1', slug: 'pick-me-up-infinite-gacha', title: 'Pick Me Up, Infinite Gacha', status: 1, last_chapter: String(latestPickMeUp), md_covers: [{ b2key: 'cov1.jpg' }], recommendations: [{ up: 40, relates: { hid: 'r1', slug: 'solo-leveling', title: 'Solo Leveling', md_covers: [{ b2key: 'sl.jpg' }] } }, { up: 5, relates: { hid: 'h2', slug: 'dungeon-odyssey', title: 'Dungeon Odyssey' } }] } });
    if (u.pathname === '/comic/dungeon-odyssey') return json({ comic: { hid: 'h2', slug: 'dungeon-odyssey', title: 'Dungeon Odyssey', status: 4, last_chapter: '27', recommendations: [{ up: 12, relates: { hid: 'r1', slug: 'solo-leveling', title: 'Solo Leveling' } }, { up: 3, relates: { hid: 'r2', slug: 'orv', title: 'Omniscient Reader' } }] } });
    if (u.pathname === '/comic/r1/chapters') return json({ chapters: [{ hid: 'c1', chap: '1' }] });
    if (u.pathname === '/comic/some-real-slug') return json({ comic: { hid: 'h9', slug: 'some-real-slug', title: 'Some Real Title', status: 1, last_chapter: '5' } });
    return json({ error: 'nope' }, 404);
  }
  if (u.host === 'api.mangaupdates.com') {
    if (u.pathname === '/v1/series/search') return json({ results: [] });
    return json({}, 404);
  }
  return json({}, 404);
};

await import('../background.js');
const waitIdle = async () => { for (let i = 0; i < 200; i++) { await new Promise((r) => setTimeout(r, 50)); if (!store.local.running && store.local.lastRun) return; } throw new Error('refresh never finished'); };
const call = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));

let fail = 0;
const check = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };

// 1. first run: install
await listeners.installed();
await waitIdle();
let r = store.local.results;
const keys = Object.keys(r);
check('three series checked', keys.length === 3, keys.join(' | '));
const pmu = r['pick me up infinite gacha'];
check('pick me up matched the exact title, not the first hit', pmu?.matchTitle === 'Pick Me Up, Infinite Gacha' && pmu?.uncertain === false, JSON.stringify({ t: pmu?.matchTitle, u: pmu?.uncertain }));
check('pick me up latest 223', pmu?.latestChapter === 223);
check('pick me up weekly prediction', /^weekly/.test(pmu?.cadenceLabel || '') && pmu?.nextExpected > Date.now(), pmu?.cadenceLabel);
check('dungeon odyssey hiatus status', r['dungeon odyssey']?.status === 'hiatus');
check('unknown has error, no match', /No match/.test(r['unknown thing']?.error || ''), r['unknown thing']?.error);
check('badge counts one new series', badge === '1', String(badge));
check('no notifications on first run', notes.length === 0, String(notes.length));
check('folder found with different case', store.local.folderFound === true);
check('most recently saved bookmark wins even with a lower chapter', removedIds.length === 1 && removedIds[0] === '10' && store.local.entries.length === 3, JSON.stringify(removedIds));

check('auto-removed bookmark is in the bin', store.local.trash?.length === 1 && store.local.trash[0].by === 'auto' && store.local.trash[0].chapter === 222 && store.local.trash[0].replacedBy === 221, JSON.stringify(store.local.trash));
// restore it: it must come back and survive the next cleanup
const rr = await call({ type: 'restore', trashId: store.local.trash[0].id });
check('restore ok', rr?.ok === true && findNode(tree, '5').children.some((c) => c.id === rr.bookmarkId), JSON.stringify(rr));
check('bin emptied after restore', store.local.trash.length === 0);
store.local.lastRun = 0; store.local.running = 0;
await call({ type: 'refresh' });
await waitIdle();
check('restored bookmark not auto-removed again', findNode(tree, '5').children.some((c) => c.id === rr.bookmarkId) && removedIds.length === 1, JSON.stringify(removedIds));
// after the restore, 'you' is ch 222 again (restored bookmark is newest); the new chapter 224 later must still count as new
// user deletes a known bookmark by hand: goes to the bin as 'you'
const dung = findNode(tree, '11');
findNode(tree, '5').children = findNode(tree, '5').children.filter((c) => c.id !== '11');
listeners.removed('11', { parentId: '5', node: dung });
await new Promise((r) => setTimeout(r, 200));
check('manual deletion lands in the bin', store.local.trash.length === 1 && store.local.trash[0].by === 'you' && store.local.trash[0].series === 'Dungeon Odyssey', JSON.stringify(store.local.trash));
await call({ type: 'emptyTrash' });
check('empty bin', store.local.trash.length === 0);
findNode(tree, '5').children.push(dung);
await new Promise((r) => setTimeout(r, 1800)); // let the debounced bookmark sync settle

// smart alarm: Dungeon Odyssey is on hiatus, Pick Me Up (restored ch 222, latest 223) has news -> no smart check for either
check('no smart alarm when nothing is waiting on a window', alarms['manga-next-smart'] == null, JSON.stringify(alarms));
// give Pick Me Up a future expected release with no news: window opens 2h before
store.local.results['pick me up infinite gacha'].latestChapter = 221; // restored bookmark is ch 221, so nothing new yet
store.local.results['pick me up infinite gacha'].nextChance = Date.now() + 5 * DAY;
store.local.results['pick me up infinite gacha'].nextExpected = Date.now() + 5 * DAY;
listeners.alarm({ name: 'manga-next-smart' }); // refreshDue: nothing due -> reschedules
await new Promise((r) => setTimeout(r, 400));
const smart = alarms['manga-next-smart'];
check('smart alarm set 2h before expected', smart && Math.abs(smart.when - (Date.now() + 5 * DAY - 2 * 3600e3)) < 5000, JSON.stringify(smart));
check('popup can show next check time', typeof store.local.smartNext === 'number');

// suggestions: Solo Leveling recommended by two followed series ranks first; Dungeon Odyssey (followed) is excluded
check('cover stored', store.local.results['pick me up infinite gacha'].cover === 'https://meo.comick.pictures/cov1.jpg');
let sug = store.local.suggestions;
check('suggestions built, followed series excluded, best first', sug.length === 2 && sug[0].title === 'Solo Leveling' && sug[0].from.length === 2 && !sug.some((x) => x.title === 'Dungeon Odyssey'), JSON.stringify(sug.map((x) => [x.title, x.from])));
check('suggestion cover carried', sug[0].cover === 'https://meo.comick.pictures/sl.jpg');
const fc = await call({ type: 'suggestFirstChapter', id: sug[0].key });
check('first chapter url', fc?.url === 'https://comick.io/comic/solo-leveling/c1-chapter-1-en', JSON.stringify(fc));
await call({ type: 'suggestSkip', id: sug[0].key });
check('skip hides for 30 days', store.local.suggestions.length === 1 && store.local.suggestions[0].title === 'Omniscient Reader');
await call({ type: 'suggestExclude', id: store.local.suggestions[0].key });
check('exclude persists in settings', store.sync.settings.suggestExcluded['comick:r2'] === true && store.local.suggestions.length === 0);

// 2. second run: nothing new, still no notification
store.local.lastRun = 0; store.local.running = 0;
await call({ type: 'refresh' });
await waitIdle();
check('still no notification for an already-seen chapter', notes.length === 0, String(notes.length));

// 3. chapter 224 appears
latestPickMeUp = 224;
await call({ type: 'refresh' });
await waitIdle();
check('notified once for 224', notes.length === 1 && /224/.test(notes[0].message), JSON.stringify(notes.map((n) => n.message)));
check('match cached, no second search for pick me up', log.filter((l) => l.includes('/v1.0/search?q=Pick')).length === 1, String(log.filter((l) => l.includes('/v1.0/search?q=Pick')).length));

// 4. fix the unknown one by pasting a comick link
await call({ type: 'setOverride', key: 'unknown thing', value: 'https://comick.io/comic/some-real-slug' });
for (let i = 0; i < 100 && !store.local.results['unknown thing']?.latestChapter; i++) await new Promise((r) => setTimeout(r, 50));
const fixed = store.local.results['unknown thing'];
check('override via link resolves', fixed?.matchTitle === 'Some Real Title' && fixed?.latestChapter === 5, JSON.stringify({ t: fixed?.matchTitle, c: fixed?.latestChapter, e: fixed?.error }));
check('override persisted in settings', store.sync.settings?.overrides?.['unknown thing'] === 'https://comick.io/comic/some-real-slug');

// 5. no Manga folder at all: it gets created in the bookmarks bar and the popup shows the folder as ready
tree[0].children[0].children = tree[0].children[0].children.filter((c) => c.id !== '5');
store.local.lastRun = 0; store.local.running = 0;
await call({ type: 'refresh' });
await waitIdle();
const created = tree[0].children[0].children.find((c) => !c.url && /^manga$/i.test(c.title));
check('missing folder is created in the bookmarks bar', !!created && created.children.length === 0, JSON.stringify(tree[0].children[0].children.map((c) => c.title)));
check('popup state: folder found, no entries', store.local.folderFound === true && store.local.entries.length === 0);

console.log(fail ? `${fail} FAILURES` : 'background smoke test passed');
process.exit(fail ? 1 : 0);
