// Boot, shared state G, main loop, URL params and test hooks. See README.md for the contracts.

import * as THREE from '../vendor/three.module.min.js';
import { TICK, MECH_ORDER, MECHS, DIFFICULTY, BOT_NAMES, MODES } from './data.js';
import { MAPS, THEMES, pickArena, compileMap, mapsFor } from './maps.js';
import { createMatch, step, summary } from './sim.js';
import { allInputs } from './bots.js';
import { mulberry } from './rng.js';
import { makeTextures } from './gfx/tex.js';
import { makeWorld, makeEnvironment } from './gfx/world.js';
import { makeMechs } from './gfx/mechs.js';
import { makeFx } from './gfx/fx.js';
import { makePost } from './gfx/post.js';
import { makeAudio } from './audio.js';
import { makeUI } from './ui.js';
import { makeInput } from './input.js';
import { makeMeta } from './meta.js';
import { makeOnline } from './online.js';
import { matchOptions } from './netstate.js';

const QUALITY = {
  low:    { name: 'low',    scale: 0.7,  dpr: 1,   shadow: 1024, tex: 512,  foliage: 0.3,  particles: 350,  lights: 0, ao: false, bloom: true, bloomLevels: 3, bloomGain: 0.5, fxaa: false },
  medium: { name: 'medium', scale: 0.85, dpr: 1.5, shadow: 2048, tex: 1024, foliage: 0.65, particles: 800,  lights: 2, ao: true,  bloom: true, bloomLevels: 5, bloomGain: 0.75, fxaa: true },
  high:   { name: 'high',   scale: 1,    dpr: 2,   shadow: 4096, tex: 2048, foliage: 1,    particles: 1400, lights: 3, ao: true,  bloom: true, bloomLevels: 6, bloomGain: 0.85, fxaa: true },
};
const CAM = { fov: 32, pitch: 57 * Math.PI / 180, width: 33.5, minDepth: 17.5 };

