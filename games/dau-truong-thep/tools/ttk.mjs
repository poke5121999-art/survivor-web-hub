// Time-to-kill matrix: every attacker against every defender of the 16 mechs, scripted (no bots), through createMatch and step only.
//   node tools/ttk.mjs [--tag before] [--check] [--quick]
//   --tag T   writes <repo>/.chk/ttk-T.md and ttk-T.json (default tag "run")      --check   exits 1 when a burst-vs-healer pair misses the targets
//   --quick   level 0 only, no matrix on disk (used while tuning)                   TTK_JS=<dir with js/>  measures another checkout
// The attacker stands at its preferred range with a clear line, fires all the time and plays its best kill sequence (SEQ below: marks, stances, ultimates).
// (A dome ultimate is a stall, not a heal: the attacker waits it out, so the lone defender does not use it; a supporting Bach Hac does.)
// The defender stands still, shoots back and uses what a competent player uses to survive: the heal item, its own shields, heals, armour buffs.
// Conditions: a = alone; bh = Bach Hac behind it; bd = Dom Dom behind it; c = Kim Quy beside it. Level 0 and level 5 on every track (both sides).
// Cell: seconds to kill from full hp (null = alive after 30 s), weapon shots fired, biggest single hit and best 3 s of damage as % of the defender's max hp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JS = process.env.TTK_JS ? path.resolve(process.env.TTK_JS, 'js') : path.resolve(HERE, '..', 'js');
const load = (f) => import(path.join(JS, f));
const { createMatch, step } = await load('sim.js');
const { MECH_ORDER, MECHS, TICK, RULES } = await load('data.js');
const { OLD_DOMDOM } = await import('./k13-cases.mjs');   // kit lane K13: the old heal-ray Đom Đóm (fixture)
// TTK_PATCH='MECHS.hac.hp = 1800' evaluates a what-if on the loaded tables before the matrix (nothing is written to js/).
if (process.env.TTK_PATCH) new Function('RULES', 'MECHS', process.env.TTK_PATCH)(RULES, MECHS);

const args = process.argv.slice(2);
const flag = (k) => args.includes(k), val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const TAG = val('--tag', 'run'), QUICK = flag('--quick'), CHECK = flag('--check');
const REACT = 0.35, LIMIT = 30, MAXLV = [5, 5, 5, 5, 5];

