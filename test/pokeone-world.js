/*
 * POKÉONE — bản đồ 2D kiểu PRO (js/world*.js, data/maps.js).
 *
 * Chạy:  node test/pokeone-world.js          SYNTH=1 ép dùng bản đồ tổng hợp; SHOTS=<thư mục> đổi chỗ lưu ảnh.
 *
 * Tĩnh: build_maps.js --check, cửa nối tới map/ô đi được, cửa có đường về, sprite NPC và tấm tile có ảnh, mọi ô tile
 *   thuộc tấm đã khai trong M.sheets, mọi kịch bản có thật.
 * Chơi (Playwright 1366x768): đi bằng phím, vào nhà rồi ra, gặp Pokémon hoang dã trong cỏ, trainer nhìn thấy, nhảy gờ.
 * Ảnh: mỗi map một ảnh + Pallet 844x390 cảm ứng + lưới ?grid=1 + ban đêm + cỏ cao + mái che.
 *
 * Khi data/maps.js chưa ở định dạng 2D mới (hoặc thiếu art/pro/tiles), phần chơi chạy trên bản đồ tổng hợp dựng ngay
 * trong trang, ảnh tile/sprite lấy từ D:\pro-ref\dump qua page.route. Không ghi dữ liệu giả vào repo.
 * Cảnh trận (js/battle.js) thuộc luồng khác: bài này thay bằng cảnh giả để kiểm vòng world → battle → world, rồi
 * kết thúc trận bằng chính onEnd mà world truyền vào. menus.js cũ (dựa vào P1.ngui đã xoá) hoặc thiếu thì cài
 * P1.ui/P1.dialog tối thiểu: say tự qua, choose trả 0.
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games/pokeone');
const DUMP = process.env.PRO_DUMP || 'D:/pro-ref/dump';
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-world-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.css': 'text/css',
  '.ogg': 'audio/ogg', '.json': 'application/json' };

let pass = 0, fail = 0;
const out = [], shots = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
  console.log(out[out.length - 1]);
}
function note(text) { out.push('  ⚠ ' + text); console.log(out[out.length - 1]); }
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
function loadData(files) {
  const P1 = {};
  for (const f of files) {
    const p = path.join(GAME, 'data', f);
    if (fs.existsSync(p)) new Function('window', 'P1', fs.readFileSync(p, 'utf8'))({ P1 }, P1);
  }
  return P1;
}

/* ---------------------------------------------------------------- bản đồ tổng hợp (chỉ để kiểm khi dữ liệu thật chưa có) */
function synthMaps() {
  const ref = (s, c, r) => s * 1024 + r * 32 + c;
  const GRASS = ref(1, 7, 0), TALL = ref(1, 7, 7), FLOOR = ref(2, 16, 6);
  function blank(id, name, w, h, base, settings) {
    const M = { id, name, w, h, ground: [new Array(w * h).fill(base), new Array(w * h).fill(-1)], over: [new Array(w * h).fill(-1)],
      colliders: new Array(w * h).fill(0), water: new Array(w * h).fill(0), zones: { grid: new Array(w * h).fill(0), ids: [], tables: {} },
      links: [], npcs: [], settings: Object.assign({ song: '', indoors: false, bg: 'land', mapName: name }, settings), sheets: [] };
    M.set = (layer, x, y, t) => { if (x >= 0 && y >= 0 && x < w && y < h) layer[y * w + x] = t; };
    return M;
  }
  // Cây 3×4 ô ở tấm 1 (0,0): hàng dưới cùng (gốc) vào ground + chặn, ba hàng trên vào over để che người đi sau.
  function tree(M, x, y) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const t = ref(1, c, r);
      if (r === 3) { M.set(M.ground[1], x + c, y + r, t); if (c === 1) M.set(M.colliders, x + c, y + r, 1); }
      else M.set(M.over[0], x + c, y + r, t);
    }
  }
  // Nhà: khối 5×6 ô ở tấm 50 (9,0); hai hàng dưới vào ground + chặn, phần mái vào over.
  function house(M, x, y) {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
      const t = ref(50, 9 + c, r);
      if (r >= 4) { M.set(M.ground[1], x + c, y + r, t); M.set(M.colliders, x + c, y + r, 1); } else M.set(M.over[0], x + c, y + r, t);
    }
  }
  function grass(M, x0, y0, x1, y1, zone) {
    if (!M.zones.ids.includes(zone)) {
      M.zones.ids.push(zone);
      const list = [{ dex: 16, w: 50, min: 2, max: 4 }, { dex: 19, w: 50, min: 2, max: 4 }];
      M.zones.tables[zone] = { morning: list, day: list, evening: list, night: list };
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { M.set(M.ground[1], x, y, TALL); M.set(M.zones.grid, x, y, M.zones.ids.indexOf(zone) + 1); }
  }
  function border(M, gapX) {
    for (let x = 0; x < M.w; x++) for (const y of [0, M.h - 1]) if (Math.abs(x - gapX) > 1) M.set(M.colliders, x, y, 1);
    for (let y = 0; y < M.h; y++) { M.set(M.colliders, 0, y, 1); M.set(M.colliders, M.w - 1, y, 1); }
  }

  const P = blank('pallet_town', 'Pallet Town', 22, 18, GRASS, { song: 'pallet_town', spawn: [11, 10] });
  border(P, 11);
  house(P, 3, 2);                       // cửa ở (5,7), đứng (5,8) bấm lên
  tree(P, 14, 2); tree(P, 16, 11);
  grass(P, 3, 12, 8, 15, 'pallet_grass');
  for (let x = 12; x <= 15; x++) P.set(P.colliders, x, 8, 2);   // gờ nhảy xuống
  P.links.push({ x: 5, y: 7, to: 'pallet_house', tx: 4, ty: 6, face: 'up', kind: 'door' });
  P.links.push({ x: 11, y: -1, to: 'route_1', tx: 8, ty: 19, face: 'up', kind: 'edge' });
  P.npcs.push({ id: 'boy', kind: 'npc', x: 9, y: 9, face: 'down', name: 'Boy', sprite: 'sprite1', look: 'random', script: 'synth_hi' });
  P.npcs.push({ id: 'ball', kind: 'item', x: 18, y: 5, face: 'down', name: 'Potion', sprite: 'sprite11', item: 'potion', n: 1 });
  P.npcs.push({ id: 'sign', kind: 'sign', x: 7, y: 8, face: 'down', name: 'Sign', script: 'synth_sign' });
  P.set(P.colliders, 7, 8, 1);
  P.sheets = [1, 50];

  const H = blank('pallet_house', 'Pallet Town', 9, 8, FLOOR, { song: 'pallet_town', indoors: true, bg: 'indoor', spawn: [4, 5] });
  border(H, -9);
  H.set(H.colliders, 4, 7, 0);
  H.links.push({ x: 4, y: 7, to: 'pallet_town', tx: 5, ty: 8, face: 'down', kind: 'door' });
  H.npcs.push({ id: 'mom', kind: 'npc', x: 2, y: 3, face: 'right', name: 'Mom', sprite: 'sprite1', script: 'synth_hi' });
  H.sheets = [2];

  const R = blank('route_1', 'Route 1', 18, 21, GRASS, { song: 'route_1', spawn: [8, 18], encounterRate: 'normal' });
  border(R, 8);
  for (let x = 1; x <= 16; x++) if (x < 7 || x > 9) R.set(R.colliders, x, 14, 2);   // gờ, đường giữa để về
  grass(R, 11, 3, 15, 8, 'route_1_grass');
  tree(R, 2, 1); tree(R, 13, 15);
  R.links.push({ x: 8, y: 21, to: 'pallet_town', tx: 11, ty: 0, face: 'down', kind: 'edge' });
  R.npcs.push({ id: 'joey', kind: 'npc', x: 2, y: 9, face: 'right', name: 'Youngster Joey', sprite: 'sprite1', los: 4, script: 'synth_joey',
    trainer: { team: [{ dex: 19, level: 3 }], money: 100, exp: 10, spotted: 'boy_1' } });
  R.sheets = [1];
  for (const M of [P, H, R]) delete M.set;
  const scripts = {
    synth_hi: [{ op: 'say', text: 'Hi {player}!' }],
    synth_sign: [{ op: 'say', text: 'Pallet Town' }],
    synth_joey: [{ op: 'if', cond: 'beat_joey', goto: 3 }, { op: 'say', text: 'Hey! Battle!' }, { op: 'battle', self: true }, { op: 'say', text: 'Aww.' }],
  };
  return { MAPS: { pallet_town: P, pallet_house: H, route_1: R }, SCRIPTS: scripts };
}

