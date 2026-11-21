// Theme bosses (js/bosses.js): one per house from house 3 by theme, none in houses 1-2, no respawn; stunned only by
// gear (tranq / stun grenade / sledgehammer), capped 1.2 s, then 4 s immune; skills do not stun them; little knockback.
// Vampire: hidden 5 s, bats, appears 3-3.8 m away in sight, red ring r 4.6 for 1.2 s: inside = held and drained 2.2 s
// (it heals what it drains), thrown, vanishes; outside = it just vanishes. Nurse: screams on sight (foes within 14 m
// come), syringe (pink line) slows you x0.6 for 4 s. Alien: ink (purple line) blinds 4 s (black blots on screen), no
// damage, then it chases and hits. Pharaoh: lock shadow under you, stay 2 s = bone cage (no walking); punch the cage
// (66 hp) to break it, else its staff hits 3 s later; step out = no cage. Joker: lays fake loot; beaming it = clown box
// blast; a trap touched = it rushes you at x2.2. Pictures of each.
// Usage: node tools/bosses.js [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('bosses'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 1200) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = {};
  T.pair = (d, skip = 0) => { for (let i = 0; i < nav.W * nav.H; i++) { if (!nav.walk[i] || nav.near[i] < 3) continue; const a = nav.center(i), h = G.house.heightAt(a.x, a.z);
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, dir = { x: Math.cos(an), z: Math.sin(an) }, b = { x: a.x + dir.x * d, z: a.z + dir.z * d };
      if (!nav.okW(b.x, b.z) || Math.abs(G.house.heightAt(b.x, b.z) - h) > 0.01 || !nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue;
      if (skip-- > 0) continue; return { a, b, dir }; } } return null; };
  T.open = () => { for (const i of nav.cells) { if (nav.near[i] < 3) continue; const c = nav.center(i); let ok = true; for (let a = 0; a < 8 && ok; a++) { const x = c.x + Math.cos(a * Math.PI / 4) * 4.2, z = c.z + Math.sin(a * Math.PI / 4) * 4.2; if (!nav.okW(x, z) || !nav.los(c.x, c.z, x, z)) ok = false; } if (ok) return c; } return null; };
  T.put = (x, z, lx, lz) => { const h = G.house.heightAt(x, z); P.body.setTranslation({ x, y: h + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: h + 0.85, z }); P.vy = 0; if (lx !== undefined) P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = 0; };
  T.look = (x, y, z) => { const c = P.camPos; P.yaw = Math.atan2(-(x - c.x), -(z - c.z)); P.pitch = Math.atan2(y - c.y, Math.hypot(x - c.x, z - c.z)); };
  T.fresh = () => { for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); if (G.foes.cage) G.foes.cageEnd('test'); P.heldBy = null; P.down = false; P.hp = 100; P.stamina = 100; P.push = null; P.torchOffT = 0; P.heavyT = 0; P.slowT = 0; P.inkT = 0; };
  T.boss = (kind, x, z) => { const f = G.foes.spawn(kind, x, z, { sleep: 0 }); const p = P.position; f.yaw = Math.atan2(p.x - x, p.z - z); f.aware = 1; f.lastSeen = { x: p.x, z: p.z }; if (kind !== 'vampire') G.foes.setState(f, 'chase'); return f; };
  T.logs = (k, n0, w) => G.foes.log.slice(n0).filter((e) => e[0] === k && (w === undefined || e[1] === w));
  T.wait = (cond, s) => { for (let i = 0; i < s * 60; i++) { if (cond()) return true; __sim(1 / 60); } return cond(); };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, F = G.foes;');

