(function () {
  'use strict';

  // Shared, genuinely static lists live in js/site-config.js so there is one
  // copy of each. Providers are not among them: they are managed in the
  // Content Manager and arrive with the content payload, so the list below is
  // only a seed that adoptProviders() merges the live one over.
  const CFG = window.SITE_CONFIG;
  if (!CFG) { console.error('audio.js: js/site-config.js must load first'); return; }

  const PROVIDERS = {
    soundgasm:  { label: 'Soundgasm',  canEmbed: false },
    literotica: { label: 'Literotica', canEmbed: false },
    audiochan:  { label: 'Audiochan',  canEmbed: false },
    hotaudio:   { label: 'HotAudio',   canEmbed: false },
    whyp:       { label: 'Whyp',       canEmbed: false },
    reddit:     { label: 'Reddit',     canEmbed: false },
    scriptoffer: { label: 'Script Offer', canEmbed: false, kind: 'script' },
    scriptbin:  { label: 'ScriptBin',  canEmbed: false, kind: 'script' },
    ellipsus:   { label: 'Ellipsus',   canEmbed: false, kind: 'script' },
  };

  function adoptProviders(list) {
    (list || []).forEach(p => {
      if (!p || !p.key) return;
      const existing = PROVIDERS[p.key] || {};
      PROVIDERS[p.key] = {
        label: p.label || p.key,
        canEmbed: !!existing.canEmbed,
        kind: p.kind === 'script' ? 'script' : 'audio',
      };
    });
  }

  const GENDER_TAGS = CFG.audienceTags;
  function isGenderTag(t) { return CFG.isAudienceTag(t); }

  const ARTIST_LABELS   = CFG.artistLabels;
  const ARTIST_ICONS    = CFG.artistIcons;
  const ARTIST_TAGLINES = CFG.artistTaglines;

  const CREDIT_LABELS = CFG.creditLabels;

  // Normalize: always return links array (backward compat with old provider/url fields)
  function getLinks(entry) {
    if (Array.isArray(entry.links) && entry.links.length) return entry.links;
    if (entry.provider && entry.url) return [{ provider: entry.provider, url: entry.url }];
    return [];
  }

  function artistInEntry(entry, artistId) {
    return CFG.creditedIn(entry, artistId);
  }

  function providerLabel(key) {
    return (PROVIDERS[key] || {}).label || key;
  }

  // Collaborators → clickable credit names
  let COLLAB = {};
  function normName(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function entryType(entry) { return CFG.typeOf(entry); }
  function typeBadge(entry) {
    const t = entryType(entry);
    return '<span class="ag-type-badge ag-type-' + t + '">' +
      '<span class="ag-type-ico" aria-hidden="true">' + CFG.typeIcons[t] + '</span>' +
      CFG.typeLabels[t] + '</span>';
  }

  function richText(str) {
    return escHtml(str).replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      var trail = '', m = u.match(/[.,;:!?)\]]+$/);
      if (m) { trail = m[0]; u = u.slice(0, -trail.length); }
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>' + trail;
    }).replace(/\r?\n/g, '<br>');
  }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
    return u.replace(/"/g, '%22');
  }

  function collabHtml(name, inRow) {
    const c = COLLAB[normName(name)];
    const label = c ? c.name : name;
    const stop = inRow ? ' data-stop="1"' : '';
    const page = CFG.profilePage(name, label);
    if (page) return '<a class="ag-collab-link" href="' + escHtml(page) + '"' + stop + '>' + escHtml(label) + '</a>';
    if (c && c.url) return '<a class="ag-collab-link" href="' + escHtml(c.url) + '" target="_blank" rel="noopener noreferrer"' + stop + '>' + escHtml(label) + '</a>';
    return escHtml(label);
  }

  // Every credited name, in role order, without repeats.
  function creditNames(entry) {
    const out = [], seen = {};
    const c = entry.credits || {};
    CFG.creditKeys.forEach(role => (c[role] || []).forEach(name => {
      const k = String(name).toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(name); }
    }));
    return out;
  }

  // Who is signed in, if anyone. Every page carrying a works list is public,
  // so this is asked once and quietly: a visitor gets nothing back and sees
  // nothing new.
  let WHO = null;
  // Kept, so a page that wants this twice — a works list and a profile editor
  // — still asks once, which was the point of asking alongside the catalogue
  // rather than after it.
  let whoAsked = null;
  function whoAmI() {
    if (whoAsked) return whoAsked;
    whoAsked = fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'who' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) { WHO = (d && d.ok && d.who) || null; return WHO; })
      .catch(function () { return null; });
    return whoAsked;
  }

  // The server decides this as well. Here it only decides whether to offer the
  // button. Work with no owner is the site owner's, from before creators kept
  // their own.
  function canEditEntry(entry) {
    if (!WHO || !entry) return false;
    if (WHO.isOwner) return true;
    return !!entry.owner && entry.owner === WHO.slug;
  }

  function editLinkHtml(entry, extraClass) {
    if (!canEditEntry(entry)) return '';
    const href = '/tools.html#edit=' + encodeURIComponent(entry.id || '');
    return '<a class="ag-edit' + (extraClass ? ' ' + extraClass : '') + '" href="' + href +
      '" data-stop="1" title="Open this in the Content Manager">Edit</a>';
  }

  function canEmbed(key) {
    return !!(PROVIDERS[key] || {}).canEmbed;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ag-styles')) return;
    const s = document.createElement('style');
    s.id = 'ag-styles';
    s.textContent = `
/* Every page that hosts a works list names its accent differently, so it is
   resolved once here and used as --ag-accent throughout. */
body {
  --ag-accent: var(--accent, var(--electric, #5b8de8));
  --ag-gender: var(--gender, #e8a44f);
}
.ag-filters {
  display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 1.6rem; align-items: center;
}
.ag-search {
  flex: 1; min-width: 160px;
  padding: 8px 12px;
  background: var(--surface-2, #111);
  border: 1px solid var(--border-mid, rgba(255,255,255,.25));
  border-radius: var(--radius, 3px);
  color: var(--text, #eee);
  font-size: 0.85rem;
}
.ag-search:focus { outline: none; border-color: var(--border-hi, rgba(255,255,255,.5)); }
.ag-filter-select {
  padding: 8px 12px;
  background: var(--surface-2, #111);
  border: 1px solid var(--border, rgba(255,255,255,.12));
  border-radius: var(--radius, 3px);
  color: var(--text-mid, #999);
  font-size: 0.82rem;
  cursor: pointer;
}
.ag-filter-select:focus { outline: none; border-color: var(--border-mid, rgba(255,255,255,.25)); }
.ag-filter-select option { background: #1a1a1a; color: #eee; }
.ag-artist-icons {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 1rem;
}
.ag-artist-icon-btn {
  background: none; border: 2px solid transparent; border-radius: 4px;
  padding: 2px; cursor: pointer; opacity: 0.55; transition: opacity .2s, border-color .2s, box-shadow .2s;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.ag-artist-icon-btn img { width: 38px; height: 38px; border-radius: 2px; object-fit: cover; display: block; }
/* Shown instead of an avatar when a credited artist has no icon of their own */
.ag-artist-icon-fallback {
  width: 38px; height: 38px; border-radius: 2px; display: flex;
  align-items: center; justify-content: center;
  background: var(--surface-2, #2a2020); border: 1px solid var(--border-mid, rgba(255,255,255,.22));
  font-family: "Cinzel", serif; font-size: 0.72rem; letter-spacing: .06em;
  color: var(--text-mid, #b09090);
}
.ag-artist-icon-btn span {
  font-family: "Cinzel", serif; font-size: 0.48rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-dim, #888); white-space: nowrap;
}
.ag-artist-icon-btn:hover { opacity: 0.85; border-color: rgba(232,99,79,0.5); }
.ag-artist-icon-btn.active { opacity: 1; border-color: var(--coral, #e8634f); box-shadow: 0 0 10px rgba(232,99,79,0.35); }
.ag-artist-icon-btn.active span { color: var(--coral, #e8634f); }
.ag-artist-icon-btn { position: relative; }
.ag-artist-tooltip {
  position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  background: var(--surface-3, #222); border: 1px solid var(--border-mid, rgba(255,255,255,.22));
  border-radius: 4px; padding: 6px 10px; white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity .15s; z-index: 100;
  box-shadow: 0 4px 16px rgba(0,0,0,.5);
}
.ag-artist-icon-btn:hover .ag-artist-tooltip { opacity: 1; }
.ag-artist-tooltip-name {
  display: block; font-family: "Cinzel", serif; font-size: 0.62rem;
  letter-spacing: .14em; text-transform: uppercase; color: var(--silver-hi, #f5f0ea);
  margin-bottom: 2px;
}
.ag-artist-tooltip-tag {
  display: block; font-size: 0.68rem; font-style: italic;
  color: var(--text-mid, #b09090); line-height: 1.4;
}

/* Track list */
.ag-grid {
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: var(--radius, 3px);
  overflow: hidden;
  max-width: 100%;
}
/* Four columns, as the catalogue has them: date, work, creators, links. */
.ag-thead {
  display: grid;
  grid-template-columns: 92px 2fr 1.1fr 1.6fr;
  gap: 0.8rem;
  padding: 0.7rem 1rem;
  background: var(--surface-2, #111);
  border-bottom: 1px solid var(--border, rgba(255,255,255,.1));
  font-family: "Cinzel", serif;
  font-size: 0.58rem; letter-spacing: .16em; text-transform: uppercase;
  color: var(--text-dim, #888);
}
.ag-row {
  display: grid;
  grid-template-columns: 92px 2fr 1.1fr 1.6fr;
  gap: 0.8rem;
  padding: 0.85rem 1rem;
  align-items: start;
  border-bottom: 1px solid var(--border, rgba(255,255,255,.1));
  background: var(--surface, #111);
  cursor: pointer;
  transition: background .15s;
}
.ag-row:last-child { border-bottom: none; }
.ag-row:hover { background: var(--surface-2, #181518); }

.ag-row-date {
  color: var(--text-dim, #888);
  font-size: 0.78rem;
  white-space: nowrap;
  padding-top: 2px;
}
.ag-row-trt {
  color: var(--ag-accent);
  font-size: 0.72rem; letter-spacing: .03em;
  margin-top: 3px;
}
.ag-row-main { min-width: 0; }
.ag-row-title {
  color: var(--silver-hi, #f5f0ea);
  font-weight: 600;
  font-size: 0.98rem;
  line-height: 1.3;
}
.ag-row-desc {
  color: var(--text-dim, #888);
  font-size: 0.82rem;
  margin-top: 3px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ag-row-artist {
  color: var(--text-mid, #999);
  font-size: 0.84rem; line-height: 1.4;
  min-width: 0;
}
.ag-tags {
  display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;
}
.ag-tag {
  padding: 1px 7px;
  border: 1px solid var(--border-mid, rgba(255,255,255,.18));
  border-radius: 12px;
  color: var(--text-mid, #999); font-size: 0.66rem; letter-spacing: .03em;
  cursor: default;
}
.ag-tag-gender {
  border-color: var(--ag-gender);
  color: var(--ag-gender);
  font-weight: 600;
  letter-spacing: .04em;
}
.ag-own-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1rem; }
.ag-own-tag {
  background: none; cursor: pointer;
  border: 1px solid var(--border-mid, rgba(255,255,255,.25));
  color: var(--text-mid, #999); border-radius: 999px;
  padding: 4px 11px; font-size: 0.74rem; letter-spacing: .04em;
  transition: border-color .15s, color .15s, background .15s;
}
.ag-own-tag:hover { border-color: var(--border-hi, rgba(255,255,255,.45)); color: var(--silver-hi, #f5f0ea); }
.ag-own-tag.active {
  border-color: var(--coral, #e8634f); color: var(--coral, #e8634f);
  background: rgba(232,99,79,.12);
}
.ag-own-tag.clear { border-style: dashed; }
.ag-own-tag.more { border-style: dotted; }
.ag-tag-search {
  padding: 4px 11px; border-radius: 999px; font-size: 0.74rem;
  background: var(--surface-2, #111);
  border: 1px solid var(--border, rgba(255,255,255,.12));
  color: var(--text, #eee); min-width: 9rem;
}
.ag-tag-search:focus { outline: none; border-color: var(--border-hi, rgba(255,255,255,.45)); }

/* Browse all tags, alphabetically.
 *
 * A prolific tagger runs to several hundred entries, most of them used once.
 * Dropping that into the chip row as one flat expansion is a wall nobody
 * reads and a page that jumps half a screen when it opens. So the row keeps
 * showing the tags carrying the most work, and the rest live here: a fixed
 * height panel, grouped by letter, with an index to jump by and a search to
 * cut it down. Alphabetical because this is the one you open knowing roughly
 * what you are after. */
.ag-tag-browser {
  border: 1px solid var(--border, rgba(255,255,255,.12));
  border-radius: 3px;
  background: var(--surface, rgba(255,255,255,.03));
  padding: 0.75rem 0.85rem;
  margin: -0.4rem 0 1rem;
}
.ag-tb-head {
  display: flex; flex-wrap: wrap; gap: 0.6rem;
  align-items: center; margin-bottom: 0.6rem;
}
.ag-tb-head .ag-tag-search { flex: 1 1 11rem; }
.ag-tb-count {
  color: var(--text-dim, #888); font-size: 0.72rem; white-space: nowrap;
}
.ag-tb-close {
  background: none; cursor: pointer; border: 1px solid var(--border-mid, rgba(255,255,255,.25));
  color: var(--text-mid, #999); border-radius: 999px;
  padding: 4px 11px; font-size: 0.72rem; letter-spacing: .04em;
}
.ag-tb-close:hover { border-color: var(--border-hi, rgba(255,255,255,.45)); color: var(--silver-hi, #f5f0ea); }

/* The index is a jump bar, not a filter: every letter in the vocabulary is
   a button, and letters nothing starts with are left out rather than shown
   dead. */
.ag-tb-index {
  display: flex; flex-wrap: wrap; gap: 2px; margin-bottom: 0.55rem;
  padding-bottom: 0.5rem; border-bottom: 1px solid var(--border, rgba(255,255,255,.1));
}
.ag-tb-jump {
  background: none; cursor: pointer; border: 1px solid transparent;
  color: var(--text-mid, #999); border-radius: 3px;
  min-width: 1.4rem; padding: 2px 4px;
  font-size: 0.7rem; letter-spacing: .05em; text-transform: uppercase;
}
.ag-tb-jump:hover { border-color: var(--border-hi, rgba(255,255,255,.45)); color: var(--silver-hi, #f5f0ea); }

.ag-tb-scroll { max-height: 17rem; overflow-y: auto; }
.ag-tb-group { margin-bottom: 0.5rem; }
/* The letter stays put while its own run scrolls past, so it is always clear
   where you are in the alphabet. */
.ag-tb-letter {
  position: sticky; top: 0; z-index: 1;
  background: var(--surface-2, #111);
  color: var(--text-dim, #888);
  font-family: "Cinzel", serif; font-size: 0.62rem;
  letter-spacing: .18em; text-transform: uppercase;
  padding: 3px 6px; margin-bottom: 5px; border-radius: 2px;
}
.ag-tb-items { display: flex; flex-wrap: wrap; gap: 5px; }
.ag-tb-n { opacity: .55; font-size: 0.9em; margin-left: 4px; }
.ag-tb-none { color: var(--text-dim, #888); font-size: 0.8rem; font-style: italic; padding: 0.3rem 0; }

/* The sort control sits with the tags rather than above the list, because
   both of them change what the list shows. */
.ag-own-controls {
  display: flex; flex-wrap: wrap; gap: 0.6rem;
  align-items: center; margin-bottom: 0.7rem;
}
.ag-own-sort {
  background: var(--surface-2, #111);
  border: 1px solid var(--border, rgba(255,255,255,.12));
  color: var(--text, #eee); border-radius: 3px;
  padding: 4px 10px; font-size: 0.74rem; cursor: pointer;
}
.ag-own-sort:focus { outline: none; border-color: var(--border-hi, rgba(255,255,255,.45)); }
.ag-own-sort-label {
  color: var(--text-dim, #888); font-family: "Cinzel", serif;
  font-size: 0.6rem; letter-spacing: .16em; text-transform: uppercase;
}
.ag-pager {
  display: flex; align-items: center; justify-content: center; gap: 1rem;
  margin-top: 1.2rem; font-size: 0.8rem; color: var(--text-dim, #888);
}
.ag-pager button {
  background: none; cursor: pointer;
  border: 1px solid var(--border-mid, rgba(255,255,255,.25));
  color: var(--text-mid, #999); border-radius: 2px;
  padding: 6px 14px; font-size: 0.72rem; letter-spacing: .1em; text-transform: uppercase;
  transition: border-color .15s, color .15s;
}
.ag-pager button:hover:not(:disabled) { border-color: var(--coral, #e8634f); color: var(--coral, #e8634f); }
.ag-pager button:disabled { opacity: .35; cursor: default; }
.ag-tag[data-filterable] { cursor: pointer; }
.ag-tag[data-filterable]:hover { border-color: var(--border-hi, rgba(255,255,255,.45)); color: var(--silver-hi, #f5f0ea); }
.ag-row-platforms {
  display: flex; flex-wrap: wrap; gap: 5px;
}
/* A platform is somewhere to go, so the pill goes there. The row behind it
   still opens the work, which is what the Play button used to be for. */
.ag-edit {
  font-family: "Cinzel", serif;
  font-size: 0.56rem; letter-spacing: .08em; text-transform: uppercase;
  padding: 4px 11px;
  border: 1px dashed var(--border-mid, rgba(255,255,255,.28));
  border-radius: 999px;
  color: var(--text-mid, #999);
  text-decoration: none; white-space: nowrap; background: transparent;
}
.ag-edit:hover { color: var(--coral, #e8634f); border-color: var(--coral, #e8634f); }
.ag-modal-edit { margin-left: auto; }
/* The profile editor's own way in. These nine pages are hand-built and no two
   lay their header out the same way, so rather than find a place inside each
   one it sits over the corner of the page. Only the person who may edit the
   profile ever sees it. */
.ag-profile-edit {
  position: fixed; top: 14px; right: 14px; z-index: 900;
  font-family: "Cinzel", serif;
  font-size: 0.58rem; letter-spacing: .12em; text-transform: uppercase;
  padding: 8px 14px;
  border: 1px dashed var(--border-mid, rgba(255,255,255,.28));
  border-radius: 999px;
  color: var(--text-mid, #999);
  text-decoration: none; white-space: nowrap;
  background: rgba(10,10,14,.72);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.ag-profile-edit:hover { color: var(--coral, #e8634f); border-color: var(--coral, #e8634f); }
/* One page is light, and a dark chip on it would be a smudge. */
@media (prefers-color-scheme: light) { .ag-profile-edit { background: rgba(255,255,255,.82); } }
.ag-plink {
  font-family: "Cinzel", serif;
  font-size: 0.56rem; letter-spacing: .08em; text-transform: uppercase;
  padding: 4px 11px;
  border: 1px solid var(--ag-accent);
  border-radius: 999px;
  color: var(--silver-hi, #f5f0ea);
  text-decoration: none; white-space: nowrap;
  background: rgba(91,141,232,0.18);
  background: color-mix(in srgb, var(--ag-accent) 18%, transparent);
  transition: background .18s, color .18s;
}
.ag-plink:hover { background: var(--ag-accent); color: var(--bg, #111); }
.ag-filter-chip {
  padding: 3px 10px;
  background: transparent;
  border: 1px solid var(--border, rgba(255,255,255,.12));
  border-radius: 20px;
  color: var(--text-mid, #999);
  font-size: 0.7rem; letter-spacing: .06em;
  cursor: pointer;
  transition: border-color .12s, color .12s, background .12s;
}
.ag-filter-chip:hover {
  border-color: var(--border-mid, rgba(255,255,255,.28));
  color: var(--silver, #ccc);
}
.ag-filter-chip.active {
  border-color: var(--border-hi, rgba(255,255,255,.5));
  color: var(--silver-hi, #f5f0ea);
  background: rgba(255,255,255,.06);
}
.ag-filter-chip-gender { border-color: rgba(232,99,79,.25); color: var(--coral, #e8634f); }
.ag-filter-chip-gender:hover { border-color: rgba(232,99,79,.55); }
.ag-filter-chip-gender.active {
  border-color: var(--coral, #e8634f);
  background: rgba(232,99,79,.1);
  color: var(--coral, #e8634f);
}
.ag-clear-btn {
  background: none; border: none;
  color: var(--text-dim, #555); font-size: 0.72rem; letter-spacing: .08em;
  text-transform: uppercase; cursor: pointer;
  text-decoration: underline; text-underline-offset: 3px;
  transition: color .12s;
}
.ag-clear-btn:hover { color: var(--text-mid, #999); }
.ag-empty, .ag-loading {
  color: var(--text-dim, #555); text-align: center;
  padding: 2.5rem 1rem; font-size: 0.88rem;
}
@media (max-width: 720px) {
  .ag-thead { display: none; }
  .ag-row { grid-template-columns: 1fr; gap: 0.4rem; padding: 1rem; }
  .ag-row-date { padding-top: 0; }
  .ag-row-artist::before { content: "Feat. "; color: var(--text-dim, #888); }
}

/* Modal */
.ag-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.88);
  z-index: 9000;
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
  animation: ag-fade-in .15s ease;
}
@keyframes ag-fade-in { from { opacity: 0 } to { opacity: 1 } }
.ag-modal {
  background: var(--surface, #0d0d0d);
  border: 1px solid var(--border-mid, rgba(255,255,255,.22));
  border-radius: var(--radius, 3px);
  width: 100%; max-width: 680px;
  max-height: 90vh; overflow-y: auto;
  position: relative;
  animation: ag-slide-up .18s ease;
}
@keyframes ag-slide-up { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }

.ag-modal-header {
  padding: 1.4rem 3.5rem 1.2rem 1.4rem;
  border-bottom: 1px solid var(--border, rgba(255,255,255,.1));
}
.ag-modal-title {
  color: var(--silver-hi, #f5f0ea);
  font-size: 1.1rem; font-weight: 500; line-height: 1.4;
  margin-bottom: 0.35rem;
}
.ag-modal-date { color: var(--text-dim, #555); font-size: 0.78rem; }
.ag-modal-close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none;
  color: var(--text-mid, #888); cursor: pointer;
  font-size: 1.3rem; line-height: 1; padding: 0.3rem 0.5rem;
  transition: color .15s;
}
.ag-modal-close:hover { color: var(--text, #eee); }

/* Platform tabs */
.ag-platform-tabs {
  display: flex; border-bottom: 1px solid var(--border, rgba(255,255,255,.1));
}
.ag-platform-tab {
  padding: 0.7rem 1.2rem;
  background: none; border: none; border-bottom: 2px solid transparent;
  color: var(--text-dim, #666);
  cursor: pointer; font-size: 0.75rem; letter-spacing: .1em; text-transform: uppercase;
  transition: color .15s, border-color .15s;
  margin-bottom: -1px;
}
.ag-platform-tab:hover { color: var(--text-mid, #999); }
.ag-platform-tab.active {
  color: var(--silver-hi, #f5f0ea);
  border-bottom-color: var(--coral, #e8634f);
}

.ag-modal-body { padding: 1.4rem; }
.ag-modal-iframe {
  width: 100%; height: 300px;
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: 2px;
  background: var(--bg, #000);
  display: block;
}
.ag-modal-no-embed {
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--text-dim, #555);
  font-size: 0.85rem;
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: 2px;
}
.ag-modal-open-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; margin-top: 1rem; padding: 0.75rem 1rem;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--border-mid, rgba(255,255,255,.22));
  border-radius: var(--radius, 3px);
  color: var(--silver, #ccc);
  text-decoration: none; font-size: 0.8rem; letter-spacing: .06em; text-transform: uppercase;
  transition: background .15s, color .15s;
  cursor: pointer;
}
.ag-modal-open-btn:hover { background: rgba(255,255,255,.08); color: var(--silver-hi, #fff); }
.ag-modal-desc {
  color: var(--text-mid, #888); font-size: 0.82rem;
  line-height: 1.6; margin-bottom: 1rem;
}
.ag-modal-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 1rem; }
.ag-modal-credits {
  margin-top: 1.2rem; padding-top: 1rem;
  border-top: 1px solid var(--border, rgba(255,255,255,.1));
  display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.2rem;
}
.ag-credit-row { font-size: 0.78rem; line-height: 1.5; }
.ag-credit-label {
  color: var(--text-dim, #555); text-transform: uppercase;
  font-size: 0.66rem; letter-spacing: .08em; display: block; margin-bottom: 1px;
}
.ag-credit-names { color: var(--text-mid, #888); }
.ag-type-ico { font-size: 0.82em; letter-spacing: 0; margin-right: 3px; }
.ag-type-badge {
  display: inline-block; font-family: "Cinzel", serif; font-size: 0.54rem; font-weight: 600;
  letter-spacing: .14em; text-transform: uppercase; border-radius: 999px;
  padding: 1px 8px; margin-right: 8px; vertical-align: middle;
}
.ag-type-audio  { color: #8fb4f2; border: 1px solid rgba(143,180,242,0.5); background: rgba(91,141,232,0.14); }
.ag-type-script { color: #e3c14f; border: 1px solid rgba(227,193,79,0.55); background: rgba(227,193,79,0.12); }
.ag-type-story  { color: #7fd6c0; border: 1px solid rgba(127,214,192,0.55); background: rgba(127,214,192,0.12); }
.ag-type-poem   { color: #c79bf0; border: 1px solid rgba(199,155,240,0.55); background: rgba(199,155,240,0.12); }
.ag-type-music  { color: #6fe3c1; border: 1px solid rgba(111,227,193,0.55); background: rgba(111,227,193,0.12); }
.ag-track-player { margin-bottom: 14px; background: var(--surface-2, #222a3e); border: 1px solid var(--border-mid, rgba(180,195,225,0.42)); border-radius: 6px; padding: 12px; }
.ag-track-player audio { width: 100%; display: block; height: 38px; }
.ag-track-meta { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 12px; font-size: 0.85rem; color: var(--text-mid, #c2cce0); }
.ag-track-meta b { color: var(--silver-hi, #eaf0fa); font-weight: 600; }
.ag-track-dl {
  display: inline-flex; align-items: center; gap: 7px; margin-bottom: 12px;
  font-family: "Cinzel", serif; font-size: 0.66rem; letter-spacing: .1em; text-transform: uppercase;
  padding: 10px 18px; border-radius: 999px; border: 1px solid #6fe3c1;
  color: #d8fff4; text-decoration: none; background: rgba(111,227,193,0.18);
}
.ag-track-dl:hover { background: #6fe3c1; color: #06231c; }
.ag-track-license { font-size: 0.82rem; font-style: italic; color: var(--text-mid, #c2cce0); border-left: 2px solid rgba(111,227,193,0.5); padding-left: 10px; margin-bottom: 12px; }
.ag-modal-desc a { color: #8fb4f2; text-decoration: underline; text-underline-offset: 2px; word-break: break-word; }
.ag-modal-desc a:hover { color: #fff; }
.ag-modal-frame { margin-bottom: 14px; border: 1px solid var(--border-mid, rgba(180,195,225,0.42)); border-radius: 6px; background: rgba(10,14,24,0.5); padding: 6px; overflow: hidden; }
.ag-modal-frame img { display: block; width: 100%; height: auto; border-radius: 3px; }
.ag-collab-link { color: inherit; text-decoration: underline; text-underline-offset: 2px; text-decoration-color: rgba(150,180,240,0.5); }
.ag-collab-link:hover { color: #fff; text-decoration-color: currentColor; }
    `;
    document.head.appendChild(s);
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  let currentOverlay = null;

  function creditsHtml(credits) {
    if (!credits) return '';
    const rows = Object.entries(CREDIT_LABELS)
      .filter(([k]) => (credits[k] || []).length)
      .map(([k, label]) => `
        <div class="ag-credit-row">
          <span class="ag-credit-label">${label}</span>
          <span class="ag-credit-names">${credits[k].map(name => collabHtml(name)).join(', ')}</span>
        </div>`).join('');
    return rows ? `<div class="ag-modal-credits">${rows}</div>` : '';
  }

  function closeModal() {
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
    document.body.style.overflow = '';
  }

  // Matches the catalogue: a link's own kind wins, so an audio can carry a
  // link to the script for it without claiming you listen to it.
  function linkVerb(link, entry) {
    if (link && link.kind) return link.kind === 'script' ? 'Read on' : 'Listen on';
    if (entry && CFG.isTextType(entry)) return 'Read on';
    return (PROVIDERS[link.provider] || {}).kind === 'script' ? 'Read on' : 'Open on';
  }

  function platformBodyHtml(link, entry) {
    const embed = canEmbed(link.provider);
    const label = providerLabel(link.provider);
    return `
      ${embed
        ? `<iframe class="ag-modal-iframe" src="${link.url}" allow="autoplay" allowfullscreen loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`
        : ``
      }
      <a class="ag-modal-open-btn" href="${link.url}" target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        ${linkVerb(link, entry)} ${label}
      </a>`;
  }

  function openModal(entry) {
    closeModal();
    document.body.style.overflow = 'hidden';

    const links = getLinks(entry);
    const tagsHtml = (entry.tags || []).map(t => `<span class="ag-tag">${t}</span>`).join('');

    const overlay = document.createElement('div');
    overlay.className = 'ag-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const tabsHtml = links.length > 1
      ? `<div class="ag-platform-tabs">${links.map((lk, i) =>
          `<button class="ag-platform-tab${i === 0 ? ' active' : ''}" data-idx="${i}">${providerLabel(lk.provider)}</button>`
        ).join('')}</div>`
      : '';

    overlay.innerHTML = `
      <div class="ag-modal" role="dialog" aria-modal="true">
        <div class="ag-modal-header">
          <div class="ag-modal-title">${typeBadge(entry)}${entry.title}</div>
          ${entry.date ? `<div class="ag-modal-date">${entry.date}</div>` : ''}
          ${editLinkHtml(entry, 'ag-modal-edit')}
          <button class="ag-modal-close" aria-label="Close">&times;</button>
        </div>
        ${tabsHtml}
        <div class="ag-modal-body">
          ${safeUrl(entry.track) ? `<div class="ag-track-player"><audio controls preload="none" src="${safeUrl(entry.track)}"></audio></div>` : ''}
          ${(entry.tempo || entry.useCase) ? `<div class="ag-track-meta">${entry.tempo ? `<span><b>Tempo:</b> ${escHtml(entry.tempo)}</span>` : ''}${entry.useCase ? `<span><b>Use:</b> ${escHtml(entry.useCase)}</span>` : ''}</div>` : ''}
          ${safeUrl(entry.track) ? `<a class="ag-track-dl" href="${safeUrl(entry.track)}" download><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download track</a>` : ''}
          ${entry.license ? `<div class="ag-track-license">${escHtml(entry.license)}</div>` : ''}
          ${safeUrl(entry.image) ? `<div class="ag-modal-frame"><img src="${safeUrl(entry.image)}" alt="${escHtml(entry.title || '')}" loading="lazy"></div>` : ''}
          ${entry.desc ? `<div class="ag-modal-desc">${richText(entry.desc)}</div>` : ''}
          <div id="ag-platform-content">${links.length ? platformBodyHtml(links[0], entry) : ''}</div>
          ${tagsHtml ? `<div class="ag-modal-tags">${tagsHtml}</div>` : ''}
          ${creditsHtml(entry.credits)}
        </div>
      </div>`;

    // Tab switching
    overlay.querySelectorAll('.ag-platform-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.ag-platform-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        overlay.querySelector('#ag-platform-content').innerHTML = platformBodyHtml(links[+tab.dataset.idx], entry);
      });
    });

    overlay.querySelector('.ag-modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    document.body.appendChild(overlay);
    currentOverlay = overlay;
    if (window.joiTrack) joiTrack.open(entry);
  }

  // ── Row ────────────────────────────────────────────────────────────────────
  function rowHtml(entry, filterable) {
    const links = getLinks(entry).map(lk =>
      `<a class="ag-plink" href="${escHtml(safeUrl(lk.url))}" target="_blank" rel="noopener noreferrer" data-stop="1">${providerLabel(lk.provider)}</a>`
    ).join('');
    const tagsHtml = (entry.tags || []).slice(0, 6).map(t => {
      const gender = isGenderTag(t);
      const classes = ['ag-tag', gender ? 'ag-tag-gender' : ''].filter(Boolean).join(' ');
      const attrs = filterable ? ` data-filterable="1" data-tag="${t}"` : '';
      return `<span class="${classes}"${attrs}>${t}</span>`;
    }).join('');
    // Voice first, as the catalogue has it: that is who a listener came for.
    const voices = (entry.credits || {}).voiceArtists || [];
    const names = voices.length ? voices : creditNames(entry).slice(0, 2);
    const artists = names.length ? names.map(name => collabHtml(name, true)).join(', ') : '&middot;';

    return `
      <div class="ag-row">
        <div class="ag-row-date">${entry.date || ''}${entry.trt ? `<div class="ag-row-trt">&#9201; ${escHtml(entry.trt)}</div>` : ''}</div>
        <div class="ag-row-main">
          <div class="ag-row-title">${typeBadge(entry)}${entry.title}</div>
          ${entry.shortDesc ? `<div class="ag-row-desc">${entry.shortDesc}</div>` : ''}
          ${tagsHtml ? `<div class="ag-tags">${tagsHtml}</div>` : ''}
        </div>
        <div class="ag-row-artist">${artists}</div>
        <div class="ag-row-platforms">${links || '<span class="ag-row-date">&middot;</span>'}${editLinkHtml(entry)}</div>
      </div>`;
  }

  // ── Render list ────────────────────────────────────────────────────────────
  function renderGrid(entries, container, filterable, onTagClick) {
    if (!entries.length) {
      container.innerHTML = '<div class="ag-empty">No works found.</div>';
      return;
    }
    container.innerHTML = '<div class="ag-grid">' +
      '<div class="ag-thead"><div>Date</div><div>Title</div><div>Creators</div><div>Links</div></div>' +
      entries.map(e => rowHtml(e, filterable)).join('') + '</div>';
    container.querySelectorAll('.ag-row').forEach((row, i) => {
      row.addEventListener('click', e => {
        if (e.target.closest('[data-stop]')) return; // a link inside the row
        if (e.target.dataset.filterable) return;     // tag click handled below
        openModal(entries[i]);
      });
    });
    if (filterable && onTagClick) {
      container.querySelectorAll('.ag-tag[data-filterable]').forEach(tag => {
        tag.addEventListener('click', e => {
          e.stopPropagation();
          onTagClick(tag.dataset.tag);
        });
      });
    }
  }

  // ── Filters (catalog) ─────────────────────────────────────────────────────
  const TOP_TAGS_LIMIT = 12;

  function initFilters(allEntries, container) {
    // Count tag frequency, keep top N non-gender tags
    const tagCount = {};
    allEntries.forEach(e => (e.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
    const allTagSet = [...new Set(allEntries.flatMap(e => e.tags || []))];
    const genderTagsPresent = GENDER_TAGS.filter(t => allTagSet.includes(t));
    const otherTags = allTagSet
      .filter(t => !isGenderTag(t))
      .sort((a, b) => (tagCount[b] || 0) - (tagCount[a] || 0))
      .slice(0, TOP_TAGS_LIMIT);

    // Active selections
    const activeTags = new Set();
    let activeArtist = '';
    let activeProvider = '';
    let searchQ = '';

    // ── Build filter UI ────────────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:1.4rem;';

    // Top row: search + platform
    const topRow = document.createElement('div');
    topRow.className = 'ag-filters';
    topRow.style.cssText = 'margin-bottom:0.8rem;';
    topRow.innerHTML = `
      <input class="ag-search" type="search" placeholder="Search titles, tags…" id="ag-search">
      <select class="ag-filter-select" id="ag-provider">
        <option value="">All Platforms</option>
        ${Object.entries(PROVIDERS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>
    `;

    // Artist icon strip
    const artistRow = document.createElement('div');
    artistRow.className = 'ag-artist-icons';
    Object.entries(ARTIST_LABELS).forEach(([slug, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ag-artist-icon-btn';
      btn.dataset.artist = slug;
      const iconSrc = ARTIST_ICONS[slug] || '';
      const initials = label.split(' ').map(w => w[0]).join('').toUpperCase();
      const tagline = ARTIST_TAGLINES[slug] || '';
      btn.innerHTML = `
        <div class="ag-artist-tooltip">
          <span class="ag-artist-tooltip-name">${label}</span>
          ${tagline ? `<span class="ag-artist-tooltip-tag">${tagline}</span>` : ''}
        </div>
        ${iconSrc
          ? `<img src="${iconSrc}" alt="${label}">`
          : `<div class="ag-artist-icon-fallback" aria-hidden="true">${initials}</div>`
        }<span>${initials}</span>`;
      btn.addEventListener('click', () => {
        if (activeArtist === slug) {
          activeArtist = '';
          btn.classList.remove('active');
        } else {
          activeArtist = slug;
          artistRow.querySelectorAll('.ag-artist-icon-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
        applyFilters();
      });
      artistRow.appendChild(btn);
    });

    // Tag chip rows
    function buildChipRow(tags, label, isGender) {
      if (!tags.length) return null;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-bottom:6px;';
      row.innerHTML = `<span style="font-size:0.65rem;letter-spacing:.12em;text-transform:uppercase;color:var(--text-mid,#b09090);margin-right:2px;white-space:nowrap;">${label}</span>`;
      tags.forEach(t => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.textContent = t;
        chip.dataset.tag = t;
        chip.className = 'ag-filter-chip' + (isGender ? ' ag-filter-chip-gender' : '');
        chip.addEventListener('click', () => toggleTag(t, chip));
        row.appendChild(chip);
      });
      return row;
    }

    const tagSection = document.createElement('div');
    const genderRow = buildChipRow(genderTagsPresent, 'Audience', true);
    const otherRow  = buildChipRow(otherTags, 'Tags', false);
    if (genderRow) tagSection.appendChild(genderRow);
    if (otherRow)  tagSection.appendChild(otherRow);

    // Count + clear row
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0 0.9rem;';
    metaRow.innerHTML = `
      <span id="ag-count" style="color:var(--text-mid,#b09090);font-size:0.75rem;"></span>
      <button id="ag-clear" type="button" class="ag-clear-btn" style="display:none">Clear filters</button>
    `;

    wrap.appendChild(topRow);
    wrap.appendChild(artistRow);
    wrap.appendChild(tagSection);
    wrap.appendChild(metaRow);

    const gridWrap = document.createElement('div');
    gridWrap.id = 'ag-results';

    container.appendChild(wrap);
    container.appendChild(gridWrap);

    // ── State helpers ──────────────────────────────────────────────────────
    function toggleTag(tag, chip) {
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
        chip.classList.remove('active');
      } else {
        activeTags.add(tag);
        chip.classList.add('active');
      }
      applyFilters();
    }

    function toggleTagByValue(tag) {
      const chip = wrap.querySelector(`.ag-filter-chip[data-tag="${CSS.escape(tag)}"]`);
      if (chip) toggleTag(tag, chip);
    }

    function updateClearBtn() {
      const hasFilters = activeTags.size || activeArtist || activeProvider || searchQ;
      document.getElementById('ag-clear').style.display = hasFilters ? '' : 'none';
    }

    function clearAll() {
      activeTags.clear();
      wrap.querySelectorAll('.ag-filter-chip.active').forEach(c => c.classList.remove('active'));
      wrap.querySelectorAll('.ag-artist-icon-btn.active').forEach(b => b.classList.remove('active'));
      activeArtist = '';
      activeProvider = '';
      searchQ = '';
      document.getElementById('ag-search').value = '';
      document.getElementById('ag-provider').value = '';
      applyFilters();
    }

    // ── Apply ──────────────────────────────────────────────────────────────
    function applyFilters() {
      updateClearBtn();
      const filtered = allEntries.filter(e => {
        const tags = e.tags || [];
        if (searchQ && !e.title.toLowerCase().includes(searchQ)
                    && !(e.desc || '').toLowerCase().includes(searchQ)
                    && !tags.some(t => t.toLowerCase().includes(searchQ))) return false;
        if (activeTags.size && ![...activeTags].every(t => tags.includes(t))) return false;
        if (activeArtist && !artistInEntry(e, activeArtist)) return false;
        if (activeProvider && !getLinks(e).some(lk => lk.provider === activeProvider)) return false;
        return true;
      });
      document.getElementById('ag-count').textContent = `${filtered.length} of ${allEntries.length} works`;
      renderGrid(filtered, gridWrap, true, tag => {
        toggleTagByValue(tag);
      });
    }

    // ── Events ─────────────────────────────────────────────────────────────
    document.getElementById('ag-search').addEventListener('input', e => {
      searchQ = e.target.value.toLowerCase();
      applyFilters();
    });
    document.getElementById('ag-provider').addEventListener('change', e => {
      activeProvider = e.target.value;
      applyFilters();
    });
    document.getElementById('ag-clear').addEventListener('click', clearAll);

    applyFilters();
  }

  // TRT is free text ("14:32", "1:05:30", "45 min"), so parse defensively and
  // return null when it cannot be read rather than guessing a length. Same
  // reading as the catalogue's, so the two sort a shared work the same way.
  function trtSeconds(e) {
    const raw = String((e && e.trt) || '').trim();
    if (!raw) return null;
    const clock = raw.match(/(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (clock) {
      const a = +clock[1], b = +clock[2], c = clock[3] === undefined ? null : +clock[3];
      return c === null ? a * 60 + b : a * 3600 + b * 60 + c;
    }
    const hm = raw.match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)/i);
    if (hm && (hm[1] || hm[2])) return (+(hm[1] || 0)) * 3600 + (+(hm[2] || 0)) * 60;
    const hOnly = raw.match(/^(\d+(?:\.\d+)?)\s*h/i);
    if (hOnly) return Math.round(parseFloat(hOnly[1]) * 3600);
    return null;
  }

  const SORTS = [
    ['date-desc',  'Newest first'],
    ['date-asc',   'Oldest first'],
    ['trt-desc',   'Longest first'],
    ['trt-asc',    'Shortest first'],
    ['title-asc',  'Title A\u2013Z'],
    ['title-desc', 'Title Z\u2013A'],
  ];

  // Date is the tie-breaker everywhere, so works that match on length or sit
  // under the same title still come out newest first rather than in whatever
  // order the store happened to return them.
  function sortEntries(list, mode) {
    const out = list.slice();
    const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));

    if (mode === 'trt-desc' || mode === 'trt-asc') {
      const dir = mode === 'trt-asc' ? 1 : -1;
      // A work with no readable length sinks to the bottom either way, so a
      // length sort never opens with a run of blanks.
      out.sort((a, b) => {
        const sa = trtSeconds(a), sb = trtSeconds(b);
        if (sa === null && sb === null) return byDateDesc(a, b);
        if (sa === null) return 1;
        if (sb === null) return -1;
        return sa !== sb ? (sa - sb) * dir : byDateDesc(a, b);
      });
      return out;
    }

    if (mode === 'title-asc' || mode === 'title-desc') {
      const dir = mode === 'title-desc' ? -1 : 1;
      out.sort((a, b) => {
        const c = String(a.title || '').localeCompare(String(b.title || ''),
                                                      undefined, { sensitivity: 'base', numeric: true });
        return c ? c * dir : byDateDesc(a, b);
      });
      return out;
    }

    out.sort(mode === 'date-asc'
      ? (a, b) => String(a.date || '').localeCompare(String(b.date || ''))
      : byDateDesc);
    return out;
  }

  // A creator's own page shows their work and nothing else, so the filters are
  // just their tags — no artist strip, no platform list. Ten at a time, because
  // a long back catalogue buries everything under the first screenful.
  function renderPaged(entries, container, perPage) {
    const active = new Set();
    let page = 0;
    let sortMode = 'date-desc';

    // Their tags, counted once. Two orders come off this: the chip row wants
    // the ones carrying the most work, the browser wants the alphabet.
    const counts = {};
    entries.forEach(e => (e.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));

    // Most used first, audience tags kept at the front where they are the
    // thing people actually filter by.
    const tags = Object.keys(counts).sort((a, b) => {
      const ga = isGenderTag(a), gb = isGenderTag(b);
      if (ga !== gb) return ga ? -1 : 1;
      return (counts[b] - counts[a]) || a.toLowerCase().localeCompare(b.toLowerCase());
    });
    const alphaTags = Object.keys(counts).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase(), undefined, { numeric: true }));

    const TOP_TAGS = 20;
    let browserOpen = false;
    let tagQuery = '';

    const controls = document.createElement('div');
    controls.className = 'ag-own-controls';
    const tagRow = document.createElement('div');
    tagRow.className = 'ag-own-tags';
    const browser = document.createElement('div');
    browser.className = 'ag-tag-browser';
    browser.hidden = true;
    const grid = document.createElement('div');
    const pager = document.createElement('div');
    pager.className = 'ag-pager';
    container.append(controls, tagRow, browser, grid, pager);

    // ── Sort ────────────────────────────────────────────────────────────────
    const sortLabel = document.createElement('span');
    sortLabel.className = 'ag-own-sort-label';
    sortLabel.textContent = 'Sort';
    const sortSel = document.createElement('select');
    sortSel.className = 'ag-own-sort';
    sortSel.setAttribute('aria-label', 'Sort works');
    SORTS.forEach(([value, label]) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      sortSel.appendChild(o);
    });
    sortSel.value = sortMode;
    sortSel.addEventListener('change', () => {
      sortMode = sortSel.value;
      page = 0;                 // a new order starts at the top
      draw();
    });
    controls.append(sortLabel, sortSel);

    function matching() {
      const list = !active.size ? entries : entries.filter(e => {
        const has = (e.tags || []).map(t => String(t).toLowerCase());
        return [...active].every(t => has.includes(t.toLowerCase()));
      });
      return sortEntries(list, sortMode);
    }

    // Prev and next mean something different depending on what the list is
    // ordered by, and "Older" pointing at a longer work reads as a bug.
    function pagerLabels() {
      if (sortMode === 'date-desc') return ['&larr; Newer', 'Older &rarr;'];
      if (sortMode === 'date-asc')  return ['&larr; Older', 'Newer &rarr;'];
      return ['&larr; Previous', 'Next &rarr;'];
    }

    function draw() {
      const list = matching();
      const pages = Math.max(1, Math.ceil(list.length / perPage));
      if (page >= pages) page = pages - 1;

      grid.innerHTML = '';
      if (!list.length) {
        grid.innerHTML = '<div class="ag-empty">Nothing with those tags.</div>';
      } else {
        renderGrid(list.slice(page * perPage, (page + 1) * perPage), grid, false, null);
      }

      drawTags();
      if (browserOpen) drawBrowser();

      // A pager for one page of results is noise.
      const [prev, next] = pagerLabels();
      pager.innerHTML = pages > 1
        ? `<button ${page === 0 ? 'disabled' : ''} data-go="prev">${prev}</button>
           <span>${page * perPage + 1}&ndash;${Math.min((page + 1) * perPage, list.length)} of ${list.length}</span>
           <button ${page >= pages - 1 ? 'disabled' : ''} data-go="next">${next}</button>`
        : (list.length ? `<span>${list.length} ${list.length === 1 ? 'work' : 'works'}</span>` : '');

      pager.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          page += b.dataset.go === 'next' ? 1 : -1;
          draw();
          // Far enough down the page that new results would otherwise appear
          // off-screen.
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    function chip(text, cls, onClick) {
      const b = document.createElement('button');
      b.className = 'ag-own-tag' + (cls ? ' ' + cls : '');
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }

    function toggle(t) {
      active.has(t) ? active.delete(t) : active.add(t);
      page = 0;                 // a new filter starts at the top
      draw();
    }

    // ── The chip row ────────────────────────────────────────────────────────
    // The tags carrying the most work, and nothing else. Anything already
    // picked stays visible however rare it is, or turning it off again would
    // mean opening the browser to hunt for it.
    function drawTags() {
      tagRow.innerHTML = '';

      const top = tags.slice(0, TOP_TAGS);
      const picked = [...active].filter(t => !top.includes(t));
      top.concat(picked).forEach(t => {
        const b = chip(t, active.has(t) ? 'active' : '', () => toggle(t));
        b.dataset.tag = t;
        tagRow.appendChild(b);
      });

      if (tags.length > TOP_TAGS) {
        const rest = tags.length - top.length;
        tagRow.appendChild(chip(
          browserOpen ? 'Close tag list' : 'Browse all ' + tags.length + ' tags',
          'more',
          toggleBrowser
        ));
        if (!browserOpen) {
          const note = document.createElement('span');
          note.style.cssText = 'color:var(--text-dim,#888);font-size:0.72rem;align-self:center;';
          note.textContent = '+' + rest + ' more';
          tagRow.appendChild(note);
        }
      }

      if (active.size) {
        tagRow.appendChild(chip('Clear', 'clear', () => {
          active.clear(); page = 0; draw();
        }));
      }
    }

    // ── The browser ─────────────────────────────────────────────────────────
    function toggleBrowser() {
      browserOpen = !browserOpen;
      browser.hidden = !browserOpen;
      tagQuery = '';
      drawTags();
      if (browserOpen) {
        drawBrowser();
        const box = browser.querySelector('.ag-tag-search');
        if (box) box.focus();
      } else {
        browser.innerHTML = '';
      }
    }

    // Everything the creator has used, A to Z, grouped by initial. Anything
    // that does not start with a letter lands under # rather than inventing
    // a group per symbol.
    function groupsFor(list) {
      const out = [];
      let current = null;
      list.forEach(t => {
        // Strip the accent off the initial before grouping. localeCompare
        // files "Ümlaut" next to the other U words, so leaving it as its own
        // character would open a second # group in the middle of the
        // alphabet, and give the index two buttons with the same label.
        const first = String(t).trim().charAt(0)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        const letter = /[A-Z]/.test(first) ? first : '#';
        if (!current || current.letter !== letter) {
          current = { letter, items: [] };
          out.push(current);
        }
        current.items.push(t);
      });
      return out;
    }

    function drawBrowser() {
      const q = tagQuery.trim().toLowerCase();
      const shown = q ? alphaTags.filter(t => t.toLowerCase().includes(q)) : alphaTags;
      const groups = groupsFor(shown);

      // Rebuilding the whole panel would drop the caret mid-search, so the
      // head is built once and only the list below it is redrawn.
      let head = browser.querySelector('.ag-tb-head');
      if (!head) {
        browser.innerHTML = '';
        head = document.createElement('div');
        head.className = 'ag-tb-head';

        const box = document.createElement('input');
        box.type = 'search';
        box.className = 'ag-tag-search';
        box.placeholder = 'Search tags…';
        box.setAttribute('aria-label', 'Search tags');
        box.addEventListener('input', () => { tagQuery = box.value; drawBrowser(); });

        const count = document.createElement('span');
        count.className = 'ag-tb-count';

        const close = document.createElement('button');
        close.className = 'ag-tb-close';
        close.textContent = 'Close';
        close.addEventListener('click', toggleBrowser);

        head.append(box, count, close);
        browser.append(head,
          Object.assign(document.createElement('div'), { className: 'ag-tb-index' }),
          Object.assign(document.createElement('div'), { className: 'ag-tb-scroll' }));
      }

      browser.querySelector('.ag-tb-count').textContent =
        shown.length === alphaTags.length
          ? alphaTags.length + ' tags'
          : shown.length + ' of ' + alphaTags.length + ' tags';

      const index = browser.querySelector('.ag-tb-index');
      const scroll = browser.querySelector('.ag-tb-scroll');

      index.innerHTML = '';
      groups.forEach(g => {
        const b = document.createElement('button');
        b.className = 'ag-tb-jump';
        b.textContent = g.letter;
        b.addEventListener('click', () => {
          const target = scroll.querySelector('[data-letter="' + g.letter + '"]');
          // scrollIntoView would take the whole page with it, so the panel
          // scrolls itself instead.
          if (target) scroll.scrollTop = target.offsetTop - scroll.offsetTop;
        });
        index.appendChild(b);
      });

      scroll.innerHTML = '';
      if (!shown.length) {
        scroll.innerHTML = '<div class="ag-tb-none">No tag matches that.</div>';
        return;
      }
      groups.forEach(g => {
        const wrap = document.createElement('div');
        wrap.className = 'ag-tb-group';
        wrap.dataset.letter = g.letter;

        const letter = document.createElement('div');
        letter.className = 'ag-tb-letter';
        letter.textContent = g.letter;

        const items = document.createElement('div');
        items.className = 'ag-tb-items';
        g.items.forEach(t => {
          const b = chip(t, active.has(t) ? 'active' : '', () => toggle(t));
          b.dataset.tag = t;
          const n = document.createElement('span');
          n.className = 'ag-tb-n';
          n.textContent = counts[t];
          b.appendChild(n);
          items.appendChild(b);
        });

        wrap.append(letter, items);
        scroll.appendChild(wrap);
      });
    }

    draw();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.AudioGrid = {
    /** Offers the owner of a profile a way into the Content Manager.
     *
     *  A profile page is public, so this asks quietly who is signed in and
     *  adds nothing at all for a visitor — the same bargain the Edit button on
     *  a work makes. The server decides who may actually save; this only
     *  decides whether to offer the door.
     *
     *      AudioGrid.profileEditor({ slug: 'filthy-bunny' });
     */
    profileEditor({ slug, label }) {
      if (!slug) return;
      injectStyles();
      return whoAmI().then(function (who) {
        if (!who) return null;                                  // not signed in
        if (!who.isOwner && who.slug !== slug) return null;      // not theirs
        if (document.querySelector('.ag-profile-edit')) return null;

        const a = document.createElement('a');
        a.className = 'ag-profile-edit';
        a.href = '/tools.html#profile=' + encodeURIComponent(slug);
        a.textContent = label || (who.isOwner && who.slug !== slug
          ? 'Edit this profile'
          : 'Edit my profile');
        a.title = 'Open this profile in the Content Manager';
        document.body.appendChild(a);
        return a;
      });
    },

    init({ container, artist, showFilters, limit, perPage }) {
      injectStyles();
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) return;

      el.innerHTML = '<div class="ag-loading">Loading audio…</div>';

      Promise.all([fetch('/api/content').then(r => r.json()), whoAmI()])
        .then(([data]) => {
          adoptProviders(data.providers);
          let entries = (data.entries || []).slice().sort((a, b) =>
            (b.date || '').localeCompare(a.date || '')
          );
          COLLAB = {};
          (data.collaborators || []).forEach(c => { if (c && c.name) COLLAB[normName(c.name)] = c; });
          if (artist) entries = entries.filter(e => artistInEntry(e, artist));
          if (limit) entries = entries.slice(0, limit);
          el.innerHTML = '';
          if (showFilters) {
            initFilters(entries, el);
          } else if (limit) {
            // A "latest few" list is a taster, not a browse.
            renderGrid(entries, el, false, null);
          } else {
            renderPaged(entries, el, perPage || 10);
          }
          // Auto-open entry from URL hash: #play=ENCODED_TITLE
          const hash = decodeURIComponent(location.hash.replace(/^#play=/, ''));
          if (hash) {
            const target = entries.find(e => (e.title || '').toLowerCase() === hash.toLowerCase());
            if (target) { setTimeout(() => openModal(target), 100); }
          }
        })
        .catch(() => {
          el.innerHTML = '<div class="ag-empty">Could not load audio.</div>';
        });
    }
  };
})();
