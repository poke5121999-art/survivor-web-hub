/*
 * POKÉONE — bản đồ và cốt truyện mở đầu (js/world*.js, data/maps.js, data/world.js).
 *
 * Chạy:  node test/pokeone-world.js            (thêm --quick để bỏ phần 844x390)
 * Kiểm tĩnh: mọi prefab trong P1.MAPS có trong P1.PROPS và có glb, mọi cửa nối trỏ tới map/ô có thật,
 *   mọi sprite NPC có ảnh, mọi kịch bản có thật, tools/build_maps.js --check sạch.
 * Chơi thật bằng phím (page.keyboard): màn đầu → New Game → phòng ngủ → xuống nhà → lab Oak → chọn khởi đầu →
 *   trận với Gary → Route 1 (cửa nối cạnh) → nhảy gờ → gặp Pokémon hoang dã trong cỏ → Joey nhìn thấy → Viridian →
 *   hồi máu ở Trung tâm → mua ở Mart → trường huấn luyện → ông già. Rồi 844x390 bằng d-pad cảm ứng (chuột giữ + chạm).
 * Ảnh chụp từng map từ máy ảnh chơi: SHOTS (mặc định %TEMP%/pokeone-world-shots).
 * Trận đánh là trận thật (js/battle.js) bấm Space/1. Trước Joey, Pokémon đầu đội được nâng lên cấp 100 để trận ngắn
 * và không lên cấp/tiến hoá giữa chừng (ghi rõ trong kết quả).
 */
'use strict';
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const PW = process.env.PLAYWRIGHT_PATH ||
  'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games/pokeone');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'pokeone-world-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.ttf': 'font/ttf', '.css': 'text/css',
  '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.json': 'application/json' };

let pass = 0, fail = 0;
const out = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  out.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
  console.log(out[out.length - 1]);
}
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

/* ---------------------------------------------------------------- kiểm tĩnh */
function loadData(files) {
  const P1 = {};
  for (const f of files) new Function('window', 'P1', fs.readFileSync(path.join(GAME, 'data', f), 'utf8'))({ P1 }, P1);
  return P1;
}
function staticChecks() {
  out.push('\n[dữ liệu]');
  const r = cp.spawnSync(process.execPath, [path.join(GAME, 'tools/build_maps.js'), '--check'], { encoding: 'utf8' });
  check('tools/build_maps.js --check sạch', r.status === 0, (r.stderr || '').trim().split('\n').slice(0, 3).join(' | ') || r.stdout.trim().split('\n').length + ' map');
  const D = loadData(['props.js', 'maps.js', 'sprites.js', 'world.js']);
  const maps = Object.values(D.MAPS);
  check('10 map', maps.length === 10, Object.keys(D.MAPS).join(', '));
  const badProp = [], badGlb = new Set();
  for (const M of maps) for (const o of M.objects) {
    if (!D.PROPS[o.prefab]) badProp.push(M.id + ':' + o.prefab);
    else if (!fs.existsSync(path.join(GAME, D.PROPS[o.prefab].glb))) badGlb.add(o.prefab);
  }
  check('mọi prefab trong data/maps.js có trong P1.PROPS', badProp.length === 0, badProp.slice(0, 5).join(', ') || maps.reduce((s, M) => s + M.objects.length, 0) + ' vật');
  check('mọi prefab có glb trên đĩa', badGlb.size === 0, [...badGlb].join(', '));
  const badLink = [];
  for (const M of maps) for (const L of M.links) {
    const T = D.MAPS[L.to];
    if (!T) { badLink.push(M.id + '->' + L.to); continue; }
    if (L.tx < 0 || L.ty < 0 || L.tx >= T.w || L.ty >= T.h || T.colliders[L.ty * T.w + L.tx] === 1) badLink.push(M.id + '->' + L.to + '@' + L.tx + ',' + L.ty);
  }
  check('mọi cửa nối trỏ tới map có thật, tới ô đi được', badLink.length === 0, badLink.slice(0, 5).join(', ') || maps.reduce((s, M) => s + M.links.length, 0) + ' cửa');
  const back = [];
  for (const M of maps) for (const L of M.links) if (L.kind === 'door' && !D.MAPS[L.to].links.some(K => K.to === M.id)) back.push(M.id + '->' + L.to);
  check('mọi cửa có đường về', back.length === 0, back.join(', '));
  const badSpr = [];
  for (const M of maps) for (const a of M.npcs) if (a.sprite && !fs.existsSync(path.join(GAME, 'art/sprite/npc', a.sprite + '.png'))) badSpr.push(a.id);
  check('mọi sprite NPC có ảnh', badSpr.length === 0, badSpr.join(', '));
  const badScript = [];
  for (const M of maps) for (const a of M.npcs) if (a.script && !D.SCRIPTS[a.script]) badScript.push(a.id);
  check('mọi kịch bản NPC có thật', badScript.length === 0, badScript.join(', '));
  const songs = maps.map(M => M.settings.song);
  check('nhạc theo Settings.Song gốc', ['pallet_town', 'route_1', 'viridian_city', 'pokemon_center', 'pokemart', 'oak'].every(s => songs.includes(s)), [...new Set(songs)].join(', '));
  check('P1.WORLD có MoveSpeed và máy ảnh gốc', D.WORLD.character.moveSpeed.value === 3.25 && D.WORLD.camera.fov === 30,
    'MoveSpeed ' + D.WORLD.character.moveSpeed.value + ', fov ' + D.WORLD.camera.fov + ', offset ' + D.WORLD.camera.follow.three.offset);
  return D;
}

