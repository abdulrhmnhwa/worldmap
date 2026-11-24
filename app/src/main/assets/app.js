(function () {
  'use strict';

  var DATA = window.COUNTRY_DATA || {};
  var DATA_YEAR = window.DATA_YEAR || 2024;
  var ALIAS = { SDS: 'SSD', SAH: 'ESH', PSX: 'PSE', XKX: 'KOS' };
  var TOP = 83, BOT = -58; // نطاق خطوط العرض المعروض (بدون القطب الجنوبي)

  function $(id) { return document.getElementById(id); }
  var canvas = $('map'), ctx = canvas.getContext('2d');
  var W = 0, H = 0, dpr = window.devicePixelRatio || 1;
  var countries = [], byId = {}, selected = [];
  var POP = {}; // تحديثات السكان من الإنترنت
  var view = { s: 1, tx: 0, ty: 0 }, minS = 1, firstFit = true;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ٰٟ]/g, '')
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 2600);
  }

  /* ---------- بناء الأشكال ---------- */
  function build() {
    if (!window.WORLD) {
      $('cards').innerHTML = '<div class="hint">ملف الخريطة (data/world.js) غير موجود. شغّل scripts/fetch_world.sh ثم أعد البناء.</div>';
      return;
    }
    window.WORLD.features.forEach(function (f) {
      var p = f.properties || {};
      var id = p.ISO_A3_EH;
      if (!id || id === '-99') id = p.ADM0_A3;
      id = ALIAS[id] || id;
      if (id === 'ATA' || !f.geometry) return;

      var polysRaw = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      var polys = [], bb = [1e9, 1e9, -1e9, -1e9], main = null, mainArea = -1;
      var path = new Path2D();
      polysRaw.forEach(function (poly) {
        var pb = [1e9, 1e9, -1e9, -1e9], rings = [];
        poly.forEach(function (ring) {
          var flat = new Array(ring.length * 2);
          ring.forEach(function (c, i) {
            var x = c[0] + 180, y = TOP - c[1];
            flat[i * 2] = x; flat[i * 2 + 1] = y;
            if (x < pb[0]) pb[0] = x; if (y < pb[1]) pb[1] = y;
            if (x > pb[2]) pb[2] = x; if (y > pb[3]) pb[3] = y;
            if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
          });
          path.closePath();
          rings.push(flat);
        });
        var area = (pb[2] - pb[0]) * (pb[3] - pb[1]);
        polys.push({ bb: pb, rings: rings, small: area < 4 });
        if (area > mainArea) { mainArea = area; main = pb; }
        if (pb[0] < bb[0]) bb[0] = pb[0]; if (pb[1] < bb[1]) bb[1] = pb[1];
        if (pb[2] > bb[2]) bb[2] = pb[2]; if (pb[3] > bb[3]) bb[3] = pb[3];
      });
      var c = {
        id: id,
        name: p.NAME_AR || p.NAME_EN || p.NAME || id,
        nameEn: p.NAME_EN || p.NAME || id,
        path: path, polys: polys, bbox: bb, main: main
      };
      c.search = norm(c.name) + ' ' + norm(c.nameEn);
      countries.push(c);
      byId[id] = c;
    });
    // الأصغر أولاً لتُرسم الدول الكبيرة تحت الصغيرة
    countries.sort(function (a, b) {
      return (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]) - (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]);
    });
  }

  /* ---------- الرسم ---------- */
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    minS = Math.min(W / 360, H / (TOP - BOT));
    if (firstFit) { fit(); firstFit = false; }
    clamp(); draw();
  }
  function fit() {
    view.s = minS;
    view.tx = (W - 360 * view.s) / 2;
    view.ty = (H * 0.5 - (TOP - BOT) * view.s) / 2 + H * 0.05;
    if (view.ty < 60) view.ty = 60;
  }
  function clamp() {
    if (view.s < minS) view.s = minS;
    if (view.s > 400) view.s = 400;
    var mw = 360 * view.s, mh = (TOP - BOT) * view.s;
    if (view.tx > W * 0.5) view.tx = W * 0.5;
    if (view.tx < W * 0.5 - mw) view.tx = W * 0.5 - mw;
    if (view.ty > H * 0.5) view.ty = H * 0.5;
    if (view.ty < H * 0.5 - mh) view.ty = H * 0.5 - mh;
  }
  var THEMES = {
    night: { sea1: '#0e2a43', sea2: '#081726', out: '#050f1a', grid: 'rgba(140,180,220,.10)', eq: 'rgba(245,166,35,.22)',
      land: ['#2f4a63', '#365a6e', '#3a5a5f', '#34506b', '#44546f', '#375c55'], line: 'rgba(190,215,240,.55)',
      sel: '#f5a623', selLine: '#ffffff', glow: 'rgba(245,166,35,.85)', frame: 'rgba(140,180,220,.35)',
      nod: '#243447', halo: 'rgba(5,15,26,.85)', txt: '#eaf2fa', ramp: ['#1c3f6b', '#2a9d8f', '#f5e663'], dline: 'rgba(255,255,255,.85)' },
    day: { sea1: '#bfe0f2', sea2: '#8ec5e3', out: '#dfeef6', grid: 'rgba(40,90,130,.13)', eq: 'rgba(224,138,0,.35)',
      land: ['#efe4c6', '#e2ebcb', '#ecd9b8', '#d9e6c6', '#f3e8c4', '#dfdcc0'], line: 'rgba(90,100,90,.55)',
      sel: '#ee8f00', selLine: '#ffffff', glow: 'rgba(224,138,0,.8)', frame: 'rgba(40,90,130,.35)',
      nod: '#e3e6ea', halo: 'rgba(255,255,255,.85)', txt: '#1b2a38', ramp: ['#fff1c1', '#f6a04d', '#b3261e'], dline: 'rgba(255,255,255,.95)' }
  };

  /* ---------- التلوين حسب البيان ---------- */
  var metric = null, showLabels = true;
  function short(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' مليار';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' مليون';
    if (n >= 1e3) return Math.round(n / 1e3) + ' ألف';
    return fmt(n);
  }
  function exg(id, i) { var x = (window.EXTRA || {})[id]; return x && x.g[i] != null ? x.g[i] : null; }
  var METRICS = [
    { k: null, n: 'بدون تلوين' },
    { k: 'pop', n: 'عدد السكان', log: 1, f: short, get: function (id) { var d = DATA[id]; return d ? (POP[id] ? POP[id].v : d[0]) : null; } },
    { k: 'area', n: 'المساحة', log: 1, f: function (v) { return short(v) + ' كم²'; }, get: function (id) { var d = DATA[id]; return d ? d[1] : null; } },
    { k: 'dens', n: 'الكثافة السكانية', log: 1, f: function (v) { return fmt(v) + ' /كم²'; }, get: function (id) { var d = DATA[id]; return d && d[1] ? (POP[id] ? POP[id].v : d[0]) / d[1] : null; } },
    { k: 'gdp', n: 'الناتج المحلي (30 دولة)', log: 1, f: function (v) { return money(v); }, get: function (id) { return exg(id, 0); } },
    { k: 'gpc', n: 'نصيب الفرد (30 دولة)', log: 1, f: function (v) { return fmt(v) + ' $'; }, get: function (id) { return exg(id, 1); } },
    { k: 'gro', n: 'النمو الاقتصادي (30 دولة)', log: 0, f: function (v) { return v.toFixed(1) + '%'; }, get: function (id) { return exg(id, 2); } }
  ];
  function hex2(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function ramp(t, st) {
    t = Math.max(0, Math.min(1, t));
    var p = t * (st.length - 1), i = Math.min(st.length - 2, Math.floor(p)), f = p - i;
    var a = hex2(st[i]), b = hex2(st[i + 1]);
    return 'rgb(' + a.map(function (x, k) { return Math.round(x + (b[k] - x) * f); }).join(',') + ')';
  }
  function recolor() {
    var lg = $('legend');
    if (!metric || !countries.length) { countries.forEach(function (c) { c.mc = null; }); lg.style.display = 'none'; return; }
    var st = THEMES[theme].ramp, vals = [];
    countries.forEach(function (c) {
      var v = metric.get(c.id);
      c.mv = (v == null || (metric.log && v <= 0)) ? null : v;
      if (c.mv != null) vals.push(c.mv);
    });
    vals.sort(function (a, b) { return a - b; });
    if (!vals.length) { lg.style.display = 'none'; return; }
    var lo = vals[Math.floor(vals.length * 0.03)], hi = vals[Math.ceil(vals.length * 0.97) - 1];
    if (hi === lo) hi = lo + 1;
    var tf = metric.log ? Math.log : function (x) { return x; };
    countries.forEach(function (c) {
      c.mc = c.mv == null ? null : ramp((tf(c.mv) - tf(lo)) / (tf(hi) - tf(lo)), st);
    });
    $('ltitle').textContent = metric.n;
    $('lbar').style.background = 'linear-gradient(to right,' + st.join(',') + ')';
    $('lmin').textContent = metric.f(lo); $('lmax').textContent = metric.f(hi);
    lg.style.display = 'block';
  }
  function buildMenu() {
    var m = $('mmenu'); m.innerHTML = '';
    METRICS.forEach(function (x) {
      var d = document.createElement('div'); d.textContent = x.n;
      if (x === metric || (!metric && !x.k)) d.className = 'on';
      d.onclick = function () { metric = x.k ? x : null; m.style.display = 'none'; recolor(); buildMenu(); draw(); };
      m.appendChild(d);
    });
  }
  $('mbtn').onclick = function () { var m = $('mmenu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; };
  $('zlab').onclick = function () { showLabels = !showLabels; toast(showLabels ? 'أسماء الدول: مفعّلة' : 'أسماء الدول: مخفية'); draw(); };
  buildMenu();

  var theme = 'night';
  try { theme = localStorage.getItem('wm_theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'); } catch (e) {}
  function applyTheme() {
    document.body.className = theme === 'day' ? 'light' : '';
    $('theme').textContent = theme === 'day' ? '🌙' : '☀';
    try { localStorage.setItem('wm_theme', theme); } catch (e) {}
  }
  function hashIdx(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % 6; }

  /* ---------- التقسيمات الإدارية (تظهر للدولة المحددة فقط) ---------- */
  var ADM = {}, ADM_NA = {}, activeDiv = null, DTINT = [0, 0.12, 0.22, 0.06, 0.17, 0.28];
  var DTYPE = { Governorate: 'محافظة', Province: 'مقاطعة / محافظة', State: 'ولاية', Region: 'منطقة', District: 'منطقة', County: 'مقاطعة',
    Prefecture: 'محافظة', Department: 'دائرة / مقاطعة', Municipality: 'بلدية', Emirate: 'إمارة', Wilaya: 'ولاية', Canton: 'كانتون',
    Oblast: 'أوبلاست', Territory: 'إقليم', Parish: 'أبرشية', City: 'مدينة', Republic: 'جمهورية', Governorate_: 'محافظة' };
  var XIDX = {};
  (window.ADM1_EXTRA || []).forEach(function (x) { XIDX[x.c] = x; XIDX[norm(x.ar)] = x; });
  window.ADM1_LOAD = function (id, feats) {
    ADM[id] = feats.map(function (f) {
      var path = new Path2D(), polys = [], main = null, ma = -1, bb = [1e9, 1e9, -1e9, -1e9];
      f.g.forEach(function (poly) {
        var pb = [1e9, 1e9, -1e9, -1e9], rings = [];
        poly.forEach(function (flat) {
          var w = new Array(flat.length);
          for (var i = 0; i < flat.length; i += 2) {
            var x = flat[i] + 180, y = TOP - flat[i + 1];
            w[i] = x; w[i + 1] = y;
            if (x < pb[0]) pb[0] = x; if (y < pb[1]) pb[1] = y; if (x > pb[2]) pb[2] = x; if (y > pb[3]) pb[3] = y;
            if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
          }
          path.closePath(); rings.push(w);
        });
        var a = (pb[2] - pb[0]) * (pb[3] - pb[1]);
        polys.push({ bb: pb, rings: rings });
        if (a > ma) { ma = a; main = pb; }
        if (pb[0] < bb[0]) bb[0] = pb[0]; if (pb[1] < bb[1]) bb[1] = pb[1]; if (pb[2] > bb[2]) bb[2] = pb[2]; if (pb[3] > bb[3]) bb[3] = pb[3];
      });
      var p = f.p;
      return { p: p, path: path, polys: polys, main: main, bbox: bb, name: p.n || p.e || '؟', ci: hashIdx(p.c || p.e || 'x'),
        x: XIDX[p.c] || XIDX[norm(p.n || '')] || null };
    });
    render(); draw();
  };
  function loadAdm(id) {
    if (ADM[id] || ADM_NA[id] === 0) return;
    if (window.ADM1_AVAIL && window.ADM1_AVAIL.indexOf(id) < 0) { ADM_NA[id] = 1; return; }
    ADM_NA[id] = 0;
    var s = document.createElement('script');
    s.src = 'data/admin1/' + id + '.js';
    s.onerror = function () { ADM_NA[id] = 1; render(); };
    document.head.appendChild(s);
  }
  function hitDiv(id, px, py) {
    var L = ADM[id]; if (!L) return null;
    var wx = (px - view.tx) / view.s, wy = (py - view.ty) / view.s;
    for (var i = 0; i < L.length; i++) {
      var d = L[i];
      if (wx < d.bbox[0] || wx > d.bbox[2] || wy < d.bbox[1] || wy > d.bbox[3]) continue;
      for (var j = 0; j < d.polys.length; j++) {
        var p = d.polys[j];
        if (wx < p.bb[0] || wx > p.bb[2] || wy < p.bb[1] || wy > p.bb[3]) continue;
        var cnt = 0;
        for (var k = 0; k < p.rings.length; k++) if (inRing(wx, wy, p.rings[k])) cnt++;
        if (cnt % 2 === 1) return d;
      }
    }
    return null;
  }
  function divRows(d) {
    var p = d.p, x = d.x, h = '';
    h += row('الاسم', d.name);
    if (p.e && p.e !== d.name) h += row('بالإنجليزية', p.e);
    if (p.t) h += row('النوع', DTYPE[p.t] || p.t);
    if (p.r) h += row('الإقليم', p.r);
    if (x && x.cap) h += row('المركز', x.cap);
    var area = x && x.a ? x.a : p.a;
    if (area) h += row('المساحة', fmt(area) + ' كم²', 'تقريبية');
    if (x && x.p) h += row('عدد السكان', fmt(x.p), 'تقدير 2011');
    if (p.c) h += row('الرمز (ISO 3166-2)', p.c);
    return h;
  }
  function admHtml(id) {
    var L = ADM[id];
    if (!L) {
      if (ADM_NA[id] === 1) return '<div class="note">' + (window.ADM1_AVAIL ? 'لا تتوفر تقسيمات إدارية لهذه الدولة.' : 'بيانات التقسيمات الإدارية غير مثبّتة (شغّل scripts/build_admin1.js ثم أعد البناء).') + '</div>';
      return '<div class="note">جارٍ تحميل التقسيمات الإدارية…</div>';
    }
    var sorted = L.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); });
    var open = activeDiv && activeDiv.id === id ? ' open' : '';
    var h = '<details' + open + '><summary>🗺️ التقسيمات الإدارية (' + L.length + ')</summary><div class="chips">';
    sorted.forEach(function (d) {
      h += '<button class="chip' + (activeDiv && activeDiv.d === d ? ' on' : '') + '" data-div="' + esc(id) + '|' + L.indexOf(d) + '">' + esc(d.name) + '</button>';
    });
    h += '</div><div class="note">اضغط على أي تقسيم (هنا أو على الخريطة) لعرض معلوماته.</div></details>';
    return h;
  }
  function setActive(id, d) {
    activeDiv = (activeDiv && activeDiv.d === d) ? null : { id: id, d: d };
    var pn = $('panel'); pn.classList.remove('collapsed'); $('ptoggle').textContent = '▾';
    render(); draw(); $('cards').scrollTop = 0;
  }

  function drawLabels(T) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var fs = Math.min(15, 9.5 + Math.log(view.s / minS) / Math.LN2 * 1.1);
    var fam = ' system-ui,"Noto Naskh Arabic",sans-serif';
    ctx.font = '600 ' + fs + 'px' + fam;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3;
    var placed = [];
    var items = [];
    selected.forEach(function (id) { if (ADM[id]) items = items.concat(ADM[id]); });
    items = items.concat(countries.filter(function (c) { return !(selected.indexOf(c.id) >= 0 && ADM[c.id]); }));
    items.forEach(function (c) {
      var m = c.main; if (!m) return;
      var cx = (m[0] + m[2]) / 2 * view.s + view.tx, cy = (m[1] + m[3]) / 2 * view.s + view.ty;
      if (cx < -40 || cx > W + 40 || cy < 0 || cy > H) return;
      if (c.tw === undefined) {
        ctx.save(); ctx.font = '10px' + fam; c.tw = ctx.measureText(c.name).width; ctx.restore();
      }
      var tw = c.tw * fs / 10;
      if ((m[2] - m[0]) * view.s < tw * 0.9) return;
      var r = [cx - tw / 2 - 2, cy - fs / 2 - 1, cx + tw / 2 + 2, cy + fs / 2 + 1];
      for (var i = 0; i < placed.length; i++) {
        var p = placed[i];
        if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) return;
      }
      placed.push(r);
      ctx.strokeStyle = T.halo; ctx.strokeText(c.name, cx, cy);
      ctx.fillStyle = T.txt; ctx.fillText(c.name, cx, cy);
    });
  }

  function draw() {
    var T = THEMES[theme], MH = TOP - BOT;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = T.out;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr, view.tx * dpr, view.ty * dpr);
    ctx.lineJoin = 'round';
    var x0 = -view.tx / view.s, y0 = -view.ty / view.s;
    var x1 = (W - view.tx) / view.s, y1 = (H - view.ty) / view.s;
    // المحيط
    var g = ctx.createLinearGradient(0, 0, 0, MH);
    g.addColorStop(0, T.sea1); g.addColorStop(1, T.sea2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 360, MH);
    // شبكة خطوط الطول والعرض
    ctx.lineWidth = 0.6 / view.s; ctx.strokeStyle = T.grid; ctx.beginPath();
    var lon, lat;
    for (lon = -150; lon < 180; lon += 30) { ctx.moveTo(lon + 180, 0); ctx.lineTo(lon + 180, MH); }
    for (lat = -30; lat <= 60; lat += 30) { if (lat === 0) continue; ctx.moveTo(0, TOP - lat); ctx.lineTo(360, TOP - lat); }
    ctx.stroke();
    ctx.strokeStyle = T.eq; ctx.setLineDash([4 / view.s, 4 / view.s]);
    ctx.beginPath(); ctx.moveTo(0, TOP); ctx.lineTo(360, TOP); ctx.stroke(); ctx.setLineDash([]);
    // الدول
    var sel = {};
    selected.forEach(function (id) { sel[id] = true; });
    ctx.lineWidth = 0.6 / view.s; ctx.strokeStyle = T.line;
    countries.forEach(function (c) {
      if (sel[c.id]) return;
      var b = c.bbox;
      if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) return;
      if (c.ci === undefined) c.ci = hashIdx(c.id);
      ctx.fillStyle = metric ? (c.mc || T.nod) : T.land[c.ci];
      ctx.fill(c.path); ctx.stroke(c.path);
    });
    // إطار الخريطة
    ctx.lineWidth = 1.2 / view.s; ctx.strokeStyle = T.frame; ctx.strokeRect(0, 0, 360, MH);
    // المحددة مع توهج
    ctx.fillStyle = T.sel; ctx.strokeStyle = T.selLine;
    ctx.lineWidth = 1.3 / view.s;
    ctx.shadowColor = T.glow; ctx.shadowBlur = 14 * dpr;
    selected.forEach(function (id) {
      var c = byId[id]; if (!c) return;
      ctx.fillStyle = (metric && c.mc) ? c.mc : T.sel;
      ctx.fill(c.path); ctx.stroke(c.path);
    });
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    // التقسيمات الإدارية للدول المحددة
    selected.forEach(function (id) {
      var L = ADM[id]; if (!L) return;
      ctx.lineWidth = 0.9 / view.s; ctx.strokeStyle = T.dline;
      L.forEach(function (d) {
        var b = d.bbox;
        if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) return;
        var on = activeDiv && activeDiv.d === d;
        ctx.fillStyle = on ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,' + DTINT[d.ci] + ')';
        ctx.fill(d.path); ctx.stroke(d.path);
        if (on) { ctx.lineWidth = 2.4 / view.s; ctx.strokeStyle = '#fff'; ctx.stroke(d.path); ctx.lineWidth = 0.9 / view.s; ctx.strokeStyle = T.dline; }
      });
    });
    if (showLabels) drawLabels(T);
  }
  $('theme').onclick = function () { theme = theme === 'day' ? 'night' : 'day'; applyTheme(); recolor(); draw(); };
  applyTheme();

  /* ---------- الاختيار ---------- */
  function inRing(x, y, r) {
    var inside = false;
    for (var i = 0, j = r.length - 2; i < r.length; i += 2) {
      var xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      j = i;
    }
    return inside;
  }
  function hitTest(px, py) {
    var wx = (px - view.tx) / view.s, wy = (py - view.ty) / view.s;
    var i, j, c, p, k;
    for (i = countries.length - 1; i >= 0; i--) { // الأصغر أولاً
      c = countries[i];
      if (wx < c.bbox[0] || wx > c.bbox[2] || wy < c.bbox[1] || wy > c.bbox[3]) continue;
      for (j = 0; j < c.polys.length; j++) {
        p = c.polys[j];
        if (wx < p.bb[0] || wx > p.bb[2] || wy < p.bb[1] || wy > p.bb[3]) continue;
        var cnt = 0;
        for (k = 0; k < p.rings.length; k++) if (inRing(wx, wy, p.rings[k])) cnt++;
        if (cnt % 2 === 1) return c;
      }
    }
    // تسامح للدول والجزر الصغيرة
    var best = null, bd = 16;
    countries.forEach(function (cc) {
      cc.polys.forEach(function (pp) {
        if (!pp.small) return;
        var dx = Math.max(pp.bb[0] - wx, 0, wx - pp.bb[2]);
        var dy = Math.max(pp.bb[1] - wy, 0, wy - pp.bb[3]);
        var d = Math.sqrt(dx * dx + dy * dy) * view.s;
        if (d < bd) { bd = d; best = cc; }
      });
    });
    return best;
  }
  function toggle(id) {
    var i = selected.indexOf(id);
    if (i >= 0) selected.splice(i, 1); else selected.push(id);
    render(); draw();
  }

  /* ---------- البيانات ---------- */
  function info(id) {
    var d = DATA[id]; if (!d) return null;
    var p = POP[id] || { v: d[0], y: DATA_YEAR, src: 'تقدير مدمج' };
    return { pop: p, area: d[1], coast: d[2] };
  }
  function row(label, value, meta) {
    return '<div class="row"><span class="lbl">' + label + '</span><span><b>' + value + '</b>' +
      (meta ? '<span class="meta">' + meta + '</span>' : '') + '</span></div>';
  }
  var EX = window.EXTRA || {};
  function money(b) { return b >= 1000 ? (b / 1000).toFixed(2) + ' تريليون $' : fmt(b) + ' مليار $'; }
  function extraHtml(id) {
    var x = EX[id]; if (!x) return '<div class="note">لا تتوفر بيانات الديموغرافيا والاقتصاد لهذه الدولة بعد.</div>';
    var g = x.g, h = '<details><summary>👥 الديموغرافيا</summary>' +
      '<div class="blk"><span class="lbl">الأديان والطوائف</span>' + esc(x.r) + '</div>' +
      '<div class="blk"><span class="lbl">الأعراق</span>' + esc(x.e) + '</div></details>';
    h += '<details><summary>💰 الاقتصاد</summary>';
    if (g[0] != null) {
      h += row('الناتج المحلي', money(g[0])) + row('نصيب الفرد', fmt(g[1]) + ' $') +
        (g[2] != null ? row('النمو السنوي', g[2] + '%') : '');
    }
    return h + '<div class="blk"><span class="lbl">أبرز القطاعات</span>' + esc(g[3]) + '</div></details>' +
      '<div class="meta">أرقام تقريبية (' + window.EXTRA_YEAR + ')</div>';
  }
  function coastText(v) { return v === 0 ? '0 كم (دولة غير ساحلية)' : fmt(v) + ' كم'; }

  function render() {
    var cards = $('cards'); cards.innerHTML = '';
    selected.forEach(loadAdm);
    if (activeDiv && selected.indexOf(activeDiv.id) < 0) activeDiv = null;
    if (!selected.length) {
      $('ptitle').textContent = 'معلومات الدول';
      cards.innerHTML = '<div class="hint">اضغط على أي دولة على الخريطة (أو ابحث عنها بالاسم) لعرض معلوماتها. يمكنك اختيار عدة دول.</div>';
      return;
    }
    $('ptitle').textContent = 'الدول المحددة (' + selected.length + ')';
    var tp = 0, ta = 0, tc = 0, tg = 0, missing = 0, html = '';
    selected.forEach(function (id) {
      var c = byId[id], i = info(id);
      html += '<div class="card"><div class="chead"><span>' + esc(c.name) + '</span><button data-rm="' + esc(id) + '">✕</button></div>';
      if (i) {
        tp += i.pop.v; ta += i.area; tc += i.coast;
        html += row('عدد السكان', fmt(i.pop.v), i.pop.src + ' ' + i.pop.y);
        html += row('المساحة', fmt(i.area) + ' كم²');
        html += row('طول السواحل', coastText(i.coast));
        if (EX[id] && EX[id].g[0] != null) tg += EX[id].g[0];
        html += extraHtml(id);
      } else {
        missing++;
        html += '<div class="hint">لا تتوفر بيانات لهذه المنطقة.</div>';
      }
      html += admHtml(id);
      html += '</div>';
    });
    if (selected.length > 1) {
      var t = '<div class="card total"><div class="chead"><span>المجموع (' + selected.length + ' دول)</span></div>';
      t += row('إجمالي السكان', fmt(tp));
      t += row('إجمالي المساحة', fmt(ta) + ' كم²');
      t += row('إجمالي السواحل', fmt(tc) + ' كم');
      if (tg) t += row('إجمالي الناتج المحلي', money(tg), 'للدول المتوفرة بياناتها فقط');
      if (missing) t += '<div class="note">المجموع لا يشمل ' + missing + ' منطقة بلا بيانات.</div>';
      t += '</div>';
      html = t + html;
    }
    if (activeDiv) {
      html = '<div class="card active"><div class="chead"><span>📍 ' + esc(activeDiv.d.name) + ' — ' + esc(byId[activeDiv.id].name) +
        '</span><button data-closediv="1">✕</button></div>' + divRows(activeDiv.d) + '</div>' + html;
    }
    cards.innerHTML = html;
  }

  /* ---------- تحديث السكان من البنك الدولي ---------- */
  function applyWB(m) {
    Object.keys(m).forEach(function (id) {
      if (DATA[id] && m[id][1] >= DATA_YEAR) POP[id] = { v: m[id][0], y: m[id][1], src: 'البنك الدولي' };
    });
    recolor();
  }
  function loadWB(manual) {
    var url = 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&mrnev=1';
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(to);
      var rows = j && j[1]; if (!rows) throw new Error('no data');
      var m = {};
      rows.forEach(function (r) {
        if (r.value == null || !r.countryiso3code) return;
        var id = ALIAS[r.countryiso3code] || r.countryiso3code;
        m[id] = [r.value, parseInt(r.date, 10)];
      });
      try { localStorage.setItem('wbpop', JSON.stringify({ t: Date.now(), m: m })); } catch (e) {}
      applyWB(m); render();
      if (manual) toast('تم تحديث بيانات السكان');
    }).catch(function () {
      clearTimeout(to);
      if (manual) toast('تعذّر التحديث، تحقق من الاتصال بالإنترنت');
    });
  }

  /* ---------- الحركة والتكبير ---------- */
  function zoomAt(px, py, f) {
    var ns = Math.max(minS, Math.min(400, view.s * f));
    f = ns / view.s;
    view.tx = px - (px - view.tx) * f;
    view.ty = py - (py - view.ty) * f;
    view.s = ns; clamp(); draw();
  }
  function zoomTo(c) {
    var b = c.main || c.bbox;
    var bw = Math.max(b[2] - b[0], 0.5), bh = Math.max(b[3] - b[1], 0.5);
    var s = Math.min(W * 0.6 / bw, H * 0.3 / bh);
    view.s = Math.max(minS, Math.min(60, s));
    view.tx = W / 2 - ((b[0] + b[2]) / 2) * view.s;
    view.ty = H * 0.28 - ((b[1] + b[3]) / 2) * view.s;
    clamp(); draw();
  }

  var ptrs = {}, tapStart = null;
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    tapStart = Object.keys(ptrs).length === 1 ? { x: e.clientX, y: e.clientY, t: Date.now(), moved: false } : null;
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var ids = Object.keys(ptrs);
    if (ids.length === 1) {
      view.tx += e.clientX - p.x; view.ty += e.clientY - p.y;
      if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 8) tapStart.moved = true;
      p.x = e.clientX; p.y = e.clientY; clamp(); draw();
    } else {
      var o = ptrs[ids[0] === String(e.pointerId) ? ids[1] : ids[0]];
      var pd = Math.hypot(p.x - o.x, p.y - o.y);
      var pc = { x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 };
      var nd = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      var nc = { x: (e.clientX + o.x) / 2, y: (e.clientY + o.y) / 2 };
      view.tx += nc.x - pc.x; view.ty += nc.y - pc.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pd > 0) zoomAt(nc.x, nc.y, nd / pd); else { clamp(); draw(); }
    }
  });
  function up(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    if (tapStart && !tapStart.moved && Date.now() - tapStart.t < 500 && e.type === 'pointerup') {
      var c = hitTest(tapStart.x, tapStart.y);
      if (c) {
        if (selected.indexOf(c.id) >= 0 && ADM[c.id]) {
          var dd = hitDiv(c.id, tapStart.x, tapStart.y);
          if (dd) setActive(c.id, dd);
          else if (activeDiv) { activeDiv = null; render(); draw(); }
        } else toggle(c.id);
      }
    }
    tapStart = null;
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.2 : 1 / 1.2);
  }, { passive: false });

  /* ---------- الواجهة ---------- */
  $('zin').onclick = function () { zoomAt(W / 2, H / 3, 1.6); };
  $('zout').onclick = function () { zoomAt(W / 2, H / 3, 1 / 1.6); };
  $('zfit').onclick = function () { fit(); clamp(); draw(); };
  $('pclear').onclick = function () { selected = []; render(); draw(); };
  $('ptoggle').onclick = function () {
    var p = $('panel'); p.classList.toggle('collapsed');
    $('ptoggle').textContent = p.classList.contains('collapsed') ? '▴' : '▾';
  };
  $('refresh').onclick = function () { toast('جارٍ التحديث...'); loadWB(true); };
  $('cards').addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    var id = t.getAttribute('data-rm');
    if (id) { toggle(id); return; }
    if (t.getAttribute('data-closediv')) { activeDiv = null; render(); draw(); return; }
    var dv = t.getAttribute('data-div');
    if (dv) {
      var pr = dv.split('|'), d = ADM[pr[0]] && ADM[pr[0]][+pr[1]];
      if (d) { activeDiv = null; setActive(pr[0], d); zoomTo(d); }
    }
  });

  var q = $('q'), res = $('results');
  q.addEventListener('input', function () {
    var v = norm(q.value.trim());
    res.innerHTML = '';
    if (!v) { res.style.display = 'none'; return; }
    var list = countries.filter(function (c) { return c.search.indexOf(v) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).slice(0, 8);
    if (!list.length) { res.style.display = 'none'; return; }
    list.forEach(function (c) {
      var d = document.createElement('div');
      var on = selected.indexOf(c.id) >= 0;
      if (on) d.className = 'on';
      d.innerHTML = (on ? '✓ ' : '') + esc(c.name) + '<small>' + esc(c.nameEn) + '</small>';
      d.onclick = function () {
        if (selected.indexOf(c.id) < 0) { selected.push(c.id); zoomTo(c); }
        else selected.splice(selected.indexOf(c.id), 1);
        q.value = ''; res.style.display = 'none'; q.blur();
        render(); draw();
      };
      res.appendChild(d);
    });
    res.style.display = 'block';
  });

  /* ---------- تشغيل ---------- */
  build();
  window.addEventListener('resize', resize);
  resize();
  render();
  try {
    var cache = JSON.parse(localStorage.getItem('wbpop') || 'null');
    if (cache && cache.m) { applyWB(cache.m); render(); }
  } catch (e) {}
  loadWB(false);
})();
