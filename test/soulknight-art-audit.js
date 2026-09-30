/*
 * Kiểm kê thứ Hiệp Sĩ Linh Hồn (games/soulknight) vẽ mà KHÔNG phải art gốc — để thay dần bằng art thật.
 * Chạy: python -m http.server 8811 (ở gốc repo) rồi  node test/soulknight-art-audit.js
 * Báo cáo: $SK_SHOTS hoặc <tmp>/soulknight-art-audit/report.json (+ một PNG mỗi cảnh cạnh đó); markdown in ra màn hình.
 *
 * Cách đo: trước khi mã game chạy (addInitScript) bọc các hàm vẽ của CanvasRenderingContext2D
 * (fillRect/strokeRect/fill/stroke/fillText/strokeText/drawImage). Mỗi lệnh ghi lại khung ngăn xếp đầu tiên nằm trong
 * games/soulknight/js (tệp:dòng), tên lệnh, diện tích ước lượng (hộp bao của path × định thức ma trận biến đổi).
 * SK.draw/SK.drawTinted/SK.drawPrefab được bọc qua bẫy ở window.SK (đặt cờ độ sâu): mọi drawImage bên trong tính là
 * "art gốc". drawImage ngoài các hàm đó (vfx.js, lobby...) tính riêng theo nguồn ảnh: atlas/art/ = gốc, canvas phụ = "khác".
 * Phần trăm "share" = diện tích tay làm của dòng đó / tổng diện tích mọi lệnh vẽ (gốc + tay) trong cảnh.
 * Chỉ tính canvas hiển thị (sk-view, sk-hud, avatar lobby); canvas ngoài màn hình (dựng cache) ghi riêng "off".
 * Ghi chú: diện tích cộng dồn nên vùng bị vẽ chồng được tính nhiều lần; đây là thước so sánh, không phải % điểm ảnh.
 */
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html';
const OUT = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-art-audit');
const FRAMES = +(process.env.SK_FRAMES || 60);
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await p.evaluate(fn, arg)) return true; } catch (_) { /* trang đang chuyển */ }
    await sleep(80);
  }
  return false;
}

