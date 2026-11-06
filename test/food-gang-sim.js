/*
 * Food Gang (games/food-gang) — kiểm bản JS của sim trận (games/food-gang/js/sim) so với bản C# gốc
 * D:\foodgang-ref\fg-unity\Assets\FG\Sim (chạy bằng D:\foodgang-ref\simtest).
 *
 * Chạy:  node test/food-gang-sim.js                 (đủ: trig, 109 assert unit + bảng 200 trận bot, so vết từng tick)
 *        node test/food-gang-sim.js --only shot-     (chỉ các kịch bản có tên chứa chuỗi này)
 *        node test/food-gang-sim.js --regen          (chạy lại dotnet để sinh vết C#, rồi so)
 *        node test/food-gang-sim.js --skip-unit --skip-table   (chỉ so vết)
 * Vết C# (traces/*.jsonl, ~1.7 GB, không nằm trong repo) ở D:\foodgang-ref\simtest\traces; sinh bằng
 *   dotnet D:\foodgang-ref\simtest\bin\Release\net8.0\simtest.dll trace <thư mục scenarios> <thư mục traces>
 * Kịch bản: games/food-gang/js/sim/test/scenarios/*.json (sinh bởi make-scenarios.js trong cùng thư mục).
 *
 * So từng tick: mọi trường MatchState + sự kiện. Số nguyên / bool / enum phải bằng hẳn; số thực cho lệch tới
 * 1e-4 × max(1, |a|, |b|). Báo cả số tick khớp từng bit. Lệch → in tick, đường dẫn trường, hai giá trị, thoát 1.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const SIM = path.join(ROOT, 'games', 'food-gang', 'js', 'sim');
const SCEN_DIR = path.join(SIM, 'test', 'scenarios');
const DATA = path.join(ROOT, 'games', 'food-gang', 'data', 'simdata.json');
const SIMTEST = 'D:\\foodgang-ref\\simtest';

const argv = process.argv.slice(2);
const opt = (name) => argv.includes(name);
const val = (name, def) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def; };
const TRACES = val('--traces', path.join(SIMTEST, 'traces'));
const ONLY = val('--only', null);
const BOTSUM = val('--botsum', path.join(SIMTEST, 'traces', 'botsum-200.jsonl'));
const TRIG = val('--trig', path.join(SIMTEST, 'traces', 'trig.bin'));
const TOL = 1e-4;

let S; // sim module namespace
let db;
const f = Math.fround;

// ------------------------------------------------------------------ helpers

function dotnet(args, timeoutMs) {
  const dll = path.join(SIMTEST, 'bin', 'Release', 'net8.0', 'simtest.dll');
  if (!fs.existsSync(dll)) {
    const b = spawnSync('dotnet', ['build', '-c', 'Release', SIMTEST], { encoding: 'utf8', timeout: 300000 });
    if (b.status !== 0) throw new Error('dotnet build failed: ' + (b.stdout || '') + (b.stderr || ''));
  }
  const r = spawnSync('dotnet', [dll, ...args], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error('dotnet ' + args.join(' ') + ' failed (' + (r.error ? r.error.message : 'exit ' + r.status) + '): ' + (r.stderr || r.stdout));
  return r.stdout;
}

/** Synchronous line reader over a (possibly huge) text file. */
function* lines(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8 << 20);
  let rest = '';
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      const chunk = rest + buf.toString('utf8', 0, n);
      const parts = chunk.split('\n');
      rest = parts.pop();
      for (const p of parts) if (p.length) yield p;
    }
    if (rest.length) yield rest;
  } finally {
    fs.closeSync(fd);
  }
}

// float fields of MatchState / AgentState / BotState / BulletState / SimEvent / Vec2; every other number is int/enum
const FLOAT_KEYS = new Set(('timerElapsed timerMax difficulty x y kccMaxSpeed moveSpeed speedMultiplier dashTimer pushbackTimer pushbackValue '
  + 'directionX hpBase hpCurrent hpMax angryTimer freezeTimer invincibilityTimer invisibilityTimer poisonTimer slowDownTimer specialTimer '
  + 'zoneHitTimer poisonDamagePerTick poisonTickRate poisonTickTimer respawnTimer levelCoef powerValues actionTimer cooldownAction '
  + 'cooldownActionMax cooldownSpecial cooldownSpecialMax aggressivity reactionTime escapeSkill lastTargetScore timeSinceLastTarget '
  + 'timeSinceLastDamageDealt timeSinceLastAttack timeSinceLastCooldownReset timeSinceLastOffensiveSpecialAttempt attackReactionEndTime '
  + 'specialReactionEndTime escapeReactionEndTime fleeReactionEndTime holdMeleeReleaseTime modeEndTime pauseEndTime escapeCooldown '
  + 'branchEndTime timeSinceLastDestination timeRefreshDestination escapeDirectionX stuckTimer lifeTimer speed damageAmount '
  + 'pushBackDuration pushBackEffect tickTimer distanceTraveled scaleOnDistance value value2').split(' '));

/**
 * Compares the C# value `c` (parsed JSON) with the JS value `j`. Returns null when equal within tolerance;
 * otherwise {path, cs, js}. Sets diff.inexact = first bit-level difference found (floats within tolerance).
 */
