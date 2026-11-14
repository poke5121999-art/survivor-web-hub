// Stage adapter (hand-written): runs the ported Lanternfall world, lights, particles and post pipeline, and shows a
// set of figures the way Lanternfall's own gallery does (src/90-main.js:259-288, ported verbatim in lib/lf/gallery.js),
// with extras the gallery page needs: switching sets without reload, walk/run that travel down the road with leg IK,
// hit and death loops, camera views (front, 3/4, back, face), resizing to a panel, and triangle/draw-call counts.
//
// An entry is { def, label } where def has Lanternfall's hero/monster shape:
//   { build(opt) -> Figure, style, animClass?, scale?, death?, disCol?, hpY?, glow? }
import { THREE, LF } from './lf-host.js';
import { clamp, lerp, pathZ, TAU } from './lf/util.js';
import { Figure } from './lf/kit.js';
import { HumanAnim } from './lf/anim.js';
import { QuadAnim, WispAnim } from './lf/monsters.js';
import { world } from './lf/world.js';
import { gfx } from './lf/post.js';
import { fx } from './lf/fx.js';
import { stepDeath } from './lf/gallery.js';
import { attachGrip } from './arm-ik.js';

const VIEWS = { front: -0.15, '3/4': 0.75, side: 1.45, back: Math.PI - 0.15, face: -0.15, face34: 0.6 };
const SPEED = { walk: 1.7, run: 3.9 };

