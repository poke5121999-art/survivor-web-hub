// Ca kiểm Nhà Vật Lý (c27): em_field_device (ô 0), he_electric_orb (ô 1), quantum_translocator (ô 2). Số thật ở data/sk-skills86.js;
// các số đọc thêm từ mã ARM/MonoBehaviour ghi ngay ở từng ca (sk_method.py, common.ab).
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
    h.check('doctor em_field_device: nổ ' + dm[0] + ' sát thương [ĐO ctrlFields.damages[0]], hồi chiêu ' + r.cd + ' s [ĐO]', boom.length > 0 && boom.every(d => d === dm[0] || d === dm[0] * 2) && s.cd === r.cd, 'nổ ' + boom.join(','));
    // Bán kính = CircleCollider 3 của shield_thunder_doctor/b x setScaleMult 1.3 (C28Controller..ctor) = 3.9 ô; số chớp = ceil(4.7 / emitterTime 1) = 5.
    h.check('doctor em_field_device: bán kính 3 x 1.3 = 3.9 ô [ĐO CircleCollider + setScaleMult]', Math.abs(a.r - 3.9 * 16) < 1e-6, 'bán kính ' + a.r + ' px');
    h.check('doctor em_field_device: từ trường chớp ' + dm[1] + ' sát thương/nhịp [ĐO damages[1]], tối đa 2 con nảy [ĐO maxTarget]', z.length > 0 && z.length <= 2 * 2 && z.every(d => d === dm[1] || d === dm[1] * 2), 'chớp ' + z.join(','));
    h.check('doctor em_field_device: đạn xuyên từ trường gây choáng điện (Điện Cảm), nhận viên đạn qua G._hitBullet', s.dbEver.indexOf('ele') >= 0, 'hiệu ứng: ' + s.dbEver.join(','));
    h.check('doctor em_field_device: từ trường hết sau ~5 s [ĐO ThunderShield.duration 4.7 + fade 0.3]', e.alive === 0, 'còn ' + e.alive);
  },
  async 'doctor/1'(p) {
    const r = await h.real(p, 'doctor', 'he_electric_orb');
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
    await h.standNear(p, 70);
    // Tia bắn từ cầu bay cao 22 px trên người chơi, song song hướng nhắm: nâng hàng quái lên để tâm chúng nằm trên đường tia (hiện trường cố định).
    // Cả bốn con nằm một hàng thẳng trên trục tia (nhắm tự động cũng chỉ thấy hàng đó).
    await p.evaluate(() => { const es = SK.G.enemies.filter(e => e.st !== 'dead'), x0 = Math.min(...es.map(e => e.x)), y0 = Math.min(...es.map(e => e.y)); es.forEach((e, i) => { e.x = x0 + 22 * i; e.y = y0 - 15; }); });
    await h.pressK(p); await h.sleep(900);
    const s = await h.snap(p);
    const o = await p.evaluate(() => { const pl = SK.G.player, o = pl._orb; return o ? { balls: o.balls.length, shields: o.shields } : null; });
    const first = h.hitsOf(s, 'orb');
    await h.seq(p, 'doctor_1', 6, 60);
    // Trúng đòn: khiên giảm sát thương.
    const hurt = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.god = false; const hp = pl.hp + pl.armor; SK.hurtPlayer(G, 4); return hp - (pl.hp + pl.armor); });
    const left = await p.evaluate(() => SK.G.player._orb && SK.G.player._orb.shields);
    // Kho năng lượng: Full sau 2 x shootCD 0.75 s, phát Full = 6 (4 x 1.5); bấm sớm hơn 0.75 s bị bỏ qua; Half = 4.
    await h.until(p, () => { const o = SK.G.player._orb; return o && o.t - o.last >= 1.55; }, null, 4000);
    await h.resetDmg(p);
    const emit = () => p.evaluate(() => { const o = SK.G.player._orb, before = o.last; SK.emit('fire', SK.G, SK.G.player); return { changed: o.last !== before, since: o.t - before }; });
    const full = await emit(); await h.sleep(120);
    const sFull = await h.snap(p);
    await h.sleep(250);
    const early = await emit();
    await h.until(p, () => { const o = SK.G.player._orb; return o && o.t - o.last >= 0.8; }, null, 3000);
    await h.resetDmg(p);
    const half = await emit(); await h.sleep(120);
    const sHalf = await h.snap(p);
    await h.resetDmg(p);
    await h.until(p, () => !SK.G.player._orb, null, 4000);
    await h.sleep(900);
    const e = await h.snap(p);
    const thunder = h.hitsOf(e, 'thunder');
    h.check('doctor he_electric_orb: 2 cầu + 2 khiên [ĐO ctor startBallCount/startShieldCount], kéo dài 5 s [ĐO mã: InitSkill1Data đặt duration 5 đè cfg ' + r.dur + '], hồi chiêu ' + r.cd + ' s', o && o.balls === 2 && o.shields === 2 && s.skillT > 5 - 1.3 && s.skillT < 5 && s.cd === r.cd, JSON.stringify(o) + ' · skillT ' + s.skillT.toFixed(2));
    h.check('doctor he_electric_orb: phát bắn đầu khi cầu vào chỗ, mỗi tia xuyên 4 sát thương [ĐO C28Skill1 damage]', first.length >= 1 && first.every(d => d === 4 || d === 8), 'tia ' + first.join(','));
    h.check('doctor he_electric_orb: khiên giảm sát thương một nửa rồi hao mòn (4 → 2, còn 1 khiên)', hurt === 2 && left === 1, 'nhận ' + hurt + ' · khiên còn ' + left);
    h.check('doctor he_electric_orb: sau 1.5 s tia Full x1.5 = 6 [ĐO InitShootData damageFactor +0.5]', full.changed && h.hitsOf(sFull, 'orb').length >= 1 && h.hitsOf(sFull, 'orb').every(d => d === 6 || d === 12), 'tia ' + h.hitsOf(sFull, 'orb').join(','));
    h.check('doctor he_electric_orb: bấm lại sau 0.25 s (< shootCD 0.75 s) bị bỏ qua [ĐO SkillUpdate1/OnPlayerAttack]', !early.changed && early.since < 0.75, JSON.stringify(early));
    h.check('doctor he_electric_orb: từ Half (0.75 s) bắn tia thường 4', half.changed && h.hitsOf(sHalf, 'orb').length >= 1 && h.hitsOf(sHalf, 'orb').every(d => d === 4 || d === 8), 'tia ' + h.hitsOf(sHalf, 'orb').join(','));
    h.check('doctor he_electric_orb: hết giờ mỗi cầu bay tới quái và giáng sét 5 sát thương [ĐO ballLightStartDamage, GenThunderByPlayer]', thunder.length >= 2 && thunder.length <= 4 && thunder.every(d => d === 5), 'sét ' + thunder.join(',') + ' · còn cầu ' + (await p.evaluate(() => !!SK.G.player._orb)));
  },
  async 'doctor/2'(p) {
    const r = await h.real(p, 'doctor', 'quantum_translocator');
    const cf = await p.evaluate(() => SK_SKILLS86.heroes.doctor.ctrlFields);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
    await h.standNear(p, 100);
    const a = await h.snap(p);
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(150);
    await p.evaluate(() => {   // đạn địch bay vào dải phải bị xoá
      const G = SK.G, f = G._qFields[0];
      G.bullets.push({ side: 'e', kind: 'orb', x: f.x0 + Math.cos(f.dir) * 60, y: f.y0 - 8 + Math.sin(f.dir) * 60, h: 8, vx: 0, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 });
    });
    await h.sleep(120);
    const s = await h.snap(p);
    await h.until(p, () => SK.G._qFields[0].width >= 6.5 * 16, null, 1500);   // dải nở ra trong skill2WidthExpandDuration 0.33 s
    const q = await p.evaluate(() => {
      const G = SK.G, pl = G.player, f = G._qFields[0];
      return { n: G._qFields.length, len: f.len, w: f.width, probe: G.bullets.some(b => b._probe), inv: pl.invulT, move: pl.moveMul || 1, rate: pl.rateMul || 1, stopped: f.stopped.size, stun: G.enemies.filter(e => e.st === 'stun').length, x0: f.x0, y0: f.y0, dir: f.dir, px: pl.x, py: pl.y };
    });
    // Nhịp đầu: 10% sát thương đồng minh gây lên quái trong dải; mọi quái trong dải nhận cùng số đó.
    await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, f = G._qFields[0]; const e = G.enemies.find(q => q.st === 'stun'); SK.hurtEnemy(G, e, 50, false, 0, 0); SK.hurtEnemy(G, e, 50, false, 0, 0); f.pulse = 0.3; });
    await h.sleep(500);
    await h.seq(p, 'doctor_2', 6, 60);
    const t = await h.snap(p);
    const moved = Math.hypot(s.px - a.px, s.py - a.py);
    const blinkHits = h.hitsOf(s, 'blink');
    h.check('doctor quantum_translocator: ' + r.max + ' lượt [ĐO maxCount], hồi chiêu ' + r.cd + ' s [ĐO], dùng một lượt', a.ch && a.ch.max === r.max && s.ch.n === r.max - 1 && s.cd === r.cd, JSON.stringify(s.ch));
    h.check('doctor quantum_translocator: chớp ' + cf.skill2BlinkDistance + ' ô [ĐO skill2BlinkDistance]', Math.abs(moved - cf.skill2BlinkDistance * 16) < 4, 'dời ' + Math.round(moved) + ' px');
    h.check('doctor quantum_translocator: dải rộng ' + cf.skill2BaseWidth + ' ô, dài tối đa ' + cf.skill2MaxLength + ' ô [ĐO]', q.n === 1 && q.w === cf.skill2BaseWidth * 16 && q.len <= cf.skill2MaxLength * 16 && q.len >= 16, JSON.stringify({ w: q.w, len: q.len }));
    h.check('doctor quantum_translocator: dải bắt đầu ở chỗ đáp (CreateSkill2Field nhận toạ độ đích) [ĐO RoleSkill2]', Math.hypot(q.x0 - q.px, q.y0 - q.py) < 1 && Math.abs(q.dir - Math.atan2(q.py - a.py, q.px - a.px)) < 0.05, JSON.stringify({ x0: q.x0, px: q.px }));
    h.check('doctor quantum_translocator: kẻ địch bị dừng thời gian, đạn địch bị xoá', q.stopped > 0 && q.stun > 0 && !q.probe, JSON.stringify({ dừng: q.stopped, choáng: q.stun, đạn: q.probe }));
    h.check('doctor quantum_translocator: trong dải +30% chạy/đánh [ĐO skill2Buff*], bản gốc không có bất tử lần đầu vào (chỉ khi nâng cấp) [ĐO CreateSkill2Field]', Math.abs(q.move - 1.3) < 1e-6 && Math.abs(q.rate - 1.3) < 1e-6 && q.inv === 0, JSON.stringify({ move: q.move, rate: q.rate, inv: q.inv }));
    h.check('doctor quantum_translocator: chớp xong gây 10 sát thương quanh chỗ đáp [ĐO AreaDamageCarrier teleport_fx_end]', blinkHits.length >= 1 && blinkHits.every(d => d === 10 || d === 20), 'đòn ' + blinkHits.join(','));
    // Giữ phím kỹ năng > ngưỡng chạm rồi đẩy WASD: dải và chớp xoay theo hướng đó (wiki 'hold it to change direction manually').
    const dirs = await p.evaluate(() => {
      const G = SK.G, pl = G.player, W = SK.world, out = [];
      for (const [k, dx, dy] of [['KeyD', 1, 0], ['KeyA', -1, 0], ['KeyS', 0, 1], ['KeyW', 0, -1]]) {
        let ok = true;
        for (let d = 4; d <= 80; d += 4) if (W.boxHits(G.map, pl.x + dx * d - 4, pl.y + dy * d - 4, pl.x + dx * d + 4, pl.y + dy * d)) { ok = false; break; }
        if (ok) out.push([k, dx, dy]);
      }
      return out;
    });
    let hold = null;
    if (dirs.length) {
      const [key, dx, dy] = dirs[0];
      await p.evaluate(() => { const pl = SK.G.player; pl.skillCd = 0; });
      const b0 = await h.snap(p);
      await p.keyboard.down('KeyK'); await h.sleep(330);
      await p.keyboard.down(key); await h.sleep(200);
      const prev = await p.evaluate(() => { const o = SK.G.player._dcAim; return o && { hold: o.hold, ang: o.ang }; });
      await p.keyboard.up('KeyK'); await p.keyboard.up(key); await h.sleep(200);
      const f = await p.evaluate(() => { const G = SK.G; const fl = G._qFields[G._qFields.length - 1]; return { dir: fl.dir, x0: fl.x0, y0: fl.y0, n: G._qFields.length, px: G.player.x, py: G.player.y }; });
      hold = { key, dx, dy, prev, f, b0 };
    }
    const pulse = h.hitsOf(t, 'qpulse');
    h.check('doctor quantum_translocator: giữ phím rồi đẩy hướng thì chớp và dải xoay theo hướng đó, nhả phím mới chớp', hold && hold.prev && hold.prev.hold === true && Math.abs(hold.f.dir - Math.atan2(hold.dy, hold.dx)) < 0.05 && Math.abs(Math.hypot(hold.f.px - hold.b0.px, hold.f.py - hold.b0.py) - cf.skill2BlinkDistance * 16) < 8, JSON.stringify(hold && { hold: hold.prev, dir: hold.f.dir, key: hold.key }));
    h.check('doctor quantum_translocator: xung lặp lại ' + cf.skill2BaseDamageRatio * 100 + '% sát thương đã ghi (100 → 10) [ĐO skill2BaseDamageRatio], xung sau không có gì ghi thì còn 1 [ĐO Setup: min 1]', pulse.length > 0 && pulse[0] === 10 && pulse.every(d => d === 10 || d === 1), 'xung ' + pulse.join(','));
  }
});
