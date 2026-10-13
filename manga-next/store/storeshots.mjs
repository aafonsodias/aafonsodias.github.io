import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const DAY = 86400000, now = Date.now();
const entries = [
  { bookmarkId: '1', key: 'pick me up infinite gacha', series: 'Pick Me Up, Infinite Gacha', chapter: 222, url: 'https://example.com/pick-me-up-infinite-gacha-chapter-222/', dateAdded: now },
  { bookmarkId: '2', key: 'dungeon odyssey', series: 'Dungeon Odyssey', chapter: 27, url: 'https://example.com/series/dungeon-odyssey/chapter/27', dateAdded: now },
  { bookmarkId: '3', key: 'solo leveling ragnarok', series: 'Solo Leveling: Ragnarok', chapter: 69, url: 'https://example.com/slr/chapter/69', dateAdded: now },
  { bookmarkId: '4', key: 'omniscient reader s viewpoint', series: "Omniscient Reader's Viewpoint", chapter: 312, url: 'https://example.com/orv/chapter-312', dateAdded: now },
  { bookmarkId: '5', key: 'eternally regressing knight', series: 'Eternally Regressing Knight', chapter: 112.7, url: 'https://example.com/erk/chapter-112-7', dateAdded: now },
  { bookmarkId: '6', key: 'tensei shitara slime datta ken', series: 'Tensei Shitara Slime Datta Ken', chapter: 146, url: 'https://example.com/slime/chapter-146', dateAdded: now },
];
const r = (o) => ({ cadenceDays: 7, cadenceLabel: 'weekly, usually Tue', provider: 'comick', providerLabel: 'Comick', status: 'ongoing', recent: [], ...o });
const results = {
  'pick me up infinite gacha': r({ latestChapter: 223, latestDate: now - 2 * DAY, nextExpected: now + 5 * DAY, nextChance: now + 5 * DAY, matchTitle: 'Pick Me Up, Infinite Gacha', matchUrl: '#' }),
  'dungeon odyssey': r({ latestChapter: 29, latestDate: now - 1 * DAY, nextExpected: now + 6 * DAY, nextChance: now + 6 * DAY, matchTitle: 'Dungeon Odyssey', matchUrl: '#' }),
  'solo leveling ragnarok': r({ latestChapter: 69, latestDate: now - 6 * DAY, nextExpected: now + 1 * DAY, nextChance: now + 1 * DAY, matchTitle: 'Solo Leveling: Ragnarok', matchUrl: '#' }),
  'omniscient reader s viewpoint': r({ latestChapter: 312, latestDate: now - 3 * DAY, nextExpected: now + 4 * DAY, nextChance: now + 4 * DAY, matchTitle: "Omniscient Reader's Viewpoint", matchUrl: '#' }),
  'eternally regressing knight': r({ latestChapter: 112.7, latestDate: now - 30 * DAY, daysSince: 30, suspectHiatus: true, late: true, nextExpected: now - 23 * DAY, nextChance: now + 5 * DAY, matchTitle: 'Eternally Regressing Knight', matchUrl: '#' }),
  'tensei shitara slime datta ken': r({ latestChapter: 146, latestDate: now - 20 * DAY, cadenceDays: 30, cadenceLabel: 'monthly', nextExpected: now + 10 * DAY, nextChance: now + 10 * DAY, matchTitle: 'Tensei Shitara Slime Datta Ken', matchUrl: '#' }),
};
const state = { entries, results, lastRun: now - 12 * 60000, running: 0, folderFound: true, smartNext: now + 3 * 3600e3, trash: [{ id: 't1', key: 'the world after the fall', series: 'The World After the Fall', chapter: 240, url: '#', removedAt: now - 3600e3, by: 'you' }, { id: 't2', key: 'pick me up infinite gacha', series: 'Pick Me Up, Infinite Gacha', chapter: 221, url: '#', removedAt: now - 5 * DAY, by: 'auto', replacedBy: 222 }], keep: [] };
const stub = `window.chrome = { storage: { sync: { get: async () => ({}), set: async () => {} }, local: { get: async () => (${JSON.stringify(state)}), set: async () => {} }, onChanged: { addListener() {} } }, runtime: { sendMessage: async () => ({ ok: true }), openOptionsPage() {} }, tabs: { create() {} } };`;
const srv = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: process.cwd(), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: process.env.EXE });
const shots = [
  ['1-list', 'Know when the next chapter drops.', 'Every manga in your bookmarks folder, with the chapter you are on, the latest one out, and when the next is expected.', 'popup.html', ''],
  ['2-bin', 'Nothing is ever lost.', 'Bookmark a new chapter and the old one is tidied away. Deleted something by mistake? Restore it from the bin.', 'popup.html?bin=1', ''],
  ['3-settings', 'No account. No tracking.', 'Runs entirely in your browser. Only the series title is sent to two public databases to look up release dates.', 'options.html', 'wide'],
];
for (const [name, h, p, src, wide] of shots) {
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(stub);
  const page = await ctx.newPage();
  const u = new URL('http://127.0.0.1:8765/_frame.html');
  u.searchParams.set('h', h); u.searchParams.set('p', p); u.searchParams.set('src', src); if (wide) u.searchParams.set('wide', '1');
  await page.goto(u.toString());
  const want = '/' + src.split('?')[0];
  await page.waitForFunction((w) => [...document.querySelectorAll('iframe')].some((i) => i.contentWindow && i.contentWindow.location.pathname === w), want);
  const frame = page.frames().find((f) => f !== page.mainFrame() && new URL(f.url()).pathname === want);
  await frame.waitForSelector(src.startsWith('popup') ? '.row' : '#save');
  if (src.includes('bin=1')) { await frame.click('#bin'); await frame.waitForSelector('.binbar'); }
  await page.screenshot({ path: `${process.env.S}/store-${name}.png` });
  await ctx.close();
}
await browser.close(); srv.kill(); console.log('store screenshots done');
