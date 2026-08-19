// Who is allowed to change things.
//
// Two ways in, checked in this order:
//
//   1. A Google ID token in `Authorization: Bearer <jwt>`, whose verified email
//      appears in ADMIN_EMAILS.
//   2. The shared ADMIN_PASSWORD, in the body or the x-admin-password header.
//
// The password is the fallback so a misconfigured OAuth origin cannot lock
// anyone out of their own Content Manager. Drop it by clearing ADMIN_PASSWORD
// once sign-in has been working for a while.
//
// Environment:
//   GOOGLE_CLIENT_ID  the ...apps.googleusercontent.com id (public)
//   ADMIN_EMAILS      comma-separated allowlist; empty means nobody signs in
//   OWNER_EMAIL       whose site this is; defaults to the first ADMIN_EMAILS
//                     entry. Owner-only powers hang off this.
//   ADMIN_PASSWORD    shared password; empty disables the fallback
//
// The token is verified here rather than by calling Google's tokeninfo
// endpoint, so an admin action costs no extra network round trip and does not
// fail when that endpoint is slow. Only Google's public keys are fetched, and
// those are cached for as long as Google says they are good for.

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

// Clocks drift; a token a few seconds past expiry is not an attack.
const CLOCK_SKEW_SEC = 60;

const b64urlToBytes = (s) => {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(pad + "===".slice((pad.length + 3) % 4), "base64");
};
const b64urlToJson = (s) => JSON.parse(b64urlToBytes(s).toString("utf8"));

// ── Google's signing keys ───────────────────────────────────────────────────
// Cached across invocations of a warm function; Google rotates them slowly and
// publishes an expiry, so honour it rather than guessing.
let keyCache = { keys: null, expiresAt: 0 };

async function getSigningKeys() {
  if (keyCache.keys && Date.now() < keyCache.expiresAt) return keyCache.keys;

  const res = await fetch(GOOGLE_CERTS);
  if (!res.ok) throw new Error(`Could not fetch Google signing keys (${res.status})`);
  const body = await res.json();

  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  const ttlMs = (maxAge ? Number(maxAge[1]) : 3600) * 1000;

  const keys = {};
  for (const jwk of body.keys || []) if (jwk.kid) keys[jwk.kid] = jwk;
  keyCache = { keys, expiresAt: Date.now() + ttlMs };
  return keys;
}

// Exported so tests can inject keys and so a deploy can drop a stale cache.
export function __setSigningKeys(keys, ttlMs = 60000) {
  keyCache = { keys, expiresAt: Date.now() + ttlMs };
}

/** Verify a Google ID token. Returns its claims, or throws with a reason. */
export async function verifyGoogleToken(token, clientId) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const [rawHeader, rawPayload, rawSig] = parts;
  let header;
  try {
    header = b64urlToJson(rawHeader);
  } catch {
    throw new Error("Malformed token");
  }
  if (header.alg !== "RS256") throw new Error(`Unexpected algorithm ${header.alg}`);

  const keys = await getSigningKeys();
  const jwk = keys[header.kid];
  if (!jwk) throw new Error("Unknown signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(rawSig),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`)
  );
  if (!ok) throw new Error("Bad signature");

  let claims;
  try {
    claims = b64urlToJson(rawPayload);
  } catch {
    throw new Error("Malformed token");
  }
  const now = Math.floor(Date.now() / 1000);

  if (!GOOGLE_ISSUERS.includes(claims.iss)) throw new Error("Wrong issuer");
  // Without this check any Google token from any app would be accepted.
  if (!clientId || claims.aud !== clientId) throw new Error("Token was not issued for this site");
  if (!claims.exp || claims.exp + CLOCK_SKEW_SEC < now) throw new Error("Token has expired");
  if (claims.nbf && claims.nbf - CLOCK_SKEW_SEC > now) throw new Error("Token is not valid yet");
  // An unverified address proves nothing about who is holding it.
  if (claims.email_verified !== true && claims.email_verified !== "true") {
    throw new Error("Email is not verified");
  }
  if (!claims.email) throw new Error("Token carries no email");

  return claims;
}

const normEmail = (v) => String(v == null ? "" : v).trim().toLowerCase();

/** The one account that can see and do everything. */
export function ownerEmail() {
  return normEmail(process.env.OWNER_EMAIL) || adminEmails()[0] || "";
}

export function adminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(/[,\s]+/)
    .map(normEmail)
    .filter(Boolean);
}

/**
 * Decide whether a request may make changes.
 *
 * Returns { ok, email, name, via, error }. `via` is "google" or "password",
 * which lets a caller log who did what once sign-in is the norm.
 */
export async function authorize(req, body) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "");

  if (bearer) {
    if (!clientId) return { ok: false, error: "Sign-in is not configured on this site." };
    let claims;
    try {
      claims = await verifyGoogleToken(bearer[1], clientId);
    } catch (err) {
      return { ok: false, error: `Sign-in failed: ${err.message}` };
    }
    const email = normEmail(claims.email);
    if (!adminEmails().includes(email)) {
      return { ok: false, error: `${claims.email} is not on the access list.`, email };
    }
    return { ok: true, email, name: claims.name || "", via: "google", isOwner: email === ownerEmail() };
  }

  const envPassword = (process.env.ADMIN_PASSWORD || "").trim();
  const given = String(
    (body && body.password) || req.headers.get("x-admin-password") || ""
  ).trim();

  if (envPassword && given && given === envPassword) {
    // Only the owner has the shared password, so it grants owner rights.
    return { ok: true, email: ownerEmail(), name: "", via: "password", isOwner: true };
  }
  return { ok: false, error: "Unauthorized" };
}

/** The 401 body every function returns, so the client can tell them apart. */
export function unauthorized(auth) {
  return {
    error: (auth && auth.error) || "Unauthorized",
    env_set: !!process.env.ADMIN_PASSWORD,
    google_configured: !!(process.env.GOOGLE_CLIENT_ID || "").trim(),
  };
}
