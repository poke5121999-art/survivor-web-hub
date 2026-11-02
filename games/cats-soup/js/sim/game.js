// Game state and rules, no THREE: runs in node for tests. Sources: D:/catsoup-ref/rules/{economy,map,cats,specials}.md.
// The view reads `state` and drains `events`.
import * as B from './big.js';
import * as E from './economy.js';
import { CatAI } from './cats.js';

const START = { gold: 200, energy: 500, gem: 200, coin: 2000 }; // Init 1, 2, 3 (economy.md BALANCE), coin Init 4
const FIRST_CATS = [23, 26, 14];                                 // cats.md: the first three cats are fixed types
const LINE_BONUS = { 0: 104, 1: 105, 2: 106 };                    // Herb Stand / Ice Cave / Sauce Fountain
const JAR = 5;                                                   // lucky jar work (specials.md 2.2)
const JAR_SECONDS = 3600;                                        // Init 8
export const SAVE_VERSION = 1;

export class Game {
  // tables: data/tables.json; fields: data/fields.json; rng: () => [0, 1)
  constructor(tables, fields, rng = Math.random) {
    this.t = tables;
    this.fields = fields;
    this.rng = rng;
    this.work = new Map(tables.Work.map(w => [w.index, w]));
    this.food = new Map(tables.Food.map(f => [f.index, f]));
    this.mapSizes = tables.MapSize_Main;
    this.catTypes = tables.CatType.filter(c => !c.isKitty && !c.eventType);
    this.events = [];
    this.state = null;
    this.ai = new CatAI(this);
  }

  // ---- state ----
  fresh() {
    const s = {
      v: SAVE_VERSION, savedAt: Date.now(), clock: 0,
      gold: B.fromNumber(START.gold), energy: B.fromNumber(START.energy), gem: START.gem, coin: START.coin,
      mapSize: 0, maxMapSize: 0, rewardSize: 0, nextId: 1,
      works: [], cats: [], recipes: { 1: 1 }, shelf: [], stats: { sold: 0, built: 0, upgraded: 0, expanded: 0 },
    };
    this.state = s;
    this.place(0, this.emptyCells()[0], 0);
    return s;
  }

  load(s) {
    if (!s || s.v !== SAVE_VERSION) return this.fresh();
    this.state = s;
    this.ai.reset();
    return s;
  }

