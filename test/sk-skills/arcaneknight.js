// Ca kiểm Kỵ Sĩ Bùa Chú (c31): Năng Lượng Tuôn Trào (ba dạng theo vũ khí), Pháp Trận Bảo Hộ — số [ĐO] từ ctrlFields C32Controller.
module.exports = h => {
  const tank = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp = 9999; }));
  const arm = (p, kind) => p.evaluate(k => { const D = SK.DS.weapons, pl = SK.G.player; const id = Object.keys(D).find(i => (k === 'beam' ? D[i].kind === 'laser' : D[i].kind === (k === 'proj' ? 'gun' : k)) && D[i].w86); pl.weapons[pl.cur] = SK.makeWeapon(id); return id; }, kind);
  return {
    async 'arcaneknight/0'(p, id) {
      const r = await h.real(p, 'arcaneknight', 'power_burst');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.arcaneknight.ctrlFields);
      const want = { melee: cf.skill0MeleeInfo.damage, proj: cf.skill0ProjectileInfo.damage, beam: cf.skill0BeamInfo.damage };
      for (const kind of ['melee', 'proj', 'beam']) {
        const wid = await arm(p, kind);
        await h.standNear(p, 45); await tank(p); await h.resetDmg(p);
        const a = await h.snap(p);
        await h.pressK(p); await h.sleep(500);
        const mid = await h.snap(p);
        if (kind === 'melee') await h.seq(p, 'arcaneknight_0', 6, 70);
        await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
        await h.sleep(700);
        const s = await h.snap(p);
        const d = h.hitsOf(s, 'burst');
        h.check('arcaneknight power_burst (' + kind + ', ' + wid + '): tụ đầy rồi thả, mỗi đòn ' + want[kind] + ' [ĐO skill0*Info.damage]', d.length >= 1 && d.every(x => x === want[kind] || x === want[kind] * 2), 'đòn ' + d.join(','));
        if (kind === 'melee') h.check('arcaneknight power_burst: tụ ' + r.dur + ' s [ĐO], hồi ' + r.cd + ' s', mid.skillT > 0.9 && a.cd === r.cd && s.skillCd > r.cd - 1.5, 'skillT ' + mid.skillT.toFixed(2) + ' · skillCd ' + s.skillCd.toFixed(2));
        await p.evaluate(() => { SK.G.player.skillCd = 0; });
      }
      // đánh bằng vũ khí khi đang tụ thì thả ngay
      await arm(p, 'proj'); await h.standNear(p, 45); await tank(p); await h.resetDmg(p);
      await h.pressK(p); await h.sleep(250);
      await p.keyboard.down('KeyJ'); await h.sleep(120); await p.keyboard.up('KeyJ');
      await h.sleep(300);
      const w = await p.evaluate(() => ({ t: SK.G.player.skillT, done: SK.G.player._pb ? SK.G.player._pb.done : 'gone' }));
      h.check('arcaneknight power_burst: đánh vũ khí khi tụ → thả cùng lúc', w.t <= 0 || w.done === true || w.done === 'gone', JSON.stringify(w));
    },
    async 'arcaneknight/1'(p, id) {
      const r = await h.real(p, 'arcaneknight', 'aegis_circle');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.arcaneknight.ctrlFields);
      await h.standNear(p, 40); await tank(p);
      await p.evaluate(() => { const pl = SK.G.player; pl.armor = 0; pl.armorMax = 3; pl.armorT = 99; });
      const a = await h.snap(p);
      await p.keyboard.down('KeyD');
      await h.pressK(p); await p.keyboard.up('KeyD'); await h.sleep(150);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      await h.seq(p, 'arcaneknight_1', 6, 170);
      const s = await h.snap(p);
      const d = Math.hypot(s.px - a.px, s.py - a.py);
      const c = await p.evaluate(() => { const c = SK.G.player._akCircle; return c ? { given: c.given } : null; });
      h.check('arcaneknight aegis_circle: dịch chuyển ≤ ' + cf.skill1MaxTeleportDistance + ' ô [ĐO], bất tử lúc biến mất, hồi ' + r.cd + ' s', imm === false && d > 24 && d <= cf.skill1MaxTeleportDistance * 16 + 10 && s.cd === r.cd, 'dời ' + Math.round(d) + ' px');
      await h.sleep(600);
      const s2 = await p.evaluate(() => { const pl = SK.G.player, c = pl._akCircle; return { armor: pl.armor, given: c ? c.given : -1 }; });
      h.check('arcaneknight aegis_circle: giáp tạm +1 mỗi ' + cf.skill1AddArmorInterval + ' s, tối đa ' + cf.skill1MaxAddArmor + ' [ĐO]', s2.given >= 1 && s2.given <= cf.skill1MaxAddArmor && s2.armor === s2.given, JSON.stringify(s2));
      const dm = h.hitsOf(await h.snap(p), 'circle');
      h.check('arcaneknight aegis_circle: pháp trận gây ' + cf.skill1RegularDamageBullet.damage + ' cho quái trong vòng [ĐO]', dm.length >= 1 && dm.every(x => x === cf.skill1RegularDamageBullet.damage || x === cf.skill1RegularDamageBullet.damage * 2), 'đòn ' + dm.join(','));
      await p.evaluate(() => { const pl = SK.G.player; pl.x += 200; });
      await h.sleep(300);
      const left = await p.evaluate(() => ({ c: !!SK.G.player._akCircle, armor: SK.G.player.armor }));
      h.check('arcaneknight aegis_circle: rời vòng thì vòng tan, mất giáp tạm', !left.c && left.armor <= 3, JSON.stringify(left));
    }
  };
};
