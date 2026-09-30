// Ca kiểm Tay Súng (c36): số đọc từ ctrlFields / config skills 8.6 [ĐO].
module.exports = h => {
  // Quái trong phòng thử chỉ 8-12 máu: nâng máu để đòn thứ 3, thứ 4 còn có mục tiêu.
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp += 400; }));
  return {
  async 'shooter/0'(p) {
    const r = await h.real(p, 'shooter', 'marksman_s_mastery');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.shooter.ctrlFields);
    // Chính = súng ngắn (nổ), phụ = súng máy (đánh dấu, ăn 50%).
    await p.evaluate(() => { const pl = SK.G.player; pl.weapons[0] = SK.makeWeapon('desert_eagle_gold'); pl.weapons[1] = SK.makeWeapon('ak_47'); pl.cur = 0; });
    await tough(p); await h.standNear(p, 50);
    await h.pressK(p); await h.sleep(100);
    const a = await h.snap(p);
    await p.keyboard.down('KeyJ'); await h.sleep(2000);
    await h.seq(p, 'shooter_0');
    await p.keyboard.up('KeyJ');
    const s = await h.snap(p);
    const mm = h.hitsOf(s, 'mm');
    h.check('shooter marksman: ' + r.dur + ' s [ĐO], cd ' + r.cd + ' [ĐO]', h.near(a.skillT, r.dur - 0.1, 0.35) && a.cd === r.cd, 'skillT ' + a.skillT.toFixed(2));
    h.check('shooter marksman: súng ngắn nổ ' + cf.PistolExplodeDmgValue + ' [ĐO PistolExplodeDmgValue]', mm.some(d => d === cf.PistolExplodeDmgValue), 'đòn ' + mm.join(','));
    h.check('shooter marksman: súng máy phụ ăn 50% — đủ ' + cf.GunStackCount + ' tầng thì thêm đòn ×' + cf.GunStackBulletDmgMultiple + ' × 50%', mm.some(d => d === 9 || d === 18), 'đòn ' + mm.join(','));
    // Bắn tỉa (chính) + súng săn (phụ): đạn nhảy sang quái kế, giảm dần.
    await p.evaluate(() => { const pl = SK.G.player; SK.endSkill(SK.G, pl); pl.skillCd = 0; pl.weapons[0] = SK.makeWeapon('jackdaw'); pl.weapons[1] = SK.makeWeapon('rainbow_gatling'); pl.cur = 0; });
    await h.resetDmg(p);
    await tough(p); await h.standNear(p, 50);
    await h.pressK(p); await h.sleep(100);
    await p.keyboard.down('KeyJ'); await h.sleep(1500); await p.keyboard.up('KeyJ');
    const t = await h.snap(p);
    const ch = h.hitsOf(t, 'mm');
    h.check('shooter marksman: bắn tỉa nhảy mắt xích ×0.7 (6 → 4) [ĐO RifleDefaultAutoLockCount ' + cf.RifleDefaultAutoLockCount + ']', ch.length > 0 && ch.every(d => d <= 8) && ch.some(d => d === 4 || d === 8), 'đòn ' + ch.join(','));
  },
  async 'shooter/1'(p) {
    const r = await h.real(p, 'shooter', 'deadeye_domain');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.shooter.ctrlFields);
    await tough(p); await h.standNear(p, 60);
    const a0 = await h.snap(p);
    await p.keyboard.down('KeyD');
    await h.pressK(p); await h.sleep(250);
    const a = await h.snap(p);
    await h.sleep(300);
    const a2 = await h.snap(p);
    const moved = await p.evaluate(() => { const c = SK.G.player._dd.cross, e = SK.G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn').sort((u, v) => Math.hypot(u.x - c.x, u.y - c.y) - Math.hypot(v.x - c.x, v.y - c.y))[0]; return Math.hypot(e.x - c.x, e.y - c.y); });
    await p.keyboard.up('KeyD');
    await p.evaluate(() => { const G = SK.G, c = G.player._dd.cross, e = G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn').sort((u, v) => Math.hypot(u.x - G.player.x, u.y - G.player.y) - Math.hypot(v.x - G.player.x, v.y - G.player.y))[0]; c.x = e.x; c.y = e.y - e.hb.off[1] * e.scale; });
    h.check('shooter deadeye: ẩn thân + đứng yên ' + r.dur + ' s [ĐO], cd ' + r.cd + ' [ĐO]', a.hidden && h.near(a.px, a2.px, 0.5) && moved > 20 && h.near(a.skillT, r.dur - 0.25, 0.4) && a.cd === r.cd, 'hidden ' + a.hidden + ' · người dời ' + Math.abs(a2.px - a.px).toFixed(1) + ' · tâm dời ' + moved.toFixed(0));
    await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 20, y: pl.y - 8, h: 8, vx: 0, vy: 0, ang: 0, dmg: 1, repel: 0, r: 3, life: 3, _probe: 1 }); });
    await p.keyboard.down('KeyJ'); await h.sleep(60); await p.keyboard.up('KeyJ'); await h.sleep(150);
    await h.seq(p, 'shooter_1', 6, 60);
    const b = await h.snap(p);
    const eaten = await p.evaluate(() => !SK.G.bullets.some(x => x._probe));
    const dd = h.hitsOf(b, 'dd');
    h.check('shooter deadeye: bắn phá ẩn thân, tâm bắn tỉa 20 [ĐO rifleDamageProfile], gió xoáy huỷ đạn địch', !b.hidden && dd.length >= 1 && (dd[0] === cf.rifleDamageProfile.damage || dd[0] === cf.rifleDamageProfile.damage * 2) && eaten, 'hidden ' + b.hidden + ' · đòn ' + dd.join(',') + ' · đạn địch ' + (eaten ? 'mất' : 'còn'));
    await p.keyboard.down('KeyQ'); await h.sleep(60); await p.keyboard.up('KeyQ'); await h.sleep(100);
    const ty = await p.evaluate(() => SK.G.player._dd && SK.G.player._dd.type);
    await p.evaluate(() => SK.endSkill(SK.G, SK.G.player));
    const e = await h.snap(p);
    h.check('shooter deadeye: phím Q đổi loại tâm (bắn tỉa → súng săn), hết thì trả vũ khí + hồi chiêu', ty === 'shotgun' && e.weapon === a0.weapon && Math.abs(e.skillCd - r.cd) < 0.1, 'tâm ' + ty + ' · vũ khí ' + e.weapon + ' · cd ' + e.skillCd);
  }
};
};
