import { getStore } from "@netlify/blobs";

// Cover-image upload + serving, backed by Netlify Blobs.
//
//   POST /api/upload      { password, filename, contentType, data }  -> { url }
//   GET  /api/image/:key                                             -> the bytes
//
// Uploads are admin-only and reuse ADMIN_PASSWORD, same as /api/content.
// Reads are public — the catalogue has to be able to show the covers.

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

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const store = () => getStore({ name: "images", consistency: "strong" });

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: JSON_HEADERS });

  const url = new URL(req.url);

  // ── Serve ───────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/image\//, ""));
    if (!key) return json({ error: "Missing image key" }, 400);

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

  // ── Upload ──────────────────────────────────────────────────────────────
  if (req.method === "POST") {
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

    await store().set(key, bytes, {
      metadata: { contentType, originalName: String(body.filename || ""), uploadedAt: new Date().toISOString() },
    });

    return json({ ok: true, url: `/api/image/${key}`, key, bytes: bytes.length });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/upload", "/api/image/*"] };
