/* ============================================================
   BRUNO B. BERRY — Movement / activity map  (unlinked page)
   Reads the static assets/data/activities.json baked by fetch_data.py,
   renders an interactive MapTiler map + KPIs + charts + table that all
   stay in sync. Selecting an activity drills the metrics into that route.
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.MAP_CONFIG || {};
  var COL = {
    run:  '#4c8a27',
    ride: '#d98a2b',
    ink:  '#15150f',
    ink2: '#46453c',
    ink3: '#8d8a7d',
    line: 'rgba(21,21,15,0.10)',
    grid: 'rgba(21,21,15,0.07)',
    accent: '#74c043',
    accentDeep: '#4c8a27',
    soft: '#ecf6e2'
  };

  /* ---- state ---- */
  var ALL = [];                 // every activity
  var filter = 'all';           // all | run | ride
  var locFilter = 'all';        // 'all' | a location string
  var selectedId = null;
  var sortKey = 'date', sortDir = -1;   // -1 desc, 1 asc
  var map = null, mapReady = false, pendingFit = null, hoverPopup = null;
  var charts = [null, null, null, null];
  var endMarkers = [];

  // default framing — all activities are in/around NYC
  var NYC_VIEW = { center: [-73.965, 40.715], zoom: 10.4 };

  /* ============================================================
     FORMATTERS
     ============================================================ */
  function km(m) { return (m / 1000); }
  function fmtDist(m) {
    var k = km(m);
    return (k >= 100 ? k.toFixed(0) : k.toFixed(1));
  }
  function fmtDur(s) {
    s = Math.round(s || 0);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }
  function fmtDurLong(s) {
    s = Math.round(s || 0);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    return m + 'm';
  }
  function fmtPace(spk) {           // seconds per km -> m:ss
    if (!spk || !isFinite(spk)) return '—';
    var m = Math.floor(spk / 60), s = Math.round(spk % 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function speedKmh(ms) { return ms ? ms * 3.6 : 0; }
  function fmtDate(d) {
    if (!d) return '—';
    var p = d.split('-');
    var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return mo[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ' ’' + p[0].slice(2);
  }
  function paceOrSpeed(a) {         // table cell + sort value
    if (a.category === 'run') return a.pace_s_per_km ? fmtPace(a.pace_s_per_km) + '/km' : '—';
    return a.avg_speed_ms ? speedKmh(a.avg_speed_ms).toFixed(1) + ' km/h' : '—';
  }
  function sortVal(a, key) {
    if (key === 'pace') {          // compare in a way that's meaningful per category
      if (a.category === 'run') return a.pace_s_per_km || 1e9;
      return a.avg_speed_ms ? 1e6 - speedKmh(a.avg_speed_ms) : 1e9; // faster ride ~ lower
    }
    if (key === 'date') return a.start || '';
    if (key === 'type') return a.category;
    if (key === 'name') return (a.name || '').toLowerCase();
    if (key === 'location') return locOf(a).toLowerCase();
    return a[key] == null ? -Infinity : a[key];
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* activity-type glyphs (Tabler-style, stroke = currentColor) */
  function typeIcon(cat) {
    var attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    if (cat === 'run') {
      return '<svg ' + attrs + '>' +
        '<circle cx="13" cy="4" r="1"/>' +
        '<path d="M4 17l5 1l.75 -1.5"/>' +
        '<path d="M15 21l0 -4l-4 -3l1 -6"/>' +
        '<path d="M7 12l0 -3l5 -1l3 3l3 1"/></svg>';
    }
    return '<svg ' + attrs + '>' +                       // ride
      '<circle cx="5" cy="18" r="3.5"/>' +
      '<circle cx="19" cy="18" r="3.5"/>' +
      '<path d="M12 19l0 -4l-3 -3l5 -4l2 3l3 0"/>' +
      '<circle cx="17" cy="5" r="1"/></svg>';
  }

  function popupHTML(a) {
    var col = a.category === 'run' ? COL.run : COL.ride;
    return '<div class="rp">' +
      '<div class="rp__top" style="color:' + col + '">' + typeIcon(a.category) +
        '<span>' + a.category + '</span></div>' +
      '<div class="rp__name">' + escapeHtml(a.name || a.type) + '</div>' +
      '<div class="rp__stats"><b>' + fmtDist(a.distance_m) + ' km</b>' +
        '<span>' + fmtDur(a.moving_s) + '</span></div>' +
      '<div class="rp__date">' + fmtDate(a.date) + '</div>' +
      '</div>';
  }

  /* micro sparkline of speed across the activity: bars above the average run
     green (faster), below red (slower). Speed is used for both run & ride so
     "above = faster" reads consistently. */
  function sparkline(a) {
    var raw = a.series && a.series.speed_ms;
    if (!raw) return '<span class="spark--none">—</span>';
    var pts = raw.filter(function (v) { return typeof v === 'number' && v >= 0; });
    if (pts.length < 4) return '<span class="spark--none">—</span>';
    var M = 32, step = pts.length / M, samp = [];
    for (var i = 0; i < M; i++) samp.push(pts[Math.min(pts.length - 1, Math.floor(i * step))]);
    var avg = samp.reduce(function (s, v) { return s + v; }, 0) / samp.length;
    var lo = Math.min.apply(null, samp), hi = Math.max.apply(null, samp), range = (hi - lo) || 1;
    var W = 84, H = 22, bw = W / M;
    var baseY = H - ((avg - lo) / range) * H;
    var bars = samp.map(function (v, i) {
      var y = H - ((v - lo) / range) * H, x = i * bw;
      var top = Math.min(y, baseY), h = Math.max(0.8, Math.abs(baseY - y));
      return '<rect class="' + (v >= avg ? 'up' : 'down') + '" x="' + x.toFixed(1) +
        '" y="' + top.toFixed(1) + '" width="' + (bw * 0.7).toFixed(1) + '" height="' + h.toFixed(1) + '"/>';
    }).join('');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line class="base" x1="0" y1="' + baseY.toFixed(1) + '" x2="' + W + '" y2="' + baseY.toFixed(1) + '"/>' +
      bars + '</svg>';
  }

  /* big-number markup with green suffix, mirrors .kpi__n .s */
  function kpi(num, suffix, label, trendHtml) {
    return '<div class="kpi"><div class="kpi__n">' + num +
      (suffix ? '<span class="s">' + suffix + '</span>' : '') +
      '</div><div class="kpi__l">' + label + '</div>' + (trendHtml || '') + '</div>';
  }

  /* week-over-week sub-KPI: this week's value + a direction arrow vs last week */
  function trendLine(thisV, lastV, text) {
    var dir = thisV > lastV ? 'up' : (thisV < lastV ? 'down' : 'flat');
    var arrow = dir === 'up' ? '▲' : (dir === 'down' ? '▼' : '▬');
    return '<div class="kpi__trend dir-' + dir + '"><span class="ar">' + arrow + '</span>' +
      text + ' <span class="wk">this wk</span></div>';
  }

  /* ============================================================
     DATA HELPERS
     ============================================================ */
  function locOf(a) { return a.location || 'Unknown'; }
  function filtered() {
    return ALL.filter(function (a) {
      if (filter !== 'all' && a.category !== filter) return false;
      if (locFilter !== 'all' && locOf(a) !== locFilter) return false;
      return true;
    });
  }
  function byId(id) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
    return null;
  }

  function agg(list) {
    var o = { n: list.length, dist: 0, elev: 0, time: 0, cal: 0, hrSum: 0, hrN: 0 };
    list.forEach(function (a) {
      o.dist += a.distance_m || 0; o.elev += a.elev_gain_m || 0;
      o.time += a.moving_s || 0; o.cal += a.calories || 0;
      if (a.avg_hr) { o.hrSum += a.avg_hr; o.hrN++; }
    });
    o.hr = o.hrN ? o.hrSum / o.hrN : 0;
    return o;
  }

  // "this week" is anchored to the most recent activity in the dataset, so a
  // manually-synced file always has a meaningful trailing-7-day window.
  var DAY = 86400000;
  function anchorMs() {
    var max = 0;
    ALL.forEach(function (a) { var t = Date.parse(a.start); if (t > max) max = t; });
    return max || Date.now();
  }
  function weekWindows(list) {
    var now = anchorMs();
    function within(a, from, to) {            // (now-from, now-to] days
      var t = Date.parse(a.start);
      return t > now - from * DAY && t <= now - to * DAY;
    }
    return {
      a: agg(list.filter(function (a) { return within(a, 7, 0); })),
      b: agg(list.filter(function (a) { return within(a, 14, 7); }))
    };
  }

  /* ============================================================
     KPIs
     ============================================================ */
  function renderKpis() {
    var box = document.getElementById('map-kpis');
    var sel = selectedId ? byId(selectedId) : null;
    var html;

    if (sel) {
      var fourth = sel.category === 'run'
        ? kpi(fmtPace(sel.pace_s_per_km), '/km', 'avg pace')
        : kpi(speedKmh(sel.avg_speed_ms).toFixed(1), ' km/h', 'avg speed');
      var sixth = sel.category === 'ride' && sel.avg_watts
        ? kpi(Math.round(sel.avg_watts), 'w', 'avg power')
        : (sel.calories ? kpi(Math.round(sel.calories), '', 'calories')
                        : kpi(sel.avg_cadence ? Math.round(sel.avg_cadence) : '—', '', 'avg cadence'));
      html =
        kpi(fmtDist(sel.distance_m), ' km', 'distance') +
        kpi(fmtDurLong(sel.moving_s), '', 'moving time') +
        kpi(Math.round(sel.elev_gain_m), ' m', 'elevation gain') +
        fourth +
        kpi(sel.avg_hr ? Math.round(sel.avg_hr) : '—', sel.avg_hr ? ' bpm' : '', 'avg heart rate') +
        sixth;
    } else {
      var list = filtered();
      var all = agg(list);
      var wk = weekWindows(list);          // { a: thisWeek agg, b: lastWeek agg }
      var totalKm = km(all.dist);
      html =
        kpi(list.length, '', (filter === 'all' ? 'activities' : filter + 's'),
            trendLine(wk.a.n, wk.b.n, wk.a.n)) +
        kpi(totalKm >= 1000 ? (totalKm / 1000).toFixed(1) : Math.round(totalKm),
            totalKm >= 1000 ? 'k km' : ' km', 'total distance',
            trendLine(wk.a.dist, wk.b.dist, fmtDist(wk.a.dist) + ' km')) +
        kpi(Math.round(all.elev / 1000).toLocaleString(), 'k m', 'total climbing',
            trendLine(wk.a.elev, wk.b.elev, Math.round(wk.a.elev).toLocaleString() + ' m')) +
        kpi(Math.round(all.time / 3600).toLocaleString(), ' h', 'moving time',
            trendLine(wk.a.time, wk.b.time, fmtDurLong(wk.a.time))) +
        kpi(all.hr ? Math.round(all.hr) : '—', all.hr ? ' bpm' : '', 'avg heart rate',
            trendLine(wk.a.hr, wk.b.hr, wk.a.hr ? Math.round(wk.a.hr) + ' bpm' : '—')) +
        kpi(Math.round(all.cal).toLocaleString(), '', 'calories burned',
            trendLine(wk.a.cal, wk.b.cal, Math.round(wk.a.cal).toLocaleString()));
    }
    box.innerHTML = html;
  }

  /* ============================================================
     CHARTS
     ============================================================ */
  function chartDefaults() {
    if (!window.Chart) return;
    Chart.defaults.font.family = "'Space Mono', ui-monospace, monospace";
    Chart.defaults.font.size = 10;
    Chart.defaults.color = COL.ink3;
  }
  function destroyCharts() {
    charts.forEach(function (c, i) { if (c) { c.destroy(); charts[i] = null; } });
  }
  function setCard(i, head, sub) {
    document.getElementById('c' + i + '-h').textContent = head;
    document.getElementById('c' + i + '-s').textContent = sub || '';
  }
  function ctx(i) { return document.getElementById('chart' + i).getContext('2d'); }

  var baseScales = function (xTitle, yTitle) {
    return {
      x: { title: { display: !!xTitle, text: xTitle, color: COL.ink3 },
           grid: { color: COL.grid }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
      y: { title: { display: !!yTitle, text: yTitle, color: COL.ink3 },
           grid: { color: COL.grid }, beginAtZero: false }
    };
  };
  var noLegend = { legend: { display: false } };

  function lineCfg(labels, datasets, scales, plugins) {
    return {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: Object.assign({ legend: { display: datasets.length > 1, labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
                                  tooltip: { backgroundColor: COL.ink, padding: 10, cornerRadius: 8, titleFont: { size: 10 }, bodyFont: { size: 11 } } }, plugins || {}),
        scales: scales
      }
    };
  }

  /* ---- aggregate charts (no selection) ---- */
  function renderAggregateCharts() {
    var list = filtered().slice().sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });

    /* 1 — Monthly volume (stacked run/ride distance) */
    var months = {}, order = [];
    list.forEach(function (a) {
      var key = (a.date || '').slice(0, 7);
      if (!key) return;
      if (!months[key]) { months[key] = { run: 0, ride: 0 }; order.push(key); }
      months[key][a.category] += km(a.distance_m);
    });
    var mLabels = order.map(function (k) {
      var p = k.split('-'); var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return mo[parseInt(p[1], 10) - 1] + ' ’' + p[0].slice(2);
    });
    var dsMonth = [];
    if (filter !== 'ride') dsMonth.push({ label: 'Run', data: order.map(function (k) { return Math.round(months[k].run); }), backgroundColor: COL.run, borderRadius: 3, stack: 's' });
    if (filter !== 'run') dsMonth.push({ label: 'Ride', data: order.map(function (k) { return Math.round(months[k].ride); }), backgroundColor: COL.ride, borderRadius: 3, stack: 's' });
    setCard(1, 'Monthly volume', 'distance per month · km');
    charts[0] = new Chart(ctx(1), {
      type: 'bar',
      data: { labels: mLabels, datasets: dsMonth },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: dsMonth.length > 1, labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
                   tooltip: { backgroundColor: COL.ink, padding: 10, cornerRadius: 8 } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 } },
                  y: { stacked: true, grid: { color: COL.grid }, beginAtZero: true } }
      }
    });

    /* 2 — Cumulative distance over time */
    var cum = 0;
    var cumPts = list.map(function (a) { cum += km(a.distance_m); return { x: a.date, y: Math.round(cum) }; });
    setCard(2, 'Cumulative distance', 'kilometres logged over time');
    charts[1] = new Chart(ctx(2), lineCfg(
      cumPts.map(function (p) { return p.x; }),
      [{ label: 'Total km', data: cumPts.map(function (p) { return p.y; }),
         borderColor: COL.accentDeep, backgroundColor: 'rgba(116,192,67,0.16)', fill: true,
         pointRadius: 0, borderWidth: 2, tension: 0.25 }],
      { x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 6, maxRotation: 0,
              callback: function (v) { var d = this.getLabelForValue(v); return d ? d.slice(0, 7) : ''; } } },
        y: { grid: { color: COL.grid }, beginAtZero: true } },
      noLegend
    ));

    /* 3 — Distance per activity (scatter, colored by type) */
    var pts = list.map(function (a, i) { return { x: i, y: +km(a.distance_m).toFixed(1), c: a.category, d: a.date }; });
    setCard(3, 'Distance per activity', 'each session, oldest → newest · km');
    charts[2] = new Chart(ctx(3), {
      type: 'scatter',
      data: { datasets: [{
        data: pts,
        parsing: false,
        pointBackgroundColor: pts.map(function (p) { return p.c === 'run' ? COL.run : COL.ride; }),
        pointBorderWidth: 0, pointRadius: 3, pointHoverRadius: 5
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { backgroundColor: COL.ink, padding: 10, cornerRadius: 8,
            callbacks: { title: function (it) { return it[0].raw.d; }, label: function (it) { return it.raw.y + ' km'; } } } },
        scales: { x: { display: false }, y: { grid: { color: COL.grid }, beginAtZero: true } }
      }
    });

    /* 4 — Avg heart rate trend */
    var hrPts = list.filter(function (a) { return a.avg_hr; })
      .map(function (a) { return { x: a.date, y: Math.round(a.avg_hr), c: a.category }; });
    setCard(4, 'Heart-rate trend', 'average bpm per activity');
    charts[3] = new Chart(ctx(4), {
      type: 'scatter',
      data: { datasets: [{
        data: hrPts.map(function (p, i) { return { x: i, y: p.y, d: p.x }; }),
        parsing: false,
        pointBackgroundColor: hrPts.map(function (p) { return p.c === 'run' ? COL.run : COL.ride; }),
        pointBorderWidth: 0, pointRadius: 3, pointHoverRadius: 5,
        showLine: false
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { backgroundColor: COL.ink, padding: 10, cornerRadius: 8,
            callbacks: { title: function (it) { return it[0].raw.d; }, label: function (it) { return it.raw.y + ' bpm'; } } } },
        scales: { x: { display: false }, y: { grid: { color: COL.grid }, beginAtZero: false } }
      }
    });
  }

  /* ---- per-activity charts (selection) ---- */
  function renderActivityCharts(a) {
    var s = a.series;
    if (!s || !s.dist_km) {           // no stream data — show a friendly empty state
      [1, 2, 3, 4].forEach(function (i) { setCard(i, '—', 'no stream data for this activity'); });
      return;
    }
    var labels = s.dist_km;
    var xTicks = { autoSkip: true, maxTicksLimit: 6, maxRotation: 0,
                   callback: function (v) { var d = labels[v]; return d != null ? d.toFixed(1) : ''; } };

    /* 1 — Elevation profile */
    if (s.elev_m) {
      setCard(1, 'Elevation profile', 'metres over distance (km)');
      charts[0] = new Chart(ctx(1), lineCfg(labels,
        [{ data: s.elev_m, borderColor: COL.ink2, backgroundColor: 'rgba(21,21,15,0.08)', fill: true, pointRadius: 0, borderWidth: 1.5, tension: 0.2 }],
        { x: { grid: { display: false }, ticks: xTicks }, y: { grid: { color: COL.grid } } }, noLegend));
    } else { setCard(1, 'Elevation profile', 'no elevation data'); }

    /* 2 — Heart rate */
    if (s.hr) {
      setCard(2, 'Heart rate', 'bpm over distance (km)');
      charts[1] = new Chart(ctx(2), lineCfg(labels,
        [{ data: s.hr, borderColor: '#c0392b', backgroundColor: 'rgba(192,57,43,0.10)', fill: true, pointRadius: 0, borderWidth: 1.5, tension: 0.2 }],
        { x: { grid: { display: false }, ticks: xTicks }, y: { grid: { color: COL.grid } } }, noLegend));
    } else { setCard(2, 'Heart rate', 'no heart-rate data'); }

    /* 3 — Pace (run) or Speed (ride) */
    if (s.speed_ms) {
      var col = a.category === 'run' ? COL.run : COL.ride;
      if (a.category === 'run') {
        // convert m/s -> pace sec/km, clamp absurd values (stops/standing)
        var pace = s.speed_ms.map(function (v) { return v && v > 0.3 ? Math.min(900, 1000 / v) : null; });
        setCard(3, 'Pace', 'min/km over distance — lower is faster');
        charts[2] = new Chart(ctx(3), lineCfg(labels,
          [{ data: pace, borderColor: col, backgroundColor: 'rgba(76,138,39,0.10)', fill: true, pointRadius: 0, borderWidth: 1.5, tension: 0.2, spanGaps: true }],
          { x: { grid: { display: false }, ticks: xTicks },
            y: { reverse: true, grid: { color: COL.grid },
                 ticks: { callback: function (v) { return fmtPace(v); } } } },
          { tooltip: { backgroundColor: COL.ink, padding: 10, cornerRadius: 8,
            callbacks: { label: function (it) { return fmtPace(it.parsed.y) + ' /km'; } } } }));
      } else {
        var kmh = s.speed_ms.map(function (v) { return v != null ? +(v * 3.6).toFixed(1) : null; });
        setCard(3, 'Speed', 'km/h over distance');
        charts[2] = new Chart(ctx(3), lineCfg(labels,
          [{ data: kmh, borderColor: col, backgroundColor: 'rgba(217,138,43,0.12)', fill: true, pointRadius: 0, borderWidth: 1.5, tension: 0.2, spanGaps: true }],
          { x: { grid: { display: false }, ticks: xTicks }, y: { grid: { color: COL.grid }, beginAtZero: true } }, noLegend));
      }
    } else { setCard(3, a.category === 'run' ? 'Pace' : 'Speed', 'no velocity data'); }

    /* 4 — Power (if any) else a distance/elev recap message */
    if (s.watts) {
      setCard(4, 'Power', 'watts over distance (km)');
      charts[3] = new Chart(ctx(4), lineCfg(labels,
        [{ data: s.watts, borderColor: '#7b5ea7', backgroundColor: 'rgba(123,94,167,0.12)', fill: true, pointRadius: 0, borderWidth: 1.5, tension: 0.2, spanGaps: true }],
        { x: { grid: { display: false }, ticks: xTicks }, y: { grid: { color: COL.grid }, beginAtZero: true } }, noLegend));
    } else {
      setCard(4, 'Power', 'no power data for this activity');
    }
  }

  function renderCharts() {
    destroyCharts();
    if (selectedId) renderActivityCharts(byId(selectedId));
    else renderAggregateCharts();
  }

  /* ============================================================
     TABLE
     ============================================================ */
  function renderTable() {
    var body = document.getElementById('acts-body');
    var rows = filtered().slice().sort(function (a, b) {
      var va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });
    if (!rows.length) { body.innerHTML = '<tr><td colspan="11" class="map-empty">No activities for this filter.</td></tr>'; return; }
    var html = rows.map(function (a) {
      var loc = locOf(a);
      return '<tr data-id="' + a.id + '"' + (a.id === selectedId ? ' class="sel"' : '') + '>' +
        '<td class="l">' + fmtDate(a.date) + '</td>' +
        '<td class="l"><span class="typebadge ' + a.category + '">' + a.category + '</span></td>' +
        '<td class="l nm" title="' + escapeHtml(a.name || '') + '">' + escapeHtml(a.name || '—') + '</td>' +
        '<td class="l loc hide-sm" title="' + escapeHtml(loc) + '">' + escapeHtml(loc) + '</td>' +
        '<td>' + fmtDist(a.distance_m) + ' km</td>' +
        '<td>' + fmtDur(a.moving_s) + '</td>' +
        '<td class="hide-sm">' + Math.round(a.elev_gain_m) + ' m</td>' +
        '<td class="hide-sm">' + paceOrSpeed(a) + '</td>' +
        '<td class="l hide-sm">' + sparkline(a) + '</td>' +
        '<td class="hide-sm">' + (a.avg_hr ? Math.round(a.avg_hr) : '—') + '</td>' +
        '<td class="hide-sm">' + (a.load != null ? Math.round(a.load) : '—') + '</td>' +
        '</tr>';
    }).join('');
    body.innerHTML = html;
  }

  function updateSortHeader() {
    document.querySelectorAll('#acts-head th').forEach(function (th) {
      var active = th.getAttribute('data-sort') === sortKey;
      th.classList.toggle('sort', active);
      var ar = th.querySelector('.ar');
      if (ar) ar.textContent = sortDir === 1 ? '↑' : '↓';
    });
  }

  /* ============================================================
     MAP
     ============================================================ */
  function toFeature(a) {
    return {
      type: 'Feature',
      id: a.id,
      properties: { id: a.id, category: a.category, name: a.name },
      geometry: { type: 'LineString', coordinates: a.route }
    };
  }
  function geojson() {
    return { type: 'FeatureCollection',
      features: filtered().filter(function (a) { return a.has_route && a.route.length > 1; }).map(toFeature) };
  }
  function boundsOf(coordsList) {
    var b = new maplibregl.LngLatBounds();
    coordsList.forEach(function (c) { b.extend(c); });
    return b;
  }
  function allBounds() {
    var b = new maplibregl.LngLatBounds();
    filtered().forEach(function (a) {
      if (a.bounds) { b.extend(a.bounds[0]); b.extend(a.bounds[1]); }
    });
    return b.isEmpty() ? null : b;
  }
  function fitAll(animate) {
    var b = allBounds();
    if (!b) return;
    var doFit = function () { map.fitBounds(b, { padding: 48, duration: animate ? 700 : 0 }); };
    if (mapReady) doFit(); else pendingFit = doFit;
  }

  function initMap() {
    var styleUrl = 'https://api.maptiler.com/maps/' + CFG.style + '/style.json?key=' + CFG.maptilerKey;
    map = new maplibregl.Map({
      container: 'map',
      style: styleUrl,
      center: NYC_VIEW.center,
      zoom: NYC_VIEW.zoom,
      attributionControl: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    hoverPopup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 14,
      className: 'route-popup', maxWidth: '260px'
    });

    map.on('load', function () {
      map.addSource('routes', { type: 'geojson', data: geojson(), promoteId: 'id' });
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['case',
            ['boolean', ['feature-state', 'selected'], false], COL.ink,
            ['match', ['get', 'category'], 'ride', COL.ride, COL.run]],
          'line-width': ['interpolate', ['linear'], ['zoom'],
            9,  ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1],
            14, ['case', ['boolean', ['feature-state', 'selected'], false], 5, 2.2]],
          'line-opacity': ['case',
            ['boolean', ['feature-state', 'selected'], false], 1,
            ['boolean', ['feature-state', 'dim'], false], 0.10,
            0.55]
        }
      });

      mapReady = true;
      if (pendingFit) { pendingFit(); pendingFit = null; }
      else map.jumpTo(NYC_VIEW);          // default = framed NYC region

      map.on('click', 'routes-line', function (e) {
        if (e.features && e.features.length) selectActivity(e.features[0].properties.id, { fly: true, fromMap: true });
      });
      // hover tooltip that follows the cursor along the route
      map.on('mousemove', 'routes-line', function (e) {
        if (!e.features || !e.features.length) return;
        var a = byId(e.features[0].properties.id);
        if (!a) return;
        map.getCanvas().style.cursor = 'pointer';
        hoverPopup.setLngLat(e.lngLat).setHTML(popupHTML(a)).addTo(map);
      });
      map.on('mouseleave', 'routes-line', function () {
        map.getCanvas().style.cursor = '';
        hoverPopup.remove();
      });
      map.on('click', function (e) {            // click empty space clears
        var hits = map.queryRenderedFeatures(e.point, { layers: ['routes-line'] });
        if (!hits.length && selectedId) selectActivity(null);
      });
    });
  }

  function refreshMapData() {
    if (!map || !map.getSource('routes')) return;
    map.getSource('routes').setData(geojson());
  }

  function applyMapSelection() {
    if (!mapReady) return;
    // reset states across all features then set the chosen one
    ALL.forEach(function (a) {
      if (!a.has_route) return;
      map.setFeatureState({ source: 'routes', id: a.id },
        { selected: a.id === selectedId, dim: !!selectedId && a.id !== selectedId });
    });
    clearMarkers();
    if (selectedId) {
      var a = byId(selectedId);
      if (a && a.route && a.route.length > 1) {
        addMarker(a.route[0], '#fff', COL.accentDeep);                 // start (green ring)
        addMarker(a.route[a.route.length - 1], COL.ink, '#fff');       // finish (ink dot)
        map.fitBounds(boundsOf(a.route), { padding: 70, duration: 700, maxZoom: 15 });
      }
    }
  }

  function clearMarkers() { endMarkers.forEach(function (m) { m.remove(); }); endMarkers = []; }
  function addMarker(lnglat, fill, ring) {
    var el = document.createElement('div');
    el.style.cssText = 'width:13px;height:13px;border-radius:50%;background:' + fill +
      ';border:2.5px solid ' + ring + ';box-shadow:0 1px 4px rgba(0,0,0,.35);';
    endMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(lnglat).addTo(map));
  }

  /* ============================================================
     SELECTION  (single source of truth)
     ============================================================ */
  function selectActivity(id, opts) {
    opts = opts || {};
    if (id && !byId(id)) id = null;
    // clicking the already-selected row toggles it off
    if (id && id === selectedId && !opts.fromMap) id = null;
    selectedId = id;

    // selection chip
    var chip = document.getElementById('map-sel');
    if (selectedId) {
      var a = byId(selectedId);
      document.getElementById('sel-name').textContent = (a.name || a.type) + ' · ' + fmtDate(a.date);
      chip.classList.add('show');
    } else {
      chip.classList.remove('show');
    }

    renderKpis();
    renderCharts();
    // table: just toggle row highlight + scroll into view (avoid a full re-render flicker)
    document.querySelectorAll('#acts-body tr').forEach(function (tr) {
      var on = tr.getAttribute('data-id') === selectedId;
      tr.classList.toggle('sel', on);
      if (on && !opts.fromTable) tr.scrollIntoView({ block: 'nearest' });
    });
    applyMapSelection();
    if (!selectedId) frameDefault();
  }

  /* ============================================================
     FILTER
     ============================================================ */
  function frameDefault() {
    if (locFilter === 'all') {
      if (mapReady) map.flyTo(NYC_VIEW);
      else pendingFit = function () { map.jumpTo(NYC_VIEW); };
    } else {
      fitAll(true);                 // a specific location → frame its routes
    }
  }

  function onFilterChanged() {
    // drop the current selection if it no longer passes the active filters
    if (selectedId && filtered().indexOf(byId(selectedId)) === -1) selectedId = null;
    refreshMapData();
    renderTable();
    renderKpis();
    renderCharts();
    if (selectedId) {
      selectActivity(selectedId, { fromMap: true, fromTable: true });
    } else {
      document.getElementById('map-sel').classList.remove('show');
      applyMapSelection();
      frameDefault();
    }
  }

  function setFilter(f) {
    if (f === filter) return;
    filter = f;
    document.querySelectorAll('.seg__btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-filter') === f);
    });
    onFilterChanged();
  }

  function setLocFilter(v) {
    if (v === locFilter) return;
    locFilter = v;
    onFilterChanged();
  }

  function populateLocations() {
    var counts = {};
    ALL.forEach(function (a) { var k = locOf(a); counts[k] = (counts[k] || 0) + 1; });
    var sel = document.getElementById('loc-filter');
    Object.keys(counts)
      .sort(function (x, y) { return counts[y] - counts[x] || x.localeCompare(y); })
      .forEach(function (k) {
        var o = document.createElement('option');
        o.value = k;
        o.textContent = k + ' (' + counts[k] + ')';
        sel.appendChild(o);
      });
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function wire() {
    document.querySelectorAll('.seg__btn').forEach(function (b) {
      b.addEventListener('click', function () { setFilter(b.getAttribute('data-filter')); });
    });
    document.getElementById('sel-clear').addEventListener('click', function () { selectActivity(null); });
    document.getElementById('map-fit').addEventListener('click', function () { selectActivity(null); });
    document.getElementById('loc-filter').addEventListener('change', function (e) { setLocFilter(e.target.value); });

    document.getElementById('acts-body').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (tr) selectActivity(tr.getAttribute('data-id'), { fromTable: true });
    });

    document.querySelectorAll('#acts-head th').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (!key) return;                     // non-sortable column (Tempo)
        if (key === sortKey) sortDir *= -1;
        else { sortKey = key; sortDir = (key === 'name' || key === 'type') ? 1 : -1; }
        updateSortHeader();
        renderTable();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && selectedId) selectActivity(null);
    });
  }

  function setCounts() {
    var r = ALL.filter(function (a) { return a.category === 'run'; }).length;
    var c = ALL.filter(function (a) { return a.category === 'ride'; }).length;
    document.querySelector('[data-ct="all"]').textContent = ALL.length;
    document.querySelector('[data-ct="run"]').textContent = r;
    document.querySelector('[data-ct="ride"]').textContent = c;
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot(data) {
    ALL = (data.activities || []).filter(function (a) { return (a.distance_m || 0) > 0; });
    var withRoute = data.with_route != null ? data.with_route : ALL.filter(function (a) { return a.has_route; }).length;
    var gen = data.generated ? data.generated.replace('T', ' ').slice(0, 16) : '';
    document.getElementById('gen-line').textContent =
      ALL.length + ' activities · ' + withRoute + ' mapped routes · last synced ' + gen;

    chartDefaults();
    setCounts();
    populateLocations();
    updateSortHeader();
    renderKpis();
    renderTable();
    renderCharts();
    if (window.maplibregl) initMap();
    else document.getElementById('map').innerHTML = '<div class="map-empty">Map library failed to load.</div>';
    wire();
  }

  function fail(msg) {
    document.getElementById('gen-line').textContent = msg;
    document.getElementById('map').innerHTML = '<div class="map-empty">' + msg + '</div>';
    document.getElementById('map-note').innerHTML =
      'Could not load <code>assets/data/activities.json</code>. Run <code>python fetch_data.py</code>, ' +
      'then view this page over http (e.g. <code>python -m http.server</code>) — opening it directly from disk blocks the data file.';
  }

  fetch(CFG.dataUrl, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(boot)
    .catch(function (e) { fail('Could not load activity data (' + e.message + ').'); });
})();
