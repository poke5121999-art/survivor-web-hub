// Builds: the shop only sells upgrades. Stats, six elements that react with each other on a zombie, support branches,
// and resonances when two branches are both deep enough. Everything here is per player and resets with the run.
(() => {
  const BZ = window.BZ;

  // cost of level n (0-based) = base * grow^n
  const UP = [
    { id: 'dmg', cat: 'fire', name: 'Sát thương', icon: '🔥', max: 10, d: (l) => `+${l * 10}% sát thương mọi vũ khí` },
    { id: 'crit', cat: 'fire', name: 'Chí mạng', icon: '🎯', max: 8, d: (l) => `+${l * 4}% tỉ lệ chí mạng` },
    { id: 'critDmg', cat: 'fire', name: 'Sát thương chí mạng', icon: '💥', max: 6, d: (l) => `chí mạng x${(2 + l * 0.25).toFixed(2)}` },
    { id: 'rate', cat: 'fire', name: 'Tốc bắn', icon: '⚡', max: 8, d: (l) => `+${l * 6}% tốc độ bắn và chém` },
    { id: 'reload', cat: 'fire', name: 'Nạp đạn', icon: '🔄', max: 6, d: (l) => `nạp nhanh hơn ${l * 10}%` },
    { id: 'mag', cat: 'fire', name: 'Băng đạn lớn', icon: '📦', max: 6, d: (l) => `+${l * 15}% sức chứa băng, +${l * 15}% đạn dự trữ` },
    { id: 'melee', cat: 'fire', name: 'Lưỡi bén', icon: '🗡', max: 6, d: (l) => `cận chiến +${l * 15}% sát thương, +${l * 5}% tầm` },
    { id: 'hp', cat: 'live', name: 'Máu tối đa', icon: '❤', max: 8, d: (l) => `+${l * 20} máu tối đa` },
    { id: 'regen', cat: 'live', name: 'Hồi máu', icon: '✚', max: 6, d: (l) => `hồi ${(l * 0.8).toFixed(1)} máu mỗi giây` },
    { id: 'armor', cat: 'live', name: 'Giáp', icon: '🛡', max: 6, d: (l) => `giảm ${l * 5}% sát thương nhận vào` },
    { id: 'speed', cat: 'live', name: 'Tốc chạy', icon: '👟', max: 5, d: (l) => `+${l * 5}% tốc độ chạy` },
    { id: 'cd', cat: 'skill', name: 'Hồi chiêu', icon: '⏱', max: 6, d: (l) => `kỹ năng hồi nhanh hơn ${l * 8}%` },
    { id: 'pow', cat: 'skill', name: 'Uy lực kỹ năng', icon: '✨', max: 6, d: (l) => `kỹ năng mạnh và lâu hơn ${l * 15}%` },
    { id: 'ult', cat: 'skill', name: 'Nạp chiêu cuối', icon: '🌟', max: 5, d: (l) => `chiêu cuối nạp nhanh hơn ${l * 12}%` },
    { id: 'fire_el', cat: 'elem', el: 'burn', name: 'Lửa', icon: '🔥', max: 5, d: (l) => `${l * 9}% đòn đánh đốt cháy (${6 + l * 5} sát thương/giây)` },
    { id: 'ice_el', cat: 'elem', el: 'chill', name: 'Băng', icon: '❄', max: 5, d: (l) => `${l * 10}% đòn làm lạnh, 4 lớp lạnh thì đóng băng` },
    { id: 'shock_el', cat: 'elem', el: 'shock', name: 'Điện', icon: '⚡', max: 5, d: (l) => `${l * 8}% đòn phóng điện lan sang ${1 + Math.ceil(l / 2)} con gần` },
    { id: 'poison_el', cat: 'elem', el: 'poison', name: 'Độc', icon: '☠', max: 5, d: (l) => `${l * 10}% đòn tẩm độc, độc cộng dồn 5 lớp` },
    { id: 'blood_el', cat: 'elem', name: 'Hút máu', icon: '🩸', max: 5, d: (l) => `hồi ${(l * 1.5).toFixed(1)}% sát thương gây ra thành máu` },
    { id: 'blast_el', cat: 'elem', name: 'Nổ', icon: '💣', max: 5, d: (l) => `${l * 10}% zombie chết thì nổ tung (bán kính ${(2.5 + l * 0.3).toFixed(1)} m)` },
    { id: 'squad', cat: 'help', name: 'Chỉ huy', icon: '🪖', max: 3, d: (l) => `${l} lính đi theo, chết thì đợt sau có lính mới` },
    { id: 'eng', cat: 'help', name: 'Kỹ sư', icon: '🔧', max: 3, d: (l) => `${l} súng máy tự dựng quanh bạn mỗi đợt` },
    { id: 'jet', cat: 'help', name: 'Jetpack', icon: '🚀', max: 3, d: (l) => (l ? `bay được, nhiên liệu +${(l - 1) * 40}%` : 'mở jetpack: nhảy rồi giữ Space') },
  ];
  const CATS = [['fire', 'Hoả lực'], ['live', 'Sinh tồn'], ['skill', 'Kỹ năng'], ['elem', 'Nguyên tố'], ['help', 'Hỗ trợ']];
  // two branches deep enough at once
  const RES = [
    { id: 'inferno', name: 'Hoả ngục', need: { fire_el: 3, blast_el: 3 }, d: 'zombie đang cháy chết là nổ tung' },
    { id: 'super', name: 'Siêu dẫn', need: { ice_el: 3, shock_el: 3 }, d: 'Vỡ vụn gây sát thương gấp đôi' },
    { id: 'parasite', name: 'Ký sinh', need: { poison_el: 3, blood_el: 3 }, d: 'độc đang ăn mòn zombie hồi máu cho bạn' },
    { id: 'firestorm', name: 'Bão lửa', need: { fire_el: 3, shock_el: 3 }, d: 'tia điện lan tới đâu châm lửa tới đó' },
    { id: 'fortress', name: 'Pháo đài', need: { squad: 2, eng: 2 }, d: 'lính và súng máy bắn nhanh hơn 50%' },
    { id: 'assassin', name: 'Sát thủ', need: { dmg: 5, crit: 5 }, d: 'chí mạng xuyên thêm 1 con, sát thương chí mạng +50%' },
    { id: 'undying', name: 'Bất khuất', need: { hp: 5, regen: 3 }, d: 'máu dưới 25% thì bất tử 3 giây, mỗi đợt một lần' },
    { id: 'overload', name: 'Quá tải', need: { cd: 3, pow: 3 }, d: 'mỗi lần dùng kỹ năng phát một sóng chấn quanh bạn' },
    { id: 'frostbite', name: 'Tê cóng', need: { ice_el: 3, poison_el: 2 }, d: 'zombie đang lạnh nhận thêm 40% sát thương độc' },
  ];
  // a hero starts with a level in the branch that fits it
  const AFFINITY = { gio: { speed: 1 }, thep: { armor: 1 }, yta: { regen: 1 }, mua: { rate: 1 }, bong: { crit: 1 }, phao: { blast_el: 1 }, bang: { ice_el: 1 }, hoa: { fire_el: 1 }, sam: { shock_el: 1 }, doc: { poison_el: 1 }, ky: { eng: 1 } };
  BZ.UPGRADES = UP; BZ.UPCATS = CATS; BZ.RESONANCES = RES; BZ.AFFINITY = AFFINITY;

  BZ.makeBuild = (G) => {
    const L = {}; for (const u of UP) L[u.id] = 0;
    const B = { L };
    const lv = (id) => L[id] || 0;
    const def = (id) => UP.find((u) => u.id === id);
    const has = (rid) => { const r = RES.find((x) => x.id === rid); return Object.entries(r.need).every(([k, n]) => lv(k) >= n); };
    function reset(heroId) {
      for (const k of Object.keys(L)) L[k] = 0;
      Object.assign(L, AFFINITY[heroId] || {});
      B.undyingUsed = false;
    }
    // one more level of an upgrade (the pick after a wave); announces a resonance it completes
    function grant(id) {
      const u = def(id); if (!u || lv(id) >= u.max) return false;
      const before = RES.filter((r) => has(r.id)).map((r) => r.id);
      L[id]++;
      apply();
      const now = RES.filter((r) => has(r.id) && !before.includes(r.id));
      for (const r of now) { G.ui.announce('CỘNG HƯỞNG: ' + r.name.toUpperCase(), r.d, 'hot'); G.audio.play('streak', { gain: 0.6 }); }
      G.events.emit('build:changed', { id, lv: L[id] });
      return true;
    }
    // three different upgrades to choose from, from three different branches when possible
    function offer(n = 3) {
      const open = UP.filter((u) => lv(u.id) < u.max); const bag = open.slice(); const out = [];
      for (let i = bag.length - 1; i > 0; i--) { const j = G.rng.int(0, i); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      for (const u of bag) if (out.length < n && !out.some((o) => o.cat === u.cat)) out.push(u);
      for (const u of bag) if (out.length < n && !out.includes(u)) out.push(u);
      return out.map((u) => u.id);
    }
    // the resonances one more level of this upgrade would complete
    function unlocks(id) { const before = RES.filter((r) => has(r.id)); L[id] = lv(id) + 1; const now = RES.filter((r) => has(r.id) && !before.includes(r)); L[id]--; return now; }
    // stats the rest of the game reads
    const dmgMul = () => 1 + 0.1 * lv('dmg');
    const critAdd = () => 0.04 * lv('crit');
    const critMul = () => 2 + 0.25 * lv('critDmg') + (has('assassin') ? 0.5 : 0);
    const rateMul = () => 1 + 0.06 * lv('rate');
    const reloadMul = () => 1 + 0.1 * lv('reload');
    const magMul = () => 1 + 0.15 * lv('mag');
    const meleeMul = () => 1 + 0.15 * lv('melee');
    const meleeRange = () => 1 + 0.05 * lv('melee');
    const armorMul = () => 1 - 0.05 * lv('armor');
    const speedMul = () => 1 + 0.05 * lv('speed');
    const cdMul = () => 1 - 0.08 * lv('cd');
    const powMul = () => 1 + 0.15 * lv('pow');
    const ultMul = () => 1 + 0.12 * lv('ult');
    function apply() {
      const P = G.player; const h = G.hero.def;
      const max = Math.round(h.hp * (G.meta ? G.meta.hpMul(h.id) : 1)) + lv('hp') * 20; if (P.maxHp !== max) { P.hp += max - P.maxHp; P.maxHp = max; }
      P.hasJet = lv('jet') > 0;
    }
    // a hit landed: roll the elements, drink some of it back
    const ELS = [['fire_el', 'burn', 0.09], ['ice_el', 'chill', 0.1], ['shock_el', 'shock', 0.08], ['poison_el', 'poison', 0.1]];
    function procs(melee) {
      const out = [];
      for (const [id, kind, per] of ELS) { const l = lv(id); if (l && G.rng.chance(per * l * (melee ? 1.5 : 1))) out.push([kind, +(1 + 0.25 * l).toFixed(2)]); }
      return out;
    }
    function onHit(z, dmg, melee) {
      const P = G.player;
      if (lv('blood_el') && P.alive) P.hp = Math.min(P.maxHp, P.hp + dmg * 0.015 * lv('blood_el'));
      const out = procs(melee); if (G.hero && G.hero.procs) out.push(...G.hero.procs(z, dmg, melee));
      return out;
    }
    function onKill(z) {
      const l = lv('blast_el'); const burning = (z.st && z.st.burn) || (z.stFlags & 16);
      if ((l && G.rng.chance(0.1 * l)) || (burning && has('inferno'))) {
        const pos = z.pos.clone(); pos.y += 0.8;
        setTimeout(() => G.gear.explode(pos, 2.5 + l * 0.3, 40 + l * 15), 60);
      }
    }
    // co-op: support branches of every player add up on the host
    function support() { return { squad: lv('squad'), eng: lv('eng') }; }
    function update(dt) {
      const P = G.player; if (!P.alive) return;
      if (lv('regen')) P.hp = Math.min(P.maxHp, P.hp + 0.8 * lv('regen') * dt);
      if (has('undying') && !B.undyingUsed && P.hp < P.maxHp * 0.25) { B.undyingUsed = true; G.hero.t.invuln = Math.max(G.hero.t.invuln || 0, 3); G.ui.announce('BẤT KHUẤT', 'bất tử 3 giây', 'hot'); }
    }
    G.events.on('wave:start', () => { B.undyingUsed = false; }); G.events.on('coop:wave', () => { B.undyingUsed = false; });
    return Object.assign(B, { lv, def, has, reset, grant, offer, unlocks, apply, dmgMul, critAdd, critMul, rateMul, reloadMul, magMul, meleeMul, meleeRange, armorMul, speedMul, cdMul, powMul, ultMul,
      onHit, onKill, procs, support, update, UP, CATS, RES });
  };
})();
