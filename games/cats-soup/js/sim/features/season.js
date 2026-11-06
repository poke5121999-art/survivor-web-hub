// Feature "season" (sim part): the time-based events of the original, run on the player's local calendar.
// Season exchange shop + event items, event missions and the event pass, the login calendars (EventDaily_Day / _Season,
// EventBeginner, EventWelcome), return missions, the soup pass with its mini game, and the daily play-point rewards.
// Rules with citations: D:/catsoup-ref/rules/season.md. Tables: data/season.json (tools/export_season.py).
// Contract: js/sim/registry.js. Real-money pass tracks (premium columns) are shown by the view, never paid.

const S = g => g.state.season;
const D = g => g.data.season;

const pad = n => String(n).padStart(2, '0');
export const nowMs = g => Date.now() + (g.state.specials ? g.state.specials.skewMs || 0 : 0);
export const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const periodKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const dayNum = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };

// DataManager.IsActiveSoupPassEvent / GetEventDailyDays only run with 3 or more cats (`2 < ltUnitData._size`).
export const UNLOCK_CATS = 3;
export const unlocked = g => g.state.cats.length >= UNLOCK_CATS;

// ---- schedule (inferred: the server dates of SeasonTime are replaced by a rotation over the calendar month) ----
// data.months maps each month to the newest SeasonTime row that started in it; the season lasts the calendar month.
export function seasonId(g, ms = nowMs(g)) { return D(g).months[new Date(ms).getMonth() + 1]; }
export function seasonInfo(g, ms = nowMs(g)) {
  const d = new Date(ms), id = seasonId(g, ms);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return { id, name: D(g).seasons[id].name, period: periodKey(ms), endsAt: end, daysLeft: Math.max(1, Math.ceil((end - ms) / 86400000)), shop: D(g).shop[id] };
}
// EventDaily_Day groups 1..13 rotate by month (inferred).
export function dayGroup(ms) { const d = new Date(ms); return 1 + ((d.getFullYear() * 12 + d.getMonth()) % 13); }
// Soup pass reward tables exist for seasons 62 and 67 only: they alternate by month (inferred).
export function soupSeason(ms) { const d = new Date(ms); return (d.getFullYear() * 12 + d.getMonth()) % 2 ? 67 : 62; }

// ---- reward helper ----
// Every reward goes through game.reward; a type nobody owns yet (welcome coin 97, 4000, the 1500s ...) is held in state.season.bag.
export function give(g, type, value) {
  if (!type || !value) return null;
  let out = type === 5 ? g.reward(5, 1, { equip: value }) : g.reward(type, value);
  if (!out) {
    const b = S(g).bag;
    b[type] = (b[type] || 0) + Number(value);
    out = { type, value, held: true };
  }
  return out;
}
const held = type => (g, value) => { S(g).items += Number(value); return { type, value }; };

// ---- event mission rules (type of EventPassMission / ReturnMission -> sim events) ----
// 17 login, 100 all daily missions cleared and 200 event missions cleared are driven by the module itself.
const RULES = {
  0: { ev: ['sell'] }, 1: { ev: ['build'] }, 2: { ev: ['upgrade'], amount: 'levels' }, 5: { ev: ['chest'] }, 6: { ev: ['jar'] },
  7: { ev: ['fish'] }, 8: { ev: ['balloon'] }, 9: { ev: ['crane'] }, 10: { ev: ['expand'] }, 14: { ev: ['specialorder'] },
  15: { ev: ['catGift', 'towerPhoto'] }, 18: { ev: ['furniturePlace'] }, 19: { ev: ['equip'] }, 22: { ev: ['shopAd'] },
  100: { ev: ['missionClear'] },
};
const SELF = new Set([17, 200, 999]);
const supported = t => !!RULES[t] || SELF.has(t);
const amountOf = (rule, e) => (rule.amount ? Number(e[rule.amount]) || 0 : 1);

