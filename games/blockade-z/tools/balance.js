// Hero balance census: for every hero a bot fights the same stream of wave-6 zombies for a fixed time, first with
// the weapon only, then using its skills and ultimate whenever ready. It records damage per second, kills, damage
// taken and health regained, and prints one table so heroes can be compared on the same numbers.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [HEROES=gio,thep] [SECS=25] node games/blockade-z/tools/balance.js [outDir]
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.balance-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const SECS = +(process.env.SECS || 25);
const CROWD = +(process.env.CROWD || 9);

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  const rows = [];
  try {
    const ctx = await br.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'bal@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?lang=vi&autostart=1&nolock=1&seed=9&noaudio=1&q=low&weather=clear&tod=0.45');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const heroes = process.env.HEROES ? process.env.HEROES.split(',') : await page.evaluate('BZ.HEROES.map((h) => h.id)');
    for (const id of heroes) {
      for (const skills of [false, true]) {
        const r = await page.evaluate(`(() => { const G = __G; const P = G.player;
          __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${id}')); __select.go(); __sim(0.3);
          G.state = 'playing'; G.god = false; G.zombies.clear(); G.allies.clear(); G.wave.toSpawn = 0; G.wave.total = 9999; G.wave.bossAt = -1; G.wave.n = 6;
          P.pos.set(0, 0, 6); P.vel.set(0, 0, 0); P.hp = P.maxHp; G.hero.ult = 0;
          let dmg = 0; let taken = 0; let healed = 0; let kills = 0; let casts = 0;
          const last = new Map(); const onHurt = (e) => { taken += e.dmg || 0; }; const onKill = () => { kills++; };
          G.events.on('player:hurt', onHurt); G.events.on('zombie:killed', onKill);
          const W = BZ.WEAPONS[G.weapons.cur()]; const melee = !!W.melee; const gates = G.world.spawns;
          let spawnT = 0; const dt = 1 / 30; let hp0 = P.hp;
          for (let t = 0; t < ${SECS}; t += dt) {
            spawnT -= dt; const alive = G.zombies.list.filter((z) => z.alive);
            if (spawnT <= 0 && alive.length < ${CROWD}) { spawnT = 0.7 * 9 / ${CROWD}; const g = gates[Math.floor(t * 7) % 2]; const type = ['walker', 'walker', 'runner', 'walker', 'brute'][Math.floor(t * 3) % 5]; const z = G.zombies.spawn(type, 6, g); if (z) z.pos.set(G.rng.range(-6, 6), 0, -12 + G.rng.range(-2, 2)); }
            let tgt = null; let bd = 1e9; for (const z of alive) { const d = Math.hypot(z.pos.x - P.pos.x, z.pos.z - P.pos.z); if (d < bd) { bd = d; tgt = z; } }
            if (tgt) { const dx = tgt.pos.x - P.pos.x; const dz = tgt.pos.z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(tgt.pos.y + 1.1 * tgt.T.scale - (P.pos.y + 1.6), Math.hypot(dx, dz)); }
            P.touch.y = melee && tgt && bd > 2.2 ? -1 : 0; P.input.fire = !!tgt && (melee ? bd < 3.5 : bd < 40) && (W.auto || melee || Math.floor(t / dt) % 4 < 2);
            if (${skills} && tgt) { for (const s of ['s1', 's2']) { const S = G.hero.slots[s]; if (S && S.n > 0 && G.hero.use(s)) casts++; } if (G.hero.ult >= 1 && G.hero.use('ult')) casts++; }
            for (const z of G.zombies.list) if (z.alive && !last.has(z)) last.set(z, z.hp);
            const before = P.hp; __sim(dt); if (P.hp > before) healed += P.hp - before;
            // damage from every source: what the zombies lost this frame (a kill counts up to the health it had)
            for (const [z, h] of last) { const now = z.alive ? z.hp : 0; if (now < h) dmg += h - Math.max(0, now); if (z.alive) last.set(z, z.hp); else last.delete(z); }
            if (P.hp < 30) { healed -= 0; P.hp = P.maxHp; hp0 += P.maxHp; }
            if (G.state === 'dead') { G.state = 'playing'; P.alive = true; P.hp = P.maxHp; }
            if (G.state === 'pick') G.pickChoose(G.pickOpts[0]);
          }
          P.input.fire = false; P.touch.y = 0;
          G.events.off && (G.events.off('player:hurt', onHurt), G.events.off('zombie:killed', onKill));
          return { id: '${id}', weapon: G.weapons.cur(), skills: ${skills}, dps: Math.round(dmg / ${SECS}), kills, taken: Math.round(taken), healed: Math.round(healed), casts }; })()`);
        rows.push(r); console.log(JSON.stringify(r));
      }
    }
    const tab = heroes.map((id) => { const a = rows.find((r) => r.id === id && !r.skills); const b = rows.find((r) => r.id === id && r.skills); return { id, weapon: a.weapon, gunDps: a.dps, kitDps: b.dps, skillShare: b.dps ? Math.round(100 * (b.dps - a.dps) / b.dps) : 0, kills: b.kills, taken: b.taken, healed: b.healed, casts: b.casts }; });
    console.log('\nhero   weapon      gunDPS kitDPS skill% kills taken healed casts');
    for (const t of tab) console.log(`${t.id.padEnd(6)} ${t.weapon.padEnd(11)} ${String(t.gunDps).padStart(6)} ${String(t.kitDps).padStart(6)} ${String(t.skillShare).padStart(6)} ${String(t.kills).padStart(5)} ${String(t.taken).padStart(5)} ${String(t.healed).padStart(6)} ${String(t.casts).padStart(5)}`);
    fs.writeFileSync(path.join(OUT, 'balance.json'), JSON.stringify({ secs: SECS, rows, tab }, null, 1));
    if (errs.length) console.log('page errors: ' + errs.slice(0, 3).join(' | '));
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(2); });
