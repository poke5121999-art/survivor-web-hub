// Boot, shared state G, main loop, URL params and test hooks. See README.md for the contracts.

import * as THREE from '../vendor/three.module.min.js';
import { TICK, MECH_ORDER, MECHS, DIFFICULTY, BOT_NAMES, MODES, cleanLv, TEAM_SIZE, cleanSize } from './data.js';
import { MAPS, THEMES, pickArena, compileMap, mapsFor } from './maps.js';
import { createMatch, step, summary } from './sim.js';
import { allInputs } from './bots.js';
import { mulberry } from './rng.js';
import { makeTextures } from './gfx/tex.js';
import { makeWorld, makeEnvironment } from './gfx/world.js';
import { makeMechs } from './gfx/mechs.js';
import { makeFx } from './gfx/fx.js';
import { makePost, renderScale, sharpenFor } from './gfx/post.js';
import { makeAudio } from './audio.js';
import { makeUI } from './ui.js';
import { makeInput } from './input.js';
import { makeFullscreen } from './fullscreen.js';
import { makeMeta } from './meta.js';
import { makeOnline } from './online.js';
import { matchOptions } from './netstate.js';
import { createRig, HEIGHTS, zoomOf, longAim } from './camera.js';

const QUALITY = {
  low:    { name: 'low',    shadow: 1024, tex: 512,  foliage: 0.3,  particles: 350,  lights: 0, ao: false, bloom: true, bloomLevels: 3, bloomGain: 0.3, fxaa: false },
  medium: { name: 'medium', shadow: 2048, tex: 1024, foliage: 0.65, particles: 800,  lights: 2, ao: true,  bloom: true, bloomLevels: 5, bloomGain: 0.45, fxaa: true },
  high:   { name: 'high',   shadow: 4096, tex: 2048, foliage: 1,    particles: 1400, lights: 3, ao: true,  bloom: true, bloomLevels: 6, bloomGain: 0.5, fxaa: true },
};
// Test hook ?legacyres=1: the resolution rule before Addendum 9, [scale, dpr cap] per tier: pixel ratio = min(dpr, cap) * scale * governor.
const LEGACY_RES = { low: [0.7, 1], medium: [0.85, 1.5], high: [1, 2] };
const SHARP_MODES = [
  { key: 'auto', name: 'Tự động', hint: 'Cân bằng độ nét và pin: máy tự hạ độ nét khi hình giật' },
  { key: 'sharp', name: 'Nét', hint: 'Sắc hơn, hao pin hơn một chút, máy ấm lên khi chơi lâu' },
  { key: 'max', name: 'Rất nét', hint: 'Rất nét: hình sắc nhất, máy nóng và hao pin hơn' },
];
const BRIGHT_RANGE = [0.8, 1.2];
// "Giảm chớp sáng" starts on for touch devices unless the player has chosen: see README, "Eye comfort".
const CALM_ON_TOUCH = true;
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
  q: qs.get('q'), sharp: qs.get('sharp'), bright: qs.has('bright') ? Number(qs.get('bright')) : null, calm: qs.has('calm') ? qs.get('calm') !== '0' : null, sharpen: qs.get('sharpen') === '0' ? 0 : 1, legacyres: qs.has('legacyres'), govms: Number(qs.get('govms')) || 0, camh: qs.get('camh'), aimpan: qs.has('aimpan') ? qs.get('aimpan') !== '0' : null, side: qs.get('side') === '1' ? 1 : 0, mode: qs.get('mode'), size: qs.get('size'), theme: qs.get('theme'), seed: qs.has('seed') ? Number(qs.get('seed')) : null, bots: qs.get('bots'), mech: qs.get('mech'), map: qs.get('map'),
};

const bootBar = document.querySelector('#boot .bar i'), bootMsg = document.getElementById('boot-msg');
const progress = (frac, msg) => { if (bootBar) bootBar.style.width = Math.round(frac * 100) + '%'; if (bootMsg && msg) bootMsg.textContent = msg; return new Promise((r) => setTimeout(r, 0)); };

