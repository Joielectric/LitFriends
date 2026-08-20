import { siteStore } from "./_site.js";
import { authorize, unauthorized } from "./_auth.js";
import { readCreators, findCreator } from "./_creators.js";

// Creator profiles: the content behind /profile/<slug>.
//
//   GET  /api/profiles            -> every published profile (public)
//   GET  /api/profile/<slug>      -> one profile (public)
//   POST /api/profiles { action: "mine" }            -> yours, created if new
//   POST /api/profiles { action: "save", profile }   -> save yours
//   POST /api/profiles { action: "list" }            -> all, owner only
//
// A creator may only write their own profile. The slug is taken from their
// signed-in identity and never from the request body, so there is nothing to
// tamper with — asking to save someone else's profile is not rejected so much
// as impossible to express. The owner is the exception and may pass a slug.
//
// Everything stored here is plain text. The page renders it as text, never as
// markup, so a creator cannot put a script on the site by typing one into
// their bio.

const KEY = "profiles";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

const MAX = {
  name: 80, tagline: 140, bio: 4000, url: 500, label: 40, links: 12, color: 20,
  updateTitle: 140, updateBody: 3000, updates: 20,
  aliases: 12,
};

// Strips control characters but keeps newlines, so a bio can have paragraphs.
const clean = (v, max) =>
  String(v == null ? "" : v)
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

// Relative paths are fine — profile images live on this site. Anything with a
// scheme must be http(s), so no javascript: or data: URLs get through.
function safeUrl(v) {
  const u = clean(v, MAX.url);
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return "";
  return u;
}

export const THEMES = ["electric", "ember", "orchid", "moss", "noir"];
export const SECTIONS = ["updates", "about", "works", "feedback", "links"];

