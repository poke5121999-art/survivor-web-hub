// Feature "equip" (sim part): cat outfits and tools. Contract: js/sim/registry.js. Rules and citations: D:/catsoup-ref/rules/equip.md.
//
// State game.state.equip = { items: [{ i: Equip index, exp, lv }], worn: { catId: [hat, cloth, acce1, acce2, pet1, pet2] }, ups: [] }
//   An item is owned from level 1. Experience comes from draws (8..12 per random draw, 10 for a granted item); the level rises
//   by itself while exp >= MaxExp (ApplyEquipLevelsFromExp). `ups` lists the indexes that levelled since the player last looked
//   (the equipment level-up list popup, Popup_EquipLevelUpList). Worn slot 0 means empty.
// Tables come from data/tables.json (Equip, Ability, LFactor, AcceType, Init).
const SLOTS = 6;
const START = { 0: 0, 1: 1, 2: 2, 3: 4 };      // Entity_Equip.Param.DataSlotStartIndex by EquipTypeKind (hat, cloth, accessory, friends)
const KITTY = new Set([10, 11, 12]);            // IsKittyEquip: outfits of the kitties, which this build does not have
const INIT_MIN = 5, INIT_MAX = 6, INIT_FIX = 25, INIT_CHEST = 23; // MINGACHACOUNT, MAXGACHACOUNT, FIXGACHACOUNT, TreasureOpen_Ads

const state = g => g.state.equip;
function tables(g) {
  if (!g.equipTable) {
    g.equipTable = new Map(g.t.Equip.map(e => [e.index, e]));
    g.equipAbility = new Map(g.t.Ability.map(a => [a.index, a]));
    g.equipAcce = new Map(g.t.AcceType.map(a => [a.hideAcce, a]));
  }
  return g.equipTable;
}
const asset = (g, i) => tables(g).get(i);

export const maxExp = (lv, max) => (lv < max ? lv * 10 + 10 : 0);   // GameExtensions.MaxExp, DataManager.GetEquipMaxExp

