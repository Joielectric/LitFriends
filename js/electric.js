/* The shared page chrome from css/electric.css: the top bar takes its backdrop
 * once the page scrolls under it, and .reveal sections fade in as they arrive.
 * The page adds `reveal-on` to <html> itself, in its <head>, so nothing is
 * ever hidden unless this script is going to show it again.
 */
(function () {
  'use strict';
  var bar = document.getElementById('topbar');
  if (bar) {
    var onScroll = function () { bar.classList.toggle('scrolled', window.scrollY > 20); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  var items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (seen) {
    seen.forEach(function (it) { if (it.isIntersecting) { it.target.classList.add('in'); io.unobserve(it.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(items, function (el) { io.observe(el); });
})();

/* Collaborators' pages belong to the Consenting Adults collective, not to
 * JOI Electric: their bars lead to the collective's home, its artists and
 * the full catalogue, and offer the creator's own feedback form where JOI's
 * pages offer Contact.
 *
 * The hand-built pages in /profiles carry this markup already. Pages that
 * learn whose they are only after loading (profile.html, feedback.html?for=)
 * call SiteNav.collective(slug) once they know.
 */
(function () {
  'use strict';
  var I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    artists: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.6c3 .1 5.5 1.9 5.5 5.4"/></svg>',
    catalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    feedback: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>'
  };

  function links(slug) {
    return [
      { key: 'home', label: 'Home', href: '/consenting-adults.html' },
      { key: 'artists', label: 'Artists', href: '/consenting-adults.html#artists' },
      { key: 'catalog', label: 'Catalogue', href: '/catalog.html?all=1' },
      { key: 'feedback', label: 'Feedback', href: '/feedback.html?for=' + encodeURIComponent(slug) }
    ];
  }

  function collective(slug, current) {
    var bar = document.getElementById('topbar');
    if (bar) {
      bar.innerHTML =
        '<a class="brand ca" href="/consenting-adults.html" aria-label="Consenting Adults home"><img src="/images/CA_ICON.png" alt=""><span>Consenting Adults</span></a>' +
        '<div class="topnav">' + links(slug).slice(1).map(function (l) {
          return '<a href="' + l.href + '"' + (l.key === current ? ' aria-current="page"' : '') + '>' + l.label + '</a>';
        }).join('') + '</div>';
    }
    var bottom = document.querySelector('.bottombar');
    if (bottom) {
      bottom.innerHTML = links(slug).map(function (l) {
        return '<a href="' + l.href + '"' + (l.key === current ? ' aria-current="page"' : '') + '>' + I[l.key] + l.label + '</a>';
      }).join('');
    }
  }

  window.SiteNav = { collective: collective };
})();
