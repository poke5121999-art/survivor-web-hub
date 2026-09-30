// Ca kiểm Nhà Ảo Thuật (c34): shadow_crescendo, mirage_masque.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, pressK, seq, real, hitsOf } = h;
  const tank = p => p.evaluate(() => { const pl = SK.G.player; pl.crit = 0; SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }); });
  const jk = p => p.evaluate(() => { const s = SK.G.player._jk || {}; return { e: s.e, ph: (s.ph || []).filter(a => !a.gone).map(a => ({ temp: a.temp, fight: !!a.fight })), ult: !!s.ult, dash: (s.dash || []).length, hurt: Object.keys(SK.G.player._hurt || {}) }; });
  return {
    async 'joker/0'(p, id) {
      const r = await real(p, 'joker', 'shadow_crescendo');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.joker.ctrlFields);
      await standNear(p, 60); await tank(p);
      // Ảo ảnh nội tại: cứ 5 s một cái (tua nhanh đồng hồ).
      await p.evaluate(() => { const pl = SK.G.player; pl._jk = pl._jk || { ph: [], pt: 0, e: 0, dash: [] }; pl._jk.pt = 4.95; });
      await sleep(400);
      const j0 = await jk(p);
      check('joker shadow_crescendo: ảo ảnh nội tại xuất hiện sau ' + cf.passivePhantomCreatTime + ' s [ĐO passivePhantomCreatTime]', j0.ph.length === 1 && !j0.ph[0].temp, JSON.stringify(j0.ph));
      const a = await snap(p);
      await pressK(p); await sleep(60);
      const j1 = await jk(p);
      await sleep(500);
      const s = await snap(p);
      const j2 = await jk(p);
      await seq(p, 'joker_0', 6, 40);
      check('joker shadow_crescendo: ' + r.max + ' lượt [ĐO], dùng một lượt còn ' + (r.max - 1) + '; bất tử khi lao', a.ch && a.ch.max === r.max && s.ch.n === r.max - 1 && j1.hurt.indexOf('jdash') >= 0, JSON.stringify(s.ch) + ' · ' + j1.hurt.join(','));
      check('joker shadow_crescendo: đâm ' + cf.skill0SwordDamage + ' + chém ' + cf.skill0SlashDamage + ' [ĐO], lao xa ~5 ô', hitsOf(s, 'stab').some(d => d === cf.skill0SwordDamage) && hitsOf(s, 'slash').some(d => d === cf.skill0SlashDamage) && Math.hypot(s.px - a.px, s.py - a.py) > 50, 'đâm ' + hitsOf(s, 'stab').join(',') + ' · chém ' + hitsOf(s, 'slash').join(',') + ' · dời ' + Math.round(Math.hypot(s.px - a.px, s.py - a.py)));
      check('joker shadow_crescendo: mỗi lần dùng cộng ' + cf.skill0DeltaPassiveEnergy + ' điểm bùng nổ [ĐO skill0DeltaPassiveEnergy]', j2.e === cf.skill0DeltaPassiveEnergy, 'điểm ' + j2.e);
      // Kiếm Vũ: bùng nổ đầy -> 3 ảo ảnh tạm rồi tất cả lao.
      await standNear(p, 60); await tank(p);
      await p.evaluate(() => { SK.G.player._jk.e = 100; window._skHits = []; SK.G.player.skillCd = 0; });
      await sleep(300);
      await pressK(p); await sleep(150);
      const j3 = await jk(p);
      await sleep(600);
      const s3 = await snap(p);
      await seq(p, 'joker_0b', 6, 40);
      check('joker shadow_crescendo: đầy bùng nổ -> Kiếm Vũ tạo ' + cf.KageBunshinCount + ' ảo ảnh tạm [ĐO KageBunshinCount], thanh về 0', j3.ph.filter(x => x.temp).length === cf.KageBunshinCount && j3.e === 0, JSON.stringify(j3.ph) + ' · điểm ' + j3.e);
      check('joker shadow_crescendo: mọi ảo ảnh cùng chém (nhiều nhát chém hơn một lần dùng thường)', hitsOf(s3, 'slash').length >= 3, 'số nhát chém ' + hitsOf(s3, 'slash').length);
    },
    async 'joker/1'(p, id) {
      const r = await real(p, 'joker', 'mirage_masque');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.joker.ctrlFields);
      await standNear(p, 30); await tank(p);
      const a = await snap(p);
      await pressK(p); await sleep(150);
      const s = await snap(p);
      const armor = await p.evaluate(() => { const pl = SK.G.player, g = SK.G; pl.invulT = 0; const b = pl.armor; SK.hurtPlayer(g, 4); return [b, pl.armor]; });
      await sleep(500);
      const s2 = await snap(p);
      await seq(p, 'joker_1', 6, 60);
      check('joker mirage_masque: ' + r.max + ' lượt, tàng hình, chạy nhanh, vòng chém đầu ' + cf.slashDamage + ' [ĐO slashDamage]', a.ch.max === r.max && s.ch.n === r.max - 1 && s.hidden && s.move > 1 && hitsOf(s, 'circle').some(d => d === cf.slashDamage), 'ẩn ' + s.hidden + ' · move ' + s.move + ' · vòng ' + hitsOf(s, 'circle').join(','));
      check('joker mirage_masque: giảm sát thương (4 -> 2)', armor[0] - armor[1] === 2, 'giáp ' + armor.join('->'));
      check('joker mirage_masque: áo choàng quay quanh gây ' + cf.slashFlyDamage + ' mỗi nhịp [ĐO slashFlyDamage]', hitsOf(s2, 'cloak').length >= 2 && hitsOf(s2, 'cloak').every(d => d === cf.slashFlyDamage), 'nhịp ' + hitsOf(s2, 'cloak').join(','));
      await p.evaluate(() => { window._skHits = []; });
      await pressK(p); await sleep(200);
      const s3 = await snap(p);
      check('joker mirage_masque: bấm lại thu áo, hiện hình, vòng chém mở rộng ' + cf.slashDamage, !s3.hidden && s3.skillT === 0 && hitsOf(s3, 'circle').some(d => d === cf.slashDamage) && s3.move === 1, 'ẩn ' + s3.hidden + ' · vòng ' + hitsOf(s3, 'circle').join(','));
      // Chiêu cuối: thanh bùng nổ đầy.
      await standNear(p, 40); await tank(p);
      await p.evaluate(() => { SK.G.player._jk.e = 100; window._skHits = []; });
      await sleep(400);
      await pressK(p); await sleep(300);
      const j = await jk(p);
      await sleep(1500);
      const s4 = await snap(p);
      await seq(p, 'joker_1b', 6, 60);
      check('joker mirage_masque: đầy bùng nổ -> Chiêu Cuối gọi ' + cf.KageBunshinCount + ' ảo ảnh tạm áp sát quái, cùng chém', j.ult && j.ph.filter(x => x.fight).length === cf.KageBunshinCount && j.e === 0 && hitsOf(s4, 'phantom').length >= 1, JSON.stringify(j.ph) + ' · nhát ' + hitsOf(s4, 'phantom').join(','));
      await p.evaluate(() => { window._skHits = []; SK.G.player.skillCd = 0; });
      await sleep(300);
      await pressK(p); await sleep(1500);
      const j2 = await jk(p);
      const s5 = await snap(p);
      check('joker mirage_masque: bấm lại chiêu cuối -> ảo ảnh hoá áo choàng bay về, ' + cf.slashFlyDamage + ' sát thương', !j2.ult && j2.ph.filter(x => x.fight).length === 0 && hitsOf(s5, 'cloak').length >= 1 && hitsOf(s5, 'cloak').every(d => d === cf.slashFlyDamage), 'áo ' + hitsOf(s5, 'cloak').join(','));
    }
  };
};