export default {
  id: 'equip',
  data: ['equip'],

  init(game) {
    if (!game.state.equip) game.state.equip = { items: [], worn: {}, ups: [] };
    const s = game.state.equip;
    s.ups = s.ups || [];
    tables(game);
  },

  // ---- lookups ----
  asset(game, i) { return asset(game, i) || null; },
  slotStart(game, i) { const a = asset(game, i); return a ? START[a.type] : -1; },
  isKitty(game, i) { const a = asset(game, i); return !!a && KITTY.has(a.type); },
  // GameExtensions.MaxLevel: the Ability row's maxLv.
  maxLevel(game, i) { const a = asset(game, i); return a ? game.equipAbility.get(a.ability).maxLv : 0; },
  entry(game, i) { return state(game).items.find(d => d.i === i) || null; },
  level(game, i) { const d = this.entry(game, i); return d ? d.lv : 0; },
  owned(game, i) { return this.level(game, i) >= 1; },
  maxExpOf(game, i) { const d = this.entry(game, i); return maxExp(d ? d.lv : 0, this.maxLevel(game, i)); },
  ownedList(game) { return state(game).items.filter(d => d.lv >= 1); },

  // ---- gaining ----
  // DataManager.AddEquipData + ApplyEquipLevelsFromExp (DataManager.c:39694, :41363). Returns the number of levels gained.
  addExp(game, i, exp) {
    const s = state(game);
    let d = this.entry(game, i);
    if (!d) { d = { i, exp: 0, lv: 0 }; s.items.push(d); }
    d.exp += exp;
    const max = this.maxLevel(game, i);
    let gained = 0;
    for (;;) {
      const need = maxExp(d.lv, max);
      if (need < 1 || d.exp < need) break;
      d.exp -= need;
      d.lv += 1;
      gained += 1;
    }
    if (gained) {
      if (!s.ups.includes(i)) s.ups.push(i);
      game.emit('equipLevel', { index: i, level: d.lv, gained });
    }
    return gained;
  },

  // DataManager.SelectGachaEquip (DataManager.c:33496): the cards a random draw can give.
  pool(game) {
    const out = [];
    for (const e of game.t.Equip) {
      if (KITTY.has(e.type) || e.type === 3 || e.index === 0 || e.eventType < 0) continue;
      const d = this.entry(game, e.index);
      if (d && (d.lv >= 1 || d.exp >= 1)) {
        const max = this.maxLevel(game, e.index);
        if (d.lv >= max) continue;
        if (d.lv + 1 < max || d.exp < maxExp(d.lv, max)) out.push(e.index);
      } else if (e.eventType === 0) out.push(e.index);
    }
    return out;
  },

  // DataManager.AddNewRndEquip (DataManager.c:66648) with equipIndex 0: `count` uniform picks from the pool, each worth
  // Random.Range(MINGACHACOUNT, MAXGACHACOUNT) exp (the int overload excludes the top: 8..12). Returns [{index, exp, levels}].
  draw(game, count = 1) {
    const out = [];
    const lo = game.t.Init[INIT_MIN].value, hi = game.t.Init[INIT_MAX].value;
    for (let n = 0; n < count; n++) {
      const pool = this.pool(game);
      if (!pool.length) break;
      const i = pool[Math.floor(game.rng() * pool.length)];
      const exp = lo + Math.floor(game.rng() * (hi - lo));
      out.push({ index: i, exp, levels: this.addExp(game, i, exp) });
    }
    return out;
  },

  // AddNewRndEquip with a given equipIndex: FIXGACHACOUNT (10) exp, which is exactly the first level.
  grant(game, i) {
    if (!asset(game, i) || this.isKitty(game, i)) return null;
    const exp = game.t.Init[INIT_FIX].value;
    return { index: i, exp, levels: this.addExp(game, i, exp) };
  },

  // The "random equipment" reward (type 5): `n` draws, default Init[23] (DataManager.GetReward_Inner); extra.equip (or index) names one.
  rewards: {
    5(game, n, extra = {}) {
      const f = game.feat.equip;
      const named = extra.equip || extra.index;   // the trader and quest 22 name the outfit (extra.equip), chests leave it random
      const got = named ? [f.grant(game, named)].filter(Boolean) : f.draw(game, n || game.t.Init[INIT_CHEST].value);
      return got.length ? { type: 5, value: got.length, items: got } : null;
    },
  },

  // The chest as the original opens it: gems 3 draws (Init[24]) or an ad 1 draw (Init[23]); the ad is dropped here.
  openChest(game, count) { return this.draw(game, count || game.t.Init[INIT_CHEST].value); },

  // The level-up list popup reads and clears this.
  takeLevelUps(game) { const s = state(game); const l = s.ups.slice(); s.ups.length = 0; return l; },

  // ---- wearing ----
  worn(game, catId) {
    const s = state(game);
    if (!s.worn[catId]) s.worn[catId] = new Array(SLOTS).fill(0);
    return s.worn[catId];
  },
  // Which cat wears item i (msg_otherEquip): catId or null.
  wearer(game, i) {
    for (const [id, slots] of Object.entries(state(game).worn)) if (slots.includes(i)) return +id;
    return null;
  },
  // UI_FittingRoom.ValidTwoAcce: two accessories clash when the position of either lists the other's (AcceType.unableType).
  clash(game, a, b) {
    const pa = asset(game, a), pb = asset(game, b);
    if (!pa || !pb) return false;
    const ta = game.equipAcce.get(pa.hideAcce), tb = game.equipAcce.get(pb.hideAcce);
    return !!((ta && ta.unableType.includes(pb.hideAcce)) || (tb && tb.unableType.includes(pa.hideAcce)));
  },
  // Slot an item goes to: its own for hat, cloth; the asked one of the two for accessories (2, 3) and friends (4, 5).
  slotFor(game, i, want) {
    const a = asset(game, i);
    if (!a || KITTY.has(a.type)) return -1;
    const s = START[a.type];
    return a.type >= 2 && want === 1 ? s + 1 : s;
  },
  // wear(game, catId, i, {slot: 0|1 (second accessory / friend), steal: take it from the cat that wears it}).
  // Returns {ok, slot} or {ok: false, reason: 'unowned' | 'unknown' | 'in_use' | 'unable', by | with}.
  wear(game, catId, i, opt = {}) {
    if (!game.state.cats.some(c => c.id === catId)) return { ok: false, reason: 'unknown' };
    const a = asset(game, i);
    if (!a || KITTY.has(a.type)) return { ok: false, reason: 'unknown' };
    if (i !== 0 && !this.owned(game, i)) return { ok: false, reason: 'unowned' };
    const slot = this.slotFor(game, i, opt.slot);
    const mine = this.worn(game, catId);
    const by = this.wearer(game, i);
    if (by != null && by !== catId && !opt.steal) return { ok: false, reason: 'in_use', by };
    if (a.type === 2) {
      const other = mine[slot === 2 ? 3 : 2];
      if (other && this.clash(game, i, other)) return { ok: false, reason: 'unable', with: other };
    }
    if (by != null && by !== catId) { const w = this.worn(game, by); w[w.indexOf(i)] = 0; }
    const at = mine.indexOf(i);
    if (at >= 0) mine[at] = 0;
    if (i === 0) mine[slot] = 0;               // body0 "none" is the bare cat
    else mine[slot] = i;
    game.emit('equip', { cat: catId, index: i, slot, on: i !== 0 });
    return { ok: true, slot };
  },
  unwear(game, catId, slot) {
    const mine = this.worn(game, catId);
    const was = mine[slot];
    if (!was) return false;
    mine[slot] = 0;
    game.emit('equip', { cat: catId, index: was, slot, on: false });
    return true;
  },
  unwearAll(game, catId) {
    const mine = this.worn(game, catId);
    let n = 0;
    mine.forEach((v, k) => { if (v) { mine[k] = 0; n++; } });
    if (n) game.emit('equip', { cat: catId, index: 0, slot: -1, on: false });
    return n;
  },

  // ---- effect ----
  // Value of one item's ability at its level: Ability.initValue * LFactor[lv-1] (DataManager.GetAbilityValue, :56661).
  abilityOf(game, i) {
    const a = asset(game, i);
    const lv = this.level(game, i);
    if (!a || lv < 1) return 0;
    return game.equipAbility.get(a.ability).initValue * game.t.LFactor[lv - 1].value;
  },
  // dic_ability_final from equipment (UpdateAbilityAll): ability index -> percent, summed over every OWNED item whether
  // worn or not ("the effect is always applied, even when not worn", msg_equipItemEffect). The economy adds it as (1 + v/100).
  abilities(game) {
    const out = {};
    for (const d of state(game).items) {
      if (d.lv < 1) continue;
      const a = asset(game, d.i);
      out[a.ability] = (out[a.ability] || 0) + this.abilityOf(game, d.i);
    }
    return out;
  },

  // Core multiplier hook (economy.md 68-69, 84-85). Only the abilities that change a dish price or rest energy:
  //   'price'  arg = Food row: Ability type 3 with subIndex == food.index -> 1 + sum/100 (recipe sale price, GetFoodPriceFactor)
  //   'energy' arg = rest work record: Ability type 1, index 100..166 ("recipe point gain up"), subIndex == work.a -> 1 + sum/100
  // Type 1 index 0..66 (work sale price) acts inside GradeValue of the cooking work, not on a dish, so it is not here.
  mult(game, kind, arg) {
    const ab = this.abilities(game);
    let sum = 0;
    for (const [k, v] of Object.entries(ab)) {
      const a = game.equipAbility.get(+k);
      if (!a) continue;
      if (kind === 'price' && a.type === 3 && a.subIndex === arg.index) sum += v;
      else if (kind === 'energy' && a.type === 1 && a.index >= 100 && a.subIndex === arg.a) sum += v;
    }
    return 1 + sum / 100;
  },
};
