/*
 * Vực Săn: 11 kỹ năng cá mập (js/sim/skills-shark.js), Node không trình duyệt.
 * Mỗi phép thử dựng một trận có đội hình "human" đứng im, đặt actor ở nước trống (tâm hình tròn thoáng lớn nhất của A01),
 * bấm kỹ năng như người chơi (intent.skill = true rồi sim.step) và đo. Số mong đợi tính tay từ VS.SKILL_DATA / TUNING.
 * Chạy: node test/vuc-san-skills-shark.js
 */
'use strict';
const T = require('./vuc-san-lib');
const W = T.nodeSim(T.SIM_FILES);
const VS = W.VS, SIM = VS.sim, TU = VS.TUNING, SD = VS.SKILL_DATA, DT = 1 / 60;

const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
const step = (m, n) => { for (let i = 0; i < n; i++) SIM.step(m, DT); return m; };
const secs = (s) => Math.round(s / DT);
const ev = (m, type) => m.events.filter((e) => e.type === type);
const D4 = ['dave', 'hai', 'lan', 'bao'];
const SHARK_OF = {
  'lach-khe': 'Whitetip_Reefshark', 'lua-bay': 'Copper_Shark', 'an-day': 'Zebra_Shark', 'toc-bien': 'Shortfin_Mako', 'quat-duoi': 'Thresher_Shark',
  'cua-xe': 'Longnosesaw_Shark', 'khoet-thit': 'Cookiecutter_Shark', 'nuot-chung': 'Tiger_Shark', 'cam-dien': 'Smooth_Hammershark',
  'vo-ran': 'Frilled_Shark', 'hut-nuoc': 'Megamouth_Shark'
};
const IDS = Object.keys(SHARK_OF);

// Đếm số bước từ giờ tới khi pred() đúng (tối đa max); -1 nếu không bao giờ.
function until(m, pred, max) { for (let i = 0; i < max; i++) { if (pred()) return i; SIM.step(m, DT); } return pred() ? max : -1; }

// Trận human đứng im; cá mập 0 (id 4) dùng kỹ năng đang thử, cá mập 1 (id 5) là Vây Đen. Thợ lặn cất ở rìa bãi thoáng, cá mập kia ở rìa đối diện.
function rig(id, o) {
  o = o || {};
  const lineup = D4.map((d, i) => ({ team: 'diver', defId: d, name: 'T' + i, ctrl: 'human' }))
    .concat([{ team: 'shark', defId: SHARK_OF[id], name: 'C0', ctrl: 'human' }, { team: 'shark', defId: 'Blacktip_Reefshark', name: 'C1', ctrl: 'human' }]);
  const m = SIM.createMatch({ seed: o.seed || 1, mapId: 'A01', lineup });
  step(m, 240);
  m.actors.forEach((a) => SIM.removeEffects(a, 'spawnImmune'));
  const w = m.world;
  let best = null;
  for (let x = -60; x <= 60; x += 2) for (let y = -20; y <= 8; y += 2) {
    if (!w.open(x, y, 0.5)) continue;
    let lo = 0, hi = 30;
    for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (w.open(x, y, mid)) lo = mid; else hi = mid; }
    if (!best || lo > best.c) best = { x, y, c: lo };
  }
  const arena = best, sh = m.actors[4], other = m.actors[5];
  sh.skill.cd = 0;
  put(sh, arena.x, arena.y, 0);
  put(other, arena.x, arena.y + 8, 0);
  // Thợ lặn cất ở chỗ cả đội cá mập không thấy (không dính ánh khoang cứu hộ, rương O₂), cách nhau ≥ 5 m để không tự soi nhau
  SIM.updateVision(m, true);
  const spots = [];
  for (let deg = 180; deg <= 360 && spots.length < 4; deg += 5) {
    const x = arena.x + Math.cos(deg * Math.PI / 180) * 13, y = arena.y + Math.sin(deg * Math.PI / 180) * 13;
    if (!w.open(x, y, 0.6) || SIM.visibleTo(m, 'shark', x, y) || spots.some((q) => Math.hypot(q[0] - x, q[1] - y) < 5)) continue;
    spots.push([x, y]);
  }
  if (spots.length < 4) throw new Error('bãi thoáng không đủ 4 chỗ cất thợ lặn khuất');
  for (let i = 0; i < 4; i++) { put(m.actors[i], spots[i][0], spots[i][1], 0); m.actors[i].light = false; }
  SIM.updateVision(m, true);
  return { m, arena, sh, other, d: m.actors.slice(0, 4), cx: arena.x, cy: arena.y };
}
function put(a, x, y, ang) {
  a.x = x; a.y = y; a.vx = 0; a.vy = 0;
  if (ang !== undefined) { a.ang = ang; a.intent.aimX = x + Math.cos(ang); a.intent.aimY = y + Math.sin(ang); }
}
function press(R) { R.sh.intent.skill = true; SIM.step(R.m, DT); }
function immune(d) { SIM.addEffect(d, 'spawnImmune', 99, 1, -1); }
const o2Of = (d) => d.o2;

console.log('Nạp: đủ 11 kỹ năng, đúng nhân vật, đủ số trong SKILL_DATA');
{
  const miss = IDS.filter((id) => !VS.SKILLS[id] || typeof VS.SKILLS[id].start !== 'function' || typeof VS.SKILLS[id].bot !== 'function' || !SD[id]);
  T.check('11 kỹ năng cá mập đều có start và bot, có dữ liệu', miss.length === 0, miss.join() || 'đủ');
  const wrong = IDS.filter((id) => VS.SHARKS[SHARK_OF[id]].skill !== id);
  T.check('bảng cá mập trỏ đúng kỹ năng', wrong.length === 0, wrong.join() || 'khớp');
}

