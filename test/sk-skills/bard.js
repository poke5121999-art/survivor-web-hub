// Ca kiểm Người Hát Rong (c35): melodic_pulse, resonant_symphony.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, pressK, seq, real, hitsOf } = h;
  const tank = p => p.evaluate(() => { SK.G.enemies.forEach(e => { e.hp = e.hpMax = 9999; }); });
  const M = p => p.evaluate(() => { const m = SK.G.player._bd && SK.G.player._bd.m; return m ? { t: m.t, next: m.next, lvl: m.lvl, canBeat: m.canBeat, ok: m.ok, count: m.count, total: m.total, endBeat: m.endBeat } : null; });
  // Chờ tới lúc đồng hồ pháp trận (giây kể từ khi bấm) đạt mốc (mốc bấm hiện tại + delta) rồi bấm.
  const pressAt = async (p, delta) => {
    await until(p, d => { const m = SK.G.player._bd.m; return m.canBeat && m.t >= m.next + d; }, delta, 9000);
    await pressK(p); await sleep(60);
  };
  return {
    async 'bard/0'(p, id) {
      const r = await real(p, 'bard', 'melodic_pulse');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.bard.ctrlFields);
      const [rate, atk, crit] = r.args.split(';').map(Number);
      await p.evaluate(() => { SK.profile.level = () => 0; });
      await standNear(p, 50); await tank(p);
      const a = await snap(p);
      const crit0 = await p.evaluate(() => SK.G.player.crit);
      await pressK(p); await sleep(200);
      const s0 = await snap(p);
      const m0 = await M(p);
      // Trúng nhịp 1: giữa cửa sổ trúng (mốc - 0,1 s).
      await pressAt(p, -0.15);
      const s1 = await snap(p);
      const m1 = await M(p);
      const early = await p.evaluate(() => SK.G.player._bd.m.canBeat);
      await pressK(p); await sleep(100);   // bấm lại ngay khi chưa tới mốc sau: bỏ qua
      const s1b = await snap(p);
      await seq(p, 'bard_0', 6, 50);
      // Nhịp 2 (mốc sau 3 s): cấp 1 -> bạo +20, sát thương +2.
      await pressAt(p, -0.15);
      const s2 = await snap(p);
      const crit2 = await p.evaluate(() => SK.G.player.crit);
      const fx = await p.evaluate(() => {
        const G = SK.G, pl = G.player, b = { side: 'p', dmg: 3, x: 0, y: 0 };
        G.bullets.push(b); pl.energy = pl.energyMax - 5;
        SK.emit('fire', G, pl, { def: { cost: 2 } });
        return { dmg: b.dmg, en: pl.energyMax - pl.energy };
      });
      // Nhịp 3: đã tới BeatMaxLevel 2 thì cấp giữ nguyên nhưng vẫn phát sóng.
      await pressAt(p, -0.15);
      const s3 = await snap(p);
      const m3 = await M(p);
      check('bard melodic_pulse: maxCount ' + r.max + ' không phải lượt (skillType 0: không có _ch) [ĐO get_hasMultiCount], pháp trận mở, cấp 0 đã có tốc đánh +' + rate + '% [ĐO AddRoleBuff case 0], chưa có sóng', a.ch === null && s0.ch === null && s0.skillT > 1 && near(s0.rate, 1 + rate / 100, 0.001) && hitsOf(s0, 'pulse').length === 0, 'rate ' + s0.rate + ' · skillT ' + s0.skillT.toFixed(1));
      check('bard melodic_pulse: mốc bấm đầu sau BGMOffset ' + cf.BGMOffset + ' + 4 nhịp 60/BPM ' + cf.BPM + ' = ' + (cf.BGMOffset + 4 * 60 / cf.BPM) + ' s [ĐO RhytemState]', near(m0.next, cf.BGMOffset + 4 * 60 / cf.BPM, 0.001), 'mốc ' + m0.next);
      check('bard melodic_pulse: trúng nhịp -> sóng 16 sát thương lên quái trong 6 ô [ĐO OnBeatSuccess + collider bard_sound_wave], cấp 1', hitsOf(s1, 'pulse').length >= 1 && hitsOf(s1, 'pulse').every(d => d === 16) && m1.lvl === 1, 'sóng ' + hitsOf(s1, 'pulse').join(',') + ' · cấp ' + m1.lvl);
      check('bard melodic_pulse: sau khi trúng, bấm nữa trước mốc kế bị bỏ qua (_canBeat = false)', early === false && hitsOf(s1b, 'pulse').length === hitsOf(s1, 'pulse').length && s1b.skillT > 1, 'canBeat ' + early);
      check('bard melodic_pulse: mốc kế cách ' + (cf._exBeatCount + 4) * 60 / cf.BPM + ' s, trúng -> cấp 2 bạo kích +' + crit + '% [ĐO args]', near(crit2 - crit0, crit, 0.001) && hitsOf(s2, 'pulse').length > hitsOf(s1, 'pulse').length, 'bạo kích ' + crit0 + ' -> ' + crit2);
      check('bard melodic_pulse: cấp 2 đạn +' + atk + ' sát thương [ĐO args]', fx.dmg === 3 + atk, JSON.stringify(fx));
      check('bard melodic_pulse: trúng nhịp 3 vẫn phát sóng nhưng cấp chặn ở BeatMaxLevel 2 [ĐO BeatSuccess]', hitsOf(s3, 'pulse').length > hitsOf(s2, 'pulse').length && m3.lvl === 2 && m3.total === 3 * (cf._exBeatCount + 4), 'cấp ' + m3.lvl + ' · tổng nhịp ' + m3.total);
      const en = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.energy = pl.energyMax - 5; SK.emit('fire', G, pl, { def: { cost: 2 } }); return pl.energyMax - pl.energy; });
      check('bard melodic_pulse: cấp chỉ số 2 hoàn 1 năng lượng mỗi phát (thiếu 5 -> 4)', en === 4, 'thiếu ' + en);
      // Hết nhịp cuối rồi còn 5 s: đẩy đồng hồ tới sát nhịp cuối.
      await p.evaluate(() => { const m = SK.G.player._bd.m; m.count = m.total - 1; m.t = m.start + m.total * 0.5 - 0.02; });
      await sleep(200);
      const endB = await M(p);
      const during = await snap(p);
      await p.evaluate(() => { const m = SK.G.player._bd.m; m.t = m.endT + 4.9; });
      await sleep(350);
      const done = await snap(p);
      check('bard melodic_pulse: đủ ' + 3 * (cf._exBeatCount + 4) + ' nhịp rồi còn 5 s mới tan [ĐO RhytemState], sau đó tan và vào hồi chiêu ' + r.cd + ' s', endB.endBeat === true && during.skillT > 1 && done.skillT === 0 && near(done.skillCd, r.cd, 0.6), 'endBeat ' + endB.endBeat + ' · giữa ' + during.skillT.toFixed(1) + ' · skillT ' + done.skillT + ' · cd ' + done.skillCd.toFixed(2));
      // Trượt nhịp: bấm sớm quá vùng trúng nhưng còn trong vùng trượt (mốc - 0,45 s) thì tan ngay.
      await p.evaluate(() => { SK.G.player.skillCd = 0; });
      await pressK(p); await sleep(150);
      await pressAt(p, -0.5);
      const f = await snap(p);
      check('bard melodic_pulse: bấm sớm 0,47 s trước mốc (|d| trong [0,275; 0,425)) = trượt nhịp, pháp trận tan ngay [ĐO RoleSkill0]', f.skillT === 0 && near(f.skillCd, r.cd, 0.6), 'skillT ' + f.skillT + ' · cd ' + f.skillCd.toFixed(2));
      // Không bấm: quá mốc badOffset 0,4 s thì tan.
      await p.evaluate(() => { SK.G.player.skillCd = 0; });
      await pressK(p); await sleep(150);
      await until(p, () => SK.G.player.skillT === 0, null, 4500);
      const g = await snap(p);
      check('bard melodic_pulse: không bấm tới mốc + ' + 0.4 + ' s thì trượt, tan ngay, không có sóng [ĐO RhytemState]', g.skillT === 0 && near(g.skillCd, r.cd, 0.6), 'skillT ' + g.skillT + ' · cd ' + g.skillCd.toFixed(2));
    },
    async 'bard/1'(p, id) {
      const r = await real(p, 'bard', 'resonant_symphony');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.bard.ctrlFields);
      await standNear(p, 50); await tank(p);
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl.energy = 50; pl.armor = pl.armorMax; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 20, y: pl.y - 6, h: 8, vx: 0, vy: 0, ang: 0, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 }); });
      const a = await snap(p);
      const armor0 = await p.evaluate(() => SK.G.player.armorMax);
      await pressK(p); await sleep(300);
      const s = await snap(p);
      const info = await p.evaluate(() => { const pl = SK.G.player, sy = pl._bd.sym, b = SK.G.bullets.find(x => x._probe); return { links: sy.links.length, alive: SK.G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').length, bullet: !b || b.dead, armor: pl.armor, max: pl.armorMax, cx: sy.x - pl.x, cy: sy.y - pl.y, face: pl.face }; });
      await p.evaluate(() => { window._skHits = []; const G = SK.G, sy = G.player._bd.sym; G._hitBullet = { side: 'p' }; SK.hurtEnemy(G, sy.links[0], 20, false, 0, 0); G._hitBullet = null; });
      const s2 = await snap(p);
      // Đòn không phải đạn (kỹ năng khác) không chia [ĐO PlayerBulletHitEnemyEvent].
      await p.evaluate(() => { window._skHits = []; const G = SK.G, sy = G.player._bd.sym; SK.hurtEnemy(G, sy.links[0], 20, false, 0, 0); });
      const s2n = await snap(p);
      // Đang nối đúng 2 quái thì chia 100% [ĐO OnEnemyGetHurt: Count == 2 -> linkSingleExtraDamagePercent].
      const two = await p.evaluate(() => { const G = SK.G, sy = G.player._bd.sym; sy.n = 2; sy.links.length = Math.min(2, sy.links.length); window._skHits = []; if (sy.links.length === 2) { G._hitBullet = { side: 'p' }; SK.hurtEnemy(G, sy.links[0], 20, false, 0, 0); G._hitBullet = null; } return sy.links.length; });
      const s2b = await snap(p);
      // Quái nối chết thì được bù người khác trong tầm (kiểm 0,05 s một lần).
      await p.evaluate(() => { const sy = SK.G.player._bd.sym; sy.n = 3; });
      const before = await p.evaluate(() => { const sy = SK.G.player._bd.sym; return sy.links.length; });
      await p.evaluate(() => { const sy = SK.G.player._bd.sym; if (sy.links[0]) { sy.links[0].hp = 0; sy.links[0].st = 'dead'; } });
      await sleep(200);
      const after = await p.evaluate(() => { const sy = SK.G.player._bd.sym; return { n: sy.links.length, dead: sy.links.filter(e => e.st === 'dead').length, alive: SK.G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').length }; });
      await sleep(600);
      await seq(p, 'bard_1', 6, 60);
      const s3 = await snap(p);
      const n = Math.min(+r.args, info.alive);
      const nOthers = info.links - 1;
      const pct = (info.links === 2 ? cf.linkSingleExtraDamagePercent : cf.linkDamagePercent);
      check('bard resonant_symphony: maxCount ' + r.max + ' không phải lượt (skillType 1) [ĐO get_hasMultiCount], kéo ' + r.dur + ' s [ĐO], nối ' + n + ' quái [ĐO args ' + r.args + ']', a.ch === null && info.links === n && s.skillT > r.dur - 1, 'nối ' + info.links + ' · skillT ' + s.skillT.toFixed(2));
      check('bard resonant_symphony: nhạc cụ dựng ở người + 1 ô hướng nhìn, lên 1 ô [ĐO CreateLinkCircle]', near(info.cx, info.face * 16, 0.6) && near(info.cy, -16, 0.6), 'lệch ' + info.cx.toFixed(1) + ',' + info.cy.toFixed(1));
      check('bard resonant_symphony: sóng âm xoá đạn địch trong vùng', info.bullet, JSON.stringify(info));
      const shared = Math.max(1, Math.trunc(20 * pct / 100));
      check('bard resonant_symphony: đạn trúng quái nối chia ' + pct + '% cho ' + nOthers + ' quái nối khác (' + info.links + ' quái) [ĐO OnEnemyGetHurt]', info.links < 2 || (hitsOf(s2, 'link').length === nOthers && hitsOf(s2, 'link').every(d => d === shared)), 'chia ' + hitsOf(s2, 'link').join(','));
      check('bard resonant_symphony: đòn không phải đạn không chia', hitsOf(s2n, 'link').length === 0, 'chia ' + hitsOf(s2n, 'link').join(','));
      check('bard resonant_symphony: nối đúng 2 quái thì chia ' + cf.linkSingleExtraDamagePercent + '% [ĐO linkSingleExtraDamagePercent]', two < 2 || (hitsOf(s2b, 'link').length === 1 && hitsOf(s2b, 'link')[0] === 20), 'nối ' + two + ' · chia ' + hitsOf(s2b, 'link').join(','));
      check('bard resonant_symphony: quái nối chết -> bù quái khác trong linkRange ' + cf.linkRange + ' ô nếu còn [ĐO Update 0,05 s]', after.dead === 0 && after.n >= Math.min(before, after.alive), 'trước ' + before + ' · sau ' + after.n + ' · còn sống ' + after.alive);
      check('bard resonant_symphony: buff giáp tối đa +' + cf.linkBuffExArmor + ' tạm thời, chạy x' + (1 + cf.linkBuffMoveSpeed / 100) + ', tốc đánh x' + (1 + cf.linkBuffAttackSpeed / 100) + ', năng lượng +1 mỗi ' + cf.linkBuffEnergyInterval + ' s [ĐO BuffBardSkill1]', info.max === armor0 + cf.linkBuffExArmor && info.armor === info.max && near(s.move, 1 + cf.linkBuffMoveSpeed / 100, 0.001) && near(s.rate, 1 + cf.linkBuffAttackSpeed / 100, 0.001) && s3.en >= 50 + 3, 'giáp ' + info.armor + '/' + info.max + ' · move ' + s.move + ' · rate ' + s.rate + ' · năng lượng ' + s3.en);
      await p.evaluate(() => { SK.G.player.skillT = 0.05; });
      await sleep(300);
      const armor1 = await p.evaluate(() => ({ max: SK.G.player.armorMax, a: SK.G.player.armor }));
      check('bard resonant_symphony: hết buff thì giáp tối đa trở lại ' + armor0, armor1.max === armor0 && armor1.a <= armor0, JSON.stringify(armor1));
    }
  };
};
