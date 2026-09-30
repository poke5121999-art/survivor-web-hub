// Ca kiểm Lãnh chúa (c30): Bão Chiến Ý, Quyết Tâm Xung Phong, Lãnh Chúa Hắc Ám — số [ĐO] từ ctrlFields C31Controller.
module.exports = h => {
  // quái trâu để không chết giữa chừng làm mất đòn đo
  const tank = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp = 9999; }));
  return ({
  async 'warliege/0'(p, id) {
    const r = await h.real(p, 'warliege', 'battle_storm');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.warliege.ctrlFields);
    await h.standNear(p, 30); await tank(p);
    // đạn địch lửa lọt vào bão thì bị bắt (không trúng người chơi)
    await h.pressK(p); await h.sleep(500);
    await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 20, y: pl.y - 7, h: 8, vx: -40, vy: 0, ang: Math.PI, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 }); });
    await h.sleep(300);
    const s = await h.snap(p);
    await h.seq(p, 'warliege_0');
    const alive = await p.evaluate(() => SK.G.bullets.some(b => b._probe));
    const cap = await p.evaluate(() => (SK.G.player._storm && SK.G.player._storm.cap.length) || 0);
    h.check('warliege battle_storm: ' + r.dur + ' s, hồi ' + r.cd + ' s [ĐO config]', h.near(s.skillT, r.dur - 0.8, 0.5) && s.cd === r.cd, 'skillT ' + s.skillT.toFixed(2));
    h.check('warliege battle_storm: mỗi nhịp ' + cf.skill0Damage + ' sát thương [ĐO skill0Damage]', h.hitsOf(s).length >= 2 && h.hitsOf(s).every(d => d === cf.skill0Damage || d === cf.skill0Damage * 2), 'đòn ' + h.hitsOf(s).join(','));
    h.check('warliege battle_storm: bắt đạn địch bay vào bão', !alive && cap >= 1, 'đạn còn ' + alive + ' · bắt ' + cap);
    // Sục Sôi: 7 sát thương
    await p.evaluate(() => { SK.G.player._fs = { n: 20, gap: 99, surge: 4, total: 4, h: null, hname: null }; });
    await tank(p); await h.resetDmg(p); await h.sleep(700);
    const s2 = await h.snap(p);
    h.check('warliege battle_storm: Sục Sôi ' + cf.skill0SurgingDamage + ' sát thương [ĐO skill0SurgingDamage]', h.hitsOf(s2).length >= 1 && h.hitsOf(s2).every(d => d === cf.skill0SurgingDamage || d === cf.skill0SurgingDamage * 2), 'đòn ' + h.hitsOf(s2).join(','));
  },
  async 'warliege/1'(p, id) {
    const r = await h.real(p, 'warliege', 'resolute_rush');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.warliege.ctrlFields);
    await h.standNear(p, 60); await tank(p);
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(150);
    await h.seq(p, 'warliege_1', 6, 60);
    await h.sleep(400);
    const s = await h.snap(p);
    const g = await p.evaluate(() => { const pl = SK.G.player; pl.armor = 0; pl.invulT = 0; const hp = pl.hp; SK.hurtPlayer(SK.G, 4); return { giant: !!pl._giant, drop: hp - pl.hp }; });
    h.check('warliege resolute_rush: ' + r.max + ' lượt [ĐO], bấm một lần còn ' + (r.max - 1), a.ch && a.ch.max === r.max && s.ch.n === r.max - 1, JSON.stringify(s.ch));
    h.check('warliege resolute_rush: lao ' + cf.dashTime + ' s, đòn lao ' + cf.dashDamage + ' hoặc búa ' + cf.hammerDamage + ' [ĐO]', Math.hypot(s.px - a.px, s.py - a.py) > 30 && h.hitsOf(s).some(d => d === cf.dashDamage || d === cf.hammerDamage), 'dời ' + Math.round(Math.hypot(s.px - a.px, s.py - a.py)) + ' px · đòn ' + h.hitsOf(s).join(','));
    h.check('warliege resolute_rush: Người Khổng Lồ xuất hiện, đòn 4 chỉ còn 2 (phòng ngự tăng)', g.giant && g.drop === 2, JSON.stringify(g));
  },
  async 'warliege/2'(p, id) {
    const r = await h.real(p, 'warliege', 'dark_sovereign');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.warliege.ctrlFields);
    await h.standNear(p, 40); await tank(p);
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(300);
    const s1 = await h.snap(p);
    await h.seq(p, 'warliege_2', 6, 60);
    h.check('warliege dark_sovereign: ' + r.max + ' lượt, lần 1 chém 1 nhát ' + cf.skill2SlashDamage + ' [ĐO skill2SlashDamage]', a.ch.max === r.max && s1.ch.n === r.max - 1 && h.hitsOf(s1).length >= 1 && h.hitsOf(s1).every(d => d === cf.skill2SlashDamage || d === cf.skill2SlashDamage * 2), 'đòn ' + h.hitsOf(s1).join(',') + ' · ' + JSON.stringify(s1.ch));
    await h.until(p, () => SK.G.player.skillT <= 0 && SK.G.player.skillCd <= 0.02, null, 3000);
    await h.resetDmg(p); await h.pressK(p); await h.sleep(800);
    const s2 = await h.snap(p);
    const two = cf.skill2SlashDamage + cf.skill2ExtraDamage;
    h.check('warliege dark_sovereign: lần 2 chém 2 nhát ' + two + ' [ĐO 8 + skill2ExtraDamage]', h.hitsOf(s2).filter(d => d === two || d === two * 2).length >= 2, 'đòn ' + h.hitsOf(s2).join(','));
    await h.until(p, () => SK.G.player.skillT <= 0 && SK.G.player.skillCd <= 0.02, null, 3000);
    await tank(p); await h.resetDmg(p); await h.pressK(p); await h.sleep(900);
    const s3 = await h.snap(p);
    h.check('warliege dark_sovereign: lần 3 nhát cuối xoay tròn ' + cf.skill2CircleDamage + ' [ĐO skill2CircleDamage]', h.hitsOf(s3).some(d => d === cf.skill2CircleDamage || d === cf.skill2CircleDamage * 2), 'đòn ' + h.hitsOf(s3).join(','));
    // Sục Sôi: lao tới đánh 6, kết bằng vòng xoay 12
    await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
    await p.evaluate(() => { const pl = SK.G.player; pl._fs = { n: 20, gap: 99, surge: 5, total: 5, h: null, hname: null }; pl._dsAt = null; pl._ch.n = 3; pl.skillCd = 0; });
    await h.standNear(p, 70); await tank(p);
    await h.resetDmg(p);
    const b = await h.snap(p);
    await h.pressK(p); await h.sleep(500);
    const s4 = await h.snap(p);
    h.check('warliege dark_sovereign: Sục Sôi lao tới ' + cf.skill2DashDamage + ' rồi vòng xoay ' + cf.skill2CircleDamage + ' [ĐO]', Math.hypot(s4.px - b.px, s4.py - b.py) > 20 && h.hitsOf(s4).some(d => d === cf.skill2DashDamage || d === cf.skill2DashDamage * 2) && h.hitsOf(s4).some(d => d === cf.skill2CircleDamage || d === cf.skill2CircleDamage * 2), 'dời ' + Math.round(Math.hypot(s4.px - b.px, s4.py - b.py)) + ' px · đòn ' + h.hitsOf(s4).join(','));
  }
  });
};
