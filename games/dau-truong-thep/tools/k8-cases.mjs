// Kit lane k8 (feat/dtt-k8): the kits of Kurumi (vesau), Iron Man (tho) and Optimus Prime (trau) ported from the owner's clips, and
// their G5 mechanics (sim.js blocks "kit-remake G5 <tank>"). Section K8 of tools/sim-test.mjs; runs alone too: `node tools/k8-cases.mjs`.
// Expected values follow the data rows, so a balance pass keeps the arithmetic.
import { createMatch, step, LOC_KINDS } from '../js/sim.js';
import { MECHS, TICK, RULES } from '../js/data.js';

const IN = { mx: 0, mz: 0, aim: 0, fire: false, s1: false, s2: false, ult: false, heal: false, tx: 0, tz: 0 };
const inp = (o) => Object.assign({}, IN, o);
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const R = (mech, team = 0) => ({ team, mech, name: mech + team });
function put(u, x, z) { u.x = u.px = x; u.z = u.pz = z; }
function arena(units, seed = 5) {
  const m = createMatch({ seed, roster: units.map((u) => u[0]) });
  m.map.walls.length = 0; m.map.rounds.length = 0; m.map.bushes.length = 0; m.map.hazards.length = 0;
  for (const p of m.props) p.alive = false;
  units.forEach(([, x, z, aim], i) => { const u = m.units[i]; put(u, x, z); u.aim = u.heading = aim ?? (u.team ? Math.PI : 0); u.combatT = 0; });
  m.crateT = 1e9;
  return m;
}
function go(m, ticks, f) {
  const ev = [];
  for (let i = 0; i < ticks; i++) {
    const o = (f && f(i)) || {};
    step(m, m.units.map((u, k) => inp({ aim: u.aim, tx: u.x, tz: u.z, ...o[k] })));
    for (const e of m.events) ev.push(e);
  }
  return ev;
}
const only = (ev, t, f = () => true) => ev.filter((e) => e.t === t && f(e));
const press = (m, k, slot, extra) => go(m, 1, () => ({ [k]: { [slot]: true, ...extra } }));
const UNG = MECHS.ung, UNG_F = 1 - UNG.armor;