function compare(c, j, p, key, diff) {
  if (c === null || c === undefined) return j === null || j === undefined ? null : { path: p, cs: c, js: j };
  if (typeof c === 'string') {
    if (c === 'NaN' || c === 'Infinity' || c === '-Infinity') {
      const want = Number(c);
      return Object.is(want, j) || (Number.isNaN(want) && Number.isNaN(j)) ? null : { path: p, cs: c, js: j };
    }
    return c === j ? null : { path: p, cs: c, js: j };
  }
  if (typeof c === 'number') {
    if (typeof j !== 'number') return { path: p, cs: c, js: j };
    if (f(c) === j || c === j) return null;
    if (!FLOAT_KEYS.has(key)) return { path: p, cs: c, js: j };
    if (Math.abs(c - j) <= TOL * Math.max(1, Math.abs(c), Math.abs(j))) {
      if (!diff.inexact) diff.inexact = { path: p, cs: c, js: j };
      return null;
    }
    return { path: p, cs: c, js: j };
  }
  if (typeof c === 'boolean') return c === j ? null : { path: p, cs: c, js: j };
  if (Array.isArray(c)) {
    if (!Array.isArray(j) || j.length !== c.length) return { path: p + '.length', cs: c.length, js: Array.isArray(j) ? j.length : j };
    for (let i = 0; i < c.length; i++) {
      const d = compare(c[i], j[i], p + '[' + i + ']', key, diff);
      if (d) return d;
    }
    return null;
  }
  if (typeof j !== 'object' || j === null || Array.isArray(j)) return { path: p, cs: c, js: j };
  for (const k of Object.keys(c)) {
    if (!(k in j)) return { path: p + '.' + k, cs: c[k], js: '(missing in JS)' };
    const d = compare(c[k], j[k], p + '.' + k, k, diff);
    if (d) return d;
  }
  for (const k of Object.keys(j)) if (!(k in c)) return { path: p + '.' + k, cs: '(missing in C#)', js: j[k] };
  return null;
}

// ------------------------------------------------------------------ scenario runner (mirror of ScenarioTrace.cs)

function setField(agent, name, v) {
  if (!(name in agent)) throw new Error('field ' + name + ' not on agent');
  const cur = agent[name];
  if (typeof cur === 'boolean') agent[name] = v === true;
  else if (typeof cur === 'number') agent[name] = f(v);
  else if (Array.isArray(cur)) agent[name] = v.map((x) => f(x));
  else if (cur && typeof cur === 'object' && 'x' in cur) agent[name] = { x: f(v[0]), y: f(v[1]) };
  else throw new Error('cannot set field ' + name);
}

function applyAction(m, s, a) {
  switch (a.do) {
    case 'debugDamage': m.debugDamage(s, a.target | 0, f(a.amount), a.source === undefined ? -1 : a.source | 0); break;
    case 'convertToBot': m.convertToBot(s, a.slot | 0); break;
    case 'start': S.Match.start(s); break;
    case 'set': setField(s.agents[a.agent], a.field, a.value); break;
    default: throw new Error("scenario action '" + a.do + "' unknown");
  }
}

function runScenario(sc, onLine) {
  const setup = S.createMatchSetup(sc.setup);
  const ticks = sc.ticks ?? 600;
  const stopAtGameOver = sc.stopAtGameOver !== false;
  const m = new S.Match(db);
  const s = m.create(setup);
  if (onLine(s, m.events) === false) return;
  m.events.length = 0;
  let maxSlot = 0;
  for (const sl of setup.slots) maxSlot = Math.max(maxSlot, sl.slot);
  const frame = new Array(maxSlot + 1);
  for (let k = 0; k < ticks; k++) {
    if (sc.actions) for (const a of sc.actions) if ((a.at ?? -1) === s.tick) applyAction(m, s, a);
    const t = s.tick + 1;
    for (let i = 0; i < frame.length; i++) frame[i] = S.InputFrame.none();
    if (sc.inputs) {
      for (const e of sc.inputs) {
        const sl = e.slot | 0;
        if (t < e.from || t > e.to || sl < 0 || sl >= frame.length) continue;
        frame[sl] = S.InputFrame.make(f(e.dir || 0), e.down | 0, e.pressed | 0);
      }
    }
    m.step(s, frame);
    if (onLine(s, m.events) === false) return;
    m.events.length = 0;
    if (stopAtGameOver && s.phase === S.GamePhase.GameOver) break;
  }
}

function diffScenario(name) {
  const sc = JSON.parse(fs.readFileSync(path.join(SCEN_DIR, name + '.json'), 'utf8'));
  const tracePath = path.join(TRACES, name + '.jsonl');
  if (!fs.existsSync(tracePath)) return { name, error: 'no C# trace ' + tracePath + ' (run with --regen)' };
  const it = lines(tracePath);
  const res = { name, lines: 0, exactLines: 0, firstInexact: null, divergence: null };
  let allExact = true;
  runScenario(sc, (s, events) => {
    const nx = it.next();
    if (nx.done) { res.divergence = { tick: s.tick, path: '(trace)', cs: 'ended', js: 'tick ' + s.tick }; return false; }
    const line = JSON.parse(nx.value);
    const diff = {};
    let d = compare(line.tick, s.tick, 'tick', 'tick', diff)
      || compare(line.state, s, 'state', 'state', diff)
      || compare(line.events, events, 'events', 'events', diff);
    if (d) { res.divergence = { tick: line.tick, ...d }; return false; }
    res.lines++;
    if (diff.inexact) {
      if (allExact) res.firstInexact = { tick: line.tick, ...diff.inexact };
      allExact = false;
    }
    if (allExact) res.exactLines++;
    return true;
  });
  if (!res.divergence) {
    const nx = it.next();
    if (!nx.done) res.divergence = { tick: JSON.parse(nx.value).tick, path: '(trace)', cs: 'more ticks', js: 'ended' };
  }
  return res;
}

// ------------------------------------------------------------------ unit asserts (port of simtest Program.cs)

let asserts = 0, failures = 0;
function check(ok, what) {
  asserts++;
  if (ok) return;
  failures++;
  console.log('FAIL ' + what);
}
function near(actual, expected, tol, what) {
  check(f(Math.abs(f(actual - f(expected)))) <= f(tol), what + ': expected ' + expected + ' +-' + tol + ', got ' + actual);
}

