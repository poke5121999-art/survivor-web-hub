// test/voiddiver-ai.js — kiểm AI quái Void Diver (Node). Chạy: node test/voiddiver-ai.js
// Dữ liệu như test/voiddiver-combat.js (VD_REF_JSON / VD_DATA=tables). Số kỳ vọng lấy từ docs/AI.md.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'voiddiver');
global.window = global;
window.VD = window.VD || {};
const TABLES = ['Skill', 'HitBox', 'Buff', 'BuffVfx', 'StatusEffectTag', 'Character', 'Monster', 'Equipment', 'Const', 'Faction', 'Shield', 'Difficulty', 'ExtraUnit'];
const tablesJs = path.join(GAME, 'data', 'tables.js');
let dataSrc;
if (process.env.VD_DATA === 'tables' && fs.existsSync(tablesJs)) { require(tablesJs); dataSrc = tablesJs; }
else {
  const dir = process.env.VD_REF_JSON || path.join(os.homedir(), 'Downloads', 'vd-ref', 'json');
  VD.T = {};
  for (const t of TABLES) { const f = path.join(dir, t + '.json'); if (fs.existsSync(f)) VD.T[t] = JSON.parse(fs.readFileSync(f, 'utf8')); }
  dataSrc = dir;
}
for (const f of ['stats', 'buff', 'hitbox', 'skill', 'ai']) require(path.join(GAME, 'js', f + '.js'));
const { Skill, AI } = VD;

let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name + (detail !== undefined && detail !== '' ? '  (' + detail + ')' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail !== undefined && detail !== '' ? '  (' + detail + ')' : '')); }
}
const DT = 1 / 60, FR = DT + 1e-9;
const near = (a, b, e) => Math.abs(a - b) <= e;

// ---------- thế giới giả: lưới nav 0.5 m, tường chữ nhật (low = chỉ chặn đi, high = chặn cả đạn/tầm nhìn) ----------
function makeNav(walls, half) {
  half = half || 10;
  const NAV = 0.5, minX = -half, minZ = -half, W = Math.round(2 * half / NAV), H = W;
  const inWall = (x, z, r, high) => walls.some(w => (!high || w.high) && x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r);
  const nav = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) nav[j * W + i] = inWall(minX + (i + 0.5) * NAV, minZ + (j + 0.5) * NAV, 0.2, false) ? 1 : 0;
  const N = {
    nav, navW: W, navH: H, NAV,
    navCell: (x, z) => [Math.floor((x - minX) / NAV), Math.floor((z - minZ) / NAV)],
    navCenter: (i, j) => [minX + (i + 0.5) * NAV, minZ + (j + 0.5) * NAV],
    overlapsMove: (x, z, r) => inWall(x, z, r, false) || Math.abs(x) > half - r || Math.abs(z) > half - r,
    // đẩy tròn khỏi hộp trục thẳng
    moveCircle(pos, r, dx, dz) {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
      for (let s = 0; s < steps; s++) {
        pos.x += dx / steps; pos.z += dz / steps;
        for (const w of walls) {
          const qx = Math.max(w.x0, Math.min(w.x1, pos.x)), qz = Math.max(w.z0, Math.min(w.z1, pos.z));
          const ex = pos.x - qx, ez = pos.z - qz, d = Math.hypot(ex, ez);
          if (d < r) {
            if (d > 1e-9) { pos.x += ex / d * (r - d); pos.z += ez / d * (r - d); }
            else { const cx = (w.x0 + w.x1) / 2; pos.x += (pos.x >= cx ? w.x1 - pos.x + r : w.x0 - pos.x - r); }
          }
        }
        pos.x = Math.max(-half + r, Math.min(half - r, pos.x)); pos.z = Math.max(-half + r, Math.min(half - r, pos.z));
      }
      return pos;
    },
    raycastShot(ax, az, bx, bz) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.1));
      for (let k = 1; k <= n; k++) { const t = k / n; if (inWall(ax + (bx - ax) * t, az + (bz - az) * t, 0, true)) return t; }
      return 1;
    },
    walls
  };
  return N;
}
function makeWorld(opts) {
  opts = opts || {};
  const nav = makeNav(opts.walls || [], opts.half);
  const w = {
    units: [], time: 0, events: [], difficulty: opts.difficulty || null, navWorld: nav,
    rng: opts.rng || (() => 0.999),
    emit(e) { w.events.push(e); },
    moveUnit(u, dx, dz) { const b = { x: u.pos.x, z: u.pos.z }; nav.moveCircle(u.pos, u.radius || 0.3, dx, dz); return { x: u.pos.x - b.x, z: u.pos.z - b.z, blocked: false }; },
    raycastWall(a, b) { const t = nav.raycastShot(a.x, a.z, b.x, b.z); return t < 1 ? { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t } : null; }
  };
  return w;
}
function frame(w) { Skill.step(w, DT); AI.step(w, DT); AI.applyLight(w, DT); }
function run(w, sec, each) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { if (each && each(w) === false) return; frame(w); } }
function mon(w, id, x, z, aim) {
  const u = Skill.makeUnit(w, { kind: 'mon', id, pos: { x, z }, aim: aim || { x: 0, z: 1 }, radius: 0.3 });
  AI.init(w, u, { noSpawnDelay: true });
  u.ai.wait = 1e9; // không đi lang thang trong test nhìn
  return u;
}
function gay(w, x, z, aim, light) {
  const g = Skill.makeUnit(w, { kind: 'char', id: 100001, pos: { x, z }, aim: aim || { x: 0, z: 1 }, radius: 0.3 });
  g.input.aim = g.aim;
  g.base.HpMax = 1e6; VD.Stats.compute(g); g.hp = 1e6; // không chết trong test
  g.light = light || 0; // tắt đèn pin trừ mục [6] (đèn làm chậm quái −0.7 qua 3000003)
  return g;
}
const d2 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

