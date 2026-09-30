// Ca kiểm Kẻ Bị Chặt Đầu (c19): spartan_sandals.
module.exports = h => ({
  async 'beheaded/0'(p) {
    const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf } = h;
    const r = await real(p, 'beheaded', 'spartan_sandals');
    const K = await p.evaluate(() => SK.SKILLS.spartan_sandals.KICK);
    const crit = await p.evaluate(() => SK_GAME.rules ? SK_GAME.rules.critMult : SK.DS.rules.critMult);
    await standNear(p, 60);
    // Quái thứ hai đứng ngay sau quái bị đá, cùng đường bay.
    const placed = await p.evaluate(() => {
      const G = SK.G, pl = G.player, es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn');
      es.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
      if (es.length < 2) return false;
      const a = Math.atan2(es[0].y - pl.y, es[0].x - pl.x);
      es[1].x = es[0].x + Math.cos(a) * 26; es[1].y = es[0].y + Math.sin(a) * 26; es[1].st = 'idle'; es[1].stT = 99; es[1].cd = 99;
      return true;
    });
    await pressK(p); await sleep(120);
    const s = await snap(p);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await seq(p, 'beheaded_0', 6, 60);
    await h.until(p, () => SK.G.player.skillT <= 0, null, 2000);
    const end = await snap(p);
    await sleep(900);
    const e = await snap(p);
    const kick = hitsOf(e, 'kick'), col = hitsOf(e, 'kick_hit');
    check('beheaded spartan_sandals: cd ' + r.cd + ' [ĐO], cả chiêu ' + K.dur + ' s [ĐO SkillDuration], không nhận sát thương khi nhảy đá',
      s.cd === r.cd && near(s.skillT, K.dur - 0.12, 0.3) && imm === false, 'cd ' + s.cd + ' · skillT ' + s.skillT.toFixed(2) + ' · hurt ' + imm);
    check('beheaded spartan_sandals: đòn đá ' + K.dmg + ' sát thương [ĐO SkillBaseDamage]', kick.length >= 1 && kick.every(d => d === K.dmg || d === K.dmg * crit), 'đòn ' + kick.join(','));
    check('beheaded spartan_sandals: quái bị đá trúng quái khác nhận thêm ' + K.hitDmg + ' [ĐO kickHitDamage]', placed && col.length >= 2 && col.every(d => d === K.hitDmg || d === K.hitDmg * crit), 'đòn va ' + col.join(','));
    check('beheaded spartan_sandals: hết chiêu thì hồi chiêu đếm từ ' + r.cd + ' s [ĐO]', end.skillCd > 0 && end.skillCd <= r.cd, 'skillCd ' + end.skillCd.toFixed(2));
  }
});
