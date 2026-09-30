// Ca kiểm Pháp Sư Tử Linh (c14): ô 2 souls_resurrect.
module.exports = h => ({
  async 'necromancer/2'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'necromancer', 'souls_resurrect');
    await standNear(p, 50);
    // Chưa có xác: kỹ năng hỏng, không tính hồi chiêu.
    await pressK(p); await sleep(200);
    const f = await snap(p);
    const RB = await p.evaluate(() => { const B = SK.SKILLS.souls_resurrect.RB, U = SK.PPU; return [B.reach / U, B.rot, B.delay, B.atkRate, B.follow / U, B.max]; });
    check('necromancer souls_resurrect: không có xác thì hỏng và KHÔNG tính hồi chiêu [ĐO RoleSkill2 thoát trước ReSetSkillReload]', f.skillCd < 0.2 && f.allies.length === 0, 'skillCd ' + f.skillCd.toFixed(2));
    check('necromancer souls_resurrect: xác trong 4 ô, nằm ≥ 1 s, dậy sau 0,68 s, nhịp đánh shoot_cd × 0,75, đứng cách 4 ô, giữ 1 quái [ĐO FindDeads(4), EndJustDead, RebornEnemy, DeadBodyController.Setup, get_maxMinionCount]', JSON.stringify(RB) === JSON.stringify([4, 1, 0.68, 0.75, 4, 1]), JSON.stringify(RB));
    // Hạ một quái, đợi xác nằm đủ lâu, hồi sinh.
    const before = await p.evaluate(() => {
      const G = SK.G, pl = G.player, es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn');
      const v = es.filter(e => !e.bossKey && !/Static|Summon/.test(e.cls)).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
      const info = { id: v.id, hpMax: v.hpMax, n: G.enemies.length };
      SK.hurtEnemy(G, v, 9999, false, 0, 0);
      window._corpse = v;
      return info;
    });
    await sleep(1400);
    await p.evaluate(() => { for (const q of SK.G.enemies) if (q.st !== 'dead') { q.cd = 99; q.st = 'idle'; q.stT = 99; } });
    await standNearCorpse(p, 40);   // xác bị đẩy lùi có thể xa hơn 4 ô
    await resetDmg(p, h);
    await pressK(p); await sleep(300);
    const early = await p.evaluate(() => !!(SK.G._allies || []).find(x => x.revived));
    await sleep(700);
    const s = await p.evaluate(() => {
      const G = SK.G, a = (G._allies || []).find(x => x.revived);
      return a ? { hp: a.hp, hpMax: a.hpMax, id: a.e.id, inList: G.enemies.indexOf(a.e) >= 0, cd: SK.G.player.skillCd, fx: (G.vfx || []).map(v => v.name).filter(n => /reborn/.test(n)) } : null;
    });
    await seq(p, 'necromancer_2', 6, 120);
    check('necromancer souls_resurrect: hồi sinh ' + before.id + ' sau 0,68 s với máu gốc ' + before.hpMax + ', rời phe địch, dấu reborn_mark, hồi chiêu ' + r.cd + ' s [ĐO]',
      !early && s && s.id === before.id && s.hpMax === before.hpMax && !s.inList && s.fx.indexOf('reborn_mark') >= 0 && near(s.cd, r.cd, 1.4), JSON.stringify(s));
    await sleep(3500);
    const a = await snap(p);
    const alive = await p.evaluate(() => { const a = (SK.G._allies || []).find(x => x.revived); return !!a && !a.gone; });
    check('necromancer souls_resurrect: quái hồi sinh tự đánh quái địch (thẻ minion)', hitsOf(a, 'minion').length > 0 || a.dmg > 0, 'đòn ' + hitsOf(a).slice(0, 6).join(',') + ' · sống ' + alive);
    // Hồi sinh con thứ hai khi giới hạn là 1: con ít máu nhất tan, con còn lại là con mới nếu con cũ chưa đầy máu.
    const two = await p.evaluate(() => {
      const G = SK.G, pl = G.player, first = G._allies.find(x => x.revived);
      first.hp = 3; first._old = 1;
      const v = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn' && !e.bossKey && !/Static|Summon/.test(e.cls) && e !== first.e)[0];
      if (!v) return null;
      SK.hurtEnemy(G, v, 99999, false, 0, 0);
      pl.skillCd = 0;
      return { id: v.id, first: first.e.id };
    });
    if (two) {
      await sleep(1300);
      await standNearCorpse(p, 30, two.id);
      await pressK(p); await sleep(1000);
      const after = await p.evaluate(() => { const al = (SK.G._allies || []).filter(x => x.revived && !x.gone); return { n: al.length, old: al.some(x => x._old), id: al[0] && al[0].e.id }; });
      check('necromancer souls_resurrect: quá 1 quái thì con ít máu nhất tan (con cũ 3 máu bị bỏ, con mới ở lại) [ĐO MinionsCountControl]', after.n === 1 && !after.old && after.id === two.id, JSON.stringify(after) + ' · mới ' + two.id);
    }
  }
});
async function resetDmg(p) { await p.evaluate(() => { window._skDmg = 0; window._skHits = []; }); }

// Đặt người chơi cách xác (mặc định xác _corpse, hoặc quái có id) dist px, chỗ trống và nhìn thấy nhau.
async function standNearCorpse(p, dist, id) {
  return p.evaluate(([d, id]) => {
    const G = SK.G, W = SK.world, pl = G.player, c = id ? G.enemies.find(e => e.id === id && e.st === 'dead') : window._corpse;
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, d], [0, -d], [-d * 0.7, d * 0.7], [d * 0.7, d * 0.7]]) {
      const x = c.x + dx, y = c.y + dy;
      if (W.solidAt(G.map, x, y) || W.solidAt(G.map, x - 6, y) || W.solidAt(G.map, x + 6, y) || W.solidAt(G.map, x, y - 5) || !W.los(G.map, x, y - 6, c.x, c.y - 6)) continue;
      pl.x = x; pl.y = y; return true;
    }
    return false;
  }, [dist, id || null]);
}
