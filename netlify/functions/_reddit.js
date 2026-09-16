// Reading a creator's audio history from the places that still have it.
//
// Reddit refuses requests that are not signed in, so the posts come from a
// public index of it, and the audio itself from the hosts:
//
//   GWASI (gwasi.com) indexes the audio subreddits up to the last day, but
//   keeps only a post's title, flair, date, length and a few mentions.
//   Soundgasm and HotAudio list what a user has up now, with the link and
//   the description.
//
// PullPush also mirrors Reddit, with whole posts, but refuses automated use
// unless paid for, so it is deliberately not used here.
//
// None of these is a documented API. Every field is treated as missing until
// proven otherwise, and a failure names the source that failed.

const UA = "joielectric.com catalogue import";

export class SourceError extends Error {}

async function get(url, { ms = 15000, redirect = "follow" } = {}) {
  const host = new URL(url).hostname;
  try {
    return await fetch(url, { headers: { "user-agent": UA, accept: "*/*" }, redirect, signal: AbortSignal.timeout(ms) });
  } catch (err) {
    throw new SourceError(`Could not reach ${host}: ${err.message}`);
  }
}

// Usernames are letters, digits, underscores and hyphens. Anything else is not
// a username and must not be pasted into a URL.
export const cleanHandle = (v) =>
  String(v == null ? "" : v).trim().replace(/^\/?u\//i, "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeHtml(s) {
  return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(n); } catch { return m; }
  });
}

// Markup to plain text, keeping line breaks and the address behind a link.
function htmlToText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<\/?br\s*\/?>/gi, "\n")
      .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
        const label = inner.replace(/<[^>]+>/g, "").trim();
        return label && label !== href ? `${label} (${href})` : href;
      })
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── GWASI ────────────────────────────────────────────────────────────────────

// Each GWASI post is a row:
//   [id, subreddit, author, flair, title, created, score, length, extra]
// where length is tenths of a minute for an audio and minus hundreds of words
// for a script, and extra is text from the post body GWASI kept, mostly
// u/ mentions and tags that did not fit the title.
function toPost(r) {
  return {
    id: String(r[0] || ""),
    subreddit: String(r[1] || ""),
    author: String(r[2] || ""),
    flair: String(r[3] || ""),
    title: String(r[4] || ""),
    created: Number(r[5]) || 0,
    score: Number(r[6]) || 0,
    length: Number(r[7]) || 0,
    extra: String(r[8] || ""),
  };
}

