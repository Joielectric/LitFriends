import { siteStore } from "./_site.js";

// The register of who may sign in, and who they are once they do.
//
// A record looks like:
//   { email, slug, name, role, status, invitedAt, firstSeenAt, lastSeenAt }
//
//   slug    matches an entry in site-config's `artists` where there is one, so
//           an existing profile page and its credits come along for free.
//   role    "owner" or "creator". The owner is decided by OWNER_EMAIL, not by
//           this list, so a bad edit here cannot orphan the site.
//   status  "invited" until they first sign in, then "active". Removing a
//           record revokes access immediately.
//
// Signup is invite-only: an email that is not in this list (and not in
// ADMIN_EMAILS) cannot get in, so nobody can provision themselves a profile.
//
// ADMIN_EMAILS still works and is checked first. It is the bootstrap — the
// registry lives in a blob store, and if that read ever fails the owner must
// still be able to sign in and fix it.

const KEY = "creators";

// The creator terms shown on Get started in the Content Manager. Bump this
// when the wording changes and everyone is asked to accept them again.
export const TERMS_VERSION = "2026-10-29";

/** When this record accepted the current terms, or "" if it has not. */
export const termsAcceptedAt = (rec) =>
  rec && rec.termsVersion === TERMS_VERSION ? rec.termsAt || "" : "";

const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();

export const slugify = (v) =>
  String(v == null ? "" : v)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export async function readCreators() {
  try {
    const data = await siteStore("creators").get(KEY, { type: "json" });
    return data && Array.isArray(data.creators) ? data.creators : [];
  } catch {
    // A store that has never been written reads as empty, not as an error, but
    // never let a storage hiccup lock everyone out — ADMIN_EMAILS still works.
    return [];
  }
}

export async function writeCreators(creators) {
  await siteStore("creators").setJSON(KEY, { creators });
}

export function findCreator(creators, email) {
  const e = norm(email);
  return creators.find((c) => norm(c.email) === e) || null;
}

// Page names nobody can pick for themselves: the site's own addresses, and
// the artists whose pages were built by hand (js/site-config.js `artists`),
// which the owner hands over by inviting them with that name.
export const RESERVED_SLUGS = new Set([
  "admin", "api", "about", "catalog", "catalogue", "contact", "creator", "creators", "feedback",
  "help", "home", "images", "login", "logout", "me", "new", "owner", "privacy", "profile", "profiles",
  "settings", "support", "terms", "the-velvet-key", "thevelvetkey", "tools", "velvet-key", "cyoaudio",
  "joi-electric", "joielectric", "loona-licks", "misskittensk", "hisbadgirl77", "wellnobodysperfect",
  "naughtiwolf", "lotus-kitty", "filthy-bunny", "la-sphynxxx",
]);

/**
 * Whether a creator may choose this page name for themselves: why not, or "".
 * `profiles` is the profiles store's map, so names in use or once used by a
 * renamed page (formerSlugs) count as taken too.
 */
export function slugProblem(slug, creators, profiles, exceptEmail) {
  if (!slug) return "Use some letters or numbers.";
  if (slug.length < 3) return "Use at least 3 letters or numbers.";
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved. Pick another.`;
  if (slugTaken(creators, slug, exceptEmail)) return `"${slug}" is already someone's page.`;
  const all = profiles && typeof profiles === "object" ? profiles : {};
  if (all[slug]) return `"${slug}" is already someone's page.`;
  if (Object.values(all).some((p) => p && (p.formerSlugs || []).includes(slug))) return `"${slug}" was someone's page. Pick another.`;
  return "";
}

/** Slugs already taken, so two creators cannot claim one profile. */
export function slugTaken(creators, slug, exceptEmail) {
  const s = norm(slug);
  const except = norm(exceptEmail);
  return creators.some((c) => norm(c.slug) === s && norm(c.email) !== except);
}

/**
 * Note that someone signed in. Flips "invited" to "active" and keeps a
 * last-seen stamp, so the owner can see who has actually turned up.
 *
 * Deliberately best-effort: a failed write here must not block a sign-in.
 */
export async function touchCreator(email) {
  try {
    const creators = await readCreators();
    const rec = findCreator(creators, email);
    if (!rec) return null;
    const now = new Date().toISOString();
    if (!rec.firstSeenAt) rec.firstSeenAt = now;
    if (rec.status === "invited") rec.status = "active";
    rec.lastSeenAt = now;
    await writeCreators(creators);
    return rec;
  } catch {
    return null;
  }
}
