// Ca kiểm Người Hát Rong (c35): melodic_pulse, resonant_symphony.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, pressK, seq, real, hitsOf } = h;
  const tank = p => p.evaluate(() => { SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }); });
  // Chờ nốt nhịp hiện tới cửa sổ trúng (sau 0,1 s) rồi bấm.
  const beat = async p => {
    const ok = await until(p, () => { const m = SK.G.player._bd && SK.G.player._bd.m; return m && m.note && m.note.t >= m.note.at + 0.15 && m.note.t < m.note.at + 0.5; }, null, 4000);
    await pressK(p); await sleep(60);
    return ok;
  };
  return {
    async 'bard/0'(p, id) {
      const r = await real(p, 'bard', 'melodic_pulse');
      const [rate, atk, crit] = r.args.split(';').map(Number);
      await standNear(p, 50); await tank(p);
      const a = await snap(p);
      const crit0 = await p.evaluate(() => SK.G.player.crit);
      await pressK(p); await sleep(200);
      const s0 = await snap(p);
      await beat(p);
      const s1 = await snap(p);
      await beat(p);
      const s2 = await snap(p);
      const crit2 = await p.evaluate(() => SK.G.player.crit);
      await seq(p, 'bard_0', 6, 50);
      const fx = await p.evaluate(atk => {
        const G = SK.G, pl = G.player, b = { side: 'p', dmg: 3, x: 0, y: 0 };
        G.bullets.push(b); pl.energy = pl.energyMax - 5;
        SK.emit('fire', G, pl, { def: { cost: 2 } });
        return { dmg: b.dmg, en: pl.energyMax - pl.energy };
      }, atk);
      await beat(p);
      const s3 = await snap(p);
      const lvl = await p.evaluate(() => SK.G.player._bd.m.lvl);
      check('bard melodic_pulse: ' + r.max + ' lượt [ĐO], pháp trận mở, chưa trúng nhịp thì cấp 0', a.ch.max === r.max && s0.ch.n === r.max - 1 && s0.skillT > 1 && s0.rate === 1, JSON.stringify(s0.ch) + ' · skillT ' + s0.skillT.toFixed(1));
      check('bard melodic_pulse: trúng nhịp 1 -> sóng 16 sát thương lên quái, cấp 1 tốc đánh +' + rate + '% [ĐO args]', hitsOf(s1, 'pulse').length >= 1 && hitsOf(s1, 'pulse').every(d => d === 16) && near(s1.rate, 1 + rate / 100, 0.001), 'sóng ' + hitsOf(s1, 'pulse').join(',') + ' · rate ' + s1.rate);
      check('bard melodic_pulse: cấp 2 bạo kích +' + crit + '% [ĐO args]', near(crit2 - crit0, crit, 0.001), 'bạo kích ' + crit0 + ' -> ' + crit2);
      check('bard melodic_pulse: cấp 2 đạn +' + atk + ' sát thương [ĐO args]', fx.dmg === 3 + atk, JSON.stringify(fx));
      check('bard melodic_pulse: đủ cấp 3 thì pháp trận tan sau ' + r.dur + ' s [ĐO dur]', lvl === 3 && s3.skillT <= r.dur && s3.skillT > 0.5, 'cấp ' + lvl + ' · skillT ' + s3.skillT.toFixed(2));
      const en = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.energy = pl.energyMax - 5; SK.emit('fire', G, pl, { def: { cost: 2 } }); return pl.energyMax - pl.energy; });
      check('bard melodic_pulse: cấp 3 hoàn 1 năng lượng mỗi phát (thiếu 5 -> 4)', en === 4, 'thiếu ' + en);
    },
    async 'bard/1'(p, id) {
      const r = await real(p, 'bard', 'resonant_symphony');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.bard.ctrlFields);
      await standNear(p, 50); await tank(p);
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl.energy = 50; pl.armor = pl.armorMax; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 20, y: pl.y - 6, h: 8, vx: 0, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 }); });
      const a = await snap(p);
      await pressK(p); await sleep(300);
      const s = await snap(p);
      const info = await p.evaluate(() => { const pl = SK.G.player, sy = pl._bd.sym, b = SK.G.bullets.find(x => x._probe); return { links: sy.links.length, alive: SK.G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').length, bullet: !b || b.dead, armor: pl.armor, max: pl.armorMax }; });
      await p.evaluate(() => { window._skHits = []; const G = SK.G, sy = G.player._bd.sym; SK.hurtEnemy(G, sy.links[0], 20, false, 0, 0); });
      const s2 = await snap(p);
      await sleep(1000);
      await seq(p, 'bard_1', 6, 60);
      const s3 = await snap(p);
      const n = Math.min(+r.args, info.alive);
      check('bard resonant_symphony: ' + r.max + ' lượt, kéo ' + r.dur + ' s [ĐO], nối ' + n + ' quái [ĐO args ' + r.args + ']', a.ch.max === r.max && info.links === n && s.skillT > r.dur - 1, 'nối ' + info.links + ' · skillT ' + s.skillT.toFixed(2));
      check('bard resonant_symphony: sóng âm xoá đạn địch trong vùng', info.bullet, JSON.stringify(info));
      const shared = Math.round(20 * cf.linkDamagePercent / 100);
      check('bard resonant_symphony: quái nối cộng hưởng ' + cf.linkDamagePercent + '% sát thương [ĐO linkDamagePercent]', info.links < 2 || (hitsOf(s2, 'link').length === info.links - 1 && hitsOf(s2, 'link').every(d => d === shared)), 'chia ' + hitsOf(s2, 'link').join(','));
      check('bard resonant_symphony: buff giáp tạm +' + cf.linkBuffExArmor + ', chạy x' + (1 + cf.linkBuffMoveSpeed / 100) + ', tốc đánh x' + (1 + cf.linkBuffAttackSpeed / 100) + ', năng lượng +1 mỗi ' + cf.linkBuffEnergyInterval + ' s [ĐO]', info.armor === info.max + cf.linkBuffExArmor && near(s.move, 1 + cf.linkBuffMoveSpeed / 100, 0.001) && near(s.rate, 1 + cf.linkBuffAttackSpeed / 100, 0.001) && s3.en >= 50 + 3, 'giáp ' + info.armor + '/' + info.max + ' · move ' + s.move + ' · rate ' + s.rate + ' · năng lượng ' + s3.en);
    }
  };
};
