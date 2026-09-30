// Ca kiểm Chuyên Gia Súng Đạn (c40): số đọc từ ctrlFields / prefab [ĐO].
module.exports = h => {
  const tough = p => p.evaluate(() => SK.G.enemies.forEach(e => { if (e.st !== 'dead') e.hp += 400; }));
  return {
    async 'gunsexpert/0'(p) {
      const r = await h.real(p, 'gunsexpert', 'call_to_arms');
      const cf = await p.evaluate(() => SK_SKILLS86.heroes.gunsexpert.ctrlFields);
      await tough(p); await h.standNear(p, 60);
      await h.pressK(p); await h.sleep(700);
      const a = await h.snap(p);
      const sup = await p.evaluate(() => (SK.G._allies || []).filter(x => x.merc && !x.gone).map(x => ({ hp: x.hp, hpMax: x.hpMax, w: x.w.id })));
      h.check('gunsexpert: gọi ' + cf.supportCount + ' tùy tùng máu ' + cf.supportHp + ' [ĐO], sóng xung kích ' + cf.shockwaveDamage + ' [ĐO], hồi ' + r.cd + ' s', sup.length === cf.supportCount && sup.every(x => x.hpMax === cf.supportHp) && h.hitsOf(a, 'skill').some(d => d === cf.shockwaveDamage) && a.cd === r.cd && a.skillT > 0, JSON.stringify(sup.map(x => x.w)) + ' · sóng ' + h.hitsOf(a, 'skill').join(','));
      await h.sleep(2300);
      await h.seq(p, 'gunsexpert_0', 6, 80);
      const b = await h.snap(p);
      h.check('gunsexpert: tùy tùng bắn quái bằng vũ khí ngẫu nhiên (50% sát thương)', h.hitsOf(b).filter(d => d > 0).length > h.hitsOf(a).length, 'đòn ' + h.hitsOf(b).length + ' · trước ' + h.hitsOf(a).length);
      await p.evaluate(() => SK.endSkill(SK.G, SK.G.player));
      await h.sleep(200);
      const gx = await p.evaluate(() => { const s = SK.G.player._gx; return s && { n: s.ws.length, life: s.life, ids: s.ws.map(w => w.id) }; });
      await h.resetDmg(p);
      await p.keyboard.down('KeyJ'); await h.sleep(900);
      await h.seq(p, 'gunsexpert_0b', 6, 60);
      await p.keyboard.up('KeyJ');
      const shots = await p.evaluate(() => SK.G.player._gx ? SK.G.player._gx.shots || 0 : -1);
      h.check('gunsexpert: tùy tùng rời sân → ' + cf.extraAttackWeaponCount + ' vũ khí Âm Vang ' + cf.extraAttackDuration + ' s, người bắn thì chúng bắn theo', gx && gx.n === cf.extraAttackWeaponCount && gx.life === cf.extraAttackDuration && shots >= cf.extraAttackWeaponCount, JSON.stringify(gx) + ' · phát chúng bắn ' + shots);
    }
  };
};
