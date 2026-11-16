// Node tests for the camera rig (js/camera.js): `node tools/camera-test.mjs`. Exits 1 on any failure.
import { createMatch } from '../js/sim.js';
import { createRig, longAim, flipFor, zoomOf, CAM_RULES as R, HEIGHTS } from '../js/camera.js';

let failed = 0;
const check = (name, cond, detail = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' (' + detail + ')' : ''}`); };
const VIEW = { hw: 19, far: 10.4, near: 10.4 };   // the Xiaomi 17T shape at "Vừa"
const f2 = (v) => v.toFixed(2);

function match(mode = 'tdm', mech = 'ung', team = 0) {
  const roster = [{ team, mech, name: 'Tôi' }, { team, mech: 'hac', name: 'Bạn' }, { team: 1 - team, mech: 'soi', name: 'Địch' }, { team: 1 - team, mech: 'trau', name: 'Địch 2' }];
  const m = createMatch({ seed: 5, mode, roster, map: mode === 'nha' ? 'luythep' : 'denrung' });
  const me = m.units[0];
  me.x = me.px = 0; me.z = me.pz = 0; me.vx = me.vz = 0; me.aim = 0;
  return m;
}
// Runs the rig for `secs` at `hz`; `drive(t, dt)` moves the world first. Returns the top focus speed and the path length.
function run(rig, m, secs, hz, drive, sig = () => null, lock = () => null) {
  const dt = 1 / hz;
  let top = 0, path = 0, x = rig.s.x, z = rig.s.z;
  for (let t = 0; t < secs - 1e-9; t += dt) {
    if (drive) drive(t, dt);
    rig.update(dt, m, 0, VIEW, sig(t), lock(t));
    const d = Math.hypot(rig.s.x - x, rig.s.z - z);
    top = Math.max(top, d / dt); path += d; x = rig.s.x; z = rig.s.z;
  }
  return { top, path };
}
// A rig that has settled on the tank (the aim lead takes about a second to come to rest).
const fresh = (m) => { const rig = createRig(); rig.reset(m, 0); for (let i = 0; i < 240; i++) rig.update(1 / 60, m, 0, VIEW, null, null); return rig; };

{
  const m = match(), me = m.units[0], rig = fresh(m);
  const r = run(rig, m, 3, 60, (t, dt) => { me.vx = 7; me.x += 7 * dt; });
  check('follow: the focus keeps up with a tank driving at 7 m/s', Math.abs(rig.s.x - (me.x + R.leadAim + 7 * R.leadVel)) < 1.2, `tank ${f2(me.x)}, focus ${f2(rig.s.x)}`);
  check('follow: top focus speed stays under the limit', r.top <= R.vmax + 1e-6, `${f2(r.top)} m/s, limit ${R.vmax}`);
}
{
  const m = match(), me = m.units[0], rig = fresh(m);
  run(rig, m, 1, 60);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const x0 = rig.s.x, z0 = rig.s.z;
  let far = 0;
  const r = run(rig, m, 4, 60, () => { me.x = rnd() * 0.4; me.z = rnd() * 0.4; me.aim = rnd() * 0.24; far = Math.max(far, Math.hypot(rig.s.x - x0, rig.s.z - z0)); });
  check('jitter: a tank twitching 0.2 m with a twitching aim barely moves the view', far < 0.25 && r.top < 2, `drift ${f2(far)} m, top ${f2(r.top)} m/s`);
}
{
  const end = (hz) => { const m = match(), me = m.units[0], rig = fresh(m); run(rig, m, 2, hz, (t, dt) => { me.vx = 6; me.vz = -3; me.x += 6 * dt; me.z -= 3 * dt; me.aim = t; }); return rig.s; };
  const a = end(30), b = end(120);
  check('frame rate: 30 Hz and 120 Hz end at the same place', Math.hypot(a.x - b.x, a.z - b.z) < 0.25, `apart ${f2(Math.hypot(a.x - b.x, a.z - b.z))} m`);
}
{
  const m = match(), me = m.units[0], rig = fresh(m);
  const r = run(rig, m, 1, 60, (t) => { if (t > 0.5 && me.x === 0) me.x = 8; });
  check('teleport: an 8 m blink is followed under the speed limit, not snapped', r.top <= R.vmax + 1e-6 && r.top > 10, `top ${f2(r.top)} m/s`);
}
{
  const m = match('tdm', 'ung'), me = m.units[0];
  check('long aim: Ưng Nhãn holding fire by hand pans', !!longAim(me, { hint: null, fire: true, aim: 0 }));
  check('long aim: fire not held does not pan', !longAim(me, { hint: null, fire: false, aim: 0 }));
  const soi = match('tdm', 'soi').units[0];
  check('long aim: a rapid short-range gun (Sói Lửa) never pans', !longAim(soi, { hint: null, fire: true, aim: 0 }));
  const tc = match('tdm', 'thancong').units[0];
  check('long aim: Thần Công pans only when planted', !longAim(tc, { fire: true, aim: 0 }) && (tc.stance = true) && !!longAim(tc, { fire: true, aim: 0 }));
  const hint = (range, d, cancel = false) => ({ x: 0, z: 0, tx: d, tz: 0, range, cancel });
  check('long aim: a 24 m skill drag pans by how far the thumb reaches', longAim(me, { hint: hint(24, 20) }).reach === 20);
  check('long aim: a short skill drag or one inside the cancel zone does not pan', !longAim(me, { hint: hint(9, 9) }) && !longAim(me, { hint: hint(24, 20, true) }));
  check('long aim: a long beam being wound up pans along its aim', (me.cast = { skill: { range: 30 }, aim: 1 }) && longAim(me, {}).a === 1);
}
{
  const m = match(), rig = fresh(m), me = m.units[0];
  run(rig, m, 1, 60);
  const base = rig.s.x;
  run(rig, m, 1.2, 60, null, () => ({ a: 0, reach: 23 }));
  const pan = rig.s.x - base, want = (23 - R.panFrom) * R.panGain;
  check('aim pan: the view slides toward a 23 m aim', Math.abs(pan - want) < 0.4, `${f2(pan)} m, expected ${f2(want)}`);
  run(rig, m, 1.2, 60, null, () => ({ a: 0, reach: 12 }));
  check('aim pan: a nearer aim slides less', rig.s.x - base < pan - 3, `${f2(rig.s.x - base)} m`);
  run(rig, m, 1.2, 60, null, () => ({ a: -Math.PI / 2, reach: 40 }));
  const up = (me.z + R.bias) - rig.s.z, edge = VIEW.near * R.inner[2];
  check('aim pan: capped so the tank stays inside the frame', up <= edge + R.bias + 0.05 && up > 3, `tank ${f2(up)} m below centre, allowed ${f2(edge + R.bias)}`);
  run(rig, m, 1.5, 60);
  check('aim pan: eases back on release', Math.abs(rig.s.x - base) < 0.1 && Math.abs(rig.s.ox) < 0.1, `${f2(rig.s.x - base)} m left`);
}
{
  const m = match(), rig = fresh(m), me = m.units[0];
  run(rig, m, 1, 60);
  const lock = { x: 19, z: 0 };
  run(rig, m, 2, 60, null, undefined, () => lock);
  const X = VIEW.hw * R.inner[0];
  check('lock: a target near the edge is pulled into the frame with the tank', lock.x - rig.s.x <= X + 0.1 && rig.s.x - me.x <= X + 0.1, `target ${f2(lock.x - rig.s.x)} m right of centre, tank ${f2(rig.s.x - me.x)} m left, inner ${f2(X)}`);
  const near = { x: 6, z: 0 }, r2 = fresh(m); run(r2, m, 1, 60); const b = r2.s.x; run(r2, m, 1, 60, null, undefined, () => near);
  check('lock: a target well inside the frame does not move the view', Math.abs(r2.s.x - b) < 0.05);
}
{
  for (const [mode, team, flip] of [['nha', 1, true], ['nha', 0, false], ['tdm', 1, true], ['chiem', 1, true], ['tudo', 1, false]]) {
    const m = match(mode, 'ung', team);
    check(`flip: ${mode}, team ${team} → ${flip ? 'turned half round' : 'not turned'}`, flipFor(m, m.units[0]) === flip);
  }
  const m = match('nha', 'ung', 1), rig = fresh(m), me = m.units[0];
  run(rig, m, 1, 60);
  check('flip: yaw is π and the tank sits on the far side of the focus in world z', rig.s.yaw === Math.PI && rig.s.z < me.z - 0.5, `focus z ${f2(rig.s.z)}`);
}
{
  const m = match(), rig = fresh(m), me = m.units[0], ally = m.units[1], foe = m.units[2];
  ally.x = -12; ally.z = 6; foe.x = 9; foe.z = -4; foe.revealT = 99;
  run(rig, m, 1, 60);
  me.alive = false; rig.event({ t: 'death', id: 0, by: foe.id }, 0);
  const before = { x: rig.s.x, z: rig.s.z };
  rig.update(1 / 60, m, 0, VIEW, null, null);
  check('death: the view turns to the killer without a jump', rig.s.mode === 'killer' && rig.s.target === foe.id && Math.hypot(rig.s.x - before.x, rig.s.z - before.z) < 0.2, rig.s.mode);
  run(rig, m, 1.2, 60);
  check('death: after the glide it is on the killer', rig.s.mode === 'killer' && Math.hypot(rig.s.x - foe.x, rig.s.z - (foe.z + R.bias)) < 0.6, `${f2(rig.s.x)}, ${f2(rig.s.z)}`);
  run(rig, m, 0.5, 60);
  check(`death: after ${R.killer} s it rides with the nearest living ally`, rig.s.mode === 'ally' && rig.s.target === ally.id);
  run(rig, m, 1, 60);
  check('death: it reaches the ally', Math.hypot(rig.s.x - ally.x, rig.s.z - (ally.z + R.bias)) < 0.6);
  ally.alive = false; run(rig, m, 0.2, 60);
  check('death: with no ally left it goes back to the killer', rig.s.mode === 'killer');
  foe.alive = false; run(rig, m, 0.2, 60);
  check('death: with nobody to watch it stays on the wreck', rig.s.mode === 'wreck');
  me.alive = true; me.x = -30; me.z = 0; ally.alive = true;
  rig.update(1 / 60, m, 0, VIEW, null, null);
  const r = run(rig, m, 0.6, 60);
  check('respawn: back on the own tank after a short glide', rig.s.mode === 'follow' && !rig.s.from && Math.abs(rig.s.x - (me.x + R.leadAim)) < 0.8, `x ${f2(rig.s.x)}, top ${f2(r.top)} m/s`);
}
{
  const m = match(), rig = fresh(m);
  run(rig, m, 0.5, 60);
  const home = { x: rig.s.x, z: rig.s.z };
  rig.pan({ x: 20, z: -10 }); run(rig, m, 0.5, 60);
  check('minimap drag: the view goes to the map point', rig.s.mode === 'free' && Math.hypot(rig.s.x - 20, rig.s.z + 10) < 0.3, `${f2(rig.s.x)}, ${f2(rig.s.z)}`);
  rig.pan(null); run(rig, m, 0.8, 60);
  check('minimap drag: release glides back to the tank', rig.s.mode === 'follow' && Math.hypot(rig.s.x - home.x, rig.s.z - home.z) < 0.3);
}
check('heights: three steps, near < mid < far', HEIGHTS.length === 3 && zoomOf('near') < zoomOf('mid') && zoomOf('mid') < zoomOf('far') && zoomOf('bogus') === 1);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
