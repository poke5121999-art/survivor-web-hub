/*
 * Vực Săn: mô phỏng thuần (Node, không trình duyệt). Mỗi phép thử dựng một trận có đội hình "human" đứng im (không bot nghĩ gì),
 * đặt người vào chỗ thoáng đã kiểm bằng tia, ghi Intent rồi bước 1/60 s. Số mong đợi là SỐ TÍNH TAY từ TUNING, không đọc lại từ TUNING;
 * phần đầu ghim các số TUNING mà chúng dựa vào để đổi cân bằng thì lỗi báo thẳng chỗ cần tính lại.
 * Chạy: node test/vuc-san-sim.js
 */
'use strict';
const T = require('./vuc-san-lib');
const W = T.nodeSim(T.SIM_FILES);
const VS = W.VS, SIM = VS.sim, TU = VS.TUNING, DT = 1 / 60;

const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
const D4 = ['dave', 'hai', 'lan', 'bao'], S2 = ['Blacktip_Reefshark', 'Tiger_Shark'];

function lineup(ctrl, divers, sharks) {
  divers = divers || D4; sharks = sharks || S2;
  return divers.map((id, i) => ({ team: 'diver', defId: id, name: 'T' + i, ctrl })).concat(sharks.map((id, i) => ({ team: 'shark', defId: id, name: 'C' + i, ctrl })));
}
function step(m, n) { for (let i = 0; i < n; i++) SIM.step(m, DT); return m; }
// Mặc định gỡ miễn sát thương lúc mới sinh để các thế trận không phụ thuộc 3 s đầu; o.immune giữ nguyên nó.
function rig(o) {
  o = o || {};
  const m = SIM.createMatch({ seed: o.seed || 1, mapId: o.map || 'A01', lineup: lineup(o.ctrl || 'human', o.divers, o.sharks) });
  if (o.play !== false) step(m, 240);
  if (!o.immune) m.actors.forEach((a) => SIM.removeEffects(a, 'spawnImmune'));
  return m;
}
function put(a, x, y, ang) {
  a.x = x; a.y = y; a.vx = 0; a.vy = 0;
  if (ang !== undefined) { a.ang = ang; a.intent.aimX = x + Math.cos(ang); a.intent.aimY = y + Math.sin(ang); }
}
function aimAt(a, x, y) { a.intent.aimX = x; a.intent.aimY = y; }
const ev = (m, type) => m.events.filter((e) => e.type === type);
const speedOf = (a) => Math.hypot(a.vx, a.vy);
function stepUntil(m, pred, max) { for (let i = 0; i < max; i++) { if (pred()) return i; SIM.step(m, DT); } return pred() ? max : -1; }

// Chỗ thoáng nhất của A01 nằm sâu dưới mặt nước tối thiểu 6 m: nơi bày các thế trận có khoảng cách tính tay.
function findArena(m) {
  const w = m.world;
  let best = null;
  for (let x = -60; x <= 60; x += 2) for (let y = -20; y <= 14; y += 2) {
    if (!w.open(x, y, 0.5)) continue;
    let lo = 0, hi = 30;
    for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (w.open(x, y, mid)) lo = mid; else hi = mid; }
    if (!best || lo > best.c) best = { x, y, c: lo };
  }
  return best;
}

