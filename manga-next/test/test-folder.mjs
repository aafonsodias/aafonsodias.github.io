// Folder detection: adopt a clear match under another name, ask when ambiguous, create when nothing fits.
const scenario = process.argv[2];
const store = { local: {}, sync: {} };
const listeners = {};
let newId = 0;
const ch = (id, series, n) => ({ id, title: `${series} Chapter ${n} - Read Online`, url: `https://x.com/${series.toLowerCase().replace(/ /g, '-')}/chapter-${n}`, dateAdded: n });
const webtoons = { id: '20', title: 'Webtoons', children: [ch('21', 'Dungeon Odyssey', 27), ch('22', 'Solo Max Level Newbie', 280), ch('23', 'Nebula Civilization', 140), ch('24', 'Tyrant Tower', 195)] };
const comics = { id: '30', title: 'Stuff I read', children: [ch('31', 'World After Fall', 240), ch('32', 'Greatest Estate Developer', 223), ch('33', 'Eternally Regressing Knight', 112), { id: '34', title: 'Reddit', url: 'https://reddit.com' }] };
const recipes = { id: '40', title: 'Recipes', children: [{ id: '41', title: 'Bolognese', url: 'https://food.com/b' }, { id: '42', title: 'Chapter and verse bakery', url: 'https://food.com/c' }] };
const bar = { id: '1', title: 'Bookmarks bar', children: [recipes] };
if (scenario === 'one') bar.children.push(webtoons);
if (scenario === 'two') bar.children.push(webtoons, comics);
const tree = [{ id: '0', children: [bar, { id: '2', title: 'Other bookmarks', children: [] }] }];
const findNode = (nodes, id) => { for (const n of nodes) { if (n.id === id) return n; const r = n.children ? findNode(n.children, id) : null; if (r) return r; } return null; };
const pick = (obj, keys) => { if (keys == null) return structuredClone(obj); const ks = Array.isArray(keys) ? keys : [keys]; const out = {}; for (const k of ks) if (k in obj) out[k] = structuredClone(obj[k]); return out; };
globalThis.chrome = {
  runtime: { onInstalled: { addListener: (f) => (listeners.installed = f) }, onStartup: { addListener() {} }, onMessage: { addListener: (f) => (listeners.message = f) } },
  alarms: { onAlarm: { addListener() {} }, clear: async () => {}, create: async () => {} },
  bookmarks: { onCreated: { addListener() {} }, onChanged: { addListener() {} }, onRemoved: { addListener() {} }, onMoved: { addListener() {} },
    getTree: async () => tree, getSubTree: async (id) => [findNode(tree, id)], get: async (id) => { const n = findNode(tree, id); if (!n) throw new Error('nope'); return [n]; },
    create: async ({ parentId, title, url }) => { const f = findNode(tree, parentId); const n = url ? { id: 'new' + (++newId), title, url, dateAdded: Date.now() } : { id: 'new' + (++newId), title, children: [] }; f.children.push(n); return n; },
    remove: async () => {} },
  storage: { sync: { get: async (k) => pick(store.sync, k), set: async (o) => { Object.assign(store.sync, structuredClone(o)); } }, local: { get: async (k) => pick(store.local, k), set: async (o) => { Object.assign(store.local, structuredClone(o)); } } },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  notifications: { create() {}, onClicked: { addListener() {} }, clear() {} },
  tabs: { create() {} },
};
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
await import('../background.js');
const waitIdle = async () => { for (let i = 0; i < 200; i++) { await new Promise((r) => setTimeout(r, 50)); if (!store.local.running && store.local.lastRun) return; } throw new Error('never finished'); };
const call = (msg) => new Promise((resolve) => listeners.message(msg, {}, resolve));
let fail = 0;
const check = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', `[${scenario}]`, name, extra); };

await listeners.installed();
await waitIdle();
const s = store.sync.settings || {};
const barTitles = bar.children.map((c) => c.title);
if (scenario === 'one') {
  check('adopted the Webtoons folder', s.folderId === '20' && s.folderName === 'Webtoons' && s.folderChosen === true, JSON.stringify(s));
  check('notice shown once', store.local.adoptedFolder?.title === 'Webtoons' && store.local.adoptedFolder.count === 4);
  check('entries come from that folder', store.local.entries.length === 4);
  check('no Manga folder created', !barTitles.includes('Manga'), JSON.stringify(barTitles));
  check('Recipes ignored despite the word Chapter', store.local.entries.every((e) => !/bakery/i.test(e.title)));
}
if (scenario === 'two') {
  check('asks instead of guessing', store.local.pendingFolder?.candidates?.length === 2 && store.local.folderFound === false, JSON.stringify(store.local.pendingFolder));
  check('no Manga folder created while asking', !barTitles.includes('Manga'), JSON.stringify(barTitles));
  await call({ type: 'chooseFolder', id: '30' });
  store.local.lastRun = 0;
  await waitIdle();
  const s2 = store.sync.settings;
  check('chosen folder is used', s2.folderId === '30' && s2.folderName === 'Stuff I read' && store.local.pendingFolder === null && store.local.entries.length === 4, JSON.stringify(s2));
}
if (scenario === 'none') {
  check('created Manga in the bar', barTitles.includes('Manga') && s.folderChosen === true && s.folderId, JSON.stringify(barTitles));
  check('Recipes not mistaken for a manga folder', s.folderName === 'Manga');
}
console.log(fail ? `${fail} FAILURES` : `folder scenario "${scenario}" passed`);
process.exit(fail ? 1 : 0);
