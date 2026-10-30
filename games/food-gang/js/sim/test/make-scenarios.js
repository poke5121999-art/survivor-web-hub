// Writes the differential-test scenarios into ./scenarios/*.json (node make-scenarios.js).
// Format (read by D:\foodgang-ref\simtest ScenarioTrace.cs and by test/food-gang-sim.js):
//   {setup:{...MatchSetup, slots:[...]}, ticks, stopAtGameOver,
//    inputs:[{slot, from, to, dir, down, pressed}]   step ticks from..to (Tick after the step), last match wins
//    actions:[{at, do:"debugDamage"|"set"|"convertToBot"|"start", ...}]}  run before the step when Tick == at
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'scenarios');
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.json')) fs.unlinkSync(path.join(outDir, f));

const J = 1, A = 2, SP = 4;
const all = {};
function add(name, sc) {
  sc.name = name;
  all[name] = sc;
}
const slot = (s, skinId, level, isBot = false, botDifficulty = 0.5) => ({ slot: s, skinId, level, isBot, botDifficulty });
const set = (at, agent, field, value) => ({ at, do: 'set', agent, field, value });
const dmg = (at, target, amount, source = -1) => ({ at, do: 'debugDamage', target, amount, source });
const inp = (s, from, to, dir, down = 0, pressed = 0) => ({ slot: s, from, to, dir, down, pressed });

// ---------------------------------------------------------------- movement per map
for (let map = 0; map < 3; map++) {
  const inputs = [
    inp(0, 61, 200, 1),
    inp(0, 100, 103, 1, J), inp(0, 140, 141, 1, J),
    inp(0, 201, 450, -1),
    inp(0, 451, 600, 1, J),
    inp(0, 601, 700, 0),
    inp(0, 1101, 1300, 0.5),
    inp(0, 1301, 1500, -0.3, 0, J),
  ];
  for (let t = 210; t < 450; t += 40) inputs.push(inp(0, t, t + 2, -1, J));
  for (let t = 701; t < 1100; t += 30) {
    const dir = ((t / 30) | 0) % 3 === 0 ? -1 : 1;
    inputs.push(inp(0, t, t + 29, dir));
    if (((t / 30) | 0) % 2 === 0) inputs.push(inp(0, t + 5, t + 6, dir, J));
  }
  const actions = [];
  [[0, 12], [-12, 9], [12, 9], [-6, 6], [6, 6], [3, 14]].forEach(([x, y], i) => actions.push(set(700 + i * 60, 0, 'pos', [x, y])));
  // second agent so contacts with a moving body are not the only case; it idles
  add('move-map' + map, {
    setup: { seed: 11 + map, mapIndex: map, goal: 0, teams: 0, noTimer: true, slots: [slot(0, 1, 1), slot(1, 8, 1)] },
    ticks: 1600, inputs, actions,
  });
  // every skin runs: slot 0 human per skin, short
  const sk = [];
  for (let s = 0; s < 4; s++) sk.push(slot(s, 1 + ((map * 4 + s) % 16), 1 + s * 6));
  const inputs2 = [];
  for (let s = 0; s < 4; s++) {
    inputs2.push(inp(s, 10, 160, s % 2 ? -1 : 1), inp(s, 161, 400, s % 2 ? 1 : -1));
    for (let t = 30 + s * 7; t < 400; t += 45) inputs2.push(inp(s, t, t + 1, s % 2 ? -1 : 1, J));
  }
  add('run-skins-map' + map, {
    setup: { seed: 21 + map, mapIndex: map, goal: 0, teams: 0, noTimer: true, slots: sk },
    ticks: 420, inputs: inputs2,
  });
}

// ---------------------------------------------------------------- melee and ranged, scripted (simtest HitTarget style)
function hitTarget(name, skinId, level, gap, ticks, hold, extraInputs = []) {
  const inputs = hold ? [inp(0, 6, 6 + ticks, 0, A)] : [inp(0, 6, 6, 0, A)];
  add(name, {
    setup: { seed: 7, mapIndex: 0, goal: 0, teams: 0, slots: [slot(0, skinId, level), slot(1, 1, 1)] },
    ticks: 6 + ticks,
    actions: [set(0, 1, 'hpMax', 100000), set(0, 1, 'hpCurrent', 100000), set(0, 0, 'pos', [-10, 0]), set(0, 1, 'pos', [-10 + gap, 0]), set(0, 0, 'facingLeft', false)],
    inputs: inputs.concat(extraInputs),
  });
}
hitTarget('melee-nori', 6, 1, 2.0, 40, false);
hitTarget('melee-horn', 13, 1, 2.2, 40, false);
hitTarget('melee-jack-hold-l20', 12, 20, 2.2, 31, true);
hitTarget('shot-bro', 1, 1, 5, 40, false);
hitTarget('shot-bro-l10', 1, 10, 5, 40, false);
hitTarget('shot-billy', 9, 1, 6, 40, false);

