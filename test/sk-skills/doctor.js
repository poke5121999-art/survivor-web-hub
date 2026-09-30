// Ca kiểm Nhà Vật Lý (c27): em_field_device (ô 0), he_electric_orb (ô 1), quantum_translocator (ô 2). Số thật ở data/sk-skills86.js.
module.exports = h => ({
  async 'doctor/0'(p) {
    const r = await h.real(p, 'doctor', 'em_field_device');
    const dm = await p.evaluate(() => SK_SKILLS86.heroes.doctor.ctrlFields.damages);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
    await h.standNear(p, 60);
    await h.pressK(p);
    await h.until(p, () => (SK.G._emFields || []).length > 0, null, 2000);
    const a = await p.evaluate(() => { const f = SK.G._emFields[0], pl = SK.G.player; return { r: f.r, d: Math.hypot(f.x - pl.x, f.y - pl.y), zaps: f.zapN }; });
    await h.seq(p, 'doctor_0', 6, 60);
    await p.keyboard.down('KeyJ'); await h.sleep(900); await p.keyboard.up('KeyJ');
    const s = await h.snap(p);
    await h.until(p, () => (SK.G._emFields || []).every(f => f.gone), null, 6000);
    const e = await p.evaluate(() => ({ alive: (SK.G._emFields || []).filter(f => !f.gone).length }));
    const z = h.hitsOf(s, 'field'), boom = h.hitsOf(s, 'skill');
    h.check('doctor em_field_device: nổ ' + dm[0] + ' sát thương [ĐO ctrlFields.damages[0]], hồi chiêu ' + r.cd + ' s [ĐO]', boom.length > 0 && boom.every(d => d === dm[0] || d === dm[0] * 2) && s.cd === r.cd && a.r === 64, 'nổ ' + boom.join(',') + ' · bán kính ' + a.r);
    h.check('doctor em_field_device: từ trường chớp ' + dm[1] + ' sát thương/nhịp [ĐO damages[1]], tối đa 2 con nảy [ĐO maxTarget]', z.length > 0 && z.length <= 2 * 2 && z.every(d => d === dm[1] || d === dm[1] * 2), 'chớp ' + z.join(','));
    h.check('doctor em_field_device: đạn xuyên từ trường gây choáng điện (Điện Cảm)', s.dbEver.indexOf('ele') >= 0, 'hiệu ứng: ' + s.dbEver.join(','));
    h.check('doctor em_field_device: từ trường hết sau ~5 s [ĐO ThunderShield.duration 4.7 + fade 0.3]', e.alive === 0, 'còn ' + e.alive);
  },
  async 'doctor/1'(p) {
    const r = await h.real(p, 'doctor', 'he_electric_orb');
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
    await h.standNear(p, 70);
    await h.pressK(p); await h.sleep(900);
    const s = await h.snap(p);
    const o = await p.evaluate(() => { const pl = SK.G.player, o = pl._orb; return o ? { balls: o.balls.length, shields: o.shields } : null; });
    await p.keyboard.down('KeyJ'); await h.seq(p, 'doctor_1', 6, 60); await p.keyboard.up('KeyJ');
    const beams = h.hitsOf(s, 'orb');
    // Trúng đòn: khiên giảm sát thương.
    const hurt = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.god = false; const hp = pl.hp + pl.armor; SK.hurtPlayer(G, 4); return hp - (pl.hp + pl.armor); });
    const left = await p.evaluate(() => SK.G.player._orb && SK.G.player._orb.shields);
    await h.resetDmg(p);
    await h.sleep(4 * 1000 + 700);
    const e = await h.snap(p);
    h.check('doctor he_electric_orb: 2 cầu + 2 khiên [WIKI], kéo dài 5 s [ĐO mã: InitSkill1Data đặt duration 5 đè cfg ' + r.dur + '], hồi chiêu ' + r.cd + ' s', o && o.balls === 2 && o.shields === 2 && s.skillT > 5 - 1.3 && s.skillT < 5 && s.cd === r.cd, JSON.stringify(o) + ' · skillT ' + s.skillT.toFixed(2));
    h.check('doctor he_electric_orb: mỗi cầu bắn tia xuyên 4 sát thương [ĐO C28Skill1 damage]', beams.length >= 2 && beams.every(d => d === 4 || d === 8), 'tia ' + beams.join(','));
    h.check('doctor he_electric_orb: khiên giảm sát thương một nửa rồi hao mòn (4 → 2, còn 1 khiên)', hurt === 2 && left === 1, 'nhận ' + hurt + ' · khiên còn ' + left);
    h.check('doctor he_electric_orb: hết giờ thì cầu phóng ra đánh kẻ địch', h.hitsOf(e, 'orb').length >= 1 && (await p.evaluate(() => !SK.G.player._orb)), 'đòn cuối ' + h.hitsOf(e, 'orb').join(','));
  },
  async 'doctor/2'(p) {
    const r = await h.real(p, 'doctor', 'quantum_translocator');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.doctor.ctrlFields);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
    await h.standNear(p, 110);
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(150);
    await p.evaluate(() => {   // đạn địch bay vào dải phải bị xoá
      const G = SK.G, pl = G.player, f = G._qFields[0];
      G.bullets.push({ side: 'e', kind: 'orb', x: f.x0 + Math.cos(f.dir) * 60, y: f.y0 - 8 + Math.sin(f.dir) * 60, h: 8, vx: 0, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 });
    });
    await h.sleep(120);
    const s = await h.snap(p);
    const q = await p.evaluate(() => {
      const G = SK.G, pl = G.player, f = G._qFields[0];
      return { n: G._qFields.length, len: f.len, w: f.width, probe: G.bullets.some(b => b._probe), inv: pl.invulT, move: pl.moveMul || 1, rate: pl.rateMul || 1, stopped: f.stopped.size, stun: G.enemies.filter(e => e.st === 'stun').length };
    });
    // Nhịp đầu: lặp lại 10% sát thương đồng minh gây ra trong dải.
    await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, f = G._qFields[0]; const e = G.enemies.find(q => q.st === 'stun'); SK.hurtEnemy(G, e, 50, false, 0, 0); SK.hurtEnemy(G, e, 50, false, 0, 0); f.pulse = 0.3; });
    await h.sleep(500);
    await h.seq(p, 'doctor_2', 6, 60);
    const t = await h.snap(p);
    const moved = Math.hypot(s.px - a.px, s.py - a.py);
    h.check('doctor quantum_translocator: ' + r.max + ' lượt [ĐO maxCount], hồi chiêu ' + r.cd + ' s [ĐO], dùng một lượt', a.ch && a.ch.max === r.max && s.ch.n === r.max - 1 && s.cd === r.cd, JSON.stringify(s.ch));
    h.check('doctor quantum_translocator: chớp ' + cf.skill2BlinkDistance + ' ô [ĐO skill2BlinkDistance]', Math.abs(moved - cf.skill2BlinkDistance * 16) < 4, 'dời ' + Math.round(moved) + ' px');
    h.check('doctor quantum_translocator: dải rộng ' + cf.skill2BaseWidth + ' ô, dài tối đa ' + cf.skill2MaxLength + ' ô [ĐO]', q.n === 1 && q.w === cf.skill2BaseWidth * 16 && q.len <= cf.skill2MaxLength * 16 && q.len >= 16, JSON.stringify({ w: q.w, len: q.len }));
    h.check('doctor quantum_translocator: kẻ địch bị dừng thời gian, đạn địch bị xoá', q.stopped > 0 && q.stun > 0 && !q.probe, JSON.stringify({ dừng: q.stopped, choáng: q.stun, đạn: q.probe }));
    h.check('doctor quantum_translocator: trong dải +30% chạy/đánh, bất tử ' + cf.skill2FirstEnterInvincibleTime + ' s lần đầu [ĐO]', Math.abs(q.move - 1.3) < 1e-6 && Math.abs(q.rate - 1.3) < 1e-6 && q.inv > 0.4 && q.inv <= cf.skill2FirstEnterInvincibleTime, JSON.stringify({ move: q.move, rate: q.rate, inv: q.inv }));
    const pulse = h.hitsOf(t, 'qpulse');
    h.check('doctor quantum_translocator: xung lặp lại ' + cf.skill2BaseDamageRatio * 100 + '% sát thương đồng minh (100 → 10) [ĐO skill2BaseDamageRatio]', pulse.length > 0 && pulse.every(d => d === 10), 'xung ' + pulse.join(','));
  }
});
