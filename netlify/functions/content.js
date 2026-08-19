import { siteStore, readJsonWithLegacy } from "./_site.js";
import { authorize, unauthorized } from "./_auth.js";

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
      const who = { email: auth.email, isOwner: !!auth.isOwner, via: auth.via };
      return new Response(JSON.stringify({ ok: true, who, ...(data || { entries: [] }) }), { status: 200, headers: CORS });
    }

    if (!Array.isArray(entries)) {
      return new Response(JSON.stringify({ error: "entries must be an array" }), { status: 400, headers: CORS });
    }

    // Preserve collaborators / news / providers unless the client sends new lists
    const { data: existing } = await readJsonWithLegacy("content", "audio");
    const collaborators = Array.isArray(body.collaborators)
      ? body.collaborators
      : (existing && existing.collaborators) || [];
    const news = Array.isArray(body.news)
      ? body.news
      : (existing && existing.news) || [];
    const providers = Array.isArray(body.providers)
      ? body.providers
      : (existing && existing.providers) || [];

    await store.setJSON("audio", { entries, collaborators, news, providers });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
};

export const config = { path: "/api/content" };