const setupOf = (map, goal, teams) => S.createMatchSetup({ seed: 7, mapIndex: map, goal, teams });
const addSlot = (st, slot, skinId, level, isBot, d) => S.addSlot(st, slot, skinId, level, isBot, d);
function run(m, s, ticks, inp = null) { for (let i = 0; i < ticks; i++) m.step(s, inp); }

function testJump() {
  const { InputButtons, GoalType, TeamConfig, SimEventType } = S;
  const m = new S.Match(db);
  const s = m.create(addSlot(setupOf(0, GoalType.DeathMatch, TeamConfig.FreeForAll), 0, 1, 1, false));
  const a = s.agents[0];
  run(m, s, 30);
  check(a.grounded, 'jump: agent grounded after spawn');
  const y0 = a.pos.y;
  const press = [S.InputFrame.make(0, InputButtons.Jump)];
  const none = [S.InputFrame.none()];
  m.events.length = 0;
  m.step(s, press);
  let apex = a.pos.y;
  let airTicks = 1;
  for (let i = 0; i < 200 && !(a.grounded && i > 5); i++) {
    m.step(s, i === 10 ? press : none);
    apex = Math.max(apex, a.pos.y);
    airTicks++;
  }
  let jumps = m.events.filter((e) => e.type === SimEventType.AgentJumped).length;
  let expect = f(13 * db.dt), vy = 13;
  while ((vy = f(vy - f(25 * db.dt))) > 0) expect = f(expect + f(vy * db.dt));
  near(f(apex - y0), f(3.38), f(0.12), 'jump apex height (analytic 3.38)');
  near(f(apex - y0), expect, f(0.002), 'jump apex height (tick integration ' + expect + ')');
  check(jumps === 1, 'no double jump: jumps while airborne = ' + jumps);
  near(f(airTicks * db.dt), f(1.04), f(0.1), 'jump air time');
  m.events.length = 0;
  run(m, s, 150, [S.InputFrame.make(0, InputButtons.Jump)]);
  jumps = m.events.filter((e) => e.type === SimEventType.AgentJumped).length;
  check(jumps === 1, 'holding jump jumps once, got ' + jumps);
}

function testRunSpeed() {
  const { InputButtons, GoalType, TeamConfig } = S;
  for (const skin of db.skins) {
    if (skin.skinId === 0) continue;
    const m = new S.Match(db);
    const s = m.create(addSlot(setupOf(0, GoalType.DeathMatch, TeamConfig.FreeForAll), 0, skin.skinId, 1, false));
    const a = s.agents[0];
    run(m, s, 10);
    const right = [S.InputFrame.make(1, InputButtons.None)];
    run(m, s, 30, right);
    const x0 = a.pos.x;
    run(m, s, 30, right);
    const speed = f(f(a.pos.x - x0) / f(30 * db.dt));
    near(speed, skin.moveSpeed, f(0.02), 'run speed ' + skin.name);
    near(a.velocity.x, skin.moveSpeed, f(0.01), 'velocity ' + skin.name);
  }
  const m = new S.Match(db);
  const s = m.create(addSlot(setupOf(0, GoalType.DeathMatch, TeamConfig.FreeForAll), 0, 8, 1, false));
  run(m, s, 40, [S.InputFrame.make(f(0.2), InputButtons.None)]);
  near(s.agents[0].velocity.x, 6, f(0.01), 'half stick still runs at PEPE MoveSpeed 6.0');
}

function spawnHp(skinId, level) {
  const m = new S.Match(db);
  const s = m.create(addSlot(setupOf(0, S.GoalType.DeathMatch, S.TeamConfig.FreeForAll), 0, skinId, level, false));
  return s.agents[0].hpMax;
}

function testHp() {
  near(spawnHp(1, 1), 1100, f(0.01), 'HP BRO L1');
  near(spawnHp(1, 10), 1595, f(0.01), 'HP BRO L10 = 1.45 x 1100');
  near(spawnHp(3, 10), 1320, f(0.01), 'HP JAMES L10 = (1.45 + LifeBoost 0.2) x 800');
  near(spawnHp(4, 20), 2730, f(0.01), 'HP KING L20 = 1.95 x 1400');
  near(spawnHp(5, 15), 1900, f(0.01), 'HP BUD L15 = (1.70 + 0.2) x 1000');
  near(spawnHp(14, 1), 600, f(0.01), 'HP TOM L1');
  const m = new S.Match(db);
  const st = setupOf(0, S.GoalType.KillBoss, S.TeamConfig.OneVersusThree);
  st.botDifficultyInt = 50;
  addSlot(st, 0, 1, 1, true); addSlot(st, 1, 2, 1, true); addSlot(st, 2, 3, 1, true); addSlot(st, 3, 4, 1, true);
  const s = m.create(st);
  const boss = S.agentInSlot(s, 3);
  check(boss.isBoss, 'KillBoss boss right = slot 3');
  near(boss.hpMax, f(1400 * 8), f(0.1), 'bot boss HP = Lerp(6,10,0.5) x HpMax');
  near(boss.moveSpeed, f(f(3.6) * f(0.8)), f(0.001), 'boss MoveSpeed x0.8');
}

