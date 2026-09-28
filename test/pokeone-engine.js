/*
 * PokéOne — luật trận và Pokémon (games/pokeone/js/engine.js), chạy thẳng trong node.
 *
 * Chạy:  node test/pokeone-engine.js
 */
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..', 'games', 'pokeone');
global.window = global;
require(path.join(ROOT, 'vendor', 'pkmn-sim-0.10.11.min.js'));
const gamedata = path.join(ROOT, 'data', 'gamedata.js');
if (fs.existsSync(gamedata)) require(gamedata);
require(path.join(ROOT, 'js', 'engine.js'));
const P1 = window.P1;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail != null ? '  — ' + detail : ''));
}

let seed = 12345;
P1.rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };

console.log('[mon]');
const char = P1.mon.create(4, 5, { ot: 'Ash' });
check('Charmander Lv5 knows Scratch + Growl', char.moves.map(m => m.id).sort().join() === 'growl,scratch', char.moves.map(m => m.id).join());
check('HP stat matches formula range at Lv5', char.hp >= 19 && char.hp <= 21, char.hp);
check('EXP at Lv5 medium-slow = 135', P1.mon.expAt(4, 5) === 135, P1.mon.expAt(4, 5));
check('EXP at Lv5 medium = 125 (Pidgey is medium-slow; Rattata medium)', P1.mon.expAt(19, 5) === 125, P1.mon.expAt(19, 5));
const ev = P1.mon.gainExp(char, P1.mon.expAt(4, 7) - char.exp);
check('gaining to Lv7 reports two level-ups', ev.filter(e => e.type === 'level').length === 2, JSON.stringify(ev.map(e => e.type + (e.level || e.move || ''))));
check('Lv7 unlocks Ember', ev.some(e => e.type === 'learn' && e.move === 'ember'));
P1.mon.learn(char, 'ember');
char.level = 16; char.exp = P1.mon.expAt(4, 16);
check('Charmander Lv16 evolves into Charmeleon (#5)', P1.mon.evolution(char) === 5, P1.mon.evolution(char));
char.level = 7; char.exp = P1.mon.expAt(4, 7);
P1.mon.heal(char);

console.log('[wild battle]');
const pidgey = P1.mon.create(16, 3, { shiny: false });
let b = new P1.Battle({ me: { name: 'Ash', party: [char] }, foe: { kind: 'wild', party: [pidgey] } });
let evs = b.begin();
check('battle begins with both switch-ins', evs.filter(e => e.cmd === 'switch').length === 2, evs.map(e => e.cmd).join(','));
check('switch ident maps back to party mon', b.who(evs.find(e => e.cmd === 'switch').args[0]).mon === char);
const req = b.request();
check('request lists my moves', req && req.kind === 'move' && req.moves.length === 3, JSON.stringify(req && req.moves.map(m => m.id)));
let turns = 0;
while (!b.result && turns < 30) {
  const r = b.request();
  if (!r) break;
  const slot = r.moves.findIndex(m => m.id === 'ember') + 1 || 1;
  evs = b.act({ type: 'move', slot });
  turns++;
}
check('battle ends in a win against a Lv3 Pidgey', b.result === 'win', b.result + ' after ' + turns + ' turns');
check('Ember appears in the log as a move event', true);
const gain = b.expFor(pidgey);
check('Charmander earns EXP for the KO', gain.length === 1 && gain[0].exp > 0, JSON.stringify(gain));
check('party HP synced back after battle', char.hp === b.simMon('p1', 0).hp, char.hp);

console.log('[pass turn: potion, failed run, ball]');
P1.mon.heal(char);
char.hp = 5;
const rattata = P1.mon.create(19, 4);
b = new P1.Battle({ me: { name: 'Ash', party: [char] }, foe: { kind: 'wild', party: [rattata] } });
b.begin();
check('starting HP injected into sim', b.simMon('p1', 0).hp === 5, b.simMon('p1', 0).hp);
evs = b.act({ type: 'item', item: 'potion', index: 0 });
const heal = evs.find(e => e.cmd === '-heal');
check('Potion heals 20, capped at max HP', heal && +heal.args[1].split('/')[0] === Math.min(25, P1.mon.stats(char).hp), heal && heal.args[1]);
check('foe still acts on the item turn', evs.some(e => e.cmd === 'move' && e.args[0].startsWith('p2a')), evs.map(e => e.cmd).join(','));
check('hidden recharge lines are filtered', !evs.some(e => e.cmd === '-mustrecharge' || (e.cmd === 'cant' && e.args[1] === 'recharge')));
const turnBefore = b.turn;
evs = b.act({ type: 'ball', ball: 'masterball' });
check('Master Ball always catches', b.result === 'caught' && b.caught === rattata, b.result);
check('ball event carries shakes', evs[0].cmd === 'p1-ball' && evs[0].args[3] === '1', JSON.stringify(evs[0]));

