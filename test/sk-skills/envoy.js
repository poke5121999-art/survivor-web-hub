// Ca kiểm Sứ Giả (c19): elemental_affinity. Bấm K thật với hướng giữ để chọn nguyên tố (↑ lửa, → băng, ↓ độc, ← sét), đòn vũ khí là đòn thật
// (giữ J); quái không bị đổi máu. Mỗi nguyên tố chạy trong một trận mới để quái còn đủ. Phản ứng nguyên tố gắn buff qua S.elemental_affinity.buff.
module.exports = h => {
  const KEYS = { fire: 'ArrowUp', ice: 'ArrowRight', poison: 'ArrowDown', lightning: 'ArrowLeft' };
  const fresh = async p => {
    await p.evaluate(() => { SK_GAME.debug.seed(20260930); SK.setSkillSlot('envoy', 0); SK.startRun('envoy'); SK_GAME.debug.god(true); SK_GAME.debug.pet(false); });
    await h.until(p, () => SK_GAME.state === 'stage', null, 3000);
    // Bộ quái mẫu cố định như enterBattle của bộ kiểm chính.
    await p.evaluate(() => { const G = SK.G, base = G.buildWaves; G.buildWaves = r => r.type === 'battle' ? [['e_boar02', 'e_fire_sacrifice', 'e_orc01', 'e_boar01']] : base(r); SK_GAME.debug.teleportTo('battle'); });
    await h.until(p, () => SK_GAME.room != null && SK_GAME.rooms[SK_GAME.room].state === 'locked' && SK.G.enemies.filter(e => e.st !== 'spawn' && e.st !== 'dead').length >= 3, null, 5000);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 900; });   // quái trâu: lửa/cháy của các ca trước không giết hết quái
    await h.sleep(250); await h.resetDmg(p);
  };
  const cast = async (p, kind) => {
    await p.keyboard.down(KEYS[kind]); await p.keyboard.down('KeyK'); await h.sleep(40); await p.keyboard.up('KeyK'); await p.keyboard.up(KEYS[kind]);
  };
  const fireFor = async (p, ms) => { await p.keyboard.down('KeyJ'); await h.sleep(ms); await p.keyboard.up('KeyJ'); };
  return {
    async 'envoy/0'(p) {
      const { check, sleep, near, standNear, snap, seq, real, hitsOf, resetDmg } = h;
      const r = await real(p, 'envoy', 'elemental_affinity');
      const EL = await p.evaluate(() => SK.SKILLS.elemental_affinity.EL);
      const crit = await p.evaluate(() => SK.DS.rules.critMult);
      const kindOf = () => p.evaluate(() => SK.G.player._env && SK.G.player._env.kind);

      // ---- lửa
      await fresh(p); await standNear(p, 60);
      await cast(p, 'fire'); await sleep(150);
      const s0 = await snap(p);
      check('envoy elemental_affinity: cd ' + r.cd + ' s, duy trì ' + r.dur + ' s, ' + r.max + ' lượt [ĐO config], kéo hướng lên chọn lửa',
        s0.cd === r.cd && near(s0.skillT, r.dur - 0.15, 0.4) && s0.ch && s0.ch.max === r.max && s0.ch.n === r.max - 1 && await kindOf() === 'fire', 'cd ' + s0.cd + ' · skillT ' + s0.skillT.toFixed(2) + ' · lượt ' + JSON.stringify(s0.ch));
      await seq(p, 'envoy_0', 6, 60); await sleep(1400);
      const f = await snap(p);
      check('envoy elemental_affinity: lửa toả ' + EL.fire.count + ' quả tốc ' + EL.fire.speed / 16 + ', mỗi quả trúng nhận ' + EL.fire.first + ' + cháy ' + EL.fire.dot + '/' + EL.fire.every + ' s, nhảy tối đa ' + EL.fire.jumps + ' lần [ĐO CreateAroundFireBall, EnvoyFireBall, fireInfo]',
        EL.fire.count === 12 && EL.fire.speed === 15 * 16 && EL.fire.jumps === 2 && EL.fire.first === 6 && hitsOf(f, 'fireball').length >= 1 && hitsOf(f, 'fireball').every(d => d === 6) && f.dbEver.indexOf('fire') >= 0 && hitsOf(f, 'dot').length >= 1 && hitsOf(f, 'dot').every(d => d === 2),
        'cầu ' + hitsOf(f, 'fireball').join(',') + ' · dot ' + hitsOf(f, 'dot').join(',') + ' · db ' + f.dbEver.join(','));
      // Đòn vũ khí thật lúc đang duy trì: cứ 0,2 s một quả bay từ người tới quái vừa trúng.
      await standNear(p, 60);   // phím ↑ chọn nguyên tố làm người trôi vài px theo độ trễ khung: dựng lại thế đứng thẳng hàng trước khi bắn
      await resetDmg(p); await fireFor(p, 500); await sleep(600);
      const fw = await snap(p);
      check('envoy elemental_affinity: đòn vũ khí trúng thì quái cháy và một cầu lửa ' + EL.fire.first + ' bay tới (cách ≥ ' + EL.fire.gap + ' s) [ĐO OnPlayerBulletHitEnemyHandler, fireBulletInterval]',
        hitsOf(fw, 'weapon').length >= 1 && fw.dbEver.indexOf('fire') >= 0 && hitsOf(fw, 'fireball').length <= 1 + Math.ceil(0.5 / EL.fire.gap) * 3 && hitsOf(fw, 'fireball').every(d => d === 6), 'vũ khí ' + hitsOf(fw, 'weapon').length + ' · cầu ' + hitsOf(fw, 'fireball').join(','));

      // ---- băng
      await fresh(p); await standNear(p, 60);
      await cast(p, 'ice'); const ik = await kindOf();
      const mx = await p.evaluate(() => new Promise(res => { const t00 = performance.now(); let m = 0; const tick = () => { m = Math.max(m, SK.G.vfx.filter(v => v.name === 'bullet_envoy_snowball').length); if (performance.now() - t00 > 1700) return res(m); setTimeout(tick, 10); }; tick(); }));
      const ic = await snap(p);
      const ok10 = d => d === 10 || d === 10 * crit, ok7 = d => d === 7 || d === 7 * crit;
      check('envoy elemental_affinity: băng bắn quả to ' + EL.ice.balls[0].damage + ' (tốc ' + EL.ice.balls[0].speed + '), trúng nở ' + EL.ice.min + '-' + EL.ice.max + ' quả ' + EL.ice.balls[1].damage + ' [ĐO CreateBigIceBullet, iceBalls]; quái trúng bị đóng băng',
        ik === 'ice' && hitsOf(ic, 'snowball0').length >= 1 && hitsOf(ic, 'snowball0').every(ok10) && hitsOf(ic, 'snowball1').every(ok7) && mx >= 1 + EL.ice.min && (ic.dbEver.indexOf('ice') >= 0 || ic.db.indexOf('ice') >= 0),
        'quả cùng lúc tối đa ' + mx + ' · to ' + hitsOf(ic, 'snowball0').join(',') + ' · vừa ' + hitsOf(ic, 'snowball1').join(',') + ' · nhỏ ' + hitsOf(ic, 'snowball2').join(',') + ' · ' + ic.dbEver.join(','));

      // ---- độc
      await fresh(p); await standNear(p, 60);
      await cast(p, 'poison');
      const first = await p.evaluate(() => new Promise(res => {
        const G = SK.G, t00 = performance.now(), t0 = G.player._env.t0, early = [];
        const tick = () => {
          const n = G.enemies.filter(e => e._envP > 0).length;
          if (G.t - t0 > 0.4 && early.length === 0) early.push(n);
          if (n > 0 || performance.now() - t00 > 3000) return res({ dt: G.t - t0, n, early: early[0] });
          setTimeout(tick, 4);
        };
        tick();
      }));
      check('envoy elemental_affinity: độc cần ở trong bán kính ' + EL.poison.r / 16 + ' ô đủ ' + EL.poison.fill + ' s mới nhiễm (quét ' + EL.poison.check + ' s): nhiễm sau ' + first.dt.toFixed(2) + ' s, lúc 0,4 s có ' + first.early + ' quái [ĐO EnvoyPoisonBuffProgress, BuffEnvoyPoisonFog]',
        EL.poison.fill === 0.8 && first.early === 0 && first.dt >= 0.79 && first.dt <= 1.05, 'dt ' + first.dt.toFixed(3) + ' · sớm ' + first.early);
      await sleep(2200);
      const ps = await snap(p);
      const cnt = await p.evaluate(() => SK.G.enemies.filter(e => e._envP > 0).length);
      check('envoy elemental_affinity: độc ' + EL.poison.dot + ' sát thương mỗi ' + EL.poison.every + ' s trong ' + EL.poison.buff + ' s [ĐO poisonInfo], quái nhiễm lan tiếp cho quái đứng gần (đang có ' + cnt + ' quái nhiễm)',
        hitsOf(ps, 'dot').length >= 3 && hitsOf(ps, 'dot').every(d => d === 1) && ps.dbEver.indexOf('poison') >= 0, 'dot ' + hitsOf(ps, 'dot').slice(0, 6).join(',') + ' · ' + hitsOf(ps, 'dot').length);

      // ---- sét
      await fresh(p); await standNear(p, 60);
      await cast(p, 'lightning'); await sleep(250);
      const ls = await snap(p);
      check('envoy elemental_affinity: sét nhảy ≤ ' + EL.lightning.n + ' quái, mỗi nhát ' + EL.lightning.dmg + ' [ĐO lightningDamage, lightningCount]',
        hitsOf(ls, 'activate').length >= 1 && hitsOf(ls, 'activate').length <= EL.lightning.n && hitsOf(ls, 'activate').every(d => d === 2), 'nhát ' + hitsOf(ls, 'activate').join(','));
      // Quái yếu có thể chết ngay trong nhát đầu (buff mất theo): bắn lại tối đa 4 loạt ngắn tới khi có quái mang buff sét.
      await resetDmg(p);
      for (let i = 0; i < 4; i++) {
        await standNear(p, 50); await fireFor(p, 150); await sleep(200);
        if (await p.evaluate(() => SK.G.enemies.some(e => e._envL > 0))) break;
      }
      await sleep(1200);
      const lz = await snap(p);
      const lst = await p.evaluate(() => ({ kind: SK.G.player._env && SK.G.player._env.kind, skillT: SK.G.player.skillT, L: SK.G.enemies.filter(e => e._envL > 0).length, alive: SK.G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn').length }));
      check('envoy elemental_affinity: quái bị đòn vũ khí mang buff sét, cứ ' + EL.lightning.gap + ' s giật quái quanh nó 3 sát thương [ĐO buff_envoy_lightning atk 3, cooling_time 0,4]',
        hitsOf(lz, 'zap').length >= 1 && hitsOf(lz, 'zap').every(d => d === 3), JSON.stringify(lst) + ' · vũ khí ' + hitsOf(lz, 'weapon').length + ' · zap ' + hitsOf(lz, 'zap').join(','));

      // ---- phản ứng: lửa gặp độc / sét / băng
      await fresh(p);
      const rx = await p.evaluate(async () => {
        const G = SK.G, pl = G.player, B = SK.SKILLS.elemental_affinity.buff, out = {};
        const es = G.enemies.filter(e => e.st !== 'dead' && e.st !== 'spawn');
        for (const e of es) { e.st = 'idle'; e.stT = 99; e.cd = 99; }
        const [a, b, c] = es;
        window._skHits = [];
        B(G, pl, a, 'fire'); out.fireA = !!(a._db && a._db.fire); B(G, pl, a, 'poison'); out.fireGoneA = !(a._db && a._db.fire);
        B(G, pl, b, 'fire'); B(G, pl, b, 'lightning'); out.n0 = window._skHits.filter(x => x[1] === 'react_lightning').length;
        B(G, pl, c, 'ice'); B(G, pl, c, 'fire');
        await new Promise(r => setTimeout(r, 300));
        out.slowC = c.moveMul;
        return out;
      });
      await sleep(1100);
      const rs = await snap(p);
      check('envoy elemental_affinity: lửa + độc nổ ' + EL.combo.poison.dmg + ' cỡ ' + EL.combo.poison.size + ' và tiêu buff lửa [ĐO BuffEnvoyFire.PoisonCombine, poisonCombineDamage 8]',
        rx.fireA && rx.fireGoneA && hitsOf(rs, 'react_poison').length >= 1 && hitsOf(rs, 'react_poison').every(d => d === 8), 'nổ ' + hitsOf(rs, 'react_poison').join(','));
      check('envoy elemental_affinity: lửa + sét giáng ' + EL.combo.lightning.dmg + ' sau ' + EL.combo.lightning.delay + ' s (chưa có lúc đầu) [ĐO BulletEnvoyLightning bulletsInfo[0], delayTime 1]',
        rx.n0 === 0 && hitsOf(rs, 'react_lightning').length >= 1 && hitsOf(rs, 'react_lightning').every(d => d === 12 || d === 12 * crit), 'sét ' + hitsOf(rs, 'react_lightning').join(','));
      check('envoy elemental_affinity: băng + lửa tạo vùng nước cỡ ' + EL.combo.ice.size + ' sống ' + EL.combo.ice.dur + ' s làm chậm tốc chạy còn ' + EL.combo.ice.slow + ' [ĐO iceCombineSize, iceCombineDuration, water_area]',
        near(rx.slowC, 0.25, 0.001), 'moveMul ' + rx.slowC);
    }
  };
};
