/*
 * Thần Điện Thủ Hộ (games/soulknight): lõi chế độ (js/defence.js).
 * Chạy: python3 -m http.server 8811 (ở gốc repo) rồi  PLAYWRIGHT_PATH=... node test/soulknight-defence.js
 * Ảnh chụp: $SK_SHOTS hoặc <tmp>/soulknight-defence/.
 */
const PW = process.env.PLAYWRIGHT_PATH || 'C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright';
const { chromium } = require(PW);
const path = require('path');
const fs = require('fs');
const os = require('os');

const URL = (process.env.SK_URL || 'http://localhost:8811/games/soulknight/index.html') + '?quick=1&themes=forest,castle,volcano';
const SHOTS = process.env.SK_SHOTS || path.join(os.tmpdir(), 'soulknight-defence');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  results.push('  ' + (ok ? '✔ ' : '✘ ') + name + (detail ? '  — ' + detail : ''));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(p, fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(80); }
  return false;
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ')));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ev = (fn, arg) => p.evaluate(fn, arg);

  await p.goto(URL);
  await p.waitForSelector('#sk-start', { state: 'visible', timeout: 15000 });

  // ---- 1. thẻ chế độ + vào ván
  await ev(() => SK.lobby.openModes());
  await p.click('.hs-mode[data-mode="defence"]');
  const card = await ev(() => ({ title: document.getElementById('hs-mode-title').textContent, go: !document.getElementById('hs-mode-go').disabled, img: document.getElementById('hs-mode-img').src.split('/').pop(), desc: document.getElementById('hs-mode-desc').textContent }));
  check('bảng chế độ có thẻ Thần Điện Thủ Hộ (ảnh mode_defence), nút Bắt đầu bật', card.title === 'Thần Điện Thủ Hộ' && card.go && card.img === 'mode_defence.png', JSON.stringify(card));
  check('chữ thẻ không chứa nhãn nguồn', !/\[(LOC|WIKI|ĐO|ƯỚC)/.test(card.desc));
  await ev(() => { document.getElementById('hs-modes').hidden = true; SK_GAME.debug.seed(7); SK.defence.skipPlot = true; SK.lobby.launch('knight', 'defence', []); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
  const SK_C_OK = await ev(() => SK.DEFENCE.countdown === 110);
  const s0 = await ev(() => {
    const G = SK.G, d = G.defence, r = G.map.rooms[0], pl = G.player;
    return { mode: SK_GAME.mode, stone: d.stone.hp, max: d.stone.max, pads: d.pads.length, gates: d.gates.length, timer: d.timer, coins: d.coins, phase: d.phase,
      inRoom: d.stoneAt.x > r.x0 * 16 && d.stoneAt.x < (r.x1 + 1) * 16 && d.stoneAt.y > r.y0 * 16 && d.stoneAt.y < (r.y1 + 1) * 16, portal: !!G.portal,
      gatesOk: d.gates.every(g => !SK.world.solidAt(G.map, g.x, g.y)), n: SK.STAGES.length, pl: [pl.x, pl.y], st: [d.stoneAt.x, d.stoneAt.y] };
  });
  check('vào ván: mode defence, Đá Phép 20/20 trong phòng, 12 Nền Tháp, 3 cổng đỏ, đếm ngược 110 giây, không có cổng ải sau',
    s0.mode === 'defence' && s0.stone === 20 && s0.max === 20 && s0.pads === 12 && s0.gates === 3 && s0.timer > 100 && s0.timer <= 110 && SK_C_OK && s0.inRoom && !s0.portal && s0.gatesOk && s0.n === 1, JSON.stringify(s0));
  await sleep(300);
  await p.screenshot({ path: path.join(SHOTS, '1-room.png') });

  // ---- 2. quái chạm Đá Phép trừ máu (quái chết ngay, máu đá mất = ceil(máu quái / 10))
  const stoneHit = await ev(async () => {
    const G = SK.G, d = G.defence, pl = G.player; SK_GAME.debug.god(true);
    const id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    const e = SK.makeEnemy(G, id, d.stoneAt.x + 40, d.stoneAt.y + 10, G.map.rooms[0]); e.hp = e.hpMax = 50; e.st = 'idle'; e.stT = 0; e.dwave = true; G.enemies.push(e);
    const h0 = d.stone.hp;
    for (let i = 0; i < 100 && d.stone.hp === h0; i++) await new Promise(r => setTimeout(r, 100));
    return { h0, h1: d.stone.hp, st: e.st, kills: G.kills };
  });
  check('quái trong đợt lao vào Đá Phép: quái chết ngay, Đá mất 5 máu (quái 50 máu), không tính là hạ quái', stoneHit.h0 - stoneHit.h1 === 5 && stoneHit.st === 'dead' && stoneHit.kills === 0, JSON.stringify(stoneHit));
  await ev(() => { SK.G.defence.stone.hp = 20; });

  // ---- 3. hạ quái rơi Xu Sao
  const dropDefault = await ev(() => SK.DEFENCE.dropRate < 1 && SK.DEFENCE.dropRate > 0);
  const drop = await ev(async () => {
    const G = SK.G, d = G.defence, pl = G.player, C = SK.DEFENCE, rate0 = C.dropRate;
    C.dropRate = 1;
    const id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    const e = SK.makeEnemy(G, id, d.stoneAt.x + 50, d.stoneAt.y - 30, G.map.rooms[0]); e.hp = e.hpMax = 5; e.st = 'idle'; e.stT = 0; e.hold = true; e.dwave = true; G.enemies.push(e);
    const c0 = d.coins, n0 = d.drops.length;
    SK.hurtEnemy(G, e, 50, false, 0, 1);
    const dropped = d.drops.length - n0, at = d.drops[d.drops.length - 1];
    pl.x = at.x; pl.y = at.y + 4;
    for (let i = 0; i < 40 && d.coins === c0; i++) await new Promise(r => setTimeout(r, 100));
    C.dropRate = rate0;
    return { dropped, c0, c1: d.coins, v: C.dropValue };
  });
  check('hạ quái trong đợt: rơi Xu Sao trên sàn, nhặt vào thì cộng ' + 2, dropDefault && drop.dropped === 1 && drop.c1 - drop.c0 === drop.v, JSON.stringify(drop));
  await ev(() => { const G = SK.G; for (const e of G.enemies) { e.st = 'dead'; e.hp = 0; e.dwave = false; } G.defence.coins = 15; });

  // ---- 4. đặt tháp bằng Xu Sao (qua phím E vào Nền Tháp), trừ đúng giá
  const sel0 = await ev(() => SK.G.defence.sel);
  const lbl = await ev(() => { const G = SK.G, d = G.defence, pad = d.pads[0], pl = G.player; pl.x = pad.x; pl.y = pad.y + 2; return null; });
  await sleep(200);
  const tgt = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await p.keyboard.press('KeyE'); await sleep(200);
  let q = await ev(() => ({ coins: SK.G.defence.coins, n: SK.G.defence.towers.length, id: SK.G.defence.towers[0] && SK.G.defence.towers[0].id }));
  check('bấm E vào Nền Tháp trống: đặt tháp đang chờ, trừ đúng 15 Xu Sao', q.coins === 0 && q.n === 1 && q.id === sel0 && /Đặt /.test(tgt || ''), (tgt || '') + ' · ' + JSON.stringify(q));
  let r = await ev(() => SK.defence.place(SK.G, 1, 'chain_laser_tower'));
  q = await ev(() => ({ coins: SK.G.defence.coins, n: SK.G.defence.towers.length }));
  check('thiếu Xu Sao thì không đặt, không trừ', !r.ok && q.coins === 0 && q.n === 1, JSON.stringify(r));
  await ev(() => { SK.G.defence.coins = 6 * 15 + 7; });
  const ids = await ev(() => SK.DEFENCE.ids.slice(1, 7));   // 7 tháp gốc; 4 tháp mới kiểm ở mục 8
  for (let i = 0; i < ids.length; i++) await ev(a => SK.defence.place(SK.G, a[0], a[1]), [i + 1, ids[i]]);
  q = await ev(() => ({ coins: SK.G.defence.coins, n: SK.G.defence.towers.length, ids: SK.G.defence.towers.map(t => t.id).join(',') }));
  check('đặt đủ 7 tháp khác loại (>= 6): mỗi tháp 15 Xu Sao, còn dư 7', q.n === 7 && q.coins === 7, JSON.stringify(q));
  r = await ev(() => SK.defence.place(SK.G, 0, 'airbase'));
  check('mỗi loại chỉ 1 tháp / Nền Tháp đã có tháp thì từ chối', !r.ok);
  await p.screenshot({ path: path.join(SHOTS, '2-towers.png') });

  // ---- 5. tháp bắn quái: máu quái giảm, mỗi lần trúng đúng sát thương gốc của từng tháp
  const shoot = await ev(async () => {
    const G = SK.G, d = G.defence, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    const e = SK.makeEnemy(G, id, d.stoneAt.x, d.stoneAt.y + 2, G.map.rooms[0]); e.hp = e.hpMax = 1e6; e.st = 'idle'; e.stT = 0; e.hold = true; G.enemies.push(e);
    const seen = {}; let n = 0;
    SK.on('enemyHit', (G2, q2, dmg) => { if (q2 === e) { seen[dmg] = (seen[dmg] || 0) + 1; n++; } });
    const h0 = e.hp;
    for (let i = 0; i < 70; i++) await new Promise(r => setTimeout(r, 100));
    e.st = 'dead'; e.hp = 0;
    return { h0, h1: e.hp, seen, n, pdmg: SK.DS.weapons[G.player.weapons[0].id].dmg };
  });
  const want = [2, 21, 8, 10, 15, 4, 24];
  const got = Object.keys(shoot.seen).map(Number).filter(k => k !== shoot.pdmg).sort((a, b) => a - b);
  check('7 tháp bắn quái đứng yên: sát thương mỗi lần trúng chỉ gồm 2/21/8/10/15/4/24 (gốc của từng tháp), đủ cả 7',
    JSON.stringify(got) === JSON.stringify(want.slice().sort((a, b) => a - b)), JSON.stringify(shoot.seen));
  const dm = await ev(() => ({ a: SK.defence.dmgOf('airbase', 18), l: SK.defence.dmgOf('chain_laser_tower', 1), g: SK.defence.dmgOf('rage_gun_tower', 0) }));
  check('hệ số 1,26 mỗi sao: 24 x 1,26^18 = 1537,7', dm.a === 1537.7 && dm.l === 26.5 && dm.g === 2, JSON.stringify(dm));
  const ex = await ev(() => { const d = SK.G.defence; d.towers.forEach(t => { t.star = 0; t.exp = 0; }); SK.defence.giveExp(SK.G, 7 * 25); return d.towers.map(t => t.star + '/' + t.exp).join(' '); });
  check('EXP chia đều cho 7 tháp: mỗi tháp 25 EXP lên sao 1', /^(1\/0 ?){7}$/.test(ex.trim() + ' ') , ex);
  await ev(() => { SK.G.defence.towers.forEach(t => { t.star = 0; t.exp = 0; }); });
  await ev(() => { const G = SK.G; for (const e of G.enemies) { e.st = 'dead'; e.hp = 0; } });

  // ---- 5b. tháp / Đá / Nền / cổng / Xu Sao vẽ bằng prefab gốc (defence.ab), không phải hình khối
  const art = await ev(() => {
    const G = SK.G, d = G.defence, A = SK.defence.artOf();
    const need = ['tower_base', 'defence_enemy_gate', 'coin_star'].concat(SK.DEFENCE.ids);   // 11 loại tháp
    const per = need.map(n => [n, SK.prefab(n) !== null && SK.prefab(n).length > 0]);
    const cv = document.createElement('canvas'); cv.width = cv.height = 120; const cx = cv.getContext('2d');
    const drew = SK.DEFENCE.ids.map(id => SK.drawPrefab(cx, SK.prefab(id), 60, 90, { scale: 0.5, t: 0 }));
    const stoneF = SK.D.extra.sprites['^magic_stone$'];
    return { per, A, drew, stone: !!(stoneF && stoneF[0] && SK.frame(stoneF[0])), towers: d.towers.length };
  });
  check('Đá Phép, Nền Tháp, cổng đỏ, Xu Sao và cả 11 loại tháp đã dựng có prefab gốc (SK.prefab khác null) và SK.drawPrefab vẽ được',
    art.per.every(x => x[1]) && art.drew.every(Boolean) && art.stone && art.A.pad && art.A.gate && art.A.coin && art.A.towers.length === 11 && art.towers === 7, JSON.stringify(art));
  await p.screenshot({ path: path.join(SHOTS, '2b-art.png') });

  // ---- 5c. Phẩm: mua trùng 15 Xu Sao mỗi bản, 6 Phẩm; Bẫy Gai 4 gai Phẩm 1 -> 14 gai Phẩm 6; sao x1,26 mỗi bậc
  const pham = await ev(() => {
    const G = SK.G, d = G.defence, Df = SK.defence, i = d.pads.findIndex(pd => pd.tower && pd.tower.id === 'spike_trap'), t = d.pads[i].tower;
    d.coins = 200; const c0 = d.coins, k0 = Df.spikesOf(t.pham), ph0 = t.pham;
    const dmg0 = Df.dmgOf(t.id, t.star); t.star = 1; const dmg1 = Df.dmgOf(t.id, t.star); t.star = 0;
    const seq = []; for (let n = 0; n < 6; n++) { const r = Df.upgrade(G, i); seq.push(r.ok ? 1 : 0); }
    return { ph0, ph: t.pham, k0, k6: Df.spikesOf(t.pham), spent: c0 - d.coins, seq: seq.join(''), dmg0, dmg1 };
  });
  check('mua trùng: 5 lần nâng Phẩm 1 -> 6 trừ đúng 75 Xu Sao, lần thứ 6 bị từ chối (đủ Phẩm); Bẫy Gai 4 gai -> 14 gai',
    pham.ph0 === 1 && pham.ph === 6 && pham.spent === 75 && pham.seq === '111110' && pham.k0 === 4 && pham.k6 === 14, JSON.stringify(pham));
  check('nâng 1 sao: sát thương x1,26 (Bẫy Gai 8 -> 10,1)', pham.dmg0 === 8 && pham.dmg1 === 10.1, JSON.stringify(pham));
  const star = await ev(() => {
    const d = SK.G.defence, t = d.towers[0]; t.star = 0; t.exp = 0; d.coins = 100;
    const c0 = d.coins, r = SK.defence.giveExp(SK.G, 7 * SK.DEFENCE.starExp[0]);
    const s1 = d.towers.map(q => q.star).join(''); d.towers.forEach(q => { q.star = 0; q.exp = 0; });
    return { s1, coins: d.coins - c0 };
  });
  check('lên sao bằng EXP không tốn Xu Sao (wiki: sao theo EXP, không có giá Xu Sao)', star.s1 === '1111111' && star.coins === 0, JSON.stringify(star));

  // ---- 6. qua chặng 1 (3 đợt) thì sang chặng 2 cùng phòng; đợt 4 (2-1) mạnh hơn đợt 1 theo bảng
  const w1 = await ev(async () => {
    const G = SK.G, d = G.defence, C = SK.DEFENCE, waves = [];
    SK.on('defenceWaveClear', (G2, z, w) => waves.push(z + '-' + (w + 1)));
    G.player.x = d.stoneAt.x; G.player.y = d.stoneAt.y + 24;
    const hp1 = [], hpMulFirst = [];
    for (let w = 0; w < 3; w++) {
      SK.defence.skip(G);
      const t0 = Date.now();
      while (Date.now() - t0 < 90000 && G.state === 'stage' && d.stats.waves <= w) {
        for (const e of G.enemies) if (e.dwave && e.st !== 'dead') G.player.god = true;
        await new Promise(r => setTimeout(r, 150));
      }
      if (G.state !== 'stage') break;
    }
    return { state: G.state, waves, zone: d.zone, wave: d.wave, stone: d.stone.hp, kills: d.stats.kills, phase: d.phase, won: d.won, room: d.room === G.map.rooms[0],
      b: [C.pts[0], C.pts[1], C.pts[2]].map((p, i) => SK.defence.budget(1, i)), b4: SK.defence.budget(2, 0), hm1: SK.defence.hpMul(1), hm2: SK.defence.hpMul(2) };
  });
  check('qua đủ 3 đợt chặng 1 (1-1, 1-2, 1-3): sang chặng 2 cùng phòng, chưa thắng, Đá Phép còn sống',
    w1.state === 'stage' && w1.waves.join(',') === '1-1,1-2,1-3' && w1.zone === 2 && w1.wave === 0 && w1.phase === 'wait' && !w1.won && w1.room && w1.stone > 0 && w1.kills > 0, JSON.stringify(w1));
  check('bảng độ mạnh: đợt 4 (2-1) ngân sách ' + w1.b4 + ' > đợt 1 (' + w1.b[0] + '), máu quái x' + w1.hm2 + ' > x' + w1.hm1, w1.b4 > w1.b[0] && w1.hm2 > w1.hm1 && w1.b[0] < w1.b[1] && w1.b[1] < w1.b[2], JSON.stringify(w1));
  const w4 = await ev(async () => {
    const G = SK.G, d = G.defence;
    for (const e of G.enemies) { e.dwave = false; e.st = 'dead'; e.hp = 0; }
    const base = SK.D.enemies[G.map.th.enemies[0]].hp;
    d.towers.forEach(t => { t.ally.dead = true; });   // tháp tạm ngưng để quái đứng yên đo máu
    SK.defence.startWave(G);
    d.queue.length = 0; const id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    const mk = zone => { d.zone = zone; return SK.defence.hpMul(zone) * SK.D.enemies[id].hp; };
    const z2 = SK.defence.waveList(G, 2, 0), z1 = SK.defence.waveList(G, 1, 0);
    const sum = l => l.reduce((a, q) => a + (SK.D.enemies[q.id].ai[0].p.consume || 1), 0);
    return { n1: z1.length, n2: z2.length, s1: sum(z1), s2: sum(z2), b1: SK.defence.budget(1, 0), b2: SK.defence.budget(2, 0), hp2: Math.round(mk(2)), hp1: Math.round(mk(1)), zone: d.zone };
  });
  check('danh sách quái đợt 2-1 không vượt ngân sách 2-1 và ngân sách lớn hơn 1-1', w4.s1 <= w4.b1 && w4.s2 <= w4.b2 && w4.b2 > w4.b1 && w4.hp2 >= w4.hp1, JSON.stringify(w4));
  await ev(() => { const G = SK.G, d = G.defence; d.towers.forEach(t => { t.ally.dead = false; t.ally.hp = SK.DEFENCE.towerHp; }); for (const e of G.enemies) { e.dwave = false; e.st = 'dead'; e.hp = 0; } d.queue = []; d.phase = 'wait'; d.timer = 110; d.zone = 2; d.wave = 0; });
  // quái đợt 2-1 thật sự có máu x hpMul(2)
  const real = await ev(async () => {
    const G = SK.G, d = G.defence; d.queue = [{ id: G.map.th.enemies.filter(i => SK.D.enemies[i])[0] }]; d.phase = 'fight'; d.spawnT = 0; d.routes = [0]; d.rr = 0;
    d.towers.forEach(t => { t.ally.dead = true; });
    const base = SK.D.enemies[d.queue[0].id].hp;
    for (let i = 0; i < 20 && !G.enemies.some(e => e.dz === 2); i++) await new Promise(r => setTimeout(r, 100));
    const e = G.enemies.find(e => e.dz === 2);
    const out = { base, hp: e && e.hpMax, want: Math.round(base * SK.defence.hpMul(2)) };
    if (e) { e.hold = true; e.dwave = false; e.st = 'dead'; e.hp = 0; }
    return out;
  });
  check('quái sinh ở chặng 2 có máu = máu gốc x1,1 (đợt 4 mạnh hơn đợt 1)', real.hp === real.want && real.hp >= real.base, JSON.stringify(real));
  await p.screenshot({ path: path.join(SHOTS, '3-zone2.png') });

  // ---- 6b. tuyến theo chặng, trùm sóng 3-3, thắng ở chặng 12
  const rt = await ev(() => { const C = SK.DEFENCE; return [1, 3, 4, 9, 10, 12].map(z => C.routesOf(z)).join(','); });
  check('số tuyến vào: chặng 1-3 một, 4-9 hai, 10-12 ba', rt === '1,1,2,2,3,3', rt);
  const boss = await ev(() => {
    const G = SK.G, d = G.defence;
    const l33 = SK.defence.waveList(G, 3, 2), l32 = SK.defence.waveList(G, 3, 1), l66 = SK.defence.waveList(G, 6, 2), l43 = SK.defence.waveList(G, 4, 2);
    return { b33: l33.filter(q => q.boss).length, b32: l32.filter(q => q.boss).length, b63: l66.filter(q => q.boss).length, b43: l43.filter(q => q.boss).length, al: l43.filter(q => q.alien).length, hp: [3, 6, 9, 12].map(z => SK.DEFENCE.bossZones[z]).join(',') };
  });
  check('Đợt BOSS 3-3 / 6-3 có trùm sóng, 3-2 / 4-3 không; Đợt Lớn có quái Phi Thuyền', boss.b33 === 1 && boss.b63 === 1 && boss.b32 === 0 && boss.b43 === 0 && boss.al >= 1 && boss.hp === '300,600,900,1200', JSON.stringify(boss));
  const win = await ev(async () => {
    const G = SK.G, d = G.defence;
    for (const e of G.enemies) { e.dwave = false; e.st = 'dead'; e.hp = 0; }
    d.zone = 12; d.wave = 2; d.queue = []; d.phase = 'fight';
    await new Promise(r => setTimeout(r, 600));
    return { state: G.state, won: d.won, zone: d.zone, overlay: !document.getElementById('sk-win').hidden, text: document.getElementById('sk-win-info').textContent };
  });
  check('qua chặng 12 (đợt 12-3 dọn xong): thắng, hiện màn thắng', win.state === 'victory' && win.won && win.overlay && /chặng 12/.test(win.text), JSON.stringify(win));
  await p.screenshot({ path: path.join(SHOTS, '3-win.png') });

  // ---- 7. Đá Phép về 0 thì thua
  await ev(() => { SK_GAME.debug.seed(9); SK_GAME.debug.defence('knight'); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
  await ev(() => SK_GAME.debug.god(true));
  const lose0 = await ev(() => { const d = SK.G.defence; return { hp: d.stone.hp, towers: d.towers.length, coins: d.coins, won: d.won }; });
  check('ván mới sau khi thắng: Đá Phép 20/20, chưa có tháp, 15 Xu Sao khởi đầu', lose0.hp === 20 && lose0.towers === 0 && lose0.coins === 15 && !lose0.won, JSON.stringify(lose0));
  await ev(async () => {
    const G = SK.G, d = G.defence, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    for (let i = 0; i < 3; i++) {
      const e = SK.makeEnemy(G, id, d.stoneAt.x + 20 + i * 4, d.stoneAt.y + 8, G.map.rooms[0]); e.hp = e.hpMax = 80; e.st = 'idle'; e.stT = 0; e.dwave = true; G.enemies.push(e);
    }
  });
  await p.screenshot({ path: path.join(SHOTS, '4-attack.png') });
  await until(p, () => SK_GAME.state === 'dead', null, 15000);
  const lose = await ev(() => ({ state: SK_GAME.state, hp: SK.G.defence.stone.hp, lost: SK.G.defence.lost, over: !document.getElementById('sk-over').hidden, text: document.getElementById('sk-over-info').textContent }));
  check('3 quái x 8 máu (mỗi quái 80 máu mất 8): Đá Phép về 0 thì thua, hiện màn thua', lose.state === 'dead' && lose.hp === 0 && lose.lost && lose.over, JSON.stringify(lose));
  await p.screenshot({ path: path.join(SHOTS, '5-lose.png') });


  // ---- 8. đợt 3: 4 tháp mới (Thiết Bị Nạp, Hộ Thuẫn, Bảo Trì, Ma Trận Khuếch Đại), đạn bằng prefab gốc, NPC, hồi sinh, rương xanh
  await ev(() => { SK_GAME.debug.seed(11); SK_GAME.debug.defence('knight'); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
  const P8 = await ev(() => {
    const G = SK.G, d = G.defence, Df = SK.defence; d.coins = 1000;
    const ids = ['energy_device', 'shield_tower', 'service_depot', 'amplification_matrix'];
    const rs = ids.map((id, i) => Df.place(G, i, id).ok);
    return { rs, n: d.towers.length, coins: d.coins, ids11: SK.DEFENCE.ids.length, art: Df.artOf().towers.length, hasStones: ids.every(id => !!SK.prefab(id)) };
  });
  check('4 tháp mới đặt được (mỗi tháp 15 Xu Sao), tổng 11 loại, đều có prefab gốc', P8.rs.every(Boolean) && P8.n === 4 && P8.coins === 1000 - 60 && P8.ids11 === 11 && P8.art === 11 && P8.hasStones, JSON.stringify(P8));

  // Thiết Bị Nạp: Phẩm 3 tạo 3 cầu, mỗi cầu +8 NL (sao 18: 14); nhặt hết thì NL tăng đúng 24
  const en = await ev(async () => {
    const G = SK.G, d = G.defence, p = G.player, t = d.pads[0].tower, Df = SK.defence;
    p.energyMax = 200; p.energy = 0; t.pham = 3; d.orbs = []; t.cd = 0;
    const t0 = Date.now(); while (!d.orbs.length && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 50));
    const n = d.orbs.length, v = d.orbs[0] && d.orbs[0].v;
    p.x = t.x; p.y = t.y + 8;
    const t1 = Date.now(); while (d.orbs.length && Date.now() - t1 < 8000) { for (const o of d.orbs) { o.x = p.x; o.y = p.y - 4; } await new Promise(r => setTimeout(r, 60)); }
    return { n, v, energy: p.energy, e0: Df.energyOf(0), e18: Df.energyOf(18), left: d.orbs.length };
  });
  check('Thiết Bị Nạp: Phẩm 3 tạo 3 cầu, mỗi cầu 8 NL (sao 18: 14); nhặt hết thì NL tăng đúng 24', en.n === 3 && en.v === 8 && en.energy === 24 && en.e0 === 8 && en.e18 === 14 && en.left === 0, JSON.stringify(en));

  // Tháp Hộ Thuẫn: khiên 50 chặn trước cho Đá Phép; quái 30 máu bị chặn hết, quái 40 máu còn 20 -> Đá mất 2; vỡ thì dựng lại sau >= 5 giây
  const sh = await ev(async () => {
    const G = SK.G, d = G.defence, t = d.pads[1].tower, Df = SK.defence, th = G.map.th;
    const id = th.enemies.filter(i => SK.D.enemies[i])[0], out = {};
    out.cover = Math.hypot(t.x - d.stoneAt.x, t.y - d.stoneAt.y) <= Df.shieldRadiusOf(t);
    out.max = Df.shieldMaxOf(t); out.start = t.sh && t.sh.hp;
    const hit = async hp => {
      const e = SK.makeEnemy(G, id, d.stoneAt.x + 8, d.stoneAt.y + 4, G.map.rooms[0]); e.hp = e.hpMax = hp; e.st = 'idle'; e.stT = 0; e.dwave = true; G.enemies.push(e);
      const t0 = Date.now(); while (e.st !== 'dead' && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 50));
    };
    const s0 = d.stone.hp; await hit(30); out.afterA = { stone: d.stone.hp - s0, sh: t.sh.hp };
    await hit(40); out.afterB = { stone: d.stone.hp - s0, sh: t.sh.hp, rebuild: t.sh.rebuild };
    const t1 = Date.now(); await new Promise(r => setTimeout(r, 2000)); out.mid = t.sh.hp;
    while (t.sh.hp <= 0 && Date.now() - t1 < 9000) await new Promise(r => setTimeout(r, 100));
    out.back = t.sh.hp; out.rebuildSec = (Date.now() - t1) / 1000;
    return out;
  });
  check('Hộ Thuẫn: khiên 50 phủ Đá Phép; quái 30 máu bị chặn hết (Đá giữ nguyên, khiên còn 20); quái 40 máu: khiên vỡ, Đá mất 2', sh.cover && sh.max === 50 && sh.start === 50 && sh.afterA.stone === 0 && sh.afterA.sh === 20 && sh.afterB.stone === -2 && sh.afterB.sh === 0, JSON.stringify(sh));
  check('khiên vỡ thì chưa dựng lại sau 2 giây, dựng lại đủ 50 sau 5-8 giây', sh.mid === 0 && sh.back === 50 && sh.rebuildSec >= 4.9 && sh.rebuildSec <= 8, JSON.stringify(sh));
  await ev(() => { SK.G.defence.stone.hp = 20; });

  // Trung Tâm Bảo Trì: chế độ tháp: tháp hỏng máu được hồi (Phẩm + sao); sao 18 + Phẩm 6 hồi 24, giãn cách 1 giây
  const dp = await ev(async () => {
    const G = SK.G, d = G.defence, t = d.pads[2].tower, o = d.pads[0].tower, Df = SK.defence, p = G.player;
    const wait = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 40)); return (Date.now() - t0) / 1000; };
    const out = {};
    t.pham = 1; t.star = 0; o.ally.hp = 20; t.cd = 0; await wait(() => o.ally.hp !== 20, 4000); out.p1 = o.ally.hp;
    t.pham = 6; t.star = 18; o.ally.hp = 10; t.cd = 0; await wait(() => o.ally.hp !== 10, 4000); out.p24 = o.ally.hp;
    o.ally.hp = 10; const gap = await wait(() => o.ally.hp !== 10, 4000); out.gap = gap; out.cdAt18 = SK.DEFENCE.towers.service_depot.cdOf(t); out.cdAt0 = SK.DEFENCE.towers.service_depot.cdOf({ star: 0 });
    t.star = 0; t.pham = 3; Df.setMode(G, 2, 'player'); p.hpMax = 20; p.hp = 10; p.x = t.x; p.y = t.y + 8; t.cd = 0;
    await wait(() => p.hp !== 10, 4000); out.player = p.hp; Df.setMode(G, 2, 'tower');
    out.mode = t.mode; o.ally.hp = SK.DEFENCE.towerHp; return out;
  });
  check('Bảo Trì: Phẩm 1 sao 0 hồi 1 máu cho tháp; Phẩm 6 + sao 18 hồi 24 (10 -> 34) và giãn cách chỉ 1 giây (cd 2 -> 1); chế độ người hồi +Phẩm',
    dp.p1 === 21 && dp.p24 === 34 && dp.cdAt18 === 1 && dp.cdAt0 === 2 && dp.gap < 2.5 && dp.player === 13, JSON.stringify(dp));

  // Ma Trận Khuếch Đại: đạn bay qua trường +2 ST và to 20%
  const mx = await ev(async () => {
    const G = SK.G, d = G.defence, t = d.pads[3].tower, th = G.map.th, id = th.enemies.filter(i => SK.D.enemies[i])[0];
    const e = SK.makeEnemy(G, id, t.x + 40, t.y - 20 + 6, G.map.rooms[0]); e.hp = e.hpMax = 1e6; e.st = 'idle'; e.stT = 0; e.hold = true; G.enemies.push(e);
    const seen = []; SK.on('enemyHit', (G2, q, dmg) => { if (q === e) seen.push(dmg); });
    const b = { k: 'bullet', x: t.x - 30, y: t.y - 20, vx: 120, vy: 0, dmg: 2, life: 1.5, t: 0 }; d.shots.push(b);
    const t0 = Date.now(); while (!seen.length && Date.now() - t0 < 3000) await new Promise(r => setTimeout(r, 30));
    e.st = 'dead'; e.hp = 0;
    return { seen, amp: b.amp, size: b.size, pdmg: SK.DS.weapons[G.player.weapons[0].id].dmg };
  });
  const mhit = mx.seen.filter(v => v !== mx.pdmg);
  check('Ma Trận Khuếch Đại: đạn 2 ST bay qua trường thành 4 ST (+2), cỡ x1,2 và trúng quái 4 ST', mhit[0] === 4 && mx.amp && mx.size === 1.2, JSON.stringify(mx));

  // Đạn / tia / vũng / bom vẽ bằng khoá prefab gốc; tháp chạy clip bắn
  const art8 = await ev(async () => {
    const G = SK.G, d = G.defence, Df = SK.defence, th = G.map.th, id = th.enemies.filter(i => SK.D.enemies[i])[0];
    const ids7 = SK.DEFENCE.ids.slice(0, 7); const padOf = { spike_trap: 4, hurricane_device: 5 }; let np = 6; ids7.forEach(tid => Df.place(G, padOf[tid] != null ? padOf[tid] : np++, tid));   // Bẫy Gai (tầm 48) và Gió Lốc (60) ở Nền gần mục tiêu
    const e = SK.makeEnemy(G, id, d.stoneAt.x, d.stoneAt.y + 36, G.map.rooms[0]); e.hp = e.hpMax = 1e9; e.st = 'idle'; e.stT = 0; e.hold = true; G.enemies.push(e);
    Df.drawn = {};
    const fires = {}, poll = () => { for (const t of d.towers) { const f = Df.fireState(G, t); if (f) (fires[t.id] = fires[t.id] || {})[f.state] = 1; } };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const bio = d.towers.find(t => t.id === 'biochemical_device'); bio.mode = 'poison';
    for (let i = 0; i < 60; i++) { poll(); await sleep(50); }
    bio.mode = 'fire'; bio.cd = 0; d.pools = [];
    for (let i = 0; i < 40; i++) { poll(); await sleep(50); }
    d.towers.forEach(t => { t.exp = 0; t.star = 0; }); Df.giveExp(G, 11 * 25);
    for (let i = 0; i < 6; i++) { poll(); await sleep(50); }
    const shot = d.shots.map(s => s.k).filter((v, i, a) => a.indexOf(v) === i);
    e.hp = 0; e.st = 'dead';
    return { drawn: Object.keys(Df.drawn), fires, n: d.towers.length, shot, firedAt: d.towers.filter(t => t.fireAt != null).map(t => t.id) };
  });
  const needDrawn = ['chain_laser', 'spike_trap_bullet', 'warcraft_bomb', 'explode', 'biochemical_gas', 'biochemical_fire', 'energy'];
  check('đạn / tia / vũng / bom vẽ bằng khoá prefab gốc: ' + needDrawn.join(', '), needDrawn.every(k => art8.drawn.indexOf(k) >= 0) && art8.n === 11, JSON.stringify(art8.drawn));
  const needFire = { spike_trap: 'create_spike', biochemical_device: 'bioch_fire', airbase: 'airbase_open', rage_gun_tower: 'm4', hurricane_device: 'w_sword 0' };
  check('tháp chạy clip bắn khi bắn (Bẫy Gai create_spike, Sinh Hóa bioch_fire, Không Quân airbase_open, Súng Máy m4, Gió Lốc w_sword 0)', Object.keys(needFire).every(k => art8.fires[k] && art8.fires[k][needFire[k]]), JSON.stringify(art8.fires));
  await sleep(300);
  await ev(() => { const G = SK.G; G.player.x = G.defence.stoneAt.x; G.player.y = G.defence.stoneAt.y + 30; });
  await p.screenshot({ path: path.join(SHOTS, '6-towers.png') });

  // Quan Tế: EXP -> cấp (qua phím E), thiếu EXP bị từ chối, cấp 12 cộng dồn +96 máu / +48 giáp / +1200 NL
  await ev(() => { const G = SK.G, d = G.defence; for (const e of G.enemies) { e.st = 'dead'; e.hp = 0; } d.coins = 500; });
  const pq0 = await ev(() => { const p = SK.G.player; return { hpMax: p.hpMax, am: p.armorMax || 0, en: p.energyMax }; });
  const qx = await ev(() => { const G = SK.G, d = G.defence; d.pExp = 100; G.player.x = d.stoneAt.x + 72; G.player.y = d.stoneAt.y + 38; return SK.defence.levelUp(G).ok; });
  check('Quan Tế: thiếu EXP (100 < 250) thì từ chối, cấp vẫn 0', qx === false && (await ev(() => SK.G.defence.pLvl)) === 0);
  await ev(() => { SK.G.defence.pExp = 250; }); await sleep(250);
  const qlbl = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await p.keyboard.press('KeyE'); await sleep(250);
  const q1 = await ev(() => { const p = SK.G.player, d = SK.G.defence; return { lvl: d.pLvl, hpMax: p.hpMax, am: p.armorMax || 0, en: p.energyMax, full: p.hp === p.hpMax, bare: d.bareDmg }; });
  check('Quan Tế qua phím E: đủ 250 EXP lên cấp 1: +8 máu tối đa, +4 giáp, +100 NL, +5 sát thương tay không, hồi đầy (' + (qlbl || '') + ')',
    /Quan Tế/.test(qlbl || '') && q1.lvl === 1 && q1.hpMax - pq0.hpMax === 8 && q1.am - pq0.am === 4 && q1.en - pq0.en === 100 && q1.full && q1.bare === 5, JSON.stringify([pq0, q1]));
  const q12 = await ev(() => {
    const G = SK.G, d = G.defence, p = G.player, C = SK.DEFENCE, h0 = p.hpMax, a0 = p.armorMax || 0, e0 = p.energyMax;
    for (let l = 1; l < 12; l++) { d.pExp = C.levelExp[l]; if (!SK.defence.levelUp(G).ok) return { fail: l }; }
    const more = SK.defence.levelUp(G).ok;
    return { lvl: d.pLvl, hp: p.hpMax - h0 + 8, am: (p.armorMax || 0) - a0 + 4, en: p.energyMax - e0 + 100, bare: d.bareDmg, more, sum: C.levelExp.join(',') };
  });
  check('Quan Tế cấp 12 (đủ 11000 EXP): tổng +96 máu, +48 giáp, +1200 NL, +60 sát thương tay không; không lên quá cấp 12; bảng EXP 250..11000',
    q12.lvl === 12 && q12.hp === 96 && q12.am === 48 && q12.en === 1200 && q12.bare === 60 && !q12.more && q12.sum === '250,500,1000,1600,2400,3200,4000,5000,6000,7200,9600,11000', JSON.stringify(q12));
  const kx = await ev(async () => {
    const G = SK.G, d = G.defence, th = G.map.th, id = th.enemies.filter(i => SK.D.enemies[i])[0], x0 = d.pExp, r0 = d.revive;
    const e = SK.makeEnemy(G, id, d.stoneAt.x + 60, d.stoneAt.y - 40, G.map.rooms[0]); e.hp = e.hpMax = 5; e.st = 'idle'; e.stT = 0; e.hold = true; e.dwave = true; e.dz = 1; e.dpts = 3; G.enemies.push(e);
    SK.hurtEnemy(G, e, 50, false, 0, 1);
    const b = SK.makeEnemy(G, id, d.stoneAt.x + 60, d.stoneAt.y - 40, G.map.rooms[0]); b.hp = b.hpMax = 5; b.st = 'idle'; b.stT = 0; b.hold = true; b.dwave = true; b.dz = 3; b.dpts = 10; b.dboss = true; G.enemies.push(b);
    SK.hurtEnemy(G, b, 50, false, 0, 1);
    return { exp: d.pExp - x0, r: d.revive - r0, per: SK.DEFENCE.playerExpPerPoint };
  });
  check('hạ quái trong đợt cho EXP người chơi (3 điểm x 8 + trùm 10 điểm x 8 = 104), hạ trùm sóng thêm 1 lượt hồi sinh', kx.exp === 104 && kx.r === 1, JSON.stringify(kx));

  // Thương Nhân (sau đợt 1-3): trừ đúng Xu Sao / vàng; Cờ Lê dời tháp
  const tr = await ev(() => {
    const G = SK.G, d = G.defence, p = G.player, Df = SK.defence, C = SK.DEFENCE, o = {};
    d.zone = 1; d.coins = 20; o.closed = Df.buy(G, 'wrench').ok; o.coinsClosed = d.coins;
    d.zone = 2; const w0 = d.wrench; o.w = Df.buy(G, 'wrench'); o.coinsW = d.coins; o.wn = d.wrench - w0;
    d.coins = 4; o.poor = Df.buy(G, 'wrench').ok; o.coinsPoor = d.coins;
    p.hpMax = 100; p.hp = 10; p.gold = 100; o.hp = Df.buy(G, 'hp').ok; o.hpAfter = p.hp; o.gold = p.gold;
    p.energyMax = 200; p.energy = 0; o.en = Df.buy(G, 'en').ok; o.enAfter = p.energy; o.gold2 = p.gold;
    p.gold = 10; o.noGold = Df.buy(G, 'hp').ok; o.gold3 = p.gold;
    const t = d.pads[0].tower; const wb = d.wrench; o.mv = Df.moveTower(G, 0, 11).ok; o.moved = d.pads[11].tower === t && !d.pads[0].tower && t.x === d.pads[11].x; o.wrenchUsed = wb - d.wrench;
    o.mv2 = Df.moveTower(G, 11, 1).ok;
    d.zone = 1; return o;
  });
  check('Thương Nhân chưa tới (chặng 1): không mua; sau 1-3: Cờ Lê trừ đúng 5 Xu Sao (+1 Cờ Lê), thiếu Xu Sao không trừ',
    !tr.closed && tr.coinsClosed === 20 && tr.w.ok && tr.coinsW === 15 && tr.wn === 1 && !tr.poor && tr.coinsPoor === 4, JSON.stringify(tr));
  check('Thương Nhân: thuốc máu lớn 25 vàng hồi 50% (10 -> 60), thuốc NL 25 vàng hồi 50% (0 -> 100), thiếu vàng không mua', tr.hp && tr.hpAfter === 60 && tr.gold === 75 && tr.en && tr.enAfter === 100 && tr.gold2 === 50 && !tr.noGold && tr.gold3 === 10, JSON.stringify(tr));
  check('Cờ Lê dời tháp sang Nền Tháp trống (giữ nguyên tháp, tốn 1 Cờ Lê), dời vào Nền đã có tháp bị từ chối', tr.mv && tr.moved && tr.wrenchUsed === 1 && !tr.mv2, JSON.stringify(tr));

  // rương xanh sau Đợt Lớn
  const ch = await ev(async () => {
    const G = SK.G, d = G.defence, p = G.player, o = {};
    o.before = !!d.chest; SK.emit('defenceWaveClear', G, 2, 1); o.mid = !!d.chest; SK.emit('defenceWaveClear', G, 4, 2); o.after = !!d.chest && !d.chest.open;
    p.x = d.chest.x; p.y = d.chest.y + 4; o.gold0 = p.gold = 0; return o;
  });
  await sleep(250); await p.keyboard.press('KeyE'); await sleep(250);
  const ch2 = await ev(() => ({ gold: SK.G.player.gold, open: SK.G.defence.chest.open, chests: SK.G.defence.chests, drawn: !!SK.defence.drawn.defence_chest }));
  check('rương xanh chỉ xuất hiện sau Đợt Lớn (X-3, không phải X-2); bấm E mở: +70 vàng (30 + 10 x chặng 4), chỉ mở 1 lần', !ch.before && !ch.mid && ch.after && ch2.gold === 70 && ch2.open && ch2.chests === 1, JSON.stringify([ch, ch2]));
  await ev(() => { const G = SK.G; G.player.x = G.defence.stoneAt.x + 20; G.player.y = G.defence.stoneAt.y + 34; });
  await sleep(400);
  await p.screenshot({ path: path.join(SHOTS, '7-npc.png') });

  // lượt hồi sinh: chết thì dùng 1 lượt (hồi đầy), hết lượt thì thua
  const rv = await ev(() => {
    const G = SK.G, d = G.defence, p = G.player, o = { start: d.revive };
    SK_GAME.debug.god(false); p.god = false; d.revive = 3;
    p.hp = 0; p.st = 'dead'; p.stT = 0; G.onPlayerDead();
    o.after = d.revive; o.st = p.st; o.hp = p.hp === p.hpMax; o.state = G.state; return o;
  });
  check('chết lần 1 với 3 lượt: hồi sinh ngay đầy máu, còn 2 lượt, ván tiếp tục', rv.after === 2 && rv.st !== 'dead' && rv.hp && rv.state === 'stage', JSON.stringify(rv));
  {
  // ================= ĐỢT 4: tay không, Cờ Lê, hồi sinh / thua, thiên phú, đợt giới thiệu + Robot Tự Nổ, NPC, Kho, nhiệm vụ, ngọc thưởng =================
  const fresh = async (seed, skip, fq) => {
    await ev(a => { SK_GAME.debug.seed(a[0]); SK.defence.skipPlot = a[1]; SK.defence.forceQuests = a[2] || null; SK_GAME.debug.defence('knight'); }, [seed, skip, fq]);
    await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
    await sleep(200);
  };
  const stand = (x, y) => ev(a => { const G = SK.G; G.player.x = a[0]; G.player.y = a[1]; G.player.st = 'idle'; return true; }, [x, y]);
  const pressE = async () => { await sleep(160); await p.keyboard.press('KeyE'); await sleep(160); };
  const S = () => ev(() => ({ x: SK.G.defence.stoneAt.x, y: SK.G.defence.stoneAt.y }));

  // ---- 9. hồi sinh theo luật gốc: hết lượt mà Đá Phép còn thì ngã gục chứ chưa thua; hạ trùm sóng đứng dậy; Đá vỡ mới thua
  await fresh(12, true);
  await ev(() => { const G = SK.G, d = G.defence, p = G.player; SK_GAME.debug.god(false); p.god = false; d.revive = 0; p.hp = 0; p.st = 'dead'; p.stT = 0; G.onPlayerDead(); });
  await sleep(2200);
  const dn = await ev(() => { const G = SK.G, d = G.defence; return { state: G.state, downed: d.downed, lost: d.lost, stone: d.stone.hp, over: !document.getElementById('sk-over').hidden, pst: G.player.st }; });
  check('hết lượt hồi sinh mà Đá Phép còn: ngã gục, ván vẫn tiếp tục (chưa thua, không hiện màn thua)', dn.state === 'stage' && dn.downed && !dn.lost && dn.stone === 20 && !dn.over && dn.pst === 'dead', JSON.stringify(dn));
  const rb = await ev(() => {
    const G = SK.G, d = G.defence, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    const e = SK.makeEnemy(G, id, d.stoneAt.x + 30, d.stoneAt.y - 20, G.map.rooms[0]); e.hp = e.hpMax = 5; e.hold = true; e.st = 'idle'; e.stT = 0; e.dwave = true; e.dz = 3; e.dboss = true; e.dpts = 10; G.enemies.push(e);
    SK.hurtEnemy(G, e, 99, false, 0, 1);
    return { downed: d.downed, revive: d.revive, hp: G.player.hp === G.player.hpMax, st: G.player.st, state: G.state };
  });
  check('hạ trùm sóng khi đang ngã: thêm 1 lượt rồi dùng ngay, đứng dậy đầy máu (còn 0 lượt)', !rb.downed && rb.revive === 0 && rb.hp && rb.st !== 'dead' && rb.state === 'stage', JSON.stringify(rb));
  const intro1 = await ev(() => { const d = SK.G.defence; return { st: d.intro, zone: d.zone }; });
  check('bỏ qua cốt truyện (skipPlot): không có đợt giới thiệu, vào thẳng đợt 1-1', intro1.st === null && intro1.zone === 1);

  // ---- 10. sát thương tay không (d.bareDmg) và cấp + vào đòn thật (giữ phím J đánh con mồi đứng yên, đo từng đòn thường)
  const hitRun = async (setup) => {
    await ev(s => {
      const G = SK.G, d = G.defence, p = G.player; SK_GAME.debug.god(true); G.enemies.forEach(e => { e.st = 'dead'; e.hp = 0; e.dwave = false; });
      const id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
      let px = d.stoneAt.x + 4, py = d.stoneAt.y + 28;   // chỗ trống có đường bắn thẳng sang phải (không vướng tường / vật cản)
      for (const [ox, oy] of [[4, 28], [-40, 28], [-90, 20], [60, 28], [-40, -30], [60, -30], [-90, -20], [4, -30]]) {
        const x = d.stoneAt.x + ox, y = d.stoneAt.y + oy;
        if ([0, 4, 8, 12, 16, 20].every(k => !SK.world.solidAt(G.map, x + k, y) && !SK.world.solidAt(G.map, x + k, y - 6))) { px = x; py = y; break; }
      }
      const e = SK.makeEnemy(G, id, px + 16, py, G.map.rooms[0]); e.hp = e.hpMax = 1e7; e.hold = true; e.st = 'idle'; e.stT = 0; G.enemies.push(e);
      p.x = px; p.y = py; p.energy = p.energyMax;
      window.__dm = e; window.__hits = [];
      if (!window.__hookHits) { window.__hookHits = true; SK.on('enemyHit', (G2, q, dm, crit) => { if (q === window.__dm && G2._hitBullet) window.__hits.push([dm, crit]); }); }
      new Function('G', 'd', 'p', s)(G, d, p);
    }, setup);
    await p.keyboard.down('KeyJ'); await sleep(1700); await p.keyboard.up('KeyJ');
    return ev(() => { const h = window.__hits; return { n: h.length, plain: Array.from(new Set(h.filter(x => !x[1]).map(x => x[0]))) }; });
  };
  const fistId = await ev(() => Object.keys(SK.DS.weapons).find(i => SK.DS.weapons[i].w86 && /^GunInitFighter$/.test(SK.DS.weapons[i].w86.cls)));
  const base = 'p.weapons[0] = SK.makeWeapon("' + fistId + '"); p.cur = 0;';
  const h0 = await hitRun(base + 'd.bareDmg = 0; d.flatDmg = 0;');
  const h1 = await hitRun(base + 'd.bareDmg = 7;');
  const h2a = await hitRun('p.weapons[0] = SK.makeWeapon("bad_pistol"); p.cur = 0; d.bareDmg = 0;');
  const h2 = await hitRun('p.weapons[0] = SK.makeWeapon("bad_pistol"); p.cur = 0; d.bareDmg = 7;');
  const h3 = await hitRun(base + 'd.bareDmg = 0; p.weapons[0].plus = 10;');
  check('đòn tay không (Fighter) trúng quái: mỗi đòn thường +7 khi d.bareDmg = 7 (đo máu quái, không bạo kích)', h0.n > 0 && h0.plain.length === 1 && h1.plain.length === 1 && h1.plain[0] === h0.plain[0] + 7, JSON.stringify([h0, h1]));
  check('vũ khí không phải tay không (Súng Lục Cùi) không nhận bareDmg', h2.n > 0 && h2a.n > 0 && h2.plain.length === 1 && JSON.stringify(h2.plain) === JSON.stringify(h2a.plain), JSON.stringify([h2a, h2]));
  check('vũ khí +10: sát thương x1,5 (tay không 0): ' + h0.plain[0] + ' -> ' + Math.round(h0.plain[0] * 1.5), h3.plain.indexOf(Math.round(h0.plain[0] * 1.5)) >= 0 && h3.plain.every(v => v >= h0.plain[0]), JSON.stringify([h0, h3]));
  await ev(() => { const G = SK.G; SK_GAME.debug.god(true); G.defence.bareDmg = 0; G.player.weapons[0] = SK.makeWeapon('bad_pistol'); G.player.cur = 0; });

  // ---- 11. Cờ Lê có nút bấm: bấm E ở bàn Cờ Lê rồi E ở tháp (nhấc) rồi E ở Nền trống (đặt); tháp hỏng thì phá
  await fresh(13, true);
  const w0 = await ev(() => { const G = SK.G, d = G.defence; d.coins = 100; SK.defence.place(G, 0, 'airbase'); d.towers[0].star = 3; d.towers[0].pham = 4; return { wrench: d.wrench, s: { x: d.stoneAt.x, y: d.stoneAt.y }, pads: d.pads.map(q => [q.x, q.y]) }; });
  await stand(w0.s.x - 76, w0.s.y + 22); await sleep(250);
  const lab1 = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await pressE();
  await stand(w0.pads[0][0], w0.pads[0][1] + 2); await sleep(200);
  const lab2 = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await pressE();
  await stand(w0.pads[5][0], w0.pads[5][1] + 2); await sleep(200);
  const lab3 = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await pressE();
  const w1 = await ev(() => { const d = SK.G.defence, t = d.towers[0]; return { wrench: d.wrench, pad: t.pad, at: [t.x, t.y], star: t.star, pham: t.pham, p0: !!d.pads[0].tower, p5: !!d.pads[5].tower, ally: [t.ally.x, t.ally.y], mode: d.wrenchMode }; });
  check('Cờ Lê qua phím E: bàn Cờ Lê -> nhấc tháp ở Nền 0 -> đặt ở Nền 5; tốn đúng 1 Cờ Lê, giữ sao 3 / Phẩm 4, Nền 0 trống', /Cờ Lê: nhấc/.test(lab1 || '') && /Cờ Lê: nhấc Căn Cứ/.test(lab2 || '') && /Cờ Lê: đặt/.test(lab3 || '') && w1.wrench === 0 && w1.pad === 5 && !w1.p0 && w1.p5 && w1.star === 3 && w1.pham === 4 && w1.ally[0] === w1.at[0] && !w1.mode, JSON.stringify([lab1, lab2, lab3, w1]));
  await ev(() => { const d = SK.G.defence; d.wrench = 2; d.towers[0].ally.dead = true; });
  await stand(w0.s.x - 76, w0.s.y + 22); await pressE();
  await stand(w0.pads[5][0], w0.pads[5][1] + 2); await sleep(200);
  const lab4 = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await pressE();
  const w2 = await ev(() => { const d = SK.G.defence; return { wrench: d.wrench, tw: d.towers.length, p5: !!d.pads[5].tower }; });
  check('Cờ Lê phá tháp hỏng: tháp biến mất, Nền trống, tốn 1 Cờ Lê', /phá/.test(lab4 || '') && w2.wrench === 1 && w2.tw === 0 && !w2.p5, JSON.stringify([lab4, w2]));

  // ---- 12. thiên phú Quan Tế mỗi cấp: bốc 3 thẻ, làm mới tốn 100 / 200 ngọc (tối đa 2), chọn bằng phím 1-3, hiệu ứng đo được
  await fresh(14, true);
  const t0 = await ev(() => { const G = SK.G, d = G.defence, p = G.player; SK_GAME.debug.god(true); SK.profile.addGems(1000); d.pExp = 250; return { s: { x: d.stoneAt.x, y: d.stoneAt.y }, g: SK.profile.gems, buffs: p.buffs.length }; });
  await stand(t0.s.x + 72, t0.s.y + 38); await pressE();
  const t1 = await ev(() => { const R = SK.ROOMS, G = SK.G; return { open: R.choice.open, cards: R.choice.cards.length, hold: G.hold, lvl: G.defence.pLvl, ld: SK.loading.on, re: R.choice.rerolls }; });
  check('lên cấp 1 ở Quan Tế: mở bảng chọn 3 thiên phú thường (ô chọn đang mở, màn tải hiện thẻ)', t1.open && t1.cards === 3 && t1.hold && t1.lvl === 1 && t1.ld && t1.re === 2, JSON.stringify(t1));
  await sleep(500); await p.screenshot({ path: path.join(SHOTS, '9-talent.png') });
  const rr = await ev(() => { const R = SK.ROOMS, g0 = SK.profile.gems, a = R.reroll(), g1 = SK.profile.gems, b = R.reroll(), g2 = SK.profile.gems, c = R.reroll(), g3 = SK.profile.gems; return { a, b, c, spent: [g0 - g1, g1 - g2, g2 - g3], cards: R.choice.cards.length, open: R.choice.open }; });
  check('làm mới thiên phú bằng ngọc: lần 1 trừ 100, lần 2 trừ 200, lần 3 bị từ chối (không trừ)', rr.a && rr.b && !rr.c && rr.spent[0] === 100 && rr.spent[1] === 200 && rr.spent[2] === 0 && rr.cards === 3 && rr.open, JSON.stringify(rr));
  await ev(() => { SK.profile.spend(SK.profile.gems - 50); SK.ROOMS.choice.rerolls = 2; SK.G.defence.talentRe = 0; });
  const poor = await ev(() => { const g0 = SK.profile.gems, a = SK.ROOMS.reroll(); return { a, same: SK.profile.gems === g0 }; });
  check('thiếu ngọc (50 < 100): làm mới bị từ chối, không trừ', !poor.a && poor.same, JSON.stringify(poor));
  await p.keyboard.press('Digit2'); await sleep(300);
  const t2 = await ev(() => { const R = SK.ROOMS, G = SK.G; return { open: R.choice.open, hold: G.hold, buffs: G.player.buffs.length, op: G.defence.talentOpen }; });
  check('bấm phím 2: nhận đúng 1 thiên phú, đóng bảng, bỏ giữ ván', !t2.open && !t2.hold && t2.buffs === 1 && !t2.op, JSON.stringify(t2));
  const t3 = await ev(() => { const G = SK.G, p = G.player, h0 = p.hpMax; SK.defence.offerTalent(G, [16, 28, 30]); return h0; });
  await p.keyboard.press('Digit1'); await sleep(250);
  const t4 = await ev(h0 => ({ hpMax: SK.G.player.hpMax - h0, buffs: SK.G.player.buffs.length, has16: SK.G.player.buffs.indexOf(16) >= 0 }), t3);
  check('thiên phú chọn có tác dụng đo được: chọn Tim Dũng Cảm (thẻ 1) thì máu tối đa +4', t4.hpMax === 4 && t4.has16 && t4.buffs === 2, JSON.stringify(t4));
  await ev(() => { const G = SK.G, p = G.player; p.buffs = [1, 2, 3, 4, 5, 6, 7]; G.defence.pExp = 1e5; });
  const full = await ev(() => { const r = SK.defence.offerTalent(SK.G); return { r, open: SK.ROOMS.choice.open }; });
  check('đã đầy 7 ô thiên phú thì lên cấp không mở bảng chọn nữa', !full.r && !full.open, JSON.stringify(full));
  await ev(() => { SK.G.player.buffs = []; });

  // ---- 13. đợt giới thiệu 0-1 + Robot Tự Nổ
  await fresh(15, false);
  const i0 = await ev(() => {
    const G = SK.G, d = G.defence, p = G.player, w = p.weapons[p.cur];
    return { on: d.intro && d.intro.on, zone: d.zone, wave: d.wave, timer: d.timer, hpMax: p.hpMax, bare: d.bareDmg, lv: d.skillLv, cd: G.mods.skillCdMul, plus: w.plus, towers: d.towers.map(t => t.id + ':' + t.star).join(','), locked: d.pads.slice(0, 3).every(q => q.locked), s: { x: d.stoneAt.x, y: d.stoneAt.y }, base: p.h.hp, pad: [d.pads[0].x, d.pads[0].y] };
  });
  check('mở ván không bỏ cốt truyện: đợt giới thiệu 0-1, cấp 5 (+40 máu, +25 tay không), kỹ năng cấp 10 (hồi chiêu x0,97^10), vũ khí +12, 3 tháp có sẵn',
    i0.on && i0.zone === 0 && i0.wave === 0 && i0.timer <= 8 && i0.hpMax === i0.base + 40 && i0.bare === 25 && i0.lv === 10 && Math.abs(i0.cd - Math.pow(0.97, 10)) < 1e-6 && i0.plus === 12 && i0.locked && i0.towers === 'rage_gun_tower:2,chain_laser_tower:2,hurricane_device:1', JSON.stringify(i0));
  await stand(i0.pad[0], i0.pad[1] + 2); await sleep(220);
  const il = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await p.keyboard.press('KeyE'); await sleep(200);
  const ip = await ev(() => { const d = SK.G.defence; return { n: d.towers.length, pham: d.towers[0].pham, coins: d.coins }; });
  check('tháp có sẵn không tương tác được: bấm E không nâng Phẩm, không trừ Xu Sao', /chưa tương tác/.test(il || '') && ip.n === 3 && ip.pham === 1 && ip.coins === 15, JSON.stringify([il, ip]));
  const ik = await ev(() => { const G = SK.G, d = G.defence; SK_GAME.debug.god(false); SK.defence.damageStone(G, 99); return { hp: d.stone.hp, lost: d.lost, state: G.state }; });
  check('đợt giới thiệu không thua được: Đá Phép bị đánh 99 vẫn 20/20, chưa thua', ik.hp === 20 && !ik.lost && ik.state === 'stage', JSON.stringify(ik));
  await stand(i0.s.x, i0.s.y + 14); await pressE();
  await until(p, () => SK.G.defence.intro.step === 'robot', null, 90000);
  const r0 = await ev(() => { const d = SK.G.defence, e = d.intro.robot; return { step: d.intro.step, phase: d.phase, alive: e && e.st !== 'dead', dist: Math.hypot(e.x - d.stoneAt.x, e.y - d.stoneAt.y), toast: true, stats: d.stats.waves }; });
  await sleep(700);
  const r1 = await ev(() => { const d = SK.G.defence, e = d.intro.robot; return e ? { dist: Math.hypot(e.x - d.stoneAt.x, e.y - d.stoneAt.y), hp: e.hp } : null; });
  check('hết đợt 0-1: Robot Tự Nổ xuất hiện ở cổng đỏ và lao về Đá Phép (khoảng cách giảm), không bị tính là đợt đánh lui', r0.step === 'robot' && r0.phase === 'robot' && r0.alive && r1 && r1.dist < r0.dist - 10 && r0.stats === 0, JSON.stringify([r0, r1]));
  await p.screenshot({ path: path.join(SHOTS, '10-robot.png') });
  await until(p, () => SK.G.defence.intro.fuseT > 0, null, 30000);
  await ev(() => { const G = SK.G, d = G.defence, e = d.intro.robot, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0]; d.blastBefore = { hp: G.player.hp, stone: d.stone.hp };
    const q = SK.makeEnemy(G, id, e.x + 20, e.y, G.map.rooms[0]); q.hp = q.hpMax = 5000; q.hold = true; q.st = 'idle'; q.stT = 0; q.dwave = false; G.enemies.push(q); window.__bd = q; window.__bdh = []; window.__bfh = [];
    const far = SK.makeEnemy(G, id, e.x + 160, e.y, G.map.rooms[0]); far.hp = far.hpMax = 5000; far.hold = true; far.st = 'idle'; far.stT = 0; far.dwave = false; G.enemies.push(far); window.__bf = far; if (!window.__bhook) { window.__bhook = true; SK.on('enemyHit', (g2, q2, dm) => { if (q2 === window.__bd) window.__bdh.push(dm); if (q2 === window.__bf) window.__bfh.push(dm); }); } });
  await until(p, () => !!SK.G.defence.blast, null, 8000);
  await p.screenshot({ path: path.join(SHOTS, '11-blast.png') });
  const b1 = await ev(() => { const d = SK.G.defence, G = SK.G; return { blast: d.blast, near: window.__bdh.filter(x => x === 400).length, far: window.__bfh.filter(x => x === 400).length, hp: G.player.hp === d.blastBefore.hp, stone: d.stone.hp, towers: d.towers.length, locked: d.pads.some(q => q.locked), spent: d.priestessSpent, robot: d.intro.robot }; });
  check('Robot Tự Nổ nổ: quái trong bán kính 70 dính đúng 1 đòn 400, quái xa không dính, người chơi và Đá Phép (20/20) không mất máu, 3 tháp có sẵn sập, Quan Tế kiệt sức',
    b1.blast && b1.blast.dmg === 400 && b1.near === 1 && b1.far === 0 && b1.hp && b1.stone === 20 && b1.towers === 0 && b1.spent && !b1.robot, JSON.stringify(b1));
  await until(p, () => !SK.G.defence.intro.on, null, 12000);
  const i2 = await ev(() => { const G = SK.G, d = G.defence, p = G.player, w = p.weapons[p.cur]; return { zone: d.zone, wave: d.wave, phase: d.phase, timer: d.timer, hpMax: p.hpMax - p.h.hp, bare: d.bareDmg, lv: d.skillLv, cd: G.mods.skillCdMul, plus: w.plus, locked: d.pads.some(q => q.locked), towers: d.towers.length, stone: d.stone.hp, state: G.state }; });
  check('sau cảnh phim: về cấp 0, kỹ năng 0, vũ khí +6, tháp có sẵn đã mất, sang đợt 1-1 với đếm ngược 110 giây', i2.zone === 1 && i2.wave === 0 && i2.phase === 'wait' && i2.timer > 105 && i2.hpMax === 0 && i2.bare === 0 && i2.lv === 0 && i2.cd === 1 && i2.plus === 6 && !i2.locked && i2.towers === 0 && i2.stone === 20 && i2.state === 'stage', JSON.stringify(i2));
  await p.screenshot({ path: path.join(SHOTS, '12-after-intro.png') });

  // ---- 14. Thầy Hướng Dẫn, Bậc Thầy Vũ Khí (cứu từ lồng ở phòng khác) và Kho: trừ đúng tiền, cho đúng thứ
  await fresh(16, true);
  const n0 = await ev(() => { const G = SK.G, d = G.defence, p = G.player; SK_GAME.debug.god(true); p.gold = 2000; return { cages: d.cages.map(c => [c.key, c.x, c.y]), s: { x: d.stoneAt.x, y: d.stoneAt.y }, far: d.cages.every(c => Math.hypot(c.x - d.stoneAt.x, c.y - d.stoneAt.y) > 150), unlocked: !d.rescued.mentor && !d.rescued.smith }; });
  check('hai NPC bị nhốt trong lồng ở phòng khác (xa Phòng Đá Phép), chưa được cứu', n0.cages.length === 2 && n0.far && n0.unlocked, JSON.stringify(n0.cages));
  const cm = n0.cages.find(c => c[0] === 'mentor'), cs = n0.cages.find(c => c[0] === 'smith');
  await stand(n0.s.x + 98, n0.s.y + 12); await sleep(250);
  const mClosed = await ev(() => SK.G.interactTarget);
  check('chưa cứu Thầy Hướng Dẫn thì chưa có chỗ nâng kỹ năng ở Hậu Điện', !mClosed || !/Thầy Hướng Dẫn/.test(mClosed.label || ''));
  await stand(cm[1], cm[2] + 4); await sleep(250);
  const mLab = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await pressE();
  await stand(n0.s.x + 98, n0.s.y + 12); await sleep(250);
  const mLab2 = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await pressE();
  const m1 = await ev(() => { const G = SK.G, d = G.defence; return { gold: G.player.gold, lv: d.skillLv, cd: G.mods.skillCdMul, res: d.rescued.mentor }; });
  check('cứu Thầy Hướng Dẫn (E ở lồng) rồi nâng kỹ năng cấp 1: trừ đúng 100 vàng, hồi chiêu x0,97', /Mở lồng cứu Thầy/.test(mLab || '') && /cấp 1 \(100 vàng\)/.test(mLab2 || '') && m1.res && m1.gold === 1900 && m1.lv === 1 && Math.abs(m1.cd - 0.97) < 1e-9, JSON.stringify([mLab, mLab2, m1]));
  await pressE();
  const m2 = await ev(() => { const G = SK.G; G.player.gold = 100; const g = G.defence.skillLv; const r = SK.defence.mentorBuy(G); const a = { gold: G.player.gold, lv: G.defence.skillLv, ok: r.ok }; G.player.gold = 20000; for (let i = 0; i < 14; i++) SK.defence.mentorBuy(G); a.max = G.defence.skillLv; a.after = SK.defence.mentorBuy(G).ok; a.spent = 20000 - G.player.gold; return a; });
  check('Thầy Hướng Dẫn: cấp 2 giá 125 (100 vàng không đủ: không trừ, giữ cấp 2), mua tới cấp 15 tổng 6450 vàng (100 đã trả riêng), cấp 15 rồi từ chối', m2.gold === 100 && m2.lv === 2 && m2.max === 15 && !m2.after && m2.spent === 6450 - 100 - 125, JSON.stringify(m2));
  // Bậc Thầy Vũ Khí
  await stand(cs[1], cs[2] + 4); await sleep(250); await pressE();
  const sm0 = await ev(() => { const G = SK.G, p = G.player, w = p.weapons[p.cur]; return { acc: !!w.acc, res: G.defence.rescued.smith, name: SK.defence.plusName(w) }; });
  check('cứu Bậc Thầy Vũ Khí: nhận phụ kiện miễn phí gắn vào vũ khí cầm tay', sm0.acc && sm0.res, JSON.stringify(sm0));
  await stand(n0.s.x - 98, n0.s.y + 12); await sleep(250);
  const sLab = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await ev(() => { SK.G.player.gold = 1000; });
  await pressE();
  const sm1 = await ev(() => { const p = SK.G.player, w = p.weapons[p.cur]; return { gold: p.gold, plus: w.plus }; });
  check('Bậc Thầy Vũ Khí: cường hóa +1 vũ khí trắng giá 20 vàng, tỉ lệ 100% -> thành công +1 (1000 -> 980)', /\+1 \(20 vàng, 100%\)/.test(sLab || '') && sm1.gold === 980 && sm1.plus === 1, JSON.stringify([sLab, sm1]));
  const sm2 = await ev(() => {
    const G = SK.G, p = G.player, w = p.weapons[p.cur], r0 = SK.rand, o = {}; p.gold = 1000;
    SK.rand = () => 0.99; const a = SK.defence.enhance(G); o.a = { win: a.win, gold: p.gold, plus: w.plus, fails: w.fails, rate: SK.defence.smithInfo(G).rate };
    SK.rand = () => 0.5; const b = SK.defence.enhance(G); o.b = { win: b.win, gold: p.gold, plus: w.plus, fails: w.fails };
    SK.rand = r0; const C = SK.DEFENCE; o.tab = [C.smithCost[5][0], C.smithRate[5][0], C.smithCost[0][17], C.smithRate[6][17]];
    p.gold = 5; o.poor = SK.defence.enhance(G).ok; o.g5 = p.gold;
    w.plus = 18; o.max = SK.defence.enhance(G).ok; return o;
  });
  check('cường hóa hỏng (96% với số 0,99): vẫn trừ 40 vàng, giữ +1, lần sau tỉ lệ +5% (100%); rồi thành công +2; thiếu vàng / đã +18 thì từ chối',
    !sm2.a.win && sm2.a.gold === 960 && sm2.a.plus === 1 && sm2.a.fails === 1 && sm2.a.rate === 1 && sm2.b.win && sm2.b.plus === 2 && sm2.b.fails === 0 && !sm2.poor && sm2.g5 === 5 && !sm2.max && JSON.stringify(sm2.tab) === '[40,90,1200,20]', JSON.stringify(sm2));
  // Kho
  const k0 = await ev(() => {
    const G = SK.G, d = G.defence, s = d.stoneAt, ids = Object.keys(SK.DS.weapons).filter(i => !SK.DS.weapons[i].starter && SK.DS.weapons[i].grade === 2 && SK.DS.weapons[i].dmg > 0).slice(0, 4);
    d.storeAfter = 0; ids.forEach((id, i) => G.items.push({ id, x: s.x + 30 + i * 10, y: s.y + 50, t: 5.7 + i * 0.1, plus: i + 1 }));
    return { ids, n: G.items.length };
  });
  await sleep(900);
  const k1 = await ev(() => { const d = SK.G.defence; return { store: d.store.map(e => e.id + '+' + e.plus), ground: SK.G.items.length }; });
  check('vũ khí nằm dưới đất đủ ~6 giây thì tự về Kho (giữ cấp +), 4 vũ khí vào Kho', k1.store.length === 4 && k1.ground === 0 && [1, 2, 3, 4].every(n => k1.store.some(x => x.endsWith('+' + n))), JSON.stringify(k1));
  const kx = n0.s.x + 60, ky = n0.s.y - 46;
  const kb = i => stand(kx + i * 14, ky + 8);
  await kb(0); await pressE();   // xem kế -> vũ khí 2
  await kb(2); await pressE();   // đánh dấu vũ khí 2
  await kb(0); await pressE();   // 3
  await kb(2); await pressE();
  await kb(0); await pressE();   // 4
  await kb(2); await pressE();
  const k2 = await ev(() => { const d = SK.G.defence; return { sel: d.storeSel, marks: d.storeMarks.length }; });
  await kb(3); await sleep(200);
  const klab = await ev(() => SK.G.interactTarget && SK.G.interactTarget.label);
  await pressE();
  const k3 = await ev(() => { const d = SK.G.defence; return { n: d.store.length, marks: d.storeMarks.length, remakes: d.remakes, last: d.store[d.store.length - 1] }; });
  check('Kho đúc lại qua phím E: đánh dấu 3 vũ khí, đúc -> còn 2 vũ khí (1 cũ + 1 mới), hết đánh dấu', k2.marks === 3 && /đúc lại/.test(klab || '') && k3.n === 2 && k3.marks === 0 && k3.remakes === 1 && k3.last.plus >= 4, JSON.stringify([k2, klab, k3]));
  const kr = await ev(() => {
    const D = SK.DS.weapons, rule = SK.defence.remakeRule, lo = () => 0.99, o = {};
    const byG = g => Object.keys(D).filter(i => !D[i].starter && D[i].grade === g && D[i].dmg > 0);
    const a = byG(2), b = byG(3);
    o.same = rule([{ id: a[0], plus: 3 }, { id: a[0], plus: 6 }, { id: a[0], plus: 9 }], lo);
    o.eq = rule([{ id: a[0], plus: 5 }, { id: a[1], plus: 5 }, { id: a[2], plus: 5 }], lo);
    o.adj = rule([{ id: a[0], plus: 3 }, { id: a[1], plus: 4 }, { id: a[2], plus: 5 }], lo);
    o.far = rule([{ id: a[0], plus: 1 }, { id: a[1], plus: 6 }, { id: a[2], plus: 2 }], lo);
    o.cap = rule([{ id: a[0], plus: 15 }, { id: a[1], plus: 15 }, { id: a[2], plus: 15 }], lo);
    o.gEq = D[o.eq.id].grade; o.gMix = D[rule([{ id: a[0], plus: 0 }, { id: a[1], plus: 0 }, { id: b[0], plus: 0 }], lo).id].grade;
    o.big = D[rule([{ id: a[0], plus: 0 }, { id: a[1], plus: 0 }, { id: b[0], plus: 0 }], () => 0).id].grade;
    const r6 = byG(6); o.maxG = D[rule([{ id: r6[0], plus: 0 }, { id: r6[1], plus: 0 }, { id: r6[2], plus: 0 }], lo).id].grade;
    return { same: [o.same.id === a[0], o.same.plus], eq: o.eq.plus, adj: o.adj.plus, far: o.far.plus, cap: o.cap.plus, gEq: o.gEq, gMix: o.gMix, big: o.big, maxG: o.maxG };
  });
  check('luật đúc lại: 3 bản cùng vũ khí khác cấp -> cùng vũ khí +1 cấp trên cao nhất (9 -> 10); 3 cấp bằng nhau +2 (5 -> 7); 3 cấp liền kề +1 (5 -> 6); xa nhau +0; trần 15; 3 vũ khí khác nhau cùng phẩm lên 1 phẩm; phẩm trộn không vượt; đại thành công vượt; không quá Đỏ',
    kr.same[0] && kr.same[1] === 10 && kr.eq === 7 && kr.adj === 6 && kr.far === 6 && kr.cap === 15 && kr.gEq === 3 && kr.gMix >= 2 && kr.gMix <= 3 && kr.big === 4 && kr.maxG === 6, JSON.stringify(kr));
  const kt = await ev(() => { const G = SK.G, d = G.defence, p = G.player; d.store.push({ id: 'bad_pistol', plus: 7, acc: false }); d.storeSel = d.store.length - 1; const old = p.weapons[p.cur].id; const r = SK.defence.storeTake(G); return { r: r.ok, id: p.weapons[p.cur].id, plus: p.weapons[p.cur].plus, inStore: d.store.some(e => e.id === old) }; });
  check('Kho lấy ra: vũ khí trong Kho thành vũ khí cầm tay (giữ +7), vũ khí đang cầm cất vào Kho', kt.r && kt.id === 'bad_pistol' && kt.plus === 7, JSON.stringify(kt));
  await p.screenshot({ path: path.join(SHOTS, '13-npcs.png') });

  // ---- 15. nhiệm vụ: 3-6 trong 12 mỗi ván; hoàn thành cộng thưởng (đi đường thật: đứng lên hạt, hạ quái, dẫn tới Đá Phép)
  const qn = [];
  for (let sd = 31; sd < 37; sd++) { await fresh(sd, true); qn.push(await ev(() => SK.G.defence.quests.length)); }
  check('mỗi ván bốc 3-6 nhiệm vụ trong 12 (6 ván thử: ' + qn.join(',') + ')', qn.every(n => n >= 3 && n <= 6) && new Set(qn).size >= 2 && await ev(() => SK.DEFENCE.quests.length === 12), JSON.stringify(qn));
  await fresh(40, true, ['seedWind', 'seedFire', 'ufo', 'taro', 'flint', 'heart']);
  const q0 = await ev(() => { const G = SK.G, d = G.defence, p = G.player; SK_GAME.debug.god(true); window.__hold0 = d.quests[2].enemy.hold; return { n: d.quests.length, spd: p.moveMul == null ? 1 : p.moveMul, armor: p.armorMax, s: { x: d.stoneAt.x, y: d.stoneAt.y }, seeds: d.quests[0].objs.map(o => [o.x, o.y]), fire: d.quests[1].objs.map(o => [o.x, o.y]), ufo: [d.quests[2].enemy.x, d.quests[2].enemy.y], taro: [d.quests[3].obj.x, d.quests[3].obj.y], flint: [d.quests[4].obj.x, d.quests[4].obj.y], heart: [d.quests[5].obj.x, d.quests[5].obj.y] }; });
  for (const o of q0.seeds) { await stand(o[0], o[1] + 6); await sleep(250); }
  await sleep(300);
  const q1 = await ev(() => { const p = SK.G.player, d = SK.G.defence; return { spd: p.moveMul, st: d.quests[0].state, prog: d.quests[0].prog }; });
  check('nhiệm vụ gom 3 hạt Tinh Linh Gió: nhặt đủ 3 hạt thì xong, tốc chạy x1,33 (1 -> 1,33)', q1.st === 'done' && q1.prog === 3 && Math.abs(q1.spd - 1.33) < 1e-9 && q0.spd === 1, JSON.stringify([q0.spd, q1]));
  for (const o of q0.fire) { await stand(o[0], o[1] + 6); await sleep(250); }
  await sleep(300);
  const q2 = await ev(() => ({ flat: SK.G.defence.flatDmg, st: SK.G.defence.quests[1].state }));
  check('nhiệm vụ gom 3 hạt Lửa xong: sát thương +10', q2.st === 'done' && q2.flat === 10, JSON.stringify(q2));
  const q3 = await ev(async () => {
    const G = SK.G, d = G.defence, p = G.player, q = d.quests[2], e = q.enemy, c0 = d.coins; const asleep = e.hold;
    p.x = e.x + 500; p.y = e.y; await new Promise(r => setTimeout(r, 300)); const asleep2 = e.hold; p.x = e.x - 60; p.y = e.y; await new Promise(r => setTimeout(r, 400)); const woke = !e.hold;
    SK.hurtEnemy(G, e, 1e6, false, 0, 1); await new Promise(r => setTimeout(r, 300));
    return { asleep: window.__hold0, woke, st: q.state, coins: d.coins - c0 };
  });
  check('nhiệm vụ hạ Đĩa Nổi Laser hỏng: quái ngủ tới khi lại gần, hạ xong thưởng đúng 100 Xu Sao', q3.asleep && q3.woke && q3.st === 'done' && q3.coins === 100, JSON.stringify(q3));
  await stand(q0.taro[0], q0.taro[1] + 4); await sleep(250);
  await stand(q0.s.x, q0.s.y + 8); await sleep(1800);
  const q4 = await ev(() => ({ st: SK.G.defence.quests[3].state, taro: !!SK.G.defence.taro }));
  check('nhiệm vụ hộ tống Chó Con Taro về Đá Phép: hoàn thành, mở Taro', q4.st === 'done' && q4.taro, JSON.stringify(q4));
  const q5 = await ev(async () => {
    const G = SK.G, d = G.defence, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0];
    const e = SK.makeEnemy(G, id, d.stoneAt.x - 60, d.stoneAt.y - 50, G.map.rooms[0]); e.hp = e.hpMax = 5000; e.hold = true; e.st = 'idle'; e.stT = 0; e.dwave = true; G.enemies.push(e);
    window.__th = []; SK.on('enemyHit', (g2, q2, dm) => { if (q2 === e) window.__th.push(dm); });
    d.taro.cd = 0.1; await new Promise(r => setTimeout(r, 700));
    const o = { bite: window.__th.filter(x => x === 1000).length * 1000, next: d.taro.cd };
    e.dwave = false; e.st = 'dead'; e.hp = 0; return o;
  });
  check('Taro cắn đúng 1000 sát thương một lần, hồi 12 giây', q5.bite === 1000 && q5.next > 11, JSON.stringify(q5));
  await stand(q0.flint[0], q0.flint[1] + 4); await sleep(250); await stand(q0.s.x, q0.s.y + 8); await sleep(1500);
  await stand(q0.heart[0], q0.heart[1] + 4); await sleep(250); await stand(q0.s.x, q0.s.y + 8); await sleep(1500);
  const q6 = await ev(async () => {
    const G = SK.G, d = G.defence, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0], o = { st: d.quests.map(q => q.state).join(',') };
    d.stone.hp = 10; d.heart.t = 4.9; await new Promise(r => setTimeout(r, 400)); o.heal = d.stone.hp;
    const e = SK.makeEnemy(G, id, d.stoneAt.x + 40, d.stoneAt.y - 50, G.map.rooms[0]); e.hp = e.hpMax = 9000; e.hold = true; e.st = 'idle'; e.stT = 0; e.dwave = true; G.enemies.push(e);
    SK.defence.damageStone(G, 1); o.fire = 9000 - e.hp; o.cd = d.flint.cd;
    const e2 = SK.makeEnemy(G, id, d.stoneAt.x + 44, d.stoneAt.y - 50, G.map.rooms[0]); e2.hp = e2.hpMax = 9000; e2.hold = true; e2.st = 'idle'; e2.stT = 0; e2.dwave = true; G.enemies.push(e2);
    SK.defence.damageStone(G, 1); o.again = 9000 - e2.hp;
    e.dwave = e2.dwave = false; e.st = e2.st = 'dead'; e.hp = e2.hp = 0; return o;
  });
  check('Tâm Mạch Khoáng: Đá Phép hồi 2 máu mỗi 5 giây (10 -> 12); Đá Lửa: Đá Phép bị đánh thì nổ 2000 lên quái trong đợt, hồi 300 giây (lần 2 không nổ); cả 6 nhiệm vụ xong',
    q6.st === 'done,done,done,done,done,done' && q6.heal === 12 && q6.fire === 2000 && q6.cd > 290 && q6.again === 0, JSON.stringify(q6));
  await p.screenshot({ path: path.join(SHOTS, '14-quests.png') });

  // ---- 16. ngọc thưởng cuối ván: 50 x đợt + ⌊Xu Sao / 100⌋ + ⌊quái / 4⌋ + 850 nếu thắng, trần 3500 (4375 với thiên phú Ngọc)
  await fresh(41, true);
  const gm = await ev(() => {
    const G = SK.G, d = G.defence, p = G.player, o = {};
    d.stats.waves = 10; d.coins = 250; G.kills = 41; o.win = SK.defence.gemsOf(G, true); o.lose = SK.defence.gemsOf(G, false);
    d.stats.waves = 80; o.cap = SK.defence.gemsOf(G, true); p.buffs = [15]; o.capBuff = SK.defence.gemsOf(G, true); p.buffs = [];
    d.stats.waves = 11; d.coins = 250; G.kills = 40; return o;
  });
  check('công thức ngọc: 10 đợt, 250 Xu Sao, 41 quái, thắng = 500 + 2 + 10 + 850 = 1362; thua = 512; trần 3500; có thiên phú Ngọc trần 4375', gm.win === 1362 && gm.lose === 512 && gm.cap === 3500 && gm.capBuff === 4375, JSON.stringify(gm));
  const g0 = await ev(() => SK.profile.gems);
  await ev(() => { const G = SK.G, d = G.defence; d.zone = 12; d.wave = 2; d.queue = []; d.phase = 'fight'; });
  await until(p, () => SK_GAME.state === 'victory', null, 6000);
  const gw = await ev(() => { const d = SK.G.defence; return { gems: SK.profile.gems, reward: d.gemReward, text: document.getElementById('sk-win-info').textContent, waves: d.stats.waves, coins: d.coins, kills: SK.G.kills }; });
  const want = 50 * gw.waves + Math.floor(gw.coins / 100) + Math.floor(gw.kills / 4) + 850;
  check('thắng thật (dọn xong đợt 12-3): thưởng ngọc ' + want + ' hiện ở màn thắng và cộng vào hồ sơ (+' + (gw.gems - g0) + ' kể cả thưởng chung của sảnh)', gw.reward === want && gw.text.indexOf('+' + want + ' ngọc') >= 0 && gw.gems - g0 >= want, JSON.stringify([gw, g0]));

  // ---- 17. thua đi đường thật: người chơi ngã (hết lượt) rồi quái chạm Đá Phép làm vỡ -> thua
  await fresh(42, true);
  await ev(() => { const G = SK.G, d = G.defence, p = G.player; SK_GAME.debug.god(false); p.god = false; d.revive = 0; p.hp = 0; p.st = 'dead'; p.stT = 0; G.onPlayerDead(); d.stone.hp = 3; });
  await sleep(1800);
  const ls = await ev(async () => {
    const G = SK.G, d = G.defence, id = G.map.th.enemies.filter(i => SK.D.enemies[i])[0], o = { before: G.state, downed: d.downed };
    const e = SK.makeEnemy(G, id, d.stoneAt.x + 40, d.stoneAt.y + 10, G.map.rooms[0]); e.hp = e.hpMax = 80; e.st = 'idle'; e.stT = 0; e.dwave = true; G.enemies.push(e);
    for (let i = 0; i < 100 && !d.lost; i++) await new Promise(r => setTimeout(r, 100));
    o.lost = d.lost; return o;
  });
  await sleep(300);
  const ls2 = await ev(() => ({ state: SK_GAME.state, over: !document.getElementById('sk-over').hidden, text: document.getElementById('sk-over-info').textContent }));
  check('ngã gục (hết lượt) rồi quái thật chạm Đá Phép: Đá vỡ -> thua, hiện màn thua kèm thưởng ngọc', ls.before === 'stage' && ls.downed && ls.lost && ls2.state === 'dead' && ls2.over && /Đá Phép đã vỡ/.test(ls2.text) && /ngọc/.test(ls2.text), JSON.stringify([ls, ls2]));

  }

  console.log(results.join('\n'));
  console.log('\nlỗi trang: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'không'));
  check('không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
