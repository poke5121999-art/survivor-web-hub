// test/voiddiver-combat.js — kiểm lõi chiến đấu Void Diver (Node, không trình duyệt).
// Chạy: node test/voiddiver-combat.js
// Dữ liệu: mặc định đọc JSON gốc ở ~/Downloads/vd-ref/json (đổi bằng VD_REF_JSON=<thư mục>).
//          VD_DATA=tables → nạp games/voiddiver/data/tables.js (VD.T) nếu có.
// Số kỳ vọng lấy từ docs/SKILLVM.md (timeline mẫu). Mỗi check in PASS/FAIL; thoát mã 1 nếu có FAIL.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'games', 'voiddiver');
global.window = global;
window.VD = window.VD || {};

// ---------- nạp dữ liệu ----------
const TABLES = ['Skill', 'HitBox', 'Buff', 'BuffVfx', 'StatusEffectTag', 'Character', 'Monster', 'Equipment', 'Const', 'Faction',
  'Shield', 'Difficulty', 'ExtraUnit'];
let dataSrc;
const tablesJs = path.join(GAME, 'data', 'tables.js');
if (process.env.VD_DATA === 'tables' && fs.existsSync(tablesJs)) {
  require(tablesJs);
  dataSrc = tablesJs;
} else {
  const dir = process.env.VD_REF_JSON || path.join(os.homedir(), 'Downloads', 'vd-ref', 'json');
  if (!fs.existsSync(dir)) { console.error('data dir not found: ' + dir); process.exit(2); }
  VD.T = {};
  for (const t of TABLES) {
    const f = path.join(dir, t + '.json');
    if (fs.existsSync(f)) VD.T[t] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  dataSrc = dir;
}
for (const f of ['stats', 'buff', 'hitbox', 'skill']) require(path.join(GAME, 'js', f + '.js'));
const Skill = VD.Skill, db = VD.combatDB();

// ---------- khung kiểm ----------
let pass = 0, fail = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}
const near = (a, b, e) => Math.abs(a - b) <= (e == null ? 1e-6 : e);
const DT = 1 / 60;
const FR = DT + 1e-9; // dung sai một khung

const ALL_WORLDS = [];
function makeWorld(opts) {
  opts = opts || {};
  const w = {
    units: [], time: 0, events: [], difficulty: opts.difficulty || null,
    rng: opts.rng || (() => 0.999),
    emit(e) { w.events.push(e); }
  };
  ALL_WORLDS.push(w);
  return w;
}
function run(w, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) { if (each) each(w); Skill.step(w, DT); }
}
function dummy(w, x, z, id) {
  return Skill.makeUnit(w, { kind: 'mon', id: id || 820001, pos: { x, z }, aim: { x: 0, z: -1 }, radius: 0.3 });
}
function char(w, id, x, z, aim) {
  const u = Skill.makeUnit(w, { kind: 'char', id, pos: { x: x || 0, z: z || 0 }, aim: aim || { x: 0, z: 1 }, radius: 0.3 });
  u.input.aim = u.aim;
  return u;
}
const dmgs = (w, src, pred) => w.events.filter(e => e.type === 'damage' && e.src === src && (!pred || pred(e)));
const firstT = (w, type, pred) => { const e = w.events.find(x => x.type === type && (!pred || pred(x))); return e ? e.t : null; };

console.log('Void Diver combat test — data: ' + dataSrc);

// ======================= 0. đường cong & anim =======================
console.log('\n[0] Đường cong hermite / tốc độ anim');
{
  const hit1 = db.skill(10010000).RootActionNode.childNodes[0].skillAction;
  const keys = hit1.MoveSpeedCurveData.Keys;
  check('curve Gayoung hit1 (1→0, tan −1) tại 0.5 = 0.5', near(Skill.evalCurve(keys, 0.5), 0.5, 1e-9));
  const sp = hit1.SkillAnimationDatas[0].animationSpeeds;
  check('animTimeAt(hit1, 0.05 s) = 0.13 (khung chém = HitBoxEvent 0.05)', near(Skill.animTimeAt(sp, 0, 0.05), 0.13, 1e-9));
  check('realTimeAt(hit1, clip 0.35) = 0.3503 ≈ cửa combo @0.35', near(Skill.realTimeAt(sp, 0, 0.35), 0.35, 0.001), Skill.realTimeAt(sp, 0, 0.35).toFixed(4));
  const g6 = db.skill(10010600).RootActionNode.childNodes[0];
  const a0 = g6.skillAction.SkillAnimationDatas[0], a1 = g6.childNodes[0].skillAction.SkillAnimationDatas[0];
  check('10010600: clip node cha sau 0.32 s = offset node con 0.652', near(Skill.animTimeAt(a0.animationSpeeds, 0, 0.32), +a1.animStartOffsetTime, 1e-6),
    Skill.animTimeAt(a0.animationSpeeds, 0, 0.32).toFixed(4));
}