console.log('Void Diver AI test — data: ' + dataSrc);

// ======================= 1. nhìn thấy =======================
console.log('\n[1] Nón nhìn zombie 200011 (SightAngle 150, SightRange 3, SightBackRange 1.3; "!" ≤ 1.5 trước / ≤ 1.17 sau)');
function sightCase(px, pz, sec) {
  const w = makeWorld();
  const z = mon(w, 200011, 0, 0, { x: 0, z: 1 });
  gay(w, px, pz);
  run(w, sec || 0.2);
  const first = w.events.find(e => e.type === 'aiState' && e.unit === z);
  return first ? first.state : 'idle'; // phản ứng đầu tiên
}
check('sau lưng 1.5 m (> SightBackRange 1.3) → không thấy', sightCase(0, -1.5) === 'idle', sightCase(0, -1.5));
check('sau lưng 1.25 m (≤ 1.3, > 1.3×0.9) → "?"', sightCase(0, -1.25) === 'curious', sightCase(0, -1.25));
check('sau lưng 1.0 m (≤ 1.17) → "!" combat', sightCase(0, -1.0) === 'combat', sightCase(0, -1.0));
check('trước mặt 2.9 m (≤ SightRange 3) → "?"', sightCase(0, 2.9) === 'curious', sightCase(0, 2.9));
check('trước mặt 3.1 m → không thấy', sightCase(0, 3.1) === 'idle', sightCase(0, 3.1));
check('trước mặt 1.4 m (≤ 3×0.5) → "!"', sightCase(0, 1.4) === 'combat', sightCase(0, 1.4));
const a70 = 70 * Math.PI / 180, a80 = 80 * Math.PI / 180;
check('lệch 70° (< 75° = 150/2), 2.5 m → "?"', sightCase(2.5 * Math.sin(a70), 2.5 * Math.cos(a70)) === 'curious');
check('lệch 80°, 2.5 m → không thấy', sightCase(2.5 * Math.sin(a80), 2.5 * Math.cos(a80)) === 'idle');
{
  const w = makeWorld({ walls: [{ x0: -2, x1: 2, z0: 1.0, z1: 1.2, high: true }] });
  const z = mon(w, 200011, 0, 0); gay(w, 0, 2.0); run(w, 0.3);
  check('tường cao chắn giữa → không thấy (IgnoreObstaclesForDetection = false)', z.aiState === 'idle', z.aiState);
}
{
  const w = makeWorld();
  const z = mon(w, 200011, 0, 0); gay(w, 0, 2.9);
  let tAggro = null, curiousBuff = false;
  run(w, 2.0, ww => { if (z.buffs.stacks(60101)) curiousBuff = true; if (tAggro == null && z.aiState === 'combat') tAggro = ww.time; });
  const tCur = w.events.find(e => e.type === 'aiState' && e.state === 'curious').t;
  check('"?" → "!" sau MonsterAlertTrackTargetTime 1.1 s thấy liên tục', tAggro != null && near(tAggro - tCur, 1.1, 2 * FR), tAggro && (tAggro - tCur).toFixed(3));
  check('OnCuriousBuffIds 60101 khi "?", gỡ khi "!"; OnCombatBuffIds 60012 khi "!"', curiousBuff && !z.buffs.stacks(60101) && z.buffs.stacks(60012) === 1);
  check('MoveSpeed trong combat = 1 + 0.9 (60012) = 1.9', near(z.stats.MoveSpeed, 1.9, 1e-9), z.stats.MoveSpeed);
  check('AggroSfx "Aggro_Zombie" phát khi "!"', !!w.events.find(e => e.type === 'sfx' && e.name === 'Aggro_Zombie'));
}

