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
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1d2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.s * dpr, 0, 0, view.s * dpr, view.tx * dpr, view.ty * dpr);
    ctx.lineJoin = 'round';
    var x0 = -view.tx / view.s, y0 = -view.ty / view.s;
    var x1 = (W - view.tx) / view.s, y1 = (H - view.ty) / view.s;
    var sel = {};
    selected.forEach(function (id) { sel[id] = true; });
    ctx.lineWidth = 0.7 / view.s;
    ctx.fillStyle = '#2d4157'; ctx.strokeStyle = '#7f97b0';
    countries.forEach(function (c) {
      if (sel[c.id]) return;
      var b = c.bbox;
      if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) return;
      ctx.fill(c.path); ctx.stroke(c.path);
    });
    ctx.fillStyle = '#f5a623'; ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2 / view.s;
    selected.forEach(function (id) {
      var c = byId[id]; if (!c) return;
      ctx.fill(c.path); ctx.stroke(c.path);
    });
  }

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
  function coastText(v) { return v === 0 ? '0 كم (دولة غير ساحلية)' : fmt(v) + ' كم'; }

  function render() {
    var cards = $('cards'); cards.innerHTML = '';
    if (!selected.length) {
      $('ptitle').textContent = 'معلومات الدول';
      cards.innerHTML = '<div class="hint">اضغط على أي دولة على الخريطة (أو ابحث عنها بالاسم) لعرض معلوماتها. يمكنك اختيار عدة دول.</div>';
      return;
    }
    $('ptitle').textContent = 'الدول المحددة (' + selected.length + ')';
    var tp = 0, ta = 0, tc = 0, missing = 0, html = '';
    selected.forEach(function (id) {
      var c = byId[id], i = info(id);
      html += '<div class="card"><div class="chead"><span>' + esc(c.name) + '</span><button data-rm="' + esc(id) + '">✕</button></div>';
      if (i) {
        tp += i.pop.v; ta += i.area; tc += i.coast;
        html += row('عدد السكان', fmt(i.pop.v), i.pop.src + ' ' + i.pop.y);
        html += row('المساحة', fmt(i.area) + ' كم²');
        html += row('طول السواحل', coastText(i.coast));
      } else {
        missing++;
        html += '<div class="hint">لا تتوفر بيانات لهذه المنطقة.</div>';
      }
      html += '</div>';
    });
    if (selected.length > 1) {
      var t = '<div class="card total"><div class="chead"><span>المجموع (' + selected.length + ' دول)</span></div>';
      t += row('إجمالي السكان', fmt(tp));
      t += row('إجمالي المساحة', fmt(ta) + ' كم²');
      t += row('إجمالي السواحل', fmt(tc) + ' كم');
      if (missing) t += '<div class="note">المجموع لا يشمل ' + missing + ' منطقة بلا بيانات.</div>';
      t += '</div>';
      html = t + html;
    }
    cards.innerHTML = html;
  }

  /* ---------- تحديث السكان من البنك الدولي ---------- */
  function applyWB(m) {
    Object.keys(m).forEach(function (id) {
      if (DATA[id] && m[id][1] >= DATA_YEAR) POP[id] = { v: m[id][0], y: m[id][1], src: 'البنك الدولي' };
    });
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
      if (c) toggle(c.id);
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
    var id = e.target && e.target.getAttribute && e.target.getAttribute('data-rm');
    if (id) toggle(id);
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