// ---- state ----
function roll(s) { s.seed = (Math.imul(s.seed || 12345, 1103515245) + 12345) >>> 0; return s.seed / 4294967296; }
function fresh() {
  return {
    seed: 987654321,
    day: '', period: '', seen: 0, bag: {}, items: 0, buys: {}, em: {}, passPts: 0, passClaimed: {},
    cal: {}, ret: { on: false, start: '', day: 1, m: {}, clear: {} }, retDone: 0,
    soup: { period: '', pts: 0, claimed: {}, plays: 0, playDay: '', game: null },
    pp: { day: '', sec: 0, claimed: {} }, converted: 0,
  };
}

// ---- periods and days ----
function newPeriod(g, ms) {
  const s = S(g);
  // info_eventExchange02: every 50 leftover event items turn into a 1 hour gold ticket when the event ends (1101, inferred as automatic).
  if (s.period) { const n = Math.floor(s.items / 50); if (n > 0) { give(g, 1101, n); s.converted = n; } else s.converted = 0; }
  s.period = periodKey(ms);
  s.items = 0; s.buys = {}; s.em = {}; s.passPts = 0; s.passClaimed = {};
  s.soup = { period: s.period, pts: 0, claimed: {}, plays: 0, playDay: '', game: null };
  delete s.cal.group; delete s.cal.season;
  g.emit('seasonStart', { season: seasonId(g, ms) });
}

function emRow(g, i) { return D(g).eventMissions.find(m => m.index === i); }
function emCount(s, i) { return (s.em[i] ||= [0, 0]); }

function newDay(g, ms) {
  const s = S(g), today = dayKey(ms);
  const prev = s.day;
  s.day = today;
  s.pp = { day: today, sec: 0, claimed: {} };
  s.soup.plays = 0;
  // Return missions open after a week away (push_dayseven; inferred) and run for the five activeDay rows of ReturnMission.
  if (prev && unlocked(g)) {
    const gap = dayNum(today) - dayNum(prev);
    if (gap >= 7 && !s.ret.on) s.ret = { on: true, start: today, day: 1, m: {}, clear: {} };
  }
  if (s.ret.on) {
    const d = dayNum(today) - dayNum(s.ret.start) + 1;
    if (d > 5) s.ret.on = false; else if (d !== s.ret.day) { s.ret.day = d; }
  }
  // Calendars count one login day per local date (UI_EventDaily_Day.GetReward compares _unlockValue with the row, inferred increment).
  for (const c of Object.values(s.cal)) if (c.last !== today) { c.unlock += 1; c.last = today; }
  // Event mission 17: log in once (counted per season).
  for (const m of D(g).eventMissions) if (m.type === 17) { const a = emCount(s, m.index); a[1] = Math.min(m.maxValue, a[1] + 1); }
  bumpReturn(g, { type: 'login' }, 17);
  g.emit('seasonDay', { day: today });
}

export function refresh(g, ms = nowMs(g)) {
  const s = S(g);
  const p = periodKey(ms), day = dayKey(ms);
  let changed = false;
  if (s.period !== p) { newPeriod(g, ms); changed = true; }
  if (s.day !== day) { newDay(g, ms); changed = true; }
  s.seen = ms;
  ensureCals(g, ms);
  return changed;
}

