import { siteStore, readJsonWithLegacy, readBlobWithLegacy, listWithLegacy, deleteEverywhere } from "./_site.js";

// Music-track upload, listing and serving, backed by Netlify Blobs.
//
//   POST /api/track-upload      raw audio body + x-admin-password,
//                               x-filename, content-type      -> { url }
//   POST /api/track-upload      { password, action: "list" }   -> { tracks, totalBytes }
//   POST /api/track-upload      { password, action: "delete", key } -> { ok }
//   GET  /api/track/:key                                       -> the bytes
//
// Uploads and management are admin-only and reuse ADMIN_PASSWORD, same as
// /api/content. Reads are public — the catalogue has to play and serve the
// tracks.
//
// The body is sent raw rather than base64 because Netlify caps a function
// request at 6MB and base64 would inflate a file by a third, costing about
// 1.5MB of usable headroom on every upload.

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

const MAX_BYTES = 5.5 * 1024 * 1024;

const ALLOWED_TYPES = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

const INDEX_KEY = "__index.json";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const store = () => siteStore("tracks");

async function readIndex(s) {
  const idx = (await readJsonWithLegacy("tracks", INDEX_KEY)).data;
  return idx && Array.isArray(idx.tracks) ? idx.tracks : [];
}

// Drop index entries whose blob is gone and adopt any blob missing from the
// index, so a failed write can never strand the list.
async function reconcileIndex(s) {
  const indexed = await readIndex(s);
  const listedKeys = await listWithLegacy("tracks");
  const real = new Set(listedKeys.filter(k => k !== INDEX_KEY));
  const kept = indexed.filter(t => real.has(t.key));
  const known = new Set(kept.map(t => t.key));

  const orphans = [...real]
    .filter(k => !known.has(k))
    .map(k => ({ key: k, url: `/api/track/${k}`, name: k, size: null, uploadedAt: null }));

  const tracks = [...kept, ...orphans].sort(
    (a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || ""))
  );
  return { tracks, changed: orphans.length > 0 || kept.length !== indexed.length };
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        "Access-Control-Allow-Headers": "content-type,x-admin-password,x-filename",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
    });
  }

  const url = new URL(req.url);

  // ── Serve ───────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const key = decodeURIComponent(url.pathname.replace(/^\/api\/track\//, ""));
    if (!key || key === INDEX_KEY) return json({ error: "Missing track key" }, 400);

    const blob = await readBlobWithLegacy("tracks", key);
    if (!blob || !blob.data) return json({ error: "Not found" }, 404);

    const meta = blob.metadata || {};
    const headers = {
      "Content-Type": meta.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      // Lets the browser seek within the track rather than refetching it.
      "Accept-Ranges": "bytes",
    };
    // A download link should save under the name it was uploaded with.
    if (url.searchParams.get("download") === "1") {
      const safe = String(meta.originalName || key).replace(/[^\w.\- ]+/g, "_");
      headers["Content-Disposition"] = `attachment; filename="${safe}"`;
    }
    return new Response(blob.data, { status: 200, headers });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const s = store();
  const headerPassword = (req.headers.get("x-admin-password") || "").trim();
  const envPassword = (process.env.ADMIN_PASSWORD || "").trim();
  const contentType = String(req.headers.get("content-type") || "").split(";")[0].toLowerCase();

  // ── List / delete (JSON) ────────────────────────────────────────────────
  if (contentType === "application/json") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!body.password || body.password.trim() !== envPassword) {
      return json({ error: "Unauthorized", env_set: !!process.env.ADMIN_PASSWORD }, 401);
    }

    if (body.action === "list") {
      const { tracks, changed } = await reconcileIndex(s);
      if (changed) await s.setJSON(INDEX_KEY, { tracks });
      const totalBytes = tracks.reduce((n, t) => n + (Number(t.size) || 0), 0);
      return json({ ok: true, tracks, totalBytes });
    }

    if (body.action === "delete") {
      const key = String(body.key || "");
      if (!key || key === INDEX_KEY) return json({ error: "Missing track key" }, 400);
      await deleteEverywhere("tracks", key);
      const tracks = (await readIndex(s)).filter(t => t.key !== key);
      await s.setJSON(INDEX_KEY, { tracks });
      return json({ ok: true, tracks, totalBytes: tracks.reduce((n, t) => n + (Number(t.size) || 0), 0) });
    }

    return json({ error: "Unknown action" }, 400);
  }

  // ── Upload (raw binary) ─────────────────────────────────────────────────
  if (!headerPassword || headerPassword !== envPassword) {
    return json({ error: "Unauthorized", env_set: !!process.env.ADMIN_PASSWORD }, 401);
  }

  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    return json({ error: `Unsupported type "${contentType}". Use MP3, WAV, OGG, FLAC or M4A.` }, 400);
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return json({ error: "Track data is empty" }, 400);
  if (buf.length > MAX_BYTES) {
    return json({
      error: `Track is ${(buf.length / 1048576).toFixed(1)}MB; the limit is 5.5MB. Export a smaller MP3 or host it elsewhere and paste the URL.`,
    }, 413);
  }

  const filename = req.headers.get("x-filename") || "track";
  const slug = String(filename)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "track";

  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${slug}.${ext}`;
  const uploadedAt = new Date().toISOString();

  await s.set(key, buf, {
    metadata: { contentType, originalName: String(filename), uploadedAt },
  });

  const entry = {
    key,
    url: `/api/track/${key}`,
    name: String(filename),
    size: buf.length,
    type: contentType,
    uploadedAt,
  };
  const tracks = [entry, ...(await readIndex(s)).filter(t => t.key !== key)];
  await s.setJSON(INDEX_KEY, { tracks });

  return json({ ok: true, url: entry.url, key, bytes: buf.length, tracks });
};

export const config = { path: ["/api/track-upload", "/api/track/*"] };
