import { siteStore, readJsonWithLegacy, readBlobWithLegacy, listWithLegacy, deleteEverywhere } from "./_site.js";
import { authorize, unauthorized, OWNER_SLUG } from "./_auth.js";

// Cover-image upload, listing and serving, backed by Netlify Blobs.
//
//   POST /api/upload  { password, filename, contentType, data } -> { url }
//   POST /api/upload  { action: "list", scope? }                -> { images, totalBytes, owners? }
//   POST /api/upload  { password, action: "delete", key }       -> { ok }
//   GET  /api/image/:key                                        -> the bytes
//
// Uploads and management need a signed-in creator, checked in _auth.js, same
// as /api/content. Reads are public — the catalogue has to show the covers.
//
// Every upload belongs to whoever made it, by profile slug, the same way a
// catalogue entry does. A creator lists and deletes only their own. Uploads
// that predate this carry no owner and are the site owner's, except that a
// creator still sees the old ones their own entries or profile use, so nothing
// they picked before disappears from their library.
//
// The site owner sees only their own by default too. `scope` widens it:
// "all" for everyone's, or a creator's slug for just theirs.

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

// Kept in step with the client-side resize in tools.html. The hard ceiling is
// Netlify's 6MB function request body; base64 inflates by ~33%, so anything
// approaching this has skipped the browser-side resize.
const MAX_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

// Sidecar index of what has been uploaded, so the manager can show names, sizes
// and dates without fetching metadata for every blob one at a time. The blobs
// themselves remain the source of truth; the index is reconciled against them
// on every list.
const INDEX_KEY = "__index.json";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const store = () => siteStore("images");

async function readIndex(s) {
  const idx = (await readJsonWithLegacy("images", INDEX_KEY)).data;
  return idx && Array.isArray(idx.images) ? idx.images : [];
}

// Drop index entries whose blob is gone and adopt any blob missing from the
// index, so a failed write or a manual deletion can never strand the list.
async function reconcileIndex(s) {
  const indexed = await readIndex(s);
  const listedKeys = await listWithLegacy("images");
  const real = new Set(listedKeys.filter(k => k !== INDEX_KEY));
  const kept = indexed.filter(i => real.has(i.key));
  const known = new Set(kept.map(i => i.key));

  const orphans = [...real]
    .filter(k => !known.has(k))
    .map(k => ({ key: k, url: `/api/image/${k}`, name: k, size: null, uploadedAt: null }));

  const images = [...kept, ...orphans].sort(
    (a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || ""))
  );
  return { images, changed: orphans.length > 0 || kept.length !== indexed.length };
}

// The slug an upload is filed under, matching content.js.
const slugOf = (auth) => (auth.isOwner ? OWNER_SLUG : auth.slug) || "";
const ownerOf = (img) => img.owner || OWNER_SLUG;

function isMine(img, auth) {
  const mine = slugOf(auth);
  if (mine && ownerOf(img) === mine) return true;
  // A creator not yet given a profile still owns what they upload.
  return !!img.uploadedBy && img.uploadedBy === auth.email;
}

// Old, unowned uploads a creator's own work points at. Read only for a
// creator's list; the owner already sees every unowned upload as theirs.
async function referencedBy(slug) {
  const urls = new Set();
  if (!slug) return urls;
  const add = (u) => { if (typeof u === "string" && u) urls.add(u); };

  const { data } = await readJsonWithLegacy("content", "audio").catch(() => ({ data: null }));
  const entries = Array.isArray(data) ? data : (data && Array.isArray(data.entries) ? data.entries : []);
  entries.filter((e) => e && e.owner === slug).forEach((e) => add(e.image));

  const profiles = await siteStore("profiles").get("profiles", { type: "json" }).catch(() => null);
  const p = profiles && profiles.profiles && profiles.profiles[slug];
  if (p) {
    [p.avatar, p.banner, p.shareImage].forEach(add);
    (Array.isArray(p.updates) ? p.updates : []).forEach((u) => add(u && u.image));
  }
  return urls;
}

const totalOf = (images) => images.reduce((n, i) => n + (Number(i.size) || 0), 0);

