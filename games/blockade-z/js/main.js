// Boot, state machine (title -> playing <-> paused/shop -> dead), waves, economy, main loop.
(async () => {
  const BZ = window.BZ;
  const THREE = window.THREE;
  const bootMsg = document.getElementById('boot-msg'); const bootFill = document.getElementById('boot-fill');
  const step = async (msg, k) => { bootMsg.textContent = msg; bootFill.style.width = Math.round(k * 100) + '%'; await new Promise((r) => setTimeout(r, 0)); };
  const fatal = (e) => { const f = document.getElementById('fatal'); f.textContent = 'Blockade Z không khởi động được: ' + (e && e.stack || e); f.style.display = 'block'; console.error('[fatal]', e); };

  try {
    const G = (window.__G = { THREE, events: BZ.events(), rng: BZ.rng(+(BZ.params.seed || 0) || Date.now()), state: 'boot', coins: 0, score: 0, kills: 0, god: BZ.params.god === '1', noLock: BZ.params.nolock === '1' || BZ.isTouch });
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
    scene.fog = new THREE.Fog(0x22324c, 12, G.quality.far * 0.6);
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
    G.weapons = BZ.makeWeapons(G);
    G.allies = BZ.makeAllies(G);
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
      n: 0, phase: 'idle', toSpawn: 0, spawnT: 0, breakT: 0, spawned: 0, total: 0, killed: 0,
      remaining() { return this.total - this.killed; },
    });
    function startWave(n) {
      wave.n = n; wave.phase = 'fight'; wave.total = BZ.WAVE.count(n); wave.toSpawn = wave.total; wave.killed = 0; wave.spawnT = 1.5;
      G.ui.banner('ĐỢT ' + n, wave.total + ' zombie đang kéo tới', 2.4);
      G.audio.play('wave_start'); G.audio.setMusic({ music_drone: 0.38, music_perc: 0.55 });
      G.ui.show(null);
    }
    function endWave() {
      wave.phase = 'break'; wave.breakT = 20;
      const bonus = 200 * wave.n; G.score += bonus; G.coins += 50 + 10 * wave.n;
      G.ui.banner('HẾT ĐỢT ' + wave.n, `+${bonus} điểm · bấm B mở cửa hàng`, 3);
      G.audio.play('wave_clear'); G.audio.setMusic({ music_drone: 0.5, music_perc: 0.12 });
    }
    function updateWave(dt) {
      if (wave.phase === 'fight') {
        wave.spawnT -= dt;
        if (wave.toSpawn > 0 && wave.spawnT <= 0 && G.zombies.aliveCount() < BZ.WAVE.maxAlive(wave.n)) {
          const r = G.rng.next(); const n = wave.n; const W = BZ.WAVE;
          const b = W.bruteShare(n); const f = b + W.flyerShare(n); const ru = f + W.runnerShare(n);
          const type = r < b ? 'brute' : r < f ? 'flyer' : r < ru ? 'runner' : 'walker';
          const P = G.player;
          const gates = [...G.world.spawns].sort((a, b) => Math.hypot(b.x - P.pos.x, b.z - P.pos.z) - Math.hypot(a.x - P.pos.x, a.z - P.pos.z));
          const gate = G.rng.chance(0.7) ? gates[G.rng.int(0, 1)] : G.rng.pick(gates);
          if (type === 'flyer') {
            const k = Math.min(wave.toSpawn, 3 + Math.floor(n / 3));
            for (let i = 0; i < k; i++) if (G.zombies.spawn('flyer', n, gate)) wave.toSpawn--;
            G.ui.banner('ZOMBIE BAY', k + ' con từ hướng ' + gate.name, 1.4);
          } else if (G.zombies.spawn(type, n, gate)) { wave.toSpawn--; if (type === 'brute') G.ui.banner('ZOMBIE TO XÁC', 'từ cổng ' + gate.name, 1.6); }
          wave.spawnT = BZ.WAVE.spawnGap(n) * G.rng.range(0.6, 1.4);
        }
        if (wave.toSpawn === 0 && wave.killed >= wave.total) endWave();
      } else if (wave.phase === 'break') {
        wave.breakT -= dt;
        if (wave.breakT <= 0) { if (G.state === 'shop') closeShop(); startWave(wave.n + 1); }
      }
    }

    // ---- events ----
    G.events.on('zombie:killed', ({ z, part }) => {
      wave.killed++; G.kills++;
      const T = z.T; const head = part === 'head';
      const coin = T.coin + (head ? 5 : 0); G.coins += coin; G.score += T.score + (head ? 50 : 0);
      const at = new THREE.Vector3(z.pos.x, z.pos.y + 2.1 * T.scale, z.pos.z);
      G.ui.pop('+' + coin + '🪙', 'coin', at);
      if (head) G.ui.pop('HEADSHOT', 'head', new THREE.Vector3(z.pos.x, z.pos.y + 2.5 * T.scale, z.pos.z));
      G.audio.play('coin', { gain: 0.6 });
      const r = G.rng.next();
      if (r < 0.07) G.fx.drop('health', z.pos); else if (r < 0.16) G.fx.drop('ammo', z.pos);
    });
    G.events.on('hit', ({ z, dmg, part }) => {
      G.ui.hit(part === 'head');
      G.ui.pop(String(dmg), part === 'head' ? 'dmg crit' : 'dmg', new THREE.Vector3(z.pos.x + (G.rng.next() - 0.5) * 0.6, z.pos.y + 1.9 * z.T.scale, z.pos.z));
    });
    G.events.on('player:hurt', ({ dmg, from }) => G.player.hurt(dmg, from));
    G.events.on('pickup', (kind) => {
      const P = G.player;
      if (kind === 'health') { P.hp = Math.min(P.maxHp, P.hp + 35); G.ui.pop('+35 máu', 'heal'); }
      else { for (const id of G.weapons.ORDER) if (G.weapons.S.owned[id] && G.weapons.state[id].reserve !== Infinity) G.weapons.state[id].reserve = Math.min(G.weapons.WEAPONS[id].reserve, G.weapons.state[id].reserve + Math.ceil(G.weapons.WEAPONS[id].mag * 1.5)); G.ui.pop('+đạn', 'heal'); }
      G.audio.play('pickup', { gain: 0.7 });
    });
    G.events.on('player:dead', () => {
      G.state = 'dead'; unlockPointer();
      const best = BZ.store.best(); const record = G.score > best.score;
      if (record) BZ.store.saveBest({ score: G.score, wave: wave.n });
      const W = G.weapons.S;
      G.ui.setDead({ wave: wave.n, kills: G.kills, score: G.score, acc: W.shots ? Math.round((W.hits / W.shots) * 100) : 0, best: record ? { score: G.score, wave: wave.n } : best, record });
      G.audio.setMusic({ music_drone: 0.3, music_perc: 0 });
      setTimeout(() => { if (G.state === 'dead') G.ui.show('dead'); }, 900);
    });
    G.events.on('buy', (id) => {
      const W = G.weapons; const P = G.player;
      const price = W.WEAPONS[id] ? W.WEAPONS[id].price : { ammo: 120, heal: 150, armor: 200, ally: BZ.ALLY.price, bomb: BZ.BOMB.price, turret: BZ.TURRET.price }[id];
      if (G.coins < price || (id === 'ally' && G.allies.count() >= BZ.ALLY.max) || (id === 'turret' && G.gear.turrets.length >= BZ.TURRET.max) || (id === 'bomb' && G.gear.state.bombs >= BZ.BOMB.max)) { G.audio.play('deny'); return; }
      G.coins -= price;
      if (W.WEAPONS[id]) W.give(id); else if (id === 'ammo') W.refill(); else if (id === 'heal') P.hp = P.maxHp; else if (id === 'armor') P.armor = Math.min(100, P.armor + 50); else if (id === 'ally') G.allies.hire(); else if (id === 'bomb') G.gear.addBombs(BZ.BOMB.pack); else if (id === 'turret') G.gear.placeTurret();
      G.audio.play('buy'); G.ui.shopRender();
    });
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
      G.zombies.clear(); G.fx.clear(); G.player.reset(); G.weapons.reset(); G.allies.clear(); G.gear.clear();
      G.coins = +(BZ.params.coins || 0); G.score = 0; G.kills = 0;
      play();
      startWave(+(BZ.params.wave || 1));
    }
    function pause() { if (G.state !== 'playing') return; G.state = 'paused'; G.ui.settingsSync(); G.ui.show('pause'); unlockPointer(); }
    function openShop() { if (G.state !== 'playing' || wave.phase !== 'break') return; G.state = 'shop'; G.ui.shopRender(); G.ui.show('shop'); unlockPointer(); }
    function closeShop() { if (G.state !== 'shop') return; play(); }
    G.events.on('ui:play', newGame);
    G.events.on('ui:resume', play);
    G.events.on('ui:restart', newGame);
    G.events.on('ui:shop', openShop);
    G.events.on('ui:closeshop', closeShop);
    G.events.on('ui:ready', () => { closeShop(); if (wave.phase === 'break') wave.breakT = 0.01; });
    G.events.on('ui:settings', () => { G.ui.settingsSync(); G.ui.show('pause'); });
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyB') { if (G.state === 'shop') closeShop(); else openShop(); }
      if (e.code === 'Escape' && G.state === 'shop') closeShop();
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
      if (G.state === 'playing') {
        safe('player', () => G.player.update(dt));
        safe('weapons', () => G.weapons.update(dt, G.player.input));
        safe('zombies', () => G.zombies.update(dt));
        safe('allies', () => G.allies.update(dt));
        safe('gear', () => G.gear.update(dt));
        safe('wave', () => updateWave(dt));
      } else if (G.state === 'dead') {
        safe('zombies', () => G.zombies.update(dt));
        G.camera.position.y = BZ.damp(G.camera.position.y, 0.4, 3, dt); G.camera.rotation.z = BZ.damp(G.camera.rotation.z, 0.5, 3, dt);
      } else if (G.state === 'title') {
        const t = performance.now() / 1000;
        G.camera.position.set(Math.sin(t * 0.08) * 16, 6 + Math.sin(t * 0.2), Math.cos(t * 0.08) * 16);
        G.camera.lookAt(0, 1.5, 0);
      }
      safe('fx', () => G.fx.update(dt));
      safe('ui', () => G.ui.update(dt));
      G.world.clouds.position.x = (performance.now() / 1000) * 0.6 % 60;
      G.world.flicker(performance.now() / 1000);
    }
    function draw() {
      renderer.info.reset();
      renderer.clear();
      renderer.render(scene, camera);
      if (G.state === 'playing' || G.state === 'shop' || G.state === 'paused') G.weapons.render(renderer);
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
      const shots = { plaza: [0, 0, 7, 0, -0.08], gate: [0, 0, -26, 0, 0.02], street: [18, 0, 0, Math.PI / 2, -0.05] };
      const s = shots[name] || shots.plaza; P.pos.set(s[0], s[1], s[2]); P.vel.set(0, 0, 0); P.yaw = s[3]; P.pitch = s[4];
    };
    window.__newGame = newGame;

    document.getElementById('boot').classList.add('done');
    G.state = 'title'; G.ui.show('title'); G.audio.setMusic({ music_drone: 0.5, music_perc: 0 });
    window.__ready = true;
    if (BZ.params.autostart === '1') newGame();
  } catch (e) { fatal(e); }
})();
