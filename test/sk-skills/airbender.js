// Ca kiểm Khí Tông (c22) — số đọc từ prefab c22 (C23Controller) và object_swirl_0; xem games/soulknight/js/skills/airbender.js.
module.exports = h => ({
  async 'airbender/0'(p, id) {
    const r = await h.real(p, 'airbender', 'pulsating_blow');
    await h.standNear(p, 70);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 999; });
    const x0 = await p.evaluate(() => [SK.G.player.x, SK.G.player.y]);
    await h.pressK(p); await h.sleep(150);
    let s = await h.snap(p);
    h.check('airbender pulsating_blow: tụ lực ' + r.dur + ' s, chạy chậm 60% [ĐO dur, skill0DeltaSpeedRate]', h.near(s.skillT, r.dur - 0.15, 0.3) && h.near(s.move, 0.4, 0.01), 'skillT ' + s.skillT.toFixed(2) + ' move ' + s.move);
    await h.resetDmg(p);
    await h.seq(p, 'airbender_0', 6, 130);
    await h.sleep(600);
    s = await h.snap(p);
    const cd = await p.evaluate(() => SK.G.player.skillCd);
    h.check('airbender pulsating_blow: sóng khí công 8 [ĐO QigongDamage]', h.hitsOf(s, 'ab_wave').length >= 1 && h.hitsOf(s, 'ab_wave').every(d => d === 8), 'đòn ' + h.hitsOf(s, 'ab_wave').join(','));
    h.check('airbender pulsating_blow: đấm xung kích 8 [ĐO skill0BoxingDamage]', h.hitsOf(s, 'ab_box').length >= 1 && h.hitsOf(s, 'ab_box').every(d => d === 8), 'đòn ' + h.hitsOf(s, 'ab_box').join(','));
    h.check('airbender pulsating_blow: bom khí công 12 [ĐO skill0BallDamage]', h.hitsOf(s, 'ab_ball').length >= 1 && h.hitsOf(s, 'ab_ball').every(d => d === 12), 'đòn ' + h.hitsOf(s, 'ab_ball').join(','));
    h.check('airbender pulsating_blow: hồi chiêu ' + r.cd + ' s [ĐO], tốc chạy trả về 1', s.cd === 6 && s.skillCd > 4 && h.near(s.move, 1, 0.01), 'skillCd ' + s.skillCd.toFixed(2));
    const moved = Math.hypot(s.px - x0[0], s.py - x0[1]);
    h.check('airbender pulsating_blow: đã lao về phía trước', moved > 20, moved.toFixed(0) + ' px');
    // Chuỗi Sóng Phá Không: 2 đấm -> kỹ năng -> 6 đấm -> kỹ năng = tia 16 sát thương mỗi 0,15 s.
    await p.evaluate(() => { const P = SK.G.player; P.skillCd = 0; P._abSeq = { stage: 3, n: 0, t: SK.G.t }; });
    await h.standNear(p, 70);
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(1200);
    await h.sleep(2000);
    s = await h.snap(p);
    const L = h.hitsOf(s, 'ab_laser');
    h.check('airbender pulsating_blow: đủ chuỗi -> Sóng Phá Không 16 mỗi nhịp [ĐO skill0LaserDamage]', L.length >= 3 && L.every(d => d === 16), 'đòn ' + L.length + ' lần');
  },
  async 'airbender/1'(p, id) {
    const r = await h.real(p, 'airbender', 'orbiting_stars');
    await h.standNear(p, 70);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 999; });
    await h.pressK(p); await h.sleep(150);
    // Ba đạn địch (sát thương 3) bay vào người: bị giữ lại, sau 6 s bay về quái: (3+1) x2 = 8.
    await p.evaluate(() => { const G = SK.G, pl = G.player; for (let i = 0; i < 3; i++) G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 60, y: pl.y - 6 + i * 3, h: 8, vx: -60, vy: 0, ang: Math.PI, dmg: 3, repel: 0, r: 3, life: 6, _probe: 1 }); });
    await h.sleep(1200);
    let s = await h.snap(p);
    const held = await p.evaluate(() => SK.G.player._abOs && SK.G.player._abOs.held.length);
    h.check('airbender orbiting_stars: giữ ' + held + '/3 đạn địch quanh người, ' + 6 + ' s [ĐO ObjectSwirl.duration]', held === 3 && h.near(s.skillT, 6 - 1.35, 0.5), 'skillT ' + s.skillT.toFixed(2));
    await h.resetDmg(p);
    await h.seq(p, 'airbender_1', 6, 200);
    await h.until(p, () => SK.G.player.skillT <= 0, null, 6000);
    await h.sleep(1500);
    s = await h.snap(p);
    h.check('airbender orbiting_stars: đạn bay về gây (3+1) x Bạo Kích 2 = 8 [WIKI + ĐO bulletExtraDamage 1]', h.hitsOf(s).length >= 1 && h.hitsOf(s).every(d => d === 8), 'đòn ' + h.hitsOf(s).join(','));
    h.check('airbender orbiting_stars: hồi chiêu ' + r.cd + ' s [ĐO]', s.cd === 16 && s.skillCd > 12, 'skillCd ' + s.skillCd.toFixed(2));
  },
  async 'airbender/2'(p, id) {
    const r = await h.real(p, 'airbender', 'meridian_sword');
    await h.standNear(p, 60);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 999; });
    await h.pressK(p); await h.sleep(150);
    let s = await h.snap(p);
    h.check('airbender meridian_sword: ' + r.dur + ' s [ĐO dur]', h.near(s.skillT, r.dur - 0.15, 0.3), 'skillT ' + s.skillT.toFixed(2));
    await h.resetDmg(p);
    // Đòn vũ khí 7 trúng quái -> sóng khí công quạt ceil(7 x 50%) = 4 [WIKI].
    await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q.hp > 0 && q.st !== 'dead'); SK.hurtEnemy(G, e, 7, false, 0, 0); });
    await h.seq(p, 'airbender_2', 6, 60);
    await h.sleep(300);
    s = await h.snap(p);
    const q = h.hitsOf(s, 'qigong');
    h.check('airbender meridian_sword: đòn 7 -> sóng khí công 4 (50% làm tròn lên)', q.length >= 1 && q.every(d => d === 4), 'đòn ' + q.join(','));
    await h.until(p, () => SK.G.player.skillT <= 0, null, 8000);
    await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q.hp > 0 && q.st !== 'dead'); SK.hurtEnemy(G, e, 7, false, 0, 0); });
    await h.sleep(200);
    s = await h.snap(p);
    h.check('airbender meridian_sword: hết thời gian thì không còn sóng; hồi chiêu ' + r.cd + ' s [ĐO]', h.hitsOf(s, 'qigong').length === 0 && s.cd === 11, 'skillCd ' + s.skillCd.toFixed(2));
  }
});