/* ---------------------------------------------------------------- kiểm tĩnh */
function realReady(D) {
  const maps = Object.values(D.MAPS || {});
  if (!maps.length || !maps.every(M => Array.isArray(M.ground) && Array.isArray(M.over) && Array.isArray(M.sheets))) return 'data/maps.js chưa ở định dạng 2D (thiếu ground/over/sheets)';
  const miss = [...new Set(maps.flatMap(M => M.sheets))].filter(s => !fs.existsSync(path.join(GAME, 'art/pro/tiles', s + '.png')));
  if (miss.length) return 'thiếu art/pro/tiles/' + miss.slice(0, 5).join(',') + '.png';
  return '';
}
function staticChecks(D, synth) {
  const maps = Object.values(D.MAPS);
  const fileOk = (dir, name) => synth ? true : fs.existsSync(path.join(GAME, dir, name + '.png'));
  const badLink = [], back = [], badSpr = new Set(), badSheet = new Set(), badRef = [], badScript = [];
  const walkable = (T, x, y) => x >= 0 && y >= 0 && x < T.w && y < T.h && T.colliders[y * T.w + x] === 0;
  for (const M of maps) {
    for (const L of M.links) {
      const T = D.MAPS[L.to];
      if (!T) { badLink.push(M.id + '->' + L.to); continue; }
      if (!walkable(T, L.tx, L.ty)) badLink.push(M.id + '->' + L.to + '@' + L.tx + ',' + L.ty);
      if (L.kind === 'door' && !T.links.some(K => K.to === M.id)) back.push(M.id + '->' + L.to);
    }
    for (const a of M.npcs) {
      if (a.sprite && !fileOk('art/pro/npc', a.sprite)) badSpr.add(a.sprite);
      if (a.script && !D.SCRIPTS[a.script]) badScript.push(M.id + ':' + a.id);
    }
    for (const s of M.sheets) if (!fileOk('art/pro/tiles', s)) badSheet.add(s);
    const sheets = new Set(M.sheets);
    for (const L of M.ground.concat(M.over)) for (const t of L) if (t >= 0 && !sheets.has(Math.floor(t / 1024))) { badRef.push(M.id + ':' + t); break; }
  }
  const tag = synth ? ' [tổng hợp]' : '';
  check('mọi cửa nối trỏ tới map có thật, tới ô đi được' + tag, !badLink.length, badLink.slice(0, 5).join(', ') || maps.reduce((s, M) => s + M.links.length, 0) + ' cửa');
  check('mọi cửa có đường về' + tag, !back.length, back.join(', '));
  check('mọi sprite NPC có ảnh art/pro/npc' + tag, !badSpr.size, [...badSpr].join(', '));
  check('mọi tấm trong M.sheets có ảnh art/pro/tiles' + tag, !badSheet.size, [...badSheet].join(', '));
  check('mọi ô ground/over thuộc tấm đã khai trong M.sheets' + tag, !badRef.length, badRef.slice(0, 5).join(', '));
  check('mọi kịch bản actor có trong P1.SCRIPTS' + tag, !badScript.length, badScript.slice(0, 5).join(', '));
}

