// Save data in localStorage. Every read tolerates garbage; every write tolerates a blocked or full store.
// No DOM: storage and the clock are injected (makeMeta({ storage, now })) so Node can run it.
import { MECHS, MECH_ORDER, DIFFICULTY, REWARDS, levelXp, UPGRADE, PAINTS, GLOWS, DECALS, TROPHIES, RANKS, BOSSES, MODES, MODE_ORDER, cleanLv, NO_LV, GEM_RATE, GEMS, SHOP, PASS } from './data.js';
import { MAP_ORDER, MAPS, THEMES } from './maps.js';

// The key keeps its v1 name so a player's progress is found; the version lives in `v` and clean() migrates older shapes.
const KEY = 'dtt.save.v1';
const VERSION = 2;
const QUALITIES = ['low', 'medium', 'high'];
const DAY = 86400000;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v, d, lo = 0, hi = 1e9) => (isNum(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);
const frac = (v, d) => (isNum(v) ? Math.min(1, Math.max(0, v)) : d);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Local calendar day, 'YYYY-MM-DD'.
export const dayKey = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
export const gemPrice = (coins) => Math.ceil(coins / GEM_RATE);

const FREE_MECHS = () => MECH_ORDER.filter((k) => MECHS[k].price === 0);
function defaults() {
  return {
    v: VERSION, name: 'Phi công', coins: 0, gems: 0, xp: 0, level: 1,
    owned: FREE_MECHS(), mech: MECH_ORDER[0], diff: 'normal', map: MAP_ORDER[0], theme: null, mode: MODE_ORDER[0],
    settings: { quality: 'medium', volume: 0.8, music: 0.5, rumble: true, netReadout: false },
    stats: { matches: 0, wins: 0, kills: 0, lastWinDay: '' },
    lv: {}, paints: {}, glows: {}, decals: {}, ownedPaints: ['goc'], ownedGlows: ['goc'], ownedDecals: ['goc'], trophies: 0,
    shop: { starter: false, passUntil: 0, lastDaily: '', bought: {}, log: [] },
    controls: { v: CONTROLS_V, fixedStick: false, o: {} },
  };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Touch layout overrides: `o[id]` holds only the fields the player changed, in design px from the control's anchor corner (see touch.js).
// A different `v` drops the overrides, so a later layout table can change without leaving controls in the wrong place.
const CONTROLS_V = 1;
const CONTROL_FIELDS = [['x', -50, 1500], ['y', -50, 1500], ['size', 48, 220], ['opacity', 0.2, 1]];
function cleanControls(raw) {
  const r = obj(raw), same = r.v === CONTROLS_V, o = {};
  if (same) {
    for (const [id, v] of Object.entries(obj(r.o)).slice(0, 16)) {
      if (!/^[a-z0-9]{1,12}$/.test(id)) continue;
      const c = obj(v), e = {};
      for (const [k, lo, hi] of CONTROL_FIELDS) if (isNum(c[k])) e[k] = Math.min(hi, Math.max(lo, c[k]));
      if (Object.keys(e).length) o[id] = e;
    }
  }
  return { v: CONTROLS_V, fixedStick: same && r.fixedStick === true, o };
}

export function rankOf(trophies) {
  let index = 0;
  RANKS.forEach((r, i) => { if (trophies >= r.min) index = i; });
  const r = RANKS[index], n = RANKS[index + 1];
  return { index, name: r.name, color: r.color, trophies, next: n ? { name: n.name, min: n.min } : null };
}

// The summary carries no mode field, so fall back to its shape: a boss row means trum, many distinct teams means tudo.
export function modeOf(summary) {
  if (summary && MODES[summary.mode]) return summary.mode;
  const rows = (summary && summary.rows) || [];
  if (rows.some((r) => BOSSES[r.mech])) return 'trum';
  if (rows.length > 2 && new Set(rows.map((r) => r.team)).size === rows.length) return 'tudo';
  return 'tdm';
}

// Free-for-all score is kills; summary.score is indexed by unit id there and by team everywhere else.
const ffaScore = (summary, r) => (Array.isArray(summary.score) && summary.score.length >= summary.rows.length && Number.isFinite(summary.score[r.id]) ? summary.score[r.id] : r.kills);

// 1-based place in a free-for-all: score, then fewer deaths; a declared winner always sits first.
export function placeOf(summary, id) {
  const order = summary.rows.slice().sort((a, b) => (b.id === summary.winner) - (a.id === summary.winner) || ffaScore(summary, b) - ffaScore(summary, a) || a.deaths - b.deaths || a.id - b.id);
  return order.findIndex((r) => r.id === id) + 1;
}

// xp is the xp earned inside the current level; a level needs levelXp(level).
// Migration: v1 stored one level per mech (`upgrades`); it becomes that level on every track, so nothing paid for is lost.
function clean(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const s = obj(raw.settings), st = obj(raw.stats), sh = obj(raw.shop);
  const owned = new Set(d.owned);
  if (Array.isArray(raw.owned)) for (const k of raw.owned) if (MECHS[k]) owned.add(k);
  const out = {
    v: VERSION,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 16) : d.name,
    coins: int(raw.coins, d.coins), gems: int(raw.gems, 0), level: int(raw.level, 1, 1, 999), xp: int(raw.xp, 0),
    owned: MECH_ORDER.filter((k) => owned.has(k)),
    mech: d.mech, diff: DIFFICULTY[raw.diff] ? raw.diff : d.diff, map: MAPS[raw.map] || raw.map === 'random' ? raw.map : d.map,
    // null = the layout's own theme
    theme: raw.theme === 'random' || has(THEMES, raw.theme) ? raw.theme : null,
    mode: MODE_ORDER.includes(raw.mode) ? raw.mode : d.mode,
    settings: {
      quality: QUALITIES.includes(s.quality) ? s.quality : d.settings.quality,
      volume: frac(s.volume, d.settings.volume), music: frac(s.music, d.settings.music),
      rumble: typeof s.rumble === 'boolean' ? s.rumble : d.settings.rumble,
      netReadout: typeof s.netReadout === 'boolean' ? s.netReadout : d.settings.netReadout,
    },
    stats: { matches: int(st.matches, 0), wins: int(st.wins, 0), kills: int(st.kills, 0), lastWinDay: typeof st.lastWinDay === 'string' ? st.lastWinDay.slice(0, 10) : '' },
    lv: {}, paints: {}, glows: {}, decals: {}, trophies: int(raw.trophies, 0), controls: cleanControls(raw.controls),
    shop: { starter: sh.starter === true, passUntil: int(sh.passUntil, 0, 0, 8.64e15), lastDaily: typeof sh.lastDaily === 'string' ? sh.lastDaily.slice(0, 10) : '', bought: {}, log: [] },
  };
  for (const e of SHOP) if (int(obj(sh.bought)[e.id], 0) > 0) out.shop.bought[e.id] = int(obj(sh.bought)[e.id], 0, 0, 1e6);
  if (Array.isArray(sh.log)) out.shop.log = sh.log.filter((r) => r && typeof r.id === 'string' && isNum(r.t)).slice(-40).map((r) => ({ id: r.id.slice(0, 24), t: r.t, vnd: int(r.vnd, 0) }));
  const owns = (table, list) => { const set = new Set(['goc']); if (Array.isArray(list)) for (const k of list) if (typeof k === 'string' && has(table, k)) set.add(k); return set; };
  const op = owns(PAINTS, raw.ownedPaints), og = owns(GLOWS, raw.ownedGlows), od = owns(DECALS, raw.ownedDecals);
  out.ownedPaints = Object.keys(PAINTS).filter((k) => op.has(k));
  out.ownedGlows = Object.keys(GLOWS).filter((k) => og.has(k));
  out.ownedDecals = Object.keys(DECALS).filter((k) => od.has(k));
  const lvs = obj(raw.lv), old = obj(raw.upgrades);
  for (const k of MECH_ORDER) {
    const lv = Array.isArray(lvs[k]) ? cleanLv(lvs[k]) : isNum(old[k]) ? cleanLv(NO_LV.map(() => int(old[k], 0, 0, UPGRADE.max))) : NO_LV;
    if (lv.some((n) => n > 0)) out.lv[k] = lv;
    for (const [field, key, set] of [['paints', 'paints', op], ['glows', 'glows', og], ['decals', 'decals', od]]) {
      const v = obj(raw[key])[k];
      if (typeof v === 'string' && set.has(v) && v !== 'goc') out[field][k] = v;
    }
  }
  out.mech = out.owned.includes(raw.mech) ? raw.mech : out.owned[0];
  out.xp = Math.min(out.xp, levelXp(out.level) - 1);
  return out;
}

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const browserStorage = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };

// opts.storage: { getItem, setItem } (default localStorage, else memory). opts.now: () => ms (default Date.now).
export function makeMeta(opts = {}) {
  const store = opts.storage || browserStorage() || memStorage();
  const now = opts.now || (() => Date.now());
  let data;
  try { data = clean(JSON.parse(store.getItem(KEY))); } catch (e) { data = clean(null); }

  const save = () => {
    try { store.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  };
  const passActive = () => data.shop.passUntil > now();
  const passDaysLeft = () => (passActive() ? Math.ceil((data.shop.passUntil - now()) / DAY) : 0);
  const lvOf = (mech) => (data.lv[mech] ? data.lv[mech].slice() : NO_LV.slice());

  // Pays `price` coins, or its gem price when payWith is 'gems'. Returns false without touching anything when the balance is short.
  function pay(price, payWith) {
    if (payWith === 'gems') {
      const g = gemPrice(price);
      if (data.gems < g) return false;
      data.gems -= g;
    } else {
      if (data.coins < price) return false;
      data.coins -= price;
    }
    return true;
  }

  function buy(mechKey, payWith = 'coins') {
    const def = MECHS[mechKey];
    if (!def) return false;
    if (data.owned.includes(mechKey)) return true;
    if (!pay(def.price, payWith)) return false;
    data.owned = MECH_ORDER.filter((k) => k === mechKey || data.owned.includes(k));
    save();
    return true;
  }

  function upgrade(mechKey, track, payWith = 'coins') {
    if (!MECHS[mechKey] || !data.owned.includes(mechKey) || !Number.isInteger(track) || track < 0 || track >= NO_LV.length) return false;
    const lv = lvOf(mechKey);
    if (lv[track] >= UPGRADE.max) return false;
    if (!pay(UPGRADE.cost(lv[track]), payWith)) return false;
    lv[track]++;
    data.lv[mechKey] = lv;
    save();
    return true;
  }

  // Paints, glows and decals share one shape: a table, an owned list, and one equipped key per mech.
  const cosmetic = (table, ownedKey, equipKey) => ({
    buy(key, payWith = 'coins') {
      const row = has(table, key) && table[key];
      if (!row) return false;
      if (data[ownedKey].includes(key)) return true;
      if (!pay(row.price, payWith)) return false;
      data[ownedKey] = Object.keys(table).filter((k) => k === key || data[ownedKey].includes(k));
      save();
      return true;
    },
    set(mechKey, key) {
      if (!MECHS[mechKey] || !data.owned.includes(mechKey) || !data[ownedKey].includes(key)) return false;
      if (key === 'goc') delete data[equipKey][mechKey]; else data[equipKey][mechKey] = key;
      save();
      return true;
    },
  });
  const paint = cosmetic(PAINTS, 'ownedPaints', 'paints'), glow = cosmetic(GLOWS, 'ownedGlows', 'glows'), decal = cosmetic(DECALS, 'ownedDecals', 'decals');

  // The pretend shop. Nothing is charged: the row is granted at once. A mech, paint, glow or decal the player already owns comes back as its price in coins.
  function shopBuy(id) {
    const row = SHOP.find((e) => e.id === id);
    if (!row) return { ok: false, reason: 'Không có gói này' };
    if (row.once && data.shop.bought[id]) return { ok: false, reason: 'Đã mua' };
    const g = row.grants, got = {};
    if (g.gems) { data.gems += g.gems; got.gems = g.gems; }
    if (g.coins) { data.coins += g.coins; got.coins = g.coins; }
    let refund = 0;
    if (g.mech && MECHS[g.mech]) {
      if (data.owned.includes(g.mech)) refund += MECHS[g.mech].price;
      else { data.owned = MECH_ORDER.filter((k) => k === g.mech || data.owned.includes(k)); got.mech = g.mech; }
    }
    for (const [field, table, ownedKey] of [['paint', PAINTS, 'ownedPaints'], ['glow', GLOWS, 'ownedGlows'], ['decal', DECALS, 'ownedDecals']]) {
      const key = g[field];
      if (!key || !has(table, key)) continue;
      if (data[ownedKey].includes(key)) refund += table[key].price;
      else { data[ownedKey] = Object.keys(table).filter((k) => k === key || data[ownedKey].includes(k)); got[field] = key; }
    }
    if (refund) { data.coins += refund; got.refund = refund; }
    if (g.pass) { data.shop.passUntil = Math.max(now(), data.shop.passUntil) + g.pass * DAY; got.pass = g.pass; }
    if (row.once) data.shop.starter = data.shop.starter || row.kind === 'starter';
    data.shop.bought[id] = (data.shop.bought[id] || 0) + 1;
    data.shop.log = data.shop.log.concat({ id, t: now(), vnd: row.vnd }).slice(-40);
    save();
    return { ok: true, got };
  }

  // Pass holders get PASS.daily gems once per calendar day. Returns the gems granted, 0 when none are due.
  function claimDaily() {
    const today = dayKey(now());
    if (!passActive() || data.shop.lastDaily === today) return 0;
    data.shop.lastDaily = today;
    data.gems += PASS.daily;
    save();
    return PASS.daily;
  }
  const dailyReady = () => passActive() && data.shop.lastDaily !== dayKey(now());

  function applyResult(summary, meId) {
    const me = summary && summary.rows && summary.rows.find((r) => r.id === meId);
    if (!me) return null;
    const mode = modeOf(summary);
    const place = mode === 'tudo' ? placeOf(summary, meId) : 0;
    // tudo pays by place (1st wins, 2nd-3rd draw); every other mode asks whether the player's team won.
    const win = mode === 'tudo' ? place === 1 : summary.winner === me.team;
    const draw = mode === 'tudo' ? place === 2 || place === 3 : summary.winner === -1;
    const mvp = summary.mvp === meId;
    const base = win ? REWARDS.win : draw ? REWARDS.draw : REWARDS.lose;
    // A boss kill is one frag for the whole team, so trum pays for damage dealt to the boss instead.
    const parts = { base: mode === 'trum' && win ? Math.round(base * 1.5) : base, kills: me.kills * REWARDS.perKill, assists: me.assists * REWARDS.perAssist, mvp: mvp ? REWARDS.mvp : 0,
      boss: mode === 'trum' ? Math.round(REWARDS.perKill * me.dmg / 4000) : 0 };
    const sub = parts.base + parts.kills + parts.assists + parts.mvp + parts.boss;
    const coinMul = passActive() ? PASS.coinMul : 1;
    parts.pass = Math.round(sub * coinMul) - sub;
    const coins = sub + parts.pass;
    const xp = (win ? REWARDS.xpWin : draw ? Math.round((REWARDS.xpWin + REWARDS.xpLose) / 2) : REWARDS.xpLose) + me.kills * REWARDS.xpPerKill;
    const levelBefore = data.level, xpBefore = data.xp;
    const rankBefore = rankOf(data.trophies), trophiesBefore = data.trophies;
    const trophy = mode === 'tdm' || mode === 'chiem' || mode === 'nha';
    if (trophy) data.trophies = Math.max(0, data.trophies + (win ? TROPHIES.win : draw ? TROPHIES.draw : -TROPHIES.lose));
    const rankAfter = rankOf(data.trophies);
    data.coins += coins;
    data.xp += xp;
    while (data.xp >= levelXp(data.level)) { data.xp -= levelXp(data.level); data.level++; }
    const today = dayKey(now());
    const firstWin = win && data.stats.lastWinDay !== today;
    const gemParts = { levelUp: (data.level - levelBefore) * GEMS.levelUp, mvp: mvp ? GEMS.mvp : 0, firstWin: firstWin ? GEMS.firstWin : 0 };
    const gems = gemParts.levelUp + gemParts.mvp + gemParts.firstWin;
    data.gems += gems;
    if (win) data.stats.lastWinDay = today;
    data.stats.matches++;
    if (win) data.stats.wins++;
    data.stats.kills += me.kills;
    save();
    return { coins, gems, gemParts, coinMul, xp, levelBefore, levelAfter: data.level, win, draw, mvp, xpBefore, xpAfter: data.xp, parts, kills: me.kills, assists: me.assists,
      mode, place, trophy, trophiesBefore, trophiesAfter: data.trophies, rankBefore, rankAfter };
  }

  return { get: () => data, save, buy, upgrade, buyPaint: paint.buy, setPaint: paint.set, buyGlow: glow.buy, setGlow: glow.set, buyDecal: decal.buy, setDecal: decal.set,
    shopBuy, claimDaily, dailyReady, passActive, passDaysLeft, lvOf, rank: () => rankOf(data.trophies), applyResult };
}