// The row that starts at `start`, found by walking brackets outside strings.
function rowAt(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * One author's rows out of GWASI's whole index. The index is tens of
 * megabytes, so rather than parse all of it, find the rows whose third field
 * is this author and parse only those.
 */
export function scanGwasiRows(text, handle) {
  const who = handle.replace(/[^A-Za-z0-9_-]/g, "");
  if (!who) return [];
  const re = new RegExp(`\\["[a-z0-9]+","[^"\\\\]*","${who}",`, "gi");
  const posts = [];
  for (const m of text.matchAll(re)) {
    const row = rowAt(text, m.index);
    if (!row) continue;
    try {
      const r = JSON.parse(row);
      if (Array.isArray(r) && r.length >= 5) posts.push(toPost(r));
    } catch {
      // A row that does not parse is skipped rather than failing the rest.
    }
  }
  return posts;
}

export async function fromGwasi(handle) {
  const deltaRes = await get("https://gwasi.com/delta.json");
  if (!deltaRes.ok) throw new SourceError(`GWASI answered ${deltaRes.status}. Try again later.`);
  let delta;
  try {
    delta = await deltaRes.json();
  } catch {
    delta = null;
  }
  if (!delta || typeof delta.base !== "string" || !/^[a-z0-9]+$/i.test(delta.base)) {
    throw new SourceError("GWASI returned something unexpected. The format may have changed.");
  }
  const res = await get(`https://gwasi.com/base_${delta.base}.json`, { ms: 25000 });
  if (!res.ok) throw new SourceError(`GWASI answered ${res.status}. Try again later.`);
  const text = await res.text();

  const byId = new Map();
  scanGwasiRows(text, handle).forEach((p) => byId.set(p.id, p));
  // The day's newest posts are only in the delta.
  (Array.isArray(delta.entries) ? delta.entries : []).forEach((r) => {
    if (Array.isArray(r) && String(r[2]).toLowerCase() === handle.toLowerCase()) {
      const p = toPost(r);
      byId.set(p.id, p);
    }
  });
  // Posts taken down since the index was built.
  const removed = new Set(Array.isArray(delta.removed) ? delta.removed : []);
  return [...byId.values()].filter((p) => !removed.has(p.id));
}

// ── Script offers ────────────────────────────────────────────────────────────
// Scripts people have offered for anyone to fill. GWASI keeps no post body, so
// what can be searched is the title and the tags in it, who wrote it, when it
// went up, how long it is, and whether anyone has filled it yet. The ScriptBin
// link an offer carries is in the post, which is why every result links there.
//
// Searching reads the whole index rather than one author's rows, which is far
// too heavy to do per search, so the offers are kept for half an hour and
// every search in that time is answered from them.

const OFFER_TTL = 30 * 60 * 1000;
let offerCache = { base: "", at: 0, offers: [] };

/** The offers among a set of index rows, with how many fills each one has. */
export function extractOffers(entries, fills, removed) {
  const gone = removed instanceof Set ? removed : new Set(removed || []);
  const out = [];
  (entries || []).forEach((r) => {
    if (!Array.isArray(r) || r.length < 6) return;
    const id = String(r[0] || "");
    if (!id || gone.has(id)) return;
    const flair = String(r[3] || "");
    const title = String(r[4] || "");
    // An offer says so in its flair or in one of its tags.
    if (!/offer/i.test(flair) && !/\[[^\]]*offer[^\]]*\]/i.test(title)) return;
    const length = Number(r[7]) || 0;
    out.push({
      id,
      subreddit: String(r[1] || ""),
      author: String(r[2] || ""),
      flair,
      title,
      created: Number(r[5]) || 0,
      score: Number(r[6]) || 0,
      // A script's length is kept as minus hundreds of words.
      words: length < 0 ? Math.round(-length * 100) : 0,
      fills: ((fills || {})[id] || []).length,
      url: `https://www.reddit.com/r/${String(r[1] || "gonewildaudio")}/comments/${id}/`,
    });
  });
  return out;
}