/* ---------------------------------------------------------------- phiên chơi */
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

async function openPage(browser, base, W, H, touch) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: !!touch, isMobile: !!touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  return { ctx, page, errors };
}

function helpers(page, tag) {
  const ev = (f, a) => page.evaluate(f, a);
  let shotN = 0;
  const shot = async name => {
    await page.waitForTimeout(250);
    const f = path.join(SHOTS, tag + '-' + String(++shotN).padStart(2, '0') + '-' + name + '.png');
    await page.screenshot({ path: f });
    return f;
  };
  const st = () => ev(() => {
    const w = P1.world, p = w.player;
    return { scene: P1.scene.name, mode: w.mode, map: w.map && w.map.id, x: p && p.x, y: p && p.y, face: p && p.face, moving: !!(p && p.move),
      ui: !!(P1.ui && P1.ui.isOpen && P1.ui.isOpen()), dlg: window.__dlg || null, bmode: P1.scene.name === 'battle' ? P1.scene.current.mode : '' };
  });
  const instrument = () => ev(() => {
    if (window.__wrapped) return;
    window.__wrapped = true;
    window.__log = [];
    window.__battles = [];
    const d = P1.dialog, s = d.say.bind(d), c = d.choose.bind(d);
    d.say = (t, o) => { window.__dlg = { kind: 'say', text: String(t) }; window.__log.push(String(t)); return s(t, o).finally(() => { window.__dlg = null; }); };
    d.choose = (t, opts) => { window.__dlg = { kind: 'choose', text: t, options: opts }; window.__log.push(t + ' ' + opts.join('|')); return c(t, opts).finally(() => { window.__dlg = null; }); };
    const go = P1.scene.go.bind(P1.scene);
    P1.scene.go = (name, args) => {
      if (name === 'battle') {
        const rec = { kind: args.kind, name: args.name || '', foe: args.foe.map(m => m.dex + ':' + m.level), music: args.music || '', outcome: '' };
        window.__battles.push(rec);
        const end = args.onEnd;
        args = Object.assign({}, args, { onEnd: r => { rec.outcome = r && r.outcome; end(r); } });
      }
      return go(name, args);
    };
  });
  const answers = [];
  // Chạy qua hộp thoại, lựa chọn và trận đánh cho tới khi về lại 'explore'.
  const settle = async (maxMs = 240000) => {
    const t0 = Date.now();
    let quiet = 0;
    while (Date.now() - t0 < maxMs) {
      const s = await st();
      if (s.scene === 'battle') {
        if (s.bmode === 'learn') await page.keyboard.press('Backspace');
        else { await page.keyboard.press('Space'); await page.waitForTimeout(120); await page.keyboard.press('Digit1'); }
        await page.waitForTimeout(450);
        quiet = 0;
        continue;
      }
      if (s.dlg) {
        await page.waitForTimeout(180);
        if (s.dlg.kind === 'choose') await page.keyboard.press('Digit' + (answers.length ? answers.shift() : 1));
        else { await page.keyboard.press('Space'); await page.waitForTimeout(60); await page.keyboard.press('Space'); }
        quiet = 0;
        continue;
      }
      if (s.mode === 'explore' && !s.ui) { if (++quiet >= 3) return s; }
      else quiet = 0;
      await page.waitForTimeout(150);
    }
    throw new Error('settle timeout: ' + JSON.stringify(await st()));
  };
  // Một bước bằng phím thật: giữ phím tới khi nhân vật rời ô (hoặc đổi map / bị chặn), rồi nhả.
  const step = async dir => {
    const s0 = await st();
    await page.keyboard.down(KEY[dir]);
    const t0 = Date.now();
    let s = s0;
    while (Date.now() - t0 < 1500) {
      s = await st();
      if (s.map !== s0.map || s.x !== s0.x || s.y !== s0.y || s.mode !== 'explore') break;
      await page.waitForTimeout(20);
    }
    await page.keyboard.up(KEY[dir]);
    for (let i = 0; i < 100; i++) { s = await st(); if (!s.moving) break; await page.waitForTimeout(25); }
    return s;
  };
  // Đường ngắn nhất theo ô đi được (không qua gờ, không qua NPC), đi từng bước; kịch bản chen ngang thì chạy qua rồi tính lại.
  const plan = (tx, ty) => ev(([tx, ty]) => {
    const w = P1.world, M = w.map, p = w.player;
    const ok = (x, y) => x >= 0 && y >= 0 && x < M.w && y < M.h && M.colliders[y * M.w + x] === 0 && !w.actorAt(x, y) &&
      M.heights[y * M.w + x] === M.heights[p.y * M.w + p.x] && !M.links.some(L => L.x === x && L.y === y && L.kind !== 'door' && L.kind !== 'edge' && !(x === tx && y === ty));
    const key = (x, y) => x + ',' + y, prev = { [key(p.x, p.y)]: null }, q = [[p.x, p.y]];
    const D = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) {
        const pathOut = [];
        let k = key(x, y);
        while (prev[k]) { pathOut.unshift(prev[k][1]); k = prev[k][0]; }
        return pathOut;
      }
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
    for (let guard = 0; guard < 200; guard++) {
      let s = await st();
      if (s.map !== map0) return s;
      if (s.mode !== 'explore' || s.ui || s.scene !== 'world') { await settle(); continue; }
      if (s.x === tx && s.y === ty) return s;
      const p = await plan(tx, ty);
      if (!p || !p.length) throw new Error('no path to ' + tx + ',' + ty + ' from ' + JSON.stringify(s));
      await step(p[0]);
    }
    throw new Error('walkTo gave up');
  };
  const face = async dir => {
    const want = { up: 0, left: 1, down: 2, right: 3 }[dir];
    if ((await st()).face === want) return;
    await page.keyboard.down(KEY[dir]); await page.waitForTimeout(40); await page.keyboard.up(KEY[dir]);
    await page.waitForTimeout(80);
  };
  const talk = async () => { await page.keyboard.press('Space'); await page.waitForTimeout(250); };
  const groups = [];
  const waitMap = async (id, ms = 20000) => {
    await page.waitForFunction(id => P1.world.map && P1.world.map.id === id && P1.world.mode !== 'warp' && P1.world.mode !== 'loading', id, { timeout: ms });
    await page.waitForTimeout(900);   // glb của map mới
    groups.push(await ev(() => P1.world.map.id + ':' + P1.world.scene.children.filter(c => /^map:/.test(c.name)).length));
  };
  const at = (view, p) => ev(([view, p]) => {
    const v = P1.ui.view(view);
    if (!v) return { err: 'view not open: ' + view };
    const n = v.find(p);
    if (!n || !n.el) return { err: 'node not found: ' + p };
    const b = n.el.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, own: hit === n.el || n.el.contains(hit), hit: hit ? (hit.dataset.name || hit.tagName) : null };
  }, [view, p]);
  const click = async (view, p) => {
    const r = await at(view, p);
    if (r.err) throw new Error(r.err);
    if (!r.own) throw new Error('"' + p + '" is covered by ' + r.hit);
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(120);
  };
  return { ev, shot, st, instrument, answers, settle, step, walkTo, face, talk, waitMap, click, plan, groups };
}

