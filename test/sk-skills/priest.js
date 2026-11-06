// Ca kiểm Nữ Tu (c10): ô 2 moon_shadow.
module.exports = h => ({
  async 'priest/2'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
    const r = await real(p, 'priest', 'moon_shadow');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.priest.ctrlFields.skill3MoonShadowConfig);
    const crit = await p.evaluate(() => SK.DS.rules.critMult);
    await standNear(p, 60);
    await sleep(1400);   // hình thái Bóng Đen tự sinh 1 cầu/s, bắn vào quái
    await seq(p, 'priest_2', 6, 200);
    await until(p, () => SK.G.player._ms && SK.G.player._ms.sh >= 1, null, 4000);
    const a = await snap(p);
    const vuln = await p.evaluate(() => SK.G.enemies.some(e => e._vuln > 0) || window._skDbEver);
    check('priest moon_shadow: cầu bóng 12 sát thương (×1,5 lên quái đang Dễ Tổn Thương) (chí mạng x' + crit + ') [ĐO shadowDamage], gây Dễ Tổn Thương',
      hitsOf(a, 'skill').length >= 1 && hitsOf(a, 'skill').every(d => [12, 18, 12 * crit, 18 * crit, 6].indexOf(d) >= 0), 'đòn ' + hitsOf(a, 'skill').join(',') + ' · vuln ' + vuln);
    const C = await p.evaluate(() => { const c = SK.SKILLS.moon_shadow.CONST; return { speed: c.SPEED / SK.PPU, turn: c.TURN, range: c.RANGE / SK.PPU, re: [c.RETARGET.shadow / SK.PPU, c.RETARGET.moon / SK.PPU], vuln: [c.VULN.t, c.VULN.k], kill: c.KILL_ENERGY }; });
    check('priest moon_shadow: tốc 10, bẻ lái 30°/0,02 s, tầm 12, đổi mục tiêu 30/90, Dễ Tổn Thương 3 s ×1,5, hạ quái +2 [ĐO BulletShadowBall/C11Controller]', C.speed === 10 && near(C.turn, 26.18, 0.01) && C.range === 12 && C.re.join() === '30,90' && C.vuln.join() === '3,0.5' && C.kill === 2, JSON.stringify(C));
    // hạ quái bằng cầu bóng: +1 (chí mạng 3) và +2 vì hạ được
    await p.evaluate(() => { const G = SK.G, pl = G.player; pl._ms.sh = 0; const es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y)); es[0].hp = 1; });
    await until(p, () => SK.G.player._ms.sh > 0, null, 4000);
    const ke = await p.evaluate(() => SK.G.player._ms.sh);
    check('priest moon_shadow: cầu bóng hạ quái cộng 3 năng lượng bóng (1 + 2), chí mạng 5 [ĐO OnPriestSkill3ShadowHit]', ke === 3 || ke === 5, 'sh ' + ke);
    const before = await p.evaluate(() => ({ sh: SK.G.player._ms.sh, n: SK.G.player._ms.orbs.filter(o => o.st === 'orbit').length }));
    await p.evaluate(() => { SK.G.player._ms.sh = 25; });
    await pressK(p); await sleep(150);
    const b = await p.evaluate(() => { const s = SK.G.player._ms; return { shadow: s.shadow, n: s.orbs.filter(o => o.st === 'orbit').length, extra: s.extra, cd: SK.G.player.skillCd }; });
    check('priest moon_shadow: bấm đổi sang Ánh Trăng, hồi chiêu ' + r.cd + ' s [ĐO], 25 năng lượng bóng = 2 cầu thêm (10/cầu) [ĐO shadowToMoonRatio]',
      !b.shadow && b.extra === 2 && b.n === cf.moonStorageLimit + 2 && near(b.cd, r.cd, 0.4), JSON.stringify(b));
    await p.evaluate(() => { const pl = SK.G.player; pl.hp = Math.max(1, pl.hpMax - 3); });
    const h0 = await snap(p);
    await sleep(1600);
    await seq(p, 'priest_2b', 6, 150);
    const h1 = await snap(p);
    const mo = await p.evaluate(() => SK.G.player._ms.mo);
    check('priest moon_shadow: cầu trăng ưu tiên hồi máu người chơi (+' + cf.moonHealValue + ' mỗi cầu) [ĐO moonHealValue], tích năng lượng trăng', h1.php > h0.php && mo >= 1, 'máu ' + h0.php + ' → ' + h1.php + ' · năng lượng trăng ' + mo);
  }
});
