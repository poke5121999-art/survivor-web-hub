// Ca kiểm Chiêm Tinh Sư (c32): Mưa Sao Băng, Bánh Xe Vận Mệnh — số [ĐO] từ ctrlFields C33Controller.
module.exports = h => {
  const tank = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp = 9999; }));
  return {
    async 'astrologist/0'(p, id) {
      const r = await h.real(p, 'astrologist', 'starfall_surge');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.astrologist.ctrlFields);
      await h.standNear(p, 60); await tank(p);
      const a = await h.snap(p);
      await h.pressK(p); await h.sleep(150);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      const s = await h.snap(p);
      await h.seq(p, 'astrologist_0', 6, 60);
      await h.sleep(400);
      const s2 = await h.snap(p);
      h.check('astrologist starfall_surge: ' + r.dur + ' s, bất tử, chạy ×' + (1 + cf.addSpeedRate) + ', hồi ' + r.cd + ' s [ĐO]', imm === false && h.near(s.move, 1 + cf.addSpeedRate, 0.01) && s.cd === r.cd && s.skillT > 0, 'move ' + s.move + ' · skillT ' + s.skillT.toFixed(2));
      const d = h.hitsOf(s2, 'star');
      h.check('astrologist starfall_surge: sao băng trúng quái ' + cf.starDashDamage + ' [ĐO starDashDamage]', d.length >= 2 && d.every(x => x === cf.starDashDamage || x === cf.starDashDamage * 2), 'đòn ' + d.join(','));
      // Tinh Năng đầy: vùng chiêm tinh 66 + xóa đạn + sao rơi lên quái bị nguyền
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl._as.en = 33; pl.skillCd = 0; pl.skillT = 0; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 40, y: pl.y - 7, h: 8, vx: 0, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 9, _probe: 1 }); G.enemies.forEach(e => { if (e.st !== 'dead') e._curse = { t: 9, h: null }; }); });
      await h.standNear(p, 50); await tank(p); await h.resetDmg(p);
      await h.pressK(p); await h.sleep(700);
      const s3 = await h.snap(p);
      const left = await p.evaluate(() => ({ en: SK.G.player._as.en, probe: SK.G.bullets.some(b => b._probe) }));
      h.check('astrologist starfall_surge: đủ Tinh Năng → vùng chiêm tinh ' + cf.starPassiveDamage + ', sao rơi ' + cf.starFallDamage + ', xóa đạn [ĐO]', left.en === 0 && !left.probe && h.hitsOf(s3).some(x => x === cf.starPassiveDamage || x === cf.starPassiveDamage * 2) && h.hitsOf(s3).some(x => x === cf.starFallDamage || x === cf.starFallDamage * 2), 'Tinh Năng ' + left.en + ' · đạn ' + left.probe + ' · đòn ' + h.hitsOf(s3).join(','));
    },
    async 'astrologist/1'(p, id) {
      const r = await h.real(p, 'astrologist', 'rota_fortunae');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.astrologist.ctrlFields);
      await h.standNear(p, 55); await tank(p);
      const a = await h.snap(p);
      await h.pressK(p); await h.sleep(900);
      const s = await h.snap(p);
      await h.seq(p, 'astrologist_1', 6, 100);
      const w = await p.evaluate(() => { const w = SK.G.player._wheel; return w ? { x: w.x, y: w.y, scale: w.scale } : null; });
      const d = h.hitsOf(s, 'wheel');
      h.check('astrologist rota_fortunae: ' + r.dur + ' s, hồi ' + r.cd + ' s [ĐO]; bánh xe bay ra', !!w && s.cd === r.cd && s.skillT > r.dur - 1.5, 'skillT ' + s.skillT.toFixed(2) + ' · ' + JSON.stringify(w));
      h.check('astrologist rota_fortunae: thân bánh ' + cf.skill1Damage + ' / kim ' + cf.skill1PointDamage + ' [ĐO]', d.length >= 1 && d.every(x => x === cf.skill1Damage || x === cf.skill1PointDamage || x === cf.skill1Damage * 2 || x === cf.skill1PointDamage * 2), 'đòn ' + d.join(','));
      // bấm lần nữa: thu hồi bánh, xong thì hồi chiêu
      await h.pressK(p);
      await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
      const e = await h.snap(p);
      h.check('astrologist rota_fortunae: bấm lần nữa thu hồi bánh, rồi hồi chiêu ' + r.cd + ' s', e.skillT <= 0 && e.skillCd > r.cd - 1.5, 'skillCd ' + e.skillCd.toFixed(2));
      // đủ Tinh Năng: bánh lớn ×1.5
      await p.evaluate(() => { const pl = SK.G.player; pl._as.en = 66; pl.skillCd = 0; });
      await h.pressK(p); await h.sleep(200);
      const big = await p.evaluate(() => ({ scale: SK.G.player._wheel && SK.G.player._wheel.scale, en: SK.G.player._as.en }));
      h.check('astrologist rota_fortunae: đủ Tinh Năng → bánh to ×' + cf.skill1MaxScale + ' [ĐO skill1MaxScale]', big.scale === cf.skill1MaxScale && big.en === 0, JSON.stringify(big));
    }
  };
};
