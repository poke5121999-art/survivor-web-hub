// Foe signature moves part 2 (js/foe-moves-b.js): wallhand (in a wall, hidden; grabs who passes; no walking, no beam,
// no skill; dmg every cd; 10 left/right alternations break free; relocates 15 s later), gacha (grabs at reach, the wheel
// spins 2.5 s, outcome applied; 4 hits make it let go), mummy (tether latches and reels you in; a stun cuts it; a wall
// makes it swing over), hunter (marks one crew member, walks to them through walls; red circle 1 s then slam: in it =
// dmg + shove, out = nothing), headthrower (lobbed head blows after its fuse, gas 2 hp/s; you can beam it and throw it
// back, it hurts other foes, not its owner), impostor (passes for crew, quiet; reveals within 2.5 m or when hit, then
// attacks). Pictures: wallhand hold, gacha wheel, mummy tether, hunter circle, head and gas, impostor before/after.
// Usage: node tools/foe-moves-b.js [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('foe-moves'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 420) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = {};
  T.pair = (d, skip = 0) => { for (let i = 0; i < nav.W * nav.H; i++) { if (!nav.walk[i] || nav.near[i] < 3) continue; const a = nav.center(i), h = G.house.heightAt(a.x, a.z);
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, dir = { x: Math.cos(an), z: Math.sin(an) }, b = { x: a.x + dir.x * d, z: a.z + dir.z * d };
      if (!nav.okW(b.x, b.z) || Math.abs(G.house.heightAt(b.x, b.z) - h) > 0.01 || !nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue;
      const s = { x: b.x - dir.z * 2.6, z: b.z + dir.x * 2.6 }; if (!nav.okW(s.x, s.z) || !nav.clear(b.x, b.z, s.x, s.z, 0.4)) continue;
      if (skip-- > 0) continue; return { a, b, dir, side: s }; } } return null; };
  T.put = (x, z, lx, lz) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; if (lx !== undefined) P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = 0; };
  T.fresh = () => { for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); P.heldBy = null; P.down = false; P.hp = 100; P.stamina = 100; P.push = null; G.foes.forceSpin = null; };
  T.foe = (kind, x, z, aware = true) => { const f = G.foes.spawn(kind, x, z, { sleep: 0 }); const p = P.position; if (kind !== 'wallhand') f.yaw = Math.atan2(p.x - x, p.z - z);
    if (aware) { f.aware = 1; f.lastSeen = { x: p.x, z: p.z }; G.foes.setState(f, 'chase'); } return f; };
  T.logs = (k, n0) => G.foes.log.slice(n0).filter((e) => e[0] === k);
  T.wait = (cond, s) => { for (let i = 0; i < s * 60; i++) { if (cond()) return true; __sim(1 / 60); } return cond(); };
  T.d = (f) => Math.hypot(f.x - P.position.x, f.z - P.position.z);
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, F = G.foes;');

