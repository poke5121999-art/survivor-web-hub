// Save data in localStorage. Every read tolerates garbage; every write tolerates a blocked or full store.
// No DOM: storage and the clock are injected (makeMeta({ storage, now })) so Node can run it.
import { MECHS, MECH_ORDER, DIFFICULTY, REWARDS, levelXp, UPGRADE, TROPHIES, RANKS, BOSSES, MODES, MODE_ORDER, cleanLv, cleanSize, TEAM_SIZE, NO_LV, GEM_RATE, GEMS, SHOP, PASS } from './data.js';
import { MAP_ORDER, MAPS, THEMES } from './maps.js';
import { SKINS, BASE_SKIN, skinOf, cleanSkin, skinKey } from './skins.js';

// The key keeps its v1 name so a player's progress is found; the version lives in `v` and clean() migrates older shapes.
const KEY = 'dtt.save.v1';
const VERSION = 3;
const QUALITIES = ['low', 'medium', 'high'];
// Phone vibration and camera shake: off, light (default), strong.
export const FEEL_LEVELS = ['off', 'light', 'strong'];
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
    owned: FREE_MECHS(), mech: MECH_ORDER[0], diff: 'normal', map: MAP_ORDER[0], theme: null, mode: MODE_ORDER[0], size: TEAM_SIZE,
    settings: { quality: 'medium', volume: 0.8, music: 0.5, rumble: true, netReadout: false, vibe: 'light', shake: 'light', brightness: 1, calm: null, camHeight: null, aimPan: true },
    stats: { matches: 0, wins: 0, kills: 0, lastWinDay: '' },
    lv: {}, skins: {}, ownedSkins: [], trophies: 0,
    shop: { starter: false, passUntil: 0, lastDaily: '', bought: {}, log: [] },
    controls: { v: CONTROLS_V, fixedStick: false, o: {}, aim: cleanAim(null) },
  };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// Touch layout overrides: `o[id]` holds only the fields the player changed, in design px from the control's anchor corner (see touch.js).
// A different `v` drops the overrides, so a later layout table can change without leaving controls in the wrong place.
const CONTROLS_V = 1;
const CONTROL_FIELDS = [['x', -50, 1500], ['y', -50, 1500], ['size', 48, 220], ['opacity', 0.2, 1]];
// Auto-aim settings live in controls.aim with their own version, so a layout change never resets them. pad: the gamepad option.
const AIM_V = 1, AIM_PRIO = ['near', 'lowhp', 'lowpct'];
function cleanAim(raw) {
  const a = obj(raw), same = a.v === AIM_V;
  return { v: AIM_V, auto: same ? a.auto !== false : true, priority: same && AIM_PRIO.includes(a.priority) ? a.priority : 'near', pad: same && a.pad === true };
}
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
  return { v: CONTROLS_V, fixedStick: same && r.fixedStick === true, o, aim: cleanAim(r.aim) };
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

// Free-for-all places that count as a podium: 1st wins, 2nd-3rd draw when six or more fly (3v3 and up); a field of four or fewer has one winner and losers.
export const podiumOf = (n) => (n >= 6 ? 3 : 1);

