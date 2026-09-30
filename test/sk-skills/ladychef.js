// Ca kiểm Nữ Đầu Bếp (c41): số đọc từ ctrlFields / config skills [ĐO].
module.exports = h => {
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp += 400; }));
  return {
    async 'ladychef/0'(p) {
      const r = await h.real(p, 'ladychef', 'mystic_stewpot');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.ladychef.ctrlFields);
      await tough(p); await h.standNear(p, 70);
      await h.pressK(p); await h.sleep(300);
      await h.seq(p, 'ladychef_0', 6, 130);
      await h.sleep(600);
      const a = await h.snap(p);
      const n1 = await p.evaluate(() => SK.G.player._lc.stews.filter(q => !q.gone).length);
      h.check('ladychef: nồi nảy gây ' + cf.stewPotBounceDamage + ' [ĐO stewPotBounceDamage], mỗi lần nảy sinh một món hầm, hồi ' + r.cd + ' s', h.hitsOf(a, 'skill').length > 0 && h.hitsOf(a, 'skill').every(d => d === cf.stewPotBounceDamage) && n1 >= 2 && a.cd === r.cd, 'đòn ' + h.hitsOf(a, 'skill').join(',') + ' · món hầm ' + n1);
      await h.sleep(2500);
      const n2 = await p.evaluate(() => SK.G.player._lc.stews.filter(q => !q.gone).length);
      // Nhặt món hầm thường: ngon miệng 5 s, mỗi đòn thêm 3 viên nửa sát thương.
      await p.evaluate(() => { const G = SK.G, pl = G.player, q = pl._lc.stews.find(s => !s.gone); pl.x = q.x; pl.y = q.y + 4; for (const e of G.enemies) e.cd = 99; });
      await h.sleep(300);
      const t = await p.evaluate(() => ({ tasty: SK.G.player._lc.tastyT, dream: SK.G.player._lc.dreamT }));
      await h.standNear(p, 150);
      await h.resetDmg(p);
      await p.keyboard.down('KeyJ'); await h.sleep(300);
      const proj = await p.evaluate(() => SK.G.bullets.filter(b => b.side === 'p' && b.sprite === 'c42StewProjectile_0').length), vol = await p.evaluate(() => SK.G.player._lc.volleys || 0);
      await p.keyboard.up('KeyJ');
      h.check('ladychef: nhặt món hầm → ngon miệng ' + cf.dungeonStewDuration + ' s [ĐO], mỗi đòn bắn thêm loạt ' + cf.dungeonStewProjectileCount + ' viên', t.tasty > cf.dungeonStewDuration - 0.5 && t.dream === 0 && vol >= 1 && (proj > 0 || h.hitsOf(await h.snap(p)).length > 0), JSON.stringify(t) + ' · loạt ' + vol + ' · viên còn bay ' + proj + ' · món còn lại ' + n2);
      // Đủ Độ Lửa: món Ảo Mộng, miễn sát thương.
      await h.sleep(5200);
      await p.evaluate(() => { const pl = SK.G.player; pl.skillCd = 0; pl._lc.heat = 100; for (const q of pl._lc.stews) q.gone = true; });
      await h.standNear(p, 70);
      await h.pressK(p); await h.sleep(1300);
      await p.evaluate(() => { const G = SK.G, pl = G.player, q = pl._lc.stews.find(s => !s.gone); pl.x = q.x; pl.y = q.y + 4; });
      await h.sleep(300);
      const d = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; const hurt = SK.hurtPlayer(SK.G, 3); return { dream: pl._lc.dreamT, heat: pl._lc.heat, hurt }; });
      await h.seq(p, 'ladychef_0b', 6, 60);
      h.check('ladychef: Độ Lửa 100 → món Ảo Mộng, miễn sát thương ' + cf.dreamStewInvincibleDuration + ' s [ĐO], Độ Lửa về 0', d.hurt === false && d.dream > cf.dreamStewInvincibleDuration - 1 && d.heat < 20, JSON.stringify(d));
    }
  };
};
