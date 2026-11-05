// Page effects, an optional feature of any profile (see the extras in
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

  // Drifting things: rose petals, cherry blossoms and rain share one loop.
  // Each kind says how many to keep per screenful, how to start one, how it
  // moves each frame and how to draw it. Pieces that leave the screen start
  // again, and the loop rests while the tab is hidden.
  function drift(kind) {
    var c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;opacity:0;transition:opacity 1.6s ease;';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    var ctx = c.getContext('2d');
    if (!ctx) return;
    var W = 0, H = 0, bits = [], last = 0, t0 = performance.now();

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var want = Math.min(kind.max, Math.round(W * H / kind.per));
      while (bits.length < want) bits.push(kind.spawn(W, H, true));
      bits.length = want;
    }
    window.addEventListener('resize', size);
    size();

    function frame(now) {
      // Steps are measured in 60fps frames, and a long pause (a hidden tab)
      // counts as one step rather than a jump.
      var dt = last ? Math.min(3, (now - last) / 16.67) : 1;
      last = now;
      ctx.clearRect(0, 0, W, H);
      var env = { t: (now - t0) / 1000, W: W, H: H };
      if (kind.env) kind.env(env);
      for (var i = 0; i < bits.length; i++) {
        var b = bits[i];
        kind.move(b, dt, env);
        if (b.y > H + 40 || b.x > W + 60 || b.x < -60) bits[i] = b = kind.spawn(W, H, false);
        kind.draw(ctx, b);
      }
      if (kind.after) kind.after(ctx, dt);
      requestAnimationFrame(frame);
    }
    // Fade in rather than open on a sudden screenful.
    requestAnimationFrame(function () { c.style.opacity = '1'; });
    requestAnimationFrame(frame);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // A petal about (0,0): rounded at the top, narrowing to its base; with a
  // notch, the little cleft of a cherry petal.
  function petalPath(ctx, w, h, notch) {
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.bezierCurveTo(w * 0.9, h * 0.25, w * 0.75, -h / 2, notch ? w * 0.18 : 0, -h / 2);
    if (notch) { ctx.lineTo(0, -h * 0.36); ctx.lineTo(-w * 0.18, -h / 2); }
    ctx.bezierCurveTo(-w * 0.75, -h / 2, -w * 0.9, h * 0.25, 0, h / 2);
    ctx.closePath();
  }

  // Rose petals: large and deep red, falling slowly and tumbling as they go.
  var rose = {
    per: 38000, max: 34,
    colors: ['#8e0f24', '#a3122c', '#b81d36', '#c72c45', '#7a0c1f'],
    spawn: function (W, H, first) {
      return {
        x: rand(-20, W + 20), y: first ? rand(-H * 0.2, H) : rand(-80, -20),
        s: rand(0.7, 1.25), vy: rand(0.45, 0.9), sway: rand(0.6, 1.4), ph: rand(0, 6.28),
        rot: rand(0, 6.28), vr: rand(-0.012, 0.012), flip: rand(0, 6.28), vf: rand(0.012, 0.03),
        col: pick(rose.colors), a: rand(0.7, 0.95)
      };
    },
    move: function (b, dt) {
      b.ph += 0.012 * dt;
      b.y += b.vy * dt;
      b.x += Math.sin(b.ph) * b.sway * 0.6 * dt;
      b.rot += b.vr * dt;
      b.flip += b.vf * dt;
    },
    draw: function (ctx, b) {
      // Tumbling: the petal narrows as it turns edge-on, and its underside
      // is a shade darker.
      var f = Math.cos(b.flip);
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(b.s * (0.25 + 0.75 * Math.abs(f)), b.s);
      ctx.globalAlpha = b.a;
      var g = ctx.createRadialGradient(0, -4, 1, 0, 0, 16);
      g.addColorStop(0, f > 0 ? '#e0566c' : '#c23a52');
      g.addColorStop(1, b.col);
      ctx.fillStyle = g;
      petalPath(ctx, 22, 24, false);
      ctx.fill();
      ctx.restore();
    }
  };

  // Cherry blossoms: small pale petals carried sideways on a breeze that
  // rises into the odd gust and settles again.
  var blossom = {
    per: 18000, max: 80,
    colors: ['#ffd6e3', '#ffc4d6', '#fbb3c9', '#ffe6ee', '#f7a8c0'],
    env: function (env) {
      env.wind = 1.4 + Math.sin(env.t * 0.35) * 0.6 + Math.max(0, Math.sin(env.t * 0.13 - 1)) * 2.2;
    },
    spawn: function (W, H, first) {
      // Most new petals blow in from the left; the rest drop from the top.
      var side = !first && Math.random() < 0.55;
      return {
        x: side ? rand(-50, -10) : rand(-W * 0.3, W), y: side ? rand(-20, H * 0.8) : (first ? rand(-H * 0.2, H) : rand(-40, -10)),
        s: rand(0.6, 1.05), vy: rand(0.35, 0.8), drag: rand(0.6, 1.1), ph: rand(0, 6.28),
        rot: rand(0, 6.28), vr: rand(-0.04, 0.04), flip: rand(0, 6.28), vf: rand(0.03, 0.07),
        col: pick(blossom.colors), a: rand(0.65, 0.95)
      };
    },
    move: function (b, dt, env) {
      b.ph += 0.03 * dt;
      b.x += (env.wind * b.drag + Math.sin(b.ph) * 0.4) * dt;
      b.y += (b.vy + Math.cos(b.ph * 0.7) * 0.35) * dt;
      b.rot += (b.vr + env.wind * 0.006) * dt;
      b.flip += b.vf * dt;
    },
    draw: function (ctx, b) {
      var f = Math.cos(b.flip);
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(b.s * (0.3 + 0.7 * Math.abs(f)), b.s);
      ctx.globalAlpha = b.a;
      ctx.fillStyle = b.col;
      petalPath(ctx, 18, 20, true);
      ctx.fill();
      // A blush of deeper pink at the base.
      ctx.globalAlpha = b.a * 0.5;
      ctx.fillStyle = '#ff8fb0';
      ctx.beginPath(); ctx.ellipse(0, 6, 2.2, 3.2, 0, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  };

  // Rain: fine, faint streaks at a slight slant. Some of the nearer drops
  // end in a small ripple partway down the page.
  var rain = {
    per: 9000, max: 160,
    rings: [],
    spawn: function (W, H, first) {
      var z = rand(0.4, 1);
      return { x: rand(-40, W), y: first ? rand(-H * 0.2, H) : rand(-120, -20), z: z, len: 10 + z * 14, v: 7 + z * 7, land: rand(H * 0.55, H + 30) };
    },
    move: function (b, dt, env) {
      b.y += b.v * dt;
      b.x += b.v * 0.12 * dt;
      if (b.z > 0.75 && b.y > b.land && rain.rings.length < 24) {
        rain.rings.push({ x: b.x, y: b.land, r: 1, a: 0.35 * b.z });
        b.y = env.H + 50;
      }
    },
    draw: function (ctx, b) {
      ctx.strokeStyle = 'rgba(190,215,255,' + (0.2 + b.z * 0.35) + ')';
      ctx.lineWidth = 0.8 + b.z * 0.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.len * 0.12, b.y - b.len);
      ctx.stroke();
    },
    after: function (ctx, dt) {
      for (var i = rain.rings.length - 1; i >= 0; i--) {
        var r = rain.rings[i];
        r.r += 0.5 * dt; r.a -= 0.012 * dt;
        if (r.a <= 0) { rain.rings.splice(i, 1); continue; }
        ctx.strokeStyle = 'rgba(190,215,255,' + r.a + ')';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * 2, r.r * 0.6, 0, 0, 6.28); ctx.stroke();
      }
    }
  };

  // Dripping blood: a dark, uneven line of it along the top of the screen,
  // with drips that creep down, each swelling to a drop at its tip. Now and
  // then a drip grows too heavy, lets its drop fall, and draws back up to
  // gather again. Slow on purpose: it should feel like it is seeping.
  function blood() {
    var c = document.createElement('canvas');
    c.style.cssText = 'position:fixed;inset:0;z-index:55;pointer-events:none;opacity:0;transition:opacity 2s ease;';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    var ctx = c.getContext('2d');
    if (!ctx) return;
    var W = 0, H = 0, drips = [], drops = [], edge = [], last = 0, off = 0;
    var DARK = '#4a000b', MID = '#7d0716', LIT = '#a8152a';

    function newDrip(x, first) {
      var w = rand(2.6, 6.5), max = rand(H * 0.06, H * 0.38) * (0.6 + w / 10);
      return {
        x: x, w: w,
        // Already part-way down when the page opens, so a drop falls soon.
        len: first ? rand(0, max * 0.85) : 0,
        max: max,
        v: rand(0.05, 0.16),          // creeping speed, px per frame
        surge: 0,                      // a short quickening now and then
        wob: rand(0, 6.28)
      };
    }
    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * dpr; c.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // It seeps from under the page's top bar, if it has one, so the bar's
      // links are never drawn over.
      var bar = document.querySelector('.topbar');
      off = bar ? Math.max(0, Math.min(120, Math.round(bar.getBoundingClientRect().bottom))) : 0;
      // The band along the top: a few slow bumps, thicker over each drip.
      edge = [];
      for (var x = 0; x <= W + 12; x += 12) edge.push(5 + Math.sin(x * 0.021) * 2.2 + Math.sin(x * 0.067 + 1.3) * 1.4 + rand(0, 1.2));
      var want = Math.max(5, Math.min(22, Math.round(W / 85)));
      drips = [];
      for (var i = 0; i < want; i++) drips.push(newDrip((i + rand(0.15, 0.85)) * W / want, true));
    }
    window.addEventListener('resize', size);
    size();

    function edgeAt(x) {
      var i = Math.max(0, Math.min(edge.length - 1, Math.round(x / 12)));
      return edge[i];
    }

    // The band, with a soft wet sheen along its lower lip.
    function drawEdge() {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (var i = 0; i < edge.length; i++) ctx.lineTo(i * 12, edge[i]);
      ctx.lineTo(W, 0);
      ctx.closePath();
      var g = ctx.createLinearGradient(0, 0, 0, 12);
      g.addColorStop(0, DARK); g.addColorStop(1, MID);
      ctx.fillStyle = g;
      ctx.fill();
    }

    // One drip: wide where it leaves the band, a thin neck, a round drop.
    function drawDrip(d) {
      var top = edgeAt(d.x) - 1, L = d.len;
      if (L < 1) return;
      var bulb = d.w * (0.55 + Math.min(1, L / 40) * 0.45);
      var neck = d.w * 0.42, base = d.w * 1.6;
      var tip = top + L;
      ctx.beginPath();
      ctx.moveTo(d.x - base, top);
      ctx.bezierCurveTo(d.x - neck, top + Math.min(L, 10), d.x - neck, tip - bulb * 2, d.x - bulb, tip - bulb * 0.2);
      ctx.arc(d.x, tip, bulb, Math.PI, 0, true);
      ctx.bezierCurveTo(d.x + neck, tip - bulb * 2, d.x + neck, top + Math.min(L, 10), d.x + base, top);
      ctx.closePath();
      var g = ctx.createLinearGradient(d.x - bulb, 0, d.x + bulb, 0);
      g.addColorStop(0, DARK); g.addColorStop(0.45, LIT); g.addColorStop(1, DARK);
      ctx.fillStyle = g;
      ctx.fill();
      // A glint on the drop.
      ctx.fillStyle = 'rgba(255,140,150,0.28)';
      ctx.beginPath(); ctx.ellipse(d.x - bulb * 0.35, tip - bulb * 0.3, bulb * 0.22, bulb * 0.38, -0.4, 0, 6.28); ctx.fill();
    }

    function drawDrop(p) {
      var r = p.r, stretch = 1 + Math.min(1.6, p.vy * 0.12);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, stretch);
      ctx.beginPath();
      ctx.moveTo(0, -r * 2.2);
      ctx.bezierCurveTo(r * 0.9, -r * 0.9, r, 0, 0, r);
      ctx.bezierCurveTo(-r, 0, -r * 0.9, -r * 0.9, 0, -r * 2.2);
      ctx.fillStyle = MID;
      ctx.fill();
      ctx.restore();
    }

    function frame(now) {
      var dt = last ? Math.min(3, (now - last) / 16.67) : 1;
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(0, off);
      ctx.globalAlpha = 0.93;
      for (var i = 0; i < drips.length; i++) {
        var d = drips[i];
        d.wob += 0.02 * dt;
        if (!d.surge && Math.random() < 0.002 * dt) d.surge = rand(40, 110);
        var speed = d.v * (d.surge ? 4 : 1) * (0.75 + Math.sin(d.wob) * 0.25);
        if (d.surge) d.surge = Math.max(0, d.surge - dt);
        d.len += speed * dt;
        if (d.len >= d.max) {
          // Too heavy: the drop lets go and the drip draws back.
          drops.push({ x: d.x, y: edgeAt(d.x) + d.len, vy: 0.6, r: d.w * 0.8 });
          d.len *= rand(0.25, 0.45);
          d.max = rand(H * 0.06, H * 0.38) * (0.6 + d.w / 10);
        }
        drawDrip(d);
      }
      drawEdge();
      for (var j = drops.length - 1; j >= 0; j--) {
        var p = drops[j];
        p.vy += 0.22 * dt;
        p.y += p.vy * dt;
        if (p.y + off > H + 40) { drops.splice(j, 1); continue; }
        drawDrop(p);
      }
      ctx.restore();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(function () { c.style.opacity = '1'; });
    requestAnimationFrame(frame);
  }

  var EFFECTS = {
    lightning: lightning,
    petals: function () { drift(rose); },
    blossoms: function () { drift(blossom); },
    rain: function () { drift(rain); },
    blood: blood,
  };
  window.Effects = {
    start: function (name) {
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce || !EFFECTS[name]) return;
      EFFECTS[name]();
    },
  };
})();
