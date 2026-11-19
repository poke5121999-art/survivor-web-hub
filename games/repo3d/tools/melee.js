// Melee check (js/melee.js): fist damage = the character's atk, plain knock 4.44 m/s (106.67 px/s), light foes x3, reach,
// cone, cooldown, the 3rd hit of a chain x1.5, a charged hit, hit-stop lengths, a light foe slammed into a wall (second
// beat), a punched loot item flies and loses value on the wall, a jammed door takes the blow (noise, stays shut), the bat
// swings through the same code (30 dmg, knock 6, one use), no swing while the beam holds loot; picture sequences of a
// punch and a bat swing; fps >= 50 with 3 bots while punching. Exit 1 on any failure.
// Usage: node tools/melee.js [--out <dir>] [--no-fps]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('melee'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`); };
const BOTS = 'bots=tam:loot,dung:thu,khoi:soi';

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = {};
  T.pair = (d, wallBehind) => { const sp = G.house.spawn; for (let i = 0; i < nav.W * nav.H; i++) { if (!nav.walk[i] || nav.near[i] < (wallBehind ? 2 : 3)) continue; const a = nav.center(i); if (Math.hypot(a.x - sp.x, a.z - sp.z) < 6) continue;
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, dir = { x: Math.cos(an), z: Math.sin(an) }, b = { x: a.x + dir.x * d, z: a.z + dir.z * d };
      if (!nav.clear(a.x, a.z, b.x, b.z, 0.6) || !nav.los(a.x, a.z, b.x, b.z)) continue;
      if (wallBehind) { let w = 0; for (let u = d; u < d + 3; u += 0.1) if (!nav.okW(a.x + dir.x * u, a.z + dir.z * u)) { w = u; break; } if (!(w > d + 0.7 && w < d + 1.6)) continue; return { a, b, dir, wall: w }; }
      return { a, b, dir }; } } return null; };
  T.put = (x, z, lx, lz, ly) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = ly === undefined ? -0.1 : Math.atan2(ly - (h + 1.2), Math.hypot(lx - x, lz - z)); __sim(0.05); };
  T.fresh = (lead = 'bao') => { for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); P.crewId = lead; P.hp = 100; G.gear.clear(); G.melee.cdT = 0; G.melee.chain = 0; G.melee.chainT = 0; G.melee.swing = null; G.melee.holdT = -1; if (G.grab.held) G.grab.release(false); G.hitStopT = 0; };
  T.foe = (kind, x, z) => { const f = G.foes.spawn(kind, x, z, { sleep: 99 }); f.yaw = Math.atan2(P.position.x - x, P.position.z - z); return f; };
  // press the right mouse for 'hold' s, release, run until the blow lands (or 0.6 s); returns the melee log entry
  T.punch = (hold = 0.03) => { const n0 = G.melee.log.length, ticks = Math.max(1, Math.round(hold * 60)); __sim(ticks / 60, { ...__IDLE, melee: true });
    for (let i = 0; i < 40 && G.melee.log.length === n0; i++) __sim(1 / 60); return G.melee.log[G.melee.log.length - 1] && G.melee.log.length > n0 ? G.melee.log[G.melee.log.length - 1] : null; };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, M = G.melee;');
const K = 106.67 / 24;

