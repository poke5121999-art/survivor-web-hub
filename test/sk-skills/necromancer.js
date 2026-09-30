// Ca kiểm Pháp Sư Tử Linh (c14): ô 2 souls_resurrect.
module.exports = h => ({
  async 'necromancer/2'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'necromancer', 'souls_resurrect');
    await standNear(p, 50);
    // Chưa có xác: kỹ năng hỏng, không tính hồi chiêu.
    await pressK(p); await sleep(200);
    const f = await snap(p);
    check('necromancer souls_resurrect: không có xác thì hỏng và KHÔNG tính hồi chiêu [WIKI]', f.skillCd < 0.2 && f.allies.length === 0, 'skillCd ' + f.skillCd.toFixed(2));
    // Hạ một quái, đợi xác nằm đủ lâu, hồi sinh.
    const before = await p.evaluate(() => {
      const G = SK.G, pl = G.player, es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn');
      const v = es.filter(e => !e.bossKey && !/Static|Summon/.test(e.cls)).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
      const info = { id: v.id, hpMax: v.hpMax, n: G.enemies.length };
      SK.hurtEnemy(G, v, 9999, false, 0, 0);
      window._corpse = v;
      return info;
    });
    await sleep(1800);
    await p.evaluate(() => { for (const q of SK.G.enemies) if (q.st !== 'dead') { q.cd = 99; q.st = 'idle'; q.stT = 99; } });
    await resetDmg(p, h);
    await pressK(p); await sleep(300);
    const s = await p.evaluate(() => {
      const G = SK.G, a = (G._allies || []).find(x => x.revived);
      return a ? { hp: a.hp, hpMax: a.hpMax, id: a.e.id, inList: G.enemies.indexOf(a.e) >= 0, cd: SK.G.player.skillCd, fx: (G.vfx || []).map(v => v.name).filter(n => /reborn/.test(n)) } : null;
    });
    await seq(p, 'necromancer_2', 6, 120);
    check('necromancer souls_resurrect: hồi sinh ' + before.id + ' với máu gốc ' + before.hpMax + ', rời phe địch, dấu reborn_mark, hồi chiêu ' + r.cd + ' s [ĐO]',
      s && s.id === before.id && s.hpMax === before.hpMax && !s.inList && s.fx.indexOf('reborn_mark') >= 0 && near(s.cd, r.cd, 0.6), JSON.stringify(s));
    await sleep(3500);
    const a = await snap(p);
    const alive = await p.evaluate(() => { const a = (SK.G._allies || []).find(x => x.revived); return !!a && !a.gone; });
    check('necromancer souls_resurrect: quái hồi sinh tự đánh quái địch (thẻ minion)', hitsOf(a, 'minion').length > 0 || a.dmg > 0, 'đòn ' + hitsOf(a).slice(0, 6).join(',') + ' · sống ' + alive);
  }
});
async function resetDmg(p) { await p.evaluate(() => { window._skDmg = 0; window._skHits = []; }); }
