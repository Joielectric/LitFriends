import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS });
  }

  const store = getStore({ name: "content", consistency: "strong" });

  // Public read
  if (req.method === "GET") {
    const data = await store.get("audio", { type: "json" }).catch(() => null);
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

    const { password, action, entries } = body;
    const envSet = !!process.env.ADMIN_PASSWORD;
    const envPassword = (process.env.ADMIN_PASSWORD || "").trim();

    if (!password || password.trim() !== envPassword) {
      return new Response(JSON.stringify({ error: "Unauthorized", env_set: envSet }), { status: 401, headers: CORS });
    }

    // Verify-only — confirms password and returns current entries
    if (action === "verify") {
      const data = await store.get("audio", { type: "json" }).catch(() => null);
      return new Response(JSON.stringify({ ok: true, ...(data || { entries: [] }) }), { status: 200, headers: CORS });
    }

    if (!Array.isArray(entries)) {
      return new Response(JSON.stringify({ error: "entries must be an array" }), { status: 400, headers: CORS });
    }

    await store.setJSON("audio", { entries });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
};

export const config = { path: "/api/content" };
