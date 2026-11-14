// Save data in localStorage. Every read tolerates garbage; every write tolerates a blocked or full store.
import { MECHS, MECH_ORDER, DIFFICULTY, REWARDS, levelXp } from './data.js';
import { MAP_ORDER } from './maps.js';

const KEY = 'dtt.save.v1';
const VERSION = 1;
const QUALITIES = ['low', 'medium', 'high'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v, d, lo = 0, hi = 1e9) => (isNum(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);
const frac = (v, d) => (isNum(v) ? Math.min(1, Math.max(0, v)) : d);

function defaults() {
  return {
    v: VERSION, name: 'Phi công', coins: 0, xp: 0, level: 1,
    owned: MECH_ORDER.filter((k) => MECHS[k].price === 0), mech: MECH_ORDER[0], diff: 'normal', map: MAP_ORDER[0],
    settings: { quality: 'medium', volume: 0.8, music: 0.5 },
    stats: { matches: 0, wins: 0, kills: 0 },
  };
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
    mech: d.mech, diff: DIFFICULTY[raw.diff] ? raw.diff : d.diff, map: MAP_ORDER.includes(raw.map) ? raw.map : d.map,
    settings: {
      quality: QUALITIES.includes(s.quality) ? s.quality : d.settings.quality,
      volume: frac(s.volume, d.settings.volume), music: frac(s.music, d.settings.music),
    },
    stats: { matches: int(st.matches, 0), wins: int(st.wins, 0), kills: int(st.kills, 0) },
  };
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

  function applyResult(summary, meId) {
    const me = summary && summary.rows && summary.rows.find((r) => r.id === meId);
    if (!me) return null;
    const win = summary.winner === me.team, draw = summary.winner === -1;
    const mvp = summary.mvp === meId;
    const base = win ? REWARDS.win : draw ? REWARDS.draw : REWARDS.lose;
    const parts = { base, kills: me.kills * REWARDS.perKill, assists: me.assists * REWARDS.perAssist, mvp: mvp ? REWARDS.mvp : 0 };
    const coins = parts.base + parts.kills + parts.assists + parts.mvp;
    const xp = (win ? REWARDS.xpWin : draw ? Math.round((REWARDS.xpWin + REWARDS.xpLose) / 2) : REWARDS.xpLose) + me.kills * REWARDS.xpPerKill;
    const levelBefore = data.level, xpBefore = data.xp;
    data.coins += coins;
    data.xp += xp;
    while (data.xp >= levelXp(data.level)) { data.xp -= levelXp(data.level); data.level++; }
    data.stats.matches++;
    if (win) data.stats.wins++;
    data.stats.kills += me.kills;
    save();
    return { coins, xp, levelBefore, levelAfter: data.level, win, draw, mvp, xpBefore, xpAfter: data.xp, parts, kills: me.kills, assists: me.assists };
  }

  return { get: () => data, save, buy, applyResult };
}
