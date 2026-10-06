// Bot: máy trạng thái theo CaseBot của game gốc (Player.cs:16-29, gameplay.md 2.4). Nhận biết mỗi 0.25 s, đường đi bằng trường chi phí Dijkstra theo ô.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const MU = TT.mapUtil, KIND = TT.KIND, C = TT.C;

  const STATES = ['grass', 'gate', 'flee', 'save', 'scan', 'chase', 'oldPos', 'wander'];
  const DETECT = 0.25, RANGE = 9, SAVE_RANGE = RANGE + 7, SCAN_IDLE = 10, ATTACK_REACH = 1.05, TRANSFORM_END = C.SEEK_DISGUISE + C.SEEK_TRANSFORM;
  const REVEAL_CHASE = 30, FLEE_SPAN = 12, LAST_SEEN_KEEP = 6;
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

  // ---------------------------------------------------------------- trường chi phí tới một ô đích
  const fieldCache = new Map();
  function walkCost(map, tx, ty, hider) {
    const k = MU.kindAt(map, tx, ty);
    return k === KIND.FREE ? 1 : k === KIND.TABLE && hider ? 4 : 0;   // người trốn đi xuyên bàn bằng cách nhảy
  }

  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) {
        let l = 2 * i + 1, r = l + 1, s = i;
        if (l < k.length && k[l] < k[s]) s = l;
        if (r < k.length && k[r] < k[s]) s = r;
        if (s === i) break;
        [k[s], k[i]] = [k[i], k[s]]; [v[s], v[i]] = [v[i], v[s]]; i = s;
      }
    }
    return top;
  };

  function buildField(map, goalIdx, hider) {
    const dist = new Float32Array(map.W * map.H).fill(Infinity), h = new Heap();
    dist[goalIdx] = 0; h.push(0, goalIdx);
    while (h.k.length) {
      const i = h.pop(), x = i % map.W, y = (i / map.W) | 0, d = dist[i];
      for (const [dx, dy, c] of NB) {
        const nx = x + dx, ny = y + dy;
        const w = walkCost(map, nx, ny, hider);
        if (!w) continue;
        if (dx && dy && (!walkCost(map, x + dx, y, false) || !walkCost(map, x, y + dy, false))) continue;   // không cắt góc
        const j = ny * map.W + nx, nd = d + c * (dx && dy ? 1 : w);
        if (nd < dist[j]) { dist[j] = nd; h.push(nd, j); }
      }
    }
    return dist;
  }

  function fieldFor(map, tx, ty, hider) {
    const key = (hider ? 'h' : 's') + (ty * map.W + tx);
    let f = fieldCache.get(key);
    if (f && f.map === map) return f.dist;
    if (fieldCache.size > 48) fieldCache.delete(fieldCache.keys().next().value);
    f = { map, dist: buildField(map, ty * map.W + tx, hider) };
    fieldCache.set(key, f);
    return f.dist;
  }

  // hướng đi đơn vị từ a tới đích (x,y); null nếu không có đường
  function pathDir(m, a, x, y) {
    const map = m.map, hider = a.role === 'hide';
    const g = MU.nearestFree(map, x, y, true), gx = Math.floor(g.x), gy = Math.floor(g.y);
    const cx = Math.floor(a.x), cy = Math.floor(a.y);
    let tx = g.x, ty = g.y;
    if (cx !== gx || cy !== gy) {
      const f = fieldFor(map, gx, gy, hider);
      let best = f[cy * map.W + cx], bx = null, by = null;
      for (const [dx, dy] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (!walkCost(map, nx, ny, hider)) continue;
        if (dx && dy && (!walkCost(map, cx + dx, cy, false) || !walkCost(map, cx, cy + dy, false))) continue;
        const d = f[ny * map.W + nx];
        if (d < best) { best = d; bx = nx; by = ny; }
      }
      if (bx === null) return null;
      tx = bx + 0.5; ty = by + 0.5;
    }
    const dx = tx - a.x, dy = ty - a.y, l = Math.hypot(dx, dy);
    return l < 0.05 ? { ux: 0, uy: 0 } : { ux: dx / l, uy: dy / l };
  }

  // ---------------------------------------------------------------- tri giác
  function lists(map) {
    if (map.botLists) return map.botLists;
    const grass = [], tables = [];
    for (let i = 0; i < map.W * map.H; i++) {
      if (!map.reach[i]) continue;
      const p = { x: (i % map.W) + 0.5, y: ((i / map.W) | 0) + 0.5 };
      if (map.grass[i]) grass.push(p);
      else if (map.kind[i] === KIND.TABLE) tables.push(p);
    }
    return (map.botLists = { grass, tables });
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const revealed = (m, x) => TT.hasEffect(x, 'reveal', m.now);

  // người bot nhìn thấy: ngoài tầm 9 hoặc trốn trong cỏ (trừ khi kề sát/bị quét) hoặc tàng hình thì bỏ qua (Player.cs:182-205)
  function seenBy(m, a, x) {
    if (x.life !== 'alive' || x.role === a.role) return false;
    if (a.role === 'hide' && x.look !== 'seek') return false;   // người tìm chưa biến hình trông như người trốn
    if (revealed(m, x)) return dist(a, x) <= (a.role === 'seek' ? REVEAL_CHASE : RANGE);
    if (TT.hasEffect(x, 'invisible', m.now)) return false;
    const d = dist(a, x);
    return d <= RANGE && (!x.inGrass || d <= C.GRASS_REVEAL);
  }

  function nearest(list, a) {
    let best = null, bd = Infinity;
    for (const x of list) { const d = dist(a, x); if (d < bd) { bd = d; best = x; } }
    return best;
  }

  // ---------------------------------------------------------------- chọn đích
  const inZone = (z, p, k) => Math.hypot(p.x - z.x, p.y - z.y) <= z.r * (k || 1);
  function zoneGrass(m, a, nearOnly) {
    const z = m.zone.next || m.zone.cur, g = lists(m.map).grass.filter(p => inZone(z, p, 0.9));
    if (!g.length) return { x: z.x, y: z.y };
    if (nearOnly) return nearest(g, a);
    return g[Math.floor(m.rng() * g.length)];
  }

  // chạy trốn: bàn ở hướng >100° so với kẻ đuổi (nhảy qua), không thì bụi cỏ hướng đó (Player.cs:710-738, 787-815)
  function fleeDest(m, a, th) {
    const L = lists(m.map), tx = th.x - a.x, ty = th.y - a.y, tl = Math.hypot(tx, ty) || 1;
    const away = p => { const dx = p.x - a.x, dy = p.y - a.y, dl = Math.hypot(dx, dy) || 1; return Math.acos(Math.max(-1, Math.min(1, (dx * tx + dy * ty) / (dl * tl)))) > 100 * Math.PI / 180; };
    let best = null, bd = Infinity;
    for (const p of L.tables) {
      const d = dist(a, p);
      if (d > FLEE_SPAN || d >= bd || !away(p)) continue;
      const ux = p.x - th.x, uy = p.y - th.y, ul = Math.hypot(ux, uy) || 1;
      best = MU.nearestFree(m.map, p.x + ux / ul * 1.8, p.y + uy / ul * 1.8, true); bd = d;
    }
    if (best) return best;
    for (const p of L.grass) {
      const d = dist(a, p);
      if (d <= FLEE_SPAN && d < bd && away(p) && dist(p, th) > dist(a, th)) { best = p; bd = d; }
    }
    return best || MU.nearestFree(m.map, a.x - tx / tl * 8, a.y - ty / tl * 8, true);
  }

  // ---------------------------------------------------------------- bộ não
  function newAi(m) { return { state: 'grass', dest: null, targetId: null, thinkT: m.rng() * DETECT, scanUntil: 0, scanSeen: 0, last: null, stuck: { x: 0, y: 0, t: 0 } }; }
  function go(ai, state, dest) { ai.state = state; ai.dest = dest; }

  function thinkHider(m, a, ai) {
    const threats = m.actors.filter(x => seenBy(m, a, x)), th = nearest(threats, a);
    const downed = m.actors.filter(x => x.role === 'hide' && x.life === 'downed' && dist(a, x) <= SAVE_RANGE && inZone(m.zone.cur, x, 1));
    if (m.scan.until > m.now && ai.scanSeen !== m.scan.until) { ai.scanSeen = m.scan.until; if (!th) ai.scanUntil = m.now + SCAN_IDLE; }
    if (m.t < TRANSFORM_END) return !ai.dest || ai.state !== 'grass' ? go(ai, 'grass', zoneGrass(m, a, false)) : undefined;
    if (m.gate.state === 'open') return go(ai, 'gate', m.gate);
    if (th) return go(ai, 'flee', fleeDest(m, a, th));
    const d0 = nearest(downed, a);
    if (d0) return go(ai, 'save', d0);
    if (ai.scanUntil > m.now) return go(ai, 'scan', null);
    if (TT.outsideZone(m, a)) return go(ai, 'grass', zoneGrass(m, a, true));
    if (!a.inGrass) return go(ai, 'grass', zoneGrass(m, a, true));
    return go(ai, 'grass', null);
  }

  function thinkSeeker(m, a, ai) {
    if (m.t < TRANSFORM_END) return !ai.dest || ai.state !== 'grass' ? go(ai, 'grass', zoneGrass(m, a, false)) : undefined;
    let prey = nearest(m.actors.filter(x => seenBy(m, a, x)), a);
    const dec = TT.decoyFor && TT.decoyFor(m, a, RANGE);   // búp bê mồi nhử của kỹ năng trông như người trốn
    if (dec && (!prey || dist(a, dec) < dist(a, prey))) prey = dec;
    if (prey) { ai.last = { x: prey.x, y: prey.y, until: m.now + LAST_SEEN_KEEP }; ai.targetId = prey.id; return go(ai, 'chase', prey); }
    ai.targetId = null;
    if (ai.last && ai.last.until > m.now && dist(a, ai.last) > 0.6) return go(ai, 'oldPos', ai.last);
    ai.last = null;
    if (m.gate.state === 'open') return go(ai, 'gate', m.gate);
    if (ai.state === 'wander' && ai.dest && dist(a, ai.dest) > 0.8 && inZone(m.zone.cur, ai.dest, 1)) return;
    return go(ai, 'wander', zoneGrass(m, a, false));
  }

  function think(m, a) {
    const ai = a.ai;
    ai.thinkT = DETECT;
    (a.role === 'hide' ? thinkHider : thinkSeeker)(m, a, ai);
  }

  // hướng đi mỗi nhịp theo trạng thái; 'scan' và 'grass' khi đã ở cỏ thì đứng yên
  function steer(m, a, ai) {
    const d = ai.dest;
    if (!d) return { ux: 0, uy: 0 };
    if (ai.state === 'save' && dist(a, d) <= 0.9) return { ux: 0, uy: 0 };    // đứng yên 3 s trong vòng cứu
    if (dist(a, d) < 0.3) { if (ai.state === 'grass' || ai.state === 'wander') ai.dest = null; return { ux: 0, uy: 0 }; }
    return pathDir(m, a, d.x, d.y) || { ux: 0, uy: 0 };
  }

  function unstick(m, a, ai) {
    const s = ai.stuck;
    if (m.now - s.t < 1) return;
    if (ai.dest && Math.hypot(a.x - s.x, a.y - s.y) < 0.15 && TT.speedOf(a) > 0 && !a.motion) ai.dest = null;
    s.x = a.x; s.y = a.y; s.t = m.now;
  }

  TT.botIntent = function (m, a, dt) {
    const ai = a.ai || (a.ai = newAi(m));
    if (m.phase !== 'playing') return { ux: 0, uy: 0 };
    if ((ai.thinkT -= dt) <= 0) think(m, a);
    unstick(m, a, ai);
    if (TT.botSkill) TT.botSkill(m, a, ai);
    if (a.role === 'seek' && ai.state === 'chase' && ai.dest && ai.dest.life === 'alive' && dist(a, ai.dest) <= ATTACK_REACH && TT.canAttack(a))
      TT.attack(m, a, Math.atan2(ai.dest.y - a.y, ai.dest.x - a.x));
    return steer(m, a, ai);
  };
  TT.BOT_STATES = STATES;
})();
