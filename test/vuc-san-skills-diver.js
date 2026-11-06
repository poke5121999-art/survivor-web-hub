/*
 * Vực Săn: 9 kỹ năng thợ lặn (phao-sang, bom-muc, long-thep, sung-luoi, min-cam-bien, may-o2, phi-tieu-me, ong-ngam, may-day), Node thuần.
 * Mỗi phép thử dựng trận "human" (không bot nghĩ), đặt người vào chỗ thoáng nhất của A01, bấm kỹ năng bằng intent.skill + aim rồi sim.step.
 * Số mong đợi tính tay từ SKILL_DATA / TUNING; phần cuối cho bot đấu bot với từng kỹ năng gán cho cả 4 thợ lặn.
 * Chạy: node test/vuc-san-skills-diver.js
 */
'use strict';
const T = require('./vuc-san-lib');
const W = T.nodeSim(T.SIM_FILES);
const VS = W.VS, SIM = VS.sim, DT = 1 / 60;
const SD = VS.SKILL_DATA;

const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
const D4 = ['dave', 'hai', 'lan', 'bao'], S2 = ['Blacktip_Reefshark', 'Tiger_Shark'];
const lineup = (ctrl) => D4.map((id, i) => ({ team: 'diver', defId: id, name: 'T' + i, ctrl })).concat(S2.map((id, i) => ({ team: 'shark', defId: id, name: 'C' + i, ctrl })));
function step(m, n) { for (let i = 0; i < n; i++) SIM.step(m, DT); return m; }
function rig(seed) {
  const m = SIM.createMatch({ seed: seed || 1, mapId: 'A01', lineup: lineup('human') });
  step(m, 240);
  m.actors.forEach((a) => SIM.removeEffects(a, 'spawnImmune'));
  return m;
}
function put(a, x, y, ang) { a.x = x; a.y = y; a.vx = 0; a.vy = 0; if (ang !== undefined) { a.ang = ang; a.intent.aimX = x + Math.cos(ang); a.intent.aimY = y + Math.sin(ang); } }
function aimAt(a, x, y) { a.intent.aimX = x; a.intent.aimY = y; }
const ev = (m, type) => m.events.filter((e) => e.type === type);
const speedOf = (a) => Math.hypot(a.vx, a.vy);
function stepUntil(m, pred, max) { for (let i = 0; i < max; i++) { if (pred()) return i; SIM.step(m, DT); } return pred() ? max : -1; }
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
const ARENA = findArena(rig());

// Dựng cảnh: d = thợ lặn 0 mang kỹ năng id, đèn tắt, đặt ở (ax + dx, ay + dy) hướng ang; hai cá mập đứng im và bị choáng đè (muốn dùng thì gỡ stun).
function scene(id, dx, dy, ang) {
  const m = rig(), d = m.actors[0], s = m.actors[4], s2 = m.actors[5];
  d.skill = { id, cd: 0, t: 0, charges: SD[id].charges || 0 };
  d.light = false;
  put(d, ARENA.x + (dx || 0), ARENA.y + (dy || 0), ang || 0);
  m.actors.slice(1, 4).forEach((o) => { put(o, ARENA.x + 40, ARENA.y + 40, 0); });
  [s, s2].forEach((x, i) => { put(x, ARENA.x + 50, ARENA.y + 50 + i * 5, Math.PI); SIM.addEffect(x, 'stun', 9999, 1, -1); });
  return { m, d, s, s2 };
}
const wake = (s) => { SIM.removeEffects(s, 'stun'); step(s.m, 1); SIM.removeEffects(s, 'ccImmune'); };
const press = (m, a) => { a.intent.skill = true; step(m, 1); };

console.log('Tiền đề');
T.check('chỗ thoáng nhất của A01 rộng >= 12 m', ARENA && ARENA.c >= 12, JSON.stringify(ARENA));
const IDS = ['phao-sang', 'bom-muc', 'long-thep', 'sung-luoi', 'min-cam-bien', 'may-o2', 'phi-tieu-me', 'ong-ngam', 'may-day'];
T.check('9 kỹ năng đều có start và bot; số ghim: phao 18/8/10/9/0.2, mực 20/6/3.5, lồng 26/6/2.2/2, lưới 14/12/10/0.6/3, mìn 16/2/2.5/60/1.5/40, máy O2 24/8/4/6/2, tiêu 20/16/12/3/10, ống 16/4/2/1.5/70, đẩy 22/4/1.9',
  IDS.every((id) => typeof VS.SKILLS[id].start === 'function' && typeof VS.SKILLS[id].bot === 'function') && [
    [SD['phao-sang'], [18, 8, 10, 9, 0.2], ['cd', 'dur', 'r', 'range', 'slow']], [SD['bom-muc'], [20, 6, 3.5], ['cd', 'dur', 'r']],
    [SD['long-thep'], [26, 6, 2.2, 2], ['cd', 'dur', 'r', 'o2Regen']], [SD['sung-luoi'], [14, 12, 10, 0.6, 3], ['cd', 'speed', 'range', 'slow', 'dur']],
    [SD['min-cam-bien'], [16, 2, 2.5, 60, 1.5, 40], ['cd', 'charges', 'r', 'dmg', 'stun', 'life']], [SD['may-o2'], [24, 8, 4, 6, 2], ['cd', 'dur', 'r', 'o2Regen', 'reviveMul']],
    [SD['phi-tieu-me'], [20, 16, 12, 3, 10], ['cd', 'speed', 'range', 'sleep', 'reveal']], [SD['ong-ngam'], [16, 4, 2, 1.5, 70], ['cd', 'window', 'rangeMul', 'beamMul', 'dmg']],
    [SD['may-day'], [22, 4, 1.9], ['cd', 'dur', 'speedMul']]
  ].every(([o, vals, keys]) => keys.every((k, i) => o[k] === vals[i])));

