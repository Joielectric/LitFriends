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

const MAX = { name: 80, tagline: 140, bio: 4000, url: 500, label: 40, links: 12, color: 20 };

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
export const SECTIONS = ["about", "works", "feedback", "links"];

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
    sections: { about: true, works: true, feedback: true, links: true },
    published: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function sanitize(input, base) {
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
  if (input.sections && typeof input.sections === "object") {
    out.sections = {};
    for (const s of SECTIONS) out.sections[s] = input.sections[s] !== false;
  }
  if (input.published !== undefined) out.published = !!input.published;
  out.updatedAt = new Date().toISOString();
  return out;
}

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
    const base = all[slug] || defaultProfile(slug, auth.name || slug);
    const profile = sanitize(body.profile || {}, base);
    profile.slug = slug; // never movable by a save
    all[slug] = profile;
    await writeAll(all);
    return json({ ok: true, profile });
  }

  return json({ error: "Unknown action" }, 400);
};

export const config = { path: ["/api/profiles", "/api/profile/*"] };
