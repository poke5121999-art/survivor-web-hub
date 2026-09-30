// Ca kiểm Tiên Tộc (c08): guardian_elf (ô 2). Số thật: args 2 bóng lửa, atk_cd 2.5/2/5, BuffWaterShield 2 giáp + 5 năng lượng [ĐO].
module.exports = h => ({
  async 'elves/2'(p) {
    const r = await h.real(p, 'elves', 'guardian_elf');
    await h.standNear(p, 40);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
    // Tinh linh Lửa.
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(100);
    const k0 = await p.evaluate(() => ({ kind: SK.G.player._elf.kind, cd: SK.G.player.h.skill.cd }));
    let balls = 0;
    for (let i = 0; i < 60; i++) { balls = Math.max(balls, await p.evaluate(() => SK.G.props.filter(q => q.follow && q.follow.x != null).length)); await h.sleep(40); }
    await h.seq(p, 'elves_2', 6, 200);
    const f = await h.snap(p);
    // Tinh linh Gió (bấm lần nữa): mũi tên 2 sát thương; sóng năng lượng 5 khi mũi tên tụ đủ lực trúng.
    await p.evaluate(() => { SK.G.player.skillCd = 0; });
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(100);
    const k1 = await p.evaluate(() => SK.G.player._elf.kind);
    await h.sleep(3000);
    const w = await h.snap(p);
    await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); G.bullets.push({ side: 'p', kind: 'pb', x: e.x, y: e.y - 6, h: 6, vx: 0, vy: 0, ang: 0, dmg: 1, r: 2, life: 1, _wave: true }); SK.hurtEnemy(G, e, 1, false, 0, 0); });
    await h.sleep(700);
    const wv = await h.snap(p);
    // Tinh linh Nước: hồi 2 giáp + 5 năng lượng mỗi 5 s trong trận.
    await p.evaluate(() => { SK.G.player.skillCd = 0; });
    await h.pressK(p); await h.sleep(100);
    const k2 = await p.evaluate(() => { const pl = SK.G.player; pl.armor = 1; pl.armorT = 99; pl.energy = 10; return pl._elf.kind; });
    await h.sleep(1500);
    const wt = await p.evaluate(() => { const pl = SK.G.player; return { arm: pl.armor, en: pl.energy }; });
    h.check('elves guardian_elf: triệu hồi lần lượt Lửa → Gió → Nước, hồi chiêu ' + r.cd + ' s [ĐO]', k0.kind === 0 && k1 === 1 && k2 === 2 && k0.cd === r.cd, k0.kind + ',' + k1 + ',' + k2);
    h.check('elves guardian_elf: tinh linh Lửa bắn ' + r.args + ' bóng lửa 6 [ĐO args/Gun002] rồi để lại lửa 2 [ĐO Fire2]', balls >= +r.args && h.hitsOf(f, 'elf_fire').length > 0 && h.hitsOf(f, 'elf_fire').every(d => d === 6 || d === 12) && h.hitsOf(f, 'elf_pool').every(d => d === 2), 'bóng ' + balls + ' · đòn ' + f.hits.slice(0, 8).map(x => x.join(':')).join(','));
    h.check('elves guardian_elf: tinh linh Gió bắn mũi tên 2 [ĐO Gun005]', h.hitsOf(w, 'elf_wind').length > 0 && h.hitsOf(w, 'elf_wind').every(d => d === 2), 'đòn ' + w.hits.slice(0, 6).map(x => x.join(':')).join(','));
    h.check('elves guardian_elf: mũi tên tụ đủ lực kèm sóng năng lượng 5 [ĐO explode_blast_out]', h.hitsOf(wv, 'elf_wave').length > 0 && h.hitsOf(wv, 'elf_wave').every(d => d === 5 || d === 10), 'đòn ' + wv.hits.map(x => x.join(':')).join(','));
    h.check('elves guardian_elf: tinh linh Nước hồi 2 giáp + 5 năng lượng [ĐO BuffWaterShield]', wt.arm === 3 && wt.en === 15, JSON.stringify(wt));
  }
});
