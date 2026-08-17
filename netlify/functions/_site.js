import { getStore } from "@netlify/blobs";

// Every blob store this site uses is namespaced by SITE_KEY, so a second site
// could run the same functions against its own data without colliding.
//
//   content -> "joi-content"      feedback -> "joi-feedback"
//   images  -> "joi-images"       tracks   -> "joi-tracks"
//
// Set SITE_KEY in the Netlify environment to change it. It defaults to "joi"
// so nothing has to be configured for this site.
//
// The stores were originally unprefixed ("content", "feedback", …) and still
// hold live data, so reads fall through to the legacy store when the namespaced
// one has nothing yet:
//
//   - content and feedback hold a single key each, so the legacy value is
//     copied across the first time it is read and the site is migrated after
//     one request.
//   - images and tracks hold one blob per file. Copying them all in a request
//     would risk a timeout, so those reads simply fall back and old files keep
//     serving from where they are. Everything uploaded from now on is
//     namespaced, and the legacy store empties itself as old files are deleted.

export const SITE_KEY = (process.env.SITE_KEY || "joi").trim() || "joi";

const LEGACY_NAMES = {
  content:  "content",
  feedback: "feedback",
  images:   "images",
  tracks:   "tracks",
};

export function storeName(kind) {
  return `${SITE_KEY}-${kind}`;
}

export function siteStore(kind, opts = {}) {
  return getStore({ name: storeName(kind), consistency: "strong", ...opts });
}

export function legacyStore(kind, opts = {}) {
  const name = LEGACY_NAMES[kind];
  if (!name || name === storeName(kind)) return null;
  return getStore({ name, consistency: "strong", ...opts });
}

// Read a single-key store, adopting the pre-namespace value the first time.
export async function readJsonWithLegacy(kind, key) {
  const store = siteStore(kind);
  const current = await store.get(key, { type: "json" }).catch(() => null);
  if (current != null) return { store, data: current, migrated: false };

  const old = legacyStore(kind);
  if (!old) return { store, data: null, migrated: false };

  const legacy = await old.get(key, { type: "json" }).catch(() => null);
  if (legacy == null) return { store, data: null, migrated: false };

  // Copy it across so this only ever happens once.
  await store.setJSON(key, legacy).catch(() => null);
  return { store, data: legacy, migrated: true };
}

// Read one blob (image/track bytes), falling back to the legacy store.
export async function readBlobWithLegacy(kind, key) {
  const store = siteStore(kind);
  const hit = await store.getWithMetadata(key, { type: "arrayBuffer" }).catch(() => null);
  if (hit && hit.data) return hit;

  const old = legacyStore(kind);
  if (!old) return null;
  return await old.getWithMetadata(key, { type: "arrayBuffer" }).catch(() => null);
}

// List a media store, merging in anything still sitting in the legacy one.
export async function listWithLegacy(kind) {
  const store = siteStore(kind);
  const mine = await store.list().catch(() => null);
  const keys = new Set((mine && mine.blobs ? mine.blobs : []).map(b => b.key));

  const old = legacyStore(kind);
  if (old) {
    const theirs = await old.list().catch(() => null);
    (theirs && theirs.blobs ? theirs.blobs : []).forEach(b => keys.add(b.key));
  }
  return [...keys];
}

// Delete from both, so removing a legacy file actually removes it.
export async function deleteEverywhere(kind, key) {
  await siteStore(kind).delete(key).catch(() => null);
  const old = legacyStore(kind);
  if (old) await old.delete(key).catch(() => null);
}
