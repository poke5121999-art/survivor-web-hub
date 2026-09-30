// Ca kiểm Sứ Giả (c18): elemental_affinity.
module.exports = h => ({
  async 'envoy/0'(p) {
    const { check, sleep, near, standNear, snap, resetDmg, pressK, seq, real, hitsOf } = h;
    const r = await real(p, 'envoy', 'elemental_affinity');
    const EL = await p.evaluate(() => SK.SKILLS.elemental_affinity.EL);
    await p.evaluate(() => { for (const e of SK.G.enemies) e.hp = e.hpMax = 500; });
    await standNear(p, 60);
    // Lửa: lần bấm đầu (xoay vòng bắt đầu ở lửa)
    await pressK(p); await sleep(150);
    const s = await snap(p);
    const kind = await p.evaluate(() => SK.G.player._env && SK.G.player._env.kind);
    check('envoy elemental_affinity: cd ' + r.cd + ' s, duy trì ' + r.dur + ' s, ' + r.max + ' lượt [ĐO config]', s.cd === r.cd && near(s.skillT, r.dur - 0.15, 0.4) && s.ch && s.ch.max === r.max && s.ch.n === r.max - 1, 'cd ' + s.cd + ' · skillT ' + s.skillT.toFixed(2) + ' · lượt ' + JSON.stringify(s.ch));
    check('envoy elemental_affinity: lửa gây ' + EL.fire.first + ' sát thương + thiêu đốt ' + EL.fire.dot + '/' + EL.fire.every + ' s trong ' + EL.fire.buff + ' s [ĐO fireInfo]',
      kind === 'fire' && hitsOf(s, 'activate').length >= 1 && hitsOf(s, 'activate').every(d => d === EL.fire.first) && s.db.indexOf('fire') >= 0, 'đòn ' + hitsOf(s, 'activate').join(',') + ' · db ' + s.db.join(','));
    await seq(p, 'envoy_0', 6, 60);
    // Băng, độc, sét: kết thúc lượt trước rồi bấm lượt kế theo thứ tự xoay vòng.
    const run = async (idx) => {
      await p.evaluate(i => { const G = SK.G, pl = G.player; SK.endSkill(G, pl); pl._envIdx = i; pl._ch.n = 2; pl.skillCd = 0; window._skDmg = 0; window._skHits = []; window._skDb = {}; for (const e of G.enemies) if (e.st !== 'dead') { e.hp = e.hpMax = 500; e._db = {}; e.st = 'idle'; } }, idx);
      await standNear(p, 60);
      await pressK(p); await sleep(idx === 3 ? 300 : 900);
      return snap(p);
    };
    const ice = await run(1);
    check('envoy elemental_affinity: băng bắn ' + EL.ice.max + ' cầu tuyết, sát thương thuộc {10, 7, 3} [ĐO iceBalls]', hitsOf(ice, 'snowball').length >= 1 && hitsOf(ice, 'snowball').every(d => [10, 7, 3].indexOf(d) >= 0) && ice.db.indexOf('ice') >= 0, 'cầu ' + hitsOf(ice, 'snowball').join(',') + ' · db ' + ice.db.join(','));
    const psn = await run(2);
    check('envoy elemental_affinity: độc bám mọi quái trong ' + EL.poison.r / 16 + ' ô, ' + EL.poison.dot + ' sát thương mỗi ' + EL.poison.every + ' s [ĐO poisonInfo]', psn.dbEver.indexOf('poison') >= 0 && hitsOf(psn, 'dot').length >= 1 && hitsOf(psn, 'dot').every(d => d === EL.poison.dot), 'dot ' + hitsOf(psn, 'dot').slice(0, 4).join(',') + ' · db ' + psn.dbEver.join(','));
    const th = await run(3);
    check('envoy elemental_affinity: sét đánh ' + EL.lightning.n + ' quái, ' + EL.lightning.strike + ' sát thương [ĐO bullet_envoy_lighting]', hitsOf(th, 'activate').length >= 1 && hitsOf(th, 'activate').every(d => d === EL.lightning.strike) && th.db.indexOf('ele') >= 0, 'đòn ' + hitsOf(th, 'activate').join(',') + ' · db ' + th.db.join(','));
    // Đòn vũ khí lúc đang duy trì thì bắn cầu lửa sang quái khác (6 sát thương + thiêu đốt).
    await p.evaluate(() => { const G = SK.G; SK.endSkill(G, G.player); G.player._envIdx = 0; G.player._ch.n = 2; G.player.skillCd = 0; for (const e of G.enemies) if (e.st !== 'dead') { e.hp = e.hpMax = 500; e._db = {}; } });
    await standNear(p, 60); await pressK(p); await sleep(300); await p.evaluate(() => { window._skHits = []; });
    await p.evaluate(() => { const G = SK.G, e = G.enemies.find(q => q.st !== 'dead' && q.st !== 'spawn'); SK.hurtEnemy(G, e, 3, false, 0, 0); });   // đòn vũ khí
    await sleep(1500);
    const w = await snap(p);
    check('envoy elemental_affinity: đòn vũ khí kích hoạt cầu lửa ' + EL.fire.first + ' [ĐO firstDamage]', hitsOf(w, 'fireball').length >= 1 && hitsOf(w, 'fireball').every(d => d === EL.fire.first), 'cầu lửa ' + hitsOf(w, 'fireball').join(',') + ' · mọi đòn ' + w.hits.map(x => x.join(':')).join(','));
  }
});
