/*
 * Trốn Tìm (games/tron-tim) — kiểm lõi trận bằng số cụ thể qua window.TT.
 *
 * Chạy:  python -m http.server 8814   (ở gốc repo)   rồi   node test/tron-tim-core.js
 *   TT_URL=http://localhost:8814/games/tron-tim/index.html   TT_SHOTS=D:/phanminhtam-ref/shots (đặt "" để không chụp)
 * Trang mở với ?manual=1 để thời gian chỉ chạy bằng TT.step(n). Hỏng nếu pageerror, console error, response >= 400.
 */
'use strict';
const fs = require('fs');
const { chromium } = require('C:/Users/tamph/AppData/Roaming/npm/node_modules/@playwright/cli/node_modules/playwright');

const URL = process.env.TT_URL || 'http://localhost:8814/games/tron-tim/index.html';
const SHOTS = process.env.TT_SHOTS === undefined ? 'D:/phanminhtam-ref/shots' : process.env.TT_SHOTS;
const SEED = 1;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function main() {
  const browser = await chromium.launch();
  const problems = [];
  async function open(query) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));
    page.on('response', r => { if (r.status() >= 400) problems.push('http ' + r.status() + ': ' + r.url()); });
    await page.goto(URL + '?' + query);
    await page.waitForFunction(() => window.__ready, null, { timeout: 20000 });
    return page;
  }
  const page = await open('seed=' + SEED + '&manual=1');
  const E = (fn, arg) => page.evaluate(fn, arg);
  const shot = async name => { if (SHOTS) { await page.waitForTimeout(250); await page.screenshot({ path: SHOTS + '/tt_core_' + name + '.png' }); } };

  // trợ giúp trong trang: đóng băng bot, đặt chỗ trống gần một điểm
  await E(() => {
    window.__log = [];
    for (const n of ['phase', 'catch', 'down', 'revive', 'dead', 'escape', 'box', 'zone', 'scan', 'gateOpen', 'end', 'attack', 'miss'])
      TT.onEvent(n, e => window.__log.push([n, TT.M.now, TT.M.t, e]));
    window.freezeBots = () => TT.M.actors.forEach(a => { if (a.isBot) TT.addEffect(a, 'freeze', 1e9); });
    window.freeSpot = (x, y) => { const p = TT.mapUtil.nearestFree(TT.M.map, x, y, true); return p; };
    window.logOf = n => window.__log.filter(l => l[0] === n);
  });
  const logOf = n => E(n => window.logOf(n).map(l => [l[1], l[2], l[3]]), n);

  // ---------------------------------------------------------------- 1. pha
  console.log('pha và vai');
  await E(() => { TT.setRole('hide'); window.__log.length = 0; });
  check('khởi đầu ở pha intro', (await E(() => TT.M.phase)) === 'intro');
  await E(() => TT.step(176));
  check('2.93 s vẫn intro', (await E(() => TT.M.phase)) === 'intro');
  await E(() => TT.skipTo('playing'));
  const ph = await E(() => window.logOf('phase').map(l => [l[3].phase, l[1]]));
  const at = n => (ph.find(p => p[0] === n) || [0, -1])[1];
  check('intro -> countdown lúc 3 s', near(at('countdown'), 3, 0.02), at('countdown').toFixed(3));
  check('countdown -> playing lúc 11 s (4 chờ + 4 đếm)', near(at('playing'), 11, 0.02), at('playing').toFixed(3));
  await shot('start');

  for (const role of ['hide', 'seek']) {
    const c = await E(r => { TT.setRole(r); const a = TT.actors(); return { hide: a.filter(x => x.role === 'hide').length, seek: a.filter(x => x.role === 'seek').length, human: a[0].role, n: a.length }; }, role);
    check('10 người, 7 trốn + 3 tìm, người chơi là ' + role, c.n === 10 && c.hide === 7 && c.seek === 3 && c.human === role, JSON.stringify(c));
  }

  // ---------------------------------------------------------------- 2. người tìm đứng yên 5 s
  console.log('người tìm giả dạng');
  await E(() => { TT.setRole('seek'); TT.skipTo('playing'); window.__p0 = TT.actors().filter(a => a.role === 'seek').map(a => [a.x, a.y]); TT.forceIntent(1, 0); });
  await E(() => TT.step(290));   // t = 4.83 s
  const still = await E(() => TT.actors().filter(a => a.role === 'seek').every((a, i) => a.x === window.__p0[i][0] && a.y === window.__p0[i][1]));
  check('3 người tìm không nhúc nhích trong 5 s đầu (cả người chơi bấm đi)', still);
  check('lúc 4.83 s người tìm vẫn mang dạng người trốn', await E(() => TT.actors().filter(a => a.role === 'seek').every(a => a.look === 'hide' && a.form === 'hide')));
  await E(() => TT.step(70));    // t = 6.0 s
  check('6.0 s đã biến hình (sprite thật) nhưng chưa đi được', await E(() => { const h = TT.M.human; return h.look === 'seek' && h.form === 'hide' && TT.speedOf(h) === 0; }));
  await E(() => TT.step(40));    // t = 6.67 s
  const sp = await E(() => ({ form: TT.M.human.form, speed: TT.speedOf(TT.M.human), x: TT.M.human.x, x0: window.__p0[0][0] }));
  check('sau 6.5 s người tìm đi săn, tốc độ 3.575', sp.form === 'seek' && sp.speed === 3.575, sp.speed);
  const x1 = await E(() => {
    const M = TT.M, h = M.human; let best = [1, 0], bl = -1;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let l = 0; while (l < 8 && !TT.mapUtil.boxBlocked(M.map, h.x + d[0] * (l + 0.5), h.y + d[1] * (l + 0.5), 0.3, true)) l += 0.5; if (l > bl) { bl = l; best = d; } }
    h.effects = []; TT.forceIntent(best[0], best[1]); const x = h.x, y = h.y; TT.step(30); TT.forceIntent(null);
    return Math.hypot(h.x - x, h.y - y);
  });
  check('người tìm chạy 0.5 s được ~1.79 ô (3.575 ô/s)', near(x1, 1.7875, 0.05), x1.toFixed(3));
  check('người trốn có tốc độ 2.875', await E(() => { const h = TT.actors().find(a => a.role === 'hide'); h.effects = []; return TT.speedOf(h); }) === 2.875);
  check('tốc độ cộng +1 / chậm 40% / choáng đều qua speedOf', await E(() => {
    const h = TT.actors().find(a => a.role === 'hide'), n = TT.M.now; h.effects = [];
    TT.addEffect(h, 'speedAdd', n + 9, 1); const a = TT.speedOf(h);
    TT.addEffect(h, 'slow', n + 9, 0.6); const b = TT.speedOf(h);
    TT.addEffect(h, 'stun', n + 9); const c = TT.speedOf(h);
    h.effects = []; return Math.abs(a - 3.875) < 1e-9 && Math.abs(b - 3.875 * 0.6) < 1e-9 && c === 0;
  }));

  // ---------------------------------------------------------------- 3. vung trúng
  console.log('tấn công');
  await E(() => { TT.setRole('seek'); TT.skipTo('playing'); TT.step(7 * 60 + 5); window.freezeBots(); TT.forceIntent(0, 0); });
  const att = await E(() => {
    const M = TT.M, h = M.human, hs = TT.actors().filter(a => a.role === 'hide');
    const [v1, v2] = hs;
    h.x = M.map.hidePos[0].x; h.y = M.map.hidePos[0].y;
    const side = (v, dx, dy) => { const p = window.freeSpot(h.x + dx, h.y + dy); v.x = h.x + dx; v.y = h.y + dy; return p; };
    // đặt nạn nhân sát bên phải; nếu vướng tường thì dời người tìm sang ô trống khác
    const free = window.freeSpot(h.x, h.y); h.x = free.x; h.y = free.y;
    v1.x = h.x + 0.8; v1.y = h.y;
    const blocked = TT.mapUtil.boxBlocked(M.map, v1.x, v1.y, 0.3, true);
    TT.swing(0); TT.step(1);
    return { blocked, life: v1.life, cd: h.attackCd, ev: window.logOf('catch').length };
  });
  check('vung trúng người trốn kề bên: bị gục', att.life === 'downed', JSON.stringify(att));
  check('hồi chiêu người chơi 1.5 s', near(att.cd, 1.5, 0.03), att.cd);
  check('sự kiện catch được phát', att.ev === 1);
  const att2 = await E(() => {
    const h = TT.M.human, v2 = TT.actors().filter(a => a.role === 'hide')[1];
    v2.x = h.x + 0.8; v2.y = h.y; TT.swing(0); TT.step(1);
    return v2.life;
  });
  check('đang hồi chiêu: vung tiếp không trúng', att2 === 'alive', att2);
  const lunge = await E(() => { const h = TT.M.human; h.x = h.x; const x0 = h.x; TT.forceIntent(-1, 0); TT.step(30); const moved = Math.abs(h.x - x0); TT.forceIntent(null); return moved; });
  check('đòn lao đứng yên 0.6 s (0.5 s sau vẫn chưa nhúc nhích)', lunge === 0, lunge);
  const miss = await E(() => {
    TT.step(100);   // hết hồi chiêu
    const h = TT.M.human; TT.actors().filter(a => a.role === 'hide').forEach(v => { v.x = h.x + 20; v.y = h.y; });
    const n0 = window.logOf('miss').length; TT.swing(Math.PI / 2); TT.step(1);
    return window.logOf('miss').length - n0;
  });
  check('vung vào khoảng không: phát miss ("MISS")', miss === 1, miss);
  const behind = await E(() => {
    TT.step(100);
    const h = TT.M.human, v = TT.actors().filter(a => a.role === 'hide')[3];
    v.x = h.x - 0.9; v.y = h.y; TT.swing(0); TT.step(1);   // nạn nhân phía sau lưng, đòn hướng phải
    return v.life;
  });
  check('đòn có hướng: người trốn sau lưng không trúng', behind === 'alive', behind);

  // ---------------------------------------------------------------- 4. cứu
  console.log('cứu người gục');
  await E(() => { TT.setRole('hide'); TT.skipTo('playing'); TT.step(60); window.freezeBots(); window.__log.length = 0; TT.forceIntent(0, 0); });
  const rv = await E(() => {
    const M = TT.M, h = M.human, d = TT.actors().find(a => a.role === 'hide' && a.isBot);
    const p = window.freeSpot(h.x, h.y); h.x = p.x; h.y = p.y; d.x = h.x + 0.5; d.y = h.y;
    TT.downHider(M, d, 'seeker', null);
    TT.step(170);   // 2.83 s đứng yên
    const mid = [d.life, d.revive.t];
    TT.step(20);    // 3.17 s
    return { mid, end: d.life, ev: window.logOf('revive').length, by: window.logOf('revive')[0] && window.logOf('revive')[0][3].by };
  });
  check('đứng yên 2.83 s chưa cứu xong', rv.mid[0] === 'downed' && near(rv.mid[1], 2.83, 0.05), JSON.stringify(rv.mid));
  check('đứng yên 3 s thì đồng đội đứng dậy (revive, by = 0)', rv.end === 'alive' && rv.ev === 1 && rv.by === 0, JSON.stringify(rv));
  const rv2 = await E(() => {
    const M = TT.M, h = M.human, d = TT.actors().find(a => a.role === 'hide' && a.isBot);
    TT.downHider(M, d, 'seeker', null);
    d.x = h.x + 0.5; d.y = h.y;
    TT.step(100);   // 1.67 s
    const t1 = d.revive.t;
    h.effects = []; TT.forceIntent(1, 0); TT.step(2); TT.forceIntent(0, 0);
    const t2 = d.revive.t, by = d.revive.by;
    return { t1, t2, by };
  });
  check('người cứu mà di chuyển thì tiến độ về 0', rv2.t1 > 1.5 && rv2.t2 === 0 && rv2.by === null, JSON.stringify(rv2));

  console.log('gục -> chết sau 60 s');
  await E(() => { TT.setRole('hide'); TT.skipTo('playing'); TT.step(60); window.freezeBots(); window.__d = TT.actors().find(a => a.role === 'hide' && a.isBot); TT.downHider(TT.M, window.__d, 'seeker', null); window.__d0 = TT.M.now; });
  await E(() => TT.step(59 * 60));
  check('59 s sau: vẫn gục (còn chờ cứu)', (await E(() => window.__d.life)) === 'downed');
  await E(() => TT.step(2 * 60));
  check('61 s sau: chết hẳn, phát dead', (await E(() => window.__d.life)) === 'dead' && (await E(() => window.logOf('dead').length)) === 1);

  // ---------------------------------------------------------------- 5. vùng an toàn
  console.log('vùng an toàn');
  const z0 = await E(() => { TT.setRole('hide'); TT.skipTo('playing'); const z = TT.M.zone; return { r: z.cur.r, c: z.circles.map(c => Math.round(c.r)) }; });
  check('vòng đầu bán kính 80, 5 vòng 80..20', z0.r === 80 && JSON.stringify(z0.c) === '[80,65,50,35,20]', JSON.stringify(z0));
  const z1 = await E(() => { TT.step(34 * 60 + 3); return [TT.M.zone.step, Math.round(TT.M.zone.cur.r * 10) / 10]; });
  check('sau 34 s thu xong một bước (80 -> 65), sang bước 1', z1[0] === 1 && near(z1[1], 65, 0.3), JSON.stringify(z1));
  await E(() => { TT.M.t = 135; TT.step(70); });
  const zr = await E(() => [TT.M.t, TT.M.zone.step, TT.M.zone.cur.r]); check('sau 4 lần thu (136 s) vòng cuối bán kính 20', zr[2] === 20, JSON.stringify(zr));
  await shot('zone_shrunk');
  const zd = await E(() => {
    TT.setRole('hide'); TT.skipTo('playing'); window.freezeBots();
    const M = TT.M, h = M.human;
    M.t = 100;   // vòng ~ r 50..35
    TT.step(1);
    let best = null, bd = -1;
    for (let i = 0; i < M.map.W * M.map.H; i++) if (M.map.reach[i] && M.map.kind[i] === 0) {
      const x = (i % M.map.W) + 0.5, y = ((i / M.map.W) | 0) + 0.5, d = Math.hypot(x - M.zone.cur.x, y - M.zone.cur.y);
      if (d > bd) { bd = d; best = { x, y }; }
    }
    h.x = best.x; h.y = best.y; TT.addEffect(h, 'freeze', 1e9);
    const hp0 = h.hp, out = TT.outsideZone(M, h);
    TT.step(150);   // 2.5 s
    const hpMid = h.hp;
    TT.step(160);   // 5.17 s
    return { hp0, out, hpMid, life: h.life, cause: window.logOf('down').slice(-1)[0][3].cause };
  });
  check('ngoài vùng: người chơi máu 5', zd.out && zd.hp0 === 5);
  check('ngoài vùng 2.5 s: mất 2 máu (còn 3)', zd.hpMid === 3, zd.hpMid);
  check('ngoài vùng 5.2 s: máu 5 hết -> gục (cause zone)', zd.life === 'downed' && zd.cause === 'zone', JSON.stringify(zd));
  const sz = await E(() => {
    TT.setRole('seek'); TT.skipTo('playing'); TT.step(7 * 60 + 10); const M = TT.M, h = M.human;
    const s0 = TT.speedOf(h);
    h.x = 2; h.y = 2; M.t = 100; TT.step(1);   // góc bản đồ: ngoài vòng
    return { s0, out: TT.outsideZone(M, h), s1: TT.speedOf(h) };
  });
  check('người tìm ngoài vùng nhanh thêm 30% (3.575 -> 4.6475)', sz.s0 === 3.575 && sz.out && near(sz.s1, 3.575 * 1.3, 1e-6), JSON.stringify(sz));

  // ---------------------------------------------------------------- 6. cổng
  console.log('cổng và kết thúc');
  await E(() => { TT.setRole('hide'); TT.skipTo('playing'); window.freezeBots(); TT.M.t = 120; window.__log.length = 0; TT.forceIntent(0, 0);
    TT.actors().forEach((a, i) => { if (a.role === 'hide') { const p = window.freeSpot(TT.M.gate.x - 4 - (i % 3), TT.M.gate.y + 2 * (i % 4)); a.x = p.x; a.y = p.y; } }); });
  await E(() => TT.step(14 * 60));   // t = 134 s
  check('clock 16 s: cổng chưa đếm', (await E(() => TT.M.gate.state)) === 'closed');
  await E(() => TT.step(2 * 60));    // t = 136 s -> clock 14
  check('clock <= 15: cổng bắt đầu đếm 15 s', (await E(() => TT.M.gate.state)) === 'counting');
  await E(() => TT.step(13 * 60));   // t = 149 s
  check('149 s: cổng chưa mở', (await E(() => TT.M.gate.state)) === 'counting');
  await E(() => TT.step(2 * 60));    // t = 151 s
  const go = await logOf('gateOpen');
  check('cổng mở quanh clock 0 (t = 150 s), phát gateOpen', (await E(() => TT.M.gate.state)) === 'open' && go.length === 1 && near(go[0][1], 150, 0.1), go[0] && go[0][1].toFixed(2));
  await E(() => { const M = TT.M, h = M.human; h.x = M.gate.x; h.y = M.gate.y; TT.step(1); });
  check('3 s cảnh mở cổng: chưa ai thoát', (await E(() => TT.M.phase)) === 'playing');
  await shot('gate_open');
  await E(() => TT.step(4 * 60));
  const end1 = await E(() => ({ phase: TT.M.phase, res: TT.M.result, life: TT.M.human.life }));
  check('người trốn vào cổng đã mở: thắng bên trốn, kết thúc', end1.phase === 'ending' && end1.res && end1.res.winner === 'hide' && end1.res.by === 0 && end1.life === 'escaped', JSON.stringify(end1));
  await shot('end_hide');
  check('sự kiện escape và end được phát', (await E(() => window.logOf('escape').length)) === 1 && (await E(() => window.logOf('end').length)) === 1);

  await E(() => { TT.setRole('seek'); TT.skipTo('playing'); TT.step(7 * 60 + 5); window.__log.length = 0; TT.actors().filter(a => a.role === 'hide').forEach(h => TT.downHider(TT.M, h, 'seeker', 0)); TT.step(1); });
  const end2 = await E(() => ({ phase: TT.M.phase, res: TT.M.result }));
  check('mọi người trốn gục cùng lúc: người tìm thắng', end2.phase === 'ending' && end2.res && end2.res.winner === 'seek', JSON.stringify(end2));
  const frozen = await E(() => { const a = TT.actors()[3], x = a.x; TT.step(120); return a.x === x; });
  check('hết trận: mọi người đứng yên', frozen);

  await E(() => { TT.setRole('hide'); TT.skipTo('playing'); TT.step(10); TT.actors().filter(a => a.role === 'hide').slice(0, 6).forEach(h => { h.life = 'dead'; }); TT.step(1); });
  check('còn 1 người trốn sống thì chưa hết trận', (await E(() => TT.M.phase)) === 'playing');
  check('người trốn cuối được +1.5 tốc độ (2.875 -> 4.375)', await E(() => { const h = TT.actors().find(a => a.role === 'hide' && a.life === 'alive'); return Math.abs(TT.speedOf(h) - 4.375) < 1e-9; }));

  // ---------------------------------------------------------------- 7. hộp, quét
  console.log('hộp và quét');
  const bx = await E(() => {
    TT.setRole('hide'); TT.skipTo('playing'); window.freezeBots();
    const M = TT.M, h = M.human, it = M.items.find(i => i.kind === 'buff');
    h.x = it.x; h.y = it.y; const n0 = window.logOf('box').length;
    M.rng = () => 0;   // roll 0 = +1 tốc độ 5 s cho bản thân
    TT.step(1);
    const sp = TT.speedOf(h);
    TT.step(5 * 60 + 10);
    return { ev: window.logOf('box').length - n0, sp, after: TT.speedOf(h), ready: it.readyAt - M.now };
  });
  check('chạm hộp buff: +1 tốc độ trong 5 s rồi hết', bx.ev === 1 && near(bx.sp, 3.875, 1e-9) && bx.after === 2.875, JSON.stringify(bx));
  check('hộp hồi lại sau 10 s', bx.ready > 4 && bx.ready < 5, bx.ready);
  const sc = await E(() => { TT.setRole('hide'); TT.skipTo('playing'); window.__log.length = 0; TT.step(44 * 60); const n0 = window.logOf('scan').length; TT.step(2 * 60); return { n0, n1: window.logOf('scan').length, rev: TT.actors().filter(a => TT.hasEffect(a, 'reveal', TT.M.now)).length }; });
  check('quét lúc 45 s: phát scan, đối phương bị lộ', sc.n0 === 0 && sc.n1 === 1 && sc.rev === 10, JSON.stringify(sc));
  const sc2 = await E(() => { TT.step(1.3 * 60); return TT.actors().filter(a => TT.hasEffect(a, 'reveal', TT.M.now)).length; });
  check('lộ vị trí chỉ 2 s', sc2 === 0, sc2);

  // ---------------------------------------------------------------- 8. bot chơi 60 s + cả trận
  console.log('bot tự chơi');
  const sim = await E(() => {
    TT.setRole('hide'); TT.skipTo('playing');
    const p0 = TT.actors().map(a => [a.x, a.y]); window.__log.length = 0;
    TT.step(60 * 60);
    const moved = TT.actors().filter((a, i) => a.isBot && Math.hypot(a.x - p0[i][0], a.y - p0[i][1]) > 3).length;
    return { moved, attacks: window.logOf('attack').length, catches: window.logOf('catch').length, phase: TT.M.phase, states: [...new Set(TT.actors().filter(a => a.ai).map(a => a.ai.state))] };
  });
  check('60 s bot-only không lỗi, đa số bot di chuyển', sim.moved >= 6, JSON.stringify(sim));
  check('người tìm bot vung tay ít nhất một lần', sim.attacks >= 1, sim.attacks);
  const full = await E(() => { for (let i = 0; i < 60 * 260 && TT.M.phase !== 'ending'; i++) TT.step(1); return { phase: TT.M.phase, res: TT.M.result, t: Math.round(TT.M.t) }; });
  check('cả trận bot chạy tới khi có kết quả (trong 260 s)', full.phase === 'ending' && full.res, JSON.stringify(full));
  await shot('end_bots');

  // ---------------------------------------------------------------- 9. ảnh chơi thật
  if (SHOTS) {
    await E(() => { TT.restart({ humanRole: 'hide' }); TT.skipTo('playing'); TT.step(60 * 25); });
    await shot('playing');
    await E(() => { TT.restart({ humanRole: 'seek' }); TT.skipTo('playing'); TT.step(60 * 30); });
    await shot('playing_seek');
  }
  check('không có console error / pageerror / request lỗi (chế độ manual)', problems.length === 0, problems.slice(0, 3).join(' | '));

  // chạy thật (vòng lặp tự bước) vài giây
  const live = await open('seed=' + SEED + '&play=1');
  await live.waitForTimeout(4000);
  const lt = await live.evaluate(() => TT.M.now);
  check('chế độ thật: vòng lặp tự chạy (>2 s trôi qua)', lt > 2, lt.toFixed(2));
  check('không lỗi ở chế độ thật', problems.length === 0, problems.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log('FAIL (ngoại lệ) ' + (e && e.stack || e)); process.exit(1); });
