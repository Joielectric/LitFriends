import { authorize, unauthorized } from "./_auth.js";

// Reading a creator's script list from ScriptBin.
//
//   POST /api/scriptbin { handle: "cuddle_with_me" } -> { works: [...] }
//
// The browser cannot fetch scriptbin.works directly — it is another origin and
// sends no CORS headers — so the request is made here and the result handed
// back already shaped like catalogue entries.
//
// This reads a public profile page's own JSON, which is not a documented API.
// It can change shape or vanish without warning, so every field is treated as
// missing until proven otherwise and a failure says so rather than throwing.
//
// Admin-only: it is an editor's tool, and it keeps this site from being used
// to hammer someone else's.

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

const SOURCE = "https://scriptbin.works/u/";

// Their handles are lowercase words and underscores; anything else is not a
// handle and must not be pasted into a URL.
export const cleanHandle = (v) =>
  String(v == null ? "" : v).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 60);

/**
 * One ScriptBin work as a catalogue entry.
 *
 * Title and tags arrive as a single string — "Worshipped [lipstick] [bikini]" —
 * which is the same convention the Reddit titles use, so the split is reliable:
 * everything before the first bracket is the title, every bracketed run is a tag.
 */
export function normalizeWork(raw) {
  if (!raw || typeof raw !== "object") return null;
  const meta = raw.metadata || {};

  // An unlisted script is not ours to publish.
  if (meta.publicListed === false) return null;

  const titleAndTags = String(raw.titleAndTags || "");
  const title = titleAndTags.split("[")[0].trim() || String(raw.slug || "").trim();
  if (!title) return null;

  const tags = (titleAndTags.match(/\[([^\]]+)\]/g) || [])
    .map((t) => t.slice(1, -1).trim())
    .filter(Boolean);

  const audience = String(meta.audienceShort || "").trim().toUpperCase();
  if (audience && !tags.some((t) => t.toUpperCase() === audience)) tags.unshift(audience);

  const link = String(raw.link || "").trim();
  const stats = meta.textStats || {};

  return {
    // What the catalogue needs
    title,
    type: "script",
    tags,
    shortDesc: String(meta.shortDescription || "").trim(),
    links: link ? [{ provider: "scriptbin", url: link, kind: "script" }] : [],
    words: Number(stats.wordCount) || 0,

    // Nothing in the feed carries a date, so the entry starts without one
    // rather than being stamped with today and looking published now.
    date: "",

    // How we recognise this same work next time.
    source: "scriptbin",
    sourceId: `${String(raw.username || "").trim()}/${String(raw.slug || "").trim()}`,
    sourceLink: link,

    // Kept for the person reviewing, not shown anywhere.
    sensitive: meta.markedAsSensitive === true,
    otherLink: String(meta.otherLink || "").trim(),
  };
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...CORS, "Access-Control-Allow-Headers": "content-type,authorization", "Access-Control-Allow-Methods": "POST,OPTIONS" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const auth = await authorize(req, body);
  if (!auth.ok) return json(unauthorized(auth), 401);

  const handle = cleanHandle(body.handle);
  if (!handle) return json({ error: "Which ScriptBin username?" }, 400);

  let raw;
  try {
    const res = await fetch(`${SOURCE}${encodeURIComponent(handle)}.json`, {
      headers: { accept: "application/json", "user-agent": "joielectric.com catalogue import" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) {
      return json({ error: `ScriptBin has no user called "${handle}".` }, 404);
    }
    if (!res.ok) {
      return json({ error: `ScriptBin answered ${res.status}. Try again later.` }, 502);
    }
    raw = await res.json();
  } catch (err) {
    // Their site being slow or changed must not look like a bug in ours.
    return json({ error: `Could not reach ScriptBin: ${err.message}` }, 502);
  }

  if (!Array.isArray(raw)) {
    return json({ error: "ScriptBin returned something unexpected. The format may have changed." }, 502);
  }

  const works = raw.map(normalizeWork).filter(Boolean);
  return json({ ok: true, handle, works, total: raw.length });
};

export const config = { path: "/api/scriptbin" };
