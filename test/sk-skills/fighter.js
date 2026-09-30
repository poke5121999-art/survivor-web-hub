// Ca kiểm Võ Đấu Gia (c33): tiger_punch, whirlwind_kick.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, pressK, seq, real, hitsOf } = h;
  // Quái đứng yên, máu dày để chuỗi đòn không giết mất mục tiêu giữa chừng.
  const tank = p => p.evaluate(() => { const pl = SK.G.player; pl.crit = 0; SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }); });
  const fire = (p, n) => p.evaluate(n => { const G = SK.G, pl = G.player; for (let i = 0; i < n; i++) SK.emit('fire', G, pl, pl.weapons[pl.cur]); }, n);
  return {
    async 'fighter/0'(p, id) {
      const r = await real(p, 'fighter', 'tiger_punch');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.fighter.ctrlFields);
      await standNear(p, 40); await tank(p);
      // Thức 1 Uy Hổ Khiếu: bấm thẳng, vào hồi chiêu ngay, +50% DMG bạo.
      await pressK(p); await sleep(120);
      const a = await snap(p);
      const roar = await p.evaluate(() => SK.G.player._fTp.roar);
      await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); SK.hurtEnemy(G, e, 10, true, 0, 0); });
      const b = await snap(p);
      const critMult = await p.evaluate(() => SK.DS.rules.critMult);
      const want = Math.max(1, Math.round(10 * cf.AddCriticDamage / critMult));
      check('fighter tiger_punch: Uy Hổ Khiếu vào hồi chiêu ' + r.cd + ' s ngay, buff bạo ' + cf.CriticDuration + ' s [ĐO CriticDuration]', near(a.skillCd, r.cd, 0.5) && a.skillT === 0 && roar > cf.CriticDuration - 1, 'skillCd ' + a.skillCd.toFixed(2) + ' · roar ' + roar.toFixed(1));
      check('fighter tiger_punch: đòn bạo nhận thêm ' + want + ' (' + cf.AddCriticDamage * 100 + '% [ĐO AddCriticDamage] / critMult ' + critMult + ')', hitsOf(b, 'roar').length === 1 && hitsOf(b, 'roar')[0] === want, JSON.stringify(b.hits));
      // Thức 2 Hổ Chấn Địa: 1 đòn đánh + kỹ năng (đang hồi chiêu vẫn dùng được), 4 sát thương + choáng, không đổi hồi chiêu.
      await p.evaluate(() => { window._skHits = []; });
      await fire(p, 1); await pressK(p); await sleep(250);
      const c = await snap(p);
      await seq(p, 'fighter_0', 6, 60);
      check('fighter tiger_punch: Hổ Chấn Địa ' + cf.PushOffDmgValue + ' sát thương [ĐO PushOffDmgValue] + choáng, hồi chiêu giữ nguyên', hitsOf(c, 'skill').length >= 1 && hitsOf(c, 'skill').every(d => d === cf.PushOffDmgValue) && c.stun >= 1 && c.skillCd <= a.skillCd + 0.05 && c.skillCd > 5, 'đòn ' + hitsOf(c, 'skill').join(',') + ' · choáng ' + c.stun + ' · skillCd ' + c.skillCd.toFixed(2));
      // Thức 3 Bách Liệt Quyền: 2 đòn đánh + kỹ năng.
      await tank(p); await standNear(p, 40); await p.evaluate(() => { window._skHits = []; SK.G.player.crit = 0; SK.G.player._fTp.n = 0; });
      await fire(p, 2); await pressK(p); await sleep(1300);
      const d = await snap(p);
      await seq(p, 'fighter_0b', 6, 80);
      const n = hitsOf(d, 'flurry');
      check('fighter tiger_punch: Bách Liệt Quyền ' + cf.ContinuousBoxingDmgValue + ' sát thương mỗi ' + cf.ContinuousBoxingDmgInterval + ' s [ĐO], ≥ 4 loạt sau 1,3 s', n.length >= 4 && n.every(x => x === cf.ContinuousBoxingDmgValue), 'số loạt ' + n.length);
    },
    async 'fighter/1'(p, id) {
      const r = await real(p, 'fighter', 'whirlwind_kick');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.fighter.ctrlFields);
      await standNear(p, 70); await tank(p); await p.evaluate(() => { SK.G.player._wk = null; });
      const a = await snap(p);
      await pressK(p); await sleep(750);
      const s1 = await snap(p);
      await tank(p); await p.evaluate(() => { window._skHits = []; });
      await pressK(p); await sleep(800);
      const s2 = await snap(p);
      await tank(p); await p.evaluate(() => { window._skHits = []; SK.G.enemies.forEach(e => { e.st = 'idle'; e.stT = 99; }); });
      await pressK(p); await sleep(200);
      await seq(p, 'fighter_1', 6, 60);
      await sleep(600);
      const s3 = await snap(p);
      check('fighter whirlwind_kick: ' + r.max + ' lượt [ĐO], mỗi đoạn tốn một lượt', a.ch && a.ch.max === r.max && s1.ch.n === r.max - 1 && s2.ch.n === r.max - 2 && s3.ch.n === 0, JSON.stringify([a.ch, s1.ch, s2.ch, s3.ch]));
      check('fighter whirlwind_kick: đoạn 1 ' + cf.Skill2Kick1DmgValue + ' sát thương + choáng [ĐO]', hitsOf(s1, 'kick').length >= 1 && hitsOf(s1, 'kick').every(d => d === cf.Skill2Kick1DmgValue) && s1.stun >= 1, 'đòn ' + hitsOf(s1, 'kick').join(',') + ' · choáng ' + s1.stun);
      check('fighter whirlwind_kick: đoạn 2 ' + cf.Skill2Kick2DmgValue + ' sát thương [ĐO]', hitsOf(s2, 'kick').length >= 1 && hitsOf(s2, 'kick').every(d => d === cf.Skill2Kick2DmgValue), 'đòn ' + hitsOf(s2, 'kick').join(','));
      check('fighter whirlwind_kick: đoạn 3 đá quét ' + cf.Skill2Kick3DmgValue + ' + gió ' + cf.WindDmgValue + ' [ĐO]', hitsOf(s3, 'kick').length >= 1 && hitsOf(s3, 'kick').every(d => d === cf.Skill2Kick3DmgValue) && hitsOf(s3, 'wind').length >= 1 && hitsOf(s3, 'wind').every(d => d === cf.WindDmgValue), 'quét ' + hitsOf(s3, 'kick').join(',') + ' · gió ' + hitsOf(s3, 'wind').join(','));
    }
  };
};
