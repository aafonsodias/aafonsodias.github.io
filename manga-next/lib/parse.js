// Turns a bookmark (title + url) into a series name and the chapter number it points at.
// Bookmark titles come straight from reader sites, so they look like:
//   "Dungeon Odyssey Chapter 27 - Read Online | Asura Scans"
//   "Tyrant of the Tower Defense Game · Ch.195"
//   "Episode 240 | The World After the Fall"
//   "Eternally Regressing Knight Chapter 112.7 - Read O..."

const CHAPTER_RE = /\b(?:chapter|chap|ch|episode|ep)\.?\s*#?\s*(\d+(?:\.\d+)?)\b/i;
const URL_CHAPTER_RE = /(?:chapter|chap|ch|episode|ep)[-_]?(\d+(?:[.-]\d+)?)(?:[/?#]|$)/i;
const PART_SPLIT = /\s+[-–—|·•]\s+|\s*\|\s*/;
const LEADING_NOISE = /^(?:manga|manhwa|manhua|webtoon|read)\s*:?\s+/i;
const NOISE_PART = /^(?:\[.*\]|read\b.*|free\b.*|premium\b.*|english\b.*|.*\bscans?\b.*|.*\bscanlations?\b.*|.*\bmanga\b.*|.*\bmanhwa\b.*|.*\bcomics?\b.*|.*\bwebtoons?\b.*|.*\bonline\b.*|mangadex|comick|bato\.?to|asura.*|reaper.*|flame.*)$/i;

const SLUG_PREFIX_SEGMENTS = /^(?:manga|manhwa|manhua|comic|comics|series|read|title|webtoon|en|ko|ja|chapter|chapters)$/i;

export function cleanSeries(s) {
  return String(s || '')
    .replace(LEADING_NOISE, '')
    .replace(/^[\s,:\-–—·•|]+|[\s,:\-–—·•|]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/'S\b/g, "'s")
    .trim();
}

export function seriesKey(series) {
  return String(series || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function titleFromSlug(slug) {
  return String(slug || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function parseUrl(url) {
  const out = { series: null, chapter: null };
  if (!url) return out;
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    const m = path.match(URL_CHAPTER_RE);
    if (!m) return out;
    out.chapter = Number(m[1].replace('-', '.'));
    const segs = path.split('/').filter(Boolean);
    const si = segs.findIndex((s) => URL_CHAPTER_RE.test(s + '/'));
    const seg = segs[si] || '';
    let slug = seg.replace(/[-_]?(?:chapter|chap|ch|episode|ep)[-_]?\d+(?:[.-]\d+)?.*$/i, '');
    if (!slug && si > 0) slug = segs[si - 1];
    if (slug && !SLUG_PREFIX_SEGMENTS.test(slug)) out.series = titleFromSlug(slug);
  } catch {
    // not a URL we can read; ignore
  }
  return out;
}

export function parseBookmark({ title = '', url = '' } = {}) {
  const parts = String(title).split(PART_SPLIT).map((p) => p.trim()).filter(Boolean);
  let chapter = null;
  let series = null;

  const idx = parts.findIndex((p) => CHAPTER_RE.test(p));
  if (idx !== -1) {
    const m = parts[idx].match(CHAPTER_RE);
    chapter = Number(m[1]);
    const before = cleanSeries(parts[idx].slice(0, m.index));
    if (before && !NOISE_PART.test(before)) series = before;
  }

  if (!series) {
    // Prefer the part right before the chapter token, then the one after it, then anything else.
    const order = idx === -1
      ? parts.map((_, i) => i)
      : [idx - 1, idx + 1, ...parts.keys()].filter((i, pos, arr) => i >= 0 && i < parts.length && i !== idx && arr.indexOf(i) === pos);
    for (const i of order) {
      const c = cleanSeries(parts[i]);
      if (c && !NOISE_PART.test(c) && !CHAPTER_RE.test(c)) {
        series = c;
        break;
      }
    }
  }

  const fromUrl = parseUrl(url);
  if (chapter == null && fromUrl.chapter != null) chapter = fromUrl.chapter;
  if (!series && fromUrl.series) series = fromUrl.series;
  if (!series) series = cleanSeries(parts[0] || title) || null;

  return { series, chapter, key: series ? seriesKey(series) : null };
}

// Given the bookmarked chapter URL, guess the URL of another chapter by swapping the number.
// Works on sites that put the chapter number in the path (most do). Returns null when it cannot.
export function bumpChapterUrl(url, fromChapter, toChapter) {
  if (!url || fromChapter == null || toChapter == null) return null;
  try {
    const u = new URL(url);
    const re = /((?:chapter|chap|ch|episode|ep)[-_/]?)(\d+(?:[.-]\d+)?)(?=[/?#]|$)/i;
    const m = u.pathname.match(re);
    if (!m) return null;
    const have = Number(m[2].replace('-', '.'));
    if (have !== Number(fromChapter)) return null;
    const sep = m[2].includes('-') ? '-' : '.';
    const next = String(toChapter).replace('.', sep);
    u.pathname = u.pathname.replace(re, `$1${next}`);
    return u.toString();
  } catch {
    return null;
  }
}

// "221-222" -> 222, "112.7" -> 112.7, "Ch. 5" -> 5, null/"" -> null
export function parseChapterNumber(raw) {
  if (raw == null) return null;
  const s = String(raw);
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const n = Number(nums[nums.length - 1]);
  return Number.isFinite(n) ? n : null;
}