// Attacker kits: d = distance to the defender, seq = [slot, start second, once?], fireAt = second the trigger is first held.
const SEQ = {
  trau: { d: 8, seq: [['s2', 0], ['ult', 0.6]] },
  soi: { d: 9, seq: [['s2', 0], ['s1', 0.1], ['ult', 0.2]] },
  ung: { d: 13, seq: [['s1', 0], ['ult', 0.2], ['s2', 1.4]] },
  hac: { d: 9, seq: [] },
  loi: { d: 9, seq: [['s2', 0], ['s1', 0.1], ['ult', 0.2], ['s2', 3.1]] },   // kit lane k16: ball, bolt, hammer, then the second ball; the third skill hit stuns
  bocap: { d: 5, seq: [['s1', 0], ['ult', 1.6], ['s2', 1.7]] },
  bang: { d: 4.5, seq: [['s1', 0], ['s2', 0.1], ['ult', 0.5], ['s1', 4.2]] },
  tho: { d: 8, seq: [['s1', 0], ['ult', 0.3]] },
  thancong: { d: 10, seq: [['s1', 0, true], ['s2', 0.9], ['ult', 0.9]], fireAt: 0.9 },
  mangxa: { d: 6, seq: [['s1', 0], ['ult', 0.5]] },
  kimquy: { d: 6, seq: [] },
  hacho: { d: 5, seq: [['ult', 0], ['s2', 0], ['s1', 0.3]], fireAt: 0.3 },
  holy: { d: 9, seq: [] },
  domdom: { d: 5, seq: [['s1', 0], ['s2', 0.6], ['ult', 0.7]] },   // kit lane K13: eye, spear, temple
  tacke: { d: 12, seq: [['s2', 0], ['ult', 0.3]] },
  hoalong: { d: 2.2, seq: [['s1', 0, true], ['ult', 0.1, true], ['s2', 2.3, true]] },   // kit lane k15: the p4 lava brawler (armour, heat, blast inside the stun core)
  khiphao: { d: 9, seq: [['s1', 0], ['ult', 0.2]] },
  quancong: { d: 5, seq: [['s1', 0], ['s2', 0.3], ['ult', 0.5]] },
  natra: { d: 7, seq: [['ult', 0, true], ['s1', 0.7], ['s2', 1.2]], fireAt: 0.7 },
  duongtien: { d: 3, seq: [['s1', 0], ['ult', 0.4], ['s2', 1.0]] },   // kit lane K13: Trảm Tiên marks, then every hit pays +150 (recasts left out)
  athena: { d: 8, seq: [['s1', 0]] },
  hades: { d: 9, seq: [['ult', 0, true], ['s1', 1.3, true], ['s2', 1.6]] },   // kit lane k15: Giáng Lâm onto it, then the scythe form and its Lợi Nhận
  lubo: { d: 5, seq: [['s1', 0], ['s2', 0.3, true], ['ult', 0.8]] },
  mucma: { d: 5, seq: [['ult', 0], ['s2', 0.3], ['s1', 0.6]] },
  kynhong: { d: 5, seq: [['ult', 0], ['s2', 0.2], ['s1', 0.7]] },
  nguma: { d: 5, seq: [['ult', 0], ['s2', 0.8], ['s1', 1.2]] },
  sontinh: { d: 9, seq: [['s2', 0], ['ult', 4.2]] },   // the rage first (three rocks a throw), then the god once it is over
  enbac: { d: 8, seq: [['s2', 0], ['ult', 0.3], ['s1', 1.2]] },
  boica: { d: 14, seq: [['s1', 0], ['ult', 0.2]], fireAt: 0.1 },
  bohung: { d: 5, seq: [['s2', 0], ['s1', 0.3], ['ult', 0.6]] },
  cakiem: { d: 5, seq: [['s2', 0], ['s1', 0.4], ['ult', 0.8]] },
  gilgamesh: { d: 8, seq: [['s1', 0], ['s2', 0.1], ['ult', 0.3]] },
  buomdem: { d: 11, seq: [['s2', 0], ['s1', 0.2], ['ult', 0.4]] },
  laclong: { d: 6, seq: [['ult', 0], ['s1', 0.5], ['s2', 0.8]] },
  baogam: { d: 5, seq: [['s2', 0], ['s1', 0.5], ['ult', 1.2]] },
  luondien: { d: 8, seq: [['s2', 0], ['ult', 0.2], ['s1', 0.5]] },
  tegiac: { d: 5, seq: [['s2', 0], ['s1', 0.7], ['ult', 1.3]] },   // the ult is held: it goes off by itself at a full 3 s charge
  quaset: { d: 7, seq: [['ult', 0], ['s1', 0.3], ['s2', 0.8]] },
  tumay: { d: 6, seq: [['s2', 0], ['s1', 0.7], ['ult', 1.2]] },
  dieuthuyen: { d: 8, seq: [['s2', 0], ['s1', 0.6], ['ult', 1.0]] },
  thuytinh: { d: 7, seq: [['ult', 0], ['s1', 0.6], ['s2', 0.9]] },
  samthep: { d: 7, seq: [['s2', 0], ['s1', 0.5], ['ult', 0.8]] },
  cuuvi: { d: 8, seq: [['ult', 0], ['s1', 0.4]] },
  kiemthan: { d: 6, seq: [['s2', 0], ['s1', 0.3], ['ult', 0.6]] },
  suatrang: { d: 8, seq: [['s2', 0]] },
  khidot: { d: 5, seq: [['ult', 0], ['s2', 0.2], ['s1', 0.7]] },
  retdo: { d: 6, seq: [['ult', 0], ['s1', 0.3]] },
  nhenthep: { d: 6, seq: [['s2', 0], ['ult', 0.3], ['s1', 0.9]] },
  taothao: { d: 5, seq: [['s2', 0], ['ult', 0.4], ['s1', 4]] },   // the hand drags it in; the hold fires R by itself; R again when its cooldown allows
  bongua: { d: 5, seq: [['s1', 0], ['s2', 0.3], ['ult', 0.7]] },
  moclan: { d: 5, seq: [['s1', 0], ['s2', 0.5], ['ult', 1.8]] },
  anduong: { d: 13, seq: [['ult', 0], ['s2', 0.2], ['s1', 0.5], ['s2', 0.7]] },
  chuottui: { d: 9, seq: [['s2', 0], ['ult', 0.6]] },
  vesau: { d: 12, seq: [['s2', 0]] },
};
// Defender self-sustain: [slot, press while hp fraction is below, once?, target: 'self' | 'foe'].
const SELF = {
  trau: [['s1', 0.97]],
  hac: [['s1', 0.95]],
  kimquy: [['s1', 0.95, false, 'self'], ['s2', 0.9], ['ult', 0.7]],
  domdom: [['s2', 0.97], ['s1', 0.95], ['ult', 0.8]],   // kit lane K13: every press wraps her in the bullet-eating wind
  hacho: [['s2', 0.8]],
  thancong: [['s1', 2, true]],
};

