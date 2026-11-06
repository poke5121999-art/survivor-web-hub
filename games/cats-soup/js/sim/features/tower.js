// Feature "tower" (sim part): the Cat Tower. Rules: D:/catsoup-ref/rules/tower.md (citations there). Pure JS, no DOM.
// State game.state.tower, tables data/tower.json (tools/export_tower.py).
import * as B from '../big.js';

export const COIN = 4, GEM = 3;
export const TOWER_WORK = 15;          // the rest work that must be built before the tower opens (UI_Stage.c:49230)
export const FLOORS = 10;              // floors 1..10 over the lobby (layer 0)
export const WALL_H = 8;               // rows of a wall grid (inferred, the original reads it from the scene)
export const TICK_SECONDS = 3600;      // Init 95 TowerOfflineMinTime (1) x 3600  (DataManager.c:48396)
export const MAX_TICKS = 72;           // Init 94 TowerOfflineMaxCount
export const TICK_FACTOR = 450;        // Init 96 Income_TowerOffline: one tick pays 450 s of average income
export const ADS_FACTOR = 2;           // Init 106 TowerOfflineAdsFactor
export const GUIDE_REWARD_PROP = 201;  // TowerMission rewardType 201 = a TowerProp (value = Entity_TowerProp index)
const VISIT_TYPES = [4, 5, 6];         // TowerMissionType VisitOther / FavoriteOther / LikeOther: server features

// Prop type -> where it sits. 1 floor tile, 2 wall paper (both applied to the whole layer), 3 floor furniture,
// 4 wall furniture, 5 carpet, 6 pattern (layer overlay), 7 floor dot. (read: Tower_Props / TowerExtensions switch on
// type; names from lang title_prop_modern_16 "Tuong van phong" = type 2, _17 "San go" = type 1.)
export const SURFACE = { 1: 'floor', 2: 'wall', 6: 'pattern' };
export const GRIDS = { 3: 'f', 4: 'w', 5: 'c', 7: 'd' };

const fresh = () => ({
  open: false, layers: {}, have: {}, nextId: 1, cats: {},
  mission: { cur: 0, n: 0, ready: false },
  off: { t: 0, stored: 0, gold: B.ZERO },
  stats: { bought: 0, placed: 0, photos: 0 },
});

const layerFresh = () => ({ area: 0, areaMax: 0, cats: 0, floor: 0, wall: 0, pattern: 0, name: '', props: [] });

export function ensure(game) {
  const s = game.state;
  if (!s.tower) s.tower = fresh();
  const t = s.tower;
  for (const [k, v] of Object.entries(fresh())) if (t[k] == null) t[k] = v;
  return t;
}

// ---- tables ----
const D = game => game.data.tower;
export const prop = (game, i) => D(game).props.find(p => p.index === i);
export function infoRow(game, type, layer) { return D(game).info.find(r => r.type === type && r.layer === layer); }
const propMap = new WeakMap();
const propOf = (game, i) => {
  let m = propMap.get(D(game));
  if (!m) { m = new Map(D(game).props.map(p => [p.index, p])); propMap.set(D(game), m); }
  return m.get(i);
};
export { propOf };

export const S = game => ensure(game);
export const hasLayer = (game, n) => !!S(game).layers[n];
export const isOpen = game => S(game).open;

// ---- sizes, cat counts ----
export const gridSize = (game, n) => infoRow(game, 1, n).value[S(game).layers[n].area];
export const catCap = (game, n) => infoRow(game, 2, n).value[S(game).layers[n].cats];

// Cost paid in a TowerInfo currency: 3 gems, 4 furniture coins (costType of the row).
function pay(game, type, value) {
  const s = game.state;
  if (type === GEM) { if (s.gem < value) return false; s.gem -= value; return true; }
  if (type === COIN) { if (s.coin < value) return false; s.coin -= value; return true; }
  return false;
}
export const canPay = (game, type, value) => (type === GEM ? game.state.gem : game.state.coin) >= value;

