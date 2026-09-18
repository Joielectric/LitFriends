// What a link to this site looks like when it is posted somewhere.
//
// Facebook, X, Discord, Bluesky, Reddit, Slack and iMessage all read the same
// Open Graph tags, with X reading a couple of twitter: ones on top. None of
// them runs the page's JavaScript, so every fact in a preview has to be in the
// HTML as served.
//
// The static pages carry their tags in the file. This module is for the pages
// that cannot: /profile/<slug> is one shell rendering every creator, so its
// tags are spliced in per request (profile-page.js).
//
// Environment:
//   SITE_KEY   which site this deploy is; "joi" (default) or "ca"
//
// Note on adult content: Facebook is inconsistent about rendering preview
// images from adult domains and may show the title and description without the
// picture. Nothing here can change that — Discord, Bluesky and X are reliable.

const SITE_KEY = (process.env.SITE_KEY || "joi").trim() || "joi";

const SITES = {
  joi: {
    name: "JOI Electric",
    tagline: "You didn't come here by accident.",
    card: "/images/share/joi-electric.png",
  },
  ca: {
    name: "Consenting Adults",
    tagline: "Every voice here wanted to be heard.",
    card: "/images/share/consenting-adults.png",
  },
};

export const SITE = SITES[SITE_KEY] || SITES.joi;

export const escapeHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The tag block for one page. `image` must already be absolute.
 *
 *  `wide` says the picture really is a 1200x630 card. Pass false for anything
 *  whose shape is unknown — an avatar, say — so it is offered as a square
 *  summary rather than declared a banner it is not and cropped to a band. */
export function shareTags({
  url, title, description, image, type = "website", noindex = false, wide = true,
  siteName = SITE.name,
}) {
  const sized = image && wide;
  const meta = [
    ["og:type", type],
    // Usually the site. A creator's page names them instead: the small label a
    // preview puts above the title should say whose page it is.
    ["og:site_name", siteName],
    ["og:url", url],
    ["og:title", title],
    ["og:description", description],
    ["og:image", image],
    // Stated so a scraper can lay out the card before it has fetched the
    // picture, which is what stops the preview flashing at the wrong shape.
    // Only claimed where the size is actually known.
    ["og:image:width", sized ? "1200" : ""],
    ["og:image:height", sized ? "630" : ""],
    ["og:image:alt", title],
  ];

  const named = [
    ["twitter:card", sized ? "summary_large_image" : "summary"],
    ["twitter:title", title],
    ["twitter:description", description],
    ["twitter:image", image],
    ["description", description],
    ...(noindex ? [["robots", "noindex"]] : []),
  ];

  return [
    ...meta
      .filter(([, v]) => v)
      .map(([p, v]) => `  <meta property="${p}" content="${escapeHtml(v)}">`),
    ...named
      .filter(([, v]) => v)
      .map(([n, v]) => `  <meta name="${n}" content="${escapeHtml(v)}">`),
  ].join("\n");
}
