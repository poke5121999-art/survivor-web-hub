// Pháo Mây match simulation: deterministic, fixed step, no rendering. The browser draws from this state
// and from sim.events; tools/sim-test.js runs it in node. A "ctx" is either the live sim or a dry-run
// context (ctx.dry) that the AI uses to trace a shot with the same code that flies the real one.
(function () {
  'use strict';
  const PM = globalThis.PM;
  const { clamp } = PM;
  const R = PM.RULES, DT = R.dt, RAD = Math.PI / 180;

  const Sim = (PM.Sim = {});

  function emit(ctx, ev) { if (!ctx.dry) ctx.events.push(ev); }

  function applyDamage(ctx, u, amount, owner, cause) {
    if (!u.alive || amount <= 0) return;
    if (ctx.dry) { ctx.report.dmg[u.id] = (ctx.report.dmg[u.id] || 0) + amount; return; }
    let dmg = Math.round(amount / u.armor);
    let blocked = 0;
    if (u.shield > 0) { blocked = Math.min(u.shield, dmg); u.shield -= blocked; dmg -= blocked; }
    u.hp = Math.max(0, u.hp - dmg);
    u.special = Math.min(100, u.special + dmg * 0.04);
    const st = ctx.stats[u.id];
    st.taken += dmg;
    if (owner && owner.team !== u.team) {
      owner.special = Math.min(100, owner.special + dmg * 0.06);
      ctx.stats[owner.id].dealt += dmg;
    }
    emit(ctx, { type: 'damage', unit: u.id, amount: dmg, blocked, cause, x: u.x, y: u.y + u.radius });
    if (u.hp <= 0) kill(ctx, u, cause, owner);
  }

  function kill(ctx, u, cause, owner) {
    if (!u.alive) return;
    u.alive = false; u.hp = 0;
    if (owner && owner.team !== u.team) ctx.stats[owner.id].kills++;
    emit(ctx, { type: 'die', unit: u.id, cause, x: u.x, y: u.y + u.radius });
  }

  function explode(ctx, x, y, spec, owner, boost, direct) {
    if (ctx.dry) ctx.report.impacts.push({ x, y });
    if (spec.radius > 0) {
      for (const u of ctx.units) {
        if (!u.alive) continue;
        const cx = u.x, cy = u.y + u.radius;
        const d = Math.max(0, Math.hypot(cx - x, cy - y) - u.radius * 0.6);
        if (d >= spec.radius) continue;
        const f = 1 - 0.65 * (d / spec.radius);
        if (spec.heal) {
          if (owner && u.team === owner.team) {
            const amt = Math.min(u.maxHp - u.hp, Math.round(spec.heal * f));
            if (ctx.dry) ctx.report.heal[u.id] = (ctx.report.heal[u.id] || 0) + amt;
            else if (amt > 0) { u.hp += amt; emit(ctx, { type: 'heal', unit: u.id, amount: amt, x: u.x, y: u.y + u.radius }); }
          }
          continue;
        }
        let dmg = spec.dmg * f * boost;
        if (direct === u && spec.direct) dmg *= spec.direct;
        applyDamage(ctx, u, dmg, owner, 'blast');
        if (!ctx.dry && u.alive && spec.knock * f > 2) {
          let nx = cx - x, ny = cy - y + 1.2;
          const l = Math.hypot(nx, ny) || 1;
          u.vx = (nx / l) * spec.knock * f; u.vy = Math.abs(ny / l) * spec.knock * f + 2;
          if (u.grounded) u.peakY = u.y;
          u.grounded = false;
        }
      }
    }
    if (!ctx.dry) {
      if (spec.dig > 0) ctx.terrain.carve(x, y, spec.dig);
      emit(ctx, { type: 'boom', x, y, radius: spec.radius, dig: spec.dig, shot: spec.id, owner: owner ? owner.id : -1 });
    }
  }

  function spawn(ctx, owner, def, x, y, vx, vy, boost) {
    const p = { id: ctx.nextProj++, owner, def, x, y, vx, vy, age: 0, boost, bounces: def.bounces || 0, alive: true };
    ctx.projs.push(p);
    emit(ctx, { type: 'spawn', proj: p.id, shot: def.id, x, y });
    return p;
  }

  function fan(ctx, p, child) {
    const n = p.def.count, sp = Math.hypot(p.vx, p.vy), base = Math.atan2(p.vy, p.vx);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * p.def.spread * RAD;
      const k = 1 + (i - (n - 1) / 2) * 0.03;
      spawn(ctx, p.owner, child, p.x, p.y, Math.cos(a) * sp * k, Math.sin(a) * sp * k, p.boost).age = 0.36;
    }
    p.alive = false;
    emit(ctx, { type: 'split', x: p.x, y: p.y, shot: p.def.id });
  }

  // One row per shot kind. tick returns false when the projectile ended itself.
  const BEHAV = (Sim.BEHAV = {
    shell: {
      hitTerrain(ctx, p, hit) { p.alive = false; explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, null); },
      hitUnit(ctx, p, hit, u) { p.alive = false; explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, u); }
    },
    bounce: {
      hitTerrain(ctx, p, hit) {
        if (p.bounces <= 0) { p.alive = false; explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, null); return; }
        const n = ctx.terrain.normal(hit.x, hit.y), vn = p.vx * n.x + p.vy * n.y;
        if (vn < 0) {
          const tx = p.vx - vn * n.x, ty = p.vy - vn * n.y;
          p.vx = tx * 0.86 - vn * n.x * p.def.rest; p.vy = ty * 0.86 - vn * n.y * p.def.rest;
        }
        p.x = hit.x + n.x * 0.12; p.y = hit.y + n.y * 0.12; p.bounces--;
        emit(ctx, { type: 'bounce', x: hit.x, y: hit.y, proj: p.id });
      },
      hitUnit(ctx, p, hit, u) { p.alive = false; explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, u); }
    },
    cluster: {
      tick(ctx, p) { if (p.vy <= 0 && p.age > 0.3) { fan(ctx, p, p.def.child); return false; } return true; },
      hitTerrain(ctx, p, hit) { BEHAV.shell.hitTerrain(ctx, p, hit); },
      hitUnit(ctx, p, hit, u) { BEHAV.shell.hitUnit(ctx, p, hit, u); }
    },
    split: {
      tick(ctx, p) { if (p.age >= p.def.fuse) { fan(ctx, p, p.def.child); return false; } return true; },
      hitTerrain(ctx, p, hit) { p.alive = false; explode(ctx, hit.x, hit.y, p.def.child, p.owner, p.boost, null); },
      hitUnit(ctx, p, hit, u) { p.alive = false; explode(ctx, hit.x, hit.y, p.def.child, p.owner, p.boost, u); }
    },
    // Digs through the ground along its entry direction, then bursts. Carves its own tunnel.
    drill: {
      step(ctx, p) {
        if (!p.burrow) return false;
        const sp = p.def.drillSpeed, l = Math.hypot(p.vx, p.vy) || 1;
        p.age += DT;
        p.x += (p.vx / l) * sp * DT; p.y += (p.vy / l) * sp * DT; p.left -= sp * DT;
        if (!ctx.dry) { ctx.terrain.carve(p.x, p.y, 0.85); if ((p.tick = (p.tick || 0) + 1) % 6 === 0) emit(ctx, { type: 'burrow', x: p.x, y: p.y }); }
        let hitU = null;
        for (const u of ctx.units) if (u.alive && Math.hypot(u.x - p.x, u.y + u.radius - p.y) < u.radius + 0.3) hitU = u;
        if (hitU || p.left <= 0 || ctx.terrain.sample(p.x, p.y) > 0.9 || p.y < ctx.seaY) { p.alive = false; explode(ctx, p.x, p.y, p.def, p.owner, p.boost, hitU); }
        return true;
      },
      hitTerrain(ctx, p, hit) { p.burrow = true; p.left = p.def.depth; p.x = hit.x; p.y = hit.y; emit(ctx, { type: 'bounce', x: hit.x, y: hit.y, proj: p.id }); },
      hitUnit(ctx, p, hit, u) { BEHAV.shell.hitUnit(ctx, p, hit, u); }
    },
    // Lands, then rolls along the surface until it meets a unit, a wall, or runs out of time.
    roller: {
      step(ctx, p) {
        if (!p.rolling) return false;
        p.age += DT; p.left -= DT;
        const nx = p.x + p.dir * p.def.rollSpeed * DT;
        const gy = ctx.terrain.groundY(nx, p.y + 1.1, 2.6);
        let hitU = null;
        for (const u of ctx.units) if (u.alive && Math.hypot(u.x - nx, u.y + u.radius - p.y) < u.radius + p.def.size) hitU = u;
        if (hitU || gy === null || p.left <= 0) { p.alive = false; explode(ctx, p.x, p.y + 0.2, p.def, p.owner, p.boost, hitU); return true; }
        if (gy === -Infinity) { p.rolling = false; p.x = nx; p.vx = p.dir * p.def.rollSpeed; p.vy = 0; p.fell = true; return true; }
        p.x = nx; p.y = gy + p.def.size * 0.5; p.vx = p.dir * p.def.rollSpeed; p.vy = 0;
        return true;
      },
      hitTerrain(ctx, p, hit) {
        if (p.fell && p.bounces <= 0) { p.alive = false; explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, null); return; }
        if (p.fell) p.bounces--;
        const n = ctx.terrain.normal(hit.x, hit.y);
        if (n.y < 0.2) { p.alive = false; explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, null); return; }
        p.rolling = true; p.left = p.def.roll; p.dir = p.dir || (p.vx >= 0 ? 1 : -1); p.x = hit.x; p.y = hit.y + p.def.size * 0.5;
        emit(ctx, { type: 'bounce', x: hit.x, y: hit.y, proj: p.id });
      },
      hitUnit(ctx, p, hit, u) { BEHAV.shell.hitUnit(ctx, p, hit, u); }
    },
    // Bursts into rollers that run both ways from the impact.
    forkroll: {
      hitTerrain(ctx, p, hit) {
        p.alive = false;
        explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, null);
        const n = p.def.count;
        for (let i = 0; i < n; i++) {
          const dir = i % 2 ? 1 : -1, k = 1 + Math.floor(i / 2) * 0.35;
          const c = spawn(ctx, p.owner, p.def.child, hit.x + dir * 0.6, hit.y + 1.0, dir * 5 * k, 4 + 2 * k, p.boost);
          c.age = 0.36; c.dir = dir;
        }
      },
      hitUnit(ctx, p, hit, u) { BEHAV.shell.hitUnit(ctx, p, hit, u); }
    },
    // Impact, then a line of aftershocks walking outward along the ground.
    quake: {
      hitTerrain(ctx, p, hit) {
        p.alive = false;
        explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, null);
        for (let i = 1; i <= p.def.count; i++) for (const dir of [-1, 1]) {
          const shock = { t: (ctx.time || 0) + i * 0.16, x: hit.x + dir * i * p.def.gap, y: hit.y, def: p.def.child, owner: p.owner, boost: p.boost };
          if (ctx.dry) aftershock(ctx, shock); else ctx.shocks.push(shock);
        }
      },
      hitUnit(ctx, p, hit, u) { BEHAV.quake.hitTerrain(ctx, p, hit); }
    },
    // Trades places with the unit it hits.
    swap: {
      hitTerrain(ctx, p, hit) { BEHAV.shell.hitTerrain(ctx, p, hit); },
      hitUnit(ctx, p, hit, u) {
        p.alive = false;
        explode(ctx, hit.x, hit.y, p.def, p.owner, p.boost, u);
        const o = p.owner;
        if (ctx.dry) { ctx.report.swap = u.id; return; }
        if (!o.alive || !u.alive || o === u) return;
        const ox = o.x, oy = o.y;
        o.x = u.x; o.y = u.y + 0.3; u.x = ox; u.y = oy + 0.3;
        for (const v of [o, u]) { v.vx = 0; v.vy = 0; v.grounded = false; v.peakY = v.y; }
        emit(ctx, { type: 'tele', unit: o.id, fromX: ox, fromY: oy, x: o.x, y: o.y });
      }
    },
    tele: {
      ghost: true,
      hitTerrain(ctx, p, hit) {
        p.alive = false;
        if (ctx.dry) { ctx.report.tele = { x: hit.x, y: hit.y }; return; }
        const u = p.owner;
        if (!u.alive) return;
        const from = { x: u.x, y: u.y };
        const gy = ctx.terrain.groundY(hit.x, hit.y + 1.5, 4);
        u.x = hit.x; u.y = gy === null || gy === -Infinity ? hit.y + 0.4 : gy;
        u.vx = 0; u.vy = 0; u.grounded = false; u.peakY = u.y;
        emit(ctx, { type: 'tele', unit: u.id, fromX: from.x, fromY: from.y, x: u.x, y: u.y });
      }
    }
  });

  function aftershock(ctx, k) {
    const gy = ctx.terrain.groundY(k.x, k.y + 5, 11);
    if (gy === null || gy === -Infinity) return;
    explode(ctx, k.x, gy, k.def, k.owner, k.boost, null);
  }

  function segCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy;
    const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    if (a < 1e-12) return -1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : -1;
  }

  function stepProj(ctx, p) {
    const def = p.def, beh = BEHAV[def.kind];
    if (beh.step && beh.step(ctx, p)) return;
    p.age += DT;
    p.vx += ctx.wind * def.windK * DT;
    p.vy -= ctx.map.g * def.gravK * DT;
    if (beh.tick && beh.tick(ctx, p) === false) return;
    const nx = p.x + p.vx * DT, ny = p.y + p.vy * DT;
    let best = 2, hitU = null;
    if (!beh.ghost) {
      for (const u of ctx.units) {
        if (!u.alive || (u === p.owner && p.age < 0.35)) continue;
        const t = segCircle(p.x, p.y, nx, ny, u.x, u.y + u.radius, u.radius + def.size * 0.5);
        if (t >= 0 && t < best) { best = t; hitU = u; }
      }
    }
    const th = ctx.terrain.raycast(p.x, p.y, nx, ny);
    if (th && th.t <= best) { beh.hitTerrain(ctx, p, th); return; }
    if (hitU) { beh.hitUnit(ctx, p, { x: p.x + (nx - p.x) * best, y: p.y + (ny - p.y) * best }, hitU); return; }
    p.x = nx; p.y = ny;
    if (p.y < ctx.seaY) { p.alive = false; emit(ctx, { type: 'splash', x: p.x, y: ctx.seaY }); if (ctx.dry) ctx.report.impacts.push({ x: p.x, y: p.y, lost: true }); }
    else if (p.x < -40 || p.x > ctx.map.w + 40 || p.age > 14) { p.alive = false; if (ctx.dry) ctx.report.impacts.push({ x: p.x, y: p.y, lost: true }); }
  }

  function fireBeam(ctx, u, def, ox, oy, dx, dy, power, boost) {
    const len = def.len * (0.35 + 0.65 * power / 100);
    const ex = ox + dx * len, ey = oy + dy * len;
    for (const v of ctx.units) {
      if (!v.alive || v === u) continue;
      const cx = v.x, cy = v.y + v.radius;
      const t = clamp(((cx - ox) * dx + (cy - oy) * dy) / len, 0, 1);
      const d = Math.hypot(ox + dx * len * t - cx, oy + dy * len * t - cy);
      if (d < v.radius + def.radius) applyDamage(ctx, v, def.dmg * boost * (1 - 0.25 * t), u, 'beam');
    }
    if (ctx.dry) { ctx.report.impacts.push({ x: ex, y: ey }); return; }
    for (let s = 1.2; s <= len; s += def.dig * 0.8) ctx.terrain.carve(ox + dx * s, oy + dy * s, def.dig);
    ctx.hold = Math.max(ctx.hold, def.hold);
    emit(ctx, { type: 'beam', x0: ox, y0: oy, x1: ex, y1: ey, owner: u.id });
  }

  function launch(ctx, u, def, facing, angle, power, boost, pos) {
    const a = angle * RAD, dx = Math.cos(a) * facing, dy = Math.sin(a);
    const cx = pos.x, cy = pos.y + u.radius;
    if (def.kind === 'guard') {
      if (ctx.dry) return;
      for (const v of ctx.units) if (v.alive && v.team === u.team && Math.abs(v.x - u.x) < def.reach) v.shield = Math.max(v.shield, v === u ? def.absorb : Math.round(def.absorb * 0.5));
      ctx.hold = Math.max(ctx.hold, 0.6);
      emit(ctx, { type: 'guard', unit: u.id, x: u.x, y: u.y + u.radius, reach: def.reach });
      return;
    }
    if (def.kind === 'beam') { fireBeam(ctx, u, def, cx + dx * u.barrel * 0.6, cy + dy * u.barrel * 0.6, dx, dy, power, boost); return; }
    let mx = cx + dx * u.barrel, my = cy + dy * u.barrel;
    const hit = ctx.terrain.raycast(cx, cy, mx, my);
    if (hit) { mx = cx + (hit.x - cx) * 0.9; my = cy + (hit.y - cy) * 0.9; }
    const sp = def.v * (0.15 + 0.85 * power / 100);
    spawn(ctx, u, def, mx, my, dx * sp, dy * sp, boost);
  }
  Sim.muzzle = function (u) {
    const a = u.angle * RAD, dx = Math.cos(a) * u.facing, dy = Math.sin(a);
    return { x: u.x + dx * u.barrel, y: u.y + u.radius + dy * u.barrel, dx, dy };
  };

  const TELE_DEF = { id: 'tele', name: 'Dịch Chuyển', kind: 'tele', v: PM.ITEMS.tele.v, windK: 0.5, gravK: 1, size: 0.3, dmg: 0, radius: 0, dig: 0 };
  Sim.TELE_DEF = TELE_DEF;

  // Dry-run one shot against the current terrain and units. Returns { dmg: {unitId: n}, impacts: [{x,y}], tele }.
  Sim.trace = function (sim, u, def, facing, angle, power, pos, boost) {
    const ctx = { dry: true, terrain: sim.terrain, units: sim.units, wind: sim.wind, map: sim.map, seaY: sim.seaY, projs: [], nextProj: 0, hold: 0,
      report: { dmg: {}, heal: {}, impacts: [], tele: null } };
    launch(ctx, u, def, facing, angle, power, boost || 1, pos || u);
    let guard = 0;
    while (ctx.projs.length && guard++ < 2400) {
      for (let i = 0; i < ctx.projs.length; i++) { const p = ctx.projs[i]; if (p.alive) stepProj(ctx, p); }
      for (let i = ctx.projs.length - 1; i >= 0; i--) if (!ctx.projs[i].alive) ctx.projs.splice(i, 1);
    }
    return ctx.report;
  };

  // The flight path of the first projectile only, for tests and the aim preview: [{x,y}] every `every` steps.
  Sim.arc = function (sim, u, def, facing, angle, power, every) {
    const ctx = { dry: true, terrain: sim.terrain, units: [], wind: sim.wind, map: sim.map, seaY: sim.seaY, projs: [], nextProj: 0, hold: 0, report: { dmg: {}, heal: {}, impacts: [], tele: null } };
    launch(ctx, u, def, facing, angle, power, 1, u);
    const p = ctx.projs[0], pts = [];
    if (!p) return pts;
    let n = 0;
    while (p.alive && n < 2400) { if (n % (every || 6) === 0) pts.push({ x: p.x, y: p.y }); stepProj(ctx, p); n++; if (ctx.projs.length > 1) break; }
    pts.push({ x: p.x, y: p.y });
    return pts;
  };

  function stepUnit(sim, u) {
    if (!u.alive) return;
    const T = sim.terrain, map = sim.map;
    u.sliding = false;
    if (u.grounded) {
      const gy = T.groundY(u.x, u.y + R.stepUp, R.stepUp + 0.35);
      if (gy === null) { u.y += 0.1; }
      else if (gy === -Infinity) { u.grounded = false; u.vx = 0; u.vy = 0; u.peakY = u.y; }
      else {
        u.y = gy;
        const side = (dx) => { const g = T.groundY(u.x + dx, u.y + R.stepUp, 3.5); return g === null ? u.y + R.stepUp : g === -Infinity ? u.y - 3.5 : g; };
        const sl = side(0.5) - side(-0.5);
        u.slope = sl;
        if (Math.abs(sl) > R.slide) { u.x += (sl > 0 ? -1 : 1) * 4 * DT; u.sliding = true; }
      }
    } else {
      u.vy -= map.g * DT;
      let nx = u.x + u.vx * DT, ny = u.y + u.vy * DT;
      if (u.vx !== 0 && T.solid(nx + Math.sign(u.vx) * u.radius * 0.7, ny + u.radius)) { nx = u.x; u.vx *= -0.25; }
      if (u.vy > 0 && T.solid(nx, ny + u.radius * 1.8)) { u.vy = 0; ny = u.y; }
      if (u.y > u.peakY) u.peakY = u.y;
      if (u.vy <= 0 && T.solid(nx, ny)) {
        const gy = T.groundY(nx, ny + 1.2, 1.3);
        if (gy === null || gy === -Infinity) { nx = u.x; ny = u.y; } else ny = gy;
        u.x = nx; u.y = ny; u.grounded = true; u.vx = 0; u.vy = 0;
        const fall = u.peakY - ny;
        emit(sim, { type: 'land', unit: u.id, fall, x: u.x, y: u.y });
        if (fall > R.fallSafe) applyDamage(sim, u, (fall - R.fallSafe) * R.fallDmg * u.armor, null, 'fall');
      } else { u.x = nx; u.y = ny; }
    }
    if (u.alive && u.y < sim.seaY - 1) kill(sim, u, 'sea', sim.lastShooter !== u ? sim.lastShooter : null);
    else if (u.alive && (u.x < -6 || u.x > map.w + 6)) kill(sim, u, 'out', null);
  }

  function walk(sim, u, dir) {
    const T = sim.terrain;
    u.facing = dir;
    if (!u.grounded || u.fuel <= 0) return false;
    const dx = dir * u.speed * DT, nx = u.x + dx;
    const ahead = T.groundY(u.x + dir * 0.6, u.y + 1.4, 6);
    if (ahead === null || (ahead !== -Infinity && ahead - u.y > 0.6 * R.walkSlope)) return false;
    for (const v of sim.units) if (v !== u && v.alive && Math.abs(v.x - nx) < u.radius + v.radius && Math.abs(v.x - nx) < Math.abs(v.x - u.x) && Math.abs(v.y - u.y) < 2.5) return false;
    const gy = T.groundY(nx, u.y + R.stepUp, R.stepUp + 0.6);
    if (gy === null) return false;
    u.x = nx;
    if (gy === -Infinity) { u.grounded = false; u.vx = dir * u.speed * 0.6; u.vy = 0; u.peakY = u.y; } else u.y = gy;
    u.fuel -= Math.abs(dx); sim.ts.moved += Math.abs(dx);
    return true;
  }

  function teamsAlive(sim) { const s = new Set(); for (const u of sim.units) if (u.alive) s.add(u.team); return s; }

  function turnCost(sim, u) {
    const ts = sim.ts;
    if (!ts.fired) return R.skipDelay + ts.cost + ts.moved * R.moveDelay;
    const shot = ts.tele ? 20 : u.shots[u.shotIdx].delay;
    return u.weight * 0.5 + shot + ts.cost + ts.moved * R.moveDelay;
  }
  Sim.turnCost = turnCost;

  function startTurn(sim) {
    const alive = sim.units.filter((u) => u.alive);
    let next = alive[0];
    for (const u of alive) if (u.delay < next.delay || (u.delay === next.delay && u.id < next.id)) next = u;
    const base = next.delay;
    for (const u of alive) u.delay -= base;
    const wm = sim.map.windMax;
    sim.wind = sim.turnN === 0 ? sim.rng.range(-0.6, 0.6) * wm : clamp(sim.wind + sim.rng.range(-1, 1) * wm * 0.5, -wm, wm);
    sim.wind = Math.round(sim.wind * 10) / 10;
    const hz = sim.map.hazard;
    if (hz && hz.kind === 'tide' && sim.turnN > 0 && sim.seaY < hz.max) { sim.seaY = Math.min(hz.max, sim.seaY + hz.perTurn); emit(sim, { type: 'tide', y: sim.seaY }); }
    sim.turnN++;
    sim.active = next;
    next.fuel = next.fuelMax; next.shield = 0;
    next.special = Math.min(100, next.special + R.specialPerTurn);
    if (next.shots[next.shotIdx].special && next.special < 100) next.shotIdx = 0;
    sim.ts = { moved: 0, cost: 0, double: false, boost: 1, tele: false, fired: false, items: [] };
    sim.timer = sim.turnTime;
    sim.charge = { on: false, power: 0 };
    sim.input = { move: 0, aim: 0, charge: false };
    sim.phase = 'turn';
    emit(sim, { type: 'turn', unit: next.id, wind: sim.wind, n: sim.turnN });
    if (next.ai && PM.AI) PM.AI.begin(sim, next);
  }

  function endTurn(sim) {
    const u = sim.active;
    if (u.alive) u.delay += turnCost(sim, u);
    const alive = teamsAlive(sim);
    if (alive.size <= 1) {
      sim.phase = 'over'; sim.winner = alive.size ? [...alive][0] : -1;
      emit(sim, { type: 'over', winner: sim.winner });
      return;
    }
    startTurn(sim);
  }

  function doFire(sim, power) {
    const u = sim.active, ts = sim.ts;
    power = PM.clampPower(power);
    const def = ts.tele ? TELE_DEF : u.shots[u.shotIdx];
    if (def.special) u.special = 0;
    u.lastPower = power; ts.fired = true;
    sim.charge.on = false; sim.input.charge = false; sim.input.move = 0; sim.input.aim = 0;
    sim.lastShooter = u;
    sim.stats[u.id].shots++;
    sim.phase = 'flight'; sim.hold = 0.15;
    const n = ts.double && !ts.tele ? 2 : 1;
    for (let i = 0; i < n; i++) sim.queue.push({ t: sim.time + i * 0.6, def, power, boost: ts.boost });
    emit(sim, { type: 'fire', unit: u.id, shot: def.id, power, angle: u.angle, facing: u.facing, n });
  }

  Sim.create = function (cfg) {
    const map = PM.MAPS[cfg.map];
    const sim = {
      cfg, map, seed: cfg.seed >>> 0, rng: PM.rng((cfg.seed >>> 0) ^ 0x9e3779b9), terrain: PM.Terrain(map),
      units: [], projs: [], events: [], queue: [], shocks: [], stats: {}, seaY: map.seaY, nextProj: 1, dry: false,
      time: 0, steps: 0, turnN: 0, wind: 0, hold: 0, settleT: 0, restT: 0, winner: null, lastShooter: null,
      turnTime: cfg.turnTime || R.turnTime, phase: 'turn', active: null, ts: null, timer: 0, charge: { on: false, power: 0 }, input: { move: 0, aim: 0, charge: false }
    };
    // Which team starts on the west side. Sides are not equal on every map, so it follows the seed unless the caller fixes it.
    const flip = cfg.flip === undefined ? !!(sim.seed & 1) : !!cfg.flip;
    sim.flip = flip;
    cfg.teams.forEach((team, ti) => {
      team.forEach((spec, k) => {
        const U = PM.UNITS[spec.kind], mods = spec.mods || {};
        const side = flip ? 1 - ti : ti;
        const x = map.spawns[side][k % map.spawns[side].length];
        const y = sim.terrain.groundY(x, map.h - 1, map.h);
        const u = {
          id: sim.units.length, team: ti, kind: spec.kind, name: spec.name || U.name, ai: spec.ai || null, skin: spec.skin || null,
          x, y, vx: 0, vy: 0, grounded: true, sliding: false, slope: 0, peakY: y, facing: side === 0 ? 1 : -1,
          hp: Math.round(U.hp * (mods.hp || 1)), maxHp: Math.round(U.hp * (mods.hp || 1)), armor: mods.armor || 1, atk: mods.atk || 1,
          angle: clamp(45, U.aimMin, U.aimMax), aimMin: U.aimMin, aimMax: U.aimMax, aimSpeed: U.aimSpeed, barrel: U.barrel, radius: U.radius,
          speed: U.speed, fuel: U.fuel * (mods.fuel || 1), fuelMax: U.fuel * (mods.fuel || 1), weight: U.weight, shots: U.shots, shotIdx: 0,
          lastPower: 0, special: 0, shield: 0, delay: 0, alive: true,
          items: (spec.items || []).slice(0, R.itemSlots)
        };
        u.delay = Math.round(U.weight * (0.15 + 0.5 * sim.rng()));
        if (cfg.first === ti && k === 0) u.delay = 0;
        sim.units.push(u);
        sim.stats[u.id] = { dealt: 0, taken: 0, kills: 0, shots: 0 };
      });
    });

    sim.step = function () {
      sim.time += DT; sim.steps++;
      const u = sim.active;
      if (sim.phase === 'turn') {
        if (!u.alive) { sim.phase = 'settle'; sim.settleT = 0; sim.restT = 0; }
        else {
          if (u.ai && PM.AI) PM.AI.drive(sim, u);
          const inp = sim.input;
          if (sim.phase === 'turn') {
            if (sim.charge.on) {
              if (!inp.charge) doFire(sim, sim.charge.power);
              else { sim.charge.power = Math.min(100, sim.charge.power + R.chargeRate * DT); if (sim.charge.power >= 100) doFire(sim, 100); }
            } else {
              if (inp.move) walk(sim, u, inp.move > 0 ? 1 : -1);
              if (inp.aim) u.angle = clamp(u.angle + Math.sign(inp.aim) * u.aimSpeed * DT, u.aimMin, u.aimMax);
              if (inp.charge && u.grounded) { sim.charge.on = true; sim.charge.power = 0; emit(sim, { type: 'charge', unit: u.id }); }
            }
          }
          if (sim.phase === 'turn') {
            sim.timer -= DT;
            if (sim.timer <= 0) {
              if (sim.charge.on) doFire(sim, sim.charge.power);
              else { emit(sim, { type: 'skip', unit: u.id }); sim.phase = 'settle'; sim.settleT = 0; sim.restT = 0; }
            }
          }
        }
      } else if (sim.phase === 'flight') {
        while (sim.queue.length && sim.queue[0].t <= sim.time) {
          const q = sim.queue.shift();
          if (u.alive) launch(sim, u, q.def, u.facing, u.angle, q.power, q.boost * u.atk, u);
        }
        for (let i = 0; i < sim.projs.length; i++) { const p = sim.projs[i]; if (p.alive) stepProj(sim, p); }
        for (let i = sim.projs.length - 1; i >= 0; i--) if (!sim.projs[i].alive) { emit(sim, { type: 'gone', proj: sim.projs[i].id }); sim.projs.splice(i, 1); }
        if (sim.shocks.length) { sim.shocks.sort((a, b) => a.t - b.t); while (sim.shocks.length && sim.shocks[0].t <= sim.time) aftershock(sim, sim.shocks.shift()); }
        sim.hold -= DT;
        if (!sim.projs.length && !sim.queue.length && !sim.shocks.length && sim.hold <= 0) { sim.phase = 'settle'; sim.settleT = 0; sim.restT = 0; }
      } else if (sim.phase === 'settle') {
        sim.settleT += DT;
        let rest = true;
        for (const v of sim.units) if (v.alive && (!v.grounded || v.sliding)) rest = false;
        sim.restT = rest ? sim.restT + DT : 0;
        if ((sim.restT > 0.45 && sim.settleT > 0.8) || sim.settleT > 9) endTurn(sim);
      }
      if (sim.phase !== 'over') for (const v of sim.units) stepUnit(sim, v);
    };

    sim.advance = function (seconds) { const n = Math.round(seconds / DT); for (let i = 0; i < n && sim.phase !== 'over'; i++) sim.step(); };

    sim.selectShot = function (i) {
      const u = sim.active;
      if (sim.phase !== 'turn' || sim.charge.on || !u.shots[i]) return false;
      if (u.shots[i].special && u.special < 100) return false;
      u.shotIdx = i; sim.ts.tele = false;
      emit(sim, { type: 'select', unit: u.id, shot: u.shots[i].id });
      return true;
    };

    sim.useItem = function (slot) {
      const u = sim.active, id = u.items[slot], it = PM.ITEMS[id], ts = sim.ts;
      if (sim.phase !== 'turn' || sim.charge.on || !it) return false;
      if (id === 'tele' && ts.double) return false;
      if (id === 'double' && ts.tele) return false;
      if (id === 'double') ts.double = true;
      else if (id === 'boost') ts.boost = it.mult;
      else if (id === 'heal') heal(u, it.frac);
      else if (id === 'teamheal') { for (const v of sim.units) if (v.alive && v.team === u.team) heal(v, it.frac); }
      else if (id === 'shield') u.shield = it.absorb;
      else if (id === 'calm') sim.wind = 0;
      else if (id === 'tele') ts.tele = true;
      ts.cost += it.delay; ts.items.push(id); u.items[slot] = null;
      emit(sim, { type: 'item', unit: u.id, item: id, slot });
      return true;
    };
    function heal(v, frac) {
      const amt = Math.min(v.maxHp - v.hp, Math.round(v.maxHp * frac));
      v.hp += amt;
      emit(sim, { type: 'heal', unit: v.id, amount: amt, x: v.x, y: v.y + v.radius });
    }

    sim.skip = function () {
      if (sim.phase !== 'turn' || sim.charge.on) return false;
      emit(sim, { type: 'skip', unit: sim.active.id });
      sim.phase = 'settle'; sim.settleT = 0; sim.restT = 0;
      return true;
    };

    // Scripted shot for tools and the AI: fires at once with exact numbers.
    sim.fireNow = function (opts) {
      const u = sim.active;
      if (sim.phase !== 'turn') return false;
      if (opts.facing) u.facing = opts.facing;
      if (opts.angle !== undefined) u.angle = clamp(opts.angle, u.aimMin, u.aimMax);
      if (opts.shot !== undefined && !sim.selectShot(opts.shot)) return false;
      doFire(sim, opts.power);
      return true;
    };

    sim.order = function () {
      const cost = sim.phase === 'turn' ? turnCost(sim, sim.active) : 0;
      return sim.units.filter((v) => v.alive).map((v) => ({ id: v.id, delay: v === sim.active && sim.phase === 'turn' ? null : v.delay, after: v === sim.active ? v.delay + cost : v.delay }))
        .sort((a, b) => (a.delay === null ? -1 : b.delay === null ? 1 : a.delay - b.delay || a.id - b.id));
    };

    sim.currentDef = () => (sim.ts && sim.ts.tele ? TELE_DEF : sim.active.shots[sim.active.shotIdx]);

    startTurn(sim);
    return sim;
  };
})();