async function boot() {
  const canvas = document.getElementById('view');
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) throw new Error('Trình duyệt này không hỗ trợ WebGL2. Hãy mở bằng Chrome, Edge, Firefox hoặc Safari bản mới và bật tăng tốc phần cứng.');

  const meta = makeMeta(), save = meta.get();
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
  // meta.js drops settings keys it does not know when it loads, so the player's own picks (tier, sharpness) are kept under keys of their own.
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const st = save.settings || (save.settings = {});
  const chosen = lsGet('dtt.quality.v1');
  // Without a pick: phones with at least 6 GB (Chrome reports deviceMemory, capped at 8) start on medium, other phones on low, everything else on medium. The governor sheds cost from there.
  const qName = QUALITY[params.q] ? params.q : (QUALITY[chosen] ? chosen : (phone && (params.legacyres || !((navigator.deviceMemory || 0) >= 6)) ? 'low' : 'medium'));
  const Q = QUALITY[qName];
  st.quality = qName;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = Q.name === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x0b1a0d, 1);
  renderer.info.autoReset = false;

  let shadowSize = Q.shadow;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 1, 220);
  const G = (window.__G = { THREE, params, quality: Q, bus: makeBus(), renderer, scene, camera, match: null, me: 0, meta, gfx: {}, mode: 'boot', choice: null });

  G.fullscreen = makeFullscreen(G);
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
    applyShadow();
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
  // Portraits are rendered at device pixels (128 px per DPR 1, up to 384): a 128 px image shown at 100 CSS px on a DPR 3 phone is blurry.
  const portraitSize = () => (params.legacyres ? 128 : Math.round(128 * Math.min(3, Math.max(1, window.devicePixelRatio || 1))));
  G.portrait = (key, team, paint, a, b) => {
    const opt = a && typeof a === 'object' ? { ...a } : typeof a === 'number' ? { size: a } : { glow: a || undefined, decal: b || undefined };
    if (!opt.size) opt.size = portraitSize();
    return mechs.portrait(key, team, paint, opt);
  };

  // "Hình ảnh" settings. Brightness is a display exposure multiplier; calm ("Giảm chớp sáng") switches the flash table to its second column. Both apply live.
  const touchDefault = phone || matchMedia('(pointer: coarse)').matches;
  const look = { brightness: 1, calm: false };
  const cleanBright = (v) => (Number.isFinite(v) ? Math.round(Math.min(BRIGHT_RANGE[1], Math.max(BRIGHT_RANGE[0], v)) * 100) / 100 : 1);
  function applyLook(save) {
    post.setBright(look.brightness); fx.setCalm(look.calm);
    if (save) { st.brightness = look.brightness; st.calm = look.calm; meta.save(); }
  }
  look.brightness = cleanBright(params.bright !== null ? params.bright : st.brightness);
  look.calm = params.calm !== null ? params.calm : (typeof st.calm === 'boolean' ? st.calm : touchDefault && CALM_ON_TOUCH);
  G.look = {
    get: () => ({ brightness: look.brightness, calm: look.calm }),
    set: (o) => { if (o && o.brightness !== undefined) look.brightness = cleanBright(Number(o.brightness)); if (o && o.calm !== undefined) look.calm = !!o.calm; applyLook(true); },
    range: BRIGHT_RANGE,
  };
  applyLook(false);

  // "Camera" settings: height (null = by screen: tablets far, everything else mid) and the long-aim pan. The rig itself lives in camera.js.
  const rig = createRig();
  const hasHeight = (k) => HEIGHTS.some((h) => h.key === k);
  const camSet = { height: hasHeight(params.camh) ? params.camh : hasHeight(st.camHeight) ? st.camHeight : null, aimPan: params.aimpan !== null ? params.aimpan : st.aimPan !== false };
  const heightNow = () => camSet.height || (touchDefault && !phone ? 'far' : 'mid');
  G.cam = {
    heights: HEIGHTS,
    get sign() { return G.mode === 'match' ? rig.s.sign : 1; },
    get: () => ({ height: heightNow(), aimPan: camSet.aimPan, ...rig.state() }),
    set(o) {
      if (o && hasHeight(o.height)) camSet.height = st.camHeight = o.height;
      if (o && typeof o.aimPan === 'boolean') camSet.aimPan = st.aimPan = o.aimPan;
      meta.save();
    },
    panTo(x, z) { if (G.mode === 'match') rig.pan({ x, z }); },
    panEnd() { rig.pan(null); },
    get panning() { return !!rig.s.free; },
  };

  let sharpMode = SHARP_MODES.some((m) => m.key === params.sharp) ? params.sharp : null;
  if (!sharpMode) { const v = lsGet('dtt.sharp.v1'); sharpMode = SHARP_MODES.some((m) => m.key === v) ? v : (SHARP_MODES.some((m) => m.key === st.sharpness) ? st.sharpness : 'auto'); }
  let resG = 1, governor = 1, cssW = 1, cssH = 1;
  const stats = (window.__stats = { fps: 0, ms: 0, calls: 0, tris: 0, quality: Q.name, scale: 1, dpr: 1, buffer: [0, 0], governor: 0, governorStep: '', sharpness: sharpMode });
  function resize() {
    const vs = G.fullscreen.size(); cssW = Math.max(1, Math.round(vs.w)); cssH = Math.max(1, Math.round(vs.h));
    const dpr = window.devicePixelRatio || 1, legacy = params.legacyres;
    const want = legacy ? Math.min(dpr, LEGACY_RES[Q.name][1]) * LEGACY_RES[Q.name][0] * governor : renderScale(sharpMode, Q.name, dpr, resG);
    // Whole device pixels: floor(css * pr) lands on round(css * want); the 0.001 keeps float error from dropping a pixel.
    const pr = (Math.round(cssW * want) + 0.001) / cssW;
    renderer.setPixelRatio(pr); renderer.setSize(cssW, cssH, false);
    const w = canvas.width, h = canvas.height;
    post.resize(w, h);
    if (!legacy) post.state.fxaa = Q.fxaa && w / cssW >= 1.45;
    post.setSharpen(legacy || !params.sharpen ? 0 : sharpenFor(w / cssW, dpr));
    camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
    fx.setPointScale(h, CAM.fov);
    stats.scale = w / cssW; stats.dpr = dpr; stats.buffer = [w, h];
  }
  G.sharpness = {
    modes: SHARP_MODES,
    get: () => sharpMode,
    set(m) {
      if (!SHARP_MODES.some((x) => x.key === m)) return false;
      sharpMode = m; stats.sharpness = m; lsSet('dtt.sharp.v1', m);
      const s = meta.get(); if (s.settings) { s.settings.sharpness = m; meta.save(); }
      resize(); return true;
    },
  };
  G.fullscreen.onviewport(resize);
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
  let shot = null, time = 0, acc = 0, intensity = 0, overAt = 0, lastInp = null, wasMoving = false;
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
    // ?side=1 (test hook) puts the player's team on the other end of the map.
    const mine = mode === 'trum' ? 0 : params.side, theirs = 1 - mine;
    const roster = [{ team: mine, mech: pick, name: bot ? names.pop() : (meta.get().name || 'Bạn'), bot, diff, mods: attract ? null : choice.mods, paint: attract ? null : choice.paint, glow: attract ? null : choice.glow, decal: attract ? null : choice.decal }];
    // Bots grow with the player at half pace, so upgrades are felt and a maxed mech still meets a fight.
    const botMods = { lv: cleanLv(!attract && choice.mods && choice.mods.lv).map((l) => Math.floor(l / 2)) };
    const shuffled = (list) => list.slice().sort(() => rng() - 0.5);
    const allies = shuffled(MECH_ORDER.filter((k) => k !== pick)), foes = shuffled(MECH_ORDER);
    // Săn trùm always sends TEAM_SIZE hunters at the boss; the other modes follow the chosen size (free-for-all: 2 * size mechs in all).
    const size = mode === 'trum' ? TEAM_SIZE : cleanSize(choice.size);
    for (let i = 0; i < size - 1; i++) roster.push({ team: mine, mech: allies[i], name: names.pop(), bot: true, diff, mods: botMods });
    if (mode === 'trum') roster.push({ team: 1, mech: 'titan', name: 'Cự Thần', bot: true, diff });
    else for (let i = 0; i < size; i++) roster.push({ team: theirs, mech: foes[i], name: names.pop(), bot: true, diff, mods: botMods });
    mechs.clear(); fx.clear();
    G.match = createMatch({ map: arena.map, theme: arena.theme, seed, roster, mode });
    net = null; G.choice = choice;
    enterMatch(0, attract);
    warmUntil = performance.now() + 3000;
    if (!attract) { G.audio.setScene && G.audio.setScene('match'); G.ui.showHUD(); G.bus.emit('match:start', G.match); G.audio.ui('start'); }
  }

  function enterMatch(me, attract) {
    G.me = me; G.mode = attract ? 'attract' : 'match'; acc = 0; overAt = 0;
    if (G.match.mode === 'tudo') G.match.units[me].color = 0;
    const u = G.match.units[me]; focus.set(u.x, 0, u.z);
    rig.reset(G.match, me); lastInp = null; wasMoving = false;
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
    if (!me.bot) human[me.id] = lastInp = G.input.sample(me);
    if (net === 'host') Object.assign(human, G.online.remoteInputs());
    const inputs = allInputs(m, human);
    if (window.__botHook) window.__botHook(m, inputs);
    step(m, inputs);
    if (net === 'host') G.online.afterStep(m);
    dispatch(m);
  }

  // Guests do not simulate: they send their input and replay what the host's snapshots and events say.
  function guestFrame() {
    const me = G.online.mirror.units[G.me];
    G.online.sendInput(lastInp = G.input.sample(me));
    netAlpha = G.online.frame(performance.now()).alpha;
    G.match = G.online.mirror;
    dispatch(G.match);
  }

  function dispatch(m) {
    const live = G.mode === 'match';
    for (const e of m.events) {
      rig.event(e, G.me);
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
    const m = G.match, half = Math.tan(CAM.fov * Math.PI / 360);
    let pitch = CAM.pitch, yaw = 0, sign = 1, dist = Math.max(CAM.width / (2 * half * camera.aspect), CAM.minDepth / (2 * half));
    if (shot) { focus.set(shot.x || 0, shot.y || 0, shot.z || 0); pitch = (shot.pitch ?? 57) * Math.PI / 180; yaw = (shot.yaw || 0) * Math.PI / 180; dist = shot.dist || dist; }
    else if (m && G.mode === 'attract') {
      let sx = 0, sz = 0, n = 0;
      for (const u of m.units) if (u.alive) { sx += u.x; sz += u.z; n++; }
      dist *= 1.15;
      const k = 1 - Math.exp(-dt * 0.8);
      focus.x += ((n ? sx / n : 0) - focus.x) * k; focus.z += ((n ? sz / n : 0) - focus.z) * k;
      focus.x = Math.max(-m.map.hw + 9, Math.min(m.map.hw - 9, focus.x)); focus.z = Math.max(-m.map.hd + 5, Math.min(m.map.hd - 2, focus.z));
    } else if (m) {
      dist *= zoomOf(heightNow());
      const me = m.units[G.me], h = dist * half, depth = h / Math.sin(pitch);
      // The minimap drag ends when the player starts to drive.
      const moving = !!lastInp && Math.hypot(lastInp.mx, lastInp.mz) > 0.2;
      if (moving && !wasMoving) rig.pan(null);
      wasMoving = moving;
      rig.update(dt, m, G.me, { hw: h * camera.aspect, far: depth, near: depth }, camSet.aimPan ? longAim(me, G.input.aimState()) : null, G.input.lock);
      focus.x = rig.s.x; focus.z = rig.s.z; yaw = rig.s.yaw; sign = rig.s.sign;
    }
    camOff.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist);
    const sk = meta.get().settings.shake, s = fx.shake * fx.shake * 0.5 * (sk === 'off' ? 0 : sk === 'strong' ? 1 : 0.5);
    camera.position.copy(focus).add(camOff);
    stats.shake = s;
    if (s > 0) { camera.position.x += (Math.sin(time * 71) + Math.sin(time * 113)) * s; camera.position.y += Math.sin(time * 97) * s; }
    camera.lookAt(focus.x, focus.y, focus.z);
    world.focus(focus.x, focus.z + 2 * sign);
  }

  // Governor: when frames are slow, cost is shed down this list in order, and given back in reverse order.
  // Bloom goes first, then AO, then the shadow map, and resolution last, in four steps from the ceiling to the floor of renderScale().
  // Particle budget is not a step: fx.js sizes its buffers once, so it has no way to shrink at run time.
  function sunLight() { let l = null; scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) l = o; }); return l; }
  function applyShadow() {
    const l = sunLight();
    if (!l || l.shadow.mapSize.x === shadowSize) return;
    l.shadow.mapSize.setScalar(shadowSize); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
  }
  const steps = [
    { name: 'bloom', down() { if (post.state.bloomLevels <= 0) return false; post.setBloomLevels(post.state.bloomLevels - 1); return true; }, up() { if (post.state.bloomLevels >= Q.bloomLevels) return false; post.setBloomLevels(post.state.bloomLevels + 1); return true; } },
    { name: 'ao', down() { if (!post.state.ao) return false; post.state.ao = false; return true; }, up() { if (!Q.ao || post.state.ao) return false; post.state.ao = true; return true; } },
    { name: 'shadow', down() { if (shadowSize <= 512) return false; shadowSize /= 2; applyShadow(); return true; }, up() { if (shadowSize >= Q.shadow) return false; shadowSize *= 2; applyShadow(); return true; } },
    { name: 'resolution', down() { if (resG <= 0 || sharpMode === 'max') return false; resG = Math.max(0, resG - 0.25); resize(); return true; }, up() { if (resG >= 1) return false; resG = Math.min(1, resG + 0.25); resize(); return true; } },
  ];
  let idx = 0, level = 0, slow = 0, fastMs = 0, holdUp = 6000, lastUp = -1e9, warmUntil = performance.now() + 4000;
  const shedDown = () => { for (; idx < steps.length; idx++) if (steps[idx].down()) { level++; return true; } return false; };
  const shedUp = () => {
    if (idx >= steps.length) idx = steps.length - 1;
    for (; idx >= 0; idx--) if (steps[idx].up()) { level--; return true; }
    idx = 0; return false;
  };
  // The old governor, kept for ?legacyres=1.
  let lSlow = 0, lFast = 0;
  function governLegacy(ms) {
    if (ms > 20) { lSlow++; lFast = 0; } else if (ms < 13) { lFast++; lSlow = 0; } else { lSlow = 0; lFast = 0; }
    if (lSlow > 40) {
      lSlow = 0;
      if (governor > 0.62) { governor = Math.max(0.6, governor - 0.12); resize(); }
      else if (post.state.ao) post.state.ao = false;
      else if (post.state.fxaa) post.state.fxaa = false;
    } else if (lFast > 240 && governor < 1) { lFast = 0; governor = Math.min(1, governor + 0.06); resize(); }
  }
  // Frames in the first seconds after boot or a match start (shader compile, texture bake) say nothing about the device, and a stalled tab is not a slow GPU.
  // 60 Hz vsync gives 16.7 ms every frame, so "fast" cannot mean under 13 ms: recovery is a probe after holdUp ms of frames on time, and a probe that fails within 10 s doubles the wait.
  function govern(raw) {
    if (params.manual || params.q) return;
    if (params.legacyres) { governLegacy(raw); return; }
    const now = performance.now();
    if (now < warmUntil || raw > 250 || document.hidden) { slow = 0; fastMs = 0; return; }
    const ms = Math.max(raw, params.govms);
    if (ms > 20) { slow++; fastMs = 0; } else if (ms < 18.5) { fastMs += ms; slow = 0; } else slow = 0;
    const note = () => G.bus.emit('quality:auto', { level, step: steps[Math.min(idx, steps.length - 1)].name, scale: stats.scale });
    if (slow > 40) {
      slow = 0; fastMs = 0;
      if (shedDown()) { if (now - lastUp < 10000) holdUp = Math.min(60000, holdUp * 2); note(); }
    } else if (fastMs > holdUp && level > 0) {
      fastMs = 0;
      if (shedUp()) { lastUp = now; note(); }
    }
    stats.governor = level; stats.governorStep = level ? steps[Math.min(idx, steps.length - 1)].name : '';
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

  // A 120 Hz screen would draw every 8.3 ms: render at half that rate, so the GPU and the battery are not asked for 120 fps.
  let last = performance.now(), ema = 16, pend = 0;
  function frame(now) {
    let raw = now - last; last = now;
    pend += raw;
    if (pend < 12 && raw < 10 && !params.manual) return;
    raw = pend; pend = 0;
    const dt = Math.min(0.1, raw / 1000);
    ema += (raw - ema) * 0.05; stats.ms = ema; stats.fps = 1000 / ema;
    if (!params.manual) { time += dt; advance(dt); govern(raw); }
    draw(dt);
  }

  const defaultChoice = () => { const s = meta.get(); return { mech: params.mech || s.mech || 'trau', diff: params.bots || s.diff || 'normal', map: params.map || s.map || 'denrung', theme: params.theme || s.theme || null, mode: params.mode || s.mode || 'tdm', size: cleanSize(params.size !== null ? Number(params.size) : s.size) }; };
  G.bus.on('ui:play', (choice) => { G.paused = false; startMatch(choice, false); });
  G.bus.on('ui:menu', () => { G.paused = false;
    // Leaving an online match or its result screen goes back to the room, not to the solo menu.
    if (net) { const stay = G.match && G.match.over; net = null; if (stay) G.online.toLobby(); else G.online.leave(); G.ui.hideHUD(); startMatch(defaultChoice(), true); G.audio.setScene && G.audio.setScene('menu'); if (stay && G.ui.showLobby) G.ui.showLobby(); else G.ui.showMenu(); return; } G.audio.setScene && G.audio.setScene('menu'); G.ui.hideHUD(); startMatch(defaultChoice(), true); G.ui.showMenu(); });
  G.bus.on('ui:pause', (p) => { G.paused = !!(p && p.paused); });
  G.bus.on('quality:set', (q) => { if (!QUALITY[q] || q === Q.name) return; const s = meta.get(); s.settings.quality = q; s.settings.qualityChosen = true; meta.save(); lsSet('dtt.quality.v1', q); location.reload(); });
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
  window.__botHook = null; // test hook: fn(match, inputs) may edit the inputs before each sim tick (forces bot ultimates in tools/eyes.js)
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