// ------------------------------------------------------------------ mã chạy trong trang (trước mã game)
function INIT() {
  const A = window.__audit = { frames: 0, rec: {}, on: false, depth: 0, errs: 0 };
  Error.stackTraceLimit = 14;
  const RE = /games\/soulknight\/js\/([^\s:)?]+)(?:\?[^\s:)]*)?:(\d+)/;
  const P = CanvasRenderingContext2D.prototype;
  const bb = new WeakMap();           // ctx -> {x0,y0,x1,y1}
  const cname = c => { const cv = c.canvas; return cv && cv.id ? cv.id : (cv && cv.isConnected ? 'dom-canvas' : 'off'); };
  const det = c => { const m = c.getTransform(); return Math.abs(m.a * m.d - m.b * m.c); };
  function site() {
    const s = new Error().stack || '';
    for (const l of s.split('\n')) { const m = RE.exec(l); if (m) return m[1] + ':' + m[2]; }
    return '(ngoài js/)';
  }
  function add(ctx, prim, area, kind) {
    if (!A.on) return;
    const key = (kind === 'orig' ? 'ORIG' : cname(ctx) + ' | ' + site() + ' | ' + prim + (kind === 'img' ? ' | ' + kind : ''));
    const r = A.rec[key] || (A.rec[key] = { n: 0, area: 0, kind: kind, prim: prim, canvas: cname(ctx) });
    r.n++; r.area += area;
  }
  function pt(ctx, x, y) {
    let b = bb.get(ctx); if (!b) { b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; bb.set(ctx, b); }
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
  }
  const wrap = (name, fn) => { const o = P[name]; P[name] = function () { fn.apply(this, arguments); return o.apply(this, arguments); }; };
  wrap('beginPath', function () { bb.delete(this); });
  wrap('moveTo', function (x, y) { pt(this, x, y); });
  wrap('lineTo', function (x, y) { pt(this, x, y); });
  wrap('rect', function (x, y, w, h) { pt(this, x, y); pt(this, x + w, y + h); });
  wrap('arc', function (x, y, r) { pt(this, x - r, y - r); pt(this, x + r, y + r); });
  wrap('ellipse', function (x, y, rx, ry) { pt(this, x - rx, y - ry); pt(this, x + rx, y + ry); });
  wrap('arcTo', function (x1, y1, x2, y2) { pt(this, x1, y1); pt(this, x2, y2); });
  wrap('quadraticCurveTo', function (a, b, x, y) { pt(this, a, b); pt(this, x, y); });
  wrap('bezierCurveTo', function (a, b, c, d, x, y) { pt(this, a, b); pt(this, c, d); pt(this, x, y); });
  wrap('roundRect', function (x, y, w, h) { pt(this, x, y); pt(this, x + w, y + h); });
  const pathArea = ctx => { const b = bb.get(ctx); return b && b.x1 >= b.x0 ? (b.x1 - b.x0) * (b.y1 - b.y0) * det(ctx) : 0; };
  wrap('fillRect', function (x, y, w, h) { if (A.on) add(this, 'fillRect', Math.abs(w * h) * det(this)); });
  wrap('strokeRect', function (x, y, w, h) { if (A.on) add(this, 'strokeRect', Math.abs(w * h) * det(this)); });
  wrap('fill', function () { if (A.on) add(this, 'fill', pathArea(this)); });
  wrap('stroke', function () { if (A.on) add(this, 'stroke', pathArea(this)); });
  const textArea = (ctx, s) => { if (!A.on) return 0; const px = parseFloat(ctx.font) || 10; return ctx.measureText(String(s)).width * px * det(ctx); };
  wrap('fillText', function (s) { if (A.on) add(this, 'fillText', textArea(this, s)); });
  wrap('strokeText', function (s) { if (A.on) add(this, 'strokeText', textArea(this, s)); });
  wrap('drawImage', function (img, a, b, c, d, e, f, g, h) {
    if (!A.on) return;
    const n = arguments.length;
    const w = n >= 9 ? g : n >= 5 ? c : (img.naturalWidth || img.width || 0);
    const hh = n >= 9 ? h : n >= 5 ? d : (img.naturalHeight || img.height || 0);
    const area = Math.abs(w * hh) * det(this);
    if (A.depth > 0) { add(this, 'drawImage', area, 'orig'); return; }
    // ngoài SK.draw: ảnh có nguồn art/ (thẻ img) = gốc; canvas phụ = chưa rõ (ghi riêng, có thể là atlas đã ghép sẵn)
    const src = img && img.src || '';
    if (src && /\/art\//.test(src)) add(this, 'drawImage', area, 'orig');
    else add(this, 'drawImage', area, 'img');
  });
  // bẫy window.SK: bọc draw/drawTinted/drawPrefab ngay lúc engine.js gán
  let _SK;
  Object.defineProperty(window, 'SK', {
    configurable: true,
    get() { return _SK; },
    set(v) {
      if (v === _SK) return;          // mỗi tệp gán lại window.SK = window.SK || {} — đừng bọc lần hai
      _SK = v;
      for (const k of ['draw', 'drawTinted', 'drawPrefab']) {
        let fn;
        Object.defineProperty(v, k, {
          configurable: true, enumerable: true,
          get() { return fn; },
          set(f) {
            fn = function () { A.depth++; try { return f.apply(this, arguments); } finally { A.depth--; } };
          }
        });
      }
    }
  });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(t => { A.frames++; return cb(t); });
}

