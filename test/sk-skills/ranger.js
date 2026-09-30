// Ca kiểm Kẻ Lãng Du (c01): cartwheel (ô 2). Số thật ở data/sk-skills86.js.
module.exports = h => ({
  async 'ranger/2'(p) {
    const r = await h.real(p, 'ranger', 'cartwheel');
    await h.standNear(p, 60);
    // Đặt quái ngay ở cuối quãng lăn 1 ô (~96 px) để nhát chém cuối trúng.
    await p.evaluate(() => {
      const G = SK.G, pl = G.player, W = SK.world;
      const e = G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
      const a = Math.atan2(e.y - pl.y, e.x - pl.x), c = Math.cos(a), s = Math.sin(a);
      let ok = true;
      for (let d = 10; d <= 108; d += 6) if (W.solidAt(G.map, pl.x + c * d, pl.y + s * d)) ok = false;
      if (ok) { e.x = pl.x + c * 104; e.y = pl.y + s * 104; e.hp = e.hpMax = 500; }
      window._cwOk = ok;
    });
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(250);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    const s = await h.snap(p);
    await h.seq(p, 'ranger_2', 6, 70);
    await h.until(p, () => SK.G.player.skillT <= 0, null, 4000);
    await h.sleep(250);
    const e = await h.snap(p);
    h.check('ranger cartwheel: ' + r.max + ' lượt [ĐO maxCount], bấm một lần còn ' + (r.max - 1), a.ch && a.ch.max === r.max && s.ch.n === r.max - 1, JSON.stringify(s.ch));
    h.check('ranger cartwheel: lăn bất tử (không mất máu/giáp)', imm === false && s.php === a.php && s.parm === a.parm, 'php ' + s.php);
    h.check('ranger cartwheel: bấm nhẹ lăn ≥ 1 ô thanh và dời chỗ', Math.hypot(e.px - a.px, e.py - a.py) > 60, 'dời ' + Math.round(Math.hypot(e.px - a.px, e.py - a.py)) + ' px');
    h.check('ranger cartwheel: đâm quái khi lăn gây 3, chém cuối gây 12 [ƯỚC LƯỢNG]', (h.hitsOf(e, 'roll').length > 0 && h.hitsOf(e, 'roll').every(d => d === 3)) && h.hitsOf(e, 'roll_slash').some(d => d === 12), 'đòn ' + e.hits.map(x => x.join(':')).join(','));
    const cd = await p.evaluate(() => SK.G.player._ch.cd);
    h.check('ranger cartwheel: lăn 1 ô/5 thì hồi 1 lượt trong ' + (r.cd * 0.4).toFixed(1) + ' s thay vì ' + r.cd + ' s [ĐO cd, ƯỚC LƯỢNG hệ số]', e.cd === r.cd && cd > r.cd * 0.39 && cd < r.cd * 0.6, 'cd lượt ' + cd.toFixed(2));
  }
});
