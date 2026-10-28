/* Age gate for pages that show or point to adult material: the creator
 * profiles, the catalogue and A Word From Me.
 *
 * Any of them can be reached directly from a shared link, skipping the gate
 * on the home page, so each one asks for itself. Load it in <head>, without
 * defer, so the page is hidden before anything on it paints:
 *
 *     <script src="/js/age-gate.js"></script>
 *
 * A yes is remembered on this device for REMEMBER_DAYS (localStorage, under
 * age_verified_until), so a returning visitor is not asked on every visit.
 * The gates on index.html and consenting-adults.html read and write the same
 * key, and the older per-tab flags (joi_verified, ca_verified in
 * sessionStorage) still count: a yes on any of them counts for all. Colours come from the page's own custom properties, so the box
 * takes on each page's theme. A page without them falls back to the site's
 * default blue.
 */
(function () {
  'use strict';

  var KEYS = ['joi_verified', 'ca_verified'];
  var REMEMBER_KEY = 'age_verified_until';
  var REMEMBER_DAYS = 30;

  // Storage can be blocked (private windows, strict settings); then the
  // visitor is simply asked again, never locked out.
  function verified() {
    try {
      if (Number(localStorage.getItem(REMEMBER_KEY)) > Date.now()) return true;
    } catch (e) {}
    try {
      for (var i = 0; i < KEYS.length; i++) {
        if (sessionStorage.getItem(KEYS[i]) === 'true') return true;
      }
    } catch (e) {}
    return false;
  }

  function remember() {
    try {
      for (var i = 0; i < KEYS.length; i++) sessionStorage.setItem(KEYS[i], 'true');
    } catch (e) {}
    try {
      localStorage.setItem(REMEMBER_KEY, String(Date.now() + REMEMBER_DAYS * 864e5));
    } catch (e) {}
  }

  // For the two pages with gates of their own (index.html, consenting-adults.html).
  window.AgeGate = { verified: verified, remember: remember };

  if (verified()) return;

  var root = document.documentElement;
  root.classList.add('age-locked');

  var css =
    'html.age-locked, html.age-locked body { overflow: hidden; }' +
    'html.age-locked body > :not(#age-gate) { visibility: hidden; }' +
    '#age-gate { position: fixed; inset: 0; z-index: 2147483000; background: rgba(6,9,16,0.94);' +
    '  -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px);' +
    '  display: flex; align-items: center; justify-content: center; padding: 1rem;' +
    '  font-family: "Raleway", system-ui, sans-serif; }' +
    '#age-gate .age-box { background: var(--surface, #1e2438); color: var(--text, #f2f6ff);' +
    '  border: 1px solid var(--border, rgba(180,195,225,0.24)); border-top: 2px solid var(--accent, var(--electric, #7fb2ff));' +
    '  border-radius: var(--radius, 4px); max-width: 420px; width: 100%; padding: 2.6rem 2rem; text-align: center; }' +
    '#age-gate .age-diamond { width: 52px; height: 52px; border: 1px solid var(--border, rgba(180,195,225,0.42));' +
    '  transform: rotate(45deg); margin: 0 auto 1.6rem; display: flex; align-items: center; justify-content: center;' +
    '  background: var(--surface-2, var(--bg, #262d44)); }' +
    '#age-gate .age-diamond span { transform: rotate(-45deg); font-family: "Cinzel", serif; font-weight: 600;' +
    '  font-size: 0.8rem; color: var(--accent, var(--electric, #7fb2ff)); }' +
    '#age-gate .age-eyebrow { font-family: "Cinzel", serif; font-size: 0.62rem; letter-spacing: 0.4em;' +
    '  text-transform: uppercase; color: var(--text-dim, #a9b4cc); display: block; margin-bottom: 0.7rem; }' +
    '#age-gate h2 { font-family: "Cormorant Garamond", Georgia, serif; font-weight: 300; font-size: 1.7rem;' +
    '  color: var(--text, #fff); margin: 0 0 0.8rem; letter-spacing: normal; text-transform: none; display: block; }' +
    '#age-gate p { font-size: 0.9rem; color: var(--text-dim, #a9b4cc); line-height: 1.8; margin: 0 0 1.8rem; }' +
    '#age-gate .age-buttons { display: flex; gap: 0.8rem; justify-content: center; flex-wrap: wrap; }' +
    '#age-gate button { font-family: "Cinzel", serif; font-size: 0.64rem; letter-spacing: 0.28em;' +
    '  text-transform: uppercase; padding: 0.85rem 1.5rem; border-radius: var(--radius, 4px); cursor: pointer;' +
    '  border: 1px solid; background: transparent; transition: all 0.25s; }' +
    '#age-gate .age-yes { color: var(--text, #fff); border-color: var(--accent, var(--electric, #7fb2ff)); }' +
    '#age-gate .age-yes:hover, #age-gate .age-yes:focus-visible { background: var(--accent, var(--electric, #7fb2ff)); color: #fff; }' +
    '#age-gate .age-no { color: var(--text-dim, #a9b4cc); border-color: var(--border, rgba(180,195,225,0.24)); }' +
    '#age-gate .age-no:hover, #age-gate .age-no:focus-visible { color: var(--text, #f2f6ff); }';

  var style = document.createElement('style');
  style.textContent = css;
  (document.head || root).appendChild(style);

  // The heading face, for pages (the catalogue) that do not load it already.
  var font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&display=swap';
  (document.head || root).appendChild(font);

  function build() {
    var gate = document.createElement('div');
    gate.id = 'age-gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'age-gate-title');
    gate.innerHTML =
      '<div class="age-box">' +
        '<div class="age-diamond"><span>18+</span></div>' +
        '<span class="age-eyebrow">Adults Only</span>' +
        '<h2 id="age-gate-title">Are you 18 or older?</h2>' +
        '<p>This site contains and links to adult content intended for mature audiences only. ' +
        'You must be 18 or older to enter.</p>' +
        '<div class="age-buttons">' +
          '<button type="button" class="age-yes">Yes, I’m 18+</button>' +
          '<button type="button" class="age-no">No, exit</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(gate);

    var yes = gate.querySelector('.age-yes');
    yes.addEventListener('click', function () {
      remember();
      root.classList.remove('age-locked');
      gate.parentNode.removeChild(gate);
    });
    gate.querySelector('.age-no').addEventListener('click', function () {
      window.location.href = 'https://www.google.com';
    });
    yes.focus();
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