console.log('Lách Khe');
{
  const id = 'lach-khe', D = SD[id], R = rig(id), m = R.m, sh = R.sh, r0 = sh.r0;
  T.check('trước khi bấm: bán kính thật ' + r0, near(sh.r, r0, 1e-9) && r0 === VS.SHARKS[SHARK_OF[id]].r);
  press(R); step(m, 2);
  T.check('bấm: bán kính còn ' + D.rMul * 100 + '% (' + (r0 * D.rMul).toFixed(4) + ' m) và có hiệu ứng shrink + speed ×' + D.speedMul,
    near(sh.r, r0 * D.rMul, 1e-9) && !!SIM.effect(sh, 'shrink') && near(SIM.effect(sh, 'shrink').mag, D.rMul, 1e-9) && near(SIM.effect(sh, 'speed').mag, D.speedMul, 1e-9), sh.r);
  step(m, secs(D.dur) + 6);
  T.check('hết ' + D.dur + ' s ở chỗ thoáng: nở lại bán kính thật', near(sh.r, r0, 1e-9), sh.r);
  // Khe hẹp: chỗ lọt bán kính nhỏ mà không lọt bán kính thật (quét lưới 0,25 m khắp A01)
  const w = m.world, small = r0 * D.rMul;
  let slot = null;
  for (let x = -60; x <= 60 && !slot; x += 0.25) for (let y = -20; y <= 14; y += 0.25) if (w.open(x, y, small) && !w.open(x, y, r0)) { slot = { x, y }; break; }
  T.check('A01 có chỗ chỉ lọt khi nhỏ (để kiểm luật hết giờ vẫn nhỏ)', !!slot, slot ? slot.x + ',' + slot.y : 'không có');
  if (slot) {
    sh.skill.cd = 0; put(sh, R.cx, R.cy, 0); press(R); step(m, 2); put(sh, slot.x, slot.y, 0);
    step(m, secs(D.dur) + 30);
    T.check('hết giờ mà còn kẹt trong khe: vẫn nhỏ (' + (r0 * D.rMul).toFixed(3) + ' m)', !SIM.effect(sh, 'shrink') && near(sh.r, r0 * D.rMul, 1e-9), sh.r);
    put(sh, R.cx, R.cy, 0); step(m, 2);
    T.check('ra chỗ rộng thì nở lại bán kính thật', near(sh.r, r0, 1e-9), sh.r);
  }
  // Bot: thợ lặn đang thấy nằm trong chỗ cá mập thật không lọt thì dùng; chỗ thoáng thì không
  const R2 = rig(id), s2 = R2.sh;
  put(R2.d[0], R2.cx + 5, R2.cy, 0); SIM.updateVision(R2.m, true);
  T.check('bot không dùng khi thợ lặn ở nước thoáng', SIM.skillBot(R2.m, s2) === null);
  if (slot) {
    put(R2.d[0], slot.x, slot.y, 0); put(s2, slot.x + 3, slot.y, 0); R2.d[0].light = true; SIM.updateVision(R2.m, true);
    const seen = SIM.sharkSees(R2.m, s2, R2.d[0]);
    T.check('bot dùng khi thợ lặn đang thấy nằm trong khe (thấy=' + seen + ')', !seen || SIM.skillBot(R2.m, s2) === true);
  }
}

console.log('Lùa Bầy');
{
  const id = 'lua-bay', D = SD[id], R = rig(id), m = R.m, sh = R.sh, cx = R.cx, cy = R.cy;
  put(R.d[0], cx + 7, cy + 1, 0); put(R.d[1], cx + 7, cy + 5, 0); put(R.d[2], cx + 7, cy - 0.5, 0);
  immune(R.d[2]);
  sh.intent.aimX = cx + 7; sh.intent.aimY = cy;
  press(R); step(m, 2);
  const z = m.zones.filter((q) => q.kind === 'bait')[0];
  T.check('zone kind bait tại chỗ ngắm (7 m), bán kính ' + D.r + ', hết sau ' + D.dur + ' s',
    !!z && near(z.x, cx + 7, 0.05) && near(z.y, cy, 0.05) && near(z.r, D.r, 1e-9) && near(z.until - m.t, D.dur, 2 * DT + 1e-6), z && z.x);
  T.check('thợ lặn trong bầy bị chậm ' + D.slow * 100 + '%', near(R.d[0].mod.slow, D.slow, 1e-9) && near(R.d[0].mod.speedMul, 1 - D.slow, 1e-9), R.d[0].mod.slow);
  T.check('âm: thợ lặn cách bầy 4 m không bị chậm; thợ lặn miễn sát thương mới sinh không bị chậm', R.d[1].mod.slow === 0 && R.d[2].mod.slow === 0);
  const vx = [0]; R.d[0].intent.mx = 1; R.d[0].intent.my = 0; step(m, secs(0.8)); vx[0] = Math.hypot(R.d[0].vx, R.d[0].vy);
  T.check('đo tốc độ trong bầy ≈ ' + (VS.DIVERS.dave.speed * (1 - D.slow)).toFixed(2) + ' m/s (thợ lặn bơi ra khỏi bầy sau ~' + (D.r / 1.8).toFixed(1) + ' s)', near(vx[0], VS.DIVERS.dave.speed * (1 - D.slow), 0.25), vx[0].toFixed(3));
  T.check('sự kiện bait phát với toạ độ và bán kính', ev(m, 'bait').length === 1 && near(ev(m, 'bait')[0].r, D.r, 1e-9));
  // Ngắm xa hơn tầm ném thì cắt ở tầm tối đa
  const R2 = rig(id); R2.sh.intent.aimX = R2.cx + 30; R2.sh.intent.aimY = R2.cy; press(R2);
  const z2 = R2.m.zones.filter((q) => q.kind === 'bait')[0];
  T.check('ngắm 30 m: bầy rơi ở tầm tối đa ' + D.range + ' m', !!z2 && near(z2.x - R2.cx, D.range, 0.05), z2 && z2.x - R2.cx);
  // Chặn ánh sáng thật: đèn pin xuyên qua bầy không tới được mục tiêu phía sau
  const R3 = rig(id), a3 = R3.d[0];
  put(a3, R3.cx - 6, R3.cy + 3, 0); a3.light = true; put(R3.d[1], R3.cx - 2, R3.cy + 3, 0); R3.d[1].light = false;
  SIM.updateVision(R3.m, true);
  const before = SIM.visibleTo(R3.m, 'diver', R3.cx + 2, R3.cy + 3);
  SIM.addZone(R3.m, { kind: 'bait', x: R3.cx - 1, y: R3.cy + 3, r: 1.5, dur: 8, team: 'shark' }); SIM.updateVision(R3.m, true);
  T.check('đèn pin chiếu tới sau lưng bầy khi chưa có bầy (' + before + '), có bầy chắn thì mất', before === true && SIM.visibleTo(R3.m, 'diver', R3.cx + 2, R3.cy + 3) === false);
  // bot
  const R4 = rig(id); put(R4.d[0], R4.cx + 6, R4.cy, 0); R4.d[0].light = true; SIM.updateVision(R4.m, true);
  const b = SIM.skillBot(R4.m, R4.sh);
  T.check('bot ngắm tới thợ lặn thấy được cách 6 m', !!b && b !== true && near(b.x, R4.cx + 6, 0.5) && near(b.y, R4.cy, 0.5), JSON.stringify(b));
  put(R4.d[0], R4.cx + 14, R4.cy, 0); SIM.updateVision(R4.m, true);
  T.check('âm: thợ lặn xa quá tầm ném thì bot không dùng', SIM.skillBot(R4.m, R4.sh) === null);
}

