// Meta progression: save state, gold, sword / helmet upgrades, stage unlocks, boosters, HARD / HELL. Every number comes from data/meta.json,
// which records the C++ function + address it was recovered from (see its _note). Pure logic, no DOM.
//
// Save lives in this browser only (localStorage, key ds.save.v1); reads and writes never throw.

const KEY = 'ds.save.v1';


// a stored save can be from an older build, half-written or hand-edited: keep only fields of the right shape so a bad
// save can never stop the game (it then starts from what is valid, or fresh)
function cleanSave(o, f) {
  const out = { ...f };
  if (!o || typeof o !== 'object') return out;
  const int = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : d);
  out.gold = int(o.gold, 0, 1e9, f.gold);
  out.wlv = int(o.wlv, 0, 9, f.wlv);
  out.alv = int(o.alv, 0, 9, f.alv);
  out.stages = {};
  if (o.stages && typeof o.stages === 'object') {
    for (const [id, r] of Object.entries(o.stages)) {
      if (!r || typeof r !== 'object') continue;
      const e = { cleared: !!r.cleared, stars: int(r.stars, 0, 3, 0), best: int(r.best, 0, 1e9, 0) };
      if (r.table !== undefined) e.table = int(r.table, 0, 9, 0);
      if (Array.isArray(r.untouched)) e.untouched = [0, 1, 2].map(i => !!r.untouched[i]);
      out.stages[id] = e;
    }
  }
  for (const k of ['gems', 'hearts', 'heartsMax', 'tickets', 'ticketsMax', 'heartAt', 'ticketAt']) if (k in f) out[k] = int(o[k], 0, 1e13, f[k]);
  if ('gemDay' in f) out.gemDay = typeof o.gemDay === 'string' ? o.gemDay : '';
  if ('tuto' in f) { out.tuto = {}; if (o.tuto && typeof o.tuto === 'object') for (const [k, v] of Object.entries(o.tuto)) if (v) out.tuto[k] = true; }
  if ('bag' in f) {
    out.slots = int(o.slots, f.slots, 50, f.slots);
    out.bag = [];
    const seen = new Set();
    if (Array.isArray(o.bag)) for (const it of o.bag.slice(0, out.slots)) {
      if (!it || typeof it !== 'object' || !Number.isInteger(it.id) || it.id < 0 || it.id > 41) continue;
      const e = { id: it.id, lv: int(it.lv, 0, 99, 0), value: int(it.value, -1, 1e6, -1), opts: [], eq: false };
      if (Array.isArray(it.opts)) for (const op of it.opts.slice(0, 3)) if (Array.isArray(op)) e.opts.push([int(op[0], 0, 9, 0), int(op[1], 0, 1e4, 0)]);
      if (it.eq && Number.isInteger(it.slot) && !seen.has(it.slot)) { e.eq = true; seen.add(it.slot); }
      e.slot = it.slot;
      out.bag.push(e);
    }
  }
  if ('pets' in f) {
    out.petSlots = int(o.petSlots, f.petSlots, 50, f.petSlots);
    out.pets = [];
    const sides = new Set();
    if (Array.isArray(o.pets)) for (const g of o.pets.slice(0, out.petSlots)) {
      if (!g || typeof g !== 'object' || !Number.isInteger(g.kind) || g.kind < 0 || g.kind > 25) continue;
      const e = { kind: g.kind, lv: int(g.lv, 0, 19, 0), exp: int(g.exp, 0, 1e7, 0), eq: null };
      if ((g.eq === 'L' || g.eq === 'R') && !sides.has(g.eq)) { e.eq = g.eq; sides.add(g.eq); }
      out.pets.push(e);
    }
    const x = o.exped && typeof o.exped === 'object' ? o.exped : {};
    out.exped = { area: int(x.area, -1, 4, -1), end: int(x.end, 0, 1e15, 0) };
    out.towerBest = int(o.towerBest, 0, 1e9, 0);
    out.ability = [0, 1, 2, 3, 4].map(i => int(Array.isArray(o.ability) ? o.ability[i] : 0, 0, 8, 0));
    out.noAds = !!o.noAds;
  }
  if ('owned' in f) { // roster: selected hero, owned flags, and the levels each hero not in use keeps (per character in GameData)
    out.owned = f.owned.map((v, i) => i === 0 || !!(Array.isArray(o.owned) && o.owned[i]));
    out.char = int(o.char, 0, f.owned.length - 1, 0);
    if (!out.owned[out.char]) out.char = 0;
    out.roster = {};
    if (o.roster && typeof o.roster === 'object') for (const [k, r] of Object.entries(o.roster)) {
      const i = int(k, -1, f.owned.length - 1, -1);
      if (i < 0 || !r || typeof r !== 'object') continue;
      out.roster[i] = { wlv: int(r.wlv, 0, 9, 0), alv: int(r.alv, 0, 9, 0), ability: [0, 1, 2, 3, 4].map(j => int(Array.isArray(r.ability) ? r.ability[j] : 0, 0, 8, 0)) };
    }
  }
  if (f.boosters) {
    out.boosters = { ...f.boosters };
    if (o.boosters && typeof o.boosters === 'object') for (const k of Object.keys(f.boosters)) out.boosters[k] = int(o.boosters[k], 0, 999, 0);
    out.gift = !!o.gift;
  }
  return out;
}