const inp = (o) => ({ mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0, ...o });
const SL = ['s1', 's2', 'ult'];

function cell(att, def, lv, cond) {
  const mods = { lv };
  const roster = [{ team: 0, mech: att, name: 'A', mods }, { team: 1, mech: def, name: 'D', mods }];
  if (cond === 'bh') roster.push({ team: 1, mech: 'hac', name: 'H', mods });
  if (cond === 'bd') roster.push({ team: 1, mech: 'domdom', name: 'H', mods });
  if (cond === 'c') roster.push({ team: 1, mech: 'kimquy', name: 'K', mods });
  const m = createMatch({ seed: 5, roster });
  m.map.walls.length = 0; m.map.rounds.length = 0; m.map.bushes.length = 0; m.map.hazards.length = 0;
  for (const p of m.props) p.alive = false;
  m.crateT = 1e9;
  const kit = SEQ[att], [A, D, S] = m.units, d = kit.d;
  if (cond === 'bd') { S.def = { ...S.def, ...OLD_DOMDOM }; S.passive = OLD_DOMDOM.passive.do; }   // kit lane K13: the healer condition keeps the heal-ray Đom Đóm
  const put = (u, x, z, aim) => { u.x = u.px = x; u.z = u.pz = z; u.aim = u.heading = aim; u.combatT = 0; };
  put(A, -d, 0, 0); put(D, 0, 0, Math.PI);
  if (S) put(S, cond === 'c' ? 0.5 : 2.2, cond === 'c' ? 2.4 : 0, Math.PI);
  A.maxHp = A.hp = 1e9;
  const once = new Set();
  let seen = null;   // the defender reacts REACT seconds after it first loses hp (a person is not instant)
  const hits = [];   // [time, share] of the attacker's damage on the defender
  let shots = 0, kill = null, maxHit = 0;
  const hpFrac = () => D.hp / D.maxHp;
  let prev = D.hp;
  for (let i = 0; i < LIMIT / TICK && kill === null; i++) {
    const t = i * TICK, ins = m.units.map(() => inp({}));
    // attacker
    const gap = Math.hypot(D.x - A.x, D.z - A.z), a = inp({ aim: Math.atan2(D.z - A.z, D.x - A.x), tx: D.x, tz: D.z, fire: t >= (kit.fireAt || 0) });
    // keep the preferred range when a knock-back shoves the defender away (a pushed target is not a longer shot, the attacker follows)
    if (gap > d + 0.6) { a.mx = (D.x - A.x) / gap; a.mz = (D.z - A.z) / gap; }
    for (const [slot, at, one] of kit.seq) if (t >= at) { const k = slot + A.id; if (one) { if (!once.has(k)) { once.add(k); a[slot] = true; } } else a[slot] = true; }
    ins[A.id] = a;
    // defender
    if (seen === null && D.hp < D.maxHp) seen = t;
    const toA = Math.atan2(A.z - D.z, A.x - D.x), f = seen !== null && t >= seen + REACT ? hpFrac() : 1;
    const d0 = inp({ aim: toA, tx: D.x, tz: D.z, fire: true, heal: f < 0.6 });
    // the supporter watches the defender's real hp with the same delay
    const df = f;
    for (const [slot, below, one, tgt] of SELF[def] || []) {
      if (f >= below) continue;
      const k = slot + 'D';
      if (one) { if (once.has(k)) continue; once.add(k); }
      d0[slot] = true;
      if (tgt === 'foe') { d0.tx = A.x; d0.tz = A.z; }
    }
    ins[D.id] = d0;
    // supporter
    if (S) {
      const sf = df, s = inp({ aim: Math.atan2(A.z - S.z, A.x - S.x), tx: A.x, tz: A.z, fire: true });
      if (cond === 'bh') { s.s1 = sf < 0.9; s.ult = sf < 0.55; s.s2 = true; }
      if (cond === 'bd') { s.aim = Math.atan2(D.z - S.z, D.x - S.x); s.tx = D.x; s.tz = D.z; s.s1 = !once.has('drone') && !!once.add('drone'); s.s2 = sf < 0.95; s.ult = sf < 0.6; }
      if (cond === 'c') { s.tx = D.x; s.tz = D.z; s.s1 = sf < 0.95; s.s2 = sf < 0.9; s.ult = sf < 0.75; s.aim = Math.atan2(A.z - S.z, A.x - S.x); }
      ins[S.id] = s;
    }
    prev = D.hp;
    step(m, ins);
    let tickHit = 0;
    for (const e of m.events) {
      if (e.t === 'fire' && e.id === A.id) shots++;
      if (e.t === 'hit' && e.by === A.id && e.id === D.id) { const share = (e.amt + (e.absorbed || 0)) / D.maxHp; hits.push([t, share]); maxHit = Math.max(maxHit, share); tickHit += e.amt; }
      if (e.t === 'death' && e.id === D.id) { kill = m.time; const rest = (prev - tickHit) / D.maxHp; if (rest > 0.01) hits.push([t, rest]); }
    }
  }
  let best = 0;
  for (let i = 0, lo = 0, sum = 0; i < hits.length; i++) { sum += hits[i][1]; while (hits[i][0] - hits[lo][0] > 3) sum -= hits[lo++][1]; best = Math.max(best, sum); }
  return { t: kill === null ? null : +kill.toFixed(2), shots, hit: +(maxHit * 100).toFixed(0), c3: +(best * 100).toFixed(0) };
}

