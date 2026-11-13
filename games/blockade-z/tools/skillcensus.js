// Skill census: every hero's F, C and Q cast once, aimed at the middle of 12 wave-6 walkers coming from 9 m away in the open south of the monument;
// records the health the zombies lost in the next 6 seconds and the kills. Skills that do not deal damage
// (heals, shields, invisibility, revive, repair) are listed but marked as support.
// Usage: PLAYWRIGHT_PATH=<playwright-core> [HEROES=hoa,mua] node games/blockade-z/tools/skillcensus.js [outDir]
'use strict';
const path = require('path');
const fs = require('fs');
const { serve } = require('../../../tools/thumb-lib.js');
const OUT = process.argv[2] || path.join(__dirname, '..', '..', '..', '.skills-blockade-z'); fs.mkdirSync(OUT, { recursive: true });
const SUPPORT = ['heal', 'invuln', 'vanish', 'revive', 'repair', 'blink'];

(async () => {
  const srv = await serve();
  const br = await require(process.env.PLAYWRIGHT_PATH || 'playwright-core').chromium.launch({ channel: 'chrome', headless: true });
  const rows = [];
  try {
    const ctx = await br.newContext({ viewport: { width: 640, height: 360 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hub.session.v1', JSON.stringify({ kind: 'member', role: 'member', email: 'sk@test' })); } catch (e) {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto((process.env.BZ_BASE || srv.base) + '/games/blockade-z/index.html?autostart=1&nolock=1&seed=13&noaudio=1&q=low&weather=clear&tod=0.45');
    await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
    const heroes = process.env.HEROES ? process.env.HEROES.split(',') : await page.evaluate('BZ.HEROES.map((h) => h.id)');
    for (const id of heroes) for (const slot of ['s1', 's2', 'ult']) {
      const r = await page.evaluate(`(() => { const G = __G; const P = G.player;
        __select.open(); __select.pick(BZ.HEROES.findIndex((h) => h.id === '${id}')); __select.go(); __sim(0.2);
        G.state = 'playing'; G.god = true; G.zombies.clear(); G.allies.clear(); G.gear.turrets && G.gear.turrets.splice(0).forEach((t) => t.g && G.scene.remove(t.g)); G.wave.toSpawn = 0; G.wave.total = 9999; G.wave.bossAt = -1; G.wave.n = 6;
        P.pos.set(0, 0, 15); P.vel.set(0, 0, 0); P.input.fire = false; P.touch.y = 0;
        const zs = []; for (let i = 0; i < 12; i++) { const z = G.zombies.spawn('walker', 6, { x: 0, z: 0, dir: [0, 1] }); z.pos.set(-1.6 + (i % 4) * 1.1, 0, 6.6 - Math.floor(i / 4) * 1.1); zs.push(z); }
        const tgt = { x: 0.6, y: 0, z: 5.5 }; const dx = tgt.x - P.pos.x; const dz = tgt.z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(0.9 - 1.6, Math.hypot(dx, dz)); __sim(1 / 60);
        const def = G.hero.def[ '${slot}' ]; const last = new Map(zs.map((z) => [z, z.hp])); let dmg = 0; let kills = 0;
        if ('${slot}' === 'ult') G.hero.ult = 1; else if (G.hero.slots['${slot}']) { G.hero.slots['${slot}'].n = Math.max(1, G.hero.slots['${slot}'].n); G.hero.slots['${slot}'].cd = 0; }
        const used = G.hero.use('${slot}');
        for (let t = 0; t < 6; t += 1 / 30) { __sim(1 / 30); P.hp = P.maxHp;
          for (const [z, h] of last) { const now = z.alive ? z.hp : 0; if (now < h) dmg += h - Math.max(0, now); if (!z.alive && h > 0) kills++; last.set(z, z.alive ? z.hp : 0); } }
        return { id: '${id}', slot: '${slot}', key: def.key, name: def.name, used, dmg: Math.round(dmg), kills, cd: def.cd || 0 }; })()`);
      r.support = SUPPORT.includes(r.key);
      r.perCd = r.cd ? Math.round(r.dmg / r.cd) : null;
      rows.push(r); console.log(JSON.stringify(r));
    }
    console.log('\nhero   slot key         dmg  kills  cd  dmg/cd  note');
    for (const r of rows.slice().sort((a, b) => (a.slot === 'ult') - (b.slot === 'ult') || a.dmg - b.dmg)) console.log(`${r.id.padEnd(6)} ${r.slot.padEnd(4)} ${r.key.padEnd(10)} ${String(r.dmg).padStart(5)} ${String(r.kills).padStart(6)} ${String(r.cd).padStart(3)} ${String(r.perCd ?? '-').padStart(7)}  ${r.support ? 'support' : ''}${r.used ? '' : ' NOT CAST'}`);
    fs.writeFileSync(path.join(OUT, 'skills.json'), JSON.stringify(rows, null, 1));
    if (errs.length) console.log('page errors: ' + errs.slice(0, 3).join(' | '));
  } finally { await br.close(); srv.close(); }
})().catch((e) => { console.error(e); process.exit(2); });
