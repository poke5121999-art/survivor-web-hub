/*
 * BIỆT ĐỘI LẶN — bộ kiểm HUD kiểu REPO + kỹ năng crew (phím R, 14 kỹ năng).
 *
 * Chạy:  node test/biet-doi-lan-hud.js
 * Ảnh ra %TEMP%/bdl-hud-shots (đổi bằng SHOTS=...). PC 1280x720 và cảm ứng 844x390 (hasTouch, isMobile) trên ?map=0.
 * BASE=https://.../ kiểm bản trên mạng.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bdl-hud-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary',
  '.atlas': 'text/plain', '.skel': 'application/octet-stream', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf' };

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      fs.readFile(path.join(ROOT, u), (e, b) => {
        if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' });
        r.end(b);
      });
    }).listen(0, () => res(srv));
  });
}

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return errors;
}

const info = page => page.evaluate(() => BDL_DEBUG.info());
const sk = page => page.evaluate(() => BDL_DEBUG.skill.info());

// hộp bao của phần tử đang hiện (display khác none, có kích thước), hoặc null
const RECTS = ids => ids.map(id => {
  const e = document.getElementById(id);
  if (!e) return { id, missing: true };
  const cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return { id, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0, x: r.x, y: r.y, w: r.width, h: r.height };
});

function overlaps(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0.5 && oy > 0.5;
}
function layoutChecks(tag, rects, W, H) {
  const shown = rects.filter(r => r.shown);
  const hidden = rects.filter(r => !r.shown).map(r => r.id);
  check(tag + ': mọi phần tử HUD cần hiện đều hiện', hidden.length === 0, hidden.join(',') || shown.length + ' phần tử');
  const out = shown.filter(r => r.x < -0.5 || r.y < -0.5 || r.x + r.w > W + 0.5 || r.y + r.h > H + 0.5);
  check(tag + ': nằm trọn trong màn hình', out.length === 0, out.map(r => r.id).join(','));
  const bad = [];
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) if (overlaps(shown[i], shown[j])) bad.push(shown[i].id + '×' + shown[j].id);
  check(tag + ': không phần tử nào chồng nhau', bad.length === 0, bad.join(' ') || 'xét ' + shown.length + ' phần tử');
  return shown;
}

async function enterDive(page, base) {
  await page.goto(base + '/games/biet-doi-lan/index.html?map=0');
  const ok = await page.waitForFunction(() => window.BDL_DEBUG && BDL_DEBUG.info().phase === 'dive', null, { timeout: 120000 }).then(() => true, () => false);
  if (ok) await sleep(2500);
  return ok;
}

// chỗ nước trống để làm sàn thử: dịch qua lại tới khi có nước thoáng rộng quanh điểm
async function openSpot(page) {
  return page.evaluate(() => {
    const G = HX.game, W = G.world, y = HX_TUNING.water.surfaceY - 6;
    for (let x = 0; x < 80; x += 2) for (const sx of [-30 + x, -30 - x]) {
      let ok = true;
      for (let dx = -8; dx <= 14 && ok; dx += 2) for (let dy = -4; dy <= 3 && ok; dy += 1) if (!W.open(sx + dx, y + dy, 0.8)) ok = false;
      if (ok) return { x: sx, y };
    }
    return null;
  });
}

const foes = {
  clear: page => page.evaluate(() => BDL_DEBUG.foes.clearAll()),
  spawn: (page, key, dx, dy) => page.evaluate(([k, dx, dy]) => {
    const d = HX.game.diver.pos; return BDL_DEBUG.foes.spawn(k, d.x + dx, d.y + (dy || 0), {})[0];
  }, [key, dx, dy]),
  state: (page, id) => page.evaluate(id => { const f = BDL.foes.list().find(o => o.id === id); return f ? { s: BDL.foes.stateOf(f), kind: f.ctl && f.ctl.kind, hp: f.body.hp, x: f.body.pos.x, y: f.body.pos.y, cage: !!(f.ctl && f.ctl.cageMesh) } : null; }, id),
};

async function castKey(page) { await page.keyboard.press('KeyR'); await sleep(120); }

// ---------------------------------------------------------------- PC
async function pcRun(browser, base) {
  const W = 1280, H = 720, tag = 'PC ' + W + 'x' + H;
  console.log('— ' + tag);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = watch(page);
  const ok = await enterDive(page, base);
  check(tag + ': vào pha dive', ok);
  if (!ok) { await page.close(); return; }
  const spot = await openSpot(page);
  check(tag + ': tìm được chỗ nước thoáng để thử', !!spot, spot ? spot.x + ',' + spot.y.toFixed(1) : '');
  const home = async () => { await page.evaluate(s => BDL_DEBUG.teleport(s.x, s.y), spot); await foes.clear(page); await sleep(150); };
  await home();

  // ---- bố cục HUD
  const rects = await page.evaluate(RECTS, ['o2bar', 'stam', 'quota', 'floor', 'hand', 'skill', 'hud-drone']);
  layoutChecks(tag, rects, W, H);
  const touchBtn = await page.evaluate(RECTS, ['tb-swap', 'tb-skill', 'tb-fire']);
  check(tag + ': PC không vẽ nút cảm ứng', touchBtn.every(r => !r.shown), touchBtn.filter(r => r.shown).map(r => r.id).join(','));
  const texts = await page.evaluate(() => ({ o2: document.getElementById('o2-num').textContent, max: document.getElementById('o2-max').textContent,
    quota: document.getElementById('quota-t').textContent, depth: document.getElementById('depth').textContent,
    cells: [...document.querySelectorAll('#hand .cell')].length, fill: document.getElementById('o2-fill').style.width, key: document.querySelector('#skill .key').textContent,
    skillIcon: document.querySelector('#skill .ic').textContent, drone: document.getElementById('hud-drone-n').textContent }));
  check(tag + ': O₂ hiện giá trị/tối đa', /^\d+$/.test(texts.o2) && /^\/\d+$/.test(texts.max) && /^100(.0)?%$/.test(texts.fill), JSON.stringify([texts.o2, texts.max, texts.fill]));
  check(tag + ': ô chỉ tiêu "Chỉ tiêu $x / $y"', /^Chỉ tiêu .*\/.*/.test(texts.quota), texts.quota);
  check(tag + ': "Tầng k/N · d m"', /^Tầng \d+\/\d+ · \d+ m$/.test(texts.depth), texts.depth);
  check(tag + ': tay cầm có 4 ô, nút kỹ năng ghi R, có icon kỹ năng', texts.cells === 4 && texts.key === 'R' && texts.skillIcon.length > 0, JSON.stringify([texts.cells, texts.key, texts.skillIcon]));
  check(tag + ': drone hiện số chuyến còn lại', /^\d+$/.test(texts.drone), texts.drone);

  // tay cầm đọc BDL.hand
  await page.evaluate(() => { BDL.hand = { slots: [{ key: 'rifle', uses: 12 }, { key: 'o2m', uses: 2 }, null], active: 1 }; });
  await sleep(300);
  const hand = await page.evaluate(() => [...document.querySelectorAll('#hand .cell')].map(c => ({ on: c.classList.contains('on'), empty: c.classList.contains('empty'), n: c.querySelector('.n').textContent, src: c.querySelector('img.ic').getAttribute('src') || '' })));
  check(tag + ': tay cầm ô 1 sáng, đọc số lần dùng, ô 3 trống', hand[1].on && !hand[0].on && hand[1].n === '×12' && hand[2].n === '×2' && hand[3].empty && /Item_BasicRifle/.test(hand[1].src), JSON.stringify(hand.map(c => [c.on, c.empty, c.n])));
  await sleep(100);

  // ---- R cast: Chói Loà (crew mặc định 'bao')
  const s0 = await sk(page);
  check(tag + ': crew mặc định bao, kỹ năng flash', s0.id === 'flash' && s0.crew === 'bao', s0.id + '/' + s0.crew);
  const id1 = await foes.spawn(page, 'rook', 3);
  await page.evaluate(id => BDL_DEBUG.foes.alert(id), id1);
  await sleep(200);
  const pre = await foes.state(page, id1);
  await castKey(page);
  const post = await foes.state(page, id1);
  const s1 = await sk(page);
  check(tag + ': bấm R tung kỹ năng, hồi chiêu chạy', s1.cdLeft > 10 && s1.casts === 1, 'cd ' + s1.cdLeft.toFixed(1) + '/' + s1.cdMax + ', casts ' + s1.casts);
  check(tag + ': Chói Loà làm quái gần choáng', pre.s === null && post && post.s === 'stun', JSON.stringify([pre.s, post && post.s]));
  check(tag + ': tính vào BDL.run.ca.skills', (await info(page)).ca.skills === 1);
  const ring = await page.evaluate(() => { const b = document.getElementById('skill'), r = b.querySelector('.ring'); return { cool: b.classList.contains('cool'), k: r.style.getPropertyValue('--k'), cd: b.querySelector('.cdn').textContent, bg: getComputedStyle(r).backgroundImage }; });
  check(tag + ': vòng hồi chiêu hiện (--k, số giây, class cool)', ring.cool && parseInt(ring.k) > 300 && +ring.cd > 10 && /conic/.test(ring.bg), JSON.stringify(ring));
  await castKey(page);
  check(tag + ': bấm R lúc chưa hồi không tung thêm', (await sk(page)).casts === 1);
  await page.screenshot({ path: path.join(SHOTS, 'pc-1-skill-cd.png') });
  let rec = await foes.state(page, id1);
  for (let t = 0; t < 40 && rec && rec.s; t++) { await sleep(250); rec = await foes.state(page, id1); }
  check(tag + ': hết choáng quái thôi bị điều khiển', !rec || rec.s === null, JSON.stringify(rec && rec.s));

  // ---- 14 kỹ năng: một tác dụng cụ thể mỗi cái
  const IDS = ['flash', 'healring', 'gong', 'unlock', 'vanish', 'shock', 'decoy', 'rescue', 'cage', 'blink', 'reveal', 'freeze', 'pull', 'angel'];
  const A = {};
  A.flash = async () => { const id = await foes.spawn(page, 'rook', 3); await castKey(page); const f = await foes.state(page, id); return [f && f.s === 'stun', 'quái ' + (f && f.s)]; };
  A.healring = async () => {
    await page.evaluate(() => { HX.game.diver.invuln = 0; BDL_DEBUG.hurt(30); });
    await sleep(900);
    const o0 = (await info(page)).o2;
    await castKey(page); await sleep(1500);
    const o1 = (await info(page)).o2, s = await sk(page);
    return [o1 > o0 + 5 && s.heal, o0.toFixed(1) + ' → ' + o1.toFixed(1) + ' (hồi ' + s.healed.toFixed(1) + ')'];
  };
  A.gong = async () => { const id = await foes.spawn(page, 'rook', 9); await castKey(page); const f = await foes.state(page, id), s = await sk(page); return [f && f.s === 'lure' && s.gong && s.last.foes === 1, JSON.stringify({ st: f && f.s, last: s.last })]; };
  A.unlock = async () => {
    const r = await page.evaluate(() => {
      const G = HX.game, l = G.loot.slice().sort((a, b) => a.pos.y - b.pos.y)[0];
      if (!l) return null; BDL_DEBUG.teleport(l.pos.x, l.pos.y + 1.6); return { id: l.id };
    });
    if (!r) return [false, 'map không có đồ cổ'];
    await sleep(250); await castKey(page); await sleep(150);
    const s = await sk(page), pried = await page.evaluate(id => { const l = HX.game.loot.find(o => o.id === id); return l && l.pried && !l.asleep; }, r.id);
    return [pried && s.pries === 1 && s.reveal > 0, JSON.stringify({ pried, pries: s.pries, reveal: s.reveal.toFixed(1) })];
  };
  A.vanish = async () => { const id = await foes.spawn(page, 'rook', 4); await page.evaluate(id => BDL_DEBUG.foes.alert(id), id); await sleep(150); await castKey(page); await sleep(300); const s = await sk(page), f = await page.evaluate(id => BDL_DEBUG.foes.get(id), id); return [s.blind > 4 && s.vanish > 4 && f && !f.aware, 'mù ' + s.blind.toFixed(1) + ' s, quái aware=' + (f && f.aware)]; };
  A.shock = async () => { const id = await foes.spawn(page, 'rook', 3); const h0 = (await foes.state(page, id)).hp; await castKey(page); const f = await foes.state(page, id); return [f && f.s === 'stun' && f.hp < h0 - 30, 'hp ' + h0 + ' → ' + (f && f.hp)]; };
  A.decoy = async () => { const id = await foes.spawn(page, 'chaser', 8); await castKey(page); const f = await foes.state(page, id), s = await sk(page); return [f && f.s === 'lure' && s.decoy, JSON.stringify({ st: f && f.s, decoy: s.decoy })]; };
  A.rescue = async () => {
    await page.evaluate(() => { const G = HX.game, l = G.loot[0], d = G.diver.pos; l.pos.x = d.x + 5; l.pos.y = d.y + 3; l.vel.x = l.vel.y = 0; l.asleep = false; });
    await sleep(100);
    const d0 = await page.evaluate(() => { const l = HX.game.loot[0], d = HX.game.diver.pos; return Math.hypot(l.pos.x - d.x, l.pos.y - d.y); });
    await castKey(page); await sleep(900);
    const d1 = await page.evaluate(() => { const l = HX.game.loot[0], d = HX.game.diver.pos; return Math.hypot(l.pos.x - d.x, l.pos.y - d.y); });
    return [d1 < d0 - 2, d0.toFixed(1) + ' m → ' + d1.toFixed(1) + ' m'];
  };
  A.cage = async () => {
    const id = await foes.spawn(page, 'rook', 4); await castKey(page); const f0 = await foes.state(page, id); await sleep(900); const f1 = await foes.state(page, id);
    return [f0 && f0.s === 'cage' && f0.cage && Math.hypot(f1.x - f0.x, f1.y - f0.y) < 0.05, JSON.stringify([f0 && f0.s, f0 && f0.cage, f1 && Math.hypot(f1.x - f0.x, f1.y - f0.y).toFixed(3)])];
  };
  A.blink = async () => {
    const x0 = (await info(page)).x;
    await page.keyboard.down('KeyD'); await sleep(60);
    await castKey(page); await page.keyboard.up('KeyD');
    const s = await sk(page), x1 = (await info(page)).x;
    return [s.last && s.last.len >= 5 && s.last.len <= 6.6 && x1 - x0 >= 4.5, 'đi ' + (x1 - x0).toFixed(1) + ' m, len ' + (s.last && s.last.len && s.last.len.toFixed(1))];
  };
  A.reveal = async () => {
    await foes.spawn(page, 'rook', 38);   // xa ngoài khung hình: mũi tên ở mép
    await castKey(page); await sleep(400);
    const m = await page.evaluate(() => ({ on: document.querySelectorAll('#marks .mk.show').length, off: document.querySelectorAll('#marks .mk.show.off').length, foe: document.querySelectorAll('#marks .mk.show.foe').length }));
    return [m.on >= 2 && m.off >= 1 && m.foe >= 1, JSON.stringify(m)];
  };
  A.freeze = async () => { const id = await foes.spawn(page, 'rook', 5); await castKey(page); const f = await foes.state(page, id); return [f && f.s === 'stun' && f.kind === 'ice', JSON.stringify(f && [f.s, f.kind])]; };
  A.pull = async () => {
    await page.evaluate(() => { const G = HX.game, d = G.diver.pos; G.loot.slice(0, 2).forEach((l, i) => { l.pos.x = d.x + 6 + i; l.pos.y = d.y + 1; l.vel.x = l.vel.y = 0; l.asleep = false; }); });
    await sleep(100);
    const dist = () => page.evaluate(() => { const d = HX.game.diver.pos; return HX.game.loot.slice(0, 2).map(l => Math.hypot(l.pos.x - d.x, l.pos.y - d.y)); });
    const d0 = await dist();
    await castKey(page); await sleep(1000);
    const d1 = await dist(), s = await sk(page);
    return [d1.every((v, i) => v < d0[i] - 2) && s.last.loot >= 2, d0.map(v => v.toFixed(1)) + ' → ' + d1.map(v => v.toFixed(1))];
  };
  A.angel = async () => {
    await castKey(page);
    const r = await page.evaluate(() => { const d = HX.game.diver; d.invuln = 0; const v = d.vulnerable(), o = d.o2, hit = d.hurt(25, d.pos.x - 1, d.pos.y); return { v, hit, drop: o - d.o2 }; });
    return [!r.v && !r.hit && r.drop === 0, JSON.stringify(r)];
  };

  for (const id of IDS) {
    await home();
    const set = await page.evaluate(i => BDL_DEBUG.skill.set(i), id);
    if (set !== id) { check(tag + ': kỹ năng ' + id, false, 'không đặt được'); continue; }
    const errBefore = (await info(page)).errors.length;
    let res;
    try { res = await A[id](); } catch (e) { res = [false, 'ngoại lệ: ' + e.message]; }
    const after = await sk(page), e1 = (await info(page)).errors;
    check(tag + ': ' + id + ' có tác dụng', !!res[0], res[1]);
    check(tag + ': ' + id + ' tung xong vào hồi chiêu, đếm lượt, không lỗi', after.cdLeft > 0 && after.casts >= 1 && e1.length === errBefore, 'cd ' + after.cdLeft.toFixed(1) + ' lỗi ' + e1.slice(errBefore).join('|'));
    if (id === 'reveal') await page.screenshot({ path: path.join(SHOTS, 'pc-3-reveal.png') });
    if (id === 'shock') await page.screenshot({ path: path.join(SHOTS, 'pc-2-shock.png') });
    await sleep(200);
  }
  // ảnh HUD sạch, có tay cầm
  await home();
  await page.evaluate(() => { BDL_DEBUG.skill.set('bao'); BDL_DEBUG.skill.resetCd(); });
  await sleep(600);
  await page.screenshot({ path: path.join(SHOTS, 'pc-0-hud.png') });
  const ge = await page.evaluate(() => HX.game.errors.slice());
  check(tag + ': G.errors rỗng', ge.length === 0, ge.slice(0, 3).join(' | '));
  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------------------------------------------------------------- cảm ứng