// What one caller is shown. `all` is the whole index; `scope` only counts for
// the site owner.
async function visibleTo(all, auth, scope) {
  if (auth.isOwner) {
    if (scope === "all") return all;
    const slug = scope && scope !== "mine" ? String(scope) : OWNER_SLUG;
    return all.filter((i) => ownerOf(i) === slug);
  }
  const used = await referencedBy(auth.slug);
  return all.filter((i) => isMine(i, auth) || (!i.owner && used.has(i.url)));
}

// The owner's picker: whose uploads there are, and how many of each.
function ownersOf(all) {
  const counts = {};
  all.forEach((i) => { const o = ownerOf(i); counts[o] = (counts[o] || 0) + 1; });
  return Object.entries(counts)
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: JSON_HEADERS });

  const url = new URL(req.url);

  // ── Serve ───────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/image\//, ""));
    if (!key || key === INDEX_KEY) return json({ error: "Missing image key" }, 400);

    const blob = await readBlobWithLegacy("images", key);
    if (!blob || !blob.data) return json({ error: "Not found" }, 404);

    return new Response(blob.data, {
      status: 200,
      headers: {
        "Content-Type": (blob.metadata && blob.metadata.contentType) || "application/octet-stream",
        // Keys are unique per upload and never rewritten, so this is safe.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
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

  const s = store();

  // ── List ────────────────────────────────────────────────────────────────
  if (body.action === "list") {
    const { images: all, changed } = await reconcileIndex(s);
    if (changed) await s.setJSON(INDEX_KEY, { images: all });
    const images = await visibleTo(all, auth, body.scope);
    const out = { ok: true, images, totalBytes: totalOf(images) };
    if (auth.isOwner) out.owners = ownersOf(all);
    return json(out);
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  if (body.action === "delete") {
    const key = String(body.key || "");
    if (!key || key === INDEX_KEY) return json({ error: "Missing image key" }, 400);

    // A creator may remove what they uploaded and nothing else: they cannot
    // see what anyone else's picture is used for. Old unowned uploads are the
    // owner's, even the ones a creator is shown because they use them.
    const { images: before } = await reconcileIndex(s);
    const target = before.find(i => i.key === key);
    if (!target) return json({ error: "Not found" }, 404);
    if (!auth.isOwner && !(target.owner && isMine(target, auth))) {
      return json({ error: "You can only delete images you uploaded." }, 403);
    }

    await deleteEverywhere("images", key);
    const all = before.filter(i => i.key !== key);
    await s.setJSON(INDEX_KEY, { images: all });
    const images = await visibleTo(all, auth, body.scope);
    return json({ ok: true, images, totalBytes: totalOf(images) });
  }

  // ── Upload ──────────────────────────────────────────────────────────────
  const contentType = String(body.contentType || "").toLowerCase();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return json({ error: `Unsupported type "${contentType}". Use WebP, JPEG, PNG or GIF.` }, 400);
  }

  if (typeof body.data !== "string" || !body.data) {
    return json({ error: "Missing image data" }, 400);
  }

  let bytes;
  try {
    bytes = Buffer.from(body.data, "base64");
  } catch {
    return json({ error: "Image data is not valid base64" }, 400);
  }
  if (!bytes.length) return json({ error: "Image data is empty" }, 400);
  if (bytes.length > MAX_BYTES) {
    return json({ error: `Image is ${(bytes.length / 1048576).toFixed(1)}MB; the limit is 4MB.` }, 413);
  }

  // Keep a readable trace of the original name in the key without trusting it
  // for anything — it is only ever used as a slug.
  const slug = String(body.filename || "cover")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cover";

  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${slug}.${ext}`;
  const uploadedAt = new Date().toISOString();

  await s.set(key, bytes, {
    metadata: { contentType, originalName: String(body.filename || ""), uploadedAt, owner: slugOf(auth) },
  });

  // Read-modify-write on the index. Not atomic; a lost race leaves a blob
  // outside the index, which the next list adopts as the owner's.
  const entry = {
    key,
    url: `/api/image/${key}`,
    name: String(body.filename || slug),
    size: bytes.length,
    type: contentType,
    uploadedAt,
    owner: slugOf(auth),
    uploadedBy: auth.email || "",
  };
  const all = [entry, ...(await readIndex(s)).filter(i => i.key !== key)];
  await s.setJSON(INDEX_KEY, { images: all });

  const images = await visibleTo(all, auth, body.scope);
  return json({ ok: true, url: entry.url, key, bytes: bytes.length, images });
};

export const config = { path: ["/api/upload", "/api/image/*"] };