console.log('Ẩn Đáy');
{
  const id = 'an-day', D = SD[id], R = rig(id), m = R.m, sh = R.sh, cx = R.cx, cy = R.cy, a = R.d[0];
  put(a, cx + 4, cy, Math.PI); a.light = true; SIM.updateVision(m, true);
  T.check('trước khi bấm: thợ lặn bật đèn chiếu vào thấy cá mập cách 4 m', SIM.canSee(m, 'diver', sh) === true);
  press(R);
  T.check('bấm: hiệu ứng stealth ' + D.revealR + ' m', !!SIM.effect(sh, 'stealth') && near(SIM.effect(sh, 'stealth').mag, D.revealR, 1e-9));
  T.check('thợ lặn cách ' + 4 + ' m không thấy cá mập', SIM.canSee(m, 'diver', sh) === false);
  put(a, cx + 2, cy, Math.PI); SIM.updateVision(m, true);
  T.check('thợ lặn cách 2 m (trong ' + D.revealR + ' m) thấy', SIM.canSee(m, 'diver', sh) === true);
  put(a, cx + 2.6, cy, Math.PI);
  T.check('âm: cách 2,6 m (ngoài ' + D.revealR + ' m) lại không thấy', SIM.canSee(m, 'diver', sh) === false);
  step(m, secs(D.dur) + 3);
  put(a, cx + 4, cy, Math.PI); SIM.updateVision(m, true);
  T.check('hết ' + D.dur + ' s: thấy lại', !SIM.effect(sh, 'stealth') && SIM.canSee(m, 'diver', sh) === true);

  // Cú cắn đầu tiên làm choáng
  const bite = (prep) => {
    const Q = rig(id); const q = Q.sh, v = Q.d[0];
    put(q, Q.cx, Q.cy, 0); put(v, Q.cx + 1.2, Q.cy, 0); v.light = false;
    if (prep) prep(Q, v);
    return { Q, q, v };
  };
  {
    const { Q, q, v } = bite(); press(Q); q.intent.fire = true;
    const n = until(Q.m, () => ev(Q.m, 'bite').length > 0, 60), st = SIM.effect(v, 'stun');
    T.check('tàng hình rồi cắn: thợ lặn choáng ' + D.ambushStun + ' s (±1 bước)', n >= 0 && !!st && near(st.until - Q.m.t, D.ambushStun, DT + 1e-6), st && (st.until - Q.m.t).toFixed(4));
    T.check('cú cắn đã dùng hết lượt choáng', q.skill.ambush === false);
  }
  {
    const { Q, v } = bite(); Q.sh.intent.fire = true;
    until(Q.m, () => ev(Q.m, 'bite').length > 0, 60);
    T.check('âm: cắn khi không tàng hình thì không choáng', ev(Q.m, 'bite').length === 1 && SIM.effect(v, 'stun') === null);
  }
  {
    const { Q, v } = bite((q, d) => SIM.addEffect(d, 'ccImmune', 9, 1, -1)); press(Q); Q.sh.intent.fire = true;
    until(Q.m, () => ev(Q.m, 'bite').length > 0, 60);
    T.check('âm: thợ lặn miễn khống chế bị cắn thì không choáng', ev(Q.m, 'bite').length === 1 && SIM.effect(v, 'stun') === null);
  }
  const R2 = rig(id); put(R2.d[0], R2.cx + 9, R2.cy, 0); R2.d[0].light = true; SIM.updateVision(R2.m, true);
  T.check('bot tàng hình khi thấy thợ lặn cách 9 m', SIM.skillBot(R2.m, R2.sh) === true);
  put(R2.d[0], R2.cx + 3, R2.cy, 0); SIM.updateVision(R2.m, true);
  T.check('âm: thợ lặn đã sát (3 m) thì bot không còn tàng hình', SIM.skillBot(R2.m, R2.sh) === null);
}

console.log('Tốc Biến');
{
  const id = 'toc-bien', D = SD[id], def = VS.SHARKS[SHARK_OF[id]], R = rig(id), m = R.m, sh = R.sh;
  sh.intent.mx = 1; sh.intent.my = 0; step(m, secs(1.5));
  const base = Math.hypot(sh.vx, sh.vy);
  put(sh, R.cx - 10, R.cy, 0); step(m, 5);
  press(R); step(m, secs(1.6));
  const fast = Math.hypot(sh.vx, sh.vy);
  T.check('tốc độ chạy thường ≈ ' + def.speed + ' m/s', near(base, def.speed, 0.15), base.toFixed(3));
  T.check('trong Tốc Biến tốc độ ≈ ' + (def.speed * D.speedMul).toFixed(2) + ' m/s (×' + D.speedMul + ')', near(fast, def.speed * D.speedMul, 0.3), fast.toFixed(3));
  const bite = (wait) => {
    const Q = rig(id), v = Q.d[0];
    put(Q.sh, Q.cx, Q.cy, 0); put(v, Q.cx + 1.2, Q.cy, 0);
    press(Q); step(Q.m, wait); Q.sh.intent.fire = true;
    until(Q.m, () => ev(Q.m, 'bite').length > 0, 60);
    return ev(Q.m, 'bite')[0];
  };
  const b1 = bite(10);
  T.check('cú cắn kế tiếp trừ ' + def.bite + ' × ' + D.biteMul + ' = ' + (def.bite * D.biteMul).toFixed(1) + ' O₂', !!b1 && near(b1.o2, def.bite * D.biteMul, 0.01), b1 && b1.o2);
  const b2 = bite(secs(D.dur) + 10);
  T.check('âm: cắn sau khi hết ' + D.dur + ' s thì chỉ ' + def.bite + ' O₂', !!b2 && near(b2.o2, def.bite, 0.01), b2 && b2.o2);
  const R2 = rig(id); put(R2.d[0], R2.cx + 8, R2.cy, 0); R2.d[0].light = true; SIM.updateVision(R2.m, true);
  T.check('bot dùng khi thợ lặn thấy được cách 8 m trước mũi', SIM.skillBot(R2.m, R2.sh) === true);
  put(R2.d[0], R2.cx - 8, R2.cy, 0); SIM.updateVision(R2.m, true);
  T.check('âm: thợ lặn sau lưng thì bot không dùng', SIM.skillBot(R2.m, R2.sh) === null);
}