const errors = (window.__errors = []);
const fail = (tag, err) => { const msg = `[${tag}] ${err && err.stack ? err.stack : err}`; if (errors.length < 50) errors.push(msg); console.error(msg); };
window.addEventListener('error', (e) => fail('window', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fail('promise', e.reason));

function makeBus() {
  const map = {};
  return {
    on(topic, fn) { (map[topic] || (map[topic] = [])).push(fn); },
    emit(topic, data) { for (const fn of map[topic] || []) { try { fn(data); } catch (err) { fail('bus ' + topic, err); } } },
  };
}

const qs = new URLSearchParams(location.search);
const params = {
  autostart: qs.has('autostart'), noaudio: qs.has('noaudio'), manual: qs.has('manual'), spectate: qs.has('spectate'),
  q: qs.get('q'), mode: qs.get('mode'), theme: qs.get('theme'), seed: qs.has('seed') ? Number(qs.get('seed')) : null, bots: qs.get('bots'), mech: qs.get('mech'), map: qs.get('map'),
};

const bootBar = document.querySelector('#boot .bar i'), bootMsg = document.getElementById('boot-msg');
const progress = (frac, msg) => { if (bootBar) bootBar.style.width = Math.round(frac * 100) + '%'; if (bootMsg && msg) bootMsg.textContent = msg; return new Promise((r) => setTimeout(r, 0)); };

async function boot() {
  const canvas = document.getElementById('view');
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) throw new Error('Trình duyệt này không hỗ trợ WebGL2. Hãy mở bằng Chrome, Edge, Firefox hoặc Safari bản mới và bật tăng tốc phần cứng.');

  const meta = makeMeta(), save = meta.get();
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  // A saved tier counts only when the player picked it in settings; otherwise phones start on low and everything else on medium.
  const st = save.settings || (save.settings = {});
  const qName = QUALITY[params.q] ? params.q : (st.qualityChosen && QUALITY[st.quality] ? st.quality : (phone ? 'low' : 'medium'));
  const Q = QUALITY[qName];
  st.quality = qName;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = Q.name === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x0b1a0d, 1);
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, 220);
  const G = (window.__G = { THREE, params, quality: Q, bus: makeBus(), renderer, scene, camera, match: null, me: 0, meta, gfx: {}, mode: 'boot', choice: null });

  await progress(0.1, 'Nung thép');
  const tex = (G.gfx.tex = makeTextures(renderer, Q.tex));
  for (const n of ['pave', 'ruin', 'metal', 'wood']) tex.bake(n);
  scene.environment = makeEnvironment(renderer);

  await progress(0.3, 'Dựng đấu trường');
  let world = null, worldKey = null, arena = null;
  function useMap(key, theme) {
    theme = THEMES[theme] ? theme : MAPS[key].theme;
    if (worldKey === key + '/' + theme) return;
    if (world) { scene.remove(world.group); world.dispose(); }
    const map = compileMap(key, theme);
    world = G.gfx.world = makeWorld(G, map, tex); worldKey = key + '/' + theme; arena = { map: key, theme };
    scene.add(world.group);
    renderer.setClearColor(world.theme.clear, 1);
    if (G.gfx.post) G.gfx.post.grade(world.theme);
  }
  useMap(MAPS[params.map] ? params.map : (MAPS[save.map] ? save.map : 'denrung'), params.theme || save.theme);

  await progress(0.55, 'Lắp ráp cỗ máy');
  const mechs = (G.gfx.mechs = makeMechs(G, tex));
  const fx = (G.gfx.fx = makeFx(G, mechs));
  scene.add(mechs.group, fx.group);
  const post = (G.gfx.post = makePost(renderer, Q));
  post.grade(world.theme);
  G.portrait = (key, team, paint) => mechs.portrait(key, team, paint);

  let governor = 1, cssW = 1, cssH = 1;
  function resize() {
    cssW = window.innerWidth; cssH = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, Q.dpr) * Q.scale * governor;
    renderer.setPixelRatio(pr); renderer.setSize(cssW, cssH, false);
    const w = Math.floor(cssW * pr), h = Math.floor(cssH * pr);
    post.resize(w, h);
    camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
    fx.setPointScale(h, CAM.fov);
  }
  window.addEventListener('resize', resize);
  resize();

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), hit = new THREE.Vector3(), pv = new THREE.Vector3();
  G.groundAt = (cx, cy) => {
    ndc.set((cx / cssW) * 2 - 1, -(cy / cssH) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(aimPlane, hit) ? [hit.x, hit.z] : [0, 0];
  };
  G.project = (x, y, z) => {
    pv.set(x, y, z).project(camera);
    return { x: (pv.x * 0.5 + 0.5) * cssW, y: (-pv.y * 0.5 + 0.5) * cssH, visible: pv.z < 1 && Math.abs(pv.x) < 1.15 && Math.abs(pv.y) < 1.15 };
  };

  await progress(0.7, 'Lên dây âm thanh');
  G.audio = await makeAudio(G, (f) => progress(0.7 + f * 0.15));
  if (save.settings) { G.audio.setVolume(save.settings.volume ?? 0.8); G.audio.setMusic(save.settings.music ?? 0.6); }
  G.input = makeInput(G);
  G.online = makeOnline(G);
  await progress(0.9, 'Mở cổng đấu trường');
  G.ui = makeUI(G);

  const focus = new THREE.Vector3(), camOff = new THREE.Vector3();
  let shot = null, time = 0, acc = 0, intensity = 0, overAt = 0;
  // net: null for a local match, 'host' when this machine runs the simulation for a room, 'guest' when it only renders the host's snapshots.
  let net = null, netAlpha = 1;

  function startMatch(choice, attract) {
    const seed = params.seed !== null ? params.seed : (Date.now() & 0x7fffffff);
    const rng = mulberry(seed ^ 0x51ed);
    const diff = DIFFICULTY[choice.diff] ? choice.diff : 'normal';
    // The menu's background match keeps the arena already built; a real match builds what was chosen ('random' resolves from the seed).
    const mode = !attract && MODES[choice.mode] ? choice.mode : 'tdm';
    if (!attract) { const a = pickArena(choice.map, choice.theme, seed, mode); useMap(a.map, a.theme); }
    else if (!mapsFor(mode).includes(arena.map)) useMap(mapsFor(mode)[0], arena.theme);
    const names = BOT_NAMES.slice().sort(() => rng() - 0.5);
    const pick = MECHS[choice.mech] ? choice.mech : MECH_ORDER[0];
    const bot = attract || params.spectate;
    const roster = [{ team: 0, mech: pick, name: bot ? names.pop() : (meta.get().name || 'Bạn'), bot, diff, mods: attract ? null : choice.mods, paint: attract ? null : choice.paint }];
    const shuffled = (list) => list.slice().sort(() => rng() - 0.5);
    const allies = shuffled(MECH_ORDER.filter((k) => k !== pick)), foes = shuffled(MECH_ORDER);
    for (let i = 0; i < 4; i++) roster.push({ team: 0, mech: allies[i], name: names.pop(), bot: true, diff });
    if (mode === 'trum') roster.push({ team: 1, mech: 'titan', name: 'Cự Thần', bot: true, diff });
    else for (let i = 0; i < 5; i++) roster.push({ team: 1, mech: foes[i], name: names.pop(), bot: true, diff });
    mechs.clear(); fx.clear();
    G.match = createMatch({ map: arena.map, theme: arena.theme, seed, roster, mode });
    net = null; G.choice = choice;
    enterMatch(0, attract);
    if (!attract) { G.audio.setScene && G.audio.setScene('match'); G.ui.showHUD(); G.bus.emit('match:start', G.match); G.audio.ui('start'); }
  }

  function enterMatch(me, attract) {
    G.me = me; G.mode = attract ? 'attract' : 'match'; acc = 0; overAt = 0;
    if (G.match.mode === 'tudo') G.match.units[me].color = 0;
    const u = G.match.units[me]; focus.set(u.x, 0, u.z);
    document.body.classList.toggle('in-match', !attract);
  }

  G.bus.on('net:start', ({ rosterData, mySlot, role, mirror }) => {
    useMap(rosterData.map, rosterData.theme);
    mechs.clear(); fx.clear();
    G.match = role === 'host' ? createMatch(matchOptions(rosterData)) : mirror;
    net = role; G.paused = false; G.choice = null;
    enterMatch(mySlot, false);
    G.audio.setScene && G.audio.setScene('match'); G.ui.hideMenu(); G.ui.showHUD(); G.bus.emit('match:start', G.match); G.audio.ui('start');
  });
  G.bus.on('net:lost', (e) => { if (!net) return; net = null; G.ui.hideHUD(); startMatch(defaultChoice(), true); G.ui.showMenu(); if (G.ui.toast) G.ui.toast((e && e.reason) || 'Mất kết nối với chủ phòng'); });

  function tick() {
    const m = G.match, me = m.units[G.me];
    const human = {};
    if (!me.bot) human[me.id] = G.input.sample(me);
    if (net === 'host') Object.assign(human, G.online.remoteInputs());
    step(m, allInputs(m, human));
    if (net === 'host') G.online.afterStep(m);
    dispatch(m);
  }

  // Guests do not simulate: they send their input and replay what the host's snapshots and events say.
  function guestFrame() {
    const me = G.online.mirror.units[G.me];
    G.online.sendInput(G.input.sample(me));
    netAlpha = G.online.frame(performance.now()).alpha;
    G.match = G.online.mirror;
    dispatch(G.match);
  }

  function dispatch(m) {
    const live = G.mode === 'match';
    for (const e of m.events) {
      try { mechs.event(e); fx.event(e, m); if (live) { G.audio.event(e, m, G.me); G.ui.event(e); } } catch (err) { fail('event ' + e.t, err); }
      if (e.t === 'hit' || e.t === 'explode') intensity = Math.min(1, intensity + 0.04);
      G.bus.emit('sim', e);
    }
    if (m.over && !overAt) overAt = time;
  }

  function endMatch() {
    const m = G.match, sum = summary(m);
    G.mode = 'result';
    const rewards = meta.applyResult(sum, G.me);
    G.bus.emit('match:over', sum);
    G.audio.ui(sum.winner === m.units[G.me].team ? 'win' : 'lose');
    G.ui.hideHUD(); G.ui.showResult(sum, rewards);
  }

  function advance(dt) {
    const m = G.match;
    if (!m || (G.paused && !net)) return;
    if (G.mode === 'match' || G.mode === 'attract') {
      if (net === 'guest') guestFrame();
      else {
        acc += dt;
        for (let n = 0; acc >= TICK && n < 4; n++) { acc -= TICK; if (!m.over) tick(); }
        if (acc > TICK) acc = 0;
      }
      if (m.over && overAt && time - overAt > (G.mode === 'attract' ? 3 : 1.6)) { if (G.mode === 'attract') startMatch(G.choice || defaultChoice(), true); else endMatch(); }
    }
  }

  function placeCamera(dt) {
    const m = G.match;
    let pitch = CAM.pitch, yaw = 0, dist = Math.max(CAM.width / (2 * Math.tan(CAM.fov * Math.PI / 360) * camera.aspect), CAM.minDepth / (2 * Math.tan(CAM.fov * Math.PI / 360)));
    if (shot) { focus.set(shot.x || 0, shot.y || 0, shot.z || 0); pitch = (shot.pitch ?? 57) * Math.PI / 180; yaw = (shot.yaw || 0) * Math.PI / 180; dist = shot.dist || dist; }
    else if (m) {
      let tx, tz;
      if (G.mode === 'attract') {
        let sx = 0, sz = 0, n = 0;
        for (const u of m.units) if (u.alive) { sx += u.x; sz += u.z; n++; }
        tx = n ? sx / n : 0; tz = n ? sz / n : 0; dist *= 1.15;
      } else { const u = m.units[G.me]; tx = u.x + Math.cos(u.aim) * 2.4; tz = u.z + Math.sin(u.aim) * 2.4 + 1.2; }
      const k = Math.min(1, dt * (G.mode === 'attract' ? 0.8 : 5.5));
      focus.x += (tx - focus.x) * k; focus.z += (tz - focus.z) * k;
      focus.x = Math.max(-m.map.hw + 9, Math.min(m.map.hw - 9, focus.x)); focus.z = Math.max(-m.map.hd + 5, Math.min(m.map.hd - 2, focus.z));
    }
    camOff.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    const s = fx.shake * fx.shake * 0.5;
    camera.position.copy(focus).add(camOff);
    camera.position.x += (Math.sin(time * 71) + Math.sin(time * 113)) * s; camera.position.y += Math.sin(time * 97) * s;
    camera.lookAt(focus.x, focus.y, focus.z);
    world.focus(focus.x, focus.z + 2);
  }

  const stats = (window.__stats = { fps: 0, ms: 0, calls: 0, tris: 0, quality: Q.name, scale: 1 });
  let slow = 0, fast = 0;
  function govern(ms) {
    if (params.manual || params.q) return;
    if (ms > 20) { slow++; fast = 0; } else if (ms < 13) { fast++; slow = 0; } else { slow = 0; fast = 0; }
    if (slow > 40) {
      slow = 0;
      if (governor > 0.62) { governor = Math.max(0.6, governor - 0.12); resize(); }
      else if (post.state.ao) post.state.ao = false;
      else if (post.state.fxaa) post.state.fxaa = false;
      G.bus.emit('quality:auto', { scale: governor });
    } else if (fast > 240 && governor < 1) { fast = 0; governor = Math.min(1, governor + 0.06); resize(); }
    stats.scale = governor;
  }

  const once = {};
  const guard = (tag, fn) => { try { fn(); } catch (err) { if (!once[tag]) { once[tag] = 1; fail('loop ' + tag, err); } } };

  function draw(dt) {
    const m = G.match, alpha = net === 'guest' ? netAlpha : params.manual ? 1 : Math.min(1, acc / TICK);
    G.alpha = alpha;
    guard('world', () => world.update(time, m));
    guard('mechs', () => { if (m) mechs.sync(m, alpha, dt, time); });
    guard('fx', () => fx.update(m, alpha, dt, time));
    guard('camera', () => placeCamera(dt));
    if (m && G.mode === 'match') {
      guard('audio', () => { const u = m.units[G.me]; G.audio.setListener(u.x, u.z); G.audio.update(dt, intensity); });
      guard('ui', () => G.ui.update(dt));
    }
    intensity = Math.max(0, intensity - dt * 0.12);
    renderer.info.reset();
    guard('render', () => post.render(scene, camera));
    stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles;
  }

  let last = performance.now(), ema = 16;
  function frame(now) {
    const raw = now - last; last = now;
    const dt = Math.min(0.1, raw / 1000);
    ema += (raw - ema) * 0.05; stats.ms = ema; stats.fps = 1000 / ema;
    if (!params.manual) { time += dt; advance(dt); govern(raw); }
    draw(dt);
  }

  const defaultChoice = () => { const s = meta.get(); return { mech: params.mech || s.mech || 'trau', diff: params.bots || s.diff || 'normal', map: params.map || s.map || 'denrung', theme: params.theme || s.theme || null, mode: params.mode || s.mode || 'tdm' }; };
  G.bus.on('ui:play', (choice) => { G.paused = false; startMatch(choice, false); });
  G.bus.on('ui:menu', () => { G.paused = false;
    // Leaving an online match or its result screen goes back to the room, not to the solo menu.
    if (net) { const stay = G.match && G.match.over; net = null; if (stay) G.online.toLobby(); else G.online.leave(); G.ui.hideHUD(); startMatch(defaultChoice(), true); G.audio.setScene && G.audio.setScene('menu'); if (stay && G.ui.showLobby) G.ui.showLobby(); else G.ui.showMenu(); return; } G.audio.setScene && G.audio.setScene('menu'); G.ui.hideHUD(); startMatch(defaultChoice(), true); G.ui.showMenu(); });
  G.bus.on('ui:pause', (p) => { G.paused = !!(p && p.paused); });
  G.bus.on('quality:set', (q) => { if (!QUALITY[q] || q === Q.name) return; const s = meta.get(); s.settings.quality = q; s.settings.qualityChosen = true; meta.save(); location.reload(); });
  const wake = () => { G.audio.resume(); };
  window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'match' && !G.ui.paused) G.ui.showPause(); last = performance.now(); });

  window.__step = (n = 1, render = true) => {
    // Ticks that are not drawn still age the effects: otherwise every particle spawned during a long silent step is alive in the next frame.
    for (let i = 0; i < n; i++) { time += TICK; if (G.match && !G.match.over) tick(); else advance(0); if (G.match && !(render && i === n - 1)) fx.update(G.match, 1, TICK, time); }
    if (render) { draw(TICK); const gl = renderer.getContext(), px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return G.match ? G.match.tick : 0;
  };
  window.__setShot = (s) => { shot = s || null; };
  window.__input = (v) => G.input.script(v);
  window.__start = (choice, attract) => startMatch({ ...defaultChoice(), ...(choice || {}) }, !!attract);

  if (params.autostart) startMatch(defaultChoice(), false);
  else { startMatch(defaultChoice(), true); G.audio.setScene && G.audio.setScene('menu'); G.ui.showMenu(); }

  await progress(1, 'Sẵn sàng');
  draw(0.016);
  renderer.setAnimationLoop(frame);
  document.getElementById('boot').classList.add('done');
  window.__ready = true;
}

boot().catch((err) => {
  fail('boot', err);
  const f = document.getElementById('fatal');
  if (f) { f.style.display = 'block'; f.textContent = 'Không khởi động được trò chơi.\n' + (err && err.message ? err.message : err); }
});
