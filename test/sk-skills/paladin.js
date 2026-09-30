// Ca kiểm Kỵ Sĩ Thánh (c07): holy_warrior (ô 1), splash_bash (ô 2). Số thật ở data/sk-skills86.js và MonoBehaviour c07/m_mech_paladin.
module.exports = h => ({
  async 'paladin/1'(p) {
    const r = await h.real(p, 'paladin', 'holy_warrior');
    await h.standNear(p, 45);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 500; });
    await h.pressK(p); await h.sleep(150);
    const s = await p.evaluate(() => { const pl = SK.G.player; return { skillT: pl.skillT, w: pl.weapons[pl.cur].id, idle: pl.anims.idle, alpha: pl._alpha }; });
    // Đạn địch bay tới: sóng kiếm / nhát chém phải xoá nó.
    await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + Math.cos(pl.aim) * 30, y: pl.y - 12 + Math.sin(pl.aim) * 30, h: 8, vx: 0, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 }); });
    await h.resetDmg(p);
    await p.keyboard.down('KeyJ');
    await h.seq(p, 'paladin_1', 6, 70);
    await h.sleep(300); await p.keyboard.up('KeyJ');
    const d = await h.snap(p);
    const probe = await p.evaluate(() => { const b = SK.G.bullets.find(x => x._probe); return !b || b.dead; });
    await h.until(p, () => SK.G.player.skillT <= 0, null, 8000);
    await h.sleep(200);
    const e = await p.evaluate(() => { const pl = SK.G.player; return { w: pl.weapons[pl.cur].id, idle: pl.anims.idle, alpha: pl._alpha, cd: pl.skillCd }; });
    h.check('paladin holy_warrior: ' + r.dur + ' s [ĐO duration], cầm Kiếm Thần, hoá thân paladin_god', s.w === '_holy_sword' && h.near(s.skillT, r.dur - 0.15, 0.3) && /m_paladin_controller/.test(s.idle), JSON.stringify(s));
    h.check('paladin holy_warrior: nhát chém 10 và sóng kiếm 10 [ĐO GunBadminton], xoá đạn địch', h.hitsOf(d, 'holy_slash').length > 0 && h.hitsOf(d, 'holy_wave').length > 0 && d.hits.every(x => x[0] === 10 || x[0] === 20) && probe, 'đòn ' + d.hits.map(x => x.join(':')).join(',') + ' · đạn ' + probe);
    const hw = await p.evaluate(() => ({ hitAt: SK.SKILLS.holy_warrior.hw.hitAt, swing: SK.SKILLS.holy_warrior.hw.swing, rps: SK.DS.weapons._holy_sword.rps }));
    h.check('paladin holy_warrior: weapon_speed 0.5 làm clip w_sword 0 chậm gấp đôi: mỗi nhát 1 s, đòn ở 0.133 s [ĐO GunBadminton, mb weapon_225]', h.near(hw.hitAt, 0.0667 / 0.5, 1e-6) && hw.swing === 1 && hw.rps === 1, JSON.stringify(hw));
    h.check('paladin holy_warrior: hết giờ thì trả vũ khí + dáng, hồi chiêu ' + r.cd + ' s [ĐO]', e.w !== '_holy_sword' && !/m_paladin_controller/.test(e.idle) && e.cd > r.cd - 1 && e.cd <= r.cd, JSON.stringify(e));
  },
  async 'paladin/2'(p) {
    const r = await h.real(p, 'paladin', 'splash_bash');
    await h.standNear(p, 90);
    await p.evaluate(() => { const pl = SK.G.player; pl.armor = 1; pl.energy = 10; for (const e of SK.G.enemies) e.hp = e.hpMax = 500; });
    await h.pressK(p); await h.sleep(150);
    // Thủ +2: đòn 3 chỉ còn 1; nhận đòn lúc giơ khiên nâng bậc lên 1 [ĐO GunPaladinSkill.PlayerGetHurtHandler].
    const def = await p.evaluate(() => { const G = SK.G, pl = G.player, a0 = pl.armor; pl.invulT = 0; SK.hurtPlayer(G, 3); const r = { lost: a0 - pl.armor, w: pl.weapons[pl.cur].id, tier: pl._sb.hurts }; pl.armor = 1; pl.invulT = 0; return r; });
    await h.resetDmg(p);
    await p.keyboard.down('KeyJ'); await h.sleep(60); await p.keyboard.up('KeyJ');
    await h.sleep(100);
    // Ném xong: vũ khí trả ngay, kỹ năng kết thúc và hồi chiêu chạy, khiên đang bay, +1.3 tốc chạy, +0.2 tốc bắn.
    const thrown = await p.evaluate(() => { const pl = SK.G.player; return { w: pl.weapons[pl.cur].id, skillT: pl.skillT, cd: pl.skillCd, fly: !!pl._sbf, move: pl.moveMul || 1, rate: pl.rateMul || 1, base: pl.h.speed }; });
    await h.seq(p, 'paladin_2', 6, 120);
    await h.until(p, () => !SK.G.player._sbf, null, 8000);
    await h.sleep(200);
    const e = await h.snap(p);
    const after = await p.evaluate(() => { const pl = SK.G.player; return { w: pl.weapons[pl.cur].id, arm: pl.armor, en: pl.energy, move: pl.moveMul || 1, rate: pl.rateMul || 1 }; });
    const t = def.tier, dmg = [6, 8, 10, 12][t], wave = [3, 4, 5, 6][t], reflect = [7, 8, 9, 10][t];
    h.check('paladin splash_bash: giơ khiên thay vũ khí, thủ +2 [ĐO defence]; trúng 1 đòn thì lên bậc 1', def.w === '_shield_weapon' && def.lost === 1 && t === 1, JSON.stringify(def));
    h.check('paladin splash_bash: ném xong trả vũ khí, kỹ năng kết thúc, hồi chiêu chạy [ĐO OnShieldDestroy]; +1.3 tốc chạy, +0.2 tốc bắn [ĐO ModifyAttribute]', thrown.fly && thrown.w !== '_shield_weapon' && thrown.skillT <= 0 && thrown.cd > r.cd - 1 && h.near(thrown.move, (thrown.base + 1.3) / thrown.base, 1e-6) && h.near(thrown.rate, 1.2, 1e-6), JSON.stringify(thrown));
    h.check('paladin splash_bash: bậc ' + t + ': khiên trúng ' + dmg + ' [ĐO exShieldDamage], xung thánh quang ' + wave + ' [ĐO waveDamage], nảy tối đa ' + reflect + ' lần [ĐO reflectCount]', h.hitsOf(e, 'shield').length > 0 && h.hitsOf(e, 'shield').length <= reflect && h.hitsOf(e, 'shield').every(d => d === dmg || d === dmg * 2) && h.hitsOf(e, 'shield_wave').length > 0 && h.hitsOf(e, 'shield_wave').every(d => d === wave), 'đòn ' + e.hits.map(x => x.join(':')).join(','));
    h.check('paladin splash_bash: khiên về thì hồi 2 giáp + 10 năng lượng [ĐO OnShieldReturn], bỏ +tốc, hồi chiêu ' + r.cd + ' s tính lại', after.arm === 3 && after.en === 20 && h.near(after.move, 1, 1e-6) && h.near(after.rate, 1, 1e-6) && e.cd === r.cd && e.skillCd > r.cd - 1, JSON.stringify(after) + ' cd ' + e.skillCd.toFixed(2));
  }
});