// ======================= 2. tầm combat ×2.7, mất dấu sau 2 s =======================
console.log('\n[2] BattleSightRangePercent 270 → 8.1 m; TargetLostInSightTime 2 s');
{
  const w = makeWorld();
  const z = mon(w, 200011, 0, 0); const g = gay(w, 0, 1.0);
  run(w, 0.1);
  check('đã "!"', z.aiState === 'combat');
  z.aim = { x: 0, z: 1 };
  g.pos.x = 0; g.pos.z = 8.0;
  check('combat: thấy ở 8.0 m (≤ 3 × 2.7 = 8.1)', !!AI.canSee(w, z, g));
  g.pos.z = 8.2;
  check('combat: không thấy ở 8.2 m', !AI.canSee(w, z, g));
  // đưa ra sau lưng xa → mất dấu đúng 2 s
  g.pos.x = 0; g.pos.z = -9;
  const t0 = w.time;
  run(w, 2.5);
  const lost = w.events.find(e => e.type === 'lostTarget' && e.unit === z);
  check('mất dấu sau 2.0 s không thấy → "return"', lost && near(lost.t - t0, 2.0, 2 * FR) && lost.why === 'lostSight', lost && (lost.t - t0).toFixed(3) + ' ' + lost.why);
  check('rời combat gỡ OnCombatBuffIds 60012', !z.buffs.stacks(60012));
  run(w, 8);
  check('về điểm sinh (≤ AgentStoppingDistance 0.55) rồi idle/lang thang trong WanderRange 2', w.events.some(e => e.type === 'aiState' && e.unit === z && e.state === 'idle' && e.prev === 'return') && Math.hypot(z.pos.x, z.pos.z) <= 2.3, z.aiState + ' ' + Math.hypot(z.pos.x, z.pos.z).toFixed(2));
}

