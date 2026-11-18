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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0, passed = 0;
  runK6Cases((name, ok, info) => { if (ok) passed++; else { failed++; console.log('FAIL', name, info ?? ''); } }, (s) => console.log('\n== ' + s));
  console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
  process.exit(failed ? 1 : 0);
}