console.log('Quất Đuôi');
{
  const id = 'quat-duoi', D = SD[id], R = rig(id), m = R.m, sh = R.sh, cx = R.cx, cy = R.cy, d = R.d;
  const polar = (deg, r) => [cx + Math.cos(deg * Math.PI / 180) * r, cy + Math.sin(deg * Math.PI / 180) * r];
  const P = [polar(0, 3), polar(180, 3), polar(0, 5.5), polar(D.arc / 2 - 10, 4), polar(D.arc / 2 + 10, 3)];
  d[0].light = true;
  put(d[0], P[0][0], P[0][1], 0); put(d[1], P[1][0], P[1][1], 0); put(d[2], P[2][0], P[2][1], 0); put(d[3], P[3][0], P[3][1], 0);
  const e = R.other; put(e, P[4][0], P[4][1], 0);   // cá mập kia ngoài cung (80°): đuôi chỉ hất thợ lặn
  const px = d[0].x;
  press(R);
  const has = (a, k) => !!SIM.effect(a, k);
  T.check('thợ lặn trong cung ' + D.arc + '° cách 3 m: choáng + đèn tắt', has(d[0], 'stun') && has(d[0], 'lightOff'));
  T.check('thợ lặn ở mép cung (' + (D.arc / 2 - 10) + '° lệch, 4 m) cũng trúng', has(d[3], 'stun'));
  T.check('âm: thợ lặn sau lưng (3 m) không bị', !has(d[1], 'stun') && !has(d[1], 'lightOff') && d[1].vx === 0);
  T.check('âm: thợ lặn ngoài ' + D.r + ' m (5,5 m) không bị', !has(d[2], 'stun') && !has(d[2], 'lightOff'));
  T.check('sự kiện tail mang bán kính và cung', ev(m, 'tail').length === 1 && near(ev(m, 'tail')[0].r, D.r, 1e-9) && near(ev(m, 'tail')[0].arc, D.arc * Math.PI / 180, 1e-9) && ev(m, 'tail')[0].hits === 2, JSON.stringify(ev(m, 'tail')[0]));
  const nStun = until(m, () => !has(d[0], 'stun'), 120), nDark = until(m, () => !has(d[0], 'lightOff'), 400) + nStun;
  T.check('choáng ' + D.stun + ' s (±1 bước)', near(nStun * DT, D.stun, 1.5 * DT), (nStun * DT).toFixed(3));
  T.check('đèn pin tắt ' + D.lightOff + ' s (±1 bước), sim.lightOn phản ánh', near(nDark * DT, D.lightOff, 2.5 * DT) && SIM.lightOn(d[0]) === true, (nDark * DT).toFixed(3));
  step(m, 90);
  const moved = d[0].x - px, expect = D.push / TU.diver.drag;
  T.check('hất văng ≈ push/drag = ' + expect.toFixed(2) + ' m ra xa cá mập', near(moved, expect, 0.35), moved.toFixed(3));
  // miễn
  const Q = rig(id); put(Q.sh, Q.cx, Q.cy, 0);
  put(Q.d[0], Q.cx + 3, Q.cy, 0); put(Q.d[1], Q.cx + 3, Q.cy + 1, 0); put(Q.d[2], Q.cx + 3, Q.cy - 1, 0);
  SIM.addEffect(Q.d[0], 'ccImmune', 9, 1, -1); immune(Q.d[1]); SIM.addEffect(Q.d[2], 'grabImmune', 9, 1, -1);
  press(Q);
  T.check('âm: ccImmune và grabImmune (Máy Đẩy) không choáng, không bị hất', Q.d[0].vx === 0 && Q.d[2].vx === 0 && !SIM.effect(Q.d[0], 'stun') && !SIM.effect(Q.d[2], 'stun'));
  T.check('âm: thợ lặn đang miễn sát thương mới sinh không dính gì', !SIM.effect(Q.d[1], 'stun') && !SIM.effect(Q.d[1], 'lightOff') && Q.d[1].vx === 0);
  const B = rig(id); put(B.d[0], B.cx + 3, B.cy, 0); B.d[0].light = true; SIM.updateVision(B.m, true);
  T.check('bot quất khi thợ lặn thấy được trong cung 3 m', SIM.skillBot(B.m, B.sh) === true);
  put(B.d[0], B.cx + 7, B.cy, 0); SIM.updateVision(B.m, true);
  T.check('âm: thợ lặn 7 m (ngoài tầm quất) thì bot không dùng', SIM.skillBot(B.m, B.sh) === null);
}

console.log('Cưa Xẻ');
{
  const id = 'cua-xe', D = SD[id], def = VS.SHARKS[SHARK_OF[id]], R = rig(id), m = R.m, sh = R.sh, cx = R.cx, cy = R.cy, d = R.d;
  put(d[0], cx + 4, cy, 0); put(d[1], cx + 4, cy + 3, 0); put(d[2], cx + 5, cy, 0); put(d[3], cx + 12, cy - 6, 0);   // d2 miễn sát thương, d3 đối chứng xa
  immune(d[2]);
  SIM.addEffect(sh, 'slow', 9, 0.6, 99); SIM.addEffect(sh, 'noDash', 9, 1, 99);
  const o0 = d.map(o2Of);
  press(R);
  T.check('xé lưới: bấm gỡ chậm và noDash của chính mình', SIM.effect(sh, 'slow') === null && SIM.effect(sh, 'noDash') === null);
  const n = until(m, () => !!SIM.effect(d[0], 'bleed'), 120);
  const bl = SIM.effect(d[0], 'bleed');
  T.check('thợ lặn trên đường bị chảy máu ' + D.bleed + ' O₂/s trong ' + D.bleedDur + ' s', n >= 0 && !!bl && near(bl.mag, D.bleed, 1e-9) && near(bl.until - m.t, D.bleedDur, DT + 1e-6), bl && (bl.until - m.t));
  step(m, secs(D.bleedDur) + 30);
  const lost = (i) => o0[i] - d[i].o2, ctrl = lost(3);
  T.check('tổng mất ' + D.dmg + ' + ' + D.bleed + '×' + D.bleedDur + ' = ' + (D.dmg + D.bleed * D.bleedDur) + ' O₂ (đã trừ hao thường)', near(lost(0) - ctrl, D.dmg + D.bleed * D.bleedDur, 0.5), (lost(0) - ctrl).toFixed(3));
  T.check('lao đúng ' + D.dist + ' m (±0,3)', near(sh.x - cx, D.dist, 0.3), (sh.x - cx).toFixed(3));
  T.check('âm: thợ lặn lệch đường 3 m và thợ lặn miễn sát thương mới sinh không mất O₂ thêm', near(lost(1), ctrl, 0.05) && near(lost(2), ctrl, 0.05) && !SIM.effect(d[1], 'bleed') && !SIM.effect(d[2], 'bleed'), lost(1).toFixed(3) + '/' + lost(2).toFixed(3));
  T.check('một lần cưa chỉ có một dấu chảy máu của một lần trúng, sự kiện saw bắt đầu/kết thúc', ev(m, 'saw').length === 2 && ev(m, 'saw')[0].phase === 'start' && ev(m, 'saw')[1].phase === 'end' && d[0].effects.filter((e) => e.kind === 'bleed').length === 0);
  // phá lồng
  const Q = rig(id); put(Q.sh, Q.cx, Q.cy, 0);
  SIM.addZone(Q.m, { kind: 'cage', x: Q.cx + 4.5, y: Q.cy, r: 1.5, dur: 20, team: 'diver' });
  press(Q); step(Q.m, secs(D.dist / (def.dash * 1.3)) + 10);
  T.check('phá lồng thép trên đường và xuyên qua (shark.x > lồng)', Q.m.zones.filter((z) => z.kind === 'cage').length === 0 && Q.sh.x - Q.cx > D.dist - 0.5 && ev(Q.m, 'saw-cut').length === 1, Q.sh.x - Q.cx);
  const Q2 = rig(id); put(Q2.sh, Q2.cx, Q2.cy, 0);
  SIM.addZone(Q2.m, { kind: 'cage', x: Q2.cx + 4.5, y: Q2.cy + 6, r: 1.5, dur: 20, team: 'diver' });
  press(Q2); step(Q2.m, 60);
  T.check('âm: lồng ngoài đường lao còn nguyên', Q2.m.zones.filter((z) => z.kind === 'cage').length === 1);
  // thợ lặn trong lồng bị cưa lồng rồi mới trúng; thợ lặn khác trong lồng không cùng đường thì không
  const B = rig(id); put(B.d[0], B.cx + 5, B.cy, 0); B.d[0].light = true; SIM.updateVision(B.m, true);
  T.check('bot dùng khi thợ lặn thấy được trước mũi 5 m', SIM.skillBot(B.m, B.sh) === true);
  put(B.d[0], B.cx + 5, B.cy + 4, 0); SIM.updateVision(B.m, true);
  T.check('âm: thợ lặn lệch hướng thì bot không dùng', SIM.skillBot(B.m, B.sh) === null);
}

