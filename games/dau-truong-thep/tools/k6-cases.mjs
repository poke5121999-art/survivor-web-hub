// Kit lane K6 (feat/dtt-k6): the kits of Magneto (samthep), Sơn Tinh (sontinh) and Tào Tháo (taothao) ported from the owner's clips,
// and their G5 mechanics (sim.js blocks "kit-remake G5 <tank>"). Section K6 of tools/sim-test.mjs; runs alone too:
// `node tools/k6-cases.mjs`. Expected values follow the data rows; the dummy foe is Thần Công (a no-clip tank that keeps its kit).
import { createMatch, step, applyFx, weaponOf, LOC_KINDS, locked } from '../js/sim.js';
import { MECHS, TICK } from '../js/data.js';

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
const sum = (l, f) => l.reduce((a, e) => a + f(e), 0);
const DUM = MECHS.thancong, DF = 1 - DUM.armor;
const fall = (d, r) => 1 - 0.5 * Math.min(1, d / r);

export function runK6Cases(check, section) {
  section('K6 kit lane K6: Magneto, Sơn Tinh, Tào Tháo ported from the owner\'s clips (p86, p14, p11) and their G5 mechanics (literal expected values)');

  // ---- Magneto (samthep), clip p86 ----
  const MG = MECHS.samthep, [MQ, ME, MU] = MG.skills;
  // Kim Loại Oanh Tạc: 186 at 0.45 s, 275 at 0.85 s on the cursor point; under both, +10% max hp; every skill hit hastes him x1.5 for 2 s
  {
    const m = arena([[R('samthep', 0), 0, 0], [R('thancong', 1), 6, 0]]), [a, v] = m.units;
    const ev = press(m, 0, 's1', { tx: 6, tz: 0 }).concat(go(m, 30));
    const hits = only(ev, 'hit', (e) => e.id === 1 && e.by === 0).map((e) => e.amt);
    check('K6-a Kim Loai Oanh Tac: two girders on the point, 186 then 275, then 10% of max hp (armour on all three)', hits.length === 3 && near(hits[0], 186 * DF) && near(hits[1], 275 * DF) && near(hits[2], DUM.hp * 0.1 * DF), JSON.stringify(hits));
    check('K6-b ... both girders landed on one foe: a kit event "both" for the look', only(ev, 'kit', (e) => e.k === 'both' && e.o === 1).length === 1);
    check('K6-c Tu Luc Gia Toc: a skill hit hastes him x1.5 for 2 s', a.hasteF === 1.5 && a.hasteT > 1.5 && a.hasteT <= 2, `${a.hasteF} ${a.hasteT}`);
  }
  {
    const m = arena([[R('samthep', 0), 0, 0], [R('thancong', 1), 6, 0]]), [a, v] = m.units;
    go(m, 30, () => ({ 0: { fire: true, tx: 6, tz: 0 } }));
    check('K6-d ... a weapon hit does not (Mảnh Thép 150 every 0.5 s)', !(a.hasteT > 0) && MG.weapon.dmg === 150 && MG.weapon.cd === 0.5 && v.hp < DUM.hp, `${a.hasteT} ${v.hp}`);
  }
  // Trọng Lực Phản Xung: lift 1.5 s at 0.3 s (no damage), slam 285 at 1.8 s in 3.5 m; the lifted are not stunned, the others 1 s
  {
    const m = arena([[R('samthep', 0), 0, 0], [R('thancong', 1), 6, 0], [R('thancong', 1), 6, 0]]), [a, v, w] = m.units;
    const dw = 3.25 + w.radius * 0.6; put(w, 6, dw);
    press(m, 0, 's2', { tx: 6, tz: 0 }); go(m, Math.round(0.3 / TICK) + 1);
    check('K6-e Trong Luc Phan Xung: at 0.3 s the foe in 3 m is lifted 1.5 s, no damage; the one at 3.25 m + body is not', LOC_KINDS[v.locK] === 'lift' && v.locT > 1.4 && v.hp === DUM.hp && !(w.locT > 0), `${LOC_KINDS[v.locK]} ${v.locT} ${v.hp} ${w.locT}`);
    let wst = 0; const ev = go(m, Math.round(1.5 / TICK) + 2, () => { wst = Math.max(wst, w.stunT); });
    const hv = only(ev, 'hit', (e) => e.id === 1 && e.by === 0), hw = only(ev, 'hit', (e) => e.id === 2 && e.by === 0);
    check('K6-f ... at 1.8 s the slam: 285 on the lifted foe, not stunned; the other one 285 with falloff and stunned 1 s', hv.length === 1 && near(hv[0].amt, 285 * DF) && !(v.stunT > 0) && hw.length === 1 && near(hw[0].amt, 285 * fall(dw, 3.5) * DF, 1e-4) && wst > 0.9, `${hv.map((e) => e.amt)} ${v.stunT} ${hw.map((e) => e.amt)} ${wst}`);
  }
  // Từ Năng Phong Bạo: 8 strikes over 6 s on every enemy on the map (38), and 150 more on one enemy within 6 m each strike
  {
    const m = arena([[R('samthep', 0), 0, 0], [R('thancong', 1), 3, 0], [R('thancong', 1), 30, 20]]), [a, n, f] = m.units;
    const ev = press(m, 0, 'ult').concat(go(m, Math.round(6.2 / TICK)));
    const hn = only(ev, 'hit', (e) => e.id === 1 && e.by === 0), hf = only(ev, 'hit', (e) => e.id === 2 && e.by === 0);
    check('K6-g Tu Nang Phong Bao: the far foe (36 m away) takes 8 x 38', hf.length === 8 && hf.every((e) => near(e.amt, 38 * DF)), `${hf.length} ${hf.map((e) => e.amt)}`);
    check('K6-h ... the near one 8 x 38 and 8 x 150 (the only enemy in 6 m)', hn.length === 16 && near(sum(hn, (e) => e.amt), 8 * (38 + 150) * DF, 1e-6), `${hn.length} ${sum(hn, (e) => e.amt)}`);
    check('K6-i ... 16 bolt events and 8 near events, the field is gone after 6 s', only(ev, 'kit', (e) => e.k === 'bolt').length === 16 && only(ev, 'kit', (e) => e.k === 'near').length === 8 && !m.zones.some((z) => z.mgtStorm), `${only(ev, 'kit').length}`);
  }

  // ---- Sơn Tinh (sontinh), clip p14 ----
  const ST = MECHS.sontinh, [SQ, SE, SU] = ST.skills;
  // passive: Đá Lăn 225 every 0.75 s + 3% of the lost hp as true damage; 25% lifesteal
  {
    const m = arena([[R('sontinh', 0), 0, 0], [R('thancong', 1), 6, 0]]), [a, v] = m.units;
    a.hp = a.maxHp - 1000; const h0 = a.hp;
    const ev = go(m, 14, (i) => ({ 0: { fire: i === 0, tx: 6, tz: 0 } }));
    const hits = only(ev, 'hit', (e) => e.id === 1 && e.by === 0).map((e) => e.amt);
    check('K6-j Dai Dia Chi Luc: a rock hits 225 x armour, then 3% of the hp it has lost as true damage', hits.length === 2 && near(hits[0], 225 * DF) && near(hits[1], 0.03 * 225 * DF), JSON.stringify(hits));
    check('K6-k ... and heals him 25% of all of it', near(a.hp - h0, 0.25 * (hits[0] + hits[1]), 1e-6), `${a.hp - h0}`);
  }
  // Đại Địa Trớ Chú: 0.4 s wind-up, then foes in 5 m slow down to a stop over 3 s, are petrified 1 s and take 335
  {
    const m = arena([[R('sontinh', 0), 0, 0], [R('thancong', 1), 3, 0], [R('thancong', 1), 9, 0]]), [a, v, f] = m.units;
    press(m, 0, 's1'); go(m, Math.round(0.4 / TICK) + 1);
    check('K6-l Dai Dia Tro Chu: the foe in 5 m is cursed 3 s, the one at 9 m not', v.sntCT > 2.8 && !(f.sntCT > 0) && v.hp === DUM.hp, `${v.sntCT} ${f.sntCT}`);
    go(m, Math.round(2.7 / TICK));
    check('K6-m ... the slow grows: near a full stop just before the end', v.slowG > 0.85, `${v.slowG}`);
    const ev = go(m, 12);
    const hit = only(ev, 'hit', (e) => e.id === 1 && e.by === 0);
    check('K6-n ... then 335 x armour and petrified 1 s', hit.length === 1 && near(hit[0].amt, 335 * DF) && LOC_KINDS[v.locK] === 'petrify' && v.locT > 0.5, `${hit.map((e) => e.amt)} ${LOC_KINDS[v.locK]} ${v.locT}`);
  }
  // Đại Địa Chi Nộ: 4 s of x1.25 speed and fire rate, 50% lifesteal, three rocks a throw; the cooldown waits for the end
  {
    const m = arena([[R('sontinh', 0), 0, 0], [R('thancong', 1), 8, 0]]), [a, v] = m.units;
    press(m, 0, 's2');
    check('K6-o Dai Dia Chi No: haste 1.25, rapid 1.25, lifesteal 0.5, 8 scatter throws armed', a.hasteF === 1.25 && a.rapidF === 1.25 && a.rageF === 0.5 && a.shotN === 8, `${a.hasteF} ${a.rapidF} ${a.rageF} ${a.shotN}`);
    go(m, 1, () => ({ 0: { fire: true, tx: 8, tz: 0 } }));
    check('K6-p ... a throw is three rocks in a fan', m.shots.filter((s) => s.owner === 0).length === 3, `${m.shots.filter((s) => s.owner === 0).length}`);
    go(m, Math.round(2 / TICK));
    check('K6-q ... its cooldown stands full while the 4 s run (cdAfter)', near(a.cd.s2, SE.cd), `${a.cd.s2}`);
  }
  // Sơn Thần Giáng Lâm: 1 s in the air (untargetable), lands for 527 + stun 1 in 4 m, 13 s god; petrified 1 s with armour at the end
  {
    const m = arena([[R('sontinh', 0), 0, 0], [R('thancong', 1), 9, 0]]), [a, v] = m.units;
    press(m, 0, 'ult', { tx: 8, tz: 0 });
    check('K6-r Son Than Giang Lam: flies (untargetable ~1 s), the god runs 13 s at x1.4, cc x0.25', !!a.dash && a.dash.fly && a.invulnT > 0.9 && near(a.tfT, 13 - 0) && near(a.radius, ST.radius * 1.4) && a.tfCc === 0.25, `${a.invulnT} ${a.tfT} ${a.radius} ${a.tfCc}`);
    const ev = go(m, Math.round(1.05 / TICK) + 2);
    const hit = only(ev, 'hit', (e) => e.id === 1 && e.by === 0);
    check('K6-s ... lands 2.5 m short of the cursor (x 5.5): 527 with falloff on the foe 3.5 m off, stun 1 s', hit.length === 1 && near(hit[0].amt, 527 * fall(3.5, 4) * DF, 1e-3) && v.stunT > 0.8 && Math.abs(a.x - 5.5) < 0.3, `${hit.map((e) => e.amt)} ${v.stunT} x ${a.x}`);
    const w = weaponOf(a);
    check('K6-t ... the god throws boulders: 225, splash 2.6, armour ignored, slow 50% decaying', w.dmg === 225 && w.splash === 2.6 && w.pen === 1 && w.fx.slowDecay === true, JSON.stringify(w));
    go(m, Math.round(10 / TICK));
    check('K6-u ... the ult cooldown waits while the god stands (cdAfter)', near(a.cd.ult, SU.cd), `${a.cd.ult}`);
    go(m, Math.round(2 / TICK) + 3);
    check('K6-v ... at the end: petrified 1 s and +0.25 armour', a.tfT <= 0 && LOC_KINDS[a.locK] === 'petrify' && a.locT > 0.5 && a.armorF === 0.25 && a.armorT > 0.5, `${a.tfT} ${LOC_KINDS[a.locK]} ${a.locT} ${a.armorF}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK6Cases((name, ok, info) => { if (ok) passed++; else { failed++; console.log('FAIL', name, info ?? ''); } }, (s) => console.log('\n== ' + s));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