export function runK8Cases(check, section) {
  section('K8 kit lane k8: Kurumi, Iron Man, Optimus Prime ported from the owner\'s clips (p61, p73, p45) and their G5 mechanics (literal expected values)');

  // ---- Kurumi (vesau), clip p61 ----
  const VS = MECHS.vesau, VW = VS.weapon, [VQ, VE, VU] = VS.skills;
  // passive: a 5-shot magazine, then a 1 s reload
  {
    const m = arena([[R('vesau', 0), 0, 0], [R('ung', 1), 40, 30]]), a = m.units[0];
    const ev = go(m, Math.round(2.3 / TICK), () => ({ 0: { fire: true } }));
    const shots = only(ev, 'fire', (e) => e.id === 0).length, rl = only(ev, 'reload', (e) => e.id === 0);
    check('K8-a Thoi Quang Thu Ho: 5 shots, then a 1 s reload (no 6th shot inside 2.3 s held)', shots === 5 && rl.length === 1 && rl[0].dur === VW.mag.reload, `${shots} ${rl.length}`);
    go(m, Math.round(0.3 / TICK), () => ({ 0: { fire: true } }));
    check('K8-b ... the 6th shot flies once the reload is over', a.magN === 1, `${a.magN}`);
  }
  // passive: the hit grows with the distance flown (x2 at most), bursts round the mech hit, and heals allies inside the burst by 150
  {
    const hitAt = (d) => {
      const m = arena([[R('vesau', 0), 0, 0], [R('ung', 1), d, 0]]), v = m.units[1];
      go(m, Math.round((d / VW.speed + 0.3) / TICK), (i) => ({ 0: { fire: i === 0 } }));
      return (UNG.hp - v.hp) / (VW.dmg * UNG_F);
    };
    const f4 = hitAt(4), f16 = hitAt(16);
    check('K8-c ... the shot hits x (1 + 0.055 x metres flown): about x1.2 at 4 m, x1.8 at 16 m', f4 > 1.1 && f4 < 1.25 && f16 > 1.7 && f16 < 1.9, `${f4} ${f16}`);
    const m = arena([[R('vesau', 0), 0, 0], [R('ung', 1), 6, 0], [R('ung', 1), 6, 1.2], [R('dummy', 0), 6, -1.2]]), [a, v, v2, al] = m.units;
    al.hp = al.maxHp - 600; a.hp = a.maxHp - 600;
    go(m, Math.round(0.45 / TICK), (i) => ({ 0: { fire: i === 0 } }));
    const hit = UNG.hp - v.hp;
    check('K8-d ... a hit bursts round the mech: its neighbour 1.2 m away takes 0.6 x the hit less the area falloff (at most half)', hit > 0 && UNG.hp - v2.hp > hit * 0.3 && UNG.hp - v2.hp < hit * 0.6, `${hit} ${UNG.hp - v2.hp}`);
    check('K8-e ... the ally inside the burst heals 150; Kurumi herself does not', near(al.hp - (al.maxHp - 600), VW.krHeal, 1e-6) && a.hp < a.maxHp - 599, `${al.hp - (al.maxHp - 600)} ${a.hp - (a.maxHp - 600)}`);
  }
  // Q Thời Quang Thủ Hộ: a totem with 975 hp at the cursor, losing its hp over 10 s; allies within 5 m heal 112 a second
  {
    const m = arena([[R('vesau', 0), 0, 0], [R('dummy', 0), 6, 1], [R('ung', 1), 40, 30]]), [a, al] = m.units;
    al.hp = al.maxHp - 1000;
    press(m, 0, 's1', { tx: 6, tz: 0 });
    const z = m.zones.find((q) => q.kind === 'totem');
    check('K8-f Thoi Quang Thu Ho: a totem at the cursor with 975 hp, 5 m of reach', !!z && near(z.x, 6, 1e-6) && z.maxHp === VQ.hp && z.area === VQ.radius, z ? `${z.x} ${z.maxHp} ${z.area}` : 'none');
    go(m, Math.round(1 / TICK));
    check('K8-g ... the ally inside heals 112 a second (2 pulses of 56)', near(al.hp - (al.maxHp - 1000), VQ.hps, 1e-6), `${al.hp - (al.maxHp - 1000)}`);
    go(m, Math.round(9.2 / TICK));
    check('K8-h ... it has lost all its hp after 10 s and is gone', !m.zones.some((q) => q.kind === 'totem'), `${m.zones.map((q) => q.kind)}`);
  }
  // E Thời Gian Can Nhiễu: 262 and sleep 4 s; a blow wakes the sleeper
  {
    const m = arena([[R('vesau', 0), 0, 0], [R('ung', 1), 8, 0]]), [a, v] = m.units;
    go(m, Math.round(0.5 / TICK), (i) => ({ 0: { s2: i === 0 } }));
    check('K8-i Thoi Gian Can Nhieu: 262 x (1 - armour) on the foe hit, which then sleeps (about 4 s)', near(UNG.hp - v.hp, VE.dmg * UNG_F, 1e-6) && v.locK === LOC_KINDS.indexOf('sleep') && v.locT > 3.5, `${UNG.hp - v.hp} ${v.locK} ${v.locT}`);
    go(m, Math.round(0.5 / TICK), (i) => ({ 0: { fire: i === 0, aim: 0 } }));
    check('K8-j ... a shot wakes it', !(v.locT > 0), `${v.locT}`);
  }
  // Ult Thời Quang Hồi Tố: the mark keeps the hp of the press; 25% less skill damage meanwhile; 2 s later the hp goes back; fire x2.5 4 s
  {
    const m = arena([[R('vesau', 0), 0, 0], [R('dummy', 0), 5, 0], [R('dummy', 0), 14, 0], [R('ung', 1), 40, 30]]), [a, al, far] = m.units;
    al.hp = al.maxHp - 300; a.hp = a.maxHp - 200;
    const ev = press(m, 0, 'ult');
    check('K8-k Thoi Quang Hoi To: allies in 8 m (her too) are marked 2 s with their hp now; the far ally is not', near(al.krT, VU.fwd - TICK, 1e-6) && al.krHp === al.maxHp - 300 && a.krHp === a.maxHp - 200 && !(far.krT > 0) && only(ev, 'rewind').length === 1, `${al.krT} ${far.krT}`);
    check('K8-l ... the marked take 25% less skill damage (G2 guard vs skill) and she fires x2.5 for 4 s', al.gvK === 'skill' && al.gvF === VU.guard && a.rapidF === VU.self.rapid && near(a.rapidT, VU.self.dur, TICK + 1e-9), `${al.gvK} ${al.gvF} ${a.rapidF} ${a.rapidT}`);
    al.hp -= 900; a.hp -= 400;
    const back = go(m, Math.round(2 / TICK));
    check('K8-m ... when the mark ends the hp goes back to the press (hers x selfHealMul)', near(al.hp, al.maxHp - 300, 1e-6) && near(a.hp, a.maxHp - 600 + 400 * RULES.selfHealMul, 1e-6) && only(back, 'krBack').length === 2 && !(al.krT > 0), `${al.hp - al.maxHp} ${a.hp - a.maxHp}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let bad = 0;
  runK8Cases((name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' :: ' + info}`); if (!ok) bad++; }, (t) => console.log(`\n== ${t}`));
  process.exit(bad ? 1 : 0);
}