// ---- opening and floors ----
// UI_Stage.UIOn_CatTower (UI_Stage.c:49230): without layers and without work 15 -> "build it first"; otherwise pay the
// floor-1 build row, AddLayerData(0) and (1) (UI_Stage.c:9176-9186).
export function openCost(game) { const r = infoRow(game, 3, 1); return { type: r.costType[1], value: r.cost[1] }; }
export function canOpen(game) {
  return !isOpen(game) && game.copies(TOWER_WORK) > 0 && canPay(game, openCost(game).type, openCost(game).value);
}
export function open(game) {
  const t = S(game);
  if (t.open || game.copies(TOWER_WORK) < 1) return false;
  const c = openCost(game);
  if (!pay(game, c.type, c.value)) return false;
  t.open = true;
  t.layers[0] = layerFresh();
  t.layers[1] = layerFresh();
  t.off.t = 0; t.off.stored = 0; t.off.gold = B.ZERO;
  // The lobby is created with the Quokka butler NPC placed (EnsureLobbyFloorNPCProp, DataManager.c:86257), which is what
  // guide mission 0 "place something in the lobby" counts (inferred).
  count(game, 2, { floor: 0, prop: 9999 });
  game.emit('towerOpen', {});
  return true;
}

export function floorCost(game, n) { const r = infoRow(game, 3, n); return r ? { type: r.costType[1], value: r.cost[1] } : null; }
export function canBuildFloor(game, n) {
  const t = S(game);
  return t.open && n >= 2 && n <= FLOORS && !t.layers[n] && !!t.layers[n - 1];
}
export function buildFloor(game, n) {
  if (!canBuildFloor(game, n)) return false;
  const c = floorCost(game, n);
  if (!pay(game, c.type, c.value)) return false;
  S(game).layers[n] = layerFresh();
  game.emit('towerFloor', { floor: n });
  return true;
}
export const floorList = game => Object.keys(S(game).layers).map(Number).sort((a, b) => a - b);

// UI_TowerExpand / Tower_UserData.AppendState: level n+1 needs the row's price; floors above 1 need the floor below.
// The size is a choice among the levels already bought; going down returns what falls outside to storage.
export function sizeInfo(game, n) {
  const L = S(game).layers[n], r = infoRow(game, 1, n);
  return { level: L.area, max: L.areaMax, levels: r.max, values: r.value.slice(0, r.max),
    next: L.areaMax + 1 < r.max ? { type: r.costType[L.areaMax + 1], value: r.cost[L.areaMax + 1] } : null };
}
export function setSize(game, n, lv) {
  const t = S(game), L = t.layers[n];
  if (!L || lv < 0) return false;
  const r = infoRow(game, 1, n);
  if (lv >= r.max || lv === L.area) return false;
  if (lv > L.areaMax) {
    if (lv !== L.areaMax + 1 || (n >= 2 && !t.layers[n - 1])) return false;
    if (!pay(game, r.costType[lv], r.cost[lv])) return false;
    L.areaMax = lv;
  }
  L.area = lv;
  const size = r.value[lv];
  for (const p of L.props.slice()) if (!inBounds(game, n, p)) removeProp(game, n, p);
  game.emit('towerSize', { floor: n, level: lv, size });
  return true;
}

export function catInfo(game, n) {
  const L = S(game).layers[n], r = infoRow(game, 2, n);
  return { level: L.cats, levels: r.max, values: r.value.slice(0, r.max),
    next: L.cats + 1 < r.max && (n < 2 || !!S(game).layers[n - 1]) ? { type: r.costType[L.cats + 1], value: r.cost[L.cats + 1] } : null };
}
export function buyCatSlot(game, n) {
  const L = S(game).layers[n];
  const i = L && catInfo(game, n);
  if (!i || !i.next || !pay(game, i.next.type, i.next.value)) return false;
  L.cats += 1;
  game.emit('towerCats', { floor: n, cap: catCap(game, n) });
  return true;
}

