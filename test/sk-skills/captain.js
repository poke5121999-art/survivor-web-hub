// Ca kiểm Thuyền Trưởng (c38): số đọc từ ctrlFields [ĐO].
module.exports = h => {
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp += 400; }));
  return {
    async 'captain/0'(p) {
      const r = await h.real(p, 'captain', 'barrel_blowout');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.captain.ctrlFields);
      await tough(p); await h.standNear(p, 60);
      await h.pressK(p); await h.sleep(150);
      const a = await h.snap(p);
      for (let i = 0; i < cf.Skill0BasePlacementPerCast; i++) { await h.pressK(p); await h.sleep(120); }
      await h.sleep(500);
      const n = await p.evaluate(() => (SK.G._cbox || []).length);
      await h.seq(p, 'captain_0', 6, 50);
      const b = await h.snap(p);
      h.check('captain barrel_blowout: chế độ đặt ' + r.dur + ' s [ĐO], đặt ' + cf.Skill0BasePlacementPerCast + ' thùng rồi hết chế độ, hồi ' + r.cd + ' s', h.near(a.skillT, r.dur - 0.15, 0.4) && n === cf.Skill0BasePlacementPerCast && b.skillT <= 0 && b.cd === r.cd, 'skillT ' + a.skillT.toFixed(2) + ' · thùng ' + n + ' · cd ' + b.skillCd.toFixed(2));
      await h.resetDmg(p);
      // Kích nổ là nút đặc biệt (L), không phải K [ĐO ButtonCaptainSkill1]; chim bay 0.25 s rồi nổ cách 0.33 s.
      await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL'); await h.sleep(300);
      await h.seq(p, 'captain_0b', 6, 100);
      await h.sleep(1500);
      const c = await h.snap(p), left = await p.evaluate(() => (SK.G._cbox || []).length);
      const full = [cf.IceBoxDamage, cf.FireBoxDamage, cf.EletricBoxDamage], want = full.concat(full.map(v => Math.round(v * cf.BoxDamagePercent)));
      const bb = h.hitsOf(c, 'bb');
      h.check('captain barrel_blowout: L kích nổ chuỗi ' + n + ' thùng; thùng còn hàng xóm < ' + cf.BoxFullEffectDistance + ' ô chỉ ' + cf.BoxDamagePercent * 100 + '% [ĐO GetCaptainBoxAttackPercent] → ' + want.join('/'), bb.length > 0 && bb.every(d => want.indexOf(d) >= 0) && bb.some(d => full.indexOf(d) >= 0) && left === 0, 'đòn ' + bb.join(',') + ' · thùng còn ' + left);
    },
    async 'captain/0b'(p) {
      // Hai thùng lửa cách 20 px (1.25 ô < BoxFullEffectDistance 4): thùng nổ trước còn hàng xóm nên chỉ 25% (25 → 6), thùng sau đủ 25.
      // (bán kính ×(1 + 0.1 n) cho cụm n ≥ 2 thùng: ĐO GetCaptainBoxConnectedExplodeSizeMultiplier, chỉ thấy qua hiệu ứng)
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.captain.ctrlFields);
      await h.real(p, 'captain', 'barrel_blowout');
      await tough(p); await h.standNear(p, 60); await h.resetDmg(p);
      await p.evaluate(() => { const G = SK.G, pl = G.player, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); G._cbox = [{ x: e.x - 10, y: e.y, type: 'fire', t: 1 }, { x: e.x + 10, y: e.y, type: 'fire', t: 1 }]; pl.skillCd = 0; SK.SKILLS.barrel_blowout.start(G, pl); pl.skillT = 0; });
      await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL'); await h.sleep(1600);
      const s = await h.snap(p), bb = h.hitsOf(s, 'bb');
      h.check('captain barrel_blowout: 2 thùng lửa sát nhau nổ 25% rồi 100% [ĐO BoxDamagePercent]', bb.length >= 2 && bb.length % 2 === 0 && bb.slice(0, bb.length / 2).every(d => d === Math.round(cf.FireBoxDamage * cf.BoxDamagePercent)) && bb.slice(bb.length / 2).every(d => d === cf.FireBoxDamage), 'đòn ' + bb.join(','));
    },
    async 'captain/1'(p) {
      const r = await h.real(p, 'captain', 'onward_wavecutter');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.captain.ctrlFields);
      await tough(p); await h.standNear(p, 90);
      await h.pressK(p); await h.sleep(300);
      const nf0 = await p.evaluate(() => !!SK.G.player.noFire);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      await h.seq(p, 'captain_1', 6, 100);
      await h.sleep(1300);
      const a = await h.snap(p);
      const spd = await p.evaluate(() => SK.G.player.moveMul * SK.G.player.h.speed), nf1 = await p.evaluate(() => !!SK.G.player.noFire);
      // Húc quái: dời một con lên thân tàu.
      await h.resetDmg(p);
      await p.evaluate(() => { const G = SK.G, pl = G.player, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); const f = pl.face > 0 ? 1 : -1; e.x = pl.x - 20.8 * f + 7.84 * f; e.y = pl.y - 8; });
      await h.sleep(300);
      const b = await h.snap(p);
      await h.seq(p, 'captain_1b', 6, 60);
      await h.pressK(p); await h.sleep(200);
      const e = await h.snap(p), mm = await p.evaluate(() => SK.G.player.moveMul);
      h.check('captain wavecutter: gọi tàu ' + r.dur + ' s bất tử [ĐO], rồi lái tàu tốc ' + cf.Skill2BoatSpeed + ' ô/s [ĐO Skill2BoatSpeed]', imm === false && Math.abs(spd - cf.Skill2BoatSpeed) < 0.05 && a.skillT > cfg0(cf) - 3 && a.cd === r.cd, 'bất tử ' + (imm === false) + ' · tốc ' + spd.toFixed(2) + ' · skillT ' + a.skillT.toFixed(2));
      h.check('captain wavecutter: pha gọi tàu khoá tấn công (p.noFire) [ĐO CanOwnerOperate], hết pha thì bắn được', nf0 === true && nf1 === false, 'noFire lúc gọi ' + nf0 + ' · sau ' + nf1);
      h.check('captain wavecutter: thân tàu húc quái ' + cf.Skill2BoatCollisionDamage + ' [ĐO Skill2BoatCollisionDamage]', h.hitsOf(b, 'boat').length > 0 && h.hitsOf(b, 'boat').every(d => d === cf.Skill2BoatCollisionDamage), 'đòn ' + h.hitsOf(b, 'boat').join(','));
      h.check('captain wavecutter: bấm lại xuống tàu sớm, trả tốc chạy', e.skillT <= 0 && Math.abs(mm - 1) < 0.01 && !(await p.evaluate(() => SK.G.player.noFire)), 'skillT ' + e.skillT.toFixed(2) + ' · moveMul ' + mm);
    }
  };
  function cfg0(cf) { return cf.Skill2BoatLifeTime; }
};
