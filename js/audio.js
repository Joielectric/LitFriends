(function () {
  'use strict';

  const PROVIDERS = {
    soundgasm:  { label: 'Soundgasm',  canEmbed: false },
    literotica: { label: 'Literotica', canEmbed: false },
    audiochan:  { label: 'Audiochan',  canEmbed: true  },
    hotaudio:   { label: 'HotAudio',   canEmbed: false },
  };

  const ARTIST_LABELS = {
    'joi-electric': 'JOI Electric',
    'loona-licks':  'Loona Licks',
    'misskittensk': 'MissKittenSK',
    'hisbadgirl77': 'HisBadGirl77',
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

/* Track list */
.ag-grid {
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: var(--radius, 3px);
  overflow: hidden;
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
  color: var(--text-dim, #555);
  font-size: 0.72rem;
  letter-spacing: .03em;
  white-space: nowrap;
}
.ag-row-main { min-width: 0; }
.ag-row-title {
  color: var(--silver-hi, #f5f0ea);
  font-size: 0.88rem;
  line-height: 1.35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 0.2rem;
}
.ag-tags {
  display: flex; flex-wrap: wrap; gap: 3px;
}
.ag-tag {
  padding: 1px 6px;
  border: 1px solid var(--border, rgba(255,255,255,.08));
  border-radius: 2px;
  color: var(--text-dim, #666); font-size: 0.65rem;
}
.ag-row-platforms {
  display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end;
}
.ag-platform-pill {
  font-size: 0.6rem; letter-spacing: .1em; text-transform: uppercase;
  padding: 2px 7px;
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: 2px;
  color: var(--text-dim, #666);
  white-space: nowrap;
}
.ag-listen-btn {
  padding: 0.38rem 0.9rem;
  background: transparent;
  border: 1px solid var(--border, rgba(255,255,255,.12));
  border-radius: var(--radius, 3px);
  color: var(--text-dim, #777);
  cursor: pointer; font-size: 0.65rem; letter-spacing: .1em; text-transform: uppercase;
  display: flex; align-items: center; gap: 5px;
  transition: border-color .12s, color .12s;
  white-space: nowrap;
}
.ag-listen-btn:hover {
  border-color: var(--border-hi, rgba(255,255,255,.35));
  color: var(--silver-hi, #f5f0ea);
}
.ag-artist-badge {
  display: inline-block; padding: 1px 7px;
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: 12px;
  color: var(--text-dim, #666); font-size: 0.66rem;
}
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
  function rowHtml(entry, showArtists) {
    const links = getLinks(entry);
    const platformPills = links.map(lk =>
      `<span class="ag-platform-pill">${providerLabel(lk.provider)}</span>`
    ).join('');
    const tagsHtml = (entry.tags || []).slice(0, 6).map(t => `<span class="ag-tag">${t}</span>`).join('');
    const artistBadges = showArtists
      ? getArtists(entry).map(a => `<span class="ag-artist-badge">${ARTIST_LABELS[a] || a}</span>`).join('')
      : '';

    return `
      <div class="ag-row">
        <div class="ag-row-date">${entry.date || ''}</div>
        <div class="ag-row-main">
          <div class="ag-row-title">${entry.title}${artistBadges ? ' <span style="font-weight:400;opacity:.6;font-size:.8em">— ' + artistBadges + '</span>' : ''}</div>
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
  function renderGrid(entries, container, showArtists) {
    if (!entries.length) {
      container.innerHTML = '<div class="ag-empty">No audio found.</div>';
      return;
    }
    container.innerHTML = `<div class="ag-grid">${entries.map(e => rowHtml(e, showArtists)).join('')}</div>`;
    container.querySelectorAll('.ag-row').forEach((row, i) => {
      row.addEventListener('click', () => openModal(entries[i]));
    });
  }

  // ── Filters (catalog) ─────────────────────────────────────────────────────
  function initFilters(allEntries, container) {
    const allTags = [...new Set(allEntries.flatMap(e => e.tags || []))].sort();

    const filterBar = document.createElement('div');
    filterBar.className = 'ag-filters';
    filterBar.innerHTML = `
      <input class="ag-search" type="search" placeholder="Search titles…" id="ag-search">
      <select class="ag-filter-select" id="ag-artist">
        <option value="">All Artists</option>
        ${Object.entries(ARTIST_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <select class="ag-filter-select" id="ag-provider">
        <option value="">All Platforms</option>
        ${Object.entries(PROVIDERS).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>
      ${allTags.length ? `
      <select class="ag-filter-select" id="ag-tag">
        <option value="">All Tags</option>
        ${allTags.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>` : ''}
    `;

    const gridWrap = document.createElement('div');
    gridWrap.id = 'ag-results';

    container.appendChild(filterBar);
    container.appendChild(gridWrap);

    function applyFilters() {
      const q        = document.getElementById('ag-search').value.toLowerCase();
      const artist   = document.getElementById('ag-artist').value;
      const provider = document.getElementById('ag-provider').value;
      const tag      = document.getElementById('ag-tag') ? document.getElementById('ag-tag').value : '';

      const filtered = allEntries.filter(e => {
        if (q && !e.title.toLowerCase().includes(q) && !(e.desc || '').toLowerCase().includes(q)) return false;
        if (artist && !artistInEntry(e, artist)) return false;
        if (provider && !getLinks(e).some(lk => lk.provider === provider)) return false;
        if (tag && !(e.tags || []).includes(tag)) return false;
        return true;
      });

      renderGrid(filtered, gridWrap, true);
    }

    filterBar.addEventListener('input', applyFilters);
    filterBar.addEventListener('change', applyFilters);
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
            renderGrid(entries, el, false);
          }
        })
        .catch(() => {
          el.innerHTML = '<div class="ag-empty">Could not load audio.</div>';
        });
    }
  };
})();
