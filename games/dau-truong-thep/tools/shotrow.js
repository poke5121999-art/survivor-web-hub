// Every projectile look side by side, both team colours, frozen mid-flight: .chk/<dir>/shots-<theme>-<q>.png
//   node tools/shotrow.js [dir=after] [q=high] [themes=jungle,desert,ice,lava,swamp]
'use strict';
const { session, open, CHK, fs, path } = require('./lib.js');
const [dir = 'after', q = 'high', themes = 'jungle,desert,ice,lava,swamp'] = process.argv.slice(2);
session(async (br, base) => {
  fs.mkdirSync(path.join(CHK, dir), { recursive: true });
  for (const th of themes.split(',')) {
    const g = await open(br, base, `manual&noaudio&autostart&spectate&seed=5&bots=easy&q=${q}&theme=${th}`);
    await g.page.addStyleTag({ content: 'body > *:not(#view) { visibility: hidden !important; }' });
    await g.page.evaluate(() => {
      window.__step(20, false);
      const m = window.__G.match, vis = ['bullet', 'shell', 'rail', 'pulse', 'rocket', 'pellet', 'frost', 'rivet', 'tower'];
      // Park the mechs far away so nothing collides with the row.
      for (const u of m.units) { u.x = u.px = (u.team ? 1 : -1) * (m.map.hw - 3); }
      const place = () => { m.shots.length = 0; vis.forEach((v, i) => { for (let t = 0; t < 2; t++) { const x = t * 6.5, z = -6 + i * 1.5; m.shots.push({ id: 900 + i * 2 + t, team: t, color: t, owner: -1, tower: 0, x, z, px: x - 0.4, pz: z, dx: 1, dz: 0, speed: 0.01, left: 99, dmg: 0, splash: 0, knock: 0, slow: 0, slowDur: 0, r: 0.2, vis: v, over: true }); } }); };
      place(); window.__setShot({ x: 2.2, z: 0.3, dist: 23, pitch: 57 });
      for (let i = 0; i < 3; i++) window.__step(0, true);
    });
    const file = path.join(CHK, dir, `shots-${th}-${q}.png`);
    await g.page.screenshot({ path: file });
    console.log(file, JSON.stringify(await g.page.evaluate(() => window.__errors.slice(0, 3))));
    await g.close();
  }
});
