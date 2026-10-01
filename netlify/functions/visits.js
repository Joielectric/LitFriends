import { siteStore } from "./_site.js";
import { authorize, unauthorized } from "./_auth.js";
import { cookieFromRequest, readSession } from "./_session.js";

// Who visits, and what they do while they are here.
//
//   POST /api/visits { v, s, events: [...] }         -> record (from js/track.js)
//   POST /api/visits { action: "stats", days }       -> the Visitors tab
//
// Nothing here identifies a person. A visitor is a random id their browser
// made up and kept; there is no IP address, no full user agent and no cookie
// of ours. Location is the country and region Netlify already worked out at
// the edge, and the device is reduced to "Mobile · Safari · iOS" before it is
// stored.
//
// Storage is two kinds of key in the "visits" store:
//
//   r/<day>/<time>-<rand>   one per request: the batch of events it carried
//   d/<day>                 a finished day, all its events in one blob
//
// Every request writes its own key, so two visitors at once can never
// overwrite each other the way a shared read-modify-write blob would. Reading
// a day back means fetching each of those keys, which is slow, so once a day
// is over the first stats request folds it into one d/<day> blob and clears
// the r/ keys. A day still in progress is always read from its r/ keys.
// Days are UTC.

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

const MAX_BODY = 16000;     // a batch is a few hundred bytes; anything big is not ours
const MAX_EVENTS = 40;      // per request
const MAX_DAYS = 90;        // the longest range the tab offers
const RECENT_SESSIONS = 60; // visits listed one by one
const TOP = 15;             // rows per table

const TYPES = new Set(["view", "open", "play", "complete", "outbound", "download", "search", "leave"]);

// Crawlers, link previews and uptime checkers are not visitors.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|skype|headless|phantom|lighthouse|pingdom|uptime|monitor|curl|wget|python|go-http|node-fetch|axios|java\//i;

const str = (v, n) => (v == null ? "" : String(v).slice(0, n));
const norm = (v) => str(v, 120).trim().toLowerCase().replace(/\s+/g, " ");
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// ── Device, coarsely ────────────────────────────────────────────────────────
function device(ua) {
  const dev = /ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)
    ? "Tablet"
    : /mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua) ? "Mobile" : "Desktop";
  const br =
    /edg\//i.test(ua) ? "Edge" :
    /opr\/|opera/i.test(ua) ? "Opera" :
    /samsungbrowser/i.test(ua) ? "Samsung Internet" :
    /firefox|fxios/i.test(ua) ? "Firefox" :
    /chrome|crios|chromium/i.test(ua) ? "Chrome" :
    /safari/i.test(ua) ? "Safari" : "Other";
  const os =
    /iphone|ipad|ipod/i.test(ua) ? "iOS" :
    /android/i.test(ua) ? "Android" :
    /windows/i.test(ua) ? "Windows" :
    /mac os x|macintosh/i.test(ua) ? "macOS" :
    /cros/i.test(ua) ? "ChromeOS" :
    /linux/i.test(ua) ? "Linux" : "Other";
  return { dev, br, os };
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// One event from the page, cut down to the fields it is allowed to carry.
function cleanEvent(e, now) {
  if (!e || !TYPES.has(e.t)) return null;
  const out = { t: e.t, ts: now, p: str(e.p, 200) };
  if (e.title) out.title = str(e.title, 200);
  if (Array.isArray(e.art)) out.art = e.art.slice(0, 12).map(norm).filter(Boolean);
  if (e.t === "view") {
    const ref = hostOf(e.ref);
    if (ref) out.ref = ref;
    if (e.utm) out.utm = norm(e.utm).slice(0, 60);
  }
  if (e.t === "outbound" || e.t === "download") {
    out.url = str(e.url, 300);
    out.host = hostOf(e.url) || str(e.url, 60);
    if (e.label) out.label = str(e.label, 80);
  }
  if (e.t === "search") out.q = norm(e.q).slice(0, 80);
  if (e.t === "leave") out.dur = Math.max(0, Math.min(6 * 3600, Math.round(Number(e.dur) || 0)));
  return out;
}

