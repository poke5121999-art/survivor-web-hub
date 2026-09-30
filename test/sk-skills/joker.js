// Ca kiểm Nhà Ảo Thuật (c34): shadow_crescendo, mirage_masque.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, pressK, seq, real, hitsOf } = h;
  const pressL = async p => { await p.keyboard.down('KeyL'); await sleep(40); await p.keyboard.up('KeyL'); };
  const tank = p => p.evaluate(() => { const pl = SK.G.player; pl.crit = 0; SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }); });
  const jk = p => p.evaluate(() => { const s = SK.G.player._jk || {}; return { e: s.e, imm: s.imm, drain: s.drain, ph: (s.ph || []).filter(a => !a.gone).map(a => ({ temp: a.temp, fight: !!a.fight })), ult: !!s.ult, ready: !!SK.G.player._ultReady, dash: (s.dash || []).length, hurt: Object.keys(SK.G.player._hurt || {}) }; });
  // Đòn thử vào người chơi: trả về số giáp mất (0 nếu miễn sát thương).
  const poke = p => p.evaluate(() => { const g = SK.G, pl = g.player; pl.invulT = 0; const b = pl.armor; SK.hurtPlayer(g, 2); return b - pl.armor; });
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
      await pressK(p); await sleep(40);
      const j1 = await jk(p);
      const inv1 = await poke(p);
      await seq(p, 'joker_0', 6, 20);
      await sleep(300);
      const s = await snap(p);
      const j2 = await jk(p);
      const inv2 = await poke(p);
      const thr = hitsOf(s, 'thrust'), swd = hitsOf(s, 'sword');
      check('joker shadow_crescendo: ' + r.max + ' lượt [ĐO], dùng một lượt còn ' + (r.max - 1) + '; miễn sát thương 0,25 s [ĐO StartHitTrigger 0,25 trong Skill0Dash], sau đó nhận đòn', a.ch && a.ch.max === r.max && s.ch.n === r.max - 1 && j1.hurt.indexOf('jimm') >= 0 && inv1 === 0 && inv2 > 0, JSON.stringify(s.ch) + ' · ' + j1.hurt.join(',') + ' · mất giáp lúc 0,04 s ' + inv1 + ' / 0,55 s ' + inv2);
      check('joker shadow_crescendo: đâm ' + cf.skill0SlashDamage + ' tức thì rồi chém vòng ' + cf.skill0SwordDamage + ' hai nhịp cách ' + cf.skill0SwordDelay + ' s và ' + cf.skill0SwordDelayUpdate + ' s [ĐO Skill0Dash], lao 5 ô', thr.some(d => d === cf.skill0SlashDamage) && swd.filter(d => d === cf.skill0SwordDamage).length >= 2 && thr.every(d => d === cf.skill0SlashDamage || d === Math.round(cf.skill0SlashDamage * 0.35)) && Math.hypot(s.px - a.px, s.py - a.py) > 60 && Math.hypot(s.px - a.px, s.py - a.py) <= 5 * 16 + 4, 'đâm ' + thr.join(',') + ' · chém ' + swd.join(',') + ' · dời ' + Math.round(Math.hypot(s.px - a.px, s.py - a.py)));
      check('joker shadow_crescendo: mỗi lần dùng cộng ' + cf.skill0DeltaPassiveEnergy + ' điểm, thêm ' + cf.skill0DeltaPassiveEnergy + ' cho mỗi ảo ảnh tung theo (1 ảo ảnh -> ' + 2 * cf.skill0DeltaPassiveEnergy + ') [ĐO Skill0Dash]', j2.e === 2 * cf.skill0DeltaPassiveEnergy, 'điểm ' + j2.e);
      // Kiếm Vũ: bùng nổ đầy -> 3 ảo ảnh tạm rồi tất cả lao; thanh tụt đều về 0 trong 15 s, ảo ảnh ngoài chu kỳ 2,5 s không tung lại.
      await standNear(p, 60); await tank(p);
      await p.evaluate(() => { const pl = SK.G.player; pl._jk.e = 100; pl._jk.ph.forEach(a => { a.cdT = 0; }); pl.skillCd = 0; window._skHits = []; });
      await sleep(300);
      const a3 = await snap(p);
      await pressK(p); await sleep(150);
      const j3 = await jk(p);
      await seq(p, 'joker_0b', 6, 20);
      await sleep(300);
      const s3 = await snap(p);
      const j3b = await jk(p);
      const pth = hitsOf(s3, 'thrust');
      const fac = Math.min(1, 0.25 + 0.1 * 1);
      check('joker shadow_crescendo: đầy bùng nổ -> Kiếm Vũ tạo ' + cf.KageBunshinCount + ' ảo ảnh tạm [ĐO KageBunshinCount], thanh tụt về 0 trong ' + cf.timeLimitPhantomTime + ' s', j3.ph.filter(x => x.temp).length === cf.KageBunshinCount && j3.drain > cf.timeLimitPhantomTime - 1 && j3b.e < 100 && j3b.e > 80, JSON.stringify(j3.ph) + ' · tụt ' + j3b.e.toFixed(1));
      check('joker shadow_crescendo: ảo ảnh đâm ' + Math.round(cf.skill0SlashDamage * fac) + ' và chém ' + Math.round(cf.skill0SwordDamage * fac) + ' = sát thương x ' + fac + ' [ĐO GetSkill0SlashDamage: 0,25 + 0,1 x BigLevel 1]; người chơi vẫn 16/8, lao 5 ô', pth.some(d => d === cf.skill0SlashDamage) && pth.some(d => d === Math.round(cf.skill0SlashDamage * fac)) && hitsOf(s3, 'sword').some(d => d === Math.round(cf.skill0SwordDamage * fac)) && Math.hypot(s3.px - a3.px, s3.py - a3.py) <= 5 * 16 + 4, 'đâm ' + pth.join(',') + ' · chém ' + hitsOf(s3, 'sword').join(','));
    },
    async 'joker/1'(p, id) {
      const r = await real(p, 'joker', 'mirage_masque');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.joker.ctrlFields);
      await standNear(p, 30); await tank(p);
      const a = await snap(p);
      await pressK(p); await sleep(150);
      const s = await snap(p);
      const jm = await jk(p);
      const armor = await poke(p);
      await seq(p, 'joker_1', 6, 100);
      await until(p, () => SK.G.player.skillT === 0, null, 3000);
      const s2 = await snap(p);
      const armor2 = await poke(p);
      await sleep(500);
      const armor3 = await poke(p);
      const s2b = await snap(p);
      await seq(p, 'joker_1', 6, 60);
      check('joker mirage_masque: maxCount ' + r.max + ' không phải lượt (skillType 8: không có _ch) [ĐO get_hasMultiCount], tàng hình, chạy x1,5 [ĐO SetStealthEffect ChangeSpeed 0,5], vòng chém đầu ' + cf.slashDamage + ' [ĐO slashDamage]', a.ch === null && s.ch === null && s.hidden && s.move > 1.4 && hitsOf(s, 'circle').some(d => d === cf.slashDamage), 'ẩn ' + s.hidden + ' · move ' + s.move + ' · vòng ' + hitsOf(s, 'circle').join(','));
      check('joker mirage_masque: MIỄN sát thương (không phải giảm) trong 2 s [ĐO SetStealthEffect(2) -> StartHitTrigger]: đòn 2 không mất giáp lúc 0,15 s', armor === 0 && jm.imm > 1.5, 'mất giáp ' + armor + ' · còn ' + (jm.imm || 0).toFixed(2) + ' s');
      const cl = hitsOf(s2, 'cloak');
      check('joker mirage_masque: áo choàng quỹ đạo elip thu nhỏ chạm quái gây ' + cf.slashFlyDamage + ' mỗi lần vào vùng [ĐO slashFlyDamage + BulletCircleExpand]', cl.length >= 1 && cl.every(d => d === cf.slashFlyDamage), 'chạm ' + cl.join(','));
      check('joker mirage_masque: hết ' + r.dur + ' s tự thu áo, hiện hình, còn miễn sát thương 0,5 s [ĐO RoleSkill1End], chạy x1,5 tới hết 2 s', !s2.hidden && s2.skillT === 0 && armor2 === 0 && armor3 > 0 && s2.move > 1.4, 'ẩn ' + s2.hidden + ' · mất giáp ' + armor2 + '/' + armor3 + ' · move ' + s2.move);
      const moveEnd = await p.evaluate(() => SK.G.player.moveMul || 1);
      check('joker mirage_masque: sau 2 s tốc chạy về 1', near(s2b.move, 1, 0.001) && near(moveEnd, 1, 0.001), 'move ' + s2b.move);
      const circ = hitsOf(s2b, 'circle');
      check('joker mirage_masque: vòng chém mở rộng lúc kết thúc, ' + cf.slashDamage + ' sát thương (cộng 1 vòng đầu = ≥ 2 nhát)', circ.length >= 2 && circ.every(d => d === cf.slashDamage), 'vòng ' + circ.join(','));
      // Bấm lại giữa chừng thu áo, hiện hình.
      await standNear(p, 30); await tank(p);
      await p.evaluate(() => { SK.G.player.skillCd = 0; SK.G.player._jk.imm = 0; window._skHits = []; });
      await pressK(p); await sleep(300);
      await pressK(p); await sleep(60);
      const s3 = await snap(p);
      await sleep(300);
      const s3b = await snap(p);
      check('joker mirage_masque: bấm lại thu áo, hiện hình ngay, vòng chém mở rộng sau backTime ' + cf.backTime + ' s [ĐO CreateCircleSlash]', !s3.hidden && s3.skillT === 0 && hitsOf(s3, 'circle').length >= 1 && hitsOf(s3b, 'circle').length >= 2 * hitsOf(s3, 'circle').length, 'ẩn ' + s3.hidden + ' · vòng lúc 60ms ' + hitsOf(s3, 'circle').length + ' · sau ' + hitsOf(s3b, 'circle').length);
      // Chiêu cuối: NÚT ĐẶC BIỆT (L), không phải K.
      await standNear(p, 40); await tank(p);
      await p.evaluate(() => { const pl = SK.G.player; pl.skillCd = 0; pl._jk.e = 100; pl._jk.drain = 0; pl._jk.imm = 0; window._skHits = []; });
      await sleep(300);
      const rd = await jk(p);
      await pressK(p); await sleep(150);
      const jK = await jk(p);
      await pressL(p); await sleep(300);
      await seq(p, 'joker_1b', 6, 100);
      const j = await jk(p);
      const s4 = await snap(p);
      check('joker mirage_masque: thanh đầy -> _ultReady bật khung chiêu cuối; nút K vẫn chỉ tung Màn Ảo Thuật (không kích chiêu cuối)', rd.ready === true && jK.ult === false && s4.hidden !== undefined, 'ready ' + rd.ready + ' · ult sau K ' + jK.ult);
      check('joker mirage_masque: nút đặc biệt L (dùng được cả lúc đang tàng hình) -> Chiêu Cuối gọi ' + cf.KageBunshinCount + ' ảo ảnh tạm áp sát quái, cùng chém; thanh tụt về 0 trong ' + cf.timeLimitPhantomTime + ' s [ĐO HyperSkill1]', j.ult && j.ph.filter(x => x.fight).length === cf.KageBunshinCount && j.drain > cf.timeLimitPhantomTime - 2 && j.e < 100, JSON.stringify(j.ph) + ' · drain ' + (j.drain || 0).toFixed(1) + ' · e ' + (j.e || 0).toFixed(1));
      const ph = hitsOf(s4, 'phantom');
      check('joker mirage_masque: ảo ảnh chiêu cuối chém combo 3/4 (bạo 20 -> gấp đôi) [ĐO weapon_skill_joker_phantom]', ph.length >= 1 && ph.every(d => [3, 4, 6, 8].indexOf(d) >= 0), 'đòn ' + ph.join(','));
      await p.evaluate(() => { window._skHits = []; });
      await pressL(p); await sleep(1600);
      const j2 = await jk(p);
      const s5 = await snap(p);
      check('joker mirage_masque: bấm L lại -> ảo ảnh hoá áo choàng bay về (tốc 10 ô/s), ' + cf.slashFlyDamage + ' sát thương, thanh về 0', !j2.ult && j2.ph.filter(x => x.fight).length === 0 && j2.e === 0 && hitsOf(s5, 'cloak').length >= 1 && hitsOf(s5, 'cloak').every(d => d === cf.slashFlyDamage), 'áo ' + hitsOf(s5, 'cloak').join(',') + ' · e ' + j2.e);
    }
  };
};
