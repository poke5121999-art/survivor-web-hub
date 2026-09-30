// Kiểm thử Thương Khách (c29): 3 kỹ năng, số đọc từ ctrlFields của C30Controller (data/sk-skills86.js).
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }));
  const poke = p => p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
  const has = (arr, v) => arr.some(d => d === v || d === v * 2);   // trừ chí mạng
  const C = (p, f) => p.evaluate(f => SK_SKILLS86.heroes.lancer.ctrlFields[f], f);
  const ready = p => until(p, () => SK.G.player.skillT <= 0 && SK.G.player.skillCd <= 0, null, 6000);
  const refill = p => p.evaluate(() => { const pl = SK.G.player; pl._ch.n = pl._ch.max; pl._ch.t = 0; pl.skillCd = 0; pl._ln.combo = null; });
  return {
    async 'lancer/0'(p, id) {
      const r = await real(p, 'lancer', 'dragon_lance');
      const jd = await C(p, 'JumpDmgValue'), rd = await C(p, 'RotateDmgValue'), wd = await C(p, 'WindDmgValue'), sd = await C(p, 'SlashDmgValue'), td = await C(p, 'ThrowSpearDmgValue');
      await tough(p); await standNear(p, 90);
      const a = await snap(p);
      await pressK(p); await sleep(100);
      const blocked = (await poke(p)) === false;
      await seq(p, 'lancer_0', 6, 70);
      await ready(p);
      const s1 = await snap(p);
      check('lancer dragon_lance 1 Thiên Long Trụy: ' + r.max + ' lượt [ĐO], nhảy tới quái, hạ xuống ' + jd + ' [ĐO JumpDmgValue]', a.ch.max === r.max && s1.ch.n === r.max - 1 && has(hitsOf(s1, 'skill'), jd) && Math.hypot(s1.px - a.px, s1.py - a.py) > 40, 'đòn ' + hitsOf(s1, 'skill').join(',') + ' · dời ' + Math.round(Math.hypot(s1.px - a.px, s1.py - a.py)) + ' px');
      check('lancer dragon_lance 1: bất tử lúc bay trên không', blocked);
      await standNear(p, 30); await resetDmg(p);
      await pressK(p); await sleep(300);
      const s2 = await snap(p);
      await seq(p, 'lancer_0b', 6, 120);
      await ready(p);
      const s2b = await snap(p);
      check('lancer dragon_lance 2 Loạn Vô Song: chạy nhanh x1.2 [ĐO RotateAddSpeed], thương xoay ' + rd + ' + gió ' + wd + ' [ĐO], ' + r.dur + ' s', near(s2.move, 1.2, 0.01) && has(hitsOf(s2b, 'skill'), rd) && has(hitsOf(s2b, 'skill'), wd) && s2.skillT > 0.5, 'move ' + s2.move + ' · đòn ' + hitsOf(s2b, 'skill').join(',') + ' · skillT ' + s2.skillT.toFixed(2));
      await standNear(p, 60); await resetDmg(p);
      await pressK(p); await sleep(200);
      await seq(p, 'lancer_0c', 6, 60);
      await sleep(400);
      const s3 = await snap(p);
      check('lancer dragon_lance 3 Phi Thương Quyết: sóng chém ' + sd + ' + 2 thương ' + td + ' [ĐO], hết lượt', has(hitsOf(s3, 'skill'), sd) && has(hitsOf(s3, 'skill'), td) && s3.ch.n === 0, 'đòn ' + hitsOf(s3, 'skill').join(',') + ' · ' + JSON.stringify(s3.ch));
    },
    async 'lancer/1'(p, id) {
      const r = await real(p, 'lancer', 'thunder_presence');
      const crash = await C(p, 'Skill1SpearCrashDamage'), chg = await C(p, 'Skill1ThunderChargeLightningDamage'), st = await C(p, 'Skill1ThunderStateLightningDamage'), full = await C(p, 'Skill1ThunderChargeMax'), stT = await C(p, 'Skill1ThunderStateTime');
      await tough(p); await standNear(p, 70);
      await pressK(p); await sleep(150);
      await seq(p, 'lancer_1', 6, 60);
      await sleep(300);
      const s1 = await snap(p);
      const landed = await p.evaluate(() => SK.G.player._ln.spears.filter(s => s.landed).length);
      check('lancer thunder_presence: ' + r.max + ' lượt [ĐO], ném thương đâm ' + crash + ' [ĐO Skill1SpearCrashDamage]', s1.ch.n === r.max - 1 && landed === 1 && has(hitsOf(s1, 'skill'), crash), 'đòn ' + hitsOf(s1, 'skill').join(',') + ' · ' + JSON.stringify(s1.ch));
      // Nhặt thương: +1 Đấu Chí, đòn vũ khí kế tiếp mang sét.
      await p.evaluate(() => { const pl = SK.G.player, sp = pl._ln.spears[0]; pl.x = sp.x; pl.y = sp.y + 7; });
      await sleep(250);
      const c1 = await p.evaluate(() => ({ c: SK.G.player._ln.charge, a: SK.G.player._ln.armed, n: SK.G.player._ln.spears.length }));
      await standNear(p, 60); await resetDmg(p);
      await p.keyboard.down('KeyJ'); await sleep(500); await p.keyboard.up('KeyJ');
      const s2 = await snap(p);
      check('lancer thunder_presence: nhặt thương +1 Đấu Chí (tối đa ' + full + '), đòn vũ khí kế tiếp thêm sét ' + chg + ' [ĐO]', c1.c === 1 && c1.n === 0 && has(hitsOf(s2, 'skill'), chg), 'Đấu Chí ' + c1.c + ' · đòn ' + hitsOf(s2, 'skill').join(','));
      // Đủ Đấu Chí: Lôi Động.
      await p.evaluate(f => { const pl = SK.G.player; pl._ln.charge = f; pl._ch.n = pl._ch.max; pl.skillCd = 0; pl._ln.armed = false; }, full);
      await pressK(p); await sleep(200);
      const s3 = await snap(p);
      const state = await p.evaluate(() => SK.G.player._ln.state);
      await standNear(p, 60); await resetDmg(p);
      await p.keyboard.down('KeyJ'); await sleep(150);
      await seq(p, 'lancer_1b', 6, 60);
      await sleep(200); await p.keyboard.up('KeyJ');
      const s4 = await snap(p);
      check('lancer thunder_presence: đủ ' + full + ' Đấu Chí → Lôi Động ' + stT + ' s [ĐO], chạy x1.3 [ĐO Skill1MoveSpeedUp]', near(state, stT, 0.5) && near(s3.move, 1.3, 0.01) && s3.ch.n === r.max, 'state ' + state.toFixed(2) + ' · move ' + s3.move);
      check('lancer thunder_presence: trong Lôi Động mỗi đòn kèm sét liên tỏa ' + st + ' [ĐO]', has(hitsOf(s4, 'skill'), st), 'đòn ' + hitsOf(s4, 'skill').join(','));
    },
    async 'lancer/2'(p, id) {
      const r = await real(p, 'lancer', 'lance_doctrine');
      const F = f => C(p, f);
      const stab = await F('stabDamage'), sweep = await F('sweepDamage'), u1 = await F('ultra1Damage'), u2 = await F('ultra2Damage'), u3 = await F('ultra3Damage'), dd = await F('deltaDamage'), cnt = await F('ultra4LanceCount');
      const e1 = await F('ultra1ExtraCd');
      await tough(p); await standNear(p, 50);
      const a = await snap(p), t0 = Date.now();
      // Sắc Lạnh rồi Sắc Lạnh → Lôi Đình Phá Ảnh.
      await pressK(p); await sleep(80);
      const blocked = (await poke(p)) === false;
      await ready(p);
      const s1 = await snap(p);
      check('lancer lance_doctrine: Sắc Lạnh lao ngắn + đâm ' + stab + ' [ĐO stabDamage], bất tử lúc lao, ' + r.max + ' lượt [ĐO]', has(hitsOf(s1, 'skill'), stab) && blocked && a.ch.max === r.max && s1.ch.n === r.max - 1 && Math.hypot(s1.px - a.px, s1.py - a.py) > 20, 'đòn ' + hitsOf(s1, 'skill').join(',') + ' · dời ' + Math.round(Math.hypot(s1.px - a.px, s1.py - a.py)));
      await standNear(p, 50); await resetDmg(p);
      await pressK(p); await sleep(150);
      await seq(p, 'lancer_2', 6, 70);
      await until(p, () => SK.G.player.skillT <= 0, null, 3000);
      const s2 = await snap(p);
      check('lancer lance_doctrine: Sắc+Sắc → Lôi Đình Phá Ảnh ' + u1 + ' + cảm điện/choáng [ĐO ultra1Damage], hồi chậm thêm ' + e1 + ' s', has(hitsOf(s2, 'skill'), u1) && s2.db.indexOf('ele') >= 0 && s2.stun > 0 && s2.ch.n === 0 && near(s2.skillCd, r.cd + e1 - (Date.now() - t0) / 1000, 0.6), 'đòn ' + hitsOf(s2, 'skill').join(',') + ' · ' + s2.db.join(',') + ' · choáng ' + s2.stun + ' · skillCd ' + s2.skillCd.toFixed(2));
      // Vẫy Đuôi rồi Vẫy Đuôi → Phi Thương Hồi Chuyển.
      await refill(p); await standNear(p, 50); await resetDmg(p);
      await p.keyboard.down('KeyJ'); await pressK(p); await sleep(500);
      const sw1 = hitsOf(await snap(p), 'skill');
      await ready(p); await refill(p); await p.evaluate(() => { SK.G.player._ln.combo = { k: 'W', t: 2 }; });
      await pressK(p); await sleep(150);
      await seq(p, 'lancer_2b', 6, 80);
      await sleep(800); await p.keyboard.up('KeyJ');
      const s3 = await snap(p);
      check('lancer lance_doctrine: Vẫy Đuôi quét ' + sweep + ' [ĐO sweepDamage]; Vẫy+Vẫy → Phi Thương Hồi Chuyển ' + u2 + ' [ĐO ultra2Damage] + cảm điện', has(sw1, sweep) && has(hitsOf(s3, 'skill'), u2) && s3.dbEver.indexOf('ele') >= 0, 'quét ' + sw1.join(',') + ' · thương ' + hitsOf(s3, 'skill').join(','));
      // Sắc rồi Vẫy → Theo Gió Mà Đi.
      await ready(p); await refill(p); await standNear(p, 50); await resetDmg(p);
      await p.evaluate(() => { SK.G.player._ln.combo = { k: 'S', t: 2 }; });
      await p.keyboard.down('KeyJ'); await pressK(p); await sleep(150);
      await p.keyboard.up('KeyJ');
      await sleep(1600);
      await seq(p, 'lancer_2c', 6, 100);
      const s4 = await snap(p);
      const spirits = await p.evaluate(() => SK.G.player._ln.spirits.filter(q => !q.gone).length);
      check('lancer lance_doctrine: Sắc+Vẫy → Theo Gió Mà Đi: thương linh bắn loạt ' + cnt + ' mũi [ĐO ultra4LanceCount] sát thương 5', spirits === 1 && has(hitsOf(s4, 'skill'), 5), 'thương linh ' + spirits + ' · đòn ' + hitsOf(s4, 'skill').join(','));
      // Vẫy rồi Sắc → Trận Thương Mưa Rào.
      await ready(p); await refill(p); await standNear(p, 50); await resetDmg(p);
      await p.evaluate(() => { SK.G.player._ln.combo = { k: 'W', t: 2 }; });
      await pressK(p); await sleep(200);
      await p.evaluate(() => {
        const G = SK.G, pl = G.player, a = pl._ld.ang;
        G.bullets.push({ side: 'p', kind: 'pb', x: pl.x + Math.cos(a) * 30, y: pl.y - 7 + Math.sin(a) * 30, vx: 0, vy: 0, h: 7, dmg: 5, r: 2, life: 1, ang: a, pierce: 0 });
      });
      await sleep(120);
      const bd = await p.evaluate(() => { const b = SK.G.bullets.find(q => q._ld3); return b ? b.dmg : null; });
      await seq(p, 'lancer_2d', 6, 100);
      await until(p, () => SK.G.player.skillT <= 0, null, 3000);
      const s5 = await snap(p);
      check('lancer lance_doctrine: Vẫy+Sắc → Trận Thương Mưa Rào đâm ' + u3 + ' [ĐO ultra3Damage], đạn ta xuyên trận +' + dd + ' [ĐO deltaDamage]', has(hitsOf(s5, 'skill'), u3) && bd === 5 + dd, 'đòn ' + hitsOf(s5, 'skill').join(',') + ' · đạn 5 → ' + bd);
    }
  };
};
