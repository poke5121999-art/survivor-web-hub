// Angel and mirror (js/foe-moves-c.js). Angel: away 30-60 s, then appears 2.5-4.5 m in front of you in view; 5 s in the
// torch fills it: it flies off and leaves a light (r 7 m) for 30 s, no harm; out of the torch it drains; unlit 6 s:
// it blinks next to you, swipes its dmg, 6 s with the torch out and legs at half speed. Mirror: a pair in walls >= 10 m
// apart, 84 hp each; seen within 9 m for 2 s a ghost comes out; slower far from its glass (>= x0.32) and x0.42 in the
// torch; at 20 px it drags you out of the other mirror (and hurts); 2 pistol shots (62) or 3 s of torch break a glass,
// then no ghost comes again. Pictures: the angel lit and the light it leaves, a mirror pair, the ghost out.
// Usage: node tools/foe-moves-c.js [--out <dir>]
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
  T.open = () => { for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); let ok = true; for (let a = 0; a < 8 && ok; a++) { const x = c.x + Math.cos(a * Math.PI / 4) * 3.6, z = c.z + Math.sin(a * Math.PI / 4) * 3.6; if (!nav.okW(x, z) || !nav.los(c.x, c.z, x, z)) ok = false; } if (ok) return c; } return null; };
  T.put = (x, z, lx, lz) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; if (lx !== undefined) P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = 0; };
  T.look = (x, y, z) => { const c = P.camPos; P.yaw = Math.atan2(-(x - c.x), -(z - c.z)); P.pitch = Math.atan2(y - c.y, Math.hypot(x - c.x, z - c.z)); };
  T.fresh = () => { for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); P.heldBy = null; P.down = false; P.hp = 100; P.stamina = 100; P.push = null; P.torchOffT = 0; P.heavyT = 0; };
  T.logs = (k, n0, w) => G.foes.log.slice(n0).filter((e) => e[0] === k && (!w || e[1] === w));
  T.wait = (cond, s) => { for (let i = 0; i < s * 60; i++) { if (cond()) return true; __sim(1 / 60); } return cond(); };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, F = G.foes;');

