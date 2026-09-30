// Ca kiểm Đạo Sĩ Âm Dương (c39): số đọc từ ctrlFields skill0* [ĐO].
module.exports = h => {
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp += 400; }));
  return {
    async 'yinyang/0'(p) {
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.yinyang.ctrlFields);
      await tough(p); await h.standNear(p, 50);
      await h.pressK(p); await h.sleep(120);
      const yy0 = await p.evaluate(() => ({ yin: SK.G.player._yy.yin, yang: SK.G.player._yy.yang, win: SK.G.player._yy.winT }));
      await h.sleep(780);
      const a = await h.snap(p);
      const fu = await p.evaluate(() => ({ n: SK.G.player._yy.fus.length, stuck: SK.G.player._yy.fus.filter(f => f.st === 'stuck').length }));
      await h.seq(p, 'yinyang_0', 6, 50);
      h.check('yinyang Phù: ' + cf.yinFuCount + ' lá phù, mỗi lá ' + cf.skill0YinFuDamage + ' sát thương + bám quái [ĐO ctrlFields], hồi ' + cf.skill0YinBaseCooldown + ' s', fu.n === cf.yinFuCount && fu.stuck === cf.yinFuCount && h.hitsOf(a, 'yin').length === cf.yinFuCount && h.hitsOf(a, 'yin').every(d => d === cf.skill0YinFuDamage), JSON.stringify(fu) + ' · đòn ' + h.hitsOf(a, 'yin').join(',') + ' · cd ' + a.skillCd.toFixed(2));
      h.check('yinyang Phù: hồi chiêu ' + cf.skill0YinBaseCooldown + ' s [ĐO skill0YinBaseCooldown]', h.near(a.skillCd, cf.skill0YinBaseCooldown - 0.9, 0.4), 'skillCd ' + a.skillCd.toFixed(2));
      h.check('yinyang: Âm/Dương bắt đầu 50/50 [ĐO SetUpChar]; dùng Phù: Âm +10, Dương −10 [ĐO UpdateYinYangValue(10, −10)]; Âm > 50 → buff phù ' + 1 + ' s [ĐO AddBulletBuff]', yy0.yin === 60 && yy0.yang === 40 && yy0.win > 0 && yy0.win <= 1, JSON.stringify(yy0));
      // Quyền là nút đặc biệt (L) [ĐO ButtonGroup: hai nút Âm/Dương], hồi chiêu riêng; lao rồi nổ sau punchDelay.
      await h.resetDmg(p);
      await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL'); await h.sleep(600);
      await h.seq(p, 'yinyang_0b', 6, 50);
      const b = await h.snap(p);
      const ys = h.hitsOf(b, 'yang'), yc = h.hitsOf(b, 'yang_combo'), yy1 = await p.evaluate(() => ({ yin: SK.G.player._yy.yin, yang: SK.G.player._yy.yang, cd: SK.G.player._yy.yangCd }));
      h.check('yinyang Quyền (L): lao + nổ diện rộng ' + cf.skill0DashDamage + ', quái có phù kích thêm nhát tổ hợp ' + cf.skill0ComboDamage + ' và làm mới hồi chiêu Dương [ĐO]; Âm −10, Dương +10', ys.length > 0 && ys.every(d => d === cf.skill0DashDamage || d === cf.skill0DashDamage * 2) && yc.length > 0 && yc.every(d => d === cf.skill0ComboDamage || d === cf.skill0ComboDamage * 2) && yy1.yin === 50 && yy1.yang === 50 && yy1.cd === 0, 'đòn ' + ys.join(',') + ' · tổ hợp ' + yc.join(',') + ' · ' + JSON.stringify(yy1));
      // Âm đầy (100): lần dùng Phù kế tiếp thu phù thành bão, Âm +10 vượt 100 nên cả hai về 50 [ĐO UpdateYinYangValue].
      await p.evaluate(() => { const pl = SK.G.player; pl._yy.yin = 100; pl._yy.yang = 0; pl.skillCd = 0; });
      await h.resetDmg(p);
      await h.pressK(p); await h.sleep(500);
      const st = await p.evaluate(() => ({ yin: SK.G.player._yy.yin, yang: SK.G.player._yy.yang, storm: !!SK.G.player._yy.storm, recall: SK.G.player._yy.fus.filter(f => f.st === 'recall').length }));
      await h.seq(p, 'yinyang_0c', 6, 60);
      await h.sleep(1500);
      const c = await h.snap(p);
      h.check('yinyang Âm 100: thu phù thành bão, Âm và Dương về 50', st.yin === 50 && st.yang === 50 && st.storm && st.recall > 0 && h.hitsOf(c, 'yin_storm').length > 0, JSON.stringify(st) + ' · bão ' + h.hitsOf(c, 'yin_storm').join(','));
      // Dương đầy (100): L tung chuỗi punchMaxCount quyền, cả hai về 50; phím Q (đổi súng) không dùng chiêu.
      await p.evaluate(() => { const pl = SK.G.player; pl._yy.yin = 0; pl._yy.yang = 100; pl._yy.yangCd = 0; pl._yy.dash = null; });
      await p.keyboard.down('KeyQ'); await h.sleep(60); await p.keyboard.up('KeyQ'); await h.sleep(80);
      const noQ = await p.evaluate(() => !SK.G.player._yy.dash);
      await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL'); await h.sleep(60);
      const ch = await p.evaluate(() => ({ yin: SK.G.player._yy.yin, yang: SK.G.player._yy.yang, left: SK.G.player._yy.dash && SK.G.player._yy.dash.left }));
      h.check('yinyang Dương 100: L tung chuỗi ' + cf.punchMaxCount + ' quyền, Âm/Dương về 50; Q không dùng chiêu', noQ && ch.yin === 50 && ch.yang === 50 && ch.left >= cf.punchMaxCount - 1, JSON.stringify(ch));
    }
  };
};