// ======================= 3. đường vòng quanh tường thấp =======================
console.log('\n[3] Đường đi: flow field vòng qua tường thấp (chặn đi, không chặn nhìn)');
{
  const wall = { x0: -3, x1: 3, z0: 1.8, z1: 2.2, high: false };
  const w = makeWorld({ walls: [wall] });
  const z = mon(w, 200011, 0, 4.2, { x: 0, z: -1 });
  const g = gay(w, 0, 1.3); // 2.9 m: trong SightRange 3
  let maxX = 0, inside = false, tReach = null;
  run(w, 12, ww => {
    maxX = Math.max(maxX, Math.abs(z.pos.x));
    const qx = Math.max(wall.x0, Math.min(wall.x1, z.pos.x)), qz = Math.max(wall.z0, Math.min(wall.z1, z.pos.z));
    if (Math.hypot(z.pos.x - qx, z.pos.z - qz) < 0.29) inside = true; // tâm cách mép tường < bán kính
    if (tReach == null && d2(z, g) <= 1.3) tReach = ww.time;
  });
  check('zombie thấy qua tường thấp → combat', w.events.some(e => e.type === 'aggro' && e.unit === z));
  check('đi vòng mép tường (|x| ≥ 3)', maxX >= 3, maxX.toFixed(2));
  check('không chui vào tường', !inside);
  check('tới tầm đánh (< 1.3, AiTargetDistanceCondition của 20000401) và ra đòn', tReach != null && w.events.some(e => e.type === 'aiCast' && e.unit === z && e.skillId === 20000401), tReach && tReach.toFixed(2) + ' s');
}
{
  // Kkamong: Start 2.2 / End 1.8, skill bị khoá hồi chiêu → chỉ di chuyển
  const w = makeWorld();
  const k = mon(w, 200001, 0, 0);
  const g = gay(w, 0, 1.0);
  run(w, 0.05);
  [20000000, 20000001, 20000050].forEach(id => { k.cd[id] = 1e9; });
  g.pos.z = 5; k.aim = { x: 0, z: 1 };
  run(w, 3);
  check('đuổi tới khi d ≤ EndMoveToTargetRange 1.8 rồi đứng', near(d2(k, g), 1.8, 0.1) && k.aiSub == null, d2(k, g).toFixed(3));
  const zk = k.pos.z;
  g.pos.z = zk + 2.1;
  run(w, 0.5);
  check('mục tiêu lùi tới 2.1 (≤ Start 2.2) → không đuổi', near(k.pos.z, zk, 0.02), (k.pos.z - zk).toFixed(3));
  g.pos.z = zk + 2.5;
  run(w, 2);
  check('mục tiêu ở 2.5 (> 2.2) → đuổi lại tới 1.8', near(d2(k, g), 1.8, 0.1), d2(k, g).toFixed(3));
}

// ======================= 4. chọn skill + GlobalSkillCoolTime =======================
console.log('\n[4] Zombie (Hard): 20000401 (Weight 200, < 1.3) và 20000407 (Weight 100, < 5, Hard), GlobalSkillCoolTime 1 × 105%');
{
  let s = 3;
  const w = makeWorld({ difficulty: 'Hard', rng: () => (s = (s * 16807) % 2147483647) / 2147483647 });
  const z = mon(w, 200011, 0, 0); const g = gay(w, 0, 1.0);
  run(w, 9);
  const casts = w.events.filter(e => e.type === 'aiCast' && e.unit === z);
  const ends = w.events.filter(e => e.type === 'skillEnd' && e.unit === z);
  const aggroT = w.events.find(e => e.type === 'aggro' && e.unit === z).t;
  check('đòn đầu sau MonsterReactionDelay 0.8 s kể từ "!"', casts.length && near(casts[0].t - aggroT, 0.8, 2 * FR), casts[0] && (casts[0].t - aggroT).toFixed(3));
  const gaps = [];
  for (let i = 1; i < casts.length; i++) {
    const prevEnd = ends.filter(e => e.t <= casts[i].t + 1e-9).pop();
    gaps.push(+(casts[i].t - prevEnd.t).toFixed(3));
  }
  check('đòn 2 cách lúc đòn 1 kết thúc đúng 1 × 1.05 (Difficulty Hard GlobalSkillCoolTimePercent 105)', gaps.length >= 2 && near(gaps[0], 1.05, 2 * FR) && gaps.every(x => x >= 1.05 - 2 * FR), gaps.join(','));
  // khe dài hơn 1.05 là do hồi chiêu riêng: 20000407 CoolTime 5.5 (Hard CooldownReductionPercent 0)
  const c407 = casts.filter(c => c.skillId === 20000407).map(c => c.t);
  check('khe cuối dài hơn: chờ CoolTime 5.5 s của 20000407', c407.length >= 2 && near(c407[1] - c407[0], 5.5, 2 * FR), c407.map(x => x.toFixed(3)).join(','));
  check('dùng cả hai skill (ngẫu nhiên theo Weight, bị hồi chiêu riêng chặn)', new Set(casts.map(c => c.skillId)).size === 2, casts.map(c => c.skillId).join(','));
  const w2 = makeWorld(); const z2 = mon(w2, 200011, 0, 0); gay(w2, 0, 1.0); run(w2, 9);
  check('độ khó Normal: 20000407 (AiCasterDifficultyCondition Hard) không bao giờ được chọn', w2.events.filter(e => e.type === 'aiCast').every(e => e.skillId === 20000401));
}