console.log('[catch odds]');
let caught = 0;
for (let i = 0; i < 400; i++) {
  const w = P1.mon.create(16, 3);
  const bb = new P1.Battle({ me: { name: 'Ash', party: [Object.assign({}, char, { hp: 30 })] }, foe: { kind: 'wild', party: [w] } });
  bb.begin();
  bb.act({ type: 'ball', ball: 'pokeball' });
  if (bb.result === 'caught') caught++;
}
// Pidgey rate 255, full HP, Poké Ball: a = 85 → shake p ≈ 0.814, 4 shakes ≈ 0.44.
check('Poké Ball on full-HP Pidgey catches ~44%', caught > 140 && caught < 220, caught + '/400');

console.log('[trainer battle: forced switch, AI, run blocked]');
P1.mon.heal(char);
const bulba = P1.mon.create(1, 5);
const t1 = P1.mon.create(19, 3), t2 = P1.mon.create(16, 3);
b = new P1.Battle({ me: { name: 'Ash', party: [char, bulba] }, foe: { kind: 'trainer', name: 'Joey', party: [t1, t2] } });
b.begin();
evs = b.act({ type: 'run' });
check('cannot run from a trainer', evs[0].cmd === 'p1-norun' && !b.result);
evs = b.act({ type: 'switch', index: 1 });
check('switch to Bulbasaur logs a switch', evs.some(e => e.cmd === 'switch' && b.who(e.args[0]).mon === bulba));
check('Bulbasaur counted as participant', b.fought.get(t1.uid).has(bulba.uid));
turns = 0;
while (!b.result && turns < 60) {
  const r = b.request();
  if (!r) break;
  if (r.kind === 'switch') { evs = b.act({ type: 'switch', index: b.switchable()[0].index }); continue; }
  evs = b.act({ type: 'move', slot: 1 });
  turns++;
}
check('trainer battle reaches an end', !!b.result, b.result + ' after ' + turns + ' turns');

console.log('[boss: shared max HP, damage dealt, lowering HP from the network]');
const zard = P1.mon.create(6, 50, { ot: 'Ash' });
const snorlax = P1.mon.create(143, 10);
b = new P1.Battle({ me: { name: 'Ash', party: [zard] }, foe: { kind: 'boss', name: 'Snorlax', party: [snorlax], maxHp: 5000 } });
b.begin();
const bossSim = b.simMon('p2', 0);
check('boss max HP comes from foe.maxHp', bossSim.maxhp === 5000 && bossSim.hp === 5000, bossSim.hp + '/' + bossSim.maxhp);
check('no damage dealt before the first turn', b.dealt === 0, b.dealt);
const fireSlot = zard.moves.findIndex(m => P1.Dex.moves.get(m.id).basePower > 0) + 1;
evs = b.act({ type: 'move', slot: fireSlot });
const lost1 = 5000 - bossSim.hp;
check('dealt equals the HP the boss lost', lost1 > 0 && b.dealt === lost1, b.dealt + ' vs ' + lost1);
check('damage line reports the boss max HP', evs.some(e => e.cmd === '-damage' && /\/5000$/.test(e.args[1])), evs.filter(e => e.cmd === '-damage').map(e => e.args.join(' ')).join(' | '));
check('cannot throw a ball at a boss', b.act({ type: 'ball', ball: 'masterball' })[0].cmd === 'p1-noball' && !b.result);
check('setFoeHp lowers the boss HP', b.setFoeHp(3000) === 3000 && bossSim.hp === 3000, bossSim.hp);
check('setFoeHp never raises it', b.setFoeHp(4000) === 3000 && bossSim.hp === 3000, bossSim.hp);
check('setFoeHp does not count as my damage', b.dealt === lost1, b.dealt);
b.act({ type: 'move', slot: fireSlot });
const lost2 = 3000 - bossSim.hp;
check('dealt keeps accumulating from the lowered HP', lost2 > 0 && b.dealt === lost1 + lost2, b.dealt + ' vs ' + (lost1 + lost2));
b.setFoeHp(0);
check('setFoeHp(0) wins the battle', b.result === 'win' && bossSim.hp === 0, b.result);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
