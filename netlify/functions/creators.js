import { authorize, unauthorized, ownerEmail } from "./_auth.js";
import { readCreators, writeCreators, findCreator, slugTaken, slugify } from "./_creators.js";
import { renameCreator, RenameError } from "./_rename.js";

// Managing who may sign in.
//
//   POST /api/creators { action: "list" }                       -> everyone
//   POST /api/creators { action: "invite", email, slug, name }  -> add or update
//   POST /api/creators { action: "update", email, slug, name, status }
//   POST /api/creators { action: "remove", email }              -> revoke
//   POST /api/creators { action: "rename", from, to, name }     -> move a page
//        to a new page name (and display name), everywhere it is filed;
//        see _rename.js
//
// Owner-only, all of it. Being an admin is not enough: handing out access is
// the one power that must not spread on its own, or an invited creator could
// invite themselves a second account and quietly widen their reach.

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

const clean = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
const normEmail = (v) => clean(v, 320).toLowerCase();
const looksLikeEmail = (v) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v);

const MAX_CREATORS = 500;

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
  if (!auth.isOwner) return json({ error: "Only the site owner can manage access." }, 403);

  const creators = await readCreators();

  if (body.action === "list") {
    return json({ ok: true, creators, owner: ownerEmail() });
  }

  if (body.action === "invite" || body.action === "update") {
    const email = normEmail(body.email);
    if (!looksLikeEmail(email)) return json({ error: "That does not look like an email address." }, 400);

    const name = clean(body.name, 120);
    // The page name is theirs to choose when they first sign in (session.js,
    // "choose-page"). One given here hands them a page that already exists,
    // such as a hand-built one; left blank, it stays unset until they pick.
    const slug = slugify(body.slug || "");
    if (slug && slugTaken(creators, slug, email)) {
      return json({ error: `The profile "${slug}" already belongs to someone else.` }, 409);
    }

    const existing = findCreator(creators, email);
    if (existing) {
      if (slug) existing.slug = slug;
      if (name) existing.name = name;
      if (body.status) existing.status = clean(body.status, 20);
      await writeCreators(creators);
      return json({ ok: true, creators, creator: existing });
    }

    if (creators.length >= MAX_CREATORS) return json({ error: "Too many creators." }, 400);

    const rec = {
      email,
      slug,
      name,
      role: "creator",
      status: "invited",
      invitedAt: new Date().toISOString(),
    };
    creators.push(rec);
    await writeCreators(creators);
    return json({ ok: true, creators, creator: rec });
  }

  if (body.action === "rename") {
    try {
      const done = await renameCreator({ from: body.from, to: body.to, name: body.name });
      return json({ ok: true, creators: await readCreators(), renamed: done });
    } catch (err) {
      if (err instanceof RenameError) return json({ error: err.message }, err.status);
      throw err;
    }
  }

  if (body.action === "remove") {
    const email = normEmail(body.email);
    // The owner signs in through ADMIN_EMAILS, but removing their row would
    // still lose the slug their profile hangs off. Refuse it.
    if (email === ownerEmail()) return json({ error: "You cannot remove your own access." }, 400);
    const kept = creators.filter((c) => normEmail(c.email) !== email);
    await writeCreators(kept);
    return json({ ok: true, creators: kept });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: "/api/creators" };
