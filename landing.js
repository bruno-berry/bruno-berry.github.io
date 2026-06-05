/* ============================================================
   BRUNO B. BERRY — landing page
   "Explore Now" → ripple the tile grid out from centre,
   revealing the real home page rendered behind it, then
   hand off to the live page once the dissolve completes.
   ============================================================ */
(function () {
  'use strict';

  var EASE = 'cubic-bezier(0.16,1,0.3,1)';
  var DEST = 'home.html';

  var explore = document.getElementById('explore');
  var inner   = document.getElementById('land-inner');
  if (!explore) return;

  var reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  var navigating = false;
  function go() { window.location.href = DEST; }

  /* deterministic 0..1 jitter so the ripple feels organic, not mechanical */
  function jitter(c, r) {
    var n = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  function transition() {
    if (navigating) return;
    navigating = true;

    /* honour reduced-motion: skip the ripple, just go */
    if (reduce) { go(); return; }

    var vw = window.innerWidth;
    var vh = window.innerHeight;

    /* small tiles — a fraction of the shorter axis, clamped so the
       count stays bounded on tiny and huge screens alike */
    var target = Math.max(28, Math.min(46, Math.round(Math.min(vw, vh) / 24)));
    var cols = Math.max(8, Math.ceil(vw / target));
    var size = vw / cols;
    var rows = Math.max(6, Math.ceil(vh / size));

    var cx = (cols - 1) / 2;
    var cy = (rows - 1) / 2;

    var LEAD = 140;  /* hold the full green field briefly so the home
                        iframe can paint before the centre clears */
    var U    = 85;   /* base delay unit (ms) */
    var FADE = 520;  /* per-tile fade duration (ms) */
    var maxEnd = 0;

    var curtain = document.createElement('div');
    curtain.className = 'curtain';

    /* light fallback, then the live home page behind the tiles */
    var reveal = document.createElement('div');
    reveal.className = 'curtain__reveal';

    var frame = document.createElement('iframe');
    frame.className = 'curtain__frame';
    frame.setAttribute('src', DEST);
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('scrolling', 'no');

    var grid = document.createElement('div');
    grid.className = 'curtain__grid';
    grid.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
    grid.style.gridTemplateRows = 'repeat(' + rows + ',1fr)';

    var frag = document.createDocumentFragment();
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var dist = Math.sqrt((c - cx) * (c - cx) + (r - cy) * (r - cy));
        /* dist^0.7 → ring-to-ring gap shrinks outward: the wavefront
           accelerates and more tiles drop per beat as it expands */
        var delay = LEAD + U * Math.pow(dist, 0.7) + jitter(c, r) * 55;
        if (delay + FADE > maxEnd) maxEnd = delay + FADE;

        var t = document.createElement('div');
        t.className = 'curtain__tile';
        t.style.animation = 'tile-out ' + FADE + 'ms ' + EASE + ' ' +
          delay.toFixed(0) + 'ms forwards';
        frag.appendChild(t);
      }
    }
    grid.appendChild(frag);

    curtain.appendChild(reveal);
    curtain.appendChild(frame);
    curtain.appendChild(grid);
    document.body.appendChild(curtain);

    /* let the landing content slip away under the (matching-green) tiles */
    if (inner) {
      inner.style.transition = 'opacity .26s ease, transform .4s ' + EASE;
      inner.style.opacity = '0';
      inner.style.transform = 'scale(.985)';
    }

    /* hand off to the live page just as the last tiles finish */
    window.setTimeout(go, maxEnd + 60);
  }

  explore.addEventListener('click', function (e) {
    e.preventDefault();
    transition();
  });
})();
