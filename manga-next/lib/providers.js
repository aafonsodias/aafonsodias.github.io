// Release-history providers. Each one can search a series by title and list its English releases.
// Comick is tried first (precise upload timestamps, aggregates every scanlation group),
// MangaUpdates second (older, stable, community-maintained).

import { parseChapterNumber, seriesKey } from './parse.js';

export const COMICK_HOSTS = ['https://api.comick.dev', 'https://api.comick.io', 'https://api.comick.fun'];
export const MU_HOST = 'https://api.mangaupdates.com';

async function getJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { accept: 'application/json', ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

function postJSON(url, body) {
  return getJSON(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

// Comick serves covers from its image host; md_covers carries the file key.
function comickCover(covers) {
  const key = Array.isArray(covers) ? covers.find((c) => c?.b2key)?.b2key : null;
  return key ? `https://meo.comick.pictures/${key}` : null;
}

// Pick the candidate whose title (or alternative title) matches the query best.
export function pickBest(candidates, query) {
  if (!candidates?.length) return null;
  const q = seriesKey(query);
  const score = (c) => {
    const titles = [c.title, ...(c.alt || [])].filter(Boolean).map(seriesKey);
    if (titles.includes(q)) return 3;
    if (titles.some((t) => t.startsWith(q) || q.startsWith(t))) return 2;
    if (titles.some((t) => t.includes(q) || q.includes(t))) return 1;
    return 0;
  };
  let best = candidates[0];
  let bestScore = score(best);
  for (const c of candidates.slice(1)) {
    const s = score(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return { ...best, matchScore: bestScore };
}

export const comick = {
  name: 'comick',
  label: 'Comick',

  async search(query, settings) {
    const hosts = settings?.comickBase ? [settings.comickBase, ...COMICK_HOSTS] : COMICK_HOSTS;
    let lastErr = null;
    for (const host of hosts) {
      try {
        const data = await getJSON(`${host}/v1.0/search?q=${encodeURIComponent(query)}&limit=8`);
        const arr = Array.isArray(data) ? data : data?.data;
        if (!Array.isArray(arr)) throw new Error('unexpected search response');
        return arr
          .filter((c) => c && c.hid)
          .map((c) => ({
            provider: 'comick',
            host,
            id: c.hid,
            slug: c.slug || null,
            title: c.title || c.slug || c.hid,
            alt: (c.md_titles || []).map((t) => t?.title).filter(Boolean),
            url: c.slug ? `https://comick.io/comic/${c.slug}` : null,
            cover: comickCover(c.md_covers),
          }));
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Comick unreachable');
  },

  // Accepts a pasted comick.io/comic/<slug> link.
  async fromUrl(url, settings) {
    const m = String(url).match(/comick\.(?:io|fun|dev|app)\/comic\/([^/?#]+)/i);
    if (!m) return null;
    const hosts = settings?.comickBase ? [settings.comickBase, ...COMICK_HOSTS] : COMICK_HOSTS;
    for (const host of hosts) {
      try {
        const data = await getJSON(`${host}/comic/${encodeURIComponent(m[1])}`);
        const c = data?.comic || data;
        if (!c?.hid) continue;
        return { provider: 'comick', host, id: c.hid, slug: c.slug || m[1], title: c.title || m[1], alt: [], url: `https://comick.io/comic/${c.slug || m[1]}` };
      } catch {
        // try next host
      }
    }
    return null;
  },

  async releases(match) {
    const data = await getJSON(`${match.host}/comic/${encodeURIComponent(match.id)}/chapters?lang=en&limit=40`);
    const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
    return chapters
      .map((c) => ({
        chapter: parseChapterNumber(c.chap),
        date: Date.parse(c.created_at || c.updated_at || ''),
        group: Array.isArray(c.group_name) ? c.group_name.join(', ') : c.group_name || null,
      }))
      .filter((r) => r.chapter != null && Number.isFinite(r.date));
  },

  async info(match) {
    try {
      const data = await getJSON(`${match.host}/comic/${encodeURIComponent(match.slug || match.id)}`);
      const c = data?.comic || data;
      const status = { 1: 'ongoing', 2: 'completed', 3: 'cancelled', 4: 'hiatus' }[c?.status] || null;
      const recommendations = (Array.isArray(c?.recommendations) ? c.recommendations : [])
        .map((r) => ({ rel: r?.relates, votes: Number(r?.up) || 0 }))
        .filter(({ rel }) => rel && rel.hid && rel.slug)
        .map(({ rel, votes }) => ({ provider: 'comick', id: rel.hid, slug: rel.slug, title: rel.title || rel.slug, cover: comickCover(rel.md_covers), url: `https://comick.io/comic/${rel.slug}`, votes }));
      return { status, latestChapter: parseChapterNumber(c?.last_chapter), cover: comickCover(c?.md_covers), recommendations };
    } catch {
      return { status: null, latestChapter: null };
    }
  },

  // URL of the first English chapter, for trying a suggested series.
  async firstChapterUrl(ref, settings) {
    const hosts = settings?.comickBase ? [settings.comickBase, ...COMICK_HOSTS] : COMICK_HOSTS;
    for (const host of hosts) {
      try {
        const data = await getJSON(`${host}/comic/${encodeURIComponent(ref.id)}/chapters?lang=en&chap-order=1&limit=1`);
        const ch = data?.chapters?.[0];
        if (ch?.hid) return `https://comick.io/comic/${ref.slug}/${ch.hid}-chapter-${ch.chap || '1'}-en`;
      } catch {
        // try next host
      }
    }
    return ref.url;
  },
};

export const mangaupdates = {
  name: 'mangaupdates',
  label: 'MangaUpdates',

  async search(query) {
    const data = await postJSON(`${MU_HOST}/v1/series/search`, { search: query, perpage: 8 });
    const results = Array.isArray(data?.results) ? data.results : [];
    return results
      .map((r) => r?.record)
      .filter((rec) => rec && rec.series_id != null)
      .map((rec) => ({
        provider: 'mangaupdates',
        host: MU_HOST,
        id: String(rec.series_id),
        slug: null,
        title: rec.title || String(rec.series_id),
        alt: [],
        url: rec.url || `https://www.mangaupdates.com/series/${Number(rec.series_id).toString(36)}`,
      }));
  },

  // Accepts a pasted mangaupdates.com/series/<base36 id>/... link.
  async fromUrl(url) {
    const m = String(url).match(/mangaupdates\.com\/series\/([0-9a-z]+)/i);
    if (!m) return null;
    const id = parseInt(m[1], 36);
    if (!Number.isFinite(id)) return null;
    try {
      const rec = await getJSON(`${MU_HOST}/v1/series/${id}`);
      return { provider: 'mangaupdates', host: MU_HOST, id: String(id), slug: null, title: rec?.title || String(id), alt: [], url: rec?.url || url };
    } catch {
      return null;
    }
  },

  async releases(match) {
    const want = String(match.id);
    const wantTitle = seriesKey(match.title);
    const ask = (search) => postJSON(`${MU_HOST}/v1/releases/search`, { search, search_type: 'series', perpage: 40, include_metadata: true });
    const ours = (r) => {
      const sid = r?.metadata?.series?.series_id ?? r?.record?.series_id;
      if (sid != null) return String(sid) === want;
      return seriesKey(r?.record?.title) === wantTitle;
    };

    let results = [];
    try {
      results = (await ask(want))?.results || [];
    } catch {
      results = [];
    }
    let mine = results.filter(ours);
    if (!mine.length) {
      try {
        results = (await ask(match.title))?.results || [];
      } catch {
        results = [];
      }
      mine = results.filter(ours);
    }
    return mine
      .map((r) => ({
        chapter: parseChapterNumber(r.record?.chapter),
        date: Date.parse(r.record?.release_date || ''),
        group: (r.record?.groups || []).map((g) => g?.name).filter(Boolean).join(', ') || null,
      }))
      .filter((r) => r.chapter != null && Number.isFinite(r.date));
  },

  async info(match) {
    try {
      const rec = await getJSON(`${MU_HOST}/v1/series/${encodeURIComponent(match.id)}`);
      const text = String(rec?.status || '').toLowerCase();
      let status = null;
      if (rec?.completed) status = 'completed';
      else if (text.includes('hiatus')) status = 'hiatus';
      else if (text.includes('ongoing')) status = 'ongoing';
      const recommendations = (Array.isArray(rec?.recommendations) ? rec.recommendations : [])
        .filter((r) => r?.series_id != null)
        .map((r) => ({ provider: 'mangaupdates', id: String(r.series_id), slug: null, title: r.series_name || String(r.series_id), cover: null, url: `https://www.mangaupdates.com/series/${Number(r.series_id).toString(36)}`, votes: Number(r.weight) || 1 }));
      return { status, latestChapter: parseChapterNumber(rec?.latest_chapter), statusText: rec?.status || null, cover: rec?.image?.url?.original || null, recommendations };
    } catch {
      return { status: null, latestChapter: null };
    }
  },

  async firstChapterUrl(ref) {
    return ref.url; // MangaUpdates lists releases, not pages; the series page links to the groups
  },
};

export const providers = { comick, mangaupdates };

export function providerOrder(settings) {
  const order = settings?.providerOrder === 'mangaupdates' ? ['mangaupdates', 'comick'] : ['comick', 'mangaupdates'];
  return order.map((n) => providers[n]);
}