async function desktop(browser, base) {
  const tag = '1280x720';
  out.push('\n[' + tag + ' — phím thật]');
  const { ctx, page, errors } = await openPage(browser, base, 1280, 720, false);
  const h = helpers(page, tag);
  const { ev, shot, st, settle, step, walkTo, face, talk, waitMap } = h;

  await page.goto(base + '/games/pokeone/index.html?fresh=1');
  await page.waitForFunction(() => window.P1 && P1.scene && P1.scene.name === 'title', null, { timeout: 60000 });
  const r0 = await ev(() => { const v = P1.scene.current.view, n = v.find('Button - New Game'); const b = n.el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.click(r0.x, r0.y);
  await page.waitForFunction(() => P1.scene.name === 'creator', null, { timeout: 20000 });
  const centre = name => ev(name => { const n = P1.scene.current.view.find(name); const b = n.el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, name);
  const nameBox = await centre('Input - Name');
  await page.mouse.click(nameBox.x, nameBox.y);
  await page.keyboard.type('Red');
  const r1 = await centre('Button - Accept');
  await page.mouse.click(r1.x, r1.y);
  await page.waitForFunction(() => P1.scene.name === 'world' && P1.world.map, null, { timeout: 30000 });
  await h.instrument();
  await page.waitForTimeout(1200);
  let s = await st();
  check('New Game → thức dậy trong phòng (pallet_house_2f, mốc @p)', s.map === 'pallet_house_2f' && s.x === 7 && s.y === 4, s);
  check('nhạc map theo Settings.Song', await ev(() => P1.audio.musicKey()) === 'pallet_town');
  await page.waitForFunction(() => window.__dlg, null, { timeout: 8000 }).catch(() => {});
  await shot('bedroom-intro');
  check('kịch bản mở đầu chạy khi vào map (mẹ gọi dậy)', await ev(() => !!window.__dlg && /Wake up/.test(window.__dlg.text)));
  await settle();
  check('nhiệm vụ đầu: The Pokémon Prof.', await ev(() => P1.state.quest === 'the_pokemon_prof' && !!P1.state.flags.intro));
  check('mode = explore khi rảnh (menus.js mở Esc được)', await ev(() => P1.world.mode === 'explore'));

  const hold0 = await ev(() => [P1.world.player.x, P1.world.player.y]);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(40); await page.keyboard.up('ArrowLeft'); await page.waitForTimeout(150);
  s = await st();
  check('chạm nhẹ chỉ quay mặt, không đi', s.face === 1 && s.x === hold0[0] && s.y === hold0[1], s);
  const t0 = Date.now();
  await walkTo(7, 1);
  const t1 = Date.now();
  check('đi 3 ô theo ô, tốc độ ~MoveSpeed 3,25 ô/s', t1 - t0 > 700, (t1 - t0) + ' ms');

  await walkTo(8, 1);
  s = await st();
  if (s.map !== 'pallet_house_1f') await step('right');
  await waitMap('pallet_house_1f');
  s = await st();
  check('cầu thang: 2F -> 1F', s.map === 'pallet_house_1f', s);
  await shot('house-1f');
  await walkTo(6, 4);
  await face('up');
  await talk();
  await settle();
  check('nói chuyện với Mẹ (Space quay mặt NPC, chạy kịch bản)', await ev(() => window.__log.some(t => /Prof. Oak, next door/.test(t))));
  await walkTo(6, 7);
  await step('down');
  await waitMap('pallet_town');
  s = await st();
  check('ra khỏi nhà qua thảm cửa -> trước cửa nhà ở Pallet (8,7)', s.map === 'pallet_town' && s.x === 8 && s.y === 7, s);
  await shot('pallet-town');
  await walkTo(22, 16);
  await step('up');
  await waitMap('oak_lab');
  check('vào lab Oak qua cửa (tiếng entering_door)', (await st()).map === 'oak_lab');
  await page.waitForFunction(() => window.__dlg, null, { timeout: 8000 }).catch(() => {});
  await shot('oak-lab');
  await settle();
  check('gặp Oak: xong "The Pokémon Prof." (+50 EXP)', await ev(() => !!P1.state.flags.quest_done_the_pokemon_prof && P1.state.trainerExp >= 50), await ev(() => P1.state.trainerExp));
  await walkTo(7, 4);
  await face('up');
  await talk();
  await page.waitForFunction(() => window.__dlg && window.__dlg.kind === 'choose', null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => document.querySelector('.p1w-mon img') && window.__dlg && window.__dlg.kind === 'choose', null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
  await shot('starter-choice');
  const monShown = await ev(() => { const i = document.querySelector('.p1w-mon img'); return i ? i.getAttribute('src') : ''; });
  await settle(300000);
  const party = await ev(() => P1.state.party.map(m => m.dex + ':' + m.level));
  check('chọn Bulbasaur: ảnh lớn + tiếng kêu, nhận L5', monShown.includes('big/1.png') && party[0] && party[0].startsWith('1:'), { monShown, party });
  const b0 = await ev(() => window.__battles[0]);
  check('Gary chọn khắc hệ (Charmander L5) và đấu trong lab', b0 && b0.kind === 'trainer' && b0.name === 'Gary' && b0.foe[0] === '4:5', b0);
  check('xong "First Battle": Potion + 100 EXP, sang "Trainer on Route 1"',
    await ev(() => !!P1.state.flags.quest_done_first_battle && P1.state.quest === 'trainer_route_1' && P1.state.bag.potion >= 1));
  check('Gary rời lab (hide gary_left)', await ev(() => P1.world.actorById('gary').hidden === true));
  check('quay về thế giới cũ ngay sau trận (resume)', (await st()).map === 'oak_lab');

  await walkTo(6, 10);
  await step('down');
  await waitMap('pallet_town');
  await ev(() => { P1.world.debug.noEncounter = true; });
  await walkTo(14, 0);
  await step('up');
  await waitMap('route_1');
  s = await st();
  check('cửa nối cạnh: Pallet (14,0) -> Route 1 (12,39)', s.map === 'route_1' && s.x === 12 && s.y === 39, s);
  check('nhạc Route 1', await ev(() => P1.audio.musicKey()) === 'route_1');
  await shot('route-1');

  // Nâng Pokémon đầu đội lên cấp 100 (thiết lập bài kiểm): trận ngắn, không lên cấp/tiến hoá giữa chừng.
  await ev(() => { const m = P1.state.party[0]; m.level = 100; m.exp = P1.mon.expAt(m.dex, 100); P1.mon.heal(m); });
  // Pokémon hoang dã: ép tỉ lệ gặp = 1 (móc gỡ lỗi P1.world.debug) rồi bước vào cỏ.
  await walkTo(16, 26);
  await ev(() => { P1.world.debug.noEncounter = false; P1.world.debug.encounterRate = 1; });
  const nb = await ev(() => window.__battles.length);
  await step('up');
  await page.waitForFunction(() => P1.scene.name === 'battle', null, { timeout: 15000 }).catch(() => {});
  const wild = await ev(() => window.__battles[window.__battles.length - 1]);
  check('bước vào cỏ cao -> trận hoang dã theo bảng vùng route_1_grass', (await ev(() => window.__battles.length)) === nb + 1 && wild.kind === 'wild' &&
    [16, 19, 161, 162, 163].includes(+wild.foe[0].split(':')[0]), wild);
  await page.waitForTimeout(1500);
  await shot('wild-battle');
  await settle(300000);
  await ev(() => { P1.world.debug.noEncounter = true; P1.world.debug.encounterRate = null; });
  const wildEnd = await ev(() => window.__battles[window.__battles.length - 1].outcome);
  s = await st();
  check('sau trận hoang dã: thắng/bắt/chạy thì về lại Route 1, thua thì về chỗ hồi máu', wildEnd === 'lose' ? s.map === 'pallet_house_1f' : s.map === 'route_1', { outcome: wildEnd, map: s.map });
  if (s.map !== 'route_1') throw new Error('lost the wild battle (' + wildEnd + '); rerun');

  await walkTo(13, 22);
  await step('up');
  await page.waitForFunction(() => P1.world.mode !== 'explore', null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  await shot('joey-spotted');
  const spotted = await ev(() => ({ mode: P1.world.mode, music: P1.audio.musicKey() }));
  check('Joey nhìn thấy (LOS 4): dừng người chơi, "!" + nhạc boy_1', spotted.mode !== 'explore' && spotted.music === 'boy_1', spotted);
  await settle(300000);
  const bj = await ev(() => window.__battles[window.__battles.length - 1]);
  check('Joey: trận trainer Rattata L10, xong nhiệm vụ Trainer on Route 1', bj.name === 'Youngster Joey' && bj.foe[0] === '19:10' &&
    await ev(() => !!P1.state.flags.beat_joey && !!P1.state.flags.quest_done_trainer_route_1), bj);

  // Sherman nhìn sang phải (LOS 3) chắn lối đi cột 18-19 hàng 14.
  await walkTo(19, 15);
  await step('up');
  await settle(300000);
  check('Sherman nhìn thấy khi đi ngang tầm nhìn -> trận Pidgey L9 + Rattata L9', await ev(() => !!P1.state.flags.beat_sherman),
    await ev(() => window.__battles[window.__battles.length - 1]));

  // Gờ nhảy một chiều: từ (9,6) bấm xuống -> nhảy qua (9,7) tới (9,8).
  await walkTo(9, 6);
  s = await st();
  const jumpFrom = [s.x, s.y];
  const s2 = await step('down');
  await page.waitForTimeout(500);
  s = await st();
  check('nhảy gờ xuống nam: 2 ô một lần', jumpFrom[1] === 6 && s.x === 9 && s.y === 8, { from: jumpFrom, to: [s.x, s.y] });
  await shot('after-ledge');
  await step('up');
  s = await st();
  check('gờ chặn chiều ngược lại (đi lên bị chặn)', s.y === 8, s);

  await walkTo(11, 0);
  await step('up');
  await waitMap('viridian_city');
  s = await st();
  check('Route 1 -> Viridian City', s.map === 'viridian_city', s);
  check('đã đấu cả ba trainer Route 1 (Sherman, Nancy) -> nhiệm vụ Viridian City',
    await ev(() => !!P1.state.flags.beat_sherman && !!P1.state.flags.beat_nancy && P1.state.quest === 'viridian_city'), await ev(() => P1.state.quest));
  await shot('viridian-city');

  // Trung tâm Pokémon: làm Pokémon bị thương rồi để Nurse Joy hồi.
  await ev(() => { P1.state.party[0].hp = 1; });
  await walkTo(24, 16);
  await step('up');
  await waitMap('viridian_center');
  await shot('pokemon-center');
  await walkTo(7, 13);
  await face('up');
  h.answers.push(1);
  await talk();
  await settle();
  check('Nurse Joy qua quầy: hồi đầy, lưu chỗ hồi, xong "Viridian City"', await ev(() => {
    const m = P1.state.party[0];
    return m.hp === P1.mon.stats(m).hp && P1.state.lastHeal.map === 'viridian_center' && !!P1.state.flags.quest_done_viridian_city;
  }));
  await walkTo(7, 20);
  await step('down');
  await waitMap('viridian_city');

  // Poké Mart: Carl tặng bóng, rồi mở cửa hàng.
  await walkTo(9, 15);
  await step('up');
  await waitMap('viridian_mart');
  await shot('poke-mart');
  await walkTo(3, 6);
  await face('up');
  const money0 = await ev(() => P1.state.money);
  await talk();
  for (let i = 0; i < 400 && !(await ev(() => !!(P1.ui.view && P1.ui.view('shop')))); i++) {
    const s3 = await st();
    if (s3.dlg) await page.keyboard.press('Space');
    await page.waitForTimeout(150);
  }
  await shot('shop');
  const balls0 = await ev(() => P1.state.bag.pokeball || 0);
  await h.click('shop', 'Grid/si00');
  await h.click('shop', 'Choose Amount/Button - Add');
  await h.click('shop', 'Button - Buy');
  await page.waitForTimeout(300);
  const bought = await ev(() => ({ balls: P1.state.bag.pokeball || 0, money: P1.state.money }));
  await h.click('shop', 'Button - Close (1)');
  await settle();
  check('Carl: tặng 5 Poké Ball, xong Part 2; mua bằng cửa hàng gốc', balls0 >= 5 && bought.balls > balls0 && bought.money < money0 + 110 &&
    await ev(() => !!P1.state.flags.quest_done_viridian_city_2), { balls0, bought, money0 });
  await walkTo(6, 9);
  await step('down');
  await waitMap('viridian_city');

  await walkTo(6, 7);
  await step('up');
  await waitMap('trainer_school');
  await shot('trainer-school');
  await walkTo(6, 3);
  await face('up');
  await talk();
  await settle();
  check('Dizzy: xong "Viridian City (Part 3)"', await ev(() => !!P1.state.flags.quest_done_viridian_city_3 && P1.state.quest === 'viridian_city_4'));
  await walkTo(6, 11);
  await step('down');
  await waitMap('viridian_city');
  const om = await ev(() => { const a = P1.world.actorById('old_man'); return [a.x, a.y]; });
  const spots = [[om[0], om[1] + 1, 'up'], [om[0], om[1] - 1, 'down'], [om[0] - 1, om[1], 'right'], [om[0] + 1, om[1], 'left']];
  let talked = false;
  for (const [x, y, d] of spots) {
    if (!(await h.plan(x, y))) continue;
    await walkTo(x, y);
    await face(d);
    await talk();
    await settle();
    talked = true;
    break;
  }
  check('ông già: xong "Viridian City (Part 4)", sang Viridian Forest', talked && await ev(() => !!P1.state.flags.quest_done_viridian_city_4 && P1.state.quest === 'viridian_forest'),
    { talked, old: om, log: await ev(() => window.__log.slice(-3)), quest: await ev(() => P1.state.quest) });
  check('thưởng nhiệm vụ cộng dồn đúng bảng wiki (EXP)', await ev(() => P1.state.trainerExp) >= 50 + 100 + 50 + 50 + 55 * 4, await ev(() => P1.state.trainerExp));

  // Sổ nhiệm vụ: panel gốc 'Panel - Quests' (phím Q ảo / P1.input 'quests').
  await ev(() => P1.input.press('quests'));
  await page.waitForTimeout(600);
  await shot('quest-log');
  check('sổ nhiệm vụ mở panel gốc Panel - Quests với nhiệm vụ đang làm', await ev(() => P1.worldUi.quests.isOpen() &&
    /Viridian Forest/.test(document.body.innerText)));
  await ev(() => P1.worldUi.quests.close());

  // Thua cả đội: về chỗ hồi máu, mất nửa tiền [MAINLINE DEFAULT].
  const m0 = await ev(() => P1.state.money);
  await ev(() => { P1.world.blackout(); });
  await page.waitForTimeout(500);
  await settle();
  s = await st();
  check('thua cả đội -> về Trung tâm, mất nửa tiền, hồi đầy', s.map === 'viridian_center' && await ev(() => P1.state.money) === m0 - Math.floor(m0 / 2), { map: s.map, money: await ev(() => P1.state.money), m0 });

  check('mỗi lần đổi map chỉ còn đúng một nhóm map trong scene (không tải chồng)', h.groups.every(g => g.endsWith(':1')), h.groups.join(' '));
  const hit = await ev(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && (e.id || e.tagName); });
  check('giữa màn chơi là canvas (#gl), không bị lớp UI nuốt', hit === 'gl', hit);
  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

/* Ảnh từng map từ máy ảnh chơi (vào thẳng bằng ?map=), kèm Pallet ban đêm. */
async function mapShots(browser, base) {
  out.push('\n[ảnh từng map]');
  const list = [['pallet_house_2f', 7, 4], ['pallet_house_1f', 6, 5], ['gary_house', 6, 6], ['pallet_town', 14, 9], ['oak_lab', 6, 7],
    ['route_1', 12, 20], ['viridian_city', 17, 18], ['viridian_center', 7, 15], ['viridian_mart', 6, 6], ['trainer_school', 6, 7]];
  const { ctx, page, errors } = await openPage(browser, base, 1280, 720, false);
  for (const [id, x, z] of list) {
    await page.goto(base + '/games/pokeone/index.html?fresh=1&map=' + id + '&x=' + x + '&z=' + z);
    await page.waitForFunction(() => window.P1 && P1.world && P1.world.map && P1.world.mode, null, { timeout: 60000 });
    await page.waitForTimeout(2200);
    const f = path.join(SHOTS, 'map-' + id + '.png');
    await page.screenshot({ path: f });
    const info = await page.evaluate(() => ({ props: P1.world.gfx.group.children.length, actors: P1.world.actors.length }));
    check(id + ': vẽ ra (' + info.props + ' nút, ' + info.actors + ' NPC)', info.props > 0);
  }
  await page.goto(base + '/games/pokeone/index.html?fresh=1&map=pallet_town&x=14&z=9&period=night');
  await page.waitForFunction(() => window.P1 && P1.world && P1.world.mode === 'explore', null, { timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(SHOTS, 'map-pallet_town-night.png') });
  const night = await page.evaluate(() => P1.world.sun.color.toArray());
  check('ban đêm: ánh sáng lấy màu EnviromentColours lam', night[2] > night[0], night);
  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

/* 844x390 cảm ứng: d-pad giữ bằng chuột, A bằng chạm. */
async function phone(browser, base) {
  const tag = '844x390';
  out.push('\n[' + tag + ' — d-pad cảm ứng]');
  const { ctx, page, errors } = await openPage(browser, base, 844, 390, true);
  const h = helpers(page, tag);
  const { ev, shot, st, settle } = h;
  await page.goto(base + '/games/pokeone/index.html?fresh=1&map=viridian_city&x=24&z=18');
  await page.waitForFunction(() => window.P1 && P1.world && P1.world.mode === 'explore', null, { timeout: 60000 });
  await h.instrument();
  await page.waitForTimeout(1500);
  const pad = await ev(() => {
    const d = document.querySelector('.p1w-dpad'), a = document.querySelector('.p1w-btn[data-action="a"]');
    if (!d || !a) return null;
    const r = d.getBoundingClientRect(), b = a.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, r.top + 22), btn = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { up: [cx, r.top + 22], left: [r.left + 22, cy], right: [r.right - 22, cy], down: [cx, r.bottom - 22], a: [b.left + b.width / 2, b.top + b.height / 2],
      padOnTop: !!top && d.contains(top), aOnTop: btn === a, inView: r.bottom <= innerHeight && b.right <= innerWidth };
  });
  check('d-pad và A/B hiện khi có cảm ứng, nằm trên cùng, trong khung', pad && pad.padOnTop && pad.aOnTop && pad.inView, pad);
  await shot('touch-viridian');
  const hold = async (dir, ms) => { await page.mouse.move(...pad[dir]); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); await page.waitForTimeout(350); };
  let s0 = await st();
  await hold('up', 700);
  let s = await st();
  check('giữ d-pad lên -> đi lên (và vào cửa Trung tâm nếu tới)', s.map === 'viridian_center' || s.y < s0.y, { from: [s0.x, s0.y], to: [s.x, s.y, s.map] });
  if (s.map !== 'viridian_center') { for (let i = 0; i < 4 && (await st()).map !== 'viridian_center'; i++) await hold('up', 400); }
  await h.waitMap('viridian_center');
  await h.walkTo(7, 13);
  await page.mouse.move(...pad.up); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  await page.waitForTimeout(200);
  check('chạm nhanh d-pad lên chỉ quay mặt (cả khi ngắn hơn một khung hình)', (await st()).face === 0 && (await st()).y === 13, await st());
  await page.waitForTimeout(150);
  await page.touchscreen.tap(...pad.a);
  await page.waitForFunction(() => window.__dlg, null, { timeout: 8000 }).catch(() => {});
  await shot('touch-nurse-joy');
  check('chạm A trước quầy -> Nurse Joy nói', await ev(() => !!window.__dlg && /Pokémon Center/.test(window.__dlg.text)));
  await settle();
  const hit = await ev(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return e && (e.id || e.tagName); });
  check('giữa màn chơi là canvas (#gl)', hit === 'gl', hit);
  check('không lỗi trang / console / HTTP', errors.length === 0, errors.slice(0, 5).join(' | '));
  await ctx.close();
}

(async () => {
  staticChecks();
  const srv = await serve();
  const base = process.env.BASE || 'http://127.0.0.1:' + srv.address().port;   // BASE=<url Pages> để kiểm bản trên mạng
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const only = process.argv.find(a => a.startsWith('--only='));
    const parts = only ? only.slice(7).split(',') : ['desktop', 'maps', 'phone'];
    if (parts.includes('desktop')) await desktop(browser, base).catch(e => check('chơi thật 1280x720 chạy hết', false, e.message));
    if (parts.includes('maps')) await mapShots(browser, base).catch(e => check('ảnh từng map', false, e.message));
    if (parts.includes('phone') && !process.argv.includes('--quick')) await phone(browser, base).catch(e => check('844x390 cảm ứng', false, e.message));
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('\n' + out.join('\n'));
  console.log('\n' + pass + ' đạt, ' + fail + ' trượt. Ảnh: ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