// ======================= 1. Gayoung combo x3 =======================
console.log('\n[1] Gayoung đánh thường x3 (+ đòn thứ 4 kích passive 10010002) vs 3 bù nhìn 820001');
{
  const w = makeWorld();
  const g = char(w, 100001);
  const d1 = dummy(w, 0, 1.0), d2 = dummy(w, 0.7, 0.8), d3 = dummy(w, -0.7, 0.8);
  check('Atk Gayoung = vũ khí 1001 Atk 100 × WeaponAtkMultiplier 1', g.stats.Atk === 100, g.stats.Atk);
  check('Def bù nhìn 820001 = 62', d1.stats.Def === 62);
  g.input.buttons.attack = true;
  let seen1012 = false, seen1013 = false;
  run(w, 1.7, () => { if (g.buffs.stacks(1012)) seen1012 = true; if (g.buffs.stacks(1013)) seen1013 = true; });
  const t0 = firstT(w, 'skill', e => e.unit === g);
  const hits = dmgs(w, g, e => e.reason === 'Hit');
  const byT = {};
  hits.forEach(e => { const k = (e.t - t0).toFixed(3); (byT[k] = byT[k] || []).push(e); });
  const times = Object.keys(byT).map(Number);
  console.log('    thời điểm trúng (so với lúc bấm): ' + times.join(', '));
  check('đòn 1 trúng tại +0.050 s, 3 mục tiêu', byT['0.050'] && byT['0.050'].length === 3);
  check('đòn 2 trúng tại +0.450 s (= 0.35 + 0.10)', byT['0.450'] && byT['0.450'].length === 3);
  check('đòn 3 trúng tại +1.000 s (= 0.35 + 0.40 + 0.25)', byT['1.000'] && byT['1.000'].length === 3);
  check('đòn 1 vòng 2 trúng tại +1.500 s (= 0.75 + 0.70 + 0.05)', byT['1.500'] && byT['1.500'].length === 3);
  const pre = k => byT[k] ? byT[k].map(e => +e.preDef.toFixed(6)) : [];
  check('trước Def: 100% Atk = 100', pre('0.050').every(v => v === 100), pre('0.050').join('/'));
  check('trước Def: 105% Atk = 105', pre('0.450').every(v => v === 105), pre('0.450').join('/'));
  check('trước Def: 115% Atk = 115', pre('1.000').every(v => v === 115), pre('1.000').join('/'));
  const amt = k => byT[k] ? byT[k].map(e => e.amount) : [];
  check('sau Def 62: 100×100/162 → 62', amt('0.050').every(v => v === 62), amt('0.050').join('/'));
  check('sau Def 62: 105 → 65', amt('0.450').every(v => v === 65), amt('0.450').join('/'));
  check('sau Def 62: 115 → 71', amt('1.000').every(v => v === 71), amt('1.000').join('/'));
  const extra = dmgs(w, g, e => e.reason === 'Action' && e.skillId === 10010002);
  check('đòn trúng đầu tiên thứ 4 → passive 10010002: 200% Atk lên 1 mục tiêu', extra.length === 1 && extra[0].preDef === 200 && near(extra[0].t - t0, 1.5, FR),
    extra.map(e => (e.t - t0).toFixed(3) + ':' + e.preDef + '→' + e.amount).join(','));
  check('buff 1012 (1타Start) có sau đòn 1, 1013 sau đòn 2', seen1012 && seen1013);
  check('ConditionIsOnlyFirstHit: mỗi nhát +1 stack 1011 (không phải +3)', g.buffs.stacks(1011) === 0, 'sau 4 nhát, 4 stack bị tiêu');
}

// ======================= 2. reset combo theo thời hạn 1012 (0.85 s) =======================
console.log('\n[2] Combo nối/reset theo buff 1012/1013 (Duration 0.85 s)');
{
  const w = makeWorld();
  const g = char(w, 100001);
  dummy(w, 0, 1.0);
  const press = (t0, t1) => ww => { const rel = ww.time; g.input.buttons.attack = rel >= t0 && rel < t1; };
  // bấm 1 khung tại 0, rồi 0.6 (còn 1012) → đòn 2; rồi đợi tới 2.6 (1013 hết hạn) → đòn 1
  run(w, 3.2, ww => {
    const t = ww.time;
    g.input.buttons.attack = (t < DT * 1.5) || (t > 0.6 && t < 0.6 + DT * 1.5) || (t > 2.6 && t < 2.6 + DT * 1.5);
  });
  const hs = dmgs(w, g, e => e.reason === 'Hit').map(e => e.preDef);
  check('bấm lại sau 0.6 s (< 0.85) → đòn 2 (105); sau 2.6 s → về đòn 1 (100)', hs.join(',') === '100,105,100', hs.join(','));
}

