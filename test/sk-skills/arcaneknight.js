// Ca kiểm Kỵ Sĩ Bùa Chú (c31): Năng Lượng Tuôn Trào (ba dạng theo vũ khí), Pháp Trận Bảo Hộ — số [ĐO] từ ctrlFields C32Controller + mã IL2CPP (sk_method.py); mỗi số dưới đây là giá trị đo.
module.exports = h => {
  const tank = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp = 9999; }));
  const arm = (p, kind) => p.evaluate(k => { const D = SK.DS.weapons, pl = SK.G.player; const id = Object.keys(D).find(i => (k === 'beam' ? D[i].kind === 'laser' : D[i].kind === (k === 'proj' ? 'gun' : k)) && D[i].w86); pl.weapons[pl.cur] = SK.makeWeapon(id); return id; }, kind);
  // đếm số hiệu ứng thật đã sinh ra theo tên (đạn phép, tia)
  const spy = p => p.evaluate(() => { window._sp = {}; if (!SK.vfx._spawn0) { SK.vfx._spawn0 = SK.vfx.spawn; SK.vfx.spawn = function (G, name, ...a) { window._sp[name] = (window._sp[name] || 0) + 1; return SK.vfx._spawn0.call(this, G, name, ...a); }; } });
  const spawned = (p, re) => p.evaluate(re => Object.entries(window._sp).filter(([k]) => new RegExp(re).test(k)).reduce((s, [, v]) => s + v, 0), re);
  return {
    async 'arcaneknight/0'(p, id) {
      const r = await h.real(p, 'arcaneknight', 'power_burst');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.arcaneknight.ctrlFields);
      const want = { melee: cf.skill0MeleeInfo.damage, proj: cf.skill0ProjectileInfo.damage, beam: cf.skill0BeamInfo.damage };
      await spy(p);
      for (const kind of ['melee', 'proj', 'beam']) {
        const wid = await arm(p, kind);
        await h.standNear(p, 45); await tank(p); await h.resetDmg(p);
        await p.evaluate(() => { window._sp = {}; });
        const a = await h.snap(p);
        await h.pressK(p); await h.sleep(500);
        const mid = await h.snap(p);
        if (kind === 'melee') await h.seq(p, 'arcaneknight_0', 6, 70);
        await h.until(p, () => SK.G.player.skillT <= 0, null, 5000);
        await h.sleep(500);
        const s = await h.snap(p);
        const d = h.hitsOf(s, 'burst');
        const bolts = await spawned(p, '^arcaneknight_0_skill_0_(energy_)?bullet$'), beams = await spawned(p, '^arcaneknight_0_skill_0_beam$');
        if (kind === 'melee') h.check('arcaneknight power_burst (melee, ' + wid + '): 4 đợt sóng, mỗi đợt ' + want.melee + ' [ĐO skill0MeleeInfo.damage, Skill0AttackPrepare _skill0MeleeMaxTimes]', d.length >= 3 && d.length <= 4 * 4 && d.every(x => x === want.melee || x === want.melee * 2) && bolts === 0 && beams === 0, 'đòn ' + d.join(','));
        if (kind === 'proj') h.check('arcaneknight power_burst (đạn, ' + wid + '): 6 viên, mỗi viên ' + want.proj + ' [ĐO skill0ProjectileInfo.damage, _skill0ProjectileCount]', bolts === 6 && beams === 0 && d.length >= 1 && d.every(x => x === want.proj || x === want.proj * 2), 'sinh ' + bolts + ' đạn · đòn ' + d.join(','));
        if (kind === 'beam') h.check('arcaneknight power_burst (tia, ' + wid + '): 2 tia mỗi tia ' + want.beam + ' + 6 đạn ' + want.proj + ' [ĐO skill0BeamInfo.damage, _skill0BeamCount]', beams === 2 && bolts === 6 && d.some(x => x === want.beam || x === want.beam * 2) && d.every(x => [want.beam, want.proj].some(v => x === v || x === v * 2)), 'sinh ' + beams + ' tia, ' + bolts + ' đạn · đòn ' + d.join(','));
        if (kind === 'melee') h.check('arcaneknight power_burst: tụ ' + r.dur + ' s [ĐO], hồi ' + r.cd + ' s', mid.skillT > 0.9 && a.cd === r.cd && s.skillCd > r.cd - 1.5, 'skillT ' + mid.skillT.toFixed(2) + ' · skillCd ' + s.skillCd.toFixed(2));
        await p.evaluate(() => { SK.G.player.skillCd = 0; });
      }
      // đánh bằng vũ khí khi đang tụ thì thả ngay
      await arm(p, 'proj'); await h.standNear(p, 45); await tank(p); await h.resetDmg(p);
      await p.evaluate(() => { window._sp = {}; });
      await h.pressK(p); await h.sleep(250);
      await p.keyboard.down('KeyJ'); await h.sleep(120); await p.keyboard.up('KeyJ');
      await h.sleep(300);
      const w = await p.evaluate(() => ({ t: SK.G.player.skillT, done: SK.G.player._pb ? SK.G.player._pb.done : 'gone' }));
      h.check('arcaneknight power_burst: đánh vũ khí khi tụ → thả cùng lúc', w.t < 1 && (w.done === true || w.done === 'gone'), JSON.stringify(w));
    },
    async 'arcaneknight/1'(p, id) {
      const r = await h.real(p, 'arcaneknight', 'aegis_circle');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.arcaneknight.ctrlFields);
      const bo = cf.skill1RegularDamageBullet.damage + cf.skill1StrengthenAddDamage;   // 7 + 1 khi có nâng cấp
      await h.standNear(p, 40); await tank(p);
      await p.evaluate(() => { const pl = SK.G.player; pl.armor = 0; pl.armorMax = 3; pl.armorT = 99; });
      const a = await h.snap(p);
      await p.keyboard.down('KeyD');
      await h.pressK(p); await p.keyboard.up('KeyD'); await h.sleep(150);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      await h.seq(p, 'arcaneknight_1', 6, 170);
      const s = await h.snap(p);
      const d = Math.hypot(s.px - a.px, s.py - a.py);
      h.check('arcaneknight aegis_circle: dịch chuyển ≤ ' + cf.skill1MaxTeleportDistance + ' ô [ĐO], bất tử lúc biến mất, hồi ' + r.cd + ' s', imm === false && d > 24 && d <= cf.skill1MaxTeleportDistance * 16 + 10 && s.cd === r.cd, 'dời ' + Math.round(d) + ' px');
      await h.sleep(600);
      const tp = h.hitsOf(await h.snap(p), 'teleport');
      h.check('arcaneknight aegis_circle: nâng cấp → đến nơi nổ ' + cf.skill1TutorLevelUpTeleportBullet.damage + ' sát thương [ĐO skill1TutorLevelUpTeleportBullet]', tp.length >= 1 && tp.every(x => x === cf.skill1TutorLevelUpTeleportBullet.damage || x === cf.skill1TutorLevelUpTeleportBullet.damage * 2), 'đòn ' + tp.join(','));
      const dm = h.hitsOf(await h.snap(p), 'circle');
      h.check('arcaneknight aegis_circle: nâng cấp → vòng gây ' + bo + ' (7 + skill1StrengthenAddDamage 1) cho quái trong vòng [ĐO]', dm.length >= 1 && dm.every(x => x === bo || x === bo * 2), 'đòn ' + dm.join(','));
      // giáp tạm +1 mỗi 0,33 s, dừng ở 6 người dùng
      await h.until(p, () => SK.G.player._akCircle && SK.G.player._akCircle.given >= 6, null, 5000);
      await h.sleep(900);
      const s2 = await p.evaluate(() => { const pl = SK.G.player, c = pl._akCircle; return { armor: pl.armor, given: c ? c.given : -1 }; });
      h.check('arcaneknight aegis_circle: giáp tạm +1 mỗi ' + cf.skill1AddArmorInterval + ' s, dừng ở tối đa ' + cf.skill1MaxAddArmor + ' [ĐO skill1MaxAddArmor]', s2.given === cf.skill1MaxAddArmor && s2.armor === cf.skill1MaxAddArmor, JSON.stringify(s2));
      // rời vòng: có nâng cấp thì vòng và giáp còn skill1StrengthenSelfRetain 3,5 s
      await p.evaluate(() => { const pl = SK.G.player; pl.x += 200; window._leftAt = SK.G.t; });
      await h.sleep(700);
      const stay = await p.evaluate(() => ({ c: !!SK.G.player._akCircle, armor: SK.G.player.armor }));
      await h.until(p, () => !SK.G.player._akCircle, null, 6000);
      const gone = await p.evaluate(() => ({ dt: SK.G.t - window._leftAt, armor: SK.G.player.armor }));
      h.check('arcaneknight aegis_circle: rời vòng thì vòng còn ' + cf.skill1StrengthenSelfRetain + ' s rồi tan, mất giáp tạm [ĐO skill1StrengthenSelfRetain]', stay.c && stay.armor === 6 && h.near(gone.dt, cf.skill1StrengthenSelfRetain, 0.7) && gone.armor <= 3, JSON.stringify([stay, gone]));
      // không nâng cấp: vòng nhỏ hơn 1,1 lần, sát thương 7, không nổ 24, rời là tan ngay
      await h.until(p, () => SK.G.player.skillT <= 0 && SK.G.player.skillCd <= 0.02, null, 9000);
      await p.evaluate(() => { SK.passiveOn = () => false; const pl = SK.G.player; pl.skillCd = 0; pl.armor = 0; });
      await h.standNear(p, 20); await tank(p); await h.resetDmg(p);
      await h.pressK(p);
      await h.until(p, () => SK.G.player._akCircle, null, 3000);
      await h.sleep(1300);
      const s3 = await h.snap(p);
      const dm0 = h.hitsOf(s3, 'circle'), tp0 = h.hitsOf(s3, 'teleport');
      h.check('arcaneknight aegis_circle: chưa nâng cấp → vòng gây ' + cf.skill1RegularDamageBullet.damage + ', không nổ ' + cf.skill1TutorLevelUpTeleportBullet.damage, dm0.length >= 1 && dm0.every(x => x === cf.skill1RegularDamageBullet.damage || x === cf.skill1RegularDamageBullet.damage * 2) && tp0.length === 0, 'vòng ' + dm0.join(',') + ' · nổ ' + tp0.join(','));
      await p.evaluate(() => { SK.G.player.x += 200; });
      await h.sleep(300);
      const left0 = await p.evaluate(() => !!SK.G.player._akCircle);
      h.check('arcaneknight aegis_circle: chưa nâng cấp → rời vòng là tan ngay', !left0, String(left0));
      await p.evaluate(() => { delete SK.passiveOn; });
    }
  };
};
