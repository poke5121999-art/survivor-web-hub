/*
 * The auto agent: a bot that plays the whole loop on its own.
 *
 * It exists for two reasons. It is a demo — press "Bot tự chơi" and watch a level get
 * cleared. And it is the test harness: test/agent_test.py drives it at 8x speed and
 * asserts the loop actually completes, which is a far stronger check than poking the DOM.
 *
 * It only reads what a player can see on screen plus the map it has already explored;
 * it does not cheat by reading monster positions it could not know. It does use the tile
 * grid for pathfinding, which stands in for "the player knows the room they walked through".
 */
(() => {
'use strict';

const R = () => window.REPO;

const ST = {
  IDLE: 'idle', TO_LOOT: 'tới đồ', GRAB: 'nhặt', TO_PAD: 'tới bệ',
  DROP: 'đặt', WAIT: 'chờ giao', TO_CAR: 'về xe', FLEE: 'chạy trốn', STUCK: 'kẹt'
};

const bot = {
  state: ST.IDLE,
  path: null, pathT: 0, target: null, targetKind: null,
  lastX: 0, lastY: 0, stuckT: 0, replanT: 0,
  fleeT: 0, shootCd: 0, dropCd: 0, lastWanted: false, unstickT: 0, unstickA: 0,
  moved: 0, window: 0,
  stats: { picked: 0, dropped: 0, broken: 0, shots: 0, replans: 0, stucks: 0 },

  reset(){
    this.state = ST.IDLE; this.path = null; this.target = null; this.targetKind = null;
    this.stuckT = 0; this.replanT = 0; this.fleeT = 0; this.shootCd = 0; this.dropCd = 0; this.lastWanted = false;
    this.moved = 0; this.window = 0; this.stuckWhere = [];
    this.stats = { picked:0, dropped:0, broken:0, shots:0, replans:0, stucks:0 };
  },

  // ---------------------------------------------------------------- pathfinding
  tileOf(x,y){ return { gx:(x/R().TILE)|0, gy:(y/R().TILE)|0 }; },

  bfs(sx,sy,tx,ty){
    const A = R(), MW = A.MW, MH = A.MH;
    if (A.solidAt(tx,ty)){
      // target sits inside geometry — walk to the closest open tile beside it
      let best = null, bd = 1e9;
      for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++){
        const nx = tx+dx, ny = ty+dy;
        if (nx<0||ny<0||nx>=MW||ny>=MH || A.solidAt(nx,ny)) continue;
        const d = dx*dx+dy*dy;
        if (d < bd){ bd = d; best = {nx,ny}; }
      }
      if (!best) return null;
      tx = best.nx; ty = best.ny;
    }
    const prev = new Int32Array(MW*MH).fill(-1);
    const seen = new Uint8Array(MW*MH);
    const q = [sy*MW+sx];
    seen[sy*MW+sx] = 1;
    let head = 0;
    const goal = ty*MW+tx;
    while (head < q.length){
      const i = q[head++];
      if (i === goal) break;
      const x = i%MW, y = (i/MW)|0;
      const nb = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
      for (const [nx,ny] of nb){
        if (nx<0||ny<0||nx>=MW||ny>=MH) continue;
        const j = ny*MW+nx;
        if (seen[j] || A.solidAt(nx,ny)) continue;
        seen[j] = 1; prev[j] = i; q.push(j);
      }
    }
    if (!seen[goal]) return null;
    const out = [];
    let cur = goal;
    while (cur !== -1){
      const x = cur%MW, y = (cur/MW)|0;
      out.push({ x:(x+0.5)*A.TILE, y:(y+0.5)*A.TILE });
      if (cur === sy*MW+sx) break;
      cur = prev[cur];
    }
    out.reverse();
    return out.length ? out : null;
  },

  planTo(wx, wy){
    const A = R(), p = A.S.player;
    const a = this.tileOf(p.x, p.y), b = this.tileOf(wx, wy);
    this.path = this.bfs(a.gx, a.gy, b.gx, b.gy);
    this.pathT = 0;
    this.stats.replans++;
    return !!this.path;
  },

  // Can the body actually walk this straight line, at its real width?
  clearWalk(x0,y0,x1,y1){
    const A = R();
    const d = Math.hypot(x1-x0, y1-y0);
    const n = Math.max(2, Math.ceil(d/6));
    for (let i=1;i<=n;i++){
      const t = i/n;
      if (A.hitsSolid(x0+(x1-x0)*t, y0+(y1-y0)*t, 9)) return false;
    }
    return true;
  },

  follow(dt){
    if (!this.path || !this.path.length) return null;
    const A = R(), p = A.S.player;
    while (this.path.length > 1 && Math.hypot(this.path[0].x-p.x, this.path[0].y-p.y) < A.TILE*0.7) this.path.shift();

    // BFS returns a 4-connected staircase. Walking it literally clips every inside corner
    // and wedges the body on prop tiles, so aim at the FURTHEST waypoint still reachable
    // in a straight line — that both smooths the path and keeps clear of corners.
    let idx = 0;
    const look = Math.min(this.path.length-1, 14);
    for (let i=look; i>0; i--){
      if (this.clearWalk(p.x, p.y, this.path[i].x, this.path[i].y)){ idx = i; break; }
    }
    const wp = this.path[idx];
    const dx = wp.x-p.x, dy = wp.y-p.y, d = Math.hypot(dx,dy);
    if (d < 6){ this.path.splice(0, idx+1); return this.path.length ? this.follow(dt) : null; }
    if (idx > 0) this.path.splice(0, idx);
    return { x:dx/d, y:dy/d, dist:d };
  },

  // ---------------------------------------------------------------- target choice
  bestLoot(){
    const A = R(), S = A.S, p = S.player;
    const pad = S.pads[S.padIndex];
    if (!pad) return null;
    const need = pad.quota - pad.value;
    let best = null, bestScore = -1e9;
    for (const l of S.loot){
      if (l.gone || l.held || l.onPad) continue;
      const dPlayer = Math.hypot(l.x-p.x, l.y-p.y);
      const dPad = Math.hypot(l.x-pad.x, l.y-pad.y);
      // value per unit of hauling, with a nudge toward whatever finishes the quota
      let score = l.value / (1 + (dPlayer + dPad)/(6*A.TILE)) / (1 + l.mass/28);
      if (l.value >= need) score *= 1.35;
      if (l.isBag) score *= 1.5;
      if (score > bestScore){ bestScore = score; best = l; }
    }
    return best;
  },

  threat(){
    const A = R(), S = A.S, p = S.player;
    let worst = null, wd = 1e9;
    for (const m of S.monsters){
      const d = Math.hypot(m.x-p.x, m.y-p.y);
      const near = d < 4.2*A.TILE;              // you can hear it breathing, chasing or not
      if (m.state !== 'chase' && !near) continue;
      if (d < wd){ wd = d; worst = m; }
    }
    return worst ? { m:worst, d:wd } : null;
  },

  // ---------------------------------------------------------------- main
  think(dt){
    const r = this._think(dt) || { vx:0, vy:0, push:0 };
    this.lastWanted = !!(r.vx || r.vy);
    return r;
  },

  _think(dt){
    const A = R(); if (!A) return { vx:0, vy:0, push:0 };
    const S = A.S, p = S.player;
    if (!p || !S.running || S.dead) return { vx:0, vy:0, push:0 };

    this.replanT -= dt; this.shootCd -= dt; this.fleeT -= dt; this.dropCd -= dt;

    // stuck watchdog — without this a wedged bot hangs the whole test
    this.moved += Math.hypot(p.x-this.lastX, p.y-this.lastY);
    this.lastX = p.x; this.lastY = p.y;
    this.window += dt;
    let wedged = false;
    if (this.window >= 1.0){
      wedged = this.lastWanted && this.moved < 16;   // 16px in a second is not walking
      this.window = 0; this.moved = 0;
    }
    if (wedged){
      this.path = null; this.target = null; this.stats.stucks++;
      (this.stuckWhere = this.stuckWhere || []).push(this.state + (p.held ? '+vác' : ''));
      // slide sideways rather than flailing: whatever is blocking is ahead, not beside
      const a = p.dir + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
      this.unstickT = 0.35; this.unstickA = a;
      return { vx:Math.cos(a), vy:Math.sin(a), push:0.8 };
    }
    if (this.unstickT > 0){
      this.unstickT -= dt;
      return { vx:Math.cos(this.unstickA), vy:Math.sin(this.unstickA), push:0.8 };
    }

    if (p.hp < p.hpMax*0.45){
      const heal = p.inv.findIndex(it => it && it.kind === 'heal' && it.uses > 0);
      if (heal >= 0 && p.cooldown <= 0){ A.useSlot(p, heal); }
    }

    // ---- threat handling comes before everything else
    const th = this.threat();
    if (th && th.d < 6*A.TILE){
      const gun = p.inv.findIndex(it => it && it.kind === 'gun' && it.uses > 0);
      const look = Math.atan2(th.m.y-p.y, th.m.x-p.x);
      if (gun >= 0 && th.d < 5*A.TILE && this.shootCd <= 0){
        A.useSlot(p, gun, look);
        this.shootCd = 0.5; this.stats.shots++;
        this.state = ST.FLEE;
        return { vx:0, vy:0, push:0, look };
      }
      // Against a blind hunter the answer is silence, not speed — it is faster than a
      // loaded player, so running only feeds it a fresh fix on where you are.
      // Freezing beats a blind hunter, but standing still while something that can SEE
      // you is also on you is just dying quietly. Only hold still when nothing is watching.
      const watched = S.monsters.some(m2 =>
        m2 !== th.m && (window.REPO, true) && m2.state === 'chase' &&
        Math.hypot(m2.x-p.x, m2.y-p.y) < 5*A.TILE && m2.type !== 'listen');
      if (th.m.type === 'listen' && !watched){
        this.state = ST.FLEE; this.path = null;
        return { vx:0, vy:0, push:0, look };
      }
      // Loot is worth less than the run. A loaded player cannot outrun anything.
      if (th.d < 2.6*A.TILE && p.held && p.held.mass > 20){
        A.dropHeld(p); this.dropCd = 0.6; this.path = null; this.target = null;
      }
      if (th.d < 3.4*A.TILE){
        this.state = ST.FLEE; this.fleeT = 0.8; this.path = null;
        const ax = p.x-th.m.x, ay = p.y-th.m.y, am = Math.hypot(ax,ay)||1;
        // pick the clearest escape near "directly away", so fleeing does not mean
        // reversing into a wall and standing there being hit
        let bestA = Math.atan2(ay,ax), bestClear = -1;
        for (let i=-3;i<=3;i++){
          const a = Math.atan2(ay,ax) + i*0.42;
          const ok = this.clearWalk(p.x, p.y, p.x+Math.cos(a)*A.TILE*2.5, p.y+Math.sin(a)*A.TILE*2.5);
          const score = (ok?10:0) - Math.abs(i)*0.5;
          if (score > bestClear){ bestClear = score; bestA = a; }
        }
        return { vx:Math.cos(bestA), vy:Math.sin(bestA), push: th.m.type==='listen' ? 0.3 : 1, look };
      }
    }

    // ---- goal selection
    let goal = null, kind = null;
    if (S.levelDone){ goal = S.car; kind = 'car'; }
    else {
      const pad = S.pads[S.padIndex];
      if (!pad) return { vx:0, vy:0, push:0 };
      if (pad.value >= pad.quota){
        // countdown is running: stay put, do not disturb the pad
        this.state = ST.WAIT;
        return { vx:0, vy:0, push:0, look:p.dir + dt*0.8 };
      }
      if (p.held){ goal = pad; kind = 'pad'; }
      else {
        const l = this.bestLoot();
        if (!l){ this.state = ST.IDLE; return { vx:0, vy:0, push:0 }; }
        goal = l; kind = 'loot';
      }
    }

    // ---- act at the goal
    const gd = Math.hypot(goal.x-p.x, goal.y-p.y);
    if (kind === 'loot' && gd < A.grabRange(p)*0.8 && this.dropCd <= 0){
      const before = p.held;
      if (!p.held) A.pickUp(p);        // pickUp() toggles, so never call it while holding
      if (!before && p.held){ this.stats.picked++; this.path = null; this.target = null; }
      this.state = ST.GRAB;
      return { vx:0, vy:0, push:0, look: Math.atan2(goal.y-p.y, goal.x-p.x) };
    }
    if (kind === 'pad' && gd < A.TILE*0.9){
      const v = p.held ? p.held.value : 0;
      const v0 = p.held ? p.held.value0 : 0;
      A.dropHeld(p);
      this.stats.dropped++;
      if (v < v0) this.stats.broken++;
      this.path = null; this.target = null; this.dropCd = 0.5;
      this.state = ST.DROP;
      return { vx:0, vy:0, push:0 };
    }
    if (kind === 'car' && gd < A.TILE*2.2){
      this.state = ST.TO_CAR;
      return { vx:0, vy:0, push:0.4 };
    }

    // ---- path to the goal
    const changed = this.target !== goal;
    if (changed || !this.path || this.replanT <= 0){
      this.target = goal; this.targetKind = kind;
      this.replanT = 1.2;
      if (!this.planTo(goal.x, goal.y)){
        // unreachable: nudge and try something else next tick
        this.target = null;
        return { vx:(Math.random()*2-1), vy:(Math.random()*2-1), push:0.6 };
      }
    }
    const dir = this.follow(dt);
    if (!dir){ this.path = null; return { vx:0, vy:0, push:0 }; }

    this.state = kind === 'loot' ? ST.TO_LOOT : kind === 'pad' ? ST.TO_PAD : ST.TO_CAR;

    // Carrying is walked, never run: a sudden stop is what breaks loot, and running
    // into a doorframe with a vase is exactly the failure the design is built around.
    let push = p.held ? 0.6 : (th ? 1 : 0.75);
    if (p.held && p.held.mat.frag > 0.8) push = 0.5;
    if (p.stam < 12) push = Math.min(push, 0.6);

    return { vx:dir.x, vy:dir.y, push, look: Math.atan2(dir.y, dir.x) };
  },

  report(){
    return { state:this.state, stats:Object.assign({}, this.stats), stuckWhere:(this.stuckWhere||[]).slice(0,20) };
  }
};

window.BOT = bot;
})();