// xp is the xp earned inside the current level; a level needs levelXp(level).
// Migration: v1 stored one level per mech (`upgrades`); it becomes that level on every track, so nothing paid for is lost.
// v2 sold trim paints, glow colours and decals; v3 sells whole skins instead (js/skins.js). A v2 save gets what it paid
// for them back once, in coins (their only price list is LEGACY_COSMETICS), and the old fields are dropped.
const LEGACY_COSMETICS = {
  ownedPaints: { vang: 200, trang: 200, den: 250, tim: 300, luc: 300, hong: 350 },
  ownedGlows: { vang: 250, tim: 250, luc: 250, hong: 300 },
  ownedDecals: { soc: 150, vuot: 200, sao: 200, caro: 250 },
};
export function legacyRefund(raw) {
  if (!raw || typeof raw !== 'object' || (isNum(raw.v) && raw.v >= 3)) return 0;
  let n = 0;
  for (const [field, prices] of Object.entries(LEGACY_COSMETICS)) {
    if (!Array.isArray(raw[field])) continue;
    for (const k of new Set(raw[field])) if (typeof k === 'string' && has(prices, k)) n += prices[k];
  }
  return n;
}
function clean(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const s = obj(raw.settings), st = obj(raw.stats), sh = obj(raw.shop);
  const owned = new Set(d.owned);
  if (Array.isArray(raw.owned)) for (const k of raw.owned) if (MECHS[k]) owned.add(k);
  const out = {
    v: VERSION,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 16) : d.name,
    coins: int(raw.coins, d.coins) + legacyRefund(raw), gems: int(raw.gems, 0), level: int(raw.level, 1, 1, 999), xp: int(raw.xp, 0),
    owned: MECH_ORDER.filter((k) => owned.has(k)),
    mech: d.mech, diff: DIFFICULTY[raw.diff] ? raw.diff : d.diff, map: MAPS[raw.map] || raw.map === 'random' ? raw.map : d.map,
    // null = the layout's own theme
    theme: raw.theme === 'random' || has(THEMES, raw.theme) ? raw.theme : null,
    mode: MODE_ORDER.includes(raw.mode) ? raw.mode : d.mode,
    size: cleanSize(raw.size),
    settings: {
      quality: QUALITIES.includes(s.quality) ? s.quality : d.settings.quality,
      volume: frac(s.volume, d.settings.volume), music: frac(s.music, d.settings.music),
      rumble: typeof s.rumble === 'boolean' ? s.rumble : d.settings.rumble,
      netReadout: typeof s.netReadout === 'boolean' ? s.netReadout : d.settings.netReadout,
      vibe: FEEL_LEVELS.includes(s.vibe) ? s.vibe : d.settings.vibe,
      shake: FEEL_LEVELS.includes(s.shake) ? s.shake : d.settings.shake,
      // brightness: display exposure multiplier 0.8 to 1.2; calm ("Giảm chớp sáng"): null until the player picks, then the device default no longer applies
      brightness: isNum(s.brightness) ? Math.round(Math.min(1.2, Math.max(0.8, s.brightness)) * 100) / 100 : 1,
      calm: typeof s.calm === 'boolean' ? s.calm : null,
      // camHeight: null until the player picks (then main.js stops choosing by screen); aimPan: "Camera theo hướng ngắm"
      camHeight: ['near', 'mid', 'far'].includes(s.camHeight) ? s.camHeight : null,
      aimPan: typeof s.aimPan === 'boolean' ? s.aimPan : true,
    },
    stats: { matches: int(st.matches, 0), wins: int(st.wins, 0), kills: int(st.kills, 0), lastWinDay: typeof st.lastWinDay === 'string' ? st.lastWinDay.slice(0, 10) : '' },
    lv: {}, skins: {}, ownedSkins: [], trophies: int(raw.trophies, 0), controls: cleanControls(raw.controls),
    shop: { starter: sh.starter === true, passUntil: int(sh.passUntil, 0, 0, 8.64e15), lastDaily: typeof sh.lastDaily === 'string' ? sh.lastDaily.slice(0, 10) : '', bought: {}, log: [] },
  };
  for (const e of SHOP) if (int(obj(sh.bought)[e.id], 0) > 0) out.shop.bought[e.id] = int(obj(sh.bought)[e.id], 0, 0, 1e6);
  if (Array.isArray(sh.log)) out.shop.log = sh.log.filter((r) => r && typeof r.id === 'string' && isNum(r.t)).slice(-40).map((r) => ({ id: r.id.slice(0, 24), t: r.t, vnd: int(r.vnd, 0) }));
  // Owned skins as 'mech:id' (the free base skin of every tank is never stored), in SKINS order.
  const os = new Set(Array.isArray(raw.ownedSkins) ? raw.ownedSkins.filter((k) => typeof k === 'string') : []);
  for (const k of Object.keys(SKINS)) for (const s of SKINS[k]) if (s.id !== BASE_SKIN && os.has(skinKey(k, s.id))) out.ownedSkins.push(skinKey(k, s.id));
  const lvs = obj(raw.lv), old = obj(raw.upgrades);
  for (const k of MECH_ORDER) {
    const lv = Array.isArray(lvs[k]) ? cleanLv(lvs[k]) : isNum(old[k]) ? cleanLv(NO_LV.map(() => int(old[k], 0, 0, UPGRADE.max))) : NO_LV;
    if (lv.some((n) => n > 0)) out.lv[k] = lv;
    const sk = cleanSkin(k, obj(raw.skins)[k]);
    if (sk && out.ownedSkins.includes(skinKey(k, sk))) out.skins[k] = sk;
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
  let raw = null;
  try { raw = JSON.parse(store.getItem(KEY)); } catch (e) { raw = null; }
  data = clean(raw);

  const save = () => {
    try { store.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  };
  // The v2 -> v3 refund lands in the store at once, so it is paid exactly once.
  const refunded = legacyRefund(raw);
  if (refunded) save();
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

  // Skins: one owned list for every tank, one equipped id per tank. A tank's base skin is always owned and free.
  const ownsSkin = (mech, id) => id === BASE_SKIN || data.ownedSkins.includes(skinKey(mech, id));
  const grantSkin = (mech, id) => {
    const keys = new Set(data.ownedSkins.concat(skinKey(mech, id)));
    data.ownedSkins = [];
    for (const k of Object.keys(SKINS)) for (const s of SKINS[k]) if (keys.has(skinKey(k, s.id))) data.ownedSkins.push(skinKey(k, s.id));
  };
  // A known skin of a known tank; the tank itself need not be owned yet.
  const skinRow = (mech, id) => { const r = SKINS[mech] && skinOf(mech, id); return r && r.id === id ? r : null; };
  function buySkin(mech, id, payWith = 'coins') {
    const row = skinRow(mech, id);
    if (!row) return false;
    if (ownsSkin(mech, id)) return true;
    if (!pay(row.price, payWith)) return false;
    grantSkin(mech, id);
    save();
    return true;
  }
  function setSkin(mech, id) {
    if (!MECHS[mech] || !data.owned.includes(mech) || !skinRow(mech, id) || !ownsSkin(mech, id)) return false;
    if (id === BASE_SKIN) delete data.skins[mech]; else data.skins[mech] = id;
    save();
    return true;
  }
  const skinFor = (mech) => (data.skins[mech] && ownsSkin(mech, data.skins[mech]) ? data.skins[mech] : BASE_SKIN);

  // The pretend shop. Nothing is charged: the row is granted at once. A mech or skin the player already owns comes back as its price in coins.
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
    if (typeof g.skin === 'string') {
      const [sm, sid] = g.skin.split(':'), row = skinRow(sm, sid);
      if (row && ownsSkin(sm, sid)) refund += row.price;
      else if (row) { grantSkin(sm, sid); got.skin = g.skin; }
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
    // tudo pays by place (1st wins, the next few draw); every other mode asks whether the player's team won.
    const win = mode === 'tudo' ? place === 1 : summary.winner === me.team;
    const draw = mode === 'tudo' ? place >= 2 && place <= podiumOf(summary.rows.length) : summary.winner === -1;
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

  return { get: () => data, save, buy, upgrade, buySkin, setSkin, ownsSkin, skinFor, refunded,
    shopBuy, claimDaily, dailyReady, passActive, passDaysLeft, lvOf, rank: () => rankOf(data.trophies), applyResult };
}
