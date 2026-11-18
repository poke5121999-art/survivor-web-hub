// Touch controls on a phone-sized page with real touch input (CDP Input.dispatchTouchEvent): stick, fire drag, skill tap/aim/cancel, two thumbs,
// geometry at four screen sizes, the layout editor and its saved layout, desktop without touch.
//   node tools/touch-test.js          screenshots go to .chk/mobile-ui/dev-*.png
'use strict';
const { session, open, checker, CHK, fs, path } = require('./lib.js');
const check = checker();
const SHOTS = path.join(CHK, 'mobile-ui');
const wait = (p, ms) => p.waitForTimeout(ms);
const near = (a, b, tol) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) <= tol;

// One finger = one id; every event carries all fingers that are down, which is what the protocol expects.
function fingers(cdp) {
  const down = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...down].map(([id, [x, y]]) => ({ x, y, id })) });
  return {
    async down(id, x, y) { down.set(id, [x, y]); await send('touchStart'); },
    async move(id, x, y) { down.set(id, [x, y]); await send('touchMove'); },
    async up(id) { down.delete(id); await send('touchEnd'); },
    async tap(x, y, ms = 60) { await this.down(9, x, y); await new Promise((r) => setTimeout(r, ms)); await this.up(9); },
  };
}

const G = (p, fn, arg) => p.evaluate(fn, arg);
const rectOf = (p, id) => p.evaluate((id) => { const r = document.querySelector(`#touch [data-id="${id}"]`).getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, id);

// The stick, fire-drag, Q-tap and E-drag sections were written for the old Thợ Rèn: a 0.45 s rivet gun, Q a turret (a zone),
// E a magnet field at the cursor (12 m). Kit lane K11 (08e7ba08) made tho Iron Man (0.65 s gun, Q a volley, E a missile barrage),
// so those sections play the test fixture 'oldtho' (tools/k11-cases.mjs). The page gets it the way the node tests do: the fixture
// rows are appended to js/data.js as the page loads it, so they are in MECHS before netstate.js reads the shot kinds.
let FIXTURES = null;
async function fixtureRoute() {
  if (!FIXTURES) {
    const k = await import('./k11-cases.mjs');
    FIXTURES = `\n;MECHS.oldtho = ${JSON.stringify(k.OLD_THO)}; PERKS.oldtho = ${JSON.stringify(k.OLD_THO_PERKS)};\n`;
  }
  return { url: /\/js\/data\.js(\?|$)/, fn: async (r) => { const res = await r.fetch(); await r.fulfill({ response: res, body: (await res.text()) + FIXTURES }); } };
}
async function begin(br, base, vp, extra = '', mech = 'oldtho') {
  const route = mech === 'oldtho' ? await fixtureRoute() : null;
  const g = await open(br, base, `autostart&noaudio&seed=3&mech=${mech}&q=low${extra}`, { viewport: vp, touch: true, route });
  await wait(g.page, 500);
  g.f = fingers(await g.ctx.newCDPSession(g.page));
  return g;
}
// Others stand still far away (stunned, with plenty of health) so nothing moves or hits the mech under test.
const calm = (p) => p.evaluate(() => {
  const m = __G.match, me = m.units[0];
  me.maxHp = me.hp = 1e6;
  window.__calm = setInterval(() => { for (const u of m.units) if (u.id) { u.stunT = 60; u.maxHp = Math.max(u.maxHp, 1e6); u.hp = u.maxHp; } }, 15);
  m.units.forEach((u, i) => { if (i) { u.x = u.px = (u.team ? 34 : -34); u.z = u.pz = -20 + i * 3; } });
});
const place = (p, id, x, z) => p.evaluate(([id, x, z]) => { const u = __G.match.units[id]; u.x = u.px = x; u.z = u.pz = z; u.vx = u.vz = 0; }, [id, x, z]);

session(async (br, base) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const vp = { width: 844, height: 390 };
  let g = await begin(br, base, vp);
  let p = g.page;
  const fx0 = await G(p, () => { const u = __G.match.units[0]; return { mech: u.mech, s1: u.def.skills[0].do, s2: u.def.skills[1].do }; });
  check(fx0.mech === 'oldtho' && fx0.s1 === 'turret' && fx0.s2 === 'zone', `the touch sections play the fixture oldtho, the old Thợ Rèn (${fx0.mech}: ${fx0.s1}, ${fx0.s2})`);
  await calm(p);
  const me = () => p.evaluate(() => { const u = __G.match.units[0]; return { x: u.x, z: u.z, aim: u.aim, cd: { ...u.cd }, alive: u.alive }; });
  // Shots live well under a second: record every one of mine the moment it appears.
  await p.evaluate(() => { window.__rec = new Map(); setInterval(() => { for (const s of __G.match.shots) if (s.owner === 0 && !window.__rec.has(s.id)) window.__rec.set(s.id, { dx: s.dx, dz: s.dz }); }, 8); });
  const mine = () => p.evaluate(() => [...window.__rec.values()]);
  const forget = () => p.evaluate(() => window.__rec.clear());

  check(await G(p, () => __G.input.touch && !!document.getElementById('touch') && document.getElementById('touch').classList.contains('on')), 'touch layer is created and visible in a match on a touch device');

  // 1. Floating stick: appears where the thumb lands, moves the mech that way.
  await place(p, 0, 0, 0);
  const m0 = await me();
  await g.f.down(1, 160, 250);
  await wait(p, 80);
  await g.f.move(1, 210, 250);
  await wait(p, 600);
  const sr = await rectOf(p, 'move');
  const act = await G(p, () => document.querySelector('#touch [data-id="move"]').classList.contains('act'));
  const m1 = await me();
  check(act && Math.hypot(sr.cx - 160, sr.cy - 250) < 3, `stick base appears under the thumb (${sr.cx.toFixed(0)},${sr.cy.toFixed(0)} for a touch at 160,250)`);
  check(m1.x - m0.x > 2 && Math.abs(m1.z - m0.z) < 1, `pushing right moves the mech right (dx ${(m1.x - m0.x).toFixed(1)}, dz ${(m1.z - m0.z).toFixed(1)})`);
  await g.f.up(1);
  await wait(p, 200);
  check(!(await G(p, () => document.querySelector('#touch [data-id="move"]').classList.contains('act'))), 'stick base goes away when the thumb lifts');

  // 2. Fire drag: the turret follows the thumb, not the enemy standing the other way.
  await place(p, 0, 0, 0); await place(p, 3, 0, -7); await forget();
  const fr = await rectOf(p, 'fire');
  await g.f.down(2, fr.cx, fr.cy);
  await g.f.move(2, fr.cx + 40, fr.cy);
  await wait(p, 700);
  const a1 = await me(), s1 = await mine();
  check(near(a1.aim, 0, 0.2), `dragging fire to the right turns the turret right though an enemy stands up the screen (aim ${a1.aim.toFixed(2)})`);
  check(s1.length > 0 && s1.every((s) => Math.abs(s.dz) < 0.35 && s.dx > 0.9), `shots leave along the drag direction (${s1.length} shots)`);
  await forget();
  await g.f.move(2, fr.cx - 30, fr.cy + 30);
  await wait(p, 600);
  const a2 = await me(), s2 = await mine();
  check(near(a2.aim, Math.atan2(30, -30), 0.2), `dragging down-left follows the thumb (aim ${a2.aim.toFixed(2)}, want ${Math.atan2(30, -30).toFixed(2)})`);
  check(s2.some((s) => s.dx < -0.5 && s.dz > 0.5), 'new shots go down-left');
  await g.f.up(2);
  await wait(p, 600);
  await forget();
  await g.f.down(2, fr.cx, fr.cy);
  await wait(p, 600);
  const a3 = await me(), s3 = await mine();
  await g.f.up(2);
  check(near(a3.aim, -Math.PI / 2, 0.2) && s3.length > 0, `holding fire without a drag now turns to the enemy in range up the screen (aim ${a3.aim.toFixed(2)}, ${s3.length} shots)`);

  await place(p, 3, 34, -20 + 15);
  // 3. Skills: tap Q casts it and starts the cooldown; the button shows it.
  await p.evaluate(() => { const u = __G.match.units[0]; u.cd.s1 = 0; u.cd.s2 = 0; u.cd.ult = 0; __G.match.zones.length = 0; });
  const q = await rectOf(p, 's1');
  await g.f.tap(q.cx, q.cy);
  await wait(p, 400);
  const c1 = await p.evaluate(() => ({ cd: __G.match.units[0].cd.s1, want: __G.match.units[0].def.skills[0].cd, zones: __G.match.zones.length, cls: document.querySelector('#touch [data-id="s1"]').className, txt: document.querySelector('#touch [data-id="s1"] .tc-t').textContent }));
  check(c1.cd > c1.want - 1 && c1.zones > 0, `tapping Q casts it (cooldown ${c1.cd.toFixed(1)} of ${c1.want}, ${c1.zones} zone)`);
  check(/cd/.test(c1.cls) && c1.txt !== '', `Q button shows the cooldown (${c1.txt})`);

  // 4. Drag E: aimHint follows the drag; release casts at that point.
  const e = await rectOf(p, 's2');
  const sz = e.w, tapR = Math.max(10, sz * 0.28), reach = Math.max(70, sz * 1.35);
  await place(p, 0, 0, 0);
  await g.f.down(3, e.cx, e.cy);
  await g.f.move(3, e.cx - 20, e.cy);
  await g.f.move(3, e.cx - 80, e.cy);
  await wait(p, 250);
  const h = await p.evaluate(() => { const h = __G.input.aimHint; return h && { ...h }; });
  const want = Math.min(1, (80 - tapR) / (reach - tapR)) * 12;
  const hd = h ? Math.hypot(h.tx - h.x, h.tz - h.z) : 0;
  check(!!h && h.slot === 1 && h.kind === 'area' && !h.cancel, `dragging E publishes aimHint (${h ? h.kind : 'null'}, slot ${h && h.slot})`);
  check(!!h && near(Math.atan2(h.tz - h.z, h.tx - h.x), Math.PI, 0.1) && Math.abs(hd - want) < 0.6 && h.range === 12, `aimHint points along the drag and reaches ${hd.toFixed(1)} m (expected ${want.toFixed(1)} of 12)`);
  await g.f.up(3);
  await wait(p, 350);
  const z1 = await p.evaluate(() => ({ cd: __G.match.units[0].cd.s2, zs: __G.match.zones.filter((z) => z.kind === 'field').map((z) => [z.x, z.z]) }));
  check(z1.cd > 0 && !!h && z1.zs.some(([x, z]) => Math.hypot(x - h.tx, z - h.tz) < 1.5), `releasing casts E at the aimed point (cooldown ${z1.cd.toFixed(1)}, zone near ${h ? h.tx.toFixed(1) + ',' + h.tz.toFixed(1) : '?'})`);
  check((await G(p, () => __G.input.aimHint)) === null, 'aimHint is null again after release');

  // 5. Cancel zone.
  await p.evaluate(() => { const u = __G.match.units[0]; u.cd.s2 = 0; __G.match.zones.length = 0; });
  await g.f.down(3, e.cx, e.cy);
  await g.f.move(3, e.cx - 60, e.cy);
  await wait(p, 100);
  const cz = await rectOf(p, 's2').then(() => p.evaluate(() => { const r = document.querySelector('#touch .tc-cancel').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, shown: getComputedStyle(document.querySelector('#touch .tc-cancel')).display !== 'none' }; }));
  check(cz.shown && cz.w >= 48, `a cancel zone is drawn while aiming (${cz.w.toFixed(0)} px wide at ${cz.x.toFixed(0)},${cz.y.toFixed(0)})`);
  await g.f.move(3, cz.x, cz.y);
  await wait(p, 150);
  const hc = await p.evaluate(() => __G.input.aimHint && __G.input.aimHint.cancel);
  await g.f.up(3);
  await wait(p, 350);
  const z2 = await p.evaluate(() => ({ cd: __G.match.units[0].cd.s2, zones: __G.match.zones.length }));
  check(hc === true && z2.cd === 0 && z2.zones === 0, `releasing inside the cancel zone casts nothing (hint cancel ${hc}, cooldown ${z2.cd}, zones ${z2.zones})`);

  // 6. Two thumbs: move and fire at once.
  await place(p, 0, 0, 0);
  await forget();
  const n0 = await me();
  await g.f.down(1, 160, 250);
  await g.f.move(1, 160, 190);
  await g.f.down(2, fr.cx, fr.cy);
  await g.f.move(2, fr.cx + 40, fr.cy);
  await wait(p, 700);
  const n1 = await me(), ns = await mine();
  check(n1.z - n0.z < -2 && ns.length > 0 && near(n1.aim, 0, 0.25), `move and fire work together (dz ${(n1.z - n0.z).toFixed(1)}, ${ns.length} shots, aim ${n1.aim.toFixed(2)})`);
  await g.f.up(1); await g.f.up(2);
  await wait(p, 200);
  check((await p.evaluate(() => __G.match.units[0].alive)), 'mech is still alive after the two-thumb test');

  // 7. Fixed stick keeps its base at the layout position.
  await G(p, () => __G.input.layout.set({ fixedStick: true }));
  const base0 = await rectOf(p, 'move');
  await place(p, 0, 0, 0);
  const f0 = await me();
  await g.f.down(1, 300, 200);
  await wait(p, 100);
  await g.f.move(1, 310, 200);
  await wait(p, 500);
  const base1 = await rectOf(p, 'move'), f1 = await me();
  check(Math.hypot(base1.cx - base0.cx, base1.cy - base0.cy) < 1.5 && f1.x - f0.x > 1.5, `fixedStick keeps the base at ${base0.cx.toFixed(0)},${base0.cy.toFixed(0)} and steers from it (dx ${(f1.x - f0.x).toFixed(1)})`);
  await g.f.up(1);
  await G(p, () => __G.input.layout.set({ fixedStick: false }));


  // 7b. Auto-aim. Every unit but mine is frozen where the scene puts it; hp is set per scene.
  const FAR = [[34, -9], [34, -6], [34, -3], [34, 0], [34, 3]];
  // Switching Tự nhắm off for a moment drops any lock left from the last scene.
  const scene = async (pg, spec) => { const was = await pg.evaluate(() => { const a = __G.input.layout.get().autoAim; __G.input.layout.set({ autoAim: false }); return a; }); await wait(pg, 120); await pg.evaluate((a) => __G.input.layout.set({ autoAim: a }), was); await setScene(pg, spec); };
  const setScene = (pg, spec) => pg.evaluate(([spec, far]) => {
    clearInterval(window.__calm); clearInterval(window.__freeze);
    const m = __G.match, me = m.units[0];
    me.maxHp = me.hp = 1e6; me.stunT = 0; for (const k in me.cd) me.cd[k] = 0;
    me.x = me.px = spec.me[0]; me.z = me.pz = spec.me[1]; me.vx = me.vz = 0; if (spec.aim !== undefined) me.aim = spec.aim;
    m.zones.length = 0; m.shots.length = 0;
    m.units.forEach((u, i) => {
      if (!i) return;
      const s = spec.units[i] || {}, at = s.at || far[(i - 1) % 5];
      u.x = u.px = at[0]; u.z = u.pz = at[1]; u.vx = u.vz = 0;
      u.maxHp = s.max || 1e6; u.hp = s.hp || u.maxHp; u.alive = true; u.stealthT = s.stealth ? 1e9 : 0; u.shield = 0; u.hasteT = 0;
      u.bush = -1;
    });
    window.__freeze = setInterval(() => { for (const u of m.units) if (u.id) { u.stunT = 60; u.vx = u.vz = 0; if (u.alive && spec.units[u.id] && spec.units[u.id].stealth) u.stealthT = 1e9; } }, 15);
    window.__rec.clear();
  }, [spec, FAR]);
  const lockOf = (pg) => pg.evaluate(() => { const k = __G.input.lock; return k ? { kind: k.kind, id: k.id } : null; });
  const dirTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const holdFire = async (pg, ms) => { await g.f.down(2, fr.cx, fr.cy); await wait(pg, ms); const l = await lockOf(pg); const sh = await mine(); await g.f.up(2); return { lock: l, shots: sh }; };
  const aimsAt = (shots, a, tol = 0.3) => shots.length > 0 && shots.every((s) => near(Math.atan2(s.dz, s.dx), a, tol));
  const setAim = (pg, o) => pg.evaluate((o) => __G.input.layout.set(o), o);
  const aimCfg = (pg) => pg.evaluate(() => { const l = __G.input.layout.get(); return { auto: l.autoAim, prio: l.aimPriority }; });

  // Nearest enemy, not the one the turret happened to face (turret faces east where the far one stands).
  await scene(p, { me: [0, 0], aim: 0, units: { 3: { at: [9, 0] }, 4: { at: [0, -5] } } });
  let r = await holdFire(p, 700);
  check(r.lock && r.lock.id === 4 && aimsAt(r.shots, -Math.PI / 2), `holding fire locks the nearest enemy (id ${r.lock && r.lock.id}) and shoots it, not the one the turret faced (${r.shots.length} shots)`);
  await scene(p, { me: [0, 0], aim: 0, units: { 3: { at: [9, 0] }, 4: { at: [0, -5] } } });
  await g.f.tap(fr.cx, fr.cy, 60);
  await wait(p, 600);
  const tapShots = await mine();
  check(tapShots.length >= 1 && aimsAt(tapShots, -Math.PI / 2), `a quick tap fires once at the nearest enemy (${tapShots.length} shots)`);

  // Sticky: the lock stays while a second enemy moves slightly closer.
  await scene(p, { me: [0, 0], aim: 0, units: { 3: { at: [0, -6] }, 4: { at: [6.8, 0] } } });
  await g.f.down(2, fr.cx, fr.cy);
  await wait(p, 300);
  const l1 = await lockOf(p);
  await place(p, 4, 5.2, 0);
  await wait(p, 300);
  const l2 = await lockOf(p);
  await place(p, 4, 2, 0);
  await wait(p, 300);
  const l3 = await lockOf(p);
  await g.f.up(2);
  check(l1 && l1.id === 3 && l2 && l2.id === 3 && l3 && l3.id === 3, `the lock stays on the same enemy while another closes in (${l1 && l1.id}, ${l2 && l2.id}, ${l3 && l3.id})`);

  // Drops: death, out of range, behind a wall; then the next valid enemy.
  await scene(p, { me: [0, 0], aim: 0, units: { 3: { at: [0, -5] }, 4: { at: [7, 0] } } });
  await g.f.down(2, fr.cx, fr.cy);
  await wait(p, 300);
  const d0 = await lockOf(p);
  await p.evaluate(() => { __G.match.units[3].alive = false; });
  await wait(p, 300);
  const d1 = await lockOf(p);
  await place(p, 4, 30, 0);
  await wait(p, 300);
  const d2 = await lockOf(p);
  await g.f.up(2);
  check(d0 && d0.id === 3 && d1 && d1.id === 4 && d2 === null, `the lock drops on death (to ${d1 && d1.id}) and when the target leaves range (${JSON.stringify(d2)})`);
  const wp = await p.evaluate(async () => {
    const M = await import('./js/maps.js'), map = __G.match.map;
    for (const w of map.walls) {
      const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const h = (dx ? w.x1 - w.x0 : w.z1 - w.z0) / 2 + 2.2, a = [cx - dx * h, cz - dz * h], b = [cx + dx * h, cz + dz * h];
        if (2 * h < 11 && !M.solidAt(map, a[0], a[1], 0.9) && !M.solidAt(map, b[0], b[1], 0.9) && !M.losClear(map, a[0], a[1], b[0], b[1])) {
          for (let k = 0; k < 16; k++) {
            const t = [a[0] + Math.cos(k * 0.3927) * 4.5, a[1] + Math.sin(k * 0.3927) * 4.5];
            if (!M.solidAt(map, t[0], t[1], 0.9) && M.losClear(map, a[0], a[1], t[0], t[1], 0.5)) return { a, b, c: t };
          }
        }
      }
    }
    return null;
  });
  check(!!wp, 'the map has a wall to test line of sight with');
  if (wp) {
    await scene(p, { me: wp.a, aim: 0, units: { 3: { at: wp.b }, 4: { at: wp.c } } });
    await g.f.down(2, fr.cx, fr.cy);
    await wait(p, 300);
    const w1 = await lockOf(p);
    await g.f.up(2);
    check(w1 && w1.id === 4, `an enemy behind a wall is not locked while another is in the clear (locked ${w1 && w1.id})`);
  }

  // Drag overrides: aim follows the thumb, the lock is cleared; tapping again re-acquires.
  await scene(p, { me: [0, 0], aim: 0, units: { 3: { at: [0, -6] } } });
  await g.f.down(2, fr.cx, fr.cy);
  await wait(p, 250);
  const g0 = await lockOf(p);
  await g.f.move(2, fr.cx - 40, fr.cy);
  await wait(p, 600);
  const g1 = await lockOf(p), ga = await me(), gs = await mine();
  await g.f.up(2);
  check(g0 && g0.id === 3 && g1 === null && near(ga.aim, Math.PI, 0.25), `dragging the fire button clears the lock and the aim follows the thumb (lock ${JSON.stringify(g1)}, aim ${ga.aim.toFixed(2)})`);
  check(gs.some((s) => s.dx < -0.8), 'shots go where the thumb points, not at the enemy');
  await forget();
  await g.f.tap(fr.cx, fr.cy, 60);
  await wait(p, 300);
  check((await lockOf(p)) && (await lockOf(p)).id === 3, 'tapping fire again locks the enemy again');

  // Priority options in one scene: C is nearest, A has the least hp, B the lowest share.
  const prioScene = { me: [0, 0], aim: 0, units: { 3: { at: [8, 0], hp: 500, max: 1000 }, 4: { at: [0, 9], hp: 800, max: 4000 }, 5: { at: [-5, 0] } } };
  const picks = {};
  for (const prio of ['near', 'lowhp', 'lowpct']) {
    await setAim(p, { aimPriority: prio });
    await scene(p, prioScene);
    await g.f.down(2, fr.cx, fr.cy);
    await wait(p, 120);
    picks[prio] = (await lockOf(p) || {}).id;
    await g.f.up(2);
    await wait(p, 700);
  }
  await setAim(p, { aimPriority: 'near' });
  check(picks.near === 5 && picks.lowhp === 3 && picks.lowpct === 4, `priority picks the nearest (${picks.near}), the lowest hp (${picks.lowhp}) and the lowest share (${picks.lowpct})`);

  // Tap on an enemy on screen picks it even though another is nearer.
  await scene(p, { me: [0, 0], aim: 0, units: { 3: { at: [3, 0] }, 4: { at: [8, -3.5] } } });
  const px = await p.evaluate(() => { const q = __G.project(8, 0, -3.5); return [q.x, q.y]; });
  await g.f.tap(px[0], px[1], 50);
  await wait(p, 150);
  const tl = await lockOf(p);
  r = await holdFire(p, 700);
  check(tl && tl.id === 4 && r.lock && r.lock.id === 4 && aimsAt(r.shots, dirTo([0, 0], [8, -3.5]), 0.3), `tapping an enemy on screen locks it (${tl && tl.id}) and fire follows it`);

  // A hidden enemy is never locked, however near.
  await scene(p, { me: [0, 0], aim: 0, units: { 3: { at: [0, -5], stealth: true }, 4: { at: [8, 0] } } });
  r = await holdFire(p, 500);
  check(r.lock && r.lock.id === 4 && aimsAt(r.shots, 0), `a stealthed enemy nearby is skipped (locked ${r.lock && r.lock.id})`);

  // No enemy in range: the old behaviour, along the last aim.
  await g.f.down(2, fr.cx, fr.cy); await g.f.move(2, fr.cx + 40, fr.cy); await wait(p, 300); await g.f.up(2);
  await scene(p, { me: [0, 0], units: {} });
  r = await holdFire(p, 500);
  check(r.lock === null && aimsAt(r.shots, 0, 0.2), `no enemy in range fires along the last aim as before (${r.shots.length} shots, lock ${JSON.stringify(r.lock)})`);

  // Setting off: today's tap and hold, even with an enemy next to the mech.
  await setAim(p, { autoAim: false });
  await scene(p, { me: [0, 0], units: { 3: { at: [0, -5] } } });
  r = await holdFire(p, 500);
  check(r.lock === null && aimsAt(r.shots, 0, 0.2), `with Tự nhắm off, holding fire keeps the last aim (${r.shots.length} shots)`);
  await setAim(p, { autoAim: true });

  // Settings survive a reload.
  await setAim(p, { autoAim: false, aimPriority: 'lowpct', padAim: true });
  const sv = await G(p, () => JSON.parse(localStorage.getItem('dtt.save.v1')).controls.aim);
  await p.reload();
  await p.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  await wait(p, 500);
  const rl = await aimCfg(p), rp = await G(p, () => __G.input.layout.get().padAim);
  check(sv.auto === false && sv.priority === 'lowpct' && sv.pad === true && rl.auto === false && rl.prio === 'lowpct' && rp === true, `Tự nhắm settings are saved under controls.aim and survive a reload (${JSON.stringify(rl)})`);
  await setAim(p, { autoAim: true, aimPriority: 'near', padAim: false });
  await G(p, () => { window.__rec = new Map(); setInterval(() => { for (const s of __G.match.shots) if (s.owner === 0 && !window.__rec.has(s.id)) window.__rec.set(s.id, { dx: s.dx, dz: s.dz, hook: !!s.hook }); }, 8); });

  // Skills. Each needs its own mech, so a fresh page; the scene helper is reused.
  const skillPage = async (mech) => {
    const t = await begin(br, base, vp, '', mech);
    await t.page.evaluate(() => { window.__rec = new Map(); setInterval(() => { for (const s of __G.match.shots) if (s.owner === 0 && !window.__rec.has(s.id)) window.__rec.set(s.id, { dx: s.dx, dz: s.dz, hook: !!s.hook }); }, 8); });
    return t;
  };
  let t = await skillPage('nhenthep');   // Mikasa's Đạn Xạ Câu Trảo (s2, kit lane K18): Medusa (mangxa) has no hook since kit lane k17
  await scene(t.page, { me: [0, 0], aim: 0, units: { 3: { at: [0, -8] }, 4: { at: [9, 3] } } });
  let br2 = await rectOf(t.page, 's2');
  await t.f.tap(br2.cx, br2.cy);
  await wait(t.page, 700);
  const hk = await t.page.evaluate(() => [...window.__rec.values()].filter((s) => s.hook));
  check(hk.length === 1 && aimsAt(hk, -Math.PI / 2, 0.2), `tapping a directional skill (Đạn Xạ Câu Trảo) casts toward the lock, the nearest enemy (${hk.length} hooks)`);
  check((await t.page.evaluate(() => window.__errors)).length === 0 && t.problems.length === 0, 'no errors in the directional skill page');
  await t.close();

  t = await skillPage('hac');
  const zoneAt = (pg) => pg.evaluate(() => { const z = __G.match.zones.find((q) => q.kind === 'field'); return z && [z.x, z.z]; });
  br2 = await rectOf(t.page, 's2');
  await scene(t.page, { me: [0, 0], aim: 0, units: { 3: { at: [0, -8] } } });
  await t.f.tap(br2.cx, br2.cy);
  await wait(t.page, 700);
  const za = await zoneAt(t.page);
  check(!!za && Math.hypot(za[0] - 0, za[1] + 8) < 1.2, `tapping an area skill lands it on the lock (${za ? za.map((v) => v.toFixed(1)) : 'none'} for an enemy at 0,-8)`);
  await scene(t.page, { me: [0, 0], aim: 0, units: { 3: { at: [0, -14] } } });
  await t.f.tap(br2.cx, br2.cy);
  await wait(t.page, 900);
  const zb = await zoneAt(t.page);
  check(!!zb && Math.abs(Math.hypot(zb[0], zb[1]) - 13) < 0.8 && Math.abs(zb[0]) < 1, `an enemy past cast range gets the area clamped to 13 m (${zb ? zb.map((v) => v.toFixed(1)) : 'none'})`);
  await scene(t.page, { me: [0, 0], aim: 0, units: {} });
  await t.f.tap(br2.cx, br2.cy);
  await wait(t.page, 500);
  const zc = await zoneAt(t.page), cd = await t.page.evaluate(() => __G.match.units[0].cd.s2);
  check(cd > 5, `with nobody in range the skill still casts as before (cooldown ${cd.toFixed(1)}, zone ${zc ? zc.map((v) => v.toFixed(1)) : 'none'})`);
  await t.close();

  t = await skillPage('kimquy');
  br2 = await rectOf(t.page, 's1');
  await scene(t.page, { me: [0, 0], aim: 0, units: { 1: { at: [-6, 2], hp: 2000, max: 3000 }, 2: { at: [4, 6], hp: 900, max: 3000 }, 3: { at: [9, 0] } } });
  await t.f.tap(br2.cx, br2.cy);
  await wait(t.page, 600);
  const sh = await t.page.evaluate(() => __G.match.units.slice(0, 3).map((u) => u.shield));
  check(sh[2] > 0 && sh[1] === 0 && sh[0] === 0, `tapping Khiên Tặng shields the most hurt of my two allies in range (shields ${sh.map((v) => v.toFixed(0))})`);
  check((await t.page.evaluate(() => window.__errors)).length === 0 && t.problems.length === 0, 'no errors in the ally skill page');
  await t.close();

  check((await p.evaluate(() => window.__errors)).length === 0 && g.problems.length === 0, 'no errors during the touch session' + (g.problems[0] ? ': ' + g.problems[0].slice(0, 200) : ''));

  // 8. Geometry at four screen sizes (a fresh page each: the page may have gone fullscreen, which blocks resizing).
  for (const [w, hgt] of [[740, 360], [844, 390], [915, 412], [1180, 820]]) {
    const t = await begin(br, base, { width: w, height: hgt });
    const r = await t.page.evaluate(() => [...document.querySelectorAll('#touch .tc-ctl')].map((n) => { const b = n.getBoundingClientRect(); return { id: n.dataset.id, l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; }));
    const W = w, H = hgt;
    const small = r.filter((c) => c.w < 47.9 || c.h < 47.9).map((c) => c.id);
    const outside = r.filter((c) => c.l < -0.5 || c.t < -0.5 || c.r > W + 0.5 || c.b > H + 0.5).map((c) => c.id);
    const clash = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (Math.hypot(r[i].cx - r[j].cx, r[i].cy - r[j].cy) < (r[i].w + r[j].w) / 2 - 0.5) clash.push(r[i].id + '/' + r[j].id);
    const mid = r.filter((c) => c.r > W * 0.4 && c.l < W * 0.6 && c.b > H * 0.25 && c.t < H * 0.75).map((c) => c.id);
    check(r.length === 7 && !small.length, `${w}x${hgt}: all ${r.length} controls are at least 48 px (${r.map((c) => Math.round(c.w)).join(',')})`);
    check(!outside.length, `${w}x${hgt}: every control is inside the viewport${outside.length ? ' (outside: ' + outside + ')' : ''}`);
    check(!clash.length && !mid.length, `${w}x${hgt}: controls do not overlap each other or the screen centre${clash.length ? ' clash ' + clash : ''}${mid.length ? ' centre ' + mid : ''}`);
    if (w === 740 || w === 844) {
      // Mid-fight screenshot with E being drag-aimed.
      await t.page.evaluate(() => { const m = __G.match; m.units.forEach((u, i) => { u.x = u.px = i ? (u.team ? 9 : 4) + i : 0; u.z = u.pz = i ? (i % 3 - 1) * 5 : 0; }); m.units[0].cd.s2 = 0; });
      const e2 = await rectOf(t.page, 's2');
      await t.f.down(3, e2.cx, e2.cy);
      await t.f.move(3, e2.cx - 30, e2.cy - 10);
      await t.f.move(3, e2.cx - 55, e2.cy - 20);
      await wait(t.page, 400);
      await t.page.screenshot({ path: path.join(SHOTS, `dev-e-aim-${w}x${hgt}.png`) });
      await t.f.up(3);
    }
    await t.close();
  }

  // 9. Layout editor: move a control with the thumb, resize it, close, reload.
  await G(p, () => __G.input.layout.reset());
  await G(p, () => { window.__closed = false; __G.input.layout.edit({ onClose: () => { window.__closed = true; } }); });
  await wait(p, 200);
  const before = await rectOf(p, 's1');
  await g.f.down(4, before.cx, before.cy);
  await g.f.move(4, before.cx - 40, before.cy - 30);
  await g.f.move(4, before.cx - 80, before.cy - 60);
  await g.f.up(4);
  await G(p, () => { const i = document.querySelector('#touch [data-r="size"]'); i.value = 72; i.dispatchEvent(new Event('input')); const o = document.querySelector('#touch [data-r="op"]'); o.value = 70; o.dispatchEvent(new Event('input')); });
  await wait(p, 200);
  const after = await rectOf(p, 's1');
  check(Math.abs(after.cx - (before.cx - 80)) < 6 && Math.abs(after.cy - (before.cy - 60)) < 6 && Math.abs(after.w - 72) < 1, `editor: dragging moves the control (${before.cx.toFixed(0)},${before.cy.toFixed(0)} to ${after.cx.toFixed(0)},${after.cy.toFixed(0)}) and the slider resizes it (${after.w.toFixed(0)} px)`);
  await p.screenshot({ path: path.join(SHOTS, 'dev-editor-844x390.png') });
  const btn = await p.evaluate(() => [...document.querySelectorAll('#touch .tc-panel button, #touch .tc-panel input[type=range], #touch .tc-panel .tc-chk')].map((n) => { const r = n.getBoundingClientRect(); return Math.round(r.height); }));
  check(btn.every((h) => h >= 48), `editor buttons and sliders are finger sized (${btn.join(',')} px tall)`);
  await p.click('#touch [data-r="done"]');
  await wait(p, 200);
  check(await G(p, () => window.__closed === true && !document.querySelector('#touch').classList.contains('editing')), 'Xong closes the editor and calls onClose');
  const saved = await G(p, () => JSON.parse(localStorage.getItem('dtt.save.v1')).controls);
  check(saved.v === 1 && saved.o.s1 && saved.o.s1.size === 72 && saved.o.s1.opacity === 0.7, 'the layout is saved inside the progress data under controls.v1');
  await G(p, () => __G.input.layout.set({ fixedStick: true }));
  await p.reload();
  await p.waitForFunction('window.__ready === true', null, { timeout: 120000 });
  await wait(p, 500);
  const re = await G(p, () => { const l = __G.input.layout.get(); const c = l.controls.find((x) => x.id === 's1'); return { fixed: l.fixedStick, size: c.size, op: c.opacity, w: c.rect && c.rect.w }; });
  check(re.fixed === true && re.size === 72 && re.op === 0.7 && Math.abs(re.w - 72) < 1, `layout and fixedStick survive a reload (size ${re.size}, opacity ${re.op})`);
  await G(p, () => __G.input.layout.reset());
  const rs = await G(p, () => { const l = __G.input.layout.get(); return { fixed: l.fixedStick, s1: l.controls.find((x) => x.id === 's1').size }; });
  check(!rs.fixed && rs.s1 === 56, 'Về mặc định restores the default layout');
  check((await p.evaluate(() => window.__errors)).length === 0 && g.problems.length === 0, 'no errors in the layout editor' + (g.problems[0] ? ': ' + g.problems[0].slice(0, 200) : ''));
  await g.close();

  // 11. Feel: phone vibration, camera shake, own health bar. navigator.vibrate is stubbed; headless Chrome cannot buzz, so what is
  // proved is which calls the page makes and which long-press defaults it leaves enabled.
  {
    const VIB = `window.__vib = []; navigator.vibrate = (p) => { window.__vib.push([performance.now(), p]); return true; };`;
    const level = (pg, f, v) => pg.evaluate(([f, v]) => { __G.meta.get().settings[f] = v; }, [f, v]);
    const vib = (pg) => pg.evaluate(() => window.__vib.splice(0).map((v) => JSON.stringify(v[1])));
    const f = await begin(br, base, vp, '', 'soi');
    const q = f.page;
    await calm(q); await q.evaluate(VIB);
    const fireR = await rectOf(q, 'fire');
    // 11a. Ten seconds of continuous fire at each level: no pulse from firing, ever.
    for (const lv of ['off', 'light', 'strong']) {
      await level(q, 'vibe', lv); await vib(q);
      await f.f.down(5, fireR.cx, fireR.cy); await wait(q, 10000); await f.f.up(5);
      const shots = await q.evaluate(() => __G.match.units[0].shots || 0);
      const n = (await vib(q)).length;
      check(n === 0, `10 s of held fire at "${lv}" makes ${n} navigator.vibrate calls`);
    }
    // 11b. Meaningful moments: one pulse each, the right pattern, rate-limited.
    const ev = (e) => q.evaluate((e) => { const m = __G.match; __G.ui.event({ x: 0, z: 0, assists: [], ...e }); }, e);
    const EXPECT = { hit: { light: '[15]', strong: '[35]' }, death: { light: '[20,50,20]', strong: '[40,60,40]' }, ult: { light: '[12]', strong: '[25]' }, kill: { light: '[12]', strong: '[28]' } };
    const trigger = async (kind) => {
      if (kind === 'hit') await ev({ t: 'hit', id: 0, by: 3, amt: 1500 });
      else if (kind === 'death') await ev({ t: 'death', id: 0, by: 3 });
      else if (kind === 'kill') await ev({ t: 'death', id: 3, by: 0 });
      else { await q.evaluate(() => { const u = __G.match.units[0]; u.alive = true; u.cd.ult = 0.15; }); await wait(q, 500); }
      await wait(q, 100);
    };
    for (const lv of ['light', 'strong']) {
      await level(q, 'vibe', lv);
      for (const kind of ['hit', 'death', 'kill', 'ult']) {
        await wait(q, 450); await vib(q);
        await trigger(kind);
        const c = await vib(q);
        check(c.length === 1 && c[0] === EXPECT[kind][lv], `"${lv}": ${kind} gives one pulse ${EXPECT[kind][lv]} (${c.join(' ') || 'none'})`);
      }
    }
    await wait(q, 450); await vib(q);
    await ev({ t: 'hit', id: 0, by: 3, amt: 1500 }); await ev({ t: 'hit', id: 0, by: 3, amt: 1500 }); await ev({ t: 'hit', id: 0, by: 3, amt: 1500 });
    check((await vib(q)).length === 1, 'three big hits inside 400 ms make one pulse (rate limit)');
    await ev({ t: 'hit', id: 0, by: 3, amt: 50 });
    check((await vib(q)).length === 0, 'a small hit never buzzes');
    await level(q, 'vibe', 'off'); await wait(q, 450);
    for (const kind of ['hit', 'death', 'kill', 'ult']) { await trigger(kind); await wait(q, 450); }
    check((await vib(q)).length === 0, '"off": hit, death, kill and ult-ready make zero navigator.vibrate calls');
    await level(q, 'vibe', 'light');

    // 11c. The gamepad actuator is never touched on a phone with no pad in use, even when a pad is exposed.
    const pad = await q.evaluate(() => {
      window.__pe = 0;
      const fake = { id: 'virtual', index: 0, connected: true, axes: [0, 0, 0, 0], buttons: [], vibrationActuator: { type: 'dual-rumble', playEffect() { window.__pe++; return Promise.resolve(); } } };
      navigator.getGamepads = () => [fake];
      const r = __G.input.rumble('hit');
      __G.ui.event({ t: 'hit', id: 0, by: 3, amt: 1500, x: 0, z: 0 }); __G.ui.event({ t: 'death', id: 0, by: 3, assists: [], x: 0, z: 0 });
      return { r, pe: window.__pe, device: __G.input.device ? __G.input.device() : '?' };
    });
    check(pad.r === false && pad.pe === 0, `rumble() on a touch phone makes no gamepad call even with a pad listed (device ${pad.device}, playEffect ${pad.pe})`);

    // 11d. Long press: a 700 ms hold on the stick area, the fire button and a skill button.
    const ctlSel = ['#touch', '#touch [data-id="fire"]', '#touch [data-id="s1"]', '#touch [data-id="move"]', '#view', '#ui', '#ui .hud'];
    const css = await q.evaluate((sels) => sels.map((s) => { const n = document.querySelector(s); if (!n) return [s, 'missing']; const c = getComputedStyle(n); return [s, c.touchAction, c.userSelect, c.webkitTouchCallout || c.getPropertyValue('-webkit-touch-callout')]; }), ctlSel);
    console.log('  computed CSS (selector, touch-action, user-select, touch-callout):\n  ' + css.map((r) => r.join(' | ')).join('\n  '));
    check(css.filter((r) => /fire|s1|move|#touch$|#view/.test(r[0])).every((r) => r[1] === 'none' && r[2] === 'none' && (r[3] === 'none' || r[3] === '')), 'the play field, stick, fire and skill buttons are touch-action none and user-select none, no callout');
    await q.evaluate(() => { window.__ctx = []; window.addEventListener('contextmenu', (e) => window.__ctx.push(e.defaultPrevented)); window.__sel = []; window.addEventListener('selectstart', (e) => window.__sel.push(e.defaultPrevented)); });
    const s1R = await rectOf(q, 's1');
    for (const [name, x, y] of [['stick area', 120, 250], ['fire button', fireR.cx, fireR.cy], ['skill button', s1R.cx, s1R.cy]]) {
      await f.f.down(6, x, y); await wait(q, 700);
      const st = await q.evaluate(() => ({ sel: String(getSelection()), n: window.__ctx.length, bad: window.__ctx.filter((d) => !d).length }));
      await f.f.up(6);
      check(st.sel === '' && st.bad === 0, `a 700 ms hold on the ${name}: no selection, ${st.n} contextmenu events, none left un-prevented`);
    }
    const synth = await q.evaluate(() => ['#touch [data-id="fire"]', '#touch [data-id="move"]', '#view', '#ui'].map((s) => { const n = document.querySelector(s); const c = new Event('contextmenu', { bubbles: true, cancelable: true }), d = new Event('selectstart', { bubbles: true, cancelable: true }); n.dispatchEvent(c); n.dispatchEvent(d); return s + ':' + c.defaultPrevented + '/' + d.defaultPrevented; }));
    check(synth.every((r) => r.endsWith('true/true')), `contextmenu and selectstart are cancelled on every layer (${synth.join(' ')})`);
    check((await q.evaluate(() => window.__errors)).length === 0 && f.problems.length === 0, 'no errors in the feel session');
    await f.close();

    // 11e. Camera shake, in a manual page so the camera is still: the offset from the rest pose, per level.
    const sg = await open(br, base, 'manual&noaudio&autostart&seed=3&q=low&mech=soi', { viewport: vp, touch: true });
    const sp = sg.page;
    const shakeRun = (lv, mode) => sp.evaluate(([lv, mode]) => {
      const G = __G, m = G.match, me = m.units[0];
      G.meta.get().settings.shake = lv;
      for (const u of m.units) if (u.id) { u.stunT = 1e6; u.maxHp = u.hp = 1e7; u.x = u.px = u.team ? 30 : -30; u.z = u.pz = u.id * 2; }
      me.x = me.px = 0; me.z = me.pz = 0; me.maxHp = me.hp = 1e7;
      window.__input(null); for (let i = 0; i < 60; i++) window.__step(1, i === 59);
      let worst = 0;
      if (mode === 'fire') {
        const foe = m.units.find((u) => u.team === 1); foe.x = foe.px = 9; foe.z = foe.pz = 0;
        window.__input({ mx: 0, mz: 0, aim: 0, fire: true, s1: false, s2: false, ult: false, heal: false, tx: 9, tz: 0 });
        for (let i = 0; i < 300; i++) { window.__step(1, true); worst = Math.max(worst, window.__stats.shake); }
        window.__input(null);
      } else {
        m.events.length = 0;
        G.gfx.fx.event({ t: 'hit', id: 0, by: 3, amt: 1500, x: 0, z: 0 }, m);
        for (let i = 0; i < 12; i++) { window.__step(1, true); worst = Math.max(worst, window.__stats.shake); }
      }
      return worst;
    }, [lv, mode]);
    const amp = {};
    for (const lv of ['off', 'light', 'strong']) amp[lv] = { hit: await shakeRun(lv, 'hit'), fire: await shakeRun(lv, 'fire') };
    console.log('  peak camera shake amplitude (world units, the offset is up to 2x this; x22 = px at 844x390): ' + JSON.stringify(amp));
    check(amp.off.hit === 0 && amp.off.fire === 0, 'shake "Tắt": the camera offset is exactly zero (the applied amplitude) after a big hit and during 10 s of fire');
    check(amp.strong.hit > 0.01 && amp.light.hit > 0.3 * amp.strong.hit && amp.light.hit < 0.7 * amp.strong.hit, `a big hit shakes at "Mạnh" (${amp.strong.hit.toFixed(3)}) and "Nhẹ" about half of it (${amp.light.hit.toFixed(3)})`);
    check(amp.strong.fire < 0.02, `10 s of fire alone barely moves the camera even at "Mạnh" (${amp.strong.fire.toFixed(4)} world units)`);
    await sg.close();

    // 11f. Own health bar: green; allies the team colour, enemies the enemy colour; amber and red as the warning. Host here, free-for-all next.
    const bar = (pg) => pg.evaluate(() => {
      const bg = (s) => { const n = document.querySelector(s); return n ? getComputedStyle(n).backgroundColor : null; };
      const m = __G.match, me = m.units[0];
      const mid = (hp) => { me.hp = me.maxHp * hp; };
      const out = { self: bg('#ui .np.self .np-hp i'), ally: bg('#ui .np.t0:not(.self) .np-hp i'), foe: bg('#ui .np.t1 .np-hp i'), chip: bg('#ui .pc.me .pc-hp i'), chipAlly: bg('#ui .pc:not(.me) .col-x .pc-hp i') || bg('#ui .col.mine .pc:not(.me) .pc-hp i'),
        hud: getComputedStyle(document.querySelector('#ui .hpb-main i')).backgroundImage, selfW: document.querySelector('#ui .np.self .np-hp').getBoundingClientRect().width, allyW: (document.querySelector('#ui .np.t0:not(.self) .np-hp') || document.querySelector('#ui .np:not(.self) .np-hp')).getBoundingClientRect().width,
        ring: getComputedStyle(document.querySelector('#ui .np.self .np-hp')).boxShadow };
      return out;
    });
    const hb = await begin(br, base, vp, '', 'soi');
    await wait(hb.page, 500); await calm(hb.page);
    const b1 = await bar(hb.page);
    console.log('  own bar probe: ' + JSON.stringify(b1));
    check(b1.self === 'rgb(125, 255, 90)' && b1.chip === 'rgb(125, 255, 90)' && /rgb\(125, 255, 90\)/.test(b1.hud), `own bar, own chip and the big HUD bar are green (${b1.self}, ${b1.chip})`);
    check(b1.ally === 'rgb(53, 184, 255)' && b1.chipAlly === 'rgb(53, 184, 255)' && b1.foe === 'rgb(255, 90, 54)', `allies keep the team blue (${b1.ally}) and enemies the enemy red (${b1.foe})`);
    check(b1.selfW > b1.allyW && /255, 255, 255/.test(b1.ring), `second cue: the own bar is wider (${b1.selfW.toFixed(0)} vs ${b1.allyW.toFixed(0)} px) and ringed in white`);
    const tiers = [];
    for (const [hp, want] of [[0.5, 'rgb(125, 255, 90)'], [0.3, 'rgb(255, 194, 51)'], [0.1, 'rgb(255, 59, 48)']]) {
      await hb.page.evaluate((hp) => { const u = __G.match.units[0]; u.hp = u.maxHp * hp; }, hp);
      await wait(hb.page, 150);
      const c = await hb.page.evaluate(() => ({ np: getComputedStyle(document.querySelector('#ui .np.self .np-hp i')).backgroundColor, chip: getComputedStyle(document.querySelector('#ui .pc.me .pc-hp i')).backgroundColor, hud: getComputedStyle(document.querySelector('#ui .hpb-main i')).backgroundImage }));
      tiers.push(c.np === want && c.chip === want && c.hud.includes(want.replace('rgb(125, 255, 90)', 'rgb(125, 255, 90)')));
    }
    check(tiers.every(Boolean), `health warning: green above 35 %, amber ${'rgb(255, 194, 51)'} under 35 %, red under 20 % on the world bar, the chip and the HUD bar (${tiers.join()})`);
    // Colour-blind check: green vs the blue team colour and the enemy red under deuteranopia and protanopia.
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const MX = { normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]], protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]] };
    const lab = (h, m) => { const l = hex(h).map(lin), [r, g, b] = MX[m].map((row) => Math.max(0, Math.min(1, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
      const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b, f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116), fx = f(X / 0.95047), fy = f(Y), fz = f(Z / 1.08883);
      return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]; };
    const rows = [];
    for (const m of Object.keys(MX)) {
      const G = lab('#7dff5a', m), B = lab('#35b8ff', m), R = lab('#ff5a36', m);
      rows.push({ m, dLblue: G[0] - B[0], dEblue: Math.hypot(...G.map((v, i) => v - B[i])), dLred: G[0] - R[0], dEred: Math.hypot(...G.map((v, i) => v - R[i])) });
    }
    console.log('  green #7dff5a vs blue #35b8ff / red #ff5a36 (CIELAB):\n  ' + rows.map((r) => `${r.m}: vs blue dL ${r.dLblue.toFixed(1)} dE ${r.dEblue.toFixed(0)}; vs red dL ${r.dLred.toFixed(1)} dE ${r.dEred.toFixed(0)}`).join('\n  '));
    check(rows.every((r) => r.dLblue >= 15 && r.dEblue >= 60 && r.dLred >= 20), 'green stays lighter than the blue by 15+ L* and 60+ dE under normal sight, deuteranopia and protanopia, and lighter than the red by 20+ L*');
    await hb.close();

    const ff = await begin(br, base, vp, '&mode=tudo', 'soi');
    await wait(ff.page, 500);
    const fr = await ff.page.evaluate(() => { const bg = (n) => getComputedStyle(n.querySelector('.np-hp i')).backgroundColor; const all = [...document.querySelectorAll('#ui .np')].filter((n) => !n.classList.contains('decoy')); return { self: bg(document.querySelector('#ui .np.self')), others: [...new Set(all.filter((n) => !n.classList.contains('self')).map(bg))], chips: document.querySelectorAll('#ui .pc').length }; });
    check(fr.self === 'rgb(125, 255, 90)' && fr.others.join() === 'rgb(255, 90, 54)', `free-for-all: my bar is green (${fr.self}) and everyone else the enemy red (${fr.others.join()})`);
    await ff.close();
  }

  // 10. Desktop without touch gets none of it.
  const d = await open(br, base, 'autostart&noaudio&seed=3&q=low', { viewport: { width: 1280, height: 720 } });
  await wait(d.page, 400);
  const dk = await d.page.evaluate(() => ({ touch: __G.input.touch, dom: !!document.getElementById('touch') || !!document.querySelector('.tc-ctl'), hint: __G.input.aimHint, api: typeof __G.input.layout.edit }));
  check(dk.touch === false && !dk.dom && dk.hint === null && dk.api === 'function', 'desktop without touch creates no touch DOM and keeps the layout API');
  await d.page.mouse.move(900, 300); await d.page.keyboard.down('d'); await d.page.mouse.down();
  await wait(d.page, 700);
  const dm = await d.page.evaluate(() => { const u = __G.match.units[0]; return { dx: u.x - __G.match.map.spawns[0][0][0], fired: __G.match.shots.some((s) => s.owner === 0) || u.cd.fire > 0 }; });
  await d.page.keyboard.up('d'); await d.page.mouse.up();
  check(dm.dx > 1 && dm.fired, `keyboard and mouse still move and fire (dx ${dm.dx.toFixed(1)})`);
  // A mouse never auto-aims: an enemy right beside the mech, the cursor the other way, shots follow the cursor.
  await d.page.evaluate(() => {
    window.__rec = new Map(); setInterval(() => { for (const s of __G.match.shots) if (s.owner === 0 && !window.__rec.has(s.id)) window.__rec.set(s.id, { dx: s.dx, dz: s.dz }); }, 8);
    const m = __G.match, me = m.units[0]; me.maxHp = me.hp = 1e6;
    setInterval(() => { for (const u of m.units) if (u.id) { u.stunT = 60; u.hp = u.maxHp = 1e6; } }, 15);
    m.units.forEach((u, i) => { if (i) { u.x = u.px = u.team ? 34 : -34; u.z = u.pz = -20 + i * 3; } });
    me.x = me.px = 0; me.z = me.pz = 0; m.units[5].x = m.units[5].px = 0; m.units[5].z = m.units[5].pz = -5;
  });
  const cur = await d.page.evaluate(() => { const q = __G.project(8, 0, 0); return [q.x, q.y]; });
  await d.page.mouse.move(cur[0], cur[1]); await d.page.mouse.down();
  await wait(d.page, 700);
  const ms = await d.page.evaluate(() => ({ lock: __G.input.lock, shots: [...window.__rec.values()] }));
  await d.page.mouse.up();
  check(ms.lock === null && ms.shots.length > 0 && ms.shots.every((s) => s.dx > 0.8), `a mouse-driven page never auto-aims (${ms.shots.length} shots along the cursor, lock ${JSON.stringify(ms.lock)})`);
  check((await d.page.evaluate(() => window.__errors)).length === 0 && d.problems.length === 0, 'no errors on desktop');
  await d.close();
  check.done();
});
