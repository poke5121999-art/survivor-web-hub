// Kiểm thử Kiếm Tông (c28): 3 kỹ năng + nội tại Kiếm Khí. Số đọc từ hero.json C29SkillSetting và mã C29Controller (sk_method.py),
// ghi nguyên văn trong js/skills/swordmaster.js.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
  // Quái trâu, người chơi không chí mạng để số sát thương đọc ra là số gốc.
  const tough = p => p.evaluate(() => { SK.G.player.crit = 0; SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }); });
  // Người chơi trúng đòn thử: false = bị chặn.
  const poke = p => p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
  const has = (arr, v) => arr.some(d => d === v);
  const qiOf = p => p.evaluate(() => SK.G.player._smQi || 0);
  const setQi = (p, v) => p.evaluate(v => { SK.G.player._smQi = v; }, v);
  return {
    async 'swordmaster/0'(p, id) {
      const r = await real(p, 'swordmaster', 'tempest_blade');
      await tough(p); await standNear(p, 60);
      const a = await snap(p);
      await pressK(p); await sleep(120);
      const blocked = (await poke(p)) === false;
      const n1 = await p.evaluate(() => SK.G.player._tb.n);
      await seq(p, 'swordmaster_0', 6, 60);
      await until(p, () => SK.G.player.skillT <= 0, null, 3000);
      const s = await snap(p);
      const sk = hitsOf(s, 'skill'), q1 = await qiOf(p);
      check('swordmaster tempest_blade: chém 6 [ĐO baseDamage], không đầy Kiếm Khí thì không có sóng kiếm 8 / đại kiếm 12 [ĐO IESkill0 nhánh isFull]', has(sk, 6) && !has(sk, 8) && !has(sk, 12), 'đòn ' + sk.join(','));
      check('swordmaster tempest_blade: bất tử suốt lúc chém [ĐO "không chịu DMG"], chém lùi 2 nhát [ĐO backSlashCount]', blocked && n1 === 2, 'chém lùi ' + n1);
      check('swordmaster tempest_blade: lướt về phía quái rồi lùi, cd ' + r.cd + ' s [ĐO]; xong +5 Kiếm Khí [ĐO _skillGetPower]', s.cd === r.cd && Math.hypot(s.px - a.px, s.py - a.py) > 8 && q1 === 5, 'dời ' + Math.round(Math.hypot(s.px - a.px, s.py - a.py)) + ' px · skillCd ' + s.skillCd.toFixed(2) + ' · Kiếm Khí ' + q1);
      // Đầy Kiếm Khí (30 [ĐO MaxSwordPower]): tiêu hết, chém lùi 2+2, sóng kiếm 8 ×3 sóng, đại kiếm 8×1.5 = 12.
      await p.evaluate(() => { const pl = SK.G.player; pl._smQi = 30; pl.skillCd = 0; });
      await standNear(p, 60); await resetDmg(p);
      await pressK(p); await sleep(80);
      const n2 = await p.evaluate(() => SK.G.player._tb.n), q2 = await qiOf(p);
      await seq(p, 'swordmaster_0b', 6, 90);
      await until(p, () => SK.G.player.skillT <= 0, null, 4000);
      await sleep(400);   // đại kiếm chạm đất bigSworddelayShow 0.2 s sau nhát cuối
      const s2 = await snap(p), sk2 = hitsOf(s2, 'skill'), q3 = await qiOf(p);
      check('swordmaster tempest_blade: đầy Kiếm Khí → tiêu hết lúc bắt đầu, chém lùi 2+2 [ĐO upgradeAdd], xong còn 5', q2 === 0 && n2 === 4 && q3 === 5, 'lúc bắt đầu ' + q2 + ' · chém lùi ' + n2 + ' · cuối ' + q3);
      check('swordmaster tempest_blade: đầy Kiếm Khí → sóng kiếm 8 [ĐO flySlashDamage] và đại kiếm 12 [ĐO ×bigSwordDamageFactor 1.5]', has(sk2, 6) && has(sk2, 8) && has(sk2, 12), 'đòn ' + sk2.join(','));
    },
    async 'swordmaster/1'(p, id) {
      const r = await real(p, 'swordmaster', 'wisps_of_clouds');
      await tough(p); await standNear(p, 70);
      const a = await snap(p);
      await pressK(p); await sleep(150);
      const stage1 = await p.evaluate(() => SK.G.player.skillT > 0 && SK.G.player._wc.stage);
      await seq(p, 'swordmaster_1', 6, 60);
      await sleep(250);
      await seq(p, 'swordmaster_1b', 6, 70);
      await sleep(300);
      const s1 = await snap(p);
      const n1 = await p.evaluate(() => SK.G._sm.swords.filter(s => s.st === 'stand').length);
      await sleep(400); await pressK(p); await sleep(900);
      const n2 = await p.evaluate(() => SK.G._sm.swords.filter(s => s.st === 'stand').length);
      const s2 = await snap(p);
      await sleep(300); await pressK(p); await sleep(60);
      const stage3 = await p.evaluate(() => SK.G.player._wc && SK.G.player._wc.stage);
      const blocked = (await poke(p)) === false;
      await until(p, () => SK.G._sm.swords.some(s => s.st === 'turn' || s.st === 'back'), null, 1500);
      const back = await p.evaluate(() => SK.G._sm.swords.filter(s => s.st === 'turn' || s.st === 'back').length);
      await until(p, () => SK.G._sm.swords.length === 0 && SK.G.player.skillT <= 0, null, 3000);
      const s3 = await snap(p), q = await qiOf(p);
      check('swordmaster wisps: ' + r.max + ' lượt [ĐO], lượt 1 còn ' + (r.max - 1) + ', chém 8 [ĐO _slashDamage] + phi kiếm chạm 3 [ĐO _flySwordDamage]', a.ch.max === r.max && s1.ch.n === r.max - 1 && stage1 === 1 && has(hitsOf(s1, 'skill'), 8) && has(hitsOf(s1, 'skill'), 3), JSON.stringify(s1.ch) + ' đòn ' + hitsOf(s1, 'skill').join(','));
      check('swordmaster wisps: mỗi lượt 1-2 có 3 phi kiếm tới + 3 phi kiếm vòng [ĐO flySwordCount / flySwordEndCount], đứng lại', n1 === 6 && n2 === 12, 'đứng ' + n1 + ' → ' + n2);
      check('swordmaster wisps: lượt 3 triệu hồi mọi phi kiếm về lúc bắt đầu lướt, +5 +5 Kiếm Khí [ĐO], hết lượt, hồi ' + r.cd + ' s', stage3 === 3 && back === 12 && q === 10 && s3.ch.n === 0 && s3.skillCd > 0 && s3.skillCd <= r.cd, 'giai đoạn ' + stage3 + ' · kiếm bay về ' + back + ' · Kiếm Khí ' + q + ' · ' + JSON.stringify(s3.ch) + ' · skillCd ' + s3.skillCd.toFixed(2));
      check('swordmaster wisps: lượt 3 vệt chém 6 [ĐO _tailDamage], bất tử lúc lướt', has(hitsOf(s3, 'skill'), 6) && blocked, 'đòn ' + hitsOf(s3, 'skill').join(','));
      // Đầy Kiếm Khí: +1 phi kiếm tới, +1 phi kiếm vòng, +2 vệt chém; lượt 3 tiêu hết rồi +5 +5.
      await p.evaluate(() => { const pl = SK.G.player; pl._smQi = 30; pl._ch.n = pl._ch.max; pl._ch.t = 0; pl.skillCd = 0; });
      await standNear(p, 70);
      await pressK(p); await sleep(700);
      const nf = await p.evaluate(() => SK.G._sm.swords.filter(s => s.st === 'stand').length);
      await p.evaluate(() => { const pl = SK.G.player; pl._ch.n = 1; pl.skillCd = 0; });
      await until(p, () => SK.G.player.skillT <= 0, null, 3000);
      await pressK(p); await sleep(60);
      const tr = await p.evaluate(() => ({ nT: SK.G.player._wc.nT, qi: SK.G.player._smQi }));
      await until(p, () => SK.G.player.skillT <= 0, null, 3000);
      const qf = await qiOf(p);
      check('swordmaster wisps: đầy Kiếm Khí → 4 + 4 phi kiếm, lượt 3 có 8 vệt chém, tiêu hết rồi +5 +5', nf === 8 && tr.nT === 8 && tr.qi === 5 && qf === 10, 'phi kiếm ' + nf + ' · vệt ' + tr.nT + ' · Kiếm Khí ' + tr.qi + ' → ' + qf);
    },
    async 'swordmaster/2'(p, id) {
      const r = await real(p, 'swordmaster', 'blinkblade_codex');
      await tough(p); await standNear(p, 50);
      await pressK(p); await sleep(150);
      const stage1 = await p.evaluate(() => SK.G.player._smBb.stage);
      await seq(p, 'swordmaster_2', 6, 60);
      await sleep(700);
      const s1 = await snap(p);
      const pts1 = await p.evaluate(() => SK.G._sm.pts.length);
      await sleep(300); await pressK(p); await sleep(800);
      const pts2 = await p.evaluate(() => SK.G._sm.pts.length);
      await resetDmg(p);
      await sleep(300); await pressK(p); await sleep(60);
      // Quãng lao: 0.2 s rồi ×0.8 mỗi điểm [ĐO IESkillLast2], 3 điểm + về chỗ cũ = 4 bước; skillT = chờ điểm rơi + các bước + 0.4 + 0.3.
      const sT = await p.evaluate(() => SK.G.player.skillT);
      const expT = 0.2 + (0.2 + 0.16 + 0.128 + 0.1024) + 0.4 + 0.3;
      await sleep(240);
      const blocked = (await poke(p)) === false;
      await seq(p, 'swordmaster_2b', 6, 150);
      await until(p, () => SK.G.player.skillT <= 0, null, 5000);
      const s3 = await snap(p);
      const pts3 = await p.evaluate(() => SK.G._sm.pts.length), q = await qiOf(p);
      const sk = hitsOf(s3, 'skill');
      check('swordmaster blinkblade: ' + r.max + ' lượt [ĐO], chém ngang 3 [ĐO baseDamage3], mỗi lượt 1-2 rơi một điểm kiếm', stage1 === 1 && s1.ch.n === r.max - 1 && pts1 === 1 && pts2 === 2 && has(hitsOf(s1, 'skill'), 3), 'điểm ' + pts1 + ' → ' + pts2 + ' · ' + hitsOf(s1, 'skill').join(','));
      check('swordmaster blinkblade: lượt 3 lao qua mọi điểm (3 + 2 [ĐO swordPointDamage / swordCutComboDamage]), đường chém 3, thu hết điểm; thời gian bước 0.2 × 0.8^k', pts3 === 0 && has(sk, 3) && has(sk, 2) && near(sT, expT, 0.12), 'điểm còn ' + pts3 + ' · đòn ' + sk.join(',') + ' · skillT ' + sT.toFixed(3) + ' / ' + expT.toFixed(3));
      check('swordmaster blinkblade: bất tử lúc lao, hết lượt, cd ' + r.cd + ' s [ĐO], xong +5 Kiếm Khí', blocked && s3.ch.n === 0 && s3.cd === r.cd && s3.skillCd > 0 && q === 5, JSON.stringify(s3.ch) + ' skillCd ' + s3.skillCd.toFixed(2) + ' · Kiếm Khí ' + q);
      // Đầy Kiếm Khí: thêm một loạt đường chém rộng (+0.4 s), tiêu hết rồi +5.
      await p.evaluate(() => { const pl = SK.G.player; pl._smQi = 30; pl._ch.n = 1; pl._ch.t = 0; pl.skillCd = 0; });
      await standNear(p, 50);
      await pressK(p); await sleep(60);
      const fT = await p.evaluate(() => ({ full: SK.G.player._smBb.full, skillT: SK.G.player.skillT, stage: SK.G.player._smBb.stage }));
      await until(p, () => SK.G.player.skillT <= 0, null, 5000);
      const qf = await qiOf(p);
      check('swordmaster blinkblade: đầy Kiếm Khí → lượt 3 thêm loạt đường chém thứ hai sau 0.4 s, tiêu hết rồi +5', fT.full && fT.stage === 3 && qf === 5 && fT.skillT > 0.4 + 0.3 + 0.2, 'skillT ' + fT.skillT.toFixed(2) + ' · Kiếm Khí → ' + qf);
    }
  };
};
