import { siteStore, readJsonWithLegacy } from "./_site.js";

// Contact messages and email-alert signups.
//
//   POST /api/contact  { kind: "message", name, email, subject, message }
//   POST /api/contact  { kind: "subscribe", email, name }
//   POST /api/contact  { password, action: "list" }            -> everything
//   POST /api/contact  { password, action: "delete", id, kind }
//   POST /api/contact  { password, action: "unsubscribe", id } -> mark, keep record
//
// Writes are public (that is the point of a contact form) and guarded by a
// honeypot plus length caps. Reading requires ADMIN_PASSWORD, same as the rest.
//
// Nothing here sends email. Signups are stored so they can be exported into a
// real sender (Buttondown, Mailchimp, Resend) when there is one; a message just
// lands in the Content Manager inbox.

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const KEY = "inbox";
const MAX_FIELD = 4000;
const MAX_MESSAGES = 2000;
const MAX_SUBSCRIBERS = 20000;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

const clean = (v) => String(v == null ? "" : v).slice(0, MAX_FIELD).trim();
const normEmail = (v) => clean(v).toLowerCase();
// Deliberately loose: a rejected real address is worse than a stored typo.
const looksLikeEmail = (v) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

async function readInbox() {
  const { data } = await readJsonWithLegacy("contact", KEY);
  return {
    messages: (data && Array.isArray(data.messages)) ? data.messages : [],
    subscribers: (data && Array.isArray(data.subscribers)) ? data.subscribers : [],
  };
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 200, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const store = siteStore("contact");

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const envPassword = (process.env.ADMIN_PASSWORD || "").trim();
  const isAdmin = !!body.password && body.password.trim() === envPassword;

  // ── Admin ────────────────────────────────────────────────────────────────
  if (body.action) {
    if (!isAdmin) {
      return json({ error: "Unauthorized", env_set: !!process.env.ADMIN_PASSWORD }, 401);
    }
    const inbox = await readInbox();

    if (body.action === "list") return json({ ok: true, ...inbox });

    if (body.action === "delete") {
      const id = String(body.id || "");
      if (body.kind === "subscriber") inbox.subscribers = inbox.subscribers.filter(s => s.id !== id);
      else inbox.messages = inbox.messages.filter(m => m.id !== id);
      await store.setJSON(KEY, inbox);
      return json({ ok: true, ...inbox });
    }

    // Keep the record so a resubscribe does not look like a fresh signup.
    if (body.action === "unsubscribe") {
      const id = String(body.id || "");
      inbox.subscribers = inbox.subscribers.map(s =>
        s.id === id ? { ...s, unsubscribed: true, unsubscribedAt: new Date().toISOString() } : s
      );
      await store.setJSON(KEY, inbox);
      return json({ ok: true, ...inbox });
    }

    return json({ error: "Unknown action" }, 400);
  }

  // ── Public ───────────────────────────────────────────────────────────────
  // Honeypot: a real person never fills this in.
  if (clean(body.botcheck)) return json({ ok: true });

  const inbox = await readInbox();
  const kind = body.kind === "subscribe" ? "subscribe" : "message";
  const email = normEmail(body.email);

  if (kind === "subscribe") {
    if (!looksLikeEmail(email)) return json({ error: "That does not look like an email address." }, 400);

    const existing = inbox.subscribers.find(s => s.email === email);
    if (existing) {
      // Re-signing up after unsubscribing opts you back in.
      if (existing.unsubscribed) {
        existing.unsubscribed = false;
        existing.resubscribedAt = new Date().toISOString();
        await store.setJSON(KEY, inbox);
      }
      return json({ ok: true, already: true });
    }

    inbox.subscribers.unshift({
      id: newId(),
      email,
      name: clean(body.name),
      source: clean(body.source) || "site",
      signedUpAt: new Date().toISOString(),
    });
    if (inbox.subscribers.length > MAX_SUBSCRIBERS) inbox.subscribers.length = MAX_SUBSCRIBERS;
    await store.setJSON(KEY, inbox);
    return json({ ok: true });
  }

  const message = clean(body.message);
  if (!message) return json({ error: "Write a message first." }, 400);
  if (email && !looksLikeEmail(email)) return json({ error: "That does not look like an email address." }, 400);

  inbox.messages.unshift({
    id: newId(),
    name: clean(body.name),
    email,
    subject: clean(body.subject),
    message,
    received: new Date().toISOString(),
    // A reply is only possible if they left an address.
    canReply: !!email,
  });
  if (inbox.messages.length > MAX_MESSAGES) inbox.messages.length = MAX_MESSAGES;

  // Sending a message can opt you in too, but only if you asked.
  if (body.subscribe && looksLikeEmail(email) && !inbox.subscribers.some(s => s.email === email)) {
    inbox.subscribers.unshift({
      id: newId(),
      email,
      name: clean(body.name),
      source: "contact form",
      signedUpAt: new Date().toISOString(),
    });
  }

  await store.setJSON(KEY, inbox);
  return json({ ok: true });
};

export const config = { path: "/api/contact" };
