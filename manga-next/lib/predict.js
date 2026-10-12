// Estimates the next release from a list of past releases.
// releases: [{ chapter: number, date: ms since epoch, group?: string }]

export const DAY = 86400000;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function modeWeekday(dates) {
  const counts = new Map();
  for (const d of dates) {
    const w = new Date(d).getDay();
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [w, c] of counts) {
    if (c > bestCount) {
      best = w;
      bestCount = c;
    }
  }
  return bestCount >= 2 ? best : null;
}

export function cadenceLabel(days, weekday) {
  if (!days) return null;
  const wd = weekday != null ? `, usually ${WEEKDAYS[weekday]}` : '';
  if (days >= 6 && days <= 8) return `weekly${wd}`;
  if (days >= 13 && days <= 15) return `every two weeks${wd}`;
  if (days >= 20 && days <= 23) return 'every three weeks';
  if (days >= 27 && days <= 33) return 'monthly';
  if (days < 6) return `every ~${Math.round(days)} days`;
  return `every ~${Math.round(days)} days`;
}

function roundedCadence(days) {
  if (days >= 6 && days <= 8) return 7;
  if (days >= 13 && days <= 15) return 14;
  if (days >= 20 && days <= 23) return 21;
  return Math.max(1, Math.round(days));
}

export function predict(releases, now = Date.now()) {
  const byChapter = new Map();
  for (const r of releases || []) {
    if (r == null || !Number.isFinite(r.chapter) || !Number.isFinite(r.date)) continue;
    const prev = byChapter.get(r.chapter);
    if (!prev || r.date < prev.date) byChapter.set(r.chapter, { chapter: r.chapter, date: r.date, group: r.group || null });
  }
  const list = [...byChapter.values()].sort((a, b) => b.chapter - a.chapter).slice(0, 12);

  const empty = {
    latestChapter: null, latestDate: null, latestGroup: null,
    cadenceDays: null, cadenceLabel: null, weekday: null,
    nextExpected: null, nextChance: null, daysSince: null,
    late: false, suspectHiatus: false, sampleSize: 0,
  };
  if (!list.length) return empty;

  const latest = list[0];
  const intervals = [];
  for (let i = 0; i < list.length - 1; i++) {
    const d = (list[i].date - list[i + 1].date) / DAY;
    if (d > 0.5) intervals.push(d); // skip same-day batch uploads
  }
  const cadenceDays = intervals.length >= 2 ? median(intervals) : intervals.length === 1 ? intervals[0] : null;
  const weekday = modeWeekday(list.slice(0, 6).map((r) => r.date));
  const daysSince = (now - latest.date) / DAY;

  let nextExpected = null;
  let nextChance = null;
  if (cadenceDays) {
    const step = roundedCadence(cadenceDays) * DAY;
    nextExpected = latest.date + step;
    nextChance = nextExpected;
    let guard = 0;
    while (nextChance < now - DAY && guard++ < 24) nextChance += step;
  }

  const late = !!cadenceDays && daysSince > cadenceDays * 1.5;
  const suspectHiatus = !!cadenceDays && daysSince > Math.max(cadenceDays * 2.5, 21);

  return {
    latestChapter: latest.chapter,
    latestDate: latest.date,
    latestGroup: latest.group,
    cadenceDays,
    cadenceLabel: cadenceLabel(cadenceDays, weekday),
    weekday,
    nextExpected,
    nextChance,
    daysSince,
    late,
    suspectHiatus,
    sampleSize: list.length,
  };
}
