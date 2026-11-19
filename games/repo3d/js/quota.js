// Quota formula shared by run.js and house3d.js (design-inventory section 1, ENG/G03_World_a.cs:1027):
// quotaTotal = round(sum(value0) * 0.7 * curve(level) * crewMul(crew)); curve 0.4 @1, 0.7 @10, 1.0 @20 (linear between).
export function curve(level) { return level <= 10 ? 0.4 + 0.3 * (level - 1) / 9 : 0.7 + 0.3 * (Math.min(20, level) - 10) / 10; }
/** 1 person 0.55, 2 people 0.7, 3 people 0.85, 4 or more 1.0. */
export function crewMul(crew) { return 0.4 + 0.15 * Math.min(Math.max(1, crew), 4); }
export function quotaFor(lootSum, level, crew) { return Math.round(lootSum * 0.7 * curve(level) * crewMul(crew)); }
