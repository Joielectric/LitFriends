// Page effects for premium profiles (see the extras in
// netlify/functions/profiles.js). Effects.start(name) runs one; each draws on
// its own fixed canvas that never takes a click, and none runs for someone
// who has asked their system for reduced motion.
(function () {
  'use strict';

  // Lightning: a strike as the page opens, then a faint one every so often.
  function lightning() {
    var c = document.createElement('canvas');
    c.id = 'lightning';
    c.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;opacity:0;';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ctx = c ? c.getContext('2d') : null;
    if (!ctx) return;
    var raf = null, active = [], running = false;

    function size() { c.width = window.innerWidth; c.height = window.innerHeight; }
    window.addEventListener('resize', size);

    function bolt(x1, y1, x2, y2, disp) {
      function sub(a, b, d) {
        if (d < 6) return [a, b];
        var m = { x: (a.x + b.x) / 2 + (Math.random() - 0.5) * d, y: (a.y + b.y) / 2 + (Math.random() - 0.5) * d };
        return sub(a, m, d / 2).slice(0, -1).concat(sub(m, b, d / 2));
      }
      return sub({ x: x1, y: y1 }, { x: x2, y: y2 }, disp);
    }
    function stroke(pts, w, color) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.shadowColor = '#b9a8ff'; ctx.shadowBlur = 26; ctx.stroke();
    }
    function makeStrike(intensity) {
      var W = c.width, H = c.height;
      var n = intensity >= 1 ? 2 + Math.floor(Math.random() * 2) : 1;
      var bolts = [];
      for (var k = 0; k < n; k++) {
        var main = bolt(W * (0.15 + Math.random() * 0.7), -30, W * (0.15 + Math.random() * 0.7), H + 30, W * 0.26);
        var bi = Math.floor(main.length * (0.35 + Math.random() * 0.3));
        var bp = main[bi] || main[0];
        var branch = bolt(bp.x, bp.y, bp.x + (Math.random() - 0.5) * W * 0.4, bp.y + H * 0.22, W * 0.1);
        bolts.push({ main: main, branch: branch, w: 2.2 + Math.random() * 1.6 });
      }
      active.push({ born: performance.now(), bolts: bolts, flash: intensity >= 1 ? 0.55 : 0.22, life: intensity >= 1 ? 480 : 300 });
      if (!running) { running = true; raf = requestAnimationFrame(frame); }
    }
    function frame(now) {
      var W = c.width, H = c.height;
      ctx.clearRect(0, 0, W, H);
      var maxFlash = 0, any = false;
      for (var i = active.length - 1; i >= 0; i--) {
        var s = active[i], age = now - s.born;
        if (age > s.life) { active.splice(i, 1); continue; }
        any = true;
        var fa = Math.max(0, 1 - age / (s.life * 0.5)) * s.flash;
        if (fa > maxFlash) maxFlash = fa;
      }
      if (maxFlash > 0) { ctx.save(); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(175,205,255,' + maxFlash + ')'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      for (var j = 0; j < active.length; j++) {
        var st = active[j], a = now - st.born;
        var ba = a < 70 ? 1 : Math.max(0, 1 - (a - 70) / (st.life - 70));
        if (ba <= 0) continue;
        ctx.save(); ctx.globalAlpha = ba;
        st.bolts.forEach(function (b) {
          stroke(b.main, b.w + 2.5, 'rgba(120,170,255,0.85)');
          stroke(b.branch, b.w * 0.7, 'rgba(150,190,255,0.8)');
          stroke(b.main, b.w * 0.5, '#ffffff');
        });
        ctx.restore();
      }
      if (any) { raf = requestAnimationFrame(frame); }
      else { ctx.clearRect(0, 0, W, H); c.style.opacity = '0'; running = false; }
    }
    function strike(intensity) { if (reduce) return; size(); c.style.opacity = '1'; makeStrike(intensity || 1); }
    var ambientTimer = null;
    function startAmbient() {
      if (reduce || ambientTimer) return;
      (function schedule() {
        ambientTimer = setTimeout(function () {
          if (!document.hidden) { c.style.opacity = '1'; makeStrike(0.5); }
          schedule();
        }, 7000 + Math.random() * 9000);
      })();
    }
    setTimeout(function () { strike(1); startAmbient(); }, 250);
  }

  var EFFECTS = { lightning: lightning };
  window.Effects = {
    start: function (name) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !EFFECTS[name]) return;
      EFFECTS[name]();
    },
  };
})();
