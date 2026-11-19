// Stages: five waves each, the fifth is the stage's boss. A stage is fully determined by its number, so every
// player meets the same waves. Stages 1-30 are the campaign; past 30 the same rules keep scaling without end.
import { ENEMY } from './enemies.js';
import { expectedSlots } from './unlocks.js';

export const CHAPTERS = [
  { name: 'Phố Hoang', floor: 0x8f9aa6, fog: 0xa9b6c4 },
  { name: 'Bãi Xe Cũ', floor: 0xa39a84, fog: 0xc2b89c },
  { name: 'Nhà Máy Lạnh', floor: 0x8fa5ad, fog: 0xb4ccd6 },
  { name: 'Hầm Mộ Cát', floor: 0xb39a6c, fog: 0xd6c08e },
  { name: 'Bãi Đáp Lạ', floor: 0x8a8fb0, fog: 0xa9a6d6 },
  { name: 'Rìa Hư Không', floor: 0x7d7a94, fog: 0x9a8cc0 },
];

// boss of each campaign stage; '*' stages close a chapter and are the difficulty spikes
const BOSS_ORDER = [
  'giant', 'thrower', 'phantom', 'queen', 'brood',
  'giant', 'vampire', 'thrower', 'alien', 'pharaoh',
  'phantom', 'queen', 'ufo', 'brood', 'guardian',
  'vampire', 'alien', 'giant', 'pharaoh', 'dragon',
  'thrower', 'ufo', 'phantom', 'guardian', 'vampire',
  'queen', 'alien', 'brood', 'pharaoh', 'dragon',
];
const ENDLESS = ['giant', 'thrower', 'phantom', 'queen', 'brood', 'vampire', 'alien', 'pharaoh', 'ufo', 'guardian', 'dragon'];

// [first stage it appears, kind, weight]
const UNLOCK = [
  [1, 'walker', 6], [1, 'runner', 3], [2, 'spitter', 2], [3, 'hound', 2], [4, 'bloater', 1.5], [4, 'flyer', 2],
  [6, 'shielder', 2], [7, 'brute', 1], [8, 'shrieker', 0.8], [10, 'spider', 2], [11, 'armored', 1.5], [12, 'burner', 2], [14, 'frost', 2],
];

// stage-1 multipliers over the tables in enemies.js, then the growth per stage
export const BASE = { hp: 2.4, atk: 2.2, bossHp: 2.6, ultCost: 2.2 };
export const HP_GROWTH = 1.055;
export const ATK_GROWTH = 1.03;
export const SPIKE_HP = 1.25;
export const MAX_ALIVE = 40;
// early stages are met with fewer team slots open (unlocks.js): wave size and boss health shrink to match
export const TEAM_K = { 1: 0.3, 2: 0.36, 3: 0.65, 4: 0.92 };
// fewer heroes also share the same blows between fewer bodies
export const TEAM_ATK = { 1: 0.45, 2: 0.48, 3: 0.82, 4: 1 };

function rngOf(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function bossOf(n) { return n <= 30 ? BOSS_ORDER[n - 1] : ENDLESS[(n - 31) % ENDLESS.length]; }
export function isSpike(n) { return n % 5 === 0; }

// how many times this boss has been met up to stage n: tier 1, 2, 3 (and 3 from then on)
export function bossTierOf(n) {
  const id = bossOf(n); let seen = 0;
  for (let s = 1; s <= Math.min(n, 30); s++) if (BOSS_ORDER[s - 1] === id) seen++;
  return n > 30 ? 3 : Math.min(3, seen);
}

export function stageDef(n) {
  const rnd = rngOf(n * 7919 + 13);
  const chapter = Math.min(CHAPTERS.length - 1, Math.floor((n - 1) / 5));
  const pool = UNLOCK.filter((u) => u[0] <= n);
  const totalW = pool.reduce((s, u) => s + u[2], 0);
  const pick = () => { let x = rnd() * totalW; for (const u of pool) { x -= u[2]; if (x < 0) return u[1]; } return pool[0][1]; };
  const boss = bossOf(n);
  const slots = expectedSlots(n); const teamK = TEAM_K[slots];
  const waves = [];
  for (let w = 1; w <= 5; w++) {
    const isBoss = w === 5;
    const budget = ((isBoss ? 9 : 9 + 4.5 * w) + Math.min(n, 40) * 0.5) * teamK;
    const span = isBoss ? 30 : 13 + w * 2;
    const groups = [];
    const nG = isBoss ? 4 : 3 + w;
    const per = budget / nG;
    for (let g = 0; g < nG; g++) {
      const kind = pick(); const c = ENEMY[kind].cost;
      const cnt = Math.max(1, Math.round(per / c));
      groups.push({ kind, n: cnt, at: isBoss ? 6 + g * (span / nG) : (g * span) / nG, ang: rnd() * 6.283, spread: 0.5 + rnd() * 0.6 });
    }
    // elites join from stage 5: the last group of waves 3 and 4 is led by one
    if (!isBoss && n >= 5 && w >= 3) { const kind = pick(); groups.push({ kind, n: 1 + Math.floor((n - 5) / 12), at: span * 0.7, ang: rnd() * 6.283, spread: 0.3, elite: true }); }
    if (isBoss) groups.unshift({ kind: boss, n: 1, at: 1.5, ang: rnd() * 6.283, spread: 0 });
    waves.push({ groups, boss: isBoss ? boss : null });
  }
  return {
    n, chapter, chapterName: CHAPTERS[chapter].name, name: `${CHAPTERS[chapter].name} ${((n - 1) % 5) + 1}`,
    floor: CHAPTERS[chapter].floor, fog: CHAPTERS[chapter].fog,
    hpMul: BASE.hp * Math.pow(HP_GROWTH, n - 1), atkMul: BASE.atk * Math.pow(ATK_GROWTH, n - 1) * TEAM_ATK[slots],
    boss, bossName: ENEMY[boss].name, bossTier: bossTierOf(n), bossHp: BASE.bossHp * (isSpike(n) ? SPIKE_HP : 1) * teamK, slots, spike: isSpike(n), waves,
  };
}

// hero level a player is expected to field at stage n; tools/balance.mjs tunes the tables against this line
export function expectedLevel(n) { return Math.max(1, Math.round(1 + (n - 1) * 0.8)); }