const CONDS = ['a', 'bh', 'bd', 'c'];
const levels = QUICK ? [['0', [0, 0, 0, 0, 0]]] : [['0', [0, 0, 0, 0, 0]], ['5', MAXLV]];
const out = {};
for (const [ln, lv] of levels) for (const a of MECH_ORDER) for (const d of MECH_ORDER) for (const c of CONDS) out[`${ln}|${a}|${d}|${c}`] = cell(a, d, lv, c);

const name = (k) => MECHS[k].name;
const show = (r) => (r.t === null ? `--/${r.c3}/${r.hit}` : `${r.t.toFixed(1)}/${r.c3}/${r.hit}`);
const KEY_A = ['ung', 'thancong', 'hoalong', 'loi', 'hacho', 'soi', 'bocap'], KEY_D = ['hac', 'domdom', 'trau', 'kimquy'];
const lines = [];
for (const [ln] of levels) {
  lines.push(`\n## Key pairs, level ${ln} (cell = seconds to kill / best 3 s combo % / biggest hit %; -- = alive after ${LIMIT} s)`);
  lines.push('| Attacker | ' + KEY_D.flatMap((d) => ['a', 'bh', 'bd', 'c'].map((c) => `${name(d)} ${c}`)).join(' | ') + ' |');
  lines.push('|---|' + KEY_D.flatMap(() => CONDS.map(() => '---')).join('|') + '|');
  for (const a of KEY_A) lines.push(`| ${name(a)} | ` + KEY_D.flatMap((d) => CONDS.map((c) => show(out[`${ln}|${a}|${d}|${c}`]))).join(' | ') + ' |');
}
const full = [];
if (!QUICK) for (const [ln] of levels) for (const c of CONDS) {
  full.push(`\n## Matrix level ${ln}, condition ${c}: seconds to kill (-- = never within ${LIMIT} s), rows attackers, columns defenders`);
  full.push('| | ' + MECH_ORDER.map(name).join(' | ') + ' |', '|---|' + MECH_ORDER.map(() => '---').join('|') + '|');
  for (const a of MECH_ORDER) full.push(`| ${name(a)} | ` + MECH_ORDER.map((d) => { const r = out[`${ln}|${a}|${d}|${c}`]; return r.t === null ? '--' : r.t.toFixed(1); }).join(' | ') + ' |');
}
console.log(lines.join('\n'));
if (!QUICK) {
  const dir = path.resolve(HERE, '..', '..', '..', '.chk');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `ttk-${TAG}.md`), `# Time to kill, tag ${TAG}\nScripted attacker (best kill sequence, constant fire) against a defender that stands, shoots back and uses its own sustain. Conditions: a alone, bh with Bach Hac behind, bd with Dom Dom behind, c with Kim Quy beside.\n${lines.join('\n')}\n${full.join('\n')}\n`);
  fs.writeFileSync(path.join(dir, `ttk-${TAG}.json`), JSON.stringify(out));
}

