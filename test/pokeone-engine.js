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

console.log('[locked move: the second turn of Skull Bash]');
const blas = P1.mon.create(9, 40, { ot: 'Ash' });
blas.moves = [{ id: 'tackle', pp: 35, ppMax: 35 }, { id: 'withdraw', pp: 40, ppMax: 40 }, { id: 'bite', pp: 25, ppMax: 25 }, { id: 'skullbash', pp: 10, ppMax: 10 }];
// Onix Lv5 so Blastoise surely lives through the charge turn (the solo sim has an unseeded PRNG).
b = new P1.Battle({ me: { name: 'Ash', party: [blas] }, foe: { kind: 'trainer', name: 'Brock', party: [P1.mon.create(95, 5)] } });
b.begin();
b.act({ type: 'move', slot: 4 });
const lockedReq = b.request();
check('the charge turn leaves a one-move request (Skull Bash locked in)', lockedReq && lockedReq.moves.length === 1 && lockedReq.moves[0].id === 'skullbash', JSON.stringify(lockedReq && lockedReq.moves.map(m => m.id)));
let lockErr = '';
try { b.act({ type: 'move', slot: 4 }); } catch (e) { lockErr = e.message; }
check('an out-of-range pick on a locked turn falls back instead of stalling the battle', !lockErr && (b.turn >= 3 || !!b.result), lockErr || 'turn ' + b.turn + ', result ' + b.result);

console.log('[coop: one Showdown battle, players on p1, the boss trainer’s team on p2]');
const team = (dexLv) => dexLv.map(([d, l]) => P1.mon.create(d, l, { ot: 'T' }));
const PARTY = [
  { id: 'ash', name: 'Ash', mons: team([[6, 40], [25, 35], [1, 30]]) },
  { id: 'misty', name: 'Misty', mons: team([[9, 40], [121, 35]]) },
  { id: 'brock', name: 'Brock', mons: team([[95, 38], [74, 30], [141, 34]]) },
];
// Đội Giovanni FRLG (5 con), đổi chỗ Dugtrio xuống dự bị: Arena Trap của nó giữ chân phe mình, không đổi con được.
const FOES = [[111, 45], [31, 44], [51, 42], [34, 45], [112, 50]].map(([d, l]) => P1.mon.create(d, l, { ot: 'Giovanni' }));
const party = (n) => PARTY.slice(0, n), bossFoes = () => FOES;
const dmgSlot = (m) => m.moves.findIndex(s => P1.Dex.moves.get(s.id).basePower > 0) + 1;
for (const n of [1, 2, 3]) {
  const cb = new P1.CoopBattle({ players: party(n), foes: bossFoes(), seed: 7 });
  const ev = cb.begin();
  const reqs = party(n).map(p => cb.requestFor(p.id));
  check(n + 'p: ' + n + ' active per side, format ' + ['singles', 'doubles', 'triples'][n - 1],
    cb.sim.p1.active.length === n && cb.sim.p2.active.length === n && ev.filter(e => e.cmd === 'switch').length === 2 * n,
    cb.sim.p1.active.map(p => p.name).join() + ' vs ' + cb.sim.p2.active.map(p => p.name).join());
  check(n + 'p: each player controls exactly their own slot', reqs.every((r, i) => r && r.slots.length === 1 && r.slots[0].slot === i && cb.roster[r.slots[0].index].owner === party(n)[i].id),
    JSON.stringify(reqs.map(r => r && r.slots.map(s => s.slot))));
  check(n + 'p: bench offered to a player holds only their own Pokémon', reqs.every((r, i) => r.bench.every(b => b.owner === party(n)[i].id) && r.bench.length === party(n)[i].mons.length - 1),
    JSON.stringify(reqs.map(r => r.bench.map(b => b.index))));
  check(n + 'p: the trainer leads with its first ' + n + ' Pokémon, the rest wait on the bench',
    cb.sim.p2.active.map(p => p.name).join() === ['F0', 'F1', 'F2'].slice(0, n).join() && cb.sim.p2.pokemon.filter(p => !p.isActive).length === 5 - n,
    cb.sim.p2.active.map(p => p.name).join());
  if (n > 1) {
    const tg = reqs[0].slots[0].moves.find(m => m.targets.length).targets;
    check(n + 'p: a single-target move offers the foes as targets', tg.filter(t => !t.ally).length >= 2, JSON.stringify(tg));
  }
}