function testRespawn() {
  const { SimEventType, StatusFlags } = S;
  const m = new S.Match(db);
  const st = setupOf(0, S.GoalType.DeathMatch, S.TeamConfig.FreeForAll);
  addSlot(st, 0, 1, 1, false); addSlot(st, 1, 2, 1, false);
  const s = m.create(st);
  const v = s.agents[1];
  run(m, s, 5);
  m.events.length = 0;
  m.debugDamage(s, v.id, 99999, 0);
  const deathTick = s.tick;
  check(S.isDead(v) && S.has(v, StatusFlags.RespawnWait), 'victim dead and waiting');
  check(m.events.some((e) => e.type === SimEventType.AgentDied && e.agent === v.id && e.other === 0), 'AgentDied raised with killer');
  check(s.killSlot[0] === 1 && s.deathSlot[1] === 1, 'kill/death bookkeeping');
  let respawnTick = -1;
  for (let i = 0; i < 400 && respawnTick < 0; i++) {
    m.step(s, null);
    if (m.events.some((e) => e.type === SimEventType.AgentRespawned && e.agent === v.id)) respawnTick = s.tick;
  }
  const delay = f((respawnTick - deathTick) * db.dt);
  near(delay, 3.25, f(1.5 * db.dt), 'respawn delay 3.0 + 0.25 s');
  check(!S.isDead(v) && v.hpCurrent === v.hpMax, 'respawned at full HP');
  check(S.has(v, StatusFlags.Invincibility), 'invincible right after respawn');
  run(m, s, Math.trunc(f(f(1.9) / db.dt)));
  let dealt = m.debugDamage(s, v.id, 100, 0);
  check(dealt === 0 && v.hpCurrent === v.hpMax, 'still invincible at +1.9 s');
  run(m, s, Math.trunc(f(f(0.15) / db.dt)));
  check(!S.has(v, StatusFlags.Invincibility), 'invincibility gone at +2.05 s');
  dealt = m.debugDamage(s, v.id, 100, 0);
  near(dealt, 100, f(0.001), 'damage lands after invincibility');
}

function four(st) { for (let i = 0; i < 4; i++) addSlot(st, i, i + 1, 1, false); return st; }

function testDeathMatchTimer() {
  const { GoalType, TeamConfig, GamePhase } = S;
  const m = new S.Match(db);
  const st = four(setupOf(1, GoalType.DeathMatch, TeamConfig.FreeForAll));
  const s = m.create(st);
  near(s.timerMax, 90, 0, 'DeathMatch TimerMax');
  m.debugDamage(s, S.agentInSlot(s, 1).id, 99999, S.agentInSlot(s, 2).id);
  let ticks = 0;
  while (s.phase !== GamePhase.GameOver && ticks < 6000) { m.step(s, null); ticks++; }
  check(s.phase === GamePhase.GameOver && s.timeOut, 'DeathMatch ends on time-out');
  check(ticks === Math.ceil(f(90 / db.dt)), 'time-out tick ' + ticks + ' = ceil(90/dt)');
  check(s.winnerSlot === 2 && s.winnerTeam === 0, 'FFA time-out winner = top-kill slot 2, got slot ' + s.winnerSlot);
  const s2 = m.create(st);
  run(m, s2, 5410);
  check(s2.winnerSlot === 0, 'FFA time-out with no kills: slot 0 wins');
  const t = four(setupOf(2, GoalType.DeathMatch, TeamConfig.TwoVersusTwo));
  const s3 = m.create(t);
  m.debugDamage(s3, S.agentInSlot(s3, 0).id, 99999, S.agentInSlot(s3, 3).id);
  run(m, s3, 5410);
  check(s3.winnerTeam === 2 && s3.winnerSlot === -1, '2v2 time-out: team 2 leads 1-0 and wins');
  const s4 = m.create(t);
  run(m, s4, 5410);
  check(s4.phase === GamePhase.GameOver && s4.winnerTeam === 0, '2v2 time-out draw = team 0');
}

function killUntil(m, s, killerSlot, kills, victimSlots) {
  const k = S.agentInSlot(s, killerSlot);
  let done = 0, guard = 0;
  while (done < kills && guard++ < 20000 && s.phase === S.GamePhase.Playing) {
    for (const vs of victimSlots) {
      const v = S.agentInSlot(s, vs);
      if (done < kills && !S.isDead(v) && !S.has(v, S.StatusFlags.Invincibility) && s.phase === S.GamePhase.Playing) {
        m.debugDamage(s, v.id, 99999, k.id);
        done++;
      }
    }
    m.step(s, null);
  }
}

function testKill5() {
  const { GoalType, TeamConfig, GamePhase } = S;
  const m = new S.Match(db);
  const s = m.create(four(setupOf(0, GoalType.Kill5, TeamConfig.FreeForAll)));
  check(s.timerMax === 0, 'Kill5 has no timer');
  killUntil(m, s, 1, 4, [0, 2, 3]);
  check(s.phase === GamePhase.Playing, 'Kill5 FFA: 4 kills keep playing');
  killUntil(m, s, 1, 1, [0, 2, 3]);
  check(s.phase === GamePhase.GameOver && s.winnerSlot === 1 && !s.timeOut, 'Kill5 FFA: 5th kill wins for slot 1');
  const s2 = m.create(four(setupOf(0, GoalType.Kill5, TeamConfig.TwoVersusTwo)));
  killUntil(m, s2, 2, 5, [0, 1]);
  killUntil(m, s2, 3, 3, [0, 1]);
  check(s2.phase === GamePhase.Playing && S.GameRules.teamScore(s2, 2) === 8, 'Kill5 team: 8 team kills keep playing');
  killUntil(m, s2, 3, 1, [0, 1]);
  check(s2.phase === GamePhase.GameOver && s2.winnerTeam === 2, 'Kill5 team: 9th team kill wins for team 2');
  const ls = setupOf(0, GoalType.LastSurvivor, TeamConfig.FreeForAll);
  addSlot(ls, 0, 1, 1, false); addSlot(ls, 1, 2, 1, false);
  const s3 = m.create(ls);
  killUntil(m, s3, 0, 2, [1]);
  check(s3.phase === GamePhase.Playing, 'LastSurvivor: 2 deaths keep playing');
  killUntil(m, s3, 0, 1, [1]);
  check(s3.phase === GamePhase.GameOver && s3.winnerSlot === 0, 'LastSurvivor: 3rd death eliminates, slot 0 wins');
}