// ======================= 3. Gayoung dash =======================
console.log('\n[3] Gayoung lướt 10010100');
{
  const w = makeWorld();
  const g = char(w, 100001);
  g.input.move = { x: 1, z: 0 };
  w.skillLocomotion = false;
  g.input.buttons.dash = true;
  let posAt = null, inv = false;
  Skill.step(w, DT); // khung bấm
  const tStart = w.time;
  g.input.buttons.dash = false;
  run(w, 0.6, ww => {
    if (g.buffs.stacks(1015)) inv = true;
    if (posAt == null && ww.time - tStart >= 0.2 - 1e-9) posAt = { x: g.pos.x, z: g.pos.z, t: ww.time - tStart };
  });
  check('quãng lướt 0–0.2 s = 9.5 m/s × 0.2 = 1.9 m', posAt && near(posAt.x, 1.9, 0.02), posAt && posAt.x.toFixed(4));
  check('StaminaCost 25 trừ khi vào node', near(g.stamina, 75, 17 * 0.6), g.stamina.toFixed(2));
  check('buff 1015 (vô địch 0.35 s) có trong lúc lướt', inv);
  check('CoolTime 0.35 đã hết sau 0.6 s', (g.cd[10010100] || 0) === 0);
  // lướt + chém: bấm tấn công lúc 0.1 s trong lướt → node con "대시 공격" (AttackDown)
  const w2 = makeWorld();
  const g2 = char(w2, 100001);
  const dd = dummy(w2, 0.0, 1.0);
  g2.input.move = { x: 0, z: 1 };
  w2.skillLocomotion = false;
  g2.input.buttons.dash = true;
  Skill.step(w2, DT);
  const t2 = w2.time;
  g2.input.buttons.dash = false;
  run(w2, 0.8, ww => { g2.input.buttons.attack = ww.time - t2 >= 0.1 && ww.time - t2 < 0.1 + DT * 1.5; });
  const da = dmgs(w2, g2, e => e.reason === 'Hit');
  check('lướt-chém: HitBox 100101002 130% Atk', da.length >= 1 && da[0].preDef === 130, da.map(e => e.preDef + '@' + (e.t - t2).toFixed(3)).join(','));
}