/* ---------------------------------------------------------------- trang */
const STUBS = synthJson => `
(() => {
  window.__log = []; window.__battles = [];
  const synth = ${synthJson || 'null'};
  window.addEventListener('DOMContentLoaded', () => {
    const P1 = window.P1;
    if (synth) { P1.MAPS = synth.MAPS; P1.SCRIPTS = Object.assign({}, P1.SCRIPTS || {}, synth.SCRIPTS); P1.QUESTS = P1.QUESTS || {}; }
    const oldShell = P1.ui && P1.ui.hud && /P1\\.ngui/.test(String(P1.ui.hud)) && !P1.ngui;
    if (!P1.ui || !P1.dialog || oldShell) {
      window.__uiStub = true;
      P1.dialog = {
        say(t) { window.__log.push(String(t)); return new Promise(r => setTimeout(r, 30)); },
        choose(t, o) { window.__log.push(t + ' ' + o.join('|')); return new Promise(r => setTimeout(() => r(0), 30)); },
      };
      P1.ui = { hud: () => ({ refresh() {}, destroy() {}, view: null }), isOpen: () => false, refresh() {}, toast() {},
        heal: async () => { for (const m of P1.state.party) P1.mon.heal(m); }, shop: async () => {}, open: async () => {}, evolve: async () => {} };
    } else {
      const d = P1.dialog, s = d.say.bind(d), c = d.choose.bind(d);
      d.say = (t, o) => { window.__dlg = { kind: 'say', text: String(t) }; window.__log.push(String(t)); return s(t, o).finally(() => { window.__dlg = null; }); };
      d.choose = (t, o) => { window.__dlg = { kind: 'choose', text: t }; window.__log.push(t); return c(t, o).finally(() => { window.__dlg = null; }); };
    }
    // Cảnh trận giả: ghi tham số, chờ bài kiểm gọi onEnd.
    P1.scene.add('battle', {
      enter(a) { window.__battle = a; window.__battles.push({ kind: a.kind, name: a.name || '', bg: a.bg, foe: a.foe.map(m => m.dex + ':' + m.level) }); },
      render() { const v = P1.view(); v.ctx.fillStyle = '#223'; v.ctx.fillRect(0, 0, v.w, v.h); },
    });
  });
})();`;