// ---------------------------------------------------------------------------------------------------------------------
console.log('phao-sang: vùng sáng 10 m, 8 s, cá mập trong đó chậm 20%');
{
  const { m, d, s } = scene('phao-sang', -4.5, 0, 0);
  const F = { x: ARENA.x + 4.5, y: ARENA.y };
  aimAt(d, ARENA.x + 100, ARENA.y);   // ngắm xa hơn tầm: bị clamp ở 9 m
  const lit = (x, y) => SIM.visibleTo(m, 'diver', x, y);
  const px = (k) => [F.x - k, F.y];
  press(m, d);
  const z = m.zones.find((q) => q.kind === 'flare');
  T.check('pháo sáng đáp đúng 9 m (clamp tầm), bán kính 10, sống 8 s, sự kiện flare', z && near(z.x, F.x, 0.01) && near(z.y, F.y, 0.01) && z.r === 10 && near(z.until - m.t, 8, 1e-6) && ev(m, 'flare').length === 1 && ev(m, 'skill')[0].skill === 'phao-sang', z && z.x);
  put(d, ARENA.x, ARENA.y + 10, 0);   // dời người ném đi để quầng sáng của chính họ không lẫn vào phép đo
  step(m, 20);
  T.check('cách pháo 9.5 m (điểm trong vùng 10 m, thẳng tầm nhìn) sáng; cách 10.5 m thì không', lit(...px(9.5)) === true && lit(...px(10.5)) === false);
  T.check('trước khi thả, cùng điểm 9.5 m là tối (phép đo có phân biệt)', (() => { const q = scene('phao-sang', 0, 10, 0).m; return SIM.visibleTo(q, 'diver', ...px(9.5)) === false; })());
  put(s, F.x + 3, F.y, Math.PI); wake(s); step(m, 10);
  T.check('cá mập trong vùng sáng (cách pháo 3 m): slow 0.2, a.mod.slow = 0.2', near(SIM.effect(s, 'slow') && SIM.effect(s, 'slow').mag, 0.2, 1e-9) && near(s.mod.slow, 0.2, 1e-9));
  put(s, F.x + 11, F.y, Math.PI); SIM.removeEffects(s, 'slow'); s.slowImmuneUntil = -1e9; step(m, 10);
  T.check('cá mập ngoài vùng sáng (11 m): không chậm', SIM.effect(s, 'slow') === null);
  step(m, 480);
  T.check('hết 8 s: zone biến mất, điểm 9.5 m tối lại', !m.zones.some((q) => q.kind === 'flare') && lit(...px(9.5)) === false);
  const q = scene('phao-sang', -4.5, 0, 0); aimAt(q.d, ARENA.x + 100, ARENA.y);
  q.d.skill.id = 'phao-sang'; const wallY = ARENA.y;
  T.check('bot: không thấy cá mập mà phía trước tối thì ném về trước (điểm trong tầm 9 m); thấy cá mập trong tầm thì ném vào nó',
    (() => { const r = VS.SKILLS['phao-sang'].bot(q.m, q.d); return r && Math.hypot(r.x - q.d.x, r.y - q.d.y) <= 9 && near(r.y, wallY, 0.01); })() &&
    (() => { q.d.light = true; wake(q.s); put(q.s, q.d.x + 6, q.d.y, 0); step(q.m, 10); const r = VS.SKILLS['phao-sang'].bot(q.m, q.d); return r && near(r.x, q.s.x, 0.01); })());
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('bom-muc: đám mực 3.5 m trong 6 s, cá mập bên trong mù hẳn');
{
  const base = () => scene('bom-muc', -1, 0, 0);
  const c = base(); wake(c.s); put(c.s, ARENA.x + 1, ARENA.y, Math.PI); step(c.m, 10);
  T.check('đối chứng (chưa có mực): cá mập cách thợ lặn 2 m thấy được, sharkSees true', SIM.sharkSees(c.m, c.s, c.d) === true && SIM.canSee(c.m, 'shark', c.d) === true);
  const { m, d, s } = base();
  wake(s); put(s, ARENA.x + 1, ARENA.y, Math.PI);
  press(m, d); step(m, 15);
  const z = m.zones.find((q) => q.kind === 'ink');
  T.check('bom mực: zone ink tại chỗ thợ lặn, r 3.5, sống 6 s, sự kiện ink', z && z.x === d.x && z.y === d.y && z.r === 3.5 && near(z.until - m.t, 6 - 15 * DT, 1e-6) && ev(m, 'ink').length === 1);
  T.check('cá mập trong đám mực, cách thợ lặn 2 m: bị blind, sharkSees false, canSee false', SIM.effect(s, 'blind') !== null && SIM.sharkSees(m, s, d) === false && SIM.canSee(m, 'shark', d) === false);
  put(s, ARENA.x + 4, ARENA.y, Math.PI); step(m, 15);
  T.check('cá mập ngoài đám mực (cách 5 m) nhìn vào cũng không thấy: tia bị mực chặn', SIM.sharkSees(m, s, d) === false);
  put(s, ARENA.x + 0.2, ARENA.y, Math.PI); step(m, 15);
  T.check('chạm sát người (cách 0.8 m < r cá + r người = 1.2) thì vẫn thấy: mù không phải nhắm mắt', SIM.sharkSees(m, s, d) === true);
  put(s, ARENA.x + 1, ARENA.y, Math.PI);
  step(m, 6 * 60);
  T.check('hết 6 s: đám mực mất, hết blind (sau 0.2 s), cá mập thấy lại thợ lặn 2 m', !m.zones.some((q) => q.kind === 'ink') && SIM.effect(s, 'blind') === null && SIM.sharkSees(m, s, d) === true);
  const b = base(); b.d.light = true; wake(b.s); put(b.s, b.d.x + 5, b.d.y, Math.PI); step(b.m, 10);
  T.check('bot: cá mập thấy được ở 5 m thì chưa phun (null); 4 m thì phun (true)', VS.SKILLS['bom-muc'].bot(b.m, b.d) === null && (put(b.s, b.d.x + 4, b.d.y, Math.PI), step(b.m, 10), VS.SKILLS['bom-muc'].bot(b.m, b.d) === true));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('long-thep: lồng 2.2 m, 6 s, cá mập không vào, không cắn, người trong hồi 2 O2/s');
{
  const { m, d, s } = scene('long-thep', 0, 0, 0);
  const o = m.actors[1];
  put(o, ARENA.x + 1.5, ARENA.y + 0.5, 0); o.o2 = 50;
  const out = m.actors[2]; put(out, ARENA.x - 3, ARENA.y, 0); out.o2 = 50;
  d.o2 = 50;
  press(m, d);
  const z = m.zones.find((q) => q.kind === 'cage');
  T.check('lồng: zone cage tại chỗ, r 2.2, sống 6 s, sự kiện cage', z && z.x === d.x && z.r === 2.2 && near(z.until - m.t, 6, 1e-6) && ev(m, 'cage').length === 1);
  step(m, 119);
  T.check('2 s sau: người trong lồng (thợ lặn và đồng đội) hồi (2 - 0.6) × 2 = +2.8 O2 (50 → 52.8); người ngoài 3 m mất 0.6 × 2 = 1.2 (→ 48.8)',
    near(d.o2, 52.8, 0.05) && near(o.o2, 52.8, 0.05) && near(out.o2, 48.8, 0.05), [d.o2, o.o2, out.o2].map((v) => v.toFixed(2)).join('/'));
  // cá mập lao từ 8 m vào tâm lồng
  wake(s); put(s, ARENA.x + 8, ARENA.y, Math.PI); s.intent.mx = -1; s.intent.my = 0; s.intent.boost = true;
  let minD = 1e9;
  for (let i = 0; i < 120; i++) { s.intent.fire = true; SIM.step(m, DT); minD = Math.min(minD, Math.hypot(s.x - ARENA.x, s.y - ARENA.y)); }
  T.check('cá mập húc vào lồng 2 s: tâm không bao giờ vào gần hơn 2.2 + r cá (0.9) = 3.1 m', minD >= 3.1 - 0.02, 'gần nhất ' + minD.toFixed(3));
  T.check('không một cú cắn nào trúng người trong lồng, không ai bị ngậm', ev(m, 'bite').length === 0 && d.st === 'swim' && o.st === 'swim');
  // đối chứng: cùng thế trận không lồng thì cắn trúng
  const c = scene('binh-o2', 0, 0, 0); put(c.m.actors[1], ARENA.x + 1.5, ARENA.y, 0);
  wake(c.s); put(c.s, ARENA.x + 3.1, ARENA.y, Math.PI); c.s.intent.mx = -1;
  for (let i = 0; i < 60; i++) { c.s.intent.fire = true; SIM.step(c.m, DT); }
  T.check('đối chứng không lồng: cùng cú lao, cá mập cắn trúng (có sự kiện bite)', ev(c.m, 'bite').length >= 1);
  // hết giờ thì vào được
  step(m, 6 * 60);
  minD = 1e9; put(s, ARENA.x + 8, ARENA.y, Math.PI);
  for (let i = 0; i < 180; i++) { s.intent.fire = true; SIM.step(m, DT); minD = Math.min(minD, Math.hypot(s.x - ARENA.x, s.y - ARENA.y)); }
  T.check('hết 6 s: lồng biến mất và cá mập vào sát tâm (< 2.2 m)', !m.zones.some((q) => q.kind === 'cage') && minD < 2.2, 'gần nhất ' + minD.toFixed(3));
  const b = scene('long-thep', 0, 0, 0); put(b.m.actors[1], b.d.x + 1, b.d.y, 0); SIM.setState(b.m, b.m.actors[1], 'down');
  T.check('bot: đồng đội gục cạnh (1 m) thì thả lồng; không ai gục và không cá mập thì không', VS.SKILLS['long-thep'].bot(b.m, b.d) === true && (SIM.setState(b.m, b.m.actors[1], 'swim'), VS.SKILLS['long-thep'].bot(b.m, b.d) === null));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('sung-luoi: lưới bay 12 m/s tới 10 m, trúng thì chậm 60% và không lao 3 s');
{
  const { m, d, s } = scene('sung-luoi', -5, 0, 0);
  wake(s); put(s, ARENA.x + 3, ARENA.y, Math.PI);   // cách 8 m
  aimAt(d, s.x, s.y);
  press(m, d);
  const p = m.projs.find((q) => q.kind === 'net');
  T.check('bấm: có đạn kind net bay 12 m/s về phía cá mập, sống 10/12 s, không gây sát thương, sự kiện net', p && near(p.vx, 12, 1e-9) && near(p.vy, 0, 1e-9) && near(p.life, 10 / 12, 0.02) && !(p.dmg > 0) && ev(m, 'net').length === 1);
  const hp0 = s.hp;
  stepUntil(m, () => ev(m, 'netHit').length > 0, 120);
  const tHit = m.t; step(m, 2);
  const sl = SIM.effect(s, 'slow'), nd = SIM.effect(s, 'noDash');
  T.check('trúng lưới sau khoảng 8/12 s: sự kiện netHit, slow 0.6 và noDash còn tới tHit + 3 s, máu không đổi', ev(m, 'netHit').length === 1 && tHit > 0.5 && tHit < 1.0 && sl && sl.mag === 0.6 && near(sl.until - tHit, 3, 0.02) && nd && near(nd.until - tHit, 3, 0.02) && s.hp === hp0, 'tHit ' + tHit.toFixed(3));
  T.check('lưới biến mất sau khi trúng (không xuyên)', !m.projs.some((q) => q.kind === 'net'));
  s.intent.mx = 1; s.intent.boost = true;
  let lunged = false;
  for (let i = 0; i < 150; i++) { s.intent.fire = true; SIM.step(m, DT); if (s.st === 'lunge') lunged = true; }
  T.check('trong 3 s: bấm lao liên tục vẫn không lao (st không bao giờ là lunge) và tốc độ ≈ 4.2 × 0.4 = 1.68', !lunged && s.st === 'swim' && near(speedOf(s), 4.2 * 0.4, 0.1), speedOf(s));
  step(m, 40);
  s.intent.fire = true; step(m, 2);
  T.check('qua 3 s: hết noDash và hết slow, lao được lại', SIM.effect(s, 'noDash') === null && SIM.effect(s, 'slow') === null && s.st === 'lunge');
  const f = scene('sung-luoi', -5, 0, 0); wake(f.s); put(f.s, ARENA.x + 7, ARENA.y, Math.PI); aimAt(f.d, f.s.x, f.s.y);   // cách 12 m: ngoài tầm 10 m
  press(f.m, f.d); step(f.m, 90);
  T.check('đối chứng ngoài tầm (12 m > 10 m): lưới rơi, không có netHit, cá mập không chậm', ev(f.m, 'netHit').length === 0 && SIM.effect(f.s, 'slow') === null && !f.m.projs.some((q) => q.kind === 'net'));
  const b = scene('sung-luoi', -5, 0, 0); b.d.light = true; wake(b.s); put(b.s, ARENA.x + 3, ARENA.y, Math.PI); step(b.m, 10);
  const r = VS.SKILLS['sung-luoi'].bot(b.m, b.d);
  T.check('bot: cá mập thấy ở 8 m thì ngắm vào nó ({x,y}); cá mập ở 15 m thì null', r && near(r.x, b.s.x, 0.5) && near(r.y, b.s.y, 0.5) && (put(b.s, ARENA.x + 10, ARENA.y, Math.PI), step(b.m, 10), VS.SKILLS['sung-luoi'].bot(b.m, b.d) === null));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('min-cam-bien: mìn nổ trong 2.5 m, -60 máu, choáng 1.5 s, tối đa 2 quả, sống 40 s');
{
  const { m, d, s, s2 } = scene('min-cam-bien', -3, 0, 0);
  T.check('khởi tạo: 2 mìn trong kho', d.skill.charges === 2);
  press(m, d);
  const z = m.zones.find((q) => q.kind === 'mine');
  T.check('đặt mìn: zone mine tại chỗ, r 2.5, sống 40 s, kho còn 1, sự kiện mine', z && z.x === d.x && z.r === 2.5 && near(z.until - m.t, 40, 1e-6) && d.skill.charges === 1 && ev(m, 'mine').length === 1);
  // cá mập ở 3.5 m (ngoài tầm nổ) đứng im: không nổ
  wake(s); put(s, d.x + 3.5, d.y, Math.PI); step(m, 60);
  T.check('cá mập ở 3.5 m (> 2.5 m) không làm mìn nổ: không boom, máu 320', ev(m, 'boom').length === 0 && s.hp === 320 && m.zones.some((q) => q.kind === 'mine'));
  s.intent.mx = -1; s.intent.my = 0;
  stepUntil(m, () => ev(m, 'boom').length > 0, 120);
  const tB = m.t;
  T.check('cá mập bơi vào trong 2.5 m: mìn nổ (boom), máu 320 → 260, mìn biến mất, kho hoàn lại 2', ev(m, 'boom').length === 1 && near(s.hp, 260, 0.01) && ev(m, 'boom')[0].dmg === 60 && !m.zones.some((q) => q.kind === 'mine') && d.skill.charges === 2, 'hp ' + s.hp);
  const st = SIM.effect(s, 'stun');
  step(m, 1);
  T.check('choáng 1.5 s: hiệu ứng stun hết hạn tại tBoom + 1.5, cá mập ở trạng thái stun', st && near(st.until - tB, 1.5, 0.02) && s.st === 'stun', st && (st.until - tB) + ' ' + s.st);
  step(m, 95);
  T.check('1.5 s sau: hết choáng, bơi lại', SIM.effect(s, 'stun') === null && s.st === 'swim');
  // tối đa 2 quả cùng lúc
  const c = scene('min-cam-bien', -3, 0, 0);
  press(c.m, c.d); step(c.m, 16 * 60);
  put(c.d, ARENA.x + 3, ARENA.y + 3, 0); press(c.m, c.d);
  T.check('đặt quả thứ hai sau 16 s hồi: có 2 zone mine, kho 0, đã ghi 2 sự kiện mine', c.m.zones.filter((q) => q.kind === 'mine').length === 2 && c.d.skill.charges === 0 && ev(c.m, 'mine').length === 2);
  step(c.m, 16 * 60);
  put(c.d, ARENA.x - 3, ARENA.y + 3, 0); press(c.m, c.d);
  T.check('quả thứ ba bị từ chối (đã đủ 2): vẫn 2 zone mine, không tốn hồi chiêu (cd 0), 2 sự kiện mine', c.m.zones.filter((q) => q.kind === 'mine').length === 2 && c.d.skill.cd === 0 && ev(c.m, 'mine').length === 2);
  T.check('bot: hết mìn thì không hỏi dùng (null) dù cá mập đang ở sát', (() => { wake(c.s); put(c.s, c.d.x + 3, c.d.y, Math.PI); c.d.light = true; step(c.m, 10); return VS.SKILLS['min-cam-bien'].bot(c.m, c.d) === null; })());
  // hết 40 s: mìn tự tan, trả mìn, cá mập vào không nổ
  const e = scene('min-cam-bien', -3, 0, 0); press(e.m, e.d); step(e.m, 40 * 60);
  wake(e.s); put(e.s, e.d.x + 1, e.d.y, Math.PI); step(e.m, 30);
  T.check('qua 40 s: mìn tan, kho lại 2, cá mập đứng sát chỗ cũ không nổ (không boom, máu 320)', !e.m.zones.some((q) => q.kind === 'mine') && e.d.skill.charges === 2 && ev(e.m, 'boom').length === 0 && e.s.hp === 320);
  const b = scene('min-cam-bien', -3, 0, 0); b.d.light = true; wake(b.s); put(b.s, b.d.x + 6, b.d.y, Math.PI); step(b.m, 10);
  T.check('bot: cá mập thấy ở 6 m thì đặt mìn (true); ở 12 m thì null', VS.SKILLS['min-cam-bien'].bot(b.m, b.d) === true && (put(b.s, b.d.x + 12, b.d.y, Math.PI), step(b.m, 10), VS.SKILLS['min-cam-bien'].bot(b.m, b.d) === null));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('may-o2: 4 m, 8 s, hồi 6 O2/s, cứu nhanh gấp đôi');
{
  const { m, d } = scene('may-o2', 0, 0, 0);
  const near1 = m.actors[1], far = m.actors[2];
  put(near1, ARENA.x + 3, ARENA.y, 0); put(far, ARENA.x + 5, ARENA.y, 0); near1.o2 = 50; far.o2 = 50; d.o2 = 50;
  press(m, d);
  const z = m.zones.find((q) => q.kind === 'o2gen');
  T.check('máy: zone o2gen tại chỗ, r 4, sống 8 s, reviveMul 2, sự kiện o2gen', z && z.r === 4 && z.reviveMul === 2 && near(z.until - m.t, 8, 1e-6) && ev(m, 'o2gen').length === 1);
  step(m, 119);
  T.check('2 s sau: người trong 4 m (cả mình) hồi (6 - 0.6) × 2 = +10.8 (50 → 60.8); người ở 5 m mất 1.2 (→ 48.8)', near(d.o2, 60.8, 0.05) && near(near1.o2, 60.8, 0.05) && near(far.o2, 48.8, 0.05), [d.o2, near1.o2, far.o2].map((v) => v.toFixed(2)).join('/'));
  // đo thời gian cứu
  const revive = (withMachine, downAt) => {
    const q = scene('may-o2', 0, 0, 0), mate = q.m.actors[1];
    if (withMachine) press(q.m, q.d);
    put(mate, ARENA.x + downAt.x, ARENA.y, 0);
    if (downAt.reviver) put(q.d, ARENA.x + downAt.reviver, ARENA.y, 0);
    SIM.setState(q.m, mate, 'down');
    const n = stepUntil(q.m, () => mate.st === 'swim', 400);
    return { n, mate, q };
  };
  const base = revive(false, { x: 1 }), fast = revive(true, { x: 1 }), outR = revive(true, { x: 6.5, reviver: 5.5 });
  T.check('cứu không máy: đúng reviveT 2 s = 120 bước (±2)', Math.abs(base.n - 120) <= 2, base.n);
  T.check('cứu trong 4 m của máy: nhanh gấp đôi = 60 bước (±2)', Math.abs(fast.n - 60) <= 2, fast.n);
  T.check('nạn nhân cách máy 6.5 m (ngoài 4 m): lại 120 bước (±2)', Math.abs(outR.n - 120) <= 2, outR.n);
  const late = scene('may-o2', 0, 0, 0); press(late.m, late.d); step(late.m, 9 * 60);
  const mate = late.m.actors[1]; put(mate, ARENA.x + 1, ARENA.y, 0); SIM.setState(late.m, mate, 'down');
  const nLate = stepUntil(late.m, () => mate.st === 'swim', 400);
  T.check('hết 8 s: máy tan, cứu lại 120 bước (±2)', !late.m.zones.some((q) => q.kind === 'o2gen') && Math.abs(nLate - 120) <= 2, nLate);
  const b = scene('may-o2', 0, 0, 0); put(b.m.actors[1], b.d.x + 1, b.d.y, 0); SIM.setState(b.m, b.m.actors[1], 'down');
  T.check('bot: đồng đội gục cạnh thì đặt máy; mọi người đủ O2 thì null', VS.SKILLS['may-o2'].bot(b.m, b.d) === true && (SIM.setState(b.m, b.m.actors[1], 'swim'), b.m.actors[1].o2 = 100, VS.SKILLS['may-o2'].bot(b.m, b.d) === null));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('phi-tieu-me: ngủ 3 s, tỉnh khi trúng xiên, lộ 10 s');
{
  const { m, d, s } = scene('phi-tieu-me', -6, 0, 0);
  wake(s); put(s, ARENA.x + 2, ARENA.y, Math.PI);   // cách 8 m
  aimAt(d, s.x, s.y);
  T.check('tiền đề: cá mập ở chỗ tối thì đội thợ lặn chưa thấy', SIM.canSee(m, 'diver', s) === false);
  press(m, d);
  const p = m.projs.find((q) => q.kind === 'dart');
  T.check('bấm: đạn kind dart 16 m/s, sống 12/16 s, sự kiện dart', p && near(p.vx, 16, 1e-9) && near(p.life, 12 / 16, 0.02) && ev(m, 'dart').length === 1);
  stepUntil(m, () => ev(m, 'dartHit').length > 0, 120);
  const tHit = m.t; step(m, 2);
  const sl = SIM.effect(s, 'sleep'), rv = SIM.effect(s, 'reveal');
  T.check('trúng sau ≈ 8/16 s: dartHit, ngủ tới tHit + 3 s, cá mập ở trạng thái stun', ev(m, 'dartHit').length === 1 && tHit > 0.4 && tHit < 0.7 && sl && near(sl.until - tHit, 3, 0.02) && s.st === 'stun', tHit.toFixed(3));
  T.check('bị lộ tới tHit + 10 s: đội thợ lặn thấy dù ở chỗ tối (canSee true)', rv && near(rv.until - tHit, 10, 0.02) && SIM.canSee(m, 'diver', s) === true);
  // xiên trúng thì tỉnh ngay (vẫn còn ~2.5 s ngủ)
  d.intent.fire = true; aimAt(d, s.x, s.y); step(m, 1);
  stepUntil(m, () => s.hp < 320, 120); step(m, 2);
  T.check('xiên trúng khi đang ngủ: -24 máu (320 → 296), hết sleep, tỉnh ngay (st swim) khi còn dưới 3 s', near(s.hp, 296, 0.01) && SIM.effect(s, 'sleep') === null && s.st === 'swim' && m.t - tHit < 3, 'hp ' + s.hp + ' ' + s.st);
  T.check('vẫn bị lộ sau khi tỉnh (reveal độc lập với ngủ)', SIM.canSee(m, 'diver', s) === true);
  step(m, 10 * 60);
  T.check('qua 10 s kể từ lúc trúng: không còn reveal, ở chỗ tối lại không bị thấy', SIM.effect(s, 'reveal') === null && SIM.canSee(m, 'diver', s) === false);
  const f = scene('phi-tieu-me', -6, 0, 0); wake(f.s); put(f.s, ARENA.x + 8, ARENA.y, Math.PI); aimAt(f.d, f.s.x, f.s.y);   // cách 14 m > 12 m
  press(f.m, f.d); step(f.m, 90);
  T.check('đối chứng ngoài tầm (14 m > 12 m): không trúng, cá mập không ngủ, không bị lộ', ev(f.m, 'dartHit').length === 0 && SIM.effect(f.s, 'sleep') === null && SIM.effect(f.s, 'reveal') === null && !f.m.projs.some((q) => q.kind === 'dart'));
  const b = scene('phi-tieu-me', -6, 0, 0); b.d.light = true; wake(b.s); put(b.s, ARENA.x + 2, ARENA.y, Math.PI); step(b.m, 10);
  const r = VS.SKILLS['phi-tieu-me'].bot(b.m, b.d);
  T.check('bot: cá mập thấy ở 8 m thì ngắm vào nó; sát 1 m thì null', r && near(r.x, b.s.x, 0.5) && (put(b.s, b.d.x + 1, b.d.y, Math.PI), step(b.m, 10), VS.SKILLS['phi-tieu-me'].bot(b.m, b.d) === null));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('ong-ngam: 4 s, đèn 1.5, phát xiên kế tiếp xa gấp đôi, -70, xuyên');
{
  const { m, d, s, s2 } = scene('ong-ngam', -9, 0, 0);
  d.light = true;
  wake(s); wake(s2); put(s, ARENA.x + 6, ARENA.y, Math.PI); put(s2, ARENA.x + 9, ARENA.y, Math.PI);   // 15 m và 18 m
  const ahead = [d.x + 16, d.y];
  step(m, 10);
  T.check('đối chứng: chưa bấm, điểm cách 16 m phía trước ngoài tầm đèn 13 m', SIM.visibleTo(m, 'diver', ...ahead) === false);
  press(m, d);
  T.check('bấm: đèn xa gấp rưỡi (beamMul 1.5), shotMod = tầm ×2, 70 máu, xuyên, thời hạn 4 s; t kỹ năng = 4 s', d.beamMul === 1.5 && d.shotMod && d.shotMod.rangeMul === 2 && d.shotMod.dmg === 70 && d.shotMod.pierce === true && near(d.shotMod.until - m.t, 4, 1e-6) && near(d.skill.t, 4 - DT, 1e-6));
  step(m, 10);
  T.check('đèn soi tới 13 × 1.5 = 19.5 m: điểm cách 16 m sáng', SIM.visibleTo(m, 'diver', ...ahead) === true);
  aimAt(d, s.x, s.y); d.intent.fire = true; step(m, 1);
  const pr = m.projs.find((q) => q.kind === 'snipe');
  T.check('phát xiên: đạn đổi kind snipe, 18 m/s, xuyên, sống 18/18 = 1 s, sự kiện snipe; shotMod đã dùng hết', pr && pr.pierce === true && near(pr.life, 1, 0.02) && near(pr.vx, 18, 1e-9) && ev(m, 'snipe').length === 1 && d.shotMod === null);
  stepUntil(m, () => s2.hp < s2.hpMax, 120); step(m, 2);
  T.check('xiên bay xa gấp đôi và xuyên: cá mập ở 15 m còn 320 - 70 = 250, cá mập sau nó ở 18 m còn 480 - 70 = 410', near(s.hp, 250, 0.01) && near(s2.hp, 410, 0.01), s.hp + '/' + s2.hp);
  d.intent.fire = true; step(m, 1);
  stepUntil(m, () => m.projs.filter((q) => q.owner === d.id).length === 0, 120);
  T.check('phát thứ hai trong cùng 4 s là xiên thường: cá mập ở 15 m không thêm máu mất (vẫn 250), không có snipe thứ hai', near(s.hp, 250, 0.01) && ev(m, 'snipe').length === 1);
  step(m, 5 * 60);
  T.check('hết 4 s: đèn về 1, shotMod không còn, kỹ năng hết hiệu lực; điểm 16 m tối lại', d.beamMul === 1 && d.shotMod === null && d.skill.t === 0 && SIM.visibleTo(m, 'diver', ...ahead) === false);
  // bấm xong để quá 4 s mới bắn: xiên thường
  const g = scene('ong-ngam', -9, 0, 0); wake(g.s); put(g.s, ARENA.x + 6, ARENA.y, Math.PI); aimAt(g.d, g.s.x, g.s.y);
  press(g.m, g.d); step(g.m, 4 * 60 + 10); g.d.intent.fire = true; step(g.m, 90);
  T.check('bắn sau khi quá 4 s: xiên thường (tầm 9 m) không tới cá mập ở 15 m, máu nguyên', g.s.hp === 320 && !g.m.events.some((e) => e.type === 'snipe'));
  const b = scene('ong-ngam', -9, 0, 0); b.d.light = true; wake(b.s); put(b.s, ARENA.x + 3, ARENA.y, Math.PI); step(b.m, 10);
  T.check('bot: cá mập thấy ở 12 m thì true; không thấy ai thì null', VS.SKILLS['ong-ngam'].bot(b.m, b.d) === true && (put(b.s, ARENA.x + 50, ARENA.y + 50, Math.PI), step(b.m, 10), VS.SKILLS['ong-ngam'].bot(b.m, b.d) === null));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('may-day: tốc ×1.9 trong 4 s, không bị cắn giữ');
{
  const run = (useSkill) => {
    const q = scene(useSkill ? 'may-day' : 'binh-o2', -6, 0, 0);
    if (useSkill) press(q.m, q.d);
    q.d.intent.mx = 1;
    step(q.m, 100);
    return { q, v: speedOf(q.d) };
  };
  const base = run(false), fast = run(true);
  T.check('tốc độ bơi: 2.6 m/s thường; với máy đẩy ≈ 2.6 × 1.9 = 4.94 m/s (±0.02)', near(base.v, 2.6, 0.02) && near(fast.v, 4.94, 0.02), base.v.toFixed(3) + ' / ' + fast.v.toFixed(3));
  const { m, d } = fast.q;
  T.check('hiệu ứng speed 1.9 và grabImmune, hết hạn cách bước bấm 4 s; sự kiện skill', SIM.effect(d, 'speed').mag === 1.9 && SIM.effect(d, 'grabImmune') !== null && near(SIM.effect(d, 'speed').until - 1 / 60, 4, 0.02) && ev(m, 'skill').length === 1);
  d.intent.mx = 0; step(m, 160);
  T.check('hết 4 s: hết speed và grabImmune, mod.speedMul về 1', SIM.effect(d, 'speed') === null && SIM.effect(d, 'grabImmune') === null && d.mod.speedMul === 1);
  d.intent.mx = -1; step(m, 100);
  T.check('sau khi hết: bơi lại 2.6 m/s (±0.02)', near(speedOf(d), 2.6, 0.02), speedOf(d));
  const bite = (useSkill) => {
    const q = scene(useSkill ? 'may-day' : 'binh-o2', 0, 0, 0);
    if (useSkill) press(q.m, q.d);
    wake(q.s); put(q.s, ARENA.x + 1.5, ARENA.y, Math.PI); aimAt(q.d, q.s.x, q.s.y);
    for (let i = 0; i < 60; i++) { q.s.intent.fire = true; SIM.step(q.m, DT); }
    return q;
  };
  const withSk = bite(true), noSk = bite(false);
  T.check('đối chứng không máy: cú cắn trúng làm thợ lặn bị ngậm (st held hoặc đã nhả sau ngậm), có sự kiện held', ev(noSk.m, 'bite').length >= 1 && ev(noSk.m, 'held').length >= 1);
  T.check('có máy đẩy: vẫn bị cắn trúng (mất O2) nhưng không bị ngậm: không sự kiện held, st swim, cá mập không hold', ev(withSk.m, 'bite').length >= 1 && withSk.d.o2 < 100 && ev(withSk.m, 'held').length === 0 && withSk.d.st === 'swim' && withSk.s.st !== 'hold');
  const b = scene('may-day', 0, 0, 0); b.d.light = true; wake(b.s); put(b.s, b.d.x + 5, b.d.y, Math.PI); step(b.m, 10);
  T.check('bot: cá mập thấy ở 5 m thì true; ở 10 m thì null', VS.SKILLS['may-day'].bot(b.m, b.d) === true && (put(b.s, b.d.x + 10, b.d.y, Math.PI), step(b.m, 10), VS.SKILLS['may-day'].bot(b.m, b.d) === null));
}

// ---------------------------------------------------------------------------------------------------------------------
console.log('Bot đấu bot trọn trận, cả 4 thợ lặn mang cùng một kỹ năng');
{
  const t0 = Date.now();
  const fin = (a) => ['x', 'y', 'vx', 'vy', 'o2', 'hp', 'ang'].every((k) => a[k] === undefined || Number.isFinite(a[k]));
  for (const id of IDS) {
    const m = SIM.createMatch({ seed: 7, mapId: 'A01', lineup: lineup('bot') });
    m.actors.slice(0, 4).forEach((a) => { a.skill = { id, cd: 0, t: 0, charges: SD[id].charges || 0 }; });
    let uses = 0, bad = 0, rock = 0, steps = 0;
    while (m.phase !== 'end' && steps < 20000) {
      SIM.step(m, DT); steps++;
      for (const e of m.events) if (e.type === 'skill' && e.skill === id) uses++;
      m.events.length = 0;
      if (steps % 30 === 0) for (const a of m.actors) { if (!fin(a)) bad++; if (a.st !== 'out' && m.world.solid(a.x, a.y)) rock++; }
    }
    T.check(id + ': trận bot đấu bot chạy tới hết (' + steps + ' bước), không NaN, không actor nằm trong đá, bot dùng kỹ năng ' + uses + ' lần (>= 1)', m.phase === 'end' && !!m.result && bad === 0 && rock === 0 && uses >= 1, 'end ' + m.phase + ' nan ' + bad + ' đá ' + rock + ' dùng ' + uses);
  }
  console.log('  (' + (Date.now() - t0) + ' ms)');
}

T.done();