  save() {
    this.state.savedAt = Date.now();
    return JSON.parse(JSON.stringify(this.state));
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // ---- map ----
  field() { return this.fields[Math.min(8, this.state.mapSize)].field; }
  workAt(x, y) { return this.state.works.find(w => w.pos[0] === x && w.pos[1] === y); }
  emptyCells() { return this.field().filter(([x, y]) => !this.workAt(x, y)); }
  // Spawn.PickLegacyAutoPlacePos: even forest size -> last empty cell, odd -> first (map.md section 3).
  autoCell() {
    const c = this.emptyCells();
    if (!c.length) return null;
    return this.state.mapSize % 2 === 0 ? c[c.length - 1] : c[0];
  }
  ownedCount() { return this.state.works.filter(w => this.work.get(w.a).type !== 21).length; }

  canExpand() {
    const s = this.state;
    const next = this.mapSizes[s.mapSize + 1];
    return !!next && this.ownedCount() >= next.openRequire;
  }

  expand() {
    if (!this.canExpand()) return false;
    const s = this.state;
    s.mapSize += 1;
    s.maxMapSize = Math.max(s.maxMapSize, s.mapSize);
    s.stats.expanded += 1;
    if (s.mapSize > s.rewardSize) {
      const row = this.mapSizes[s.mapSize];
      s.rewardSize = s.mapSize;
      const gold = B.big(row.rewardGold, row.rewardGoldDigit);
      s.gold = B.add(s.gold, gold);
      s.coin += row.rewardValue;
      this.emit('expandReward', { gold, coin: row.rewardValue });
    }
    this.emit('expand', { size: s.mapSize });
    return true;
  }

  // ---- works ----
  copies(a) { return this.state.works.filter(w => w.a === a).length; }
  cookBuilt(line) { return this.state.works.some(w => w.a === E.COOKS[line]); }

  // How many copies a work may have: prep works one per cooking line built, everything else one.
  maxCopies(asset) {
    if (asset.type === 2) return E.COOKS.filter((_, i) => this.cookBuilt(i)).length;
    return 1;
  }

  buildPrice(asset) {
    const n = this.copies(asset.index);
    return E.buildCost(asset, n, this.work.get(7), this.work.get(17));
  }

  // The build menu: main-forest works in table order. A work is offered once every cheaper regular work before it in
  // its tab is built (the next unbuilt one is buyable, the rest show locked), matching the CRAFT list in the video.
  buildList() {
    const rows = this.t.Work.filter(w => w.eventType === 0 && [1, 2, 3, 4].includes(w.type));
    return rows.map(w => ({ w, n: this.copies(w.index), max: this.maxCopies(w), price: this.buildPrice(w) }));
  }

  canBuild(a) {
    const w = this.work.get(a);
    if (!w || this.copies(a) >= this.maxCopies(w) || !this.autoCell()) return false;
    if (w.costGem) return this.state.gem >= w.costGem;
    return B.gte(this.state.gold, this.buildPrice(w));
  }

  build(a, cell = null) {
    if (!this.canBuild(a)) return null;
    const w = this.work.get(a);
    const s = this.state;
    if (w.costGem) s.gem -= w.costGem;
    else s.gold = B.sub(s.gold, this.buildPrice(w));
    const line = w.type === 2 ? this.copies(a) : 0;
    const placed = this.place(a, cell || this.autoCell(), line);
    s.stats.built += 1;
    return placed;
  }

  place(a, cell, line) {
    const s = this.state;
    const w = this.work.get(a);
    const rec = { id: s.nextId++, a, lv: 1, pos: [cell[0], cell[1]], line: w.type === 1 ? E.COOKS.indexOf(a) : line, t: 0, v: 0 };
    if (w.type === 4) rec.v = w.maxValue;          // specials start full (specials.md 2)
    s.works.push(rec);
    if (w.needUnit) this.addCat(rec);
    this.emit('build', { work: rec });
    return rec;
  }

  addCat(work) {
    const s = this.state;
    const n = s.cats.length;
    const type = n < FIRST_CATS.length ? FIRST_CATS[n] : this.catTypes[Math.floor(this.rng() * this.catTypes.length)].index;
    const cat = { id: s.nextId++, type, work: work.id, heart: 0 };
    s.cats.push(cat);
    this.emit('cat', { cat });
    return cat;
  }

  catOf(work) { return this.state.cats.find(c => c.work === work.id); }

  upgradePrice(work) { return E.upgradeCost(this.work.get(work.a), work.lv); }

  upgrade(work, times = 1) {
    let done = 0;
    while (done < times && work.lv < E.LEVEL_MAX) {
      const c = this.upgradePrice(work);
      if (!B.gte(this.state.gold, c)) break;
      this.state.gold = B.sub(this.state.gold, c);
      work.lv += 1;
      done += 1;
    }
    if (done) {
      this.state.stats.upgraded += done;
      this.emit('upgrade', { work, levels: done });
    }
    return done;
  }

  // ---- production ----
  // GetMaterialAmountAll: sum of GradeValue of every work with a cat that feeds this cooking line.
  stars(line) {
    let sum = B.ZERO;
    for (const w of this.state.works) {
      const a = this.work.get(w.a);
      if (!a.needUnit || w.line !== line || (a.type !== 1 && a.type !== 2)) continue;
      const cat = this.catOf(w);
      if (!cat) continue;
      sum = B.add(sum, B.mul(E.gradeValue(a, w.lv), 1 + E.HEART_MATERIAL[cat.heart] / 100));
    }
    return sum;
  }

  lineBonus(line) {
    const b = this.state.works.find(w => w.a === LINE_BONUS[line]);
    return b ? 1 + this.work.get(LINE_BONUS[line]).maxValue / 100 : 1;
  }

  learned(line) {
    return Object.keys(this.state.recipes).map(Number).filter(i => this.food.get(i).type === line);
  }

  price(food, stars = this.stars(food.type)) {
    return E.foodPrice(food, this.state.recipes[food.index] || 1, stars, this.lineBonus(food.type));
  }

  averagePrice(line) {
    const r = this.learned(line);
    if (!r.length) return B.ZERO;
    const stars = this.stars(line);
    let sum = B.ZERO;
    for (const i of r) sum = B.add(sum, this.price(this.food.get(i), stars));
    return B.div(sum, r.length);
  }

  // DataManager.GetAverageGoldIncome: gold per second over the built cooking lines.
  averageIncome() {
    let sum = B.ZERO;
    E.COOKS.forEach((cook, line) => {
      if (!this.cookBuilt(line)) return;
      sum = B.add(sum, B.div(this.averagePrice(line), this.work.get(cook).completeTime));
    });
    return sum;
  }

  cook(work) {
    const line = E.COOKS.indexOf(work.a);
    const r = this.learned(line);
    if (!r.length) return;
    const food = this.food.get(r[Math.floor(this.rng() * r.length)]);
    let price = this.price(food);
    const crit = false; // blessed dishes need the Herb Stand, wand or monthly pass (economy.md section 2)
    if (crit) price = B.mul(price, E.CRITICAL_FACTOR);
    const item = { a: food.index, p: price, c: crit };
    const s = this.state;
    s.shelf.push(item);
    this.emit('food', { item, work });
    if (s.shelf.length > E.SHELF) {
      const old = s.shelf.shift();
      this.sellItem(old, E.SALE_FACTOR, true);
    }
  }

  sellItem(item, factor = 1, auto = false) {
    const gold = B.mul(item.p, factor);
    this.state.gold = B.add(this.state.gold, gold);
    this.state.stats.sold += 1;
    this.emit('sell', { item, gold, auto });
    return gold;
  }

  sell(i) {
    const s = this.state;
    if (i < 0 || i >= s.shelf.length) return null;
    const [item] = s.shelf.splice(i, 1);
    return this.sellItem(item);
  }

  sellAll() {
    const s = this.state;
    let total = B.ZERO;
    while (s.shelf.length) total = B.add(total, this.sellItem(s.shelf.shift()));
    return total;
  }

  // ---- recipes (economy.md section 3) ----
  recipeList(line) {
    return this.t.Food.filter(f => f.type === line && f.index < 999)
      .map(f => ({ f, lv: this.state.recipes[f.index] || 0, open: this.recipeOpen(f) }));
  }

  recipeCost(f) {
    const lv = this.state.recipes[f.index] || 0;
    return E.recipeCost(f, lv);
  }

  recipeOpen(f) {
    return f.workIndex === E.COOKS[f.type] || this.state.works.some(w => w.a === f.workIndex);
  }

  upgradeRecipe(index, times = 1) {
    const f = this.food.get(index);
    if (!f || !this.recipeOpen(f) || !this.cookBuilt(f.type)) return 0;
    let done = 0;
    while (done < times) {
      const lv = this.state.recipes[index] || 0;
      if (lv >= E.RECIPE_MAX) break;
      const c = E.recipeCost(f, lv);
      if (!B.gte(this.state.energy, c)) break;
      this.state.energy = B.sub(this.state.energy, c);
      this.state.recipes[index] = lv + 1;
      done += 1;
    }
    if (done) this.emit('recipe', { index, level: this.state.recipes[index] });
    return done;
  }

  // ---- rest and specials ----
  restEnergy(work) {
    return B.mul(E.energyAmount(this.work.get(work.a), work.lv), work.v);
  }

  // A cat finished resting here: AddEnergyByRest pays every charge accumulated so far.
  claimRest(work) {
    if (!work.v) return B.ZERO;
    const e = this.restEnergy(work);
    work.v = 0;
    this.state.energy = B.add(this.state.energy, e);
    this.emit('energy', { work, energy: e });
    return e;
  }

  jarGold() { return B.mul(this.averageIncome(), JAR_SECONDS); }

  claimJar(work) {
    if (work.a !== JAR || work.v < 1) return null;
    work.v = 0;
    work.t = 0;
    const g = this.jarGold();
    this.state.gold = B.add(this.state.gold, g);
    this.emit('jar', { work, gold: g });
    return g;
  }

  // ---- time ----
  tick(dt) {
    const s = this.state;
    s.clock += dt;
    for (const w of s.works) {
      const a = this.work.get(w.a);
      if (a.type === 1) {
        if (!this.catOf(w)) continue;
        w.t += dt;
        while (w.t >= a.completeTime) { w.t -= a.completeTime; this.cook(w); }
      } else if (a.type === 3) {
        w.t += dt;
        while (w.t >= E.REST_TICK) { w.t -= E.REST_TICK; w.v += 1; }
      } else if (a.type === 4 && a.completeTime > 0 && !a.dailyCount) {
        if (w.v >= a.maxValue) { w.t = 0; continue; }
        w.t += dt;
        while (w.t >= a.completeTime && w.v < a.maxValue) { w.t -= a.completeTime; w.v += 1; }
      }
    }
    this.ai.tick(dt);
  }

  // UpdateWorkTimeAll on return (economy.md section 6): dishes up to the free shelf slots, the rest sold at half the
  // average price; rest energy at half. Returns the welcome-back totals.
  offline(seconds) {
    const s = this.state;
    const sec = Math.min(seconds, E.OFFLINE_MINUTES * 60);
    let gold = B.ZERO, energy = B.ZERO;
    if (sec < 30) return null;
    for (const w of s.works) {
      const a = this.work.get(w.a);
      if (a.type === 1 && this.catOf(w)) {
        const n = Math.floor((w.t + sec) / a.completeTime);
        w.t = (w.t + sec) % a.completeTime;
        const room = Math.max(0, E.SHELF - s.shelf.length);
        const m = Math.min(n, room);
        for (let i = 0; i < m; i++) this.cook(w);
        if (n > m) gold = B.add(gold, B.mul(this.averagePrice(E.COOKS.indexOf(w.a)), (n - m) * E.SALE_FACTOR));
      } else if (a.type === 3) {
        const n = Math.floor((w.t + sec) / E.REST_TICK);
        w.t = (w.t + sec) % E.REST_TICK;
        energy = B.add(energy, B.mul(E.energyAmount(a, w.lv), n * E.SALE_FACTOR));
      } else if (a.type === 4 && a.completeTime > 0 && !a.dailyCount) {
        w.v = Math.min(a.maxValue, w.v + Math.floor((w.t + sec) / a.completeTime));
      }
    }
    s.gold = B.add(s.gold, gold);
    s.energy = B.add(s.energy, energy);
    this.events = this.events.filter(e => e.type !== 'food' && e.type !== 'sell');
    return { seconds: sec, gold, energy };
  }
}
