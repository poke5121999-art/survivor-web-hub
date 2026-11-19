// Gear check (js/gear.js + station offers): each gear used with key F does its job on real foes, the pry bar opens a
// jammed door in 2 s (Pick 1 s), buying at the station fills slot 4, the light and sprint potions work, and the station
// shows the 5 gear items as grabbable offers. Exit 1 on any failure.
// Usage: node tools/gear.js [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('gear'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 320) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes?.nav, P = G.player; window.__paused = true; __sim(1);
  const T = window.__T = {};
  T.pair = (d) => { const sp = G.house.spawn; for (const i of nav.cells) { if (nav.near[i] < 3) continue; const a = nav.center(i); if (Math.hypot(a.x - sp.x, a.z - sp.z) < 6) continue;
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, b = { x: a.x + Math.cos(an) * d, z: a.z + Math.sin(an) * d }; const j = nav.nearest(b.x, b.z, 0);
      if (j < 0 || nav.near[j] < 2 || !nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue; return { a, b, dir: { x: Math.cos(an), z: Math.sin(an) } }; } } return null; };
  T.put = (x, z, lx, lz) => { P.body.setTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }); P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = -0.05; __sim(0.05); };
  T.fresh = (lead = 'bao') => { if (P.down) G.runner.reviveNow(null, true); for (const f of [...(G.foes?.list || [])]) G.foes.remove(f); P.crewId = lead; P.hp = 100; G.gear.clear(); G.gear.cdT = 0; };
  T.fire = () => __sim(1 / 60, { ...__IDLE, gear: true, gearHold: true });
  T.hunt = (kind, x, z) => { const f = G.foes.spawn(kind, x, z, { state: 'chase' }); f.yaw = Math.atan2(P.position.x - x, P.position.z - z); f.aware = 1; f.lastSeen = { x: P.position.x, z: P.position.z }; return f; };
  return true; })()`;
const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, nav = G.foes?.nav, Gr = G.gear;');

const CASES1 = {
  'gun: 62 damage to the foe on the line of sight, one shot spent, loud': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = G.foes.spawn('mummy', pr.b.x, pr.b.z, { sleep: 99 }); const hp0 = f.hp; Gr.give('gun'); const n0 = G.noise.events.length; T.fire();
    const shot = G.noise.events.slice(n0).find((e) => e.src === 'gun');
    return { ok: hp0 - f.hp === 62 && Gr.uses === 19 && !!shot && shot.r >= 14, dmg: hp0 - f.hp, uses: Gr.uses, noise: shot && shot.r }; })()`,
  'gun: a miss hurts nobody': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.a.x, pr.a.z, pr.a.x - pr.dir.x, pr.a.z - pr.dir.z);
    const f = G.foes.spawn('mummy', pr.b.x, pr.b.z, { sleep: 99 }); const hp0 = f.hp; Gr.give('gun'); T.fire(); return { ok: f.hp === hp0 && Gr.uses === 19, hp: f.hp }; })()`,
  'bat: 30 damage and knockback ahead, nothing behind': `(() => { T.fresh(); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = G.foes.spawn('mummy', pr.a.x + pr.dir.x * 1.2, pr.a.z + pr.dir.z * 1.2, { sleep: 99 }), g = G.foes.spawn('rook', pr.a.x - pr.dir.x * 1.2, pr.a.z - pr.dir.z * 1.2, { sleep: 99 });
    const hf = f.hp, hg = g.hp, x0 = f.x, z0 = f.z; Gr.give('bat'); T.fire(); __sim(0.3); const moved = Math.hypot(f.x - x0, f.z - z0);
    return { ok: hf - f.hp === 30 && g.hp === hg && moved > 0.2 && Gr.uses === 11, dmg: hf - f.hp, behind: hg - g.hp, moved: +moved.toFixed(2) }; })()`,
  'tranq: the hunting foe sleeps 12 s, then wakes': `(() => { T.fresh(); const pr = T.pair(7); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.hunt('gunner', pr.b.x, pr.b.z); Gr.give('tranq'); T.fire(); const st = f.state; __sim(11); const still = f.state === 'sleep', hp = P.hp; __sim(1.5);
    return { ok: st === 'sleep' && still && hp === 100 && f.state !== 'sleep' && Gr.uses === 2, st, still, hp, after: f.state }; })()`,
  'stun grenade: foes within 3.5 m of the landing sleep 6 s, a far one does not': `(() => { T.fresh(); const pr = T.pair(6); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const a = T.hunt('gunner', pr.b.x, pr.b.z), b = G.foes.spawn('rook', pr.b.x - pr.dir.x * 1.5, pr.b.z - pr.dir.z * 1.5, { state: 'patrol' }), far = G.foes.spawn('mummy', pr.a.x - pr.dir.x * 4, pr.a.z - pr.dir.z * 4, { state: 'patrol' });
    for (const f of [a, b, far]) f.speed = 0;   // stand still: the test is about the blast radius, not the chase
    Gr.give('stun'); T.fire(); __sim(1.0); const before = a.state; __sim(0.5);
    return { ok: before !== 'sleep' && a.state === 'sleep' && b.state === 'sleep' && far.state !== 'sleep' && P.hp === 100, before, a: a.state, b: b.state, far: far.state, log: Gr.log.slice(-2) }; })()`,
};
const CASES3 = {
  'pry bar: hold F 2 s at a jammed door and it opens (Pick: 1 s)': `(() => { const t = (lead) => { T.fresh(lead); const d = G.house.doorRecs.find((o) => o.jammed); if (!d) return -2;
      let at = null; for (const s of [1.6, -1.6]) { const x = d.cx + (d.door.dir === 0 ? s : 0), z = d.cz + (d.door.dir === 0 ? 0 : s); if (nav.okW(x, z)) { at = { x, z }; break; } }
      T.put(at.x, at.z, d.cx, d.cz); Gr.give('pry'); let i = 0; while (d.jammed && i++ < 240) T.fire(); return d.jammed ? -1 : +(i / 60).toFixed(2); };
    const bao = t('bao'), ky = t('ky');
    return { ok: bao >= 1.95 && bao <= 2.1 && ky >= 0.95 && ky <= 1.1, bao, ky }; })()`,
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
async function runCases(page, cases) {
  for (const [name, code] of Object.entries(cases)) {
    let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
    check(!!r.ok, name, r);
  }
}

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 240 s'); process.exit(2); }, 240000);
  try {
    let { ctx, page, logs } = await open(br, srv, 'house=1&seed=7&foes=none&passives=0');
    await runCases(page, CASES1);
    // station: shelves, buying, potions
    const st = await page.evaluate(PRE(`(() => { T.fresh(); G.runner.testCompletePads(); __sim(0.5); G.runner.testBoard(); return true; })()`)).catch((e) => e.message);
    await page.waitForFunction("__G.run.phase === 'station' && !__G.runner.busy", null, { timeout: 30000 });
    const shelf = await page.evaluate(`(() => { const S = __G.station; const gear = S.items.filter((r) => r.offer && r.offer.kind === 'gear' && r.grabbable).map((r) => r.offer.gear); return { gear, potions: S.items.filter((r) => r.offer && (r.offer.light || r.offer.sprint)).length }; })()`);
    check(shelf.gear.length === 5 && shelf.potions === 2, 'the station sells the 5 gear items and the light + sprint potions as grabbable offers', { shelf, st });
    await page.screenshot({ path: path.join(OUT, 'station.png') });
    const buy = await page.evaluate(PRE(`(() => { const R = G.run, w0 = R.wallet = 60000; const S = G.station, of = (id) => S.offers.find((o) => o.id === id);
      const okGun = G.runner.buy(of('gear_gun')); const slot = { id: Gr.id, uses: Gr.uses };
      G.runner.buy(of('gear_bat')); const swapped = { id: Gr.id, uses: Gr.uses };
      const d0 = G.torch.distance; G.runner.buy(of('potion_light')); __sim(0.1); const d1 = G.torch.distance;
      const m0 = P.runMul; G.runner.buy(of('potion_sprint'));
      return { ok: okGun && slot.id === 'gun' && slot.uses === 20 && swapped.id === 'bat' && swapped.uses === 12 && Math.abs(d1 / d0 - 1.16) < 0.001 && Math.abs(P.runMul / m0 - 1.2) < 1e-9 && R.wallet === w0 - 9000 - 8000 - 5000 - 6000,
        slot, swapped, d0, d1, runMul: P.runMul, wallet: R.wallet }; })()`));
    check(!!buy.ok, 'buying fills slot 4 (a new gear swaps it), the light potion adds 16 % torch reach, the sprint potion 20 % run', buy);
    const hud = await page.evaluate(`(() => { __sim(0.1); const s = [...document.querySelectorAll('.ui-root .hud .slots .slot')]; return { n: s.length, four: s[3] ? s[3].innerText : null }; })()`);
    check(hud.n === 4 && /12/.test(hud.four || ''), 'HUD slot 4 shows the gear uses', hud);
    const err = await page.evaluate('__errors.slice()');
    check(!err.length && !logs.length, 'house 1 + station: no console or page errors', err.concat(logs));
    await ctx.close();
    ({ ctx, page, logs } = await open(br, srv, 'house=3&seed=7&foes=none&passives=1'));
    await runCases(page, CASES3);
    const err3 = await page.evaluate('__errors.slice()');
    check(!err3.length && !logs.length, 'house 3: no console or page errors', err3.concat(logs));
    await ctx.close();
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