// ======================= 5. chạy trốn / khựng =======================
console.log('\n[5] Kkamong: FleeHpPercent 50, FleePercent 10, FleeDuration 2, FleeCooltime 2; PauseStatePercent 30 / 1 s');
function hitKk(rngv, hpPct) {
  const w = makeWorld({ rng: () => rngv });
  const k = mon(w, 200001, 0, 0); const g = gay(w, 0, 1.2);
  run(w, 0.1);
  [20000000, 20000001, 20000050].forEach(id => { k.cd[id] = 1e9; });
  k.hp = k.stats.HpMax * hpPct / 100;
  VD.Combat.applyDamage(w, g, k, { Power: 10, CoefficientStat: 'None', StatFactor: 0 }, { reason: 'Action' });
  return { w, k, g };
}
{
  const { w, k, g } = hitKk(0.05, 40);
  check('máu 40% ≤ 50%, roll 5 < 10 → "flee"', k.aiState === 'flee', k.aiState);
  const d0 = d2(k, g);
  run(w, 1.9);
  check('chạy xa mục tiêu trong 2 s', k.aiState === 'flee' && d2(k, g) > d0 + 2, (d2(k, g) - d0).toFixed(2) + ' m');
  run(w, 0.2);
  check('hết FleeDuration → về combat, FleeCooltime 2 s', k.aiState === 'combat' && near(k.ai.fleeCd, 2, 0.1), k.aiState + ' ' + k.ai.fleeCd.toFixed(2));
}
check('máu 60% (> 50%) → không chạy', hitKk(0.05, 60).k.aiState !== 'flee', hitKk(0.05, 60).k.aiState);
check('máu 40%, roll 50 ≥ 10 → không chạy (roll 50 ≥ Pause 30 → không khựng)', hitKk(0.5, 40).k.aiState === 'combat');
{
  const { w, k } = hitKk(0.2, 100);
  check('roll 20 < PauseStatePercent 30 → "pause"', k.aiState === 'pause');
  run(w, 1.05);
  check('khựng PauseStateDuration 1 s rồi về combat', k.aiState === 'combat', k.aiState);
}

// ======================= 6. đèn pin =======================
console.log('\n[6] Đèn pin: nón Character 120° × 5 m (+ vòng 1 m), LightBuffId 3000003 / LightStackBuffId 3000002');
{
  const w = makeWorld();
  const g = gay(w, 0, 0, { x: 0, z: 1 }, 100);
  const place = [[0, 3], [0, -3], [4, 0.5], [0, 5.5], [2.5, 3.0], [0, -0.8]];
  const ms = place.map(p => { const m = mon(w, 200001, p[0], p[1], { x: 0, z: -1 }); m.ai.state = 'pause'; m.ai.pauseT = 1e9; m.aiState = 'pause'; return m; });
  AI.applyLight(w, DT);
  const lit = ms.map(m => m.buffs.stacks(3000003) > 0 && m.buffs.stacks(3000002) > 0);
  check('(0,3) trong nón → có 3000003 + 3000002', lit[0]);
  check('(0,−3) sau lưng → không', !lit[1]);
  check('(4,0.5) lệch 83° > 60° → không', !lit[2]);
  check('(0,5.5) quá 5 m → không', !lit[3]);
  check('(2.5,3.0) lệch 39.8° < 60°, 3.9 m → có', lit[4]);
  check('(0,−0.8) trong SightBackRange 1 m → có', lit[5]);
  check('3000003: Atk −25% (185 → 138.75)', near(ms[0].stats.Atk, 138.75, 1e-9), ms[0].stats.Atk);
  g.light = 0;
  run(w, 2.1);
  check('hết pin (LightFuel 0) → buff rớt sau Duration (2 s)', !ms[0].buffs.stacks(3000003) && !ms[0].buffs.stacks(3000002));
}
{
  // quái bóng tối: LightStackBuffId có 3000005 (Stack ≥ 2 → 3.5% HpMax mỗi giây)
  const rows = Array.isArray(VD.T.Monster) ? VD.T.Monster : Object.values(VD.T.Monster);
  const sh = rows.find(m => m.MonsterType === 'Shadow' && (m.LightStackBuffId || []).indexOf(3000005) >= 0);
  const w = makeWorld();
  gay(w, 0, 0, { x: 0, z: 1 }, 100);
  const m = mon(w, sh.Id, 0, 3, { x: 0, z: -1 });
  m.ai.state = 'pause'; m.ai.pauseT = 1e9;
  run(w, 0.5);
  check('quái bóng tối ' + sh.Id + ': 1 stack 3000005 lúc vào sáng, chưa mất máu', m.buffs.stacks(3000005) === 1 && m.hp === m.stats.HpMax);
  run(w, 2.6);
  const dots = w.events.filter(e => e.type === 'damage' && e.tgt === m && e.reason === 'Dot');
  check('≥ 1 s phơi sáng → 2 stack → DotPercentHpDamage 3.5% × 2 stack mỗi giây', m.buffs.stacks(3000005) === 2 && dots.length >= 1 && near(dots[0].amount, Math.round(0.035 * 2 * m.stats.HpMax), 1),
    dots.map(e => e.amount).join(','));
}

