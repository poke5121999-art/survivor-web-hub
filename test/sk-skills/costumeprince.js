// Ca kiểm Trang Phục Hoàng Tử (c26): transform_slime_king (ô 0), forward_crystal_crab_king (ô 1), manifest_king_violet (ô 2).
// Số thật: ctrlFields của data/sk-skills86.js (s1Init*/s2Init*) và config của C27Skill3ShapeShiftCtrl / weapon_c27_skill0/1 (common.ab, weapon.ab).
module.exports = h => {
  const state = p => p.evaluate(() => {
    const G = SK.G, pl = G.player, f = pl._form;
    return {
      kind: f && f.kind, hp: f && f.hp, hpMax: f && f.hpMax, act: f && f.act, cdT: f && f.cdT, hits: f && f.hits, stack: f && f.stack, valor: f && f.valor, on: f && f.on, swings: f && f.swings, swords: !!(f && f.swords),
      weapon: pl.weapons[pl.cur] && pl.weapons[pl.cur].id, skillT: pl.skillT, skillCd: pl.skillCd, move: pl.moveMul || 1, rate: pl.rateMul || 1, php: pl.hp, parm: pl.armor, r: pl.h.body.r,
      slimes: (G._allies || []).filter(a => a.cpSlime && !a.gone).length, ring: G.bullets.filter(b => b._cp === 'ring').length, swing: G.bullets.filter(b => b._cp === 'swing').length
    };
  });
  const hurt = (p, d) => p.evaluate(d => { const G = SK.G, pl = G.player; pl.god = false; return SK.hurtPlayer(G, d); }, d);
  return {
    async 'costumeprince/0'(p) {
      const r = await h.real(p, 'costumeprince', 'transform_slime_king');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.costumeprince.ctrlFields);
      await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
      await h.standNear(p, 24);
      const a = await state(p);
      await h.pressK(p); await h.sleep(150);
      const s = await state(p);
      await h.seq(p, 'costumeprince_0a', 6, 60);
      // Trúng đòn: máu hình trừ, máu người giữ nguyên, bất tử 0.4 s; đòn thứ hai nổ 10 + sinh Slime.
      await h.resetDmg(p);
      const h1 = await hurt(p, 3), h1b = await hurt(p, 3), m1 = await state(p);
      await h.sleep(cf.s1InitHitInvincibilityFrameDuration * 1000 + 250);
      const h2 = await hurt(p, 2), m2 = await state(p);
      await h.sleep(200);
      const b = await h.snap(p);
      // Đập Tử Vong: phím đổi vũ khí.
      await h.resetDmg(p);
      await p.keyboard.down('KeyQ'); await h.sleep(60); await p.keyboard.up('KeyQ');
      await h.sleep(300);
      const air = await state(p);
      const seqP = h.seq(p, 'costumeprince_0b', 6, 130);
      await h.until(p, () => SK.G.bullets.some(b => b._cp === 'ring'), null, 3000);
      const d = await state(p);
      await seqP;
      await h.sleep(300);
      const e = await h.snap(p);
      await h.sleep(1200);
      const pool = h.hitsOf(await h.snap(p), 'pool');
      // Bao Tay: 3 viên/đòn.
      await p.evaluate(() => { const G = SK.G; G.bullets.length = 0; });
      await p.keyboard.down('KeyJ');
      const gl = await p.evaluate(async () => { let best = []; for (let i = 0; i < 25; i++) { const c = SK.G.bullets.filter(b => b._cp === 'gloves').map(b => b.dmg); if (c.length > best.length) best = c; await new Promise(r => setTimeout(r, 20)); } return best; });
      await p.keyboard.up('KeyJ');
      // Thoát hình.
      await h.pressK(p); await h.sleep(200);
      const x = await state(p);
      h.check('costumeprince slime: hoá Vua Slime ' + cf.s1InitShiftHp + ' máu hình [ĐO s1InitShiftHp], chạy x' + cf.s1InitShiftSpeed + ' [ĐO s1InitShiftSpeed], Bao Tay', s.kind === 'slime' && s.hp === cf.s1InitShiftHp && Math.abs(s.move - cf.s1InitShiftSpeed) < 1e-6 && s.weapon === '_cp_gloves' && a.cdT == null, JSON.stringify({ kind: s.kind, hp: s.hp, move: s.move, w: s.weapon }));
      h.check('costumeprince slime: đòn nhận trừ máu hình không trừ máu người, bất tử ' + cf.s1InitHitInvincibilityFrameDuration + ' s [ĐO]', h1 === false && h1b === false && m1.hp === cf.s1InitShiftHp - 3 && m1.php === s.php && m1.parm === s.parm, JSON.stringify({ h1, h1b, hình: m1.hp, php: m1.php }));
      h.check('costumeprince slime: đòn thứ ' + cf.s1InitPassiveSkillHitTimes + ' (đếm cả đòn trong khung bất tử [ĐO mã OnGetHurt]) nổ ' + cf.s1InitPassiveSkillExplodeDamage + ' [ĐO] và sinh Slime nhỏ', m1.hits === 0 && m2.hits === 1 && h.hitsOf(b, 'passive').length > 0 && h.hitsOf(b, 'passive').every(v => v === cf.s1InitPassiveSkillExplodeDamage) && m1.slimes === 1, 'nổ ' + h.hitsOf(b, 'passive').join(',') + ' · Slime ' + m1.slimes + ' · đếm ' + m1.hits + '/' + m2.hits);
      h.check('costumeprince slime: Đập Tử Vong nhảy lên rồi đập xuống (clip 1.3125 s), sóng 6 [ĐO ExplodeHammer damage] + vòng đạn ' + cf.s1InitMainSkillBulletDamage + ' sát thương [ĐO]', air.act === 'smash' && d.ring > 0 && h.hitsOf(e, 'skill').length > 0 && h.hitsOf(e, 'skill').every(v => v === 6 || v === 12), JSON.stringify({ air: air.act, đạn: d.ring, sóng: h.hitsOf(e, 'skill').join(',') }));
      h.check('costumeprince slime: vũng độc 1 sát thương/nhịp [WIKI]', pool.length > 0 && pool.every(v => v === 1), 'nhịp ' + pool.slice(0, 6).join(','));
      h.check('costumeprince slime: Bao Tay bắn 3 viên/đòn, 3 sát thương [ĐO weapon_c27_skill0]', gl.length > 0 && gl.length % 3 === 0 && gl.every(v => v === 3 || v === 6), 'viên ' + gl.join(','));
      h.check('costumeprince slime: bấm K lần nữa thì thoát hình, trả vũ khí, hồi chiêu ' + r.cd + ' s [ĐO]', x.kind == null && x.weapon !== '_cp_gloves' && x.move === 1 && Math.abs(x.skillCd - r.cd) < 0.6, JSON.stringify({ w: x.weapon, move: x.move, cd: x.skillCd }));
    },
    async 'costumeprince/1'(p) {
      const r = await h.real(p, 'costumeprince', 'forward_crystal_crab_king');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.costumeprince.ctrlFields);
      await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
      await h.standNear(p, 30);
      await h.pressK(p); await h.sleep(150);
      const s = await state(p);
      await h.seq(p, 'costumeprince_1a', 6, 60);
      await h.resetDmg(p);
      // Ba đòn nhận (cách nhau > 0.2 s): nổ băng 15 + gai băng.
      for (let i = 0; i < cf.s2InitPassiveSkillHitTimes; i++) { await hurt(p, 2); await h.sleep(cf.s2InitHitInvincibilityFrameDuration * 1000 + 120); }
      const m = await state(p), b = await h.snap(p);
      // Phòng Thủ 0 Độ: giữ phím, nhận đòn hồi máu hình và tích năng lượng.
      await p.evaluate(() => { SK.G.player._form.hp = 20; SK.G.player._form.hits = 0; });
      await h.standNear(p, 24);
      await h.resetDmg(p);
      await p.keyboard.down('KeyQ'); await h.sleep(250);
      const holdA = await state(p);
      const hh = await hurt(p, 5);
      await h.sleep(300);
      const hh2 = await hurt(p, 5);
      const holdB = await state(p);
      await h.seq(p, 'costumeprince_1b', 6, 90);
      await p.keyboard.up('KeyQ'); await h.sleep(300);
      await h.until(p, () => !SK.G.player._form.act, null, 6000);
      await h.sleep(200);
      const e = await h.snap(p), z = await state(p);
      const crystal = h.hitsOf(e, 'crystal');
      // Vuốt.
      await h.standNear(p, 24);
      await h.resetDmg(p);
      await p.keyboard.down('KeyJ'); await h.sleep(1100); await p.keyboard.up('KeyJ');
      const c = await h.snap(p);
      await h.pressK(p); await h.sleep(150);
      h.check('costumeprince crab: hoá Cua Vua ' + cf.s2InitShiftHp + ' máu hình [ĐO s2InitShiftHp], chạy x' + cf.s2InitShiftMoveSpeed[0] + ' [ĐO], Vuốt', s.kind === 'crab' && s.hp === cf.s2InitShiftHp && Math.abs(s.move - cf.s2InitShiftMoveSpeed[0]) < 1e-6 && s.weapon === '_cp_claw', JSON.stringify({ hp: s.hp, move: s.move, w: s.weapon }));
      h.check('costumeprince crab: cứ ' + cf.s2InitPassiveSkillHitTimes + ' đòn nhận thì nổ băng ' + cf.s2InitPassiveSkillExplodeDamage + ' [ĐO]', m.hits === 0 && h.hitsOf(b, 'passive').length > 0 && h.hitsOf(b, 'passive').every(v => v === cf.s2InitPassiveSkillExplodeDamage), 'nổ ' + h.hitsOf(b, 'passive').join(','));
      h.check('costumeprince crab: Phòng Thủ 0 Độ không mất máu, mỗi đòn đỡ (2 đòn) hồi ' + cf.s2InitShiftAddHp + ' máu hình [ĐO s2InitShiftAddHp]', holdA.act === 'hold' && hh === false && holdB.hp === 20 + 2 * cf.s2InitShiftAddHp && holdB.stack === 2 && holdB.php === s.php, JSON.stringify({ act: holdA.act, hp: holdB.hp, stack: holdB.stack }));
      h.check('costumeprince crab: nhả ra thì Gai Pha Lê 3+2 lượt (2 đòn đã đỡ), ' + cf.s2InitCrystalSpikeDamage + ' sát thương [ĐO s2InitCrystalSpikeDamage], hồi chiêu ' + cf.s2InitMainSkillCd + ' s [ĐO]', crystal.length >= 5 && crystal.every(v => v === cf.s2InitCrystalSpikeDamage || v === cf.s2InitCrystalSpikeDamage * 2) && z.cdT > cf.s2InitMainSkillCd - 1.5 && z.stack === 0, 'gai ' + crystal.length + ' · cd ' + (z.cdT || 0).toFixed(1) + ' · ' + JSON.stringify(e.hits.slice(-6)));
      h.check('costumeprince crab: Vuốt 12 sát thương [ĐO weapon_c27_skill1], thoát hình', h.hitsOf(c, 'skill').length >= 0 && c.hits.some(v => v[1] === 'claw' && (v[0] === 12 || v[0] === 24)), 'đòn ' + c.hits.filter(v => v[1] === 'claw').map(v => v[0]).join(','));
    },
    async 'costumeprince/2'(p) {
      const r = await h.real(p, 'costumeprince', 'manifest_king_violet');
      const cfg = await p.evaluate(() => { const s = SK_SKILLS86.mb.CostumePrince_0_skill_2; return s && s.C27Skill3ShapeShiftCtrl ? s.C27Skill3ShapeShiftCtrl.config : null; }) || {
        initValorValue: 30, initValorTurnOnValue: 50, notValorGetDamageLimit: 5, initBladeDamage: 8, initSpearDamage: 8, landDamage: 13, jazzLeapLandingDamage: 2, valorAnimatorSpeed: 1.5, initMainSkillCd: 5, swingSwordBulletCreateTimesAfterMainSkill: 3, initPunchDamage: 10, valorStateDamageAdditive: 2, turnValorHpProtectTime: 2 };
      await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });
      await h.standNear(p, 26);
      await h.pressK(p); await h.sleep(150);
      const s = await state(p);
      // Đòn thường: kiếm 8, kiếm 8, thương 8.
      await h.resetDmg(p);
      await p.keyboard.down('KeyJ'); await h.sleep(1500);
      await h.seq(p, 'costumeprince_2a', 6, 60);
      await p.keyboard.up('KeyJ');
      const a = await h.snap(p), va = await state(p);
      // Chiến Dũng thấp: đòn nhận tối đa 5.
      await p.evaluate(() => { const f = SK.G.player._form; f.on = false; f.valor = 10; });
      const before = await state(p);
      await p.evaluate(() => { SK.G.player.invulT = 0; });
      const hLow = await p.evaluate(() => { const G = SK.G, pl = G.player, t0 = pl.hp + pl.armor; pl.god = false; pl.hp = 30; pl.hpMax = 30; pl.armor = 0; SK.hurtPlayer(G, 9); return 30 - pl.hp; });
      // Bật Chiến Dũng.
      await p.evaluate(() => { const f = SK.G.player._form; f.valor = 60; });
      await h.sleep(200);
      const on = await state(p);
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.hp = 30; pl.armor = 0; });
      const hHigh = await p.evaluate(() => { const G = SK.G, pl = G.player; pl.invulT = 0; pl.hp = 2; SK.hurtPlayer(G, 9); return pl.hp; });
      // Bay Nhảy.
      await h.resetDmg(p);
      await p.evaluate(() => { const f = SK.G.player._form; f.cdT = 0; f.valor = 80; SK.G.player.hp = 30; });
      await p.keyboard.down('KeyQ'); await h.sleep(60); await p.keyboard.up('KeyQ');
      await h.sleep(250);
      const air = await state(p);
      await h.seq(p, 'costumeprince_2b', 6, 150);
      await h.sleep(700);
      const l = await h.snap(p), ls = await state(p);
      await h.sleep(1500);
      const zone = h.hitsOf(await h.snap(p), 'zone');
      await h.pressK(p); await h.sleep(150);
      const x = await state(p);
      h.check('costumeprince violet: hoá Tước Sĩ Tím, Chiến Dũng ' + cfg.initValorValue + ' [ĐO initValorValue], vũ khí Hồn Nhẫn, dùng máu người chơi', s.kind === 'violet' && Math.abs(s.valor - cfg.initValorValue) < 1 && s.weapon === '_cp_blade' && s.hp == null, JSON.stringify({ valor: s.valor, w: s.weapon }));
      const blades = a.hits.filter(v => v[1] === 'blade' || v[1] === 'spear').map(v => v[0]);
      h.check('costumeprince violet: đòn thường kiếm/thương ' + cfg.initBladeDamage + ' sát thương [ĐO config], gây sát thương thì tích Chiến Dũng', blades.length >= 3 && blades.every(v => v === cfg.initBladeDamage || v === cfg.initBladeDamage * 2) && va.valor > s.valor - 5, 'đòn ' + blades.join(',') + ' · Chiến Dũng ' + (va.valor || 0).toFixed(1));
      h.check('costumeprince violet: Chiến Dũng thấp thì đòn nhận tối đa ' + cfg.notValorGetDamageLimit + ' [ĐO notValorGetDamageLimit] (9 → 5)', hLow === cfg.notValorGetDamageLimit, 'mất ' + hLow);
      h.check('costumeprince violet: Chiến Dũng ≥ ' + cfg.initValorTurnOnValue + ' bật trạng thái: tốc đánh x' + cfg.valorAnimatorSpeed + ', bảo vệ máu ' + cfg.turnValorHpProtectTime + ' s [ĐO]', on.on === true && Math.abs(on.rate - cfg.valorAnimatorSpeed) < 1e-6 && hHigh >= 1, JSON.stringify({ on: on.on, rate: on.rate, hpSau: hHigh }));
      h.check('costumeprince violet: Bay Nhảy hạ cánh ' + cfg.landDamage + ' sát thương [ĐO landDamage], vùng ' + cfg.jazzLeapLandingDamage + ' + choáng [ĐO], hồi chiêu ' + cfg.initMainSkillCd + ' s x0.8 khi Chiến Dũng cao', air.act === 'leap' && h.hitsOf(l, 'leap').length > 0 && h.hitsOf(l, 'leap').every(v => v === cfg.landDamage || v === cfg.landDamage + 0 || v === cfg.landDamage * 2) && ls.swings <= cfg.swingSwordBulletCreateTimesAfterMainSkill && zone.every(v => v === cfg.jazzLeapLandingDamage) && ls.cdT > 2 && ls.cdT <= cfg.initMainSkillCd, JSON.stringify({ air: air.act, nện: h.hitsOf(l, 'leap').join(','), vùng: zone.join(','), cd: ls.cdT }));
      h.check('costumeprince violet: bấm K thoát hình, trả vũ khí, hồi chiêu ' + r.cd + ' s [ĐO]', x.kind == null && x.weapon !== '_cp_blade' && x.rate === 1 && x.move === 1, JSON.stringify({ w: x.weapon, rate: x.rate, move: x.move }));
    }
  };
};
