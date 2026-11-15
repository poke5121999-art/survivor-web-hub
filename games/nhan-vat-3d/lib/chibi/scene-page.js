// Runs a composed scene page: chibi characters (specs) + props from ./ext/stylized-props + guns from
// ./ext/stylized-weapons, a light preset, a fixed camera matching the owner's image (drag to orbit), and hooks for
// tools/shoot-scenes.js (window.__scene). The page's import map must point the kits' three.js at ./vendor.
import { THREE } from '../lf-host.js';
import { createRenderer, studioEnv, addLights, Actor } from './stage.js';
import { buildChibi } from './compose.js';
import { createPost } from './post.js';
import { gridFloor, flickerLight, holdWeapon, propOr, placeholder } from './scene-kit.js';

async function tryImport(url) { try { return await import(url); } catch (e) { console.warn('kit not loaded: ' + url + ' (' + e.message + ')'); return null; } }

export async function runScene(cfg) {
  const canvas = document.getElementById(cfg.canvas || 'cv');
  const R = createRenderer(canvas, { shadows: true, preserve: true, exposure: cfg.exposure || 1.0 });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(cfg.bg || 0x0c0d14); scene.environment = studioEnv(R, { top: [0.35, 0.4, 0.55], bot: [0.05, 0.05, 0.06] });
  scene.environmentIntensity = 0.6;
  const L = addLights(scene, cfg.light || 'campfire', { shadowLight: 'moon', shadowR: 6 });
  scene.add(gridFloor(40, { cell: 0.7 }));
  const post = createPost(R, { radius: 0.25, strength: 1.5, vignette: 0.35 });
  const propsKit = await tryImport(new URL('../../ext/stylized-props/lib/index.js', import.meta.url).href);
  const weapKit = await tryImport(new URL('../../ext/stylized-weapons/weapons/index.js', import.meta.url).href);
  const attach = await tryImport(new URL('../../ext/stylized-weapons/lib/attach.js', import.meta.url).href);
  const missing = [];
  // props
  const animated = [];
  for (const p of cfg.props || []) {
    const g = propOr(propsKit, p.id, p.seed || 1, p.opts, p.size); if (g.userData.placeholder) missing.push(p.id);
    g.position.set(...p.at); g.rotation.set(p.rx || 0, p.yaw || 0, p.rz || 0); if (p.noShadow) g.traverse((m) => { if (m.isMesh) m.castShadow = false; }); if (p.scale) g.scale.setScalar(p.scale); scene.add(g); animated.push(g);
  }
  // loose weapons (lying on the floor / leaning)
  for (const w of cfg.looseWeapons || []) {
    const def = weapKit && weapKit.byId[w.id]; let g;
    if (def) { g = def.build(w.seed || 1, w.opts || {}); g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); } else { g = placeholder(w.id, [0.1, 0.1, 0.8]); missing.push(w.id); }
    g.position.set(...w.at); g.rotation.set(w.rx || 0, w.ry || 0, w.rz || 0); scene.add(g);
  }
  // characters
  const actors = [];
  for (const c of cfg.cast) {
    const def = buildChibi(c.spec); if (c.scale) def.scale *= c.scale; const a = new Actor(def, { t0: c.t0 || 2 }); a.root.position.set(...c.at); a.root.rotation.y = c.yaw || 0; scene.add(a.root); actors.push(a);
    for (let i = 0; i < 30; i++) a.update(1 / 30);
    if (c.weapon) {
      const wd = weapKit && weapKit.byId[c.weapon.id];
      if (wd && attach) { const g = wd.build(c.weapon.seed || 1, {}); holdWeapon(a, g, attach.inHand, c.weapon); }
      else missing.push(c.weapon.id);
    }
  }
  // fire light(s)
  const fires = (cfg.fires || []).map((f) => { const l = flickerLight(f.col, f.intensity, f.dist); l.position.set(...f.at); scene.add(l); return l; });
  for (const s of cfg.spots || []) { const l = new THREE.PointLight(s.col, s.intensity, s.dist, 1.4); l.position.set(...s.at); if (s.shadow) { l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.002; } scene.add(l); }
  // camera + light orbit
  const cam = new THREE.PerspectiveCamera(cfg.fov || 30, 16 / 9, 0.1, 200), C = cfg.cam;
  const tgt = new THREE.Vector3(...C.target), off = new THREE.Vector3(...C.pos).sub(tgt), sph = new THREE.Spherical().setFromVector3(off);
  const r0 = sph.radius; // framed for 16:9; on a tall phone screen back the camera off so the group still fits across
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); sph.radius = r0 * Math.max(1, Math.pow((16 / 9) / cam.aspect, 0.8)); };
  new ResizeObserver(resize).observe(canvas); resize();
  { let d = null; canvas.addEventListener('pointerdown', (e) => { d = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (!d) return; sph.theta -= (e.clientX - d[0]) * 0.006; sph.phi = Math.min(1.45, Math.max(0.3, sph.phi - (e.clientY - d[1]) * 0.004)); d = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', () => { d = null; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); sph.radius = Math.min(30, Math.max(2, sph.radius * Math.exp(e.deltaY * 0.001))); }, { passive: false }); }
  let last = performance.now(), t = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; t += dt;
    for (const a of actors) { a.update(dt); for (const s of a.sockets || []) s.update(); }
    for (const f of fires) f.userData.tick(t);
    if (propsKit) propsKit.updateProps(animated, dt, t);
    cam.position.copy(tgt).add(new THREE.Vector3().setFromSpherical(sph)); cam.lookAt(tgt);
    R.info.reset(); post.render(scene, cam);
  }
  requestAnimationFrame(frame);
  const info = { characters: actors.map((a) => ({ id: a.def.id, tris: a.tris() })), missing, props: (cfg.props || []).length, kits: { props: !!propsKit, weapons: !!weapKit } };
  window.__scene = { info, R, scene, cam, actors };
  if (cfg.onInfo) cfg.onInfo(info);
  return window.__scene;
}