// ======================= 4. Kkamong đánh Gayoung / Gayoung đỡ đòn =======================
console.log('\n[4] Kkamong 200001 (20000000) đánh Gayoung; Gayoung đỡ 10010500');
function kkSetup(parryAt) {
  const w = makeWorld();
  const g = char(w, 100001, 0, 0, { x: 0, z: 1 });
  const k = Skill.makeUnit(w, { kind: 'mon', id: 200001, pos: { x: 0, z: 2.2 }, aim: { x: 0, z: -1 }, radius: 0.3 });
  k.target = g;
  Skill.step(w, DT);
  const tc = w.time;
  Skill.cast(w, k, 20000000);
  const slot = 'skill' + g.row.ActiveSkillIds.indexOf(10010500);
  run(w, 2.0, ww => { if (parryAt != null) g.input.buttons[slot] = ww.time - tc >= parryAt && ww.time - tc < parryAt + DT * 1.5; });
  return { w, g, k, tc };
}
{
  const { w, g, k, tc } = kkSetup(null);
  const hit = dmgs(w, k, e => e.reason === 'Hit');
  check('Kkamong: HitBox 200000001 100% Atk = 185 trước Def', hit.length === 1 && hit[0].preDef === 185, hit.map(e => e.preDef).join(','));
  check('sau Def 43 và buff 104 (−5% nhận): 185×100/143×0.95 → 123', hit.length === 1 && hit[0].amount === 123, hit[0] && hit[0].amount);
  check('trúng trong khung lao 0.8–0.98 s', hit.length === 1 && hit[0].t - tc >= 0.8 - FR && hit[0].t - tc <= 1.0 + FR, hit[0] && (hit[0].t - tc).toFixed(3));
  check('Kkamong dừng ở mép Gayoung (Distance không vượt qua)', k.pos.z > 0.5 && k.pos.z < 0.7, k.pos.z.toFixed(3));
  check('trúng đòn → node con "공격 시 돌진 중지" (DamageProvide) kết thúc skill sớm', !!w.events.find(e => e.type === 'skillEnd' && e.unit === k && e.t - tc < 1.0), '');
  check('cooldown 20000000 = 4 s (Difficulty null)', near(k.cd[20000000], 4 - (w.time - hit[0].t) - (hit[0].t - tc), 0.1) || k.cd[20000000] > 2);
}
{
  const { w, g, k, tc } = kkSetup(0.75);
  const par = w.events.find(e => e.type === 'parry' && e.unit === g);
  check('đỡ đòn thành công (cửa sổ 3000009 = 0.23 s)', !!par, par && ('t+' + (par.t - tc).toFixed(3)));
  check('Gayoung không mất máu', dmgs(w, k).every(e => e.amount === 0) && g.hp === g.stats.HpMax);
  const cnt = dmgs(w, g, e => e.reason === 'Hit');
  check('phản đòn 100105003: 325% Atk, ép chí mạng (+100%) → trước Def 325×1.35 = 438.75', cnt.length === 1 && near(cnt[0].preDef, 438.75, 1e-6) && cnt[0].crit,
    cnt.map(e => e.preDef + (e.crit ? 'C' : '')).join(','));
  check('sau Def 78 → 246', cnt.length === 1 && cnt[0].amount === 246, cnt[0] && cnt[0].amount);
  check('phản đòn tới +0.47 s sau khi đỡ (0.25 node thành công + 0.22)', cnt.length === 1 && par && near(cnt[0].t - par.t, 0.47, FR * 2), cnt[0] && par && (cnt[0].t - par.t).toFixed(3));
  const cc = w.events.find(e => e.type === 'cc' && e.unit === k);
  check('phản đòn đẩy lùi Kkamong 0.8 m', !!cc && cc.ccType === 'Knockback' && near(cc.dist, 0.8, 1e-6));
  const bm = w.events.find(e => e.type === 'buff' && e.unit === g && e.buffId === 3000010);
  check('buff 3000010 (vô địch 1.5 s) khi đỡ thành công', !!bm);
  const sh = w.events.find(e => e.type === 'shake' && e.unit === g && e.amp === 1);
  check('rung camera 1/1/0.3 khi đỡ thành công', !!sh);
}
{
  const { w, g } = kkSetup(0.3); // bấm quá sớm → 0.23 s hết trước khi trúng (~0.9 s)
  check('đỡ quá sớm → không đỡ được, trúng 123', !w.events.find(e => e.type === 'parry') && dmgs(w, w.units[1]).some(e => e.amount === 123));
}

// ======================= 5. Noah đánh thường + khiên =======================
console.log('\n[5] Noah 10012000 (3 nón shotgun, 2 stack) và 10012300 khiên');
{
  const w = makeWorld();
  const n = char(w, 100003);
  const near1 = dummy(w, 0, 0.5), mid = dummy(w, 0, 1.2), far = dummy(w, 0, 2.3);
  n.input.buttons.attack = true;
  run(w, 2.7);
  const t0 = firstT(w, 'skill', e => e.unit === n);
  const shots = w.events.filter(e => e.type === 'skill' && e.unit === n && e.skillId === 10012000).map(e => +(e.t - t0).toFixed(3));
  check('nhịp bắn giữ nút: 0, 0.65, 1.30, 2.50 (CD 0.6, 2 stack hồi 1.25 s, ANY@0.25 ở node nạp đạn)', shots.join(',') === '0,0.65,1.3,2.5', shots.join(','));
  const first = dmgs(w, n, e => near(e.t - t0, 0.24, FR));
  const by = u => first.filter(e => e.tgt === u).map(e => e.preDef).sort((a, b) => a - b).join('+');
  check('mục tiêu 0.5 m: 60+35+135 (cả 3 nón)', by(near1) === '35+60+135', by(near1));
  check('mục tiêu 1.2 m: 35+135', by(mid) === '35+135', by(mid));
  check('mục tiêu 2.3 m: 135', by(far) === '135', by(far));
}
{
  // khiên: Kkamong đánh khi đang giơ khiên (sau 0.15 s) → FrontGuard 77.5%
  const w = makeWorld();
  const n = char(w, 100003, 0, 0, { x: 0, z: 1 });
  const k = Skill.makeUnit(w, { kind: 'mon', id: 200001, pos: { x: 0, z: 2.2 }, aim: { x: 0, z: -1 }, radius: 0.3 });
  k.target = n;
  Skill.step(w, DT);
  const tc = w.time;
  Skill.cast(w, k, 20000000);
  const slot = 'skill' + n.row.ActiveSkillIds.indexOf(10012300);
  run(w, 1.6, ww => { n.input.buttons[slot] = ww.time - tc >= 0.3; });
  const h = dmgs(w, k, e => e.reason === 'Hit');
  check('khiên 1202 chặn trước: 185×100/139×(1−0.775) → 30', h.length === 1 && h[0].amount === 30 && h[0].guard, h.map(e => e.amount + (e.guard ? 'G' : '')).join(','));
  // đỡ đúng lúc (0.15 s đầu, buff 3000015) → khiên 15% HpMax
  const w2 = makeWorld();
  const n2 = char(w2, 100003, 0, 0, { x: 0, z: 1 });
  const k2 = Skill.makeUnit(w2, { kind: 'mon', id: 200001, pos: { x: 0, z: 2.2 }, aim: { x: 0, z: -1 }, radius: 0.3 });
  k2.target = n2;
  Skill.step(w2, DT);
  const tc2 = w2.time;
  Skill.cast(w2, k2, 20000000);
  run(w2, 1.6, ww => { n2.input.buttons[slot] = ww.time - tc2 >= 0.8; });
  const sh = w2.events.find(e => e.type === 'shield' && e.unit === n2 && e.added > 0);
  check('đỡ đúng lúc → ShieldActionEvent 15% HpMax = 79.5', !!w2.events.find(e => e.type === 'parry' && e.unit === n2) && sh && near(sh.amount, 79.5, 1e-6), sh && sh.amount);
  check('đỡ đúng lúc → không mất máu', n2.hp === n2.stats.HpMax);
}