// Design intent (Addendum 13): burst kits delete a squishy healer caught out; nobody is out-healed by a lone healer; the tanks are hard to burst.
// Lôi Công (since kit lane k16: lightning, a stun on the third skill hit) and Hắc Hổ (mark, then execute under 22%) burst through many hits, so only their 3 s combo is held to a target.
// Ưng Nhãn too since kit lane K7 (clip p92): a fast magazine gun whose falcon mark bursts on every shot, no single big blow.
// Đom Đóm left HEALERS with kit lane K13: she plays the clip's wind controller now (no heals; bubbles that eat bullets, debuffs), not a healer.
const MULTI = ['loi', 'hacho', 'ung'], BURST = ['ung', 'thancong', 'hoalong', 'loi', 'hacho'], HEALERS = ['hac'], TANKS = ['trau', 'kimquy'];
const HIT = 40, bad = [];
for (const [ln] of levels) {
  for (const h of HEALERS) {
    for (const a of MECH_ORDER) {
      const r = out[`${ln}|${a}|${h}|a`], lim = BURST.includes(a) ? 6 : 10;
      if (r.t === null || r.t > lim) bad.push(`lv${ln} ${name(a)} vs lone ${name(h)}: ${r.t === null ? 'never dies' : r.t + ' s'} (limit ${lim} s)`);
    }
    for (const a of BURST) {
      const r = out[`${ln}|${a}|${h}|a`];
      if (r.c3 < 85) bad.push(`lv${ln} ${name(a)} best 3 s combo on ${name(h)} ${r.c3}% (target 85)`);
      if (r.hit < HIT && !MULTI.includes(a)) bad.push(`lv${ln} ${name(a)} biggest hit on ${name(h)} ${r.hit}% (target about 45, floor ${HIT})`);
    }
  }
  for (const t of TANKS) for (const a of BURST) { const r = out[`${ln}|${a}|${t}|a`]; if (r.t !== null && r.t <= 3.2) bad.push(`lv${ln} ${name(a)} deletes ${name(t)} within 3 s (${r.t} s)`); }
}
console.log(`\n${bad.length ? bad.length + ' misses of the Addendum 13 targets:\n' + bad.join('\n') : 'All Addendum 13 targets met.'}`);
if (CHECK && bad.length) process.exit(1);
