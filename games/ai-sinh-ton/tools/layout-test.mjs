// The campaign's maps: layout, biome, theme and rooms of every stage (rooms.js roomPlan, stages.js CHAPTERS, themes.js).
// Asserts: two stages in a row never share a layout; inside a chapter a layout comes back at most once (four kinds over five
// stages; with all eight kinds this tightens to never); every plan has 1-6 rooms, five waves over them in order with the
// boss wave in the last room, links between consecutive rooms, hazards inside their room; every layout kind and both new
// biomes are used; waves of stages 1-30 are the same as before the chapters changed (balance untouched).
// With --shots (browser): an overview of each layout kind and each biome, the whole map seen from high above, and the pad
// the first wave is fought on at the game's camera, into .chk/a10/maps/ (sheet overview.png).
// Usage: node games/ai-sinh-ton/tools/layout-test.mjs [--to=50] [--shots]
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { checker } from './pw.mjs';
import { roomPlan, layoutOf, LAYOUT_KINDS, WAVES } from '../js/sim/rooms.js';
import { stageDef, CHAPTERS, chapterOf } from '../js/data/stages.js';
import { ARENA } from '../js/sim/battle.js';

const argv = process.argv.slice(2); const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const TO = +arg('to') || 50; const SHOTS = argv.includes('--shots');
// sha1 of stages 1-30 (waves, multipliers, boss, slots) on main 28102a33, before the ten chapters
const WAVES_HASH = 'f9ba9c8adfbd97c5';
const { check, done } = checker();
// themes.js is plain data; it reads no browser global, so the table can name each stage's theme
const { themeOf, STAND_IN } = await import('../js/view/themes.js');

const rows = []; const plans = [];
for (let n = 1; n <= TO; n++) {
  const p = roomPlan(n, ARENA); const ch = chapterOf(n); const th = themeOf(p.biome, n); plans.push(p);
  const pass = p.rooms.filter((r) => r.pass).map((r) => r.i);
  rows.push(`${String(n).padStart(2)}  ch${String(ch + 1).padStart(2)} ${CHAPTERS[ch].name.padEnd(13)} ${p.biome.padEnd(8)} ${(th.name + (STAND_IN[p.biome] ? '*' : '')).padEnd(9)} ${p.layout.padEnd(8)} ${p.rooms.length} rooms  waves->${p.waveRoom.join('')}  pass[${pass.join(',')}]  links ${p.links.slice(1).map((l) => l.kind).join(',') || '-'}  hazards ${p.hazards.map((h) => h.kind + '@' + h.room).join(' ') || '-'}`);
}
console.log(' n  chapter           biome    theme     layout   (theme* = stand-in until the biome has its own)');
console.log(rows.join('\n'));

for (let n = 2; n <= TO; n++) {
  const a = plans[n - 2].layout; const b = plans[n - 1].layout;
  check(a !== b, `stages ${n - 1} and ${n}: layouts ${a} / ${b} differ`);
}
for (let c = 0; c * 5 < TO; c++) {
  const ls = plans.slice(c * 5, c * 5 + 5).map((p) => p.layout); const count = {}; for (const l of ls) count[l] = (count[l] || 0) + 1;
  const most = Math.max(...Object.values(count)); const kinds = Object.keys(count).length;
  const rep = Object.values(count).filter((v) => v > 1).length; const allow = Math.max(0, ls.length - LAYOUT_KINDS.length);
  check(most <= 2 && rep <= allow, `chapter ${c + 1}: layouts ${ls.join(',')}: ${kinds} kinds, a kind at most twice, ${rep} kind(s) repeated (<= ${allow})`);
}
let shapeBad = []; let linkBad = []; let hzBad = [];
for (const p of plans) {
  const R = p.rooms.length; const wr = p.waveRoom;
  const ok = R >= 1 && R <= 6 && wr.length === WAVES && wr[WAVES - 1] === R - 1 && wr.every((r, i) => r >= 0 && r < R && (i === 0 || r >= wr[i - 1])) && wr.filter((r) => r === R - 1).length === (R === 1 ? WAVES : 1);
  if (!ok) shapeBad.push(p.n);
  if (p.rooms.some((r) => r.pass && wr.includes(r.i)) || p.rooms.some((r) => !r.pass && !wr.includes(r.i))) shapeBad.push(p.n);
  if (p.links.length !== R || p.links.some((l, i) => l.from !== i - 1 || l.to !== i)) linkBad.push(p.n);
  if (p.hazards.some((h) => !wr.includes(h.room) || (h.kind !== 'wind' && h.kind !== 'current' && Math.hypot(h.x / ARENA.x, h.z / ARENA.z) > 0.85))) hzBad.push(p.n);
  if (layoutOf(p.n) !== p.layout) shapeBad.push(p.n);
}
check(!shapeBad.length, `every plan has 1-6 rooms, five waves in walking order, the boss wave alone in the last room, each room fought in or only crossed: bad stages [${[...new Set(shapeBad)].join(',')}]`);
check(!linkBad.length, `every room is linked from the one before (the start room before room 0): bad stages [${linkBad.join(',')}]`);
check(!hzBad.length, `hazards lie in rooms a wave is fought in, inside 0.85 of the arena: bad stages [${hzBad.join(',')}]`);
const used = new Set(plans.map((p) => p.layout)); check(LAYOUT_KINDS.every((k) => used.has(k)), `layouts used: ${[...used].join(', ')} (all of ${LAYOUT_KINDS.join(', ')})`);
const biomes = new Set(plans.map((p) => p.biome)); check(biomes.has('forest') && biomes.has('swamp'), `biomes used: ${[...biomes].join(', ')} (forest and swamp among them)`);
check(plans.some((p) => p.rooms.some((r) => r.pass)), `some stages have rooms the team only crosses: ${plans.filter((p) => p.rooms.some((r) => r.pass)).map((p) => p.n).join(',')}`);
const kinds = new Set(plans.flatMap((p) => p.hazards.map((h) => h.kind))); check(['poison', 'wind', 'current', 'collapse'].every((k) => kinds.has(k)), `hazard kinds in use: ${[...kinds].join(', ')}`);
check(new Set(plans.map((p) => p.rooms.length)).size >= 4, `room counts in use: ${[...new Set(plans.map((p) => p.rooms.length))].sort().join(', ')} (>= 4 different)`);
{
  const all = []; for (let n = 1; n <= 30; n++) { const d = stageDef(n); all.push(JSON.stringify([d.waves, d.hpMul, d.atkMul, d.boss, d.bossHp, d.slots])); }
  const h = createHash('sha1').update(all.join('|')).digest('hex').slice(0, 16);
  check(h === WAVES_HASH, `stages 1-30 bring the same waves, multipliers and bosses as before the chapters changed (${h} = ${WAVES_HASH})`);
}
check(CHAPTERS.length === 10 && chapterOf(50) === 9 && chapterOf(1) === 0 && CHAPTERS[0].biome === 'forest' && CHAPTERS[3].biome === 'swamp', `ten chapters, stage 50 in the tenth, chapter 1 forest, chapter 4 swamp`);

if (SHOTS) {
  const { shots } = await import('./layout-shots.mjs');
  await shots(check, plans);
}
done();