// one scripted fight per skin at level 20 (all four powers): attacks, specials, moves, jumps vs a bot
for (let skinId = 1; skinId <= 16; skinId++) {
  const inputs = [];
  for (let t = 1; t < 1800; t += 120) {
    const dir = ((t / 120) | 0) % 2 ? -1 : 1;
    inputs.push(inp(0, t, t + 59, dir), inp(0, t + 60, t + 119, 0));
  }
  for (let t = 20; t < 1800; t += 23) inputs.push(inp(0, t, t, 0, A));
  for (let t = 200; t < 1800; t += 260) inputs.push(inp(0, t, t + 40, 0, SP | A, SP));
  for (let t = 90; t < 1800; t += 170) inputs.push(inp(0, t, t + 1, 1, J));
  add('weapon-skin' + String(skinId).padStart(2, '0'), {
    setup: { seed: 300 + skinId, mapIndex: skinId % 3, goal: 0, teams: 0, noTimer: true,
      slots: [slot(0, skinId, 20), slot(1, 1 + (skinId % 16), 12, true, 0.6)] },
    ticks: 1800, inputs,
  });
}

// projectiles that rebound / explode / snap / spawn zones, aimed at a dummy so they interact with walls and floor
// facing alternates every 100 ticks: left shots reach the dummy, right shots the wall; specials get their
// cooldown cleared before each press because the spawn cooldown outlasts the scenario
function shotAtWalls(name, skinId, level, map, special) {
  const inputs = [];
  const actions = [set(0, 1, 'hpMax', 1000000), set(0, 1, 'hpCurrent', 1000000), set(0, 0, 'pos', [4, 0]), set(0, 1, 'pos', [-2, 0])];
  const btn = special ? SP : A;
  const every = special ? 100 : 50;
  for (let t = 20; t < 900; t += every) {
    inputs.push(inp(0, t, t + 30, 0, btn, btn));
    if (special) actions.push(set(t - 1, 0, 'cooldownSpecial', 0));
  }
  for (let t = 1; t < 900; t += 100) inputs.push(inp(0, t, t + 8, ((t / 100) | 0) % 2 ? -1 : 1));
  add(name, {
    setup: { seed: 500 + skinId, mapIndex: map, goal: 0, teams: 0, noTimer: true, slots: [slot(0, skinId, level), slot(1, 6, 1)] },
    ticks: 900, inputs, actions,
  });
}
shotAtWalls('shot-walter-rebound-special', 7, 20, 0, true);
shotAtWalls('shot-walter-rebound-power', 7, 20, 2, false);
shotAtWalls('shot-bro-explosion-special', 1, 5, 1, true);
shotAtWalls('shot-tom-explosion', 14, 1, 0, false);
shotAtWalls('shot-pepe-lob-explosion', 8, 20, 2, false);
shotAtWalls('shot-pepe-stay-special', 8, 20, 0, true);
shotAtWalls('shot-igor-zone-special', 11, 20, 1, true);
shotAtWalls('shot-igor-lob', 11, 20, 0, false);
shotAtWalls('shot-tony-slow-zone', 10, 20, 2, true);
shotAtWalls('shot-tony-align', 10, 20, 1, false);
shotAtWalls('shot-haka-boomerang', 2, 20, 0, false);
shotAtWalls('shot-haka-heal-zone', 2, 20, 2, true);
shotAtWalls('shot-bud-spread', 5, 20, 1, false);
shotAtWalls('shot-bud-zone', 5, 20, 0, true);
shotAtWalls('shot-rob-poison', 16, 20, 2, true);
shotAtWalls('shot-horn-special', 13, 20, 1, true);

