import { siteStore } from "./_site.js";
import { SITE, escapeHtml, shareTags } from "./_share.js";

// Serves /profile/<slug> with its Open Graph tags already in the HTML.
//
//   GET /profile/<slug>  -> profile.html, with <title> and og:* filled in
//
// One page renders every creator, and it fetches its own data after loading.
// That is fine for a person, whose browser runs the script — but a social
// scraper does not. Facebook, X, Discord, Bluesky, Reddit and iMessage all
// read the tags out of the HTML they are served and nothing else, so a
// client-rendered page shares as a bare link no matter what the script would
// have put there.
//
// So the shell is fetched, the tags for this creator are spliced into its
// <head>, and the result is what goes out. The page itself is untouched and
// still renders exactly as it did; this only front-runs it with the facts a
// scraper needs. /profile.html is not rewritten, so fetching it here cannot
// loop back into this function.

const SHELL = "/profile.html";

// Scrapers re-fetch often and creators edit rarely. A short shared cache keeps
// a burst of shares off the blob store while letting an edit show up quickly.
const CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

export default async (req) => {
  const url = new URL(req.url);
  const slug = decodeURIComponent(url.pathname.replace(/^\/profile\/?/, "")).replace(/\/+$/, "");

  const shell = await fetch(new URL(SHELL, url.origin), {
    headers: { "x-shell-request": "1" },
  }).catch(() => null);

  // Without the shell there is no page to serve; let the platform's own 404
  // handle it rather than inventing one.
  if (!shell || !shell.ok) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }
  const html = await shell.text();

  const profile = await readProfile(slug);

  // An unpublished or unknown slug still renders — the page says its own piece
  // about that — but it is given the site's card rather than a person's, and
  // told not to be indexed.
  const known = !!profile;

  const name = known ? profile.name || slug : SITE.name;
  const tagline = (known && profile.tagline) || SITE.tagline;

  // What a creator's link shows, best first:
  //
  //   1. the card they built — their avatar on their banner, their words;
  //   2. failing that, their avatar on its own, as a square preview;
  //   3. only then the site's card.
  //
  // Step 2 matters. A creator who has filled in a profile but never opened the
  // card builder would otherwise share under somebody else's branding, which
  // is worse than a plain picture of them: it reads as the wrong person's
  // page. A square card is the honest shape for an avatar — stretching one
  // into 1200x630 crops it to a band across their face.
  const card = known && profile.shareImage;
  const avatarOnly = !card && known && profile.avatar;
  const image = card || avatarOnly || SITE.card;

  // A creator's page is titled for them; an unknown slug is just the site.
  const title = known ? `${name} · ${SITE.name}` : SITE.name;

  const tags = shareTags({
    url: `${url.origin}/profile/${encodeURIComponent(slug)}`,
    title,
    description: tagline,
    image: absolute(image, url.origin),
    // Only a built card is known to be 1200x630. An avatar is whatever shape
    // it was uploaded at, so it is offered as a square summary instead of
    // being declared a wide one it is not.
    wide: !avatarOnly,
    type: "profile",
    noindex: !known,
  });

  return new Response(inject(html, tags, escapeHtml(title)), {
    status: known ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": CACHE },
  });
};

async function readProfile(slug) {
  if (!slug) return null;
  const data = await siteStore("profiles").get("profiles", { type: "json" }).catch(() => null);
  const all = data && data.profiles && typeof data.profiles === "object" ? data.profiles : {};
  const p = all[slug];
  // Matches /api/profile/<slug>: an unpublished profile is nobody else's to see.
  return p && p.published ? p : null;
}

// og:image must be absolute — a relative path is the one thing every scraper
// agrees to reject.
function absolute(src, origin) {
  if (!src) return "";
  return /^https?:\/\//i.test(src) ? src : `${origin}${src.startsWith("/") ? "" : "/"}${src}`;
}

// The shell's <title> is the placeholder word "Profile"; replace it, and put
// the tags just before </head> so they win over anything static above them.
function inject(html, tags, title) {
  const titled = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  return titled.includes("</head>")
    ? titled.replace("</head>", `${tags}\n</head>`)
    : `${tags}\n${titled}`;
}

export const config = { path: "/profile/*" };
