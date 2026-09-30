// Ca kiểm Kẻ Vượt Ranh Giới (c17): ô 0 dimension_jumping, ô 1 blackhole_refract_blackhole_burst.
// Đòn lên quái là đòn thật (giữ phím J), quái không bị đổi máu; chỉ dựng thế đứng (đặt quái, đặt khe nứt) rồi để mã tự chạy.
module.exports = h => {
  const pressL = async p => { await p.keyboard.down('KeyL'); await h.sleep(40); await p.keyboard.up('KeyL'); };
  const fireFor = async (p, ms) => { await p.keyboard.down('KeyJ'); await h.sleep(ms); await p.keyboard.up('KeyJ'); };
  return {
    async 'transcendent/0'(p) {
      const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
      const r = await real(p, 'transcendent', 'dimension_jumping');
      const DJ = await p.evaluate(() => SK.SKILLS.dimension_jumping.DJ);
      await standNear(p, 60);
      await pressK(p); await sleep(150);
      const s = await snap(p);
      const imm = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return SK.hurtPlayer(SK.G, 3); });
      check('transcendent dimension_jumping: cd ' + r.cd + ' s, dịch chuyển ' + r.dur + ' s [ĐO config], speed_rate 1 + 0,45 [ĐO addMoveSpeedSkill], không bị thương',
        s.cd === 8 && near(s.skillT, 3 - 0.15, 0.4) && near(s.move, 1.45, 0.01) && imm === false, 'skillT ' + s.skillT.toFixed(2) + ' · move ' + s.move + ' · hurt ' + imm);
      // Xuyên địa hình: tìm ô trống có tường bên phải, đứng sát tường rồi giữ phím phải.
      const wall = await p.evaluate(() => {
        const G = SK.G, W = SK.world, pl = G.player, T = 16;
        for (let ty = 3; ty < G.map.H - 3; ty++) for (let tx = 3; tx < G.map.W - 4; tx++) {
          const x = tx * T + 8, y = ty * T + 12;
          if (!W.solidAt(G.map, x, y) && W.solidAt(G.map, x + 12, y) && W.solidAt(G.map, x + 12, y - 4)) { pl.x = x + 3; pl.y = y; pl._dj.lx = pl.x; pl._dj.ly = pl.y; return [x, y]; }
        }
        return null;
      });
      await p.keyboard.down('KeyD'); await sleep(250); await p.keyboard.up('KeyD');
      const px = await p.evaluate(() => SK.G.player.x);
      check('transcendent dimension_jumping: đi xuyên tường', wall && px > wall[0] + 12, 'x ' + (wall && wall[0]) + ' -> ' + px.toFixed(1));
      // Đánh dấu: quái chạm vòng bán kính 1,05 ô quanh người thì có đếm ngược 8 s.
      await standNear(p, 60);
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl._dj.lx = pl.x; pl._dj.ly = pl.y; const es = G.enemies.filter(q => q.st !== 'dead' && q.st !== 'spawn').sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
        es[0]._A = 1; es[1]._B = 1; es[2]._C = 1;
        for (const e of es.slice(0, 3)) { e.st = 'idle'; e.stT = 99; e.cd = 99; }
        es[0].x = pl.x + 30; es[0].y = pl.y;   // A: gần khe, ngoài vòng chạm 1,05 ô để chờ đánh dấu bằng sóng
        es[1].x = pl.x - 90; es[1].y = pl.y;   // B: xa khe
        es[2].x = pl.x; es[2].y = pl.y;        // C: chạm người
      });
      await sleep(200);
      const m = await p.evaluate(() => { const e = SK.G.enemies.find(q => q._C); return e && e._mark ? e._mark.t : null; });
      check('transcendent dimension_jumping: chạm quái đánh dấu, đếm ngược 8 s [ĐO delayDeadTime]', m != null && m <= 8 && m > 7.4, 'còn ' + m);
      // Khe nứt thật đặt sát người: chạm thì +5 năng lượng, +0,85 s, tăng tốc cộng 0,75, rút 1 s mọi đếm ngược, sóng bán kính 3,2 ô.
      await p.evaluate(() => { const G = SK.G, pl = G.player; pl.energy = 0; const B = G.enemies.find(q => q._B); SK.SKILLS.dimension_jumping.mark(G, B); B._mark.t = 8;
        const A = G.enemies.find(q => q._A); A._mark = null;
        window._t0 = pl.skillT; SK.SKILLS.dimension_jumping.spawnCrack(G, pl.x + 2, pl.y); });
      await sleep(90);
      const c = await p.evaluate(() => { const G = SK.G, pl = G.player, e = k => G.enemies.find(q => q[k]); return { t: pl.skillT, en: pl.energy, added: pl._dj && pl._dj.added, move: pl.moveMul, A: e('_A')._mark && e('_A')._mark.t, B: e('_B')._mark && e('_B')._mark.t, C: e('_C')._mark && e('_C')._mark.t }; });
      await seq(p, 'transcendent_0', 6, 60);
      check('transcendent dimension_jumping: qua khe +' + DJ.energy + ' năng lượng [ĐO recoverEnergy], +0,85 s [ĐO addSkillTime]', c.en === 5 && c.added === 1 && c.t > 3.0 - 0.6, JSON.stringify(c));
      check('transcendent dimension_jumping: tăng tốc cộng: speed_rate 1 + 0,45 + 0,75 = 2,2 [ĐO addMoveSpeedSkill, addMoveSpeedRate]', near(c.move, 2.2, 0.08), 'moveMul ' + c.move);
      check('transcendent dimension_jumping: sóng 3,2 ô đánh dấu quái chưa dính (8 s) [ĐO C18CrackExplode 4 × 0,8]; quái dính ngoài sóng mất 1 s, trong sóng mất 2 s [ĐO ReduceBuffRestTime −1]',
        c.A != null && near(c.A, 7.9, 0.3) && c.B != null && near(c.B, 6.9, 0.3) && c.C != null && near(c.C, 5.7, 0.35), 'A ' + c.A + ' · B ' + c.B + ' · C ' + c.C);
      // Hết đếm ngược: quái thường nhận 99999 [ĐO BuffDelayDead.BuffEnd].
      await until(p, () => SK.G.enemies.some(q => q._C && q.st === 'dead'), null, 9000);
      const d = await snap(p);
      check('transcendent dimension_jumping: hết đếm ngược quái thường nhận 99999 [ĐO BuffDelayDead.BuffEnd 0x1869F]', hitsOf(d, 'mark').indexOf(99999) >= 0, 'đòn ' + hitsOf(d, 'mark').join(','));
      // Trùm thật (2-5): đòn thật của người chơi được đếm từ đòn đầu; hết đếm ngược nhận 80 + 10 × chương rồi thêm đúng số đòn.
      const ch = await p.evaluate(() => { SK_GAME.debug.stage('2-5'); return SK.G.stage.level; });
      await until(p, () => SK.G.state === 'stage' && SK.G.stage && SK.G.stage.label === '2-5', null, 4000);
      await p.evaluate(() => { SK_GAME.debug.teleportTo('boss'); });
      const inBoss = await until(p, () => SK.G.enemies.some(e => e.bossKey && e.st !== 'spawn' && e.st !== 'dead'), null, 8000);
      await p.evaluate(() => { const pl = SK.G.player; pl.skillT = 0; SK.endSkill(SK.G, pl); pl.skillCd = 0; pl.energy = pl.energyMax; window._skHits = []; });
      await pressK(p); await sleep(100);
      await p.evaluate(() => { const G = SK.G, pl = G.player, b = G.enemies.find(e => e.bossKey && e.st !== 'dead'); pl.x = b.x + 20; pl.y = b.y + 4; pl._dj.lx = pl.x; pl._dj.ly = pl.y; pl.aim = Math.atan2(b.y - pl.y, b.x - pl.x); });
      await sleep(250);
      const marked = await p.evaluate(() => { const b = SK.G.enemies.find(e => e.bossKey); return !!(b && b._mark); });
      await p.evaluate(() => { window._skHits = []; });
      await p.evaluate(() => { const G = SK.G, pl = G.player, b = G.enemies.find(e => e.bossKey && e.st !== 'dead'); pl.x = b.x - 40; pl.y = b.y; pl.face = 1; pl.aim = 0; });
      await fireFor(p, 1200);
      const cnt = await p.evaluate(() => { const b = SK.G.enemies.find(e => e.bossKey); return { hits: b._hits || 0, weapon: (window._skHits || []).filter(x => x[1] === 'weapon').length, t: b._mark && b._mark.t }; });
      await until(p, () => { const b = SK.G.enemies.find(e => e.bossKey); return !b._mark || b.st === 'dead'; }, null, 10000);
      const bb = await snap(p);
      check('transcendent dimension_jumping: trùm bị đánh dấu khi chạm và đếm đòn thật từ đòn đầu (' + cnt.weapon + ' đòn → ' + cnt.hits + ') [ĐO OnPlayerBulletHitEnemyEvent]', inBoss && marked && cnt.weapon > 0 && cnt.hits === cnt.weapon, JSON.stringify(cnt));
      check('transcendent dimension_jumping: hết đếm ngược trùm nhận 80 + 10 × chương ' + ch + ' = ' + (80 + 10 * ch) + ', rồi thêm đúng số đòn đã đếm [ĐO BuffDelayDead ctor, AddHurtBoss]',
        hitsOf(bb, 'mark').indexOf(80 + 10 * ch) >= 0 && hitsOf(bb, 'mark_hits').indexOf(cnt.hits) >= 0, 'nền ' + hitsOf(bb, 'mark').join(',') + ' · đòn ' + hitsOf(bb, 'mark_hits').join(','));
    },
    async 'transcendent/1'(p) {
      const { check, sleep, near, standNear, snap, pressK, seq, real, hitsOf, until } = h;
      const r = await real(p, 'transcendent', 'blackhole_refract_blackhole_burst');
      const BH = await p.evaluate(() => SK.SKILLS.blackhole_refract_blackhole_burst.BH);
      await standNear(p, 60);
      await pressK(p); await sleep(150);
      const s = await snap(p);
      const st = await p.evaluate(() => { const pl = SK.G.player, r = (SK.G._rifts || [])[0]; return { rifts: (SK.G._rifts || []).length, hidden: pl.hidden, ahead: r ? Math.hypot(r.x - pl.x, r.y - (pl.y - 12.8)) : -1, chargeCd: pl._ch && pl._ch.cd, ult: pl._ultReady }; });
      check('transcendent blackhole_refract: cd 5 s, 3 lượt [ĐO config], đặt 1 hố cách 0,75 ô, tàng hình 1 s [ĐO skill2ShuttleDuration]',
        s.cd === 5 && s.ch && s.ch.max === 3 && s.ch.n === 2 && st.rifts === 1 && st.hidden && near(s.skillT, 1 - 0.15, 0.4) && near(st.ahead, 12, 3), JSON.stringify(s.ch) + ' · hố ' + st.rifts + ' · cách ' + st.ahead.toFixed(1) + ' · skillT ' + s.skillT.toFixed(2));
      check('transcendent blackhole_refract: mỗi lượt hồi 6 s [ĐO skill2RiftChargeCooldown], nút L sáng khi có hố [ĐO btn_special]', st.chargeCd === 6 && st.ult === true, 'cd lượt ' + st.chargeCd + ' · ult ' + st.ult);
      const rate = await p.evaluate(() => { const pl = SK.G.player; let z = 0; for (let i = 0; i < 600; i++) if (pl._hurt.bh(SK.G, pl, 3) === 0) z++; return z / 600; });
      check('transcendent blackhole_refract: tàng hình tránh 50% sát thương [ĐO shuttleHurtRate 50]', near(rate, 0.5, 0.08), 'tránh ' + rate.toFixed(2));
      // Bấm K lúc đang tàng hình đặt thêm hố (còn lượt), không nổ.
      await sleep(150); await pressK(p); await sleep(150);
      const n2 = await p.evaluate(() => ({ rifts: (SK.G._rifts || []).length, bursting: SK.G.player._bh && SK.G.player._bh.mode }));
      check('transcendent blackhole_refract: K lúc đang tàng hình đặt hố thứ hai, không Bùng Nổ (Bùng Nổ ở nút L)', n2.rifts === 2 && n2.bursting === 'stealth', JSON.stringify(n2));
      await until(p, () => SK.G.player.skillT <= 0, null, 3000);
      // Đạn thật: chọn súng đạn thường sát thương 8–14 để hệ số 0,8 lộ ra, bắn theo hướng đặt hố; đạn qua hố thì hố kia sinh bản sao.
      await standNear(p, 70);
      const gun = await p.evaluate(() => { const id = 'weapon_205'; if (SK.DS.weapons[id]) SK_GAME.debug.give(id); return SK.DS.weapons[id] ? id : null; });   // súng ném 1 viên, sát thương 11, ra đạn sau ~1 s
      const gdmg = await p.evaluate(g => (g ? window.SK_W86.weapons[g].b[0].dmg : 0), gun);
      await p.evaluate(() => { const G = SK.G, pl = G.player; for (const r of (G._rifts || [])) { r.gone = true; if (r.h && r.h.stop) r.h.stop(); } G._rifts = []; pl._ch.n = 3; pl.skillCd = 0; pl._cdAfter = null; pl.energy = pl.energyMax; const e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); pl.aim = Math.atan2(e.y - pl.y, e.x - pl.x); });
      await pressK(p); await sleep(60);
      await p.evaluate(() => { const pl = SK.G.player; pl.skillT = 0; SK.endSkill(SK.G, pl); pl.skillCd = 0; });
      await sleep(80); await pressK(p); await sleep(60);
      await p.evaluate(() => { const G = SK.G, pl = G.player, rf = G._rifts; pl.aim = Math.atan2(rf[0].y - (pl.y - 7), rf[0].x - pl.x); pl.face = Math.cos(pl.aim) > 0 ? 1 : -1; });
      await p.keyboard.down('KeyJ');
      const cloned = await p.evaluate(async () => {
        const G = SK.G;
        for (let i = 0; i < 90; i++) {
          await new Promise(r => setTimeout(r, 20));
          const bs = G.bullets.filter(b => b.side === 'p'), cl = bs.filter(b => b._rc);
          if (cl.length) {
            // hướng bản sao so với hướng tới quái gần nhất từ hố phát ra
            const K = SK.skillKit, c = cl[0], rf = G._rifts.map(r => { const e = K.nearest(G, r.x, r.y, 14 * 16), ec = K.ec(e); return Math.abs(Math.atan2(c.vy, c.vx) - Math.atan2(ec[1] - r.y, ec[0] - r.x)); });
            return { orig: bs.filter(b => !b._rc).map(b => b.dmg)[0], cl: cl.map(b => b.dmg), aimErr: Math.min(...rf) };
          }
        }
        return null;
      });
      await p.keyboard.up('KeyJ');
      const shotgun = await p.evaluate(() => { const w = SK.G.player.weapons[SK.G.player.cur], d = w.def; return (d.pellets || 1) > 1 || !!(d.w86 && d.w86.x && d.w86.x.multiCount > 1); });
      const rc = await p.evaluate(() => (SK.G._rifts || []).length), cmul = await p.evaluate(() => SK.DS.rules.critMult);
      check('transcendent blackhole_refract: 2 hố, đạn thật (' + gun + ', sát thương ' + gdmg + ') qua hố có bản sao ở hố kia, sát thương ceil(' + gdmg + ' × 0,8) = ' + Math.ceil(gdmg * 0.8) + ', ngắm vào quái gần nhất [ĐO skill2DamageDecayPerExtraRift, GetSkill2ReflectAngle]',
        rc === 2 && cloned && [gdmg, gdmg * cmul].indexOf(cloned.orig) >= 0 && cloned.cl.every(d => d === Math.ceil(cloned.orig * 0.8)) && cloned.aimErr < (shotgun ? 30 * Math.PI / 180 + 0.02 : 0.12), JSON.stringify(cloned) + (shotgun ? ' · shotgun ±30°' : ''));
      // Bùng Nổ ở nút L: hai hố sát một quái để cả hai cùng trúng.
      await standNear(p, 60);
      await p.evaluate(() => {
        const G = SK.G, rf = G._rifts, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'), pl = G.player;
        pl.energy = 0; window._skHits = [];
        rf[0].x = e.x - 20; rf[0].y = e.y; rf[1].x = e.x + 20; rf[1].y = e.y;
      });
      await pressL(p); await sleep(300);
      const b = await snap(p);
      const post = await p.evaluate(() => { const pl = SK.G.player; pl.invulT = 0; return { rifts: (SK.G._rifts || []).length, hurt: SK.hurtPlayer(SK.G, 3) }; });
      await seq(p, 'transcendent_1', 6, 60);
      check('transcendent blackhole_burst (nút L): mỗi hố nổ ' + BH.dmg + ' [ĐO skill2ExplodeDamage], +' + BH.energy + ' năng lượng mỗi hố [ĐO skill2EnergyRestorePerRift]',
        post.rifts === 0 && hitsOf(b, 'rift_burst').length >= 2 && hitsOf(b, 'rift_burst').every(d => d === 20) && b.en >= 20 && b.en <= 24, 'nổ ' + hitsOf(b, 'rift_burst').join(',') + ' · năng lượng ' + b.en);
      check('transcendent blackhole_burst: tăng tốc cộng 0,3 (moveMul 1,3) [ĐO skill2BurstSpeedRate], vô địch ' + BH.dur + ' s [ĐO skill2BurstDuration]',
        near(b.move, 1.3, 0.01) && near(b.skillT, 3 - 0.3, 0.5) && post.hurt === false, 'move ' + b.move + ' · skillT ' + b.skillT.toFixed(2) + ' · hurt ' + post.hurt);
      const bl = await p.evaluate(() => new Promise(res => { const pl = SK.G.player; const id = setInterval(() => { if (!(pl.skillT > 0)) { clearInterval(id); res({ cd: pl._bhCd }); } }, 30); }));
      check('transcendent blackhole_burst: hồi chiêu Bùng Nổ ' + BH.cd + ' s tính từ lúc Bùng Nổ kết thúc [ĐO skill2BurstCooldown]', near(bl.cd, 8, 0.3), 'còn ' + bl.cd);
      await pressL(p); await sleep(100);
      const again = await p.evaluate(() => ({ mode: SK.G.player._bh && SK.G.player._bh.mode, skillT: SK.G.player.skillT }));
      check('transcendent blackhole_burst: hết hố / đang hồi chiêu thì L không nổ', !again.mode && !(again.skillT > 0), JSON.stringify(again));
      // Tia laser thật: vào phòng mới (quái còn sống), đặt hai hố, bắn tia qua hố thì hố kia phóng thêm tia, sát thương ceil(gốc × 0,8).
      await p.evaluate(() => { SK_GAME.debug.seed(20260930); SK.setSkillSlot('transcendent', 1); SK.startRun('transcendent'); SK_GAME.debug.god(true); });
      await until(p, () => SK_GAME.state === 'stage', null, 3000);
      await p.evaluate(() => SK_GAME.debug.teleportTo('battle'));
      await until(p, () => SK_GAME.room != null && SK_GAME.rooms[SK_GAME.room].state === 'locked' && SK.G.enemies.some(e => e.st !== 'spawn' && e.st !== 'dead'), null, 5000);
      await sleep(250); await standNear(p, 70);
      const laser = await p.evaluate(() => { const X = window.SK_W86; const id = Object.keys(X.weapons).find(k => SK.DS.weapons[k] && X.weapons[k].b.some(b => b.p && X.bullets[b.p] && X.bullets[b.p].mv === 'RGShortLaser') && X.weapons[k].fam !== 'charge'); if (!id) return null; SK_GAME.debug.give(id); const G = SK.G, pl = G.player; pl.energy = pl.energyMax; const e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); pl.aim = Math.atan2(e.y - pl.y, e.x - pl.x); return id; });
      await pressK(p); await sleep(60);
      await p.evaluate(() => { const pl = SK.G.player; pl.skillT = 0; SK.endSkill(SK.G, pl); pl.skillCd = 0; });
      await sleep(80); await pressK(p); await sleep(60);
      await p.evaluate(() => { const G = SK.G, pl = G.player, rf = G._rifts; pl.aim = Math.atan2(rf[0].y - (pl.y - 7), rf[0].x - pl.x); pl.face = Math.cos(pl.aim) > 0 ? 1 : -1; window._skHits = []; });
      await fireFor(p, 200);
      const lh = await snap(p);
      const cm = await p.evaluate(() => SK.DS.rules.critMult);
      check('transcendent blackhole_refract: tia laser thật (' + laser + ') qua hố thì hố kia phóng tia sao chép, sát thương ceil(gốc × 0,8) [ĐO TrySkill2ReflectLaser, GetSkill2ReflectDamageFactor]',
        hitsOf(lh, 'rift_laser').length >= 1 && hitsOf(lh, 'weapon').length >= 1 && hitsOf(lh, 'rift_laser').every(d => d === Math.ceil(Math.min(...hitsOf(lh, 'weapon')) * 0.8) || d === Math.ceil(Math.min(...hitsOf(lh, 'weapon')) * cm * 0.8)),
        'gốc ' + hitsOf(lh, 'weapon').slice(0, 4).join(',') + ' · sao chép ' + hitsOf(lh, 'rift_laser').slice(0, 4).join(','));
    }
  };
};
