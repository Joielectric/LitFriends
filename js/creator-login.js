/* "Log in", for creators.
 *
 * Every public page gets a Log in button at the right of its top bar. Pressing
 * it does not go straight to Google: it first says what this is — a space for
 * creators, invite only — so a listener who wandered in knows it is not for
 * them, and an invited creator knows which Google account to use. Sign-in
 * itself happens on the Content Manager (tools.html), which already does it.
 *
 * Someone who has signed in on this browser before gets a "Content Manager"
 * button that goes straight there instead.
 *
 * Pages whose top bar is drawn or redrawn by script (SiteNav.collective, the
 * Velvet Key menu in js/nav.js) call CreatorLogin.attach() / .open() themselves.
 */
(function () {
  'use strict';

  var SIGN_IN = '/tools.html';
  var EMAIL = 'joi@joielectric.com';

  function signedInBefore() {
    try { return localStorage.getItem('cm_signed_in') === '1'; } catch (e) { return false; }
  }

  var CSS =
    '.cl-btn{margin-left:0.4rem;flex:none;display:inline-flex;align-items:center;gap:0.4rem;cursor:pointer;' +
    'font:500 0.88rem var(--display, "Space Grotesk", system-ui, sans-serif);color:var(--text, #f6f7ff);text-decoration:none;' +
    'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);border-radius:999px;padding:0.42rem 0.95rem;' +
    'transition:background .2s,border-color .2s}' +
    '.cl-btn:hover{background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.32)}' +
    '.cl-btn svg{width:15px;height:15px}' +
    '.topbar .topnav{margin-left:auto}' +
    '#cl-modal{position:fixed;inset:0;z-index:2147482000;display:none;align-items:center;justify-content:center;padding:16px;' +
    'background:rgba(4,5,12,0.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}' +
    '#cl-modal.open{display:flex}' +
    '#cl-box{position:relative;width:100%;max-width:420px;background:#11142a;color:#f6f7ff;border:1px solid rgba(255,255,255,0.14);' +
    'border-radius:20px;padding:1.8rem 1.6rem 1.5rem;box-shadow:0 30px 80px rgba(0,0,0,0.55);' +
    'font:400 0.95rem/1.6 "Inter", system-ui, sans-serif;text-align:left}' +
    '#cl-box h2{font:700 1.35rem/1.2 "Space Grotesk", system-ui, sans-serif;margin:0 0 0.2rem;letter-spacing:-0.01em}' +
    '#cl-box .cl-tag{display:inline-block;font:600 0.72rem "Space Grotesk", system-ui, sans-serif;letter-spacing:0.08em;text-transform:uppercase;' +
    'color:#ffc56b;background:rgba(255,180,84,0.12);border:1px solid rgba(255,180,84,0.4);border-radius:999px;padding:0.15rem 0.6rem;margin-bottom:0.8rem}' +
    '#cl-box p{margin:0 0 0.9rem;color:#c8cee6}' +
    '#cl-box p strong{color:#f6f7ff}' +
    '#cl-box .cl-step{border-top:1px solid rgba(255,255,255,0.1);padding-top:0.9rem;margin-top:0.2rem}' +
    '#cl-box .cl-google{display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;margin:0.2rem 0 1rem;' +
    'background:#fff;color:#1f1f1f;border:0;border-radius:999px;padding:0.7rem 1rem;cursor:pointer;text-decoration:none;' +
    'font:600 0.95rem "Inter", system-ui, sans-serif}' +
    '#cl-box .cl-google:hover{box-shadow:0 0 0 3px rgba(255,255,255,0.18)}' +
    '#cl-box .cl-google svg{width:18px;height:18px}' +
    '#cl-box a.cl-mail{color:#39d5ff;font-weight:600;white-space:nowrap}' +
    '#cl-box p.cl-fine{margin:1rem 0 0;font-size:0.78rem;color:#8e97b8}' +
    '#cl-box p.cl-fine a{color:#c8cee6}' +
    '#cl-close{position:absolute;top:10px;right:12px;width:34px;height:34px;border-radius:50%;border:0;cursor:pointer;' +
    'background:transparent;color:#8e97b8;font-size:1.4rem;line-height:1}' +
    '#cl-close:hover{color:#fff;background:rgba(255,255,255,0.08)}';

  var G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  var KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>';

  var modal = null, lastFocus = null;

  function addStyle() {
    if (document.getElementById('cl-css')) return;
    var s = document.createElement('style');
    s.id = 'cl-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function build() {
    if (modal) return modal;
    addStyle();
    modal = document.createElement('div');
    modal.id = 'cl-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cl-title');
    modal.innerHTML =
      '<div id="cl-box">' +
        '<button type="button" id="cl-close" aria-label="Close">&times;</button>' +
        '<span class="cl-tag">Invite only</span>' +
        '<h2 id="cl-title">Creators only</h2>' +
        '<p>This is a space for the creators who make the work on this site, and for now it is <strong>by invitation only</strong>.</p>' +
        '<div class="cl-step">' +
          '<p><strong>Have an invitation?</strong> Sign in with the Google account your invitation was sent to.</p>' +
          '<a class="cl-google" href="' + SIGN_IN + '">' + G + 'Sign in with Google</a>' +
        '</div>' +
        '<div class="cl-step">' +
          '<p style="margin:0"><strong>Interested in an invitation?</strong> Email ' +
          '<a class="cl-mail" href="mailto:' + EMAIL + '?subject=Creator%20invitation">' + EMAIL + '</a>.</p>' +
        '</div>' +
        '<p class="cl-fine">How we handle your details: <a href="/privacy.html">Privacy Policy</a></p>' +
      '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    modal.querySelector('#cl-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      // Keep Tab inside the dialog while it is open.
      if (e.key === 'Tab') {
        var f = modal.querySelectorAll('button, a[href]');
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    return modal;
  }

  function open() {
    build();
    lastFocus = document.activeElement;
    modal.classList.add('open');
    modal.querySelector('.cl-google').focus();
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // The button for a top bar: Log in, or straight to the Content Manager for
  // someone who has signed in here before.
  function button() {
    var back = signedInBefore();
    var b = document.createElement(back ? 'a' : 'button');
    b.className = 'cl-btn';
    if (back) {
      b.href = SIGN_IN;
      b.innerHTML = KEY + 'Content Manager';
    } else {
      b.type = 'button';
      b.innerHTML = KEY + 'Log in';
      b.addEventListener('click', open);
    }
    return b;
  }

  function attach() {
    addStyle();
    var bar = document.getElementById('topbar');
    if (bar && !bar.querySelector('.cl-btn')) bar.appendChild(button());
    // The homepage's old footer link to the tools goes through the same door.
    Array.prototype.forEach.call(document.querySelectorAll('a.tools-link'), function (a) {
      if (a.dataset.cl) return;
      a.dataset.cl = '1';
      if (signedInBefore()) return;
      a.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });
  }

  window.CreatorLogin = { open: open, close: close, attach: attach };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
