#!/usr/bin/env node
// ينزّل المدن (Natural Earth populated places) ويولّد app/src/main/assets/data/cities.js
// الاستخدام:  node scripts/build_cities.js [ملف_geojson_محلي]
const https = require('https'), fs = require('fs'), path = require('path');
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson';
const OUT = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'data', 'cities.js');
function get(u, cb, n) {
  n = n || 0;
  https.get(u, function (r) {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && n < 5) return get(r.headers.location, cb, n + 1);
    if (r.statusCode !== 200) { console.error('HTTP ' + r.statusCode); process.exit(1); }
    var ch = []; r.on('data', function (d) { ch.push(d); });
    r.on('end', function () { cb(Buffer.concat(ch).toString('utf8')); });
  }).on('error', function (e) { console.error(e.message); process.exit(1); });
}
function run(txt) {
  var gj = JSON.parse(txt), out = [];
  gj.features.forEach(function (f) {
    var p = f.properties || {}, a3 = p.ADM0_A3 || p.adm0_a3;
    if (a3 === 'ISR') return;
    var pop = p.POP_MAX || p.pop_max || 0, fc = p.FEATURECLA || p.featurecla || '';
    var cap = /Admin-0 capital/.test(fc) ? 1 : /Admin-1 capital/.test(fc) ? 2 : 0;
    if (pop < 100000 && cap !== 1) return;
    var c = f.geometry && f.geometry.coordinates; if (!c) return;
    var name = p.NAME || p.name, ar = p.NAME_AR || p.name_ar || '';
    out.push([Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100, name, ar, Math.round(pop / 1000), cap]);
  });
  out.sort(function (a, b) { return (b[5] === 1 ? 1e9 : 0) + b[4] - ((a[5] === 1 ? 1e9 : 0) + a[4]); });
  fs.writeFileSync(OUT, 'window.CITIES=' + JSON.stringify(out) + ';\n');
  console.log('OK: ' + out.length + ' مدينة -> ' + OUT);
}
if (process.argv[2]) run(fs.readFileSync(process.argv[2], 'utf8')); else get(URL, run);
