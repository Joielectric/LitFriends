import { authorize, unauthorized } from "./_auth.js";
import { KINDS, LiteroticaError, cleanHandle, fromLiterotica } from "./_literotica.js";

// Reading an author's audio, stories and poems from Literotica.
//
//   POST /api/literotica { handle, kinds: ["audio", "stories", "poetry"] }
//     -> { handle, works, counts, partial }
//
// The browser cannot read literotica.com itself, so the pages are read here
// and handed back shaped like catalogue entries. _literotica.js explains what
// is read and why only that.
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
  if (!handle) return json({ error: "Which Literotica username?" }, 400);

  const asked = Array.isArray(body.kinds) ? body.kinds : KINDS;
  const kinds = KINDS.filter((k) => asked.includes(k));
  if (!kinds.length) return json({ error: "Pick at least one of audio, stories or poetry." }, 400);

  try {
    const found = await fromLiterotica(handle, kinds);
    if (!found) {
      return json({ error: `Literotica has no author called "${handle}". Check the name against the address of the author page.` }, 404);
    }
    return json({ ok: true, handle, ...found });
  } catch (err) {
    // Their site being slow or changed must not look like a bug in ours.
    const message = err instanceof LiteroticaError ? err.message : `Reading Literotica failed: ${err.message}`;
    return json({ error: message }, 502);
  }
};

export const config = { path: "/api/literotica" };
