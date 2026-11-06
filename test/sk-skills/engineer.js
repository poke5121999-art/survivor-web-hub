// Ca kiểm Kỹ Sư (c05): armor_mount (ô 1). Số đo: máu cơ giáp 8 trừ 1 mỗi giây, defence 1 sàn 0, chạy -20%, súng 3 sát thương,
// tự huỷ: 1 s rồi nổ 50, xác nổ sau 1 s với sát thương = max_hp 8.
module.exports = h => ({
  async 'engineer/1'(p) {
    const r = await h.real(p, 'engineer', 'armor_mount');
    await h.standNear(p, 60);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(150);
    const m = await p.evaluate(() => { const pl = SK.G.player, k = pl._mech; return { hp: k && k.hp, w: pl.weapons[pl.cur].id, mv: pl._mulSrc && pl._mulSrc['moveMul:mech'], php: pl.hp, arm: pl.armor, skillT: pl.skillT }; });
    // Trúng 3 sát thương: cơ giáp trừ thủ 1 còn 2, người lái không mất máu/giáp.
    const hurt = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; const r = SK.hurtPlayer(G, 3); return { r, hp: pl._mech.hp, php: pl.hp, arm: pl.armor }; });
    // Đòn 1 bị thủ 1 nuốt hết: sàn 0, cơ giáp không mất máu.
    const floor0 = await p.evaluate(() => { const G = SK.G, pl = G.player, h0 = pl._mech.hp; pl.invulT = 0; SK.hurtPlayer(G, 1); return { d: h0 - pl._mech.hp }; });
    await p.evaluate(() => { window._skHits = []; SK.G.player.energy = 50; });
    await p.keyboard.down('KeyJ'); await h.sleep(500);
    const s = await h.snap(p);
    await h.seq(p, 'engineer_1', 6, 60);
    await p.keyboard.up('KeyJ');
    // Đồng hồ: 1 máu mỗi giây.
    const t0 = await p.evaluate(() => ({ hp: SK.G.player._mech.hp, t: performance.now() }));
    await h.sleep(2100);
    const t1 = await p.evaluate(() => ({ hp: SK.G.player._mech.hp, t: performance.now() }));
    // Nút đặc biệt L: tự huỷ, 1 s sau nổ 50, cơ giáp chết, rồi 1 s sau xác nổ 8.
    await p.evaluate(() => { window._skHits = []; const G = SK.G, pl = G.player; pl._mech.hp = 8; const e = G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn')[0]; e.x = pl.x + 12; e.y = pl.y; });
    const beforeBoom = await p.evaluate(() => ({ has: !!SK.SKILLS.armor_mount.special }));
    await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL');
    await h.sleep(500);
    const mid = await p.evaluate(() => ({ mech: !!SK.G.player._mech, hits: (window._skHits || []).length }));
    await h.sleep(900);
    const boom = await h.snap(p);
    await h.sleep(1300);
    const e = await h.snap(p);
    const after = await p.evaluate(() => { const pl = SK.G.player; return { mech: !!pl._mech, w: pl.weapons[pl.cur].id, mv: pl.moveMul || 1 }; });
    h.check('engineer armor_mount: cơ giáp 8 máu [ĐO RoleSkill1 SetOriginalValue], cầm súng cơ giáp, chạy -20% [ĐO speedRate], vòng ' + m.skillT.toFixed(1) + ' s', m.hp === 8 && m.w === '_mech_gun' && Math.abs(m.mv - 0.8) < 1e-6 && m.skillT > 7 && m.skillT <= 8, JSON.stringify(m));
    h.check('engineer armor_mount: 3 sát thương - defence 1 = 2 trừ vào cơ giáp, người lái không mất', hurt.r === false && hurt.hp <= 6 && hurt.hp >= 5 && hurt.php === m.php && hurt.arm === m.arm, JSON.stringify(hurt));
    h.check('engineer armor_mount: 1 sát thương - defence 1 = 0 (sàn 0) [ĐO RGController.GetHurt]', floor0.d === 0 || floor0.d === 1 /* 1 nếu vừa tới nhịp trừ máu */, JSON.stringify(floor0));
    h.check('engineer armor_mount: súng cơ giáp bắn 3 sát thương mỗi viên [ĐO Gun001]', s.hits.length > 0 && h.hitsOf(s).every(d => d === 3 || d === 6), 'đòn ' + h.hitsOf(s).join(','));
    h.check('engineer armor_mount: máu cơ giáp giảm 2 trong ~2.1 s [ĐO ConsumingHp 1/s]', t0.hp - t1.hp === 2 || t0.hp - t1.hp === 3, JSON.stringify([t0, t1]));
    h.check('engineer armor_mount: nút đặc biệt tự huỷ, sau 1 s nổ ' + 50 + ' [ĐO GunMechBoom], cơ giáp chết', beforeBoom.has && mid.mech && mid.hits === 0 && h.hitsOf(boom, 'mech_boom').length > 0 && h.hitsOf(boom, 'mech_boom').every(d => d === 50), JSON.stringify([mid, h.hitsOf(boom, 'mech_boom')]));
    h.check('engineer armor_mount: xác nổ sau 1 s với sát thương = max_hp 8 [ĐO DeadExplode]', h.hitsOf(e, 'mech_dead').length > 0 && h.hitsOf(e, 'mech_dead').every(d => d === 8), 'đòn ' + h.hitsOf(e, 'mech_dead').join(','));
    h.check('engineer armor_mount: rơi ra, trả vũ khí, hồi chiêu ' + r.cd + ' s [ĐO]', !after.mech && after.w !== '_mech_gun' && e.skillT <= 0 && e.cd === r.cd && e.skillCd > r.cd - 4 && Math.abs(after.mv - 1) < 1e-6, JSON.stringify(after) + ' cd ' + e.skillCd.toFixed(2));
  }
});
