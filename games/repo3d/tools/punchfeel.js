// Punch feel numbers (batch 6f item 6, owner: "đấm như đấm vào không khí, không phản ứng gì"). House 3, seed 7:
//  aim: share of plain punches that hit a sleeping mummy whose surface is 1.5 m from the eye, aimed 10 degrees off its
//  middle in 8 directions (and 0 degrees, and 1.2 / 1.8 m for context);
//  reaction: one punch at each target in front of the fist (a foe at 1.5 m 10 degrees off, light loot, the cart, a door,
//  a decor prop, a bare wall, thin air) and whether that target answered: the foe loses hp and is knocked, loot and the
//  cart move, the door swings or knocks, decor and walls give a sound + dust + a camera kick, air gives a whoosh with the
//  arm swung through. Reaction rate = targets that answered / punches (must be 100 %).
//  cadence: seconds between two plain punches when the button is held down and tapped as fast as the game allows.
// Usage: node tools/punchfeel.js
'use strict';
const { serve } = require('./serve.js');
const { launch: pwLaunch } = require('./pw.js');

const MEASURE = `(() => { const G = __G, P = G.player, nav = G.foes.nav, M = G.melee, R = G.phys.R, world = G.phys.world; window.__paused = true; __sim(0.5);
  const fresh = () => { for (const f of [...G.foes.list]) G.foes.remove(f); P.hp = 100; P.crewId = 'bao'; G.gear.clear(); M.cdT = 0; M.chain = 0; M.chainT = 0; M.swing = null; M.holdT = -1; G.hitStopT = 0; if (G.grab.held) G.grab.release(false); };
  const put = (x, z, yaw, pitch = 0) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; __sim(0.1); P.yaw = yaw; P.pitch = pitch; };
  const sounds = []; const play0 = G.audio.play.bind(G.audio); G.audio.play = (n, ...a) => { sounds.push(n); return play0(n, ...a); };
  let bursts = 0; const b0 = M.fx.burst.bind(M.fx); M.fx.burst = (...a) => { bursts++; return b0(...a); };
  const punch = () => { const n0 = M.log.length; sounds.length = 0; bursts = 0; const k0 = Math.abs(M.kick.fov) + Math.abs(M.kick.roll); M.cdT = 0;
    __sim(1 / 60, { ...__IDLE, melee: true }); let swungTo = 0; for (let i = 0; i < 50 && (M.log.length === n0 || M.swing); i++) { __sim(1 / 60); if (M.swing) swungTo = Math.max(swungTo, M.swing.t); }
    const rec = M.log.length > n0 ? M.log[M.log.length - 1] : null; return { rec, sounds: [...sounds], bursts, kick: Math.abs(M.kick.fov) + Math.abs(M.kick.roll) > k0 + 1e-4 || !!(M.lastKickAt && M.lastKickAt > G.time - 1), swungTo }; };
  // an open spot: 3 m clear all round
  let o = null; for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); let ok = true; for (let a = 0; a < 8 && ok; a++) for (const r of [1, 1.8]) if (!nav.okW(c.x + Math.cos(a * 0.785) * r, c.z + Math.sin(a * 0.785) * r)) ok = false; for (let u = 0.5; u <= 3.2 && ok; u += 0.25) for (const s of [-0.6, 0, 0.6]) if (!nav.okW(c.x + s, c.z - u)) ok = false; if (ok && G.house.heightAt(c.x, c.z) === G.house.heightAt(c.x, c.z - 3)) { o = c; break; } }   // open all round to 1.8 m, and 3.2 m clear ahead (-z)
  const out = {};
  const foeAt = (d, center = false) => { const kind = 'mummy'; fresh(); put(o.x, o.z, 0); const f = G.foes.spawn(kind, o.x, o.z - 1, { sleep: 99 }); const D = center ? d : d + f.r; f.x = o.x; f.z = o.z - D; f.hp = f.maxHp = 9999; f.knock.x = f.knock.z = 0; return f; };
  const aimFoe = (f, off, k) => { const c = P.camPos, my = (f.gy || 0) + f.h * 0.5; P.yaw = Math.atan2(-(f.x - c.x), -(f.z - c.z)); P.pitch = Math.atan2(my - c.y, Math.hypot(f.x - c.x, f.z - c.z)); const a = k * Math.PI / 4; P.yaw += Math.cos(a) * off; P.pitch += Math.sin(a) * off; };
  const hitRate = (d, deg, center = false) => { let h = 0, n = 0; for (let k = 0; k < (deg ? 8 : 1); k++) { const f = foeAt(d, center); __sim(0.05); aimFoe(f, deg * Math.PI / 180, k); const hp0 = f.hp; const r = punch(); n++; if (f.hp < hp0) h++; } return h + '/' + n; };
  out.aim = { c15_10: hitRate(1.5, 10, true), d15_0: hitRate(1.5, 0), d15_10: hitRate(1.5, 10), d12_10: hitRate(1.2, 10), d18_10: hitRate(1.8, 10), d15_20: hitRate(1.5, 20) };
  // reaction per target
  const react = {}; const ok = (name, yes, info) => { react[name] = { ok: !!yes, ...info }; };
  { const f = foeAt(1.5); __sim(0.05); aimFoe(f, 10 * Math.PI / 180, 0); const hp0 = f.hp, x0 = f.x, z0 = f.z; const r = punch(); __sim(0.2); ok('foe 1.5 m 10 deg', f.hp < hp0 && Math.hypot(f.x - x0, f.z - z0) > 0.05 && r.sounds.length && r.bursts, { target: r.rec?.target, sounds: r.sounds }); }
  { fresh(); put(o.x, o.z, 0); const it = G.loot.spawn({ material: 'wood', size: 'small', value: 500, pos: { x: o.x, y: G.house.heightAt(o.x, o.z) + 0.5, z: o.z - 1.0 } }); __sim(1); it.spawnedAt = -99; const q = it.body.translation(); const c = P.camPos; P.yaw = Math.atan2(-(q.x - c.x), -(q.z - c.z)); P.pitch = Math.atan2(q.y - c.y, Math.hypot(q.x - c.x, q.z - c.z));
    const r = punch(); __sim(0.2); const q2 = it.body.translation(); ok('light loot', Math.hypot(q2.x - q.x, q2.z - q.z) > 0.05 && r.sounds.length, { target: r.rec?.target, moved: +Math.hypot(q2.x - q.x, q2.z - q.z).toFixed(2) }); G.loot.destroy(it, false); }
  { fresh(); put(o.x, o.z, 0); const C = G.cart, h = G.house.heightAt(o.x, o.z - 1.3); C.body.setTranslation({ x: o.x, y: h + 0.15, z: o.z - 1.3 }, true); C.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); C.body.setLinvel({ x: 0, y: 0, z: 0 }, true); __sim(0.8);
    const q = { ...C.body.translation() }, c = P.camPos; P.yaw = Math.atan2(-(q.x - c.x), -(q.z - c.z)); P.pitch = Math.atan2(q.y + 0.35 - c.y, Math.hypot(q.x - c.x, q.z - c.z)); const r = punch(); __sim(0.3); const q2 = C.body.translation();
    ok('cart', Math.hypot(q2.x - q.x, q2.z - q.z) > 0.03 && r.sounds.length, { target: r.rec?.target, moved: +Math.hypot(q2.x - q.x, q2.z - q.z).toFixed(3) }); C.body.setTranslation({ x: o.x + 40, y: -20, z: o.z }, true); C.body.setGravityScale?.(0, true); }
  { fresh(); let done = false; for (const d of G.house.doorRecs) { if (!d.jammed) continue;    for (const [nx, nz] of [[1, 0], [0, 1]]) { for (const s of [-1, 1]) { const x = d.cx + nx * s * 1.1 + nz * 0.5, z = d.cz + nz * s * 1.1 + nx * 0.5;   // off the seam of a double door if (done || !nav.okW(x, z)) continue;
      put(x, z, Math.atan2(nx * s, nz * s), -0.1); const ray = new R.Ray(P.camPos, P.forward(P.camPos.clone())), hit = world.castRay(ray, 1.4, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.col); if (!hit || !d.leaves.some((l) => l.body === hit.collider.parent())) continue;
      const t0 = d.target || 0, r = punch(); ok('door (jammed: an open one swings away as you come within 2.6 m)', /^door/.test(r.rec?.target || '') && r.sounds.length && r.bursts, { target: r.rec?.target }); done = true; } } if (done) break; } if (!done) ok('door', false, { err: 'no door spot' }); }
  { fresh(); let done = false; for (const pr of G.house.props) { if (!pr.blocks || !pr.bodies.length || pr.h < 0.6) continue; for (let a = 0; a < 8 && !done; a++) { const dx = Math.cos(a * 0.785), dz = Math.sin(a * 0.785), x = pr.x + dx * (Math.max(pr.w, pr.d) / 2 + 0.9), z = pr.z + dz * (Math.max(pr.w, pr.d) / 2 + 0.9);
      if (!nav.okW(x, z) || Math.abs(G.house.heightAt(x, z) - pr.y0) > 0.05) continue; put(x, z, Math.atan2(dx, dz), -0.25);
      const ray = new R.Ray(P.camPos, P.forward(P.camPos.clone())), hit = world.castRay(ray, 1.6, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.col); if (!hit || !pr.bodies.includes(hit.collider.parent())) continue;
      const r = punch(); ok('decor ' + pr.n, r.sounds.length && r.bursts && r.kick, { target: r.rec?.target, sounds: r.sounds }); done = true; } if (done) break; } if (!done) ok('decor', false, { err: 'no decor spot' }); }
  { fresh(); let done = false; for (let a = 0; a < 8 && !done; a++) { const dx = Math.cos(a * 0.785), dz = Math.sin(a * 0.785); put(o.x, o.z, Math.atan2(-dx, -dz), 0); const ray = new R.Ray(P.camPos, P.forward(P.camPos.clone())), hit = world.castRay(ray, 8, true, R.QueryFilterFlags.EXCLUDE_SENSORS | R.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, P.col);
      if (!hit || G.house.props.some((pr) => pr.bodies.includes(hit.collider.parent())) || G.house.doorRecs.some((d) => d.leaves.some((l) => l.body === hit.collider.parent()))) continue; const u = hit.timeOfImpact - 1.0; const x = o.x + dx * u, z = o.z + dz * u; if (!nav.okW(x, z)) continue; put(x, z, Math.atan2(-dx, -dz), 0);
      const r = punch(); ok('wall', r.sounds.length && r.bursts && r.kick, { target: r.rec?.target }); done = true; } if (!done) ok('wall', false, { err: 'no wall spot' }); }
  { fresh(); put(o.x, o.z, 0, 0.6); const r = punch(); ok('air', r.sounds.some((s) => /whoosh|whiff/.test(s)) && r.swungTo >= 0.35, { target: r.rec?.target, sounds: r.sounds, swung: +r.swungTo.toFixed(2) }); }
  // loot launch: each size on the floor 1.15 m ahead, one plain punch; how far it goes and how high it rises in 1.5 s
  out.loot = {};
  for (const [size, mat] of [['small', 'ceramic'], ['medium', 'wood'], ['big', 'metal']]) { fresh(); put(o.x, o.z, 0); const h = G.house.heightAt(o.x, o.z);
    const it = G.loot.spawn({ material: mat, size, value: 3000, pos: { x: o.x, y: h + 0.6, z: o.z - 1.15 } }); __sim(1); it.spawnedAt = -99; const q = { ...it.body.translation() }, c = P.camPos;
    P.yaw = Math.atan2(-(q.x - c.x), -(q.z - c.z)); P.pitch = Math.atan2(q.y - c.y, Math.hypot(q.x - c.x, q.z - c.z)); const v0 = it.value; const r = punch(); let far = 0, top = 0;
    for (let i = 0; i < 90; i++) { __sim(1 / 60); if (it.dead) break; const p2 = it.body.translation(); far = Math.max(far, Math.hypot(p2.x - q.x, p2.z - q.z)); top = Math.max(top, p2.y - q.y); }
    out.loot[size] = { far: +far.toFixed(2), up: +top.toFixed(2), sounds: r.sounds.filter((x) => x !== 'whoosh'), lost: it.dead ? 'broke' : v0 - it.value }; if (!it.dead) G.loot.destroy(it, false); }
  // a normal door, closed, punched from 1.2 m: how long until it is fully open (it would swing open by itself too, slower)
  { fresh(); let done = false; for (const d of G.house.doorRecs) { if (d.jammed || done) continue; for (const [nx, nz] of [[1, 0], [0, 1]]) for (const sg of [-1, 1]) { if (done) continue; const x = d.cx + nx * sg * 1.2 + nz * 0.5, z = d.cz + nz * sg * 1.2 + nx * 0.5; if (!nav.okW(x, z)) continue;
      put(x, z, Math.atan2(nx * sg, nz * sg), -0.1); const ray = new R.Ray(P.camPos, P.forward(P.camPos.clone())), hit = world.castRay(ray, 1.5, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, P.col); if (!hit || !d.leaves.some((l) => l.body.handle === hit.collider.parent().handle)) continue;
      d.open = 0; d.target = 0; const n0 = M.log.length; __sim(1 / 60, { ...__IDLE, melee: true }); let t = 1 / 60, tOpen = null; for (let i = 0; i < 90; i++) { __sim(1 / 60); t += 1 / 60; if (tOpen === null && d.open >= 1.74) tOpen = t; }
      out.door = { target: M.log.slice(n0)[0]?.target, openIn: tOpen === null ? '>1.5 s' : +tOpen.toFixed(2), byItself: +(1.75 / 3.2).toFixed(2) }; done = true; } } if (!done) out.door = { err: 'no closed door in reach' }; }
  out.react = react; out.reactRate = Object.values(react).filter((v) => v.ok).length + '/' + Object.keys(react).length;
  // cadence: hold the button, how often does a plain punch land on a foe at 1 m
  { const f = foeAt(1.0); __sim(0.05); aimFoe(f, 0, 0); M.cdT = 0; const n0 = M.log.length; let t = 0; const ts = [];
    for (let i = 0; i < 180; i++) { const press = i % 2 === 0; __sim(1 / 60, { ...__IDLE, melee: press }); t += 1 / 60; if (M.log.length > n0 + ts.length) ts.push(t); }
    out.cadence = ts.length > 1 ? +((ts[ts.length - 1] - ts[0]) / (ts.length - 1)).toFixed(2) : null; out.dmg = M.log[M.log.length - 1]?.foes?.[0]?.dmg; out.dps = out.cadence ? +(out.dmg / out.cadence).toFixed(1) : null; }
  return out; })()`;

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  let code = 1;
  try {
    const ctx = await br.newContext({ viewport: { width: 480, height: 270 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(srv.base + '/games/repo3d/index.html?house=3&seed=7&foes=none&bots=0&traps=0&passives=0');
    await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
    const r = await page.evaluate(MEASURE);
    console.log(`hits on a mummy: centre 1.5 m 10 deg off ${r.aim.c15_10}; surface at d from the eye: 1.5 m dead on ${r.aim.d15_0}, 1.5 m 10 deg off ${r.aim.d15_10}, 1.2 m 10 deg ${r.aim.d12_10}, 1.8 m 10 deg ${r.aim.d18_10}, 1.5 m 20 deg ${r.aim.d15_20}`);
    for (const [k, v] of Object.entries(r.react)) console.log(`  ${v.ok ? 'reacts ' : 'NO REACTION'} ${k} ${JSON.stringify(v).slice(0, 160)}`);
    for (const [k, v] of Object.entries(r.loot)) console.log(`  punched ${k} loot: flew ${v.far} m, rose ${v.up} m, sounds ${v.sounds.join(',')}, value lost ${v.lost}`);
    console.log(`  punched door: ${JSON.stringify(r.door)}`);
    console.log(`reaction rate ${r.reactRate}; punch every ${r.cadence} s, ${r.dmg} dmg, ${r.dps} dmg/s${errs.length ? '; page error ' + errs[0] : ''}`);
    // gates (batch 6f: "đấm như vào không khí"): a small item flies (>= 2.5 m, up >= 0.3 m), a big one hops but goes less
    // than half as far, every one makes its material's knock; a closed door bangs open in under 0.3 s
    const L = r.loot, bad = [];
    if (!(L.small.far >= 2.5 && L.small.up >= 0.3)) bad.push('small loot does not fly');
    if (!(L.big.up >= 0.1 && L.big.far < L.small.far * 0.5)) bad.push('big loot does not hop or flies like a light one');
    for (const [k, mat] of [['small', 'ceramic'], ['medium', 'wood'], ['big', 'metal']]) if (!L[k].sounds.includes('hit_' + mat)) bad.push(k + ' loot makes no ' + mat + ' knock');
    if (!(r.door.target === 'door' && typeof r.door.openIn === 'number' && r.door.openIn < 0.3)) bad.push('punched door does not bang open');
    if (r.reactRate.split('/')[0] !== r.reactRate.split('/')[1]) bad.push('a punch without reaction');
    console.log(bad.length ? 'FAIL ' + bad.join('; ') : 'PASS loot flies/hops with a knock, door bangs open, every punch reacts');
    code = bad.length ? 1 : 0; await ctx.close();
  } catch (e) { console.log('FAIL run ' + e.message.slice(0, 300)); }
  clearTimeout(kill); await br.close(); srv.close(); process.exit(code);
})();
