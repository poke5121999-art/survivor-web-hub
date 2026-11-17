// Solo line-ups: the player plus bots, for each play kind (Đấu thường, Đấu rank). Pure, runs in Node (tools/sim-test.mjs section 50).
// main.js turns the result into a match; online rooms build their own roster in online.js.
import { MECHS, MECH_ORDER, DIFFICULTY, BOT_NAMES, MODES, BOSSES, cleanLv, TEAM_SIZE, cleanSize, rankPlan, NO_LV, pveStage } from './data.js';

const flatLv = (n) => cleanLv(NO_LV.map(() => n));

// choice: { play, mech, diff, mode, size, mods: { lv }, skin }. o: { rng, seed, tier (RANKS index, rank only), attract, spectate, side, playerName }.
// Returns { play, mode, diff, size, roster, tier } (tier: the RANK_TIERS row in a ranked match, else null).
export function soloLineup(choice, o) {
  const rng = o.rng, attract = !!o.attract, bot = attract || !!o.spectate;
  const rank = !attract && choice.play === 'rank';
  const plan = rank ? rankPlan(o.tier, o.seed) : null, tier = plan ? plan.tier : null;
  const diff = tier ? tier.diff : DIFFICULTY[choice.diff] ? choice.diff : 'normal';
  // The menu's background match is always Đấu đội.
  const mode = plan ? plan.mode : !attract && MODES[choice.mode] ? choice.mode : 'tdm';
  const names = BOT_NAMES.slice().sort(() => rng() - 0.5);
  const pick = MECHS[choice.mech] ? choice.mech : MECH_ORDER[0];
  // ?side=1 (test hook) puts the player's team on the other end of the map.
  const mine = mode === 'trum' ? 0 : o.side ? 1 : 0, theirs = 1 - mine;
  const roster = [{ team: mine, mech: pick, name: bot ? names.pop() : (o.playerName || 'Bạn'), bot, diff, mods: attract ? null : choice.mods, skin: attract ? null : choice.skin }];
  // Đấu thường: allied bots grow with the player at half pace; enemy bots take a share of the player's levels and a damage
  // multiplier from the difficulty (easy: none and 0.65), so a maxed mech is felt against easy bots.
  // Đấu rank: both sides of bots follow the tier row, whatever the player owns.
  const myLv = cleanLv(!attract && choice.mods && choice.mods.lv), D = DIFFICULTY[diff];
  const botMods = tier ? { lv: flatLv(tier.allyLv) } : { lv: myLv.map((l) => Math.floor(l / 2)) };
  const foeMods = attract ? botMods : tier ? { lv: flatLv(tier.botLv), dmg: tier.foeDmg, hp: tier.foeHp } : { lv: myLv.map((l) => Math.floor(l * D.foeLv)), dmg: D.foeDmg };
  const shuffled = (list) => list.slice().sort(() => rng() - 0.5);
  const allies = shuffled(MECH_ORDER.filter((k) => k !== pick)), foes = shuffled(MECH_ORDER);
  // Săn trùm always sends TEAM_SIZE hunters at the boss and a ranked match is always 3v3; Đấu thường follows the chosen size (free-for-all: 2 * size mechs in all).
  const size = mode === 'trum' || tier ? TEAM_SIZE : cleanSize(choice.size);
  for (let i = 0; i < size - 1; i++) roster.push({ team: mine, mech: allies[i], name: names.pop(), bot: true, diff, mods: botMods });
  if (mode === 'trum') roster.push({ team: 1, mech: 'titan', name: 'Cự Thần', bot: true, diff });
  else for (let i = 0; i < size; i++) roster.push({ team: theirs, mech: foes[i], name: names.pop(), bot: true, diff, mods: foeMods });
  return { play: tier ? 'rank' : 'casual', mode, diff, size, roster, tier };
}

// Phó bản: the humans (1 to 3, each with their own garage levels) on team 0, allied bots up to TEAM_SIZE at the stage's ally level,
// then every monster of every wave on team 1 (wave = its index; sim.js holds the later waves back). humans: [{ mech, name, mods, skin, bot }].
// Returns null for an unknown stage id.
export function pveLineup(stageId, humans, o) {
  const S = pveStage(stageId);
  if (!S) return null;
  const rng = o.rng, names = BOT_NAMES.slice().sort(() => rng() - 0.5);
  const roster = humans.slice(0, TEAM_SIZE).map((h) => ({ team: 0, mech: MECHS[h.mech] ? h.mech : MECH_ORDER[0], name: h.name, bot: !!h.bot, diff: 'normal', mods: h.mods || null, skin: h.skin || null, pid: h.pid || null }));
  const taken = new Set(roster.map((r) => r.mech));
  const allies = MECH_ORDER.filter((k) => !taken.has(k)).sort(() => rng() - 0.5);
  while (roster.length < TEAM_SIZE) roster.push({ team: 0, mech: allies.pop(), name: names.pop(), bot: true, diff: 'normal', mods: { lv: flatLv(S.allyLv) } });
  S.waves.forEach((list, wave) => list.forEach((k) => {
    const boss = !!BOSSES[k].boss;
    const big = boss || BOSSES[k].part;
    roster.push({ team: 1, mech: k, name: BOSSES[k].name, bot: true, diff: big ? 'hard' : S.diff, wave, mods: { hp: big ? S.bossHp : S.hp, dmg: big ? S.bossDmg : S.dmg } });
    // a boss's summons: held dead in its wave until it calls them (sim.js PVE_SCRIPTS)
    const Z = boss && BOSSES[k].summons;
    if (Z) for (let i = 0; i < Z.n; i++) roster.push({ team: 1, mech: Z.mech, name: BOSSES[Z.mech].name, bot: true, diff: S.diff, wave, summon: true, mods: { hp: S.hp, dmg: S.dmg } });
  }));
  return { play: 'pve', mode: 'pve', stage: S, roster, map: S.map, theme: S.theme, duration: S.limit };
}
