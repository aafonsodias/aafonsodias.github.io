import { bumpChapterUrl } from '../lib/parse.js';
const cases = [
  ['https://w19.pickmeupgacha.com/pick-me-up-infinite-gacha-chapter-222/', 222, 223, 'https://w19.pickmeupgacha.com/pick-me-up-infinite-gacha-chapter-223/'],
  ['https://asuracomic.net/series/dungeon-odyssey-1f2e/chapter/27', 27, 28, 'https://asuracomic.net/series/dungeon-odyssey-1f2e/chapter/28'],
  ['https://reaperscans.com/series/erk/chapter-112-7', 112.7, 113, 'https://reaperscans.com/series/erk/chapter-113'],
  ['https://x.com/en/the-world-after-the-fall/episode-240', 240, 241, 'https://x.com/en/the-world-after-the-fall/episode-241'],
  ['https://x.com/manga/foo/chapter-50', 49, 50, null], // bookmark chapter mismatch: do not guess
  ['https://x.com/manga/foo/ch-9.5', 9.5, 10, 'https://x.com/manga/foo/ch-10'],
];
let fail = 0;
for (const [u, a, b, want] of cases) { const got = bumpChapterUrl(u, a, b); const ok = got === want; if (!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', u, '->', got); }
console.log(fail ? `${fail} FAILURES` : 'bump tests passed'); process.exit(fail ? 1 : 0);