console.log('Khoét Thịt');
{
  const id = 'khoet-thit', D = SD[id], R = rig(id), m = R.m, sh = R.sh, cx = R.cx, cy = R.cy, d = R.d;
  put(d[0], cx + 3, cy, 0); put(d[3], cx + 12, cy - 6, 0);
  const o0 = [d[0].o2, d[3].o2];
  press(R);
  T.check('bấm: bám vào thợ lặn trong ' + D.range + ' m, sự kiện latch', ev(m, 'latch').length === 1 && ev(m, 'latch')[0].target === 0 && sh.skill.target === 0);
  step(m, secs(1));
  const drained = (o0[0] - d[0].o2) - (o0[1] - d[3].o2);
  T.check('hút ' + D.drain + ' O₂/s: 1 s mất ' + D.drain + ' (±0,3)', near(drained, D.drain, 0.3), drained.toFixed(3));
  T.check('cá mập dính sát thợ lặn', Math.hypot(sh.x - d[0].x, sh.y - d[0].y) < (sh.r + d[0].r), Math.hypot(sh.x - d[0].x, sh.y - d[0].y).toFixed(3));
  step(m, secs(D.dur) + 20);
  const total = (o0[0] - d[0].o2) - (o0[1] - d[3].o2);
  T.check('hết ' + D.dur + ' s tự nhả: tổng ' + D.drain * D.dur + ' O₂ (±0,8) và sự kiện unlatch time', near(total, D.drain * D.dur, 0.8) && ev(m, 'unlatch').length === 1 && ev(m, 'unlatch')[0].why === 'time', total.toFixed(3));
  // tăng tốc liền shakeT giây thì rơi
  const Q = rig(id); put(Q.d[0], Q.cx + 3, Q.cy, 0); press(Q);
  Q.d[0].intent.mx = 1; Q.d[0].intent.boost = true;
  const n = until(Q.m, () => ev(Q.m, 'unlatch').length > 0, 300);
  T.check('thợ lặn tăng tốc liền ' + D.shakeT + ' s thì cá mập rơi ra (±3 bước), why shake', n >= 0 && near(n * DT, D.shakeT, 3 * DT) && ev(Q.m, 'unlatch')[0].why === 'shake' && Q.sh.skill.t === 0, (n * DT).toFixed(3));
  const Q1 = rig(id); put(Q1.d[0], Q1.cx + 3, Q1.cy, 0); press(Q1);
  Q1.d[0].intent.mx = 1; Q1.d[0].intent.boost = true; step(Q1.m, secs(0.8));
  Q1.d[0].intent.boost = false; step(Q1.m, secs(0.8)); Q1.d[0].intent.boost = true; step(Q1.m, secs(0.8));
  T.check('âm: tăng tốc ngắt quãng (0,8 s rồi nghỉ) không đủ ' + D.shakeT + ' s liền thì vẫn bám', ev(Q1.m, 'unlatch').length === 0 && Q1.sh.skill.target === 0);
  // bị bắn thì rơi
  const S = rig(id); put(S.d[0], S.cx + 3, S.cy, 0); put(S.d[1], S.cx + 10, S.cy + 5, 0); press(S); step(S.m, 30);
  SIM.damageShark(S.m, S.sh, 5, S.d[1]); step(S.m, 2);
  T.check('đồng đội bắn trúng thì rơi ra, why shot', ev(S.m, 'unlatch').length === 1 && ev(S.m, 'unlatch')[0].why === 'shot');
  // Máy Đẩy giữa chừng
  const G = rig(id); put(G.d[0], G.cx + 3, G.cy, 0); press(G); step(G.m, 20); SIM.addEffect(G.d[0], 'grabImmune', 4, 1, G.d[0].id); step(G.m, 2);
  T.check('thợ lặn bật Máy Đẩy (grabImmune) giữa chừng thì rơi, why lost', ev(G.m, 'unlatch').length === 1 && ev(G.m, 'unlatch')[0].why === 'lost');
  // âm
  const N = rig(id); put(N.d[0], N.cx + 5, N.cy, 0); press(N);
  T.check('âm: thợ lặn cách 5 m (> ' + D.range + ') thì bấm không có tác dụng và không tốn hồi chiêu', ev(N.m, 'latch').length === 0 && N.sh.skill.cd === 0 && ev(N.m, 'skill').length === 0);
  const N2 = rig(id); put(N2.d[0], N2.cx + 3, N2.cy, 0); SIM.addEffect(N2.d[0], 'grabImmune', 9, 1, -1); press(N2);
  T.check('âm: thợ lặn grabImmune thì không bám được', ev(N2.m, 'latch').length === 0 && N2.sh.skill.cd === 0);
  const N3 = rig(id); put(N3.d[0], N3.cx + 3, N3.cy, 0); SIM.addEffect(N3.d[0], 'ccImmune', 9, 1, -1); press(N3);
  T.check('âm: thợ lặn ccImmune thì không bám được', ev(N3.m, 'latch').length === 0);
  const N4 = rig(id); put(N4.d[0], N4.cx + 3, N4.cy, 0); immune(N4.d[0]); press(N4);
  T.check('âm: thợ lặn miễn sát thương mới sinh thì không bám được', ev(N4.m, 'latch').length === 0);
  const B = rig(id); put(B.d[0], B.cx + 3, B.cy, 0); B.d[0].light = true; SIM.updateVision(B.m, true);
  T.check('bot bám thợ lặn thấy được cách 3 m', SIM.skillBot(B.m, B.sh) === true);
  put(B.d[0], B.cx + 6, B.cy, 0); SIM.updateVision(B.m, true);
  T.check('âm: 6 m thì bot không dùng', SIM.skillBot(B.m, B.sh) === null);
}

