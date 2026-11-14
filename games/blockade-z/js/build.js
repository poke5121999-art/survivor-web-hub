// Builds: the shop only sells upgrades. Stats, six elements that react with each other on a zombie, support branches,
// and resonances when two branches are both deep enough. Everything here is per player and resets with the run.
(() => {
  const BZ = window.BZ;

  // cost of level n (0-based) = base * grow^n
  const UP = [
    { id: 'dmg', cat: 'fire', name: BZ.t("build.1"), icon: '🔥', max: 10, d: (l) => BZ.t("build.2", [l * 10]) },
    { id: 'crit', cat: 'fire', name: BZ.t("build.3"), icon: '🎯', max: 8, d: (l) => BZ.t("build.4", [l * 4]) },
    { id: 'critDmg', cat: 'fire', name: BZ.t("build.5"), icon: '💥', max: 6, d: (l) => BZ.t("build.6", [(2 + l * 0.25).toFixed(2)]) },
    { id: 'rate', cat: 'fire', name: BZ.t("build.7"), icon: '⚡', max: 8, d: (l) => BZ.t("build.8", [l * 6]) },
    { id: 'reload', cat: 'fire', name: BZ.t("build.9"), icon: '🔄', max: 6, d: (l) => BZ.t("build.10", [l * 10]) },
    { id: 'mag', cat: 'fire', name: BZ.t("build.11"), icon: '📦', max: 6, d: (l) => BZ.t("build.12", [l * 15, l * 15]) },
    { id: 'melee', cat: 'fire', name: BZ.t("build.13"), icon: '🗡', max: 6, d: (l) => BZ.t("build.14", [l * 15, l * 5]) },
    { id: 'hp', cat: 'live', name: BZ.t("build.15"), icon: '❤', max: 8, d: (l) => BZ.t("build.16", [l * 20]) },
    { id: 'regen', cat: 'live', name: BZ.t("build.17"), icon: '✚', max: 6, d: (l) => BZ.t("build.18", [(l * 0.8).toFixed(1)]) },
    { id: 'armor', cat: 'live', name: BZ.t("build.19"), icon: '🛡', max: 6, d: (l) => BZ.t("build.20", [l * 5]) },
    { id: 'speed', cat: 'live', name: BZ.t("build.21"), icon: '👟', max: 5, d: (l) => BZ.t("build.22", [l * 5]) },
    { id: 'cd', cat: 'skill', name: BZ.t("build.23"), icon: '⏱', max: 6, d: (l) => BZ.t("build.24", [l * 8]) },
    { id: 'pow', cat: 'skill', name: BZ.t("build.25"), icon: '✨', max: 6, d: (l) => BZ.t("build.26", [l * 15]) },
    { id: 'ult', cat: 'skill', name: BZ.t("build.27"), icon: '🌟', max: 5, d: (l) => BZ.t("build.28", [l * 12]) },
    { id: 'fire_el', cat: 'elem', el: 'burn', name: BZ.t("build.29"), icon: '🔥', max: 5, d: (l) => BZ.t("build.30", [l * 9, 6 + l * 5]) },
    { id: 'ice_el', cat: 'elem', el: 'chill', name: BZ.t("build.31"), icon: '❄', max: 5, d: (l) => BZ.t("build.32", [l * 10]) },
    { id: 'shock_el', cat: 'elem', el: 'shock', name: BZ.t("build.33"), icon: '⚡', max: 5, d: (l) => BZ.t("build.34", [l * 8, 1 + Math.ceil(l / 2)]) },
    { id: 'poison_el', cat: 'elem', el: 'poison', name: BZ.t("build.35"), icon: '☠', max: 5, d: (l) => BZ.t("build.36", [l * 10]) },
    { id: 'blood_el', cat: 'elem', name: BZ.t("build.37"), icon: '🩸', max: 5, d: (l) => BZ.t("build.38", [(l * 1.5).toFixed(1)]) },
    { id: 'blast_el', cat: 'elem', name: BZ.t("build.39"), icon: '💣', max: 5, d: (l) => BZ.t("build.40", [l * 10, (2.5 + l * 0.3).toFixed(1)]) },
    { id: 'squad', cat: 'help', name: BZ.t("build.41"), icon: '🪖', max: 3, d: (l) => BZ.t("build.42", [l]) },
    { id: 'eng', cat: 'help', name: BZ.t("build.43"), icon: '🔧', max: 3, d: (l) => BZ.t("build.44", [l]) },
    { id: 'jet', cat: 'help', name: 'Jetpack', icon: '🚀', max: 3, d: (l) => (l ? BZ.t("build.45", [(l - 1) * 40]) : BZ.t("build.46")) },
  ];
  const CATS = [['fire', BZ.t("build.47")], ['live', BZ.t("build.48")], ['skill', BZ.t("build.49")], ['elem', BZ.t("build.50")], ['help', BZ.t("build.51")]];
  // two branches deep enough at once
  const RES = [
    { id: 'inferno', name: BZ.t("build.52"), need: { fire_el: 3, blast_el: 3 }, d: BZ.t("build.53") },
    { id: 'super', name: BZ.t("build.54"), need: { ice_el: 3, shock_el: 3 }, d: BZ.t("build.55") },
    { id: 'parasite', name: BZ.t("build.56"), need: { poison_el: 3, blood_el: 3 }, d: BZ.t("build.57") },
    { id: 'firestorm', name: BZ.t("build.58"), need: { fire_el: 3, shock_el: 3 }, d: BZ.t("build.59") },
    { id: 'fortress', name: BZ.t("build.60"), need: { squad: 2, eng: 2 }, d: BZ.t("build.61") },
    { id: 'assassin', name: BZ.t("build.62"), need: { dmg: 5, crit: 5 }, d: BZ.t("build.63") },
    { id: 'undying', name: BZ.t("build.64"), need: { hp: 5, regen: 3 }, d: BZ.t("build.65") },
    { id: 'overload', name: BZ.t("build.66"), need: { cd: 3, pow: 3 }, d: BZ.t("build.67") },
    { id: 'frostbite', name: BZ.t("build.68"), need: { ice_el: 3, poison_el: 2 }, d: BZ.t("build.69") },
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
      for (const r of now) { G.ui.announce(BZ.t("build.70") + r.name.toUpperCase(), r.d, 'hot'); G.audio.play('streak', { gain: 0.6 }); }
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
      if (has('undying') && !B.undyingUsed && P.hp < P.maxHp * 0.25) { B.undyingUsed = true; G.hero.t.invuln = Math.max(G.hero.t.invuln || 0, 3); G.ui.announce(BZ.t("build.71"), BZ.t("build.72"), 'hot'); }
    }
    G.events.on('wave:start', () => { B.undyingUsed = false; }); G.events.on('coop:wave', () => { B.undyingUsed = false; });
    return Object.assign(B, { lv, def, has, reset, grant, offer, unlocks, apply, dmgMul, critAdd, critMul, rateMul, reloadMul, magMul, meleeMul, meleeRange, armorMul, speedMul, cdMul, powMul, ultMul,
      onHit, onKill, procs, support, update, UP, CATS, RES });
  };
})();