function testCooldown() {
  const { PowerType } = S;
  const a = S.createAgentState();
  a.hpMax = a.hpCurrent = 1000;
  const act = { cooldown: 2 };
  a.powerTypes[0] = PowerType.CooldownBoost; a.powerValues[0] = f(0.2);
  S.ActionSystem.updateCooldownActionMax(a, act);
  near(a.cooldownActionMax, f(1.6), f(1e-5), 'cooldown x (1 - 0.2)');
  a.powerTypes[1] = PowerType.CooldownBoostOnHighLife; a.powerValues[1] = f(0.3);
  S.ActionSystem.updateCooldownActionMax(a, act);
  near(a.cooldownActionMax, 1, f(1e-5), 'cooldown x (1 - 0.2 - 0.3) at high life');
  a.powerTypes[2] = PowerType.CooldownBoostOnLowLife; a.powerValues[2] = f(0.9);
  a.hpCurrent = 100;
  S.ActionSystem.updateCooldownActionMax(a, act);
  near(a.cooldownActionMax, f(0.2), f(1e-5), 'cooldown boost clamped at factor 0.1 (0.2 + 0.9 > 0.9)');
  a.powerValues[0] = -5; a.powerValues[2] = 0;
  S.ActionSystem.updateCooldownActionMax(a, act);
  near(a.cooldownActionMax, 2, f(1e-5), 'cooldown factor clamped at 1.0');

  const m = new S.Match(db);
  const st = setupOf(0, S.GoalType.DeathMatch, S.TeamConfig.FreeForAll);
  addSlot(st, 0, 4, 15, false); addSlot(st, 1, 14, 20, false);
  const s = m.create(st);
  near(s.agents[0].cooldownActionMax, f(1.25 * f(0.8)), f(1e-4), 'KING L15 spawn cooldown 1.25 x 0.8');
  run(m, s, 2);
  m.step(s, [S.InputFrame.none(), S.InputFrame.make(0, S.InputButtons.Action)]);
  near(s.agents[1].cooldownActionMax, f(1.75 * f(0.7)), f(1e-4), 'TOM L20 full HP cooldown 1.75 x 0.7');
  check(s.agents[1].isBusy, 'TOM action started');
}

function hitTarget(attackerSkin, level, gap, ticks) {
  const m = new S.Match(db);
  const st = setupOf(0, S.GoalType.DeathMatch, S.TeamConfig.FreeForAll);
  addSlot(st, 0, attackerSkin, level, false); addSlot(st, 1, 1, 1, false);
  const s = m.create(st);
  const a = s.agents[0], t = s.agents[1];
  t.hpMax = t.hpCurrent = 100000;
  a.pos = { x: -10, y: 0 };
  t.pos = { x: f(-10 + f(gap)), y: 0 };
  a.facingLeft = false;
  run(m, s, 5);
  m.events.length = 0;
  const press = [S.InputFrame.make(0, S.InputButtons.Action), S.InputFrame.none()];
  let total = 0, hits = 0;
  for (let i = 0; i < ticks; i++) {
    m.step(s, attackerSkin === 12 ? press : (i === 0 ? press : null));
    for (const e of m.events)
      if (e.type === S.SimEventType.AgentTookDamage && e.agent === t.id && e.other === a.id && e.value > 0) { total = f(total + e.value); hits++; }
    m.events.length = 0;
  }
  return { total, hits };
}

function testDamage() {
  let r = hitTarget(6, 1, 2.0, 40);
  check(r.hits === 1, 'NORI melee hits once per swing, got ' + r.hits);
  near(r.total, 360, f(0.01), 'NORI_Action melee damage 360');
  r = hitTarget(13, 1, 2.2, 40);
  near(r.total, 160, f(0.01), 'HORN_Action melee damage 160');
  check(r.hits === 1, 'HORN hits once');
  r = hitTarget(12, 20, 2.2, 31);
  check(r.hits >= 5, 'JACK hold melee: one hit per window, got ' + r.hits);
  near(f(r.total / Math.max(1, r.hits)), f(55 * f(1.95)), f(0.01), 'JACK_Action L20 per-hit damage 55 x 1.95');
  r = hitTarget(1, 1, 5, 40);
  check(r.hits === 3, 'BRO_Action 3 bullets hit, got ' + r.hits);
  near(r.total, 180, f(0.01), 'BRO_Action 3 x 60');
  r = hitTarget(1, 10, 5, 40);
  near(r.total, f(f(3 * 60) * f(1.45)), f(0.01), 'BRO_Action L10 3 x 60 x 1.45');
  r = hitTarget(9, 1, 6, 40);
  near(r.total, 320, f(0.01), 'BILLY_Action bullet 320');
}