async function openPage(browser, W, H, touch, synth) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !!touch, isMobile: !!touch });
  const page = await ctx.newPage();
  const errors = [], warns = [];
  const ours = s => /\/js\/world[\w-]*\.js/.test(s || '');
  page.on('pageerror', e => (ours(e.stack) ? errors : warns).push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') (ours(m.location().url) || ours(m.text()) ? errors : warns).push('console: ' + m.text().slice(0, 160)); });
  page.on('response', r => { if (r.status() >= 400) (/\/art\/pro\/(tiles|npc|poke\/follow|poke\/front)|\/js\/world/.test(r.url()) ? errors : warns).push('HTTP ' + r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
  await page.addInitScript(STUBS(synth ? JSON.stringify(synth) : ''));
  if (synth) {
    // Ảnh lấy từ bản bóc PRO ngoài repo (chỉ khi chạy tổng hợp).
    const file = u => {
      let m = /art\/pro\/tiles\/(\d+)\.png/.exec(u);
      if (m) return path.join(DUMP, 'tiles__' + m[1] + '.png');
      if (/art\/pro\/npc\//.test(u)) return path.join(DUMP, 'npc__sprite1.png');
      if (/art\/pro\/poke\/follow\//.test(u)) return path.join(DUMP, 'follow__25.png');
      if (/art\/pro\/poke\/front\//.test(u)) return path.join(DUMP, 'pbig__25.png');
      return null;
    };
    await page.route(/\/art\/pro\/(tiles|npc|poke)\//, route => {
      const f = file(route.request().url());
      if (f && fs.existsSync(f)) route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(f) });
      else route.fulfill({ status: 404 });
    });
  }
  return { ctx, page, errors, warns };
}

const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function helpers(page) {
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async name => {
    const f = path.join(SHOTS, name + '.png');
    await page.screenshot({ path: f });
    shots.push(f);
    return f;
  };
  const st = () => ev(() => {
    const w = P1.world, p = w.player;
    return { scene: P1.scene.name, mode: w.mode, map: w.map && w.map.id, x: p && p.x, y: p && p.y, face: p && p.face, moving: !!(p && p.move) };
  });
  // anyMode: map có kịch bản vào map (lab Oak, phòng ngủ) dừng ở 'script' chờ hộp thoại thật; chụp ảnh thì không cần chờ.
  const open = async (q, anyMode) => {
    await page.goto(base + '/games/pokeone/index.html?fresh=1&nosave=1&' + q);
    await page.waitForFunction(any => window.P1 && P1.world && (any ? P1.world.mode === 'explore' || P1.world.mode === 'script' : P1.world.mode === 'explore') && P1.world.player && P1.world.player.sheet, anyMode, { timeout: 60000 });
    await ev(() => { P1.world.debug.noEncounter = true; });
    await page.waitForTimeout(300);
  };
  // Trận giả và hộp thoại: chạy qua cho tới khi về 'explore'.
  const settle = async (maxMs = 30000) => {
    const t0 = Date.now();
    let quiet = 0;
    while (Date.now() - t0 < maxMs) {
      const s = await st();
      if (s.scene === 'battle') { await ev(() => { const a = window.__battle; window.__battle = null; if (a) a.onEnd({ outcome: 'win' }); }); quiet = 0; }
      else if (await ev(() => !!window.__dlg)) { await page.keyboard.press('Space'); quiet = 0; }
      else if (s.mode === 'explore' && !s.moving) { if (++quiet >= 3) return s; }
      else quiet = 0;
      await page.waitForTimeout(120);
    }
    throw new Error('settle timeout: ' + JSON.stringify(await st()));
  };
  const step = async dir => {
    const s0 = await st();
    await page.keyboard.down(KEY[dir]);
    let s = s0;
    for (const t0 = Date.now(); Date.now() - t0 < 1500;) {
      s = await st();
      if (s.map !== s0.map || s.x !== s0.x || s.y !== s0.y || s.mode !== 'explore') break;
      await page.waitForTimeout(15);
    }
    await page.keyboard.up(KEY[dir]);
    for (let i = 0; i < 100; i++) { s = await st(); if (!s.moving) break; await page.waitForTimeout(25); }
    return s;
  };
  // Đường ngắn nhất theo ô trống (không qua gờ, NPC, cửa), tới (tx,ty).
  const plan = (tx, ty) => ev(([tx, ty]) => {
    const w = P1.world, M = w.map, p = w.player;
    const ok = (x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && M.colliders[y * M.w + x] === 0 && !w.actorAt(x, y) &&
      !M.links.some(L => L.x === x && L.y === y);
    const key = (x, y) => x + ',' + y, prev = { [key(p.x, p.y)]: null }, q = [[p.x, p.y]];
    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) { const o = []; let k = key(x, y); while (prev[k]) { o.unshift(prev[k][1]); k = prev[k][0]; } return o; }
      for (const d in D) {
        const nx = x + D[d][0], ny = y + D[d][1];
        if (prev[key(nx, ny)] !== undefined || !ok(nx, ny)) continue;
        prev[key(nx, ny)] = [key(x, y), d];
        q.push([nx, ny]);
      }
    }
    return null;
  }, [tx, ty]);
  const walkTo = async (tx, ty) => {
    const map0 = (await st()).map;
    for (let guard = 0; guard < 300; guard++) {
      const s = await st();
      if (s.map !== map0) return s;
      if (s.mode !== 'explore' || s.scene !== 'world') { await settle(); continue; }
      if (s.x === tx && s.y === ty) return s;
      const p = await plan(tx, ty);
      if (!p || !p.length) throw new Error('no path to ' + tx + ',' + ty + ' from ' + JSON.stringify(s));
      await step(p[0]);
    }
    throw new Error('walkTo gave up');
  };
  const waitMap = (id, ms = 20000) => page.waitForFunction(id => P1.world.map && P1.world.map.id === id && P1.world.mode === 'explore' && P1.world.player, id, { timeout: ms });
  /* Cửa nối trên map hiện tại tới `to`: ô đứng trước cửa và hướng bước vào. */
  const doorApproach = to => ev(to => {
    const w = P1.world, M = w.map;
    const L = M.links.find(L => L.to === to && L.kind === 'door') || M.links.find(L => L.to === to);
    if (!L) return null;
    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (const d in D) {
      const x = L.x - D[d][0], y = L.y - D[d][1];
      if (x >= 0 && y >= 0 && x < M.w && y < M.h && M.colliders[y * M.w + x] === 0 && !w.actorAt(x, y)) return { x, y, dir: d, link: L };
    }
    return null;
  }, to);
  let base = '';
  return { ev, shot, st, open, settle, step, plan, walkTo, waitMap, doorApproach, setBase: b => { base = b; } };
}

/* Ô trống, không NPC, không cửa. */
const freeCellFn = `(M, w, x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && M.colliders[y * M.w + x] === 0 && !w.actorAt(x, y) && !M.links.some(L => L.x === x && L.y === y)`;

async function play(browser, base, synth) {
  out.push('\n[chơi 1366x768' + (synth ? ', bản đồ tổng hợp' : '') + ']');
  const { ctx, page, errors, warns } = await openPage(browser, 1366, 768, false, synth);
  const h = helpers(page);
  h.setBase(base);
  const { ev, shot, st, open, settle, step, walkTo, waitMap, doorApproach } = h;

  await open('map=pallet_town');
  let s = await st();
  check('?map=pallet_town vào thế giới, mode explore', s.scene === 'world' && s.map === 'pallet_town' && s.mode === 'explore', s);
  const px = await ev(() => { const v = P1.view(), d = v.ctx.getImageData(v.canvas.width >> 1, (v.canvas.height >> 1) + 20, 1, 1).data; return [d[0], d[1], d[2]]; });
  check('canvas có vẽ (giữa màn không đen)', px[0] + px[1] + px[2] > 30, px);
  const zoom = await ev(() => P1.world.cam && P1.world.cam.z);
  check('phóng nguyên lần: 1366 px → zoom 2 (~21 ô ngang)', zoom === 2, zoom);
  if (await ev(() => window.__uiStub)) note('menus.js chưa dùng được (thiếu hoặc còn dựa P1.ngui): bài kiểm cài P1.ui/P1.dialog tối thiểu');

  const turnDir = await ev(() => ['up', 'left', 'right', 'down'].find(d => d !== ['up', 'left', 'down', 'right'][P1.world.player.face]));
  const p0 = [s.x, s.y];
  await page.keyboard.down(KEY[turnDir]); await page.waitForTimeout(40); await page.keyboard.up(KEY[turnDir]); await page.waitForTimeout(200);
  s = await st();
  check('chạm nhẹ chỉ quay mặt, không đi', s.face === ['up', 'left', 'down', 'right'].indexOf(turnDir) && s.x === p0[0] && s.y === p0[1], s);

  const dirFree = await ev(`(() => { const f = ${freeCellFn}; const w = P1.world, M = w.map, p = w.player, D = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
    return ['up','down','left','right'].find(d => f(M, w, p.x + D[d][0], p.y + D[d][1])); })()`);
  const t0 = Date.now();
  s = await step(dirFree);
  const tStep = Date.now() - t0;
  check('giữ phím → đi đúng một ô theo hướng', s.x === p0[0] + DIRS[dirFree][0] && s.y === p0[1] + DIRS[dirFree][1], { dir: dirFree, from: p0, to: [s.x, s.y], ms: tStep });

  // Vào nhà qua cửa rồi ra.
  const d1 = await doorApproach(await ev(() => (P1.world.map.links.find(L => L.kind === 'door') || {}).to));
  check('Pallet có cửa nhà', !!d1, d1);
  if (d1) {
    const house = d1.link.to;
    await walkTo(d1.x, d1.y);
    await step(d1.dir);
    await waitMap(house);
    await page.waitForTimeout(400);
    s = await st();
    check('bước vào cửa → màn đen → trong nhà (' + house + ')', s.map === house, s);
    await shot('play-house');
    const d2 = await doorApproach('pallet_town');
    check('trong nhà có cửa ra Pallet', !!d2, d2);
    if (d2) {
      await walkTo(d2.x, d2.y);
      await step(d2.dir);
      await waitMap('pallet_town');
      s = await st();
      check('ra khỏi nhà → về Pallet trước cửa', s.map === 'pallet_town' && s.x === d2.link.tx && s.y === d2.link.ty, s);
    }
  }

  // Gặp Pokémon hoang dã trên route_1: đứng cạnh ô cỏ rồi bước vào với tỉ lệ gặp = 1.
  const g = await ev(`(() => { const f = ${freeCellFn}; const w = P1.world;
    const M = P1.MAPS.route_1, D = {up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
    for (let i = 0; i < M.w * M.h; i++) { if (!M.zones.grid[i]) continue; const x = i % M.w, y = (i / M.w) | 0;
      for (const d in D) { const ax = x - D[d][0], ay = y - D[d][1]; if (ax >= 0 && ay >= 0 && ax < M.w && ay < M.h && M.colliders[ay * M.w + ax] === 0 && !M.zones.grid[ay * M.w + ax] && !M.npcs.some(n => n.x === ax && n.y === ay) && !M.npcs.some(n => n.x === x && n.y === y)) return { x: ax, y: ay, dir: d, gx: x, gy: y }; } }
    return null; })()`);
  check('route_1 có ô cỏ gặp Pokémon', !!g, g);
  if (g) {
    await open('map=route_1&x=' + g.x + '&z=' + g.y);
    const gfx0 = await ev(() => { P1.world.gfx.__mark = 1; P1.world.debug.noEncounter = false; P1.world.debug.encounterRate = 1; return true; });
    await step(g.dir);
    await page.waitForFunction(() => P1.scene.name === 'battle', null, { timeout: 8000 }).catch(() => {});
    const b = await ev(() => ({ scene: P1.scene.name, last: window.__battles[window.__battles.length - 1] }));
    check('bước vào cỏ, tỉ lệ 1 → P1.scene.go("battle", kind wild, bg theo settings.bg)', b.scene === 'battle' && b.last && b.last.kind === 'wild' &&
      b.last.bg === (await ev(() => P1.MAPS.route_1.settings.bg)), b);
    await ev(() => { P1.world.debug.encounterRate = null; P1.world.debug.noEncounter = true; const a = window.__battle; window.__battle = null; a.onEnd({ outcome: 'win' }); });
    await page.waitForFunction(() => P1.scene.name === 'world' && P1.world.mode === 'explore', null, { timeout: 8000 }).catch(() => {});
    s = await st();
    const kept = await ev(() => !!(P1.world.gfx && P1.world.gfx.__mark));
    check('onEnd → về lại world đúng ô, không tải lại map', gfx0 && kept && s.map === 'route_1' && s.x === g.gx && s.y === g.gy && s.mode === 'explore', { kept, s });
    await page.waitForTimeout(150);
    await shot('play-tallgrass');
  }

  // Trainer nhìn thấy: đứng ngay ngoài tầm nhìn rồi bước vào.
  const tr = await ev(`(() => { const f = ${freeCellFn}; const M = P1.MAPS.route_1, D = [[0,-1],[-1,0],[0,1],[1,0]], F = {up:0,left:1,down:2,right:3};
    const ok = (x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && M.colliders[y * M.w + x] === 0 && !M.npcs.some(n => n.x === x && n.y === y) && !M.zones.grid[y * M.w + x];
    const list = M.npcs.filter(n => n.trainer && n.los).sort((a, b) => (b.id === 'joey') - (a.id === 'joey'));
    for (const n of list) { const fd = F[n.face] != null ? F[n.face] : 2, [dx, dy] = D[fd];
      for (let k = 2; k <= n.los; k++) { const x = n.x + dx * k, y = n.y + dy * k; if (!ok(x, y)) break;
        for (const side of [[dy, dx], [-dy, -dx]]) { const ax = x + side[0], ay = y + side[1];
          if (ok(ax, ay)) return { id: n.id, x: ax, y: ay, dir: side[0] > 0 ? 'left' : side[0] < 0 ? 'right' : side[1] > 0 ? 'up' : 'down', k }; } } }
    return null; })()`);
  check('route_1 có trainer có tầm nhìn', !!tr, tr);
  if (tr) {
    await open('map=route_1&x=' + tr.x + '&z=' + tr.y);
    await page.keyboard.down(KEY[tr.dir]);
    const seen = await page.waitForFunction(() => P1.world.mode === 'script' && P1.world.emotes.length > 0, null, { timeout: 5000 }).then(() => true, () => false);
    await page.keyboard.up(KEY[tr.dir]);
    await page.waitForTimeout(260);
    await shot('play-trainer-spotted');
    check('bước vào tầm nhìn ' + tr.id + ' → mode script + bong bóng "!"', seen, await ev(() => ({ mode: P1.world.mode, emotes: P1.world.emotes.length })));
    await settle();
    const bt = await ev(() => window.__battles[window.__battles.length - 1]);
    check('trainer đi tới rồi vào trận trainer, thắng thì đặt cờ beat_', bt && bt.kind === 'trainer' && await ev(id => !!P1.state.flags['beat_' + id], tr.id), bt);
  }

  // Nhảy gờ: tìm gờ có ô đứng trước và ô đáp trống.
  const lg = await ev(`(() => { const M = P1.MAPS.route_1, dirs = {2:[0,1,'down'],3:[-1,0,'left'],4:[1,0,'right'],5:[0,-1,'up']};
    const ok = (x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && M.colliders[y * M.w + x] === 0 && !M.npcs.some(n => n.x === x && n.y === y) && !M.zones.grid[y * M.w + x];
    for (let i = 0; i < M.w * M.h; i++) { const c = M.colliders[i], d = dirs[c]; if (!d) continue; const x = i % M.w, y = (i / M.w) | 0;
      if (ok(x - d[0], y - d[1]) && ok(x + d[0], y + d[1])) return { x: x - d[0], y: y - d[1], dir: d[2], to: [x + d[0], y + d[1]] }; }
    return null; })()`);
  check('route_1 có gờ nhảy', !!lg, lg);
  if (lg) {
    await open('map=route_1&x=' + lg.x + '&z=' + lg.y);
    await page.keyboard.down(KEY[lg.dir]);
    await page.waitForFunction(() => P1.world.player.move && P1.world.player.move.jump, null, { timeout: 3000 }).catch(() => {});
    await page.keyboard.up(KEY[lg.dir]);
    await page.waitForTimeout(260);
    await shot('play-ledge-midair');
    await page.waitForFunction(() => !P1.world.player.move, null, { timeout: 3000 }).catch(() => {});
    s = await st();
    check('nhảy gờ: 2 ô một lần theo hướng gờ', s.x === lg.to[0] && s.y === lg.to[1], { from: [lg.x, lg.y], to: [s.x, s.y] });
    const back = { down: 'up', up: 'down', left: 'right', right: 'left' }[lg.dir];
    s = await step(back);
    check('gờ chặn chiều ngược lại', s.x === lg.to[0] && s.y === lg.to[1], s);
  }

  // Sổ nhiệm vụ (phím L) bằng khung atlas PRO.
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(200);
  const q = await ev(() => { const p = document.querySelector('.p1w-quest'); return p ? { img: getComputedStyle(p).borderImageSource.slice(0, 20), text: p.innerText.slice(0, 60) } : null; });
  await shot('play-quest-log');
  check('phím L mở sổ nhiệm vụ khung PRO', !!q && /url\(/.test(q.img) && /Nhiệm vụ/.test(q.text), q);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  check('B đóng sổ nhiệm vụ', await ev(() => !P1.worldUi.quests.isOpen()));

  if (!synth) {
    // Save của bản 3D cũ: toạ độ ngoài lưới mới -> đứng ở ô trống ngay cạnh cửa vào.
    await open('map=viridian_mart&x=40&z=40');
    const fb = await ev(() => { const w = P1.world, M = w.map, p = w.player, L = M.links.find(l => l.kind === 'door');
      return { x: p.x, y: p.y, free: M.colliders[p.y * M.w + p.x] === 0, door: [L.x, L.y] }; });
    check('save cũ ngoài map (40,40) -> ô trống cạnh cửa', fb.free && Math.abs(fb.x - fb.door[0]) + Math.abs(fb.y - fb.door[1]) <= 2, fb);
  }

  check('không lỗi từ js/world*.js, không thiếu ảnh tile/sprite', errors.length === 0, errors.slice(0, 5).join(' | '));
  if (warns.length) note('lỗi ngoài phạm vi world (luồng khác): ' + [...new Set(warns)].slice(0, 6).join(' | '));
  await ctx.close();
}

async function mapShots(browser, base, synth) {
  out.push('\n[ảnh từng map]');
  const { ctx, page, errors } = await openPage(browser, 1366, 768, false, synth);
  const h = helpers(page);
  h.setBase(base);
  const ids = await (async () => { await h.open('map=pallet_town'); return h.ev(() => Object.keys(P1.MAPS)); })();
  for (const id of ids) {
    await h.open('map=' + id, true);
    const info = await h.ev(() => ({ n: P1.world.actors.length, cam: P1.world.cam }));
    const f = await h.shot('map-' + id);
    check(id + ': vẽ ra (' + info.n + ' actor, cam ' + Math.round(info.cam.x) + ',' + Math.round(info.cam.y) + ')', fs.statSync(f).size > 5000, path.basename(f));
  }
  // Thân actor thật sự lên canvas: điểm ảnh giữa thân khác điểm ảnh nền ground cùng chỗ.
  await h.open('map=pallet_town&period=day&x=15&z=14');
  const drawn = await h.ev(() => {
    const w = P1.world, cam = w.cam, v = P1.view(), g = w.gfx.ground.getContext('2d');
    // Lấy vài điểm dọc giữa thân: một điểm có thể trùng màu nền (tóc, áo cùng tông cỏ).
    const at = a => [-10, -2, 6, 14].some(dy => {
      const mx = a.x * 32 + 16, my = a.y * 32 + dy;
      const s = v.ctx.getImageData(Math.round((mx - cam.x) * cam.z), Math.round((my - cam.y) * cam.z), 1, 1).data;
      const b = g.getImageData(mx, Math.max(0, my), 1, 1).data;
      return Math.abs(s[0] - b[0]) + Math.abs(s[1] - b[1]) + Math.abs(s[2] - b[2]) > 40;
    });
    const npc = w.actors.find(a => a.kind === 'npc' && !a.hidden);
    return { player: at(w.player), follower: !!w.follower && !w.follower.hidden && at(w.follower), npc: !!npc && at(npc) };
  });
  check('người chơi, Pokémon đi theo, NPC đều vẽ thân lên canvas', drawn.player && drawn.follower && drawn.npc, drawn);
  // Mái/tán cây che người: đặt người chơi ở ô trống có lớp over ngay trên đầu.
  const roof = await h.ev(() => {
    const M = P1.MAPS.pallet_town;
    for (let i = 0; i < M.w * M.h; i++) {
      const x = i % M.w, y = (i / M.w) | 0;
      if (M.colliders[i] || M.npcs.some(n => n.x === x && n.y === y)) continue;
      if (M.over.some(L => L[i] >= 0) && y > 0 && M.over.some(L => L[i - M.w] >= 0)) return [x, y];
    }
    return null;
  });
  if (roof) {
    await h.open('map=pallet_town&x=' + roof[0] + '&z=' + roof[1]);
    await h.shot('map-pallet_town-behind-over');
    check('người chơi đứng sau lớp over (mái/tán) tại ' + roof, true);
  } else note('pallet_town không có ô trống nằm dưới lớp over để chụp');
  await h.open('map=pallet_town&grid=1');
  await h.shot('map-pallet_town-grid');
  await h.open('map=pallet_town&period=night');
  const night = await h.ev(() => { const v = P1.view(), d = v.ctx.getImageData(40, 40, 1, 1).data; return [d[0], d[1], d[2]]; });
  await h.shot('map-pallet_town-night');
  check('ban đêm ngoài trời: màu nhân lam', night[2] > night[0], night);
  check('không lỗi từ js/world*.js khi chụp map', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

async function phone(browser, base, synth) {
  out.push('\n[844x390 cảm ứng]');
  const { ctx, page, errors } = await openPage(browser, 844, 390, true, synth);
  const h = helpers(page);
  h.setBase(base);
  await h.open('map=pallet_town&touch=1');
  const pad = await h.ev(() => {
    const d = document.querySelector('.p1w-dpad'), a = document.querySelector('.p1w-btn[data-action="a"]');
    if (!d || !a) return null;
    const r = d.getBoundingClientRect(), b = a.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 22);
    return { up: [r.left + r.width / 2, r.top + 22], hit: hit && !!d.contains(hit) ? 'dpad' : hit && (hit.className || hit.tagName), a: b.toJSON(), chatFree: b.right <= innerWidth - 440 || b.bottom <= innerHeight - 280, z: P1.world.cam.z };
  });
  await h.shot('phone-pallet_town');
  check('d-pad + A hiện, A nằm ngoài vùng khung chat 440×280', pad && pad.chatFree, pad);
  check('điện thoại: zoom 2 (~13 ô ngang)', pad && pad.z === 2, pad && pad.z);
  const s0 = await h.st();
  const free = await h.ev(`(() => { const f = ${freeCellFn}; const w = P1.world; return f(w.map, w, w.player.x, w.player.y - 1); })()`);
  if (free) {
    await page.mouse.move(...pad.up); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up(); await page.waitForTimeout(400);
    const s = await h.st();
    check('giữ d-pad lên → đi lên', s.y < s0.y, { from: [s0.x, s0.y], to: [s.x, s.y] });
  }
  check('không lỗi từ js/world*.js trên điện thoại', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

module.exports = { synthMaps, openPage, helpers, serve };
if (require.main === module) (async () => {
  out.push('[dữ liệu]');
  const real = loadData(['maps.js']);
  const why = process.env.SYNTH === '1' ? 'SYNTH=1' : realReady(real);
  const r = cp.spawnSync(process.execPath, [path.join(GAME, 'tools/build_maps.js'), '--check'], { encoding: 'utf8' });
  const bmDetail = ((r.stderr || '') + (r.stdout || '')).trim().split('\n').slice(-2).join(' | ');
  let synth = null;
  if (why) {
    note('bỏ kiểm dữ liệu thật: ' + why + '; build_maps --check thoát ' + r.status + ' (' + bmDetail.slice(0, 160) + ')');
    note('phần chơi chạy trên bản đồ tổng hợp, ảnh từ ' + DUMP);
    synth = synthMaps();
    staticChecks(synth, true);
  } else {
    check('tools/build_maps.js --check thoát 0', r.status === 0, bmDetail);
    staticChecks(real, false);
  }
  const srv = await serve();
  const base = process.env.BASE || 'http://127.0.0.1:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await play(browser, base, synth).catch(e => check('phần chơi chạy hết', false, e.message));
    await mapShots(browser, base, synth).catch(e => check('ảnh từng map', false, e.message));
    await phone(browser, base, synth).catch(e => check('844x390 cảm ứng', false, e.message));
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('\n' + out.join('\n'));
  console.log('\nẢnh:\n' + shots.map(f => '  ' + f).join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt.');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
