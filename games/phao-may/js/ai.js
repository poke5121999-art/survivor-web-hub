// Pháo Mây AI: searches angle and power by dry-running real shots (PM.Sim.trace), then plays its plan
// through the same inputs a human uses. All timing is in sim steps, so matches replay exactly from a seed.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const { clamp } = PM;
  const DT = PM.RULES.dt, QUANTUM = PM.RULES.chargeRate * DT;
  const AI = (PM.AI = {});
  const quant = (p) => clamp(Math.round(p / QUANTUM) * QUANTUM, QUANTUM * 8, 100);

  function score(sim, u, rep) {
    let s = 0, hitEnemy = false;
    for (const id in rep.dmg) {
      const v = sim.units[id], raw = rep.dmg[id], d = Math.min(raw, v.hp + v.shield);
      if (v.team !== u.team) { s += d + (raw >= v.hp + v.shield ? 300 : 0); hitEnemy = true; }
      else s -= 1.6 * d + (raw >= v.hp ? 500 : 0);
    }
    for (const id in rep.heal) s += rep.heal[id] * 0.9;
    if (rep.swap !== undefined && sim.units[rep.swap].team !== u.team) s += sim.units[rep.swap].y > u.y ? 80 : 10;
    if (!hitEnemy) {
      let near = 200;
      for (const im of rep.impacts) {
        if (im.lost) continue;
        for (const v of sim.units) if (v.alive && v.team !== u.team) near = Math.min(near, Math.hypot(v.x - im.x, v.y + v.radius - im.y));
      }
      s -= 5 + near * 0.5;
    }
    return s;
  }
  AI.score = score;

  function* planner(sim, u, L, useSpecial) {
    const enemies = sim.units.filter((v) => v.alive && v.team !== u.team);
    const facings = [...new Set(enemies.map((e) => (e.x >= u.x ? 1 : -1)))];
    let best = { score: -1e9 }, n = 0;
    const consider = (si, facing, angle, power) => {
      const rep = PM.Sim.trace(sim, u, u.shots[si], facing, angle, power, u, 1);
      const sc = score(sim, u, rep);
      if (sc > best.score) best = { si, facing, angle, power, score: sc, rep };
    };
    for (let si = 0; si < u.shots.length; si++) {
      const def = u.shots[si];
      if ((def.special && !useSpecial) || def.kind === 'guard') continue;
      const pStep = def.kind === 'beam' ? 100 : 5;
      for (const facing of facings) {
        for (let angle = u.aimMin; angle <= u.aimMax; angle += 3) {
          for (let power = def.kind === 'beam' ? 100 : 15; power <= 100; power += pStep) {
            consider(si, facing, angle, power);
            if (++n % 4 === 0) yield null;
          }
        }
      }
    }
    if (best.score > -1e9) {
      const c = best;
      for (let da = -2; da <= 2; da += 0.5) {
        for (let k = -6; k <= 6; k++) {
          const angle = clamp(c.angle + da, u.aimMin, u.aimMax), power = quant(c.power + k * QUANTUM * 2);
          consider(c.si, c.facing, angle, power);
          if (++n % 4 === 0) yield null;
        }
      }
    }
    return best;
  }

  function planTele(sim, u) {
    const enemies = sim.units.filter((v) => v.alive && v.team !== u.team);
    let near = enemies[0];
    for (const e of enemies) if (Math.abs(e.x - u.x) < Math.abs(near.x - u.x)) near = e;
    const dir = near.x >= u.x ? 1 : -1, wantX = near.x - dir * 26;
    let best = null;
    for (let angle = 35; angle <= 80; angle += 5) {
      for (let power = 20; power <= 100; power += 5) {
        const rep = PM.Sim.trace(sim, u, PM.Sim.TELE_DEF, dir, angle, power, u, 1);
        if (!rep.tele) continue;
        const d = Math.abs(rep.tele.x - wantX);
        if (!best || d < best.d) best = { d, facing: dir, angle, power };
      }
    }
    return best;
  }

  function safeAhead(sim, u, dir) {
    const g = sim.terrain.groundY(u.x + dir * 1.3, u.y + 1.4, 3.2);
    return g !== null && g !== -Infinity;
  }

  function decide(sim, u, b, best) {
    const L = PM.AI_LEVELS[u.ai], mem = sim.brains[u.id];
    const hitsEnemy = best.rep && Object.keys(best.rep.dmg).some((id) => sim.units[id].team !== u.team);
    if (L.moves && !b.moved && !hitsEnemy && u.fuel > 2) {
      const enemies = sim.units.filter((v) => v.alive && v.team !== u.team);
      let near = enemies[0];
      for (const e of enemies) if (Math.abs(e.x - u.x) < Math.abs(near.x - u.x)) near = e;
      b.moved = true; b.state = 'move'; b.dir = near.x >= u.x ? 1 : -1; b.left = Math.min(u.fuel * 0.8, 7); b.stuck = 0;
      return;
    }
    const items = [];
    const has = (id) => u.items.indexOf(id);
    let plan = { si: best.si, facing: best.facing, angle: best.angle, power: best.power, tele: false };
    if (L.items) {
      if (has('heal') >= 0 && u.hp < u.maxHp * 0.45) items.push('heal');
      if (has('teamheal') >= 0 && sim.units.some((v) => v.alive && v.team === u.team && v.hp < v.maxHp * 0.5)) items.push('teamheal');
      if (has('shield') >= 0 && u.hp < u.maxHp * 0.65 && sim.rng() < 0.6) items.push('shield');
      if (has('tele') >= 0 && !hitsEnemy) {
        const t = planTele(sim, u);
        if (t) { plan = { si: u.shotIdx, facing: t.facing, angle: t.angle, power: t.power, tele: true }; items.push('tele'); }
      }
      if (!plan.tele && best.score >= 200 && has('boost') >= 0) items.push('boost');
      if (!plan.tele && best.score >= 260 && has('double') >= 0) items.push('double');
    }
    if (!plan.tele) {
      let target = -1, most = 0;
      for (const id in best.rep.dmg) if (sim.units[id].team !== u.team && best.rep.dmg[id] > most) { most = best.rep.dmg[id]; target = +id; }
      mem.streak = target >= 0 && target === mem.target ? mem.streak + 1 : 0;
      mem.target = target;
      const decay = Math.pow(L.learn, mem.streak);
      plan.angle = clamp(plan.angle + sim.rng.gauss() * L.angErr * decay, u.aimMin, u.aimMax);
      plan.power = plan.power + sim.rng.gauss() * L.powErr * decay;
      if (sim.rng() < L.whiff) plan.power += (sim.rng() < 0.5 ? -1 : 1) * sim.rng.range(8, 16);
    }
    const gi = u.shots.findIndex((d) => d.kind === 'guard');
    if (gi >= 0 && !plan.tele && L.items && u.shield <= 0 && u.hp < u.maxHp * 0.55 && sim.rng() < 0.45) plan.si = gi;
    plan.power = quant(plan.power);
    b.plan = plan; b.items = items; b.state = 'aim'; b.t = 0;
  }

  AI.begin = function (sim, u) {
    sim.brains = sim.brains || {};
    if (!sim.brains[u.id]) sim.brains[u.id] = { target: -1, streak: 0 };
    u.brain = { state: 'wait', t: 0, gen: null, plan: null, items: [], moved: false };
  };

  AI.drive = function (sim, u) {
    const b = u.brain, L = PM.AI_LEVELS[u.ai], inp = sim.input;
    if (!b || !u.grounded) { inp.move = 0; return; }
    b.t += DT;
    if (b.state === 'wait') {
      if (b.t > 0.6) { b.state = 'think'; b.gen = planner(sim, u, L, u.special >= 100 && sim.rng() < L.special); }
    } else if (b.state === 'think') {
      for (let k = 0; k < 3; k++) {
        const r = b.gen.next();
        if (r.done) { decide(sim, u, b, r.value); break; }
      }
    } else if (b.state === 'move') {
      const ok = safeAhead(sim, u, b.dir) && u.fuel > 0.1;
      const x0 = u.x;
      inp.move = ok ? b.dir : 0;
      b.left -= u.speed * DT;
      b.stuck = ok && Math.abs(u.x - (b.lastX === undefined ? x0 - 1 : b.lastX)) > 1e-4 ? 0 : b.stuck + DT;
      b.lastX = x0;
      if (b.left <= 0 || !ok || b.stuck > 0.25) { inp.move = 0; b.state = 'think'; b.gen = planner(sim, u, L, u.special >= 100); }
    } else if (b.state === 'aim') {
      const plan = b.plan;
      u.facing = plan.facing;
      if (b.items.length) {
        if (b.t > 0.35) { sim.useItem(u.items.indexOf(b.items.shift())); b.t = 0; }
        return;
      }
      if (!plan.tele && u.shotIdx !== plan.si) sim.selectShot(plan.si);
      const diff = plan.angle - u.angle;
      if (Math.abs(diff) <= u.aimSpeed * DT) { u.angle = plan.angle; inp.aim = 0; b.state = 'charge'; b.t = 0; }
      else inp.aim = Math.sign(diff);
    } else if (b.state === 'charge') {
      if (b.t < 0.25) return;
      inp.charge = !(sim.charge.on && sim.charge.power >= b.plan.power - 1e-6);
    }
  };
})();