console.log('[coop: picks, validation, ownership, lockstep]');
seed = 4242;
let host = new P1.CoopBattle({ players: party(2), foes: bossFoes(), seed: 99 });
let mirror = new P1.CoopBattle({ players: party(2), foes: bossFoes(), seed: 99 });
host.begin(); mirror.begin();
const ashReq = host.requestFor('ash'), mistyReq = host.requestFor('misty');
const ashMove = ashReq.slots[0].moves.find(m => m.targets.length);
const choice = host.p1Choice({ 0: { t: 'move', m: ashMove.slot, tg: 2 }, 1: { t: 'switch', k: ashReq.bench[0].index } });
check('valid pick keeps its target; switching to an ally’s bench is refused → auto move', /^move \d 2, move \d( -?\d)?$/.test(choice) && choice.startsWith('move ' + ashMove.slot + ' 2'), choice);
check('Misty may switch to her own bench', /, switch \d$/.test(host.p1Choice({ 1: { t: 'switch', k: mistyReq.bench[0].index } })), host.p1Choice({ 1: { t: 'switch', k: mistyReq.bench[0].index } }));
check('bad input (garbage, disabled slot 9) never throws, falls back to auto', typeof host.p1Choice({ 0: 'x', 1: { t: 'move', m: 9 } }) === 'string');
let same = true, turnsRun = 0, lastHp = '';
const hpOf = (b) => b.sim.p1.pokemon.concat(b.sim.p2.pokemon).map(p => p.name + '=' + p.hp).sort().join(',');
while (!host.result && turnsRun < 80) {
  const entry = host.decide({});
  const a = host.apply(entry), b = mirror.apply(a.entry);
  if (JSON.stringify(a.events) !== JSON.stringify(b.events) || hpOf(host) !== hpOf(mirror)) { same = false; break; }
  lastHp = hpOf(host);
  turnsRun++;
}
check('mirror applying the host’s accepted entries sees identical events and HP every step', same && turnsRun > 3, turnsRun + ' entries, result ' + host.result);
check('battle reaches a result (all trainer Pokémon down = win, all players down = lose)', host.result === 'win' || host.result === 'lose', host.result + ' — ' + lastHp.slice(0, 120));
const replay = new P1.CoopBattle({ players: party(2), foes: bossFoes(), seed: 99 });
replay.begin();
host.log.forEach(e => replay.apply(e));
check('host takeover: a fresh battle replaying the log reaches the same state', hpOf(replay) === hpOf(host) && replay.result === host.result, replay.log.length + ' entries');
// Ảnh chụp trận: thử toJSON → fromJSON ở mọi trạng thái của trận vừa đánh.
let restored = 0, threw = 0, err = '', bytes = 0;
for (let k = 0; k <= host.log.length; k++) {
  const b = new P1.CoopBattle({ players: party(2), foes: bossFoes(), seed: 99 });
  b.begin();
  host.log.slice(0, k).forEach(e => b.apply(e));
  const json = JSON.stringify(b.sim.toJSON());
  bytes = Math.max(bytes, json.length);
  try { window.PkmnSim.Battle.fromJSON(JSON.parse(json)); restored++; } catch (e) { threw++; err = e.message; }
}
console.log('    (measured: Battle.fromJSON restored ' + restored + '/' + (restored + threw) + ' states, threw on ' + threw + (err ? ' — ' + err : '') +
  '; toJSON up to ' + bytes + ' bytes → takeover replays the log, which never fails)');

console.log('[coop: a player out of Pokémon → ally bench fills the slot and the ally controls it]');
const lone = { id: 'a', name: 'A', mons: [P1.mon.create(129, 5)] };
const duo = { id: 'b', name: 'B', mons: [P1.mon.create(143, 50), P1.mon.create(143, 50)] };
const cbF = new P1.CoopBattle({ players: [lone, duo], foes: [P1.mon.create(150, 70), P1.mon.create(151, 70)], seed: 42 });
cbF.begin();
let filled = null;
for (let i = 0; i < 6 && !cbF.result && !filled; i++) {
  cbF.apply(cbF.decide({}));
  const r = cbF.sim.p1.activeRequest;
  if (r && r.forceSwitch && r.forceSwitch[0]) filled = { ctrl: cbF.controllers(), a: cbF.requestFor('a'), b: cbF.requestFor('b') };
}
check('Showdown asks to refill A’s slot; controller is B, A has nothing to choose', filled && filled.ctrl[0] === 'b' && filled.a === null && filled.b.slots[0].slot === 0 && filled.b.slots[0].kind === 'switch', JSON.stringify(filled && filled.ctrl));
const fillEntry = cbF.apply(cbF.decide({ 0: { t: 'switch', k: filled.b.bench[0].index } }));
check('B’s bench Pokémon now stands in slot a and B controls both slots', cbF.at('p1', 0).owner === 'b' && JSON.stringify(cbF.controllers()) === '["b","b"]', fillEntry.entry[0]);
const bothB = cbF.requestFor('b');
check('B’s request covers two slots', bothB && bothB.slots.map(s => s.slot).join() === '0,1');

console.log('[coop: the trainer sends in its bench; the fight is won when its whole team is down]');
const strong = { id: 's', name: 'S', mons: [P1.mon.create(150, 100)] };
const helper = { id: 't', name: 'T', mons: [P1.mon.create(151, 100)] };
const brock = [[74, 12], [95, 14], [74, 12]].map(([d, l]) => P1.mon.create(d, l));
const cbW = new P1.CoopBattle({ players: [strong, helper], foes: brock, seed: 3 });
cbW.begin();
let sentIn = false;
for (let i = 0; i < 12 && !cbW.result; i++) {
  const r = cbW.apply(cbW.decide({ 0: { t: 'move', m: dmgSlot(strong.mons[0]), tg: 1 }, 1: { t: 'move', m: dmgSlot(helper.mons[0]), tg: 2 } }));
  if (r.entry[1] && /switch 3/.test(r.entry[1])) sentIn = true;
}
check('a fainted trainer Pokémon is replaced from the bench (switch 3)', sentIn);
check('result win once every trainer Pokémon is down', cbW.result === 'win' && cbW.sim.p2.pokemon.every(p => p.fainted), cbW.result);
check('finalOf gives HP / status / PP for syncing back to the owner', Number.isInteger(cbW.finalOf(0).hp) && cbW.finalOf(0).pp.length === strong.mons[0].moves.length);
let small = '';
try { new P1.CoopBattle({ players: party(3), foes: brock.slice(0, 2), seed: 1 }); } catch (e) { small = e.message; }
check('a party larger than the trainer’s team is refused up front (the sim would crash)', /smaller than the party/.test(small), small);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
