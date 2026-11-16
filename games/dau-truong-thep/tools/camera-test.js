// The MOBA-style camera on the real page, with real touch and mouse input, at the owner's phone size (Xiaomi 17T: 1002x461):
// aim pan, the half-turned view for team 1, minimap drag, death and spectate camera, camera height.
//   node tools/camera-test.js          screenshots go to .chk/mobile-ui/xiaomi-*.png
'use strict';
const { session, open, checker, CHK, fs, path } = require('./lib.js');
const check = checker();
const SHOTS = path.join(CHK, 'mobile-ui');
const PHONE = { width: 1002, height: 461 }, TABLET = { width: 1180, height: 820 };
const wait = (p, ms) => p.waitForTimeout(ms);
const f1 = (v) => Number(v).toFixed(1);

function fingers(cdp) {
  const down = new Map();
  const send = (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...down].map(([id, [x, y]]) => ({ x, y, id })) });
  return {
    async down(id, x, y) { down.set(id, [x, y]); await send('touchStart'); },
    async move(id, x, y) { down.set(id, [x, y]); await send('touchMove'); },
    async up(id) { down.delete(id); await send('touchEnd'); },
  };
}
const rectOf = (p, sel) => p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);
const ctl = (p, id) => rectOf(p, `#touch [data-id="${id}"]`);
const cam = (p) => p.evaluate(() => { const c = __G.cam.get(), u = __G.match.units[__G.me], s = __G.project(u.x, 0.4, u.z); return { ...c, me: { x: u.x, z: u.z, alive: u.alive, sx: s.x, sy: s.y }, y: __G.camera.position.y, W: innerWidth, H: innerHeight }; });
// Everyone but the player stands still far away, stunned and unkillable.
const calm = (p) => p.evaluate(() => {
  const m = __G.match, me = m.units[__G.me];
  me.maxHp = me.hp = 1e6;
  window.__calm = setInterval(() => { for (const u of m.units) if (u.id !== __G.me) { u.stunT = 60; u.maxHp = Math.max(u.maxHp, 1e6); u.hp = u.maxHp; } }, 15);
  m.units.forEach((u) => { if (u.id !== __G.me) { u.x = u.px = (u.team ? 30 : -30); u.z = u.pz = -18 + u.id * 3; } });
});
const place = (p, id, x, z) => p.evaluate(([id, x, z]) => { const u = __G.match.units[id]; u.x = u.px = x; u.z = u.pz = z; u.vx = u.vz = 0; }, [id, x, z]);

async function begin(br, base, query, vp = PHONE, touch = true) {
  const g = await open(br, base, `autostart&noaudio&seed=3&q=low&${query}`, { viewport: vp, touch });
  await wait(g.page, 500);
  if (touch) g.f = fingers(await g.ctx.newCDPSession(g.page));
  return g;
}

