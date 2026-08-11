import { getStore } from "@netlify/blobs";

// Cover-image upload, listing and serving, backed by Netlify Blobs.
//
//   POST /api/upload  { password, filename, contentType, data } -> { url }
//   POST /api/upload  { password, action: "list" }              -> { images, totalBytes }
//   POST /api/upload  { password, action: "delete", key }       -> { ok }
//   GET  /api/image/:key                                        -> the bytes
//
// Uploads and management are admin-only and reuse ADMIN_PASSWORD, same as
// /api/content. Reads are public — the catalogue has to show the covers.

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

const store = () => getStore({ name: "images", consistency: "strong" });

async function readIndex(s) {
  const idx = await s.get(INDEX_KEY, { type: "json" }).catch(() => null);
  return idx && Array.isArray(idx.images) ? idx.images : [];
}

// Drop index entries whose blob is gone and adopt any blob missing from the
// index, so a failed write or a manual deletion can never strand the list.
async function reconcileIndex(s) {
  const indexed = await readIndex(s);
  const listed = await s.list().catch(() => null);
  if (!listed || !Array.isArray(listed.blobs)) return { images: indexed, changed: false };

  const real = new Set(listed.blobs.map(b => b.key).filter(k => k !== INDEX_KEY));
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

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: JSON_HEADERS });

  const url = new URL(req.url);

  // ── Serve ───────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/image\//, ""));
    if (!key || key === INDEX_KEY) return json({ error: "Missing image key" }, 400);

    const blob = await store().getWithMetadata(key, { type: "arrayBuffer" }).catch(() => null);
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

  const envPassword = (process.env.ADMIN_PASSWORD || "").trim();
  if (!body.password || body.password.trim() !== envPassword) {
    return json({ error: "Unauthorized", env_set: !!process.env.ADMIN_PASSWORD }, 401);
  }

  const s = store();

  // ── List ────────────────────────────────────────────────────────────────
  if (body.action === "list") {
    const { images, changed } = await reconcileIndex(s);
    if (changed) await s.setJSON(INDEX_KEY, { images });
    const totalBytes = images.reduce((n, i) => n + (Number(i.size) || 0), 0);
    return json({ ok: true, images, totalBytes });
  }

  // ── Delete ──────────────────────────────────────────────────────────────
  if (body.action === "delete") {
    const key = String(body.key || "");
    if (!key || key === INDEX_KEY) return json({ error: "Missing image key" }, 400);

    await s.delete(key).catch(() => null);
    const images = (await readIndex(s)).filter(i => i.key !== key);
    await s.setJSON(INDEX_KEY, { images });
    return json({ ok: true, images, totalBytes: images.reduce((n, i) => n + (Number(i.size) || 0), 0) });
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
    metadata: { contentType, originalName: String(body.filename || ""), uploadedAt },
  });

  // Read-modify-write on the index. Not atomic, but there is a single admin.
  const entry = {
    key,
    url: `/api/image/${key}`,
    name: String(body.filename || slug),
    size: bytes.length,
    type: contentType,
    uploadedAt,
  };
  const images = [entry, ...(await readIndex(s)).filter(i => i.key !== key)];
  await s.setJSON(INDEX_KEY, { images });

  return json({ ok: true, url: entry.url, key, bytes: bytes.length, images });
};

export const config = { path: ["/api/upload", "/api/image/*"] };