// ── Recording ───────────────────────────────────────────────────────────────
async function record(req, context) {
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return json({ ok: true });

  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return json({ ok: true });

  // The site's own people browsing it would drown out everyone else.
  if (await readSession(cookieFromRequest(req)).catch(() => "")) return json({ ok: true, skipped: "signed in" });

  const v = str(body.v, 40).replace(/[^a-z0-9]/gi, "");
  const s = str(body.s, 40).replace(/[^a-z0-9]/gi, "");
  if (!v || !s) return json({ error: "Missing visitor" }, 400);

  const now = Date.now();
  const events = (Array.isArray(body.events) ? body.events : [])
    .slice(0, MAX_EVENTS)
    .map((e) => cleanEvent(e, now))
    .filter(Boolean);
  if (!events.length) return json({ ok: true });

  const geo = (context && context.geo) || {};
  const batch = {
    v, s, ts: now,
    c: str(geo.country && geo.country.name, 60),
    cc: str(geo.country && geo.country.code, 4),
    r: str(geo.subdivision && geo.subdivision.name, 60),
    city: str(geo.city, 60),
    ...device(ua),
    events,
  };

  const key = `r/${dayOf(now)}/${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await siteStore("visits").setJSON(key, batch);
  return json({ ok: true });
}

// ── Reading back ────────────────────────────────────────────────────────────
// Run fn over items, a few at a time, so a busy day does not open hundreds of
// connections at once.
async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function listKeys(store, prefix) {
  const keys = [];
  // paginate:true hands back an async iterator of pages, so a busy day is not
  // cut off at the first thousand keys.
  for await (const page of store.list({ prefix, paginate: true })) {
    (page.blobs || []).forEach((b) => keys.push(b.key));
  }
  return keys;
}

// Every batch recorded on one day, folding finished days into one blob.
async function readDay(store, day, today) {
  const [folded, rawKeys] = await Promise.all([
    store.get(`d/${day}`, { type: "json" }).catch(() => null),
    listKeys(store, `r/${day}/`).catch(() => []),
  ]);
  const batches = (folded && folded.batches) || [];
  if (!rawKeys.length) return batches;

  const loose = (await pool(rawKeys, 12, (k) => store.get(k, { type: "json" }).catch(() => null))).filter(Boolean);
  const all = batches.concat(loose);

  if (day < today) {
    // Fold it. If either step fails the r/ keys are still there and the next
    // request tries again; nothing is deleted until the fold is written.
    try {
      await store.setJSON(`d/${day}`, { batches: all });
      await pool(rawKeys, 12, (k) => store.delete(k).catch(() => null));
    } catch { /* read it from the r/ keys again next time */ }
  }
  return all;
}

// The names a creator's work is credited under, for scoping their view.
async function namesFor(slug) {
  const names = new Set([norm(slug)]);
  try {
    const data = await siteStore("profiles").get("profiles", { type: "json" });
    const p = data && data.profiles && data.profiles[slug];
    if (p) {
      if (p.name) names.add(norm(p.name));
      (p.aliases || []).forEach((a) => names.add(norm(a)));
    }
  } catch { /* the slug alone still matches */ }
  return names;
}

// Whose is this event? A creator's page, or a work they are credited on.
function belongsTo(e, slug, names) {
  const m = /^\/profiles?\/([^/]+)/.exec(e.p || "");
  if (m && m[1].toLowerCase() === slug) return true;
  return (e.art || []).some((a) => names.has(a));
}

function tally(map, key, n = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + n);
}
const top = (map, n = TOP) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ k, c }));

function pageLabel(p) {
  if (!p || p === "/" || p === "/index") return "Home";
  return p;
}

function summarise(batches, days, fromDay, scope) {
  // Flatten into events carrying their visit's facts.
  const events = [];
  for (const b of batches) {
    for (const e of b.events || []) {
      if (scope && !belongsTo(e, scope.slug, scope.names)) continue;
      events.push({ ...e, ts: e.ts || b.ts, v: b.v, s: b.s, c: b.c, cc: b.cc, r: b.r, city: b.city, dev: b.dev, br: b.br, os: b.os });
    }
  }
  events.sort((a, b) => a.ts - b.ts);

  const visitors = new Set();
  const sessions = new Map();
  const byDay = new Map(days.map((d) => [d, { day: d, visitors: new Set(), views: 0, plays: 0 }]));
  const pages = new Map(), refs = new Map(), countries = new Map(), devices = new Map(),
    browsers = new Map(), outbound = new Map(), searches = new Map();
  const works = new Map(); // title -> { opens, plays, completes }
  let views = 0, plays = 0, completes = 0;

  // A visitor is "returning" if their first event in range came after an
  // earlier visit (a different session id) also in range.
  const firstSession = new Map();

  for (const e of events) {
    visitors.add(e.v);
    if (!firstSession.has(e.v)) firstSession.set(e.v, e.s);

    let sess = sessions.get(e.s);
    if (!sess) {
      sess = {
        s: e.s, v: e.v, start: e.ts, end: e.ts, dur: 0,
        where: [e.city, e.r, e.c].filter(Boolean).join(", "), country: e.c || "Unknown", cc: e.cc || "",
        device: [e.dev, e.br, e.os].filter(Boolean).join(" · "),
        ref: "", steps: [],
      };
      sessions.set(e.s, sess);
    }
    sess.end = Math.max(sess.end, e.ts);

    const d = byDay.get(dayOf(e.ts));
    if (d) d.visitors.add(e.v);

    const work = e.title && (works.get(e.title) || works.set(e.title, { opens: 0, plays: 0, completes: 0 }).get(e.title));

    switch (e.t) {
      case "view":
        views++;
        if (d) d.views++;
        tally(pages, pageLabel(e.p));
        if (!sess.ref && !sess.steps.length && (e.ref || e.utm)) sess.ref = e.ref || e.utm;
        sess.steps.push({ t: "view", x: pageLabel(e.p) });
        break;
      case "open":
        if (work) work.opens++;
        sess.steps.push({ t: "open", x: e.title });
        break;
      case "play":
        plays++;
        if (d) d.plays++;
        if (work) work.plays++;
        sess.steps.push({ t: "play", x: e.title || pageLabel(e.p) });
        break;
      case "complete":
        completes++;
        if (work) work.completes++;
        sess.steps.push({ t: "complete", x: e.title || pageLabel(e.p) });
        break;
      case "outbound":
        tally(outbound, e.host);
        sess.steps.push({ t: "outbound", x: e.host + (e.title ? ` — ${e.title}` : "") });
        break;
      case "download":
        sess.steps.push({ t: "download", x: e.title || e.host });
        break;
      case "search":
        tally(searches, e.q);
        sess.steps.push({ t: "search", x: e.q });
        break;
      case "leave":
        sess.dur += e.dur || 0;
        break;
    }
  }

  for (const sess of sessions.values()) {
    // Where a visit came from is wherever its first page was reached from.
    tally(refs, sess.ref || "Direct / unknown");
    tally(countries, sess.country);
    const [dev, br] = sess.device.split(" · ");
    tally(devices, dev || "Unknown");
    tally(browsers, br || "Unknown");
    // Time on site: what the pages reported, or at least the span of events.
    if (!sess.dur) sess.dur = Math.round((sess.end - sess.start) / 1000);
  }

  let returning = 0;
  for (const sess of sessions.values()) if (firstSession.get(sess.v) !== sess.s) returning++;

  const durs = [...sessions.values()].map((x) => x.dur).filter((x) => x > 0);
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;

  const workRows = [...works.entries()]
    .map(([title, w]) => ({ title, ...w }))
    .sort((a, b) => (b.plays - a.plays) || (b.opens - a.opens))
    .slice(0, TOP);

  const recent = [...sessions.values()]
    .sort((a, b) => b.start - a.start)
    .slice(0, RECENT_SESSIONS)
    .map((x) => ({ ...x, steps: x.steps.slice(0, 40), returning: firstSession.get(x.v) !== x.s }));

  return {
    from: fromDay,
    totals: {
      visitors: visitors.size,
      visits: sessions.size,
      returningVisits: returning,
      views, plays, completes, avgDur,
    },
    daily: days.map((day) => {
      const x = byDay.get(day);
      return { day, visitors: x.visitors.size, views: x.views, plays: x.plays };
    }),
    pages: top(pages), referrers: top(refs), countries: top(countries),
    devices: top(devices), browsers: top(browsers), outbound: top(outbound),
    searches: top(searches), works: workRows, recent,
  };
}

async function stats(req, body) {
  const auth = await authorize(req, body);
  if (!auth.ok) return json(unauthorized(auth), 401);

  // The owner sees the whole site. A creator sees their own page and their
  // own work, which is the part of it that is theirs.
  let scope = null;
  if (!auth.isOwner) {
    if (!auth.slug) return json({ error: "Your account has no profile yet." }, 403);
    scope = { slug: auth.slug, names: await namesFor(auth.slug) };
  }

  const n = Math.max(1, Math.min(MAX_DAYS, Math.round(Number(body.days) || 30)));
  const now = Date.now();
  const today = dayOf(now);
  const days = Array.from({ length: n }, (_, i) => dayOf(now - (n - 1 - i) * 86400000));

  const store = siteStore("visits");
  const perDay = await pool(days, 6, (d) => readDay(store, d, today));
  const result = summarise(perDay.flat(), days, days[0], scope);
  return json({ ok: true, scope: scope ? auth.slug : "site", ...result });
}

export default async (req, context) => {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...CORS, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // The tracker sends text/plain (sendBeacon's default, and no preflight), so
  // peek at the body to tell a stats request from a batch.
  const text = await req.clone().text().catch(() => "");
  let body = null;
  try { body = JSON.parse(text); } catch { /* record() answers it */ }

  if (body && body.action === "stats") return stats(req, body);
  if (body && body.action) return json({ error: "Unknown action" }, 400);
  return record(req, context);
};

export const config = { path: "/api/visits" };