const CASES = {
  'fist: one hit = the atk of the character (Flare 9), plain knock 4.44 m/s, hit-stop 50 ms': `(() => { T.fresh('bao'); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.foe('mummy', pr.a.x + pr.dir.x * 1.0, pr.a.z + pr.dir.z * 1.0); const r = T.punch(); const h = r && r.foes[0];
    return { ok: !!h && Math.abs(h.dmg - 9) < 1e-6 && Math.abs(h.knock - ${K}) < 0.01 && !h.light && Math.abs(M.lastStop - 0.05) < 1e-6 && G.hitStopT > 0, rec: r, stop: M.lastStop }; })()`,
  'fist: Blink hits for her own atk (18)': `(() => { T.fresh('nga'); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    T.foe('mummy', pr.a.x + pr.dir.x * 1.0, pr.a.z + pr.dir.z * 1.0); const r = T.punch(); return { ok: !!r && r.foes[0] && Math.abs(r.foes[0].dmg - 18) < 1e-6, rec: r }; })()`,
  'miss: a foe behind or out of reach takes nothing': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const back = T.foe('mummy', pr.a.x - pr.dir.x * 1.0, pr.a.z - pr.dir.z * 1.0), far = T.foe('rook', pr.a.x + pr.dir.x * 2.4, pr.a.z + pr.dir.z * 2.4);
    const h0 = back.hp, h1 = far.hp; const r = T.punch(); return { ok: !!r && r.foes.length === 0 && back.hp === h0 && far.hp === h1 && (r.target === 'miss' || r.target === 'wall'), rec: r }; })()`,
  'cooldown: a second press inside 0.9 s does nothing, after it lands': `(() => { T.fresh(); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.foe('mummy', pr.a.x + pr.dir.x * 1.0, pr.a.z + pr.dir.z * 1.0); const n0 = M.log.length;
    T.punch(); __sim(0.2); T.punch(); const n1 = M.log.length - n0; __sim(0.6); T.punch(); const n2 = M.log.length - n0;
    return { ok: n1 === 1 && n2 === 2, after03: n1, after09: n2 }; })()`,
  'chain: the 3rd hit inside the window lands x1.5': `(() => { T.fresh('bao'); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.foe('mummy', pr.a.x + pr.dir.x * 1.0, pr.a.z + pr.dir.z * 1.0), d = [];
    for (let i = 0; i < 3; i++) { f.x = pr.a.x + pr.dir.x * 1.0; f.z = pr.a.z + pr.dir.z * 1.0; f.knock.x = f.knock.z = 0; const r = T.punch(); d.push(r && r.foes[0] ? r.foes[0].dmg : -1); __sim(0.8); }
    return { ok: Math.abs(d[0] - 9) < 1e-6 && Math.abs(d[1] - 9) < 1e-6 && Math.abs(d[2] - 13.5) < 1e-6, dmg: d }; })()`,
  'charge: held 1 s = x2.5 damage, x2.2 knock, hit-stop 90 ms': `(() => { T.fresh('bao'); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    T.foe('mummy', pr.a.x + pr.dir.x * 1.0, pr.a.z + pr.dir.z * 1.0); const r = T.punch(1.05); const h = r && r.foes[0];
    return { ok: !!h && r.k === 1 && Math.abs(h.dmg - 22.5) < 1e-6 && Math.abs(h.knock - ${K} * 2.2) < 0.01 && Math.abs(M.lastStop - 0.09) < 1e-6, rec: r, stop: M.lastStop }; })()`,
  'light foe (gnome): knock x3 and it flies over 1.5 m': `(() => { T.fresh('bao'); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.foe('gnome', pr.a.x + pr.dir.x * 1.0, pr.a.z + pr.dir.z * 1.0); f.hp = 999; const x0 = f.x, z0 = f.z;
    const r = T.punch(); let moved = 0; for (let i = 0; i < 40; i++) { __sim(1 / 60); moved = Math.max(moved, Math.hypot(f.x - x0, f.z - z0)); } const h = r && r.foes[0];
    return { ok: !!h && h.light && Math.abs(h.knock - ${K} * 3) < 0.01 && moved > 1.5, knock: h && h.knock, moved: +moved.toFixed(2) }; })()`,
  'a light foe slammed into a wall: second beat (thud, sparks, 1 extra hit)': `(() => { T.fresh('bao'); const pr = T.pair(0.9, true); if (!pr) return { ok: false, err: 'no wall spot' }; T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.foe('gnome', pr.b.x, pr.b.z); f.hp = 999; const n0 = M.log.length; T.punch(0.7); __sim(1);
    const slam = M.log.slice(n0).find((e) => e.wallSlam); return { ok: !!slam, slam, wall: +pr.wall.toFixed(2) }; })()`,
  'loot: a punched item flies and loses value against the wall': `(() => { T.fresh(); const pr = T.pair(0.9, true); if (!pr) return { ok: false, err: 'no wall spot' };
    T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z, G.house.heightAt(pr.b.x, pr.b.z) + 0.3);
    const it = G.loot.spawn({ material: 'ceramic', size: 'medium', value: 3000, pos: { x: pr.b.x, y: G.house.heightAt(pr.b.x, pr.b.z) + 0.4, z: pr.b.z } }); __sim(1.2); it.spawnedAt = -99;
    const t = it.body.translation(); T.put(pr.a.x, pr.a.z, t.x, t.z, t.y);
    const r = T.punch(0.6); let vmax = 0; for (let i = 0; i < 40; i++) { __sim(1 / 60); const v = it.body.linvel(); vmax = Math.max(vmax, Math.hypot(v.x, v.y, v.z)); }
    __sim(1); return { ok: !!r && r.target === 'loot' && vmax > 2 && (it.dead || it.value < 3000), target: r && r.target, vmax: +vmax.toFixed(2), value: it.dead ? 0 : it.value }; })()`,
  'a jammed door takes the blow: knock sound and noise, stays shut': `(() => { T.fresh(); const d = G.house.doorRecs.find((q) => q.jammed) || null; if (!d) return { ok: true, skipped: 'no jammed door in this house' };
    const n = d.door.dir === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 }; let a = null; for (const s of [1, -1]) { const x = d.cx + n.x * s * 1.15, z = d.cz + n.z * s * 1.15; if (nav.okW(x, z)) { a = { x, z }; break; } }
    T.put(a.x, a.z, d.cx, d.cz, (d.cy || 0) + 1.1); const n0 = G.noise.events.length; const r = T.punch();
    const nz = G.noise.events.slice(n0).find((e) => e.src === 'door'); return { ok: !!r && r.target === 'door-jammed' && !!nz && d.jammed, rec: r }; })()`,
  'bat: F swings through melee: 30 damage, knock 6, one use spent': `(() => { T.fresh(); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); G.gear.give('bat');
    const f = T.foe('mummy', pr.a.x + pr.dir.x * 1.2, pr.a.z + pr.dir.z * 1.2); const n0 = M.log.length; __sim(1 / 60, { ...__IDLE, gear: true, gearHold: true }); __sim(0.4);
    const r = M.log.slice(n0)[0], h = r && r.foes[0]; return { ok: !!h && r.w === 'bat' && Math.abs(h.dmg - 30) < 1e-6 && Math.abs(h.knock - 6) < 1e-6 && G.gear.uses === 11, rec: r, uses: G.gear.uses }; })()`,
  'hands busy: no swing while the beam holds loot': `(() => { T.fresh(); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z, G.house.heightAt(pr.a.x, pr.a.z) + 0.3);
    const it = G.loot.spawn({ material: 'wood', size: 'small', pos: { x: pr.a.x + pr.dir.x * 1.2, y: G.house.heightAt(pr.a.x, pr.a.z) + 0.3, z: pr.a.z + pr.dir.z * 1.2 } }); __sim(0.8);
    const t = it.body.translation(); T.put(pr.a.x, pr.a.z, t.x, t.z, t.y); const ok0 = G.grab.tryGrab() && G.grab.held === it; const n0 = M.log.length;
    __sim(0.1, { ...__IDLE, grab: true, melee: true }); __sim(0.5, { ...__IDLE, grab: true }); const swung = M.log.length - n0; G.grab.release(false);
    return { ok: ok0 && swung === 0, grabbed: ok0, swung }; })()`,
};

async function open(br, srv, q) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + q);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  const fatal = await page.evaluate('window.__fatal || null'); if (fatal) throw new Error('fatal: ' + fatal);
  await page.evaluate(HELP);
  return { ctx, page, logs };
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=3&seed=7&foes=none&bots=0&passives=0');
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    // picture sequences: a fist on a gunner, a bat on a rook, 2 m ahead in the torch (vietnam house 1, HUD hidden)
    ({ ctx, page, logs } = await open(br, srv, 'house=1&seed=7&foes=none&bots=0&theme=vietnam&passives=0'));
    await page.evaluate(`document.querySelectorAll('.ui-root, .hx, .scanx').forEach((e) => e.style.visibility = 'hidden')`);
    for (const [name, kind, bat] of [['punch', 'gunner', false], ['bat', 'rook', true]]) {
      await page.evaluate(PRE(`(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z, G.house.heightAt(pr.a.x, pr.a.z) + 1.0); ${bat ? "G.gear.give('bat');" : ''}
        const f = T.foe('${kind}', pr.a.x + pr.dir.x * ${bat ? 1.7 : 1.45}, pr.a.z + pr.dir.z * ${bat ? 1.7 : 1.45}); f.state = 'patrol'; f.aware = 0.6; f.speed = 0; f.maxHp = f.hp = 9999; __sim(0.3); return true; })()`));
      const shots = [];
      const snap = async (tag) => { const f = path.join(OUT, `melee-${name}-${tag}.png`); await page.waitForTimeout(60); await page.screenshot({ path: f }); shots.push(f); };
      await snap('1-ready');
      // windup: press, the swing starts on release; stop just before the blow
      await page.evaluate(PRE(`(() => { __sim(${bat ? '1 / 60, { ...__IDLE, gear: true, gearHold: true }' : '0.35, { ...__IDLE, melee: true }'}); ${bat ? '' : '__sim(1 / 60);'} __sim(0.04); return true; })()`));
      await snap('2-windup');
      await page.evaluate(PRE(`(() => { const n0 = M.log.length; for (let i = 0; i < 30 && M.log.length === n0; i++) __sim(1 / 60); __sim(1 / 60); return M.log[M.log.length - 1]; })()`));
      await snap('3-impact');
      await page.evaluate('__sim(0.12)'); await snap('4-after');
      await page.evaluate('__sim(0.5)'); await snap('5-settle');
      const rec = await page.evaluate('__G.melee.log.filter((e) => e.foes).slice(-1)[0]');
      check(!!rec && rec.foes.length > 0, `${name}: the picture sequence shows a landed ${bat ? 'bat swing' : 'punch'}`, rec);
      console.log('  ' + shots.join('\n  '));
    }
    await ctx.close();

    if (!argv.includes('--no-fps')) {
      ({ ctx, page, logs } = await open(br, srv, `house=1&seed=7&${BOTS}`));
      await page.evaluate(PRE(`(() => { T.fresh(); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); for (let k = 0; k < 2; k++) { const f = T.foe('mummy', pr.a.x + pr.dir.x * (1 + k * 0.3), pr.a.z + pr.dir.z * (1 + k * 0.3)); f.maxHp = f.hp = 99999; }
        window.__paused = false; let on = false; window.__mash = setInterval(() => { on = !on; G.cmdOverride = { ...__IDLE, melee: on }; }, 120); return true; })()`));
      await page.waitForTimeout(2500);
      const f0 = await page.evaluate('__G.frames'), s0 = await page.evaluate('__G.melee.log.length'); await page.waitForTimeout(4000);
      const f1 = await page.evaluate('__G.frames'), s1 = await page.evaluate('__G.melee.log.length');
      const fps = (f1 - f0) / 4, bots = await page.evaluate('__G.bots.list.length');
      check(fps >= 50 && bots === 3 && s1 - s0 >= 3, 'fps >= 50 with 3 bots while punching', { fps, bots, swings: s1 - s0 });
      await ctx.close();
    }
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(`out: ${OUT}`);
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
