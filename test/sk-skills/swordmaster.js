// Kiểm thử Kiếm Tông (c28): 3 kỹ năng, số đọc từ hero.json C29SkillSetting (đã ghi vào js/skills/swordmaster.js).
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }));
  // Người chơi trúng đòn thử: false = bị chặn.
  const poke = p => p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
  const has = (arr, v) => arr.some(d => d === v || d === v * 2 || d === v * 1.5);   // trừ chí mạng
  return {
    async 'swordmaster/0'(p, id) {
      const r = await real(p, 'swordmaster', 'tempest_blade');
      await tough(p); await standNear(p, 60);
      const a = await snap(p);
      await pressK(p); await sleep(120);
      const blocked = (await poke(p)) === false;
      await seq(p, 'swordmaster_0', 6, 60);
      await until(p, () => SK.G.player.skillT <= 0, null, 3000);
      const s = await snap(p);
      const sk = hitsOf(s, 'skill');
      check('swordmaster tempest_blade: chém 6 [ĐO baseDamage] + sóng kiếm 8 [ĐO flySlashDamage]', has(sk, 6) && has(sk, 8), 'đòn ' + sk.join(','));
      check('swordmaster tempest_blade: bất tử suốt lúc chém [ĐO "không chịu DMG"]', blocked);
      check('swordmaster tempest_blade: lướt về phía quái rồi lùi, cd ' + r.cd + ' s [ĐO]', s.cd === r.cd && Math.hypot(s.px - a.px, s.py - a.py) > 8, 'dời ' + Math.round(Math.hypot(s.px - a.px, s.py - a.py)) + ' px · skillCd ' + s.skillCd.toFixed(2));
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
      await until(p, () => SK.G._sm.swords.some(s => s.st === 'back'), null, 1500);
      const back = await p.evaluate(() => SK.G._sm.swords.filter(s => s.st === 'back').length);
      await until(p, () => SK.G._sm.swords.length === 0 && SK.G.player.skillT <= 0, null, 3000);
      const s3 = await snap(p);
      check('swordmaster wisps: ' + r.max + ' lượt [ĐO], lượt 1 còn ' + (r.max - 1) + ', chém 6 [ĐO baseDamage]', a.ch.max === r.max && s1.ch.n === r.max - 1 && stage1 === 1 && has(hitsOf(s1, 'skill'), 6), JSON.stringify(s1.ch) + ' đòn ' + hitsOf(s1, 'skill').join(','));
      check('swordmaster wisps: giai đoạn 1 và 2 mỗi lần bắn 3 phi kiếm [ĐO flySwordEndCount], kiếm đứng lại', n1 === 3 && n2 === 6, 'đứng ' + n1 + ' → ' + n2);
      check('swordmaster wisps: giai đoạn 3 lướt + triệu hồi mọi phi kiếm về, hết lượt, hồi ' + r.cd + ' s', stage3 === 3 && back === 6 && s3.ch.n === 0 && s3.skillCd > 0 && s3.skillCd <= r.cd, 'giai đoạn ' + stage3 + ' · kiếm bay về ' + back + ' · ' + JSON.stringify(s3.ch) + ' · skillCd ' + s3.skillCd.toFixed(2));
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
      await sleep(300); await pressK(p); await sleep(300);
      const blocked = (await poke(p)) === false;
      await seq(p, 'swordmaster_2b', 6, 150);
      await until(p, () => SK.G.player.skillT <= 0, null, 5000);
      const s3 = await snap(p);
      const pts3 = await p.evaluate(() => SK.G._sm.pts.length);
      const sk = hitsOf(s3, 'skill');
      check('swordmaster blinkblade: ' + r.max + ' lượt [ĐO], chém ngang 3 [ĐO baseDamage3], mỗi lượt 1-2 rơi một điểm kiếm', stage1 === 1 && s1.ch.n === r.max - 1 && pts1 === 1 && pts2 === 2 && has(hitsOf(s1, 'skill'), 3), 'điểm ' + pts1 + ' → ' + pts2 + ' · ' + hitsOf(s1, 'skill').join(','));
      check('swordmaster blinkblade: lượt 3 lao qua mọi điểm (3 + 2 [ĐO swordPointDamage / swordCutComboDamage]), đường chém 3, thu hết điểm', pts3 === 0 && has(sk, 3) && has(sk, 2), 'điểm còn ' + pts3 + ' · đòn ' + sk.join(','));
      check('swordmaster blinkblade: bất tử lúc lao, hết lượt, cd ' + r.cd + ' s [ĐO]', blocked && s3.ch.n === 0 && s3.cd === r.cd && s3.skillCd > 0, JSON.stringify(s3.ch) + ' skillCd ' + s3.skillCd.toFixed(2));
    }
  };
};
