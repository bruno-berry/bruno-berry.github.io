/* ============================================================
   BRUNO B. BERRY — landing splash
   The splash (#landfront) is a fixed overlay that covers the LIVE
   home page in the same document. "Explore Now" ripples a tile grid
   out from centre and dissolves the overlay to reveal the page that
   is already loaded and painted beneath it — no iframe, no second
   navigation, so the reveal is instant.

   The whole dissolve is drawn on ONE <canvas> (a single compositor
   layer, ~1000 cheap fillRects per frame) so it stays pinned to the
   display refresh — smooth at 120/240Hz with no per-tile layers.
   ============================================================ */
(function () {
  'use strict';

  var front   = document.getElementById('landfront');
  var explore = document.getElementById('explore');
  var inner   = document.getElementById('land-inner');
  if (!front || !explore) return;

  /* splash skipped (deep link / return from a project) → nothing to dissolve */
  if (getComputedStyle(front).display === 'none') return;

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* lock the page behind the splash so it can't be scrolled while covered */
  var root = document.documentElement;
  root.style.overflow = 'hidden';
  function unlock() { root.style.overflow = ''; }
  function removeFront() { if (front && front.parentNode) front.parentNode.removeChild(front); }

  /* deterministic 0..1 jitter so the ripple feels organic, not mechanical */
  function jitter(c, r) {
    var n = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  /* cubic-bezier(0.16,1,0.3,1) sampler — matches the site's --ease so the
     dissolve shares the same strong ease-out feel. */
  function bezier(x1, y1, x2, y2) {
    function cx(t) { return ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t; }
    function cy(t) { return ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t; }
    function dx(t) { return 3 * (1 - 3 * x2 + 3 * x1) * t * t + 2 * (3 * x2 - 6 * x1) * t + 3 * x1; }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 5; i++) {        // Newton–Raphson: 5 iters is plenty
        var e = cx(t) - x, d = dx(t);
        if (d < 1e-6) break;
        t -= e / d;
      }
      return cy(t);
    };
  }
  var ease = bezier(0.16, 1, 0.3, 1);

  var navigating = false;
  function transition() {
    if (navigating) return;
    navigating = true;

    /* honour reduced-motion: skip the ripple, just clear the splash */
    if (reduce) { removeFront(); unlock(); return; }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    /* small tiles — a fraction of the shorter axis, clamped so the
       count stays bounded on tiny and huge screens alike */
    var target = Math.max(28, Math.min(46, Math.round(Math.min(vw, vh) / 24)));
    var cols = Math.max(8, Math.ceil(vw / target));
    var size = vw / cols;
    var rows = Math.max(6, Math.ceil(vh / size));
    var n = cols * rows;

    var ccx = (cols - 1) / 2;
    var ccy = (rows - 1) / 2;

    var LEAD = 90;   /* brief centre hold before the field starts clearing */
    var U    = 85;   /* base delay unit (ms) */
    var FADE = 520;  /* per-tile fade duration (ms) */

    /* precompute each tile's pixel centre + start delay (one pass, no
       per-frame trig) so the rAF loop is just arithmetic + fillRect */
    var px = new Float32Array(n);
    var py = new Float32Array(n);
    var delay = new Float32Array(n);
    var maxEnd = 0;
    for (var r = 0, i = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++, i++) {
        px[i] = c * size + size / 2;
        py[i] = r * size + size / 2;
        var ddx = c - ccx, ddy = r - ccy;
        var dist = Math.sqrt(ddx * ddx + ddy * ddy);
        /* dist^0.7 → ring-to-ring gap shrinks outward: the wavefront
           accelerates and more tiles drop per beat as it expands */
        var d = LEAD + U * Math.pow(dist, 0.7) + jitter(c, r) * 55;
        delay[i] = d;
        if (d + FADE > maxEnd) maxEnd = d + FADE;
      }
    }

    /* land-bg straight from the overlay so the field always matches */
    var fill = (getComputedStyle(front).getPropertyValue('--land-bg') || '#061308').trim();

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9999;pointer-events:none;';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* paint the solid field, then hide the splash beneath it: the canvas is
       opaque green over everything, so dropping #landfront now is invisible
       and leaves the live home page directly behind the dissolving tiles */
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, vw, vh);
    document.body.appendChild(canvas);
    removeFront();

    var SEAM = 1;          // overlap (px) so full tiles leave no sub-pixel seams
    var start = 0;

    function frameLoop(ts) {
      if (!start) start = ts;
      var t = ts - start;
      ctx.clearRect(0, 0, vw, vh);
      ctx.fillStyle = fill;

      for (var k = 0; k < n; k++) {
        var local = (t - delay[k]) / FADE;
        if (local >= 1) continue;          // gone → leave it transparent (reveals home)
        var s, a;
        if (local <= 0) { s = 1; a = 1; }  // not started → full, opaque
        else {
          var e = ease(local);
          s = 1 - 0.4 * e;                 // scale 1 → .6
          a = 1 - e;                       // opacity 1 → 0
        }
        var w = size * s + SEAM;
        ctx.globalAlpha = a;
        ctx.fillRect(px[k] - w / 2, py[k] - w / 2, w, w);
      }
      ctx.globalAlpha = 1;

      if (t < maxEnd) requestAnimationFrame(frameLoop);
      else { canvas.parentNode && canvas.parentNode.removeChild(canvas); unlock(); }
    }
    requestAnimationFrame(frameLoop);
  }

  explore.addEventListener('click', function (e) {
    e.preventDefault();
    transition();
  });
})();
