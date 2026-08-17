/*
 * The in-game bot — it plays the whole dive so the loop can be asserted without
 * a human at the keyboard.
 *
 * WHY a bot rather than scripted DOM assertions: the claim worth testing is
 * "the run closes" — loot found, exit reached, extraction affordable. That is a
 * property of the tuning, not of the markup, and only something that actually
 * plays can observe it.
 * ROOT-CAUSE: the sibling game shipped a green test that asserted on numbers the
 * player could never reach, because nothing in the test ever played the level.
 * SEE: commit aff074a "Stop the agent test lying about balance".
 */
(function (global) {
  'use strict';
  const VD = global.VD;
  if (!VD) return;

  const bot = {
    on: false,
    target: null,
    flow: null,
    flowFor: null,
    repath: 0,
    stuck: 0,
    lastPos: { x: 0, y: 0 },
    // the bot's own policy knobs — the test tweaks these to force situations
    policy: { descendUntil: 3, keepLampAbove: 18, bailHp: 0.45, bailFuel: 14 },
  };

  // The whole point of an extraction game is knowing when to stop. A bot that
  // only ever descends proves the descent works and never proves anything else,
  // so it carries the same rule a competent player would.
  function shouldLeave() {
    const S = VD.S, p = S.player;
    if (!p) return true;
    const d = VD.derived();
    if (p.hp < d.hpMax * bot.policy.bailHp) return true;
    if (p.fuel < bot.policy.bailFuel) return true;
    if (S.depth >= bot.policy.descendUntil) return true;
    return false;
  }

  function enable(on) {
    bot.on = !!on;
    if (!on) { VD.input.up = VD.input.down = VD.input.left = VD.input.right = 0; }
  }

  // ------------------------------------------------------------- pathfinding
  // Breadth-first flood from the goal over the tile grid, then walk downhill.
  // The map is 46x46, so a full re-flood is cheap enough to redo on a timer
  // rather than maintaining incremental state.
  function buildFlow(gx, gy) {
    const G = VD.S.grid;
    if (!G) return null;
    const W = G.W, H = G.H;
    const d = new Int32Array(W * H).fill(-1);
    if (gx < 0 || gy < 0 || gx >= W || gy >= H || G.g[gy * W + gx]) {
      // goal is inside a wall — flood from the nearest open neighbour instead
      let best = null, bd = 1e9;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (G.g[y * W + x]) continue;
        const dd = (x - gx) * (x - gx) + (y - gy) * (y - gy);
        if (dd < bd) { bd = dd; best = [x, y]; }
      }
      if (!best) return null;
      gx = best[0]; gy = best[1];
    }
    const q = [gy * W + gx];
    d[gy * W + gx] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = c % W, cy = (c / W) | 0, nd = d[c] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (G.g[ni] || d[ni] !== -1) continue;
        d[ni] = nd; q.push(ni);
      }
    }
    return d;
  }

  function stepDir(flow, x, y) {
    const G = VD.S.grid, T = VD.TUNE.tile, W = G.W, H = G.H;
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return null;
    let best = null, bv = flow[cy * W + cx];
    if (bv < 0) bv = 1e9;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (G.g[ny * W + nx]) continue;
      // no corner-cutting through a diagonal gap
      if (dx && dy && (G.g[cy * W + nx] || G.g[ny * W + cx])) continue;
      const v = flow[ny * W + nx];
      if (v >= 0 && v < bv) { bv = v; best = [dx, dy]; }
    }
    return best;
  }

  // ------------------------------------------------------------------ policy
  function pickTarget() {
    const S = VD.S, p = S.player;
    if (!p) return null;

    const leaving = shouldLeave() && VD.canExtract();

    // a monster close enough to be a real threat outranks loot — but when we are
    // already carrying our way out, only fight what is actually in the way
    let near = null, nd = 1e9;
    for (const m of S.mobs) {
      if (m.hp <= 0) continue;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      if (d < nd) { nd = d; near = m; }
    }
    const engageAt = leaving ? 86 : 150;
    if (near && nd < engageAt) return { kind: 'fight', x: near.x, y: near.y, mob: near };

    // head for the door once the run is worth banking
    if (leaving && S.exit) return { kind: 'exit', x: S.exit.x, y: S.exit.y };

    // loot while there is loot and we can still afford to be greedy
    let bl = null, bd = 1e9;
    for (const l of S.loot) {
      if (l.gone) continue;
      const d = Math.hypot(l.x - p.x, l.y - p.y);
      if (d < bd) { bd = d; bl = l; }
    }
    const needMore = S.carried < VD.exitCost() * 1.6;
    if (bl && (needMore || bd < 220)) return { kind: 'loot', x: bl.x, y: bl.y };

    if (S.exit) return { kind: 'exit', x: S.exit.x, y: S.exit.y };
    return null;
  }

  function think(dt) {
    const S = VD.S, IN = VD.input;

    // out-of-dive phases: drive the decision, not the joystick
    if (S.phase === 'exit') {
      if (shouldLeave() && VD.canExtract()) VD.extract();
      else VD.descend();               // healthy, or cannot afford the way out
      return;
    }
    if (S.phase !== 'dive' || !S.player) return;

    const p = S.player;

    // lamp policy: burn bright while there is fuel to burn, then go dark
    if (p.fuel > bot.policy.keepLampAbove) p.lamp = 2;
    else if (p.fuel > 4) p.lamp = 1;
    else p.lamp = 0;

    const tgt = pickTarget();
    if (!tgt) { IN.up = IN.down = IN.left = IN.right = 0; return; }
    bot.target = tgt;

    // fight: face it, close to range, swing
    if (tgt.kind === 'fight') {
      const m = tgt.mob;
      const d = Math.hypot(m.x - p.x, m.y - p.y);
      p.face = Math.atan2(m.y - p.y, m.x - p.x);
      IN.aimed = false;
      if (d > VD.TUNE.AttackRange * 0.72) {
        steerTo(m.x, m.y);
      } else {
        IN.up = IN.down = IN.left = IN.right = 0;
        IN.attack = true;
      }
      // dodge out of a losing trade
      if (p.hp < VD.derived().hpMax * 0.35 && p.stamina > VD.TUNE.DodgeCost) IN.dodge = true;
      return;
    }

    steerTo(tgt.x, tgt.y);
    IN.aimed = false;
    p.face = Math.atan2(tgt.y - p.y, tgt.x - p.x);
  }

  function steerTo(tx, ty) {
    const S = VD.S, p = S.player, IN = VD.input, T = VD.TUNE.tile;
    const gx = Math.floor(tx / T), gy = Math.floor(ty / T);
    const key = gx + ':' + gy;

    bot.repath -= 1;
    if (bot.flowFor !== key || bot.repath <= 0 || !bot.flow) {
      bot.flow = buildFlow(gx, gy);
      bot.flowFor = key;
      bot.repath = 30;
    }

    let dx = 0, dy = 0;
    // straight line when it is actually clear — the grid path zig-zags otherwise
    if (VD.losClear(p.x, p.y, tx, ty)) {
      dx = tx - p.x; dy = ty - p.y;
    } else if (bot.flow) {
      const s = stepDir(bot.flow, p.x, p.y);
      if (s) { dx = s[0]; dy = s[1]; }
    }

    // unstick: if we have not moved, shove sideways for a moment
    if (Math.abs(p.x - bot.lastPos.x) < 0.4 && Math.abs(p.y - bot.lastPos.y) < 0.4) {
      bot.stuck += 1;
    } else bot.stuck = 0;
    bot.lastPos.x = p.x; bot.lastPos.y = p.y;
    if (bot.stuck > 20) {
      const a = (bot.stuck * 0.7);
      dx = Math.cos(a); dy = Math.sin(a);
      if (bot.stuck > 60) { bot.stuck = 0; bot.flow = null; }
    }

    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
    IN.right = dx > 0.35 ? 1 : 0; IN.left = dx < -0.35 ? 1 : 0;
    IN.down  = dy > 0.35 ? 1 : 0; IN.up   = dy < -0.35 ? 1 : 0;
  }

  VD.bot = { enable, think, get on() { return bot.on; }, state: bot, buildFlow };
})(typeof window !== 'undefined' ? window : globalThis);
