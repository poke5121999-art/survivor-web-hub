// Ca kiểm Thuật Sĩ Ác Ma (c23) — số đọc từ C24Controller / C24Skill1Config / Fire2_warlock_skin_0; xem games/soulknight/js/skills/warlock.js.
const feed = (p, n) => p.evaluate(n => { const G = SK.G, pl = G.player; for (let i = 0; i < n; i++) SK.warlock.summon(G, pl, pl.x - 12 - i * 5, pl.y + 4); return SK.warlock.demons(G, pl).length; }, n);
const tough = p => p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 9999; });
module.exports = h => ({
  async 'warlock/0'(p, id) {
    const r = await h.real(p, 'warlock', 'amii_s_burning_body');
    await h.standNear(p, 60); await tough(p);
    const n0 = await feed(p, 4);
    h.check('warlock: Tiểu Quỷ triệu ra được, tối đa 6 [ĐO MaxDemonCount]', n0 === 4, n0 + ' con');
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(900);
    let s = await h.snap(p);
    h.check('warlock amii_s_burning_body: vòng lửa ' + r.args.split(';')[0] + ' s [ĐO args], chạy nhanh x1,5 [ĐO Skill0MoveSpeedValue]', h.near(s.skillT, 10 - 0.9, 0.5) && h.near(s.move, 1.5, 0.01), 'skillT ' + s.skillT.toFixed(2) + ' move ' + s.move);
    const f = h.hitsOf(s, 'wl_fire');
    h.check('warlock amii_s_burning_body: lửa 8 mỗi 0,4 s [ĐO Fire2_warlock_skin_0]', f.length >= 2 && f.every(d => d === 8), f.length + ' nhịp');
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(60);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    await h.seq(p, 'warlock_0', 6, 60);
    await h.sleep(500);
    s = await h.snap(p);
    const left = await p.evaluate(() => SK.warlock.demons(SK.G, SK.G.player).length);
    h.check('warlock amii: bấm lại hy sinh ' + r.args.split(';')[1] + ' Tiểu Quỷ [ĐO args], loạt lửa 10 [ĐO SecondStageTotalDamage], khiên 0,5 s', left === 2 && h.hitsOf(s, 'wl_burst').length >= 1 && h.hitsOf(s, 'wl_burst').every(d => d === 10) && imm === false, 'còn ' + left + ' · đòn ' + h.hitsOf(s, 'wl_burst').join(',') + ' · khiên ' + (imm === false));
    h.check('warlock amii: mỗi quái mở đúng một vòng lửa nhỏ 3 [ĐO skill0ExtraFireCircleBaseDamage, HashSet triggered]', h.hitsOf(s, 'wl_fire2').length >= 1 && h.hitsOf(s, 'wl_fire2').every(d => d === 3) && await p.evaluate(() => { const a = SK.G.player._wlAm; return a && a.extra.length <= a.circled.size; }), 'đòn ' + h.hitsOf(s, 'wl_fire2').join(','));
    h.check('warlock amii: kéo dài thêm 1 s mỗi Tiểu Quỷ hy sinh [ĐO Skill0DurationExtendPerSacrifice]', s.skillT > 10 - 1.6 - 0.2, 'skillT ' + s.skillT.toFixed(2));
    await p.evaluate(() => { SK.endSkill(SK.G, SK.G.player); });
    s = await h.snap(p);
    h.check('warlock amii: hết thì hồi chiêu ' + r.cd + ' s [ĐO], trả tốc chạy', s.cd === 3 && h.near(s.move, 1, 0.01), 'move ' + s.move);
  },
  async 'warlock/1'(p, id) {
    const r = await h.real(p, 'warlock', 'helping_hand_eligos');
    await h.standNear(p, 60); await tough(p);
    await h.pressK(p); await h.sleep(300);
    let st = await p.evaluate(() => { const w = SK.warlock.state(SK.G.player); return { on: !!(w.eligos && !w.eligos.gone), en: w.eE, cd: SK.G.player.skillCd }; });
    h.check('warlock helping_hand_eligos: K lần đầu triệu hồi Eligos, vào hồi chiêu ' + r.cd + ' s [ĐO ignoreCd 0]', st.on && st.en === 0 && st.cd > 8, JSON.stringify(st));
    await h.resetDmg(p);
    await p.keyboard.down('KeyJ'); await h.sleep(1600); await p.keyboard.up('KeyJ');
    let s = await h.snap(p);
    const at = h.hitsOf(s, 'wl_eligos');
    h.check('warlock eligos: đòn thường 2 nhát x 7 khi người chơi bấm đánh [ĐO eligosAttackDamageFactor / ComboCount]', at.length >= 2 && at.every(d => d === 7), 'đòn ' + at.join(','));
    // K lần hai (đã hết hồi chiêu): combo kỹ năng, mỗi Tiểu Quỷ chết cho 1 năng lượng.
    await feed(p, 4);
    await p.evaluate(() => { const P = SK.G.player, a = SK.warlock.state(P).eligos; P.skillCd = 0; a.cd = 0; a.act = null; });
    await h.resetDmg(p);
    await h.pressK(p); await h.sleep(1500);
    s = await h.snap(p);
    st = await p.evaluate(() => { const w = SK.warlock.state(SK.G.player); return { en: w.eE, left: SK.warlock.demons(SK.G, SK.G.player).length, hide: w.eligos && w.eligos.hide }; });
    const sk = h.hitsOf(s, 'wl_eligos_skill').slice(0, 3);
    h.check('warlock eligos: K khi năng lượng < 100 -> combo kỹ năng 17, 17, 31 [ĐO C24Skill1Config]', sk.join(',') === '17,17,31', 'đòn ' + sk.join(','));
    h.check('warlock eligos: 4 Tiểu Quỷ hy sinh thành 4 năng lượng [ĐO DemonGainEligosEnergy 1]; sau combo Eligos ẩn 3 s [ĐO waitTimeAfterSkillCombo]', st.en === 4 && st.left === 0 && st.hide > 0 && st.hide <= 3, JSON.stringify(st));
    // Đủ 100 năng lượng: K tụ lực dur 1 s rồi nổ sau explodeDelay 0,9 s.
    await p.evaluate(() => { const P = SK.G.player, w = SK.warlock.state(P); w.eE = 100; w.eligos.hide = 0; P.skillCd = 0; });
    await h.standNear(p, 40); await h.resetDmg(p);
    await h.pressK(p); await h.sleep(300);
    const prep = await p.evaluate(() => SK.G.player.skillT);
    h.check('warlock eligos: đủ 100 năng lượng thì K tụ lực ' + r.dur + ' s [ĐO EnergyEnoughToExplode, skill dur]', h.near(prep, r.dur - 0.3, 0.3), 'skillT ' + prep.toFixed(2));
    const bodies = await p.evaluate(() => { const G = SK.G, a = SK.warlock.state(G.player).eligos, d0 = SK.draw; let n = 0; SK.draw = (c, f, x, y, o) => { if (f === 'warlock_0_skill_1_effect_0_7') n++; return d0(c, f, x, y, o); }; const cv = document.createElement('canvas'); a.draw(cv.getContext('2d'), G, a); SK.draw = d0; return n; });
    const one = await p.evaluate(() => SK.G.props.filter(q => q.ally && q.ally.eligos && !q.ally.gone).length);
    h.check('warlock eligos: chỉ một Eligos tồn tại (một ally, một lần vẽ thân)', one === 1 && bodies === 1, one + ' ally · ' + bodies + ' thân vẽ');
    await h.seq(p, 'warlock_1', 6, 200);
    await h.sleep(600);
    s = await h.snap(p);
    const gone = await p.evaluate(() => { const w = SK.warlock.state(SK.G.player); return { on: !!w.eligos, en: w.eE }; });
    h.check('warlock eligos: nổ sau explodeDelay 0,9 s, 10 sát thương [ĐO ExplodeEligos.damage]; năng lượng về 0', !gone.on && gone.en === 0 && h.hitsOf(s, 'wl_boom').length >= 1 && h.hitsOf(s, 'wl_boom').every(d => d === 10), JSON.stringify(gone) + ' đòn ' + h.hitsOf(s, 'wl_boom').join(','));
    h.check('warlock eligos: hồi chiêu ' + r.cd + ' s [ĐO]', s.cd === 10, 'cd ' + s.cd);
  },
  async 'warlock/2'(p, id) {
    const r = await h.real(p, 'warlock', 'amon_s_protection');
    await h.standNear(p, 60); await tough(p);
    await h.resetDmg(p);
    await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q.hp > 0 && q.st !== 'dead'); SK.hurtEnemy(G, e, 3, false, 0, 0); });
    await h.sleep(1200);
    let s = await h.snap(p);
    const marked = await p.evaluate(() => SK.G.enemies.filter(e => e._amon).length);
    const en = await p.evaluate(() => SK.warlock.state(SK.G.player).energy);
    h.check('warlock amon: quái bị đánh mang dấu, rút hồn 1 sát thương/giây [ĐO BuffWarlockSkill2]', marked >= 1 && h.hitsOf(s, 'wl_amon').length >= 1 && h.hitsOf(s, 'wl_amon').every(d => d === 1), marked + ' quái · ' + h.hitsOf(s, 'wl_amon').length + ' nhịp');
    await h.sleep(700);
    const en2 = await p.evaluate(() => SK.warlock.state(SK.G.player).energy);
    h.check('warlock amon: mỗi nhịp rút được linh hồn, tối đa 50 [ĐO Skill2MaxEnergy]', en2 >= 1, 'linh hồn ' + en2);
    await feed(p, 3);
    await p.evaluate(() => { SK.warlock.state(SK.G.player).energy = 27; });
    await h.pressK(p); await h.sleep(150);
    s = await h.snap(p);
    const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
    const en3 = await p.evaluate(() => SK.warlock.state(SK.G.player).energy);
    await h.seq(p, 'warlock_2', 6, 60);
    h.check('warlock amon: 27 linh hồn + 3 Tiểu Quỷ hy sinh (1 hồn mỗi con [ĐO CreateEnergyForSkill2]) = 30 -> khiên 3 s (= linh hồn / 10) [ĐO ExecuteSkill2], chạy x1,6', imm === false && h.near(s.skillT, 3 - 0.15, 0.4) && h.near(s.move, 1.6, 0.01) && en3 <= 1, 'skillT ' + s.skillT.toFixed(2) + ' move ' + s.move + ' hồn ' + en3);
    await h.until(p, () => SK.G.player.skillT <= 0, null, 5000);
    s = await h.snap(p);
    h.check('warlock amon: hết khiên trả tốc chạy; hồi chiêu ' + r.cd + ' s [ĐO]', h.near(s.move, 1, 0.01) && s.cd === 10, 'move ' + s.move);
  }
});