const CASES = {
  'one boss per theme from house 3 (none in houses 1-2); no respawn': `(() => { T.fresh(); const got = {};
    for (const th of ['vampire', 'pyramid', 'vietnam', 'spacestation', 'asylum']) { const f = F.spawnBoss(th); got[th] = f && f.kind; if (f) F.remove(f); }
    const hi = F.houseIndex; F.houseIndex = 2; const none = F.spawnBoss('vampire'); F.houseIndex = hi;
    const f = F.spawnBoss('pyramid'); F.hurtFoe(f, 99999, null, 0); __sim(60); const stays = f.dead;
    return { ok: got.vampire === 'vampire' && got.pyramid === 'pharaoh' && got.vietnam === 'joker' && got.spacestation === 'alien' && got.asylum === 'nurse' && !none && stays, got, none: !!none, stays }; })()`,
  'boss stun: gear only, capped 1.2 s, then 4 s immune; skills do not stun; little knockback': `(() => { T.fresh(); const pr = T.pair(5); T.put(pr.b.x, pr.b.z); const f = T.boss('pharaoh', pr.a.x, pr.a.z);
    G.gear.sleep(f, 12); const s1 = f.stunT, st1 = f.state; __sim(1.3); G.gear.sleep(f, 6); const s2 = f.stunT; __sim(4.1); G.gear.sleep(f, 6); const s3 = f.stunT;
    __sim(1.5); G.skills.stun(f, 3); const s4 = f.stunT; f.knock.x = f.knock.z = 0; F.hurtFoe(f, 1, { x: 1, z: 0 }, 10); const k = Math.hypot(f.knock.x, f.knock.z);
    return { ok: Math.abs(s1 - 1.2) < 1e-6 && st1 !== 'sleep' && s2 === 0 && Math.abs(s3 - 1.2) < 1e-6 && s4 === 0 && k < 2, s1, s2, s3, s4, knock: +k.toFixed(2) }; })()`,
  'vampire: hidden 5 s, appears 3-3.8 m away, ring; inside = drained 2.2 s (heals it), thrown, gone': `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); const f = T.boss('vampire', o.x + 2, o.z), n0 = F.log.length;
    __sim(1 / 60); const f0st = f.state; F.render(1 / 60, P.camPos); const hid = !f.robot.root.visible; const t0 = F.time; T.wait(() => f.state === 'bats', 7); const tA = F.time - t0, p = P.position, d = Math.hypot(f.x - p.x, f.z - p.z);
    T.wait(() => f.state === 'ring', 1); F.render(1 / 60, P.camPos); const ring = F.bossRing.visible; f.hp = f.maxHp - 100; const hp0 = f.hp, php0 = P.hp;
    T.wait(() => f.state === 'drain', 1.6); const held = P.heldBy === f; T.wait(() => f.state === 'throw', 2.6); const drained = php0 - P.hp, healed = f.hp - hp0, q = { ...P.position };
    const push0 = P.push && [+P.push.x.toFixed(2), +P.push.z.toFixed(2)], hb = !!P.heldBy, dn = P.down; __sim(0.3); const thrown = Math.hypot(P.position.x - q.x, P.position.z - q.z); T.wait(() => f.state === 'hidden', 1);
    return { hid, st0: f0st, ok: hid && Math.abs(tA - 5) < 0.2 && d >= 2.95 && d <= 3.85 && ring && held && drained > 22 && Math.abs(healed - drained) < 0.5 && thrown > 0.8 && f.state === 'hidden' && !P.heldBy, tA: +tA.toFixed(2), d: +d.toFixed(2), ring, held, drained: +drained.toFixed(1), healed: +healed.toFixed(1), thrown: +thrown.toFixed(2), push0, hb, dn, st: f.state, stopT: G.hitStopT }; })()`,
  'vampire: out of the ring when it closes: it just vanishes, no harm': `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); const f = T.boss('vampire', o.x + 2, o.z); F.setState(f, 'hidden'); f.stateT = 4.9;
    T.wait(() => f.state === 'ring', 2); const p = P.position, ax = p.x - f.x, az = p.z - f.z, L = Math.hypot(ax, az); let at = null;
    for (const r of [6, 5.5, 7]) { const x = f.x + ax / L * r, z = f.z + az / L * r; if (nav.okW(x, z)) { at = { x, z }; break; } }
    if (!at) for (let a = 0; a < 16 && !at; a++) { const x = f.x + Math.cos(a) * 6, z = f.z + Math.sin(a) * 6; if (nav.okW(x, z)) at = { x, z }; }
    T.put(at.x, at.z); T.wait(() => f.state === 'hidden', 2);
    return { ok: f.state === 'hidden' && P.hp === 100 && !P.heldBy, state: f.state, hp: P.hp }; })()`,
  'nurse: scream calls the foes near her; the syringe (pink line) slows x0.6 for 4 s': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const m = F.spawn('mummy', pr.a.x - pr.dir.x * 3, pr.a.z - pr.dir.z * 3, { sleep: 99 }); const f = T.boss('nurse', pr.a.x, pr.a.z), n0 = F.log.length;
    T.wait(() => T.logs('scream', n0).length > 0, 2); const called = m.state !== 'sleep' && m.aware >= 1; F.remove(m);
    T.wait(() => f.state === 'aim', 3); F.render(1 / 60, P.camPos); const pink = F.lasers.some((l) => l.tube.visible && l.col === 0xff5ab4);
    T.wait(() => T.logs('syringe', n0).length > 0, 1.5); const slowed = P.slowT > 3.8, hp = P.hp; P.hp = 100; F.remove(f);
    T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); const q0 = { ...P.position }; __sim(1, { ...__IDLE, mz: 1 }); const a = Math.hypot(P.position.x - q0.x, P.position.z - q0.z); __sim(3.2); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.02); const q1 = { ...P.position }; __sim(1, { ...__IDLE, mz: 1 }); const b = Math.hypot(P.position.x - q1.x, P.position.z - q1.z);
    return { ok: called && pink && slowed && hp < 100 && Math.abs(a / b - 0.6) < 0.06, called, pink, slowed, hp, ratio: +(a / b).toFixed(2) }; })()`,
  'alien: ink (purple line) blinds 4 s, no damage; then it chases and hits': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.boss('alien', pr.a.x, pr.a.z), n0 = F.log.length; T.wait(() => f.state === 'aim', 3); F.render(1 / 60, P.camPos); const purple = F.lasers.some((l) => l.tube.visible && l.col === 0xa040ff);
    T.wait(() => T.logs('ink', n0).length > 0, 1.5); const ink = P.inkT > 3.8, hp = P.hp; F.render(1 / 60, P.camPos); const blots = document.querySelector('.hx-ink')?.style.display === 'block';
    const hit = T.wait(() => P.hp < 100, 8);
    return { ok: purple && ink && hp === 100 && blots && hit, purple, ink, hp, blots, hit }; })()`,
  'pharaoh: stay in the lock shadow 2 s = bone cage, no walking; punch it out (66 hp)': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.boss('pharaoh', pr.a.x, pr.a.z), n0 = F.log.length; f.speed = 0; T.wait(() => T.logs('mark', n0, 'set').length > 0, 2); F.render(1 / 60, P.camPos); const shadow = F.lockMark.visible;
    T.wait(() => !!F.cage, 2.5); const caged = !!F.cage && P.heldBy === F.cage; const q = { ...P.position }; __sim(0.5, { ...__IDLE, mz: 1 }); const moved = Math.hypot(P.position.x - q.x, P.position.z - q.z);
    G.melee.cdT = 0; let n = 0; for (let i = 0; i < 24 && F.cage; i++) { G.melee.cdT = 0; __sim(0.05, { ...__IDLE, melee: true }); __sim(0.4); n++; F.cage && (F.cage.t = 0); }
    return { ok: shadow && caged && moved < 0.05 && !F.cage && !P.heldBy && T.logs('cage', n0, 'broken').length === 1 && P.hp === 100, shadow, caged, moved: +moved.toFixed(3), punches: n }; })()`,
  'pharaoh: caged and not out in 3 s: the staff hits; step out of the shadow = no cage': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.boss('pharaoh', pr.a.x, pr.a.z), n0 = F.log.length; f.speed = 0; T.wait(() => !!F.cage, 4.5); T.wait(() => T.logs('staff', n0, 'hit').length > 0, 4.5); const hp = P.hp, freed = !P.heldBy;
    T.fresh(); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const g = T.boss('pharaoh', pr.a.x, pr.a.z), n1 = F.log.length; g.speed = 0; T.wait(() => !!g.markAt, 2); T.put(pr.b.x + pr.dir.x * 2, pr.b.z + pr.dir.z * 2); T.wait(() => !g.markAt, 2.5);
    return { ok: Math.abs(hp - (100 - f.dmg)) < 0.01 && freed && !F.cage && T.logs('mark', n1, 'missed').length === 1, hp, dmg: f.dmg, freed, log: F.log.slice(n0, n0 + 12) }; })()`,
  'joker: lays fake loot; beaming it blows a clown box; a trap touched sends it rushing at x2.2': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1);
    const f = T.boss('joker', pr.a.x, pr.a.z), n0 = F.log.length; f.speed = 0; f.fakeT = 0.01; __sim(0.1); const it = f.fakes[0];
    T.wait(() => it.body.linvel().y ** 2 < 0.01, 2); const t = it.body.translation(); f.x = t.x - 4; f.z = t.z; f.body.setTranslation({ x: f.x, y: f.y, z: f.z }, true); f.body.setNextKinematicTranslation({ x: f.x, y: f.y, z: f.z }); __sim(0.05); T.put(t.x + 1.4, t.z); __sim(0.05); T.look(t.x, t.y, t.z); __sim(0.02); const got = G.grab.tryGrab(); const heldNow = G.grab.held === it, js = f.state, jd = f.dead;
    __sim(0.1); const boom = T.logs('fakeBoom', n0).length === 1 && it.dead, hurt = P.hp < 100;
    P.hp = 100; f.speed = f.def.speed / 24; const pr2 = T.pair(8); T.put(pr2.b.x, pr2.b.z); f.x = pr2.a.x; f.z = pr2.a.z; F.jokerRush('P'); __sim(0.6); const sp = f.moveSpeed;
    return { ok: got && boom && hurt && Math.abs(sp - (60 / 24) * 2.2) < 0.4, got, heldNow, js, jd, fakes: f.fakes && f.fakes.length, boom, hurt, rush: +sp.toFixed(2), want: +(60 / 24 * 2.2).toFixed(2) }; })()`,
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
  const kill = setTimeout(() => { console.log('FAIL timeout 480 s'); process.exit(2); }, 480000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=4&seed=7&foes=none&bots=0&passives=0');
    for (const [name, code] of Object.entries(CASES)) {
      let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
      check(!!r.ok, name, r);
    }
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'cases: no console or page errors', err.concat(logs));
    await ctx.close();

    // pictures, one theme each
    const shots = [];
    const anim = 'for (let i = 0; i < 50; i++) F.render(1 / 60, P.camPos);';
    const scenes = [
      ['vampire', 'vampire', `(() => { T.fresh(); const o = T.open(); T.put(o.x, o.z); const f = T.boss('vampire', o.x + 2, o.z); F.setState(f, 'hidden'); f.stateT = 4.95; T.wait(() => f.state === 'ring', 2); __sim(0.4); const p = P.position, bx = p.x + (p.x - f.x) * 0.5, bz = p.z + (p.z - f.z) * 0.5; if (nav.okW(bx, bz)) T.put(bx, bz); __sim(0.02); T.look(f.x, f.gy + 1.0, f.z); P.pitch -= 0.12; ${anim} __sim(0.01); return true; })()`, false],
      ['pharaoh', 'pyramid', `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.boss('pharaoh', pr.a.x, pr.a.z); f.speed = 0; T.wait(() => !!F.cage, 4.5); __sim(0.3); P.pitch = -0.05; ${anim} __sim(0.01); return true; })()`, false],
      ['joker', 'vietnam', `(() => { T.fresh(); const pr = T.pair(5); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.boss('joker', pr.a.x, pr.a.z); f.speed = 0; f.fakeT = 0.01; __sim(0.1); const it = f.fakes[0]; __sim(1); const t = it.body.translation(); F.jokerBoom(f, it); P.hp = 100; __sim(0.5); T.look(t.x, t.y + 0.3, t.z); ${anim} __sim(0.01); return true; })()`, false],
      ['alien', 'spacestation', `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.boss('alien', pr.a.x, pr.a.z); T.wait(() => P.inkT > 0, 4); __sim(0.4); ${anim} __sim(0.01); return true; })()`, true],
      ['nurse', 'asylum', `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z); __sim(0.1); const f = T.boss('nurse', pr.a.x, pr.a.z); T.wait(() => f.state === 'aim', 3); __sim(0.35); ${anim} __sim(0.01); return true; })()`, false],
    ];
    for (const [tag, theme, code, hud] of scenes) {
      ({ ctx, page, logs } = await open(br, srv, `house=4&seed=7&foes=none&bots=0&passives=0&theme=${theme}`));
      await page.evaluate(`document.querySelectorAll('.ui-root, .scanx').forEach((e) => e.style.visibility = 'hidden'); document.querySelectorAll('.hx > *:not(.hx-ink)').forEach((e) => e.style.visibility = ${hud ? "'visible'" : "'hidden'"})`);
      await page.evaluate(PRE(code));
      const f = path.join(OUT, `boss-${tag}.png`); await page.waitForTimeout(80); await page.screenshot({ path: f }); shots.push(f);
      await ctx.close();
    }
    check(shots.length === scenes.length, 'pictures', shots.length);
    console.log('  ' + shots.join('\n  '));
  } catch (e) { check(false, 'run', e.message.slice(0, 400)); }
  clearTimeout(kill);
  await br.close(); srv.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} pass`);
  process.exit(bad.length ? 1 : 0);
})();
