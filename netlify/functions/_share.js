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

/** The tag block for one page. `image` must already be absolute. */
export function shareTags({ url, title, description, image, type = "website", noindex = false }) {
  const meta = [
    ["og:type", type],
    ["og:site_name", SITE.name],
    ["og:url", url],
    ["og:title", title],
    ["og:description", description],
    ["og:image", image],
    // Stated so a scraper can lay out the card before it has fetched the
    // picture, which is what stops the preview flashing at the wrong shape.
    ["og:image:width", image ? "1200" : ""],
    ["og:image:height", image ? "630" : ""],
    ["og:image:alt", title],
  ];

  const named = [
    ["twitter:card", image ? "summary_large_image" : "summary"],
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
