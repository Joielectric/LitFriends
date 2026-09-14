import { authorize, unauthorized } from "./_auth.js";
import { SourceError, cleanHandle, fromGwasi, fromSoundgasm, fromHotAudio } from "./_reddit.js";

// Finding a creator's audios from their Reddit history.
//
//   POST /api/reddit { source: "gwasi",     handle } -> { posts }
//   POST /api/reddit { source: "soundgasm", handle } -> { items }
//   POST /api/reddit { source: "hotaudio",  handle } -> { items }
//
// One source per request, so a slow host cannot hold up the others. The Tools
// page asks for each and js/reddit-import.js merges the answers; _reddit.js
// explains what each source is for.
//
// Signed in only: it is an editor's tool, and it keeps this site from being
// used to hammer anyone else's.

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

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
  if (!handle) return json({ error: "Which username?" }, 400);

  const source = String(body.source || "");
  try {
    if (source === "gwasi") return json({ ok: true, source, posts: await fromGwasi(handle) });
    if (source === "soundgasm") return json({ ok: true, source, items: await fromSoundgasm(handle) });
    if (source === "hotaudio") return json({ ok: true, source, items: await fromHotAudio(handle) });
    return json({ error: "Unknown source" }, 400);
  } catch (err) {
    // Their site being slow or changed must not look like a bug in ours.
    const message = err instanceof SourceError ? err.message : `${source} failed: ${err.message}`;
    return json({ error: message }, 502);
  }
};

export const config = { path: "/api/reddit" };
