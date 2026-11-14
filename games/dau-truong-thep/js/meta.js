// Save data in localStorage. Every read tolerates garbage; every write tolerates a blocked or full store.
import { MECHS, MECH_ORDER, DIFFICULTY, REWARDS, levelXp, UPGRADE, PAINTS, TROPHIES, RANKS, BOSSES, MODES, MODE_ORDER } from './data.js';
import { MAP_ORDER, THEMES } from './maps.js';

const KEY = 'dtt.save.v1';
const VERSION = 1;
const QUALITIES = ['low', 'medium', 'high'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v, d, lo = 0, hi = 1e9) => (isNum(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);
const frac = (v, d) => (isNum(v) ? Math.min(1, Math.max(0, v)) : d);

function defaults() {
  return {
    v: VERSION, name: 'Phi công', coins: 0, xp: 0, level: 1,
    owned: MECH_ORDER.filter((k) => MECHS[k].price === 0), mech: MECH_ORDER[0], diff: 'normal', map: MAP_ORDER[0], theme: null, mode: MODE_ORDER[0],
    settings: { quality: 'medium', volume: 0.8, music: 0.5 },
    stats: { matches: 0, wins: 0, kills: 0 },
    upgrades: {}, paints: {}, ownedPaints: ['goc'], trophies: 0,
  };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

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
function clean(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const st = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const owned = new Set(d.owned);
  if (Array.isArray(raw.owned)) for (const k of raw.owned) if (MECHS[k]) owned.add(k);
  const out = {
    v: VERSION,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 16) : d.name,
    coins: int(raw.coins, d.coins), level: int(raw.level, 1, 1, 999), xp: int(raw.xp, 0),
    owned: MECH_ORDER.filter((k) => owned.has(k)),
    mech: d.mech, diff: DIFFICULTY[raw.diff] ? raw.diff : d.diff, map: MAP_ORDER.includes(raw.map) || raw.map === 'random' ? raw.map : d.map,
    // null = the layout's own theme
    theme: raw.theme === 'random' || Object.prototype.hasOwnProperty.call(THEMES, raw.theme) ? raw.theme : null,
    mode: MODE_ORDER.includes(raw.mode) ? raw.mode : d.mode,
    settings: {
      quality: QUALITIES.includes(s.quality) ? s.quality : d.settings.quality,
      volume: frac(s.volume, d.settings.volume), music: frac(s.music, d.settings.music),
    },
    stats: { matches: int(st.matches, 0), wins: int(st.wins, 0), kills: int(st.kills, 0) },
    upgrades: {}, paints: {}, ownedPaints: ['goc'], trophies: int(raw.trophies, 0),
  };
  const up = obj(raw.upgrades), pn = obj(raw.paints);
  const op = new Set(['goc']);
  if (Array.isArray(raw.ownedPaints)) for (const k of raw.ownedPaints) if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(PAINTS, k)) op.add(k);
  out.ownedPaints = Object.keys(PAINTS).filter((k) => op.has(k));
  for (const k of MECH_ORDER) {
    const lv = int(up[k], 0, 0, UPGRADE.max);
    if (lv > 0) out.upgrades[k] = lv;
    if (typeof pn[k] === 'string' && op.has(pn[k]) && pn[k] !== 'goc') out.paints[k] = pn[k];
  }
  out.mech = out.owned.includes(raw.mech) ? raw.mech : out.owned[0];
  out.xp = Math.min(out.xp, levelXp(out.level) - 1);
  return out;
}

export function makeMeta() {
  let data;
  try { data = clean(JSON.parse(localStorage.getItem(KEY))); } catch (e) { data = clean(null); }

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  };

  function buy(mechKey) {
    const def = MECHS[mechKey];
    if (!def) return false;
    if (data.owned.includes(mechKey)) return true;
    if (data.coins < def.price) return false;
    data.coins -= def.price;
    data.owned = MECH_ORDER.filter((k) => k === mechKey || data.owned.includes(k));
    save();
    return true;
  }

  function upgrade(mechKey) {
    if (!MECHS[mechKey] || !data.owned.includes(mechKey)) return false;
    const lv = data.upgrades[mechKey] || 0;
    if (lv >= UPGRADE.max) return false;
    const cost = UPGRADE.cost(lv);
    if (data.coins < cost) return false;
    data.coins -= cost;
    data.upgrades[mechKey] = lv + 1;
    save();
    return true;
  }

  function buyPaint(key) {
    const p = Object.prototype.hasOwnProperty.call(PAINTS, key) && PAINTS[key];
    if (!p) return false;
    if (data.ownedPaints.includes(key)) return true;
    if (data.coins < p.price) return false;
    data.coins -= p.price;
    data.ownedPaints = Object.keys(PAINTS).filter((k) => k === key || data.ownedPaints.includes(k));
    save();
    return true;
  }

  function setPaint(mechKey, key) {
    if (!MECHS[mechKey] || !data.owned.includes(mechKey) || !data.ownedPaints.includes(key)) return false;
    if (key === 'goc') delete data.paints[mechKey]; else data.paints[mechKey] = key;
    save();
    return true;
  }

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
    const coins = parts.base + parts.kills + parts.assists + parts.mvp + parts.boss;
    const xp = (win ? REWARDS.xpWin : draw ? Math.round((REWARDS.xpWin + REWARDS.xpLose) / 2) : REWARDS.xpLose) + me.kills * REWARDS.xpPerKill;
    const levelBefore = data.level, xpBefore = data.xp;
    const rankBefore = rankOf(data.trophies), trophiesBefore = data.trophies;
    const trophy = mode === 'tdm' || mode === 'chiem' || mode === 'nha';
    if (trophy) data.trophies = Math.max(0, data.trophies + (win ? TROPHIES.win : draw ? TROPHIES.draw : -TROPHIES.lose));
    const rankAfter = rankOf(data.trophies);
    data.coins += coins;
    data.xp += xp;
    while (data.xp >= levelXp(data.level)) { data.xp -= levelXp(data.level); data.level++; }
    data.stats.matches++;
    if (win) data.stats.wins++;
    data.stats.kills += me.kills;
    save();
    return { coins, xp, levelBefore, levelAfter: data.level, win, draw, mvp, xpBefore, xpAfter: data.xp, parts, kills: me.kills, assists: me.assists,
      mode, place, trophy, trophiesBefore, trophiesAfter: data.trophies, rankBefore, rankAfter };
  }

  return { get: () => data, save, buy, upgrade, buyPaint, setPaint, rank: () => rankOf(data.trophies), applyResult };
}
