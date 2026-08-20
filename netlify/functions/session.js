import { verifyGoogleToken, identify, unauthorized, ownerEmail, OWNER_SLUG } from "./_auth.js";
import { createSession, sessionCookie, cookieFromRequest, readSession } from "./_session.js";

// Starting and ending a session.
//
//   POST /api/session { credential }  -> sign in with a Google ID token
//   POST /api/session { password }    -> sign in with the shared password
//   POST /api/session { action: "who" }  -> who the current cookie says you are
//   POST /api/session { action: "out" }  -> sign out
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
  } else if (body.password) {
    const envPassword = (process.env.ADMIN_PASSWORD || "").trim();
    if (!envPassword || body.password.trim() !== envPassword) {
      return json(unauthorized({ error: "Incorrect password." }), 401);
    }
    // Only the owner has the shared password.
    who = { ok: true, email: ownerEmail(), name: "", via: "password", isOwner: true, role: "owner", slug: OWNER_SLUG };
  } else {
    return json({ error: "Nothing to sign in with." }, 400);
  }

  if (!who.ok) return json({ error: who.error }, 401);

  const token = await createSession(who.email);
  return json({ ok: true, who: publicWho(who) }, 200, sessionCookie(token));
};

export const config = { path: "/api/session" };
