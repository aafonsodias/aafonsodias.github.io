import { predict, DAY } from '../lib/predict.js';
import { pickBest } from '../lib/providers.js';

let fail = 0;
const check = (name, cond, extra = '') => { if (!cond) fail++; console.log(cond ? 'PASS' : 'FAIL', name, extra); };

// Weekly series, released every Tuesday ~evening, last one 2 days ago, two groups re-uploading the same chapter.
const tue = new Date('2026-10-06T18:00:00Z').getTime(); // a Tuesday
const now = tue + 2 * DAY;
const weekly = [];
for (let i = 0; i < 8; i++) {
  weekly.push({ chapter: 222 - i, date: tue - i * 7 * DAY, group: 'Asura' });
  weekly.push({ chapter: 222 - i, date: tue - i * 7 * DAY + 2 * DAY, group: 'Other' }); // later re-upload must not shift dates
}
let p = predict(weekly, now);
check('weekly latest chapter', p.latestChapter === 222, String(p.latestChapter));
check('weekly cadence ~7', Math.abs(p.cadenceDays - 7) < 0.01, String(p.cadenceDays));
check('weekly label', /^weekly, usually Tue$/.test(p.cadenceLabel), p.cadenceLabel);
check('weekly next = +7d', p.nextExpected === tue + 7 * DAY, new Date(p.nextExpected).toISOString());
check('weekly not late', !p.late && !p.suspectHiatus);

// Same series but 13 days since last release: late, next chance rolls forward
p = predict(weekly, tue + 13 * DAY);
check('late flagged', p.late === true);
check('next chance rolled forward', p.nextChance === tue + 14 * DAY, new Date(p.nextChance).toISOString());
check('not yet hiatus', p.suspectHiatus === false);

// 30 days of silence on a weekly: suspect hiatus
p = predict(weekly, tue + 30 * DAY);
check('suspect hiatus', p.suspectHiatus === true);

// Batch upload: 5 chapters dumped on one day then weekly. Same-day intervals ignored.
const batch = [];
for (let i = 0; i < 5; i++) batch.push({ chapter: 10 + i, date: tue - 21 * DAY + i * 3600e3 });
batch.push({ chapter: 15, date: tue - 14 * DAY }, { chapter: 16, date: tue - 7 * DAY }, { chapter: 17, date: tue });
p = predict(batch, now);
check('batch cadence ~7', Math.abs(p.cadenceDays - 7) < 0.01, String(p.cadenceDays));

// Monthly (Japanese magazine) series
const monthly = [];
for (let i = 0; i < 6; i++) monthly.push({ chapter: 146 - i, date: tue - i * 30 * DAY });
p = predict(monthly, now);
check('monthly label', p.cadenceLabel === 'monthly', p.cadenceLabel);

// Only one release: no prediction, no crash
p = predict([{ chapter: 1, date: tue }], now);
check('single release no cadence', p.cadenceDays === null && p.latestChapter === 1 && p.nextExpected === null);
p = predict([], now);
check('empty ok', p.latestChapter === null && p.sampleSize === 0);
p = predict([{ chapter: NaN, date: tue }, { chapter: 3, date: NaN }], now);
check('garbage filtered', p.sampleSize === 0);

// pickBest prefers exact title over a longer first result
const cands = [
  { title: 'Solo Leveling', alt: [] },
  { title: 'Solo Leveling: Ragnarok', alt: ['나 혼자만 레벨업: 라그나로크'] },
  { title: 'Solo Leveling Side Story', alt: [] },
];
check('pickBest exact', pickBest(cands, 'Solo Leveling: Ragnarok').title === 'Solo Leveling: Ragnarok');
check('pickBest fallback first', pickBest(cands, 'Something Else').title === 'Solo Leveling');
check('pickBest alt title', pickBest(cands, '나 혼자만 레벨업: 라그나로크').title === 'Solo Leveling: Ragnarok');
check('pickBest empty', pickBest([], 'x') === null);

console.log(fail ? `${fail} FAILURES` : 'all predict tests passed');
process.exit(fail ? 1 : 0);
