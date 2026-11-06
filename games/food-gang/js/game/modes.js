// Play -> mode picker (owner request 2026-11-02) [ĐỀ XUẤT]. Food Gang's quick play draws the mode from GameModeDeck
// (GameMode.json m_randomGameModes: 7 modes, 2 cards each); RANDOM keeps that draw. The other choices pin one of the
// 7 original modes or one of the two web-only objective modes (js/sim/Systems/Objectives.js).
import { GoalType, TeamConfig } from '../sim/index.js';
import { MatchSlot } from '../meta/events.js';
import { teamForSlot } from '../meta/matchmaking.js';

// choice 0 = random; 1..7 = db.randomModes[choice - 1]; 8, 9 = objective modes
export const OBJECTIVE_MODES = [
  { text: 'web.mode.payload', goal: GoalType.Payload, team: TeamConfig.TwoVersusTwo, desc: 'web.mode.desc.payload' },
  { text: 'web.mode.siege', goal: GoalType.Siege, team: TeamConfig.TwoVersusTwo, desc: 'web.mode.desc.siege' },
];
const DESC = {
  'mission.dm.ffa': 'web.mode.desc.dm.ffa', 'mission.dm.2vs2': 'web.mode.desc.dm.2vs2', 'mission.kill.ffa': 'web.mode.desc.kill.ffa',
  'mission.kill.2vs2': 'web.mode.desc.kill.2vs2', 'mission.survive.ffa': 'web.mode.desc.survive.ffa',
  'mission.survive.2vs2': 'web.mode.desc.survive.2vs2', 'mission.killboss.1vs3': 'web.mode.desc.killboss.1vs3',
};

/** Every choice of the picker: {choice, text, desc, goal, team} (choice 0 has goal null). */
export function modeChoices(metaDb) {
  const out = [{ choice: 0, text: 'config.random.mode', desc: 'web.mode.desc.random', goal: null, team: null }];
  metaDb.randomModes.forEach((m, i) => out.push({ choice: i + 1, text: m.text, desc: DESC[m.text] || '', goal: m.goal, team: m.team }));
  OBJECTIVE_MODES.forEach((m, i) => out.push({ choice: metaDb.randomModes.length + 1 + i, ...m }));
  return out;
}

const KEY = 'fg-mode-choice';
export function savedChoice(n) { try { const v = Number(localStorage.getItem(KEY)); return Number.isInteger(v) && v >= 0 && v < n ? v : 0; } catch { return 0; } }
export function saveChoice(v) { try { localStorage.setItem(KEY, String(v)); } catch { /* private mode */ } }

/**
 * Re-seat a matchmaking request for another goal / team config (local slot kept unless the mode needs a seat: 1v1 =
 * slots 0-1, boss mode = not the boss seat). players: 2 for a duel, else 4.
 */
export function applyMode(req, goal, team, { players = 4, text = null, slot = null } = {}) {
  const local = req.slots[req.localSlot];
  req.goal = goal; req.team = team;
  if (text) req.modeText = text;
  req.bossOnLeft = goal === GoalType.KillBoss ? false : req.bossOnLeft;
  const bots = req.slots.filter((s) => s && s !== local);
  let localSlot = slot != null ? Math.max(0, Math.min(3, slot | 0)) : req.localSlot;
  if (players === 2) localSlot = 0;
  else if (goal === GoalType.KillBoss && localSlot === (req.bossOnLeft ? 0 : 3)) localSlot = 0;
  req.slots = [null, null, null, null];
  let bi = 0;
  for (let s = 0; s < players; s++) {
    const src = s === localSlot ? local : bots[bi++];
    req.slots[s] = new MatchSlot({ ...src, slot: s, team: teamForSlot(s, team, req.bossOnLeft) });
  }
  req.localSlot = localSlot;
  for (const s of req.slots) if (s && s.isBot) s.isAlly = team !== TeamConfig.FreeForAll && s.team === req.slots[localSlot].team;
  return req;
}

/** The picker's choice applied to a quick-play request (0 = the original deck draw, untouched). */
export function applyChoice(req, choice, metaDb) {
  if (!choice) return req;
  const c = modeChoices(metaDb)[choice];
  if (!c || c.goal == null) return req;
  if (c.choice <= metaDb.randomModes.length) req.modeIndex = c.choice - 1;
  return applyMode(req, c.goal, c.team, { text: c.text });
}
