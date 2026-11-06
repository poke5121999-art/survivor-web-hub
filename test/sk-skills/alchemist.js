// Ca kiểm Nhà Giả Kim (c04): concoction (ô 2). Số đo: GunAchemistSkill (duration 6, maxMixCount 3, drink 0.75 s), GetEffectValue cấp 0
// (hp 1, năng lượng 30, tốc bắn +0.5, tốc chạy +0.4), BuffArmor (1 giáp mỗi 1.6 s), nút đặc biệt = cất chai.
module.exports = h => ({
  async 'alchemist/2'(p) {
    const r = await h.real(p, 'alchemist', 'concoction');
    await h.standNear(p, 60);
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(150);
    const m = await p.evaluate(() => { const pl = SK.G.player, c = pl._conc; return { w: pl.weapons[pl.cur].id, list: c ? c.list.slice() : null, ch: pl._ch.n }; });
    await h.seq(p, 'alchemist_2', 6, 70);
    // Nút đặc biệt (L): cất chai, nguyên liệu còn; bấm kỹ năng lúc hết lượt thì cầm lại.
    await p.keyboard.down('KeyL'); await h.sleep(60); await p.keyboard.up('KeyL'); await h.sleep(120);
    const sp = await p.evaluate(() => { const pl = SK.G.player; return { w: pl.weapons[pl.cur].id, list: pl._conc.list.length, has: !!SK.SKILLS.concoction.special }; });
    await h.pressK(p); await h.sleep(150);
    const re = await p.evaluate(() => { const pl = SK.G.player; return { w: pl.weapons[pl.cur].id, list: pl._conc.list.length }; });
    // Uống: 0.75 s sau mới nhận cường hoá, trong lúc đó khoá đánh.
    await p.evaluate(() => { const pl = SK.G.player; pl.energy = 0; pl.armor = 0; pl.armorT = 99; });
    await p.keyboard.down('KeyJ'); await h.sleep(120); await p.keyboard.up('KeyJ');
    await h.sleep(300);
    const mid = await p.evaluate(() => { const pl = SK.G.player; return { pot: !!pl._pot, noFire: !!pl.noFire, w: pl.weapons[pl.cur].id }; });
    await h.sleep(600);
    const d = await p.evaluate(() => {
      const pl = SK.G.player, t = pl._pot;
      return { w: pl.weapons[pl.cur].id, t: t ? t.t : null, n: t ? t.n.slice() : null, rate: pl.rateMul || 1, move: pl.moveMul || 1, en: pl.energy, enMax: pl.energyMax, noFire: !!pl.noFire, arm: pl.armor };
    });
    await h.seq(p, 'alchemist_2b', 6, 70);
    await h.sleep(5600);
    const e = await p.evaluate(() => { const pl = SK.G.player; return { pot: !!pl._pot, rate: pl.rateMul || 1, move: pl.moveMul || 1, arm: pl.armor, armMax: pl.armorMax }; });
    h.check('alchemist concoction: ' + r.max + ' lượt [ĐO maxCount], bấm nạp tối đa 3 nguyên liệu [ĐO maxMixCount], cầm chai', a.ch && a.ch.max === r.max && m.w === '_concoction' && m.list.length === 3 && m.ch === r.max - 3, JSON.stringify(m));
    h.check('alchemist concoction: nút đặc biệt cất chai, giữ 3 nguyên liệu; bấm kỹ năng cầm lại [ĐO WeaponSpecial]', sp.has && sp.w !== '_concoction' && sp.list === 3 && re.w === '_concoction' && re.list === 3, JSON.stringify([sp, re]));
    h.check('alchemist concoction: uống chờ 0.75 s [ĐO clip drink], khoá đánh trong lúc đó', !mid.pot && mid.noFire && mid.w === '_concoction' && d.n && !d.noFire && d.w !== '_concoction', JSON.stringify([mid, d.w, d.noFire]));
    const n = d.n || [0, 0, 0, 0, 0];
    h.check('alchemist concoction: ' + n.join('/') + ' [máu/giáp/năng lượng/tốc bắn/tốc chạy]: tốc bắn +0.5, tốc chạy +0.4 mỗi nguyên liệu, năng lượng +30, ' + '6 s [ĐO duration]', d.t > 5.0 && d.t <= 6 + 1e-9 && Math.abs(d.rate - (1 + 0.5 * n[3])) < 1e-6 && Math.abs(d.move - (1 + 0.4 * n[4])) < 1e-6 && d.en === Math.min(d.enMax, 30 * n[2]), JSON.stringify(d));
    const armWant = n[1] > 0 ? Math.min(e.armMax, 4) : 0;
    h.check('alchemist concoction: giáp hồi 1 mỗi 1.6 s trong 6 s = 4 lần [ĐO BuffArmor]; hết 6 s gỡ hết cường hoá', !e.pot && e.rate === 1 && e.move === 1 && e.arm === armWant, JSON.stringify(e) + ' mong giáp ' + armWant);
  }
});