function testSnapshot() {
  const m1 = new S.Match(db);
  const st = setupOf(2, S.GoalType.DeathMatch, S.TeamConfig.TwoVersusTwo);
  addSlot(st, 0, 5, 12, true, 0.7); addSlot(st, 1, 7, 8, true, 0.4); addSlot(st, 2, 10, 18, true, 0.9); addSlot(st, 3, 11, 5, true, 0.2);
  const s1 = m1.create(st);
  run(m1, s1, 600);
  const s2 = S.cloneMatchState(s1);
  const m2 = new S.Match(db);
  run(m1, s1, 600);
  run(m2, s2, 600);
  let same = s1.rng.state === s2.rng.state && s1.bullets.length === s2.bullets.length;
  for (let i = 0; i < s1.agents.length; i++)
    same = same && s1.agents[i].pos.x === s2.agents[i].pos.x && s1.agents[i].pos.y === s2.agents[i].pos.y && s1.agents[i].hpCurrent === s2.agents[i].hpCurrent;
  // JSON round trip is the network snapshot path
  const s3 = JSON.parse(JSON.stringify(s2));
  const m3 = new S.Match(db);
  run(m2, s2, 300);
  run(m3, s3, 300);
  same = same && JSON.stringify(s2) === JSON.stringify(s3);
  check(same, 'Clone() snapshot replays identically');
}

// ------------------------------------------------------------------ bot match table (simtest BotMatches, Random(12345))

/** System.Random(seed) of .NET (Net5CompatSeedImpl, Knuth subtractive). */
class DotnetRandom {
  constructor(seed) {
    const MBIG = 2147483647, MSEED = 161803398;
    const a = new Int32Array(56);
    const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed);
    let mj = MSEED - subtraction;
    a[55] = mj;
    let mk = 1, ii = 0;
    for (let i = 1; i < 55; i++) {
      if ((ii += 21) >= 55) ii -= 55;
      a[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = a[ii];
    }
    for (let k = 1; k < 5; k++) {
      for (let i = 1; i < 56; i++) {
        let n = i + 30;
        if (n >= 55) n -= 55;
        a[i] = a[i] - a[1 + n];
        if (a[i] < 0) a[i] += MBIG;
      }
    }
    this.a = a; this.inext = 0; this.inextp = 21; this.MBIG = MBIG;
  }
  sample() {
    let i = this.inext; if (++i >= 56) i = 1;
    let p = this.inextp; if (++p >= 56) p = 1;
    let r = this.a[i] - this.a[p];
    if (r === this.MBIG) r--;
    if (r < 0) r += this.MBIG;
    this.a[i] = r;
    this.inext = i; this.inextp = p;
    return r * (1.0 / this.MBIG);
  }
  next(min, max) { return Math.trunc(this.sample() * (max - min)) + min; }
  nextDouble() { return this.sample(); }
}

const MODES = [
  ['DM 1v1', 0, 0, 2], ['DM 2v2', 0, 2, 4], ['Kill5 1v1', 1, 0, 2], ['Kill5 2v2', 1, 2, 4],
  ['LastSurv 1v1', 2, 0, 2], ['LastSurv 2v2', 2, 2, 4], ['DM FFA4', 0, 0, 4], ['KillBoss 1v3', 3, 1, 4],
];

function checkEndRule(s, mc) {
  const [, goal, teams, slots] = mc;
  if (s.phase !== S.GamePhase.GameOver) return 'did not end within the cap (tick ' + s.tick + ')';
  const t1 = S.GameRules.teamScore(s, 1), t2 = S.GameRules.teamScore(s, 2);
  switch (goal) {
    case 0:
      if (!s.timeOut || s.timerElapsed < 90) return 'DeathMatch ended without time-out';
      if (teams === 0) {
        const best = Math.max(...s.killSlot.slice(0, slots));
        if (s.winnerSlot < 0 || s.killSlot[s.winnerSlot] !== best) return 'FFA winner slot ' + s.winnerSlot + ' is not top kills';
      } else if (s.winnerTeam !== (t1 > t2 ? 1 : t1 < t2 ? 2 : 0)) return 'team winner ' + s.winnerTeam + ' vs scores ' + t1 + '-' + t2;
      return null;
    case 1:
      if (s.timeOut) return 'Kill5 timed out';
      if (teams === 0) return s.winnerSlot >= 0 && s.killSlot[s.winnerSlot] >= 5 ? null : 'Kill5 winner slot ' + s.winnerSlot + ' has < 5 kills';
      return (s.winnerTeam === 1 && t1 >= 9) || (s.winnerTeam === 2 && t2 >= 9) ? null : 'Kill5 team winner ' + s.winnerTeam + ' scores ' + t1 + '-' + t2;
    case 2: {
      if (s.timeOut) return 'LastSurvivor timed out';
      const alive = [];
      for (let i = 0; i < slots; i++) if (s.deathSlot[i] < 3) alive.push(i);
      if (teams === 0) return alive.length <= 1 && (alive.length === 0 || alive[0] === s.winnerSlot) ? null : 'LastSurvivor alive ' + alive.length + ' winner ' + s.winnerSlot;
      const ts = [...new Set(alive.map((i) => S.GameRules.teamOfSlot(i, s.teams, s.bossOnLeft)))];
      return ts.length <= 1 && (ts.length === 0 || ts[0] === s.winnerTeam) ? null : 'LastSurvivor teams alive ' + ts.length;
    }
    case 3: {
      const boss = s.bossOnLeft ? 0 : 3;
      const bossTeam = S.GameRules.teamOfSlot(boss, s.teams, s.bossOnLeft);
      if (s.timeOut) return s.winnerTeam === bossTeam && s.timerElapsed >= 60 ? null : 'KillBoss time-out winner ' + s.winnerTeam;
      return s.deathSlot[boss] > 0 && s.winnerTeam !== bossTeam ? null : 'KillBoss ended but boss alive';
    }
  }
  return 'unknown goal';
}

