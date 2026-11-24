#!/usr/bin/env node
// ينزّل حدود التقسيمات الإدارية (المحافظات/الولايات) من Natural Earth،
// يبسّطها، ويقسّمها إلى ملف لكل دولة داخل app/src/main/assets/data/admin1/
// الاستخدام:  node scripts/build_admin1.js [ملف_geojson_محلي]
const https = require('https'), fs = require('fs'), path = require('path');
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';
const OUT = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'data', 'admin1');
const ALIAS = { SDS: 'SSD', SAH: 'ESH', PSX: 'PSE', XKX: 'KOS' };
const TOL = 0.03; // درجة التبسيط (≈3 كم)

function get(u, cb, n) {
  n = n || 0;
  https.get(u, function (r) {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && n < 5) return get(r.headers.location, cb, n + 1);
    if (r.statusCode !== 200) { console.error('HTTP ' + r.statusCode); process.exit(1); }
    var ch = [];
    r.on('data', function (d) { ch.push(d); });
    r.on('end', function () { cb(Buffer.concat(ch).toString('utf8')); });
  }).on('error', function (e) { console.error(e.message); process.exit(1); });
}

// Douglas-Peucker (تكرارية)
function simplify(pts, tol) {
  var n = pts.length; if (n < 5) return pts;
  var keep = new Uint8Array(n), stack = [[0, n - 1]];
  keep[0] = keep[n - 1] = 1;
  var t2 = tol * tol;
  while (stack.length) {
    var s = stack.pop(), a = pts[s[0]], b = pts[s[1]], dx = b[0] - a[0], dy = b[1] - a[1];
    var l2 = dx * dx + dy * dy, md = 0, mi = -1;
    for (var i = s[0] + 1; i < s[1]; i++) {
      var p = pts[i], d2;
      if (l2 === 0) { d2 = Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2); }
      else {
        var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
        d2 = Math.pow(p[0] - (a[0] + t * dx), 2) + Math.pow(p[1] - (a[1] + t * dy), 2);
      }
      if (d2 > md) { md = d2; mi = i; }
    }
    if (mi > 0 && md > t2) { keep[mi] = 1; stack.push([s[0], mi], [mi, s[1]]); }
  }
  return pts.filter(function (_, i) { return keep[i]; });
}

function ringOut(ring) {
  var pts = ring.map(function (c) { return [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100]; });
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  pts = simplify(pts, TOL);
  if (pts.length < 3) return null;
  var flat = [];
  pts.forEach(function (p) { flat.push(p[0], p[1]); });
  return flat;
}

function convert(geo) {
  var polys = geo.type === 'Polygon' ? [geo.coordinates] : geo.type === 'MultiPolygon' ? geo.coordinates : [];
  var res = [];
  polys.forEach(function (poly) {
    var outer = ringOut(poly[0]);
    if (!outer) return; // تجاهل الجزر الدقيقة جداً
    var rings = [outer];
    for (var i = 1; i < poly.length; i++) { var h = ringOut(poly[i]); if (h) rings.push(h); }
    res.push(rings);
  });
  return res;
}

function run(txt) {
  var gj = JSON.parse(txt), by = {};
  gj.features.forEach(function (f) {
    var p = f.properties || {}, id = p.adm0_a3 || p.ADM0_A3;
    if (!id || !f.geometry) return;
    id = ALIAS[id] || id;
    if (id === 'ISR') return;
    var g = convert(f.geometry);
    if (!g.length) return;
    var a = Math.round(p.area_sqkm || p.AREA_SQKM || 0);
    var props = { n: p.name_ar || p.name, e: p.name, t: p.type_en, r: p.region, c: p.iso_3166_2, a: a > 0 ? a : undefined };
    Object.keys(props).forEach(function (k) { if (props[k] === undefined || props[k] === null || props[k] === '') delete props[k]; });
    (by[id] = by[id] || []).push({ p: props, g: g });
  });
  fs.mkdirSync(OUT, { recursive: true });
  var ids = Object.keys(by).sort(), total = 0;
  ids.forEach(function (id) {
    var s = 'window.ADM1_LOAD&&ADM1_LOAD(' + JSON.stringify(id) + ',' + JSON.stringify(by[id]) + ');\n';
    fs.writeFileSync(path.join(OUT, id + '.js'), s); total += s.length;
  });
  var idx = [];
  ids.forEach(function (id) { by[id].forEach(function (f) { idx.push([id, f.p.n || f.p.e || '', f.p.e || '', f.p.c || '']); }); });
  fs.writeFileSync(path.join(OUT, 'search.js'), 'window.ADM1_INDEX=' + JSON.stringify(idx) + ';\n');
  fs.writeFileSync(path.join(OUT, 'index.js'), 'window.ADM1_AVAIL=' + JSON.stringify(ids) + ';\n');
  console.log('OK: ' + ids.length + ' دولة، الحجم الكلي ' + (total / 1048576).toFixed(1) + ' MB -> ' + OUT);
}

if (process.argv[2]) run(fs.readFileSync(process.argv[2], 'utf8'));
else get(URL, run);
