import { siteStore, readJsonWithLegacy } from "./_site.js";
import { authorize, unauthorized, OWNER_SLUG } from "./_auth.js";

// Saving the catalogue is a whole-array replace, which was fine while one
// person had the password. With several creators sharing the store it is not:
// a stale tab, a truncated payload or a malicious one would delete everyone
// else's work.
//
// So a save is merged rather than trusted. Entries the caller may not edit are
// taken from what is stored, whatever the request said about them — the client
// cannot delete or alter them by sending a shorter list or a changed copy.
//
// An entry belongs to whoever created it. Entries that predate this carry no
// owner and are the site owner's: they are the original catalogue. Being
// credited on an entry is not the same as owning it — a collaborator sees the
// work they are on but does not get to rewrite someone else's record of it.

function canEdit(storedEntry, auth) {
  if (auth.isOwner) return true;
  if (!storedEntry) return true;          // creating something new
  if (!storedEntry.owner) return false;   // the original catalogue
  return storedEntry.owner === auth.slug;
}

// What identifies an entry as being the same imported work: the id it came in
// with, and the link it points at. Both are kept because a source can change
// one — a retitle on ScriptBin moves the URL — and either match is enough.
function sourceKeys(entry) {
  const keys = [];
  if (entry.sourceId) keys.push(`id:${String(entry.sourceId).trim().toLowerCase()}`);
  const link = entry.sourceLink || (entry.links && entry.links[0] && entry.links[0].url);
  if (link) keys.push(`url:${String(link).trim().toLowerCase()}`);
  return keys;
}

// The shape of a profile slug, which is all an owner field may hold.
const OWNER_FIELD = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function mergeEntries(incoming, stored, auth) {
  const byId = new Map(stored.map((e) => [e.id, e]));
  const mine = auth.isOwner ? OWNER_SLUG : auth.slug;

  // Imported work already here, whoever imported it. The client checks this
  // too, but only against what it happens to have loaded — two tabs, two
  // people, or one impatient double-click all get past that.
  const known = new Set();
  stored.forEach((e) => { if (e.source) sourceKeys(e).forEach((k) => known.add(k)); });

  const accepted = [];
  const skipped = [];
  for (const entry of incoming) {
    const prior = byId.get(entry.id);
    if (!canEdit(prior, auth)) continue;  // silently keep the stored copy

    if (!prior && entry.source) {
      const keys = sourceKeys(entry);
      if (keys.some((k) => known.has(k))) { skipped.push(entry.title || entry.id); continue; }
      keys.forEach((k) => known.add(k));   // and not twice within one request
    }

    // The site owner may hand an entry to another creator, which is how work
    // imported under the wrong name reaches the right one. Nobody else can
    // move anything, so for them the stored owner always wins.
    const handedTo = auth.isOwner && typeof entry.owner === "string" && OWNER_FIELD.test(entry.owner) ? entry.owner : "";
    accepted.push({ ...entry, owner: handedTo || (prior && prior.owner) || mine });
  }

  // Anything the caller could not have edited survives untouched, including
  // entries they never received. Their own entries are theirs to delete, so an
  // omission is honoured for those and only those.
  const preserved = stored.filter((e) => !canEdit(e, auth));
  const keptIds = new Set(accepted.map((e) => e.id));
  return { entries: [...accepted, ...preserved.filter((e) => !keptIds.has(e.id))], skipped };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  const store = siteStore("content");

  // Public read
  if (req.method === "GET") {
    const { data } = await readJsonWithLegacy("content", "audio");
    return new Response(JSON.stringify(data || { entries: [] }), { status: 200, headers: CORS });
  }

  // Password-protected actions
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS });
    }

    const { action, entries } = body;

    const auth = await authorize(req, body);
    if (!auth.ok) {
      return new Response(JSON.stringify(unauthorized(auth)), { status: 401, headers: CORS });
    }

    // Verify-only — confirms password and returns current entries
    if (action === "verify") {
      const { data } = await readJsonWithLegacy("content", "audio");
      // who is asking, so the client can show owner-only controls
      const who = {
        email: auth.email, isOwner: !!auth.isOwner, via: auth.via,
        role: auth.role || (auth.isOwner ? "owner" : "creator"),
        slug: auth.slug || "",
      };
      return new Response(JSON.stringify({ ok: true, who, ...(data || { entries: [] }) }), { status: 200, headers: CORS });
    }

    if (!Array.isArray(entries)) {
      return new Response(JSON.stringify({ error: "entries must be an array" }), { status: 400, headers: CORS });
    }

    const { data: existing } = await readJsonWithLegacy("content", "audio");
    const stored = (existing && existing.entries) || [];

    const { entries: merged, skipped } = mergeEntries(entries, stored, auth);

    // The shared lists — collaborators, news, platforms — belong to the site,
    // not to any one creator, so only the owner may change them. Everyone
    // else's save carries them along unchanged.
    const keepOwn = (list, current) =>
      auth.isOwner && Array.isArray(list) ? list : current || [];

    const collaborators = keepOwn(body.collaborators, existing && existing.collaborators);
    const news = keepOwn(body.news, existing && existing.news);
    const providers = keepOwn(body.providers, existing && existing.providers);

    await store.setJSON("audio", { entries: merged, collaborators, news, providers });
    return new Response(JSON.stringify({ ok: true, entries: merged, skipped }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
};

export const config = { path: "/api/content" };
