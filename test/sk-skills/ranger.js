// Ca kiểm Kẻ Lãng Du (c01): cartwheel (ô 2). Số đo từ C02Controller: lăn tối thiểu 0.5 s, tốc chạy × (1 + rollSpeed 1),
// va chạm 5, chém 3 rìu tổng 8 + 16 t chia 3 (t = giây lăn / 3.5), cd lượt = 1.5 + giây lăn × cd / dur.
module.exports = h => ({
  async 'ranger/2'(p) {
    const r = await h.real(p, 'ranger', 'cartwheel');
    await h.standNear(p, 60);
    // Quái đặt cách 60 px trên đường lăn: va chạm giữa chừng, chém cuối nằm trong tầm.
    const placed = await p.evaluate(() => {
      const G = SK.G, pl = G.player, W = SK.world;
      const e = G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y))[0];
      const a = Math.atan2(e.y - pl.y, e.x - pl.x), c = Math.cos(a), s = Math.sin(a);
      let ok = true;
      for (let d = 10; d <= 108; d += 6) if (W.solidAt(G.map, pl.x + c * d, pl.y + s * d)) ok = false;
      if (ok) { e.x = pl.x + c * 60; e.y = pl.y + s * 60; e.hp = e.hpMax = 500; }
      return ok;
    });
    // Ghi invulT ngay sau end() (chụp dãy ảnh mất hơn 0.5 s nên đọc muộn sẽ thấy 0).
    await p.evaluate(() => { const S = SK.SKILLS.cartwheel, e0 = S.end; S.end = function (G, pl) { e0.call(this, G, pl); window._cwInv = pl.invulT; }; });
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(250);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    const s = await h.snap(p);
    await h.seq(p, 'ranger_2', 6, 70);
    await h.until(p, () => SK.G.player.skillT <= 0, null, 6000);
    const inv = await p.evaluate(() => window._cwInv);
    await h.sleep(250);
    const e = await h.snap(p);
    const m = await p.evaluate(() => { const pl = SK.G.player; return { last: pl._cwLast, cd: pl._ch.cd, speed: pl.h.speed * SK.PPU * (pl.speedMul || 1), face: pl.face }; });
    h.check('ranger cartwheel: ' + r.max + ' lượt [ĐO maxCount], bấm một lần còn ' + (r.max - 1), s.ch && s.ch.max === r.max && s.ch.n === r.max - 1, JSON.stringify(s.ch));
    h.check('ranger cartwheel: lăn bất tử (không mất máu/giáp)', imm === false && s.php === a.php && s.parm === a.parm, 'php ' + s.php);
    h.check('ranger cartwheel: bấm nhẹ vẫn lăn tối thiểu 0.5 s [ĐO MinRollingTime]', m.last >= 0.5 && m.last < 0.62, 'lăn ' + m.last.toFixed(3) + ' s');
    const dist = Math.hypot(e.px - a.px, e.py - a.py), want = m.speed * 2 * m.last;
    h.check('ranger cartwheel: quãng lăn = tốc chạy × (1 + rollSpeed 1) × giây lăn [ĐO SetVelocity]', dist > want * 0.6 && dist < want * 1.1 && placed, 'dời ' + Math.round(dist) + ' px, mong ' + Math.round(want));
    h.check('ranger cartwheel: đâm quái khi lăn gây 5 [ĐO ProcessSkillDamage(5)]', h.hitsOf(e, 'roll').length > 0 && h.hitsOf(e, 'roll').every(d => d === 5 || d === 10), 'đòn ' + e.hits.map(x => x.join(':')).join(','));
    const t = Math.min(1, m.last / (r.dur - 1.5)), per = Math.trunc(Math.round(8 + 16 * t) / 3);
    h.check('ranger cartwheel: chém cuối mỗi rìu ' + per + ' = ⌊(8 + 16 × ' + t.toFixed(3) + ') / 3⌋ [ĐO AxeAttack]', h.hitsOf(e, 'roll_slash').length > 0 && h.hitsOf(e, 'roll_slash').every(d => d === per || d === per * 2), 'đòn ' + e.hits.map(x => x.join(':')).join(','));
    const wantCd = Math.min(r.cd, 1.5 + m.last * r.cd / r.dur);
    h.check('ranger cartwheel: lượt hồi ' + wantCd.toFixed(2) + ' s = 1.5 + giây lăn × cd/dur [ĐO SkillReload], cd gốc ' + r.cd, e.cd === r.cd && Math.abs(m.cd - wantCd) < 0.01, 'cd lượt ' + m.cd.toFixed(3));
    h.check('ranger cartwheel: sau lăn còn bất tử 0.5 s [ĐO RollingEnd StartHitTrigger]', inv === 0.5, 'invulT ' + inv);
  }
});
