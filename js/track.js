/*
 * Visitor tracking. Load it on any public page:
 *
 *     <script src="/js/track.js" defer></script>
 *
 * It notices, on its own, a page being viewed, an <audio> starting and
 * finishing, a link out to another site, a download and a search box being
 * used. The one thing it cannot see is which work a pop-up is showing, so the
 * pages that open one say so:
 *
 *     joiTrack.open(entry);     // when a work's modal opens
 *
 * Everything goes to /api/visits (netlify/functions/visits.js), which explains
 * what is kept. A browser asking not to be tracked (Global Privacy Control or
 * Do Not Track) is not, and the Content Manager never is.
 */
(function () {
  var noop = function () {};
  window.joiTrack = { open: noop, event: noop };

  if (navigator.globalPrivacyControl || navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  if (/^\/tools(\.html)?$/.test(location.pathname)) return;

  var ENDPOINT = '/api/visits';
  var SESSION_IDLE_MS = 30 * 60 * 1000;   // a visit ends after half an hour of nothing

  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  // Storage can be missing or throw (private windows, blocked site data); the
  // ids then only last as long as the page, which still counts the visit.
  var mem = {};
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }

  var visitor = load('joi_vid');
  if (!visitor) { visitor = rid(); save('joi_vid', visitor); }

  function session() {
    var now = Date.now();
    var s = null;
    try { s = JSON.parse(load('joi_sess') || 'null'); } catch (e) {}
    if (!s || !s.id || now - s.last > SESSION_IDLE_MS) s = { id: rid(), last: now };
    s.last = now;
    save('joi_sess', JSON.stringify(s));
    return s.id;
  }

  // /catalog and /catalog.html are one page.
  var path = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1') || '/';

  // ── Sending ───────────────────────────────────────────────────────────────
  var queue = [];
  var timer = null;

  function flush(leaving) {
    clearTimeout(timer); timer = null;
    if (!queue.length) return;
    var body = JSON.stringify({ v: visitor, s: session(), events: queue.splice(0, 40) });
    // sendBeacon survives the page closing; text/plain needs no preflight.
    if (leaving && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, credentials: 'same-origin' }).catch(noop);
  }

  function push(t, data) {
    var e = { t: t, p: path };
    for (var k in data) if (data[k] != null && data[k] !== '') e[k] = data[k];
    queue.push(e);
    if (queue.length >= 20) flush(false);
    else if (!timer) timer = setTimeout(function () { flush(false); }, 3000);
  }

  // ── What is open ──────────────────────────────────────────────────────────
  // Plays, downloads and links out inside a pop-up are about the work it shows.
  var current = null;

  function names(entry) {
    var out = [];
    function add(n) { n = String(n == null ? '' : n).trim().toLowerCase(); if (n && out.indexOf(n) === -1) out.push(n); }
    (entry.artists || (entry.artist ? [entry.artist] : [])).forEach(add);
    var c = entry.credits || {};
    Object.keys(c).forEach(function (role) { (c[role] || []).forEach(add); });
    // Slugs too, so a creator's view finds work credited under any name
    // site-config knows them by.
    var cfg = window.SITE_CONFIG;
    if (cfg && cfg.artists && cfg.creditedIn) {
      cfg.artists.forEach(function (a) { if (cfg.creditedIn(entry, a.slug)) add(a.slug); });
    }
    return out;
  }

  window.joiTrack.open = function (entry) {
    if (!entry) return;
    current = { title: String(entry.title || 'Untitled'), art: names(entry) };
    push('open', current);
  };
  window.joiTrack.event = function (t, data) { push(t, data || {}); };

  function about() { return current && document.querySelector('[role="dialog"]') ? current : null; }

  // A profile page is about its creator even before anything is opened.
  var profile = /^\/profiles?\/([^/]+)/.exec(path);

  // ── Page view ─────────────────────────────────────────────────────────────
  var ref = document.referrer;
  try { if (ref && new URL(ref).host === location.host) ref = ''; } catch (e) { ref = ''; }
  var q = new URLSearchParams(location.search);
  push('view', {
    ref: ref,
    utm: q.get('utm_source') || q.get('ref') || '',
    title: document.title,
    art: profile ? [profile[1].toLowerCase()] : null,
  });
  flush(false);

  // ── Listening ─────────────────────────────────────────────────────────────
  // Media events do not bubble, but they can be caught on the way down.
  var started = typeof WeakSet === 'function' ? new WeakSet() : null;
  document.addEventListener('play', function (ev) {
    var el = ev.target;
    if (!el || !/^(AUDIO|VIDEO)$/.test(el.tagName)) return;
    if (started) { if (started.has(el)) return; started.add(el); }
    var w = about();
    push('play', { title: w ? w.title : (el.getAttribute('title') || ''), art: w ? w.art : null });
  }, true);
  document.addEventListener('ended', function (ev) {
    var el = ev.target;
    if (!el || !/^(AUDIO|VIDEO)$/.test(el.tagName)) return;
    var w = about();
    push('complete', { title: w ? w.title : '', art: w ? w.art : null });
  }, true);

  // ── Links out and downloads ───────────────────────────────────────────────
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var w = about();
    var label = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (a.hasAttribute('download')) {
      push('download', { url: a.href, title: w ? w.title : label, art: w ? w.art : null });
      return;
    }
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return; }
    if (url.protocol === 'mailto:') { push('outbound', { url: 'mailto:', label: 'Email', title: w && w.title }); return; }
    if (!/^https?:$/.test(url.protocol) || url.host === location.host) return;
    push('outbound', { url: url.href, label: label, title: w ? w.title : '', art: w ? w.art : (profile ? [profile[1].toLowerCase()] : null) });
  }, true);

  // ── Searching ─────────────────────────────────────────────────────────────
  // What someone settled on typing, not every keystroke.
  var searchTimer = null, lastSearch = '';
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el || el.type !== 'search') return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      var v = String(el.value || '').trim().toLowerCase();
      if (v.length < 2 || v === lastSearch) return;
      lastSearch = v;
      push('search', { q: v });
    }, 1500);
  }, true);

  // ── Time on the page ──────────────────────────────────────────────────────
  // Only time the tab was actually in front, so a page left open in the
  // background all afternoon does not count as an afternoon's reading.
  var shownAt = document.visibilityState === 'visible' ? Date.now() : 0;
  var shown = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (shownAt) { shown += Date.now() - shownAt; shownAt = 0; }
      if (shown > 0) push('leave', { dur: Math.round(shown / 1000) });
      shown = 0;
      flush(true);
    } else {
      shownAt = Date.now();
    }
  });
  window.addEventListener('pagehide', function () {
    if (shownAt) { shown += Date.now() - shownAt; shownAt = 0; }
    if (shown > 0) push('leave', { dur: Math.round(shown / 1000) });
    shown = 0;
    flush(true);
  });
})();