const CASES = {
  'wallhand: sits in a wall, hidden; grabs who passes; no walking, no beam; dmg every 1.5 s; 10 alternations free you; relocates 15 s later': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.b.x, pr.b.z);
    const f = T.foe('wallhand', pr.a.x, pr.a.z, false), s = f.spot, gx = Math.floor(s.x + Math.sin(s.yaw) * -0.6), gz = Math.floor(s.z + Math.cos(s.yaw) * -0.6), inWall = G.house.layout.grid[gz * G.house.layout.w + gx] === 2;
    const hidden = (() => { F.render(1 / 60, P.camPos); return !f.robot.root.visible; })();
    const cx = s.x + Math.sin(s.yaw) * 0.42, cz = s.z + Math.cos(s.yaw) * 0.42; T.put(cx, cz); const n0 = F.log.length;
    const grabbed = T.wait(() => P.heldBy === f, 1); const p0 = { ...P.position }; __sim(1, { ...__IDLE, mz: 1, grab: true, grabPressed: true, skill: true });
    const moved = Math.hypot(P.position.x - p0.x, P.position.z - p0.z), beam = !!G.grab.held; F.render(1 / 60, P.camPos); const shows = f.robot.root.visible;
    P.hp = 100; f.tickT = 0; __sim(3.05); const lost = 100 - P.hp;
    let side = 1; for (let i = 0; i < 10 && P.heldBy; i++) { __sim(0.05, { ...__IDLE, mx: side }); side = -side; } const free = !P.heldBy && T.logs('released', n0).some((e) => e[2] === 'mash');
    const sp0 = { ...f.spot }; __sim(15.3); const moved2 = Math.hypot(f.spot.x - sp0.x, f.spot.z - sp0.z) > 0.5 && f.state === 'lurk';
    return { ok: inWall && hidden && grabbed && moved < 0.05 && !beam && shows && Math.abs(lost - 2 * f.dmg) < 0.01 && free && moved2, inWall, hidden, grabbed, moved: +moved.toFixed(3), beam, shows, lost: +lost.toFixed(2), dmg: f.dmg, free, relocated: moved2 }; })()`,
  'gacha: grabs at reach, the wheel spins 2.5 s, outcome applied (hurt 25, full heal, knockdown)': `(() => { const out = {};
    for (const [k, want] of [['hurt', (h) => Math.abs(h - (90 - 25 * F.roster.dmgMul)) < 0.01], ['full', (h) => h === (G.run?.hpMax ?? 100)], ['down', () => P.down]]) {
      T.fresh(); P.hp = 90; F.forceSpin = k; const pr = T.pair(3); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); const f = T.foe('gacha', pr.a.x, pr.a.z);
      const grabbed = T.wait(() => P.heldBy === f, 4); const t0 = F.time; const wheel = (() => { F.render(1 / 60, P.camPos); const e = document.querySelector('.hx-held .wheel'); return !!e && e.style.display !== 'none' && document.querySelector('.hx-held').style.display !== 'none'; })();
      T.wait(() => !P.heldBy, 4); out[k] = { grabbed, wheel, spin: +(F.time - t0).toFixed(2), hp: +P.hp.toFixed(1), ok: grabbed && wheel && Math.abs(F.time - t0 - 2.5) < 0.15 && want(P.hp) }; P.down = false; }
    F.forceSpin = null; return { ok: Object.values(out).every((o) => o.ok), out }; })()`,
  'gacha: 4 hits during the spin make it let go, no outcome': `(() => { T.fresh(); const pr = T.pair(3); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); const f = T.foe('gacha', pr.a.x, pr.a.z); f.hp = 999; F.forceSpin = 'hurt';
    T.wait(() => P.heldBy === f, 4); const n0 = F.log.length; __sim(0.5); for (let i = 0; i < 4; i++) { F.hurtFoe(f, 1, { x: 1, z: 0 }, 0); __sim(0.1); }
    const r = T.logs('released', n0)[0]; __sim(2.5);
    return { ok: !!r && r[2] === 'hits' && !P.heldBy && P.hp === 100 && T.logs('spin', n0).length === 0, rel: r, hp: P.hp }; })()`,
  'mummy: the tether latches at 6 m and reels you in; a stun cuts it': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('mummy', pr.a.x, pr.a.z), n0 = F.log.length; const latched = T.wait(() => T.logs('tether', n0).some((e) => e[1] === 'latch'), 3); const d0 = T.d(f); __sim(0.6); const d1 = T.d(f);
    f.stunT = 1; __sim(0.1); const cut = T.logs('tether', n0).some((e) => e[1] === 'cut:stun'); __sim(0.4); const d2 = T.d(f); __sim(0.4); const d3 = T.d(f);
    return { ok: latched && d0 - d1 > 1.5 && cut && Math.abs(d3 - d2) < 0.15, latched, pulled: +(d0 - d1).toFixed(2), cut, after: +(d3 - d2).toFixed(2) }; })()`,
  'mummy: a tether that hits a wall swings it over to the wall': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('mummy', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => f.state === 'throwAim', 3);
    const wx = pr.a.x + pr.dir.x * 3.5, wz = pr.a.z + pr.dir.z * 3.5, wall = G.phys.fixedBox(wx, G.house.heightAt(wx, wz) + 1.3, wz, 0.3, 1.3, 0.3); const x0 = f.x, z0 = f.z;
    const hitWall = T.wait(() => T.logs('tether', n0).some((e) => e[1] === 'wall'), 2); T.wait(() => f.state !== 'swing', 2); const moved = (f.x - x0) * pr.dir.x + (f.z - z0) * pr.dir.z;
    G.phys.world.removeRigidBody(wall);
    return { ok: hitWall && moved > 1.8 && P.hp === 100, hitWall, moved: +moved.toFixed(2) }; })()`,
  'hunter: marks you and walks to you through walls': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.b.x, pr.b.z); let far = null;
    for (const i of nav.cells) { const c = nav.center(i); if (Math.hypot(c.x - pr.b.x, c.z - pr.b.z) > 14 && Math.hypot(c.x - pr.b.x, c.z - pr.b.z) < 22 && !nav.los(c.x, c.z, pr.b.x, pr.b.z) && nav.path(c.x, c.z, pr.b.x, pr.b.z)) { far = c; break; } }
    const f = T.foe('hunter', far.x, far.z, false), n0 = F.log.length; const d0 = T.d(f); for (let i = 0; i < 10 * 60; i++) { P.hp = 100; __sim(1 / 60); } const d1 = T.d(f);
    return { ok: T.logs('mark', n0).length === 1 && T.logs('mark', n0)[0][1] === 'player' && d0 - d1 > 6, mark: T.logs('mark', n0)[0], walked: +(d0 - d1).toFixed(2) }; })()`,
  'hunter: red circle 1 s, then the slam: in it = dmg + shove, stepped out = nothing': `(() => { const out = [];
    for (const step of [false, true]) { T.fresh(); const pr = T.pair(2); T.put(pr.b.x, pr.b.z); const f = T.foe('hunter', pr.a.x, pr.a.z, false); f.mark = 'P'; const n0 = F.log.length;
      const warned = T.wait(() => f.state === 'warn', 2); F.render(1 / 60, P.camPos); const ring = !!F.rings && F.rings.some((r) => r.ring.visible);
      if (step) T.put(pr.side.x, pr.side.z); const p0 = { ...P.position }; T.wait(() => T.logs('slam', n0).length > 0, 1.5); __sim(0.3);
      out.push({ step, warned, ring, hp: +P.hp.toFixed(1), shoved: +Math.hypot(P.position.x - p0.x, P.position.z - p0.z).toFixed(2), dmg: f.dmg }); }
    return { ok: out[0].warned && out[0].ring && Math.abs(out[0].hp - (100 - out[0].dmg)) < 0.01 && out[0].shoved > 0.8 && out[1].hp === 100, out }; })()`,
  'headthrower: the head blows after its fuse (not the owner), gas hurts 2 hp/s': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('headthrower', pr.a.x, pr.a.z), n0 = F.log.length; const thrown = T.wait(() => T.logs('head', n0).length > 0, 3); const h = F.heads[0];
    T.put(pr.side.x, pr.side.z); const fh0 = f.hp; const blew = T.wait(() => T.logs('head', n0).some((e) => e[1] === 'blow'), 3.5); const g = F.gas[0];
    T.put(g.x, g.z); P.hp = 100; __sim(2.02); const lost = 100 - P.hp;
    return { ok: thrown && blew && !!g && Math.abs(lost - 4) < 1.01 && f.hp === fh0, thrown, blew, gasLost: +lost.toFixed(2), owner: [fh0, f.hp] }; })()`,
  'headthrower: you can beam the head and throw it back: it hurts other foes, not the owner': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('headthrower', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => F.heads && F.heads.length > 0, 3); const h = F.heads[0]; h.fuse = 9; T.wait(() => h.body.linvel().y ** 2 + h.body.linvel().x ** 2 < 1, 2.5);
    const t = h.body.translation(); T.put(t.x + 1.2, t.z); P.yaw = Math.atan2(-(t.x - P.position.x), -(t.z - P.position.z)); __sim(0.05); P.pitch = Math.atan2(t.y - P.camPos.y, Math.hypot(t.x - P.camPos.x, t.z - P.camPos.z)); __sim(0.02);
    const got = G.grab.tryGrab() && G.grab.held === h;
    const m = F.spawn('mummy', f.x + 0.8, f.z, { sleep: 99 }), mh0 = m.hp, fh0 = f.hp; f.stunT = 99; m.stunT = 99;
    const hp = h.body.translation(); h.body.setTranslation({ x: f.x + 0.4, y: hp.y, z: f.z }, true); h.fuse = 0.01; __sim(0.1);
    return { ok: got && m.hp < mh0 && f.hp === fh0, got, mummy: [+mh0.toFixed(0), +m.hp.toFixed(0)], owner: [fh0, f.hp] }; })()`,
  'impostor: passes for crew (quiet, no chase), reveals within 2.5 m, then hits': `(() => { T.fresh(); const pr = T.pair(5); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.foe('impostor', pr.a.x, pr.a.z, false), n0 = F.log.length; let quiet = true; for (let i = 0; i < 120; i++) { P.hp = 100; __sim(1 / 60); if (!f.quiet || f.state === 'chase' || f.state === 'attack') quiet = false; } const hp1 = P.hp;
    const hud = (() => { G.runner?.hudx?.(); return true; })();
    T.put(f.x + 1.6, f.z, f.x, f.z); const rev = T.wait(() => T.logs('reveal', n0).length > 0, 1); const hit = T.wait(() => P.hp < 100, 6);
    return { ok: quiet && hp1 === 100 && rev && hit && f.revealed, quiet, rev, hit, hp: P.hp }; })()`,
  'impostor: a hit before it reveals unmasks it': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); const f = T.foe('impostor', pr.a.x, pr.a.z, false), n0 = F.log.length; __sim(0.3);
    F.hurtFoe(f, 5, { x: 1, z: 0 }, 1); __sim(0.1); return { ok: f.revealed && T.logs('reveal', n0).length === 1, revealed: f.revealed }; })()`,
};

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text()); });
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  if (await page.evaluate('!!window.__fatal')) throw new Error('fatal: ' + await page.evaluate('String(window.__fatal)'));
  await page.evaluate(HELP);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 420 s'); process.exit(2); }, 420000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=5&seed=7&foes=none&bots=0&passives=0');
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    // pictures (asylum house 5, HUD shown only for the held/wheel shots)
    ({ ctx, page, logs } = await open(br, srv, 'house=5&seed=7&foes=none&bots=0&passives=0&theme=asylum'));
    const shots = [];
    const hud = (on) => page.evaluate(`document.querySelectorAll('.ui-root, .scanx').forEach((e) => e.style.visibility = 'hidden'); document.querySelectorAll('.hx > *:not(.hx-held)').forEach((e) => e.style.visibility = ${on ? "'visible'" : "'hidden'"})`);
    const snap = async (tag) => { const f = path.join(OUT, `foe-${tag}.png`); await page.waitForTimeout(80); await page.screenshot({ path: f }); shots.push(f); };
    await hud(false);
    const anim = 'for (let i = 0; i < 70; i++) F.render(1 / 60, P.camPos);';   // robot animation runs on render time
    const scenes = [
      ['wallhand-hold', `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.b.x, pr.b.z); const f = T.foe('wallhand', pr.a.x, pr.a.z, false), s = f.spot, ox = Math.sin(s.yaw), oz = Math.cos(s.yaw);
        T.put(s.x + ox * 0.85 + oz * 0.3, s.z + oz * 0.85 - ox * 0.3, s.x + oz * 0.6, s.z - ox * 0.6); T.wait(() => P.heldBy === f, 1); __sim(0.55, { ...__IDLE, mx: 1 }); __sim(0.1, { ...__IDLE, mx: -1 }); ${anim} __sim(0.01); return true; })()`],
      ['gacha-wheel', `(() => { T.fresh(); const pr = T.pair(3); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); const f = T.foe('gacha', pr.a.x, pr.a.z); T.wait(() => P.heldBy === f, 4); __sim(0.8); return true; })()`],
      ['mummy-tether', `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.foe('mummy', pr.a.x, pr.a.z); T.wait(() => f.tether && f.tether.mode === 'reel', 3); __sim(0.2); return true; })()`],
      ['hunter-circle', `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); const f = T.foe('hunter', pr.a.x, pr.a.z, false); f.mark = 'P'; T.wait(() => f.state === 'warn', 3);
        const sx = f.slamAt.x - pr.dir.z * 3.2, sz = f.slamAt.z + pr.dir.x * 3.2, ok = nav.okW(sx, sz); T.put(ok ? sx : f.slamAt.x + pr.dir.x * 2.6, ok ? sz : f.slamAt.z + pr.dir.z * 2.6, (f.slamAt.x + f.x) / 2, (f.slamAt.z + f.z) / 2); P.pitch = -0.3; __sim(0.45); ${anim} __sim(0.01); return true; })()`],
      ['head-gas', `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.foe('headthrower', pr.a.x, pr.a.z); T.wait(() => F.heads && F.heads.length > 0, 3); __sim(0.5); return true; })()`],
      ['head-blow', `(() => { P.noDownT = 99; T.wait(() => F.gas && F.gas.length > 0, 3); const g = F.gas[0]; let at = null; for (const [dx, dz] of [[3.2, 0], [-3.2, 0], [0, 3.2], [0, -3.2]]) if (!at && nav.okW(g.x + dx, g.z + dz) && nav.los(g.x, g.z, g.x + dx, g.z + dz)) at = { x: g.x + dx, z: g.z + dz };
        at = at || { x: g.x + 3, z: g.z }; T.put(at.x, at.z, g.x, g.z); P.pitch = -0.3; __sim(0.9); P.noDownT = 0; return true; })()`],
      ['impostor-crew', `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); const f = T.foe('impostor', pr.a.x, pr.a.z, false); f.x = pr.a.x; f.z = pr.a.z; f.yaw = Math.atan2(pr.b.x - pr.a.x, pr.b.z - pr.a.z); f.target = { x: pr.a.x, z: pr.a.z }; __sim(0.05); ${anim} __sim(0.01); return true; })()`],
      ['impostor-revealed', `(() => { const f = F.list[0]; F.impReveal(f); __sim(0.5); ${anim} ${anim} __sim(0.01); return true; })()`],
    ];
    for (const [tag, code] of scenes) { await hud(tag === 'gacha-wheel' || tag === 'wallhand-hold'); await page.evaluate(PRE(code)); await snap(tag); }
    check(shots.length === scenes.length, 'pictures', shots.length);
    console.log('  ' + shots.join('\n  '));
    await ctx.close();
  } catch (e) { check(false, 'run', e.message.slice(0, 400)); }
  clearTimeout(kill);
  await br.close(); srv.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} pass`);
  process.exit(bad.length ? 1 : 0);
})();
