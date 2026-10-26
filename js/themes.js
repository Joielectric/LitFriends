/* The script side of css/themes.css, for the one thing CSS can't do there.
 *
 * Every theme but Daylight is dark, and the accent picker's colours were
 * chosen for dark pages. On Daylight the accent is both text on white and the
 * fill behind white text, so a creator's colour that is too pale for that is
 * darkened, a step at a time, until it reads at 4.5:1 against white. The
 * profile page, the feedback form and the editor's preview all ask here, so
 * they agree on the colour.
 *
 *   Themes.isLight(key)        true for Daylight
 *   Themes.accentFor(key, c)   the accent to use for colour c on theme key:
 *                              c itself on a dark theme, #rrggbb on Daylight
 */
(function () {
  'use strict';

  var LIGHT = ['daylight'];

  function lum(rgb) {
    var l = rgb.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  }

  // #rgb, #rgba, #rrggbb or #rrggbbaa in; #rrggbb out, any alpha dropped.
  function inkOnLight(c) {
    var h = String(c).replace('#', '');
    if (h.length <= 4) h = h.slice(0, 3).replace(/./g, '$&$&');
    var rgb = [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); });
    if (rgb.some(isNaN)) return c;
    for (var i = 0; i < 40 && 1.05 / (lum(rgb) + 0.05) < 4.5; i++) {
      rgb = rgb.map(function (x) { return Math.round(x * 0.92); });
    }
    return '#' + rgb.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  function isLight(key) { return LIGHT.indexOf(key) !== -1; }

  window.Themes = {
    isLight: isLight,
    accentFor: function (key, c) { return isLight(key) ? inkOnLight(c) : c; }
  };
})();
