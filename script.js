/* ============================================================
   BRUNO B. BERRY — site interactions
   ============================================================ */
(function () {
  'use strict';

  /* ---- intro load animation ---- */
  function fireLoad() { document.body.classList.add('loaded'); }
  if (document.readyState === 'complete') fireLoad();
  else window.addEventListener('load', fireLoad);
  requestAnimationFrame(fireLoad);

  /* ---- mobile nav ---- */
  var rail = document.getElementById('rail');
  var burger = document.getElementById('burger');
  var scrim = document.getElementById('scrim');
  function closeNav() {
    if (!rail) return;
    rail.classList.remove('open');
    if (burger) burger.classList.remove('x');
    if (scrim) scrim.classList.remove('show');
    document.body.style.overflow = '';
  }
  function toggleNav() {
    if (!rail) return;
    var open = rail.classList.toggle('open');
    if (burger) burger.classList.toggle('x', open);
    if (scrim) scrim.classList.toggle('show', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger) burger.addEventListener('click', toggleNav);
  if (scrim) scrim.addEventListener('click', closeNav);

  /* close mobile nav after tapping an in-page link */
  document.querySelectorAll('.nav a[href^="#"], .nav__sub[href^="#"]').forEach(function (a) {
    a.addEventListener('click', closeNav);
  });

  /* ---- scrollspy (only on pages with sections) ---- */
  var spyTargets = document.querySelectorAll('[data-spy]');
  if (spyTargets.length) {
    var navItems = {};
    document.querySelectorAll('.nav__item[data-for]').forEach(function (el) {
      navItems[el.getAttribute('data-for')] = el;
    });
    function setActive(id) {
      Object.keys(navItems).forEach(function (k) {
        navItems[k].classList.toggle('active', k === id);
      });
    }
    // intro is active on load; observer only takes over once the user has actually scrolled
    setActive('intro');
    var visibleSpy = new Set();
    var spyOrder = Array.from(spyTargets).map(function (t) { return t.getAttribute('data-spy'); });
    var spy = new IntersectionObserver(function (entries) {
      // stay on intro until user has scrolled away from the top
      if (window.scrollY < 50) return;
      // ignore section updates while pinned at the very bottom (connect wins there)
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return;
      entries.forEach(function (e) {
        var id = e.target.getAttribute('data-spy');
        if (e.isIntersecting) visibleSpy.add(id); else visibleSpy.delete(id);
      });
      for (var i = 0; i < spyOrder.length; i++) {
        if (visibleSpy.has(spyOrder[i])) { setActive(spyOrder[i]); break; }
      }
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    spyTargets.forEach(function (t) { spy.observe(t); });

    // Bottom of page => _connect selected (section is short and may never hit the band)
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          setActive('connect');
        }
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // Clicking a primary nav link reflects selection immediately
    document.querySelectorAll('.nav__item[data-for]').forEach(function (el) {
      el.addEventListener('click', function () { setActive(el.getAttribute('data-for')); });
    });
  }

  /* ---- scroll reveal ---- */
  var reveal = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(function (el) { reveal.observe(el); });

  /* ---- modals (misc projects) ---- */
  var modal = document.getElementById('modal');
  if (modal) {
    var mCard = modal.querySelector('.modal__card');
    var mCo = document.getElementById('m-co');
    var mTitle = document.getElementById('m-title');
    var mMeta = document.getElementById('m-meta');
    var mCar = document.getElementById('m-carousel');
    var mBody = document.getElementById('m-body');
    var lastFocus = null;

    // project content lives in window.MISC (defined inline in the page)
    var DATA = window.MISC || {};

    // carousel state for the currently open modal
    var car = { imgs: [], i: 0 };

    function renderCarousel() {
      var n = car.imgs.length;
      var track = mCar.querySelector('.carousel__track');
      track.style.transform = 'translateX(' + (-car.i * 100) + '%)';
      var dots = mCar.querySelectorAll('.carousel__dot');
      dots.forEach(function (d, idx) { d.classList.toggle('active', idx === car.i); });
      var count = mCar.querySelector('.carousel__count');
      if (count) count.textContent = (car.i + 1) + ' / ' + n;
    }
    function goTo(idx) {
      var n = car.imgs.length;
      if (!n) return;
      car.i = (idx + n) % n;
      renderCarousel();
    }
    function buildCarousel(imgs, title) {
      car.imgs = imgs || [];
      car.i = 0;
      if (!car.imgs.length) { mCar.style.display = 'none'; mCar.innerHTML = ''; return; }
      var slides = car.imgs.map(function (src, idx) {
        return '<div class="carousel__slide"><img src="' + src + '" alt="' + title + ' — image ' + (idx + 1) + '" loading="lazy" /></div>';
      }).join('');
      var multi = car.imgs.length > 1;
      var dots = multi ? '<div class="carousel__dots">' + car.imgs.map(function (_, idx) {
        return '<button class="carousel__dot" aria-label="Go to image ' + (idx + 1) + '"></button>';
      }).join('') + '</div>' : '';
      var nav = multi ?
        '<button class="carousel__btn carousel__btn--prev" aria-label="Previous image">\u2039</button>' +
        '<button class="carousel__btn carousel__btn--next" aria-label="Next image">\u203a</button>' +
        '<div class="carousel__count"></div>' : '';
      mCar.innerHTML = '<div class="carousel__viewport"><div class="carousel__track">' + slides + '</div>' + nav + '</div>' + dots;
      mCar.style.display = 'block';
      if (multi) {
        mCar.querySelector('.carousel__btn--prev').addEventListener('click', function () { goTo(car.i - 1); });
        mCar.querySelector('.carousel__btn--next').addEventListener('click', function () { goTo(car.i + 1); });
        mCar.querySelectorAll('.carousel__dot').forEach(function (d, idx) {
          d.addEventListener('click', function () { goTo(idx); });
        });
      }
      renderCarousel();
    }

    function openModal(key) {
      var d = DATA[key];
      if (!d) return;
      lastFocus = document.activeElement;
      mCo.textContent = d.co;
      mTitle.textContent = d.title;
      mMeta.innerHTML = d.meta.map(function (m) { return '<span>' + m + '</span>'; }).join('');
      buildCarousel(d.imgs || (d.img ? [d.img] : []), d.title);
      mBody.innerHTML = d.body;
      if (mCard) mCard.scrollTop = 0;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      var closeBtn = modal.querySelector('.modal__close');
      if (closeBtn) closeBtn.focus();
    }
    function closeModal() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      car.imgs = [];
      if (lastFocus) lastFocus.focus();
    }
    document.querySelectorAll('[data-modal]').forEach(function (t) {
      t.addEventListener('click', function () { openModal(t.getAttribute('data-modal')); });
    });
    modal.querySelector('.modal__back').addEventListener('click', closeModal);
    modal.querySelector('.modal__close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (!modal.classList.contains('open')) return;
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowLeft' && car.imgs.length > 1) goTo(car.i - 1);
      else if (e.key === 'ArrowRight' && car.imgs.length > 1) goTo(car.i + 1);
    });
  }

  /* ---- footer year ---- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---- justified-rows mosaic for project galleries ----
     Each tile keeps its image's true aspect ratio; rows scale to
     fill the width edge-to-edge (no gaps, no cropping). */
  (function () {
    var galleries = Array.prototype.slice.call(document.querySelectorAll('.proj-gallery'));
    if (!galleries.length) return;
    var GAP = 14;

    function arOf(shot) {
      var img = shot.querySelector('img');
      if (img && img.naturalWidth > 0) return img.naturalWidth / img.naturalHeight;
      var d = parseFloat(shot.getAttribute('data-ar'));
      return d > 0 ? d : 1.5;
    }

    function layout(g) {
      var shots = Array.prototype.slice.call(g.querySelectorAll('.shot'));
      if (!shots.length) return;
      var cs = getComputedStyle(g);
      var cw = g.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (cw <= 0) return;

      // very narrow column: single-column natural stack
      if (cw < 340) {
        g.classList.add('is-stacked');
        shots.forEach(function (s) { s.style.width = ''; s.style.height = ''; });
        return;
      }
      g.classList.remove('is-stacked');

      // per-page rhythm: different baseline row height
      var scale = parseFloat(g.getAttribute('data-rowscale')) || 1;
      var targetH = Math.max(120, Math.min(320, (cw / 4.2) * scale));

      var row = [], arSum = 0, lastH = targetH;
      function flush(stretch) {
        if (!row.length) return;
        var avail = cw - GAP * (row.length - 1);   // width for tiles (gaps come from flex gap)
        var rowH = stretch ? avail / arSum : Math.min(targetH, lastH, avail / arSum);
        if (stretch) lastH = rowH;                   // keep the trailing row in step with full rows
        var usedW = 0;
        row.forEach(function (o, i) {
          var w;
          if (i === row.length - 1 && stretch) {
            w = avail - usedW;                       // last tile takes remainder so row is flush
          } else {
            w = Math.round(rowH * o.ar);
            usedW += w;
          }
          o.shot.style.width = w + 'px';
          o.shot.style.height = Math.round(rowH) + 'px';
        });
        row = []; arSum = 0;
      }
      shots.forEach(function (shot) {
        var ar = arOf(shot);
        row.push({ shot: shot, ar: ar });
        arSum += ar;
        if (arSum * targetH + GAP * (row.length - 1) >= cw) flush(true);
      });
      flush(false); // trailing row keeps target height (not stretched full width)
    }

    function layoutAll() { galleries.forEach(layout); }

    // relayout as images report their real dimensions (incl. remote ones)
    document.querySelectorAll('.proj-gallery img').forEach(function (img) {
      if (!img.complete) {
        img.addEventListener('load', layoutAll);
        img.addEventListener('error', layoutAll);
      }
    });
    window.addEventListener('load', layoutAll);
    var t;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(layoutAll, 120); });
    layoutAll();
  })();

  /* ---- gallery lightbox with carousel ----
     Clicking any .shot in a .proj-gallery opens a fullscreen viewer.
     Arrows, dots, keyboard (← → Esc), and backdrop click navigate / close. */
  (function () {
    var overlay = document.getElementById('lb');
    if (!overlay) return;

    var lbImg   = document.getElementById('lb-img');
    var lbCap   = document.getElementById('lb-cap');
    var lbCount = document.getElementById('lb-count');
    var lbPrev  = overlay.querySelector('.lb__prev');
    var lbNext  = overlay.querySelector('.lb__next');
    var lbClose = overlay.querySelector('.lb__close');

    var state = { imgs: [], caps: [], i: 0, open: false };

    function show(idx) {
      var n = state.imgs.length;
      state.i = ((idx % n) + n) % n;
      // fade out → swap → fade in
      lbImg.style.opacity = '0';
      setTimeout(function () {
        lbImg.src = state.imgs[state.i];
        lbImg.alt = state.caps[state.i];
        lbCap.textContent  = state.caps[state.i];
        lbCount.textContent = (state.i + 1) + ' \u2013 ' + n;
        lbImg.style.opacity = '';
      }, 150);
    }

    function openLb(imgs, caps, startIdx) {
      state.imgs = imgs; state.caps = caps; state.i = startIdx; state.open = true;
      lbImg.style.opacity = '0';
      lbImg.src = imgs[startIdx];
      lbImg.alt = caps[startIdx];
      lbCap.textContent  = caps[startIdx];
      lbCount.textContent = (startIdx + 1) + ' \u2013 ' + imgs.length;
      // fade in once image is ready
      lbImg.onload = lbImg.onerror = function () { lbImg.style.opacity = ''; lbImg.onload = lbImg.onerror = null; };
      if (lbImg.complete) lbImg.style.opacity = '';
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      lbClose.focus();
    }

    function closeLb() {
      state.open = false;
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    // wire every .proj-gallery
    document.querySelectorAll('.proj-gallery').forEach(function (g) {
      g.addEventListener('click', function (e) {
        var shot = e.target.closest('.shot');
        if (!shot) return;
        var shots = Array.prototype.slice.call(g.querySelectorAll('.shot'));
        var imgs  = shots.map(function (s) { return s.querySelector('img').src; });
        var caps  = shots.map(function (s) {
          var c = s.querySelector('.shot__cap');
          return c ? c.textContent : '';
        });
        openLb(imgs, caps, shots.indexOf(shot));
      });
    });

    lbClose.addEventListener('click', closeLb);
    lbPrev.addEventListener('click', function () { show(state.i - 1); });
    lbNext.addEventListener('click', function () { show(state.i + 1); });

    // backdrop click (not on stage content)
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeLb();
    });

    document.addEventListener('keydown', function (e) {
      if (!state.open) return;
      if (e.key === 'Escape')     closeLb();
      if (e.key === 'ArrowLeft')  show(state.i - 1);
      if (e.key === 'ArrowRight') show(state.i + 1);
    });
  })();

  /* ---- client marquee (seamless endless scroll) ----
     Measure one group, clone it enough to cover the viewport, then
     scroll the track by exactly one group width so the loop is
     invisible. Re-measures after fonts load and on resize. */
  (function () {
    var box = document.querySelector('[data-logos]');
    if (!box) return;
    var track = box.querySelector('.logos__track');
    var group = box.querySelector('.logos__group');
    if (!track || !group) return;

    var reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (reduce) return;

    var SPEED = 55; // px per second

    function build() {
      box.classList.remove('is-ready');
      Array.prototype.slice.call(track.querySelectorAll('.logos__group.clone'))
        .forEach(function (c) { c.remove(); });

      var gw = group.scrollWidth;
      if (!gw) return;

      // enough copies to fill the viewport plus the one-group shift
      var copies = Math.ceil((box.clientWidth + gw) / gw) + 1;
      for (var i = 1; i < copies; i++) {
        var c = group.cloneNode(true);
        c.classList.add('clone');
        c.setAttribute('aria-hidden', 'true');
        track.appendChild(c);
      }
      track.style.setProperty('--shift', gw + 'px');
      track.style.setProperty('--dur', (gw / SPEED).toFixed(2) + 's');
      box.classList.add('is-ready');
    }

    // measure once text is in its final font, so widths are correct
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    else if (document.readyState === 'complete') build();
    else window.addEventListener('load', build);

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt); rt = setTimeout(build, 160);
    }, { passive: true });
  })();

  /* ---- about section: scroll-triggered dark mode ----
     When the about section covers >=25% of the viewport (reached by
     scrolling or by clicking _about in the nav), the dark theme washes
     over the whole page; it reverts to light once you leave the section
     (the connect section below stays light). body.theme-anim makes the
     swap gradual in both directions. */
  (function () {
    var about = document.getElementById('about');
    if (!about) return;
    var body = document.body;
    var dark = false, animT, ticking = false;

    function apply() {
      ticking = false;
      var r = about.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      // dark once the about section's top reaches the viewport's vertical
      // midpoint (the section now fills ~50% of the screen), and stays dark
      // through connect below; reverts only when you scroll back up above it.
      var want = r.top <= vh * 0.5;
      if (want === dark) return;
      dark = want;
      body.classList.add('theme-anim');
      body.classList.toggle('about-dark', dark);
      clearTimeout(animT);
      animT = setTimeout(function () { body.classList.remove('theme-anim'); }, 1000);
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    apply();
  })();

  /* ---- mobile "show more" (misc projects + kudos) ----
     Collapse to 3 items and reveal 3 more per tap. The .clamp-hidden class
     only hides under the mobile breakpoint (CSS), so desktop is unaffected. */
  (function () {
    var STEP = 3;
    document.querySelectorAll('[data-more]').forEach(function (btn) {
      var container = document.querySelector(btn.getAttribute('data-more'));
      if (!container) return;
      var items = Array.prototype.slice.call(
        container.querySelectorAll(btn.getAttribute('data-more-item')));
      if (items.length <= STEP) { btn.remove(); return; }
      var shown = STEP;
      function render(reveal) {
        items.forEach(function (it, i) {
          var hide = i >= shown;
          it.classList.toggle('clamp-hidden', hide);
          if (reveal && !hide) it.classList.add('in'); // skip scroll-reveal for newly shown
        });
        btn.classList.toggle('is-exhausted', shown >= items.length);
      }
      btn.addEventListener('click', function () { shown += STEP; render(true); });
      render(false);
    });
  })();
})();