// ======================= 7. phe =======================
console.log('\n[7] Phe: 200019 (1001) và 200023 (1002) thù nhau; zombie (−1) và 300011 (9999) đứng ngoài');
{
  const w = makeWorld();
  const a = mon(w, 200019, -1, 0, { x: 1, z: 0 });
  const b = mon(w, 200023, 1, 0, { x: -1, z: 0 });
  const z = mon(w, 200011, 0, 1.2, { x: 0, z: -1 });
  const dy = mon(w, 300011, 0, -1.2, { x: 0, z: 1 });
  gay(w, 9, 9, { x: 0, z: 1 });
  run(w, 1.5); // cách 2 m > 3.5×0.5 → "?" rồi "!" sau 1.1 s
  check('200019 nhắm 200023', a.aiState === 'combat' && a.ai.target === b);
  check('200023 nhắm 200019', b.aiState === 'combat' && b.ai.target === a);
  check('zombie phe −1 không vào combat', z.aiState !== 'combat', z.aiState);
  check('Dark Young phe 9999 không vào combat', dy.aiState !== 'combat', dy.aiState);
}

// ======================= 8. flow field dùng chung + tách đàn =======================
console.log('\n[8] Hai zombie đuổi cùng mục tiêu: dùng chung flow field (≤ 1 lần / 0.25 s), không chồng lên nhau');
{
  const w = makeWorld({ walls: [{ x0: -3, x1: 3, z0: 1.8, z1: 2.2, high: false }] });
  const z1 = mon(w, 200011, -0.3, 4.2, { x: 0, z: -1 }), z2 = mon(w, 200011, 0.3, 4.2, { x: 0, z: -1 });
  gay(w, 0, 1.3);
  [z1, z2].forEach(z => { z.cd[20000401] = 1e9; z.cd[20000407] = 1e9; });
  let minD = 9;
  run(w, 6, () => { minD = Math.min(minD, d2(z1, z2)); });
  check('số lần dựng flow field ≤ 6 s / 0.25 + 1 = 25 (hai quái dùng chung)', w.flowBuilds > 0 && w.flowBuilds <= 25, w.flowBuilds);
  check('khoảng cách hai zombie ≥ 0.45 (bán kính 0.3 + 0.3, cho phép lún 0.15)', minD >= 0.45, minD.toFixed(3));
}

// ======================= 9. anim đi =======================
console.log('\n[9] Anim đi: tốc độ clip = MoveSpeed / WalkAnimation1xSpeed, kẹp MaxWalkAnimationSpeed 3.5');
{
  const w = makeWorld();
  const k = mon(w, 200001, 0, 0);
  k.ai.wait = 0; // đi lang thang ngay
  run(w, 0.5);
  const an = w.events.find(e => e.type === 'anim' && e.unit === k && e.name === 'walk');
  check('Kkamong lang thang: walk × 1.8/1.4 = 1.286', an && near(an.speed, 1.8 / 1.4, 1e-6), an && an.speed.toFixed(3));
  const w2 = makeWorld();
  const z = mon(w2, 200011, 0, 0); const g = gay(w2, 0, 1.0);
  run(w2, 0.1); z.cd[20000401] = 1e9; g.pos.z = 5;
  run(w2, 1.5);
  const az = w2.events.filter(e => e.type === 'anim' && e.unit === z && e.name === 'walk').pop();
  check('zombie combat 1.9 m/s / 0.4 = 4.75 → kẹp 3.5', az && near(az.speed, 3.5, 1e-9), az && az.speed);
}


