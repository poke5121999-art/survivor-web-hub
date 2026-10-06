// Trận là máy trạng thái: intro -> countdown -> playing -> ending (DESIGN.md, gameplay.md 1.2). Mốc con của playing đều theo m.t, không cờ.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const HM = window.HS_MAP, MU = TT.mapUtil, C = TT.C;

  const PHASES = { intro: { dur: 3, next: 'countdown' }, countdown: { dur: 4 + 4, next: 'playing' }, playing: {}, ending: {} };   // 1.2
  const CLOCK = 150, GATE_COUNT = 15, GATE_WATCH = 3;                  // 1.4
  const SCAN = { period: 45, ping: 2, afterGate: 30, minClock: 45 };   // 1.4
  const ZONE = { steps: 5, shrink: 34 };                               // 5.2
  const BOX = { max: 20, respawn: 10, radius: 0.8 };                   // 5.3
  const BOMB = { waves: 5, gap: 1, life: 15, ring: 6, radius: 0.6 };   // 5.4
  const HIDE_HEROES = ['assassin', 'priest', 'ranger', 'trapmaster'], SEEK_HEROES = ['robot', 'viking', 'doctor', 'vampire'];
  const ROLE_COUNT = { hide: 7, seek: 3 };                             // 2.1: 10 người
  const GATE_RADIUS = 1.5;

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  function shuffle(rng, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  const lerp = (a, b, u) => a + (b - a) * u;

  // ---------------------------------------------------------------- dựng trận
  // 2.2: túi vai, người chơi bốc trước. humanRole ép vai cho người chơi (kiểm thử, chọn vai sau này).
  function drawRoles(rng, humanRole) {
    const bag = [];
    for (const r of ['hide', 'seek']) for (let i = 0; i < ROLE_COUNT[r]; i++) bag.push(r);
    shuffle(rng, bag);
    if (humanRole) bag.splice(bag.indexOf(humanRole), 1);
    return [humanRole || bag.shift()].concat(bag);
  }

  function makeActors(rng, roles, map) {
    const spots = shuffle(rng, map.hidePos.slice());
    return roles.map((role, i) => {
      const hero = pick(rng, role === 'hide' ? HIDE_HEROES : SEEK_HEROES);
      const a = TT.makeActor(i, i > 0, i === 0 ? 'Bạn' : 'Bot ' + i, hero, role, role === 'hide' ? hero : pick(rng, HIDE_HEROES));
      const s = spots[i % spots.length];
      a.x = s.x; a.y = s.y;
      return a;
    });
  }

  function makeItems(rng, map) {
    const items = [];
    for (const p of map.boxPoints) {
      if (items.length >= BOX.max) break;
      if (Math.floor(rng() * 3) !== 1) continue;
      items.push({ x: p.x, y: p.y, kind: rng() < 0.5 ? 'buff' : 'debuff', readyAt: 0 });
    }
    return items;
  }

  function makeZone(rng, map) {
    const f = HM.zone.first[0], l = pick(rng, HM.zone.last);
    const w = c => ({ x: c.x - map.ox, y: c.y - map.oy, r: c.r });
    const a = w(f), b = w(l);
    const circles = [];
    for (let i = 0; i < ZONE.steps; i++) { const u = i / (ZONE.steps - 1); circles.push({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), r: lerp(a.r, b.r, u) }); }
    return { circles, step: 0, cur: Object.assign({}, circles[0]), next: circles[1] };
  }

  TT.createMatch = function (opts) {
    const rng = mulberry(opts.seed);
    const map = TT.buildMap(rng);
    const roles = drawRoles(rng, opts.humanRole);
    const m = {
      seed: opts.seed, rng, map, actors: makeActors(rng, roles, map), phase: 'intro', phaseT: 0, now: 0, t: 0,
      zone: makeZone(rng, map), gate: { x: 0, y: 0, state: 'closed', count: 0 }, scan: { next: SCAN.period, until: 0 },
      items: makeItems(rng, map), bombs: [], bombWaves: [], puddles: [], prints: [], result: null,
      intent: { ux: 0, uy: 0 }, attackReq: null
    };
    const g = MU.nearestFree(map, m.zone.circles[ZONE.steps - 1].x, m.zone.circles[ZONE.steps - 1].y, true);
    m.gate.x = g.x; m.gate.y = g.y;
    m.human = m.actors[0];
    TT.emit('phase', { phase: 'intro' });
    return m;
  };

  TT.clockOf = m => Math.max(0, CLOCK - m.t);

  function setPhase(m, name) {
    m.phase = name; m.phaseT = 0;
    if (name === 'playing') beginPlaying(m);
    TT.emit('phase', { phase: name });
  }

  function beginPlaying(m) {
    m.t = 0;
    for (const a of m.actors) if (a.role === 'seek') TT.addEffect(a, 'freeze', m.now + C.SEEK_DISGUISE + C.SEEK_TRANSFORM);   // 1.3
  }

  // ---------------------------------------------------------------- mốc con của playing
  function updateForms(m) {
    for (const a of m.actors) {
      if (a.role !== 'seek') continue;
      if (a.look === 'hide' && m.t >= C.SEEK_DISGUISE) { a.look = 'seek'; TT.emit('transform', { id: a.id }); }
      if (a.form === 'hide' && m.t >= C.SEEK_DISGUISE + C.SEEK_TRANSFORM) a.form = 'seek';
    }
  }

  function updateGate(m, dt) {
    const g = m.gate;
    if (g.state === 'closed' && TT.clockOf(m) <= GATE_COUNT) { g.state = 'counting'; g.count = GATE_COUNT; }
    if (g.state === 'counting' && (g.count -= dt) <= 0) {
      g.state = 'open';
      for (const a of m.actors) TT.addEffect(a, 'gateWatch', m.now + GATE_WATCH);   // 1.4: cảnh mở cổng 3 s, ai cũng đứng yên
      m.scan.next = m.t + SCAN.afterGate;
      TT.emit('gateOpen', { x: g.x, y: g.y });
    }
  }

  function updateScan(m) {
    if (m.t < m.scan.next) return;
    m.scan.until = m.now + SCAN.ping;
    for (const a of m.actors) if (a.life !== 'dead') TT.addEffect(a, 'reveal', m.scan.until);
    const after = m.gate.state === 'open' ? SCAN.afterGate : SCAN.period;
    m.scan.next = m.gate.state !== 'open' && CLOCK - (m.t + after) <= SCAN.minClock ? Infinity : m.t + after;   // 1.4: giữa clock 45 và lúc mở cổng không quét
    TT.emit('scan', { until: m.scan.until });
  }

  function updateZone(m) {
    const z = m.zone, k = Math.min(ZONE.steps - 1, Math.floor(m.t / ZONE.shrink));
    if (k < ZONE.steps - 1) {
      const u = (m.t - k * ZONE.shrink) / ZONE.shrink, a = z.circles[k], b = z.circles[k + 1];
      z.cur = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), r: lerp(a.r, b.r, u) }; z.next = b;
    } else { z.cur = Object.assign({}, z.circles[k]); z.next = null; }
    if (k !== z.step) { z.step = k; TT.emit('zone', { step: k }); }
  }
  TT.outsideZone = (m, a) => Math.hypot(a.x - m.zone.cur.x, a.y - m.zone.cur.y) > m.zone.cur.r;

  // 4.4: hider mất 1 máu/giây ngoài vùng; người tìm +30% tốc độ
  function updateZoneEffects(m, dt) {
    const watching = m.actors.some(a => TT.hasEffect(a, 'gateWatch', m.now));
    for (const a of m.actors) {
      const out = TT.outsideZone(m, a);
      if (a.role === 'seek' && a.form === 'seek') {
        const has = a.effects.some(e => e.kind === 'zoneBoost');
        if (out && !has) TT.addEffect(a, 'zoneBoost', Infinity, 1.3);
        else if (!out && has) TT.removeEffect(a, 'zoneBoost');
      }
      if (a.role !== 'hide' || a.life !== 'alive') continue;
      if (!out) { if (a.zoneT > 0) { a.hp = 6 + m.zone.step; a.zoneT = 0; } continue; }
      if (watching) continue;
      const before = Math.floor(a.zoneT + 1e-9);
      a.zoneT += dt;
      if (Math.floor(a.zoneT + 1e-9) > before && --a.hp <= 0) TT.downHider(m, a, 'zone', null);
    }
  }

  // 1.4: còn đúng một người trốn chưa chết hẳn thì +1.5 tốc độ; hồi sinh ai đó là mất
  function updateLastHider(m) {
    const hiders = m.actors.filter(a => a.role === 'hide' && (a.life === 'alive' || a.life === 'downed'));
    const want = hiders.length === 1;
    for (const a of m.actors) {
      if (a.role !== 'hide' || a.life !== 'alive') continue;
      const has = a.effects.some(e => e.kind === 'lastHider');
      if (want && !has) TT.addEffect(a, 'lastHider', Infinity, 1.5);
      else if (!want && has) TT.removeEffect(a, 'lastHider');
    }
  }

  // ---------------------------------------------------------------- cứu người gục (4.2)
  const canRevive = (r, d) => r !== d && r.role === 'hide' && r.life === 'alive' && Math.hypot(r.x - d.x, r.y - d.y) <= C.REVIVE_RADIUS;

  function updateRevives(m, dt) {
    for (const d of m.actors) {
      if (d.role !== 'hide' || d.life !== 'downed') continue;
      if (m.now - d.downedAt >= C.REVIVE_WINDOW) { TT.killHider(m, d); continue; }
      let r = d.revive.by == null ? null : m.actors[d.revive.by];
      if (r && (!canRevive(r, d) || r.moving)) { r = null; d.revive = { by: null, t: 0 }; }
      if (!r) {
        r = m.actors.find(x => canRevive(x, d) && !x.moving) || null;
        if (r) d.revive.by = r.id;
      }
      if (!r) continue;
      d.revive.t += dt * (TT.hasEffect(r, 'fastRevive', m.now) ? 2 : 1);
      if (d.revive.t >= C.REVIVE_TIME) TT.reviveHider(m, d, r.id);
    }
  }

  // ---------------------------------------------------------------- hộp, bom chậm, thùng rác
  function teamOf(m, a) { return m.actors.filter(x => x.role === a.role && x.life === 'alive'); }
  function enemiesOf(m, a) { return m.actors.filter(x => x.role !== a.role && x.life === 'alive'); }

  function applyBuff(m, a, roll) {
    const until = m.now + 5;
    if (roll === 1) for (const x of teamOf(m, a)) TT.addEffect(x, 'speedAdd', until, 1);
    else if (roll === 2) for (const x of enemiesOf(m, a)) TT.addEffect(x, 'reveal', m.now + SCAN.ping);   // 5.3: "Enemy detected"
    else TT.addEffect(a, 'speedAdd', until, 1);
  }

  const slowHit = (m, a) => TT.addEffect(a, 'slow', m.now + 2, 0.6);   // debuff 0: chậm 40% trong 2 s

  function applyDebuff(m, a, roll) {
    const until = m.now + 5;
    if (roll === 0) slowHit(m, a);
    else if (roll === 1) TT.addEffect(a, 'stun', m.now + 1.5);
    else if (roll === 2) for (const x of teamOf(m, a)) TT.addEffect(x, 'speedAdd', until, -1);
    else if (roll === 3) for (const x of enemiesOf(m, a)) TT.addEffect(x, 'speedAdd', until, -1);
    else m.bombWaves.push({ owner: a.id, left: BOMB.waves, next: m.now });
  }

  function updateItems(m) {
    for (const it of m.items) {
      if (it.readyAt > m.now) continue;
      const a = m.actors.find(x => x.life === 'alive' && Math.hypot(x.x - it.x, x.y - it.y) <= BOX.radius);
      if (!a) continue;
      it.readyAt = m.now + BOX.respawn;
      const roll = Math.floor(m.rng() * (it.kind === 'buff' ? 3 : 5));
      (it.kind === 'buff' ? applyBuff : applyDebuff)(m, a, roll);
      TT.emit('box', { id: a.id, kind: it.kind, roll, x: it.x, y: it.y });
    }
  }

  function updateBombs(m) {
    for (const w of m.bombWaves) {
      if (m.now < w.next) continue;
      const o = m.actors[w.owner];
      for (let i = 0; i < BOMB.ring; i++) {
        const ang = i * 2 * Math.PI / BOMB.ring, x = o.x + Math.cos(ang) * 1.5, y = o.y + Math.sin(ang) * 1.5;
        if (!MU.boxBlocked(m.map, x, y, 0.3, true)) m.bombs.push({ x, y, owner: w.owner, until: m.now + BOMB.life });
      }
      w.left--; w.next = m.now + BOMB.gap;
    }
    m.bombWaves = m.bombWaves.filter(w => w.left > 0);
    m.bombs = m.bombs.filter(b => {
      if (b.until <= m.now) return false;
      const a = m.actors.find(x => x.id !== b.owner && x.life === 'alive' && Math.hypot(x.x - b.x, x.y - b.y) <= BOMB.radius);
      if (a) slowHit(m, a);
      return !a;
    });
  }

  // 5.6: chạm thùng rác lần đầu -> thùng đổ, vũng nước hiện ở các điểm Splat quanh nó
  function updateTrash(m) {
    for (const t of m.map.trash) {
      if (t.state !== 'idle' || !m.actors.some(a => a.life === 'alive' && Math.hypot(a.x - t.x, a.y - t.y) <= t.r)) continue;
      t.state = 'hit';
      m.map.obs.delete(MU.idx(m.map, t.tx, t.ty));
      for (const p of m.map.puddleSpots) {
        if (Math.hypot(p.x - t.x, p.y - t.y) > 6) continue;
        m.puddles.push({ x: p.x, y: p.y, w: p.w, h: p.h });
        for (let ty = Math.floor(p.y - p.h / 2); ty <= Math.floor(p.y + p.h / 2 - 0.01); ty++)
          for (let tx = Math.floor(p.x - p.w / 2); tx <= Math.floor(p.x + p.w / 2 - 0.01); tx++)
            if (MU.kindAt(m.map, tx, ty) === TT.KIND.FREE && !m.map.obs.has(MU.idx(m.map, tx, ty))) MU.addObstacle(m.map, 'speed_down', tx, ty, 'pad');
      }
    }
  }

  // ---------------------------------------------------------------- kết thúc
  function endMatch(m, result) {
    m.result = result;
    setPhase(m, 'ending');
    TT.emit('end', result);
  }

  function checkEnd(m) {
    const hiders = m.actors.filter(a => a.role === 'hide');
    if (m.gate.state === 'open') {
      const e = hiders.find(a => a.life === 'alive' && Math.hypot(a.x - m.gate.x, a.y - m.gate.y) <= GATE_RADIUS && !TT.hasEffect(a, 'gateWatch', m.now));
      if (e) { e.life = 'escaped'; TT.emit('escape', { id: e.id }); return endMatch(m, { winner: 'hide', by: e.id }); }
    }
    if (hiders.length && !hiders.some(a => a.life === 'alive')) endMatch(m, { winner: 'seek' });   // 1.4: mọi người trốn còn sống đều gục
  }

  // ---------------------------------------------------------------- vòng cập nhật
  function humanIntent(m) {
    const i = m.intent, l = Math.hypot(i.ux, i.uy);
    return l > 0 ? { ux: i.ux / l, uy: i.uy / l } : { ux: 0, uy: 0 };
  }

  function updateActors(m, dt, live) {
    for (const a of m.actors) {
      let intent = { ux: 0, uy: 0 };
      if (live && a.life === 'alive') intent = a === m.human ? humanIntent(m) : TT.botIntent(m, a, dt);
      TT.updateActor(m, a, intent, dt);
    }
    if (live && m.attackReq != null) { TT.attack(m, m.human, m.attackReq); }
    m.attackReq = null;
  }

  function updatePlaying(m, dt) {
    m.t += dt;
    updateForms(m); updateGate(m, dt); updateScan(m); updateZone(m);
    updateActors(m, dt, true);
    updateZoneEffects(m, dt); updateLastHider(m);
    updateRevives(m, dt); updateItems(m); updateBombs(m); updateTrash(m);
    pruneFootprints(m);
    checkEnd(m);
  }

  function pruneFootprints(m) { while (m.prints.length && m.now - m.prints[0].at > 15) m.prints.shift(); }   // 5.5: mờ sau 15 s

  // Hệ thống ngoài lõi (kỹ năng...) chạy mỗi bước, trước khi thực thể di chuyển.
  TT.stepLayers = [];

  TT.updateMatch = function (m, dt) {
    m.now += dt; m.phaseT += dt;
    for (const f of TT.stepLayers) f(m, dt);
    if (m.phase === 'playing') updatePlaying(m, dt);
    else updateActors(m, dt, false);
    const ph = PHASES[m.phase];
    if (ph.dur && m.phaseT >= ph.dur - 1e-6) setPhase(m, ph.next);
  };

  TT.PHASES = PHASES;
  TT.MATCH = { CLOCK, GATE_COUNT, ZONE, SCAN, BOX, GATE_RADIUS };
})();
