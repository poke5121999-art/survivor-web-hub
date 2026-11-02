// Feature "missions" (sim part): daily missions, levelled quests, the all-clear scratch card, attendance.
// Rules: D:/catsoup-ref/rules/missions.md. Tables and event rules: data/missions.json (tools/export_missions.py), so a
// counter is a table row plus a rule, never a branch per mission. Contract: js/sim/registry.js.

export const dayKey = (ms = Date.now()) => {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const S = g => g.state.missions;
const M = g => g.data.missions;

// ---- reward helpers ----
// Gold/energy by seconds (101, 102), tickets (1101-1203) and pudding (23) are paid by the specials feature. Types whose
// owner feature may not exist yet (fish 7, butterflies 98, play points 99, star bait 6002) wait in state.missions.bag
// when no earlier feature lists the type (game.reward takes the first one that does).
const held = type => (g, value) => { const b = S(g).bag; b[type] = (b[type] || 0) + Number(value); return { type, value, held: true }; };
const rewards = Object.fromEntries([7, 98, 99, 6002].map(t => [t, held(t)]));

// ---- tables ----
const missionRow = (g, idx) => M(g).missions.find(m => m.index === idx);
// GameAchieveManager.GetQuestMaxValue (CnS/GameAchieveManager.c:1639): target(L) = maxValue + addFactor x floor(L ^ subFactor)
export const questTarget = (q, level) => q.maxValue + q.addFactor * Math.floor(level ** q.subFactor);
const questRule = (g, q) => M(g).rules[q.type];

// UI_Quest.c ShowUI ~2995-3030: row 100 is the all-clear card; work-gated rows need their facility built. Display order.
export function listedMissions(g) {
  const need = M(g).needWork;
  return M(g).missions.filter(m => m.index !== 100 && (!need[m.index] || g.state.works.some(w => w.a === need[m.index])) && M(g).rules[m.type])
    .sort((a, b) => a.displayorder - b.displayorder);
}
// Quest rows shown: those with a counter rule in this port (see rules/missions.md for the ones left out).
export const listedQuests = g => M(g).quests.filter(q => questRule(g, q));

function dailyOf(s, idx) { return (s.daily[idx] ||= [0, 0]); }

// DataManager.ResetDailyReward (DataManager.c:100550-100760): three rolls, each r = RandomValue(1000), pool = rows with
// probability >= 1000 - r, one uniformly from the pool.
function rollScratch(g) {
  const rows = M(g).scratch;
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const r = Math.floor(g.rng() * 1000);
    const pool = rows.filter(x => x.probability >= 1000 - r);
    picks.push(pool[Math.floor(g.rng() * pool.length)].index);
  }
  return picks;
}

// Spawn.TimeFlow / RefreshDayWorkCount (Spawn.c:29510): a new calendar date resets the dailies; also counts the login day.
export function rollover(g, now = Date.now()) {
  const s = S(g), day = dayKey(now);
  if (s.day === day) return false;
  s.day = day;
  s.daily = {};
  s.clear = { picks: rollScratch(g), claimed: false };
  s.attend.avail += 1;
  g.emit('missionsReset', { day });
  return true;
}

function bump(s, g, e) {
  const m = M(g);
  // recipe events carry the new level only: gains are measured against the last level seen.
  let unlock = 0, gain = 0, line = -1;
  if (e.type === 'recipe') {
    const prev = s.rl[e.index] || 0;
    unlock = prev === 0 && e.level > 0 ? 1 : 0;
    gain = Math.max(0, e.level - prev) - unlock;
    s.rl[e.index] = e.level;
    line = g.food.get(e.index)?.type;
  }
  const amount = rule => {
    if (!rule.ev.includes(e.type)) return 0;
    if (rule.where && !Object.entries(rule.where).every(([k, v]) => e[k] === v)) return 0;
    if (rule.recipe === 'unlock') return unlock;
    if (rule.recipe === 'level') return rule.line === line ? gain : 0;
    return rule.amount ? Number(e[rule.amount]) || 0 : 1;
  };
  for (const row of m.missions) {
    const rule = m.rules[row.type];
    const v = rule && row.index !== 100 ? amount(rule) : 0;
    if (v) { const d = dailyOf(s, row.index); d[1] = Math.min(d[1] + v, row.maxValue); } // AddMissionValue DataManager.c:7342
  }
  for (const q of m.quests) {
    const rule = m.rules[q.type];
    const v = rule ? amount(rule) : 0;
    if (!v) continue;
    const a = (s.quest[q.index] ||= [0, 0]);
    if (a[0] < q.maxLv) a[1] += v; // AddAchieveValue GameAchieveManager.c:284
  }
}

