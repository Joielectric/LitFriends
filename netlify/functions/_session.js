import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { siteStore } from "./_site.js";

// Staying signed in.
//
// A Google ID token is only good for an hour, so relying on it directly means
// signing in again every visit. Instead, one successful sign-in mints a session
// token of this site's own — a signed statement of who you are and until when —
// which rides in an HttpOnly cookie.
//
// The token is signed, not encrypted: anyone holding it can read the email
// inside, but cannot change it or forge another without the secret. HttpOnly
// keeps it out of reach of page scripts, so a bug in the Content Manager cannot
// leak it.
//
// The signing secret is generated on first use and kept in the blob store, so
// there is no extra environment variable to set. Deleting it signs everyone
// out, which is the emergency lever if a session is ever thought stolen.

const SECRET_KEY = "secret";
const SESSION_DAYS = 30;

export const COOKIE_NAME = "joi_session";

let cachedSecret = null;

async function getSecret() {
  if (cachedSecret) return cachedSecret;
  const store = siteStore("session");
  let secret = await store.get(SECRET_KEY);
  if (!secret) {
    secret = randomBytes(32).toString("hex");
    await store.set(SECRET_KEY, secret);
  }
  cachedSecret = secret;
  return secret;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

async function sign(data) {
  return createHmac("sha256", await getSecret()).update(data).digest("base64url");
}

/** A signed "this is who they are, until this moment" token. */
export async function createSession(email, days = SESSION_DAYS) {
  const payload = b64url(
    JSON.stringify({ email, exp: Date.now() + days * 24 * 60 * 60 * 1000 })
  );
  return `${payload}.${await sign(payload)}`;
}

/** The email inside a valid session, or "" for anything else. */
export async function readSession(token) {
  const [payload, mac] = String(token || "").split(".");
  if (!payload || !mac) return "";

  const expected = await sign(payload);
  // Compared in constant time so the comparison itself cannot be used to guess
  // a signature byte by byte.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "";

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims.email || !claims.exp || Date.now() > claims.exp) return "";
    return String(claims.email);
  } catch {
    return "";
  }
}

export function cookieFromRequest(req) {
  const header = req.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return "";
}

// Lax rather than Strict: the cookie should survive following a link into the
// Content Manager, and it is never used for a cross-site write.
export function sessionCookie(token, days = SESSION_DAYS) {
  const maxAge = token ? days * 24 * 60 * 60 : 0;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