// Tìm điểm đứng (x,y) hướng a (rad) mà tia dài len cắt đá lần đầu ở khoảng hMin..hMax và có chỗ thoáng bán kính clear nằm sau lớp đá trong tầm back.
function findBehindWall(m, o) {
  const w = m.world, statics = m.pods.concat(m.o2);
  for (let y = 12; y >= -22; y -= 2) for (let x = -62; x <= 62; x += 2) {
    if (!w.open(x, y, o.stand) || statics.some((p) => Math.hypot(p.x - x, p.y - y) < o.farFromLights)) continue;
    for (let deg = 0; deg < 360; deg += 10) {
      const a = deg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), hit = w.raycast(x, y, x + dx * o.len, y + dy * o.len);
      if (!hit) continue;
      const h = hit.t * o.len;
      if (h < o.hMin || h > o.hMax) continue;
      for (let s = h + 0.3; s <= o.back; s += 0.1) {
        const px = x + dx * s, py = y + dy * s;
        if (w.open(px, py, o.clear)) return { x, y, a, h, bx: px, by: py, fx: x + dx * h * 0.5, fy: y + dy * h * 0.5, dx, dy };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Số TUNING mà phép thử tính tay dựa vào');
{
  const pins = [
    ['match.length', TU.match.length, 240], ['match.intro', TU.match.intro, 4], ['match.tickets', TU.match.tickets, 4], ['match.targetPct', TU.match.targetPct, 0.6], ['match.spawnImmune', TU.match.spawnImmune, 3],
    ['diver.r', TU.diver.r, 0.3], ['diver.accel', TU.diver.accel, 6], ['diver.drag', TU.diver.drag, 2.6], ['diver.o2Drain', TU.diver.o2Drain, 0.6],
    ['diver.boostMul', TU.diver.boostMul, 1.4], ['diver.boostDrainMul', TU.diver.boostDrainMul, 2.5],
    ['diver.downT', TU.diver.downT, 12], ['diver.reviveT', TU.diver.reviveT, 2], ['diver.reviveO2', TU.diver.reviveO2, 35], ['diver.interactR', TU.diver.interactR, 1.6],
    ['diver.respawnT', TU.diver.respawnT, 7], ['diver.kgSlow', TU.diver.kgSlow, 0.02], ['diver.maxKg', TU.diver.maxKg, 20], ['diver.harpoonRange', TU.diver.harpoonRange, 9],
    ['diver.harpoonSpeed', TU.diver.harpoonSpeed, 18], ['diver.harpoonSlow', TU.diver.harpoonSlow, 0.3], ['diver.harpoonSlowT', TU.diver.harpoonSlowT, 0.5],
    ['diver.iframes', TU.diver.iframes, 1.2], ['diver.struggleCut', TU.diver.struggleCut, 0.15],
    ['shark.turnRate', TU.shark.turnRate, 3.2], ['shark.accel', TU.shark.accel, 3], ['shark.drag', TU.shark.drag, 1.6],
    ['shark.biteCd', TU.shark.biteCd, 1.6], ['shark.lungeT', TU.shark.lungeT, 0.35], ['shark.biteReach', TU.shark.biteReach, 0.6],
    ['shark.holdT', TU.shark.holdT, 1.5], ['shark.holdDrain', TU.shark.holdDrain, 12], ['shark.staminaMax', TU.shark.staminaMax, 100], ['shark.staminaUse', TU.shark.staminaUse, 45],
    ['shark.staminaRegen', TU.shark.staminaRegen, 22], ['shark.outT', TU.shark.outT, 8], ['shark.regen', TU.shark.regen, 6], ['shark.regenDelay', TU.shark.regenDelay, 5], ['shark.creditWindow', TU.shark.creditWindow, 10],
    ['effects.slowFloor', TU.effects.slowFloor, 0.4], ['effects.slowImmune', TU.effects.slowImmune, 2], ['effects.ccImmune', TU.effects.ccImmune, 2],
    ['loot.count.A', TU.loot.count.A, 12], ['loot.count.B', TU.loot.count.B, 16], ['loot.count.C', TU.loot.count.C, 18],
    ['o2box.amount', TU.o2box.amount, 35], ['o2box.cooldown', TU.o2box.cooldown, 20], ['o2box.r', TU.o2box.r, 1.2], ['pod.r', TU.pod.r, 2], ['pod.safeR', TU.pod.safeR, 5],
    ['vision.beamAngle', TU.vision.beamAngle, 60], ['vision.beamRange', TU.vision.beamRange, 13], ['vision.beamRays', TU.vision.beamRays, 48], ['vision.selfGlow', TU.vision.selfGlow, 2],
    ['vision.podGlow', TU.vision.podGlow, 5], ['vision.o2Glow', TU.vision.o2Glow, 2.5], ['vision.sharkSense', TU.vision.sharkSense, 7], ['vision.beacon', TU.vision.beacon, 18],
    ['vision.bloodPct', TU.vision.bloodPct, 0.3], ['vision.bloodRange', TU.vision.bloodRange, 30],
    ['dave.o2', VS.DIVERS.dave.o2, 100], ['dave.speed', VS.DIVERS.dave.speed, 2.6], ['dave.dmg', VS.DIVERS.dave.dmg, 24], ['dave.reload', VS.DIVERS.dave.reload, 1],
    ['hai.dmg', VS.DIVERS.hai.dmg, 20], ['hai.reload', VS.DIVERS.hai.reload, 0.8], ['tung.skill', VS.DIVERS.tung.skill, 'min-cam-bien'],
    ['Blacktip.hp', VS.SHARKS.Blacktip_Reefshark.hp, 320], ['Blacktip.speed', VS.SHARKS.Blacktip_Reefshark.speed, 4.2], ['Blacktip.dash', VS.SHARKS.Blacktip_Reefshark.dash, 7],
    ['Blacktip.bite', VS.SHARKS.Blacktip_Reefshark.bite, 26], ['Blacktip.r', VS.SHARKS.Blacktip_Reefshark.r, 0.9], ['Tiger.bite', VS.SHARKS.Tiger_Shark.bite, 34], ['Tiger.hp', VS.SHARKS.Tiger_Shark.hp, 480],
    ['lao-vut', [VS.SKILL_DATA['lao-vut'].cd, VS.SKILL_DATA['lao-vut'].dur, VS.SKILL_DATA['lao-vut'].speedMul, VS.SKILL_DATA['lao-vut'].refillStamina, VS.SKILL_DATA['lao-vut'].resetBite].join(), [9, 1.8, 1.8, true, true].join()],
    ['binh-o2', [VS.SKILL_DATA['binh-o2'].cd, VS.SKILL_DATA['binh-o2'].o2].join(), [24, 40].join()], ['min-cam-bien.charges', VS.SKILL_DATA['min-cam-bien'].charges, 2]
  ];
  const bad = pins.filter((p) => p[1] !== p[2]).map((p) => p[0] + '=' + p[1] + ' (phép thử tính với ' + p[2] + ')');
  T.check('TUNING và bảng nhân vật khớp các số đã dùng tính tay (' + pins.length + ' số)', bad.length === 0, bad.join('; ') || 'khớp');
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Hình học: đá, va chạm, tia, hợp đa giác');
{
  const G = VS.geom;
  const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const bounds = { minX: -20, maxX: 40, minY: -20, maxY: 30 };
  const W1 = G.worldFor({ id: 'T_SQUARE', walls: [sq(0, 0, 10, 10)], bounds });
  T.check('đá vuông 10 m: trong là đặc, ngoài là nước, sát biên đúng phía', W1.solid(5, 5) && W1.solid(0.01, 0.01) && W1.solid(9.99, 9.99) && !W1.solid(-0.01, 5) && !W1.solid(10.01, 5) && !W1.solid(5, 10.01) && !W1.solid(5, -0.01) && !W1.solid(100, 100));
  T.check('open(r): cách vách đúng r (0.9) là thoáng, gần hơn thì không, tâm trong đá thì không', W1.open(-1, 5, 0.9) && W1.open(-0.91, 5, 0.9) && !W1.open(-0.89, 5, 0.9) && !W1.open(-0.5, 5, 0.9) && !W1.open(5, 5, 0.1));
  const nr = W1.nearest(-2, 5, 3);
  T.check('nearest: điểm gần nhất trên biên (0, 5) cách 2 m; ngoài tầm 3 m thì null', nr !== null && near(nr.x, 0, 1e-12) && near(nr.y, 5, 1e-12) && near(nr.d, 2, 1e-12) && W1.nearest(-5, 5, 3) === null);
  const r1 = W1.raycast(-5, 5, 15, 5), r2 = W1.raycast(15, 5, -5, 5);
  T.check('raycast từ trái sang: chạm x = 0 ở t = 0.25, pháp tuyến (-1, 0) hướng về phía người bắn', r1 !== null && near(r1.t, 0.25, 1e-12) && near(r1.x, 0, 1e-12) && near(r1.y, 5, 1e-12) && near(r1.nx, -1, 1e-12) && near(r1.ny, 0, 1e-12));
  T.check('raycast từ phải sang: chạm x = 10 ở t = 0.25, pháp tuyến (1, 0)', r2 !== null && near(r2.t, 0.25, 1e-12) && near(r2.x, 10, 1e-12) && near(r2.nx, 1, 1e-12) && near(r2.ny, 0, 1e-12));
  T.check('tia lướt trên đá không chạm: raycast null và clear true; tia đâm vào đá: clear false; tia dừng sát vách trước khi chạm: clear true', W1.raycast(-5, 15, 15, 15) === null && W1.clear(-5, 15, 15, 15) && !W1.clear(-5, 5, 15, 5) && W1.clear(-5, 5, -0.01, 5));
  const o = { x: -0.3, y: 5, vx: 0, vy: 0 }, nrm = W1.resolve(o, 0.5);
  T.check('resolve: vòng r 0.5 chồng vào vách trái 0.2 m bị đẩy ra cách vách r + 1 mm theo pháp tuyến (-1, 0)', nrm !== null && near(nrm.x, -1, 1e-12) && near(nrm.y, 0, 1e-12) && near(o.x, -0.501, 1e-9) && near(o.y, 5, 1e-9));
  const oi = { x: 2, y: 5, vx: 0, vy: 0 };
  W1.resolve(oi, 0.5);
  T.check('resolve: tâm nằm trong đá 2 m thì đẩy ra phía biên gần nhất (trái), không kẹt', near(oi.x, -0.501, 1e-9) && near(oi.y, 5, 1e-9));
  const free = { x: -3, y: 5, vx: 0, vy: 0 };
  T.check('resolve: ngoài tầm vách thì không đụng tới', W1.resolve(free, 0.5) === null && free.x === -3 && free.y === 5);
  const sl = { x: -0.52, y: 5, vx: 3, vy: 1 };
  T.check('slide: lao 3 m/s vào vách trái thì mất thành phần vận tốc hướng vào, vẫn trượt dọc vách (vy giữ 1) và trả true', W1.slide(sl, 0.5, 1 / 60) === true && near(sl.x, -0.501, 1e-9) && near(sl.y, 5 + 1 / 60, 1e-9) && near(sl.vx, 0, 1e-9) && near(sl.vy, 1, 1e-9));
  const sf = { x: -5, y: 5, vx: 3, vy: 1 };
  T.check('slide: giữa nước thoáng thì đi đúng v × dt và trả false', W1.slide(sf, 0.5, 1 / 60) === false && near(sf.x, -5 + 3 / 60, 1e-12) && near(sf.y, 5 + 1 / 60, 1e-12) && sf.vx === 3 && sf.vy === 1);
  const WT = G.worldFor({ id: 'T_THIN', walls: [sq(5, -20, 5.1, 30)], bounds });
  const ob = { x: 3, y: 0, vx: 0, vy: 0 };
  let maxX = -1e9, touched = false;
  for (let k = 0; k < 60; k++) { ob.vx = 40; if (WT.slide(ob, 0.3, 1 / 60)) touched = true; maxX = Math.max(maxX, ob.x); }
  T.check('vách mỏng 0.1 m không xuyên được dù lao 40 m/s (chia bước nhỏ): tâm không bao giờ vượt x = 5 - 0.3', touched && maxX < 5 - 0.3 + 1e-6 && ob.x > 4.5, 'tối đa ' + maxX.toFixed(4));
  const op = G.findOpen(W1, -0.3, 5, 0.5, { maxY: 29 });
  T.check('findOpen: điểm đang chồng vách thì tìm vòng xoáy ra chỗ thoáng gần nhất (-0.55, 5)', op !== null && near(op.x, -0.55, 1e-9) && near(op.y, 5, 1e-9) && G.findOpen(W1, -5, 5, 0.5, { maxY: 29 }).x === -5);

  // Hai đa giác chồng nhau (5 trong 6 bản đồ): đá là HỢP của chúng, không phải chẵn-lẻ toàn cục (phần chồng không được rỗng)
  const W2 = G.worldFor({ id: 'T_UNION', walls: [sq(0, 0, 10, 10), sq(5, 0, 15, 10)], bounds });
  T.check('hai đa giác chồng nhau: phần chỉ A, chỉ B và phần chồng đều đặc; ngoài hợp là nước', W2.solid(2, 5) && W2.solid(12, 5) && W2.solid(7, 5) && !W2.solid(-1, 5) && !W2.solid(16, 5) && !W2.solid(7, 11));
  const ru = W2.raycast(-5, 5, 20, 5);
  T.check('tia xuyên cả hợp: chạm biên ngoài x = 0 ở t = 0.2', ru !== null && near(ru.t, 0.2, 1e-12) && near(ru.x, 0, 1e-12));

  // Lưới thông: một vách chắn ngang cả bản đồ chia nước làm hai vùng rời
  const WS = G.worldFor({ id: 'T_SPLIT', walls: [sq(-25, 4.9, 45, 5.1)], bounds });
  const gs = G.reachGrid(WS, 0.35, 0.5), g1 = G.reachGrid(W1, 0.35, 0.5);
  T.check('reachGrid: vách chắn ngang chia hai vùng (khác nhãn, đều > 0), trong đá nhãn 0; đá vuông đứng riêng không chia vùng', gs.at(0, 0) > 0 && gs.at(0, 10) > 0 && gs.at(0, 0) !== gs.at(0, 10) && gs.at(0, 5) === 0 && g1.at(-10, 0) === g1.main && g1.at(20, 5) === g1.main && g1.at(5, 5) === 0);

  // Đối chiếu vét cạn trên 6 bản đồ thật: solid() với số vòng (winding number) từng đa giác, _cast() với giao đoạn từng cạnh, open() với khoảng cách tới cạnh
  const isLeft = (a, b, x, y) => (b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1]);
  const winding = (poly, x, y) => {
    let wn = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      if (a[1] <= y) { if (b[1] > y && isLeft(a, b, x, y) > 0) wn++; } else if (b[1] <= y && isLeft(a, b, x, y) < 0) wn--;
    }
    return wn;
  };
  const segT = (x0, y0, x1, y1, a, b) => {
    const dx = x1 - x0, dy = y1 - y0, ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return 2;
    const t = ((a[0] - x0) * ey - (a[1] - y0) * ex) / den, u = ((a[0] - x0) * dy - (a[1] - y0) * dx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : 2;
  };
  const dseg = (a, b, x, y) => {
    const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / l2)) : 0;
    return Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t);
  };
  const rg = VS.rng(20261008);
  let nS = 0, badS = 0, nR = 0, badR = 0, hitR = 0, nO = 0, badO = 0, solidN = 0;
  for (const mp of VS.MAPS) {
    const zone = W.HX_ZONES[mp.id], w = G.worldFor(zone), b = zone.bounds;
    const px = () => b.minX + rg() * (b.maxX - b.minX), py = () => b.minY + rg() * (b.maxY - b.minY);
    for (let k = 0; k < 1500; k++) {
      const x = px(), y = py(), ref = zone.walls.some((p) => winding(p, x, y) !== 0);
      nS++; if (ref) solidN++;
      if (w.solid(x, y) !== ref) badS++;
    }
    for (let k = 0; k < 300; k++) {
      const x0 = px(), y0 = py(), a = rg() * Math.PI * 2, len = 2 + rg() * 40, x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      let best = 2;
      for (const p of zone.walls) for (let q = 0; q < p.length; q++) { const t = segT(x0, y0, x1, y1, p[q], p[(q + 1) % p.length]); if (t < best) best = t; }
      const t = w._cast(x0, y0, x1, y1);
      nR++; if (best <= 1) hitR++;
      if (!(best > 1 && t > 1) && Math.abs(best - t) > 1e-9) badR++;
    }
    for (let k = 0; k < 600; k++) {
      const x = px(), y = py(), r = 0.3 + rg() * 1.2;
      let md = 1e9;
      for (const p of zone.walls) for (let q = 0; q < p.length; q++) md = Math.min(md, dseg(p[q], p[(q + 1) % p.length], x, y));
      const ref = !zone.walls.some((p) => winding(p, x, y) !== 0) && md >= r;
      nO++; if (w.open(x, y, r) !== ref) badO++;
    }
  }
  T.check('đối chiếu vét cạn 6 bản đồ: solid() khớp hợp đa giác (số vòng) ở ' + nS + ' điểm ngẫu nhiên, có cả điểm đặc lẫn thoáng', badS === 0 && solidN > 500 && solidN < nS - 500, 'sai ' + badS + '/' + nS + ', đặc ' + solidN);
  T.check('đối chiếu vét cạn 6 bản đồ: _cast() khớp giao đoạn từng cạnh ở ' + nR + ' tia, có cả tia trúng lẫn tia thông', badR === 0 && hitR > 300 && hitR < nR - 300, 'sai ' + badR + '/' + nR + ', trúng ' + hitR);
  T.check('đối chiếu vét cạn 6 bản đồ: open(x, y, r) khớp (ngoài đá và cách mọi cạnh >= r) ở ' + nO + ' điểm', badO === 0, 'sai ' + badO + '/' + nO);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Tạo trận');
{
  const m = SIM.createMatch({ seed: 1, mapId: 'A01', lineup: lineup('human') });
  T.check('6 actor, 4 thợ lặn rồi 2 cá mập, id là chỉ số trong m.actors', m.actors.length === 6 && m.actors.every((a, i) => a.id === i && a.team === (i < 4 ? 'diver' : 'shark')));
  T.check('đội hình đúng loài và tên', m.actors[0].defId === 'dave' && m.actors[3].defId === 'bao' && m.actors[4].defId === 'Blacktip_Reefshark' && m.actors[5].def === VS.SHARKS.Tiger_Shark && m.actors[1].name === 'T1');
  T.check('A01 (khu A) có 12 món kho báu', m.loot.length === 12, m.loot.length);
  const sum = m.loot.reduce((s, l) => s + l.value, 0);
  T.check('chỉ tiêu = round(0.6 × tổng giá trị kho báu)', sum >= 12 * 40 && m.score.target === Math.round(0.6 * sum) && m.score.banked === 0, 'tổng ' + sum + ', chỉ tiêu ' + m.score.target);
  const tier = (l) => (l.value >= 40 && l.value <= 80 && l.kg >= 2 && l.kg <= 4) || (l.value >= 100 && l.value <= 150 && l.kg >= 6 && l.kg <= 8) || (l.value >= 220 && l.value <= 300 && l.kg >= 12 && l.kg <= 15);
  T.check('mỗi món thuộc một bậc: (40-80 điểm, 2-4 kg) | (100-150, 6-8) | (220-300, 12-15)', m.loot.every(tier), JSON.stringify(m.loot.filter((l) => !tier(l))));
  T.check('món đều nằm yên, chưa ai mang, có tên ảnh', m.loot.every((l, i) => l.id === i && l.st === 'rest' && l.by === -1 && typeof l.art === 'string' && l.art.length > 0));
  const dsp = m.spawns.diver, w = m.world;
  let minFromSpawn = 1e9, minApart = 1e9;
  m.loot.forEach((l, i) => {
    dsp.forEach((p) => { minFromSpawn = Math.min(minFromSpawn, Math.hypot(l.x - p[0], l.y - p[1])); });
    for (let j = i + 1; j < m.loot.length; j++) minApart = Math.min(minApart, Math.hypot(l.x - m.loot[j].x, l.y - m.loot[j].y));
  });
  T.check('kho báu cách chỗ thả thợ lặn >= 12 m và cách nhau >= 6 m', minFromSpawn >= 12 && minApart >= 6, minFromSpawn.toFixed(1) + ' / ' + minApart.toFixed(2));
  T.check('mọi món nằm ở nước thoáng', m.loot.every((l) => w.open(l.x, l.y, 0.5)));
  const gaps = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) gaps.push(Math.hypot(dsp[i][0] - dsp[j][0], dsp[i][1] - dsp[j][1]));
  T.check('4 thợ lặn thả cách nhau >= 1.5 m, nước thoáng, dưới mặt nước 20.5', dsp.length === 4 && Math.min.apply(null, gaps) >= 1.5 - 1e-9 && dsp.every((p) => w.open(p[0], p[1], 0.3) && p[1] < 20.5 - 0.3), 'gần nhất ' + Math.min.apply(null, gaps).toFixed(2));
  T.check('thợ lặn thả quanh zone.start của A01 (-57, mặt nước)', dsp.every((p) => Math.hypot(p[0] + 57, p[1] - 19) < 5), JSON.stringify(dsp.map((p) => p.map((v) => +v.toFixed(1)))));
  const ssp = m.spawns.shark;
  T.check('2 cá mập sinh nước thoáng, xa chỗ thả thợ lặn (>= 50 m), sâu hơn chỗ thả, ngoài vùng an toàn khoang cứu hộ', ssp.length === 2 && ssp.every((p) => w.open(p[0], p[1], 1.3) && Math.hypot(p[0] - dsp[0][0], p[1] - dsp[0][1]) >= 50 && p[1] < dsp[0][1] - 20 && m.pods.every((q) => Math.hypot(p[0] - q.x, p[1] - q.y) >= 5)), JSON.stringify(ssp.map((p) => p.map((v) => +v.toFixed(1)))));
  T.check('khoang cứu hộ và rương O2 lấy từ HX_ZONES (3 và 5), rương sẵn sàng', m.pods.length === 3 && m.o2.length === 5 && m.pods.every((p) => p.r === 2) && m.o2.every((c) => c.readyAt === 0));
  T.check('pha mở đầu: phase intro, t = 0, 4 lượt hồi sinh, chưa có kết quả, theme day', m.phase === 'intro' && m.t === 0 && m.tickets === 4 && m.result === null && m.theme === 'day');
  const mb = SIM.createMatch({ seed: 1, mapId: 'B01', lineup: lineup('human') }), mc = SIM.createMatch({ seed: 1, mapId: 'C03', lineup: lineup('human') });
  T.check('B01 (khu B) có 16 món, C03 (khu C) có 18 món, thợ lặn thả ở chỗ thoáng', mb.loot.length === 16 && mc.loot.length === 18 && mb.spawns.diver.every((p) => mb.world.open(p[0], p[1], 0.3)) && mc.spawns.diver.every((p) => mc.world.open(p[0], p[1], 0.3)), mb.loot.length + '/' + mc.loot.length);
  const m2 = SIM.createMatch({ seed: 2, mapId: 'A01', lineup: lineup('human') });
  T.check('hạt giống khác cho kho báu khác, cùng hạt giống cho cùng kho báu', JSON.stringify(m2.loot) !== JSON.stringify(m.loot) && JSON.stringify(SIM.createMatch({ seed: 1, mapId: 'A01', lineup: lineup('human') }).loot) === JSON.stringify(m.loot));
  let msg = '';
  try { SIM.createMatch({ seed: 1, mapId: 'ZZZ', lineup: lineup('human') }); } catch (e) { msg = e.message; }
  T.check('bản đồ lạ ném lỗi nêu tên bản đồ', msg.indexOf('ZZZ') >= 0, msg);
  T.check('actor: stats khởi tạo đủ 7 trường bằng 0 ở cả hai phe', m.actors.every((a) => Object.keys(a.stats).sort().join() === 'banked,bites,dmg,downs,outs,revives,sharkOuts' && Object.keys(a.stats).every((k) => a.stats[k] === 0)));
  T.check('actor thợ lặn: O2 đầy, đèn bật, không mang gì; cá mập: đủ máu và thể lực', m.actors[0].o2 === 100 && m.actors[0].o2Max === 100 && m.actors[0].light === true && m.actors[0].carry.length === 0 && m.actors[4].hp === 320 && m.actors[4].stamina === 100 && m.actors[4].holdId === -1);
  T.check('skill: {id, cd, t, charges}; charges lấy từ SKILL_DATA (Tùng 2, Dave 0)', m.actors[0].skill.id === 'binh-o2' && m.actors[0].skill.charges === 0 && SIM.createMatch({ seed: 1, mapId: 'A01', lineup: lineup('human', ['tung', 'dave', 'lan', 'bao']) }).actors[0].skill.charges === 2);
  T.check('mọi actor mới sinh được miễn sát thương 3 s (hiệu ứng spawnImmune)', m.actors.every((a) => { const e = SIM.effect(a, 'spawnImmune'); return e !== null && e.until === 3; }));
  const lit0 = m.loot.filter((l) => SIM.visibleTo(m, 'diver', l.x, l.y)).map((l) => l.id).join();
  const known0 = SIM.known(m, 'diver');
  T.check('trí nhớ kho báu: lúc mở màn known() là đúng các món nằm trong vùng sáng, trả đối tượng loot theo thứ tự id, không phải cả 12 món', known0.map((l) => l.id).join() === lit0 && known0.every((l) => l === m.loot[l.id]) && known0.length < m.loot.length, 'known ' + lit0);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Xác định: cùng hạt giống và cùng intent thì giống hệt');
{
  const snap = (m) => JSON.stringify({ a: m.actors.map((a) => [a.x, a.y, a.vx, a.vy, a.ang, a.st, a.team === 'diver' ? a.o2 : a.hp]), s: m.score, t: m.t, k: m.tickets, l: m.loot.map((l) => [l.x, l.y, l.st]), n: m.events.length });
  const run = (seed) => step(SIM.createMatch({ seed, mapId: 'A01', lineup: lineup('bot') }), 3000);
  const a = run(7), b = run(7), c = run(8);
  const start = SIM.createMatch({ seed: 7, mapId: 'A01', lineup: lineup('bot') });
  const moved = a.actors.reduce((s, x, i) => s + Math.hypot(x.x - start.actors[i].x, x.y - start.actors[i].y), 0);
  T.check('hai lần chạy seed 7, 3000 bước, ra JSON vị trí/điểm giống hệt', snap(a) === snap(b) && snap(a).length > 200, snap(a).length + ' ký tự');
  T.check('seed 8 ra kết quả khác (phép so sánh không rỗng)', snap(c) !== snap(a));
  T.check('trong 3000 bước các bot đã đi thật (tổng quãng dời > 30 m) và có sự kiện', moved > 30 && a.events.length > 5, 'dời ' + moved.toFixed(0) + ' m, ' + a.events.length + ' sự kiện');
  const h1 = rig(), h2 = rig();
  h1.actors[0].intent.mx = 1; h2.actors[0].intent.mx = -1;
  step(h1, 120); step(h2, 120);
  T.check('intent khác thì kết quả khác', h1.actors[0].x > h2.actors[0].x + 1, h1.actors[0].x.toFixed(2) + ' vs ' + h2.actors[0].x.toFixed(2));
  // mô phỏng không bao giờ đọc m.events: xoá sự kiện mỗi bước (như tools/sim.js và main.js) không đổi gì
  const keep = SIM.createMatch({ seed: 7, mapId: 'A01', lineup: lineup('bot') }), wipe = SIM.createMatch({ seed: 7, mapId: 'A01', lineup: lineup('bot') });
  let evTotal = 0;
  for (let i = 0; i < 3000; i++) { SIM.step(keep, DT); SIM.step(wipe, DT); evTotal += wipe.events.length; wipe.events.length = 0; }
  const strip = (m) => JSON.stringify({ a: m.actors.map((x) => [x.x, x.y, x.st, x.team === 'diver' ? x.o2 : x.hp]), s: m.score, t: m.t });
  T.check('xoá m.events mỗi bước không làm đổi diễn biến (mô phỏng không đọc events)', strip(keep) === strip(wipe) && evTotal > 5, evTotal + ' sự kiện đã xoá');
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Pha trận và phím một bước');
{
  const m = rig({ play: false });
  m.actors[0].intent.mx = 1;
  step(m, 239);
  T.check('intro: 239 bước vẫn intro, t = 0, phaseT đếm, mọi người đứng yên, O2 chưa trừ', m.phase === 'intro' && m.t === 0 && near(m.phaseT, 239 / 60, 1e-9) && m.actors[0].x === m.spawns.diver[0][0] && m.actors[0].o2 === 100);
  step(m, 1);
  T.check('đủ 4 s thì vào play, phaseT về 0, phát sự kiện phase', m.phase === 'play' && m.phaseT === 0 && ev(m, 'phase').map((e) => e.phase).join() === 'intro,play');
  step(m, 60);
  T.check('vào play thì t đếm thời gian chơi (1 s) và thợ lặn bơi theo intent', near(m.t, 1, 1e-9) && m.actors[0].x > m.spawns.diver[0][0] + 1, m.actors[0].x.toFixed(2));
  const e = rig();
  e.actors.forEach((a) => { a.intent.fire = true; a.intent.skill = true; a.intent.light = true; a.intent.interact = true; a.intent.fireHeld = true; });
  step(e, 1);
  T.check('step xoá fire/skill/light/interact của MỌI actor (cả người lẫn bot) sau khi đọc; fireHeld giữ nguyên', e.actors.every((a) => a.intent.fire === false && a.intent.skill === false && a.intent.light === false && a.intent.interact === false && a.intent.fireHeld === true));
  T.check('cạnh light đã bật/tắt đèn đúng một lần (từ bật thành tắt)', e.actors[0].light === false);
  e.actors[0].intent.fireHeld = false; e.actors[0].intent.light = true; step(e, 3);
  T.check('bấm light lần nữa thì bật lại, giữ nguyên các bước sau', e.actors[0].light === true);
  const f = rig({ play: false });
  f.actors[0].intent.fire = true; f.actors[0].intent.light = true; step(f, 10);
  T.check('phím bấm trong lúc mở màn bị xoá, không dồn sang bước chơi đầu tiên', f.actors[0].intent.fire === false && f.actors[0].light === true && ev(f, 'fire').length === 0);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('O2, bơi, tốc độ');
{
  const m = rig();
  step(m, 600);
  T.check('thợ lặn đứng yên 10 s sau intro: O2 = 100 - 0.6 × 10 = 94', near(m.actors[0].o2, 94, 0.01), m.actors[0].o2);
  const arena = findArena(m);
  T.check('tiền đề: có khoảng thoáng >= 12 m ở A01 để bày thế trận', arena && arena.c >= 12, JSON.stringify(arena));
  const b = rig(), d = b.actors[0];
  put(d, arena.x - 6, arena.y, 0);
  d.intent.mx = 1; d.intent.boost = true;
  step(b, 120);
  T.check('tiền đề: bơi 2 s sang phải không đụng vách', b.world.clear(arena.x - 6, arena.y, d.x, d.y) && d.x > arena.x - 6 + 4);
  T.check('tăng tốc: tốc độ = 2.6 × 1.4 = 3.64 m/s', near(speedOf(d), 3.64, 0.01), speedOf(d));
  T.check('tăng tốc và đang đi: O2 = 100 - 0.6 × 2.5 × 2 s = 97', near(d.o2, 97, 0.01), d.o2);
  const q = rig(), e = q.actors[0];
  put(e, arena.x - 6, arena.y, 0);
  e.intent.boost = true;
  step(q, 120);
  T.check('boost mà đứng yên thì không tăng hao O2: 100 - 0.6 × 2 = 98.8', near(e.o2, 98.8, 0.01), e.o2);
  const c = rig(), f = c.actors[0];
  put(f, arena.x - 6, arena.y, 0);
  f.intent.mx = 1;
  step(c, 6);
  T.check('đà tăng tốc: v += (muốn - v) × accel × dt, sau 6 bước (accel 6): 2.6 × (1 - 0.9^6) = 1.218 m/s', near(speedOf(f), 1.218, 0.005), speedOf(f));
  step(c, 114);
  T.check('bơi thường: sau 2 s đạt tốc độ 2.6 m/s', near(speedOf(f), 2.6, 0.01), speedOf(f));
  f.intent.mx = 0;
  step(c, 30);
  T.check('thả phím hướng: hãm theo drag 2.6, sau 0.5 s còn 2.6 × (1 - 2.6/60)^30 = 0.689 m/s', near(speedOf(f), 0.689, 0.01), speedOf(f));
  const g = rig(), h = g.actors[0];
  put(h, arena.x, arena.y, 0);
  h.intent.mx = 1; h.intent.my = 1;
  step(g, 120);
  T.check('đi chéo (mx=my=1) vẫn chỉ 2.6 m/s, không nhanh hơn theo đường chéo', near(speedOf(h), 2.6, 0.01), speedOf(h));
  const k = rig(), p = k.actors[0];
  put(p, arena.x - 6, arena.y, 0);
  k.loot[0].kg = 10; k.loot[0].x = p.x + 0.4; k.loot[0].y = p.y;
  step(k, 1);
  T.check('nhặt món 10 kg: carryKg = 10, món chuyển carried, có sự kiện pickup', p.carryKg === 10 && k.loot[0].st === 'carried' && k.loot[0].by === p.id && ev(k, 'pickup').length === 1 && ev(k, 'pickup')[0].value === k.loot[0].value);
  p.intent.mx = 1;
  step(k, 120);
  T.check('mang 10 kg: tốc độ = 2.6 × (1 - 0.02 × 10) = 2.08 m/s', near(speedOf(p), 2.08, 0.01), speedOf(p));
  const sl = (setup) => { const r = rig(), v = r.actors[0]; put(v, arena.x, arena.y, 0); setup(r, v); v.intent.mx = 1; step(r, 120); return v; };
  T.check('hiệu ứng slow 0.5: tốc độ = 2.6 × 0.5 = 1.3 m/s', near(speedOf(sl((r, v) => SIM.addEffect(v, 'slow', 100, 0.5, -1))), 1.3, 0.01));
  T.check('hai hiệu ứng chậm 0.3 và 0.5 từ hai nguồn: lấy max chứ không cộng (1.3 m/s)', near(speedOf(sl((r, v) => { SIM.addEffect(v, 'slow', 100, 0.3, 1); SIM.addEffect(v, 'slow', 100, 0.5, 2); })), 1.3, 0.01));
  T.check('chậm 0.9: tốc độ chạm sàn effects.slowFloor 0.4 → 2.6 × 0.4 = 1.04 m/s', near(speedOf(sl((r, v) => SIM.addEffect(v, 'slow', 100, 0.9, -1))), 1.04, 0.01));
  T.check('mang 20 kg (× 0.6) và chậm 0.5 (× 0.5) = 0.3 → sàn 0.4: 1.04 m/s', near(speedOf(sl((r, v) => { v.carryKg = 20; SIM.addEffect(v, 'slow', 100, 0.5, -1); })), 1.04, 0.01));
  T.check('hiệu ứng speed 2: tốc độ = 2.6 × 2 = 5.2 m/s', near(speedOf(sl((r, v) => SIM.addEffect(v, 'speed', 100, 2, -1))), 5.2, 0.01));
  T.check('speed 2 gặp chậm 0.5: hệ số nhân với nhau = 1 → 2.6 m/s', near(speedOf(sl((r, v) => { SIM.addEffect(v, 'speed', 100, 2, -1); SIM.addEffect(v, 'slow', 100, 0.5, -1); })), 2.6, 0.01));
  const z = rig(), v3 = z.actors[0];
  put(v3, arena.x, arena.y, 0);
  SIM.addEffect(v3, 'stun', 100, 1, -1);
  v3.intent.mx = 1; v3.intent.fire = true; step(z, 120);
  T.check('choáng: không đi (dời < 0.01 m), không bắn được phát nào', Math.hypot(v3.x - arena.x, v3.y - arena.y) < 0.01 && ev(z, 'fire').length === 0, Math.hypot(v3.x - arena.x, v3.y - arena.y));
  const bl = rig(), v4 = bl.actors[0];
  put(v4, arena.x, arena.y, 0);
  SIM.addEffect(v4, 'bleed', 100, 4, -1);
  step(bl, 120);
  T.check('chảy máu 4 O2/s trong 2 s: O2 = 100 - 8 - 0.6 × 2 = 90.8', near(v4.o2, 90.8, 0.02), v4.o2);
  const lim = rig(), v5 = lim.actors[0];
  put(v5, arena.x, arena.y, 0);
  v5.x = -500; v5.y = 500; v5.intent.mx = 0;
  step(lim, 1);
  T.check('thợ lặn bị kẹp trong bản đồ và dưới mặt nước (y <= 20.5 - r)', v5.x >= lim.world.bounds.minX + 0.3 - 1e-9 && v5.y <= 20.5 - 0.3 + 1e-9 && v5.y >= lim.world.bounds.minY, v5.x.toFixed(1) + ',' + v5.y.toFixed(2));
  const wall = rig(), v6 = wall.actors[0];
  put(v6, arena.x, arena.y, 0);
  let tx = null;
  for (let ang = 0; ang < 360 && !tx; ang += 15) { const hit = wall.world.raycast(arena.x, arena.y, arena.x + Math.cos(ang * Math.PI / 180) * 40, arena.y + Math.sin(ang * Math.PI / 180) * 40); if (hit && hit.t < 0.9) tx = [Math.cos(ang * Math.PI / 180), Math.sin(ang * Math.PI / 180)]; }
  v6.intent.mx = tx[0]; v6.intent.my = tx[1]; v6.intent.boost = true;
  let inRock = 0;
  for (let i = 0; i < 900; i++) { SIM.step(wall, DT); if (wall.world.solid(v6.x, v6.y)) inRock++; }
  T.check('bơi 15 s tăng tốc thẳng vào vách: không bao giờ lọt vào trong đá', inRock === 0 && Math.hypot(v6.x - arena.x, v6.y - arena.y) > 5, 'số bước trong đá ' + inRock);
  // chậm và choáng xong thì miễn một lúc (không bị khống chế liên tục)
  const im = rig(), vi = im.actors[0];
  SIM.addEffect(vi, 'slow', 1, 0.5, -1);
  step(im, 60);
  step(im, 2);
  T.check('chậm hết hạn: được miễn chậm 2 s, gắn chậm mới trong lúc miễn trả null', SIM.effect(vi, 'slow') === null && SIM.addEffect(vi, 'slow', 5, 0.5, -1) === null && SIM.effect(vi, 'slow') === null);
  step(im, 125);
  T.check('qua 2 s miễn chậm thì chậm lại gắn được', SIM.addEffect(vi, 'slow', 5, 0.5, -1) !== null && SIM.effect(vi, 'slow') !== null);
  const cc = rig(), vc = cc.actors[0];
  SIM.addEffect(vc, 'stun', 1, 1, -1);
  step(cc, 60);
  step(cc, 2);
  const imm = SIM.effect(vc, 'ccImmune');
  T.check('choáng hết hạn: được miễn khống chế 2 s (hiệu ứng ccImmune), choáng và ngủ mới bị từ chối', imm !== null && near(imm.until - cc.t, 2, 0.05) && SIM.addEffect(vc, 'stun', 3, 1, -1) === null && SIM.addEffect(vc, 'sleep', 3, 1, -1) === null);
  step(cc, 125);
  T.check('qua 2 s miễn khống chế thì choáng gắn lại được', SIM.effect(vc, 'ccImmune') === null && SIM.addEffect(vc, 'stun', 3, 1, -1) !== null);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Súng xiên');
{
  const base = rig(), arena = findArena(base);
  const m = rig(), d = m.actors[0], s = m.actors[4];
  put(d, arena.x - 6, arena.y, 0); put(s, arena.x - 1, arena.y, Math.PI);
  T.check('tiền đề: cá mập cách thợ lặn đúng 5 m, đường thông', near(Math.hypot(s.x - d.x, s.y - d.y), 5, 1e-9) && m.world.clear(d.x, d.y, s.x, s.y));
  aimAt(d, s.x, s.y); d.intent.fire = true;
  step(m, 1);
  T.check('bắn: có đạn xiên tốc độ 18 m/s về phía mục tiêu, nạp lại 1.0 s, phát sự kiện fire', m.projs.length === 1 && near(m.projs[0].vx, 18, 1e-9) && near(m.projs[0].vy, 0, 1e-9) && d.reload === 1 && ev(m, 'fire').length === 1);
  const n = stepUntil(m, () => ev(m, 'hit').length > 0, 60);
  T.check('xiên trúng cá mập ở 5 m trong vài chục bước', n > 5 && n < 30, n + ' bước');
  T.check('trúng: máu = 320 - 24 = 296, đạn biến mất', near(s.hp, 296, 1e-9) && m.projs.length === 0, s.hp);
  const sl = SIM.effect(s, 'slow');
  T.check('trúng: cá mập bị chậm 30% trong 0.5 s', sl !== null && near(sl.mag, 0.3, 1e-9) && near(sl.until - m.t, 0.5, 1e-6), sl && (sl.mag + ' / ' + (sl.until - m.t)));
  T.check('thống kê và sự kiện: stats.dmg = 24, hit có dmg 24 team shark', near(d.stats.dmg, 24, 1e-9) && ev(m, 'hit')[0].dmg === 24 && ev(m, 'hit')[0].team === 'shark' && ev(m, 'hit')[0].by === d.id && ev(m, 'hit')[0].id === s.id);
  step(m, 40);
  T.check('hết 0.5 s thì hết chậm, máu chưa hồi (chưa tới 5 s)', SIM.effect(s, 'slow') === null && near(s.hp, 296, 1e-9));
  // Trúng lúc ~0.2 s, chậm hết lúc ~0.7 s, miễn chậm tới ~2.7 s. Phát thứ hai trúng lúc ~1.2 s (trong miễn chậm), phát thứ ba lúc ~3.4 s.
  stepUntil(m, () => d.reload === 0, 80);
  d.intent.fire = true; step(m, 1);
  stepUntil(m, () => ev(m, 'hit').length > 1, 60);
  T.check('phát xiên thứ hai (trong 2 s miễn chậm): vẫn trừ 24 máu (272) nhưng không chậm được nữa', near(s.hp, 272, 1e-9) && SIM.effect(s, 'slow') === null && m.t < 2.7, s.hp + ' t=' + m.t.toFixed(2));
  step(m, 130);
  d.intent.fire = true; step(m, 1);
  stepUntil(m, () => ev(m, 'hit').length > 2, 60);
  T.check('phát thứ ba sau khi hết miễn chậm: chậm 30% trở lại', m.t > 2.8 && SIM.effect(s, 'slow') !== null && near(SIM.effect(s, 'slow').mag, 0.3, 1e-9) && near(s.hp, 248, 1e-9), s.hp + ' t=' + m.t.toFixed(2));
  // chưa nạp xong thì bấm bắn không ra thêm phát
  const r = rig(), d2 = r.actors[0];
  put(d2, arena.x - 6, arena.y, 0); aimAt(d2, arena.x + 5, arena.y);
  d2.intent.fire = true; step(r, 1); d2.intent.fire = true; step(r, 30);
  T.check('chưa nạp xong (0.5 s < 1.0 s) thì bấm bắn tiếp không ra phát nào', ev(r, 'fire').length === 1);
  step(r, 40); d2.intent.fire = true; step(r, 1);
  T.check('nạp xong (1.2 s) thì bắn được phát thứ hai', ev(r, 'fire').length === 2);
  // giữ nút bắn: tự bắn theo nhịp nạp
  const hf = rig(), d3 = hf.actors[0];
  put(d3, arena.x - 6, arena.y, 0); aimAt(d3, arena.x + 5, arena.y); d3.intent.fireHeld = true;
  step(hf, 186);
  const ft = ev(hf, 'fire').map((e) => e.t), gaps = ft.slice(1).map((t, i) => t - ft[i]);
  T.check('giữ nút bắn 3.1 s: 4 phát, mỗi phát cách nhau đúng nhịp nạp 1.0 s (±2 bước)', ft.length === 4 && gaps.every((g) => g >= 1 - 1e-9 && g <= 1 + 2 * DT), JSON.stringify(ft.map((t) => +t.toFixed(3))));
  // tầm xa nhất: đạn xuất phát cách tâm thợ lặn 0.3 + 0.1 = 0.4 m, bay 9 m, bán kính đạn 0.15, bán kính cá mập 0.9
  // => trúng khi tâm cá mập cách thợ lặn <= 0.4 + 9 + 0.15 + 0.9 = 10.45 m
  const shootAt = (dist) => {
    const f = rig(), dd = f.actors[0], ss = f.actors[4];
    put(dd, arena.x - 8, arena.y, 0); put(ss, arena.x - 8 + dist, arena.y, Math.PI);
    aimAt(dd, ss.x, ss.y); dd.intent.fire = true; step(f, 60);
    return { f, ss };
  };
  const nearHit = shootAt(10.3), farHit = shootAt(10.6);
  T.check('tầm xiên: cá mập cách 10.3 m (< 10.45) trúng, cách 10.6 m (> 10.45) trượt, máu nguyên 320, đạn đã tắt', near(nearHit.ss.hp, 296, 1e-9) && farHit.ss.hp === 320 && farHit.f.projs.length === 0 && ev(farHit.f, 'hit').length === 0 && nearHit.f.world.clear(arena.x - 8, arena.y, nearHit.ss.x, nearHit.ss.y), nearHit.ss.hp + ' / ' + farHit.ss.hp);
  // vách: bắn vào đá thì đạn biến mất, không xuyên
  const wl = rig(), d5 = wl.actors[0], s5 = wl.actors[4];
  const cfg = findBehindWall(wl, { stand: 1.5, len: 8, hMin: 2, hMax: 4, back: 6, clear: 1.0, farFromLights: 0 });
  T.check('tiền đề: tìm được cá mập nằm sau một lớp đá mỏng', cfg !== null);
  put(d5, cfg.x, cfg.y, cfg.a); put(s5, cfg.bx, cfg.by, 0);
  aimAt(d5, s5.x, s5.y); d5.intent.fire = true; step(wl, 60);
  T.check('bắn xuyên lớp đá về phía cá mập: đạn chết ở vách, cá mập nguyên máu', s5.hp === 320 && wl.projs.length === 0 && ev(wl, 'hit').length === 0);
  // đạn tuỳ ý có móc onHit/onEnd và xuyên
  const pr = rig(), d6 = pr.actors[0], sA = pr.actors[4], sB = pr.actors[5];
  put(d6, arena.x - 6, arena.y, 0); put(sA, arena.x - 2, arena.y, 0); put(sB, arena.x + 2, arena.y, 0);
  const hits = []; let endWhy = null;
  SIM.addProj(pr, { owner: d6.id, team: 'diver', kind: 'dart', x: d6.x, y: d6.y, vx: 18, vy: 0, life: 1, dmg: 10, pierce: true, onHit: (mm, pp, t) => hits.push(t.id), onEnd: (mm, pp, why) => { endWhy = why; } });
  step(pr, 60);
  T.check('đạn xuyên (pierce): trúng cả hai cá mập theo thứ tự, mỗi con một lần, onHit gọi đúng 2 lần', hits.join() === '4,5' && near(sA.hp, 310, 1e-9) && near(sB.hp, 470, 1e-9), hits.join() + ' ' + sA.hp + ' ' + sB.hp);
  T.check('đạn hết sống thì gọi onEnd với lý do life', endWhy === 'life' && pr.projs.length === 0, endWhy);
  const np = rig(), d7 = np.actors[0], s7 = np.actors[4];
  put(d7, arena.x - 6, arena.y, 0); put(s7, arena.x - 2, arena.y, 0);
  let why2 = null;
  SIM.addProj(np, { owner: d7.id, team: 'diver', kind: 'dart', x: d7.x, y: d7.y, vx: 18, vy: 0, life: 1, dmg: 10, onEnd: (mm, pp, why) => { why2 = why; } });
  step(np, 60);
  T.check('đạn thường dừng ở mục tiêu đầu tiên: đúng 1 cá mập bị trừ, onEnd lý do hit', why2 === 'hit' && near(s7.hp, 310, 1e-9) && np.actors[5].hp === 480);
  // sửa đổi phát xiên kế tiếp (móc cho kỹ năng ống ngắm)
  const sm = rig(), d8 = sm.actors[0], s8 = sm.actors[4];
  put(d8, arena.x - 8, arena.y, 0); put(s8, arena.x + 4, arena.y, Math.PI);
  d8.shotMod = { rangeMul: 2, dmg: 70, pierce: true, until: 100 };
  aimAt(d8, s8.x, s8.y); d8.intent.fire = true; step(sm, 40);
  T.check('shotMod: xiên xa gấp đôi (12 m > 9 m) trừ 70 máu thay vì 24, dùng xong thì xoá', near(s8.hp, 250, 1e-9) && d8.shotMod === null, s8.hp);
  // miễn sát thương lúc mới sinh
  const im = rig({ immune: true }), d9 = im.actors[0], s9 = im.actors[4];
  put(d9, arena.x - 6, arena.y, 0); put(s9, arena.x - 1, arena.y, Math.PI);
  aimAt(d9, s9.x, s9.y); d9.intent.fire = true; step(im, 30);
  T.check('cá mập mới sinh (3 s đầu) miễn sát thương: xiên trúng mà máu vẫn 320, không phát sự kiện hit', s9.hp === 320 && ev(im, 'hit').length === 0);
  step(im, 160);
  T.check('tiền đề: đã qua 3 s, hiệu ứng spawnImmune hết', SIM.effect(s9, 'spawnImmune') === null);
  d9.intent.fire = true; step(im, 30);
  T.check('qua 3 s: xiên trúng trừ 24 máu bình thường', near(s9.hp, 296, 1e-9), s9.hp);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Cú cắn, ngậm, giãy, nhả');
{
  const base = rig(), arena = findArena(base);
  const setup = () => {
    const m = rig(), d = m.actors[0], s = m.actors[4];
    put(d, arena.x, arena.y, 0); put(s, arena.x - 2, arena.y, 0);
    return { m, d, s };
  };
  const { m, d, s } = setup();
  T.check('tiền đề: cá mập cách thợ lặn 2 m, mũi hướng về thợ lặn, đường thông', near(Math.hypot(d.x - s.x, d.y - s.y), 2, 1e-9) && s.ang === 0 && m.world.clear(s.x, s.y, d.x, d.y));
  s.intent.fire = true;
  step(m, 1);
  T.check('bấm fire: cá mập vào trạng thái lunge, đặt hồi cắn 1.6 s, phát sự kiện lunge', s.st === 'lunge' && near(s.biteCd, 1.6, 1e-9) && ev(m, 'lunge').length === 1);
  const n = stepUntil(m, () => ev(m, 'bite').length > 0, 40);
  const bite = ev(m, 'bite')[0];
  T.check('cú lao 9.1 m/s: cắn trúng sau đúng 2 bước (mõm tiến 0.30 m: 1.1 - 0.30 < 0.9)', n === 1 && bite && bite.id === d.id && bite.by === s.id, 'bước ' + (n + 1));
  T.check('cắn trừ đúng 26 O2: 100 - 0.6 × 2/60 - 26 = 73.98', bite && bite.o2 === 26 && near(d.o2, 73.98, 1e-6), d.o2);
  T.check('cắn rồi vẫn sống thì bị ngậm: thợ lặn held, cá mập hold, nối đúng nhau', d.st === 'held' && s.st === 'hold' && s.holdId === d.id && d.heldBy === s.id && ev(m, 'held').length === 1);
  T.check('iframes tính từ lúc được NHẢ chứ không phải lúc bị cắn: ngay sau cú cắn iframes = 0; cá mập ghi bites 1 và dmg 26', d.iframes === 0 && s.stats.bites === 1 && near(s.stats.dmg, 26, 1e-9), d.iframes);
  step(m, 1);
  const mouth = [s.x + Math.cos(s.ang) * s.r, s.y + Math.sin(s.ang) * s.r];
  T.check('thợ lặn bị ngậm dính ở mõm cá mập', near(d.x, mouth[0], 1e-9) && near(d.y, mouth[1], 1e-9));
  d.intent.fire = true; d.intent.skill = true; step(m, 1);
  T.check('đang bị ngậm: không bắn, không dùng kỹ năng được', ev(m, 'fire').length === 0 && ev(m, 'skill').length === 0 && d.skill.cd === 0);
  step(m, 86);
  T.check('ngậm gần đủ 1.5 s (88 lần đếm ngược) vẫn chưa nhả', d.st === 'held' && s.st === 'hold');
  stepUntil(m, () => ev(m, 'released').length > 0, 10);
  T.check('đủ 1.5 s (90 lần đếm ngược) thì nhả: cả hai về swim, phát released lý do time', d.st === 'swim' && s.st === 'swim' && s.holdId === -1 && d.heldBy === -1 && ev(m, 'released').length === 1 && ev(m, 'released')[0].why === 'time' && near(m.t, 92 / 60, 1e-9), m.t);
  T.check('bị ngậm hao 12 O2/s × 1.5 s = 18: O2 = 73.98 - 18 = 55.98', near(d.o2, 55.98, 1e-6), d.o2);
  T.check('stats.dmg của cá mập = 26 (cắn) + 18 (ngậm) = 44', near(s.stats.dmg, 44, 1e-6), s.stats.dmg);
  const ccI = SIM.effect(d, 'ccImmune');
  T.check('vừa được nhả: miễn cắn 1.2 s (iframes) và miễn khống chế 2 s (ccImmune)', d.iframes === 1.2 && ccI !== null && near(ccI.until - m.t, 2, 1e-9), d.iframes);
  // trong iframes: lao lại không cắn được
  stepUntil(m, () => s.biteCd <= 0, 30);
  s.intent.fire = true; step(m, 25);
  T.check('cá mập lao lại khi thợ lặn còn trong iframes 1.2 s: không cắn', ev(m, 'lunge').length === 2 && ev(m, 'bite').length === 1 && d.st === 'swim', 'lunge ' + ev(m, 'lunge').length + ' bite ' + ev(m, 'bite').length);
  // hết iframes nhưng còn miễn khống chế: cắn trúng, trừ O2, nhưng không ngậm được
  put(s, d.x - 1.2, d.y, 0); put(d, d.x, d.y, 0);
  stepUntil(m, () => d.iframes === 0, 120);
  const ccLeft = SIM.effect(d, 'ccImmune');
  stepUntil(m, () => s.biteCd <= 0, 120);
  const o2b = d.o2;
  s.intent.fire = true; step(m, 3);
  T.check('hết iframes (1.2 s) nhưng còn ccImmune: cú cắn thứ hai trúng và trừ 26 O2 nhưng không ngậm được', ccLeft !== null && ev(m, 'bite').length === 2 && d.st === 'swim' && s.st === 'swim' && ev(m, 'held').length === 1 && near(d.o2, o2b - 0.03 - 26, 1e-6), 'bite ' + ev(m, 'bite').length + ' o2 ' + d.o2 + ' vs ' + o2b);
  // hồi cắn: còn ~0.08 s nên chưa lao tiếp được ngay
  const rc = setup(); rc.s.intent.fire = true; step(rc.m, 2 + 90);
  rc.s.intent.fire = true; step(rc.m, 1);
  T.check('vừa nhả (còn hồi cắn ~0.08 s): bấm fire chưa lao được', rc.s.st === 'swim' && ev(rc.m, 'lunge').length === 1);

  // giãy: mỗi lần đổi chiều mx rút 0.15 s thời gian ngậm còn lại
  const sg = setup(); sg.s.intent.fire = true; step(sg.m, 3);
  const ctl = setup(); ctl.s.intent.fire = true; step(ctl.m, 3);
  T.check('tiền đề: cả hai thế trận đều đang ngậm với cùng thời gian còn lại', sg.d.st === 'held' && ctl.d.st === 'held' && sg.s.stT === ctl.s.stT);
  const signs = [1, -1, 1, -1];
  signs.forEach((v) => { sg.d.intent.mx = v; step(sg.m, 1); step(ctl.m, 1); });
  T.check('giãy 4 bước đổi chiều +,-,+,-: 3 lần đổi chiều, rút đúng 3 × 0.15 = 0.45 s so với đứng yên', near(ctl.s.stT - sg.s.stT, 0.45, 1e-9) && sg.d.st === 'held', (ctl.s.stT - sg.s.stT).toFixed(4));
  const fr = setup(); fr.s.intent.fire = true; step(fr.m, 3);
  let tk = 0;
  while (fr.d.st === 'held' && tk < 200) { fr.d.intent.mx = Math.floor((tk + 1) / 12) % 2 ? -1 : 1; step(fr.m, 1); tk++; }
  T.check('giãy mỗi 0.2 s: nhả sau ~54 bước (1.5 s - 0.15 × 4 lần đổi chiều = 0.9 s) thay vì 90 bước', tk >= 52 && tk <= 56 && fr.d.st === 'swim', tk + ' bước');
  const tn = setup(); tn.s.intent.fire = true; step(tn.m, 3);
  const rf = setup(); rf.s.intent.fire = true; step(rf.m, 3);
  tn.d.intent.mx = 0.1; step(tn.m, 1); tn.d.intent.mx = -0.1; step(tn.m, 1); tn.d.intent.mx = 0.1; step(tn.m, 1); step(rf.m, 3);
  T.check('rung nhẹ |mx| < 0.3 không tính là giãy: thời gian ngậm còn lại y như đứng yên', tn.s.stT === rf.s.stT && tn.d.st === 'held' && tn.s.stT < 1.5);

  // con cá mập thứ hai không cắn được người đang bị ngậm (đối chứng: cùng thế trận với người không bị ngậm thì cắn được)
  const two = setup(); two.s.intent.fire = true; step(two.m, 3);
  const s2 = two.m.actors[5];
  // Dừng con thứ nhất để người bị ngậm đứng yên (đang ngậm nó còn trớn lao, mang nạn nhân đi nhanh hơn cú lao của con thứ hai),
  // rồi đặt con thứ hai sao cho mõm chỉ cách nạn nhân 0.3 m ngoài tầm cắn: đủ 3 bước lao là cắn tới nếu được phép.
  two.s.vx = 0; two.s.vy = 0;
  put(s2, two.d.x + 2.4, two.d.y, Math.PI);
  s2.intent.fire = true; step(two.m, 25);
  T.check('cá mập thứ hai lao vào người đang bị ngậm: không cắn được, người đó vẫn bị con thứ nhất ngậm', ev(two.m, 'lunge').length === 2 && ev(two.m, 'bite').length === 1 && two.d.st === 'held' && two.d.heldBy === two.s.id && s2.stats.bites === 0 && two.s.holdId === two.d.id);
  const two2 = setup(); two2.s.intent.fire = true; step(two2.m, 3);
  two2.s.vx = 0; two2.s.vy = 0; SIM.releaseHold(two2.m, two2.s, 'test'); two2.d.iframes = 0; SIM.removeEffects(two2.d, 'ccImmune');
  put(two2.d, two2.d.x, two2.d.y, 0); put(two2.m.actors[5], two2.d.x + 2.4, two2.d.y, Math.PI);
  two2.m.actors[5].intent.fire = true; step(two2.m, 25);
  T.check('đối chứng: cùng thế trận nhưng người đó đã được nhả (đang bơi) thì con thứ hai cắn được trong vài bước lao', ev(two2.m, 'bite').length === 2 && ev(two2.m, 'bite')[1].by === 5);
  const ct = rig(), cd = ct.actors[0], cs2 = ct.actors[5];
  put(cd, arena.x, arena.y, 0); put(cs2, arena.x - 3.5, arena.y + 0.3, 0); cs2.intent.fire = true; step(ct, 25);
  T.check('đối chứng: cùng vị trí cá mập thứ hai nhưng người đó đang bơi (không bị ngậm) thì bị cắn', ev(ct, 'bite').length === 1 && ev(ct, 'bite')[0].by === 5 && ev(ct, 'bite')[0].o2 === 34);

  // ngậm bị xiên trúng thì nhả
  const g = setup(); const dh = g.d, sh = g.s, dh2 = g.m.actors[1];
  sh.intent.fire = true; step(g.m, 4);
  T.check('tiền đề: thợ lặn đang bị ngậm', dh.st === 'held' && sh.st === 'hold');
  put(dh2, sh.x - 5, sh.y, 0); aimAt(dh2, sh.x, sh.y); dh2.intent.fire = true;
  const k = stepUntil(g.m, () => ev(g.m, 'released').length > 0, 40);
  T.check('đồng đội xiên trúng cá mập: nhả mồi lý do hit, cá mập trừ đúng 20 máu (súng của Hải), người được nhả có iframes 1.2 s', k > 0 && ev(g.m, 'released')[0].why === 'hit' && dh.st === 'swim' && sh.st === 'swim' && near(sh.hp, 300, 1e-9) && dh.iframes === 1.2, sh.hp);
  T.check('tách xong thợ lặn không bị ngậm lại, cá mập không còn holdId', sh.holdId === -1 && dh.heldBy === -1);

  // choáng thì nhả
  const h = setup(); h.s.intent.fire = true; step(h.m, 4);
  SIM.addEffect(h.s, 'stun', 2, 1, -1);
  step(h.m, 1);
  T.check('cá mập đang ngậm bị choáng: nhả mồi lý do stun, vào trạng thái stun', h.d.st === 'swim' && h.s.st === 'stun' && ev(h.m, 'released')[0].why === 'stun' && h.d.iframes === 1.2);
  step(h.m, 125);
  T.check('hết choáng 2 s thì cá mập bơi lại và được miễn khống chế 2 s', h.s.st === 'swim' && SIM.effect(h.s, 'ccImmune') !== null && SIM.addEffect(h.s, 'stun', 1, 1, -1) === null);

  // ngủ: không điều khiển, không bắn, không kỹ năng, trúng đòn thì tỉnh
  const sl = setup();
  SIM.addEffect(sl.s, 'sleep', 100, 1, -1); sl.s.intent.fire = true; sl.s.intent.skill = true;
  step(sl.m, 5);
  T.check('cá mập đang ngủ: vào stun, bấm fire không lao được, bấm kỹ năng không được', sl.s.st === 'stun' && ev(sl.m, 'lunge').length === 0 && ev(sl.m, 'skill').length === 0 && sl.s.skill.cd === 0);
  SIM.damageShark(sl.m, sl.s, 10, sl.m.actors[1]);
  step(sl.m, 2);
  T.check('trúng đòn thì hết ngủ, bơi lại, và được miễn khống chế 2 s', SIM.effect(sl.s, 'sleep') === null && sl.s.st === 'swim' && near(sl.s.hp, 310, 1e-9) && SIM.effect(sl.s, 'ccImmune') !== null);
  const sd = rig(), dd = sd.actors[0];
  SIM.addEffect(dd, 'sleep', 100, 1, -1); dd.intent.fire = true; dd.intent.skill = true; step(sd, 3);
  T.check('thợ lặn đang ngủ: không bắn, không dùng kỹ năng', ev(sd, 'fire').length === 0 && ev(sd, 'skill').length === 0);

  // giáp, mũi cắn x1.6 (dùng một lần), miễn nhiễm nắm, miễn khống chế
  const ar = setup();
  SIM.addEffect(ar.s, 'armor', 100, 0.4, -1);
  const lost = SIM.damageShark(ar.m, ar.s, 24, ar.d);
  T.check('giáp 40%: xiên 24 chỉ mất 14.4 máu', near(lost, 14.4, 1e-9) && near(ar.s.hp, 305.6, 1e-9) && near(ar.d.stats.dmg, 14.4, 1e-9), lost);
  const bm = setup();
  SIM.addEffect(bm.s, 'biteMul', 100, 1.6, -1); bm.s.intent.fire = true; step(bm.m, 4);
  T.check('biteMul 1.6: cú cắn 26 × 1.6 = 41.6 O2 (o2 còn 100 - 0.02 - 41.6 - 0.4 ngậm = 57.98), và hiệu ứng mất sau cú cắn đó', ev(bm.m, 'bite')[0].o2 === 41.6 && near(bm.d.o2, 57.98, 1e-6) && SIM.effect(bm.s, 'biteMul') === null, ev(bm.m, 'bite')[0].o2 + ' ' + bm.d.o2);
  const gi = setup();
  SIM.addEffect(gi.d, 'grabImmune', 100, 1, -1); gi.s.intent.fire = true; step(gi.m, 4);
  T.check('grabImmune: vẫn bị cắn 26 O2 (100 - 0.04 - 26 = 73.96) nhưng không bị ngậm, cá mập về swim', ev(gi.m, 'bite').length === 1 && gi.d.st === 'swim' && gi.s.st === 'swim' && gi.s.holdId === -1 && near(gi.d.o2, 73.96, 1e-6), gi.d.o2);
  const ci = setup();
  SIM.addEffect(ci.d, 'ccImmune', 100, 1, -1); ci.s.intent.fire = true; step(ci.m, 4);
  T.check('ccImmune cũng không bị ngậm (nhưng vẫn mất O2)', ev(ci.m, 'bite').length === 1 && ci.d.st === 'swim' && ci.s.st === 'swim' && near(ci.d.o2, 73.96, 1e-6), ci.d.o2);
  const nd = setup();
  SIM.addEffect(nd.s, 'noDash', 100, 1, -1); nd.s.intent.fire = true; step(nd.m, 20);
  T.check('noDash: bấm fire không lao được, không cắn', nd.s.st === 'swim' && ev(nd.m, 'lunge').length === 0 && ev(nd.m, 'bite').length === 0);

  // lao lệch hướng thì trượt
  const ms = setup(); put(ms.d, arena.x, arena.y + 3, 0); ms.s.intent.fire = true; step(ms.m, 40);
  T.check('lao lệch 3 m so với thợ lặn: không cắn, hết cú lao về swim', ev(ms.m, 'bite').length === 0 && ms.s.st === 'swim' && ms.d.o2 > 99);
  // vách chắn
  const wl = rig(), dW = wl.actors[0], sW = wl.actors[4];
  const cfg = findBehindWall(wl, { stand: 1.5, len: 6, hMin: 1, hMax: 2.2, back: 6, clear: 0.4, farFromLights: 0 });
  T.check('tiền đề: tìm được thợ lặn nằm sau một lớp đá mỏng ngay trước mũi cá mập', cfg !== null);
  put(sW, cfg.x, cfg.y, cfg.a); put(dW, cfg.bx, cfg.by, 0);
  sW.intent.fire = true; step(wl, 40);
  T.check('đá chắn giữa mõm và thợ lặn: không cắn được', ev(wl, 'bite').length === 0 && dW.o2 > 99);

  // miễn sát thương lúc mới sinh: không cắn được, không ngậm
  const im = rig({ immune: true }), di = im.actors[0], si = im.actors[4];
  put(di, arena.x, arena.y, 0); put(si, arena.x - 2, arena.y, 0); si.intent.fire = true; step(im, 30);
  T.check('thợ lặn mới sinh (3 s đầu): cá mập lao vào không cắn được, O2 chỉ hao tự nhiên', ev(im, 'bite').length === 0 && di.st === 'swim' && near(di.o2, 100 - 0.6 * 30 / 60, 1e-6) && si.st === 'swim');
  T.check('hurtDiver cũng bị chặn khi miễn sát thương', SIM.hurtDiver(im, di, 10, si, 'hit') === 0 && di.o2 > 99.5);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Gục, cứu, loại, hồi sinh, ghi công');
{
  const base = rig(), arena = findArena(base);
  const mk = () => { const m = rig(), a = m.actors[0], b = m.actors[1]; put(a, arena.x, arena.y, 0); put(b, arena.x + 1, arena.y, 0); return { m, a, b }; };
  let { m, a, b } = mk();
  a.o2 = 0.001;
  step(m, 2);
  T.check('O2 chạm 0: thợ lặn gục (down), nằm chờ 12 s, ghi downs, phát sự kiện down không do cá mập nào', a.st === 'down' && near(a.stT, 12, 0.1) && a.o2 === 0 && a.stats.downs === 1 && ev(m, 'down').length === 1 && ev(m, 'down')[0].by === -1);
  T.check('tiền đề: người cứu đứng cách 1.0 m, trong tầm tương tác 1.6 m', near(Math.hypot(a.x - b.x, a.y - b.y), 1, 0.05));
  step(m, 100);
  T.check('đứng cạnh 1.67 s (< 2 s) thì chưa dậy', a.st === 'down' && a.revT > 1.6 && a.revT < 2);
  const nRev = stepUntil(m, () => a.st === 'swim', 40);
  T.check('đủ 2 s liên tục (120 lần đếm): dậy với đúng 35 O2, về swim, ghi revives cho người cứu', nRev === 19 && a.st === 'swim' && a.o2 === 35 && b.stats.revives === 1 && ev(m, 'revive').length === 1 && ev(m, 'revive')[0].by === b.id && ev(m, 'revive')[0].id === a.id, a.st + ' ' + a.o2);
  ({ m, a, b } = mk());
  a.o2 = 0.001; step(m, 2);
  step(m, 90);
  const prog = a.revT;
  put(b, arena.x + 10, arena.y, 0); step(m, 1);
  T.check('đứng cạnh 1.5 s rồi bước ra xa: tiến độ cứu về 0', prog > 1.4 && a.revT === 0 && a.st === 'down', prog + ' -> ' + a.revT);
  put(b, a.x + 1, a.y, 0); step(m, 90);
  T.check('quay lại 1.5 s: vẫn chưa dậy (phải đủ 2 s LIÊN TỤC, không cộng dồn)', a.st === 'down' && near(a.revT, 1.5, 0.02), a.st + ' ' + a.revT);
  const nBack = stepUntil(m, () => a.st === 'swim', 60);
  T.check('quay lại đủ 2 s liên tục thì dậy (thêm 30 lần đếm)', a.st === 'swim' && nBack === 30 && a.o2 === 35, a.st + ' ' + nBack);
  ({ m, a, b } = mk());
  a.o2 = 0.001; b.o2 = 0.001; step(m, 200);
  T.check('hai người cùng gục: không ai cứu ai (cần người đang bơi)', a.st === 'down' && b.st === 'down' && a.stats.revives === 0);
  ({ m, a, b } = mk());
  SIM.addZone(m, { kind: 'o2gen', x: a.x, y: a.y, r: 4, dur: 30, team: 'diver', reviveMul: 2 });
  a.o2 = 0.001; step(m, 2);
  const nMul = stepUntil(m, () => a.st === 'swim', 120);
  T.check('trong vùng reviveMul 2: dậy sau 1 s (60 lần đếm gấp đôi) thay vì 2 s', a.st === 'swim' && nMul === 59 && a.o2 === 35, a.st + ' ' + nMul);
  // gục không ai cứu thì bị loại, rơi kho báu tại chỗ
  ({ m, a, b } = mk());
  put(b, arena.x + 30, arena.y, 0);
  m.loot[0].x = a.x + 0.3; m.loot[0].y = a.y; step(m, 1);
  T.check('tiền đề: đang mang 1 món kho báu', a.carry.length === 1 && m.loot[0].st === 'carried');
  a.o2 = 0.001; step(m, 2);
  T.check('gục thì rơi kho báu tại chỗ: món về rest, by = -1, carryKg = 0, phát drop', m.loot[0].st === 'rest' && m.loot[0].by === -1 && a.carry.length === 0 && a.carryKg === 0 && ev(m, 'drop').length === 1 && Math.hypot(m.loot[0].x - a.x, m.loot[0].y - a.y) < 0.5);
  step(m, 715);
  T.check('nằm gục 11.9 s vẫn chưa bị loại', a.st === 'down');
  step(m, 10);
  T.check('hết 12 s gục thì bị loại: out, ghi outs, sự kiện out lý do timer', a.st === 'out' && a.stats.outs === 1 && ev(m, 'out').length === 1 && ev(m, 'out')[0].why === 'timer');
  step(m, 410);
  T.check('bị loại 6.9 s vẫn chưa hồi sinh', a.st === 'out' && m.tickets === 4);
  step(m, 20);
  const sp = m.spawns.diver[0];
  T.check('sau 7 s hồi sinh ở chỗ thả (cá mập đều ở xa): swim, O2 đầy, tickets 4 → 3, sự kiện respawn', a.st === 'swim' && near(a.o2, 100, 0.2) && near(a.x, sp[0], 0.1) && near(a.y, sp[1], 0.1) && m.tickets === 3 && ev(m, 'respawn').length === 1, a.st + ' ' + m.tickets);
  const imm = SIM.effect(a, 'spawnImmune');
  T.check('hồi sinh xong lại được miễn sát thương 3 s', imm !== null && near(imm.until - m.t, 3 - 0.2, 0.2) && SIM.hurtDiver(m, a, 10, m.actors[4], 'hit') === 0);
  // hết lượt thì nằm lại
  ({ m, a, b } = mk());
  put(b, arena.x + 30, arena.y, 0); m.tickets = 0;
  a.o2 = 0.001; step(m, 2 + 720 + 10); step(m, 600);
  T.check('hết lượt hồi sinh: bị loại rồi nằm lại, tickets vẫn 0, stT không âm', a.st === 'out' && m.tickets === 0 && a.stT === 0);
  // hồi sinh ở khoang cứu hộ khi cá mập đứng gần chỗ thả
  ({ m, a, b } = mk());
  put(b, arena.x + 30, arena.y, 0);
  const spawn0 = m.spawns.diver[0];
  put(m.actors[4], spawn0[0] + 8, spawn0[1] - 3, 0); put(m.actors[5], spawn0[0] + 10, spawn0[1] - 3, 0);
  a.o2 = 0.001; step(m, 2 + 720 + 5 + 430);
  const pd = m.pods.map((p) => Math.min(Math.hypot(p.x - m.actors[4].x, p.y - m.actors[4].y), Math.hypot(p.x - m.actors[5].x, p.y - m.actors[5].y)));
  const bestPod = pd.indexOf(Math.max.apply(null, pd));
  T.check('hai cá mập đứng sát chỗ thả: thợ lặn hồi sinh ở khoang cứu hộ xa cá mập nhất (không phải chỗ thả)', a.st === 'swim' && Math.hypot(a.x - m.pods[bestPod].x, a.y - m.pods[bestPod].y) < 1.5 && Math.hypot(a.x - spawn0[0], a.y - spawn0[1]) > 20, 'pod ' + bestPod + ' ' + a.x.toFixed(1) + ',' + a.y.toFixed(1));

  // công hạ gục: cá mập cuối cùng làm mất O2 trong 10 s
  const mb = rig(), d = mb.actors[0], s = mb.actors[4];
  put(d, arena.x, arena.y, 0); put(s, arena.x - 2, arena.y, 0); d.o2 = 20;
  s.intent.fire = true; step(mb, 4);
  T.check('cắn khi O2 còn 20 (< 26): thợ lặn gục ngay, không bị ngậm, cá mập về swim', d.st === 'down' && d.o2 === 0 && s.st === 'swim' && s.holdId === -1 && ev(mb, 'bite').length === 1 && ev(mb, 'bite')[0].o2 > 19.9 && ev(mb, 'bite')[0].o2 < 20);
  T.check('ghi công: cá mập downs 1 và dmg ~20; thợ lặn downs 1; down sự kiện by = cá mập', s.stats.downs === 1 && near(s.stats.dmg, 20, 0.1) && d.stats.downs === 1 && ev(mb, 'down')[0].by === s.id);
  step(mb, 730);
  T.check('hết giờ nằm gục: cá mập đã hạ gục được ghi outs 1, thợ lặn outs 1', d.st === 'out' && s.stats.outs === 1 && d.stats.outs === 1 && ev(mb, 'out')[0].by === s.id);
  const win = (o2) => {
    const r = rig(), dv = r.actors[0], sk = r.actors[4];
    put(dv, arena.x, arena.y, 0); put(sk, arena.x - 2, arena.y, 0); dv.o2 = o2;
    SIM.addEffect(dv, 'grabImmune', 1000, 1, -1);
    sk.intent.fire = true; step(r, 4);
    step(r, 60 * 14);
    return { r, dv, sk };
  };
  const w1 = win(30);
  T.check('bị cắn còn 4 O2 rồi hao tự nhiên hết trong ~6.6 s (< 10 s): cá mập vẫn được ghi công hạ gục', w1.dv.st === 'down' && w1.sk.stats.downs === 1 && w1.dv.downBy === w1.sk.id, w1.dv.st + ' ' + w1.sk.stats.downs);
  const w2b = rig(), dvb = w2b.actors[0], skb = w2b.actors[4];
  put(dvb, arena.x, arena.y, 0); put(skb, arena.x - 2, arena.y, 0); dvb.o2 = 40; SIM.addEffect(dvb, 'grabImmune', 1000, 1, -1);
  skb.intent.fire = true; step(w2b, 4);
  step(w2b, 60 * 24);
  T.check('bị cắn còn 14 O2, phải ~23 s mới hao hết (> cửa sổ 10 s): thợ lặn gục, downs 1, nhưng không cá mập nào được ghi công (downBy -1, cá mập downs 0)', dvb.st === 'down' && dvb.stats.downs === 1 && dvb.downBy === -1 && skb.stats.downs === 0 && ev(w2b, 'down')[0].by === -1, dvb.st + ' ' + dvb.o2);
  // hai cá mập: kẻ cuối cùng làm mất O2 trong cửa sổ được ghi công
  const two = rig(), dt2 = two.actors[0], sa = two.actors[4], sb = two.actors[5];
  put(dt2, arena.x, arena.y, 0); put(sa, arena.x - 2, arena.y, 0); put(sb, arena.x + 6, arena.y, Math.PI); dt2.o2 = 50;
  SIM.addEffect(dt2, 'grabImmune', 1000, 1, -1);
  sa.intent.fire = true; step(two, 4);
  step(two, 60 * 4);
  put(sb, dt2.x + 2, dt2.y, Math.PI); dt2.o2 = 10;
  sb.intent.fire = true; step(two, 4);
  T.check('A cắn lúc đầu, 4 s sau B cắn cho O2 về 0: B (kẻ cuối trong cửa sổ 10 s) được ghi công, A không', dt2.st === 'down' && sb.stats.downs === 1 && sa.stats.downs === 0 && dt2.downBy === sb.id, dt2.st + ' B' + sb.stats.downs + ' A' + sa.stats.downs);
  // cú cắn kết liễu người đang gục
  const fin = rig(), dd = fin.actors[0], s1 = fin.actors[4], s2 = fin.actors[5];
  put(dd, arena.x, arena.y, 0); put(s1, arena.x - 2, arena.y, 0); put(s2, arena.x + 3.5, arena.y, Math.PI);
  dd.o2 = 20; s1.intent.fire = true; step(fin, 4);
  T.check('tiền đề: thợ lặn gục do cá mập 1', dd.st === 'down' && dd.downBy === s1.id);
  s2.intent.fire = true; step(fin, 12);
  T.check('cá mập 2 cắn người đang gục: loại luôn, ghi outs cho cá mập 2 (kẻ kết liễu), không cho cá mập 1', dd.st === 'out' && s2.stats.outs === 1 && s1.stats.outs === 0 && s2.stats.bites === 1 && ev(fin, 'out')[0].why === 'bite' && ev(fin, 'out')[0].by === s2.id);
  // người gục chìm dần về 0.45 m/s (không tự bơi, không trôi ngang): vy tiến về -0.45 theo tỉ lệ drag 2.6/60 mỗi bước
  const sk = rig(), ds = sk.actors[0];
  put(ds, arena.x, arena.y, 0); ds.vx = 1; ds.o2 = 0.001; step(sk, 1);
  const y0 = ds.y, fd = 2.6 / 60, tail = Math.pow(1 - fd, 180);
  step(sk, 180);
  T.check('tiền đề: gục ngay bước đầu, đang chìm', ds.st === 'down' && y0 === arena.y);
  T.check('gục thì chìm: sau 180 bước vy = -0.45 × (1 - 0.9567^180) và đã chìm 0.45 × (180 - tổng cấp số) / 60 = 1.1845 m, vx tắt dần hết', near(ds.vy, -0.45 * (1 - tail), 1e-9) && near(y0 - ds.y, 0.45 * (180 - (1 - fd) * (1 - tail) / fd) / 60, 1e-6) && near(y0 - ds.y, 1.1845, 1e-3) && near(ds.vx, Math.pow(1 - fd, 181), 1e-9), (y0 - ds.y).toFixed(4) + ' vy ' + ds.vy + ' vx ' + ds.vx);
  const out = rig(), o1 = out.actors[0];
  SIM.setState(out, o1, 'held');
  T.check('bảng chuyển trạng thái: swim -> held cho phép; down -> held, out -> down, swim -> swim bị từ chối', o1.st === 'held' && SIM.setState(out, o1, 'down') === true && SIM.setState(out, o1, 'held') === false && SIM.setState(out, o1, 'swim') === true && SIM.setState(out, o1, 'swim') === false && SIM.setState(out, out.actors[4], 'hold') === false && SIM.setState(out, out.actors[4], 'banana') === false && out.actors[4].st === 'swim');
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Cá mập: máu, hồi, thể lực, hồi sinh, lồng, vùng an toàn khoang');
{
  const base = rig(), arena = findArena(base);
  const m = rig(), s = m.actors[4];
  put(s, arena.x - 6, arena.y, 0);
  SIM.damageShark(m, s, 50, m.actors[0]);
  step(m, 296);
  T.check('bị trúng 50: 4.9 s sau chưa hồi máu (regenDelay 5 s)', near(s.hp, 270, 1e-9), s.hp);
  step(m, 124);
  T.check('qua 5 s thì hồi 6 máu/s: ~2 s sau là 270 + 12 = 282', near(s.hp, 282, 0.2), s.hp);
  const mm = rig(), s1 = mm.actors[4], d = mm.actors[0];
  put(s1, arena.x - 6, arena.y, 0); s1.hp = 24; s1.lastDmgT = mm.t;
  const lost = SIM.damageShark(mm, s1, 24, d);
  T.check('xiên 24 vào cá mập còn 24 máu: hết máu, vào out, đếm sharkOuts cho thợ lặn, sự kiện shark-out', lost === 24 && s1.hp === 0 && s1.st === 'out' && d.stats.sharkOuts === 1 && ev(mm, 'shark-out').length === 1 && ev(mm, 'shark-out')[0].by === d.id && near(d.stats.dmg, 24, 1e-9));
  const t0 = mm.t;
  step(mm, 475);
  T.check('out 7.9 s vẫn chưa hồi sinh', s1.st === 'out');
  step(mm, 10);
  const dmin = (p) => Math.min.apply(null, mm.actors.filter((x) => x.team === 'diver' && x.st !== 'out').map((x) => Math.hypot(x.x - p[0], x.y - p[1])));
  const far = mm.spawns.shark.reduce((bst, p) => (dmin(p) > dmin(bst) ? p : bst), mm.spawns.shark[0]);
  T.check('sau 8 s hồi sinh ở chỗ sinh xa thợ lặn gần nhất nhất, đầy máu, sự kiện shark-respawn', s1.st === 'swim' && s1.hp === 320 && s1.x === far[0] && s1.y === far[1] && ev(mm, 'shark-respawn').length === 1 && near(mm.t - t0, 8, 0.1), s1.st + ' ' + s1.hp);
  const imm = SIM.effect(s1, 'spawnImmune');
  T.check('cá mập hồi sinh cũng được miễn sát thương 3 s', imm !== null && SIM.damageShark(mm, s1, 50, d) === 0 && s1.hp === 320);
  // lao thể lực: v += (muốn - v) × accel × dt, accel của cá mập 3
  const dm = rig(), s2 = dm.actors[4];
  put(s2, arena.x - 12, arena.y, 0);
  s2.intent.mx = 1; s2.intent.boost = true;
  step(dm, 60);
  T.check('lao 1 s: tốc độ = 7 × (1 - 0.95^60) = 6.68 m/s, thể lực 100 - 45 = 55', near(speedOf(s2), 6.678, 0.02) && near(s2.stamina, 55, 0.01), speedOf(s2) + ' / ' + s2.stamina);
  step(dm, 108);
  T.check('lao 2.8 s: hết thể lực (134 bước) nên bị khoá lao, đang hồi thể lực (0 < thể lực < 15), tốc độ rơi dần về 4.2 (còn 4.69)', s2.dashLock === true && s2.stamina > 0 && s2.stamina < 15 && near(speedOf(s2), 4.69, 0.05), s2.stamina + ' ' + speedOf(s2) + ' ' + s2.dashLock);
  step(dm, 15);
  T.check('hồi tới 15 thể lực (sau ~41 bước) thì khoá lao mở và lao lại', s2.dashLock === false || s2.stamina < 15, s2.stamina + ' ' + s2.dashLock);
  const sw = rig(), s3 = sw.actors[4];
  put(s3, arena.x - 12, arena.y, 0);
  s3.intent.mx = 1;
  step(sw, 30);
  T.check('bơi thường 0.5 s: tốc độ = 4.2 × (1 - 0.95^30) = 3.30 m/s', near(speedOf(s3), 3.2985, 0.01), speedOf(s3));
  step(sw, 90);
  T.check('bơi thường 2 s: 4.2 × (1 - 0.95^120) = 4.19 m/s, thể lực nguyên 100', near(speedOf(s3), 4.1912, 0.01) && s3.stamina === 100, speedOf(s3));
  s3.intent.mx = 0;
  step(sw, 30);
  T.check('thả hướng: hãm theo drag 1.6, 0.5 s sau còn 4.19 × (1 - 1.6/60)^30 = 1.86 m/s', near(speedOf(s3), 1.864, 0.03), speedOf(s3));
  const tn = rig(), s4 = tn.actors[4];
  put(s4, arena.x, arena.y, 0);
  s4.intent.mx = 0; s4.intent.my = 1;
  step(tn, 30);
  T.check('quay mũi: sau 0.5 s đã quay 1.6 rad (3.2 × 0.5), tức vừa đủ 90° rồi đứng lại', near(s4.ang, Math.PI / 2, 0.02), s4.ang);
  const turn = rig(), s5 = turn.actors[4];
  put(s5, arena.x, arena.y, 0);
  s5.intent.mx = 0; s5.intent.my = -1;
  step(turn, 15);
  T.check('quay nửa giây: 15 bước × 3.2/60 = 0.8 rad về phía dưới', near(s5.ang, -0.8, 1e-6), s5.ang);
  const ba = rig(), s6 = ba.actors[4];
  put(s6, arena.x - 12, arena.y, 0);
  SIM.addEffect(s6, 'speed', 100, 1.8, -1); s6.intent.mx = 1;
  step(ba, 180);
  T.check('hiệu ứng speed 1.8: 4.2 × 1.8 × (1 - 0.95^180) = 7.56 m/s', near(speedOf(s6), 7.56, 0.02), speedOf(s6));
  const ch = rig(), s7 = ch.actors[4];
  put(s7, arena.x - 12, arena.y, 0);
  SIM.addEffect(s7, 'slow', 100, 0.8, -1); s7.intent.mx = 1;
  step(ch, 180);
  T.check('cá mập chậm 0.8 chạm sàn 0.4: 4.2 × 0.4 = 1.68 m/s', near(speedOf(s7), 1.68, 0.02), speedOf(s7));
  // lồng thép: cá mập không vào được; thợ lặn bên trong sát mép không bị cắn xuyên lồng
  const cg = rig(), sc = cg.actors[4];
  put(sc, arena.x - 8, arena.y, 0);
  SIM.addZone(cg, { kind: 'cage', x: arena.x - 3, y: arena.y, r: 2, dur: 30, team: 'diver' });
  sc.intent.mx = 1; let minGap = 1e9;
  for (let i = 0; i < 240; i++) { SIM.step(cg, DT); minGap = Math.min(minGap, Math.hypot(sc.x - (arena.x - 3), sc.y - arena.y)); }
  T.check('lồng r 2 m: cá mập r 0.9 không vào được, giữ cách tâm >= 2.9 m', minGap >= 2.9 - 1e-6 && sc.x < arena.x - 3, minGap.toFixed(3));
  const bk = (withCage) => {
    const m2 = rig(), s9 = m2.actors[4], d9 = m2.actors[0];
    put(s9, arena.x - 6, arena.y, 0); put(d9, arena.x - 3.9, arena.y, 0);
    if (withCage) SIM.addZone(m2, { kind: 'cage', x: arena.x - 2, y: arena.y, r: 2.2, dur: 30, team: 'diver' });
    s9.intent.fire = true; step(m2, 40);
    return ev(m2, 'bite').length;
  };
  T.check('đối chứng: cùng thế trận không lồng thì cắn trúng; có lồng bao thợ lặn thì không cắn được', bk(false) === 1 && bk(true) === 0);
  // vùng an toàn quanh khoang cứu hộ: cá mập bị đẩy ra ngoài bán kính 5 m
  const pm = rig(), sp = pm.actors[4], pod = pm.pods[0];
  let aim = null;
  for (let deg = 0; deg < 360 && !aim; deg += 5) {
    const a = deg * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    if (pm.world.clear(pod.x, pod.y, pod.x + ux * 9, pod.y + uy * 9) && pm.world.open(pod.x + ux * 9, pod.y + uy * 9, 1.5) && pm.world.open(pod.x + ux * 6, pod.y + uy * 6, 1.5) && pm.world.open(pod.x + ux * 5, pod.y + uy * 5, 1.5)) aim = [ux, uy];
  }
  T.check('tiền đề: có hướng thoáng dài 9 m tới khoang cứu hộ 0 cho cá mập (r 1.2) bơi vào', aim !== null);
  put(sp, pod.x + aim[0] * 9, pod.y + aim[1] * 9, Math.atan2(-aim[1], -aim[0]));
  sp.intent.mx = -aim[0]; sp.intent.my = -aim[1]; sp.intent.boost = true;
  let minD = 1e9;
  for (let i = 0; i < 300; i++) { SIM.step(pm, DT); minD = Math.min(minD, Math.hypot(sp.x - pod.x, sp.y - pod.y)); }
  T.check('cá mập lao thẳng vào khoang cứu hộ: không bao giờ vào trong bán kính an toàn 5 m (gần nhất ' + minD.toFixed(3) + ' m)', minD >= 5 - 1e-6 && minD < 5.3, minD.toFixed(3));
  put(sp, pod.x + aim[0] * 2, pod.y + aim[1] * 2, 0); sp.intent.mx = 0; sp.intent.my = 0;
  step(pm, 2);
  T.check('cá mập đặt thẳng vào trong vùng an toàn bị đẩy ra tới biên 5 m ngay bước sau', near(Math.hypot(sp.x - pod.x, sp.y - pod.y), 5, 0.01), Math.hypot(sp.x - pod.x, sp.y - pod.y).toFixed(3));
  // thợ lặn không bị đẩy, đứng trong vùng an toàn bình thường
  const pd2 = rig(), dpod = pd2.actors[0];
  put(dpod, pod.x, pod.y, 0); step(pd2, 5);
  T.check('thợ lặn đứng ngay giữa khoang cứu hộ: không bị đẩy đi đâu', near(dpod.x, pod.x, 1e-6) && near(dpod.y, pod.y, 1e-6));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Kho báu, khoang cứu hộ, rương O2, kết thúc');
{
  const base = rig(), arena = findArena(base);
  const m = rig(), d = m.actors[0], pod = m.pods[0], lt = m.loot[0];
  // Góc quanh khoang mà cả điểm cách tâm 1.9 m lẫn 2.2 m đều thoáng cho thợ lặn đứng (ranh nộp r = 2.0 nằm giữa hai điểm).
  const podAngle = (mm, p, r) => {
    for (let deg = 0; deg < 360; deg += 15) {
      const a = deg * Math.PI / 180;
      if (mm.world.open(p.x + Math.cos(a) * 1.9, p.y + Math.sin(a) * 1.9, r) && mm.world.open(p.x + Math.cos(a) * 2.2, p.y + Math.sin(a) * 2.2, r)) return a;
    }
    return null;
  };
  const pa = podAngle(m, pod, d.r);
  const at = (p, dist) => [p.x + Math.cos(pa) * dist, p.y + Math.sin(pa) * dist];
  // Nhặt giữa vùng thoáng rồi mới đem tới khoang: chỗ cách khoang 6 m có thể là đá.
  const grab = (mm, dv, l) => { l.x = arena.x + 1; l.y = arena.y; put(dv, arena.x + 0.6, arena.y, 0); step(mm, 1); };
  T.check('tiền đề: khoang cứu hộ 0 nằm ở nước thoáng, có chỗ đứng cách tâm 1.9 m và 2.2 m', m.world.open(pod.x, pod.y, 0.3) && pa !== null);
  grab(m, d, lt);
  T.check('chạm món kho báu thì nhặt: carried, by 0, carry [0], carryKg = kg, sự kiện pickup', lt.st === 'carried' && lt.by === 0 && d.carry.join() === '0' && d.carryKg === lt.kg && ev(m, 'pickup').length === 1 && ev(m, 'pickup')[0].loot === 0);
  const val = lt.value, p19 = at(pod, 1.9);
  put(d, p19[0], p19[1], 0); step(m, 1);
  T.check('nộp (cách tâm 1.9 m < r = 2): score.banked tăng đúng giá trị món, stats.banked = giá trị, carry rỗng, sự kiện bank', lt.st === 'banked' && m.score.banked === val && d.stats.banked === val && d.carry.length === 0 && d.carryKg === 0 && ev(m, 'bank').length === 1 && ev(m, 'bank')[0].value === val && ev(m, 'bank')[0].pod === 0, m.score.banked + ' vs ' + val);
  const m2 = rig(), d2 = m2.actors[0], p2 = m2.pods[0];
  grab(m2, d2, m2.loot[0]);
  const p22 = at(p2, 2.2);
  put(d2, p22[0], p22[1], 0); step(m2, 1);
  T.check('cách tâm khoang 2.2 m (> r = 2.0) thì chưa nộp', m2.loot[0].st === 'carried' && m2.score.banked === 0 && d2.carry.length === 1);
  // chỉ thợ lặn đang bơi mới nộp: bị ngậm giữa khoang thì chưa nộp, được nhả thì nộp
  const hb = rig(), dh = hb.actors[0], ph = hb.pods[0], sh = hb.actors[4];
  grab(hb, dh, hb.loot[0]);
  SIM.setState(hb, dh, 'held');
  dh.heldBy = sh.id; sh.holdId = dh.id; SIM.setState(hb, sh, 'lunge'); SIM.setState(hb, sh, 'hold'); sh.stT = 100;
  put(sh, arena.x - 6, arena.y, 0);
  for (let i = 0; i < 5; i++) { put(dh, ph.x, ph.y, 0); step(hb, 1); }
  T.check('đang bị ngậm ngay giữa khoang cứu hộ (đặt lại giữa khoang trước mỗi bước): không nộp được (chỉ thợ lặn đang bơi mới nộp)', dh.st === 'held' && hb.loot[0].st === 'carried' && hb.score.banked === 0 && dh.carry.length === 1);
  SIM.releaseHold(hb, sh, 'test'); put(dh, ph.x, ph.y, 0); step(hb, 2);
  T.check('được nhả ra (swim) ngay giữa khoang thì nộp luôn', dh.st === 'swim' && hb.loot[0].st === 'banked' && hb.score.banked === hb.loot[0].value);
  // quá tải
  const w = rig(), dw = w.actors[0];
  w.loot[0].kg = 15; w.loot[1].kg = 15;
  put(dw, w.loot[0].x - 0.3, w.loot[0].y, 0); step(w, 1);
  const first = w.loot[0].st;
  w.loot[1].x = dw.x + 0.3; w.loot[1].y = dw.y; step(w, 5);
  T.check('đang mang 15 kg, món 15 kg nữa (30 > 20) thì không nhặt', first === 'carried' && w.loot[1].st === 'rest' && dw.carryKg === 15);
  w.loot[2].kg = 5; w.loot[2].x = dw.x + 0.3; w.loot[2].y = dw.y; step(w, 1);
  T.check('món 5 kg vừa đủ 20 kg thì nhặt được', w.loot[2].st === 'carried' && dw.carryKg === 20);
  // rương O2
  const o = rig(), dO = o.actors[0], chest = o.o2[0];
  put(dO, chest.x, chest.y, 0); dO.o2 = 50;
  step(o, 1);
  T.check('chạm rương O2 sẵn sàng: +35 (50 → 84.99), rương nghỉ 20 s, sự kiện o2box', near(dO.o2, 50 - 0.01 + 35, 0.01) && near(chest.readyAt - o.t, 20, 1e-6) && ev(o, 'o2box').length === 1);
  dO.o2 = 40; step(o, 60);
  T.check('rương đang nghỉ thì không nạp (1 s sau vẫn ~40)', dO.o2 < 40 && ev(o, 'o2box').length === 1);
  step(o, 1190); put(dO, chest.x, chest.y, 0); step(o, 1);
  T.check('hết 20 s nghỉ: nạp lại +35 (40 - 0.01 × 1251 bước + 35 = 62.49)', ev(o, 'o2box').length === 2 && near(dO.o2, 62.49, 1e-6), dO.o2);
  const f = rig(), dF = f.actors[0], cF = f.o2[0];
  put(dF, cF.x, cF.y, 0); step(f, 1);
  T.check('O2 đầy mà chạm rương: luật chỉ nói chạm là nạp nên rương vẫn bị dùng (O2 kẹp ở 100, rương nghỉ 20 s)', dF.o2 === 100 && near(cF.readyAt - f.t, 20, 1e-6) && ev(f, 'o2box').length === 1);

  // kết thúc: thợ lặn đạt chỉ tiêu bằng nhặt và nộp thật theo từng chuyến
  const e = rig(), dE = e.actors[0], pE = e.pods[0];
  let preBank = 0;
  const target = e.score.target;
  for (const l of e.loot) {
    if (e.phase === 'end') break;
    if (dE.carryKg + l.kg > 20) { preBank = e.score.banked; put(dE, pE.x, pE.y, 0); step(e, 1); }
    if (e.phase === 'end') break;
    put(dE, l.x, l.y, 0); step(e, 1);
  }
  if (e.phase !== 'end') { preBank = e.score.banked; put(dE, pE.x, pE.y, 0); step(e, 1); }
  T.check('nộp đủ chỉ tiêu 0.6: trận kết thúc, winner diver, lý do target, banked >= target', e.phase === 'end' && e.result.winner === 'diver' && e.result.reason === 'target' && e.score.banked >= target && target > 0, JSON.stringify(e.result) + ' ' + e.score.banked + '/' + target);
  T.check('kết thúc đúng lúc vượt chỉ tiêu: trước chuyến cuối banked < target, sự kiện end có winner', preBank < target && ev(e, 'end').length === 1 && ev(e, 'end')[0].winner === 'diver' && ev(e, 'phase').pop().phase === 'end', preBank + ' < ' + target);
  const tEnd = e.t, resBefore = JSON.stringify(e.result);
  step(e, 120); put(dE, e.loot[0].x, e.loot[0].y, 0); dE.intent.mx = 1; step(e, 60);
  T.check('sau khi kết thúc: bước chỉ tăng phaseT (t không đổi, không ai dời, kết quả không ghi lại)', e.t === tEnd && dE.x === e.loot[0].x && JSON.stringify(e.result) === resBefore && ev(e, 'end').length === 1 && near(e.phaseT, 3, 1e-6), 'phaseT ' + e.phaseT);

  // hết giờ: bốn thợ lặn giống nhau đứng yên cùng hết O2 lúc 166.7 s (không ai còn bơi để cứu ai), gục, bị loại, hồi sinh bằng 4 lượt chung
  const t = rig({ divers: ['dave', 'dave', 'dave', 'dave'] });
  step(t, 14399);
  T.check('239.98 s vẫn chưa hết giờ', t.phase === 'play' && t.result === null);
  step(t, 2);
  T.check('đủ 240 s: winner shark, lý do time', t.phase === 'end' && t.result.winner === 'shark' && t.result.reason === 'time' && near(t.t, 240, 0.02), JSON.stringify(t.result) + ' t=' + t.t);
  T.check('đứng yên cả trận: O2 cạn lúc 166.7 s → gục 12 s → loại 7 s → hồi sinh lúc 185.7 s dùng hết 4 lượt, lúc 240 s O2 = 100 - 0.6 × 54.3 = 67.4', t.tickets === 0 && t.actors[0].st === 'swim' && near(t.actors[0].o2, 67.4, 0.4) && ev(t, 'respawn').length === 4 && ev(t, 'down').length === 4, 'tickets ' + t.tickets + ' o2 ' + t.actors[0].o2);

  // bị diệt hết
  const wp = rig();
  wp.tickets = 0;
  for (let i = 0; i < 4; i++) wp.actors[i].o2 = 0.001;
  step(wp, 2);
  T.check('tiền đề: cả 4 thợ lặn gục, hết lượt hồi sinh', wp.actors.slice(0, 4).every((a) => a.st === 'down') && wp.tickets === 0 && wp.phase === 'play');
  step(wp, 725);
  T.check('hết lượt và cả 4 thợ lặn bị loại: winner shark, lý do wipe, ở giây ~12', wp.phase === 'end' && wp.result.winner === 'shark' && wp.result.reason === 'wipe' && near(wp.t, 12, 0.2), JSON.stringify(wp.result) + ' t=' + wp.t);
  const wq = rig();
  wq.tickets = 1;
  for (let i = 0; i < 4; i++) wq.actors[i].o2 = 0.001;
  step(wq, 2 + 725);
  T.check('còn 1 lượt thì cả 4 bị loại vẫn chưa hết: một người sẽ hồi sinh', wq.phase === 'play' && wq.actors.every((a) => a.team === 'shark' || a.st === 'out' || a.st === 'down'));
  step(wq, 440);
  T.check('một thợ lặn hồi sinh (tickets 0), trận tiếp tục vì còn người bơi', wq.phase === 'play' && wq.tickets === 0 && wq.actors.slice(0, 4).filter((a) => a.st === 'swim').length === 1);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Hiệu ứng, vùng, truy vấn');
{
  const m = rig(), a = m.actors[0];
  const e1 = SIM.addEffect(a, 'slow', 2, 0.3, 4), e2 = SIM.addEffect(a, 'slow', 3, 0.5, 5);
  T.check('effect() trả hiệu ứng mạnh nhất (mag lớn nhất): slow 0.5', SIM.effect(a, 'slow') === e2 && e1 !== e2 && SIM.effect(a, 'slow').mag === 0.5 && SIM.effect(a, 'stun') === null);
  SIM.addEffect(a, 'stealth', 5, 4, 1); SIM.addEffect(a, 'stealth', 5, 2.5, 2);
  T.check('stealth: mag là bán kính lộ nên nhỏ nhất là mạnh nhất (2.5)', SIM.effect(a, 'stealth').mag === 2.5);
  const n0 = a.effects.length;
  SIM.addEffect(a, 'bleed', 10, 2, 4); SIM.addEffect(a, 'bleed', 10, 3, 4);
  T.check('cùng kind + cùng nguồn thì gia hạn chứ không thêm mục (danh sách không phình), mag lấy bản mới', a.effects.length === n0 + 1 && SIM.effect(a, 'bleed').mag === 3);
  step(m, 181);
  T.check('qua 3 s: effect hết hạn (slow nguồn 5 dur 3 và nguồn 4 dur 2), gỡ khỏi danh sách', SIM.effect(a, 'slow') === null && !a.effects.some((x) => x.kind === 'slow'));
  SIM.removeEffects(a, 'bleed');
  T.check('removeEffects xoá hết một loại', SIM.effect(a, 'bleed') === null && SIM.effect(a, 'stealth') !== null);
  const arena = findArena(m);
  const n = rig(), d = n.actors[0], s = n.actors[4], s2 = n.actors[5];
  put(d, arena.x, arena.y, 0); put(s, arena.x + 3, arena.y, 0); put(s2, arena.x + 1, arena.y + 3, 0);
  const near1 = SIM.actorsNear(n, arena.x, arena.y, 3.5);
  T.check('actorsNear: các actor trong 3.5 m, gần trước (thợ lặn 0 m, cá mập 2 ở 3.16 m, cá mập 1 ở 3 m)', near1.map((x) => x.id).join() === '0,4,5', near1.map((x) => x.id).join());
  T.check('actorsNear lọc theo phe và bỏ người đã bị loại', SIM.actorsNear(n, arena.x, arena.y, 3.5, 'shark').map((x) => x.id).join() === '4,5' && (SIM.setState(n, s, 'out'), SIM.actorsNear(n, arena.x, arena.y, 3.5).map((x) => x.id).join() === '0,5'));
  let ray = null;
  for (let deg = 0; deg < 360 && !ray; deg += 5) {
    const ra = deg * Math.PI / 180, ex = arena.x + Math.cos(ra) * 60, ey = arena.y + Math.sin(ra) * 60;
    if (n.world.raycast(arena.x, arena.y, ex, ey)) ray = { ex, ey };
  }
  T.check('tiền đề: có hướng 60 m từ giữa vùng thoáng đâm vào đá', ray !== null);
  const rc = n.world.raycast(arena.x, arena.y, ray.ex, ray.ey);
  const onSeg = (k) => [arena.x + (ray.ex - arena.x) * k, arena.y + (ray.ey - arena.y) * k];
  T.check('raycast: đoạn xuyên đá trả {x,y,t} nằm đúng trên đoạn, ngay trước điểm trúng còn nước; đoạn thông trả null', rc !== null && rc.t > 0 && rc.t < 1 && near(rc.x, onSeg(rc.t)[0], 1e-9) && near(rc.y, onSeg(rc.t)[1], 1e-9) && !n.world.solid(onSeg(rc.t - 0.0005)[0], onSeg(rc.t - 0.0005)[1]) && SIM.raycast(n, arena.x, arena.y, arena.x + 3, arena.y) === null);
  const rq = SIM.raycast(n, arena.x, arena.y, ray.ex, ray.ey);
  T.check('SIM.raycast trả cùng kết quả {x,y,t} như world.raycast', rq !== null && near(rq.t, rc.t, 1e-12) && near(rq.x, rc.x, 1e-12) && near(rq.y, rc.y, 1e-12));
  // vùng: hết hạn bị gỡ, onTick chạy mỗi bước, onExpire chạy một lần
  const zn = rig(); let ticks = 0, expired = 0;
  const z = SIM.addZone(zn, { kind: 'o2gen', x: 0, y: 0, r: 1, dur: 1, team: 'diver', onTick: () => { ticks++; }, onExpire: () => { expired++; } });
  step(zn, 30);
  T.check('zone: id cấp tự động, onTick chạy mỗi bước còn sống, chưa hết hạn thì còn trong m.zones', typeof z.id === 'number' && ticks === 30 && expired === 0 && zn.zones.length === 1);
  step(zn, 40);
  T.check('zone hết hạn sau 1 s: bị gỡ khỏi m.zones, onExpire đúng 1 lần, onTick ~60 lần', zn.zones.length === 0 && expired === 1 && ticks >= 59 && ticks <= 61, 'ticks ' + ticks);
  // shrink: nhỏ lại trong thời gian hiệu ứng, hết hạn mà chỗ chưa đủ rộng thì vẫn nhỏ
  const sk = rig(), ss = sk.actors[4];
  put(ss, arena.x, arena.y, 0);
  SIM.addEffect(ss, 'shrink', 1, 0.55, -1);
  step(sk, 2);
  T.check('shrink 0.55: bán kính 0.9 × 0.55 = 0.495 trong thời gian hiệu ứng', near(ss.r, 0.495, 1e-9));
  step(sk, 70);
  T.check('hết hiệu ứng ở chỗ rộng thì nở lại bán kính thật 0.9', ss.r === 0.9);
  let crev = null;
  for (let x = -60; x <= 60 && !crev; x += 0.5) for (let y = -25; y <= 15 && !crev; y += 0.5) {
    if (sk.world.open(x, y, 0.5) && !sk.world.open(x, y, 0.9)) crev = { x, y };
  }
  T.check('tiền đề: tìm được khe chỉ lọt bán kính 0.5 mà không lọt 0.9', crev !== null);
  put(ss, crev.x, crev.y, 0);
  SIM.addEffect(ss, 'shrink', 1, 0.55, -1);
  step(sk, 120);
  T.check('hết giờ mà đang kẹt trong khe: vẫn nhỏ (0.495) tới khi ra chỗ đủ rộng', near(ss.r, 0.495, 1e-9) && SIM.effect(ss, 'shrink') === null);
  put(ss, arena.x, arena.y, 0); step(sk, 2);
  T.check('ra chỗ rộng thì nở lại 0.9', ss.r === 0.9);
  // reveal: bị lộ bất kể ánh sáng
  const rv = rig(), rs = rv.actors[4];
  put(rs, arena.x + 20, arena.y + 5, 0); SIM.updateVision(rv, true);
  T.check('tiền đề: cá mập đứng nơi tối thì đội thợ lặn không thấy', SIM.canSee(rv, 'diver', rs) === false);
  SIM.addEffect(rs, 'reveal', 10, 1, -1);
  T.check('hiệu ứng reveal: đội thợ lặn thấy cá mập bất kể ánh sáng, hết hạn thì lại tối', SIM.canSee(rv, 'diver', rs) === true && (step(rv, 601), SIM.canSee(rv, 'diver', rs) === false));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Kỹ năng (khung phân phát + 2 ví dụ)');
{
  const base = rig(), arena = findArena(base);
  const m = rig(), s = m.actors[4];
  put(s, arena.x - 12, arena.y, 0);
  T.check('cá mập Blacktip mang kỹ năng lao-vut, sẵn sàng (cd 0, t 0)', s.skill.id === 'lao-vut' && s.skill.cd === 0 && s.skill.t === 0 && typeof VS.SKILLS['lao-vut'].start === 'function');
  s.stamina = 30; s.biteCd = 1.2;
  s.intent.mx = 1; s.intent.skill = true;
  step(m, 1);
  T.check('bấm kỹ năng: cd = 9, t = 1.8, sự kiện skill, hiệu ứng speed 1.8 trong 1.8 s', near(s.skill.cd, 9 - DT, 1e-9) && near(s.skill.t, 1.8 - DT, 1e-9) && ev(m, 'skill').length === 1 && ev(m, 'skill')[0].skill === 'lao-vut' && ev(m, 'skill')[0].id === 4 && SIM.effect(s, 'speed').mag === 1.8 && near(SIM.effect(s, 'speed').until - m.t, 1.8, 1e-9));
  T.check('lao-vut còn nạp đầy sức phóng (30 → 100) và cho cắn được ngay (biteCd 1.2 → 0), theo cờ trong SKILL_DATA', s.stamina === 100 && s.biteCd === 0);
  step(m, 90);
  // Bước bấm vẫn chạy với hệ số cũ (các hệ số được cộng gộp ở đầu bước): v = 4.2 × 0.05 = 0.21; 90 bước sau tiến về 4.2 × 1.8 = 7.56 theo v += (7.56 - v) × 0.05.
  T.check('đang lao: tốc độ = 7.56 - (7.56 - 0.21) × 0.95^90 = 7.487 m/s', near(speedOf(s), 7.56 - (7.56 - 0.21) * Math.pow(0.95, 90), 1e-9), speedOf(s));
  s.intent.skill = true; step(m, 1);
  T.check('đang hồi chiêu: bấm tiếp không kích hoạt thêm (vẫn 1 sự kiện skill)', ev(m, 'skill').length === 1);
  step(m, 30);
  T.check('hết 1.8 s: t về 0 và hiệu ứng tắt, tốc độ rơi dần về 4.2', s.skill.t === 0 && SIM.effect(s, 'speed') === null && speedOf(s) < 7.5 && speedOf(s) > 4.2, speedOf(s));
  step(m, 425);
  T.check('hồi chiêu 9 s xong: cd về 0, dùng lại được', s.skill.cd === 0);
  s.intent.skill = true; step(m, 1);
  T.check('dùng lại lần hai: sự kiện skill thứ 2', ev(m, 'skill').length === 2);
  const st = rig(), s2 = st.actors[4];
  SIM.addEffect(s2, 'stun', 5, 1, -1); s2.intent.skill = true; step(st, 2);
  T.check('cá mập đang choáng: bấm kỹ năng không được, không tốn hồi chiêu', s2.skill.cd === 0 && ev(st, 'skill').length === 0);
  const o = rig(), d = o.actors[0];
  T.check('Dave mang binh-o2', d.skill.id === 'binh-o2');
  d.o2 = 30; d.intent.skill = true; step(o, 1);
  T.check('bình O2 phụ: +40 O2 (30 → 69.99), cd 24, sự kiện skill', near(d.o2, 30 - 0.01 + 40, 0.01) && near(d.skill.cd, 24 - DT, 1e-9) && ev(o, 'skill').length === 1 && d.skill.t === 0);
  const o2 = rig(), d2 = o2.actors[0];
  d2.o2 = 90; d2.intent.skill = true; step(o2, 1);
  T.check('O2 90 + 40 bị chặn ở O2 tối đa 100', d2.o2 === 100);
  const o3 = rig(), d3 = o3.actors[0];
  SIM.addEffect(d3, 'sleep', 5, 1, -1); d3.o2 = 30; d3.intent.skill = true; step(o3, 2);
  T.check('thợ lặn đang ngủ không dùng được kỹ năng', d3.o2 < 30 && ev(o3, 'skill').length === 0);
  const o4 = rig(), d4 = o4.actors[0];
  SIM.setState(o4, d4, 'down'); d4.intent.skill = true; step(o4, 2);
  T.check('thợ lặn đang gục không dùng được kỹ năng', ev(o4, 'skill').length === 0 && d4.skill.cd === 0);
  // vòng đời update/end, hủy khi bị loại; start được chỉnh cd/charges
  const lc = rig(), dl = lc.actors[0], seen = [];
  VS.SKILLS['_probe'] = { start: (mm, a) => { seen.push('start'); a.skill.charges--; if (a.skill.charges > 0) a.skill.cd = 0; }, update: () => seen.push('u'), end: () => seen.push('end'), canStart: (mm, a) => a.o2 > 50 };
  VS.SKILL_DATA['_probe'] = { team: 'diver', cd: 5, dur: 0.1, charges: 2 };
  dl.skill.id = '_probe'; dl.skill.charges = 2;
  dl.o2 = 40; dl.intent.skill = true; step(lc, 1);
  T.check('canStart trả false thì không kích hoạt, không tốn hồi chiêu', seen.length === 0 && dl.skill.cd === 0);
  dl.o2 = 90; dl.intent.skill = true; step(lc, 12);
  T.check('vòng đời: start một lần, update mỗi bước khi t > 0 (6 bước cho 0.1 s), end một lần', seen[0] === 'start' && seen.filter((x) => x === 'u').length === 6 && seen.filter((x) => x === 'end').length === 1 && seen[seen.length - 1] === 'end', seen.join());
  T.check('start sửa được skill.charges và đặt cd = 0 khi còn lượt (dùng lượt thứ hai ngay)', dl.skill.charges === 1 && dl.skill.cd === 0);
  seen.length = 0; dl.intent.skill = true; step(lc, 1);
  SIM.outDiver(lc, dl, 'test', null);
  T.check('bị loại giữa chừng thì kỹ năng đang chạy được end ngay', seen.join() === 'start,u,end' || seen.join() === 'start,end', seen.join() + ' ' + dl.skill.t);
  // bot hỏi hàm bot(): null | true | {x,y}
  const bo = rig(), db = bo.actors[0];
  db.o2 = 40;
  T.check('sim.skillBot trả true khi hàm bot muốn dùng (O2 40%)', SIM.skillBot(bo, db) === true);
  db.skill.id = 'binh-o2'; db.o2 = 100;
  T.check('sim.skillBot trả null khi không nên dùng (O2 100%) hoặc đang hồi chiêu', SIM.skillBot(bo, db) === null && (db.o2 = 40, db.skill.cd = 3, SIM.skillBot(bo, db) === null));
  let asked = null;
  VS.SKILLS['_aim'] = { start: (mm, a) => { seen.push(a.intent.aimX === asked.x && a.intent.aimY === asked.y ? 'aim-ok' : 'aim-bad ' + a.intent.aimX + ',' + a.intent.aimY + ' vs ' + asked.x + ',' + asked.y); }, bot: (mm, a) => (asked = { x: a.x + 5, y: a.y + 1 }) };
  VS.SKILL_DATA['_aim'] = { team: 'diver', cd: 5, dur: 0 };
  const ab = rig({ ctrl: 'bot' }), da = ab.actors[0];
  ab.actors.forEach((x) => { if (x.id !== 0) x.ctrl = 'human'; });
  put(da, arena.x, arena.y, 0); da.skill.id = '_aim'; seen.length = 0;
  step(ab, 30);
  T.check('bot(m,a) trả {x,y}: bots.think đặt aimX/aimY đúng điểm đó rồi mới bấm kỹ năng (start thấy hướng ngắm bằng đúng điểm hỏi)', seen.length === 1 && seen[0] === 'aim-ok' && ev(ab, 'skill').length === 1 && asked !== null, seen.join());
  delete VS.SKILLS['_probe']; delete VS.SKILL_DATA['_probe']; delete VS.SKILLS['_aim']; delete VS.SKILL_DATA['_aim'];
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Tầm nhìn của thợ lặn, trí nhớ kho báu');
{
  const base = rig(), arena = findArena(base);
  const setup = () => {
    const m = rig(), d = m.actors[0];
    put(d, arena.x - 8, arena.y, 0);
    SIM.updateVision(m, true);
    return { m, d };
  };
  const { m, d } = setup();
  const P = (dist, deg) => [d.x + Math.cos(deg * Math.PI / 180) * dist, d.y + Math.sin(deg * Math.PI / 180) * dist];
  const vis = (pt) => SIM.visibleTo(m, 'diver', pt[0], pt[1]);
  T.check('tiền đề: các điểm thử cách thợ lặn 1-14.5 m đều ở nước thoáng, đường thẳng thông', [P(6, 0), P(11, 0), P(6, 90), P(6, 25), P(6, 35), P(1, 90), P(2.5, 90), P(1.5, 180), P(14.5, 0)].every((p) => m.world.open(p[0], p[1], 0.3) && m.world.clear(d.x, d.y, p[0], p[1])));
  T.check('điểm trong chùm đèn, cách 6 m trên trục: thấy', vis(P(6, 0)) === true);
  T.check('điểm trong chùm, cách 11 m (< 13): thấy; 14.5 m (> 13): không', vis(P(11, 0)) === true && vis(P(14.5, 0)) === false);
  T.check('điểm ngoài nón: 6 m ở góc 90° không thấy', vis(P(6, 90)) === false);
  T.check('rìa nón ±30° (rộng 60°): 25° thấy, 35° không', vis(P(6, 25)) === true && vis(P(6, 35)) === false && vis(P(6, -25)) === true && vis(P(6, -35)) === false);
  T.check('quầng sáng quanh người 2 m (đèn bật): 1 m ngay trên đầu thấy, 2.5 m trên đầu không (ngoài nón)', vis(P(1, 90)) === true && vis(P(2.5, 90)) === false);
  d.intent.light = true; step(m, 2);
  T.check('tắt đèn pin (light): điểm 6 m trước mặt không còn thấy', d.light === false && vis(P(6, 0)) === false);
  T.check('tắt đèn: còn quầng 2 m — 1 m thấy, 2.5 m không', vis(P(1, 90)) === true && vis(P(2.5, 90)) === false);
  d.intent.light = true; step(m, 2);
  T.check('bật lại đèn: điểm 6 m thấy lại', d.light === true && vis(P(6, 0)) === true);
  SIM.addEffect(d, 'lightOff', 3, 1, 5); step(m, 2);
  T.check('hiệu ứng lightOff ép đèn tắt (a.light vẫn true), hết hạn thì sáng lại', d.light === true && vis(P(6, 0)) === false && (step(m, 200), vis(P(6, 0)) === true));
  d.beamMul = 1.5; step(m, 2);
  T.check('beamMul 1.5: tầm đèn 13 → 19.5 m, điểm 15 m trên trục thấy (đường thông 18 m phía trước)', m.world.clear(d.x, d.y, d.x + 15, d.y) && vis(P(15, 0)) === true);
  d.beamMul = 1; step(m, 2);
  T.check('beamMul về 1: điểm 15 m lại tối', vis(P(15, 0)) === false);
  const pd = SIM.visionPolys(m, 'diver'), ps = SIM.visionPolys(m, 'shark');
  const kinds = (arr) => arr.reduce((o, p) => (o[p.kind] = (o[p.kind] || 0) + 1, o), {});
  T.check('visionPolys diver: 4 chùm đèn + 4 quầng + 3 khoang + 5 rương = 16 đa giác; shark thêm 2 vòng cảm nhận = 18', pd.length === 16 && ps.length === 18 && kinds(pd).beam === 4 && kinds(pd).glow === 12 && kinds(ps).sense === 2, JSON.stringify(kinds(ps)));
  const beam = pd.find((p) => p.kind === 'beam' && p.x === d.x && p.y === d.y);
  T.check('đa giác chùm đèn: đỉnh nón ở vị trí thợ lặn, 48 đầu tia, bán kính 13, mọi đầu tia trong tầm', !!beam && beam.r === 13 && beam.pts.length === 2 + 48 * 2 && beam.pts[0] === d.x && beam.pts[1] === d.y && (() => { for (let i = 2; i < beam.pts.length; i += 2) if (Math.hypot(beam.pts[i] - d.x, beam.pts[i + 1] - d.y) > 13 + 1e-9) return false; return true; })());
  T.check('chùm đèn ở nước thoáng: các đầu tia chạm hết tầm 13 m', !!beam && Math.hypot(beam.pts[2] - d.x, beam.pts[3] - d.y) > 12.99 && Math.hypot(beam.pts[50] - d.x, beam.pts[51] - d.y) > 12.99);
  T.check('đa giác dùng được để vẽ: mọi toạ độ là số hữu hạn, mỗi đa giác có kind/x/y/r', ps.every((p) => typeof p.kind === 'string' && Number.isFinite(p.x) && Number.isFinite(p.y) && p.r > 0 && p.pts.length >= 6 && p.pts.every((v) => Number.isFinite(v))));
  const polysBefore = SIM.visionPolys(m, 'diver');
  T.check('visionPolys dùng lại kết quả giữa hai lần chụp (cùng mảng, không dựng lại)', SIM.visionPolys(m, 'diver') === polysBefore);

  // vách chặn sáng: tìm một điểm nước thoáng nằm sau một lớp đá ngay trong chùm đèn
  const wm = rig(), wd = wm.actors[0];
  const cfg = findBehindWall(wm, { stand: 1.0, len: 13, hMin: 3, hMax: 8, back: 11, clear: 0.3, farFromLights: 20 });
  T.check('tiền đề: tìm được điểm nước thoáng nằm sau vách đá, cách thợ lặn < 11 m', cfg !== null);
  put(wd, cfg.x, cfg.y, cfg.a); SIM.updateVision(wm, true);
  const blocked = wm.world.raycast(cfg.x, cfg.y, cfg.bx, cfg.by);
  T.check('tiền đề: raycast từ thợ lặn tới điểm đó cắt vách; điểm đó không phải đá', blocked !== null && blocked.t < 1 && !wm.world.solid(cfg.bx, cfg.by));
  T.check('điểm nằm sau vách, giữa trục chùm đèn và trong tầm: KHÔNG thấy (vách chặn sáng)', SIM.visibleTo(wm, 'diver', cfg.bx, cfg.by) === false);
  T.check('đối chứng: điểm trước vách trên cùng tia: thấy', SIM.visibleTo(wm, 'diver', cfg.fx, cfg.fy) === true && wm.world.clear(cfg.x, cfg.y, cfg.fx, cfg.fy));
  const wbeam = SIM.visionPolys(wm, 'diver').find((p) => p.kind === 'beam' && p.x === cfg.x && p.y === cfg.y);
  const shortRays = wbeam.pts.filter((v, i) => i >= 2 && i % 2 === 0 && Math.hypot(v - cfg.x, wbeam.pts[i + 1] - cfg.y) < 12.9).length;
  T.check('đa giác chùm đèn bị vách cắt: nhiều đầu tia ngắn hơn 13 m', shortRays >= 3, shortRays + ' tia');

  // đám mực chặn sáng (zone ink), hết hạn thì sáng lại
  const ik = setup(), pt = [ik.d.x + 8, ik.d.y];
  T.check('tiền đề: điểm 8 m trên trục đang sáng', SIM.visibleTo(ik.m, 'diver', pt[0], pt[1]) === true);
  SIM.addZone(ik.m, { kind: 'ink', x: ik.d.x + 4, y: ik.d.y, r: 1.5, dur: 6, team: 'diver' });
  step(ik.m, 3);
  T.check('đám mực r 1.5 giữa thợ lặn và điểm: điểm 8 m không còn thấy, điểm 2 m (trước đám mực) vẫn thấy', SIM.visibleTo(ik.m, 'diver', pt[0], pt[1]) === false && SIM.visibleTo(ik.m, 'diver', ik.d.x + 2, ik.d.y) === true);
  const ibeam = SIM.visionPolys(ik.m, 'diver').find((p) => p.kind === 'beam' && p.x === ik.d.x);
  let mid = 1e9;
  for (let i = 2; i < ibeam.pts.length; i += 2) { const dy = Math.abs(ibeam.pts[i + 1] - ik.d.y), dx = ibeam.pts[i] - ik.d.x; if (dy < 0.1 && dx > 0) mid = Math.min(mid, dx); }
  T.check('đa giác chùm đèn bị đám mực cắt: tia giữa dừng ở mép mực, cách 4 - 1.5 = 2.5 m', near(mid, 2.5, 0.25), mid.toFixed(2));
  step(ik.m, 400);
  T.check('đám mực hết hạn (6 s): điểm 8 m sáng lại, zone bị gỡ', SIM.visibleTo(ik.m, 'diver', pt[0], pt[1]) === true && ik.m.zones.length === 0);
  const bt = setup();
  SIM.addZone(bt.m, { kind: 'bait', x: bt.d.x + 4, y: bt.d.y, r: 1.5, dur: 6, team: 'shark' });
  step(bt.m, 3);
  T.check('đàn cá mồi (bait) cũng chặn sáng', SIM.visibleTo(bt.m, 'diver', bt.d.x + 8, bt.d.y) === false);
  const fl = setup(), fp = [fl.d.x + 5, fl.d.y + 6];
  T.check('tiền đề: điểm (5, 6) ngoài nón đang tối', SIM.visibleTo(fl.m, 'diver', fp[0], fp[1]) === false);
  SIM.addZone(fl.m, { kind: 'flare', x: fp[0], y: fp[1], r: 10, dur: 8, team: 'diver' });
  step(fl.m, 3);
  T.check('pháo sáng r 10: soi sáng cả điểm đó và điểm cách 8 m, không soi điểm cách 12 m', SIM.visibleTo(fl.m, 'diver', fp[0], fp[1]) === true && SIM.visibleTo(fl.m, 'diver', fp[0], fp[1] + 8) === true && SIM.visibleTo(fl.m, 'diver', fp[0] + 12, fp[1]) === false);
  step(fl.m, 500);
  T.check('pháo sáng hết 8 s thì tối lại', SIM.visibleTo(fl.m, 'diver', fp[0], fp[1]) === false);
  const lg = rig();
  const pod = lg.pods[0], ch = lg.o2[0];
  T.check('khoang cứu hộ sáng trong 5 m, rương O2 trong 2.5 m, kể cả khi không ai đứng đó', SIM.visibleTo(lg, 'diver', pod.x, pod.y) === true && SIM.visibleTo(lg, 'diver', pod.x + 4, pod.y) === lg.world.clear(pod.x, pod.y, pod.x + 4, pod.y) && SIM.visibleTo(lg, 'diver', ch.x, ch.y) === true);

  // canSee(diver nhìn cá mập)
  const cs = setup(), sh = cs.m.actors[4];
  put(sh, cs.d.x + 6, cs.d.y, Math.PI);
  T.check('cá mập đứng trong chùm đèn (6 m): đội thợ lặn thấy', SIM.canSee(cs.m, 'diver', sh) === true);
  put(sh, cs.d.x, cs.d.y + 8, Math.PI);
  T.check('cá mập ở 8 m ngoài nón: đội thợ lặn không thấy', SIM.canSee(cs.m, 'diver', sh) === false);
  put(sh, cs.d.x + 6, cs.d.y, Math.PI);
  SIM.addEffect(sh, 'stealth', 100, 2.5, sh.id);
  T.check('cá mập tàng hình (an-day) trong chùm đèn nhưng không thợ lặn nào trong 2.5 m: không thấy', SIM.canSee(cs.m, 'diver', sh) === false);
  put(cs.m.actors[1], sh.x + 2, sh.y, 0);
  T.check('có thợ lặn trong 2.5 m (cách 2 m): lộ ra', SIM.canSee(cs.m, 'diver', sh) === true);
  T.check('đồng đội luôn thấy nhau: thợ lặn thấy thợ lặn, cá mập thấy cá mập, dù ở rất xa trong tối', SIM.canSee(cs.m, 'diver', cs.m.actors[3]) === true && SIM.canSee(cs.m, 'shark', cs.m.actors[5]) === true);
  const out = cs.m.actors[3]; SIM.setState(cs.m, out, 'out');
  T.check('actor đã bị loại thì không ai thấy', SIM.canSee(cs.m, 'diver', out) === false && SIM.canSee(cs.m, 'shark', out) === false);
  const rv = setup(), shr = rv.m.actors[4];
  put(shr, rv.d.x, rv.d.y + 12, 0);
  T.check('tiền đề: cá mập ở chỗ tối', SIM.canSee(rv.m, 'diver', shr) === false);
  rv.m.reveal = { diver: rv.m.t + 5 };
  T.check('cờ m.reveal.diver bật: đội thợ lặn thấy hết, hết hạn thì tối lại', SIM.canSee(rv.m, 'diver', shr) === true && (rv.m.reveal.diver = rv.m.t - 1, SIM.canSee(rv.m, 'diver', shr) === false));

  // trí nhớ kho báu của đội
  const km = rig(), kd = km.actors[0], lt = km.loot[0];
  put(kd, arena.x - 8, arena.y, 0);
  lt.x = arena.x; lt.y = arena.y - 8;
  SIM.updateVision(km, true);
  T.check('tiền đề: món kho báu cách 11.3 m, lệch 45° so với trục đèn (ngoài nón 30°), đường thông, chưa nằm trong known() của đội nào', km.world.clear(kd.x, kd.y, lt.x, lt.y) && SIM.visibleTo(km, 'diver', lt.x, lt.y) === false && SIM.known(km, 'diver').indexOf(lt) < 0 && SIM.known(km, 'shark').indexOf(lt) < 0, Math.hypot(lt.x - kd.x, lt.y - kd.y).toFixed(1));
  kd.intent.aimX = lt.x; kd.intent.aimY = lt.y; step(km, 4);
  T.check('đèn pin quét tới món đó: vào known() của đội thợ lặn, và cá mập cũng thấy chỗ được đèn soi sáng nên đội cá mập biết luôn', SIM.visibleTo(km, 'diver', lt.x, lt.y) === true && SIM.known(km, 'diver').indexOf(lt) >= 0 && SIM.known(km, 'shark').indexOf(lt) >= 0);
  put(kd, arena.x - 8, arena.y, Math.PI); step(km, 4);
  T.check('quay đèn đi chỗ khác: món đó vẫn nằm trong known() (đội nhớ), dù hiện tại tối', SIM.visibleTo(km, 'diver', lt.x, lt.y) === false && SIM.known(km, 'diver').indexOf(lt) >= 0);
  const ks = rig(), ls = ks.loot[1];
  put(ks.actors[4], arena.x, arena.y, 0); ls.x = arena.x + 5; ls.y = arena.y;
  SIM.updateVision(ks, true);
  T.check('cá mập có vòng cảm nhận 7 m: món cách 5 m vào known(shark)', SIM.known(ks, 'shark').indexOf(ls) >= 0 && SIM.known(ks, 'diver').indexOf(ls) < 0);
  const kp = rig(), pl = kp.loot[2];
  pl.x = kp.pods[0].x + 3; pl.y = kp.pods[0].y;
  SIM.updateVision(kp, true);
  T.check('món nằm trong vùng sáng của khoang cứu hộ (5 m) thì cả hai đội biết từ đầu', kp.world.clear(kp.pods[0].x, kp.pods[0].y, pl.x, pl.y) && SIM.known(kp, 'diver').indexOf(pl) >= 0 && SIM.known(kp, 'shark').indexOf(pl) >= 0);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Tầm nhìn của cá mập: hải đăng 18 m có vách chắn, mùi máu, cảm nhận, mù, lộ');
{
  const base = rig(), arena = findArena(base);
  // cx: tâm của cặp thợ lặn - cá mập; các ca 40 m dịch sang phải để thợ lặn ngoài chùm đèn của ba đồng đội ở góc trái bản đồ.
  const setup = (gap, cx) => {
    const m = rig(), d = m.actors[0], s = m.actors[4], c = cx === undefined ? arena.x : cx;
    put(d, c - gap / 2, arena.y, 0); put(s, c + gap / 2, arena.y, Math.PI);
    SIM.updateVision(m, true);
    return { m, d, s };
  };
  const { m, d, s } = setup(16);
  T.check('tiền đề: cá mập cách 16 m, đường thông, ngoài vòng cảm nhận 7 m, ngoài tầm đèn 13 m, thợ lặn đầy O2', near(Math.hypot(d.x - s.x, d.y - s.y), 16, 1e-9) && m.world.clear(d.x, d.y, s.x, s.y) && d.o2 === 100);
  T.check('đèn bật: cá mập thấy thợ lặn ở 16 m (hải đăng tầm 18 m)', d.light === true && SIM.canSee(m, 'shark', d) === true);
  d.intent.light = true; step(m, 2);
  T.check('tắt đèn: cùng khoảng cách 16 m thì cá mập không thấy', d.light === false && SIM.canSee(m, 'shark', d) === false);
  T.check('(lưu ý) quầng sáng của thợ lặn có chứa chỗ thợ lặn đứng nên visibleTo(shark) tại đó là true, nhưng canSee không tính ánh sáng của chính nạn nhân', SIM.visibleTo(m, 'shark', d.x, d.y) === true);
  const far = setup(19.5);
  T.check('đèn bật nhưng cá mập ở 19.5 m (> 18 m): không thấy', far.m.world.clear(far.d.x, far.d.y, far.s.x, far.s.y) && far.d.light === true && SIM.canSee(far.m, 'shark', far.d) === false);
  // hải đăng cần đường nhìn: vách đá che thì mất
  const wm = rig(), wd = wm.actors[0], ws = wm.actors[4];
  const cfg = findBehindWall(wm, { stand: 1.2, len: 16, hMin: 4, hMax: 8, back: 16, clear: 1.0, farFromLights: 14 });
  T.check('tiền đề: tìm được cặp thợ lặn - cá mập cách 8-16 m có lớp đá chắn giữa, cá mập đứng chỗ rộng', cfg !== null);
  put(wd, cfg.x, cfg.y, 0); put(ws, cfg.bx, cfg.by, 0); SIM.updateVision(wm, true);
  const gapW = Math.hypot(cfg.bx - cfg.x, cfg.by - cfg.y);
  T.check('tiền đề: khoảng cách ' + gapW.toFixed(1) + ' m (> 7 cảm nhận, < 18 hải đăng), đường nhìn bị cắt bởi vách', gapW > 7 && gapW < 18 && !wm.world.clear(cfg.x, cfg.y, cfg.bx, cfg.by) && wd.light === true);
  T.check('đèn bật, trong 18 m nhưng có vách đá chắn: cá mập KHÔNG thấy (hải đăng cần đường nhìn)', SIM.canSee(wm, 'shark', wd) === false);
  wd.o2 = 20; SIM.updateVision(wm, true);
  T.check('đối chứng: O2 20% thì mùi máu xuyên vách (trong 30 m): thấy', SIM.canSee(wm, 'shark', wd) === true);
  // mùi máu
  const bl = setup(20), bd = bl.d;
  bd.light = false; bd.o2 = 29; SIM.updateVision(bl.m, true);
  T.check('đèn tắt nhưng O2 29% (< 30%) và cá mập ở 20 m (< 30 m): thấy nhờ mùi máu', SIM.canSee(bl.m, 'shark', bd) === true);
  bd.o2 = 31; SIM.updateVision(bl.m, true);
  T.check('O2 31% (>= 30%): hết mùi máu, không thấy', SIM.canSee(bl.m, 'shark', bd) === false);
  const bf = setup(32), bfd = bf.d;
  bfd.light = false; bfd.o2 = 10; SIM.updateVision(bf.m, true);
  T.check('O2 10% nhưng cá mập ở 32 m (> 30 m): vẫn không thấy', bf.m.world.clear(bfd.x, bfd.y, bf.s.x, bf.s.y) && SIM.canSee(bf.m, 'shark', bfd) === false);
  // vòng cảm nhận 7 m
  const sn = setup(6), snd = sn.d;
  snd.light = false; SIM.updateVision(sn.m, true);
  T.check('đèn tắt, cá mập ở 6 m (trong cảm nhận 7 m): thấy', SIM.canSee(sn.m, 'shark', snd) === true);
  put(sn.s, snd.x + 8, snd.y, Math.PI); SIM.updateVision(sn.m, true);
  T.check('đèn tắt, cá mập ở 8 m (ngoài 7 m): không thấy', sn.m.world.clear(snd.x, snd.y, sn.s.x, sn.s.y) && SIM.canSee(sn.m, 'shark', snd) === false);
  // vòng cảm nhận bị vách che
  const wm2 = rig(), wd2 = wm2.actors[0], ws2 = wm2.actors[4];
  const cfg2 = findBehindWall(wm2, { stand: 1.2, len: 6.5, hMin: 1.5, hMax: 4.5, back: 6.5, clear: 1.0, farFromLights: 12 });
  T.check('tiền đề: tìm được chỗ cá mập trong 7 m nhưng bị lớp đá chắn', cfg2 !== null && Math.hypot(cfg2.bx - cfg2.x, cfg2.by - cfg2.y) < 7);
  put(wd2, cfg2.x, cfg2.y, 0); wd2.light = false; put(ws2, cfg2.bx, cfg2.by, 0); SIM.updateVision(wm2, true);
  T.check('cá mập trong 7 m nhưng sau vách: vòng cảm nhận bị che, không thấy (đèn tắt)', SIM.canSee(wm2, 'shark', wd2) === false);
  // mù
  const bk = setup(6), bkd = bk.d;
  bkd.light = false; SIM.addEffect(bk.s, 'blind', 100, 1, -1); SIM.updateVision(bk.m, true);
  T.check('cá mập bị mù: không thấy thợ lặn ở 6 m (chỉ thấy trong r thân)', SIM.canSee(bk.m, 'shark', bkd) === false && SIM.sharkSees(bk.m, bk.s, bkd) === false);
  bkd.o2 = 5; bkd.light = true; SIM.updateVision(bk.m, true);
  T.check('mù thì hải đăng và mùi máu cũng vô dụng', SIM.canSee(bk.m, 'shark', bkd) === false);
  put(bkd, bk.s.x - (bk.s.r + bkd.r) + 0.05, bk.s.y, 0);
  T.check('mù nhưng thợ lặn chạm sát thân (khoảng cách tâm < r cá mập + r thợ lặn): vẫn thấy', SIM.sharkSees(bk.m, bk.s, bkd) === true && SIM.canSee(bk.m, 'shark', bkd) === true);
  const tw = setup(16), twd = tw.d;
  SIM.addEffect(tw.s, 'blind', 100, 1, -1); put(tw.m.actors[5], twd.x + 17, twd.y, Math.PI);
  SIM.updateVision(tw.m, true);
  T.check('một con mù, con kia sáng mắt (hải đăng 17 m): cả đội thấy, còn con mù tự nó không thấy', tw.m.world.clear(twd.x, twd.y, tw.m.actors[5].x, tw.m.actors[5].y) && SIM.canSee(tw.m, 'shark', twd) === true && SIM.sharkSees(tw.m, tw.m.actors[5], twd) === true && SIM.sharkSees(tw.m, tw.s, twd) === false);
  // lộ diện toàn đội
  const rv = setup(40, arena.x + 5), rvd = rv.d;
  rvd.light = false; SIM.updateVision(rv.m, true);
  T.check('tiền đề: cá mập ở 40 m, đèn tắt: không thấy', rv.m.world.clear(rvd.x, rvd.y, rv.s.x, rv.s.y) && SIM.canSee(rv.m, 'shark', rvd) === false);
  rv.m.reveal = { shark: rv.m.t + 5 };
  T.check('m.reveal.shark còn hạn: cả đội cá mập thấy mọi thợ lặn xuyên vách', SIM.canSee(rv.m, 'shark', rvd) === true && SIM.canSee(rv.m, 'shark', rv.m.actors[1]) === true);
  step(rv.m, 330);
  T.check('hết 5 s thì mất lộ diện', SIM.canSee(rv.m, 'shark', rvd) === false);
  const re = setup(40, arena.x + 5);
  re.d.light = false; SIM.updateVision(re.m, true);
  SIM.addEffect(re.d, 'reveal', 5, 1, -1);
  T.check('hiệu ứng reveal gắn lên thợ lặn: đội cá mập thấy bất kể ánh sáng, khoảng cách', SIM.canSee(re.m, 'shark', re.d) === true);
  // ánh sáng của người khác làm lộ
  const ol = setup(30), old = ol.d, mate = ol.m.actors[1];
  old.light = false; put(mate, old.x - 6, old.y, 0); mate.light = true; SIM.updateVision(ol.m, true);
  T.check('thợ lặn tắt đèn nhưng đứng trong chùm đèn của đồng đội: cá mập (30 m) thấy qua vùng sáng đó', SIM.canSee(ol.m, 'shark', old) === true);
  // tàng hình áp cho cả hai phe
  const sth = setup(10), sthd = sth.d;
  SIM.addEffect(sthd, 'stealth', 100, 2, -1); SIM.updateVision(sth.m, true);
  const seenAt = (dist) => { put(sth.s, sthd.x + dist, sthd.y, Math.PI); return SIM.canSee(sth.m, 'shark', sthd); };
  T.check('thợ lặn tàng hình (stealth 2 m): cá mập ở 10 m không thấy dù đèn bật; ở 2.5 m và 2.1 m vẫn không; ở 1.9 m thì thấy', SIM.canSee(sth.m, 'shark', sthd) === false && seenAt(2.5) === false && seenAt(2.1) === false && seenAt(1.9) === true);
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Bot pha 1');
{
  const base = rig(), arena = findArena(base);
  const botOnly = (m, ids) => m.actors.forEach((a) => { a.ctrl = ids.indexOf(a.id) >= 0 ? 'bot' : 'human'; });
  const m = rig({ ctrl: 'bot' }), d = m.actors[0], s = m.actors[4];
  botOnly(m, [0]);
  put(d, arena.x - 6, arena.y, 0); put(s, arena.x, arena.y, Math.PI); SIM.updateVision(m, true);
  step(m, 90);
  T.check('bot thợ lặn: cá mập đứng trong chùm đèn cách 6 m → bắn trong 1.5 s, trúng đúng 24 máu mỗi phát', ev(m, 'fire').length >= 1 && s.hp <= 296 && s.hp > 200, 'phát ' + ev(m, 'fire').length + ', máu ' + s.hp);
  const c = rig({ ctrl: 'bot' }), dc = c.actors[0], sc = c.actors[4];
  botOnly(c, [4]);
  put(dc, arena.x - 8, arena.y, 0); put(sc, arena.x + 6, arena.y, Math.PI);
  step(c, 300);
  T.check('bot cá mập: thấy thợ lặn đèn bật cách 14 m (hải đăng, có đường nhìn) → đuổi, lao và cắn trong 5 s', ev(c, 'lunge').length >= 1 && ev(c, 'bite').length >= 1 && ev(c, 'bite')[0].by === 4 && ev(c, 'bite')[0].id === 0, 'lao ' + ev(c, 'lunge').length + ', cắn ' + ev(c, 'bite').length);
  // bot nhặt kho báu đã biết rồi nộp; không đi tới món chưa biết
  const l = rig({ ctrl: 'bot' });
  botOnly(l, [0]);
  const dl = l.actors[0];
  l.actors[4].x = 55; l.actors[4].y = -30; l.actors[5].x = 55; l.actors[5].y = -33;
  l.loot.forEach((x, i) => { if (i > 0) { x.x = l.pods[2].x; x.y = l.pods[2].y - 30; } });
  put(dl, arena.x - 10, arena.y, 0); l.loot[0].x = arena.x + 2; l.loot[0].y = arena.y; l.loot[0].kg = 10;
  SIM.updateVision(l, true); step(l, 6);
  T.check('tiền đề: món 0 cách thợ lặn 12 m trong chùm đèn nên cả đội đã biết; các món khác ở chỗ tối chưa biết', SIM.known(l, 'diver').indexOf(l.loot[0]) >= 0 && SIM.known(l, 'diver').filter((x) => x.id !== 0 && Math.hypot(x.x - dl.x, x.y - dl.y) > 30).length === 0, SIM.known(l, 'diver').map((x) => x.id).join());
  step(l, 900);
  T.check('bot thợ lặn một mình: tự nhặt món 10 kg đã biết (>= 8 kg) rồi đi nộp ở khoang cứu hộ', ev(l, 'pickup').length >= 1 && ev(l, 'pickup')[0].id === 0 && ev(l, 'pickup')[0].loot === 0, 'nhặt ' + ev(l, 'pickup').length + ', nộp ' + ev(l, 'bank').length);
  const u = rig({ ctrl: 'bot' });
  botOnly(u, [0]);
  put(u.actors[0], arena.x - 10, arena.y, 0);
  u.loot.forEach((x, i) => { x.x = arena.x + 12; x.y = arena.y - 14 - i * 0.5; });
  u.actors[4].x = 55; u.actors[4].y = -30; u.actors[5].x = 55; u.actors[5].y = -33;
  SIM.updateVision(u, true); step(u, 5);
  T.check('không biết món nào (tất cả ở chỗ tối): bot dò đường (có mục tiêu khám phá), không thẳng tới kho báu chưa thấy', SIM.known(u, 'diver').length === 0 && u.actors[0].brain.has === true && u.actors[0].brain.key.charAt(0) === 'E', 'key ' + u.actors[0].brain.key);
  // bot thợ lặn cứu đồng đội
  const r = rig({ ctrl: 'bot' });
  botOnly(r, [1]);
  const a0 = r.actors[0], a1 = r.actors[1];
  put(a1, arena.x - 6, arena.y, 0); put(a0, arena.x + 4, arena.y, 0); a0.o2 = 0.001; step(r, 2);
  step(r, 600);
  T.check('bot thợ lặn: đồng đội gục cách 10 m → tới cứu (trong 10 s)', a0.st === 'swim' && ev(r, 'revive').length === 1 && ev(r, 'revive')[0].by === 1, 'a0 ' + a0.st);
  T.check('bot ghi intent chứ không đụng thẳng trạng thái: phím một bước bị xoá sau mỗi bước', r.actors[1].intent.fire === false && r.actors[1].intent.skill === false);
  // bot thợ lặn bị ngậm thì giãy
  const sg = rig({ ctrl: 'bot' });
  botOnly(sg, [0]);
  put(sg.actors[0], arena.x, arena.y, 0); put(sg.actors[4], arena.x - 2, arena.y, 0); sg.actors[4].intent.fire = true;
  step(sg, 3);
  let tk = 0;
  while (sg.actors[0].st === 'held' && tk < 200) { step(sg, 1); tk++; }
  T.check('bot bị ngậm tự giãy (đổi chiều mx mỗi 0.2 s): được nhả sau ~50 bước thay vì 90', tk >= 40 && tk <= 62 && sg.actors[0].st === 'swim', tk + ' bước');
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Nguyên tắc bất biến trong trận bot đấu bot (A01 và B04N)');
{
  const bad = {};
  const viol = (k, msg) => { if (!bad[k]) bad[k] = { n: 0, first: msg }; bad[k].n++; };
  let totalSteps = 0, ended = 0;
  for (const mapId of ['A01', 'B04N']) {
    const m = SIM.createMatch({ seed: 100, mapId, lineup: lineup('bot', ['dave', 'lan', 'mai', 'vy'], ['Shortfin_Mako', 'Megamouth_Shark']) });
    const w = m.world;
    let steps = 0;
    while (m.phase !== 'end' && steps < 60 * 400) {
      SIM.step(m, DT); steps++;
      for (const a of m.actors) {
        if (a.st !== 'out' && a.st !== 'held' && w.solid(a.x, a.y)) viol('trongDa', mapId + ' ' + a.id);
        if (!Number.isFinite(a.x + a.y + a.vx + a.vy + a.ang)) viol('NaN', mapId + ' ' + a.id);
        if (a.st !== 'out' && a.y + a.r > 20.5 + 1e-9 && a.st !== 'held') viol('trenMatNuoc', mapId + ' ' + a.id);
        if (a.team === 'diver') {
          if (a.o2 < -1e-9 || a.o2 > a.o2Max + 1e-9) viol('o2NgoaiKhoang', mapId);
          if (a.st === 'held' && (m.actors[a.heldBy].holdId !== a.id || m.actors[a.heldBy].st !== 'hold')) viol('ngamLech', mapId);
          if ((a.st === 'down' || a.st === 'out') && a.carry.length) viol('gucVanMang', mapId);
          if (Math.abs(a.carry.reduce((s, id) => s + m.loot[id].kg, 0) - a.carryKg) > 1e-9 || a.carryKg > 20) viol('carryKg', mapId);
        } else {
          if (a.hp < -1e-9 || a.hp > a.hpMax + 1e-9) viol('mauNgoaiKhoang', mapId);
          if (a.st === 'hold' && (m.actors[a.holdId].heldBy !== a.id || m.actors[a.holdId].st !== 'held')) viol('holdLech', mapId);
          if (a.st !== 'hold' && a.holdId !== -1) viol('holdIdCu', mapId);
          if (a.st !== 'out' && m.pods.some((p) => Math.hypot(a.x - p.x, a.y - p.y) < 5 - 1e-6)) viol('caTrongVungAnToan', mapId + ' ' + a.id + ' t=' + m.t.toFixed(1));
        }
      }
      if (m.tickets < 0) viol('tickets', mapId);
      if (steps % 60 === 0) {
        const seenIds = {};
        let banked = 0;
        for (const a of m.actors) if (a.team === 'diver') for (const id of a.carry) { if (seenIds[id]) viol('monTrung', mapId); seenIds[id] = 1; }
        for (const l of m.loot) { if ((l.st === 'carried') !== !!seenIds[l.id]) viol('monLech', mapId); if (l.st === 'banked') banked += l.value; }
        if (banked !== m.score.banked) viol('diemLech', mapId);
      }
    }
    totalSteps += steps; if (m.phase === 'end') ended++;
    const bankSum = m.actors.reduce((s, a) => s + a.stats.banked, 0);
    if (bankSum !== m.score.banked) viol('statsBanked', mapId + ' ' + bankSum + '/' + m.score.banked);
    const sum = (team, k) => m.actors.filter((a) => a.team === team).reduce((s, a) => s + a.stats[k], 0);
    if (sum('shark', 'downs') > sum('diver', 'downs') || sum('shark', 'outs') > sum('diver', 'outs')) viol('thongKeCaMap', mapId);
    if (ev(m, 'down').length !== sum('diver', 'downs') || ev(m, 'out').length !== sum('diver', 'outs')) viol('suKienLechThongKe', mapId + ' ' + ev(m, 'down').length + '/' + sum('diver', 'downs'));
    if (ev(m, 'bite').length !== sum('shark', 'bites')) viol('biteLech', mapId);
    if (ev(m, 'shark-out').length !== sum('diver', 'sharkOuts')) viol('sharkOutLech', mapId);
  }
  T.check('2 trận bot đấu bot kết thúc (' + totalSteps + ' bước): không ai trong đá/NaN/trên mặt nước, O2/máu trong khoảng, cặp ngậm khớp, cá mập không vào vùng an toàn khoang, kho báu bảo toàn, điểm và thống kê khớp sự kiện', ended === 2 && Object.keys(bad).length === 0, JSON.stringify(bad));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Tốc độ');
{
  const m = SIM.createMatch({ seed: 1, mapId: 'A01', lineup: lineup('bot') });
  step(m, 240);
  const t0 = process.hrtime.bigint();
  step(m, 1000);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('  1000 bước bot (6 actor, sau intro): ' + ms.toFixed(1) + ' ms = ' + ms.toFixed(0) + ' µs mỗi bước');
  T.check('1000 bước bot dưới 1 s (ngân sách một trận 14640 bước là vài giây)', ms < 1000, ms.toFixed(0) + ' ms');
}

T.done();
