// Ca kiểm Võ Đấu Gia (c33): tiger_punch, whirlwind_kick.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, pressK, seq, real, hitsOf } = h;
  // Quái đứng yên, máu dày để chuỗi đòn không giết mất mục tiêu giữa chừng.
  const tank = p => p.evaluate(() => { const pl = SK.G.player; pl.crit = 0; SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }); });
  // Giữ đúng một quái (gần người chơi nhất), đẩy các quái khác ra xa để mọi đòn đều do quái đó nhận.
  const solo = p => p.evaluate(() => {
    const G = SK.G, pl = G.player, es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
    es.slice(1).forEach(e => { e.x += 4000; });
    const [cx, cy] = SK.skillKit.ec(es[0]);
    return Math.hypot(cx - pl.x, cy - (pl.y - 7)) / SK.TILE;
  });
  const fire = (p, n) => p.evaluate(n => { const G = SK.G, pl = G.player; for (let i = 0; i < n; i++) SK.emit('fire', G, pl, pl.weapons[pl.cur]); }, n);
  const hold = async (p, ms) => { await p.keyboard.down('KeyK'); await sleep(ms); await p.keyboard.up('KeyK'); };
  const f3 = d => Math.max(0.25, Math.min(5, 3 / Math.max(d, 1e-3)));
  return {
    async 'fighter/0'(p, id) {
      const r = await real(p, 'fighter', 'tiger_punch');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.fighter.ctrlFields);
      await p.evaluate(() => { SK.profile.level = () => 0; });
      await standNear(p, 20); await tank(p);
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
      // Thức 2 Hổ Chấn Địa: 1 đòn đánh + kỹ năng (đang hồi chiêu vẫn dùng được), 4 sát thương, chỉ choáng khi bạo kích, không đổi hồi chiêu.
      await p.evaluate(() => { window._skHits = []; });
      await fire(p, 1); await pressK(p); await sleep(250);
      const c0 = await snap(p);
      await standNear(p, 20); await tank(p);
      await p.evaluate(() => { window._skHits = []; SK.G.player.crit = 100; });
      await fire(p, 1); await pressK(p);
      await seq(p, 'fighter_0', 6, 30);
      const c = await snap(p);
      check('fighter tiger_punch: Hổ Chấn Địa ' + cf.PushOffDmgValue + ' sát thương [ĐO PushOffDmgValue], bán kính 1,5 ô [ĐO prefab bullet_hammer r 1 x scale_factor 1,5], hồi chiêu giữ nguyên', hitsOf(c0, 'skill').length >= 1 && hitsOf(c0, 'skill').every(d => d === cf.PushOffDmgValue) && c0.skillCd <= a.skillCd + 0.05 && c0.skillCd > 5, 'đòn ' + hitsOf(c0, 'skill').join(',') + ' · skillCd ' + c0.skillCd.toFixed(2));
      check('fighter tiger_punch: Hổ Chấn Địa chỉ choáng khi bạo kích [ĐO ExplodeHammer.OnTriggerEnter2D]: không bạo 0 quái choáng, bạo ≥ 1', c0.stun === 0 && c.stun >= 1 && hitsOf(c, 'skill').every(d => d === cf.PushOffDmgValue * 2 || d === cf.PushOffDmgValue), 'không bạo ' + c0.stun + ' · bạo ' + c.stun + ' · đòn ' + hitsOf(c, 'skill').join(','));
      // Thức 3 Bách Liệt Quyền: 2 đòn đánh + kỹ năng; sát thương nhân clamp(3 / khoảng cách ô, 0,25, 5); tay không cầm vũ khí trong lúc đấm.
      await standNear(p, 40); await tank(p);
      const d0 = await solo(p);
      await p.evaluate(() => { window._skHits = []; SK.G.player._fTp.n = 0; });
      await fire(p, 2); await pressK(p);
      await seq(p, 'fighter_0b', 6, 60);
      const nf = await p.evaluate(() => SK.G.player.noFire);
      await sleep(500);
      const d = await snap(p);
      const n = hitsOf(d, 'flurry');
      const lo = Math.round(cf.ContinuousBoxingDmgValue * f3(d0 + 2)), hi = Math.round(cf.ContinuousBoxingDmgValue * f3(d0 - 0.25));
      check('fighter tiger_punch: Bách Liệt Quyền ' + cf.ContinuousBoxingDmgValue + ' x clamp(3/khoảng cách ô) mỗi ' + cf.ContinuousBoxingDmgInterval + ' s [ĐO PreHit], ≥ 4 loạt sau 1,3 s', n.length >= 4 && n.every(x => (x >= lo && x <= hi) || (x >= 2 * lo && x <= 2 * hi)) && hi > 1, 'cách ' + d0.toFixed(2) + ' ô · số loạt ' + n.length + ' · đòn ' + n.join(',') + ' · cho phép ' + lo + '..' + hi);
      check('fighter tiger_punch: Bách Liệt Quyền khoá đánh thường trong ' + cf.ContinuousBoxingDuration + ' s [ĐO DealBackWeapon], mở lại sau đó', nf === true, 'noFire ' + nf);
      await until(p, () => !SK.G.player.noFire, null, 3000);
      const nf2 = await p.evaluate(() => SK.G.player.noFire);
      check('fighter tiger_punch: hết ' + cf.ContinuousBoxingDuration + ' s thì nhả khoá vũ khí', nf2 === false, 'noFire ' + nf2);
      // Thức 4 Hổ Khí Công: chỉ khi nâng cấp cấp 5; giữ nút nạp tối đa 1 s; sát thương 12/24/48.
      await p.evaluate(() => { SK.profile.level = () => 0; SK.G.player._fTp.n = 0; });
      await fire(p, 3);
      const cap0 = await p.evaluate(() => SK.G.player._fTp.n);
      check('fighter tiger_punch: chưa nâng cấp cấp 5 thì mẫu chỉ tới 2 đòn (không có thức 4) [ĐO Skill1_Init]', cap0 === 2, 'n ' + cap0);
      await p.evaluate(() => { SK.profile.level = () => 5; const pl = SK.G.player; pl._fTp.n = 0; pl.skillCd = 0; });
      await standNear(p, 60); await tank(p); await solo(p);
      await p.evaluate(() => { window._skHits = []; SK.G.player.skillCd = 7; });
      await fire(p, 3);
      const cap5 = await p.evaluate(() => SK.G.player._fTp.n);
      await hold(p, 1250);
      await seq(p, 'fighter_0c', 6, 40);
      const bl = await snap(p);
      check('fighter tiger_punch: nâng cấp cấp 5, 3 đòn + giữ kỹ năng ≥ 1 s = Hổ Khí Công mức Long ' + cf.LongExplosionDmgValue + ' [ĐO LongExplosionDmgValue] + cháy, không đổi hồi chiêu', cap5 === 3 && hitsOf(bl, 'blast').length >= 1 && hitsOf(bl, 'blast').every(x => x === cf.LongExplosionDmgValue) && bl.dbEver.indexOf('fire') >= 0 && bl.skillCd <= 7.05 && bl.skillCd > 5, 'n ' + cap5 + ' · đòn ' + hitsOf(bl, 'blast').join(',') + ' · ' + bl.dbEver.join(',') + ' · skillCd ' + bl.skillCd.toFixed(2));
      await standNear(p, 60); await tank(p); await solo(p);
      await p.evaluate(() => { window._skHits = []; SK.G.player._fTp.n = 0; });
      await fire(p, 3);
      await hold(p, 120); await sleep(500);
      const bs = await snap(p);
      check('fighter tiger_punch: nhả sớm = mức Short ' + cf.ShortExplosionDmgValue + ' [ĐO ShortExplosionDmgValue]', hitsOf(bs, 'blast').length >= 1 && hitsOf(bs, 'blast').every(x => x === cf.ShortExplosionDmgValue), 'đòn ' + hitsOf(bs, 'blast').join(','));
      await p.evaluate(() => { SK.profile.level = () => 0; });
    },
    async 'fighter/1'(p, id) {
      const r = await real(p, 'fighter', 'whirlwind_kick');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.fighter.ctrlFields);
      await standNear(p, 70); await tank(p); await p.evaluate(() => { SK.G.player._wk = null; });
      const a = await snap(p);
      await pressK(p); await sleep(750);
      const s1 = await snap(p);
      const win = await p.evaluate(() => SK.G.player._wk.t);
      await tank(p); await p.evaluate(() => { window._skHits = []; });
      await pressK(p); await sleep(800);
      const s2 = await snap(p);
      await tank(p); await p.evaluate(() => { window._skHits = []; SK.G.enemies.forEach(e => { e.st = 'idle'; e.stT = 99; }); });
      await pressK(p); await sleep(200);
      await seq(p, 'fighter_1', 6, 60);
      await sleep(600);
      const s3 = await snap(p);
      check('fighter whirlwind_kick: ' + r.max + ' lượt [ĐO], mỗi đoạn tốn một lượt', a.ch && a.ch.max === r.max && s1.ch.n === r.max - 1 && s2.ch.n === r.max - 2 && s3.ch.n === 0, JSON.stringify([a.ch, s1.ch, s2.ch, s3.ch]));
      check('fighter whirlwind_kick: cửa sổ chờ đoạn kế 5 s [ĐO multiDuration 5,5,5]', win > 4 && win <= 5, 'còn ' + win.toFixed(2) + ' s sau đoạn 1');
      check('fighter whirlwind_kick: đoạn 1 ' + cf.Skill2Kick1DmgValue + ' sát thương + choáng ' + cf.Skill2Kick1DizzyTime + ' s [ĐO]', hitsOf(s1, 'kick').length >= 1 && hitsOf(s1, 'kick').every(d => d === cf.Skill2Kick1DmgValue) && s1.stun >= 1, 'đòn ' + hitsOf(s1, 'kick').join(',') + ' · choáng ' + s1.stun);
      check('fighter whirlwind_kick: đoạn 2 ' + cf.Skill2Kick2DmgValue + ' sát thương [ĐO]', hitsOf(s2, 'kick').length >= 1 && hitsOf(s2, 'kick').every(d => d === cf.Skill2Kick2DmgValue), 'đòn ' + hitsOf(s2, 'kick').join(','));
      check('fighter whirlwind_kick: đoạn 3 đá quét ' + cf.Skill2Kick3DmgValue + ' [ĐO], không có gió whirl_wind (chỉ sinh khi có buff 2101)', hitsOf(s3, 'kick').length >= 1 && hitsOf(s3, 'kick').every(d => d === cf.Skill2Kick3DmgValue) && hitsOf(s3, 'wind').length === 0, 'quét ' + hitsOf(s3, 'kick').join(',') + ' · gió ' + hitsOf(s3, 'wind').join(','));
    }
  };
};