// ---------------------------------------------------------------- every power type on a bot fight
const POWER_SKIN = { 5: 2, 26: 6, 28: 6, 30: 6, 35: 3, 15: 7, 17: 10, 18: 7, 24: 6, 23: 6 };
const POWER_VALUE = { 14: 2, 15: 1.75, 18: 2, 19: 0.3, 21: 0.3, 22: 0.3, 25: 0.2, 28: 0.4, 29: 0.02, 30: 0.6, 31: 0.5, 32: 0.2, 33: 0.3,
  34: 2, 35: 0.5, 36: 0.05, 37: 0.05, 38: 0, 12: 0.5, 13: 0.75, 9: 0.3, 10: 0.3, 11: 0.3, 4: 0.1, 2: 0.3, 3: 0.3 };
for (let p = 0; p <= 38; p++) {
  const variants = p === 14 ? [['', 2], ['-frac', 0.5]] : [['', POWER_VALUE[p] ?? 0.25]];
  for (const [suffix, value] of variants) {
    const skinId = POWER_SKIN[p] ?? 1;
    add('power-' + String(p).padStart(2, '0') + suffix, {
      setup: { seed: 700 + p, mapIndex: p % 3, goal: 0, teams: 0, noTimer: true, botDifficultyInt: 60,
        slots: [slot(0, skinId, 1, true, 0.9), slot(1, 1 + ((p * 5) % 16), 8, true, 0.7)] },
      ticks: 2400,
      actions: [set(0, 0, 'powerTypes', [p, 38, -1, -1]), set(0, 0, 'powerValues', [value, 0, 0, 0]),
        set(0, 1, 'powerTypes', [38, 33, -1, -1]), set(0, 1, 'powerValues', [0, 0.1, 0, 0])],
    });
  }
}

// ---------------------------------------------------------------- death, respawn, invincibility, disconnect
add('respawn-invuln', {
  setup: { seed: 7, mapIndex: 0, goal: 0, teams: 0, slots: [slot(0, 1, 1), slot(1, 2, 1)] },
  ticks: 500,
  actions: [dmg(5, 1, 99999, 0), dmg(250, 1, 100, 0), dmg(318, 1, 100, 0), dmg(321, 1, 100, 0), dmg(330, 1, 100, 0)],
  inputs: [inp(0, 200, 330, 1), inp(0, 240, 240, 0, A), inp(0, 260, 260, 0, A)],
});
add('respawn-ffa4-random', {
  setup: { seed: 99, mapIndex: 2, goal: 0, teams: 0, slots: [slot(0, 1, 1), slot(1, 2, 1), slot(2, 3, 1), slot(3, 4, 1)] },
  ticks: 1500,
  actions: [1, 2, 3, 0].flatMap((v, i) => [dmg(5 + i, v, 99999, (v + 1) % 4), dmg(400 + i * 3, v, 99999, (v + 2) % 4), dmg(800 + i * 5, v, 99999, -1)]),
});
add('respawn-2v2-poison', {
  setup: { seed: 5, mapIndex: 1, goal: 0, teams: 2, slots: [slot(0, 16, 20), slot(1, 2, 5), slot(2, 3, 5), slot(3, 4, 5)] },
  ticks: 900,
  actions: [set(0, 0, 'pos', [-4, 0]), set(0, 2, 'pos', [2, 0]), set(0, 0, 'facingLeft', false), dmg(600, 2, 99999, 0)],
  inputs: [inp(0, 10, 12, 0, SP, SP), inp(0, 300, 302, 0, SP, SP), inp(0, 100, 101, 0, A, A)],
});
add('disconnect-to-bot', {
  setup: { seed: 31, mapIndex: 0, goal: 1, teams: 2, botDifficultyInt: 70,
    slots: [slot(0, 3, 10), slot(1, 4, 10, true, 0.4), slot(2, 5, 10, true, 0.6), slot(3, 6, 10)] },
  ticks: 6000,
  actions: [{ at: 120, do: 'convertToBot', slot: 0 }, { at: 300, do: 'convertToBot', slot: 3 }],
  inputs: [inp(0, 1, 119, 1), inp(0, 50, 50, 1, A), inp(3, 1, 299, -1), inp(3, 100, 101, -1, J)],
});
add('start-waiting', {
  setup: { seed: 3, mapIndex: 1, goal: 0, teams: 0, startPlaying: false, slots: [slot(0, 1, 1), slot(1, 2, 1, true)] },
  ticks: 400,
  actions: [{ at: 60, do: 'start' }],
  inputs: [inp(0, 1, 200, 1, A)],
});

