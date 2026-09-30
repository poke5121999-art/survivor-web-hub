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
    }
  };
};