function botMatches(count, cs) {
  const MAX_TICKS = 60 * 60 * 6;
  const rng = new DotnetRandom(12345);
  const rows = new Map();
  const skinSeen = new Set();
  let skinCursor = 0;
  let boundFails = 0, nanFails = 0, ruleFails = 0, csMismatch = 0, csExact = 0;
  const hist = new Array(S.SIM_EVENT_TYPE_COUNT).fill(0);
  let totalTicks = 0;
  const t0 = performance.now();
  let simMs = 0;
  for (let n = 0; n < count; n++) {
    const mc = MODES[n % MODES.length];
    const map = Math.floor(n / MODES.length) % db.maps.length;
    const st = S.createMatchSetup({ seed: 1000 + n, mapIndex: map, goal: mc[1], teams: mc[2], bossOnLeft: (n & 8) !== 0, botDifficultyInt: rng.next(0, 101) });
    for (let sl = 0; sl < mc[3]; sl++) {
      const skinId = 1 + (skinCursor++ % 16);
      skinSeen.add(skinId);
      const level = rng.next(1, 21);
      S.addSlot(st, sl, skinId, level, true, f(rng.nextDouble()));
    }
    const m = new S.Match(db);
    const s = m.create(st);
    const md = db.maps[map];
    const where = 'match ' + n + ' ' + mc[0] + ' ' + md.name;
    let kills = 0;
    const row = rows.get(mc[0]) || { matches: 0, kills: 0, timeOuts: 0, capped: 0, withKills: 0, ticks: 0, jumps: 0, shots: 0, specials: 0 };
    rows.set(mc[0], row);
    const counts = new Array(S.SIM_EVENT_TYPE_COUNT).fill(0);
    // simtest counts Create's events (AllPlayersSpawned, BossSpawned) with the first step's
    for (const e of m.events) { counts[e.type]++; hist[e.type]++; }
    m.events.length = 0;
    while (s.phase !== S.GamePhase.GameOver && s.tick < MAX_TICKS) {
      const ts = performance.now();
      m.step(s, null);
      simMs += performance.now() - ts;
      for (const e of m.events) {
        hist[e.type]++;
        counts[e.type]++;
        if (e.type === S.SimEventType.AgentDied && e.other >= 0 && e.other !== e.agent) kills++;
        else if (e.type === S.SimEventType.AgentJumped) row.jumps++;
        else if (e.type === S.SimEventType.AgentShootTriggered) row.shots++;
        else if (e.type === S.SimEventType.AgentActionStarted && e.flag) row.specials++;
      }
      m.events.length = 0;
      for (const a of s.agents) {
        if (Number.isNaN(a.pos.x) || Number.isNaN(a.pos.y) || Number.isNaN(a.velocity.x) || Number.isNaN(a.velocity.y) || Number.isNaN(a.hpCurrent))
          if (nanFails++ < 5) console.log('FAIL NaN ' + where + ' tick ' + s.tick + ' agent ' + a.id);
        const inside = a.pos.x >= f(md.innerMinX - f(0.05)) && a.pos.x <= f(md.innerMaxX + f(0.05))
          && a.pos.y >= f(md.floorTop - f(0.3)) && f(a.pos.y + 2) <= f(md.roofBottom + f(0.3))
          && !S.Physics2D.pointInside(md, S.Vec2.add(a.pos, { x: 0, y: 1 }), f(0.4));
        if (!inside && boundFails++ < 5) console.log('FAIL bounds ' + where + ' tick ' + s.tick + ' agent ' + a.id + ' pos ' + a.pos.x + ',' + a.pos.y);
      }
      for (const b of s.bullets) if (Number.isNaN(b.pos.x) || Number.isNaN(b.pos.y)) if (nanFails++ < 5) console.log('FAIL NaN bullet ' + where);
    }
    totalTicks += s.tick;
    const rule = checkEndRule(s, mc);
    if (rule != null) { ruleFails++; console.log('FAIL rule ' + where + ': ' + rule); }
    row.matches++;
    row.kills += kills;
    row.ticks += s.tick;
    if (s.timeOut) row.timeOuts++;
    if (s.phase !== S.GamePhase.GameOver) row.capped++;
    if (kills > 0) row.withKills++;
    if (cs && cs[n]) {
      const diff = {};
      const d = compare(cs[n].setup, st, 'setup', 'setup', diff) || compare(cs[n].final, s, 'final', 'final', diff)
        || compare(cs[n].eventCounts, counts, 'eventCounts', 'eventCounts', diff);
      if (d) { if (csMismatch++ < 5) console.log('DIFF botsum ' + where + ' ' + d.path + ' C#=' + JSON.stringify(d.cs) + ' JS=' + JSON.stringify(d.js)); }
      else if (!diff.inexact) csExact++;
    }
  }
  check(nanFails === 0, 'no NaN in ' + count + ' bot matches (' + nanFails + ')');
  check(boundFails === 0, 'no agent outside map bounds or inside a collider (' + boundFails + ')');
  check(ruleFails === 0, 'every match ends by its rule (' + ruleFails + ')');
  const names = Object.keys(S.SimEventType);
  console.log('events: ' + names.map((k) => k + '=' + hist[S.SimEventType[k]]).join(', '));
  for (const k of ['AgentJumped', 'AgentActionStarted', 'AgentActionEnded', 'AgentMeleeWindowOpened', 'AgentMeleeWindowClosed', 'AgentShootTriggered',
    'AgentBuffTriggered', 'AgentTookDamage', 'AgentHitBlocked', 'AgentDied', 'AgentRespawned', 'BulletSpawned', 'BulletRebounded', 'BulletDestroyed', 'GameOverTriggered'])
    check(hist[S.SimEventType[k]] > 0, 'event ' + k + ' raised in bot matches');
  check(skinSeen.size === 16, 'every skin played (' + skinSeen.size + '/16)');
  let withKills = 0, total = 0;
  for (const r of rows.values()) { withKills += r.withKills; total += r.matches; }
  check(withKills >= total * 0.9, 'kills > 0 in most matches (' + withKills + '/' + total + ')');
  const pad = (v, w) => String(v).padStart(w);
  console.log('mode'.padEnd(14) + pad('matches', 8) + pad('w/kills', 10) + pad('kills', 10) + pad('avg s', 10) + pad('t-out', 8) + pad('jumps', 10) + pad('shots', 10) + pad('specials', 10));
  for (const [k, x] of rows)
    console.log(k.padEnd(14) + pad(x.matches, 8) + pad(x.withKills, 10) + pad(x.kills, 10) + pad((x.ticks * db.dt / Math.max(1, x.matches)).toFixed(1), 10)
      + pad(x.timeOuts, 8) + pad(x.jumps, 10) + pad(x.shots, 10) + pad(x.specials, 10));
  const wall = performance.now() - t0;
  console.log('bot matches: ' + count + ' in ' + (wall / 1000).toFixed(1) + ' s, ' + totalTicks + ' ticks, step() '
    + (simMs / totalTicks * 1000).toFixed(1) + ' ms per 1000 ticks');
  if (cs) console.log('botsum vs C#: ' + (count - csMismatch) + '/' + count + ' matches identical (final state + event counts), ' + csExact + ' bit-exact');
  return { csMismatch, msPer1000: simMs / totalTicks * 1000 };
}

