import { parseBookmark, parseChapterNumber } from '../lib/parse.js';

const cases = [
  ['Solo Leveling: Ragnarok Chapter 69 - [ENGLISH SCANS] - Asura Scans', 'https://asuracomic.net/series/solo-leveling-ragnarok-abc123/chapter/69', 'Solo Leveling: Ragnarok', 69],
  ["Omniscient Reader'S Viewpoint chapter 312 - Mangakakalot", 'https://mangakakalot.gg/manga/omniscient-readers-viewpoint/chapter-312', "Omniscient Reader's Viewpoint", 312],
  ['Tyrant of the Tower Defense Game · Ch.195', 'https://comick.io/comic/tyrant-of-the-tower-defense-game/abc-chapter-195-en', 'Tyrant of the Tower Defense Game', 195],
  ['Manga: Fun Territory Defense by the Optimistic Lord - Chapter 41 - Read Online', 'https://example.com/manga/fun-territory-defense/chapter-41/', 'Fun Territory Defense by the Optimistic Lord', 41],
  ["Nebula's Civilization · Ch.140", 'https://comick.io/comic/nebulas-civilization/xyz-chapter-140-en', "Nebula's Civilization", 140],
  ['Tensei Shitara Slime Datta Ken - Chapter 146 That Time I Got Reincarnated as a Slime', 'https://example.com/tensei-shitara-slime-datta-ken-chapter-146/', 'Tensei Shitara Slime Datta Ken', 146],
  ['Eternally Regressing Knight Chapter 112.7 - Read Online | Reaper Scans', 'https://reaperscans.com/series/eternally-regressing-knight/chapter-112-7', 'Eternally Regressing Knight', 112.7],
  ['The Greatest Estate Developer, Chapter 223 - Read Online | Mangabuddy', 'https://example.com/the-greatest-estate-developer/chapter-223', 'The Greatest Estate Developer', 223],
  ['Episode 240 | The World After the Fall', 'https://example.com/en/the-world-after-the-fall/episode-240', 'The World After the Fall', 240],
  ['Dungeon Odyssey Chapter 27 - Read Online | Asura Scans', 'https://asuracomic.net/series/dungeon-odyssey-1f2e/chapter/27', 'Dungeon Odyssey', 27],
  ['Solo Max-Level Newbie Chapter 280 - Premium | Asura Scans', 'https://asuracomic.net/series/solo-max-level-newbie-77/chapter/280', 'Solo Max-Level Newbie', 280],
  ['Surviving The Game as a Barbarian Chapter 164 - Read Online | Asura Scans', 'https://asuracomic.net/series/surviving-the-game-as-a-barbarian/chapter/164', 'Surviving The Game as a Barbarian', 164],
  ['Pick Me Up, Infinite Gacha Chapter 222 – Pick Me Up, Infinite Gacha', 'https://w19.pickmeupgacha.com/pick-me-up-infinite-gacha-chapter-222/', 'Pick Me Up, Infinite Gacha', 222],
  // title without a chapter: fall back to the URL
  ['Pick Me Up, Infinite Gacha', 'https://w19.pickmeupgacha.com/pick-me-up-infinite-gacha-chapter-223/', 'Pick Me Up, Infinite Gacha', 223],
  // nothing but a URL
  ['', 'https://w19.pickmeupgacha.com/pick-me-up-infinite-gacha-chapter-223/', 'Pick Me Up Infinite Gacha', 223],
  ['Read Nebula\'s Civilization · Ch.140 · Comick', '', "Nebula's Civilization", 140],
];

let fail = 0;
for (const [title, url, wantSeries, wantChapter] of cases) {
  const got = parseBookmark({ title, url });
  const ok = got.series === wantSeries && got.chapter === wantChapter;
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(title.slice(0, 50)), '=>', JSON.stringify(got.series), got.chapter, ok ? '' : `(want ${JSON.stringify(wantSeries)} ${wantChapter})`);
}
const nums = [['221-222', 222], ['112.7', 112.7], ['Ch. 5', 5], [null, null], ['', null], [7, 7]];
for (const [raw, want] of nums) {
  const got = parseChapterNumber(raw);
  if (got !== want) { fail++; console.log('FAIL chapterNumber', raw, got, want); }
}
console.log(fail ? `${fail} FAILURES` : 'all parse tests passed');
process.exit(fail ? 1 : 0);