/** The offers matching a search, newest first. */
export function searchOffers(offers, query) {
  const q = query || {};
  const words = String(q.text || "").toLowerCase().split(/\s+/).filter(Boolean);
  const audience = String(q.audience || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const writer = String(q.writer || "").trim().replace(/^\/?u\//i, "").toLowerCase();
  const since = Number(q.days) > 0 ? Date.now() / 1000 - Number(q.days) * 86400 : 0;
  const min = Number(q.minWords) || 0;
  const max = Number(q.maxWords) || 0;
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 300);

  const hits = (offers || []).filter((o) => {
    if (since && o.created < since) return false;
    if (q.unfilled && o.fills) return false;
    if (writer && o.author.toLowerCase() !== writer) return false;
    if (audience && !new RegExp(`\\[\\s*${audience}\\s*\\]`, "i").test(o.title)) return false;
    // A script with no length known is not ruled out by a length.
    if (min && o.words && o.words < min) return false;
    if (max && o.words && o.words > max) return false;
    if (words.length) {
      const hay = `${o.title} ${o.author} ${o.subreddit} ${o.flair}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  hits.sort((a, b) => b.created - a.created);
  return { total: hits.length, offers: hits.slice(0, limit) };
}

async function loadOffers() {
  const deltaRes = await get("https://gwasi.com/delta.json");
  if (!deltaRes.ok) throw new SourceError(`GWASI answered ${deltaRes.status}. Try again later.`);
  let delta;
  try {
    delta = await deltaRes.json();
  } catch {
    delta = null;
  }
  if (!delta || typeof delta.base !== "string" || !/^[a-z0-9]+$/i.test(delta.base)) {
    throw new SourceError("GWASI returned something unexpected. The format may have changed.");
  }
  if (offerCache.base === delta.base && Date.now() - offerCache.at < OFFER_TTL) return offerCache.offers;

  const res = await get(`https://gwasi.com/base_${delta.base}.json`, { ms: 25000 });
  if (!res.ok) throw new SourceError(`GWASI answered ${res.status}. Try again later.`);
  let index;
  try {
    index = JSON.parse(await res.text());
  } catch {
    throw new SourceError("GWASI returned something unexpected. The format may have changed.");
  }
  const removed = new Set(Array.isArray(delta.removed) ? delta.removed : []);
  const fills = { ...(index.fills || {}), ...(delta.fills || {}) };
  const offers = extractOffers(index.entries, fills, removed)
    .concat(extractOffers(delta.entries, fills, removed));
  // The newest day's rows repeat some of the index's.
  const byId = new Map(offers.map((o) => [o.id, o]));
  offerCache = { base: delta.base, at: Date.now(), offers: [...byId.values()] };
  return offerCache.offers;
}

export async function fromOffers(query) {
  return searchOffers(await loadOffers(), query);
}

// ── Hosts ────────────────────────────────────────────────────────────────────

export function parseSoundgasmList(html) {
  const items = [];
  const re = /<div class="sound-details">\s*<a href="(https:\/\/soundgasm\.net\/u\/[^"]+)">([\s\S]*?)<\/a>([\s\S]*?)<\/div>/g;
  for (const m of String(html || "").matchAll(re)) {
    const desc = m[3].match(/<span class="soundDescription">([\s\S]*?)<\/span>/);
    items.push({ url: m[1], title: htmlToText(m[2]), desc: desc ? htmlToText(desc[1]) : "" });
  }
  return items;
}

export async function fromSoundgasm(handle) {
  const res = await get(`https://soundgasm.net/u/${encodeURIComponent(handle)}`, { redirect: "manual" });
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) return [];
  if (!res.ok) throw new SourceError(`Soundgasm answered ${res.status}. Try again later.`);
  return parseSoundgasmList(await res.text());
}

export function parseHotAudioList(html, handle) {
  const seen = new Map();
  const who = handle.replace(/[^A-Za-z0-9_-]/g, "");
  const re = new RegExp(`<a href="(/u/${who}/[^"/?#]+)"[^>]*>([^<]+)</a>`, "gi");
  for (const m of String(html || "").matchAll(re)) {
    if (!seen.has(m[1])) seen.set(m[1], { url: `https://hotaudio.net${m[1]}`, title: decodeHtml(m[2]).trim(), desc: "" });
  }
  return [...seen.values()];
}

export function parseOgDescription(html) {
  const m = String(html || "").match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
  return m ? decodeHtml(m[1]).trim() : "";
}

// HotAudio's list has no descriptions, so each audio's own page is read for
// one, a few at a time. A page that fails just leaves that description empty.
export async function fromHotAudio(handle, { limit = 60, parallel = 4 } = {}) {
  const res = await get(`https://hotaudio.net/u/${encodeURIComponent(handle)}`, { redirect: "manual" });
  if (res.status === 404 || (res.status >= 300 && res.status < 400)) return [];
  if (!res.ok) throw new SourceError(`HotAudio answered ${res.status}. Try again later.`);
  const items = parseHotAudioList(await res.text(), handle);

  const queue = items.slice(0, limit);
  await Promise.all(Array.from({ length: parallel }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const page = await get(item.url, { ms: 8000 });
        if (page.ok) item.desc = parseOgDescription(await page.text());
      } catch {
        // Keep the audio without a description.
      }
    }
  }));
  return items;
}