// ---- claims ----
const given = (g, type, value) => g.reward(type, value);

export function missionState(g, idx) {
  const row = missionRow(g, idx), d = dailyOf(S(g), idx);
  return { row, claimed: !!d[0], count: d[1], done: d[1] >= row.maxValue };
}

// DataManager.MissionLevelUp (DataManager.c:30407): ok when count >= maxValue.
export function claimMission(g, idx) {
  const st = missionState(g, idx);
  if (st.claimed || !st.done) return null;
  dailyOf(S(g), idx)[0] = 1;
  const out = given(g, st.row.rewardType, st.row.rewardValue);
  g.emit('missionClaim', { index: idx });
  return out || { type: st.row.rewardType, value: st.row.rewardValue };
}

// The scratch card opens once every listed mission is claimed (UI_Quest.JudgeEnableScratch).
export const clearReady = g => listedMissions(g).every(m => missionState(g, m.index).claimed);

// DataManager.GetDailyReward (DataManager.c:86845): pays all three rolled rows.
export function claimClear(g) {
  const s = S(g);
  if (s.clear.claimed || !clearReady(g)) return null;
  s.clear.claimed = true;
  const rows = s.clear.picks.map(i => M(g).scratch.find(r => r.index === i));
  const out = rows.map(r => given(g, r.rewardType, r.rewardValue) || { type: r.rewardType, value: r.rewardValue });
  g.emit('missionClear', { rows: rows.map(r => r.index) });
  return out;
}

export function questState(g, idx) {
  const q = M(g).quests.find(x => x.index === idx), a = (S(g).quest[idx] ||= [0, 0]);
  const target = questTarget(q, a[0]);
  return { row: q, level: a[0], value: a[1], target, done: a[1] >= target && a[0] < q.maxLv };
}

// AchieveLevelUp (GameAchieveManager.c:1): reward, then level + 1 (inferred; the value keeps counting).
export function claimQuest(g, idx) {
  const st = questState(g, idx);
  if (!st.done) return null;
  S(g).quest[idx][0] += 1;
  const out = given(g, st.row.rewardType, st.row.rewardValue);
  g.emit('questClaim', { index: idx, level: st.level + 1 });
  return out || { type: st.row.rewardType, value: st.row.rewardValue };
}

// Attendance: Montly28Rewards month 0 (28 rows). One reward per login day, in order (inferred, UI_EventDaily_Monthly).
export function attendState(g) {
  const a = S(g).attend, rows = M(g).attend;
  return { rows, next: a.next % rows.length, cycle: Math.floor(a.next / rows.length), avail: a.avail };
}
export function claimAttend(g) {
  const a = S(g).attend, rows = M(g).attend;
  if (a.avail < 1) return null;
  const row = rows[a.next % rows.length];
  a.avail -= 1;
  a.next += 1;
  const out = given(g, row.rewardType, row.rewardValue);
  g.emit('attendClaim', { index: row.index });
  return out || { type: row.rewardType, value: row.rewardValue };
}

// Anything waiting to be claimed, for the red dot on the HUD button.
export function pending(g) {
  const s = S(g);
  return listedMissions(g).some(m => missionState(g, m.index).done && !missionState(g, m.index).claimed)
    || (!s.clear.claimed && clearReady(g)) || s.attend.avail > 0
    || listedQuests(g).some(q => questState(g, q.index).done);
}

export default {
  id: 'missions',
  bag: g => S(g).bag,
  data: ['missions'],
  rewards,
  init(g) {
    const s = g.state;
    if (!s.missions) s.missions = { day: '', daily: {}, quest: {}, clear: { picks: [], claimed: false }, attend: { next: 0, avail: 0 }, rl: { ...s.recipes }, bag: {} };
        rollover(g);
  },
  tick(g, dt) {
    const s = S(g);
    s.poll = (s.poll || 0) + dt;
    if (s.poll < 5) return; // calendar check every 5 s of game time
    s.poll = 0;
    rollover(g);
  },
  offline(g) { rollover(g); },
  onEvent(g, e) {
    if (!g.state || !g.state.missions || !g.data.missions) return;
    bump(S(g), g, e);
  },
  listedMissions, listedQuests, missionState, claimMission, clearReady, claimClear, questState, claimQuest, attendState,
  claimAttend, pending, rollover,
};