console.log('Nuốt Chửng');
{
  const id = 'nuot-chung', D = SD[id], def = VS.SHARKS[SHARK_OF[id]];
  const down = (d) => SIM.hurtDiver(d.m, d, 9999, null, 'hit');
  // Thợ lặn gục trong tầm
  {
    const R = rig(id), m = R.m, sh = R.sh, a = R.d[0];
    put(a, R.cx + 2.5, R.cy, 0); down(a); sh.hp = 200;
    const lt = m.loot[0]; lt.st = 'carried'; lt.by = a.id; a.carry.push(0); a.carryKg = lt.kg;
    press(R);
    T.check('thợ lặn đang gục trong ' + D.range + ' m bị loại luôn', a.st === 'out' && ev(m, 'swallow').length === 1, a.st);
    T.check('hồi ' + D.heal * 100 + '% máu tối đa: ' + 200 + ' + ' + def.hp * D.heal + ' = ' + (200 + def.hp * D.heal), near(sh.hp, 200 + def.hp * D.heal, 0.5), sh.hp);
    T.check('kho báu đang mang rơi lại chỗ cũ, công loại thuộc cá mập', lt.st === 'rest' && sh.stats.outs === 1);
    T.check('đã nuốt thì không có giáp', SIM.effect(sh, 'armor') === null && ev(m, 'guard').length === 0);
  }
  // Còn dưới lowO2
  {
    const R = rig(id), a = R.d[0]; put(a, R.cx + 2.5, R.cy, 0); a.o2 = D.lowO2 - 5; R.sh.hp = 100; press(R);
    T.check('thợ lặn còn ' + (D.lowO2 - 5) + ' O₂ (< ' + D.lowO2 + ') bị nuốt', a.st === 'out' && near(R.sh.hp, 100 + def.hp * D.heal, 0.5));
  }
  {
    const R = rig(id), a = R.d[0]; put(a, R.cx + 2.5, R.cy, 0); a.o2 = D.lowO2 + 5; R.sh.hp = 100; press(R);
    T.check('âm: thợ lặn còn ' + (D.lowO2 + 5) + ' O₂ không bị nuốt; chuyển sang giáp, không hồi máu', a.st === 'swim' && near(R.sh.hp, 100, 0.5) && !!SIM.effect(R.sh, 'armor'));
  }
  // hp không vượt tối đa
  {
    const R = rig(id), a = R.d[0]; put(a, R.cx + 2.5, R.cy, 0); down(a); R.sh.hp = def.hp - 10; press(R);
    T.check('hồi không vượt máu tối đa ' + def.hp, a.st === 'out' && R.sh.hp === def.hp, R.sh.hp);
  }
  // Giáp
  {
    const R = rig(id), sh = R.sh; R.d[0].o2 = 100; put(R.d[0], R.cx + 6, R.cy, 0); press(R);
    const ar = SIM.effect(sh, 'armor');
    T.check('không có ai: giáp ' + D.armor * 100 + '% trong ' + D.dur + ' s, phát guard', !!ar && near(ar.mag, D.armor, 1e-9) && near(ar.until - R.m.t, D.dur, DT + 1e-6) && ev(R.m, 'guard').length === 1);
    const before = sh.hp, got = SIM.damageShark(R.m, sh, 100, R.d[0]);
    T.check('có giáp: nhận 100 sát thương chỉ mất ' + 100 * (1 - D.armor), near(got, 100 * (1 - D.armor), 1e-9) && near(before - sh.hp, 100 * (1 - D.armor), 1e-9), got);
    step(R.m, secs(D.dur) + 5);
    const hp2 = sh.hp, got2 = SIM.damageShark(R.m, sh, 100, R.d[0]);
    T.check('hết ' + D.dur + ' s: nhận đủ 100', near(got2, 100, 1e-9) && near(hp2 - sh.hp, 100, 1e-9));
  }
  // âm: xa, grabImmune, mới sinh, trong lồng
  {
    const mk = (prep) => { const R = rig(id), a = R.d[0]; put(a, R.cx + 2.5, R.cy, 0); down(a); R.sh.hp = 100; prep(R, a); press(R); return { R, a }; };
    let r = mk((R, a) => put(a, R.cx + D.range + 1, R.cy, 0));
    T.check('âm: người gục cách ' + (D.range + 1) + ' m (> ' + D.range + ') không bị nuốt', r.a.st === 'down' && near(r.R.sh.hp, 100, 0.5) && !!SIM.effect(r.R.sh, 'armor'));
    r = mk((R, a) => SIM.addEffect(a, 'grabImmune', 9, 1, -1));
    T.check('âm: người gục đang grabImmune không bị nuốt', r.a.st === 'down' && near(r.R.sh.hp, 100, 0.5));
    r = mk((R, a) => immune(a));
    T.check('âm: người gục miễn sát thương mới sinh không bị nuốt', r.a.st === 'down');
    r = mk((R, a) => SIM.addZone(R.m, { kind: 'cage', x: a.x, y: a.y, r: 1.5, dur: 9, team: 'diver' }));
    T.check('âm: người gục trong lồng thép không bị nuốt', r.a.st === 'down');
  }
  {
    const R = rig(id), a = R.d[0]; put(a, R.cx + 2.5, R.cy, 0); down(a);
    T.check('bot nuốt người gục trong tầm', SIM.skillBot(R.m, R.sh) === true);
    put(a, R.cx + 8, R.cy, 0);
    T.check('âm: người gục xa 8 m, máu đầy thì bot không dùng', SIM.skillBot(R.m, R.sh) === null);
  }
}