// ---------------------------------------------------------------- mode end rules
const four = (base) => [slot(0, base, 1), slot(1, base + 1, 1), slot(2, base + 2, 1), slot(3, base + 3, 1)];
add('end-dm-ffa-timeout', {
  setup: { seed: 7, mapIndex: 1, goal: 0, teams: 0, slots: four(1) }, ticks: 6000, actions: [dmg(0, 1, 99999, 2)],
});
add('end-dm-ffa-timeout-nokill', { setup: { seed: 7, mapIndex: 1, goal: 0, teams: 0, slots: four(1) }, ticks: 6000 });
add('end-dm-2v2-timeout', {
  setup: { seed: 7, mapIndex: 2, goal: 0, teams: 2, slots: four(1) }, ticks: 6000, actions: [dmg(0, 0, 99999, 3)],
});
add('end-dm-2v2-draw', { setup: { seed: 7, mapIndex: 2, goal: 0, teams: 2, slots: four(1) }, ticks: 6000 });
function killSchedule(killer, victims, every, count, from = 1) {
  const r = [];
  for (let i = 0; i < count; i++) r.push(dmg(from + i * every, victims[i % victims.length], 99999, killer));
  return r;
}
add('end-kill5-ffa', { setup: { seed: 7, mapIndex: 0, goal: 1, teams: 0, slots: four(5) }, ticks: 3000, actions: killSchedule(1, [0, 2, 3], 37, 40) });
add('end-kill5-2v2', {
  setup: { seed: 7, mapIndex: 0, goal: 1, teams: 2, slots: four(9) }, ticks: 4000,
  actions: killSchedule(2, [0, 1], 41, 40).concat(killSchedule(3, [0, 1], 53, 40, 20)),
});
add('end-lastsurvivor-ffa', { setup: { seed: 7, mapIndex: 0, goal: 2, teams: 0, slots: [slot(0, 1, 1), slot(1, 2, 1)] }, ticks: 3000, actions: killSchedule(0, [1], 61, 30) });
add('end-lastsurvivor-2v2', {
  setup: { seed: 7, mapIndex: 1, goal: 2, teams: 2, slots: four(13) }, ticks: 4000,
  actions: killSchedule(2, [0, 1], 47, 60).concat(killSchedule(-1, [3], 71, 20, 10)),
});
add('end-killboss-death', {
  setup: { seed: 7, mapIndex: 2, goal: 3, teams: 1, slots: four(1) }, ticks: 2000,
  actions: [dmg(30, 3, 5000, 0), dmg(60, 3, 5000, 1), dmg(90, 3, 99999, 2)],
});
add('end-killboss-left-timeout', {
  setup: { seed: 7, mapIndex: 0, goal: 3, teams: 1, bossOnLeft: true, isOffline: true, botDifficultyInt: 30, slots: four(4) },
  ticks: 4000, actions: [dmg(30, 0, 500, 1), dmg(60, 1, 99999, 0)],
});

// ---------------------------------------------------------------- full bot matches, fixed seeds, every skin, 3 maps
const modes = [
  ['dm-1v1', 0, 0, 2, false], ['dm-2v2', 0, 2, 4, false], ['dm-ffa4', 0, 0, 4, false], ['boss-1v3', 3, 1, 4, false],
  ['kill5-2v2', 1, 2, 4, false], ['ls-ffa4', 2, 0, 4, false], ['boss-left-1v3', 3, 1, 4, true], ['kill5-1v1', 1, 0, 2, false],
];
let cursor = 0;
for (let map = 0; map < 3; map++) {
  for (let mi = 0; mi < modes.length; mi++) {
    if ((map + mi) % 2 === 1 && mi > 3) continue;
    const [label, goal, teams, n, bossLeft] = modes[mi];
    const slots = [];
    for (let s = 0; s < n; s++) {
      slots.push(slot(s, 1 + (cursor % 16), 1 + ((cursor * 7) % 20), true, ((cursor * 37) % 100) / 100));
      cursor++;
    }
    add('bots-' + label + '-map' + map, {
      setup: { seed: 9000 + map * 10 + mi, mapIndex: map, goal, teams, bossOnLeft: bossLeft, botDifficultyInt: (cursor * 13) % 101, slots },
      ticks: 21600,
    });
  }
}

for (const [name, sc] of Object.entries(all)) fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(sc) + '\n');
console.log('wrote ' + Object.keys(all).length + ' scenarios to ' + outDir);
