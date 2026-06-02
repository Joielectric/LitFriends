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

  function getArtists(entry) {
    return entry.artists || (entry.artist ? [entry.artist] : []);
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
.ag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1rem;
}
.ag-card {
  background: var(--surface-2, #111);
  border: 1px solid var(--border, rgba(255,255,255,.12));
  border-radius: var(--radius, 3px);
  padding: 1.2rem;
  display: flex; flex-direction: column; gap: 0.55rem;
  transition: border-color .2s;
}
.ag-card:hover { border-color: var(--border-mid, rgba(255,255,255,.28)); }
.ag-card-provider {
  font-size: 0.68rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-dim, #555); font-weight: 600;
}
.ag-card-title {
  color: var(--silver-hi, #f5f0ea);
  font-size: 0.92rem; font-weight: 500; line-height: 1.4;
}
.ag-card-meta {
  color: var(--text-mid, #888); font-size: 0.76rem; display: flex; gap: 6px; flex-wrap: wrap;
}
.ag-artist-badge {
  display: inline-block; padding: 1px 7px;
  border: 1px solid var(--border, rgba(255,255,255,.12));
  border-radius: 12px;
  color: var(--text-mid, #888); font-size: 0.72rem;
}
.ag-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.ag-tag {
  padding: 2px 8px;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--border, rgba(255,255,255,.1));
  border-radius: 2px;
  color: var(--text-mid, #888); font-size: 0.71rem;
}
.ag-play-btn {
  margin-top: auto; padding: 0.55rem 1rem;
  background: transparent;
  border: 1px solid var(--border-mid, rgba(255,255,255,.25));
  border-radius: var(--radius, 3px);
  color: var(--silver, #ccc);
  cursor: pointer; font-size: 0.82rem; letter-spacing: .05em;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: background .18s, border-color .18s, color .18s;
  width: 100%;
}
.ag-play-btn:hover {
  background: rgba(255,255,255,.07);
  border-color: var(--border-hi, rgba(255,255,255,.5));
  color: var(--silver-hi, #fff);
}
.ag-play-btn svg { flex-shrink: 0; }
.ag-empty, .ag-loading {
  color: var(--text-dim, #555); text-align: center;
  padding: 2.5rem 1rem; font-size: 0.88rem;
  grid-column: 1/-1;
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
  border: 1px solid var(--border-mid, rgba(255,255,255,.25));
  border-radius: var(--radius, 3px);
  width: 100%; max-width: 700px;
  max-height: 90vh; overflow-y: auto;
  position: relative;
  animation: ag-slide-up .18s ease;
}
@keyframes ag-slide-up { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }
.ag-modal-header {
  padding: 1.4rem 3.5rem 1rem 1.4rem;
  border-bottom: 1px solid var(--border, rgba(255,255,255,.1));
}
.ag-modal-provider {
  font-size: 0.68rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--text-dim, #555); margin-bottom: 0.35rem;
}
.ag-modal-title {
  color: var(--silver-hi, #f5f0ea);
  font-size: 1.05rem; font-weight: 500; line-height: 1.4;
}
.ag-modal-artists { color: var(--text-mid, #888); font-size: 0.8rem; margin-top: 0.3rem; }
.ag-modal-close {
  position: absolute; top: 1rem; right: 1rem;
  background: none; border: none;
  color: var(--text-mid, #888); cursor: pointer;
  font-size: 1.3rem; line-height: 1; padding: 0.3rem 0.5rem;
  transition: color .15s;
}
.ag-modal-close:hover { color: var(--text, #eee); }
.ag-modal-body { padding: 1.4rem; }
.ag-modal-iframe {
  width: 100%; height: 320px;
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
  width: 100%; margin-top: 1rem; padding: 0.8rem 1rem;
  background: rgba(255,255,255,.05);
  border: 1px solid var(--border-mid, rgba(255,255,255,.25));
  border-radius: var(--radius, 3px);
  color: var(--silver, #ccc);
  text-decoration: none; font-size: 0.85rem; letter-spacing: .04em;
  transition: background .18s, color .18s;
  cursor: pointer;
}
.ag-modal-open-btn:hover { background: rgba(255,255,255,.1); color: var(--silver-hi, #fff); }
.ag-modal-desc {
  color: var(--text-mid, #888); font-size: 0.82rem;
  line-height: 1.6; margin-bottom: 1rem;
}
.ag-modal-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 1rem; }
    `;
    document.head.appendChild(s);
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  let currentOverlay = null;

  function closeModal() {
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
    document.body.style.overflow = '';
  }

  function openModal(entry) {
    closeModal();
    document.body.style.overflow = 'hidden';

    const artists = getArtists(entry);
    const provLabel = providerLabel(entry.provider);
    const embed = canEmbed(entry.provider);

    const overlay = document.createElement('div');
    overlay.className = 'ag-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const tagsHtml = (entry.tags || []).map(t => `<span class="ag-tag">${t}</span>`).join('');
    const artistsHtml = artists.map(a => ARTIST_LABELS[a] || a).join(', ');

    overlay.innerHTML = `
      <div class="ag-modal" role="dialog" aria-modal="true">
        <div class="ag-modal-header">
          <div class="ag-modal-provider">${provLabel}</div>
          <div class="ag-modal-title">${entry.title}</div>
          ${artistsHtml ? `<div class="ag-modal-artists">${artistsHtml}</div>` : ''}
          <button class="ag-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="ag-modal-body">
          ${entry.desc ? `<div class="ag-modal-desc">${entry.desc}</div>` : ''}
          ${embed
            ? `<iframe class="ag-modal-iframe" src="${entry.url}" allow="autoplay" allowfullscreen loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`
            : `<div class="ag-modal-no-embed">This provider doesn't support embedding.<br>Open the link below to listen.</div>`
          }
          <a class="ag-modal-open-btn" href="${entry.url}" target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open on ${provLabel}
          </a>
          ${tagsHtml ? `<div class="ag-modal-tags">${tagsHtml}</div>` : ''}
        </div>
      </div>`;

    overlay.querySelector('.ag-modal-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });

    document.body.appendChild(overlay);
    currentOverlay = overlay;
  }

  // ── Render grid ────────────────────────────────────────────────────────────
  function renderGrid(entries, container, showArtists) {
    if (!entries.length) {
      container.innerHTML = '<div class="ag-empty">No audio found.</div>';
      return;
    }
    container.innerHTML = `<div class="ag-grid">${entries.map(e => cardHtml(e, showArtists)).join('')}</div>`;
    container.querySelectorAll('.ag-play-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => openModal(entries[i]));
    });
  }

  function cardHtml(entry, showArtists) {
    const artists = getArtists(entry);
    const tagsHtml = (entry.tags || []).slice(0, 4).map(t => `<span class="ag-tag">${t}</span>`).join('');
    const artistBadges = showArtists
      ? artists.map(a => `<span class="ag-artist-badge">${ARTIST_LABELS[a] || a}</span>`).join('')
      : '';
    return `
      <div class="ag-card">
        <div class="ag-card-provider">${providerLabel(entry.provider)}</div>
        <div class="ag-card-title">${entry.title}</div>
        <div class="ag-card-meta">
          ${entry.date ? `<span>${entry.date}</span>` : ''}
          ${artistBadges}
        </div>
        ${tagsHtml ? `<div class="ag-tags">${tagsHtml}</div>` : ''}
        <button class="ag-play-btn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Play
        </button>
      </div>`;
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
        <option value="">All Providers</option>
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
      const q       = document.getElementById('ag-search').value.toLowerCase();
      const artist  = document.getElementById('ag-artist').value;
      const provider = document.getElementById('ag-provider').value;
      const tag     = document.getElementById('ag-tag') ? document.getElementById('ag-tag').value : '';

      const filtered = allEntries.filter(e => {
        if (q && !e.title.toLowerCase().includes(q) && !(e.desc || '').toLowerCase().includes(q)) return false;
        if (artist && !getArtists(e).includes(artist)) return false;
        if (provider && e.provider !== provider) return false;
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
          if (artist) entries = entries.filter(e => getArtists(e).includes(artist));
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