// ======================= 11. mọi quái chạy AI 6 s =======================
console.log('\n[11] Mọi dòng Monster chạy AI 6 s cạnh Gayoung (có tường): không exception, không NaN, không điều kiện AI lạ');
{
  const rows = Array.isArray(VD.T.Monster) ? VD.T.Monster : Object.values(VD.T.Monster);
  const errs = [], unknown = {};
  let s = 5;
  for (const r of rows) {
    const w = makeWorld({ walls: [{ x0: -3, x1: 3, z0: 1.8, z1: 2.2, high: false }], difficulty: 'Hard', rng: () => (s = (s * 16807) % 2147483647) / 2147483647 });
    try {
      const m = mon(w, r.Id, 0, 3.5, { x: 0, z: -1 });
      m.ai.wait = 0.5;
      gay(w, 0.5, 0.8);
      run(w, 6);
      for (const u of w.units) if (!isFinite(u.hp) || !isFinite(u.pos.x) || !isFinite(u.pos.z)) errs.push('NaN ' + r.Id);
    } catch (e) { errs.push(r.Id + ': ' + e.message); }
    for (const k in (w.combatUnknown || {})) unknown[k] = 1;
  }
  check('chạy ' + rows.length + ' quái không exception / NaN', errs.length === 0, errs.slice(0, 5).join(' | '));
  check('không có điều kiện AI / event / trigger lạ', Object.keys(unknown).length === 0, Object.keys(unknown).join(','));
}

