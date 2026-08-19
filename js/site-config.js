/* Single source of truth for the lists the site shares.
 *
 * Before this file these tables were copy-pasted across catalog.html,
 * tools.html, js/audio.js and the post templates — five copies of the platform
 * list, four of the audience tags — and they had already drifted (NB4A counted
 * as an audience tag in the catalogue but not in the Content Manager).
 *
 * Add a platform, an entry type, an audience tag or an artist here and every
 * page picks it up. Nothing else should hold its own copy.
 *
 * Load this before any script that reads it:
 *     <script src="/js/site-config.js"></script>
 */
(function () {
  'use strict';

  var SITE = {

    // ── Who the site is ───────────────────────────────────────────────────
    identity: {
      name:     'JOI Electric',
      tagline:  'Intimate, collaborative erotic audio — crafted with intention.',
      domain:   'joielectric.com',
      icon:     '/images/JOI_Icon.png',
      favicon:  '/images/JOI_Favicon.png',
      banner:   '/images/JOIElectric5BannerSide.png',
      backdrop: '/images/JOIWebBack.png',
      ageNote:  'Erotic Audio — 18+ only',
      // Whose site this is. The catalogue, the feedback picker and anything
      // else public shows only work this artist is credited on — collaborators
      // share the same content store to build their own pages, and their
      // uncredited work should not surface here. Must match an `artists` slug.
      owner:    'joi-electric',
    },

    // NOTE: platforms/providers are deliberately NOT here. They are managed in
    // the Content Manager and travel with the content payload, so putting a
    // copy in this file would re-create the drift it exists to prevent.

    // Extra places a listener might have found something, offered alongside
    // the live provider list on the feedback form.
    extraSources: ['Bluesky', 'Reddit', 'Other'],

    // ── What a piece of work is ───────────────────────────────────────────
    // Audio is the default and stays unbadged in the catalogue.
    entryTypes: [
      { key: 'audio',  label: 'Audio',  plural: 'Audio',    icon: '🎧' },
      { key: 'script', label: 'Script', plural: 'Scripts',  icon: '📜' },
      { key: 'story',  label: 'Story',  plural: 'Stories',  icon: '📖' },
      { key: 'poem',   label: 'Poem',   plural: 'Poems',    icon: '✍️' },
      { key: 'music',  label: 'Music',  plural: 'Music',    icon: '🎹' },
    ],

    // Types that are read rather than listened to.
    textTypes: ['script', 'story', 'poem'],

    // ── Tagging ───────────────────────────────────────────────────────────
    // Audience tags sort first and are styled apart from ordinary tags.
    audienceTags: [
      'M4F', 'F4M', 'M4M', 'F4F',
      'MF4A', 'MF4F', 'MF4M', 'MM4F', 'FF4M',
      'M4A', 'F4A', 'A4A', 'NB4A',
    ],

    // ── Credits ───────────────────────────────────────────────────────────
    // Order here is the order credits are shown in.
    creditRoles: [
      { key: 'voiceArtists', label: 'Voice',    postLabel: 'Voice Acting' },
      { key: 'writers',      label: 'Writer',   postLabel: 'Writers'      },
      { key: 'producers',    label: 'Producer', postLabel: 'Production'   },
      { key: 'editors',      label: 'Editor',   postLabel: 'Editing'      },
      { key: 'musicians',    label: 'Music',    postLabel: 'Music'        },
    ],

    // ── Artists with a page on this site ──────────────────────────────────
    // A credited name matching one of these links to the local page in
    // preference to the collaborator's external link.
    artists: [
      { slug: 'joi-electric',       name: 'JOI Electric',           icon: '/images/JOI_Icon.png',                        page: 'profiles/joi-electric.html',       tagline: 'Producer · Editor · Musician · Sound Designer' },
      { slug: 'loona-licks',        name: 'Loona Licks',            icon: '/images/LL_Icon.png',                         page: 'profiles/loona-licks.html',        tagline: 'Voice Artist · Collaborator · Currently on Hiatus' },
      { slug: 'misskittensk',       name: 'MissKittenSK',           icon: '/images/MissKittenSKClub.png',                page: 'profiles/misskittenSK.html',       tagline: 'A decade of debauched erotic audio · Retired', aliases: ['miss kitten sk'] },
      { slug: 'hisbadgirl77',       name: 'HisBadGirl77',           icon: '/images/HBG_WIngs.png',                       page: 'profiles/hisbadgirl77.html',       tagline: 'Voice Artist · Writer · Collaborator', aliases: ['his bad girl 77'] },
      { slug: 'wellnobodysperfect', name: "Well Nobody's Perfect",  icon: '/images/WNP_Icon.png',                        page: 'profiles/wellnobodysperfect.html', tagline: 'Voice Artist · Funny · Delightfully Unpredictable', aliases: ['wellnobodysperfect'] },
      { slug: 'naughtiwolf',        name: 'NaughtiWolf',            icon: '/images/NW_Icon.png',                         page: 'profiles/naughtiwolf.html',        tagline: 'Voice Artist · BFE · Narrative Collaborator' },
      { slug: 'lotus-kitty',        name: 'Lotus Kitty',            icon: '/images/LK_Icon.png',                         page: 'profiles/lotus-kitty.html',        tagline: 'Voice Artist · Demisexual · Storyteller' },
      { slug: 'filthy-bunny',       name: 'Filthy Bunny',           icon: '/images/Filthy_Bunny_Avatar_GreenEyes.png',   page: 'profiles/filthy-bunny.html',       tagline: 'Voice Artist · Writer · Switchy Sub' },
      { slug: 'la-sphynxxx',        name: 'LaSphynxxx',             icon: '/images/LS_ICON.png',                         page: 'profiles/la-sphynxxx.html',        tagline: 'Voice Artist · Singer · Free Content · Open Requests', aliases: ['la sphynxxx', 'sphynxxx'] },
    ],
  };

  // ── Derived lookups ───────────────────────────────────────────────────
  // Built once here so no consumer has to rebuild them.

  function norm(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  SITE.typeKeys   = SITE.entryTypes.map(function (t) { return t.key; });
  SITE.typeLabels = {};
  SITE.typeIcons  = {};
  SITE.typePlural = {};
  SITE.entryTypes.forEach(function (t) {
    SITE.typeLabels[t.key] = t.label;
    SITE.typeIcons[t.key]  = t.icon;
    SITE.typePlural[t.key] = t.plural;
  });

  SITE.typeOf = function (entry) {
    var t = (entry && entry.type) || 'audio';
    return SITE.typeLabels[t] ? t : 'audio';
  };
  SITE.isTextType = function (entry) {
    return SITE.textTypes.indexOf(SITE.typeOf(entry)) !== -1;
  };
  SITE.isAudienceTag = function (tag) {
    return SITE.audienceTags.indexOf(String(tag || '').toUpperCase()) !== -1;
  };

  SITE.creditKeys   = SITE.creditRoles.map(function (r) { return r.key; });
  SITE.creditLabels = {};
  SITE.creditRoles.forEach(function (r) { SITE.creditLabels[r.key] = r.label; });

  SITE.artistLabels   = {};
  SITE.artistIcons    = {};
  SITE.artistTaglines = {};
  SITE.profilePages   = {};   // normalised name -> page
  SITE.artists.forEach(function (a) {
    SITE.artistLabels[a.slug]   = a.name;
    SITE.artistIcons[a.slug]    = a.icon;
    SITE.artistTaglines[a.slug] = a.tagline;
    if (a.page) {
      SITE.profilePages[norm(a.name)] = a.page;
      SITE.profilePages[norm(a.slug)] = a.page;
      (a.aliases || []).forEach(function (alias) { SITE.profilePages[norm(alias)] = a.page; });
    }
  });

  // Every name an artist might be credited under: slug, display name, aliases.
  SITE.artistNames = {};
  SITE.artists.forEach(function (a) {
    var names = [norm(a.slug), norm(a.name)].concat((a.aliases || []).map(norm));
    SITE.artistNames[a.slug] = names.filter(function (n, i) { return n && names.indexOf(n) === i; });
  });

  // Is this artist on the entry — either as an owning artist or credited in
  // any role? One definition, so the catalogue, the profile pages and the
  // feedback picker can never disagree about whose work something is.
  SITE.creditedIn = function (entry, slug) {
    if (!entry || !slug) return false;
    var names = SITE.artistNames[slug] || [norm(slug)];
    var owners = entry.artists || (entry.artist ? [entry.artist] : []);
    if (owners.some(function (o) { return names.indexOf(norm(o)) !== -1; })) return true;
    var credits = entry.credits || {};
    return Object.keys(credits).some(function (role) {
      return (credits[role] || []).some(function (n) { return names.indexOf(norm(n)) !== -1; });
    });
  };

  // Work belonging on this site.
  SITE.isOwnWork = function (entry) {
    return !SITE.identity.owner || SITE.creditedIn(entry, SITE.identity.owner);
  };

  // A credit points at the local page when there is one.
  SITE.profilePage = function (name, label) {
    return SITE.profilePages[norm(label)] || SITE.profilePages[norm(name)] || '';
  };

  window.SITE_CONFIG = SITE;
})();
