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

  // ---- 6. qua đủ 3 đợt chặng 1: thắng chặng
  const win = await ev(async () => {
    const G = SK.G, d = G.defence, waves = [];
    SK.on('defenceWaveClear', (G2, z, w) => waves.push(z + '-' + (w + 1)));
    G.player.x = d.stoneAt.x; G.player.y = d.stoneAt.y + 44;
    for (let w = 0; w < 3; w++) {
      SK.defence.skip(G);
      const t0 = Date.now();
      while (Date.now() - t0 < 90000 && G.state === 'stage' && d.stats.waves <= w) {
        for (const e of G.enemies) if (e.dwave && e.st !== 'dead') G.player.god = true;   // người chơi trụ lại, tháp tự lo
        await new Promise(r => setTimeout(r, 150));
      }
      if (G.state !== 'stage') break;
    }
    await new Promise(r => setTimeout(r, 300));
    return { state: G.state, waves, stone: d.stone.hp, won: d.won, kills: d.stats.kills, overlay: !document.getElementById('sk-win').hidden, text: document.getElementById('sk-win-info').textContent, towers: d.towers.length };
  });
  check('qua đủ 3 đợt chặng 1 (1-1, 1-2, 1-3): thắng chặng, hiện màn thắng', win.state === 'victory' && win.won && win.waves.join(',') === '1-1,1-2,1-3' && win.overlay, JSON.stringify(win));
  check('Đá Phép còn sống khi thắng; ba đợt có quái bị hạ', win.stone > 0 && win.kills > 0, 'đá ' + win.stone + ' · hạ ' + win.kills);
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