// ======================= 10. dữ liệu tables.js (thông tin, không tính pass/fail) =======================
// Bao đóng các id mà lõi chiến đấu + AI cần, tính từ Character + Monster + MonsterSpawn/Wave/Mimic/Trap của tables.js,
// so với JSON gốc: skill (Active/Passive), hitbox (HitBoxEvent, iterator, chỉ báo, destroyHitBoxId, SpawnHitBoxOnEnd),
// buff (BuffActionEvent, CollisionBuffEvent, On*BuffIds, Light*BuffId, buffIds của Wave), quái (pha, gọi ra), ExtraUnit.
function tablesReport() {
  if (!fs.existsSync(tablesJs)) return;
  const saved = VD.T; delete require.cache[require.resolve(tablesJs)]; require(tablesJs); const TT = VD.T; VD.T = saved;
  const refDir = process.env.VD_REF_JSON || path.join(os.homedir(), 'Downloads', 'vd-ref', 'json');
  const full = n => { const f = path.join(refDir, n + '.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; };
  const idx = a => { const m = {}; (a || []).forEach(r => { m[r.Id] = r; }); return m; };
  const F = { S: idx(full('Skill')), H: idx(full('HitBox')), B: idx(full('Buff')), M: idx(full('Monster')), X: idx(full('ExtraUnit')) };
  const HAVE = { S: idx(TT.Skill), H: idx(TT.HitBox), B: idx(TT.Buff), M: idx(TT.Monster), X: idx(TT.ExtraUnit) };
  const need = { S: new Set(), H: new Set(), B: new Set(), M: new Set(), X: new Set() }, q = [];
  const add = (k, id) => { if (id > 0 && !need[k].has(id)) { need[k].add(id); q.push([k, id]); } };
  const Tt = x => String(x || '').split(',')[0].split('.').pop();
  (TT.Monster || []).forEach(m => add('M', m.Id));
  (TT.Character || []).forEach(c => {
    ['AttackSkillId', 'DashSkillId', 'PolymorphAttackSkillId', 'PolymorphDashSkillId'].forEach(k => add('S', c[k]));
    ['ActiveSkillIds', 'PolymorphActiveSkillIds', 'PassiveSkillIds'].forEach(k => (c[k] || []).forEach(x => add('S', x)));
  });
  (TT.MonsterSpawn || []).forEach(r => add('M', r.MonsterId));
  (TT.Mimic || []).forEach(m => { add('M', m.MonsterId); (m.HitBoxIds || []).forEach(h => add('H', h)); });
  (TT.Trap || []).forEach(x => (x.HitBoxIds || []).forEach(h => add('H', h)));
  (TT.Wave || []).forEach(w => {
    const s = JSON.stringify(w);
    (s.match(/"monsterId":\d+/g) || []).forEach(m => add('M', +m.split(':')[1]));
    (s.match(/"buffIds":\[[\d,]*\]/g) || []).forEach(m => JSON.parse(m.split(':')[1]).forEach(b => add('B', b)));
  });
  const ev = e => {
    const ty = Tt(e.$type);
    if (ty === 'HitBoxEvent') add('H', e.Id);
    if (ty === 'BuffActionEvent') add('B', e.Id);
    const it = e.HitBoxIterator;
    if (it) { add('H', it.HitBoxId); (it.MonsterInfos || []).forEach(m => add('M', m.Id)); if (it.IndicatorInfo) add('H', it.IndicatorInfo.HitBoxId); }
    if (e.IndicatorInfo) add('H', e.IndicatorInfo.HitBoxId);
    (e.MonsterInfos || []).forEach(m => add('M', m.Id)); (e.MonsterIds || []).forEach(m => add('M', m)); (e.HitBoxIds || []).forEach(h => add('H', h));
  };
  while (q.length) {
    const [k, id] = q.shift();
    if (k === 'M' && F.M[id]) {
      const m = F.M[id];
      (m.ActiveSkillIds || []).concat(m.PassiveSkillIds || []).forEach(s => add('S', s));
      ['OnCombatBuffIds', 'OnCuriousBuffIds', 'LightBuffId', 'LightStackBuffId'].forEach(c => (m[c] || []).forEach(b => add('B', b)));
      if (m.BasePhaseMonsterId > 0) Object.values(F.M).filter(x => x.BasePhaseMonsterId === m.BasePhaseMonsterId).forEach(x => add('M', x.Id));
    }
    if (k === 'X' && F.X[id]) (F.X[id].ActiveSkillIds || []).concat(F.X[id].PassiveSkillIds || []).forEach(s => add('S', s));
    if (k === 'S' && F.S[id] && F.S[id].RootActionNode) (function w(n) { (n.skillAction.actionEvents || []).forEach(ev); (n.childNodes || []).forEach(w); })(F.S[id].RootActionNode);
    if (k === 'H' && F.H[id]) {
      const i = F.H[id].HitBoxInfo;
      (i.collisionEvents || []).forEach(e => add('B', e.buffId)); (i.destroyHitBoxId || []).forEach(x => add('H', x));
      add('X', i.ExtraUnitIdOnDestroy); (i.ActionEventsOnDestroy || []).forEach(ev);
    }
    if (k === 'B' && F.B[id]) (F.B[id].BuffEffects || []).forEach(e => add('H', e.HitBoxId));
  }
  const name = { S: 'Skill', H: 'HitBox', B: 'Buff', M: 'Monster', X: 'ExtraUnit' };
  console.log('\n[10] tables.js — id lõi chiến đấu/AI cần mà tables.js thiếu (chỉ tính id có trong JSON gốc):');
  for (const k in need) {
    const miss = [...need[k]].filter(id => !HAVE[k][id] && F[k][id]).sort((a, b) => a - b);
    console.log('    ' + name[k].padEnd(9) + ' cần ' + String(need[k].size).padStart(3) + ', thiếu ' + String(miss.length).padStart(3) + (miss.length ? ': ' + miss.join(', ') : ''));
  }
  console.log('    bảng ExtraUnit ' + (TT.ExtraUnit ? 'có' : 'THIẾU') + ', Shield ' + (TT.Shield ? 'có' : 'THIẾU'));
}
tablesReport();

console.log('\n==> ' + pass + ' pass, ' + fail + ' fail' + (fail ? '  [' + fails.join('; ') + ']' : ''));
process.exit(fail ? 1 : 0);
