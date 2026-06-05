/* ============================================================
   BRUNO B. BERRY — landing dot field
   A canvas grid of dots. The pointer pushes nearby dots apart
   with a non-linear falloff (closer = stronger) and tints them
   greener + lighter the closer they are. Only redraws while the
   pointer is active, so it idles at zero cost.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('land-dots');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var TAU = Math.PI * 2;

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ── tunables ─────────────────────────────────────────── */
  var GAP   = 24;    // dot spacing (px)
  var DOT   = 1.3;   // base dot radius (px)
  var R     = 165;   // pointer influence radius (px)
  var PUSH  = 18;    // max displacement at the cursor (px)
  var BASEA = 0.06;  // ambient dot alpha
  var MAXA  = 0.72;  // dot alpha at the cursor
  /* base ink (#f6f6f1) → accent green (#8ed152) */
  var BR = 246, BG = 246, BB = 241;
  var AR = 142, AG = 209, AB = 82;

  var w, h, bx, by, n;           // grid geometry
  var near, nearN = 0;           // dots inside the influence this frame
  var mx = -9999, my = -9999;    // pointer target
  var cx = mx, cy = my;          // smoothed pointer
  var str = 0, strT = 0;         // influence strength 0..1 (eases in/out)
  var running = false;

  function build() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cols = Math.ceil(w / GAP) + 1;
    var rows = Math.ceil(h / GAP) + 1;
    var ox = (w - (cols - 1) * GAP) / 2;   // centre the grid
    var oy = (h - (rows - 1) * GAP) / 2;
    n = cols * rows;
    bx = new Float32Array(n);
    by = new Float32Array(n);
    near = new Int32Array(n);
    for (var i = 0, r = 0; r < rows; r++)
      for (var c = 0; c < cols; c++, i++) {
        bx[i] = ox + c * GAP;
        by[i] = oy + r * GAP;
      }
    draw();   // static base frame
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    var active = str > 0.002, R2 = R * R;

    /* 1) ambient dots — collected into one path, filled once (cheap) */
    nearN = 0;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var x = bx[i], y = by[i];
      if (active) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy < R2) { near[nearN++] = i; continue; }
      }
      ctx.moveTo(x + DOT, y);
      ctx.arc(x, y, DOT, 0, TAU);
    }
    ctx.fillStyle = 'rgba(246,246,241,' + BASEA + ')';
    ctx.fill();

    /* 2) influenced dots — pushed apart + tinted, drawn individually */
    for (var k = 0; k < nearN; k++) {
      var j = near[k];
      var ex = bx[j] - cx, ey = by[j] - cy;
      var d = Math.sqrt(ex * ex + ey * ey) || 0.0001;
      var f = (1 - d / R) * str;              // proximity 0..1 (eased)
      var force = PUSH * Math.pow(f, 1.7);    // non-linear push outward
      var px = bx[j] + ex / d * force;
      var py = by[j] + ey / d * force;

      var t = f * 0.9;                        // colour blend amount
      var a = BASEA + (MAXA - BASEA) * f;
      ctx.fillStyle = 'rgba(' +
        ((BR + (AR - BR) * t) | 0) + ',' +
        ((BG + (AG - BG) * t) | 0) + ',' +
        ((BB + (AB - BB) * t) | 0) + ',' + a + ')';
      ctx.beginPath();
      ctx.arc(px, py, DOT + f * 0.9, 0, TAU);
      ctx.fill();
    }
  }

  function tick() {
    cx += (mx - cx) * 0.45;
    cy += (my - cy) * 0.45;
    str += (strT - str) * 0.18;
    draw();
    /* settled → render one clean frame and idle until the next move */
    if (Math.abs(mx - cx) < 0.3 && Math.abs(my - cy) < 0.3 &&
        Math.abs(strT - str) < 0.003) {
      str = strT; draw(); running = false; return;
    }
    requestAnimationFrame(tick);
  }

  function kick() { if (!running) { running = true; requestAnimationFrame(tick); } }

  if (!reduce) {
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY; strT = 1; kick();
    }, { passive: true });
    var leave = function () { strT = 0; kick(); };
    window.addEventListener('pointerleave', leave);
    document.addEventListener('mouseleave', leave);
  }

  build();
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(build, 150);
  }, { passive: true });
})();
