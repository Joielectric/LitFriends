/* The icon for a link to somewhere else — a creator's Literotica, Reddit,
 * Bluesky and so on — chosen by the link's host, so nobody has to pick one.
 *
 * The icons themselves live in /images/platforms. Most are the brand's own
 * glyph on its brand colour (from Simple Icons, CC0); Literotica, Audiochan,
 * HotAudio, Tellonym and Whyp use their sites' own marks.
 *
 * Two ways in:
 *   LinkIcons.html(url)   an <img> tag for that link, or '' if none is known
 *   LinkIcons.apply()     upgrade every .platform-link on the page, swapping the
 *                         lettered .platform-icon placeholder (LIT, RDT…) for the
 *                         real mark. Runs on its own once the page has loaded.
 *
 * A host with no icon keeps whatever the page already shows, so adding one is
 * only ever an improvement: drop the file in /images/platforms and add a line.
 */
(function () {
  'use strict';

  var DIR = '/images/platforms/';

  // Host (without www.) → icon file. A subdomain matches its parent.
  var HOSTS = {
    'literotica.com':        'literotica.svg',
    'reddit.com':            'reddit.svg',
    'redd.it':               'reddit.svg',
    'audiochan.com':         'audiochan.png',
    'hotaudio.net':          'hotaudio.svg',
    'whyp.it':               'whyp.ico',
    'bsky.app':              'bluesky.svg',
    'bsky.social':           'bluesky.svg',
    'linktr.ee':             'linktree.svg',
    'patreon.com':           'patreon.svg',
    'airtable.com':          'airtable.svg',
    'tellonym.me':           'tellonym.png',
    'ko-fi.com':             'kofi.svg',
    'onlyfans.com':          'onlyfans.svg',
    'x.com':                 'x.svg',
    'twitter.com':           'x.svg',
    'instagram.com':         'instagram.svg',
    'tiktok.com':            'tiktok.svg',
    'youtube.com':           'youtube.svg',
    'youtu.be':              'youtube.svg',
    'discord.gg':            'discord.svg',
    'discord.com':           'discord.svg',
    'tumblr.com':            'tumblr.svg',
    'threads.net':           'threads.svg',
    'threads.com':           'threads.svg',
    'twitch.tv':             'twitch.svg',
    'soundcloud.com':        'soundcloud.svg',
    'spotify.com':           'spotify.svg',
    'substack.com':          'substack.svg',
    'archiveofourown.org':   'archiveofourown.svg',
    'wattpad.com':           'wattpad.svg',
    'carrd.co':              'carrd.svg',
  };

  function iconFor(url) {
    var host;
    try { host = new URL(url, location.href).hostname.toLowerCase(); } catch (e) { return ''; }
    host = host.replace(/^www\./, '');
    while (host) {
      if (HOSTS[host]) return DIR + HOSTS[host];
      var dot = host.indexOf('.');
      if (dot === -1) break;
      host = host.slice(dot + 1);
    }
    return '';
  }

  function html(url) {
    var src = iconFor(url);
    return src ? '<img class="link-logo" src="' + src + '" alt="" width="28" height="28" loading="lazy">' : '';
  }

  // The static profile pages each style .platform-icon as a lettered tile;
  // once it holds a logo, the logo is the tile.
  var CSS =
    '.platform-icon.has-logo{background:none;border:none;padding:0;overflow:hidden}' +
    '.link-logo{display:block;width:100%;height:100%;object-fit:contain;border-radius:22%}';

  function addStyle() {
    if (document.getElementById('link-icons-css')) return;
    var s = document.createElement('style');
    s.id = 'link-icons-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function apply(root) {
    addStyle();
    var links = (root || document).querySelectorAll('a.platform-link');
    Array.prototype.forEach.call(links, function (a) {
      var box = a.querySelector('.platform-icon');
      if (!box || box.classList.contains('has-logo')) return;
      var tag = html(a.getAttribute('href'));
      if (!tag) return;
      box.innerHTML = tag;
      box.classList.add('has-logo');
    });
  }

  window.LinkIcons = { iconFor: iconFor, html: html, apply: apply, addStyle: addStyle };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(); });
  else apply();
})();