session(async (br, base) => {
  fs.mkdirSync(SHOTS, { recursive: true });

  /* ---- aim pan, follow speed, minimap drag, height: Ưng Nhãn on the phone ---- */
  let g = await begin(br, base, 'mech=ung&map=denrung');
  let p = g.page;
  await calm(p); await place(p, 0, 0, 0); await wait(p, 1500);
  const c0 = await cam(p);
  check(c0.height === 'mid' && !c0.flip && c0.mode === 'follow', `phone starts at "Vừa", view not turned, following the tank (${c0.height}, ${c0.mode})`);
  check(c0.aimPan === true, '"Camera theo hướng ngắm" is on by default');

  // Driving: the view follows under the speed limit.
  await p.evaluate(() => { window.__top = 0; window.__spd = setInterval(() => { window.__top = Math.max(window.__top, __G.cam.get().speed); }, 8); });
  await g.f.down(1, 200, 300); await g.f.move(1, 260, 300); await wait(p, 1200); await g.f.up(1); await wait(p, 600);
  const c1 = await cam(p), top = await p.evaluate(() => { clearInterval(window.__spd); return window.__top; });
  check(c1.me.x - c0.me.x > 4 && Math.abs(c1.x - c1.me.x) < 4 && top < 36.5 && top > 3, `the view follows a drive of ${f1(c1.me.x - c0.me.x)} m, top camera speed ${f1(top)} m/s (limit 36)`);

  // The ultimate (Tia Xuyên Phá, 30 m) dragged up-left: the view slides that way while the thumb is down.
  await place(p, 0, 0, 0); await wait(p, 900);
  const ult = await ctl(p, 'ult'), base0 = await cam(p);
  await g.f.down(2, ult.cx, ult.cy); await g.f.move(2, ult.cx - 30, ult.cy - 30); await g.f.move(2, ult.cx - 60, ult.cy - 60);
  await wait(p, 1100);
  const a1 = await cam(p), off1 = Math.hypot(a1.off[0], a1.off[1]);
  check(off1 > 4 && a1.off[0] < -2 && a1.off[1] < -2, `dragging a 30 m skill up-left pans the view up-left by ${f1(off1)} m (${f1(a1.off[0])}, ${f1(a1.off[1])})`);
  check(a1.me.sx > 0 && a1.me.sx < a1.W && a1.me.sy > 0 && a1.me.sy < a1.H, `the tank stays on screen while panned (at ${f1(a1.me.sx)}, ${f1(a1.me.sy)} of ${a1.W}x${a1.H})`);
  await p.screenshot({ path: path.join(SHOTS, 'xiaomi-aimpan.png') });
  const cz = await rectOf(p, '#touch .tc-cancel');
  await g.f.move(2, cz.cx, cz.cy); await wait(p, 100); await g.f.up(2); await wait(p, 1600);
  const a2 = await cam(p);
  check(Math.hypot(a2.off[0], a2.off[1]) < 0.3 && Math.hypot(a2.x - base0.x, a2.z - base0.z) < 4.5, `cancelling eases the view back (${f1(Math.hypot(a2.off[0], a2.off[1]))} m left)`);

  // The sniper's main gun aimed by hand pans too; a short skill (Q) does not.
  const fire = await ctl(p, 'fire');
  await g.f.down(3, fire.cx, fire.cy); await g.f.move(3, fire.cx + 25, fire.cy); await g.f.move(3, fire.cx + 50, fire.cy); await wait(p, 1000);
  const a3 = await cam(p);
  await g.f.up(3); await wait(p, 1500);
  const a4 = await cam(p);
  check(a3.off[0] > 4 && Math.hypot(a4.off[0], a4.off[1]) < 0.3, `drag-aiming the sniper gun to the right pans right by ${f1(a3.off[0])} m and returns on release (${f1(Math.hypot(a4.off[0], a4.off[1]))} m)`);

  await p.evaluate(() => __G.cam.set({ aimPan: false }));
  await g.f.down(3, fire.cx, fire.cy); await g.f.move(3, fire.cx + 25, fire.cy); await g.f.move(3, fire.cx + 50, fire.cy); await wait(p, 900);
  const a5 = await cam(p);
  await g.f.up(3);
  check(Math.hypot(a5.off[0], a5.off[1]) < 0.05 && a5.aimPan === false, `with the setting off the same drag does not pan (${f1(Math.hypot(a5.off[0], a5.off[1]))} m)`);
  await p.evaluate(() => __G.cam.set({ aimPan: true })); await wait(p, 400);

  // Minimap: hold and drag looks at that map point, release glides back, a tap still enlarges.
  await place(p, 0, 0, 0); await wait(p, 900);
  const home = await cam(p), mm = await rectOf(p, '#ui .mm canvas');
  await g.f.down(4, mm.l + mm.w * 0.5, mm.t + mm.h * 0.5); await g.f.move(4, mm.l + mm.w * 0.8, mm.t + mm.h * 0.3); await g.f.move(4, mm.l + mm.w * 0.85, mm.t + mm.h * 0.25);
  await wait(p, 700);
  const d1 = await cam(p), mapSize = await p.evaluate(() => [__G.match.map.w, __G.match.map.d]);
  const wantX = (0.85 - 0.5) * mapSize[0], wantZ = (0.25 - 0.5) * mapSize[1];
  check(d1.mode === 'free' && Math.abs(d1.x - wantX) < 3 && Math.abs(d1.z - wantZ) < 6, `dragging on the minimap looks there (view at ${f1(d1.x)}, ${f1(d1.z)}; finger at ${f1(wantX)}, ${f1(wantZ)})`);
  await p.screenshot({ path: path.join(SHOTS, 'xiaomi-mmdrag.png') });
  await g.f.up(4); await wait(p, 900);
  const d2 = await cam(p);
  check(d2.mode === 'follow' && Math.hypot(d2.x - home.x, d2.z - home.z) < 0.6 && !(await p.evaluate(() => document.querySelector('#ui .mm').classList.contains('big'))), 'releasing glides back to the tank and does not count as a tap');
  await g.f.down(4, mm.l + mm.w * 0.2, mm.t + mm.h * 0.5); await wait(p, 500);
  const d3 = await cam(p);
  await g.f.down(1, 200, 300); await g.f.move(1, 260, 300); await wait(p, 500);
  const d4 = await cam(p);
  await g.f.up(1); await g.f.up(4); await wait(p, 300);
  check(d3.mode === 'free' && d4.mode === 'follow', `holding still on the minimap looks there too, and driving off ends it (${d3.mode} → ${d4.mode})`);
  await g.f.down(5, mm.cx, mm.cy); await wait(p, 60); await g.f.up(5); await wait(p, 300);
  check(await p.evaluate(() => document.querySelector('#ui .mm').classList.contains('big')), 'a quick tap on the minimap still enlarges it');
  await g.f.down(5, 600, 200); await g.f.up(5); await wait(p, 200);

  // Height: the Settings buttons move the camera and the choice survives a reload.
  const yMid = (await cam(p)).y;
  await p.evaluate(() => { document.querySelector('#ui .pausebtn').click(); document.querySelector('[data-r="pSet"]').click(); });
  await wait(p, 300);
  const names = await p.evaluate(() => [...document.querySelectorAll('[data-r="camH"] button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')));
  check(names.join(' ') === 'Gần Vừa* Xa', `Settings shows "Độ cao camera" with Vừa picked (${names.join(' ')})`);
  await p.screenshot({ path: path.join(SHOTS, 'xiaomi-cam-settings.png') });
  await p.evaluate(() => document.querySelector('[data-r="camH"] button[data-k="far"]').click());
  await p.evaluate(() => { const b = document.querySelector('[data-r="aimPan"]'); b.click(); window.__ap = b.getAttribute('aria-pressed'); b.click(); });
  check(await p.evaluate(() => window.__ap === 'false' && document.querySelector('[data-r="aimPan"]').getAttribute('aria-pressed') === 'true'), 'the "Camera theo hướng ngắm" switch toggles');
  await p.evaluate(() => __G.ui.hidePause()); await wait(p, 800);
  const yFar = (await cam(p)).y;
  await p.evaluate(() => __G.cam.set({ height: 'near' })); await wait(p, 300);
  const yNear = (await cam(p)).y;
  check(Math.abs(yFar / yMid - 1.2) < 0.02 && Math.abs(yNear / yMid - 0.86) < 0.02, `Xa is ${(yFar / yMid).toFixed(2)}x and Gần ${(yNear / yMid).toFixed(2)}x the height of Vừa`);
  await p.reload(); await p.waitForFunction('window.__ready === true'); await wait(p, 300);
  check((await cam(p)).height === 'near', 'the chosen height is still there after a reload');
  check(g.problems.length === 0 && (await p.evaluate(() => __errors.length)) === 0, `no page errors (${g.problems.concat(await p.evaluate(() => __errors)).slice(0, 2).join(' | ')})`);
  await g.close();

  g = await begin(br, base, 'mech=ung', TABLET);
  check((await cam(g.page)).height === 'far', 'a tablet starts at "Xa"');
  await g.close();

  /* ---- death and spectate camera ---- */
  g = await begin(br, base, 'mech=ung&map=denrung'); p = g.page;
  await calm(p); await place(p, 0, 0, 0); await place(p, 1, -14, 6); await place(p, 3, 9, -3); await wait(p, 800);
  const names2 = await p.evaluate(() => { const m = __G.match; clearInterval(window.__calm); window.__calm = setInterval(() => { for (const u of m.units) if (u.id !== 0) { u.maxHp = 1e6; u.hp = 1e6; if (u.id !== 3) u.stunT = 60; } }, 15); m.units[3].stunT = 0; m.units[0].maxHp = 100; m.units[0].hp = 1; return { foe: m.units[3].name, ally: m.units[1].name }; });
  await p.waitForFunction(() => !__G.match.units[0].alive, null, { timeout: 20000 });
  await wait(p, 900);
  const k1 = await cam(p), lab1 = await p.evaluate(() => document.querySelector('#ui .rsp small').textContent);
  const foePos = await p.evaluate(() => { const u = __G.match.units[3]; return [u.x, u.z]; });
  check(k1.mode === 'killer' && k1.target === 3 && Math.hypot(k1.x - foePos[0], k1.z - foePos[1]) < 4, `after the kill the view follows the killer (${k1.mode}, ${f1(Math.hypot(k1.x - foePos[0], k1.z - foePos[1]))} m from it)`);
  check(lab1 === 'Bị hạ bởi ' + names2.foe, `label reads "${lab1}"`);
  await p.screenshot({ path: path.join(SHOTS, 'xiaomi-deathcam.png') });
  await wait(p, 1500);
  const k2 = await cam(p), lab2 = await p.evaluate(() => document.querySelector('#ui .rsp small').textContent);
  const alive = await p.evaluate(() => __G.match.units[0].alive);
  check(alive || (k2.mode === 'ally' && lab2.startsWith('Đang xem ')), `then it rides with a living ally (${k2.mode}, "${lab2}")`);
  await p.screenshot({ path: path.join(SHOTS, 'xiaomi-spectate.png') });
  await p.waitForFunction(() => __G.match.units[0].alive, null, { timeout: 20000 });
  await p.evaluate(() => { __G.match.units[3].stunT = 60; __G.match.units[0].maxHp = __G.match.units[0].hp = 1e6; });
  await wait(p, 900);
  const k3 = await cam(p);
  check(k3.mode === 'follow' && !k3.gliding && Math.hypot(k3.x - k3.me.x, k3.z - k3.me.z) < 4.5, `on respawn it is back on the own tank (${k3.mode}, ${f1(Math.hypot(k3.x - k3.me.x, k3.z - k3.me.z))} m)`);
  check(g.problems.length === 0 && (await p.evaluate(() => __errors.length)) === 0, 'no page errors in the death sequence');
  await g.close();

  /* ---- Thủ nhà: team 1 sees the map turned half round, own base on the same side as team 0 does ---- */
  const baseSide = {};
  for (const side of [0, 1]) {
    g = await begin(br, base, `mech=tho&mode=nha&map=luythep&side=${side}`); p = g.page;
    await calm(p); await wait(p, 900);
    const v = await p.evaluate(() => {
      const m = __G.match, me = m.units[__G.me], c = __G.cam.get();
      const own = m.map.bases[me.team], foe = m.map.bases[1 - me.team];
      const a = __G.project(own[0], 0, own[1]), b = __G.project(foe[0], 0, foe[1]);
      // The white arrow is the player's own marker on the minimap.
      const cv = document.querySelector('#ui .mm canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let sx = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) { sx += (i / 4) % cv.width; n++; }
      return { team: me.team, flip: c.flip, ownX: a.x, foeX: b.x, arrow: n ? sx / n / cv.width : -1, x: me.x, z: me.z };
    });
    baseSide[side] = v;
    check(v.team === side && v.flip === (side === 1), `side ${side}: the player is on team ${v.team}, view ${v.flip ? 'turned half round' : 'not turned'}`);
    check(v.ownX < v.foeX, `side ${side}: own base is to the left of the enemy base on screen (${f1(v.ownX)} < ${f1(v.foeX)})`);
    check(v.arrow >= 0 && v.arrow < 0.4, `side ${side}: the player's arrow is at the left end of the minimap (${(v.arrow * 100).toFixed(0)}% across)`);
    // The stick pushed up, then right: the tank moves up, then right, on the screen.
    const proj = (q) => p.evaluate((q) => { const s = __G.project(q[0], 0.4, q[1]); return [s.x, s.y]; }, q);
    const at = () => p.evaluate(() => { const u = __G.match.units[__G.me]; return [u.x, u.z]; });
    const w0 = await at();
    await g.f.down(1, 200, 300); await g.f.move(1, 200, 240); await wait(p, 700); await g.f.up(1); await wait(p, 300);
    const w1 = await at(), s0 = await proj(w0), s1 = await proj(w1);
    check(s1[1] < s0[1] - 20 && Math.abs(s1[0] - s0[0]) < 40, `side ${side}: stick up moves the tank up the screen (${f1(s1[1] - s0[1])} px, world dz ${f1(w1[1] - w0[1])})`);
    await g.f.down(1, 200, 300); await g.f.move(1, 260, 300); await wait(p, 700); await g.f.up(1); await wait(p, 300);
    const w2 = await at(), t1 = await proj(w1), t2 = await proj(w2);
    check(t2[0] > t1[0] + 20 && Math.abs(t2[1] - t1[1]) < 40, `side ${side}: stick right moves the tank right on the screen (${f1(t2[0] - t1[0])} px, world dx ${f1(w2[0] - w1[0])})`);
    // The fire button dragged right: the turret points right on the screen.
    const fb = await ctl(p, 'fire');
    await g.f.down(2, fb.cx, fb.cy); await g.f.move(2, fb.cx + 25, fb.cy); await g.f.move(2, fb.cx + 50, fb.cy); await wait(p, 900);
    const aim = await p.evaluate(() => __G.match.units[__G.me].aim);
    await g.f.up(2);
    const wantAim = side ? Math.PI : 0;
    check(Math.abs(Math.atan2(Math.sin(aim - wantAim), Math.cos(aim - wantAim))) < 0.2, `side ${side}: dragging the fire button right aims right on the screen (world aim ${aim.toFixed(2)})`);
    // The minimap drag lands on the world point under the finger.
    const mm2 = await rectOf(p, '#ui .mm canvas'), ms = await p.evaluate(() => [__G.match.map.w, __G.match.map.d]);
    await g.f.down(4, mm2.l + mm2.w * 0.5, mm2.t + mm2.h * 0.5); await g.f.move(4, mm2.l + mm2.w * 0.7, mm2.t + mm2.h * 0.5); await wait(p, 700);
    const dm = await cam(p), wx = (side ? -1 : 1) * 0.2 * ms[0];
    await g.f.up(4);
    check(dm.mode === 'free' && Math.abs(dm.x - wx) < 3, `side ${side}: a minimap drag to the right of centre looks at world x ${f1(dm.x)} (expected ${f1(wx)})`);
    await wait(p, 900);
    await p.evaluate(() => { clearInterval(window.__calm); for (const u of __G.match.units) u.stunT = 0; });
    await wait(p, 2500);
    await p.screenshot({ path: path.join(SHOTS, `xiaomi-nha-team${side}.png`) });
    check(g.problems.length === 0 && (await p.evaluate(() => __errors.length)) === 0, `side ${side}: no page errors`);
    await g.close();
  }
  check(Math.abs(baseSide[0].ownX - baseSide[1].ownX) < 60, `both teams see their own base at the same place on screen (${f1(baseSide[0].ownX)} and ${f1(baseSide[1].ownX)} px)`);

  /* ---- desktop mouse: holding the sniper's fire pans toward the cursor, the minimap drags with the mouse ---- */
  g = await begin(br, base, 'mech=ung&map=denrung', { width: 1280, height: 720 }, false); p = g.page;
  await calm(p); await place(p, 0, 0, 0); await wait(p, 1200);
  await p.mouse.move(1100, 330); await wait(p, 300);
  const q0 = await cam(p);
  await p.mouse.down(); await wait(p, 1100);
  const q1 = await cam(p);
  await p.mouse.up(); await wait(p, 1500);
  const q2 = await cam(p);
  check(q1.off[0] > 4 && Math.hypot(q2.off[0], q2.off[1]) < 0.3, `mouse: holding fire with Ưng Nhãn pans ${f1(q1.off[0])} m toward the cursor and returns on release (was ${f1(q0.off[0])})`);
  const mm3 = await rectOf(p, '#ui .mm canvas'), shots0 = await p.evaluate(() => __G.match.shots.length);
  await p.mouse.move(mm3.cx, mm3.cy); await p.mouse.down(); await p.mouse.move(mm3.l + mm3.w * 0.8, mm3.cy, { steps: 4 }); await wait(p, 600);
  const q3 = await cam(p), fired = await p.evaluate(() => __G.match.units[0].cd.fire > 0);
  await p.mouse.up(); await wait(p, 900);
  const q4 = await cam(p);
  check(q3.mode === 'free' && q3.x > 15 && q4.mode === 'follow' && !fired, `mouse: dragging on the minimap looks there (x ${f1(q3.x)}), does not fire, and release returns (${q4.mode}, ${shots0} shots before)`);
  check(g.problems.length === 0 && (await p.evaluate(() => __errors.length)) === 0, 'desktop: no page errors');
  await g.close();
  check.done();
});