// ---- login calendars ----
export const CALS = ['group', 'season', 'beginner', 'welcome'];
function calRows(g, which, ms = nowMs(g)) {
  const d = D(g);
  if (which === 'group') return d.dayGroups[dayGroup(ms)];
  if (which === 'season') return d.daily[seasonId(g, ms)];
  const tier = (S(g).cal[which] || {}).tier;
  return d[which === 'beginner' ? 'beginner' : 'welcome'].filter(r => r.needUnitCount === tier);
}
function ensureCals(g, ms) {
  const s = S(g);
  if (!unlocked(g)) return;
  const today = dayKey(ms);
  for (const which of CALS) {
    if (s.cal[which]) continue;
    const c = { unlock: 0, last: today, claimed: {} };
    if (which === 'beginner' || which === 'welcome') {
      // Tier = the largest needUnitCount row set the cats owned so far reach (inferred reading of needUnitCount).
      const src = D(g)[which];
      const tiers = [...new Set(src.map(r => r.needUnitCount))].sort((a, b) => a - b);
      c.tier = tiers.filter(t => t <= g.state.cats.length).pop() ?? tiers[0];
    }
    s.cal[which] = c;
  }
}
export function calState(g, which) {
  const c = S(g).cal[which];
  if (!c || !unlocked(g)) return null;
  const rows = calRows(g, which);
  const claimedAll = rows.every(r => c.claimed[r.requireValue]);
  const open = (which === 'beginner' || which === 'welcome') ? !claimedAll : true;
  return { which, rows, unlock: c.unlock, claimed: c.claimed, open, claimedAll,
    ready: rows.some(r => r.requireValue <= c.unlock && !c.claimed[r.requireValue]) };
}
// Free column only (rewardType / rewardValue); the P1 / P2 columns belong to the real-money pass and stay unpaid.
export function claimCal(g, which, req) {
  const st = calState(g, which);
  if (!st || !st.open) return null;
  const row = st.rows.find(r => r.requireValue === req);
  if (!row || req > st.unlock || st.claimed[req]) return null;
  st.claimed[req] = 1;
  const out = give(g, row.rewardType, row.rewardValue);
  g.emit('eventDailyClaim', { which, day: req });
  return out;
}

// ---- season exchange shop ----
export function shopList(g) {
  const s = S(g);
  return seasonInfo(g).shop.map(r => ({ row: r, bought: s.buys[r.index] || 0, left: r.enableCount - (s.buys[r.index] || 0), can: s.items >= r.requireValue && (s.buys[r.index] || 0) < r.enableCount }));
}
export function buyShop(g, index) {
  const s = S(g);
  const r = seasonInfo(g).shop.find(x => x.index === index);
  if (!r || (s.buys[index] || 0) >= r.enableCount || s.items < r.requireValue) return null;
  s.items -= r.requireValue;
  s.buys[index] = (s.buys[index] || 0) + 1;
  const out = give(g, r.rewardType, r.rewardValue);
  g.emit('seasonBuy', { index });
  return out;
}

// ---- event missions + event pass ----
export function missionList(g) {
  const s = S(g);
  const list = D(g).eventMissions.filter(m => supported(m.type));
  return list.map(m => {
    const a = emCount(s, m.index);
    const max = m.type === 200 ? list.length - 1 : m.maxValue;
    const count = m.type === 200 ? list.filter(x => x.type !== 200 && emCount(s, x.index)[0]).length : a[1];
    return { row: m, claimed: !!a[0], count: Math.min(count, max), max, done: count >= max };
  });
}
export function claimMission(g, index) {
  const st = missionList(g).find(x => x.row.index === index);
  if (!st || st.claimed || !st.done) return null;
  emCount(S(g), index)[0] = 1;
  const s = S(g);
  s.passPts += st.row.rewardPoint;
  s.items += st.row.rewardValue; // EventPassMission rewardType 44444 = event items
  g.emit('seasonMissionClaim', { index });
  return [{ type: 44444, value: st.row.rewardValue }, { type: 'pass', value: st.row.rewardPoint }];
}
export function passList(g) {
  const s = S(g);
  return D(g).eventPass.map(r => ({ row: r, claimed: !!s.passClaimed[r.index], open: s.passPts >= r.unlockValue }));
}
export function claimPass(g, index) {
  const s = S(g), st = passList(g).find(x => x.row.index === index);
  if (!st || st.claimed || !st.open) return null;
  s.passClaimed[index] = 1;
  const out = give(g, st.row.rewardType, st.row.rewardValue);
  g.emit('passClaim', { index });
  return out;
}

function bumpEvent(g, e) {
  const s = S(g);
  for (const m of D(g).eventMissions) {
    const rule = RULES[m.type];
    if (!rule || !rule.ev.includes(e.type)) continue;
    const a = emCount(s, m.index);
    if (!a[0]) a[1] = Math.min(m.maxValue, a[1] + amountOf(rule, e));
  }
}

