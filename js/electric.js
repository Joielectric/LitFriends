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