async function touchRun(browser, base) {
  const W = 844, H = 390, tag = 'Cảm ứng ' + W + 'x' + H;
  console.log('— ' + tag);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = watch(page);
  const ok = await enterDive(page, base);
  check(tag + ': vào pha dive', ok);
  if (!ok) { await ctx.close(); return; }
  const isTouch = await page.evaluate(() => document.body.classList.contains('touch'));
  check(tag + ': body.touch bật', isTouch);
  const spot = await openSpot(page);
  await page.evaluate(s => BDL_DEBUG.teleport(s.x, s.y), spot);
  await foes.clear(page);
  await sleep(300);

  const BTN = ['tb-fire', 'tb-boost', 'tb-knife', 'tb-grab', 'tb-swap', 'tb-skill', 'tb-drone', 'btn-pause'];
  const rects = await page.evaluate(RECTS, BTN.concat(['o2bar', 'stam', 'quota', 'floor', 'hand']));
  layoutChecks(tag, rects, W, H);
  const btnRects = rects.filter(r => BTN.includes(r.id) && r.shown);
  const small = btnRects.filter(r => Math.min(r.w, r.h) < 40);
  check(tag + ': nút đủ to để chạm (≥ 40 px)', small.length === 0, small.map(r => r.id + ':' + Math.round(r.w)).join(',') || 'nhỏ nhất ' + Math.round(Math.min(...btnRects.map(r => Math.min(r.w, r.h)))) + ' px');
  const left = btnRects.filter(r => r.x < W * 0.5);
  check(tag + ': không nút nào trong nửa trái (dải của cần di chuyển)', left.length === 0, left.map(r => r.id).join(','));
  const home0 = await page.evaluate(() => { const m = HX_MOBILE_UI.layouts.dive.stick, u = innerWidth / HX_MOBILE_UI.ref[0]; return { x: (m.dx - m.w / 2) * u, y: innerHeight - (m.dy + m.h / 2) * u, w: m.w * u, h: m.h * u }; });
  check(tag + ': không nút nào đè lên chỗ cần cố định', btnRects.every(r => !overlaps(r, home0)));
  // hit-slop: vùng bấm hụt của hai nút liền nhau không chồng (nút gần nhất thắng)
  const gaps = [];
  for (let i = 0; i < btnRects.length; i++) for (let j = i + 1; j < btnRects.length; j++) {
    const a = btnRects[i], b = btnRects[j], pad = 0.06;
    const g = x => ({ x: x.x - x.w * pad, y: x.y - x.h * pad, w: x.w * (1 + 2 * pad), h: x.h * (1 + 2 * pad) });
    if (overlaps(g(a), g(b))) gaps.push(a.id + '×' + b.id);
  }
  check(tag + ': vùng chạm hụt (±6%) của các nút không chồng nhau', gaps.length === 0, gaps.join(' '));

  // cần nổi hiện ở nửa trái khi chạm
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 290, id: 1 }] });
  await sleep(150);
  const stick = await page.evaluate(() => { const s = document.getElementById('stick'); return { hidden: s.hidden, r: s.getBoundingClientRect().toJSON() }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 290, id: 1 }] });
  await sleep(150);
  await page.screenshot({ path: path.join(SHOTS, 'touch-1-stick.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(tag + ': chạm nửa trái bật cần nổi (không nút nào cướp cú chạm)', !stick.hidden && stick.r.width > 20, JSON.stringify(stick));

  // chạm từng nút
  await page.evaluate(() => { window.__p = []; const o = BDL.press; BDL.press = function (k) { window.__p.push(k); return o.apply(this, arguments); }; });
  const center = id => rects.find(r => r.id === id);
  const tap = async id => { const r = center(id); await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); await sleep(150); };
  await tap('tb-swap');
  const pr0 = await page.evaluate(() => window.__p.slice());
  const noHook = await page.evaluate(() => !document.getElementById('tb-hook'));
  check(tag + ': chạm nút Đổi gọi BDL.press("swap")', pr0.join() === 'swap', pr0.join());
  check(tag + ': không còn nút Móc riêng (móc là nút bắn)', noHook);
  const bo0 = await page.evaluate(() => document.getElementById('tb-boost').classList.contains('on'));
  await tap('tb-boost');
  const bo1 = await page.evaluate(() => document.getElementById('tb-boost').classList.contains('on'));
  check(tag + ': chạm nút Chạy bật / tắt tăng tốc', !bo0 && bo1, bo0 + ' → ' + bo1);
  await tap('tb-boost');
  // nút kỹ năng: tung thật, quái gần choáng, vòng hồi chiêu hiện
  const id1 = await foes.spawn(page, 'rook', 3);
  await sleep(150);
  await tap('tb-skill');
  const pr1 = await page.evaluate(() => window.__p.slice()), s1 = await sk(page), f1 = await foes.state(page, id1);
  check(tag + ': chạm nút Kỹ năng gọi BDL.press("skill") và tung kỹ năng', pr1[pr1.length - 1] === 'skill' && s1.casts === 1 && s1.cdLeft > 10, JSON.stringify([pr1.slice(-1), s1.casts]));
  check(tag + ': kỹ năng cảm ứng làm quái choáng', f1 && f1.s === 'stun', f1 && f1.s);
  const cdr = await page.evaluate(() => { const b = document.getElementById('tb-skill'); return { cool: b.classList.contains('cool'), k: b.querySelector('.ring').style.getPropertyValue('--k'), cd: b.querySelector('.cdn').textContent }; });
  check(tag + ': vòng hồi chiêu trên nút Kỹ năng', cdr.cool && parseInt(cdr.k) > 300 && +cdr.cd > 10, JSON.stringify(cdr));
  // nút E sáng khi có xác trong tầm (class can-harvest) — mô phỏng bằng class
  await page.evaluate(() => { BDL.hand = { slots: [{ key: 'rifle', uses: 12 }, null, { key: 'bomb', uses: 2 }], active: 0 }; });
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, 'touch-0-hud.png') });
  // kéo nút Xiên để ngắm: các ô ngắm hiện ở chỗ nút bắn
  const fr = center('tb-fire'), fx = fr.x + fr.w / 2, fy = fr.y + fr.h / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fx - 30, y: fy - 20, id: 2 }] });
  await sleep(200);
  const aim = await page.evaluate(() => { const t = document.getElementById('tc'); return { aiming: t.classList.contains('aiming'), bg: document.getElementById('tb-aimbg').getBoundingClientRect().toJSON(), cancel: document.getElementById('tb-cancel').getBoundingClientRect().toJSON() }; });
  await page.screenshot({ path: path.join(SHOTS, 'touch-2-aim.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const acx = aim.bg.x + aim.bg.width / 2, acy = aim.bg.y + aim.bg.height / 2;
  check(tag + ': kéo nút Xiên bật cần ngắm đúng tâm nút, có ô Huỷ bắn', aim.aiming && Math.hypot(acx - fx, acy - fy) < 6 && aim.cancel.width > 20, JSON.stringify({ aiming: aim.aiming, d: Math.hypot(acx - fx, acy - fy).toFixed(1) }));
  const ge = await page.evaluate(() => HX.game.errors.slice());
  check(tag + ': G.errors rỗng', ge.length === 0, ge.slice(0, 3).join(' | '));
  check(tag + ': không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ảnh trang REPO để so kiểu (nếu vào được)
async function repoShot(browser, base) {
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    await page.goto(base + '/games/repo2d/index.html', { timeout: 30000 });
    await sleep(2000);
    await page.click('#veilBtn', { timeout: 5000 }).catch(() => {});
    await sleep(4000);
    await page.screenshot({ path: path.join(SHOTS, 'repo-ref.png') });
    await page.close();
  } catch (e) { console.log('  (không chụp được trang REPO: ' + e.message + ')'); }
}

(async () => {
  const srv = process.env.BASE ? null : await serve();
  const base = process.env.BASE || 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await pcRun(browser, base);
    await touchRun(browser, base);
    if (!process.env.NO_REPO) await repoShot(browser, base);
  } catch (e) {
    check('bộ kiểm chạy hết không ngoại lệ', false, e.stack || e.message);
  }
  await browser.close();
  if (srv) srv.close();
  console.log('\n' + pass + ' đạt, ' + fail + ' hỏng · ảnh ở ' + SHOTS);
  process.exit(fail ? 1 : 0);
})();