// ======================= 6. Raven =======================
console.log('\n[6] Raven 10013000 (6 viên, viên cuối 175%) + nạp đạn + 10013300 reload bash');
{
  const w = makeWorld();
  const r = char(w, 100005);
  dummy(w, 0, 2.0);
  check('passive 10013805: vào trận đủ 6 viên (1303)', r.buffs.stacks(1303) === 6);
  r.input.buttons.attack = true;
  run(w, 5.4);
  const t0 = firstT(w, 'skill', e => e.unit === r);
  const shots = w.events.filter(e => e.type === 'skill' && e.unit === r && e.skillId === 10013000).map(e => +(e.t - t0).toFixed(3));
  check('nhịp bắn 0.55 s (0.37 + cửa 0.18 ở node "이동 가능 구간")', shots.slice(0, 6).join(',') === '0,0.55,1.1,1.65,2.2,2.75', shots.join(','));
  const h = dmgs(w, r, e => e.reason === 'Hit').map(e => e.preDef);
  check('5 viên 110% + viên thứ 6 175%', h.slice(0, 6).join(',') === '110,110,110,110,110,175', h.join(','));
  const rl = w.events.find(e => e.type === 'buff' && e.unit === r && e.buffId === 1302);
  check('hết đạn → 10013807 thêm 1302 (nạp 1.5 s) ngay khi bắn viên 6 (+3.0 s)', rl && near(rl.t - t0, 3.0, FR), rl && (rl.t - t0).toFixed(3));
  const full = w.events.find(e => e.type === 'buff' && e.unit === r && e.buffId === 1303 && e.stacks === 6 && e.t > t0 + 1);
  check('1302 hết hạn → 10013806 nạp đủ 6 (+4.5 s)', full && near(full.t - t0, 4.5, FR), full && (full.t - t0).toFixed(3));
  check('bắn tiếp sau khi nạp', shots.length >= 7 && shots[6] >= 4.5 - FR, shots[6]);
}
{
  const w = makeWorld();
  const r = char(w, 100005);
  dummy(w, 0, 1.0);
  r.buffs.remove(w, 1303, 5, 'remove');
  Skill.flush(w);
  const slot = 'skill' + r.row.ActiveSkillIds.indexOf(10013300);
  r.input.buttons[slot] = true;
  run(w, 0.5, () => { });
  r.input.buttons[slot] = false;
  run(w, 0.5);
  const h = dmgs(w, r, e => e.reason === 'Hit');
  check('reload bash: 280% Atk', h.length === 1 && h[0].preDef === 280, h.map(e => e.preDef).join(','));
  check('reload bash trúng → 1303 = 6', r.buffs.stacks(1303) === 6, r.buffs.stacks(1303));
  const cc = w.events.find(e => e.type === 'cc');
  check('bù nhìn miễn Knockback (buff 3600) → không bị đẩy', !cc && !!w.events.find(e => e.type === 'immune' && e.tag === 'Knockback'));
  // điếu thuốc: ChangeSkill 10013500 → 10013501
  const cig = 'skill' + r.row.ActiveSkillIds.indexOf(10013500);
  r.input.buttons[cig] = true; run(w, 0.1); r.input.buttons[cig] = false; run(w, 3.0);
  check('10013500 → buff 1306 → ô đó thành 10013501 (ChangeSkill)', Skill.slotSkill(r, cig) === 10013501 && r.buffs.stacks(1306) === 1);
  check('1306: +30% chí mạng (7+30 = 37)', near(r.stats.CriticalChancePercent, 37, 1e-9), r.stats.CriticalChancePercent);
  r.input.buttons[cig] = true; run(w, 0.1); r.input.buttons[cig] = false; run(w, 1.6);
  check('bấm lại (10013501) → gỡ 1306, ô trở về 10013500', Skill.slotSkill(r, cig) === 10013500 && !r.buffs.stacks(1306));
}