// ------------------------------------------------------------------ quét DOM
function DOMSCAN() {
  const out = [];
  const cv = document.getElementById('sk-view');
  const cr = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  for (const el of document.querySelectorAll('body *')) {
    if (/^(SCRIPT|STYLE|LINK|META|CANVAS|BR)$/.test(el.tagName)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || r.width < 2 || r.height < 2) continue;
    if (el.closest('[hidden]')) continue;
    if (r.right < cr.left || r.left > cr.right || r.bottom < cr.top || r.top > cr.bottom) continue;
    const bgImg = cs.backgroundImage !== 'none' ? cs.backgroundImage : '';
    const hasBgColor = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
    const border = ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none');
    const own = Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    let kind, src = '';
    if (el.tagName === 'IMG') { src = el.currentSrc || el.src; kind = /\/art\//.test(src) ? 'img-art' : 'img-other'; }
    else if (bgImg && /url\(/.test(bgImg)) { src = bgImg; kind = /\/art\//.test(bgImg) ? 'bg-art' : 'bg-other'; }
    else if (bgImg) { kind = 'css-gradient'; src = bgImg.slice(0, 60); }
    else if (hasBgColor || border || cs.boxShadow !== 'none') kind = own ? 'css-box+text' : 'css-box';
    else if (own) kind = 'text';
    else continue;                                  // vỏ bọc không vẽ gì
    out.push({ tag: el.tagName.toLowerCase(), id: el.id || '', cls: (el.className && el.className.baseVal === undefined ? el.className : '') + '',
      kind, src: src.slice(0, 120), text: own.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
}

const scenes = [];   // {name, frames, rec, dom}
async function sample(p, name, extra) {
  await p.evaluate(() => { const A = window.__audit; A.rec = {}; A.on = true; A.f0 = A.frames; });
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const f = await p.evaluate(() => window.__audit.frames - window.__audit.f0);
    if (f >= FRAMES) break;
    await sleep(50);
  }
  const res = await p.evaluate(() => { const A = window.__audit; A.on = false; return { frames: A.frames - A.f0, rec: A.rec }; });
  const dom = await p.evaluate(DOMSCAN);
  await p.screenshot({ path: path.join(OUT, name.replace(/[^\w-]+/g, '_') + '.png') });
  scenes.push({ name, frames: res.frames, rec: res.rec, dom, note: extra || '' });
  console.error('  cảnh ' + name + ': ' + res.frames + ' khung, ' + Object.keys(res.rec).length + ' điểm vẽ');
}

async function run() {
  const b = await chromium.launch();
  const failures = [];
  const newPage = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => failures.push('pageerror: ' + e.message));
    await p.addInitScript(INIT);
    await p.goto(URL);
    await p.waitForSelector('#sk-start', { state: 'visible', timeout: 10000 });
    await sleep(600);
    return p;
  };
  const ev = (p, fn, arg) => p.evaluate(fn, arg);
  const step = async (name, fn) => { try { await fn(); } catch (e) { failures.push(name + ': ' + e.message); console.error('  LỖI ' + name + ': ' + e.message); } };

  let p = await newPage();
  await step('lobby', () => sample(p, 'lobby'));
  await step('1-1', async () => {
    await ev(p, () => SK_GAME.debug.seed(20260929));
    await p.click('#sk-start');
    if (!await until(p, () => SK_GAME.state === 'stage', null, 5000)) throw new Error('không vào được màn 1-1');
    await ev(p, () => SK_GAME.debug.god(true));
    await sleep(600);
    await sample(p, '1-1 start');
  });
  await step('combat', async () => {
    await ev(p, () => SK_GAME.debug.teleportTo('battle', 0));
    await until(p, () => SK_GAME.enemyCount > 0, null, 6000);
    await p.keyboard.down('KeyJ');
    await until(p, () => SK_GAME.bullets.e > 0, null, 8000);
    await sample(p, '1-1 combat', 'giữ J bắn, quái bắn');
    await p.keyboard.up('KeyJ');
  });
  // đi qua hầm để có rương: dựng lại 1-2 với phòng rương ép sẵn
  await step('chest', async () => {
    await ev(p, () => { Object.assign(SK_ROOMS.force, { chest: 'chest', special: null, statue: null }); SK_GAME.debug.stage('1-2'); });
    await until(p, () => SK_GAME.phase === 'play', null, 5000);
    await ev(p, () => SK_GAME.debug.teleportTo('chest'));
    await sleep(400);
    const ok = await ev(p, () => {
      const c = SK.G.chests.find(x => x.kind === 'weapon'); if (!c) return false;
      SK.G.player.x = c.x; SK.G.player.y = c.y + 6; return true;
    });
    if (!ok) throw new Error('không có rương vũ khí');
    await sleep(300);
    const used = await ev(p, () => { const t = SK.G.interactTarget; if (t) { t.use(SK.G); return true; } return false; });
    if (!used) throw new Error('không có mục tương tác cạnh rương');
    await sleep(500);
    await sample(p, 'rương vũ khí mở');
  });
  await step('shop', async () => {
    await ev(p, () => { Object.assign(SK_ROOMS.force, { chest: 'shop', special: null, statue: null }); SK_GAME.debug.stage('2-4'); });
    await until(p, () => SK_GAME.phase === 'play', null, 5000);
    await ev(p, () => SK_GAME.debug.teleportTo('chest'));
    await sleep(500);
    const near = await ev(p, () => { const o = SK.G.interactables.find(q => /^Mua/.test(q.label)); if (!o) return false; SK.G.player.x = o.x; SK.G.player.y = o.y + 2; return true; });
    await sleep(300);
    await sample(p, 'cửa hàng', near ? '' : 'không tìm thấy món Mua');
  });
  await step('boss 1-5', async () => {
    await ev(p, () => { Object.assign(SK_ROOMS.force, { chest: null, special: null, statue: null }); SK_GAME.debug.stage('1-5'); });
    await until(p, () => SK_GAME.phase === 'play', null, 5000);
    await ev(p, () => { SK_GAME.debug.god(true); SK_GAME.debug.teleportTo('boss'); });
    await until(p, () => SK.G.enemies.some(e => e.bossKey), null, 6000);
    await sleep(5000);
    await p.keyboard.down('KeyJ');
    await sample(p, 'boss 1-5');
    await p.keyboard.up('KeyJ');
  });
  for (const lab of ['2-1', '3-1']) {
    await step('world ' + lab, async () => {
      await ev(p, l => SK_GAME.debug.stage(l), lab);
      await until(p, () => SK_GAME.phase === 'play', null, 5000);
      await ev(p, () => SK_GAME.debug.god(true));
      await sleep(600);
      await sample(p, lab + ' start');
      await ev(p, () => SK_GAME.debug.teleportTo('battle', 0));
      await until(p, () => SK_GAME.enemyCount > 0, null, 6000);
      await p.keyboard.down('KeyJ');
      await sleep(2000);
      await sample(p, lab + ' combat');
      await p.keyboard.up('KeyJ');
    });
  }
  await p.context().close();

  p = await newPage();
  await step('season base', async () => {
    await ev(p, () => { try { localStorage.removeItem('sk.season.v2'); } catch (_) { /* */ } });
    const started = await ev(p, () => SK.SEASON.start('knight'));
    if (!await until(p, () => SK.G.state === 'season' && SK.G.player && SK.SEASON.ui, null, 6000)) throw new Error('không vào được mùa giải (start=' + started + ')');
    await ev(p, () => SK.SEASON.debug.god(true));
    await sleep(1000);
    await sample(p, 'season base');
  });
  await b.close();
  return failures;
}

// ------------------------------------------------------------------ báo cáo
function build(failures) {
  const rows = [], sceneTotals = {};
  for (const s of scenes) {
    let tot = 0, orig = 0;
    for (const r of Object.values(s.rec)) { tot += r.area; if (r.kind === 'orig') orig += r.area; }
    sceneTotals[s.name] = { total: tot, orig, hand: tot - orig, frames: s.frames };
    for (const [k, r] of Object.entries(s.rec)) {
      if (r.kind === 'orig') continue;
      const [canvas, site, prim] = k.split(' | ');
      rows.push({ scene: s.name, canvas, site, prim: prim + (r.kind === 'img' ? ' (ảnh ngoài SK.draw)' : ''),
        callsPerFrame: +(r.n / (s.frames || 1)).toFixed(2), areaPerFrame: Math.round(r.area / (s.frames || 1)),
        share: tot ? r.area / tot : 0 });
    }
  }
  rows.sort((a, b) => b.share - a.share);
  // gộp theo điểm vẽ (mọi cảnh): trung bình cộng share các cảnh
  const by = {};
  for (const r of rows) {
    const k = r.site + ' | ' + r.prim + ' | ' + r.canvas;
    const g = by[k] || (by[k] = { site: r.site, prim: r.prim, canvas: r.canvas, scenes: {}, sum: 0 });
    g.scenes[r.scene] = r.share; g.sum += r.share;
  }
  const sites = Object.values(by).sort((a, b) => b.sum - a.sum);
  const pct = x => (x * 100).toFixed(2) + '%';
  const md = [];
  md.push('# Kiểm kê art không-gốc — Hiệp Sĩ Linh Hồn', '');
  md.push('## Tổng theo cảnh', '', '| cảnh | khung | diện tích/khung | gốc | tay làm |', '|---|---|---|---|---|');
  for (const [n, t] of Object.entries(sceneTotals)) md.push('| ' + n + ' | ' + t.frames + ' | ' + Math.round(t.total / (t.frames || 1)) + ' | ' + pct(t.total ? t.orig / t.total : 0) + ' | ' + pct(t.total ? t.hand / t.total : 0) + ' |');
  md.push('', '## Điểm vẽ tay làm, xếp theo tổng share (cộng các cảnh)', '', '| tệp:dòng | lệnh | canvas | tổng share | cảnh lớn nhất |', '|---|---|---|---|---|');
  for (const g of sites.slice(0, 60)) {
    const top = Object.entries(g.scenes).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, v]) => n + ' ' + pct(v)).join(', ');
    md.push('| ' + g.site + ' | ' + g.prim + ' | ' + g.canvas + ' | ' + pct(g.sum) + ' | ' + top + ' |');
  }
  md.push('', '## Chi tiết cảnh | tệp:dòng | lệnh | lần/khung | share (100 dòng đầu)', '', '| cảnh | tệp:dòng | lệnh | canvas | lần/khung | share |', '|---|---|---|---|---|---|');
  for (const r of rows.slice(0, 100)) md.push('| ' + r.scene + ' | ' + r.site + ' | ' + r.prim + ' | ' + r.canvas + ' | ' + r.callsPerFrame + ' | ' + pct(r.share) + ' |');
  md.push('', '## DOM phủ trên canvas', '');
  for (const s of scenes) {
    if (!s.dom.length) continue;
    md.push('### ' + s.name, '');
    for (const d of s.dom.slice(0, 40)) md.push('- ' + d.tag + (d.id ? '#' + d.id : '') + (d.cls ? '.' + String(d.cls).trim().split(/\s+/).join('.') : '') + ' [' + d.kind + '] ' + d.w + 'x' + d.h + (d.src ? ' ' + d.src : '') + (d.text ? ' "' + d.text + '"' : ''));
    md.push('');
  }
  if (failures.length) md.push('## Lỗi', '', ...failures.map(f => '- ' + f), '');
  return { md: md.join('\n'), json: { scenes: scenes.map(s => ({ name: s.name, frames: s.frames, note: s.note, totals: sceneTotals[s.name], dom: s.dom })), rows, sites, failures } };
}

run().then(failures => {
  const { md, json } = build(failures);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(json, null, 1));
  fs.writeFileSync(path.join(OUT, 'report.md'), md);
  console.log(md);
  console.log('\nreport: ' + path.join(OUT, 'report.json'));
  process.exit(0);
}).catch(e => { console.error('BLOCKED: ' + (e && e.stack || e)); process.exit(1); });
