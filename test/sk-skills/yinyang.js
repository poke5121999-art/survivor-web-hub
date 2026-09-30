// Ca kiểm Đạo Sĩ Âm Dương (c39): số đọc từ ctrlFields skill0* [ĐO].
module.exports = h => {
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp += 400; }));
  return {
    async 'yinyang/0'(p) {
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.yinyang.ctrlFields);
      await tough(p); await h.standNear(p, 50);
      await h.pressK(p); await h.sleep(900);
      const a = await h.snap(p);
      const fu = await p.evaluate(() => ({ n: SK.G.player._yy.fus.length, stuck: SK.G.player._yy.fus.filter(f => f.st === 'stuck').length }));
      await h.seq(p, 'yinyang_0', 6, 50);
      h.check('yinyang Phù: ' + cf.yinFuCount + ' lá phù, mỗi lá ' + cf.skill0YinFuDamage + ' sát thương + bám quái [ĐO ctrlFields], hồi ' + cf.skill0YinBaseCooldown + ' s', fu.n === cf.yinFuCount && fu.stuck === cf.yinFuCount && h.hitsOf(a, 'yin').length === cf.yinFuCount && h.hitsOf(a, 'yin').every(d => d === cf.skill0YinFuDamage), JSON.stringify(fu) + ' · đòn ' + h.hitsOf(a, 'yin').join(',') + ' · cd ' + a.skillCd.toFixed(2));
      h.check('yinyang Phù: hồi chiêu ' + cf.skill0YinBaseCooldown + ' s [ĐO skill0YinBaseCooldown]', h.near(a.skillCd, cf.skill0YinBaseCooldown - 0.9, 0.4), 'skillCd ' + a.skillCd.toFixed(2));
      await h.resetDmg(p);
      await h.pressK(p); await h.sleep(600);
      await h.seq(p, 'yinyang_0b', 6, 50);
      const b = await h.snap(p);
      const ys = h.hitsOf(b, 'yang');
      h.check('yinyang Quyền: lao + nổ diện rộng ' + cf.skill0DashDamage + ' (+' + (cf.skill0PunchDamage + cf.skill0PunchDamageStrengthenAdd) + ' nếu quái có phù) [ĐO], làm mới hồi chiêu', ys.length > 0 && ys.every(d => [cf.skill0DashDamage, cf.skill0DashDamage + 6, cf.skill0DashDamage * 2, (cf.skill0DashDamage + 6) * 2].indexOf(d) >= 0) && ys.some(d => d === cf.skill0DashDamage + 6 || d === (cf.skill0DashDamage + 6) * 2) && b.skillCd < 0.2, 'đòn ' + ys.join(',') + ' · skillCd ' + b.skillCd.toFixed(2));
      // Âm đầy: lần dùng kế tiếp thu phù thành bão, Âm về 50.
      await p.evaluate(() => { const pl = SK.G.player; pl._yy.yin = 100; pl.skillCd = 0; });
      await h.resetDmg(p);
      await h.pressK(p); await h.sleep(500);
      const st = await p.evaluate(() => ({ yin: SK.G.player._yy.yin, storm: !!SK.G.player._yy.storm, recall: SK.G.player._yy.fus.filter(f => f.st === 'recall').length }));
      await h.seq(p, 'yinyang_0c', 6, 60);
      await h.sleep(1500);
      const c = await h.snap(p);
      h.check('yinyang Âm 100: thu phù thành bão, Âm giảm về 50', st.yin === 50 && st.storm && st.recall > 0 && h.hitsOf(c, 'yin_storm').length > 0, JSON.stringify(st) + ' · bão ' + h.hitsOf(c, 'yin_storm').join(','));
    }
  };
};