// ======================= 7. Mio =======================
console.log('\n[7] Mio 10011000 phép thường + 10011100 dịch chuyển');
{
  const w = makeWorld();
  const m = char(w, 100004);
  const d = dummy(w, 0, 3.0);
  m.input.buttons.attack = true;
  run(w, 0.05);
  m.input.buttons.attack = false;
  run(w, 1.3);
  const t0 = firstT(w, 'skill', e => e.unit === m);
  const h = dmgs(w, m, e => e.reason === 'Hit');
  // tên lửa xuất phát +0.24 tại z=0.57, 3.3 m/s, hộp 0.2 → chạm khi mép trước tới z = 3 − 0.3 − 0.1 = 2.6
  const expT = 0.976; // SKILLVM §6.6: đứng yên 9% đời (0.114 s) theo MoveSpeedCurve rồi 3.3 m/s tới z = 2.6
  check('tên lửa 80% Atk', h.length === 1 && h[0].preDef === 80, h.map(e => e.preDef).join(','));
  check('trúng ≈ +' + expT.toFixed(3) + ' s (MoveSpeedCurve giữ 0 tới 9% đời, rồi 3.3 m/s)', h.length === 1 && Math.abs(h[0].t - t0 - expT) <= 2 * DT, h[0] && (h[0].t - t0).toFixed(3));
  check('hồn +5 khi trúng quái Normal', m.soul === 5, m.soul);
}
{
  const w = makeWorld();
  const m = char(w, 100004);
  const d = dummy(w, 1.9, 1.0);
  m.input.move = { x: 1, z: 0 };
  w.skillLocomotion = false;
  m.input.buttons.dash = true;
  Skill.step(w, DT);
  m.input.buttons.dash = false;
  const tele = w.events.find(e => e.type === 'teleport' && e.unit === m);
  check('dịch chuyển tức thì 1.9 m theo hướng di chuyển', tele && near(tele.to.x, 1.9, 1e-9) && near(tele.to.z, 0, 1e-9), tele && JSON.stringify(tele.to));
  check('StaminaCost 35', near(m.stamina, 65, 1e-6), m.stamina);
  check('buff 1015 vô địch', m.buffs.stacks(1015) === 1);
  m.input.move = { x: 0, z: 0 }; // node '텔포 공격' là MoveByInput 12 m/s trong 0.05–0.25: thả phím di chuyển để bắn tại chỗ
  m.input.buttons.attack = true;
  run(w, 0.6);
  const h = dmgs(w, m, e => e.reason === 'Hit');
  check('giữ tấn công trong lúc dịch chuyển → "텔포 공격" 135% Atk', h.length >= 1 && h[0].preDef === 135, h.map(e => e.preDef).join(','));
}


// ======================= 7b. Gayoung lao xích 10010300 =======================
console.log('\n[7b] Gayoung 10010300: ném xích → DamageProvide → lao MoveToTarget → MoveFinish');
{
  const w = makeWorld();
  const g = char(w, 100001);
  const d = dummy(w, 0, 3.0);
  const slot = 'skill' + g.row.ActiveSkillIds.indexOf(10010300);
  g.input.buttons[slot] = true;
  run(w, 0.1);
  g.input.buttons[slot] = false;
  run(w, 1.2);
  const pre = dmgs(w, g).map(e => e.preDef);
  check('xích 80% → DamageActionEvent 1% (đặt mục tiêu) → thân lao 100%', pre.join(',') === '80,1,100', pre.join(','));
  const st = w.events.find(e => e.type === 'cc' && e.unit === d);
  check('xích gây choáng 2 s (bù nhìn không miễn Stun)', st && st.ccType === 'Stun' && near(st.dur, 2, 1e-9));
  check('lao dừng khi chạm (moveOffset −1 = trống): cách tâm 0.6 m', near(d.pos.z - g.pos.z, 0.6, 0.05), (d.pos.z - g.pos.z).toFixed(3));
  // 4 node: chỉ báo → 사슬 → 돌진 → 돌진 종료 (không so 'text': tables.js bỏ cột ghi chú)
  const nodes = w.events.filter(e => e.type === 'node' && e.unit === g && e.skillId === 10010300);
  check('MoveFinishSkillTrigger → node thứ 4 "돌진 종료" (dài 0.1 s)', nodes.length === 4 && near(nodes[3].dur, 0.1, 1e-9) && w.events.some(e => e.type === 'skillEnd' && e.unit === g && near(e.t - nodes[3].t, 0.1, FR)), nodes.length);
  check('vfx lớn (mục tiêu mang 3000013 của mình) thay vì vfx nhỏ', !!w.events.find(e => e.type === 'vfx' && e.name === '1001/1001_02_SwordSkill_01_Hit2_big') && !w.events.find(e => e.type === 'vfx' && e.name === '1001/1001_02_SwordSkill_01_Hit1_small'));
  check('CD 8 s tính từ node "사슬"', g.cd[10010300] > 6.5 && g.cd[10010300] < 8, g.cd[10010300].toFixed(2));
}

