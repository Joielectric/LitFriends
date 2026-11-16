import { siteStore, readJsonWithLegacy } from "./_site.js";
import { readCreators, writeCreators, slugify } from "./_creators.js";

// Renaming a creator's page: /profile/<old> becomes /profile/<new>, and,
// when a corrected display name comes with it, the name they are credited
// under too. Owner-only; called from /api/creators { action: "rename" }.
//
// The page name is how the site files everything a creator has, so it is
// moved everywhere at once:
//
//   creators   their sign-in record, which is what tells the site whose page
//              they are when they sign in
//   profiles   the profile itself, re-filed under the new name, with the old
//              one kept in formerSlugs so links to it still arrive
//              (profile-page.js and /api/profile/<old> answer for it)
//   content    the releases they own, credits under the old display name, and
//              their row in the collaborators list
//   images     the uploads filed under them
//   feedback   responses left for them
//
// Visits are not rewritten; visits.js counts the old address as theirs.

const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();

export class RenameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export async function renameCreator({ from, to, name }) {
  const oldSlug = norm(from);
  const newSlug = slugify(to);
  if (!oldSlug) throw new RenameError("Which page should be renamed?");
  if (!newSlug) throw new RenameError("Give the new page name some letters or numbers.");

  const profilesData = (await siteStore("profiles").get("profiles", { type: "json" }).catch(() => null)) || {};
  const profiles = profilesData.profiles && typeof profilesData.profiles === "object" ? profilesData.profiles : {};
  const creators = await readCreators();

  const profile = profiles[oldSlug];
  const creator = creators.find((c) => norm(c.slug) === oldSlug) || null;
  if (!profile && !creator) throw new RenameError(`There is no page called "${oldSlug}".`, 404);

  const sameSlug = newSlug === oldSlug;
  if (!sameSlug) {
    const takenByProfile = profiles[newSlug] ||
      Object.values(profiles).some((p) => p && p !== profile && (p.formerSlugs || []).map(norm).includes(newSlug));
    const takenByCreator = creators.some((c) => c !== creator && norm(c.slug) === newSlug);
    if (takenByProfile || takenByCreator) throw new RenameError(`The page name "${newSlug}" is already in use.`, 409);
  }

  const oldName = String((profile && profile.name) || (creator && creator.name) || "").trim();
  const newName = String(name == null ? "" : name).trim().slice(0, 80) || oldName;
  const nameChanged = !!oldName && !!newName && oldName !== newName;
  if (sameSlug && !nameChanged) throw new RenameError("Nothing to change: that is already its name.");

  const done = { slug: newSlug, name: newName, releases: 0, credits: 0, images: 0, feedback: 0 };

  // ── Profile ──
  if (profile) {
    const moved = { ...profile, slug: newSlug, name: newName };
    if (!sameSlug) {
      moved.formerSlugs = [...new Set([...(profile.formerSlugs || []), oldSlug].map(norm))].filter((s) => s && s !== newSlug);
      delete profiles[oldSlug];
    }
    profiles[newSlug] = moved;
    await siteStore("profiles").setJSON("profiles", { ...profilesData, profiles });
  }

  // ── Sign-in record ──
  if (creator) {
    creator.slug = newSlug;
    if (nameChanged) creator.name = newName;
    await writeCreators(creators);
  }

  // ── Releases, credits and the collaborators list ──
  const { store: contentStore, data: content } = await readJsonWithLegacy("content", "audio");
  if (content && Array.isArray(content.entries)) {
    const isOld = (n) => nameChanged && norm(n) === norm(oldName);
    content.entries.forEach((e) => {
      if (!e) return;
      if (!sameSlug && e.owner === oldSlug) { e.owner = newSlug; done.releases++; }
      if (nameChanged && e.credits && typeof e.credits === "object") {
        Object.keys(e.credits).forEach((role) => {
          if (!Array.isArray(e.credits[role])) return;
          e.credits[role] = e.credits[role].map((n) => (isOld(n) ? (done.credits++, newName) : n));
        });
      }
    });
    (content.collaborators || []).forEach((c) => {
      if (!c) return;
      if (norm(c.profile) === oldSlug || (nameChanged && norm(c.name) === norm(oldName))) {
        if (!sameSlug && (norm(c.profile) === oldSlug || /^\/profile\//.test(c.url || ""))) {
          c.profile = newSlug;
          c.url = "/profile/" + encodeURIComponent(newSlug);
        }
        if (nameChanged) c.name = newName;
      }
    });
    await contentStore.setJSON("audio", content);
  }

  if (!sameSlug) {
    // ── Uploads ──
    const imgStore = siteStore("images");
    const idx = (await readJsonWithLegacy("images", "__index.json")).data;
    if (idx && Array.isArray(idx.images)) {
      idx.images.forEach((i) => { if (i && i.owner === oldSlug) { i.owner = newSlug; done.images++; } });
      if (done.images) await imgStore.setJSON("__index.json", idx);
    }

    // ── Feedback ──
    const fb = (await readJsonWithLegacy("feedback", "responses")).data;
    if (fb && Array.isArray(fb.responses)) {
      fb.responses.forEach((r) => { if (r && r.for === oldSlug) { r.for = newSlug; done.feedback++; } });
      if (done.feedback) await siteStore("feedback").setJSON("responses", fb);
    }
  }

  return done;
}

/** The profile a former page name now belongs to, or null. */
export function findByFormerSlug(profiles, slug) {
  const s = norm(slug);
  if (!s || !profiles) return null;
  return Object.values(profiles).find((p) => p && (p.formerSlugs || []).map(norm).includes(s)) || null;
}
