/* Every artist in the collective, not just the ones with a hand-built page.
 *
 * js/site-config.js lists the artists whose pages live in /profiles. Anyone
 * who joins later gets a profile in the Content Manager instead, served at
 * /profile/<slug>. This puts the two together:
 *
 *   Artists.load()  -> Promise of [{ slug, name, icon, tagline, bio, href, isNew }]
 *                      hand-built artists first, in their usual order, then
 *                      every other published profile, A to Z. A published
 *                      profile for someone who already has a hand-built page
 *                      adds nothing: their own page stays where they link.
 *
 * Loading it also teaches site-config the newcomers' names and pages, so a
 * credit under one of those names links to their profile like any other.
 * Needs js/site-config.js first. Never fails: if the profiles cannot be
 * fetched, the hand-built artists are still returned.
 */
(function () {
  'use strict';
  var CFG = window.SITE_CONFIG;
  if (!CFG) { console.error('artists.js: js/site-config.js must load first'); return; }

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function root() { return /\/profiles\//.test(location.pathname) ? '../' : '/'; }

  function fixed() {
    return CFG.artists.map(function (a) {
      return {
        slug: a.slug, name: a.name, icon: a.icon, tagline: a.tagline || '', bio: '',
        href: a.page ? root() + a.page.replace(/^\//, '') : '/profile/' + encodeURIComponent(a.slug),
        isNew: false
      };
    });
  }

  var pending = null;
  function load() {
    if (pending) return pending;
    pending = fetch('/api/profiles')
      .then(function (r) { return r.ok ? r.json() : { profiles: [] }; })
      .catch(function () { return { profiles: [] }; })
      .then(function (d) {
        var list = fixed();
        // Anyone already listed, by slug or by any name they are credited under.
        var known = {};
        CFG.artists.forEach(function (a) {
          (CFG.artistNames[a.slug] || [norm(a.slug), norm(a.name)]).forEach(function (n) { known[n] = 1; });
        });
        var extra = (d && d.profiles || []).filter(function (p) {
          return p && p.slug && p.name && !known[norm(p.slug)] && !known[norm(p.name)];
        }).sort(function (a, b) { return norm(a.name).localeCompare(norm(b.name)); });

        extra.forEach(function (p) {
          var href = '/profile/' + encodeURIComponent(p.slug);
          // Credits under their name, slug or aliases now lead to their profile.
          [p.name, p.slug].concat(p.aliases || []).forEach(function (n) {
            if (!norm(n)) return;
            CFG.profilePages[norm(n)] = href;
            CFG.registerArtistName(p.slug, n);
          });
          list.push({
            slug: p.slug, name: p.name, icon: p.avatar || '', tagline: p.tagline || '',
            bio: String(p.bio || '').split(/\n/)[0].slice(0, 180), href: href, isNew: true
          });
        });
        return list;
      });
    return pending;
  }

  window.Artists = { load: load };
})();
