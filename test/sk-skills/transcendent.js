// Ca kiểm Kẻ Vượt Ranh Giới (c17): ô 0 dimension_jumping, ô 1 blackhole_refract_blackhole_burst.
module.exports = h => ({
  async 'transcendent/0'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf } = h;
    const r = await real(p, 'transcendent', 'dimension_jumping');
    const DJ = await p.evaluate(() => SK.SKILLS.dimension_jumping.DJ);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 500; });
    await standNear(p, 60);
    await pressK(p); await sleep(150);
    const s = await snap(p);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    check('transcendent dimension_jumping: cd ' + r.cd + ' s, dịch chuyển ' + r.dur + ' s [ĐO config], chạy x' + DJ.skillSpeed + ' [ĐO addMoveSpeedSkill], không bị thương',
      s.cd === r.cd && near(s.skillT, r.dur - 0.15, 0.4) && near(s.move, DJ.skillSpeed, 0.01) && imm === false, 'skillT ' + s.skillT.toFixed(2) + ' · move ' + s.move + ' · hurt ' + imm);
    // Xuyên địa hình: tìm ô trống có tường bên phải, đứng sát tường rồi giữ phím phải.
    const wall = await p.evaluate(() => {
      const G = SK.G, W = SK.world, pl = G.player, T = 16;
      for (let ty = 3; ty < G.map.H - 3; ty++) for (let tx = 3; tx < G.map.W - 4; tx++) {
        const x = tx * T + 8, y = ty * T + 12;
        if (!W.solidAt(G.map, x, y) && W.solidAt(G.map, x + 12, y) && W.solidAt(G.map, x + 12, y - 4)) { pl.x = x + 3; pl.y = y; pl._dj.lx = pl.x; pl._dj.ly = pl.y; return [x, y]; }
      }
      return null;
    });
    await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
    const px = await p.evaluate(() => SK.G.player.x);
    check('transcendent dimension_jumping: đi xuyên tường', wall && px > wall[0] + 12, 'x ' + (wall && wall[0]) + ' -> ' + px.toFixed(1));
    // Đánh dấu: chạm quái thì có đếm ngược delayDeadTime.
    await p.evaluate(() => { const G = SK.G, pl = G.player; const e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); e.x = pl.x; e.y = pl.y; e.st = 'idle'; e.stT = 99; e._tt = 1; });
    await sleep(200);
    const m = await p.evaluate(() => { const e = SK.G.enemies.find(q => q._tt); return e && e._mark ? e._mark.t : null; });
    check('transcendent dimension_jumping: chạm quái đánh dấu, đếm ngược ' + DJ.delay + ' s [ĐO delayDeadTime]', m != null && m <= DJ.delay && m > DJ.delay - 0.6, 'còn ' + m);
    // Khe nứt: qua khe hồi năng lượng, kéo dài thời gian, mở sóng đánh dấu quái gần.
    const before = await p.evaluate(() => {
      const G = SK.G, pl = G.player; pl.energy = 0;
      const o = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn' && !q._tt); if (o) { o.x = pl.x + 24; o.y = pl.y; o.st = 'idle'; o.stT = 99; o._oo = 1; }
      SK.SKILLS.dimension_jumping.spawnCrack(G, pl.x + 4, pl.y);
      return { t: pl.skillT };
    });
    await sleep(120);
    const c = await p.evaluate(() => { const pl = SK.G.player, o = SK.G.enemies.find(q => q._oo); return { t: pl.skillT, en: pl.energy, added: pl._dj && pl._dj.added, mk: !!(o && o._mark), boost: pl._boost && pl._boost.f }; });
    await seq(p, 'transcendent_0', 6, 60);
    check('transcendent dimension_jumping: qua khe nứt +' + DJ.energy + ' năng lượng, +' + DJ.addT + ' s [ĐO recoverEnergy, addSkillTime], sóng đánh dấu quái gần',
      c.en === DJ.energy && c.added === 1 && c.t > before.t - 0.3 && c.mk && near(c.boost, DJ.boost, 0.01), JSON.stringify(c) + ' · trước ' + before.t.toFixed(2));
    // Hết đếm ngược: quái thường chết.
    await p.evaluate(() => { const e = SK.G.enemies.find(q => q._tt); e._mark.t = 0.05; });
    await sleep(300);
    const d = await snap(p);
    check('transcendent dimension_jumping: hết đếm ngược quái nhận sát thương', hitsOf(d, 'mark').length >= 1, 'đòn ' + hitsOf(d, 'mark').join(','));
  },
  async 'transcendent/1'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'transcendent', 'blackhole_refract_blackhole_burst');
    const BH = await p.evaluate(() => SK.SKILLS.blackhole_refract_blackhole_burst.BH);
    const args = r.args.split(';').map(Number);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 500; });
    await standNear(p, 60);
    await pressK(p); await sleep(150);
    const s = await snap(p);
    const st = await p.evaluate(() => ({ rifts: (SK.G._rifts || []).length, hidden: SK.G.player.hidden }));
    check('transcendent blackhole_refract: cd ' + r.cd + ' s, ' + r.max + ' lượt [ĐO config], đặt 1 hố và tàng hình ' + BH.shuttle + ' s [ĐO skill2ShuttleDuration]',
      s.cd === r.cd && s.ch && s.ch.max === r.max && s.ch.n === r.max - 1 && st.rifts === 1 && st.hidden && near(s.skillT, BH.shuttle - 0.15, 0.4), JSON.stringify(s.ch) + ' · hố ' + st.rifts + ' · skillT ' + s.skillT.toFixed(2));
    const rate = await p.evaluate(() => { const pl = SK.G.player; let z = 0; for (let i = 0; i < 600; i++) if (pl._hurt.bh(SK.G, pl, 3) === 0) z++; return z / 600; });
    check('transcendent blackhole_refract: tàng hình tránh ' + (100 - BH.hurt) + '% sát thương [ĐO shuttleHurtRate ' + BH.hurt + ']', near(rate, (100 - BH.hurt) / 100, 0.08), 'tránh ' + rate.toFixed(2));
    // Hố thứ hai sau khi hết tàng hình.
    await until(p, () => SK.G.player.skillT <= 0, null, 3000);
    await p.evaluate(() => { const pl = SK.G.player; pl.x += 40; });
    await sleep(350);
    await pressK(p); await sleep(200);
    const n2 = await p.evaluate(() => (SK.G._rifts || []).length);
    // Bản sao đạn: đạn đi qua hố 1 thì hiện thêm ở hố 2 với sát thương giảm.
    const cp = await p.evaluate(() => {
      const G = SK.G, [a, b] = G._rifts;
      G.bullets.push({ side: 'p', kind: 'pb', x: a.x, y: a.y, h: 8, vx: 0, vy: 0, ang: 0, dmg: 10, crit: false, repel: 0, r: 2, life: 1, _probe: 1 });
      return { a: [a.x, a.y], b: [b.x, b.y] };
    });
    await sleep(80);
    const clone = await p.evaluate(([bx, by]) => { const c = SK.G.bullets.find(x => x.side === 'p' && Math.hypot(x.x - bx, x.y - by) < 6 && x._rc); return c ? c.dmg : null; }, [cp.b[0], cp.b[1]]);
    const want = 10 * Math.max(BH.minF, 1 - BH.decay);
    check('transcendent blackhole_refract: ' + n2 + ' hố, bản sao đạn ở hố kia sát thương ' + want + ' [ĐO skill2DamageDecayPerExtraRift]', n2 === 2 && near(clone, want, 0.01), 'bản sao ' + clone);
    // Bùng nổ: bấm lại trong lúc tàng hình; hai hố đặt sát một quái để cả hai cùng trúng.
    await p.evaluate(() => {
      const G = SK.G, rf = G._rifts, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'), pl = G.player;
      pl.energy = 0; window._skHits = []; window._skDmg = 0;
      rf[0].x = e.x - 20; rf[0].y = e.y; rf[1].x = e.x + 20; rf[1].y = e.y;
      e.st = 'idle'; e.stT = 99;
    });
    await pressK(p); await sleep(300);
    const b = await snap(p);
    const post = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return { rifts: (SK.G._rifts || []).length, hurt: SK.hurtPlayer(SK.G, 3) }; });
    await seq(p, 'transcendent_1', 6, 60);
    check('transcendent blackhole_burst: mỗi hố nổ ' + BH.dmg + ' [ĐO skill2ExplodeDamage], +' + BH.energy + ' năng lượng mỗi hố, ' + args[2] + ' s vô địch tăng tốc x' + (1 + BH.speed) + ' [ĐO]',
      post.rifts === 0 && hitsOf(b, 'rift_burst').length >= 2 && hitsOf(b, 'rift_burst').every(d => d === BH.dmg) && b.en === 2 * BH.energy && near(b.move, 1 + BH.speed, 0.01) && near(b.skillT, args[2] - 0.3, 0.5) && post.hurt === false,
      'nổ ' + hitsOf(b, 'rift_burst').join(',') + ' · năng lượng ' + b.en + ' · move ' + b.move + ' · skillT ' + b.skillT.toFixed(2));
  }
});
