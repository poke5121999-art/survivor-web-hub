/*
 * DREDGE — Biển Mù: khởi động, màn tải, màn đầu, vòng lặp khung hình, tạm dừng, chìm thuyền, móc kiểm thử.
 * Tham số URL: ?fresh=1 xoá sổ lưu · ?t=0..1 đặt giờ trong ngày · ?at=x,z thả thuyền ở toạ độ three.js (đang chạy).
 * Móc kiểm thử: window.DR_DEBUG (info, teleport, setTime, catchNow, give, spotNear, perf).
 */
(function (root) {
  'use strict';
  const T = root.THREE, D = root.DR;
  const REV = ((document.currentScript && document.currentScript.src || '').match(/[?&]v=([^&]+)/) || [])[1] || '';
  const Q = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  D.view = { depthM: 0, zone: '', heading: 0, speed: 0, isDay: true, nearSpot: null, nearDock: null };

  // ---------- tải tài nguyên có tiến độ ----------
  // Kích thước trên đĩa (byte) để vẽ thanh tiến độ khi máy chủ không gửi Content-Length (nén gzip).
  const SIZE = {
    'lib.glb': 13093832, 'boat.glb': 4313536, 'depthmask.png': 2184389, 'markers.json': 1436641, 'terrain_rg.png': 1381301,
    'instances.bin': 343320, 'scene_config.json': 146136, 'world.json': 129924, 'landmask.png': 29250
  };
  const prog = {};
  function showProgress() {
    let got = 0, all = 0;
    for (const [k, v] of Object.entries(SIZE)) { all += v; got += Math.min(v, prog[k] || 0); }
    const bar = document.querySelector('#dr-loading .bar i');
    if (bar) bar.style.width = (got / all * 100).toFixed(1) + '%';
  }
  async function get(url, kind) {
    const name = url.split('/').pop();
    const res = await fetch(url + (REV ? '?v=' + REV : ''));
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    let buf;
    if (res.body && res.body.getReader) {
      const rd = res.body.getReader(), parts = []; let n = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        parts.push(value); n += value.length; prog[name] = n; showProgress();
      }
      buf = new Uint8Array(n); let o = 0;
      for (const p of parts) { buf.set(p, o); o += p.length; }
      buf = buf.buffer;
    } else buf = await res.arrayBuffer();
    prog[name] = SIZE[name] || 0; showProgress();
    if (kind === 'buffer') return buf;
    const txt = new TextDecoder().decode(buf);
    return kind === 'json' ? JSON.parse(txt) : txt;
  }

  // ---------- renderer ----------
  const canvas = $('dr-canvas');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.5)); // [ĐỀ XUẤT] trần 1,5× để giữ 60 khung/giây
  renderer.outputEncoding = T.sRGBEncoding;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(root.DR_BOAT.physics.camera.defaultFOV, 1, 0.5, 1500);
  function resize() {
    const w = root.innerWidth, h = root.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  root.addEventListener('resize', resize); resize();

  let paused = false, ready = false, started = false;
  const perf = { frames: 0, ms: [], last: 0 };

  // ---------- màn hình ----------
  function show(id, on) { const e = $(id); if (e) e.hidden = !on; }
  function titleScreen() {
    show('dr-title', true); show('dr-pause', false); show('dr-over', false); show('dr-dockbar', false);
    $('btn-continue').hidden = !D.hasSave();
    // cảnh nền: thuyền đậu ở slot đầu của Greater Marrow
    const gm = root.DRDocks.byId['dock.greater-marrow'];
    if (gm && root.DRBoat.root) { const s = gm.slots[0]; DRBoat.root.position.set(s.x, -DRBoat.SINK, s.z); DRBoat.root.rotation.set(0, s.yaw, 0); }
  }
  function start(cont) {
    if (cont) { if (!D.load()) D.newGame(); } else { D.wipe(); D.newGame(); }
    D.s.spots = D.s.spots || {}; D.s.vars = D.s.vars || {}; D.s.caught = D.s.caught || {};
    // ?t và ?at chỉ áp cho lần vào ván đầu tiên sau khi tải trang (về bến đã lưu sau khi chìm thì bỏ qua)
    const first = !started; started = true;
    if (first && Q.has('t')) D.s.time = Math.floor(D.s.time) + Math.max(0, Math.min(0.9999, parseFloat(Q.get('t')) || 0));
    DRBoat.setTier(D.s.hullTier);
    show('dr-title', false);
    const at = first && Q.get('at');
    if (at) {
      const [x, z] = at.split(',').map(Number);
      D.s.dock = null; DRBoat.place(x, z, D.s.boat.yaw || 0); D.setMode('sail');
    } else if (D.s.dock) {
      DRDocks.dockAt(D.s.dock, D.s.dockSlot || 0, !cont);
    } else {
      DRBoat.place(D.s.boat.x, D.s.boat.z, D.s.boat.yaw); D.setMode('sail');
    }
    DRBoat.refresh(); DRBoat.applyLights();
    DRCamera.snap();
    if (root.DRAudio && D.mode !== 'dock') DRAudio.music(null);
  }

  function setPaused(on) {
    if (on && !(D.mode === 'sail' || D.mode === 'dock')) return;
    paused = on; show('dr-pause', on);
    if (on) $('btn-resume').focus();
  }
  function muteLabel() { $('btn-mute').textContent = root.DRAudio && DRAudio.isMuted() ? 'Bật tiếng' : 'Tắt tiếng'; }
  function toggleMute() {
    if (!root.DRAudio) return;
    DRAudio.setMuted(!DRAudio.isMuted());
    try { localStorage.setItem('dredge.muted', DRAudio.isMuted() ? '1' : '0'); } catch (e) { /* riêng tư */ }
    muteLabel();
  }

  $('btn-new').onclick = () => start(false);
  $('btn-continue').onclick = () => start(true);
  $('btn-resume').onclick = () => setPaused(false);
  $('btn-mute').onclick = toggleMute;
  $('btn-quit').onclick = () => { D.save(); setPaused(false); D.setMode('title'); };
  $('btn-reload').onclick = () => { D.setMode('title'); start(true); };
  $('btn-undock').onclick = () => { if (D.mode === 'dock') D.setMode('sail'); };
  $('btn-rest').onclick = () => { if (D.mode === 'dock' && !DRSky.forced) D.emit('passTime', root.DRRules.hoursToMorning(D.s.time), 'sleep'); };

  D.on('mode', (m, info) => {
    if (m === 'sail' && info.prev === 'dock') DRDocks.undock();
    show('dr-dockbar', m === 'dock' && !root.DRDock);
    if (m === 'dock') { const d = DRDocks.byId[D.s.dock]; document.querySelector('#dr-dockbar .name').textContent = d ? d.name : ''; }
    if (m === 'title') titleScreen();
    show('dr-over', m === 'over');
    if (m === 'over') { DRBoat.stop(); if (root.DRAudio) DRAudio.music(null); }
  });
  D.on('death', () => { if (D.mode === 'harvest' && root.DRSpots.cur) DRSpots.finish(false); D.setMode('over'); });
  D.on('cargo', () => DRBoat.refresh());
  D.on('load', () => DRBoat.refresh());

  // ---------- hành động ----------
  DRInput.on('interact', () => {
    if (!ready || paused) return;
    if (D.mode === 'sail') {
      if (DRDocks.near) DRDocks.interact();
      else if (D.view.nearSpot) DRSpots.interact();
    } else if (D.mode === 'dock' && !root.DRDock) D.setMode('sail');
  });
  DRInput.on('lights', () => { if (ready && !paused && (D.mode === 'sail' || D.mode === 'harvest')) DRBoat.toggleLights(); });
  DRInput.on('cargo', () => {
    if (!ready || paused || !(D.mode === 'sail' || D.mode === 'dock')) return;
    if (root.DRCargo && typeof DRCargo.open === 'function') DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang thuyền' });
  });
  DRInput.on('pause', () => { if (ready) setPaused(!paused); });
  DRInput.on('mute', toggleMute);

  // ---------- âm thanh nền ----------
  let audioT = 0;
  const NIGHT_AMB = { THE_MARROWS: 'region.marrows.wildlife.night', STELLAR_BASIN: 'region.stellarBasin.night', TWISTED_STRAND: 'region.twistedStrand.night' };
  const DAY_AMB = { THE_MARROWS: 'region.marrows.wildlife.day', GALE_CLIFFS: 'region.galeCliffs.day', STELLAR_BASIN: 'region.stellarBasin.day', TWISTED_STRAND: 'region.twistedStrand.day', DEVILS_SPINE: 'region.devilsSpine.day' };
  function ambience(x, z, zone) {
    if (!root.DRAudio) return;
    const day = DRSky.env.isDay, title = D.mode === 'title';
    DRAudio.loop('ambience.sea', 0.8);
    // [ĐỀ XUẤT] mòng biển ban ngày trong 40 m quanh đất
    DRAudio.loop('ambience.seagulls', !title && day && DRWorld.sdf(x, z) < 40 ? 0.8 : 0);
    for (const [zn, k] of Object.entries(DAY_AMB)) DRAudio.loop(k, !title && day && zone === zn ? 0.5 : 0);
    for (const [zn, k] of Object.entries(NIGHT_AMB)) DRAudio.loop(k, !title && !day && (zone === zn || (zn === 'THE_MARROWS' && !NIGHT_AMB[zone])) ? 0.7 : 0);
    if (title) DRAudio.music('music.title');
  }

  // ---------- vòng lặp ----------
  let acc = 0, last = 0, statT = 0;
  function frame(now) {
    root.requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now;
    if (!ready) return;
    const t0 = performance.now();
    const run = D.s && !paused && D.mode !== 'title';
    if (run) {
      const ax = DRInput.axes();
      if (DRDocks.docking && (Math.abs(ax.x) > 0.2 || Math.abs(ax.y) > 0.2)) DRDocks.cancel();
      DRBoat.input.x = ax.x; DRBoat.input.y = ax.y;
      acc += dt;
      let n = 0;
      while (acc >= DRBoat.DT && n++ < 8) { DRBoat.step(); acc -= DRBoat.DT; }
      if (n >= 8) acc = 0;
      statT += dt;
      if (statT > 1) { statT = 0; DRBoat.refresh(); }
    } else { DRBoat.moved = false; DRBoat.inputMag = 0; }
    const b = D.s && D.mode !== 'title' ? D.s.boat : { x: 10, z: -10, yaw: 0, vx: 0, vz: 0 };
    DRSky.update(run ? dt : 0, { x: b.x, z: b.z, moving: DRBoat.moved, inputMag: DRBoat.inputMag, cam: camera.position, paused: !run });
    if (D.s && D.mode !== 'title') DRBoat.update(run ? dt : 0, DRSky.env);
    DRSpots.update(run ? dt : 0, b.x, b.z);
    DRDocks.update(dt, b.x, b.z);
    DRCamera.update(dt, D.mode, DRSky.env);
    DRWater.update(dt, camera.position.x, camera.position.z, D.s && D.mode !== 'title' ? b : null, DRSky.env);
    DRWorld.stream(camera.position.x * 0.5 + b.x * 0.5, camera.position.z * 0.5 + b.z * 0.5);
    // mặt phẳng xa theo sương: đêm mù dày thì chẳng vẽ gì quá ~60 m
    const far = Math.min(1500, DRSky.env.fogFar + 60);
    if (Math.abs(camera.far - far) > 5) { camera.far = far; camera.updateProjectionMatrix(); }
    DRWorld.cull(camera.position, DRSky.env.fogFar);

    const zone = DRWorld.zoneAt(b.x, b.z), v = D.view;
    v.depthM = DRWorld.depth01(b.x, b.z) * root.DR_CONFIG.depthModifier;
    v.zoneId = zone; v.zone = DRWorld.ZONE_VI[zone] || zone;
    v.heading = ((-b.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0 = bắc (−z), theo chiều kim đồng hồ
    v.speed = DRBoat.knots(); v.isDay = DRSky.env.isDay;
    audioT += dt;
    if (audioT > 0.5) { audioT = 0; ambience(b.x, b.z, zone); }

    renderer.render(scene, camera);
    perf.frames++;
    perf.ms.push(dt * 1000); if (perf.ms.length > 240) perf.ms.shift();
    perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles;
    perf.cpu = perf.cpu || []; perf.cpu.push(performance.now() - t0); if (perf.cpu.length > 240) perf.cpu.shift();
  }

  // ---------- khởi động ----------
  async function boot() {
    try {
      if (Q.get('fresh') === '1') D.wipe();
      try { if (localStorage.getItem('dredge.muted') === '1' && root.DRAudio) DRAudio.setMuted(true); } catch (e) { /* riêng tư */ }
      muteLabel();
      await Promise.all([DRWorld.load(get, renderer, scene), DRBoat.load(get, scene)]);
      DRWater.init(scene, DRWorld);
      DRSky.init(scene, DRWorld);
      DRSpots.init(scene, DRWorld);
      DRDocks.init(DRWorld);
      DRCamera.init(camera);
      DRInput.bind(canvas);
      DRWorld.stream(10, -10);
      ready = true;
      titleScreen();
      // biên dịch shader trước khi bỏ màn tải để khung đầu không giật
      DRSky.update(0, { x: 10, z: -10, cam: camera.position, paused: true });
      DRCamera.update(0, 'title');
      renderer.compile(scene, camera);
      show('dr-loading', false);
      root.requestAnimationFrame(frame);
    } catch (e) {
      console.error('[DREDGE] load failed:', e);
      $('dr-loading').classList.add('err');
      document.querySelector('#dr-loading .msg').textContent = 'Không tải được biển: ' + (e && e.message || e);
    }
  }

  // ---------- móc kiểm thử ----------
  root.DR_DEBUG = {
    ready: () => ready,
    info() {
      const s = D.s, b = s && s.boat, inv = s && D.grid('INVENTORY');
      return {
        mode: D.mode, paused, x: b && b.x, z: b && b.z, yaw: b && b.yaw, vx: b && b.vx, vz: b && b.vz, w: b && b.w,
        speed: DRBoat.speed(), time: s && s.time, sanity: s && s.sanity, dock: s && s.dock, lightsOn: s && s.lightsOn,
        view: JSON.parse(JSON.stringify(D.view)), inv: inv ? inv.items.map(i => ({ id: i.id, size: i.size, fresh: i.fresh })) : [],
        damage: inv ? inv.damage.length : 0, docking: !!DRDocks.docking, auto: !!DRBoat.auto, harvesting: !!DRSpots.cur,
        cells: DRWorld.stats.cells, instances: DRWorld.stats.instances, sdf: b ? DRWorld.sdf(b.x, b.z) : null,
        timeMode: DRSky.env.timeMode
      };
    },
    teleport(x, z, yaw) {
      if (D.mode === 'dock') { D.setMode('sail'); DRBoat.auto = null; }
      D.s.dock = null; DRBoat.place(x, z, yaw == null ? D.s.boat.yaw : yaw); DRCamera.snap();
      DRWorld.stream(x, z);
    },
    setTime(f) { D.s.time = Math.floor(D.s.time) + f; },
    catchNow(r) { DRSpots.finish(r == null ? { caught: true } : r); },
    hit() { DRBoat.damage(2); return D.grid('INVENTORY').damage.length; },
    give: (id, extra) => D.give(id, extra),
    spotNear(ids, x, z) {
      const sp = DRSpots.nearest(s => (s.d.items || []).concat(s.d.nightItems || []).some(i => ids.includes(i)), x, z);
      return sp && { id: sp.id, x: sp.x, z: sp.z, r: sp.r, items: sp.d.items, night: sp.d.nightItems };
    },
    perf() {
      const a = perf.ms.slice(-120), avg = a.reduce((s, v) => s + v, 0) / (a.length || 1);
      const c = (perf.cpu || []).slice(-120), cpu = c.reduce((s, v) => s + v, 0) / (c.length || 1);
      return { avgMs: avg, maxMs: Math.max(...a), cpuMs: cpu, cpuMax: Math.max(...c), calls: perf.calls, tris: perf.tris, frames: perf.frames, programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
    sdf: (x, z) => DRWorld.sdf(x, z), renderer, scene, camera
  };

  boot();
})(window);
