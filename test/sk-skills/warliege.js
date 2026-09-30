// Ca kiểm Lãnh chúa (c30): Bão Chiến Ý, Quyết Tâm Xung Phong, Lãnh Chúa Hắc Ám. Số [ĐO] từ ctrlFields C31Controller + mã IL2CPP (sk_method.py); mỗi số dưới đây là giá trị đo, không lấy từ file kỹ năng.
module.exports = h => {
  // quái trâu để không chết giữa chừng làm mất đòn đo
  const tank = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp = 9999; }));
  // đạn thử: side 'e' (địch) hoặc 'p' (nhà) đặt cách người chơi dx px
  const probe = (p, side, dx, tag) => p.evaluate(([side, dx, tag]) => {
    const G = SK.G, pl = G.player, W = SK.world;
    // hướng còn trống trong 60 px (đạn chạm tường là mất)
    let th = 0;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if ([10, 25, 40, 52, 60].every(d => !W.solidAt(G.map, pl.x + Math.cos(a) * d, pl.y - 7 + Math.sin(a) * d + 8))) { th = a; break; } }
    G.bullets.push({ side, kind: 'orb', x: pl.x + Math.cos(th) * dx, y: pl.y - 7 + Math.sin(th) * dx, h: 8, vx: 1.5, vy: 0, ang: 0, dmg: side === 'e' ? 2 : 25, repel: 0, r: 3, life: 9, [tag]: 1, hits: [], pierce: 0 });
  }, [side, dx, tag]);
  const emitHit = (p, dmg) => p.evaluate(d => SK.emit('enemyHit', SK.G, SK.G.enemies.find(e => e.st !== 'dead'), d || 1, false), dmg);
  return ({
  async 'warliege/0'(p, id) {
    const r = await h.real(p, 'warliege', 'battle_storm');
    await h.standNear(p, 30); await tank(p);
    // Chiến Ý [ĐO C31Controller.AddFightSprite]: +1 mỗi đòn trúng, cách nhau 0,25 s; trúng đòn cộng đúng sát thương nhận, gấp đôi khi hết giáp
    await p.evaluate(() => { const pl = SK.G.player; pl._fs = null; });
    await emitHit(p); await emitHit(p);
    const a1 = await p.evaluate(() => SK.G.player._fs.n);
    await p.evaluate(() => { SK.G.player._fs.gap = 0; });
    await emitHit(p);
    const a2 = await p.evaluate(() => SK.G.player._fs.n);
    await p.evaluate(() => { const G = SK.G; G.player.armor = 2; SK.emit('playerHurt', G, G.player, 3); });
    const a3 = await p.evaluate(() => SK.G.player._fs.n);
    await p.evaluate(() => { const G = SK.G; G.player.armor = 0; SK.emit('playerHurt', G, G.player, 3); });
    const a4 = await p.evaluate(() => SK.G.player._fs.n);
    h.check('warliege Chiến Ý: +1 mỗi đòn, chặn nhịp 0,25 s; trúng đòn +3 (còn giáp) / +6 (hết giáp) [ĐO GainFightingSprite*]', a1 === 1 && a2 === 2 && a3 === 5 && a4 === 11, [a1, a2, a3, a4].join(','));
    // Sục Sôi: đủ 20 thì máu tối đa +1, chạy ×1,5, tốc đánh ×1,33; hết năng lượng thì gỡ hết
    const b0 = await h.snap(p);
    await p.evaluate(() => { const G = SK.G, s = G.player._fs; s.n = 19; s.gap = 0; });
    await emitHit(p);
    const b1 = await h.snap(p);
    const sg = await p.evaluate(() => ({ surge: SK.G.player._fs.surge, en: SK.G.player._fs.en }));
    h.check('warliege Sục Sôi: máu tối đa +1, chạy ×1,5, tốc đánh ×1,33 [ĐO StartSpriteSurging]', sg.surge && b1.phpMax === b0.phpMax + 1 && h.near(b1.move / b0.move, 1.5, 0.01) && h.near(b1.rate / b0.rate, 1.33, 0.01), JSON.stringify([b0.phpMax, b1.phpMax, b1.move, b1.rate]));
    await p.evaluate(() => { const s = SK.G.player._fs; s.en = 12; });
    await h.sleep(1100);
    const b2 = await p.evaluate(() => ({ en: SK.G.player._fs.en, surge: SK.G.player._fs.surge }));
    h.check('warliege Sục Sôi: Chiến Ý tụt ' + 20 / 5 + '/s (20 trong spriteSurgingLastTime 5 s) [ĐO SpriteEnergyCosting]', b2.surge && h.near(b2.en, 12 - 4 * 1.1, 0.8), JSON.stringify(b2));
    await p.evaluate(() => { SK.G.player._fs.en = 0.1; });
    await h.sleep(400);
    const b3 = await h.snap(p);
    h.check('warliege Sục Sôi: hết năng lượng thì gỡ (máu tối đa, tốc chạy, tốc đánh)', b3.phpMax === b0.phpMax && h.near(b3.move, b0.move, 0.01) && h.near(b3.rate, b0.rate, 0.01), JSON.stringify([b3.phpMax, b3.move, b3.rate]));
    await p.evaluate(() => { SK.G.player._fs = null; SK.G.player.skillCd = 0; });
    await h.resetDmg(p);
    // Bão: bán kính bắt đạn 2,75 đơn vị = 44 px, vào trong bị giữ lại
    await tank(p);
    await h.pressK(p); await h.sleep(500);
    await probe(p, 'e', 40, '_pIn'); await probe(p, 'e', 52, '_pOut');
    await h.sleep(300);
    const s = await h.snap(p);
    const st = await p.evaluate(() => { const G = SK.G, pl = G.player, s = pl._storm; const g = k => G.bullets.find(b => b[k]); const i = g('_pIn'), o = g('_pOut'); return { held: s ? s.held.length : -1, inHeld: !!(i && i._wl), outHeld: !!(o && o._wl), d: i ? Math.hypot(i.x - pl.x, i.y - 7 - pl.y) : -1 }; });
    h.check('warliege battle_storm: ' + r.dur + ' s, hồi ' + r.cd + ' s [ĐO config]', h.near(s.skillT, r.dur - 0.8 - 0.3, 0.5) && s.cd === r.cd, 'skillT ' + s.skillT.toFixed(2));
    h.check('warliege battle_storm: mỗi nhịp 6 sát thương [ĐO skill0Damage]', h.hitsOf(s).length >= 2 && h.hitsOf(s).every(d => d === 6 || d === 12), 'đòn ' + h.hitsOf(s).join(','));
    h.check('warliege battle_storm: bắt đạn trong 2,75 đơn vị (44 px), đạn ở 52 px thì không [ĐO Skill0StormCatchBulletSize]', st.inHeld && !st.outHeld && st.d < 44, JSON.stringify(st));
    await h.seq(p, 'warliege_0');
    // đạn nhà chỉ giữ tối đa maxSelfBullet 20
    for (let i = 0; i < 22; i++) await probe(p, 'p', 10 + (i % 5), '_pSelf');
    await h.sleep(250);
    const own = await p.evaluate(() => ({ q: SK.G.player._storm.selfQ.length, w: SK.G.bullets.filter(b => b._pSelf && b._wl).length }));
    h.check('warliege battle_storm: đạn nhà giữ tối đa 20 [ĐO prefab warliege_roll maxSelfBullet]', own.q === 20 && own.w === 20, JSON.stringify(own));
    // Sục Sôi: bán kính 3,5 đơn vị = 56 px, mỗi nhịp 7
    await p.evaluate(() => { const s = SK.G.player._fs = { n: 20, gap: 99, surge: true, dark: false, en: 20, t: 0, dying: false, dmg: 0, used: false, h: null, hname: null }; SK.G.bullets.forEach(b => { b._wl = null; b.dead = b._pSelf || b._pIn || b._pOut || b.dead; }); });
    await probe(p, 'e', 52, '_pSur');
    await tank(p); await h.resetDmg(p); await h.sleep(700);
    const s2 = await h.snap(p);
    const sur = await p.evaluate(() => { const b = SK.G.bullets.find(b => b._pSur); return !!(b && b._wl); });
    h.check('warliege battle_storm: Sục Sôi bắt đạn trong 3,5 đơn vị (56 px) [ĐO Skill0StormCatchBulletSize]', sur, String(sur));
    h.check('warliege battle_storm: Sục Sôi ' + 7 + ' sát thương [ĐO skill0SurgingDamage]', h.hitsOf(s2).length >= 1 && h.hitsOf(s2).every(d => d === 7 || d === 14), 'đòn ' + h.hitsOf(s2).join(','));
  },
  async 'warliege/1'(p, id) {
    const r = await h.real(p, 'warliege', 'resolute_rush');
    await h.standNear(p, 60); await tank(p);
    await p.evaluate(() => { const pl = SK.G.player; pl._fs = null; pl.armor = 0; pl.invulT = 0; pl.hp = pl.hpMax; });
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(120);
    const early = await p.evaluate(() => { const pl = SK.G.player; const inv = pl.invulT; pl.invulT = 0; pl.armor = 0; const hp = pl.hp; SK.hurtPlayer(SK.G, 4); return { inv, drop: hp - pl.hp, fs: pl._fs ? pl._fs.n : 0 }; });
    await h.seq(p, 'warliege_1', 6, 60);
    await h.sleep(400);
    const s = await h.snap(p);
    const late = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; pl.armor = 0; pl.hp = pl.hpMax; const hp = pl.hp; SK.hurtPlayer(SK.G, 4); return { giant: !!pl._giant, drop: hp - pl.hp }; });
    h.check('warliege resolute_rush: ' + r.max + ' lượt [ĐO], bấm một lần còn ' + (r.max - 1) + ', +1 Chiến Ý', a.ch && a.ch.max === r.max && s.ch.n === r.max - 1 && early.fs >= 1, JSON.stringify([s.ch, early.fs]));
    h.check('warliege resolute_rush: lao 0,4 s, đòn lao 6 hoặc búa 8 [ĐO dashDamage, hammerDamage]', Math.hypot(s.px - a.px, s.py - a.py) > 30 && h.hitsOf(s).some(d => d === 6 || d === 8 || d === 12 || d === 16), 'dời ' + Math.round(Math.hypot(s.px - a.px, s.py - a.py)) + ' px · đòn ' + h.hitsOf(s).join(','));
    h.check('warliege resolute_rush: phòng ngự +3 trong dashTime 0,4 s (đòn 4 còn 1), hết thì đòn 4 vẫn 4 [ĐO ChangeDefenceTemp(3, dashTime)]', early.drop === 1 && late.drop === 4, JSON.stringify([early, late]));
    h.check('warliege resolute_rush: Người Khổng Lồ xuất hiện', late.giant, JSON.stringify(late));
  },
  async 'warliege/2'(p, id) {
    const r = await h.real(p, 'warliege', 'dark_sovereign');
    await h.standNear(p, 40); await tank(p);
    await p.evaluate(() => { const pl = SK.G.player; pl._fs = null; pl._dsUse = 0; pl._dsDash = 0; });
    const a = await h.snap(p);
    await h.pressK(p); await h.sleep(300);
    const s1 = await h.snap(p);
    await h.seq(p, 'warliege_2', 6, 60);
    h.check('warliege dark_sovereign: ' + r.max + ' lượt, lần 1 chém 1 nhát 8 + 1×1 = 9 [ĐO skill2SlashDamage + skill2ExtraDamage × useCount]', a.ch.max === r.max && s1.ch.n === r.max - 1 && h.hitsOf(s1).length >= 1 && h.hitsOf(s1).every(d => d === 9 || d === 18), 'đòn ' + h.hitsOf(s1).join(',') + ' · ' + JSON.stringify(s1.ch));
    await h.until(p, () => SK.G.player.skillT <= 0 && SK.G.player.skillCd <= 0.02, null, 3000);
    await h.resetDmg(p); await h.pressK(p); await h.sleep(800);
    const s2 = await h.snap(p);
    h.check('warliege dark_sovereign: lần 2 chém 2 nhát 8 + 2 = 10', h.hitsOf(s2).filter(d => d === 10 || d === 20).length >= 2 && h.hitsOf(s2).every(d => d === 10 || d === 20), 'đòn ' + h.hitsOf(s2).join(','));
    await h.until(p, () => SK.G.player.skillT <= 0 && SK.G.player.skillCd <= 0.02, null, 3000);
    await tank(p); await h.resetDmg(p); await h.pressK(p); await h.sleep(900);
    const s3 = await h.snap(p);
    h.check('warliege dark_sovereign: lần 3 hai nhát 8 + 3 = 11 rồi vòng xoay 12 + 3 = 15 [ĐO skill2CircleDamage]', h.hitsOf(s3).some(d => d === 15 || d === 30) && h.hitsOf(s3).some(d => d === 11 || d === 22), 'đòn ' + h.hitsOf(s3).join(','));
    // bấm K khi đang chém thì xếp hàng lần kế
    await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
    await p.evaluate(() => { const pl = SK.G.player; pl._dsUse = 0; pl._ch.n = 3; pl.skillCd = 0; });
    await tank(p); await h.resetDmg(p);
    await h.pressK(p); await h.sleep(150);
    await h.pressK(p); await h.sleep(60);
    const q1 = await p.evaluate(() => ({ q: SK.G.player._dsQ, n: SK.G.player._ch.n }));
    await h.until(p, () => SK.G.player._dsUse === 2 && SK.G.player._dsQ === 0 && SK.G.player.skillT > 0, null, 5000);
    const q2 = await p.evaluate(() => ({ q: SK.G.player._dsQ, n: SK.G.player._ch.n, use: SK.G.player._dsUse }));
    await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
    const sq = await h.snap(p);
    h.check('warliege dark_sovereign: bấm K khi đang chém xếp hàng, xong thì chém tiếp không cần bấm (dùng 2 lượt, lần hai chém 10) [ĐO RoleSkill2/EndSkill2]', q1.q === 1 && q2.q === 0 && q2.n === 1 && h.hitsOf(sq).some(d => d === 10 || d === 20), JSON.stringify([q1, q2]) + ' · đòn ' + h.hitsOf(sq).join(','));
    // Sục Sôi: lao tới đánh 6 + 1×lần lao, lần ba nhảy đáp đất bằng vòng 12
    await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
    await p.evaluate(() => { const pl = SK.G.player; pl._fs = null; pl._dsUse = 0; pl._dsDash = 0; pl._ch.n = 3; pl.skillCd = 0; const s = pl._fs = { n: 20, gap: 99, surge: true, dark: true, en: 20, t: 0, dying: false, dmg: 0, used: false, h: null, hname: null }; });
    await h.standNear(p, 70); await tank(p);
    await h.resetDmg(p);
    const b = await h.snap(p);
    await h.pressK(p); await h.sleep(500);
    const s4 = await h.snap(p);
    h.check('warliege dark_sovereign: Sục Sôi lao lần 1 đánh 6 + 1 = 7 [ĐO skill2DashDamage + skill2ExtraDamage × dashCount]', Math.hypot(s4.px - b.px, s4.py - b.py) > 20 && h.hitsOf(s4).some(d => d === 7 || d === 14), 'dời ' + Math.round(Math.hypot(s4.px - b.px, s4.py - b.py)) + ' px · đòn ' + h.hitsOf(s4).join(','));
    await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
    await p.evaluate(() => { const pl = SK.G.player; pl.skillCd = 0; pl._ch.n = 3; });
    await tank(p); await h.standNear(p, 70); await h.resetDmg(p);
    await h.pressK(p); await h.sleep(500);
    const s5 = await h.snap(p);
    h.check('warliege dark_sovereign: Sục Sôi lao lần 2 đánh 6 + 2 = 8', h.hitsOf(s5).some(d => d === 8 || d === 16), 'đòn ' + h.hitsOf(s5).join(','));
    await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
    await p.evaluate(() => { const pl = SK.G.player; pl.skillCd = 0; pl._ch.n = 3; });
    await tank(p); await h.standNear(p, 50); await h.resetDmg(p);
    await h.pressK(p); await h.sleep(900);
    const s6 = await h.snap(p);
    h.check('warliege dark_sovereign: Sục Sôi lần 3 nhảy, đáp đất vòng 12 + nhát 4 [ĐO skill2CircleDamage, skill2JumpSlashDamage]', h.hitsOf(s6).some(d => d === 12 || d === 24) && h.hitsOf(s6).some(d => d === 4 || d === 8), 'đòn ' + h.hitsOf(s6).join(','));
    // mỗi đòn đánh thường chạy chuỗi Trảm Kích bay: dashCount vừa đặt useCount 3 nên chuỗi kế là lần ≥ 3: nhát bay 3 + 3 = 6, vòng 12 + 3 = 15
    await h.until(p, () => SK.G.player.skillT <= 0, null, 3000);
    await tank(p); await h.standNear(p, 20); await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, pl = G.player; pl._dsAtk = 0; pl._dsFly = null; pl._dsUse = 3; pl._fs.en = 20; SK.emit('fire', G, pl, pl.weapons[pl.cur]); });
    await h.sleep(900);
    const s7 = await h.snap(p);
    h.check('warliege dark_sovereign: mỗi đòn đánh (Sục Sôi) tung Trảm Kích bay 3 + 3×1 = 6 và vòng xoay 12 + 3 = 15 [ĐO CreateFlySlash / Skill2DarkSwordAtk]', h.hitsOf(s7, 'dark').some(d => d === 6 || d === 12) && h.hitsOf(s7, 'dark').some(d => d === 15 || d === 30), 'đòn ' + h.hitsOf(s7, 'dark').join(','));
    // Hắc Ám Sắp Chết: chí mạng lúc Sục Sôi thì chưa chết; đủ 233 sát thương thì hồi sinh; lần sau chết thật
    await p.evaluate(() => { SK_GAME.debug.god(false); const G = SK.G, pl = G.player; pl._fs = { n: 20, gap: 0, surge: true, dark: true, en: 20, t: 0, dying: false, dmg: 0, used: false, h: null, hname: null }; pl.hp = 1; pl.armor = 0; pl.invulT = 0; pl.skillT = 0; SK.hurtPlayer(G, 5); });
    const d1 = await p.evaluate(() => { const pl = SK.G.player, s = pl._fs; return { dead: pl.st === 'dead', dying: s.dying, en: s.en, used: s.used }; });
    await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; SK.hurtPlayer(G, 5); });
    const d2 = await p.evaluate(() => SK.G.player.st === 'dead');
    await emitHit(p, 232);
    const d3 = await p.evaluate(() => SK.G.player._fs.dying);
    await emitHit(p, 1);
    const d4 = await p.evaluate(() => { const pl = SK.G.player, s = pl._fs; return { dying: s.dying, hp: pl.hp, inv: pl.invulT, dead: pl.st === 'dead' }; });
    h.check('warliege dark_sovereign: đòn chí mạng lúc Hắc Ám Cuộn Trào thì chưa chết, năng lượng đầy lại, đòn tiếp cũng không chết [ĐO Dead/StartDarkDying]', !d1.dead && d1.dying && d1.en > 19.5 && d1.used && !d2, JSON.stringify([d1, d2]));
    h.check('warliege dark_sovereign: gây đủ 233 sát thương thì hồi sinh 1 máu + miễn thương 1 s [ĐO maxDarkDamage, EndDarkDying]', d3 === true && !d4.dying && d4.hp === 1 && d4.inv > 0.8 && !d4.dead, JSON.stringify([d3, d4]));
    await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.hp = 1; pl.armor = 0; SK.hurtPlayer(G, 5); });
    const d5 = await p.evaluate(() => SK.G.player.st === 'dead');
    h.check('warliege dark_sovereign: chỉ được cứu một lần, chí mạng lần hai thì chết', d5, String(d5));
  }
  });
};
