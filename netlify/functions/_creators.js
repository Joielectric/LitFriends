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
