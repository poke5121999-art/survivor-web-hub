// Ca kiểm Chiêm Tinh Sư (c32): Mưa Sao Băng, Bánh Xe Vận Mệnh — số [ĐO] từ ctrlFields C33Controller, prefab buff_astrologist và mã IL2CPP (sk_method.py); mỗi số dưới đây là giá trị đo.
module.exports = h => {
  const tank = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp = 9999; }));
  // đếm số hiệu ứng thật đã sinh ra theo tên
  const spy = p => p.evaluate(() => { window._sp = {}; if (!SK.vfx._spawn0) { SK.vfx._spawn0 = SK.vfx.spawn; SK.vfx.spawn = function (G, name, ...a) { window._sp[name] = (window._sp[name] || 0) + 1; return SK.vfx._spawn0.call(this, G, name, ...a); }; } });
  return {
    async 'astrologist/0'(p, id) {
      const r = await h.real(p, 'astrologist', 'starfall_surge');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.astrologist.ctrlFields);
      await spy(p);
      await h.standNear(p, 60); await tank(p);
      const a = await h.snap(p);
      await h.pressK(p); await h.sleep(150);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      const s = await h.snap(p);
      await h.seq(p, 'astrologist_0', 6, 60);
      await h.sleep(500);
      const s2 = await h.snap(p);
      const stars = await p.evaluate(() => window._sp.astrologist_star || 0);
      h.check('astrologist starfall_surge: ' + r.dur + ' s, bất tử, chạy ×' + (1 + cf.addSpeedRate) + ', hồi ' + r.cd + ' s [ĐO]', imm === false && h.near(s.move, 1 + cf.addSpeedRate, 0.01) && s.cd === r.cd && s.skillT > 0, 'move ' + s.move + ' · skillT ' + s.skillT.toFixed(2));
      h.check('astrologist starfall_surge: sinh ' + (cf.extraStarCount + 3) + ' sao (extraStarCount ' + cf.extraStarCount + ' + 3 khi nâng cấp) [ĐO StarDash]', stars === cf.extraStarCount + 3, 'sinh ' + stars);
      const d = h.hitsOf(s2, 'star');
      h.check('astrologist starfall_surge: sao băng trúng quái ' + cf.starDashDamage + ', xuyên nhiều quái [ĐO starDashDamage, starThroughCount]', d.length >= 4 && d.every(x => x === cf.starDashDamage || x === cf.starDashDamage * 2), 'đòn ' + d.join(','));
      // Lời Nguyền: 3 lượt trúng (mỗi lần cách ≥ 0,033 s) thì bỏ nguyền và rơi sao, +1 Tinh Năng; thời hạn 6 s
      await p.evaluate(() => { const G = SK.G; G.player._as.en = 0; G.enemies.forEach(e => { e._curse = null; }); });
      await tank(p); await h.resetDmg(p);
      const hitOnce = () => p.evaluate(() => { const G = SK.G, e = G.enemies.find(e => e.st !== 'dead'); SK.skillKit.hit(G, G.player, e, 3, { tag: 'star' }); return e._curse ? { n: e._curse.n, t: e._curse.t } : null; });
      const c1 = await hitOnce(); await h.sleep(80);
      const c2 = await hitOnce(); await h.sleep(80);
      const c3 = await hitOnce();
      await h.sleep(900);
      const s3 = await h.snap(p);
      const en = await p.evaluate(() => SK.G.player._as.en);
      h.check('astrologist Lời Nguyền: hạn ' + 6 + ' s [ĐO buff_astrologist.buff_time], 3 lượt thì bỏ nguyền [ĐO maxCount]', c1 && c1.n === 1 && h.near(c1.t, 6, 0.1) && c2.n === 2 && c3 === null, JSON.stringify([c1, c2, c3]));
      h.check('astrologist Lời Nguyền: đủ 3 lượt → sao rơi ' + cf.starFallDamage + ' và +1 Tinh Năng [ĐO CreateStar/starFallDamage]', h.hitsOf(s3, 'fall').length >= 1 && h.hitsOf(s3, 'fall').every(x => x === cf.starFallDamage || x === cf.starFallDamage * 2) && en === 1, 'đòn ' + h.hitsOf(s3, 'fall').join(',') + ' · Tinh Năng ' + en);
      // Đòn đánh thường không cộng Tinh Năng
      await p.evaluate(() => { const G = SK.G; G.player._as.en = 0; SK.emit('enemyHit', G, G.enemies.find(e => e.st !== 'dead'), 2, false); });
      const en0 = await p.evaluate(() => SK.G.player._as.en);
      h.check('astrologist Tinh Năng: đòn thường không cộng [ĐO AddPassiveEnergy chỉ gọi từ sao rơi / bánh]', en0 === 0, String(en0));
      // Tinh Năng đầy: vùng chiêm tinh 66 + xóa đạn + mỗi quái bị nguyền nhận sao rơi 5 (và +1 Tinh Năng mỗi sao)
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl._as.en = 33; pl.skillCd = 0; pl.skillT = 0; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 40, y: pl.y - 7, h: 8, vx: 0, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 9, _probe: 1 }); G.enemies.forEach(e => { if (e.st !== 'dead') e._curse = { n: -99, t: 9, gap: 0, h: null }; }); });
      await h.standNear(p, 50); await tank(p); await h.resetDmg(p);
      const cursed = await p.evaluate(() => SK.G.enemies.filter(e => e._curse).length);
      await h.pressK(p);
      const left = await p.evaluate(() => ({ en: SK.G.player._as.en, probe: SK.G.bullets.some(b => b._probe) }));   // ngay lúc bắt đầu, trước khi sao mới nguyền lại
      await h.sleep(900);
      const s4 = await h.snap(p);
      h.check('astrologist starfall_surge: đủ Tinh Năng → vùng chiêm tinh ' + cf.starPassiveDamage + ' + sao rơi ' + cf.starFallDamage + ' lên mọi quái nguyền, xóa đạn, Tinh Năng còn ' + cursed + ' [ĐO Skill0PassiveEffect]', left.en === cursed && !left.probe && h.hitsOf(s4, 'area').some(x => x === cf.starPassiveDamage || x === cf.starPassiveDamage * 2) && h.hitsOf(s4, 'fall').some(x => x === cf.starFallDamage || x === cf.starFallDamage * 2), 'Tinh Năng ' + left.en + '/' + cursed + ' · đạn ' + left.probe + ' · vùng ' + h.hitsOf(s4, 'area').join(',') + ' · rơi ' + h.hitsOf(s4, 'fall').join(','));
    },
    async 'astrologist/1'(p, id) {
      const r = await h.real(p, 'astrologist', 'rota_fortunae');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.astrologist.ctrlFields);
      await h.standNear(p, 55); await tank(p);
      await p.evaluate(() => { SK.G.player._as.en = 0; });
      const a = await h.snap(p);
      await h.pressK(p); await h.sleep(900);
      const s = await h.snap(p);
      await h.seq(p, 'astrologist_1', 6, 100);
      const w = await p.evaluate(() => { const w = SK.G.player._wheel; return w ? { x: w.x, y: w.y, scale: w.scale } : null; });
      const d = h.hitsOf(s, 'wheel');
      h.check('astrologist rota_fortunae: ' + r.dur + ' s, hồi ' + r.cd + ' s [ĐO]; bánh xe bay ra', !!w && s.cd === r.cd && s.skillT > r.dur - 1.5, 'skillT ' + s.skillT.toFixed(2) + ' · ' + JSON.stringify(w));
      h.check('astrologist rota_fortunae: thân bánh ' + cf.skill1Damage + ' / kim ' + cf.skill1PointDamage + ' [ĐO]', d.length >= 1 && d.every(x => x === cf.skill1Damage || x === cf.skill1PointDamage || x === cf.skill1Damage * 2 || x === cf.skill1PointDamage * 2), 'đòn ' + d.join(','));
      const s1 = await h.snap(p), en = await p.evaluate(() => SK.G.player._as.en);
      const nw = h.hitsOf(s1, 'wheel').length, nx = h.hitsOf(s1, 'wheelx').length;
      h.check('astrologist rota_fortunae: mỗi lần bánh trúng +1 Tinh Năng, mỗi đòn thêm +1 [ĐO Skill2HitEnemy, CreateAstrolabeBullet]', nw >= 1 && en >= nw && en <= nw + nx, 'Tinh Năng ' + en + ' · đòn bánh ' + nw + ' · đòn thêm ' + nx);
      // đủ 3 lượt nguyền bằng Bánh Xe: bánh thêm ×1,1, quay +60, bay thêm 0,125 s, gây thêm 12
      await h.resetDmg(p);
      await p.evaluate(() => { const G = SK.G; G.enemies.forEach(e => { e._curse = null; }); });
      const before = await p.evaluate(() => { const w = SK.G.player._wheel; return { scale: w.scale, rot: w.rot, fly: w.fly, en: SK.G.player._as.en }; });
      for (let i = 0; i < 3; i++) { await p.evaluate(() => { const G = SK.G, e = G.enemies.find(e => e.st !== 'dead'); SK.skillKit.hit(G, G.player, e, 1, { tag: 'wheel' }); }); await h.sleep(80); }
      await h.sleep(200);
      const after = await p.evaluate(() => { const w = SK.G.player._wheel; return { scale: w.scale, rot: w.rot, fly: w.fly }; });
      const sx = await h.snap(p);
      h.check('astrologist rota_fortunae: Lời Nguyền đủ lượt → bánh ×' + cf.astrolabeAddSizeFactor + ', quay +' + cf.skill1RotateAddSpeed + ', bay +' + cf.skill1FlyTimeAdd + ' s [ĐO TryEnlargeAstrolabe]', h.near(after.scale, before.scale * cf.astrolabeAddSizeFactor, 0.001) && after.rot === before.rot + cf.skill1RotateAddSpeed && h.near(after.fly, before.fly + cf.skill1FlyTimeAdd, 0.001), JSON.stringify([before, after]));
      h.check('astrologist rota_fortunae: đòn thêm của bánh ' + cf.skill1Damage + ' [ĐO CreateAstrolabeBullet]', h.hitsOf(sx, 'wheelx').length >= 1 && h.hitsOf(sx, 'wheelx').every(x => x === cf.skill1Damage || x === cf.skill1Damage * 2), 'đòn ' + h.hitsOf(sx, 'wheelx').join(','));
      // bấm lần nữa: thu hồi bánh, xong thì hồi chiêu
      await h.pressK(p);
      await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
      const e = await h.snap(p);
      h.check('astrologist rota_fortunae: bấm lần nữa thu hồi bánh, rồi hồi chiêu ' + r.cd + ' s', e.skillT <= 0 && e.skillCd > r.cd - 1.5, 'skillCd ' + e.skillCd.toFixed(2));
      // đủ Tinh Năng: bánh lớn ×1.5
      await p.evaluate(() => { const pl = SK.G.player; pl._as.en = 66; pl.skillCd = 0; });
      await h.pressK(p); await h.sleep(100);
      const big = await p.evaluate(() => ({ scale: SK.G.player._wheel && SK.G.player._wheel.scale, en: SK.G.player._as.en }));
      h.check('astrologist rota_fortunae: đủ Tinh Năng → bánh to ×' + cf.skill1MaxScale + ', tiêu hết Tinh Năng [ĐO skill1MaxScale]', big.scale === cf.skill1MaxScale && big.en <= 4, JSON.stringify(big));
    }
  };
};