export function createMeta(meta, stageIds, storage) {
  const st = storage || (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const fresh = () => ({
    gold: meta.startGold.value, wlv: meta.upgrade.startLevel.value, alv: meta.upgrade.startLevel.value, stages: {},
    boosters: { potion: 0, sword: 0, shield: 0, relic: 0 }, gift: false,
    gems: meta.gems.value, hearts: meta.hearts.value.start, heartsMax: meta.hearts.value.max, heartAt: 0, ticketAt: 0,
    tickets: meta.hearts.value.start, ticketsMax: meta.hearts.value.max, gemDay: '', tuto: {},
    bag: [], slots: meta.items.slots.value.start,
    pets: [], petSlots: meta.guardians.slots.value.start, exped: { area: -1, end: 0 }, towerBest: 0,
    ability: [0, 0, 0, 0, 0], noAds: false, adShop: 0,
    char: 0, owned: (meta.roster ? meta.roster.chars.value : [0]).map((c, i) => i === 0), roster: {},
  });
  let save = fresh();
  try {
    const raw = st && st.getItem(KEY);
    if (raw) save = cleanSave(JSON.parse(raw), fresh());
  } catch (e) { /* storage blocked or corrupt: start fresh */ }

  const persist = () => { try { if (st) st.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } };
  const U = meta.upgrade;
  const maxLv = U.maxLevel.value;
  const K = meta.knightStats;
  const RO = meta.roster ? meta.roster.chars.value : null;
  const hero = () => (RO ? RO[save.char] : null);
  // stat table of the hero in use (GameData+0x9798 / 0x9978 / 0x9b58 / 0x9d38 + char*0x50)
  const T = {
    atk: lv => (hero() ? hero().atk[lv] : K.atkByWeaponLevel.value[lv]),
    skill: lv => (hero() ? hero().skill[lv] : K.critByWeaponLevel.value[lv]),
    def: lv => (hero() ? hero().def[lv] : K.defByArmorLevel.value[lv]),
    hp: lv => (hero() ? hero().hp[lv] : K.hpByArmorLevel.value[lv]),
  };
  const SHOP = meta.shop;
  const HEART = meta.hearts.value;
  const now = () => Date.now();
  const today = () => new Date(now()).toDateString();
  const ITEMS = meta.boosters.items.value;
  const IT = meta.items;
  const IK = IT.kinds.value;
  const TABS = meta.tabs.value;
  const GK = meta.guardians.kinds.value;
  const GIFT = meta.boosters.freeGift.value;
  const MODES = meta.difficulty.modes.value;
  const CH = meta.difficulty.challenges.value;
  // per stage: star table = max over clears of mode*3 + stars (GameData+0x4f88), UNTOUCHED per mode (+0x5758 + mode*0x7d0)
  const rec = id => {
    const r = save.stages[id] || {};
    return { cleared: !!r.cleared, stars: r.stars || 0, best: r.best || 0, table: Math.max(r.table || 0, r.stars || 0), untouched: r.untouched || [false, false, false] };
  };

  const api = {
    get save() { return save; },
    stageIds,
    gold: () => save.gold,
    level: kind => (kind === 'weapon' ? save.wlv : save.alv),
    // what the card shows: the level it buys ("Lv.%d" with level + 2 in FUC_SET_FONT) and its price
    nextLabel: kind => api.level(kind) + 2,
    price: kind => (api.level(kind) >= maxLv ? null : U[kind].priceByLevel[api.level(kind)]),
    isMax: kind => api.level(kind) >= maxLv,
    // Call_Back_Upgrade_Weapon / _Armor: max -> refuse, gold < price -> refuse, else pay and level up
    upgrade(kind) {
      if (api.isMax(kind)) return 'max';
      const p = api.price(kind);
      if (save.gold < p) return 'gold';
      save.gold -= p;
      if (kind === 'weapon') save.wlv++; else save.alv++;
      persist();
      return 'ok';
    },
    // the art tier a level shows for a hero set (sets 04 / 05 have real art only for tiers 01 and 10+)
    levelToTier(lv, set = '01') {
      const real = (meta.roster && meta.roster.tiersReal.value[set]) || null;
      const t = meta.levelToTier.value[lv];
      return !real || real.includes(t) ? t : real.filter(r => r <= t).pop() || '01';
    },
    tiers() {
      const set = hero() ? hero().set : '01';
      return { armor: api.levelToTier(save.alv, set), sword: api.levelToTier(save.wlv, set), set };
    },
    // ---- roster (SELECT CHARACTER) ----
    roster: () => RO || [],
    char: () => save.char,
    charOwned: i => !!save.owned[i],
    // a mission hero joins once its rule is met (rules: clip / iap_pickups.md A3; joining at once is inferred)
    missionMet(i) {
      const u = RO && RO[i] && RO[i].unlock;
      if (!u || u.kind !== 'mission') return false;
      const ids = stageIds;
      if (u.rule === 'stage15') return !!(save.stages[ids[14]] && save.stages[ids[14]].cleared);
      if (u.rule === 'allStages') return ids.length >= 50 && ids.every(id => save.stages[id] && save.stages[id].cleared);
      if (u.rule === 'allStars') return ids.length >= 50 && ids.every(id => save.stages[id] && save.stages[id].stars >= 3);
      return false;
    },
    // returns the heroes that joined now
    checkMissions() {
      const got = [];
      (RO || []).forEach((c, i) => { if (!save.owned[i] && api.missionMet(i)) { save.owned[i] = true; got.push(i); } });
      if (got.length) persist();
      return got;
    },
    // Call_Back_Buy_Selected_Cha @0x73b098: gems >= price -> pay, own
    buyChar(i) {
      const u = RO && RO[i] && RO[i].unlock;
      if (!u) return 'none';
      if (save.owned[i]) return 'owned';
      if (u.kind !== 'buy') return 'mission';
      if (save.gems < u.gems) return 'gems';
      save.gems -= u.gems;
      save.owned[i] = true;
      persist();
      return 'ok';
    },
    // switching keeps each hero's own weapon / armor / ability levels
    selectChar(i) {
      if (!RO || !RO[i]) return 'none';
      if (!save.owned[i]) return 'locked';
      if (i === save.char) return 'same';
      save.roster[save.char] = { wlv: save.wlv, alv: save.alv, ability: save.ability.slice() };
      const r = save.roster[i] || { wlv: meta.upgrade.startLevel.value, alv: meta.upgrade.startLevel.value, ability: [0, 0, 0, 0, 0] };
      save.wlv = r.wlv; save.alv = r.alv; save.ability = r.ability.slice();
      delete save.roster[i];
      save.char = i;
      persist();
      return 'ok';
    },
    // stats a hero would have at its saved levels (for the select screen), without items
    charStats(i) {
      const c = RO[i];
      const r = i === save.char ? { wlv: save.wlv, alv: save.alv } : save.roster[i] || { wlv: 0, alv: 0 };
      return { atk: c.atk[r.wlv], hp: c.hp[r.alv], crit: c.crit, skill: c.skill[r.wlv], cool: c.cooldown, wlv: r.wlv, alv: r.alv };
    },
    // getPlayerInfo @0x620794: level tables + every equipped item (main stat and its random options)
    stats() {
      const b = api.itemBonus();
      return {
        atk: T.atk(save.wlv) + b.atk,
        // player+0x540: shown as CRIT in Drop 1, really the dash skill's power (Scene_Stage::update @0x591a28)
        skill: T.skill(save.wlv) + b.power,
        crit: T.skill(save.wlv),
        wlv: save.wlv,
        def: T.def(save.alv),
        hp: T.hp(save.alv) + b.hp,
        critBase: hero() ? hero().crit : 1,
        cooldown: hero() ? hero().cooldown : null,
        char: save.char,
        critBonus: b.crit + (hero() && hero().slot5 === 'crit' ? save.ability[4] : 0),
        goldMul: hero() && hero().goldMul ? hero().goldMul : 1,
        cdCut: b.cd,
      };
    },
    // ---- ITEM tab (data/meta.json items) ----
    kind: id => IK[id],
    bag: () => save.bag,
    slots: () => save.slots,
    equipped: slot => save.bag.find(it => it.eq && IK[it.id].slot === slot) || null,
    itemValue: it => (it.value >= 0 ? it.value : IK[it.id].value),
    itemBonus() {
      const b = { atk: 0, hp: 0, crit: 0, power: 0, cd: 0 };
      for (const it of save.bag) {
        if (!it.eq) continue;
        const k = IK[it.id].main;
        const v = api.itemValue(it);
        if (k === 0) b.atk += v; else if (k === 1) b.hp += v; else if (k === 2) b.cd += v; else if (k === 3) b.crit += v;
        for (const [ok, ov] of it.opts) { if (ok === 0) b.atk += ov; else if (ok === 1) b.hp += ov; else if (ok === 2) b.crit += ov; else if (ok === 3) b.power += ov; }
      }
      b.crit = Math.min(IT.statCaps.value.crit, b.crit);
      return b;
    },
    // ITEM BOX: 20 gems, needs a free slot; id rand()%42 with two different option kinds (actualCreateBoxItem @0x696b90)
    // free: the tutorial's "ONE FREE!!" box (TUTO26), forced to id 11 Metal Armor by the caller
    buyItemBox(rng = Math.random, forceId = null, free = false) {
      if (save.bag.length >= save.slots) return { r: 'full' };
      if (!free && save.gems < IT.boxGems.value) return { r: 'gems' };
      if (!free) save.gems -= IT.boxGems.value;
      const roll = k => Math.floor(rng() * IT.optionRoll.value.mod[k]) + IT.optionRoll.value.base[k];
      const a = Math.floor(rng() * 10);
      let c = Math.floor(rng() * 10);
      if (c === a) c = (c + 1) % 10;
      const it = { id: forceId ?? Math.floor(rng() * 42), lv: 0, value: -1, opts: [[a, roll(a)], [c, roll(c)]], eq: false };
      it.slot = IK[it.id].slot;
      save.bag.push(it);
      persist();
      return { r: 'ok', item: it, index: save.bag.length - 1 };
    },
    // one item per slot type: equipping swaps the worn one back into the bag (Call_Back_Equip_Item @0x67f55c)
    equip(i) {
      const it = save.bag[i];
      if (!it) return false;
      for (const o of save.bag) if (o.eq && IK[o.id].slot === IK[it.id].slot) o.eq = false;
      it.eq = true;
      persist();
      return true;
    },
    unequip(i) { const it = save.bag[i]; if (!it) return false; it.eq = false; persist(); return true; },
    sell(i) {
      if (!save.bag[i]) return false;
      save.bag.splice(i, 1);
      save.gold += IT.sellGold.value;
      persist();
      return true;
    },
    intenPrice: i => { const it = save.bag[i]; return it ? (IK[it.id].main < 0 ? IT.intenGold.value.none : IT.intenGold.value.main) * (it.lv + 1) : 0; },
    // INTEN: pay gold, use up one other item, level +1 and the main value grows (actualIntenItem @0x696e14)
    intensify(i, fodder) {
      const it = save.bag[i];
      if (!it) return 'none';
      if (fodder === undefined) fodder = save.bag.findIndex((o, j) => j !== i && !o.eq);
      if (fodder < 0 || fodder === i || !save.bag[fodder]) return 'fodder';
      const p = api.intenPrice(i);
      if (save.gold < p) return 'gold';
      save.gold -= p;
      const k = IK[it.id].main;
      if (k >= 0 && k !== 4 && k !== 5) {
        const st = IT.intenStep.value;
        const step = k === 1 ? st['1'] : k === 3 ? st['3'] : k >= 9 && k <= 13 ? st.big : st.other;
        it.value = api.itemValue(it) + step;
      }
      it.lv++;
      save.bag.splice(fodder, 1);
      persist();
      return 'ok';
    },
    expandSlots() {
      const S = IT.slots.value;
      if (save.slots >= S.max) return 'max';
      if (save.gems < S.gems) return 'gems';
      save.gems -= S.gems;
      save.slots = Math.min(S.max, save.slots + S.step);
      persist();
      return 'ok';
    },
    // world-map tabs: ITEM after stage 5, TOWER 6, WING 10, EXPLORE 15 (only stages 1-5 exist in the web version)
    tabOpen(name) {
      const t = TABS.find(x => x.name === name);
      if (!t) return true;
      const id = stageIds[t.afterStage - 1];
      return !!id && rec(id).cleared;
    },
    tabInfo: name => TABS.find(x => x.name === name),
    // ---- WING tab: guardians (data/meta.json guardians) ----
    pets: () => save.pets,
    petSlots: () => save.petSlots,
    gkind: k => GK[k],
    petOn: side => save.pets.find(g => g.eq === side) || null,
    // SUMMON: gold (mode 0) or jewels (mode 1), needs a free slot (actualCreateGuardian @0x6a924c)
    summon(mode, rng = Math.random) {
      if (save.pets.length >= save.petSlots) return { r: 'full' };
      const G = meta.guardians;
      let g;
      if (mode === 0) {
        if (save.gold < G.summonGold.value.gold) return { r: 'gold' };
        save.gold -= G.summonGold.value.gold;
        const kind = Math.floor(rng() * 100) < G.summonGold.value.commonPct ? Math.floor(rng() * 20) : 19 + Math.floor(rng() * 5);
        g = { kind, lv: 0, exp: 0, eq: null };
      } else {
        const S = G.summonGems.value;
        if (save.gems < S.gems) return { r: 'gems' };
        save.gems -= S.gems;
        g = { kind: 20 + Math.floor(rng() * 6), exp: S.exp[Math.floor(rng() * 4)], lv: S.levelBase + Math.floor(rng() * 4), eq: null };
      }
      save.pets.push(g);
      persist();
      return { r: 'ok', pet: g, index: save.pets.length - 1 };
    },
    // LEFT / RIGHT slots; equipping into a taken side sends that one back to the bag
    equipPet(i, side) {
      const g = save.pets[i];
      if (!g || (side !== 'L' && side !== 'R')) return false;
      for (const o of save.pets) if (o.eq === side) o.eq = null;
      g.eq = side;
      persist();
      return true;
    },
    unequipPet(i) { const g = save.pets[i]; if (!g) return false; g.eq = null; persist(); return true; },
    sellPet(i) { if (!save.pets[i]) return false; save.pets.splice(i, 1); save.gold += meta.guardians.sellGold.value; persist(); return true; },
    // MIX: same level, level <= 18: the left one +1, the right one disappears (actualSynthGuardian @0x6c5580)
    mixPets(a, b) {
      const L = save.pets[a];
      const R = save.pets[b];
      if (!L || !R || a === b) return 'none';
      if (L.lv !== R.lv) return 'level';
      if (L.lv >= meta.guardians.mixMax.value) return 'max';
      L.lv++;
      if (R.eq && !L.eq) L.eq = R.eq;
      save.pets.splice(b, 1);
      persist();
      return 'ok';
    },
    expandPetSlots() {
      const S = meta.guardians.slots.value;
      if (save.petSlots >= S.max) return 'max';
      if (save.gems < S.gems) return 'gems';
      save.gems -= S.gems;
      save.petSlots = Math.min(S.max, save.petSlots + S.step);
      persist();
      return 'ok';
    },
    // the equipped guardians a stage carries, with the necklace bonuses (Scene_UI::FUC_INIT_GUARDIAN @0x5f281c)
    stageGuardians() {
      let crit = 1;
      let expPct = 0;
      for (const it of save.bag) if (it.eq) { const k = IK[it.id].main; if (k === 6) crit += api.itemValue(it); if (k === 7) expPct += api.itemValue(it); }
      return ['L', 'R'].map(side => api.petOn(side)).filter(Boolean).map(g => ({ side: g.eq, kind: g.kind, lv: g.lv, style: GK[g.kind].style, tier: GK[g.kind].tier, crit, expPct }));
    },
    // stage end: each equipped guardian below level 9 gains the stage EXP (+ necklace %) and levels by the table
    addGuardianExp(exp) {
      const T = meta.guardians.expTable.value;
      const ups = [];
      if (exp <= 0) return ups;
      const pct = api.stageGuardians()[0] ? api.stageGuardians()[0].expPct : 0;
      for (const g of save.pets) {
        if (!g.eq || g.lv > 8) continue;
        g.exp += Math.floor(exp + (exp * pct) / 100);
        const lv0 = g.lv;
        while (g.lv <= 8 && g.exp >= T[g.lv + 1]) g.lv++;
        if (g.lv > lv0) ups.push(g);
      }
      persist();
      return ups;
    },
    // ---- EXPLORE tab (data/meta.json explore) ----
    exped: () => save.exped,
    expedAbility() { const A = meta.explore.ability.value; return A.base + A.perLevel * (save.wlv + save.alv); },
    expedTier(s = api.expedAbility()) { const c = meta.explore.tiers.value.cuts; let t = 0; while (t < c.length && s >= c[t]) t++; return t; },
    expedLeft: () => (save.exped.area < 0 ? 0 : Math.max(0, Math.ceil((save.exped.end - now()) / 1000))),
    startExped(area) {
      const A = meta.explore.areas.value[area];
      if (!A) return 'none';
      if (save.exped.area >= 0) return 'busy';
      // Bombery finishes an expedition in half time (text 1269; that it is the hero in use who goes is inferred)
      save.exped = { area, end: now() + A.min * 60000 / (hero() && hero().expedHalf ? 2 : 1) };
      persist();
      return 'ok';
    },
    cancelExped() { if (save.exped.area < 0) return false; save.exped = { area: -1, end: 0 }; persist(); return true; },
    finishPrice() { const m = Math.ceil(api.expedLeft() / 60); return m <= 0 ? 0 : Math.ceil(m / meta.explore.finishGems.value); },
    finishNow() {
      if (save.exped.area < 0) return 'none';
      const p = api.finishPrice();
      if (save.gems < p) return 'gems';
      save.gems -= p;
      save.exped.end = now();
      persist();
      return 'ok';
    },
    // collect a finished expedition: gold = base + tier*mult + rand()%mod, items by the area rule (Call_Back_Result_Adventure @0x65ac50)
    collectExped(rng = Math.random) {
      if (save.exped.area < 0 || api.expedLeft() > 0) return null;
      const A = meta.explore.areas.value[save.exped.area];
      const t = api.expedTier();
      const gold = A.gold[0] + t * A.gold[1] + Math.floor(rng() * A.gold[2]);
      let n = 0;
      const I = A.items;
      if (I.rolls) { for (let k = 0; k < I.rolls; k++) if (Math.floor(rng() * 101) < I.chance + I.perTier * t) n++; }
      else if (I.two !== undefined) n = Math.floor(rng() * 21) + 20 * t < I.two ? 1 : 2;
      else if (I.three !== undefined) n = Math.floor(rng() * 21) + 20 * t < I.three ? 2 : 3;
      n = Math.min(n, save.slots - save.bag.length);
      const items = [];
      for (let k = 0; k < n; k++) {
        const it = { id: Math.floor(rng() * 42), lv: 0, value: -1, opts: [], eq: false };
        it.slot = IK[it.id].slot;
        save.bag.push(it);
        items.push(it);
      }
      save.gold += gold;
      const area = save.exped.area;
      save.exped = { area: -1, end: 0 };
      persist();
      return { area, tier: t, gold, items };
    },
    // ---- ABILITY (5 slots): pickup durations +1 s per level, 1500*(L+1) gold, max 8 ----
    abilityLevel: i => save.ability[i] || 0,
    abilityPrice: i => (save.ability[i] >= meta.ability.cost.value.max ? null : meta.ability.cost.value.perLevel * (save.ability[i] + 1)),
    upgradeAbility(i) {
      const p = api.abilityPrice(i);
      if (p === null) return 'max';
      if (save.gold < p) return 'gold';
      save.gold -= p;
      save.ability[i]++;
      persist();
      return 'ok';
    },
    // pickup durations a stage uses: slot base + level + equipped item bonus (main kinds 14 SCORE / 15 ATK / 16 DEF / 18 BERSERK)
    buffTime() {
      const sl = meta.ability.slots.value;
      const eq = k => save.bag.filter(it => it.eq && IK[it.id].main === k).reduce((a, it) => a + api.itemValue(it), 0);
      const h = hero() || {};
      // BERSERK 13 s (6 s for Elizabeth) + level; for Teresa / Flashare slot 5 raises the crit chance instead (iap_pickups.md B3)
      const bz = (h.berserkBase ?? sl[4].base) + (h.slot5 === 'crit' ? 0 : save.ability[4]);
      return { score: sl[0].base + save.ability[0] + eq(14), atk: sl[1].base + save.ability[1] + eq(15), def: sl[2].base + save.ability[2] + eq(16), berserk: bz + eq(18) };
    },
    // DESTINY: one is used at the stage start and rolls rand()%4 (FUC_SELECT_DESTINY @0x55929c)
    rollDestiny(rng = Math.random) {
      if (!(save.boosters.relic > 0)) return null;
      save.boosters.relic--;
      persist();
      return Math.floor(rng() * 4);
    },
    spendGems(n) { if (save.gems < n) return false; save.gems -= n; persist(); return true; },
    addGems(n) { save.gems += n; persist(); },
    // rewarded video (+2 jewels, once per shop visit): the web plays no ad and gives the reward at once
    claimAdJewels() { save.gems += meta.ads.value.rewardedJewels; persist(); return meta.ads.value.rewardedJewels; },
    buyNoAds() { save.noAds = true; persist(); return 'ok'; },
    towerBest: () => save.towerBest,
    addGold(n) { save.gold += Math.max(0, Math.floor(n)); persist(); },
    setTowerBest(s) { if (s > save.towerBest) { save.towerBest = s; persist(); return true; } return false; },
    spendTicket() { if (save.tickets < meta.tower.cost.value.tickets) return false; save.tickets -= meta.tower.cost.value.tickets; persist(); return true; },
    stageInfo: rec,
    // ---- difficulty (data/meta.json difficulty) ----
    modes: MODES,
    modeOpen(id, mode) {
      const r = rec(id);
      if (mode === 0) return true;
      if (mode === 1) return r.table >= CH.hardNeeds && r.untouched[0];
      return r.table >= CH.hellNeeds && r.untouched[1];
    },
    // the prep picks the highest open mode (Scene_WorldMap::onTouchesEnded @0x56f940)
    defaultMode: id => (api.modeOpen(id, 2) ? 2 : api.modeOpen(id, 1) ? 1 : 0),
    // AUTO for a mode opens with the next mode ("HARD MODE UNLOCKED (NORMAL MODE AUTO PLAY UNLOCKED)", "HELL MODE
    // UNLOCKED (HARD MODE AUTO PLAY UNLOCKED)"); HELL AUTO after all HELL challenges ("HELL MODE AUTO PLAY UNLOCKED")
    autoOpen: (id, mode) => (mode < 2 ? api.modeOpen(id, mode + 1) : api.allHell(id)),
    modeStars: (id, mode) => Math.max(0, Math.min(3, rec(id).table - CH.starTableStep * mode)),
    allHell: id => rec(id).table >= CH.allNeeds && rec(id).untouched[2],
    // stage settings for a run in this mode: monster ATK / walk multipliers and the coin value
    modeSettings(id, mode) {
      const m = MODES[mode];
      return { mode, atkMul: m.atkMul, walkMul: m.walkMul, coin: mode === 2 && api.allHell(id) ? m.coinAll : m.coin };
    },
    modeLabel: (id, mode) => (mode === 2 && api.allHell(id) ? MODES[2].labelAll : MODES[mode].label),
    // ---- boosters (data/meta.json boosters) ----
    items: ITEMS,
    owned: key => save.boosters[key] || 0,
    boosterRowOpen: () => rec(stageIds[GIFT.afterStage - 1]).cleared,
    // the free gift: once, when stage 4 has stars and stage 5 none (Scene_WorldMap::Call_Back_Top_Star @0x55ce44)
    claimGift() {
      if (save.gift || rec(stageIds[GIFT.afterStage - 1]).table < 1 || rec(stageIds[GIFT.afterStage]).table > 0) return false;
      for (const k of GIFT.items) save.boosters[k] = (save.boosters[k] || 0) + GIFT.each;
      save.gift = true;
      persist();
      return true;
    },
    // Call_Back_Buy_Booster_Item @0x567a14: one at a time here (the original also lets you pick a quantity)
    buyBooster(key) {
      const it = ITEMS.find(i => i.key === key);
      if (!it || it.notBuilt) return 'notbuilt';
      if (save.gold < it.price) return 'gold';
      save.gold -= it.price;
      save.boosters[key] = (save.boosters[key] || 0) + 1;
      persist();
      return 'ok';
    },
    // what a stage carries in: min(owned, cap) (Scene_Stage::Init_Data @0x5760cc)
    stageBoosters() {
      const cap = k => ITEMS.find(i => i.key === k).stageCap;
      return { potions: Math.min(api.owned('potion'), cap('potion')), shields: Math.min(api.owned('shield'), cap('shield')), storms: Math.min(api.owned('sword'), cap('sword')) };
    },
    // using one in a stage spends the owned booster at once (SaveBoosterItemAndDestiny after each use)
    spendBooster(key) { save.boosters[key] = Math.max(0, (save.boosters[key] || 0) - 1); persist(); },
    // clearing stage N unlocks N+1 (clip c2 5:20; see meta.stages.unlockRule)
    unlocked: id => {
      const i = stageIds.indexOf(id);
      return i === 0 || (i > 0 && api.stageInfo(stageIds[i - 1]).cleared);
    },
    // highest cleared stage index (-1 if none): where the hero stands on the map
    lastCleared: () => stageIds.reduce((m, id, i) => (api.stageInfo(id).cleared ? i : m), -1),
    // bank a finished run: coins picked up are kept on clear and on fail; stars / best / challenges only on clear.
    // stars = NORMAL stars; table = mode*3 + stars kept at its max; untouched[mode] after a clear with no damage taken
    finishRun(id, { cleared, stars, score, gold, mode = 0, untouched = false }) {
      save.gold += gold;
      const cur = rec(id);
      const ut = cur.untouched.slice();
      if (cleared && untouched) ut[mode] = true;
      save.stages[id] = {
        cleared: cur.cleared || cleared,
        stars: Math.max(cur.stars, cleared && mode === 0 ? stars : 0),
        best: Math.max(cur.best, score),
        table: Math.max(cur.table, cleared && stars > 0 ? mode * CH.starTableStep + stars : 0),
        untouched: ut,
      };
      persist();
    },
    // ---- gems / hearts / shop (data/meta.json shop, hearts, gems) ----
    gems: () => save.gems,
    hearts: () => save.hearts,
    heartsMax: () => save.heartsMax,
    tickets: () => save.tickets,
    // hearts come back one per 10 min while below max, by the device clock (SCH_HEART_SEC @0x53f654; offline catch-up
    // like infoHeartTime::loadHeartTime): returns seconds to the next heart, 0 when full
    tickHearts() {
      if (save.hearts >= save.heartsMax) { save.heartAt = 0; return 0; }
      if (!save.heartAt) { save.heartAt = now() + HEART.regenSec * 1000; persist(); }
      let changed = false;
      while (save.hearts < save.heartsMax && now() >= save.heartAt) { save.hearts++; save.heartAt += HEART.regenSec * 1000; changed = true; }
      if (save.hearts >= save.heartsMax) save.heartAt = 0;
      if (changed) persist();
      return save.heartAt ? Math.max(0, Math.ceil((save.heartAt - now()) / 1000)) : 0;
    },
    // tickets (the TOWER's entry) come back the same way (shop.md: LoadHeart sets tickets like hearts, 10 / 10, 600 s)
    tickTickets() {
      if (save.tickets >= save.ticketsMax) { save.ticketAt = 0; return 0; }
      if (!save.ticketAt) { save.ticketAt = now() + HEART.regenSec * 1000; persist(); }
      let changed = false;
      while (save.tickets < save.ticketsMax && now() >= save.ticketAt) { save.tickets++; save.ticketAt += HEART.regenSec * 1000; changed = true; }
      if (save.tickets >= save.ticketsMax) save.ticketAt = 0;
      if (changed) persist();
      return save.ticketAt ? Math.max(0, Math.ceil((save.ticketAt - now()) / 1000)) : 0;
    },
    canEnter: () => save.hearts >= 1,
    // the heart is taken at the result, win or lose, except stages 1-5 (index <= 4) (FUC_SHOW_RESULT @0x5fa4ac)
    spendHeart(id) {
      if (stageIds.indexOf(id) <= HEART.freeStageIdx) return false;
      if (save.hearts >= save.heartsMax) save.heartAt = now() + HEART.regenSec * 1000;
      save.hearts = Math.max(0, save.hearts - 1);
      persist();
      return true;
    },
    // +1 gem once a day (Scene_MAP_UI::FUC_GET_JEWLE_ONCE_FOR_A_DAY @0x74b3b4)
    dailyGemReady: () => save.gemDay !== today(),
    claimDailyGem() {
      if (save.gemDay === today()) return false;
      save.gemDay = today();
      save.gems += SHOP.dailyGem.value;
      persist();
      return true;
    },
    // shop: GOLD tab i (ids 6-11) and ETC tab i (ids 12-17) (Scene_Shop::Call_Back_Bought_Product @0x732ed0)
    buyGold(i) {
      const pk = SHOP.goldPacks.value[i];
      if (!pk) return 'none';
      if (save.gems < pk.gems) return 'gems';
      save.gems -= pk.gems;
      save.gold += pk.gold;
      persist();
      return 'ok';
    },
    // JEWEL packs: real-money products in the original (Scene_Shop JEWEL tab); the web version grants them free and at once
    buyJewelPack(i) {
      const pk = SHOP.jewelPacks.value[i];
      if (!pk) return 'none';
      save.gems += pk.gems;
      save.iap = (save.iap || 0) + 1;
      persist();
      return 'ok';
    },
    buyEtc(i) {
      const it = SHOP.etc.value[i];
      if (!it) return 'none';
      const ticket = it.key.startsWith('ticket');
      const cur = ticket ? 'tickets' : 'hearts';
      const max = ticket ? 'ticketsMax' : 'heartsMax';
      if (save.gems < it.gems) return 'gems';
      if ((it.key.endsWith('1') || it.key.endsWith('Full')) && save[cur] >= save[max]) return ticket ? 'ticketMax' : 'heartMax';
      save.gems -= it.gems;
      if (it.key.endsWith('1')) save[cur]++;
      else if (it.key.endsWith('Full')) save[cur] = save[max];
      else { save[max]++; save[cur]++; }
      if (save.hearts >= save.heartsMax) save.heartAt = 0;
      persist();
      return 'ok';
    },
    // ---- tutorial flags (TUTO%d, GameData+0x4b5c + i) ----
    tutoDone: n => !!save.tuto[n],
    setTuto(...ns) { for (const n of ns) save.tuto[n] = true; persist(); },
    reset() { save = fresh(); persist(); },
    // test hook: replace the save wholesale
    load(s) { save = cleanSave(s, fresh()); persist(); },
  };
  return api;
}
