// Ca kiểm Kỹ Sư (c05): armor_mount (ô 1). Số thật: máu cơ giáp 7, thủ 1, chạy -20%, súng 3 sát thương [ĐO m_mech_0].
module.exports = h => ({
  async 'engineer/1'(p) {
    const r = await h.real(p, 'engineer', 'armor_mount');
    await h.standNear(p, 60);
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(150);
    const m = await p.evaluate(() => { const pl = SK.G.player, k = pl._mech; return { hp: k && k.hp, w: pl.weapons[pl.cur].id, mv: pl._mulSrc && pl._mulSrc['moveMul:mech'], php: pl.hp, arm: pl.armor }; });
    // Trúng 3 sát thương: cơ giáp trừ thủ 1 còn 2, người lái không mất máu/giáp.
    const hurt = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; const r = SK.hurtPlayer(G, 3); return { r, hp: pl._mech.hp, php: pl.hp, arm: pl.armor }; });
    await p.evaluate(() => { window._skHits = []; SK.G.player.energy = 50; });
    await p.keyboard.down('KeyJ'); await h.sleep(500);
    const s = await h.snap(p);
    await h.seq(p, 'engineer_1', 6, 60);
    await p.keyboard.up('KeyJ');
    // Đánh sập cơ giáp: hết máu thì người lái rơi ra, trả vũ khí, hồi chiêu 14 s bắt đầu.
    for (let i = 0; i < 3; i++) await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; SK.hurtPlayer(SK.G, 3); });
    await h.sleep(300);
    const e = await h.snap(p);
    const after = await p.evaluate(() => { const pl = SK.G.player; return { mech: !!pl._mech, w: pl.weapons[pl.cur].id, mv: pl.moveMul || 1 }; });
    h.check('engineer armor_mount: cơ giáp 7 máu [ĐO max_hp], cầm súng cơ giáp, chạy -20% [ĐO speedRate]', m.hp === 7 && m.w === '_mech_gun' && Math.abs(m.mv - 0.8) < 1e-6, JSON.stringify(m));
    h.check('engineer armor_mount: 3 sát thương - thủ 1 = 2 trừ vào cơ giáp, người lái không mất', hurt.r === false && hurt.hp === 5 && hurt.php === m.php && hurt.arm === m.arm, JSON.stringify(hurt));
    h.check('engineer armor_mount: súng cơ giáp bắn 3 sát thương mỗi viên [ĐO Gun001]', s.hits.length > 0 && h.hitsOf(s).every(d => d === 3 || d === 6), 'đòn ' + h.hitsOf(s).join(','));
    h.check('engineer armor_mount: hết máu thì rơi ra, trả vũ khí, hồi chiêu ' + r.cd + ' s [ĐO]', !after.mech && after.w !== '_mech_gun' && e.skillT <= 0 && e.cd === r.cd && e.skillCd > r.cd - 1 && Math.abs(after.mv - 1) < 1e-6, JSON.stringify(after) + ' cd ' + e.skillCd.toFixed(2));
  }
});
