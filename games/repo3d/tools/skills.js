// Skill + bot check: one deterministic scenario per active skill of the 14 crew (js/skills.js), then the bot mates
// (js/bots.js): loot bot delivers to the pad, scout opens rooms and marks foes, guard hits and draws aggro, a foe downs
// a bot, the loot bot carries the downed player's head to the pad, bots cast their skills by rule. Exit 1 on any failure.
// Usage: node tools/skills.js [--out <dir>] [--seed 7] [--only flash,cage,...]
'use strict';
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { launch: pwLaunch, scratch } = require('./pw.js');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const OUT = arg('out', scratch('skills'));
const SEED = Number(arg('seed', 7));
const ONLY = arg('only', null)?.split(',');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (ok, name, detail) => { results.push({ ok, name, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 360) : ''}`); };

const HELPERS = `(() => {
  const G = __G, nav = G.foes.nav, P = G.player, S = G.skills;
  const T = window.__T = {};
  T.lootNear = (x, z, r) => G.loot.items.filter((i) => !i.dead && Math.hypot(i.body.translation().x - x, i.body.translation().z - z) < r);
  T.pair = (d, o = {}) => {
    const sp = G.house.spawn;
    for (const i of nav.cells) {
      if (nav.near[i] < 3) continue;
      const a = nav.center(i);
      if (o.farFromSpawn && Math.hypot(a.x - sp.x, a.z - sp.z) < o.farFromSpawn) continue;
      for (let k = 0; k < 8; k++) {
        const an = k * Math.PI / 4, b = { x: a.x + Math.cos(an) * d, z: a.z + Math.sin(an) * d };
        const j = nav.nearest(b.x, b.z, 0); if (j < 0 || nav.near[j] < 2) continue;
        if (!nav.clear(a.x, a.z, b.x, b.z, 0.7) || !nav.los(a.x, a.z, b.x, b.z)) continue;
        if (o.noLoot && (T.lootNear(a.x, a.z, o.noLoot).length || T.lootNear(b.x, b.z, o.noLoot).length)) continue;
        return { a, b, dir: { x: Math.cos(an), z: Math.sin(an) } };
      }
    }
    return null;
  };
  T.put = (x, z, lookX, lookZ) => { P.body.setTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }, true); P.body.setNextKinematicTranslation({ x, y: (__G.house?.heightAt ? __G.house.heightAt(x, z) : 0) + 0.85, z }); P.yaw = Math.atan2(-(lookX - x), -(lookZ - z)); P.pitch = -0.05; __sim(0.05); };
  T.face = (f, x, z) => { f.yaw = Math.atan2(x - f.x, z - f.z); };
  T.clearFoes = () => { for (const f of [...G.foes.list]) G.foes.remove(f); };
  T.hunt = (kind, x, z) => { const f = G.foes.spawn(kind, x, z, { state: 'chase' }); const p = P.position; T.face(f, p.x, p.z); f.aware = 1; f.lastSeen = { x: p.x, z: p.z }; f.seen = true; return f; };
  T.fresh = (crew) => {
    if (P.down) G.runner.reviveNow(null, true);
    T.clearFoes(); S.clear(); S.cd.clear(); G.passives.on = false; P.crewId = crew; P.hp = 100; P.invisT = P.noDownT = P.gongT = 0;   // actives only: passives (Seraph's save, Oracle's reach) off
    for (const b of G.bots?.list || []) { if (b.down) G.bots.revive(b); b.hp = b.maxHp; b.invisT = b.noDownT = b.gongT = 0; }
  };
  T.d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  T.until = (sec, pred, cmd) => { const h = 1 / 60; for (let i = 0; i < sec * 60; i++) { __sim(h, cmd || __IDLE); if (pred()) return +((i + 1) * h).toFixed(2); } return -1; };
  return true;
})()`;

async function openPage(br, srv, query) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'x@test' })); } catch (e) { /* private */ } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(srv.base + '/games/repo3d/index.html?' + query);
  await page.waitForFunction('window.__ready === true || window.__fatal', null, { timeout: 60000 });
  const fatal = await page.evaluate('window.__fatal || null');
  if (fatal) throw new Error('fatal: ' + fatal);
  await page.evaluate('window.__paused = true; __sim(1.5)');
  await page.evaluate(HELPERS);
  return { ctx, page, logs };
}

// one scenario per skill; each returns { ok, ...detail } computed in the page
const PRE = (code) => code.replace('(() => {', '(() => { const G = __G, T = __T, P = G.player, S = G.skills, nav = G.foes.nav;');
const SKILL_CASES = {
  flash: `(() => { T.fresh('bao'); const pr = T.pair(3, { noLoot: 2, farFromSpawn: 8 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.hunt('gunner', pr.b.x, pr.b.z); __sim(0.1);
    const r = S.cast(P); const x0 = f.x, z0 = f.z, again = S.cast(P);
    __sim(2.5); const still = T.d(f, { x: x0, z: z0 }), hp = P.hp, forgot = f.aware < 1 && !f.lastSeen;
    __sim(1.0); const stunEnd = f.stunT;
    return { ok: r.ok && r.n === 1 && still < 0.05 && hp === 100 && forgot && stunEnd === 0 && again.why === 'cooldown', r, still, hp, forgot, again: again.why }; })()`,
  healring: `(() => { T.fresh('hue'); P.hp = 40; const r = S.cast(P); __sim(3); const h3 = P.hp; __sim(3.2); const h6 = P.hp, rings = S.rings.length; __sim(1); const h7 = P.hp;
    return { ok: r.ok && Math.abs(h3 - 67) < 2 && h6 >= 92 && h6 <= 95 && rings === 0 && h7 === h6, h3, h6, h7, rings }; })()`,
  gong: `(() => { T.fresh('tam'); const it = G.loot.items.filter((i) => !i.dead && i.size === 'big')[0] || G.loot.spawn({ material: 'wood', size: 'big', value: 5000, pos: { x: G.house.spawn.x, y: 0.6, z: G.house.spawn.z } });
    const t = it.body.translation(); T.put(t.x + 1.4, t.z, t.x, t.z); G.grab.attach(it, t, 1.4);
    const walk = (sec, sprint) => { const p0 = { ...P.position }; let n = 0; __sim(sec, () => ({ ...__IDLE, mz: 1, grab: true, sprint })); return T.d(P.position, p0) / sec; };
    __sim(0.3, { ...__IDLE, grab: true }); const loaded = walk(0.6, false), mul = P.speedMul;
    const r = S.cast(P); const free = walk(0.6, false); const held = G.grab.held === it; G.grab.release(false);
    T.put(G.house.spawn.x, G.house.spawn.z, G.house.spawn.x, G.house.spawn.z - 5); P.stamina = 100; S.cd.clear(); S.cast(P);
    const run = walk(0.5, true), base = 78 / 24 * 1.85;
    return { ok: r.ok && mul < 0.7 && free > loaded * 1.3 && run > base * 1.2, mul: +mul.toFixed(2), loaded: +loaded.toFixed(2), free: +free.toFixed(2), held, run: +run.toFixed(2), base: +base.toFixed(2) }; })()`,
  unlock: `(() => { T.fresh('ky'); const recs = G.house.doorRecs.filter((d) => d.jammed); if (!recs.length) return { ok: false, why: 'no jammed door in this house' };
    const d = recs[0], i = nav.nearest(d.cx + 1.6, d.cz, 3) >= 0 ? nav.nearest(d.cx + 1.6, d.cz, 3) : nav.nearest(d.cx, d.cz + 1.6, 3), c = nav.center(i);
    T.put(c.x, c.z, d.cx, d.cz); P.hp = 50;
    const far = G.house.doorRecs.filter((o) => o.jammed && Math.hypot(o.cx - c.x, o.cz - c.z) > 9.5).length;
    const bars0 = !!d.bars && !!d.bars.parent; const tile = (d.door.y0 + (d.door.zh >> 1)) * nav.W + d.door.x0 + (d.door.zw >> 1), w0 = nav.walk[tile];
    const r = S.cast(P); __sim(0.2);
    const farAfter = G.house.doorRecs.filter((o) => o.jammed && Math.hypot(o.cx - c.x, o.cz - c.z) > 9.5).length;
    const bars = !!d.bars;
    return { ok: r.ok && r.doors >= 1 && !d.jammed && w0 === 0 && nav.walk[tile] === 1 && P.hp === 65 && farAfter === far && bars0 && !bars, doors: r.doors, w0, w1: nav.walk[tile], hp: P.hp, far, farAfter, bars0, bars }; })()`,
  'crew hp': `(() => { return { ok: G.run.hpMax === 105 && G.run.lead === 'bao', hpMax: G.run.hpMax, lead: G.run.lead }; })()`,
  vanish: `(() => { T.fresh('linh'); const pr = T.pair(4, { noLoot: 2, farFromSpawn: 8 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.hunt('mummy', pr.b.x, pr.b.z); __sim(0.3); const seen0 = G.foes.canSee(f);
    const r = S.cast(P); const ev0 = G.noise.events.length;
    __sim(3, () => ({ ...__IDLE, mx: 1 })); const seen = G.foes.canSee(f), hp = P.hp, ev = G.noise.events.filter((e) => e.src === 'walk').length;
    __sim(3.2); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); f.x = pr.b.x; f.z = pr.b.z; T.face(f, pr.a.x, pr.a.z); const back = G.foes.canSee(f);   // the trick is over: seen again
    return { ok: r.ok && seen0 && !seen && hp === 100 && ev === 0 && back, seen0, seen, hp, ev, back }; })()`,
  shock: `(() => { T.fresh('dung'); const pr = T.pair(2.5, { noLoot: 2, farFromSpawn: 8 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.hunt('mummy', pr.b.x, pr.b.z); const g = G.foes.spawn('rook', pr.a.x - pr.dir.x * 6, pr.a.z - pr.dir.z * 6, { sleep: 30 }); const hp0 = f.hp, hg = g.hp;
    const r = S.cast(P); const st = f.stunT; __sim(1.0); const x1 = f.x;
    return { ok: r.ok && hp0 - f.hp === 40 && st === 1.5 && g.hp === hg && P.hp === 100, dmg: hp0 - f.hp, st, far: hg - g.hp, hp: P.hp }; })()`,
  decoy: `(() => { T.fresh('mai'); const pr = T.pair(6, { noLoot: 2, farFromSpawn: 8 }); T.put(pr.a.x, pr.a.z, pr.a.x - pr.dir.x, pr.a.z - pr.dir.z);
    const f = T.hunt('gunner', pr.b.x, pr.b.z); const far = G.foes.spawn('rook', pr.a.x, pr.a.z, { sleep: 99 }); far.x += 0;
    const farFoe = G.foes.list.find((o) => o !== f && o !== far);
    const r = S.cast(P); const q = r.at, d0 = T.d(f, q);
    __sim(4); const d4 = T.d(f, q), hp = P.hp, lured = f.lureT > 0;
    __sim(5.6); const off = !(f.lureT > 0);
    return { ok: r.ok && r.n >= 1 && d4 < d0 - 2 && hp === 100 && lured && off, n: r.n, d0: +d0.toFixed(2), d4: +d4.toFixed(2), hp, off }; })()`,
  rescue: `(() => { T.fresh('phuc'); const b = G.bots.list[0]; const pr = T.pair(6, { noLoot: 1, farFromSpawn: 4 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    G.bots.teleport(b, pr.b.x, pr.b.z); G.bots.hurt(b, 999); const down = b.down;
    const r = S.cast(P); const near = T.d(b, P.position);
    // the other way round: a Hook bot stands the downed player up
    S.cd.clear(); b.crew = 'phuc'; P.hurt(999); const pd = P.down; const r2 = S.cast(b);
    const ok2 = r2.ok && !P.down && P.hp > 1; b.crew = 'tam';
    const none = (S.cd.clear(), S.cast(P));
    return { ok: down && r.ok && !b.down && near < 1.5 && pd && ok2 && !none.ok && S.ready(P), down, r: r.ok, near: +near.toFixed(2), pd, ok2, none: none.why }; })()`,
  cage: `(() => { T.fresh('son'); const pr = T.pair(5, { noLoot: 2, farFromSpawn: 8 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.hunt('gunner', pr.b.x, pr.b.z); f.speed *= 1;
    const r = S.cast(P); const c = S.cages[0]; let minD = 99;
    for (let i = 0; i < 6 * 60; i++) { __sim(1 / 60); minD = Math.min(minD, T.d(f, c)); }
    const hp = P.hp; __sim(3.5); const gone = S.cages.length === 0;
    return { ok: r.ok && minD >= c.r - 0.1 && hp === 100 && gone, minD: +minD.toFixed(2), r: c.r, hp, gone }; })()`,
  blink: `(() => { T.fresh('nga');
    let spot = null;
    for (const i of nav.cells) { if (spot) break; const a = nav.center(i); if (nav.near[i] < 2) continue;
      for (let k = 0; k < 4 && !spot; k++) { const an = k * Math.PI / 2, dx = Math.cos(an), dz = Math.sin(an);
        for (let s = 6.25; s >= 4; s -= 0.25) { const x = a.x + dx * s, z = a.z + dz * s; if (nav.okW(x, z) && nav.near[nav.nearest(x, z, 0)] >= 2 && !nav.los(a.x, a.z, x, z)) { spot = { a, dir: { x: dx, z: dz } }; break; } } } }
    if (!spot) return { ok: false, why: 'no wall to blink through' };
    T.put(spot.a.x, spot.a.z, spot.a.x + spot.dir.x, spot.a.z + spot.dir.z); const p0 = { ...P.position };
    const r = S.cast(P); __sim(0.1); const p1 = P.position, moved = T.d(p0, p1), wall = !nav.los(p0.x, p0.z, p1.x, p1.z), decoy = S.decoys.length;
    return { ok: r.ok && moved >= 3.5 && moved <= 6.6 && wall && decoy === 1 && nav.okW(p1.x, p1.z), moved: +moved.toFixed(2), wall, decoy }; })()`,
  reveal: `(() => { T.fresh('khoi'); const d0 = G.torch.distance; const r = S.cast(P); __sim(0.1); const d1 = G.torch.distance, on = S.revealT > 11;
    const f = G.foes.spawn('rook', G.house.spawn.x + 30, G.house.spawn.z, { sleep: 99 });
    __sim(12.1); const d2 = G.torch.distance;
    return { ok: r.ok && Math.abs(d1 / d0 - 1.5) < 0.01 && on && d2 === d0, d0, d1, d2, on }; })()`,
  freeze: `(() => { T.fresh('van'); const pr = T.pair(4, { noLoot: 2, farFromSpawn: 8 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const f = T.hunt('mummy', pr.b.x, pr.b.z); const g = G.foes.spawn('rook', pr.a.x - pr.dir.x * 12, pr.a.z - pr.dir.z * 12, { sleep: 99 }); const gx = T.d(g, P.position);
    const r = S.cast(P); const x0 = f.x; const hp0 = f.hp; G.foes.hurtFoe(f, 10); const dmg = hp0 - f.hp;
    __sim(4.0); const still = Math.abs(f.x - x0) < 0.05, hp = P.hp; __sim(0.7); const thaw = f.stunT === 0 && !(f.vulnT > 0);
    return { ok: r.ok && r.n === 1 && Math.abs(dmg - 15) < 0.01 && still && hp === 100 && thaw && !(g.stunT > 0), n: r.n, dmg, still, hp, thaw, farD: +gx.toFixed(1) }; })()`,
  pull: `(() => { T.fresh('hai'); const pr = T.pair(6.5, { noLoot: 7.5, farFromSpawn: 6 }); if (!pr) return { ok: false, why: 'no open floor' };
    T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
    const empty = S.cast(P), cdFree = S.ready(P);
    const mk = (k, v) => G.loot.spawn({ material: 'wood', size: 'small', value: v, pos: { x: pr.a.x + pr.dir.x * k, y: 0.4, z: pr.a.z + pr.dir.z * k } });
    const a = mk(2, 500), b = mk(3.5, 700), c = mk(6.5, 900); __sim(1);
    const r = S.cast(P);
    return { ok: !empty.ok && cdFree && r.ok && r.n === 2 && r.value === 1200 && a.dead && b.dead && !c.dead && T.d(r.bag.body.translation(), P.position) < 1.5, empty: empty.why, n: r.n, value: r.value }; })()`,
  angel: `(() => { T.fresh('tuyet'); const b = G.bots.list[0]; G.bots.hurt(b, 999); const down = b.down;
    const r = S.cast(P); const up = !b.down; P.hurt(500); const alive = !P.down && P.hp === 1, bh = (G.bots.hurt(b, 999), !b.down && b.hp === 1);
    __sim(5.1); P.hurt(500); const later = P.down;
    return { ok: down && r.ok && r.revived === 1 && up && alive && bh && later, revived: r.revived, up, alive, bh, later }; })()`,
};

const BOT_CASES = {
  'scout opens unseen rooms and marks the foes it sees': `(() => { const s0 = G.run.seen.size, L = G.house.layout, sc = G.bots.list.find((o) => o.role === 'soi');
    const t = T.until(45, () => G.run.seen.size >= Math.min(L.rooms.length, s0 + 2));
    let spot = null; for (let k = 0; k < 8 && !spot; k++) { const an = k * Math.PI / 4, x = sc.x + Math.cos(an) * 6, z = sc.z + Math.sin(an) * 6; if (nav.okW(x, z) && nav.los(sc.x, sc.z, x, z)) spot = { x, z }; }
    const f = spot && G.foes.spawn('rook', spot.x, spot.z, { sleep: 999 }); const tm = f ? T.until(1.5, () => f.markT > 0) : -1; if (f) G.foes.remove(f);
    return { ok: t > 0 && tm > 0, t, seen0: s0, seen: G.run.seen.size, rooms: L.rooms.length, tm, marks: G.bots.log.filter((l) => l[0] === 'mark').length }; })()`,
  'loot bot delivers loose loot to the active pad': `(() => { const b = G.bots.list.find((o) => o.role === 'loot'); const pad = G.extract.pads[G.extract.active];
    const t = T.until(60, () => b.delivered > 0); __sim(0.8); const v = pad.value;
    return { ok: t > 0 && v > 0, t, delivered: b.delivered, padValue: v, log: G.bots.log.filter((l) => l[0] !== 'hurt').slice(0, 6) }; })()`,
  'guard hits a foe that comes for the player and draws it onto itself': `(() => { T.clearFoes(); const g = G.bots.list.find((o) => o.role === 'thu'); const pr = T.pair(4, { noLoot: 2, farFromSpawn: 6 });
    T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); G.bots.teleport(g, pr.a.x - pr.dir.x, pr.a.z - pr.dir.z); S.cd.set(g, 99);
    const f = T.hunt('mummy', pr.b.x, pr.b.z); const hp0 = f.hp;
    const t = T.until(10, () => f.prey === g && g.hits >= 2);
    return { ok: t > 0 && f.hp < hp0, t, hits: g.hits, foeHp: [hp0, f.hp], prey: f.prey?.crew }; })()`,
  'a foe that hunts a bot hurts it and downs it': `(() => { const g = G.bots.list.find((o) => o.role === 'thu'); T.clearFoes(); g.hp = 20; S.cd.set(g, 99);
    const f = G.foes.spawn('gunner', g.x + 0.9, g.z, { state: 'patrol' }); G.foes.provoke(f, g, 30); G.bots.paused = true;
    const t = T.until(8, () => g.down); G.bots.paused = false; const hb = G.foes.log.filter((l) => l[0] === 'hitBot').length;
    T.clearFoes(); G.bots.revive(g); g.hp = g.maxHp;
    return { ok: t > 0 && hb >= 1, t, hitBot: hb }; })()`,
  'loot bot carries the downed player head to the pad and the player stands up': `(() => { T.clearFoes(); const sp = G.house.spawn;
    T.put(sp.x + 1, sp.z + 1, sp.x, sp.z - 3); P.hurt(999); const down = P.down;
    const t = T.until(60, () => !P.down); const log = G.bots.log.filter((l) => l[0] === 'take' || l[0] === 'deliver').slice(-4);
    return { ok: down && t > 0, t, log }; })()`,
  'bots cast their skills by rule (Quake shock on a foe at the guard)': `(() => { T.clearFoes(); const g = G.bots.list.find((o) => o.crew === 'dung'); S.cd.delete(g);
    const f = G.foes.spawn('mummy', g.x + 1.5, g.z, { state: 'patrol' }); G.foes.provoke(f, g, 10); const hp0 = f.hp;
    const t = T.until(3, () => S.log.some((l) => l[1] === 'dung' && l[3] === 'bot')); T.clearFoes();
    const reveal = S.log.some((l) => l[1] === 'khoi' && l[3] === 'bot');
    return { ok: t > 0 && reveal, t, reveal, foeHp: [hp0, f.hp] }; })()`,
};

// the six other roles: two pages, each bot frozen (b.hold) unless its case runs
const ROLE_PAGES = [
  { q: 'bots=dung:baoke,hue:cuuho,mai:nhu', cases: {
    'vanguard walks ahead of the player and hits the foe it meets first': `(() => { const bk = G.bots.list.find((o) => o.role === 'baoke'); G.bots.list.forEach((o) => { o.hold = o !== bk; });
      const pr = T.pair(9, { noLoot: 1, farFromSpawn: 6 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); G.bots.teleport(bk, pr.a.x - pr.dir.x, pr.a.z - pr.dir.z);
      __sim(6); const ax = bk.x - pr.a.x, az = bk.z - pr.a.z, ahead = ax * pr.dir.x + az * pr.dir.z;
      const f = G.foes.spawn('mummy', pr.a.x + pr.dir.x * 6, pr.a.z + pr.dir.z * 6, { state: 'patrol' }); f.speed = 0;
      const t = T.until(8, () => bk.hits >= 1); T.clearFoes();
      return { ok: ahead >= 2 && ahead <= 5 && t > 0, ahead: +ahead.toFixed(2), t, hits: bk.hits }; })()`,
    'medic patches a hurt player 3 hp/s and stands a downed bot up after 4 s': `(() => { const md = G.bots.list.find((o) => o.role === 'cuuho'), bk = G.bots.list.find((o) => o.role === 'baoke');
      G.bots.list.forEach((o) => { o.hold = o !== md; }); const pr = T.pair(6, { noLoot: 1, farFromSpawn: 6 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z);
      G.bots.teleport(md, pr.b.x, pr.b.z); P.hp = 40; __sim(5); const hp = P.hp;
      P.hp = 100; G.bots.teleport(bk, pr.a.x + pr.dir.x * 2, pr.a.z + pr.dir.z * 2); G.bots.hurt(bk, 9999); const down = bk.down;
      const t = T.until(15, () => !bk.down);
      return { ok: md.healed >= 6 && hp >= 46 && down && t > 4, patched: +md.healed.toFixed(1), hp: +hp.toFixed(1), down, t }; })()`,   // Halo's own skill heals too: patched counts the role's share
    'decoy draws a foe hunting the player onto itself': `(() => { const dc = G.bots.list.find((o) => o.role === 'nhu'); G.bots.list.forEach((o) => { o.hold = o !== dc; });
      const pr = T.pair(9, { noLoot: 1, farFromSpawn: 6 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); G.bots.teleport(dc, pr.a.x + pr.dir.x * 1.5, pr.a.z + pr.dir.z * 1.5); P.hp = 100;
      const f = T.hunt('mummy', pr.b.x, pr.b.z); const t = T.until(8, () => f.prey === dc); __sim(3); const keep = Math.hypot(f.x - dc.x, f.z - dc.z), hp = P.hp; T.clearFoes();
      return { ok: t > 0 && hp >= 80, t, hp, keep: +keep.toFixed(2), lures: G.bots.log.filter((l) => l[0] === 'lure').length }; })()`,
  } },
  { q: 'bots=tam:loot,son:hotong,nga:san,ky:tiepte', cases: {
    'escort hits a foe that comes for the loot bot carrying': `(() => { const lb = G.bots.list.find((o) => o.role === 'loot'), es = G.bots.list.find((o) => o.role === 'hotong');
      G.bots.list.forEach((o) => { o.hold = o !== es; }); const pr = T.pair(6, { noLoot: 1, farFromSpawn: 6 }); T.put(pr.b.x, pr.b.z, pr.a.x, pr.a.z);
      G.bots.teleport(lb, pr.a.x, pr.a.z); const it = G.loot.spawn({ material: 'wood', size: 'small', value: 600, pos: { x: lb.x, y: 0.5, z: lb.z } }); __sim(0.2); G.bots.take(lb, it); G.bots.hold(lb);
      G.bots.teleport(es, pr.a.x + 1, pr.a.z); __sim(1); const near = Math.hypot(es.x - lb.x, es.z - lb.z);
      const f = G.foes.spawn('mummy', pr.a.x + pr.dir.x * 3.5, pr.a.z + pr.dir.z * 3.5, { state: 'patrol' }); G.foes.provoke(f, lb, 30);
      const t = T.until(8, () => es.hits >= 1); T.clearFoes(); G.bots.drop(lb);
      return { ok: near <= 2.6 && t > 0, near: +near.toFixed(2), t, ward: es.ward && es.ward.crew }; })()`,
    'hunter goes after an awake foe 12 m away and hits 22 % harder': `(() => { const hn = G.bots.list.find((o) => o.role === 'san'); G.bots.list.forEach((o) => { o.hold = o !== hn; });
      const pr = T.pair(12, { noLoot: 1, farFromSpawn: 6 }); T.put(pr.a.x - pr.dir.x, pr.a.z - pr.dir.z, pr.a.x, pr.a.z); G.bots.teleport(hn, pr.a.x, pr.a.z);
      const f = G.foes.spawn('mummy', pr.b.x, pr.b.z, { state: 'patrol' }); f.speed = 0; const hp0 = f.hp;
      const t = T.until(12, () => hn.hits >= 1); const dmg = hp0 - f.hp; T.clearFoes();
      return { ok: t > 0 && Math.abs(dmg - 18 * 1.22) < 0.01, t, dmg: +dmg.toFixed(2) }; })()`,
    'support hands a 25 hp kit to an ally under 40 % (30 s apart) and casts 15 % more often': `(() => { const sp = G.bots.list.find((o) => o.role === 'tiepte'); G.bots.list.forEach((o) => { o.hold = o !== sp; });
      const pr = T.pair(4, { noLoot: 1, farFromSpawn: 6 }); T.put(pr.a.x, pr.a.z, pr.b.x, pr.b.z); G.bots.teleport(sp, pr.a.x + pr.dir.x * 1.2, pr.a.z + pr.dir.z * 1.2);
      const kits = () => G.bots.log.filter((l) => l[0] === 'kit').length; P.hp = 30; __sim(1); const one = P.hp, k1 = kits(); P.hp = 30; __sim(5); const k2 = kits();
      S.cd.delete(sp); S.cast(sp, { force: true }); const cd = S.cdLeft(sp);
      return { ok: one >= 55 && k1 === 1 && k2 === 1 && Math.abs(cd - 22 * 0.85) < 0.01, one, k1, k2, cd }; })()`,   // Pick's own skill may add 15 hp: the kit count is the role's share
  } },
];

(async () => {
  const srv = await serve();
  const br = await pwLaunch();
  const kill = setTimeout(() => { console.log('FAIL timeout 300 s'); process.exit(2); }, 300000);
  try {
    // ---------------------------------------------------------------- skills, player as caster; one paused bot as the ally
    for (const house of [1, 3]) {
      const cases = Object.entries(SKILL_CASES).filter(([k]) => (house === 3) === (k === 'unlock') && (!ONLY || ONLY.includes(k)));
      if (!cases.length) continue;
      const { ctx, page, logs } = await openPage(br, srv, `house=${house}&seed=${SEED}&foes=none&bots=tam:loot`);
      await page.evaluate('__G.bots.paused = true');
      for (const [k, code] of cases) {
        let r;
        try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
        check(!!r.ok, `skill ${k}`, r);
      }
      await page.screenshot({ path: path.join(OUT, `skills-house${house}.png`) });
      const err = await page.evaluate('__errors.slice()');
      check(err.length === 0 && logs.length === 0, `skills house ${house}: no console or page errors`, err.concat(logs));
      await ctx.close();
    }
    // ---------------------------------------------------------------- the six other roles
    if (!ONLY || ONLY.includes('roles')) for (const pg of ROLE_PAGES) {
      const { ctx, page, logs } = await openPage(br, srv, `house=1&seed=${SEED}&foes=none&${pg.q}`);
      for (const [name, code] of Object.entries(pg.cases)) {
        let r; try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
        check(!!r.ok, 'role: ' + name, r);
      }
      const err = await page.evaluate('__errors.slice()');
      check(err.length === 0 && logs.length === 0, `roles (${pg.q}): no console or page errors`, err.concat(logs));
      await ctx.close();
    }
    // ---------------------------------------------------------------- bot mates
    if (!ONLY || ONLY.includes('bots')) {
      const { ctx, page, logs } = await openPage(br, srv, `house=1&seed=${SEED}&foes=none&bots=tam:loot,dung:thu,khoi:soi`);
      for (const [name, code] of Object.entries(BOT_CASES)) {
        let r;
        try { r = await page.evaluate(PRE(code)); } catch (e) { r = { ok: false, err: e.message.slice(0, 300) }; }
        check(!!r.ok, 'bot: ' + name, r);
        if (name.startsWith('loot bot delivers')) await page.screenshot({ path: path.join(OUT, 'bots-deliver.png') });
      }
      const err = await page.evaluate('__errors.slice()');
      check(err.length === 0 && logs.length === 0, 'bots: no console or page errors', err.concat(logs));
      await ctx.close();
    }
  } catch (e) {
    check(false, 'harness', e.stack || e.message);
  } finally {
    clearTimeout(kill);
    await br.close(); srv.close();
    const bad = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
    console.log(bad.length ? `${bad.length} FAILED` : `ALL PASS (${results.length})`);
    process.exit(bad.length ? 1 : 0);
  }
})();
