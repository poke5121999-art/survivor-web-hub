// Kiểm thử kỹ năng Bậc Thầy Cạm Bẫy (c25) — số thật ở data/sk-skills86.js và ctrlFields C26Controller.
module.exports = h => {
  const { check, sleep, until, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
  const ctrl = (p, f) => p.evaluate(f => SK_SKILLS86.heroes.trapmaster.ctrlFields[f], f);
  return {
    async 'trapmaster/0'(p) {
      const r = await real(p, 'trapmaster', 'telecontrolled_bomb');
      const n = await ctrl(p, 'skill1BombNum'), dmg = await ctrl(p, 'initSkill1BombDamage');
      await standNear(p, 50);
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
      const s = await snap(p);
      const b = hitsOf(s, 'skill');
      check('telecontrolled_bomb: bấm lại nổ quả dính, ' + dmg + ' sát thương + cháy [ĐO initSkill1BombDamage, WIKI]', b.length >= 1 && b.every(x => x === dmg) && s.dbEver.indexOf('fire') >= 0, 'đòn ' + b.join(',') + ' · db ' + s.dbEver);
      await pressK(p); await sleep(500);
      const left = await p.evaluate(() => SK.G.player._bomb.list.length);
      check('telecontrolled_bomb: hết quả dính thì ném quả đang quay ra nổ ngay', left === n - 2, 'còn ' + left + ' quả');
      await until(p, () => SK.G.player.skillT <= 0, null, 6000);
      await sleep(150);
      const e = await snap(p);
      check('telecontrolled_bomb: hết thời lượng nổ cả loạt, hồi chiêu ' + r.cd + ' s [ĐO]', await p.evaluate(() => !SK.G.player._bomb) && near(e.skillCd, r.cd, 0.5), 'skillCd ' + e.skillCd.toFixed(2));
    },
    async 'trapmaster/1'(p) {
      const r = await real(p, 'trapmaster', 'master_s_trick');
      const st = await ctrl(p, 'initStealthDuration'), ex = await ctrl(p, 'initExplodeDamage'), en = await ctrl(p, 'initAbsorbEnergyNum');
      await standNear(p, 55);
      await p.evaluate(() => { SK.G.player.energy = 50; });
      await pressK(p); await sleep(200);
      const a = await snap(p);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      check('master_s_trick: tàng hình + bất tử ' + st + ' s [ĐO initStealthDuration], chạy x1,333 [WIKI], dur ' + r.dur + ' s', a.hidden && imm === false && near(a.move, 4 / 3, 0.01) && near(a.skillT, r.dur - 0.2, 0.4), 'hidden ' + a.hidden + ' · move ' + a.move.toFixed(3));
      await sleep(1900);
      await seq(p, 'trapmaster_1', 6, 90);
      await sleep(600);
      const b = await snap(p);
      const hooks = hitsOf(b, 'skill');
      check('master_s_trick: móc kéo quái, mỗi lần 2 sát thương [ĐO hookData.damage] và hồi ' + en + ' năng lượng [ĐO initAbsorbEnergyNum]', hooks.length >= 1 && hooks.every(x => x === 2) && b.en >= 50 + en, 'móc ' + hooks.join(',') + ' · năng lượng ' + b.en);
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
      const loft = 10, lim = 5, pd = 1, boom = 5;   // C26Skill3Ctrl initLoftDamage / initPigeonNumLimit / initPigeonDamage / initPigeonExplodeDamage [ĐO common.ab]
      await standNear(p, 50);
      await pressK(p); await sleep(250);
      // Giữ nút: bồ câu lao vào quái (trước khi nón kịp hạ quái).
      await p.keyboard.down('KeyK'); await sleep(650);
      const c = await snap(p);
      await p.keyboard.up('KeyK');
      const pk = hitsOf(c, 'pigeon');
      check('hat_trick: giữ nút thì bồ câu lao vào quái, mỗi cú mổ ' + pd + ' [ĐO initPigeonDamage]', pk.length >= 1 && pk.every(x => x === pd), 'đòn ' + pk.join(','));
      await sleep(200);
      const a = await snap(p);
      const pg = await p.evaluate(() => SK.G.player._hat.pigeons.length);
      await seq(p, 'trapmaster_2', 6, 120);
      check('hat_trick: ' + lim + ' bồ câu bay quanh người [ĐO initPigeonNumLimit], thời lượng ' + r.dur + ' s [ĐO]', pg === lim && a.skillT > 3, pg + ' con · skillT ' + a.skillT.toFixed(2));
      // Chặn đạn.
      await p.evaluate(() => { const G = SK.G, pl = G.player; G.bullets.push({ side: 'e', kind: 'orb', x: pl.x + 30, y: pl.y - 12, h: 8, vx: -60, vy: 0, ang: Math.PI, dmg: 2, repel: 0, r: 3, life: 3, _probe: 1 }); });
      await sleep(700);
      const blocked = await p.evaluate(() => { const b = SK.G.bullets.find(x => x._probe); return !b || b.dead; });
      const pg2 = await p.evaluate(() => SK.G.player._hat ? SK.G.player._hat.pigeons.length : 0);
      check('hat_trick: bồ câu chặn đạn địch (chim đỡ đạn thì nổ)', blocked, 'đạn ' + (blocked ? 'bị chặn' : 'lọt') + ' · còn ' + pg2 + ' chim');
      await sleep(1300);
      const b = await snap(p);
      const hat = hitsOf(b, 'hat');
      check('hat_trick: nón chạm đất gây ' + loft + ' mỗi 0,5 s trong 2 s [ĐO initLoftDamage, WIKI], tổng 40', hat.length >= 3 && hat.every(x => x === loft), 'đòn ' + hat.join(','));
      await until(p, () => SK.G.player.skillT <= 0, null, 6000);
      await sleep(150);
      const e = await snap(p);
      check('hat_trick: hết ' + r.dur + ' s bồ câu nổ (' + boom + ' mỗi quả), hồi chiêu ' + r.cd + ' s [ĐO]', near(e.skillCd, r.cd, 0.5) && await p.evaluate(() => !SK.G.player._hat), 'skillCd ' + e.skillCd.toFixed(2));
    }
  };
};