// ---- return missions ----
function retRows(g, cat, day) { return D(g).ret.filter(r => r.missionCatergory === cat && r.activeDay === day && supported(r.missionType)); }
function bumpReturn(g, e, force) {
  const r = S(g).ret;
  if (!r.on) return;
  const bucket = (r.m[r.day] ||= {});
  for (const row of retRows(g, 'daily', r.day)) {
    const rule = RULES[row.missionType];
    const v = force === row.missionType ? 1 : (rule && rule.ev.includes(e.type) ? amountOf(rule, e) : 0);
    if (!v) continue;
    const a = (bucket[row.index] ||= [0, 0]);
    if (!a[0]) a[1] = Math.min(row.missionValue, a[1] + v);
  }
}
export function retState(g) {
  const r = S(g).ret;
  if (!r.on) return null;
  const bucket = (r.m[r.day] ||= {});
  const rows = retRows(g, 'daily', r.day).map(row => {
    const a = (bucket[row.index] ||= [0, 0]);
    return { row, claimed: !!a[0], count: a[1], done: a[1] >= row.missionValue };
  });
  const clearRow = D(g).ret.find(x => x.missionCatergory === 'complete' && x.activeDay === r.day);
  return { day: r.day, rows, clearRow, clearClaimed: !!r.clear[r.day], clearReady: rows.length > 0 && rows.every(x => x.claimed) };
}
export function claimReturn(g, index) {
  const st = retState(g), it = st && st.rows.find(x => x.row.index === index);
  if (!it || it.claimed || !it.done) return null;
  S(g).ret.m[st.day][index][0] = 1;
  const out = give(g, it.row.rewardType, it.row.rewardValue);
  g.emit('returnClaim', { index });
  return out;
}
export function claimReturnClear(g) {
  const st = retState(g);
  if (!st || st.clearClaimed || !st.clearReady) return null;
  S(g).ret.clear[st.day] = 1;
  return give(g, st.clearRow.rewardType, st.clearRow.rewardValue);
}

// ---- soup pass ----
// SoupPassReward rows: level n costs pointValue (40 for the first, 100 after: SoupPassInit[2] and [6]); the free column
// pays on reaching the level, the P column is the paid Special pass (disabled).
export function soupRows(g) { return D(g).soup.reward[soupSeason(nowMs(g))]; }
export function soupLevels(g) {
  const s = S(g).soup;
  let sum = 0;
  return soupRows(g).map((r, i) => {
    sum += r.pointValue;
    return { index: i, row: r, need: sum, open: s.pts >= sum, claimed: !!s.claimed[i] };
  });
}
export function claimSoup(g, i) {
  const st = soupLevels(g)[i];
  if (!st || !st.open || st.claimed) return null;
  S(g).soup.claimed[i] = 1;
  const out = give(g, st.row.rewardType, st.row.rewardValue);
  g.emit('soupClaim', { index: i });
  return out;
}
export const soupCap = g => D(g).soup.init[3]; // msg_soupPassInfo7 "up to 20 mini games per day" = SoupPassInit[3] (inferred match)
export const soupLimit = g => unlocked(g) && S(g).soup.plays < soupCap(g);
const SOUP_TARGETS = 3, SOUP_OPTIONS = 6;
// MakeSoupPassGame (DataManager.c:89425) fills targetList / selectList / optionList of SoupPassGameData: a guest wants some
// ingredients, the player picks from a shuffled option list (inferred sizes 3 of 6).
export function soupStart(g) {
  const s = S(g).soup;
  if (!soupLimit(g)) return null;
  const pool = D(g).soup.minigame.map(r => r.index);
  const pickN = (arr, n) => { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(g.rng() * a.length), 1)[0]); return out; };
  const target = pickN(pool, SOUP_TARGETS);
  const decoys = pickN(pool.filter(x => !target.includes(x)), SOUP_OPTIONS - SOUP_TARGETS);
  const options = pickN([...target, ...decoys], SOUP_OPTIONS);
  s.game = { target, options, select: [], done: false, gain: 0 };
  return s.game;
}
// SelectSoupPassGame (DataManager.c:111917) appends to selectList. After all targets' worth of picks the round pays
// SoupPassInit[5] coins for a perfect soup, SoupPassInit[4] otherwise (inferred), and playCount + 1.
export function soupPick(g, ingredient) {
  const s = S(g).soup, gm = s.game;
  if (!gm || gm.done || gm.select.includes(ingredient) || !gm.options.includes(ingredient)) return null;
  gm.select.push(ingredient);
  if (gm.select.length >= SOUP_TARGETS) {
    const right = gm.select.filter(x => gm.target.includes(x)).length;
    gm.gain = right === SOUP_TARGETS ? D(g).soup.init[5] : D(g).soup.init[4];
    gm.done = true;
    s.pts += gm.gain;
    s.plays += 1;
    g.emit('soupPlay', { gain: gm.gain, right });
  }
  return gm;
}