/** What a profile looks like before anyone has edited it. */
export function defaultProfile(slug, name) {
  return {
    slug,
    name: name || slug,
    tagline: "",
    bio: "",
    avatar: "",
    banner: "",
    theme: "electric",
    accent: "",
    links: [],
    // Other names this person is credited under in the catalogue. Credits are
    // free text and drift — a Reddit handle here, a display name there — so a
    // creator's work is found by any name they answer to, not just this one.
    aliases: [],
    // A creator's own news, shown on their page only. The site's News is the
    // landing page and stays the owner's.
    updates: [],
    sections: { updates: true, about: true, works: true, feedback: true, links: true },
    published: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Every name already spoken for by somebody else — their display name and
// anything they have adopted.
function takenBy(slug, profiles) {
  const taken = new Set();
  Object.values(profiles || {}).forEach((p) => {
    if (!p || p.slug === slug) return;
    if (p.name) taken.add(String(p.name).toLowerCase());
    (p.aliases || []).forEach((a) => taken.add(String(a).toLowerCase()));
  });
  return taken;
}

function sanitize(input, base, allProfiles) {
  const out = { ...base };
  if (input.name !== undefined) out.name = clean(input.name, MAX.name) || base.name;
  if (input.tagline !== undefined) out.tagline = clean(input.tagline, MAX.tagline);
  if (input.bio !== undefined) out.bio = clean(input.bio, MAX.bio);
  if (input.avatar !== undefined) out.avatar = safeUrl(input.avatar);
  if (input.banner !== undefined) out.banner = safeUrl(input.banner);
  if (input.theme !== undefined) {
    out.theme = THEMES.includes(input.theme) ? input.theme : base.theme;
  }
  // A free-text colour would end up inside a style attribute, so only allow the
  // one shape that cannot escape it.
  if (input.accent !== undefined) {
    const a = clean(input.accent, MAX.color);
    out.accent = /^#[0-9a-f]{3,8}$/i.test(a) ? a : "";
  }
  if (Array.isArray(input.links)) {
    out.links = input.links
      .slice(0, MAX.links)
      .map((l) => ({ label: clean(l && l.label, MAX.label), url: safeUrl(l && l.url) }))
      .filter((l) => l.label && l.url);
  }
  if (Array.isArray(input.aliases)) {
    const seen = new Set();
    const taken = takenBy(base.slug, allProfiles);
    const refused = [];
    out.aliases = input.aliases
      .map((a) => clean(a, MAX.name))
      .filter((a) => {
        const k = a.toLowerCase();
        if (!a || seen.has(k)) return false;
        // A credited name belongs to one person. Without this, adopting a name
        // would quietly take another creator's work off their page.
        if (taken.has(k)) { refused.push(a); return false; }
        seen.add(k);
        return true;
      })
      .slice(0, MAX.aliases);
    if (refused.length) out.__refused = refused;
  }
  if (Array.isArray(input.updates)) {
    out.updates = input.updates
      .slice(0, MAX.updates)
      .map((u) => ({
        id: clean(u && u.id, 40) || newId(),
        date: clean(u && u.date, 10),
        title: clean(u && u.title, MAX.updateTitle),
        body: clean(u && u.body, MAX.updateBody),
        image: safeUrl(u && u.image),
        link: safeUrl(u && u.link),
        linkLabel: clean(u && u.linkLabel, MAX.label),
      }))
      // An update with neither words nor a picture is not an update.
      .filter((u) => u.title || u.body || u.image);
  }
  if (input.sections && typeof input.sections === "object") {
    out.sections = {};
    for (const s of SECTIONS) out.sections[s] = input.sections[s] !== false;
  }
  if (input.published !== undefined) out.published = !!input.published;
  out.updatedAt = new Date().toISOString();
  return out;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function readAll() {
  const data = await siteStore("profiles").get(KEY, { type: "json" });
  return data && data.profiles && typeof data.profiles === "object" ? data.profiles : {};
}
const writeAll = (profiles) => siteStore("profiles").setJSON(KEY, { profiles });

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", {
      status: 200,
      headers: { ...CORS, "Access-Control-Allow-Headers": "content-type,authorization", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" },
    });
  }

  const url = new URL(req.url);

  // ── Public reads ─────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const all = await readAll();
    const one = decodeURIComponent(url.pathname.replace(/^\/api\/profile\//, ""));

    if (url.pathname.startsWith("/api/profile/")) {
      const p = all[one];
      // An unpublished profile is invisible until its owner says otherwise.
      if (!p || !p.published) return json({ error: "Not found" }, 404);
      return json({ ok: true, profile: p });
    }
    const published = Object.values(all).filter((p) => p && p.published);
    return json({ ok: true, profiles: published });
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

  const all = await readAll();

  if (body.action === "list") {
    if (!auth.isOwner) return json({ error: "Only the site owner can list every profile." }, 403);
    return json({ ok: true, profiles: all });
  }

  // Which profile this request is allowed to touch. Only the owner may name
  // one; for everyone else it comes from who they signed in as.
  let slug = auth.slug;
  if (auth.isOwner && body.slug) slug = String(body.slug);
  if (!slug) {
    return json({ error: "No profile is linked to your account yet. Ask the site owner to set one." }, 400);
  }

  if (body.action === "mine") {
    let profile = all[slug];
    if (!profile) {
      // First visit: hand them the default template rather than an error.
      const rec = findCreator(await readCreators(), auth.email);
      profile = defaultProfile(slug, (rec && rec.name) || auth.name || slug);
      all[slug] = profile;
      await writeAll(all);
    }
    return json({ ok: true, profile, slug, isOwner: !!auth.isOwner });
  }

  if (body.action === "save") {
    // Same naming as "mine": the invite is what the site calls them, so a
    // profile created by a save is not named after whatever Google returned.
    let base = all[slug];
    if (!base) {
      const rec = findCreator(await readCreators(), auth.email);
      base = defaultProfile(slug, (rec && rec.name) || auth.name || slug);
    }
    const profile = sanitize(body.profile || {}, base, all);
    profile.slug = slug; // never movable by a save
    const refused = profile.__refused;
    delete profile.__refused;
    all[slug] = profile;
    await writeAll(all);
    return json({ ok: true, profile, refused: refused || [] });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: ["/api/profiles", "/api/profile/*"] };
