// Ca kiểm Nữ Hoàng Cơ Giới (c37): số đọc từ ctrlFields / prefab [ĐO].
module.exports = h => {
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp += 400; }));
  const bat = p => p.evaluate(() => SK.G.player._ai ? SK.G.player._ai.bat : 0);
  return {
    async 'aigirl/0'(p) {
      const r = await h.real(p, 'aigirl', 'iridescent_resonance');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.aigirl.ctrlFields);
      await tough(p); await h.standNear(p, 70);
      // Dưới 1 ô điện: chỉ tên lửa, không tốn điện.
      await p.evaluate(() => { SK.G.player._ai = { bat: 10, ph: null, beam: null }; });
      await h.pressK(p); await h.sleep(1700);
      const a = await h.snap(p);
      const b0 = await bat(p);
      await h.seq(p, 'aigirl_0', 6, 60);
      const ms = h.hitsOf(a, 'skill');
      h.check('aigirl: điện < 1 ô → ' + cf.missileCount + ' tên lửa, mỗi quả nổ ' + cf.missileDamage + ', không tốn điện [ĐO missileDamage]', b0 === 10 && ms.length >= cf.missileCount && ms.every(d => d === cf.missileDamage || d === cf.missileDamage * 2), 'đòn ' + ms.join(',') + ' · điện ' + b0);
      h.check('aigirl: hồi chiêu ' + r.cd + ' s [ĐO]', a.cd === r.cd, 'cd ' + a.cd);
      // Đủ điện, bấm nhanh: tốn 1 ô, tên lửa + tia ngắn.
      await p.evaluate(() => { const pl = SK.G.player; pl._ai.bat = 100; pl.skillCd = 0; });
      await h.resetDmg(p);
      await h.pressK(p); await h.sleep(150);
      await h.seq(p, 'aigirl_0b', 6, 60);
      await h.sleep(1500);
      const c = await h.snap(p), b1 = await bat(p);
      h.check('aigirl: đủ điện, bấm nhanh → tốn 1 ô (25), ' + cf.batteryMissileCount + ' tên lửa + tia ngắn ' + cf.batteryDamage + ' [ĐO]', b1 === 75 && h.hitsOf(c, 'laser').length > 0 && h.hitsOf(c, 'laser').every(d => d === cf.batteryDamage || d === cf.batteryDamage * 2) && h.hitsOf(c, 'skill').length >= cf.batteryMissileCount, 'điện ' + b1 + ' · tia ' + h.hitsOf(c, 'laser').join(',') + ' · tên lửa ' + h.hitsOf(c, 'skill').length);
      // Giữ phím, buông: laser quét, hút đạn địch, tốn điện liên tục.
      await p.evaluate(() => { const pl = SK.G.player; pl._ai.bat = 100; pl.skillCd = 0; SK.endSkill(SK.G, pl); pl.skillCd = 0; });
      await h.resetDmg(p);
      await p.keyboard.down('KeyK'); await h.sleep(1150); await p.keyboard.up('KeyK'); await h.sleep(100);
      await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 60, y: pl.y - 8, h: 8, vx: 0, vy: 0, ang: 0, dmg: 1, repel: 0, r: 3, life: 5, _probe: 1 }); });
      const b2 = await bat(p);
      await h.seq(p, 'aigirl_0c', 6, 120);
      const d = await h.snap(p), b3 = await bat(p);
      const eaten = await p.evaluate(() => !SK.G.bullets.some(x => x._probe));
      const lz = h.hitsOf(d, 'laser');
      h.check('aigirl: giữ ≥ ' + cf.pressTime + ' s rồi buông → laser quét, ' + cf.laserBaseDamage + ' sát thương/0.2 s [ĐO], tốn ' + cf.laserBatteryCost + '/s, hút đạn địch', lz.length > 0 && lz.some(x => x >= cf.laserBaseDamage) && b3 < b2 - 3 && eaten && d.skillT > 0, 'tia ' + lz.slice(0, 6).join(',') + ' · điện ' + b2 + ' → ' + b3 + ' · đạn địch ' + (eaten ? 'mất' : 'còn'));
      // Laser: +1 sát thương mỗi 15 điện tiêu [ĐO UpdateLaser.MoveNext], cứ 2.5 s bắn 4 tên lửa, không có thời gian tối đa (chạy tới hết điện).
      await h.sleep(600);
      const bm = await p.evaluate(() => { const b = SK.G.player._ai.beam; return b ? { addDmg: b.addDmg, spent: b.spent, bat: SK.G.player._ai.bat } : null; });
      const lz2 = h.hitsOf(await h.snap(p), 'laser');
      h.check('aigirl laser: sát thương +1 mỗi ' + cf.laserAddDamage + ' điện đã tiêu [ĐO UpdateLaser.MoveNext]', bm && bm.addDmg >= 1 && h.near(bm.addDmg * cf.laserAddDamage + bm.spent, 100 - bm.bat, 0.01) && lz2.some(x => x === cf.laserBaseDamage + 1), JSON.stringify(bm) + ' · tia ' + lz2.slice(-6).join(','));
      await h.resetDmg(p);
      await p.evaluate(() => { SK.G.player._ai.beam.missT = 2.45; });
      await h.sleep(900);
      const lm = h.hitsOf(await h.snap(p), 'skill'), mt = await p.evaluate(() => SK.G.player._ai.beam.missT);
      h.check('aigirl laser: cứ ' + cf.laserMissile[0] + ' s bắn ' + cf.laserMissile[1] + ' tên lửa [ĐO laserMissile]', lm.length >= 1 && lm.length <= cf.laserMissile[1] && mt < 1.2 && lm.every(x => x === cf.missileDamage || x === cf.missileDamage * 2), 'tên lửa trúng ' + lm.join(',') + ' · đồng hồ ' + mt.toFixed(2));
      // Nguồn điện lượng [ĐO C38Controller.RestoreEnergy]: tiêu năng lượng → pin += energyConvertRatio × lượng tiêu.
      await p.evaluate(() => { const pl = SK.G.player; SK.endSkill(SK.G, pl); pl._ai.beam = null; pl._ai.ph = null; pl.energy = 150; });
      await h.sleep(150);
      await p.evaluate(() => { SK.G.player._ai.bat = 0; SK.G.player.energy -= 12; });
      await h.sleep(150);
      const ge = await bat(p);
      h.check('aigirl: tiêu 12 năng lượng → pin +12 × ' + cf.energyConvertRatio + ' [ĐO RestoreEnergy]; nhặt năng lượng không cộng pin', h.near(ge, 12 * cf.energyConvertRatio, 0.01), 'pin ' + ge);
      await p.evaluate(() => { const pl = SK.G.player; pl.energy = Math.min(pl.energyMax, pl.energy + 30); });
      await h.sleep(150);
      h.check('aigirl: hồi năng lượng không đổi pin', h.near(await bat(p), 12, 0.01), 'pin ' + await bat(p));
      // Rơi pin [ĐO OnPlayerBulletHitEnemy]: hạ quái bằng đạn khi pin < 1 ô, Range(0,10) <= 0 (ép rand = 0); nhặt cộng BatteryItem.value.
      const val = await p.evaluate(() => SK.skillKit.MB('battery_item', 'BatteryItem', 'value', 5));
      await p.evaluate(() => {
        const G = SK.G, pl = G.player, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'), r0 = SK.rand;
        pl._ai.bat = 0; window._dropAt = [e.x, e.y]; SK.rand = () => 0; G._hitBullet = {};
        SK.hurtEnemy(G, e, 99999, false, 0, 0);
        G._hitBullet = null; SK.rand = r0;
        pl.x = e.x; pl.y = e.y; pl.skillCd = 0;
      });
      await h.sleep(700);
      const gd = await bat(p);
      h.check('aigirl: hạ quái bằng đạn khi pin < 1 ô → rơi pin, nhặt +' + val + ' [ĐO BatteryItem.value]', h.near(gd, val, 0.01), 'pin ' + gd);
    }
  };
};
