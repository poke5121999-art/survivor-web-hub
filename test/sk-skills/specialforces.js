// Ca kiểm Đội Kỵ Sĩ Đặc Biệt (c21) — số đọc từ C22Controller (mã ARM) + prefab c21; xem chú thích games/soulknight/js/skills/specialforces.js.
module.exports = h => ({
  async 'specialforces/0'(p, id) {
    const r = await h.real(p, 'specialforces', 'special_operation');
    h.check('specialforces special_operation: cd ' + r.cd + ' s, ' + r.max + ' lượt [ĐO]', r.cd === 9 && r.max === 2);
    // Kỵ Sĩ Đỏ (ô 0): lao 6 ô trong 0,18 s, ném 4 dao găm 4 sát thương, dao đánh dấu; trúng dấu -> Trảm Kích 16.
    await h.standNear(p, 60);
    await p.evaluate(() => { const P = SK.G.player; P._spf = { av: 0, cd: [0, 0, 0], blueT: 0, blueLast: -9, greenT: 0, dash: null, hitAt: new Map() }; for (const e of SK.G.enemies) { e.hp = e.hpMax = 999; } });
    const x0 = await p.evaluate(() => [SK.G.player.x, SK.G.player.y]);
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(60);
    await h.seq(p, 'specialforces_0', 6, 50);
    await h.sleep(900);
    let s = await h.snap(p);
    const knives = h.hitsOf(s, 'sf_knife');
    h.check('specialforces đỏ: dao găm 4 sát thương [ĐO redNormalKnifeDamage]', knives.length >= 1 && knives.every(d => d === 4), 'đòn ' + knives.join(','));
    const marked = await p.evaluate(() => SK.G.enemies.filter(e => e._sfMark > 0).length);
    h.check('specialforces đỏ: quái trúng dao mang dấu', marked >= 1, marked + ' quái');
    await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q._sfMark > 0); SK.hurtEnemy(G, e, 3, false, 0, 0); });
    s = await h.snap(p);
    h.check('specialforces đỏ: đòn lên quái có dấu -> Bạo Kích chắc chắn + Trảm Kích 16 [ĐO redKnifeMarkSlashDamage]', h.hitsOf(s, 'sf_slash').includes(16) && h.hitsOf(s, 'sf_crit').length === 1, 'đòn ' + h.hitsOf(s).join(','));
    // Kỹ năng Đỏ đang hồi (4 s) -> bấm K = rút lui, gọi Kỵ Sĩ Xanh, tốn một lượt.
    await h.sleep(300);
    await h.pressK(p); await h.sleep(150);
    const sw = await p.evaluate(() => ({ av: SK.G.player._spf.av, n: SK.G.player._ch.n, cdRed: SK.G.player._spf.cd[0] }));
    h.check('specialforces: rút lui đổi sang Xanh, còn 1/2 lượt; Đỏ vẫn đang hồi 4 s [ĐO redNormalSkillCooldown]', sw.av === 1 && sw.n === 1 && sw.cdRed > 0, JSON.stringify(sw));
    // Kỵ Sĩ Xanh: 5 sao băng đầu tiên, 5 s; đánh trúng thì thêm 3 sao băng 4 sát thương.
    await h.pressK(p); await h.sleep(300);
    const b = await p.evaluate(() => SK.G.player._spf.blueT);
    h.check('specialforces xanh: trạng thái sao băng 5 s [ĐO blueSkillDuration]', b > 4 && b <= 5, b.toFixed(2));
    await h.sleep(900);
    s = await h.snap(p);
    const met = h.hitsOf(s, 'sf_meteor');
    h.check('specialforces xanh: sao băng đầu 4 sát thương [ĐO blueSkillMeteorBaseDamage]', met.length >= 1 && met.every(d => d === 4), 'đòn ' + met.join(','));
    await h.sleep(1500);
    await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q.hp > 0 && q.st !== 'dead'); SK.hurtEnemy(G, e, 3, false, 0, 0); });
    await h.sleep(900);
    s = await h.snap(p);
    const att = h.hitsOf(s, 'sf_meteor');
    h.check('specialforces xanh: mỗi đòn trúng gọi thêm sao băng (nghỉ >2 s nên đủ sức x2 = 8)', att.length >= 1 && att.every(d => d === 8), 'đòn ' + att.join(','));
    // Kỵ Sĩ Lục: chạy x1,5, tốc đánh x1,3 trong 2 s.
    await p.evaluate(() => { const P = SK.G.player; P._spf.av = 2; P._spf.cd[2] = 0; P._spf.blueT = 0; });
    await h.sleep(300);
    await h.pressK(p); await h.sleep(200);
    s = await h.snap(p);
    h.check('specialforces lục: chạy x1,5 và tốc đánh x1,3 [ĐO greenNormalSkillSpeedRate 0,5]', h.near(s.move, 1.5, 0.01) && h.near(s.rate, 1.3, 0.01), 'move ' + s.move + ' rate ' + s.rate);
    await h.sleep(2200);
    s = await h.snap(p);
    h.check('specialforces lục: hết 2 s [ĐO greenNormalSkillDuration] trả tốc về 1', h.near(s.move, 1, 0.01) && h.near(s.rate, 1, 0.01), 'move ' + s.move);
  }
});
