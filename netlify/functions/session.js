import { verifyGoogleToken, identify, unauthorized } from "./_auth.js";
import { createSession, sessionCookie, cookieFromRequest, readSession } from "./_session.js";
import { readCreators, writeCreators, findCreator, TERMS_VERSION, slugify, slugProblem } from "./_creators.js";
import { siteStore } from "./_site.js";

// Starting and ending a session.
//
//   POST /api/session { credential }  -> sign in with a Google ID token
//   POST /api/session { action: "who" }  -> who the current cookie says you are
//   POST /api/session { action: "out" }  -> sign out
//   POST /api/session { action: "accept-terms" } -> record that the signed-in
//                                                   creator accepted the terms
//   POST /api/session { action: "choose-page", slug, name, check }
//        -> a creator invited without a page name picks theirs, once:
//           /profile/<slug>. With check: true it only says whether the name
//           is free. After that only the owner can change it (Rename).
//
// This is the only place a Google token needs to reach: it is exchanged once
// for a session cookie that lasts a month, so the Content Manager stops asking
// who you are on every visit.

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const json = (body, status = 200, cookie = "") => {
  const headers = { ...CORS };
  if (cookie) headers["Set-Cookie"] = cookie;
  return new Response(JSON.stringify(body), { status, headers });
};

const publicWho = (who) => ({
  email: who.email, isOwner: !!who.isOwner, via: who.via,
  role: who.role || (who.isOwner ? "owner" : "creator"),
  slug: who.slug || "",
  termsAt: who.termsAt || "",
});

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...CORS, "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.action === "out") {
    return json({ ok: true }, 200, sessionCookie("", 0));
  }

  // Is the cookie still good? This is what lets the page skip the gate.
  if (body.action === "who") {
    const email = await readSession(cookieFromRequest(req));
    if (!email) return json({ ok: false, error: "No session" }, 401);
    const who = await identify(email, "", "session");
    if (!who.ok) return json({ ok: false, error: who.error }, 401, sessionCookie("", 0));
    return json({ ok: true, who: publicWho(who) });
  }

  // Accepting the creator terms: stamped on their creator record with the
  // version they saw, so a change of wording can ask again.
  if (body.action === "accept-terms") {
    const email = await readSession(cookieFromRequest(req));
    if (!email) return json({ ok: false, error: "No session" }, 401);
    const who = await identify(email, "", "session");
    if (!who.ok) return json({ ok: false, error: who.error }, 401);
    const creators = await readCreators();
    const rec = findCreator(creators, who.email);
    // The owner signs in through ADMIN_EMAILS and may have no record; the
    // terms are theirs to set, not to accept.
    if (!rec) return json({ ok: true, termsAt: "" });
    rec.termsAt = new Date().toISOString();
    rec.termsVersion = TERMS_VERSION;
    await writeCreators(creators);
    return json({ ok: true, termsAt: rec.termsAt });
  }

  if (body.action === "choose-page") {
    const email = await readSession(cookieFromRequest(req));
    if (!email) return json({ ok: false, error: "No session" }, 401);
    const who = await identify(email, "", "session");
    if (!who.ok) return json({ ok: false, error: who.error }, 401);
    const creators = await readCreators();
    const rec = findCreator(creators, who.email);
    if (!rec) return json({ ok: false, error: "Only an invited creator chooses a page name." }, 400);
    if (rec.slug) return json({ ok: false, error: `Your page is already /profile/${rec.slug}. Ask the site owner to rename it.` }, 409);

    const slug = slugify(body.slug);
    const data = await siteStore("profiles").get("profiles", { type: "json" }).catch(() => null);
    const problem = slugProblem(slug, creators, data && data.profiles, who.email);
    if (body.check) return json({ ok: true, slug, available: !problem, problem });
    if (problem) return json({ ok: false, error: problem, slug }, 409);

    rec.slug = slug;
    const name = String(body.name == null ? "" : body.name).trim().slice(0, 80);
    if (name) rec.name = name;
    await writeCreators(creators);
    return json({ ok: true, slug, name: rec.name || "" });
  }

  // ── Signing in ───────────────────────────────────────────────────────────
  let who;

  if (body.credential) {
    const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
    if (!clientId) return json({ error: "Sign-in is not configured on this site." }, 401);
    let claims;
    try {
      claims = await verifyGoogleToken(body.credential, clientId);
    } catch (err) {
      return json({ error: `Sign-in failed: ${err.message}` }, 401);
    }
    who = await identify(claims.email, claims.name, "google");
  } else {
    return json({ error: "Nothing to sign in with." }, 400);
  }

  if (!who.ok) return json({ error: who.error }, 401);

  const token = await createSession(who.email);
  return json({ ok: true, who: publicWho(who) }, 200, sessionCookie(token));
};

export const config = { path: "/api/session" };
