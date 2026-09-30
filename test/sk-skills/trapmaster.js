// Kiểm thử kỹ năng Bậc Thầy Cạm Bẫy (c25) — số thật ở data/sk-skills86.js và ctrlFields C26Controller; số chim/nón đọc từ prefab tarpMaster_skill3.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
  const ctrl = (p, f) => p.evaluate(f => SK_SKILLS86.heroes.trapmaster.ctrlFields[f], f);
  // Quái không chết giữa lượt đo (đòn nào cũng đo được).
  const tough = p => p.evaluate(() => { for (const e of SK.G.enemies) { e.hp = 99999; if (e.hpMax != null) e.hpMax = 99999; } });
  return {
    async 'trapmaster/0'(p) {
      const r = await real(p, 'trapmaster', 'telecontrolled_bomb');
      const n = await ctrl(p, 'skill1BombNum'), dmg = await ctrl(p, 'initSkill1BombDamage');
      const fuse = 0.5;   // TrapMasterBombCtrl.explodeDelay [ĐO trapmaster_bomb_s1]
      await standNear(p, 50);
      await tough(p);
      await pressK(p); await sleep(200);
      const a = await snap(p);
      const cnt = await p.evaluate(() => SK.G.player._bomb.list.length);
      check('telecontrolled_bomb: ' + n + ' bom quay quanh người ' + r.dur + ' s [ĐO skill1BombNum, dur]', cnt === n && near(a.skillT, r.dur - 0.2, 0.4), cnt + ' bom · skillT ' + a.skillT.toFixed(2));
      await until(p, () => SK.G.player._bomb.list.some(b => b.state === 'stuck'), null, 3000);
      await seq(p, 'trapmaster_0', 6, 70);
      const stuck = await p.evaluate(() => SK.G.player._bomb.list.filter(b => b.state === 'stuck').length);
      check('telecontrolled_bomb: quái chạm bom thì dính đúng 1 quả (quái thường) [WIKI]', stuck === 1, stuck + ' quả dính');
      await resetDmg(p);
      await pressK(p); await sleep(200);
      const s0 = await snap(p);
      check('telecontrolled_bomb: bấm lần nữa thì kỹ năng kết thúc ngay [ĐO ExplodeBombs → RoleSkillEnd], bom chưa nổ trong ' + fuse + ' s [ĐO explodeDelay], hồi chiêu ' + r.cd + ' s',
        s0.skillT <= 0 && near(s0.skillCd, r.cd, 0.6) && hitsOf(s0, 'skill').length === 0, 'skillT ' + s0.skillT.toFixed(2) + ' · skillCd ' + s0.skillCd.toFixed(2) + ' · đòn ' + hitsOf(s0, 'skill').join(','));
      await sleep(500);
      const s = await snap(p);
      const b = hitsOf(s, 'skill');
      check('telecontrolled_bomb: sau ' + fuse + ' s nổ cả loạt (bom dính + bom quay bị ném ra), mỗi quả ' + dmg + ' + cháy [ĐO initSkill1BombDamage, WIKI]', b.length >= n && b.every(x => x === dmg) && s.dbEver.indexOf('fire') >= 0, 'đòn ' + b.join(',') + ' · db ' + s.dbEver);
      // Hết giờ: bom quay bị ném ra và nổ cùng loạt.
      await p.evaluate(() => { SK.G.player.skillCd = 0; });
      await pressK(p); await sleep(300);
      await resetDmg(p);
      await p.evaluate(() => { SK.G.player.skillT = 0.05; });
      await sleep(250);
      const t0 = await snap(p);
      await sleep(600);
      const t1 = await snap(p);
      const tb = hitsOf(t1, 'skill');
      check('telecontrolled_bomb: hết thời lượng thì ném hết bom quay ra rồi nổ sau ' + fuse + ' s', await p.evaluate(() => !SK.G.player._bomb) && hitsOf(t0, 'skill').length === 0 && tb.length >= 1 && tb.every(x => x === dmg), 'đòn ' + tb.join(','));
    },
    async 'trapmaster/1'(p) {
      const r = await real(p, 'trapmaster', 'master_s_trick');
      const st = await ctrl(p, 'initStealthDuration'), ex = await ctrl(p, 'initExplodeDamage'), en = await ctrl(p, 'initAbsorbEnergyNum');
      await standNear(p, 55);
      await p.evaluate(() => { SK.G.player.energy = 50; });
      await pressK(p); await sleep(200);
      const a = await snap(p);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      check('master_s_trick: tàng hình + bất tử ' + st + ' s [ĐO initStealthDuration], chạy x4/3 [ĐO SetStealthEffect: speed_rate 0,5 → 1,0], dur ' + r.dur + ' s', a.hidden && imm === false && near(a.move, 4 / 3, 0.01) && near(a.skillT, r.dur - 0.2, 0.4), 'hidden ' + a.hidden + ' · move ' + a.move.toFixed(3));
      await sleep(1900);
      await seq(p, 'trapmaster_1', 6, 90);
      await sleep(600);
      const b = await snap(p);
      const hooks = hitsOf(b, 'skill');
      check('master_s_trick: móc kéo quái, mỗi lần 2 sát thương [ĐO hookData.damage] và hồi ' + en + ' năng lượng [ĐO initAbsorbEnergyNum]', hooks.length >= 1 && hooks.every(x => x === 2) && b.en >= 50 + en, 'móc ' + hooks.join(',') + ' · năng lượng ' + b.en);
      const slots = await p.evaluate(() => SK.G.player._trick.ready.length);
      check('master_s_trick: ' + (await ctrl(p, 'initHookNum')) + ' ô móc, mỗi ô nghỉ 1,2 s sau khi thu về [ĐO hookCd]', slots === (await ctrl(p, 'initHookNum')), slots + ' ô');
      await sleep(900);
      const c = await snap(p);
      check('master_s_trick: hết ' + st + ' s thì hiện hình, chạy trở lại bình thường, ảo ảnh còn', !c.hidden && near(c.move, 1, 0.01) && c.skillT > 3, 'hidden ' + c.hidden + ' · skillT ' + c.skillT.toFixed(1));
      await resetDmg(p);
      await p.evaluate(() => { SK.G.player.skillT = 0.05; });
      await sleep(300);
      const e = await snap(p);
      const boom = hitsOf(e, 'skill');
      check('master_s_trick: hết thời lượng ảo ảnh nổ ' + ex + ' [ĐO initExplodeDamage], hồi chiêu ' + r.cd + ' s', boom.some(x => x === ex) && near(e.skillCd, r.cd, 0.4), 'đòn ' + boom.join(',') + ' · skillCd ' + e.skillCd.toFixed(2));
    },
    async 'trapmaster/2'(p) {
      const r = await real(p, 'trapmaster', 'hat_trick');
      // C26Skill3Ctrl / PigeonCtrl [ĐO common.ab tarpMaster_skill3]
      const loft = 10, lim = 5, pd = 1, boom = 5, big = 20, loftT = 3;
      await standNear(p, 50);
      await tough(p);
      await pressK(p);
      const full = await until(p, () => SK.G.player._hat && SK.G.player._hat.pigeons.length === 5, null, 4500);
      const a = await snap(p);
      const pg = await p.evaluate(() => SK.G.player._hat.pigeons.length);
      const out = await p.evaluate(() => SK.G.player._hat.out);
      check('hat_trick: chim ra từng đợt 2 (2+2+1) từ nón, tối đa ' + lim + ' con [ĐO initPigeonNumLimit, initCreatePigeonNumPreTime]', full && pg === lim && out === lim, pg + ' con · đã ra ' + out);
      const bigRise = await p.evaluate(() => { const st = SK.G.player._hat; return !!(st && st.big && st.big.phase === 'rise'); });
      // Chế độ tấn công: giữ nút thì bồ câu lao vào quái.
      await resetDmg(p);
      await p.keyboard.down('KeyK');
      await seq(p, 'trapmaster_2', 6, 100);
      const c = await snap(p);
      await p.keyboard.up('KeyK');
      const pk = hitsOf(c, 'pigeon');
      check('hat_trick: giữ nút (có mục tiêu) thì bồ câu lao vào quái, mỗi cú mổ ' + pd + ' [ĐO initPigeonDamage]', pk.length >= 1 && pk.every(x => x === pd), 'đòn ' + pk.join(','));
      // Chặn đạn.
      await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 30, y: pl.y - 12, h: 8, vx: -60, vy: 0, ang: Math.PI, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 }); });
      await sleep(500);
      const blocked = await p.evaluate(() => { const b = SK.G.bullets.find(x => x._probe); return !b || b.dead; });
      const pg2 = await p.evaluate(() => SK.G.player._hat ? SK.G.player._hat.pigeons.length : 0);
      check('hat_trick: bồ câu chặn đạn địch (chim đỡ đạn thì nổ)', blocked, 'đạn ' + (blocked ? 'bị chặn' : 'lọt') + ' · còn ' + pg2 + ' chim');
      // Chim lớn: bay lên rồi lao xuống nổ 20.
      const bigOk = await until(p, () => !SK.G.player._hat || !SK.G.player._hat.big, null, 3000);
      await sleep(80);
      const d = await snap(p);
      const bh = hitsOf(d, 'bigPigeon');
      check('hat_trick: chim lớn bay lên (1 s) rồi lao xuống (0,8 s) và nổ ' + big + ' [ĐO initBigPigeonExplodeDamage, AnimaOnLetBigPigeonOut]', bigRise && bigOk && bh.length >= 1 && bh.every(x => x === big), 'lên ' + bigRise + ' · đòn ' + bh.join(','));
      const hat = hitsOf(d, 'hat');
      check('hat_trick: nón gây ' + loft + ' mỗi nhịp trong ' + loftT + ' s [ĐO initLoftDamage, initLoftAtkDuration]', hat.length >= 1 && hat.every(x => x === loft), 'đòn ' + hat.join(','));
      await until(p, () => SK.G.player.skillT <= 0, null, 6000);
      await sleep(150);
      const e = await snap(p);
      check('hat_trick: hết ' + r.dur + ' s bồ câu nổ (' + boom + ' mỗi quả), hồi chiêu ' + r.cd + ' s [ĐO]', near(e.skillCd, r.cd, 0.5) && await p.evaluate(() => !SK.G.player._hat), 'skillCd ' + e.skillCd.toFixed(2));
    }
  };
};
