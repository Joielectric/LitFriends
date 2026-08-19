import { siteStore, readJsonWithLegacy } from "./_site.js";
import { authorize, unauthorized } from "./_auth.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

const KEY = "responses";
const MAX_FIELD = 5000;      // per-field character cap
const MAX_RESPONSES = 5000;  // keep the blob bounded

function clean(value) {
  if (value == null) return "";
  return String(value).slice(0, MAX_FIELD);
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  }

  const store = siteStore("feedback");

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS });
  }

  // ── Admin actions ─────────────────────────────────────────────────────────
  if (body.action) {
    const auth = await authorize(req, body);
    if (!auth.ok) {
      return new Response(JSON.stringify(unauthorized(auth)), { status: 401, headers: CORS });
    }

    const data = (await readJsonWithLegacy("feedback", KEY)).data || { responses: [] };

    if (body.action === "list") {
      return new Response(JSON.stringify({ ok: true, responses: data.responses || [] }), { status: 200, headers: CORS });
    }

    if (body.action === "delete") {
      const responses = (data.responses || []).filter((r) => r.id !== body.id);
      await store.setJSON(KEY, { responses });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });
  }

  // ── Public append (from the feedback form) ────────────────────────────────
  // Honeypot: real users never fill this in.
  if (clean(body.botcheck)) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
  const record = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), received: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (k === "botcheck" || k === "access_key" || k === "password") continue;
    record[clean(k)] = Array.isArray(v) ? v.map(clean).join(", ") : clean(v);
  }

  const data = (await readJsonWithLegacy("feedback", KEY)).data || { responses: [] };
  const responses = data.responses || [];
  responses.unshift(record);
  if (responses.length > MAX_RESPONSES) responses.length = MAX_RESPONSES;

  await store.setJSON(KEY, { responses });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
};

export const config = { path: "/api/feedback" };
