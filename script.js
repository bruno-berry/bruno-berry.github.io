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
    var spy = new IntersectionObserver(function (entries) {
      // ignore section updates while pinned at the very bottom (connect wins there)
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) return;
      entries.forEach(function (e) {
        if (e.isIntersecting) setActive(e.target.getAttribute('data-spy'));
      });
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
})();
