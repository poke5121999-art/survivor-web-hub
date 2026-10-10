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
  await ev(() => { document.getElementById('hs-modes').hidden = true; SK_GAME.debug.seed(7); SK.lobby.launch('knight', 'defence', []); });
  await until(p, () => SK_GAME.state === 'stage' && SK_GAME.phase === 'play', null, 10000);
  const SK_C_OK = await ev(() => SK.DEFENCE.countdown === 110);
  const s0 = await ev(() => {
    const G = SK.G, d = G.defence, r = G.map.rooms[0], pl = G.player;
    return { mode: SK_GAME.mode, stone: d.stone.hp, max: d.stone.max, pads: d.pads.length, gates: d.gates.length, timer: d.timer, coins: d.coins, phase: d.phase,
      inRoom: d.stoneAt.x > r.x0 * 16 && d.stoneAt.x < (r.x1 + 1) * 16 && d.stoneAt.y > r.y0 * 16 && d.stoneAt.y < (r.y1 + 1) * 16, portal: !!G.portal,
      gatesOk: d.gates.every(g => !SK.world.solidAt(G.map, g.x, g.y)), n: SK.STAGES.length, pl: [pl.x, pl.y], st: [d.stoneAt.x, d.stoneAt.y] };
  });
  check('vào ván: mode defence, Đá Phép 20/20 trong phòng, 8 Nền Tháp, 3 cổng đỏ, đếm ngược 110 giây, không có cổng ải sau',
    s0.mode === 'defence' && s0.stone === 20 && s0.max === 20 && s0.pads === 8 && s0.gates === 3 && s0.timer > 100 && s0.timer <= 110 && SK_C_OK && s0.inRoom && !s0.portal && s0.gatesOk && s0.n === 1, JSON.stringify(s0));
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
  const ids = await ev(() => SK.DEFENCE.ids.slice(1));
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
    const need = ['tower_base', 'defence_enemy_gate', 'coin_star'].concat(SK.DEFENCE.ids);
    const per = need.map(n => [n, SK.prefab(n) !== null && SK.prefab(n).length > 0]);
    const cv = document.createElement('canvas'); cv.width = cv.height = 120; const cx = cv.getContext('2d');
    const drew = SK.DEFENCE.ids.map(id => SK.drawPrefab(cx, SK.prefab(id), 60, 90, { scale: 0.5, t: 0 }));
    const stoneF = SK.D.extra.sprites['^magic_stone$'];
    return { per, A, drew, stone: !!(stoneF && stoneF[0] && SK.frame(stoneF[0])), towers: d.towers.length };
  });
  check('Đá Phép, Nền Tháp, cổng đỏ, Xu Sao và cả 7 loại tháp đã dựng có prefab gốc (SK.prefab khác null) và SK.drawPrefab vẽ được',
    art.per.every(x => x[1]) && art.drew.every(Boolean) && art.stone && art.A.pad && art.A.gate && art.A.coin && art.A.towers.length === 7 && art.towers === 7, JSON.stringify(art));
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

  console.log(results.join('\n'));
  console.log('\nlỗi trang: ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'không'));
  check('không lỗi trang', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\nĐẠT ' + pass + ' · HỎNG ' + fail);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