const CASES = {
  'angel: away 30-60 s, then stands 2.5-4.5 m in front of you, in view': `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); P.yaw = 0.7; __sim(0.1);
    const f = F.spawn('angel', o.x, o.z, { sleep: 0 }), n0 = F.log.length, wait = f.awayT; F.render(1 / 60, P.camPos); const hidden = !f.robot.root.visible;
    f.awayT = 0.05; T.wait(() => f.state === 'watch', 1); const p = P.position, d = Math.hypot(f.x - p.x, f.z - p.z), fw = P.forward(new (P.camPos.constructor)()), ang = Math.acos(Math.min(1, ((f.x - p.x) * fw.x + (f.z - p.z) * fw.z) / (d * Math.hypot(fw.x, fw.z))));
    F.render(1 / 60, P.camPos);
    return { ok: wait >= 30 && wait <= 60 && hidden && f.state === 'watch' && d > 2.4 && d < 4.6 && ang < 0.62 && f.robot.root.visible, wait: +wait.toFixed(1), d: +d.toFixed(2), ang: +ang.toFixed(2) }; })()`,
  'angel: 5 s in the torch: it flies off, leaves a 7 m light for 30 s, no harm': `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); __sim(0.1);
    const f = F.spawn('angel', o.x, o.z, { sleep: 0 }), n0 = F.log.length; f.awayT = 0.05; T.wait(() => f.state === 'watch', 1); const t0 = F.time;
    T.wait(() => { T.look(f.x, f.gy + 1.3, f.z); return f.state !== 'watch'; }, 7); const t = F.time - t0, fled = T.logs('angel', n0, 'fled').length === 1;
    const L = F.angelLights && F.angelLights[0]; __sim(29); const still = L && G.scene.children.includes(L.light); __sim(1.5); const gone = L && !G.scene.children.includes(L.light);
    return { ok: fled && Math.abs(t - 5) < 0.2 && P.hp === 100 && !!L && L.light.distance === 7 && still && gone, t: +t.toFixed(2), fled, light: !!L, still, gone }; })()`,
  'angel: out of the torch the fill drains (6 s for a full bar)': `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); __sim(0.1);
    const f = F.spawn('angel', o.x, o.z, { sleep: 0 }); f.awayT = 0.05; T.wait(() => f.state === 'watch', 1);
    for (let i = 0; i < 150; i++) { T.look(f.x, f.gy + 1.3, f.z); __sim(1 / 60); } const a = f.fill; P.yaw += Math.PI; __sim(1.5); const b = f.fill;
    return { ok: a > 0.45 && Math.abs((a - b) - 1.5 / 6) < 0.03, filled: +a.toFixed(3), drained: +(a - b).toFixed(3) }; })()`,
  'angel: unlit 6 s: blinks next to you, swipes its dmg, torch out and heavy legs 6 s': `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); __sim(0.1);
    const f = F.spawn('angel', o.x, o.z, { sleep: 0 }), n0 = F.log.length; f.awayT = 0.05; T.wait(() => f.state === 'watch', 1); const t0 = F.time; P.yaw += Math.PI;
    T.wait(() => T.logs('angel', n0, 'strike').length > 0, 7); const t = F.time - t0, p = P.position, near = Math.hypot(f.x - p.x, f.z - p.z), hp = P.hp;
    __sim(0.05); G.lights?.update?.(1 / 60); const torch = G.torch.intensity; const q0 = { ...P.position }; __sim(1, { ...__IDLE, mz: -1 }); const slow = Math.hypot(P.position.x - q0.x, P.position.z - q0.z);
    __sim(5.5); const q1 = { ...P.position }; __sim(1, { ...__IDLE, mz: -1 }); const fast = Math.hypot(P.position.x - q1.x, P.position.z - q1.z);
    return { ok: Math.abs(t - 6) < 0.15 && near < 1.3 && Math.abs(hp - (100 - f.dmg)) < 0.01 && P.torchOffT === 0 && Math.abs(slow / fast - 0.5) < 0.06, t: +t.toFixed(2), near: +near.toFixed(2), hp, dmg: f.dmg, torchAtStrike: torch, ratio: +(slow / fast).toFixed(2) }; })()`,
  'mirror: a pair in walls >= 10 m apart, 84 hp each (flat)': `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); const A = F.spawn('mirror', o.x, o.z, { sleep: 0 }), B = A.partner, L = G.house.layout;
    const inWall = (m) => { const gx = Math.floor(m.x - Math.sin(m.yaw) * 0.6), gz = Math.floor(m.z - Math.cos(m.yaw) * 0.6); return L.grid[gz * L.w + gx] === 2; };
    return { ok: !!B && B.partner === A && inWall(A) && inWall(B) && Math.hypot(A.x - B.x, A.z - B.z) >= 10 && A.hp === 84 && B.hp === 84 && F.list.filter((f) => f.kind === 'mirror').length === 2, apart: B && +Math.hypot(A.x - B.x, A.z - B.z).toFixed(1), hp: [A.hp, B && B.hp] }; })()`,
  'mirror: seen 2 s within 9 m: the ghost comes out; slower far from its glass and x0.42 in the torch': `(() => { T.fresh(); const o = T.open(); const A = F.spawn('mirror', o.x, o.z, { sleep: 0 }), g = A.ghost, n0 = F.log.length;
    let at = null; for (const d of [6, 5, 7]) { const x = A.x + Math.sin(A.yaw) * d, z = A.z + Math.cos(A.yaw) * d; if (nav.okW(x, z) && nav.los(A.x + Math.sin(A.yaw) * 0.6, A.z + Math.cos(A.yaw) * 0.6, x, z)) { at = { x, z }; break; } }
    T.put(at.x, at.z); P.yaw += Math.PI; __sim(1.8); const early = g.out; T.wait(() => g.out, 0.5); const out = g.out;
    __sim(1 / 60); const s0 = g.speed, away0 = Math.hypot(g.x - A.x, g.z - A.z);
    T.look(g.x, A.gy + 1.2, g.z); __sim(1 / 60); const s1 = g.speed, lit = g.lit; P.yaw += Math.PI; __sim(1 / 60);
    const k0 = Math.max(0.32, 1 - away0 / 12), base = A.def.speed / 24;
    return { ok: !early && out && Math.abs(s0 - base * k0) < base * 0.06 && lit && Math.abs(s1 / g.speed - 0.42) < 0.05, early, out, s0: +s0.toFixed(3), want: +(base * k0).toFixed(3), lit, ratio: +(s1 / g.speed).toFixed(2) }; })()`,
  'mirror: at 20 px the ghost drags you out of the other mirror and hurts': `(() => { T.fresh(); const o = T.open(); const A = F.spawn('mirror', o.x, o.z, { sleep: 0 }), B = A.partner, g = A.ghost, n0 = F.log.length;
    const x = A.x + Math.sin(A.yaw) * 3, z = A.z + Math.cos(A.yaw) * 3; T.put(x, z); P.yaw += Math.PI; T.wait(() => g.out, 3); P.torchOffT = 99;
    const drag = T.wait(() => T.logs('mirror', n0, 'drag').length > 0, 25); P.torchOffT = 0; const p = P.position, dB = Math.hypot(p.x - B.x, p.z - B.z);
    return { ok: drag && dB < 1.3 && Math.abs(P.hp - (100 - A.dmg)) < 0.01 && !g.out && g.cdT > 7, drag, dB: +dB.toFixed(2), hp: P.hp }; })()`,
  'mirror: 2 pistol shots break a glass (1 does not); a broken pair sends no ghost': `(() => { T.fresh(); const o = T.open(); const A = F.spawn('mirror', o.x, o.z, { sleep: 0 }), B = A.partner, g = A.ghost, n0 = F.log.length;
    F.hurtFoe(B, 62, null, 0); const one = !B.dead; F.hurtFoe(B, 62, null, 0); const two = B.dead && B.broken && !B.glassMesh.visible;
    const x = A.x + Math.sin(A.yaw) * 3, z = A.z + Math.cos(A.yaw) * 3; T.put(x, z); P.yaw += Math.PI; __sim(4); const stays = !g.out; __sim(60); const still = B.dead;
    return { ok: one && two && stays && still, one, two, stays, still }; })()`,
  'mirror: 3 s of torch on a glass breaks it': `(() => { T.fresh(); const o = T.open(); const A = F.spawn('mirror', o.x, o.z, { sleep: 0 }), n0 = F.log.length;
    const x = A.x + Math.sin(A.yaw) * 2.5, z = A.z + Math.cos(A.yaw) * 2.5; T.put(x, z); const t0 = F.time;
    T.wait(() => { T.look(A.x, A.gy + 1.15, A.z); return A.dead; }, 4); const t = F.time - t0;
    return { ok: A.dead && A.broken && Math.abs(t - 3) < 0.15, t: +t.toFixed(2) }; })()`,
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

    ({ ctx, page, logs } = await open(br, srv, 'house=5&seed=7&foes=none&bots=0&passives=0&theme=vampire'));
    await page.evaluate(`document.querySelectorAll('.ui-root, .hx, .scanx').forEach((e) => e.style.visibility = 'hidden')`);
    const shots = [];
    const snap = async (tag) => { const f = path.join(OUT, `foe-${tag}.png`); await page.waitForTimeout(80); await page.screenshot({ path: f }); shots.push(f); };
    const anim = 'for (let i = 0; i < 40; i++) F.render(1 / 60, P.camPos);';
    const scenes = [
      ['angel-lit', `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); __sim(0.1); const f = F.spawn('angel', o.x, o.z, { sleep: 0 }); f.awayT = 0.05; T.wait(() => f.state === 'watch', 1); for (let i = 0; i < 200; i++) { T.look(f.x, f.gy + 1.3, f.z); __sim(1 / 60); } ${anim} __sim(0.01); return true; })()`],
      ['angel-light', `(() => { const f = F.list[0]; T.wait(() => { T.look(f.x, f.gy + 1.3, f.z); return f.state !== 'watch'; }, 4); __sim(0.5); P.pitch = -0.2; ${anim} __sim(0.01); return true; })()`],
      ['mirror-pair', `(() => { T.fresh(); const o = T.open(); const A = F.spawn('mirror', o.x, o.z, { sleep: 0 }); const x = A.x + Math.sin(A.yaw) * 2.6, z = A.z + Math.cos(A.yaw) * 2.6; T.put(x, z); __sim(0.05); T.look(A.x, A.gy + 1.15, A.z); P.torchOffT = 0; __sim(0.05); return true; })()`],
      ['mirror-ghost', `(() => { const A = F.list.find((f) => f.ghost); A.torchT = -99; const g = A.ghost; P.yaw += Math.PI; T.wait(() => g.out, 3); __sim(0.35); T.look(g.x, A.gy + 1.1, g.z); P.torchOffT = 0; __sim(0.02); ${anim} __sim(0.01); return true; })()`],
    ];
    for (const [tag, code] of scenes) { await page.evaluate(PRE(code)); await snap(tag); }
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
