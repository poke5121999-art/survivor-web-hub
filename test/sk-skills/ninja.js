// Ca kiểm Ninja Xuyên Không (c20): ô 0 time_space_shuriken, ô 1 chrono_hunt.
module.exports = h => ({
  async 'ninja/0'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'ninja', 'time_space_shuriken');
    const TS = await p.evaluate(() => SK.SKILLS.time_space_shuriken.TS);
    const crit = await p.evaluate(() => SK.DS.rules.critMult);
    await standNear(p, 60);
    await pressK(p); await sleep(120);
    const s = await snap(p);
    check('ninja time_space_shuriken: cd ' + r.cd + ' s, thời lượng ' + r.dur + ' s [ĐO config]', s.cd === r.cd && near(s.skillT, r.dur - 0.12, 0.35), 'cd ' + s.cd + ' · skillT ' + s.skillT.toFixed(2));
    await until(p, () => SK.G.player._shu && SK.G.player._shu.phase === 'zone', null, 2500);
    await seq(p, 'ninja_0', 6, 80);
    const z = await p.evaluate(() => {
      const G = SK.G, pl = G.player, sh = pl._shu;
      if (!sh) return null;
      const b = { side: 'e', kind: 'orb', x: sh.x + 30, y: sh.y, h: 8, vx: -200, vy: 0, ang: Math.PI, dmg: 1, r: 3, life: 3, _probe: 1 };
      G.bullets.push(b);
      return { phase: sh.phase, slowed: G.enemies.filter(e => e._nzT > 0).map(e => e.moveMul) };
    });
    await sleep(120);
    const bv = await p.evaluate(() => { const b = SK.G.bullets.find(x => x._probe); return b ? Math.abs(b.vx) : null; });
    const a = await snap(p);
    check('ninja time_space_shuriken: Shuriken ' + TS.dmg + ' sát thương, Phi Kim ' + TS.needle.dmg + ' [ĐO skill0ShurikenDmg, IntervalCreateBullet]',
      hitsOf(a, 'shuriken').every(d => d === TS.dmg) && hitsOf(a, 'shuriken').length >= 1 && hitsOf(a, 'needle').every(d => d === TS.needle.dmg || d === TS.needle.dmg * crit) && hitsOf(a, 'needle').length >= 1,
      'shuriken ' + hitsOf(a, 'shuriken').join(',') + ' · phi kim ' + hitsOf(a, 'needle').join(','));
    check('ninja time_space_shuriken: quái trúng bị giảm ' + TS.slow * 100 + '% tốc chạy [ĐO buff_speed_down_ninja]; đạn địch trong vùng chậm còn ' + (1 - TS.slow) * 100 + '%',
      z && z.phase === 'zone' && z.slowed.length >= 1 && z.slowed.every(m => near(m, 1 - TS.slow, 0.01)) && bv != null && bv <= 200 * (1 - TS.slow) + 1, 'phase ' + (z && z.phase) + ' · moveMul ' + (z && z.slowed.join(',')) + ' · |vx| ' + bv);
    await pressK(p);
    await sleep(500);
    const e = await snap(p);
    const dash = await p.evaluate(() => SK.G.player.skillT);
    check('ninja time_space_shuriken: bấm lại phát động lại, chém xuyên ' + TS.slash + ' [ĐO skill0SlashDmg] và kết thúc kỹ năng', dash <= 0 && hitsOf(e, 'slash').concat(hitsOf(e, 'void_slash')).length >= 1 && hitsOf(e, 'slash').every(d => d === TS.slash || d === TS.slash * crit),
      'skillT ' + dash.toFixed(2) + ' · chém ' + hitsOf(e, 'slash').join(',') + ' · vũ trụ ' + hitsOf(e, 'void_slash').join(','));
  },
  async 'ninja/1'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf } = h;
    const r = await real(p, 'ninja', 'chrono_hunt');
    const CH = await p.evaluate(() => SK.SKILLS.chrono_hunt.CH);
    const crit = await p.evaluate(() => SK.DS.rules.critMult);
    await standNear(p, 60);
    await pressK(p); await sleep(150);
    const s = await snap(p);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    check('ninja chrono_hunt: cd ' + r.cd + ' s, miễn sát thương ' + r.dur + ' s [ĐO config]', s.cd === r.cd && near(s.skillT, r.dur - 0.15, 0.35) && imm === false, 'skillT ' + s.skillT.toFixed(2) + ' · hurt ' + imm);
    await pressK(p); await pressK(p); await sleep(100);
    const a = await snap(p);
    await sleep(350);
    await pressK(p); await sleep(100);
    await seq(p, 'ninja_1', 6, 50);
    const b = await snap(p);
    check('ninja chrono_hunt: mỗi lần bấm chém ' + CH.dmg + ' [ĐO skill1SlashDamage], cách nhau ≥ ' + CH.gap + ' s [ĐO]',
      hitsOf(a, 'chrono').length === 1 && hitsOf(b, 'chrono').length === 2 && hitsOf(b, 'chrono').every(d => d === CH.dmg || d === CH.dmg * crit), 'lần đầu ' + hitsOf(a, 'chrono').join(',') + ' · sau ' + hitsOf(b, 'chrono').join(','));
  }
});