// ---- cats ----
export const catsOn = (game, n) => game.state.cats.filter(c => S(game).cats[c.id] === n);
export function placeCat(game, catId, n) {
  const t = S(game);
  if (!t.layers[n] || !game.state.cats.some(c => c.id === catId)) return false;
  if (t.cats[catId] === n) return true;
  if (catsOn(game, n).length >= catCap(game, n)) return false;
  t.cats[catId] = n;
  game.emit('towerCat', { cat: catId, floor: n });
  count(game, 1, { floor: n });
  return true;
}
export function removeCat(game, catId) {
  const t = S(game);
  if (t.cats[catId] == null) return false;
  delete t.cats[catId];
  game.emit('towerCatOut', { cat: catId });
  return true;
}

// ---- props: ownership ----
export const have = (game, i) => S(game).have[i] || 0;
export function arranged(game, i) {
  let n = 0;
  for (const L of Object.values(S(game).layers)) {
    for (const p of L.props) if (p.p === i) n += 1;
    if (L.floor === i) n += 1;
    if (L.wall === i) n += 1;
    if (L.pattern === i) n += 1;
  }
  return n;
}
// Surfaces (type 1, 2, 6) are applied to a layer, not stood on a cell; a layer using one keeps it from being sold.
export const spare = (game, i) => Math.max(0, have(game, i) - arranged(game, i));
export function addProp(game, i, n = 1) {
  const t = S(game);
  t.have[i] = (t.have[i] || 0) + n;
  return t.have[i];
}
export const inShop = (game, p) => p.eventType === 0;   // UI_TowerCatalog+_c.c:41: event items need their event
export function shopList(game) { return D(game).props.filter(p => inShop(game, p)); }
export function canBuy(game, i, qty = 1) {
  const p = propOf(game, i);
  return !!p && S(game).open && inShop(game, p) && have(game, i) + qty <= p.maxStorage && canPay(game, p.costType, p.cost * qty);
}
export function buy(game, i, qty = 1) {
  if (!canBuy(game, i, qty)) return false;
  const p = propOf(game, i);
  pay(game, p.costType, p.cost * qty);
  addProp(game, i, qty);
  S(game).stats.bought += qty;
  game.emit('towerBuy', { prop: i, qty });
  count(game, 3, {});
  return true;
}
// UI_TowerPropSell.c:100 (read): ResaleLimitType 0 sells nothing, 1 sells every spare copy, 2 sells spare copies but
// keeps one while none is placed.
export function sellable(game, i) {
  const p = propOf(game, i);
  if (!p) return 0;
  const sp = spare(game, i);
  if (p.resaleLimit === 1) return sp;
  if (p.resaleLimit === 2) return arranged(game, i) === 0 ? Math.max(0, have(game, i) - 1) : sp;
  return 0;
}
export function sell(game, i, qty = 1) {
  const p = propOf(game, i);
  if (!p || qty < 1 || qty > sellable(game, i)) return false;
  S(game).have[i] -= qty;
  if (S(game).have[i] <= 0) delete S(game).have[i];
  game.state.coin += p.resale * qty;
  game.emit('towerSell', { prop: i, qty, coin: p.resale * qty });
  return true;
}

