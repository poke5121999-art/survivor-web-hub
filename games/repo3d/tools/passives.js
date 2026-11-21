// Passive check (js/passives.js): one scenario per crew passive, each compared with a crew member who lacks it.
// One paused bot stands in as the ally (or as the passive's owner). Exit 1 on any failure.
// Usage: node tools/passives.js [--out <dir>]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const OUT = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : scratch('passives'); })();
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 320) : ''}`); };

const HELP = `(() => { const G = __G, nav = G.foes.nav, P = G.player; window.__paused = true; __sim(1); G.bots.paused = true;
  const T = window.__T = {};
  T.pair = (d) => { const sp = G.house.spawn; for (const i of nav.cells) { if (nav.near[i] < 3) continue; const a = nav.center(i); if (Math.hypot(a.x - sp.x, a.z - sp.z) < 6) continue;
    for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4, b = { x: a.x + Math.cos(an) * d, z: a.z + Math.sin(an) * d }; const j = nav.nearest(b.x, b.z, 0);
      if (j < 0 || nav.near[j] < 2 || !nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue; return { a, b, dir: { x: Math.cos(an), z: Math.sin(an) } }; } } return null; };
  T.put = (x, z, lx, lz) => { P.body.setTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }); P.yaw = Math.atan2(-(lx - x), -(lz - z)); P.pitch = -0.05; __sim(0.05); };
  T.fresh = (lead, mate = 'tam') => { if (P.down) G.runner.reviveNow(null, true); if (G.grab.held) G.grab.release(false); for (const f of [...G.foes.list]) G.foes.remove(f);
    P.crewId = lead; G.run.hpMax = 150; P.hp = 100; P.invulnT = 0; P.noDownT = 0; G.passives.saved.clear();
    const b = G.bots.list[0]; if (b.down) G.bots.revive(b); b.crew = mate; b.hp = b.maxHp = 120; b.invulnT = 0; return b; };
  return true; })()`;

const PRE = (c) => c.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, Pa = G.passives, nav = G.foes.nav;');
const CASES = {
  'bao: lamps in seen rooms are 40 % brighter': `(() => { T.fresh('bao'); const L = G.house.layout, lamps = G.house.lamps;
    const inRoom = (l, seen) => { const r = L.rooms.find((q) => l.x >= q.x && l.x < q.x + q.w && l.z >= q.y && l.z < q.y + q.h); return r && G.run.seen.has(r.id) === seen; };
    const ls = lamps.find((l) => inRoom(l, true)), lu = lamps.find((l) => inRoom(l, false));
    const a = Pa.lampMul(ls), b = lu ? Pa.lampMul(lu) : 1; T.fresh('hue'); const c = Pa.lampMul(ls);
    return { ok: a === 1.4 && b === 1 && c === 1, seen: a, unseen: b, other: c }; })()`,
  'hue: allies within 1.5 m heal 1 hp/s': `(() => { const b = T.fresh('hue'); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    G.bots.teleport(b, pr.a.x + pr.dir.x * 1, pr.a.z + pr.dir.z * 1); b.hp = 50; __sim(4); const near = b.hp;
    G.bots.teleport(b, pr.b.x, pr.b.z); b.hp = 50; __sim(4); const far = b.hp;
    return { ok: Math.abs(near - 54) < 0.2 && far === 50, near: +near.toFixed(2), far }; })()`,
  'tam: weight slow-down cut to 70 %': `(() => { const run = (lead) => { T.fresh(lead); const it = G.loot.items.filter((i) => !i.dead && i.size !== 'small').sort((u, v) => v.mass - u.mass)[0];
      const t = it.body.translation(); T.put(t.x + 1.3, t.z, t.x, t.z); G.grab.attach(it, t, 1.3); __sim(0.3, { ...__IDLE, grab: true }); const m = P.speedMul; G.grab.release(false); return m; };
    const tam = run('tam'), bao = run('bao');
    return { ok: Math.abs(tam - (1 - (1 - bao) * 0.7)) < 0.01 && tam > bao, tam: +tam.toFixed(3), bao: +bao.toFixed(3) }; })()`,
  'ky: prying is twice as fast': `(() => { T.fresh('ky'); const k = Pa.pryMul(P); T.fresh('bao'); const b = Pa.pryMul(P); return { ok: k === 2 && b === 1, ky: k, bao: b }; })()`,
  'linh: footstep noise radius halved': `(() => { const walk = (lead) => { T.fresh(lead); const pr = T.pair(8); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); 
      __sim(1.5, () => ({ ...__IDLE, mz: 1 })); return G.noise.level(); };   // steady walking: the meter is the footstep radius
    const linh = walk('linh'), bao = walk('bao');
    return { ok: linh > 0 && Math.abs(linh / bao - 0.5) < 0.01, linh: +linh.toFixed(2), bao: +bao.toFixed(2) }; })()`,
  'dung: a foe blow does not cut the carried value': `(() => { const hit = (lead) => { T.fresh(lead); const pr = T.pair(3); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
      const it = G.loot.spawn({ material: 'ceramic', size: 'small', value: 1000, pos: { x: pr.a.x + pr.dir.x * 1.2, y: G.house.heightAt(pr.a.x, pr.a.z) + 1.2, z: pr.a.z + pr.dir.z * 1.2 } }); G.grab.attach(it, it.body.translation(), 1.2);
      const f = G.foes.spawn('gunner', pr.a.x + pr.dir.x * 0.9, pr.a.z + pr.dir.z * 0.9, { state: 'chase' }); f.yaw = Math.atan2(pr.a.x - f.x, pr.a.z - f.z); f.aware = 1; f.lastSeen = { x: pr.a.x, z: pr.a.z };
      let n = 0; while (n++ < 180 && P.hp >= 100) __sim(1 / 60, { ...__IDLE, grab: true }); const v = it.dead ? 0 : it.value; G.grab.release(false); return { v, hp: P.hp }; };
    const d = hit('dung'), b = hit('bao');
    return { ok: d.hp < 100 && d.v === 1000 && b.hp < 100 && b.v < 1000, dung: d, bao: b }; })()`,
  'mai: minimap shows foes within 8 m': `(() => { T.fresh('mai'); const pr = T.pair(6); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = G.foes.spawn('rook', pr.b.x, pr.b.z, { sleep: 99 }); const near = Pa.heard(f); f.x = pr.a.x + pr.dir.x * 12; f.z = pr.a.z + pr.dir.z * 12; const far = Pa.heard(f);
    f.x = pr.b.x; f.z = pr.b.z; T.fresh('bao'); const other = Pa.heard(G.foes.spawn('rook', pr.b.x, pr.b.z, { sleep: 99 }));
    return { ok: near && !far && !other, near, far, other }; })()`,
  'phuc: a head on the pad stands up twice as fast (Hook is the mate)': `(() => { const t = (mate) => { T.fresh('bao', mate); P.hurt(9999); __sim(0.2); const pad = G.extract.pads[G.extract.active];
      P.head.body.setTranslation({ x: pad.x, y: 0.4, z: pad.z }, true); G.run.headT = 0; let i = 0; while (P.down && i++ < 300) __sim(1 / 60); return +(i / 60).toFixed(2); };
    const phuc = t('phuc'), bao = t('tam');
    return { ok: phuc < 0.75 && bao >= 0.95 && bao < 1.4, phuc, bao }; })()`,
  'son: allies within 2 m take 8 % less damage': `(() => { const b = T.fresh('bao', 'son'); const pr = T.pair(5); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    G.bots.teleport(b, pr.a.x + pr.dir.x, pr.a.z + pr.dir.z); P.hurt(50); const near = 100 - P.hp;
    P.hp = 100; G.bots.teleport(b, pr.b.x, pr.b.z); P.hurt(50); const far = 100 - P.hp;
    return { ok: Math.abs(near - 46) < 0.01 && far === 50, near, far }; })()`,
  'nga: untouchable 3.5 s after a blink': `(() => { T.fresh('nga'); const pr = T.pair(7); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); G.skills.cd.clear();
    const r = G.skills.cast(P); P.hurt(40); const during = P.hp; __sim(3.6); P.hurt(40); const after = P.hp;
    return { ok: r.ok && during === 100 && after === 60, during, after }; })()`,
  'khoi: the torch reaches 15 % further': `(() => { T.fresh('khoi'); __sim(0.1); const k = G.torch.distance; T.fresh('bao'); __sim(0.1); const b = G.torch.distance;
    return { ok: Math.abs(k / b - 1.15) < 0.001, khoi: k, bao: b }; })()`,
  'van: a foe hit by your throw is slowed 25 % for 2 s': `(() => { const hit = (lead) => { T.fresh(lead); const pr = T.pair(6); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
      const f = G.foes.spawn('mummy', pr.b.x, pr.b.z, { state: 'patrol' }); f.yaw = Math.atan2(pr.a.x - f.x, pr.a.z - f.z); f.cdT = 99;   // cdT: no tether throw (foe-moves-b.js), it just walks
      const it = G.loot.spawn({ material: 'wood', size: 'medium', value: 2000, pos: { x: f.x - pr.dir.x * 0.9, y: G.house.heightAt(f.x, f.z) + 0.7, z: f.z - pr.dir.z * 0.9 } });
      it.body.setLinvel({ x: pr.dir.x * 9, y: 0, z: pr.dir.z * 9 }, true); __sim(0.25);
      const slow = f.slowT || 0; f.aware = 1; f.lastSeen = { x: pr.a.x, z: pr.a.z }; f.seen = true; G.foes.setState(f, 'chase');
      __sim(0.5); return { slow: +slow.toFixed(2), speed: +f.moveSpeed.toFixed(2) }; };
    const v = hit('van'), b = hit('bao');
    const chase = 34 / 24 * 1.25;   // mummy 34 px/s / 24, chase x1.25 (FOE_RULES.chaseMul)
    return { ok: v.slow > 1.5 && b.slow === 0 && Math.abs(v.speed / (chase * 0.75) - 1) < 0.12, van: v, bao: b, slowed: +(chase * 0.75).toFixed(2) }; })()`,
  'hai: grabbing at nothing pulls a small item within 2 m': `(() => { const pull = (lead) => { T.fresh(lead); const pr = T.pair(4); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); P.pitch = 1.3;
      const it = G.loot.spawn({ material: 'wood', size: 'small', value: 500, pos: { x: pr.a.x + pr.dir.x * 1.4, y: 0.4, z: pr.a.z + pr.dir.z * 1.4 } }); __sim(0.5); const tg = !!Pa.pullTarget(), t = it.body.translation(), dd = Math.hypot(t.x - P.position.x, t.z - P.position.z);
      __sim(1 / 60, { ...__IDLE, grab: true, grabPressed: true }); const got = !!G.grab.held && G.grab.held.size === 'small' && !G.grab.held.isHead; (window.__pdbg = window.__pdbg || {})[lead] = { tg, dd, held: !!G.grab.held, mine: Pa.mine(P, 'hai'), on: Pa.on, down: P.down }; G.grab.release(false); return got; };
    const hai = pull('hai'), bao = pull('bao');
    return { ok: hai && !bao, hai, bao, dbg: window.__pdbg }; })()`,
  'tuyet: an ally within 3 m survives a lethal hit with 1 hp, once per 30 s': `(() => { const b = T.fresh('bao', 'tuyet'); const pr = T.pair(5); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    G.bots.teleport(b, pr.a.x + pr.dir.x * 2, pr.a.z + pr.dir.z * 2); P.hurt(500); const first = { down: P.down, hp: P.hp }; P.hurt(500); const second = P.down;
    T.fresh('bao', 'tuyet'); G.bots.teleport(b, pr.b.x, pr.b.z); P.hurt(500); const far = P.down;
    return { ok: !first.down && first.hp === 1 && second && far, first, second, far }; })()`,
};

(async () => {
  const srv = await serve(); const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 240 s'); process.exit(2); }, 240000);
  try {
    for (const q of ['', '&passives=0']) {
      const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
      const page = await ctx.newPage(); const logs = [];
      page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
      page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
      await page.goto(srv.base + '/games/repo3d/index.html?house=1&seed=7&foes=none&traps=0&bots=tam:loot' + q);
      await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
      const fatal = await page.evaluate('window.__fatal || null'); if (fatal) throw new Error('fatal: ' + fatal);
      await page.evaluate(HELP);
      if (q) {   // flag off: Atlas carries like anyone else
        const r = await page.evaluate(PRE(`(() => { T.fresh('tam'); return { on: Pa.on, m: Pa.weightMul(0.4, P) }; })()`));
        check(r.on === false && r.m === 0.4, 'passives=0 turns every passive off', r);
      } else {
        for (const [name, code] of Object.entries(CASES)) {
          let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
          check(!!r.ok, name, r);
        }
      }
      const err = await page.evaluate('__errors.slice()');
      check(!err.length && !logs.length, `page${q}: no console or page errors`, err.concat(logs));
      await ctx.close();
    }
  } catch (e) { check(false, 'harness', e.stack || e.message); }
  finally {
    clearTimeout(kill); await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