console.log('Cảm Điện');
{
  const id = 'cam-dien', D = SD[id], R = rig(id), m = R.m, sh = R.sh, other = R.other, cx = R.cx, cy = R.cy, d = R.d;
  const w = m.world, statics = m.pods.concat(m.o2);
  // Điểm sau vách: không thông tia tới cá mập, xa 20-40 m, không gần nguồn sáng tĩnh
  const hidden = [];
  for (let y = 12; y >= -20 && hidden.length < 2; y -= 2) for (let x = -60; x <= 60 && hidden.length < 2; x += 2) {
    if (!w.open(x, y, 0.5) || Math.hypot(x - cx, y - cy) < 20 || Math.hypot(x - cx, y - cy) > 40 || w.clear(cx, cy, x, y)) continue;
    if (statics.some((p) => Math.hypot(p.x - x, p.y - y) < 9) || (hidden.length && Math.hypot(hidden[0][0] - x, hidden[0][1] - y) < 5)) continue;
    if (Math.hypot(other.x - x, other.y - y) < 12) continue;
    hidden.push([x, y]);
  }
  T.check('tìm được 2 chỗ sau vách xa 20-40 m', hidden.length === 2, hidden.length);
  put(d[0], hidden[0][0], hidden[0][1], 0); put(d[1], hidden[1][0], hidden[1][1], 0); put(d[2], cx + 12, cy + 3, 0); put(d[3], cx - 11, cy + 4, 0);
  d.forEach((o) => { o.light = false; });
  SIM.addZone(m, { kind: 'ink', x: d[2].x, y: d[2].y, r: 3, dur: 30, team: 'diver' });
  SIM.addZone(m, { kind: 'cage', x: d[3].x, y: d[3].y, r: 2, dur: 30, team: 'diver' });
  SIM.updateVision(m, true);
  T.check('trước khi bấm: cả đội cá mập không thấy ai', d.every((o) => !SIM.canSee(m, 'shark', o) && !SIM.sharkSees(m, sh, o) && !SIM.sharkSees(m, other, o)));
  press(R); step(m, 2); SIM.updateVision(m, true);
  T.check('bấm: thấy thợ lặn sau vách xuyên đá (cả hai cá mập)', SIM.canSee(m, 'shark', d[0]) && SIM.canSee(m, 'shark', d[1]) && SIM.sharkSees(m, other, d[0]) && SIM.sharkSees(m, sh, d[1]));
  T.check('âm: thợ lặn trong đám mực không lộ; thợ lặn trong lồng thép không lộ', !SIM.canSee(m, 'shark', d[2]) && !SIM.canSee(m, 'shark', d[3]));
  T.check('đội thợ lặn không được thấy thêm gì (cá mập vẫn không bị lộ)', SIM.effect(sh, 'reveal') === null && SIM.effect(other, 'reveal') === null);
  const n = until(m, () => !SIM.canSee(m, 'shark', d[0]), 400) + 2;
  T.check('lộ đúng ' + D.dur + ' s (±2 bước)', near(n * DT, D.dur, 2.5 * DT), (n * DT).toFixed(3));
  T.check('hết giờ: không còn hiệu ứng reveal nào trên thợ lặn', d.every((o) => !SIM.effect(o, 'reveal')));
  // người ra khỏi mực giữa chừng thì bị lộ
  const Q = rig(id); put(Q.d[0], Q.cx + 12, Q.cy + 3, 0); Q.d[0].light = false;
  SIM.addZone(Q.m, { kind: 'ink', x: Q.d[0].x, y: Q.d[0].y, r: 3, dur: 30, team: 'diver' }); SIM.updateVision(Q.m, true);
  press(Q); step(Q.m, 4);
  const hid = !SIM.canSee(Q.m, 'shark', Q.d[0]);
  put(Q.d[0], Q.cx + 12, Q.cy - 7, 0); step(Q.m, 4); SIM.updateVision(Q.m, true);
  T.check('ra khỏi đám mực giữa lúc Cảm Điện thì bị lộ (trong mực: ẩn=' + hid + ')', hid && SIM.canSee(Q.m, 'shark', Q.d[0]));
  // người đã bị loại
  const O = rig(id); put(O.d[0], O.cx + 12, O.cy - 3, 0); SIM.outDiver(O.m, O.d[0], 'test', null); press(O); step(O.m, 2);
  T.check('âm: thợ lặn đã bị loại không bị lộ', SIM.canSee(O.m, 'shark', O.d[0]) === false);
  // bot
  const B = rig(id); put(B.d[0], hidden[0][0], hidden[0][1], 0);
  SIM.updateVision(B.m, true);
  T.check('bot dùng khi cả đội không thấy ai', SIM.skillBot(B.m, B.sh) === true);
  put(B.d[0], B.cx + 4, B.cy, 0); B.d[0].light = true; SIM.updateVision(B.m, true);
  T.check('âm: đã thấy thợ lặn thì bot không dùng', SIM.skillBot(B.m, B.sh) === null);
}

console.log('Vồ Rắn');
{
  const id = 'vo-ran', D = SD[id], R = rig(id), m = R.m, sh = R.sh, cx = R.cx, cy = R.cy, d = R.d;
  put(d[0], cx + 6, cy, 0); put(d[1], cx + 8, cy, 0);
  sh.intent.aimX = cx + 10; sh.intent.aimY = cy;
  press(R);
  const jaw = m.projs.filter((p) => p.kind === 'jaw')[0];
  T.check('bấm: sinh đạn kind jaw bay ra từ cá mập, sống đủ ' + D.dist + ' m', !!jaw && jaw.owner === sh.id && jaw.team === 'shark' && near(jaw.vx * jaw.life, D.dist, 0.4) && jaw.vy === 0, jaw && jaw.life);
  const n = until(m, () => ev(m, 'jaw').length > 0, 80);
  T.check('hàm trúng thợ lặn đầu tiên', n >= 0 && ev(m, 'jaw')[0].target === 0);
  T.check('kéo về ' + D.pull + ' m: từ 6 m còn ' + (6 - D.pull) + ' m', near(d[0].x - cx, 6 - D.pull, 0.1) && near(d[0].y, cy, 0.05), d[0].x - cx);
  const st = SIM.effect(d[0], 'stun');
  T.check('choáng ' + D.stun + ' s (±1 bước)', !!st && near(st.until - m.t, D.stun, DT + 1e-6), st && st.until - m.t);
  T.check('âm: thợ lặn thứ hai (8 m, sau người đầu) không bị kéo, không choáng', near(d[1].x - cx, 8, 1e-9) && SIM.effect(d[1], 'stun') === null);
  const mk = (prep, dist) => { const Q = rig(id); put(Q.d[0], Q.cx + (dist || 5), Q.cy, 0); if (prep) prep(Q.d[0], Q); Q.sh.intent.aimX = Q.cx + 10; Q.sh.intent.aimY = Q.cy; press(Q); step(Q.m, 60); return Q; };
  let Q = mk(null, D.dist + 2);
  T.check('âm: thợ lặn ngoài ' + D.dist + ' m (11 m) không bị trúng', near(Q.d[0].x - Q.cx, D.dist + 2, 1e-9) && !SIM.effect(Q.d[0], 'stun'));
  Q = mk((a) => SIM.addEffect(a, 'grabImmune', 9, 1, -1));
  T.check('âm: grabImmune (Máy Đẩy) không bị kéo, không choáng', near(Q.d[0].x - Q.cx, 5, 1e-9) && !SIM.effect(Q.d[0], 'stun'));
  Q = mk((a) => immune(a));
  T.check('âm: miễn sát thương mới sinh không bị kéo', near(Q.d[0].x - Q.cx, 5, 1e-9));
  Q = mk((a, q) => SIM.addZone(q.m, { kind: 'cage', x: a.x, y: a.y, r: 1.5, dur: 9, team: 'diver' }));
  T.check('âm: thợ lặn trong lồng thép không bị kéo', near(Q.d[0].x - Q.cx, 5, 1e-9));
  Q = mk(null, 2);
  T.check('thợ lặn gần (2 m): kéo không xuyên qua cá mập, dừng cách ≥ r cá + r người', Q.d[0].x - Q.cx >= Q.sh.r + Q.d[0].r + 0.2 - 1e-6 && ev(Q.m, 'jaw').length === 1, Q.d[0].x - Q.cx);
  const B = rig(id); put(B.d[0], B.cx + 6, B.cy, 0); B.d[0].light = true; SIM.updateVision(B.m, true);
  const bb = SIM.skillBot(B.m, B.sh);
  T.check('bot ngắm trúng thợ lặn thấy được cách 6 m', !!bb && bb !== true && near(bb.x, B.cx + 6, 0.5) && near(bb.y, B.cy, 0.5), JSON.stringify(bb));
  put(B.d[0], B.cx + 12, B.cy, 0); SIM.updateVision(B.m, true);
  T.check('âm: 12 m (ngoài tầm hàm) thì bot không dùng', SIM.skillBot(B.m, B.sh) === null);
}