// ---- props: placement ----
// Footprint [w, h] on the prop's own grid: floor furniture X by Z, carpets X by Y, wall pieces X (along) by Y (up),
// dots 1x1 (sizes in TowerProp, grid names from GridCoord in dump.cs:59125).
export function footprint(p, rot = 0) {
  if (p.type === 3) return rot ? [p.sz, p.sx] : [p.sx, p.sz];
  if (p.type === 5) return rot ? [p.sy, p.sx] : [p.sx, p.sy];
  if (p.type === 4) return [p.sx, p.sy];
  return [1, 1];
}
export const gridOk = (p, g) => (p.type === 4 ? g === 'wl' || g === 'wr' : g === GRIDS[p.type]);
export function bounds(game, n, grid) {
  const size = gridSize(game, n);
  return grid[0] === 'w' ? [size, WALL_H] : [size, size];
}
function inBounds(game, n, o) {
  const p = propOf(game, o.p), [w, h] = footprint(p, o.r);
  const [W, H] = bounds(game, n, o.g);
  return o.x >= 0 && o.y >= 0 && o.x + w <= W && o.y + h <= H;
}
const overlap = (a, aw, ah, b, bw, bh) => a.x < b.x + bw && b.x < a.x + aw && a.y < b.y + bh && b.y < a.y + ah;
export function fits(game, n, idx, g, x, y, r = 0, skip = null) {
  const L = S(game).layers[n], p = propOf(game, idx);
  if (!L || !p || !gridOk(p, g)) return false;
  const [w, h] = footprint(p, r);
  const [W, H] = bounds(game, n, g);
  if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
  if (p.forceEdge && y !== 0) return false;
  for (const o of L.props) {
    if (o === skip || o.g !== g) continue;
    const [ow, oh] = footprint(propOf(game, o.p), o.r);
    if (overlap({ x, y }, w, h, o, ow, oh)) return false;
  }
  return true;
}
export function findSpot(game, n, idx, r = 0) {
  const p = propOf(game, idx);
  const grids = p.type === 4 ? ['wl', 'wr'] : [GRIDS[p.type]];
  for (const g of grids) {
    const [W, H] = bounds(game, n, g);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fits(game, n, idx, g, x, y, r)) return { g, x, y, r };
  }
  return null;
}

// Put one spare copy on a layer. Surfaces (floor tile, wall paper, pattern) replace the layer's current one.
export function place(game, n, idx, at = null) {
  const t = S(game), L = t.layers[n], p = propOf(game, idx);
  if (!L || !p || spare(game, idx) < 1) return false;
  if (SURFACE[p.type]) {
    L[SURFACE[p.type]] = idx;
    game.emit('towerPlace', { floor: n, prop: idx, surface: true });
    count(game, 2, { floor: n, prop: idx });
    t.stats.placed += 1;
    return true;
  }
  const spot = at && fits(game, n, idx, at.g, at.x, at.y, at.r || 0) ? { r: 0, ...at } : findSpot(game, n, idx);
  if (!spot) return false;
  const o = { id: t.nextId++, p: idx, g: spot.g, x: spot.x, y: spot.y, r: spot.r || 0 };
  L.props.push(o);
  t.stats.placed += 1;
  game.emit('towerPlace', { floor: n, prop: idx, obj: o });
  count(game, 2, { floor: n, prop: idx });
  return o;
}
export function move(game, n, o, g, x, y, r = o.r) {
  if (!fits(game, n, o.p, g, x, y, r, o)) return false;
  Object.assign(o, { g, x, y, r });
  game.emit('towerMove', { floor: n, obj: o });
  return true;
}
// Turn a floor piece a quarter turn about its footprint (reversal, TowerProp column); stays put when the new footprint collides.
export function rotate(game, n, o) {
  const p = propOf(game, o.p);
  if (p.type !== 3 && p.type !== 5) return false;
  return move(game, n, o, o.g, o.x, o.y, o.r ? 0 : 1);
}
function removeProp(game, n, o) {
  const L = S(game).layers[n];
  const i = L.props.indexOf(o);
  if (i >= 0) L.props.splice(i, 1);
}
export function store(game, n, o) {
  if (!S(game).layers[n] || !S(game).layers[n].props.includes(o)) return false;
  removeProp(game, n, o);
  game.emit('towerStore', { floor: n, prop: o.p });
  return true;
}
// msg_towerpropKeepAll: every decoration of the layer back to storage.
export function storeAll(game, n) {
  const L = S(game).layers[n];
  if (!L) return 0;
  const k = L.props.length;
  for (const o of L.props.slice()) store(game, n, o);
  return k;
}

