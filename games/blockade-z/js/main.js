// Boot, state machine (title -> playing <-> paused/pick -> dead), waves, upgrade picks, main loop.
(async () => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const bootMsg = document.getElementById('boot-msg'); const bootFill = document.getElementById('boot-fill');
  const step = async (msg, k) => { bootMsg.textContent = msg; bootFill.style.width = Math.round(k * 100) + '%'; await new Promise((r) => setTimeout(r, 0)); };
  const fatal = (e) => { const f = document.getElementById('fatal'); f.textContent = 'Blockade Z không khởi động được: ' + (e && e.stack || e); f.style.display = 'block'; console.error('[fatal]', e); };

  try {
    const G = (window.__G = { THREE, events: BZ.events(), rng: BZ.rng(+(BZ.params.seed || 0) || Date.now()), state: 'boot', score: 0, kills: 0, god: BZ.params.god === '1', noLock: BZ.params.nolock === '1' || BZ.isTouch });
    G.settings = BZ.store.load();
    G.quality = BZ.pickQuality(G.settings.quality);

    await step('Dựng renderer', 0.05);
    const canvas = document.getElementById('view');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.autoClear = false;
    renderer.shadowMap.enabled = G.quality.shadow > 0;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    G.renderer = renderer;
    const scene = (G.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(0x2a2c38, 12, G.quality.far * 0.62);
    const camera = (G.camera = new THREE.PerspectiveCamera(G.settings.fov, 1, 0.05, 600));
    camera.rotation.order = 'YXZ';
    scene.add(camera);
    const hemi = new THREE.HemisphereLight(0x8aa6e6, 0x3a3428, 1.35); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xb4c8ff, 1.1);
    sun.position.set(-30, 40, -42);
    sun.castShadow = G.quality.shadow > 0;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(G.quality.shadow, G.quality.shadow);
      const c = sun.shadow.camera; c.left = -48; c.right = 48; c.top = 48; c.bottom = -48; c.near = 1; c.far = 140;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    }
    scene.add(sun); scene.add(sun.target);
    G.hemi = hemi; G.sun = sun;

    await step('Vẽ texture pixel', 0.15);
    for (const k of BZ.texKeys()) BZ.tex(k);
    await step('Xây thị trấn', 0.35);
    G.world = BZ.makeWorld(G);
    await step('Gọi zombie', 0.5);
    G.fx = BZ.makeFx(G);
    G.audio = BZ.makeAudio(G);
    G.zombies = BZ.makeZombies(G);
    await step('Lắp súng', 0.65);
    G.player = BZ.makePlayer(G);
    G.build = BZ.makeBuild(G);
    G.weapons = BZ.makeWeapons(G);
    G.allies = BZ.makeAllies(G);
    G.hero = BZ.makeHeroes(G);
    G.tps = BZ.makeTps(G);
    G.sky = BZ.makeSky(G);
    G.coop = BZ.makeCoop(G);
    G.polish = BZ.makePolish(G);
    G.gear = BZ.makeGear(G);
    G.ui = BZ.makeUI(G);
    { const b = BZ.store.best(); if (b.score) document.getElementById('best').textContent = 'Kỷ lục: ' + b.score + ' điểm · đợt ' + b.wave; }
    await step('Tổng hợp âm thanh', 0.8);
    for (let i = 0; i < 6 && G.audio.ready() < 0.5; i++) { G.audio.update(); await new Promise((r) => setTimeout(r, 0)); }
    await step('Sẵn sàng', 1);

    // ---- sizing and dynamic resolution ----
    let scale = G.quality.scale;
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, G.quality.maxDpr) * scale;
      renderer.setPixelRatio(dpr);
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize); resize();
    const gov = { acc: 0, n: 0, slow: 0, fast: 0 };
    function governor(dt) {
      gov.acc += dt; gov.n++;
      if (gov.acc < 1) return;
      const ms = (gov.acc / gov.n) * 1000; gov.acc = 0; gov.n = 0;
      window.__stats.frameMs = +ms.toFixed(1);
      if (ms > 21) { gov.slow++; gov.fast = 0; } else if (ms < 14) { gov.fast++; gov.slow = 0; } else { gov.slow = gov.fast = 0; }
      if (gov.slow >= 2 && scale > 0.5) { scale = Math.max(0.5, scale - 0.1); gov.slow = 0; resize(); console.log('[render] ' + ms.toFixed(0) + ' ms/frame, scale -> ' + scale.toFixed(1)); }
      if (gov.fast >= 4 && scale < G.quality.scale) { scale = Math.min(G.quality.scale, scale + 0.1); gov.fast = 0; resize(); }
    }

    // ---- waves ----
    const wave = (G.wave = {
      n: 0, phase: 'idle', toSpawn: 0, spawnT: 0, spawned: 0, total: 0, killed: 0, picked: new Set(), pickT: 0,
      remaining() { return G.coop && G.coop.guest ? this.netRemaining || 0 : this.total - this.killed; },
    });
    // co-op scaling: each extra player adds 60% more zombies, 35% more health and room for 40% more on the field at once
    const party = () => (G.coop.on ? 1 + [...G.coop.peers.values()].filter((p) => p.ready).length : 1);
    G.party = { count: party, hp: () => 1 + 0.35 * (party() - 1), alive: () => 1 + 0.4 * (party() - 1) };
    function startWave(n) {
      wave.n = n; wave.phase = 'fight'; wave.total = Math.round(BZ.WAVE.count(n) * (1 + 0.6 * (party() - 1))); wave.toSpawn = wave.total; wave.killed = 0; wave.spawnT = 1.5;
      G.ui.banner('ĐỢT ' + n, wave.total + ' zombie đang kéo tới', 2.4);
      G.events.emit('ann', { banner: true, title: 'ĐỢT ' + n, sub: wave.total + ' zombie đang kéo tới', secs: 2.4, snd: 'wave_start' });
      revive();
      G.audio.play('wave_start'); G.audio.setMusic({ music_drone: 0.38, music_perc: 0.55 });
      G.events.emit('wave:start', n);
      // a boss every fifth wave, and from wave 6 a chance of an extra one
      const BOSSES = ['dragon', 'giant', 'pharaoh', 'brood', 'alien', 'thrower', 'ufo', 'phantom', 'vampire', 'queen', 'guardian'].filter((id) => BZ.ZOMBIES[id]);
      wave.bossAt = n % 5 === 0 ? 4 : n > 5 && G.rng.chance(0.35) ? 12 : -1;
      wave.bossType = n % 5 === 0 ? BOSSES[(n / 5 - 1) % BOSSES.length] : G.rng.pick(BOSSES);
      if (BZ.params.boss) { wave.bossAt = 2; wave.bossType = BZ.params.boss; }
      if (G.state === 'pick') play(); else G.ui.show(null);
    }
    // a cleared wave: everyone picks one of three upgrades; the next wave starts when all have picked
    // (a minute at most, so one player away from the keyboard does not hold the room)
    function endWave() {
      wave.phase = 'pick'; wave.picked = new Set(); wave.pickT = 60;
      G.events.emit('wave:end', wave.n);
      const bonus = 200 * wave.n; G.score += bonus;
      G.audio.play('wave_clear'); G.audio.setMusic({ music_drone: 0.5, music_perc: 0.12 });
      openPick();
    }
    const waiting = () => { if (wave.phase !== 'pick') return 0; let n = wave.picked.has('h') ? 0 : 1; for (const p of G.coop.peers.values()) if (p.ready && !wave.picked.has(p.pid)) n++; return n; };
    function openPick() {
      if (G.state !== 'playing') return;
      G.pickN = wave.n; G.pickOpts = G.build.offer(3); G.picked = false;
      if (!G.pickOpts.length) { choose(null); return; }
      for (const id of ['announce', 'banner']) { const e = document.getElementById(id); if (e) e.classList.remove('on'); }
      G.state = 'pick'; G.player.input.fire = false; unlockPointer(); G.ui.pickRender(G.pickOpts, wave.n); G.ui.show('pick');
    }
    function choose(id) {
      if (G.picked || (G.state !== 'pick' && id)) return;
      G.picked = true;
      if (id) { G.build.grant(id); G.audio.play('buy'); squadUp(); }
      if (G.coop.guest) { G.coop.act({ k: 'picked', n: G.pickN }); G.ui.pickWait(); return; }
      wave.picked.add('h');
      if (G.coop.on && waiting() > 0) G.ui.pickWait(); else startWave(wave.n + 1);
    }
    G.pickChoose = choose; G.startWave = startWave;
    G.events.on('pick', (id) => choose(id));
    G.coop.onPicked = (pid, n) => { if (n === wave.n && wave.phase === 'pick') wave.picked.add(pid); };
    G.wave.waiting = () => (G.coop.guest ? wave.netWaiting || 0 : waiting());
    // one zombie through a gate: maybe an elite, and the first of each special kind gets a banner with its counter
    const seen = new Set();
    function spawnOne(type, gate) {
      const z = G.zombies.spawn(type, wave.n, gate); if (!z) return null;
      const T = z.T;
      if (BZ.params.elite || (!T.boss && !T.pack && type !== 'flyer' && G.rng.chance(BZ.eliteChance(wave.n)))) G.zombies.elite(z, BZ.params.elite);
      if (T.tip && !seen.has(type)) { seen.add(type); G.ui.banner(T.name, T.tip + ' · từ cổng ' + gate.name, 2.6); G.events.emit('ann', { banner: true, title: T.name, sub: T.tip, secs: 2.6 }); }
      return z;
    }
    G.events.on('game:new', () => seen.clear());
    function updateWave(dt) {
      if (wave.phase === 'fight') {
        wave.spawnT -= dt;
        if (wave.bossAt > 0) { wave.bossAt -= dt; if (wave.bossAt <= 0) { const P = G.player; const gate = [...G.world.spawns].sort((a, b) => Math.hypot(b.x - P.pos.x, b.z - P.pos.z) - Math.hypot(a.x - P.pos.x, a.z - P.pos.z))[0];
          const z = G.zombies.spawn(wave.bossType, wave.n, gate); if (z) { wave.total++; G.ui.announce('BOSS: ' + z.T.name, 'từ cổng ' + gate.name, 'hot'); G.events.emit('ann', { title: 'BOSS: ' + z.T.name, sub: 'từ cổng ' + gate.name, cls: 'hot' }); G.audio.play('wave_start', { rate: 0.7 }); } } }
        if (wave.toSpawn > 0 && wave.spawnT <= 0 && G.zombies.aliveCount() < Math.min(50, BZ.WAVE.maxAlive(wave.n) * G.party.alive())) {
          const r = G.rng.next(); const n = wave.n; const W = BZ.WAVE;
          const b = W.bruteShare(n); const f = b + W.flyerShare(n); const ru = f + W.runnerShare(n);
          let type = r < b ? 'brute' : r < f ? 'flyer' : r < ru ? 'runner' : 'walker';
          type = BZ.params.ztype || BZ.pickSpecial(n, G.rng) || type;
          const P = G.player;
          const gates = [...G.world.spawns].sort((a, b) => Math.hypot(b.x - P.pos.x, b.z - P.pos.z) - Math.hypot(a.x - P.pos.x, a.z - P.pos.z));
          const gate = G.rng.chance(0.7) ? gates[G.rng.int(0, 1)] : G.rng.pick(gates);
          const ZT = BZ.ZOMBIES[type];
          if (type === 'flyer' || ZT.pack) {
            const k = Math.min(wave.toSpawn, type === 'flyer' ? 3 + Math.floor(n / 3) : G.rng.int(ZT.pack[0], ZT.pack[1]));
            for (let i = 0; i < k; i++) if (spawnOne(type, gate)) wave.toSpawn--;
            if (type === 'flyer') G.ui.banner('ZOMBIE BAY', k + ' con từ hướng ' + gate.name, 1.4);
          } else if (spawnOne(type, gate)) { wave.toSpawn--; if (type === 'brute') G.ui.banner('ZOMBIE TO XÁC', 'từ cổng ' + gate.name, 1.6); }
          wave.spawnT = BZ.WAVE.spawnGap(n) * G.rng.range(0.6, 1.4);
        }
        if (wave.toSpawn === 0 && wave.killed >= wave.total) endWave();
      } else if (wave.phase === 'pick') {
        wave.pickT -= dt;
        if ((G.picked && waiting() === 0) || wave.pickT <= 0) startWave(wave.n + 1);
      }
    }

    // ---- events ----
    G.events.on('zombie:killed', ({ z, part, credit }) => {
      wave.killed++;
      // in co-op the score goes to whoever landed the killing hit
      if (credit === false) return;
      G.kills++; G.build.onKill(z); G.hero.onKill(z);
      const T = z.T; const head = part === 'head';
      const em = z.elite ? 3 : 1;
      const pts = Math.round((T.score + (head ? 50 : 0)) * em * (G.env ? G.env.scoreMul : 1)); G.score += pts;
      G.ui.pop('+' + pts, 'coin', new THREE.Vector3(z.pos.x, z.pos.y + 2.1 * T.scale, z.pos.z));
      if (head) { G.ui.pop('HEADSHOT', 'head', new THREE.Vector3(z.pos.x, z.pos.y + 2.5 * T.scale, z.pos.z)); G.audio.play('headshot', { gain: 0.6 }); }
      // multi kills inside a short window, and a streak that resets when the player is hurt
      const now = performance.now() / 1000;
      combo.n = now - combo.t < 1.4 ? combo.n + 1 : 1; combo.t = now; combo.streak++;
      const MULTI = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUADRA KILL', 5: 'PENTA KILL' };
      if (combo.n >= 2) {
        const title = combo.n >= 8 ? 'RAMPAGE' : MULTI[combo.n] || 'MULTI KILL';
        const bonus = 50 * combo.n; G.score += bonus;
        G.ui.announce(title, (combo.n >= 6 ? combo.n + ' con · ' : '') + '+' + bonus + ' điểm', combo.n >= 5 ? 'hot' : '');
        G.audio.play('streak', { gain: 0.55, rate: 1 + Math.min(combo.n, 8) * 0.05 });
      }
      if (combo.streak > 0 && combo.streak % 15 === 0) { G.ui.announce('CHUỖI ' + combo.streak, 'hạ liên tiếp không mất máu', 'streak'); G.audio.play('streak', { gain: 0.5, rate: 0.8 }); }
      G.audio.play('coin', { gain: 0.6 });
    });
    G.events.on('hit', ({ z, dmg, part, crit }) => {
      G.ui.hit(part === 'head' || crit);
      const note = z.hitNote; z.hitNote = null;
      if (note) { if (note.word) { G.ui.pop(note.word, 'dmg leg', new THREE.Vector3(z.pos.x + (G.rng.next() - 0.5) * 0.6, z.pos.y + 1.9 * z.T.scale, z.pos.z)); return; } dmg = Math.max(1, Math.round(dmg * note.mul)); }
      if (crit) { G.ui.pop('CRIT', 'critword', new THREE.Vector3(z.pos.x, z.pos.y + 2.4 * z.T.scale, z.pos.z)); G.audio.play('crit', { gain: 0.6 }); G.player.shake.v += 1.5; }
      G.ui.pop(String(dmg), crit ? 'dmg crit big' : part === 'head' ? 'dmg crit' : part === 'leg' ? 'dmg leg' : 'dmg', new THREE.Vector3(z.pos.x + (G.rng.next() - 0.5) * 0.6, z.pos.y + 1.9 * z.T.scale, z.pos.z));
    });
    const combo = { n: 0, t: 0, streak: 0 };
    G.events.on('player:hurt', ({ dmg, from }) => { combo.streak = 0; G.player.hurt(dmg, from); });
    // co-op: a downed player waits for the next wave; the fight ends when everyone is down
    function revive() { const P = G.player; if (G.coop.on && !P.alive) { P.alive = true; P.hp = P.maxHp; G.ui.banner('HỒI SINH', 'vào đợt mới', 1.6); } }
    G.events.on('coop:wave', () => revive());
    G.events.on('coop:over', () => { if (G.state === 'playing') { G.coop.downed = false; G.events.emit('player:dead', { final: true }); } });
    G.events.on('coop:lost', () => { G.state = 'title'; G.ui.show('title'); unlockPointer(); });
    G.events.on('player:dead', (e) => {
      if (G.coop.on && !(e && e.final)) { G.ui.banner('BẠN ĐÃ GỤC', 'hồi sinh khi đợt sau bắt đầu, đồng đội còn đánh', 3); G.audio.setMusic({ music_drone: 0.3, music_perc: 0.2 }); return; }
      G.state = 'dead'; unlockPointer();
      const best = BZ.store.best(); const record = G.score > best.score;
      if (record) BZ.store.saveBest({ score: G.score, wave: wave.n });
      const W = G.weapons.S;
      G.ui.setDead({ wave: wave.n, kills: G.kills, score: G.score, acc: W.shots ? Math.round((W.hits / W.shots) * 100) : 0, best: record ? { score: G.score, wave: wave.n } : best, record });
      G.audio.setMusic({ music_drone: 0.3, music_perc: 0 });
      setTimeout(() => { if (G.state === 'dead') G.ui.show('dead'); }, 900);
    });
    // test hook (no shop in the game): hand out a weapon or a piece of gear
    G.events.on('buy', (id) => {
      const W = G.weapons; const P = G.player;
      if ((id === 'ally' && G.allies.count() >= BZ.ALLY.max) || (id === 'turret' && G.gear.turrets.length >= BZ.TURRET.max) || (id === 'jetpack' && P.hasJet)) { G.audio.play('deny'); return; }
      if (W.WEAPONS[id]) W.give(id); else if (id === 'ammo') W.refill(); else if (id === 'heal') P.hp = P.maxHp; else if (id === 'armor') P.armor = Math.min(100, P.armor + 50); else if (id === 'ally') { if (G.coop.guest) G.coop.act({ k: 'ally' }); else G.allies.hire(); } else if (id === 'turret') { if (G.coop.guest) G.coop.act({ k: 'turret' }); else G.gear.placeTurret(); } else if (id === 'jetpack') { P.hasJet = true; P.fuel = 100; G.ui.banner('JETPACK', 'nhảy rồi giữ Space để bay', 2); }
      G.audio.play('buy');
    });
    G.events.on('upgrade', (id) => { if (G.build.grant(id)) squadUp(); });
    // support branches: the host keeps the squad as large as every player's Chỉ huy levels together, and rebuilds the turrets each wave
    function squadUp() {
      if (G.coop.guest) { G.coop.act({ k: 'sup', s: G.build.support() }); return; }
      let want = G.build.lv('squad'); for (const p of G.coop.peers.values()) want += (p.sup && p.sup.squad) || 0;
      want = Math.min(5, want); BZ.ALLY.max = Math.max(3, want);
      while (G.allies.count() < want) if (!G.allies.hire()) break;
    }
    function turretsUp() {
      if (G.coop.guest) return;
      while (G.gear.turrets.length) G.gear.removeTurret(0);
      const place = (pos, yaw, n) => { for (let i = 0; i < n; i++) { const a = yaw + (i - (n - 1) / 2) * 1.2; G.gear.placeTurret({ pos: new THREE.Vector3(pos.x - Math.sin(a) * 2.2, 0, pos.z - Math.cos(a) * 2.2), yaw: a }); } };
      place(G.player.pos, G.player.yaw, G.build.lv('eng'));
      for (const p of G.coop.peers.values()) { const a = G.coop.avatars.get(p.pid); if (a && p.sup && p.sup.eng) place(a.pos, a.yaw, p.sup.eng); }
    }
    G.coop.onSupport = squadUp;
    // each wave: a third of the health back, the squad refilled, turrets rebuilt where everyone stands
    function waveSupplies() { G.weapons.refill(0.5); G.build.apply(); const P = G.player; if (P.alive) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.35); }
    G.events.on('wave:start', () => { waveSupplies(); squadUp(); turretsUp(); });
    G.events.on('coop:wave', () => waveSupplies());
    G.events.on('settings', (s) => {
      BZ.store.save(s); G.audio.setVolume(s.volume);
      const q = BZ.pickQuality(s.quality);
      if (q.name !== G.quality.name) { G.quality.scale = q.scale; G.quality.maxDpr = q.maxDpr; scale = q.scale; G.quality.name = q.name; resize(); }
    });

    // ---- pointer lock + states ----
    G.lock = () => { if (!G.noLock && document.pointerLockElement !== canvas) canvas.requestPointerLock?.()?.catch?.(() => {}); };
    function unlockPointer() { if (document.pointerLockElement) document.exitPointerLock(); }
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G.state === 'playing' && !G.noLock) pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') pause(); });
    function play() {
      G.audio.unlock(); G.audio.setVolume(G.settings.volume);
      G.state = 'playing'; G.ui.show(null); G.lock();
    }
    function newGame() {
      lineupShow(false); G.events.emit('game:new');
      G.build.reset(G.hero.id);
      G.zombies.clear(); G.fx.clear(); G.player.reset(); G.weapons.reset(); G.allies.clear(); G.gear.clear(); G.hero.reset(); G.sky.clear(); G.build.apply();
      G.score = 0; G.kills = 0; G.picked = false;
      play();
      if (!G.coop.guest) startWave(+(BZ.params.wave || 1));
    }
    function pause() { if (G.state !== 'playing') return; G.state = 'paused'; G.ui.settingsSync(); G.ui.show('pause'); unlockPointer(); }
    // ---- hero pick: the seven stand in a row on the plaza, the camera slides to the one in focus ----
    const lineup = { models: [], i: 3, t: 0, light: new THREE.PointLight(0xffe2b8, 0, 7, 1.4) };
    scene.add(lineup.light);
    const LX = (i) => (i - (BZ.HEROES.length - 1) / 2) * 1.5; const LZ = 13;
    function lineupShow(on) {
      if (on && !lineup.models.length) BZ.HEROES.forEach((h, i) => { const m = BZ.heroModel(h.id); m.root.position.set(LX(i), 0, LZ); scene.add(m.root); lineup.models.push(m); });
      for (const m of lineup.models) m.root.visible = on;
      lineup.light.intensity = on ? 16 : 0;
    }
    function openSelect() {
      G.zombies.clear(); G.allies.clear(); G.gear.clear(); G.fx.clear(); G.weapons.reset();
      const saved = BZ.HEROES.findIndex((h) => h.id === (G.settings.hero || 'mua'));
      lineup.i = saved < 0 ? 3 : saved; lineupShow(true);
      G.state = 'select'; unlockPointer(); G.ui.selectRender(lineup.i); G.ui.show('select'); G.audio.unlock();
    }
    function selectPick(i) { lineup.i = (i + BZ.HEROES.length) % BZ.HEROES.length; G.ui.selectRender(lineup.i); G.audio.play('switch', { gain: 0.6 }); lineup.t = 0; }
    function selectGo() { const h = BZ.HEROES[lineup.i]; G.settings.hero = h.id; BZ.store.save(G.settings); G.hero.set(h.id); G.audio.play('buy'); newGame(); }
    function updateSelect(dt) {
      lineup.t += dt; const now = performance.now() / 1000;
      const x = LX(lineup.i); const cam = G.camera;
      cam.position.x = BZ.damp(cam.position.x, x * 0.6 - 0.9, 4, dt); cam.position.y = BZ.damp(cam.position.y, 1.75, 4, dt); cam.position.z = BZ.damp(cam.position.z, LZ + 5.2, 4, dt);
      cam.rotation.set(-0.1, Math.atan2(-(x - cam.position.x + 0.9), 5.2) * 0.9, 0, 'YXZ'); if (cam.fov !== 50) { cam.fov = 50; cam.updateProjectionMatrix(); }
      lineup.light.position.set(x, 3, LZ + 1.8);
      lineup.models.forEach((m, i) => {
        const on = i === lineup.i; const k = on ? Math.min(1, lineup.t * 3) : 0;
        m.root.position.z = BZ.damp(m.root.position.z, on ? LZ + 0.8 : LZ, 8, dt);
        m.root.rotation.y = BZ.damp(m.root.rotation.y, on ? Math.sin(now * 0.8) * 0.35 + 0.15 : -0.1, 6, dt);
        const br = Math.sin(now * 2 + i);
        m.hips.position.y = 0.75 + br * 0.012; m.head.rotation.x = br * 0.03;
        // the one in focus strikes a pose that hints at its skill
        const pose = on ? BZ.HEROES[i].skill.key : 'idle'; const w = Math.sin(now * 5);
        const A = { idle: [-0.1, -0.1, 0, 0], dash: [-1.2, 0.6, -0.3, 0.3], invuln: [-2.9, -2.9, 0.2, -0.2], heal: [-1.6 + w * 0.1, -0.2, 0.4, 0], storm: [-1.5, -1.5, 0, 0], blink: [-0.3, -2.4, 0, -0.5], strike: [-3.0 + w * 0.15, -0.2, 0, 0], freeze: [-1.4, -1.4, 0.5, -0.5], molotov: [-1.1, -2.7 + w * 0.1, 0, 0.2], orb: [-1.5 + w * 0.08, -1.5 - w * 0.08, -0.35, 0.35], cloud: [-0.5, -2.3 + w * 0.1, 0, 0.3], turret: [-0.9, -1.4 + w * 0.12, 0.1, 0] }[pose] || [-0.1, -0.1, 0, 0];
        m.armL.rotation.x = BZ.damp(m.armL.rotation.x, A[0], 8, dt); m.armR.rotation.x = BZ.damp(m.armR.rotation.x, A[1], 8, dt);
        m.armL.rotation.z = BZ.damp(m.armL.rotation.z, -A[2], 8, dt); m.armR.rotation.z = BZ.damp(m.armR.rotation.z, -A[3], 8, dt);
        m.legL.rotation.x = BZ.damp(m.legL.rotation.x, pose === 'dash' ? -0.5 : 0, 8, dt); m.legR.rotation.x = BZ.damp(m.legR.rotation.x, pose === 'dash' ? 0.4 : 0, 8, dt);
        if (on && k < 1) m.hips.position.y += Math.sin(k * Math.PI) * 0.25;
      });
    }
    addEventListener('keydown', (e) => {
      if (G.state !== 'select') return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') selectPick(lineup.i - 1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') selectPick(lineup.i + 1);
      if (e.code === 'Enter' || e.code === 'Space') selectGo();
    });
    G.events.on('ui:play', () => { if (G.coop.on) G.coop.stop(); openSelect(); });
    // ---- co-op menu: create a room or join one, then pick a hero ----
    G.events.on('ui:coop', () => { G.state = 'coop'; G.ui.show('coop'); G.ui.coopRender(); });
    G.events.on('ui:coopback', () => { if (G.coop.on) G.coop.stop(); G.state = 'title'; G.ui.show('title'); });
    async function coopGo(fn, label) {
      G.audio.unlock(); G.ui.coopStatus(label + '…');
      try { await fn(); G.ui.coopStatus(''); openSelect(); }
      catch (e) { console.warn('[coop]', e); G.ui.coopStatus('Không được: ' + (e.message || e)); if (G.coop.on) G.coop.stop(); }
    }
    G.events.on('ui:coophost', () => coopGo(() => G.coop.create(), 'Đang tạo phòng'));
    G.events.on('ui:coopjoin', (arg) => coopGo(() => G.coop.join(arg), 'Đang vào phòng'));
    window.__coop = G.coop;
    G.events.on('ui:play_', openSelect);
    G.events.on('ui:pickhero', openSelect);
    G.events.on('ui:selpick', selectPick);
    G.events.on('ui:selprev', () => selectPick(lineup.i - 1));
    G.events.on('ui:selnext', () => selectPick(lineup.i + 1));
    G.events.on('ui:selgo', selectGo);
    window.__select = { open: openSelect, pick: selectPick, go: selectGo, lineup };
    G.events.on('ui:resume', play);
    G.events.on('ui:restart', newGame);
    G.events.on('ui:settings', () => { G.ui.settingsSync(); G.ui.show('pause'); });
    addEventListener('keydown', (e) => {
      if (G.state === 'pick' && /^Digit[1-3]$/.test(e.code)) { const id = G.pickOpts[+e.code.slice(5) - 1]; if (id) choose(id); }
      if (e.code === 'KeyP' && G.state === 'playing') pause();
    });

    // ---- loop ----
    window.__stats = { frameMs: 0, draws: 0, tris: 0 };
    const clock = new THREE.Clock();
    let smooth = 1 / 60;
    const logged = new Set();
    const safe = (name, fn) => { try { fn(); } catch (e) { if (!logged.has(name)) { logged.add(name); console.error('[loop] ' + name + '.update threw', e); } } };
    function tick(dt) {
      safe('audio', () => G.audio.update());
      let gdt = dt;
      if (G.hitStop > 0) { G.hitStop -= dt; gdt = dt * 0.07; }
      if (G.state === 'playing') {
        safe('player', () => G.player.update(dt));
        safe('weapons', () => G.weapons.update(gdt, G.player.input));
        safe('zombies', () => G.zombies.update(gdt));
        safe('allies', () => G.allies.update(gdt));
        safe('hero', () => G.hero.update(gdt));
        safe('build', () => G.build.update(gdt));
        safe('polish', () => G.polish.update());
        safe('gear', () => G.gear.update(gdt));
        if (!G.coop.guest) safe('wave', () => updateWave(dt));
        if (G.coop.guest && wave.phase === 'pick' && G.pickN !== wave.n) openPick();
      } else if (G.state === 'pick') {
        safe('fx', () => G.zombies.update(0));
        if (!G.coop.guest) safe('wave', () => updateWave(dt));
        else if (wave.phase === 'fight') play();
        G.ui.pickTick();
      } else if (G.state === 'dead') {
        safe('zombies', () => G.zombies.update(dt));
        G.camera.position.y = BZ.damp(G.camera.position.y, 0.4, 3, dt); G.camera.rotation.z = BZ.damp(G.camera.rotation.z, 0.5, 3, dt);
      } else if (G.state === 'select') {
        safe('select', () => updateSelect(dt));
      } else if (G.state === 'title') {
        const t = performance.now() / 1000;
        G.camera.position.set(Math.sin(t * 0.08) * 16, 6 + Math.sin(t * 0.2), Math.cos(t * 0.08) * 16);
        G.camera.lookAt(0, 1.5, 0);
      }
      safe('fx', () => G.fx.update(gdt));
      safe('ui', () => G.ui.update(dt));
      G.world.clouds.position.x = (performance.now() / 1000) * 0.6 % 60;
      G.world.update(dt);
      safe('sky', () => G.sky.update(gdt, G.state === 'playing'));
      safe('coop', () => G.coop.update(dt));
    }
    function draw() {
      renderer.info.reset();
      renderer.clear();
      if (G.tps) G.tps.vis();
      renderer.render(scene, camera);
      if (G.state === 'playing' || G.state === 'pick' || G.state === 'paused') G.weapons.render(renderer);
      window.__stats.draws = renderer.info.render.calls; window.__stats.tris = renderer.info.render.triangles;
    }
    renderer.info.autoReset = false;
    renderer.setAnimationLoop(() => {
      const raw = Math.min(clock.getDelta(), 0.1);
      smooth = BZ.lerp(smooth, raw, 0.2);
      const dt = Math.min(smooth, 1 / 20);
      tick(dt); draw(); governor(raw);
    });
    // test hooks
    window.__sim = (secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) tick(dt); draw(); };
    window.__setShot = (name) => {
      const P = G.player;
      const shots = { plaza: [0, 0, 7, 0, -0.08], gate: [0, 0, -26, 0, 0.02], street: [18, 0, 0, Math.PI / 2, -0.05],
        heli: [2, 0, -8, 0.5, -0.05], shops: [-24, 0, 1, 0.3, 0.05], church: [-8, 0, 18, 1.45, 0.12], warehouse: [3, 0, 21, -1.57, 0.05],
        apt: [-23, 0, -24, 0, 0], roof: [21, 4.5, -26, 2.4, -0.1], gas: [10, 0, -10, -1.2, 0.05],
        aptroof: [-17, 6.85, -21, 0.8, -0.25], shoproof: [-22, 8.2, -6, 0.6, -0.3], whroof: [30.5, 7.3, 13.5, 0.75, -0.2] };
      const s = shots[name] || shots.plaza; P.pos.set(s[0], s[1], s[2]); P.vel.set(0, 0, 0); P.yaw = s[3]; P.pitch = s[4];
    };
    window.__newGame = newGame;

    document.getElementById('boot').classList.add('done');
    G.state = 'title'; G.ui.show('title'); G.audio.setMusic({ music_drone: 0.5, music_perc: 0 });
    window.__ready = true;
    G.hero.set(BZ.params.hero || G.settings.hero || 'mua');
    if (BZ.params.autostart === '1') newGame();
    else if (BZ.params.select === '1') openSelect();
  } catch (e) { fatal(e); }
})();