console.log('Hút Nước');
{
  const id = 'hut-nuoc', D = SD[id], R = rig(id), m = R.m, sh = R.sh, cx = R.cx, cy = R.cy, d = R.d;
  const polar = (deg, r) => [cx + Math.cos(deg * Math.PI / 180) * r, cy + Math.sin(deg * Math.PI / 180) * r];
  const carry = (a, i) => { const lt = m.loot[i]; lt.st = 'carried'; lt.by = a.id; a.carry.push(i); a.carryKg += lt.kg; };
  const p = [polar(0, 5), polar(D.arc / 2 + 12, 5), polar(0, D.range + 2), polar(10, 5), polar(-10, 5)];
  d.forEach((a, i) => put(a, p[i][0], p[i][1], 0));
  put(R.other, cx - 14, cy - 12, 0);
  carry(d[0], 0); carry(d[1], 1); carry(d[2], 2); carry(d[3], 3);
  SIM.addEffect(d[3], 'ccImmune', 20, 1, -1);
  const lt0 = m.loot[0];
  press(R);
  T.check('bấm: thợ lặn trong nón ' + D.arc + '° bị giật kho báu rơi (loot nằm lại, st rest)', d[0].carry.length === 0 && lt0.st === 'rest' && near(lt0.x, p[0][0], 0.8), d[0].carry.length);
  T.check('âm: ngoài nón (' + (D.arc / 2 + 12) + '° lệch), ngoài tầm (' + (D.range + 2) + ' m), ccImmune thì vẫn giữ kho báu', d[1].carry.length === 1 && d[2].carry.length === 1 && d[3].carry.length === 1);
  step(m, secs(0.5) - 1);
  const pulled = p[0][0] - d[0].x;
  T.check('hút ' + D.pullSpeed + ' m/s: 0,5 s kéo ' + (D.pullSpeed * 0.5).toFixed(2) + ' m (±0,1)', near(pulled, D.pullSpeed * 0.5, 0.1), pulled.toFixed(3));
  T.check('không nhặt lại kho báu vừa rơi dưới chân trong lúc hút', d[0].carry.length === 0 && lt0.st === 'rest');
  T.check('âm: người ngoài nón và ngoài tầm không bị kéo', near(d[1].x, p[1][0], 1e-9) && near(d[2].x, p[2][0], 1e-9) && near(d[3].x, p[3][0], 1e-9));
  T.check('sự kiện suck và suck-pull có mặt', ev(m, 'suck').length === 1 && near(ev(m, 'suck')[0].range, D.range, 1e-9) && ev(m, 'suck-pull').length === 1 && ev(m, 'suck-pull')[0].target === 0, ev(m, 'suck-pull').length);
  step(m, secs(D.dur));
  const gap = Math.hypot(sh.x - d[0].x, sh.y - d[0].y);
  T.check('hết giờ hút: thợ lặn bị kéo sát miệng, không xuyên qua cá mập (cách ≈ r cá + r người + 0,2 = ' + (sh.r + d[0].r + 0.2).toFixed(2) + ')', near(gap, sh.r + d[0].r + 0.2, 0.05), gap.toFixed(3));
  const Q = rig(id); put(Q.d[0], Q.cx + 5, Q.cy, 0); immune(Q.d[0]);
  const l = Q.m.loot[0]; l.st = 'carried'; l.by = 0; Q.d[0].carry.push(0); Q.d[0].carryKg = l.kg; press(Q); step(Q.m, 20);
  T.check('âm: thợ lặn miễn sát thương mới sinh không bị hút, không rơi đồ', Q.d[0].carry.length === 1 && near(Q.d[0].x - Q.cx, 5, 1e-9));
  const Q2 = rig(id); put(Q2.d[0], Q2.cx + 5, Q2.cy, 0); SIM.addEffect(Q2.d[0], 'grabImmune', 9, 1, -1);
  const l2 = Q2.m.loot[0]; l2.st = 'carried'; l2.by = 0; Q2.d[0].carry.push(0); Q2.d[0].carryKg = l2.kg; press(Q2); step(Q2.m, 20);
  T.check('âm: grabImmune (Máy Đẩy) không bị hút, không rơi đồ', Q2.d[0].carry.length === 1 && near(Q2.d[0].x - Q2.cx, 5, 1e-9));
  const B = rig(id); put(B.d[0], B.cx + 5, B.cy, 0); B.d[0].light = true; SIM.updateVision(B.m, true);
  T.check('bot hút khi thợ lặn thấy được cách 5 m trước mũi', SIM.skillBot(B.m, B.sh) === true);
  put(B.d[0], B.cx + 5, B.cy + 5, 0); SIM.updateVision(B.m, true);
  T.check('âm: thợ lặn lệch khỏi nón thì bot không dùng', SIM.skillBot(B.m, B.sh) === null);
}

console.log('Khung: kỹ năng không dùng được khi choáng hoặc đang hồi');
{
  const R = rig('quat-duoi'), sh = R.sh; put(R.d[0], R.cx + 3, R.cy, 0);
  press(R);
  const o = SIM.effect(R.d[0], 'stun'); SIM.removeEffects(R.d[0], 'stun'); SIM.removeEffects(R.d[0], 'ccImmune');
  press(R);
  T.check('đang hồi chiêu: bấm lần hai không quất thêm', !!o && ev(R.m, 'tail').length === 1 && sh.skill.cd > 0);
  const Q = rig('quat-duoi'); put(Q.d[0], Q.cx + 3, Q.cy, 0); SIM.addEffect(Q.sh, 'stun', 5, 1, -1); press(Q);
  T.check('âm: cá mập đang choáng bấm không có tác dụng', ev(Q.m, 'tail').length === 0 && SIM.effect(Q.d[0], 'stun') === null);
}

console.log('Bot đấu bot: mỗi kỹ năng chạy cả trận');
for (const id of IDS) {
  let err = null, nan = 0, rock = 0, uses = 0, steps = 0, m = null;
  try {
    const lineup = D4.map((dd, i) => ({ team: 'diver', defId: dd, name: 'T' + i, ctrl: 'bot' }))
      .concat([0, 1].map((i) => ({ team: 'shark', defId: SHARK_OF[id], name: 'C' + i, ctrl: 'bot' })));
    m = SIM.createMatch({ seed: 7, mapId: 'A01', lineup });
    for (const a of m.actors) if (a.team === 'shark') a.skill.id = id;
    const limit = 60 * (TU.match.length + TU.match.intro + 20);
    while (m.phase !== 'end' && steps < limit) {
      SIM.step(m, DT); steps++;
      for (const a of m.actors) {
        if (a.st === 'out') continue;
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.vx) || !Number.isFinite(a.vy) || !Number.isFinite(a.r) || !(a.team === 'diver' ? Number.isFinite(a.o2) : Number.isFinite(a.hp))) nan++;
        else if (m.world.solid(a.x, a.y)) rock++;
      }
      uses += m.events.filter((e) => e.type === 'skill' && e.skill === id).length;
      m.events.length = 0;
    }
  } catch (e) { err = e.stack || String(e); }
  T.check(id + ': trận bot cả hai cá mập tới hết (' + steps + ' bước), không lỗi, không NaN, không ai trong đá, bot dùng kỹ năng ' + uses + ' lần',
    !err && m.phase === 'end' && nan === 0 && rock === 0 && uses >= 1, err ? err.split('\n').slice(0, 3).join(' | ') : 'nan ' + nan + ', đá ' + rock);
}

T.done();