// ---- accumulated reward ("Qua Thap meo", Popup_AccumulateReward) ----
// Every TICK_SECONDS adds one tick of avg-income x 450 up to 72 ticks stored; a claim pays them (x2 with the ad button).
export function ticks(game) {
  const t = S(game);
  return t.open ? Math.min(MAX_TICKS, Math.floor(t.off.t / TICK_SECONDS)) : 0;   // GetTowerOfflinePotentialCount
}
export const tickGold = game => B.mul(game.averageIncome(), TICK_FACTOR);          // CalcTowerOfflineOneTickGold
// SettleTowerOffline: gold += (potential - stored) x tick gold, only when a tick gold exists.
export function settle(game) {
  const t = S(game), n = ticks(game), add = n - t.off.stored;
  const g = tickGold(game);
  if (!t.open || add <= 0 || B.isZero(g)) return 0;
  t.off.gold = B.add(t.off.gold, B.mul(g, add));
  t.off.stored = n;
  return add;
}
export function pending(game) { settle(game); return S(game).off.gold; }
export const isMax = game => ticks(game) >= MAX_TICKS;
export const canClaimIdle = game => { settle(game); return !B.isZero(S(game).off.gold); };
export function claimIdle(game, ads = false) {
  const t = S(game);
  if (!canClaimIdle(game)) return null;
  let gold = t.off.gold;
  if (ads) gold = B.mul(gold, ADS_FACTOR);
  game.reward(1, gold);
  t.off = { t: 0, stored: 0, gold: B.ZERO };
  game.emit('towerIdle', { gold, ads });
  count(game, 7, {});
  return gold;
}

// ---- guide mission chain (TowerMission, 23 rows) ----
export const missionRow = game => { const m = S(game).mission; return m.cur >= 0 ? D(game).missions.find(r => r.index === m.cur) : null; };
export const missionDone = game => S(game).mission.cur < 0;
// Progress counters: a matching event adds to the current row; floor filter missionValue1, prop filter missionValue2
// (9999 = any). Visit-type rows depend on other players' towers and are met on arrival (server feature left out).
function count(game, type, f) {
  const t = S(game), m = t.mission, row = missionRow(game);
  if (!row || m.ready || row.missionType !== type) return;
  if (type === 1 || type === 2) { if (f.floor !== row.missionValue1) return; }
  if (type === 2 && row.missionValue2 !== 9999 && row.missionValue2 !== f.prop) return;
  m.n += 1;
  if (m.n >= row.missionCount) m.ready = true;
}
export function syncMission(game) {
  const m = S(game).mission, row = missionRow(game);
  if (row && VISIT_TYPES.includes(row.missionType) && !m.ready) { m.n = row.missionCount; m.ready = true; }
}
export const canClaimMission = game => { syncMission(game); return S(game).mission.ready; };
export function claimMission(game) {
  if (!canClaimMission(game)) return null;
  const m = S(game).mission, row = missionRow(game);
  const given = game.reward(row.rewardType, row.rewardValue);
  m.cur = row.nextMission > 0 ? row.nextMission : -1;
  m.n = 0; m.ready = false;
  game.emit('towerMission', { index: row.index, reward: given });
  syncMission(game);
  return given;
}
export function photo(game) {
  S(game).stats.photos += 1;
  game.emit('towerPhoto', {});
  count(game, 8, {});
}

const feature = {
  id: 'tower',
  data: ['tower'],
  init(game) { ensure(game); },
  tick(game, dt) { const t = game.state.tower; if (t && t.open) t.off.t += dt; },
  offline(game, sec, raw) { const t = game.state.tower; if (t && t.open) t.off.t += raw; },
  // TowerMission rewardType 201: a TowerProp copy.
  rewards: { [GUIDE_REWARD_PROP]: (game, value) => { addProp(game, value, 1); return { type: GUIDE_REWARD_PROP, value }; } },
};

// Actions for the view and for tests: game.feat.tower.<name>(game, ...).
Object.assign(feature, {
  S, ensure, isOpen, hasLayer, openCost, canOpen, open, floorCost, canBuildFloor, buildFloor, floorList, gridSize, catCap,
  sizeInfo, setSize, catInfo, buyCatSlot, catsOn, placeCat, removeCat, have, arranged, spare, addProp, shopList, canBuy, buy,
  sellable, sell, footprint, fits, findSpot, place, move, rotate, store, storeAll, ticks, tickGold, settle, pending, claimIdle,
  canClaimIdle, missionRow, canClaimMission, claimMission, photo, propOf,
});
export default feature;
