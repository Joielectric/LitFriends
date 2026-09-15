// Reading an author's works from Literotica.
//
// Each author has three public works pages, one each for audio, stories and
// poetry, and the list on each arrives already in the page. Literotica asks
// AI crawlers to stay away and keeps its API off limits to everyone, so this
// reads only those public pages a visitor would open, and only when an editor
// asks for their own username. It is not a documented interface: the markup
// can change without warning, so every field is treated as missing until
// found, and a failure says so rather than throwing.
//
// A work on the page is an <article> card holding a title link, a one line
// description, a category link, a <time> and its statistics. A series is a
// header with its own title link, followed by the cards of its parts, which
// carry a "part card" class that works standing alone do not.

const UA = "joielectric.com catalogue import";
const BASE = "https://www.literotica.com";

export const KINDS = ["audio", "stories", "poetry"];

export class LiteroticaError extends Error {}

// Usernames are letters, digits, underscores, dots and hyphens. People also
// paste the address of their author page, so that is unwrapped first.
export const cleanHandle = (v) =>
  String(v == null ? "" : v)
    .trim()
    .replace(/^https?:\/\/[^/]*literotica\.com\/authors\//i, "")
    .replace(/^@/, "")
    .split(/[/?#\s]/)[0]
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, 60);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeHtml(s) {
  return String(s == null ? "" : s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    try { return String.fromCodePoint(n); } catch { return m; }
  });
}

const text = (html) => decodeHtml(String(html || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const absolute = (href) => (/^https?:\/\//i.test(href) ? href : BASE + (href.startsWith("/") ? "" : "/") + href);

// Audience codes like M4F, MF4A or TF4M, which authors put in titles and
// descriptions in brackets or parentheses.
const AUDIENCE = /\b[MFATNB]{1,3}4[MFATNB]{1,3}\b/gi;
const AUDIENCE_WRAPPED = /\s*[[(]\s*[MFATNB]{1,3}4[MFATNB]{1,3}\s*[\])]\s*/gi;

const TITLE_LINK = /<a\s[^>]*?href="([^"]+)"[^>]*?class="_title_link_[^"]*"[^>]*>([\s\S]*?)<\/a>/;

function stat(body, name) {
  const m = body.match(new RegExp(`data-value="([^"]*)"[^>]*title="${name}"`));
  return m ? m[1] : "";
}

/** The works on one works page, shaped for the catalogue. */
export function parseWorks(html, kind) {
  const src = String(html || "");
  const headers = [...src.matchAll(new RegExp(TITLE_LINK.source, "g"))]
    .filter((m) => /\/series\/se\//.test(m[1]))
    .map((m) => ({ at: m.index, url: absolute(m[1]), title: text(m[2]) }));
  const partsSoFar = new Map();
  const seen = new Set();
  const works = [];

  for (const card of src.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)) {
    const attrs = card[1];
    const body = card[2];
    const link = body.match(TITLE_LINK);
    if (!link) continue;
    const url = absolute(link[1]);
    if (!/^https:\/\/www\.literotica\.com\/[spi]\//.test(url) || seen.has(url)) continue;
    seen.add(url);

    const rawTitle = text(link[2]);
    const rawDesc = text((body.match(/<p[^>]*class="_description_[^"]*"[^>]*>([\s\S]*?)<\/p>/) || [])[1]);
    const category = text((body.match(/<a[^>]*class="_category_[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const date = (body.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/) || [])[1] || "";

    // A part card (but not a lone "last" card) belongs to the series whose
    // header came before it.
    let series = "";
    let part = 0;
    if (/\b_part_card_(?!last_)/.test(attrs)) {
      const header = headers.filter((h) => h.at < card.index).pop();
      if (header) {
        series = header.title;
        part = (partsSoFar.get(header.url) || 0) + 1;
        partsSoFar.set(header.url, part);
      }
    }

    const title = rawTitle.replace(AUDIENCE_WRAPPED, " ").replace(/\s+/g, " ").trim() || rawTitle;
    let shortDesc = rawDesc.replace(AUDIENCE_WRAPPED, " ").replace(/\s+/g, " ").trim();
    if (shortDesc.toLowerCase() === title.toLowerCase()) shortDesc = "";

    const audience = [...new Set(`${rawTitle} ${rawDesc}`.match(AUDIENCE) || [])].map((t) => t.toUpperCase());
    const tags = [...audience];
    // "Audio" says nothing an audio entry does not already say.
    if (category && !/^audio$/i.test(category)) tags.push(category);
    if (series) tags.push(series);

    const type = kind === "poetry" ? "poem" : kind === "audio" ? "audio" : /\bscript\b/i.test(`${rawTitle} ${rawDesc} ${category}`) ? "script" : "story";
    const rating = stat(body, "Rating");
    const views = stat(body, "Views");

    works.push({
      title,
      type,
      tags,
      shortDesc,
      desc: "",
      date,
      links: [type === "audio" ? { provider: "literotica", url } : { provider: "literotica", url, kind: "script" }],
      source: "literotica",
      sourceId: "literotica" + url.replace(BASE, ""),
      sourceLink: url,
      kind,
      // Shown while reviewing, not saved.
      info: [series ? `part ${part} of ${series}` : "", category, rating ? `rated ${rating}` : "", views ? `${views} views` : ""]
        .filter(Boolean).join(", "),
    });
  }
  return works;
}

/**
 * How many works of each kind the author's page tabs say there are. The other
 * kinds are links holding their count; the kind being shown is not a link,
 * just a counter inside the active tab, so it is read from there.
 */
export function parseCounts(html, kind) {
  const src = String(html || "");
  const counts = {};
  const re = /href="\/authors\/[^"/]+\/works\/(stories|poetry|audio)"[^>]*class="_tabs_link[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of src.matchAll(re)) {
    const n = text(m[2]).match(/\d[\d,]*/);
    if (n && counts[m[1]] === undefined) counts[m[1]] = Number(n[0].replace(/,/g, ""));
  }
  const active = src.match(/class="_tabs_item__active_[^"]*"[^>]*>\s*<[a-z]+[^>]*class="_tab_counter_[^"]*"[^>]*>\s*(\d[\d,]*)/);
  if (kind && active) counts[kind] = Number(active[1].replace(/,/g, ""));
  return counts;
}

async function getPage(url) {
  let res;
  try {
    res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw new LiteroticaError(`Could not reach Literotica: ${err.message}`);
  }
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    throw new LiteroticaError(`Literotica refused the request (${res.status}). It may be limiting automated reading; try again later.`);
  }
  if (!res.ok) throw new LiteroticaError(`Literotica answered ${res.status}. Try again later.`);
  return res.text();
}

/**
 * Every work of the asked for kinds, or null when Literotica has no such
 * author. A long list may run over more than one page; pages are read until
 * the count on the tab is reached, a page adds nothing new, or ten pages.
 */
export async function fromLiterotica(handle, kinds) {
  const works = [];
  const counts = {};
  const seen = new Set();
  let exists = false;

  for (const kind of kinds) {
    const base = `${BASE}/authors/${encodeURIComponent(handle)}/works/${kind}`;
    let read = 0;
    for (let page = 1; page <= 10; page++) {
      const html = await getPage(page === 1 ? base : `${base}?page=${page}`);
      if (html === null) break;
      exists = true;
      if (page === 1) {
        const tabs = parseCounts(html, kind);
        if (tabs[kind] !== undefined) counts[kind] = tabs[kind];
      }
      const fresh = parseWorks(html, kind).filter((w) => !seen.has(w.sourceLink));
      fresh.forEach((w) => { seen.add(w.sourceLink); works.push(w); });
      read += fresh.length;
      if (!fresh.length || !(counts[kind] > read)) break;
    }
    if (counts[kind] === undefined && exists) counts[kind] = read;
  }

  if (!exists) return null;
  // Kinds the tabs count higher than what could be read.
  const partial = kinds
    .map((kind) => ({ kind, listed: counts[kind] || 0, read: works.filter((w) => w.kind === kind).length }))
    .filter((p) => p.listed > p.read);
  return { works, counts, partial };
}