// ------------------------------------------------------------------ CRT trig check

function trigCheck() {
  if (!fs.existsSync(TRIG)) dotnet(['trigdump', TRIG, '2000000'], 300000);
  const b = fs.readFileSync(TRIG);
  const n = b.readInt32LE(0);
  let bad = 0, first = null;
  for (let i = 0; i < n; i++) {
    const o = 4 + i * 12;
    const x = b.readFloatLE(o), sn = b.readFloatLE(o + 4), cs = b.readFloatLE(o + 8);
    const js = S.sinf(x), jc = S.cosf(x);
    if (!Object.is(js, sn) || !Object.is(jc, cs)) { bad++; if (!first) first = { x, sin: [sn, js], cos: [cs, jc] }; }
  }
  check(bad === 0, 'sinf/cosf match .NET MathF on ' + n + ' samples (' + bad + ' differ' + (first ? ', first ' + JSON.stringify(first) : '') + ')');
  return n;
}

// ------------------------------------------------------------------ main

(async () => {
  S = await import(pathToFileURL(path.join(SIM, 'index.js')).href);
  db = S.GameDb.load(fs.readFileSync(DATA, 'utf8'));
  console.log('simdata ' + DATA + ' dt=' + db.dt + ' skins=' + db.skins.length + ' maps=' + db.maps.length);
  let bad = false;

  if (opt('--regen')) {
    fs.mkdirSync(TRACES, { recursive: true });
    console.log(dotnet(['trace', SCEN_DIR, TRACES], 1800000).trim().split('\n').slice(-1)[0]);
    console.log(dotnet(['botsum', '200', BOTSUM], 1800000).trim().split('\n').slice(-1)[0]);
  }

  if (!opt('--skip-unit')) {
    const t0 = performance.now();
    const n = trigCheck();
    console.log('trig: ' + n + ' MathF.Sin/Cos samples compared');
    testJump(); testRunSpeed(); testHp(); testRespawn(); testDeathMatchTimer(); testKill5(); testCooldown(); testDamage(); testSnapshot();
    console.log('unit asserts: ' + (asserts - 1) + ' (+1 trig), failures: ' + failures + ' (' + (performance.now() - t0).toFixed(0) + ' ms)');
  }
  if (!opt('--skip-table')) {
    let cs = null;
    if (fs.existsSync(BOTSUM)) cs = [...lines(BOTSUM)].map((l) => JSON.parse(l));
    else console.log('no ' + BOTSUM + ' (run with --regen): bot table not compared with C#');
    const r = botMatches(200, cs);
    if (r.csMismatch) bad = true;
  }
  console.log('asserts ' + asserts + ', failures ' + failures);
  if (failures) bad = true;

  if (!opt('--skip-trace')) {
    const names = fs.readdirSync(SCEN_DIR).filter((x) => x.endsWith('.json')).map((x) => x.slice(0, -5)).sort()
      .filter((x) => !ONLY || x.includes(ONLY));
    let ok = 0, exact = 0, totalLines = 0, exactLines = 0;
    const t0 = performance.now();
    for (const name of names) {
      const r = diffScenario(name);
      if (r.error) { bad = true; console.log('ERROR ' + name + ': ' + r.error); continue; }
      totalLines += r.lines;
      exactLines += r.exactLines;
      const tag = r.divergence ? 'DIVERGE' : r.exactLines === r.lines ? 'exact  ' : 'tol    ';
      let msg = tag + ' ' + name.padEnd(34) + ' ticks ' + String(r.lines).padStart(5) + '  bit-exact ' + String(r.exactLines).padStart(5);
      if (r.firstInexact) msg += '  first inexact t' + r.firstInexact.tick + ' ' + r.firstInexact.path + ' C#=' + r.firstInexact.cs + ' JS=' + r.firstInexact.js;
      if (r.divergence) msg += '\n    first divergence tick ' + r.divergence.tick + ' ' + r.divergence.path + '  C#=' + JSON.stringify(r.divergence.cs) + '  JS=' + JSON.stringify(r.divergence.js);
      console.log(msg);
      if (r.divergence) bad = true; else ok++;
      if (!r.divergence && r.exactLines === r.lines) exact++;
    }
    console.log('scenarios: ' + ok + '/' + names.length + ' match, ' + exact + ' bit-exact; ticks ' + exactLines + '/' + totalLines
      + ' bit-exact (' + ((performance.now() - t0) / 1000).toFixed(1) + ' s)');
  }
  console.log(bad ? 'FAIL' : 'PASS');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
