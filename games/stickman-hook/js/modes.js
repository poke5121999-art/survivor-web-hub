// The playable modes. Every difference between modes lives in this table; main.js and menus.js only ask it.
//   file      data/mode-<file>.json (tools/build_data.py) holding the mode's level lists; null = levels.json
//   player()  the player class (a promise for lazily loaded ones)
//   slot(s)   where the save keeps the mode's progress: {level, best, done?}
//   open(m, s, i)  whether level index i can be played (autoUnlockNextLevel modes: after level i-1)
//   complete(m, s, i)  end-of-level rewards; returns {xp, got}
//   hud       word drawn before the level number
//   picker    opening the mode shows its level picker
//   launch(app)  a mode with its own screen (Pachinko, the Race page): main.js openMode calls it instead of loading levels
// The unlock threshold of each mode is data (meta.d.modes), and so are the theme colours (Meta.themeFor).
//   gate      starting a level goes through the mode's daily play limit (daily.js payPlay, main.js openLevels)
// Not reproduced: the events' date window and reward list (server-driven): both events are always on.
import { Player } from './physics.js';
import { XP_ROAD, CHALLENGE_LEVELS } from './meta.js';
import { owns } from './save.js';

// js/daily.js (day limits, event cycle) loads with the first gated mode: main.js loadMode awaits its prepare()
let D = null;
const loadDaily = () => (D ? Promise.resolve(D) : import('./daily.js').then((m) => (D = m)));

export const NORMAL = 'mode.normal';

const modeSlot = (id) => (s) => (s.modes[id] = s.modes[id] || {});
const afterPrevious = (slot) => (m, s, i) => i <= (slot(s).best || 0);
const grapplePlayer = () => import('./grapple.js').then((g) => g.GrapplePlayer);

function mode(id, def) {
  const slot = modeSlot(id);
  return {
    slot, open: afterPrevious(slot), picker: true, player: () => Player,
    complete: (m, s, i) => m.modeLevelComplete(s, slot(s), i, def.road, def.reward, id),
    ...def,
  };
}

// Seasonal event: one level a day (SeasonalEventsService cycle, daily.js eventToday), none once today's reward is won
// or every reward is owned; each game needs the day's free play or 1 skip ticket (maxFreeGamesPerDay 1).
// [ĐỀ XUẤT] reward i = the event's i-th skin (customization table order), see Meta.modeLevelComplete.
function event(id, hud) {
  const reward = 'seasonal_event_' + id.replace('.', '_');
  const today = (m, s, now) => {
    const its = m.items.filter((o) => o.unlock === reward);
    return D.eventToday(s, id, its.length, (i) => owns(s, its[i].kind, its[i].name), now);
  };
  return mode(id, { file: 'seasonal', hud, road: null, reward, today, gate: true, prepare: loadDaily,
    open: (m, s, i) => { const t = today(m, s); return !t.all && !t.wonToday && i === t.level; } });
}

export const MODES = {
  [NORMAL]: {
    file: null, hud: 'level', picker: false, player: () => Player,
    slot: (s) => s, // Normal keeps its v1 fields save.level / save.best
    open: (m, s, i) => i <= s.best,
    complete: (m, s, i) => m.levelComplete(s, i),
  },
  'mode.grapple': mode('mode.grapple', { file: 'grapple', hud: 'grapple', road: 'achieved_level_mode.grapple', player: grapplePlayer }),
  // autoUnlockNextLevel = false: level index i is open once the XP road granted i Challenge levels
  // (HasUnlockedLevel: GetMaxLevelUnlocked >= level [asm 0x1296d08..0x1296d14]), so level 1 comes with the mode.
  'mode.challenge': mode('mode.challenge', {
    file: 'challenge', hud: 'challenge', road: 'achieved_level_mode.challenge',
    open: (m, s, i) => i <= m.roadGranted(XP_ROAD, CHALLENGE_LEVELS, s.xp),
  }),
  'mode.easter_event': event('mode.easter_event', 'easter'),
  'mode.valentine_day': event('mode.valentine_day', 'valentine'),
  // Lucky Drop: its own engine and screen (js/pachinko.js, loaded on open). No levels; unlock rule stays meta.d.modes.
  'mode.pachinko': { launch: (app) => import('./pachinko.js?v=20261028k').then((p) => p.open(app)) },
  // Adventure: the endless run against the firewall, its page and meta (js/adventure.js + js/advrun.js, loaded on open)
  'mode.adventure': { launch: (app) => import('./adventure.js?v=20261028k').then((a) => a.open(app)) },
  // Race (Tournament): Normal physics on the 21 Tournament maps against 4 recorded ghosts. Opening it shows the
  // tournament page of js/race.js (loaded on open), which starts each race through main.js startRace. Rewards are
  // trophies and coins by placement (race.js), no XP: the base GiveEndGameRewards is empty [asm 0x28d84f8].
  'mode.tournament': {
    file: 'race', hud: 'race', picker: false, player: () => Player, slot: modeSlot('mode.tournament'), open: () => true,
    complete: () => ({ xp: 0, got: [] }), launch: (app) => import('./race.js?v=20261028k').then((r) => r.open(app)),
  },
};
