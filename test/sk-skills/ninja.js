// Ca kiểm Ninja Xuyên Không (c20): ô 0 time_space_shuriken, ô 1 chrono_hunt. Bấm K thật, đo bằng số của mã gốc.
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
    // Vùng ngưng đọng sinh 0,5 s sau khi thả [ĐO ReleaseShuriken], bán kính 5 ô, tốc Shuriken giảm bậc thang ×0,4 mỗi 0,1 s.
    await until(p, () => SK.G.player._shu && SK.G.player._shu.zone, null, 2500);
    await seq(p, 'ninja_0', 6, 80);
    const z = await p.evaluate(() => {
      const G = SK.G, pl = G.player, sh = pl._shu;
      if (!sh) return null;
      const b = { side: 'e', kind: 'orb', x: sh.x + 30, y: sh.y, h: 8, vx: -200, vy: 0, ang: Math.PI, dmg: 1, r: 3, life: 3, _probe: 1 };
      G.bullets.push(b);
      return { t: sh.t, v: sh.v, slowed: G.enemies.filter(e => e._nzT > 0).map(e => e.moveMul) };
    });
    await sleep(120);
    const bv = await p.evaluate(() => { const b = SK.G.bullets.find(x => x._probe); return b ? Math.abs(b.vx) : null; });
    const a = await snap(p);
    check('ninja time_space_shuriken: Shuriken ' + TS.dmg + ' sát thương, Phi Kim ' + TS.needle.dmg + ' [ĐO skill0ShurikenDmg, IntervalCreateBullet]',
      hitsOf(a, 'shuriken').every(d => d === TS.dmg) && hitsOf(a, 'shuriken').length >= 1 && hitsOf(a, 'needle').every(d => d === TS.needle.dmg || d === TS.needle.dmg * crit) && hitsOf(a, 'needle').length >= 1,
      'shuriken ' + hitsOf(a, 'shuriken').join(',') + ' · phi kim ' + hitsOf(a, 'needle').join(','));
    check('ninja time_space_shuriken: quái trúng giảm ' + TS.slow * 100 + '% tốc chạy [ĐO buff_speed_down_ninja]; đạn địch vào vùng bị chia ' + TS.bulletDiv + ' vận tốc (200 → ' + 200 / TS.bulletDiv + ') [ĐO NinjaTimeStopCircle]',
      z && z.t >= TS.zoneDelay && z.slowed.length >= 1 && z.slowed.every(m => near(m, 1 - TS.slow, 0.01)) && bv != null && near(bv, 200 / TS.bulletDiv, 3), 'zone t ' + (z && z.t.toFixed(2)) + ' · moveMul ' + (z && z.slowed.join(',')) + ' · |vx| ' + bv);
    check('ninja time_space_shuriken: Shuriken đã dừng (tốc bậc thang 40 × 0,4^n nên hết trong ~0,5 s hoặc chạm tường) và vùng bán kính ' + TS.zoneR / 16 + ' ô sống ' + TS.zoneLife + ' s [ĐO]', z && z.v < 40 * 16 * 0.05, 'v ' + (z && z.v));
    await pressK(p);
    await sleep(700);
    const e = await snap(p);
    const dash = await p.evaluate(() => SK.G.player.skillT);
    const cnt = hitsOf(e, 'slash').length + hitsOf(e, 'void_slash').length;
    check('ninja time_space_shuriken: bấm lại phát động lại: tốc biến chém ' + TS.slash + ' [ĐO skill0SlashDmg] tối đa ' + TS.dashMax + ' quái, rồi nhát kiếm ' + TS.sword + ' [ĐO skill0SwordDmg] lên quái đang chậm, kết thúc kỹ năng',
      dash <= 0 && cnt >= 1 && hitsOf(e, 'slash').concat(hitsOf(e, 'void_slash'), hitsOf(e, 'sword')).every(d => d === TS.slash || d === TS.slash * crit) && hitsOf(e, 'slash').length <= TS.dashMax,
      'skillT ' + dash.toFixed(2) + ' · chém ' + hitsOf(e, 'slash').join(',') + ' · vũ trụ ' + hitsOf(e, 'void_slash').join(',') + ' · kiếm ' + hitsOf(e, 'sword').join(','));
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
    check('ninja chrono_hunt: cd ' + r.cd + ' s, miễn sát thương ' + r.dur + ' s [ĐO config, GetSkill1HyperSpaceDuration]', s.cd === r.cd && near(s.skillT, r.dur - 0.15, 0.35) && imm === false, 'skillT ' + s.skillT.toFixed(2) + ' · hurt ' + imm);
    // Bấm liền hai lần: lần hai bị chặn vì nhát đầu đang chém dở; đòn trúng sau ' + CH.delay + ' s.
    await pressK(p); await pressK(p);
    const early = hitsOf(await snap(p), 'chrono').length;
    await sleep(350);
    const a = await snap(p);
    await pressK(p); await sleep(400);
    await seq(p, 'ninja_1', 6, 50);
    const b = await snap(p);
    const recs = await p.evaluate(() => SK.G.player._chr && SK.G.player._chr.recs.length);
    check('ninja chrono_hunt: chém ' + CH.dmg + ' [ĐO skill1SlashDamage], trúng sau ' + CH.delay + ' s (chưa trúng lúc bấm), bấm chồng bị chặn [ĐO TryStartSkill1Slash]; ghi ' + recs + ' bản ghi',
      early === 0 && hitsOf(a, 'chrono').length === 1 && hitsOf(b, 'chrono').length === 2 && hitsOf(b, 'chrono').every(d => d === CH.dmg || d === CH.dmg * crit) && recs === 2,
      'sớm ' + early + ' · đầu ' + hitsOf(a, 'chrono').join(',') + ' · sau ' + hitsOf(b, 'chrono').join(',') + ' · recs ' + recs);
    // Hết thời gian: mỗi bản ghi triệu một bóng cách nhau 0,3 s, sống 1,5 s.
    const ph = await p.evaluate(CH => new Promise(res => {
      const G = SK.G, pl = G.player, t00 = performance.now(), seen = [];
      pl.skillT = 1e-4;
      const tick = () => {
        const n = G.props.filter(q => q.update && q.draw && q.draw.length === 1 && q.t != null && q.x != null && q.y < 1e8).length;
        seen.push([+(performance.now() - t00).toFixed(0), n]);
        if (performance.now() - t00 > 2600) return res({ max: Math.max(...seen.map(s => s[1])), last: seen[seen.length - 1][1] });
        setTimeout(tick, 50);
      };
      tick();
    }), CH);
    check('ninja chrono_hunt: hết thời gian triệu bóng ninja (' + CH.ph.every + ' s một bóng, sống ' + CH.ph.life + ' s) rồi biến mất [ĐO ReleaseSkill1Phantoms]; thấy ' + ph.max + ' bóng cùng lúc, còn ' + ph.last + ' cuối', ph.max >= 1 && ph.last === 0, JSON.stringify(ph));
  }
});