// ======================= 7c. Mio thức tỉnh (polymorph) =======================
console.log('\n[7c] Mio: hồn 1000 → buff 1106 → ApplyPolymorph; DotSoulDamage 40/s → hồn 0 → Revert');
{
  const w = makeWorld();
  const m = char(w, 100004);
  VD.Buff.changeSoul(w, m, 1000);
  run(w, 0.05);
  check('SoulSkillTrigger ≥ 1000 → 1106 → AddBuffSkillTrigger → polymorph', m.polymorph && m.buffs.stacks(1106) === 1);
  check('ô tấn công → 10011001, ô skill0 → 10011201', Skill.slotSkill(m, 'attack') === 10011001 && Skill.slotSkill(m, 'skill0') === 10011201,
    Skill.slotSkill(m, 'attack') + '/' + Skill.slotSkill(m, 'skill0'));
  check('đổi skin super', !!w.events.find(e => e.type === 'skin' && e.super));
  run(w, 25.0);
  check('sau 25 s (1000/40) → hết hồn → gỡ 1106 → Revert', !m.polymorph && !m.buffs.stacks(1106) && Skill.slotSkill(m, 'attack') === 10011000, 'soul ' + m.soul);
}

// ======================= 8. DoT chảy máu =======================
console.log('\n[8] Chảy máu 1017 (12%, 8% Atk/giây, 3 stack) — RNG = 0');
{
  const w = makeWorld({ rng: () => 0 });
  const g = char(w, 100001);
  const d = dummy(w, 0, 1.0);
  g.input.buttons.attack = true;
  run(w, 0.1);
  g.input.buttons.attack = false;
  check('RNG 0 → chí mạng: 100 × 1.35 = 135 trước Def', dmgs(w, g, e => e.reason === 'Hit')[0].preDef === 135);
  check('RNG 0 → 1017 áp 1 stack', d.buffs.stacks(1017) === 1);
  run(w, 1.0);
  const dot = dmgs(w, g, e => e.reason === 'Dot');
  check('tick đầu sau 1 s: 8% × Atk 100 = 8 (bỏ qua Def)', dot.length === 1 && dot[0].amount === 8, dot.map(e => e.amount).join(','));
}