// ---- play points ----
// DailyPlayPoint rows: after playTime minutes played today a claim pays rewardValue play points (type 99).
export function ppList(g) {
  const p = S(g).pp;
  return D(g).dailyPlayPoint.map(r => ({ row: r, claimed: !!p.claimed[r.index], open: p.sec >= r.playTime * 60 }));
}
export function claimPlayPoint(g, index) {
  const p = S(g).pp, it = ppList(g).find(x => x.row.index === index);
  if (!it || it.claimed || !it.open) return null;
  p.claimed[index] = 1;
  const out = give(g, it.row.rewardType, it.row.rewardValue);
  g.emit('playPointClaim', { index });
  return out;
}
export const playPoints = g => (g.state.missions && g.state.missions.bag && g.state.missions.bag[99]) || S(g).bag[99] || 0;

// ---- red dots ----
export function pending(g) {
  const s = S(g);
  const out = {
    shop: shopList(g).some(x => x.can),
    mission: missionList(g).some(x => x.done && !x.claimed) || passList(g).some(x => x.open && !x.claimed),
    group: !!(calState(g, 'group') || {}).ready,
    season: !!(calState(g, 'season') || {}).ready,
    soup: unlocked(g) && (soupLevels(g).some(x => x.open && !x.claimed) || soupLimit(g)),
    playPoint: ppList(g).some(x => x.open && !x.claimed),
    gift: false,
  };
  const b = calState(g, 'beginner'), w = calState(g, 'welcome'), r = retState(g);
  out.gift = !!((b && b.open && b.ready) || (w && w.open && w.ready) || (r && (r.rows.some(x => x.done && !x.claimed) || (r.clearReady && !r.clearClaimed))));
  out.any = Object.values(out).some(Boolean);
  return out;
}

export default {
  id: 'season',
  bag: g => S(g).bag,
  data: ['season'],
  rewards: { 44444: held(44444) },
  init(g) {
    if (!g.state.season) g.state.season = fresh();
    refresh(g);
  },
  tick(g, dt) {
    const s = S(g);
    s.pp.sec += Math.min(dt, 5);
    s.poll = (s.poll || 0) + dt;
    if (s.poll < 5) return;
    s.poll = 0;
    refresh(g);
  },
  offline(g) { refresh(g); },
  onEvent(g, e) {
    if (!g.state || !g.state.season || !g.data.season) return;
    bumpEvent(g, e);
    bumpReturn(g, e);
    // info_seasonEvent1: crafting soup has a 20 % chance to make an event dish; one event item per dish (inferred mapping to 'food').
    // Own generator (state.season.seed): drawing from game.rng here would shift every other feature's seeded rolls.
    if (e.type === 'food' && roll(S(g)) < 0.2) S(g).items += 1;
  },
  refresh, seasonInfo, seasonId, dayGroup, soupSeason, unlocked, give, calState, claimCal, shopList, buyShop, missionList, claimMission,
  passList, claimPass, retState, claimReturn, claimReturnClear, soupRows, soupLevels, claimSoup, soupLimit, soupCap, soupStart, soupPick,
  ppList, claimPlayPoint, playPoints, pending,
};
