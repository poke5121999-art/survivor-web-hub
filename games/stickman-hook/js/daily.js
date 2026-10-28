// Per-day rules of the original that run on the client: the daily play limits of the modes (GameModesService) and the
// seasonal event's one-level-a-day cycle (SeasonalEventsService). No DOM. Used by modes.js / main.js (events),
// race.js (Race) and pachinko.js (Lucky Drop). Asm: D:/stickman-hook-ref/dump/asm/cardfx/GameModesService__*.s.
import { SKIP_TICKETS, qty, addQty } from './meta.js';

export const DAY = 86400000;

// TimeServiceHelper.FormatDateId [asm 0x2e7b9ec]: DateTime.ToString("yyyy-MM-dd"). The original's date comes from
// OnlineDateService (server); offline the device clock, local time.
export function dayKey(ms = Date.now()) {
  const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function midnight(ms = Date.now()) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
// ADateService.GetSecondsLeftToday: time to the next local midnight
export function msLeftToday(now = Date.now()) { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now; }
export function fmtLeft(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return `${Math.floor(m / 60)} giờ ${String(m % 60).padStart(2, '0')} phút`;
}

// game_modes.modes[].maxFreeGamesPerDay / maxRewardedGamesPerDay of remote_settings_default.json (-1 = no limit).
// Every other mode is -1 / -1 (Normal, Challenge, Grapple, Adventure, Lucky Wheel).
export const LIMITS = {
  'mode.tournament': [2, -1],
  'mode.pachinko': [1, 2],
  'mode.easter_event': [1, -1],
  'mode.valentine_day': [1, -1],
};

// GetDailyFreeResourceId / GetDailyRewardedResourceId [asm 0x1296f40, 0x1296fe8]: "daily_flag_" + mode + "_free_" /
// "_rewarded_" + FormatDateId; GetRewardedTicketsResourceId [asm 0x1297090]: "rewarded_tickets_" + mode.
const freeKey = (id, day) => 'daily_flag_' + id + '_free_' + day;
const rewKey = (id, day) => 'daily_flag_' + id + '_rewarded_' + day;
export const ticketsKey = (id) => 'rewarded_tickets_' + id;

// GameModesService.CleanOldFlags [asm 0x12964cc]: the daily flags of other days are deleted
function clean(save, id, day) {
  const keep = [freeKey(id, day), rewKey(id, day)];
  for (const f of Object.keys(save.flags)) if (f.startsWith('daily_flag_' + id + '_') && !keep.includes(f)) delete save.flags[f];
}

// GetCanPlayState [asm 0x129747c]: free (CanPlayForFree: max < 0 or played free < max [asm 0x12972f0]) -> the mode's
// rewarded tickets (> 0 [asm 0x1297390]) -> a rewarded ad (CanPlayForRewarded: max < 0 or played rewarded < max
// [asm 0x1297340]) -> limit reached ("Daily Limit Reached"). The web pays the ad with 1 skip ticket (rewarded.default skipPrice).
export function playState(save, id, now = Date.now()) {
  const [maxFree, maxRew] = LIMITS[id] || [-1, -1], day = dayKey(now);
  const usedFree = save.flags[freeKey(id, day)] || 0, usedRew = save.flags[rewKey(id, day)] || 0;
  const free = maxFree < 0 ? Infinity : Math.max(0, maxFree - usedFree);
  const rewarded = maxRew < 0 ? Infinity : Math.max(0, maxRew - usedRew);
  const modeTickets = qty(save, ticketsKey(id)), tickets = qty(save, SKIP_TICKETS);
  const state = free > 0 ? 'free' : modeTickets > 0 ? 'tickets' : rewarded > 0 ? 'rewarded' : 'limit';
  // GetDailyPlayProgress [asm 0x1297668]: "Daily limit: {played free + rewarded}/{max free + max rewarded}"
  return { state, free, rewarded, modeTickets, tickets, maxFree, maxRew, played: usedFree + usedRew, max: maxFree + maxRew,
    msLeft: msLeftToday(now) };
}

// TryPlaying [asm 0x1297744]: PlayForFree counts the free flag [asm 0x1297870]; with the mode's tickets PlayForRewarded
// spends one and counts the rewarded flag [asm 0x1297a04]; otherwise a rewarded ad grants one ticket (AddRewardedTicket
// [asm 0x1298494]) -- here the ad costs 1 skip ticket and the ticket is played at once. Returns how it was paid, or null.
export function payPlay(save, id, now = Date.now()) {
  const day = dayKey(now);
  clean(save, id, day);
  const st = playState(save, id, now);
  const count = (k) => { save.flags[k] = (save.flags[k] || 0) + 1; };
  if (st.state === 'free') { if (st.maxFree >= 0) count(freeKey(id, day)); return 'free'; }
  if (st.state === 'tickets') { addQty(save, ticketsKey(id), -1); count(rewKey(id, day)); return 'ticket'; }
  if (st.state === 'rewarded' && st.tickets > 0) { addQty(save, SKIP_TICKETS, -1); count(rewKey(id, day)); return 'ad'; }
  return null;
}

// ---- seasonal event cycle (SeasonalEventsService) ---------------------------------------------------------------------
// InitializeEvent [asm 0x118066c]: the stored SeasonalEventState is kept while now < EndDate = StartDate + (number of its
// rewards) days [asm 0x11807dc..0x118081c, 0x117fe54]; otherwise a new state starts today (StartDate = the day at 00:00,
// [asm 0x11809d4..0x1180a34]) holding the event rewards not owned yet (<InitializeEvent>b__2: GetQuantity < 1
// [asm 0x1181f6c]). GetRewardForToday = rewards[(now - StartDate).Days] [asm 0x11810b8, 0x118117c]; GetLevelForToday =
// the index of that reward in the event's reward list [asm 0x118127c]. `owned(i)`: reward i of the event is owned.
export function eventToday(save, id, n, owned, now = Date.now()) {
  const slot = (save.modes[id] ||= {});
  let c = slot.cycle;
  if (!c || !(now < c.start + c.rewards.length * DAY)) {
    c = slot.cycle = { start: midnight(now), rewards: [...Array(n).keys()].filter((i) => !owned(i)) };
  }
  const level = c.rewards[Math.floor((now - c.start) / DAY)] ?? -1;
  // GetCanPlayState [asm 0x1180bd0]: HasWonAllRewards -> COMPLETELY_FINISHED (5) [asm 0x1180c44], HasWonRewardToday
  // (today's reward owned [asm 0x117ec74]) -> PARTIALLY_FINISHED (6) [asm 0x1180c58], else the mode's daily limits.
  const all = [...Array(n).keys()].every(owned);
  return { level, all, wonToday: level >= 0 && owned(level), start: c.start, days: c.rewards.length };
}
