// Ca kiểm Nhà Giả Kim (c04): concoction (ô 2). Số thật ở data/sk-skills86.js.
module.exports = h => ({
  async 'alchemist/2'(p) {
    const r = await h.real(p, 'alchemist', 'concoction');
    await h.standNear(p, 60);
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(150);
    const m = await p.evaluate(() => { const pl = SK.G.player, c = pl._conc; return { w: pl.weapons[pl.cur].id, list: c ? c.list.slice() : null, ch: pl._ch.n }; });
    await h.seq(p, 'alchemist_2', 6, 70);
    await p.keyboard.down('KeyJ'); await h.sleep(200); await p.keyboard.up('KeyJ');
    const d = await p.evaluate(() => {
      const pl = SK.G.player, t = pl._pot;
      return { w: pl.weapons[pl.cur].id, t: t ? t.t : null, n: t ? t.n : null, rate: pl.rateMul || 1, dmg: pl.dmgMul || 1, move: (pl._mulSrc && pl._mulSrc['moveMul:pot']) || 1, arm: pl.armor, armMax: pl.armorMax };
    });
    await h.seq(p, 'alchemist_2b', 6, 70);
    await h.sleep(6300);
    const e = await p.evaluate(() => { const pl = SK.G.player; return { pot: !!pl._pot, rate: pl.rateMul || 1, dmg: pl.dmgMul || 1, move: pl.moveMul || 1, arm: pl.armor, armMax: pl.armorMax }; });
    h.check('alchemist concoction: ' + r.max + ' lượt [ĐO maxCount], bấm nạp tối đa 3 nguyên liệu [ĐO maxMixCount], cầm chai', a.ch && a.ch.max === r.max && m.w === '_concoction' && m.list.length === 3 && m.ch === r.max - 3, JSON.stringify(m));
    const n = d.n || [0, 0, 0, 0, 0];
    h.check('alchemist concoction: uống thì cường hoá ' + '6 s [ĐO duration], đúng số nguyên liệu, trả lại vũ khí', d.w !== '_concoction' && d.t > 5.5 && d.t <= 6 && Math.abs(d.rate - (1 + 0.3 * n[0])) < 1e-6 && Math.abs(d.dmg - (1 + 0.5 * n[3])) < 1e-6 && Math.abs(d.move - (1 + 0.3 * n[1])) < 1e-6, JSON.stringify(d));
    h.check('alchemist concoction: hết 6 s thì gỡ hết cường hoá', !e.pot && e.rate === 1 && e.dmg === 1 && e.move === 1 && e.arm <= e.armMax, JSON.stringify(e));
  }
});
