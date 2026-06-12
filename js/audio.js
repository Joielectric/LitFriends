(function () {
  'use strict';

  const PROVIDERS = {
    soundgasm:  { label: 'Soundgasm',  canEmbed: false },
    literotica: { label: 'Literotica', canEmbed: false },
    audiochan:  { label: 'Audiochan',  canEmbed: true  },
    hotaudio:   { label: 'HotAudio',   canEmbed: false },
  };

  // Gender/audience tags shown first in filter and styled distinctly
  const GENDER_TAGS = ['M4F','F4M','M4M','F4F','MF4A','MF4F','MF4M','MM4F','FF4M','F4A','M4A','A4A'];

  function isGenderTag(t) {
    return GENDER_TAGS.includes(t.toUpperCase());
  }

  const ARTIST_LABELS = {
    'joi-electric':       'JOI Electric',
    'loona-licks':        'Loona Licks',
    'misskittensk':       'MissKittenSK',
    'hisbadgirl77':       'HisBadGirl77',
    'wellnobodysperfect': "Well Nobody's Perfect",
    'naughtiwolf':        'NaughtiWolf',
    'lotus-kitty':        'Lotus Kitty',
    'filthy-bunny':       'Filthy Bunny',
  };

  const ARTIST_ICONS = {
    'joi-electric':       '/images/JOI_Icon.png',
    'loona-licks':        '/images/LL_Icon.png',
    'misskittensk':       '/images/MissKittenSKClub.png',
    'hisbadgirl77':       '/images/HBG_WIngs.png',
    'wellnobodysperfect': '/images/WNP_Icon.png',
    'naughtiwolf':        '/images/NW_Icon.png',
    'lotus-kitty':        '/images/LK_Icon.png',
    'filthy-bunny':       '/images/Filthy_Bunny_Avatar_GreenEyes.png',
  };

  const CREDIT_LABELS = {
    writers:      'Writer',
    voiceArtists: 'Voice',
    producers:    'Producer',
    editors:      'Editor',
    musicians:    'Music',
  };

  // Normalize: always return links array (backward compat with old provider/url fields)
  function getLinks(entry) {
    if (Array.isArray(entry.links) && entry.links.length) return entry.links;
    if (entry.provider && entry.url) return [{ provider: entry.provider, url: entry.url }];
    return [];
  }

  function getArtists(entry) {
    return entry.artists || (entry.artist ? [entry.artist] : []);
  }

  function artistInEntry(entry, artistId) {
    if (getArtists(entry).includes(artistId)) return true;
    const label = ARTIST_LABELS[artistId];
    if (!label || !entry.credits) return false;
    const needle = label.toLowerCase();
    return Object.values(entry.credits).some(arr =>
      (arr || []).some(name => name.toLowerCase() === needle)
    );
  }

  function providerLabel(key) {
    return (PROVIDERS[key] || {}).label || key;
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
.ag-artist-icon-btn span {
  font-family: "Cinzel", serif; font-size: 0.48rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-dim, #888); white-space: nowrap;
}
.ag-artist-icon-btn:hover { opacity: 0.85; border-color: rgba(232,99,79,0.5); }
.ag-artist-icon-btn.active { opacity: 1; border-color: var(--coral, #e8634f); box-shadow: 0 0 10px rgba(232,99,79,0.35); }
.ag-artist-icon-btn.active span { color: var(--coral, #e8634f); }

/* Track list */
.ag-grid {
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: var(--radius, 3px);
  overflow: hidden;
  max-width: 100%;
}
.ag-row {
  display: grid;
  grid-template-columns: 6rem 1fr auto auto;
  align-items: center;
  gap: 0 1.2rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border, rgba(255,255,255,.07));
  background: var(--surface-2, #111);
  cursor: pointer;
  transition: background .12s;
}
.ag-row:last-child { border-bottom: none; }
.ag-row:hover { background: var(--surface-3, #181518); }

.ag-row-date {
  color: #e0d0c8;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: .02em;
  white-space: nowrap;
}
.ag-row-main { min-width: 0; }
.ag-row-title {
  color: var(--silver-hi, #f5f0ea);
  font-size: 0.92rem;
  line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 0.2rem;
}
.ag-row-desc {
  color: var(--text-mid, #b09090);
  font-size: 0.78rem;
  font-style: italic;
  line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 0.2rem;
  opacity: 0.85;
}
.ag-tags {
  display: flex; flex-wrap: wrap; gap: 3px;
}
.ag-tag {
  padding: 1px 6px;
  border: 1px solid var(--border-mid, rgba(255,255,255,.18));
  border-radius: 2px;
  color: var(--silver, #d8c8c0); font-size: 0.65rem;
  cursor: default;
}
.ag-tag-gender {
  border-color: var(--border-hi, rgba(232,99,79,.45));
  color: var(--coral, #e8634f);
  font-weight: 600;
  letter-spacing: .04em;
}
.ag-tag[data-filterable] { cursor: pointer; }
.ag-tag[data-filterable]:hover { border-color: var(--border-hi, rgba(255,255,255,.45)); color: var(--silver-hi, #f5f0ea); }
.ag-row-platforms {
  display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end;
}
.ag-platform-pill {
  font-size: 0.6rem; letter-spacing: .1em; text-transform: uppercase;
  padding: 2px 7px;
  border: 1px solid var(--border-mid, rgba(255,255,255,.18));
  border-radius: 2px;
  color: var(--text-mid, #999);
  white-space: nowrap;
}
.ag-listen-btn {
  padding: 0.38rem 0.9rem;
  background: transparent;
  border: 1px solid var(--border-mid, rgba(255,255,255,.2));
  border-radius: var(--radius, 3px);
  color: var(--silver, #ccc);
  cursor: pointer; font-size: 0.65rem; letter-spacing: .1em; text-transform: uppercase;
  display: flex; align-items: center; gap: 5px;
  transition: border-color .12s, color .12s;
  white-space: nowrap;
}
.ag-listen-btn:hover {
  border-color: var(--border-hi, rgba(255,255,255,.45));
  color: var(--silver-hi, #f5f0ea);
}
.ag-artist-badge {
  display: inline-block; padding: 1px 7px;
  border: 1px solid var(--border-mid, rgba(255,255,255,.18));
  border-radius: 12px;
  color: var(--text-mid, #999); font-size: 0.66rem;
}
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
@media (max-width: 540px) {
  .ag-row { grid-template-columns: 1fr auto; }
  .ag-row-date { display: none; }
  .ag-row-platforms { display: none; }
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
          <span class="ag-credit-names">${credits[k].join(', ')}</span>
        </div>`).join('');
    return rows ? `<div class="ag-modal-credits">${rows}</div>` : '';
  }

  function closeModal() {
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
    document.body.style.overflow = '';
  }

  function platformBodyHtml(link) {
    const embed = canEmbed(link.provider);
    const label = providerLabel(link.provider);
    return `
      ${embed
        ? `<iframe class="ag-modal-iframe" src="${link.url}" allow="autoplay" allowfullscreen loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`
        : `<div class="ag-modal-no-embed">Embedding not available for ${label}.</div>`
      }
      <a class="ag-modal-open-btn" href="${link.url}" target="_blank" rel="noopener noreferrer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open on ${label}
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
          <div class="ag-modal-title">${entry.title}</div>
          ${entry.date ? `<div class="ag-modal-date">${entry.date}</div>` : ''}
          <button class="ag-modal-close" aria-label="Close">&times;</button>
        </div>
        ${tabsHtml}
        <div class="ag-modal-body">
          ${entry.desc ? `<div class="ag-modal-desc">${entry.desc}</div>` : ''}
          <div id="ag-platform-content">${links.length ? platformBodyHtml(links[0]) : ''}</div>
          ${tagsHtml ? `<div class="ag-modal-tags">${tagsHtml}</div>` : ''}
          ${creditsHtml(entry.credits)}
        </div>
      </div>`;

    // Tab switching
    overlay.querySelectorAll('.ag-platform-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.ag-platform-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        overlay.querySelector('#ag-platform-content').innerHTML = platformBodyHtml(links[+tab.dataset.idx]);
      });
    });

    overlay.querySelector('.ag-modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    document.body.appendChild(overlay);
    currentOverlay = overlay;
  }

  // ── Row ────────────────────────────────────────────────────────────────────
  function rowHtml(entry, showArtists, filterable) {
    const links = getLinks(entry);
    const platformPills = links.map(lk =>
      `<span class="ag-platform-pill">${providerLabel(lk.provider)}</span>`
    ).join('');
    const tagsHtml = (entry.tags || []).slice(0, 8).map(t => {
      const gender = isGenderTag(t);
      const classes = ['ag-tag', gender ? 'ag-tag-gender' : ''].filter(Boolean).join(' ');
      const attrs = filterable ? ` data-filterable="1" data-tag="${t}"` : '';
      return `<span class="${classes}"${attrs}>${t}</span>`;
    }).join('');
    const artistBadges = showArtists
      ? getArtists(entry).map(a => `<span class="ag-artist-badge">${ARTIST_LABELS[a] || a}</span>`).join('')
      : '';

    return `
      <div class="ag-row">
        <div class="ag-row-date">${entry.date || ''}</div>
        <div class="ag-row-main">
          <div class="ag-row-title">${entry.title}${artistBadges ? ' <span style="font-weight:400;opacity:.6;font-size:.8em">— ' + artistBadges + '</span>' : ''}</div>
          ${entry.shortDesc ? `<div class="ag-row-desc">${entry.shortDesc}</div>` : ''}
          ${tagsHtml ? `<div class="ag-tags">${tagsHtml}</div>` : ''}
        </div>
        <div class="ag-row-platforms">${platformPills}</div>
        <button class="ag-listen-btn">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Play
        </button>
      </div>`;
  }

  // ── Render list ────────────────────────────────────────────────────────────
  function renderGrid(entries, container, showArtists, filterable, onTagClick) {
    if (!entries.length) {
      container.innerHTML = '<div class="ag-empty">No audio found.</div>';
      return;
    }
    container.innerHTML = `<div class="ag-grid">${entries.map(e => rowHtml(e, showArtists, filterable)).join('')}</div>`;
    container.querySelectorAll('.ag-row').forEach((row, i) => {
      row.addEventListener('click', e => {
        if (e.target.dataset.filterable) return; // tag click handled below
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
      const iconSrc = ARTIST_ICONS[slug] || '/images/CA_ICON.png';
      const initials = label.split(' ').map(w => w[0]).join('').toUpperCase();
      btn.innerHTML = `<img src="${iconSrc}" alt="${label}"><span>${initials}</span>`;
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
      renderGrid(filtered, gridWrap, true, true, tag => {
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

  // ── Public API ─────────────────────────────────────────────────────────────
  window.AudioGrid = {
    init({ container, artist, showFilters }) {
      injectStyles();
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (!el) return;

      el.innerHTML = '<div class="ag-loading">Loading audio…</div>';

      fetch('/api/content')
        .then(r => r.json())
        .then(data => {
          let entries = (data.entries || []).slice().sort((a, b) =>
            (b.date || '').localeCompare(a.date || '')
          );
          if (artist) entries = entries.filter(e => artistInEntry(e, artist));
          el.innerHTML = '';
          if (showFilters) {
            initFilters(entries, el);
          } else {
            renderGrid(entries, el, false, false, null);
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