export function createStage(host) {
  LF.viewW = () => Math.max(2, host.clientWidth);
  LF.viewH = () => Math.max(2, host.clientHeight);
  const canvas = host.querySelector('canvas.gl'), c2d = host.querySelector('canvas.fx2d');
  c2d.id = 'fx2d'; // fx.init looks it up by id (src/50-fx.js:133)
  const renderer = gfx.init(canvas);
  renderer.info.autoReset = false;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 2600);
  world.init(scene, renderer); fx.init(scene, cam);
  const resize = () => { gfx.resize(); cam.aspect = gfx.W / gfx.H; cam.updateProjectionMatrix(); fx.resize(); };
  new ResizeObserver(resize).observe(host); resize();

  const protos = new Map();
  const S = { figs: [], anim: 'idle', view: 'front', tm: 0, travel: 0, cx: 100, cz: pathZ(100), calls: 0, fps: 0, onStats: null };

  function makeFig(entry) { // like LF.makeFig (src/90-main.js:6-10): one prototype per entry, instances share its arrays
    let p = protos.get(entry.key);
    if (!p) { p = entry.def.build({}); protos.set(entry.key, p); }
    const f = new Figure({ d: p.d }, p.rig); f.fx = p.fx; f.P = p.P; f.hideB.set(p.hideB);
    if (entry.def.glow) f.u.uGlow.value = entry.def.glow;
    if (entry.def.disCol) f.u.uDisCol.value.setRGB(entry.def.disCol[0], entry.def.disCol[1], entry.def.disCol[2]);
    return f;
  }
  function spawn(slot) {
    const { entry } = slot, def = entry.def;
    if (slot.fig) { scene.remove(slot.fig.mesh); slot.fig.dispose(); }
    slot.fig = makeFig(entry);
    if (def.grip) attachGrip(slot.fig, Object.assign({ w: 1 }, def.grip));
    slot.an = new (def.animClass || HumanAnim)(slot.fig, def.style);
    slot.sc = def.scale || 1; slot.fig.mesh.scale.setScalar(slot.sc);
    slot.dieT = 0; slot.v = null; slot.hitT = 0;
    scene.add(slot.fig.mesh);
  }
  function layout() {
    const n = S.figs.length, moving = S.anim === 'walk' || S.anim === 'run';
    let tx = 0; const sp = 1.7;
    S.figs.forEach((s, i) => {
      const m = s.fig.mesh;
      if (moving) { // abreast, walking down the road toward +X
        s.off = (i - (n - 1) / 2) * 1.25 * Math.max(1, s.sc); s.x = 100; m.rotation.y = Math.PI / 2;
        m.position.set(s.x, 0, pathZ(s.x) + s.off);
      } else { // Lanternfall gallery line-up (src/90-main.js:264)
        const x = n === 1 ? 0 : tx; tx += sp * Math.max(1, s.sc * 0.8); s.x = x + 100;
        m.position.set(s.x, 0, pathZ(s.x)); m.rotation.y = 0.5;
      }
    });
    if (!moving) { const off = n === 1 ? 0 : (tx - sp) / 2; S.figs.forEach((s) => s.fig.mesh.position.x -= 0); S.cx = 100 + off; S.cz = pathZ(S.cx); }
  }
  function show(entries, anim, view) {
    for (const s of S.figs) { scene.remove(s.fig.mesh); s.fig.dispose(); }
    S.figs = entries.map((entry) => ({ entry }));
    S.figs.forEach(spawn);
    if (anim) S.anim = anim; if (view) S.view = view;
    S.figs.forEach((s) => { s.an.t = 3 + S.figs.indexOf(s) * 1.7; s.an.ph = S.figs.indexOf(s) * 0.9; });
    layout(); S.tm = 0;
    return stats();
  }
  function setAnim(a) {
    const was = S.anim === 'walk' || S.anim === 'run', now = a === 'walk' || a === 'run';
    S.anim = a;
    for (const s of S.figs) { if (s.dieT || s.v || s.fig.free || s.an.down) spawn(s); s.an.act = null; s.an.stag = 0; s.an.down = false; }
    if (was !== now) layout();
  }
  function setView(v) { S.view = v; }
  function stats() {
    let tris = 0, verts = 0; for (const s of S.figs) { tris += s.fig.d.I.length / 3; verts += s.fig.nv; }
    return { figures: S.figs.length, tris, verts, meshes: S.figs.length, calls: S.calls, fps: S.fps, per: S.figs.map((s) => ({ label: s.entry.label, tris: s.fig.d.I.length / 3, verts: s.fig.nv })) };
  }
  function clipFor(s, want) {
    const cl = s.entry.def.style.clips || {};
    if (cl[want]) return want;
    return cl.attack ? 'attack' : Object.keys(cl)[0];
  }
  function updateFig(s, dt) {
    const an = s.an, A = S.anim, isHuman = an instanceof HumanAnim, m = s.fig.mesh;
    if (isHuman) { an.xf = { x: m.position.x, z: m.position.z, f: m.rotation.y, s: s.sc }; an.ikOn = A === 'walk' || A === 'run' || !!s.entry.def.ik; }
    if (A === 'walk' || A === 'run') {
      const v = SPEED[A] * (s.entry.def.speedK || 1) * s.sc; s.x += v * dt; m.position.set(s.x, 0, pathZ(s.x) + s.off);
      an.update(dt, v / s.sc, false);
    } else if (A === 'attack' || A === 'skill') {
      const cn = clipFor(s, A === 'skill' ? (s.entry.def.skill || 'special') : 'attack');
      if (!an.act && cn) { an.play(cn, s.entry.def.windup || 0.5, s.entry.def.recover || 0.7); s.pause = 0.45; }
      if (!an.act && s.pause > 0) s.pause -= dt;
      an.update(dt, 0, true);
    } else if (A === 'hit') {
      s.hitT -= dt; if (s.hitT <= 0) { an.stag = Math.min(1.15, (an.stag || 0) + 1); an.stagDir = an.stagDir > 0 ? -1 : 1; s.hitT = 1.25; s.fig.u.uFlash.value.setRGB(0.19, 0.14, 0.1); }
      s.fig.u.uFlash.value.multiplyScalar(Math.exp(-dt * 9));
      an.update(dt, 0, true);
    } else if (A === 'death') {
      s.dieT += dt; const kind = s.entry.def.death || 'burn', t = s.dieT;
      if (s.fig.grip) s.fig.grip.off = true;
      if (t > 4.2) { spawn(s); m.position.set(s.x, 0, pathZ(s.x)); s.fig.mesh.rotation.y = 0.5; return; }
      if (kind === 'down') { // the hero's downed pose (25-anim.js:127-128), then the bottom-up dissolve
        an.down = true; an.update(dt, 0, false);
        const k = clamp((t - 1.1) / 1.7, 0, 1); s.fig.u.uDissolve.value = k; s.fig.u.uDisH.value = s.fig.height * 0.7;
        if (k > 0 && k < 0.95 && Math.random() < dt * 30) fx.embers(m.position.x + (Math.random() - 0.5) * 0.7 * s.sc, 0.1 + k * 0.6, m.position.z + (Math.random() - 0.5) * 0.7 * s.sc, 1, s.entry.def.disCol ? s.entry.def.disCol.map((c) => c * 2.5) : null, 0.1, 0.8);
        if (k > 0.5) m.castShadow = false;
      } else {
        if (!s.v) s.v = { fig: s.fig, an, def: s.entry.def, face: m.rotation.y, sc: s.sc, dying: 0, kind };
        stepDeath({ x: m.position.x, z: m.position.z, radius: 0.5 * s.sc, M: { mat: s.entry.def.mat || 'stone' }, boss: false }, s.v, dt);
      }
    } else {
      an.update(dt, 0, A === 'ready');
    }
  }
  function frameCamera() {
    const moving = S.anim === 'walk' || S.anim === 'run';
    if (moving && S.figs.length) { let x = 0, z = 0; for (const s of S.figs) { x += s.fig.mesh.position.x; z += pathZ(s.fig.mesh.position.x); } S.cx = x / S.figs.length; S.cz = z / S.figs.length; }
    const n = S.figs.length, scMax = Math.max(1, ...S.figs.map((s) => s.sc)), face = moving ? Math.PI / 2 : 0.5;
    const rel = VIEWS[S.view] !== undefined ? VIEWS[S.view] : VIEWS.front, a = face + rel;
    let dist, ch, ty;
    if (S.view === 'face' || S.view === 'face34') {
      const s0 = S.figs[0], R = s0.fig.rig, hy = (R.head[R.names.head * 3 + 1] + 0.09) * s0.sc;
      dist = 1.25 * Math.max(0.8, s0.sc); ty = hy; ch = hy + 0.02;
      const hx = s0.fig.mesh.position.x, hz = s0.fig.mesh.position.z;
      cam.position.set(hx + Math.sin(a) * dist, ch, hz + Math.cos(a) * dist); cam.lookAt(hx, ty, hz);
    } else {
      const tanV = Math.tan(15 * Math.PI / 180), tanH = tanV * cam.aspect;
      const span = n <= 1 ? 1.4 * scMax : (moving ? (n - 1) * 1.25 * scMax + 1.6 * scMax : (n - 1) * 1.7 * Math.max(1, scMax * 0.8) + 1.6 * scMax);
      const hgt = 2.3 * scMax;
      dist = Math.max(n <= 1 ? 5.2 * scMax : 6, (span / 2) / tanH * 1.08, (hgt / 2) / tanV);
      ch = 1.5 * scMax + (dist - 5.2) * 0.04; ty = (n <= 1 ? 0.95 : 1.0) * scMax;
      cam.position.set(S.cx + Math.sin(a) * dist, ch, S.cz + Math.cos(a) * dist); cam.lookAt(S.cx, ty, S.cz);
    }
    if (S.camOv) { const o = S.camOv, f = S.figs[0].fig.mesh.position; cam.position.set(f.x + o[0], o[1], f.z + o[2]); cam.lookAt(f.x + o[3], o[4], f.z + o[5]); dist = Math.hypot(o[0] - o[3], o[1] - o[4], o[2] - o[5]); }
    cam.updateMatrixWorld();
    return dist;
  }
  let last = performance.now(), fN = 0, fT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; S.tm += dt;
    fN++; fT += dt; if (fT >= 0.5) { S.fps = fN / fT; fN = 0; fT = 0; }
    for (const s of S.figs) updateFig(s, dt);
    const dist = frameCamera();
    world.lantern.position.set(S.cx - 2.2, 3.2, S.cz + 0.8); world.lantern.intensity = 40; // gallery light (src/90-main.js:268)
    world.update(dt, S.cx, S.cz, S.cx); fx.update(dt, S.tm, S.cx, S.cz);
    const L = gfx.lights[0]; L.pos.copy(world.lantern.position); L.col.setRGB(1.0, 0.6, 0.28).multiplyScalar(world.lantern.intensity * 0.018);
    gfx.params.focus = S.view === 'face' || S.view === 'face34' ? dist : dist; gfx.params.aperture = 1;
    renderer.info.reset(); gfx.render(scene, cam, S.tm); S.calls = renderer.info.render.calls;
    if (S.onStats && fN === 0) S.onStats(stats());
  }
  requestAnimationFrame(frame);
  return { show, setAnim, setView, stats, state: S, scene, cam, renderer, protos, clearProtos: () => protos.clear() };
}
export { VIEWS };