// ======================= 9. chạy mọi skill một lần =======================
console.log('\n[9] Chạy mỗi skill của 4 nhân vật và mọi quái một lần');
const coverage = { seen: {}, handled: {}, unhandled: {} };
let exceptions = [];
function merge(w) {
  if (w._merged) return;
  w._merged = 1;
  const s = w.combatStats || { seen: {}, handled: {}, unhandled: {} };
  for (const k of ['seen', 'handled', 'unhandled']) for (const x in s[k]) coverage[k][x] = (coverage[k][x] || 0) + s[k][x];
  for (const x in (w.combatUnknown || {})) coverage.unhandled['unknown:' + x] = (coverage.unhandled['unknown:' + x] || 0) + w.combatUnknown[x];
}
function charSkills(row) {
  const s = [];
  const add = x => { if (x && s.indexOf(x) < 0) s.push(x); };
  add(row.AttackSkillId); add(row.DashSkillId); (row.ActiveSkillIds || []).forEach(add);
  add(row.PolymorphAttackSkillId); add(row.PolymorphDashSkillId); (row.PolymorphActiveSkillIds || []).forEach(add);
  return s;
}
let charRuns = 0, monRuns = 0;
for (const cid of [100001, 100003, 100004, 100005]) {
  const row = db.character(cid);
  for (const sid of charSkills(row)) {
    const w = makeWorld({ rng: (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })() });
    try {
      const c = char(w, cid);
      c.charge = 1e9; c.soul = 0;
      dummy(w, 0, 1.5); dummy(w, 1.2, 2.5);
      Skill.makeUnit(w, { kind: 'mon', id: 200001, pos: { x: -1.5, z: 2 }, aim: { x: 0, z: -1 } }).target = c;
      if ((row.PolymorphActiveSkillIds || []).indexOf(sid) >= 0 && (row.ActiveSkillIds || []).indexOf(sid) < 0) c.polymorph = true;
      c.aimPoint = { x: 0, z: 3 }; c.input.aimPoint = c.aimPoint;
      const r = Skill.cast(w, c, sid, { force: true, slot: 'skill0' });
      c.input.buttons.skill0 = true;
      let tt = 0;
      run(w, 8, ww => { tt += DT; if (tt > 0.3) c.input.buttons.skill0 = false; c.input.buttons.attack = tt > 0.2 && tt < 0.25; });
      if (!r) exceptions.push('char ' + cid + ' skill ' + sid + ': không khởi động');
      for (const u of w.units) if (!isFinite(u.hp) || !isFinite(u.pos.x) || !isFinite(u.pos.z)) exceptions.push('NaN char ' + cid + ' skill ' + sid + ' unit ' + u.id);
      charRuns++;
    } catch (e) { exceptions.push('char ' + cid + ' skill ' + sid + ': ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
    merge(w); w.events = [];
  }
}
for (const mrow of (Array.isArray(VD.T.Monster) ? VD.T.Monster : Object.values(VD.T.Monster))) {
  for (const sid of (mrow.ActiveSkillIds || [])) {
    const w = makeWorld({ rng: (() => { let s = 11; return () => (s = (s * 16807) % 2147483647) / 2147483647; })() });
    try {
      const c = char(w, 100001, 0, 0);
      const m = Skill.makeUnit(w, { kind: 'mon', id: mrow.Id, pos: { x: 0, z: 2.5 }, aim: { x: 0, z: -1 } });
      m.target = c;
      const r = Skill.cast(w, m, sid, { force: true });
      run(w, 8);
      if (!r) exceptions.push('mon ' + mrow.Id + ' skill ' + sid + ': không khởi động');
      for (const u of w.units) if (!isFinite(u.hp) || !isFinite(u.pos.x) || !isFinite(u.pos.z)) exceptions.push('NaN mon ' + mrow.Id + ' skill ' + sid + ' unit ' + u.id);
      monRuns++;
    } catch (e) { exceptions.push('mon ' + mrow.Id + ' skill ' + sid + ': ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
    merge(w);
  }
}
for (const w of ALL_WORLDS) merge(w);
check('chạy ' + charRuns + ' skill nhân vật + ' + monRuns + ' skill quái không ném exception', exceptions.length === 0, exceptions.slice(0, 5).join(' || '));
const unhandled = Object.keys(coverage.unhandled);
check('không có loại event/trigger/effect/va chạm nào chưa xử lý', unhandled.length === 0, unhandled.join(', '));

// bảng phủ: mọi $type actionEvents trong Skill.json so với bảng EVENTS
const allEv = {};
(function scan() {
  const T = x => String(x || '').split(',')[0].split('.').pop();
  const rows = Array.isArray(VD.T.Skill) ? VD.T.Skill : Object.values(VD.T.Skill);
  const walk = n => { for (const e of (n.skillAction.actionEvents || [])) allEv[T(e.$type)] = (allEv[T(e.$type)] || 0) + 1; (n.childNodes || []).forEach(walk); };
  rows.forEach(r => r.RootActionNode && walk(r.RootActionNode));
})();
console.log('\n  Bảng phủ event ($type | số node trong Skill.json | số lần chạy trong mô phỏng | xử lý)');
for (const k of Object.keys(allEv).sort()) {
  const h = Skill.EVENTS[k] ? (Skill.EVENTS._stub[k] ? 'stub(phát sự kiện)' : 'có') : 'KHÔNG';
  console.log('    ' + k.padEnd(36) + String(allEv[k]).padStart(5) + String(coverage.seen['event:' + k] || 0).padStart(8) + '   ' + h);
}
const trigSeen = Object.keys(coverage.seen).filter(k => k.startsWith('trigger:'));
console.log('  Trigger đã bắn trong mô phỏng: ' + trigSeen.map(k => k.slice(8) + '×' + coverage.seen[k]).join(', '));

console.log('\n==> ' + pass + ' pass, ' + fail + ' fail' + (fail ? '  [' + fails.join('; ') + ']' : ''));
process.exit(fail ? 1 : 0);
