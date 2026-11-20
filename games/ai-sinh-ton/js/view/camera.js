// Camera director. Overview: one fixed framing of the whole arena ellipse (ARENA from the sim, plus the spawn rim), world x to
// screen right and world z down the screen, a narrow lens at about 45 to 50 degrees so the block world reads isometric (the
// diagonal comes from the world's 45-degree block grid, not from turning the fight). Pulled back until the spawn rim spans
// the frame width; the lens shift puts the far rim just under the top bar; the pitch is the steepest one (up to 50) that
// keeps heroes (0.9 of the ellipse) above the hero card block at the bottom centre and the rim's corners above the bottom
// edge. No follow and no zoom, so everything the sim does happens inside the picture. Spectate: a chase camera behind and
// above one unit, blended in and out.
import { ARENA } from '../sim/battle.js?v=20261120e';
import { FLY_Y } from './keys.js?v=20261120e';
const THREE = window.THREE;
const BZ = window.BZ;

const PITCH_MIN = 42 * Math.PI / 180;
const PITCH_MAX = 50 * Math.PI / 180;
const FOV_OVER = 19;
const FOV_CHASE = 58;
const BAND_TOP = 40;    // design px (frame 780 wide) the top HUD bar takes
const TOP_GAP = 4;      // the far rim (heads included) sits this far under the bar
const BLOCK = { x0: 240, x1: 540, h: 80 }; // the hero cards: bottom centre, this tall from the bottom edge
const BLOCK_PAD = 2;    // heroes' feet (and their ring) stay this far above the block
const MARGIN_BOT = 8;   // the spawn rim outside the block stays this far above the bottom edge
const SIDE_FRAC = 0.042; // the spawn rim's left and right points sit this share of the frame width from the edges
const FIT_K = 1.04;     // the spawn rim is at 1.04 of the ellipse
const HERO_K = 0.9;     // heroes stay inside this share of the ellipse
const HERO_RING = 0.3;  // metres around a hero's foot point that must clear the block too
const HEAD = 0.5;       // height at the far rim that still clears the top bar: a monster killed as it arrives shows from the waist up
const PTS = 48;
const PUSH = 0.028;      // push-in on an ultimate: 2.8% scale about the casting hero, clamped so the rim stays in the frame
const RIM_PAD = 0.012;   // NDC margin kept between the rim and the frame edge while pushing
const SHAKE_PAD = 0.003;
const CHASE_FILL = 0.26; // share of the frame height the followed unit stands tall
const CHASE_FILL_MIN = 0.15; // never pull back so far that the unit gets small, whatever its width
const CHASE_PITCH = 22 * Math.PI / 180;

export function createCamera(H) {
  const { camera, G } = H;
  const fit = new THREE.PerspectiveCamera(FOV_OVER, 780 / 360, 1, 500);
  const focus = new THREE.Vector3();
  const v = new THREE.Vector3(); const look = new THREE.Vector3(); const pos = new THREE.Vector3();
  let dist = 20; let pitch = 50 * Math.PI / 180; let shift = 0; let vis = 0; let rim = { x: 0.95, y0: -0.5, y1: 0.7 }; let key = ''; let blend = 0; let want = 0; let target = 0; let fov = FOV_OVER;
  const C = { focus, get R() { return ARENA.z * FIT_K; }, get dist() { return dist; }, get shift() { return shift; }, get pitch() { return pitch; }, mode: 'overview', spectate(uid) { target = uid || 0; want = target ? 1 : 0; H.spectateUid = target; }, update };
  Object.defineProperty(C, 'mode', { get: () => (target ? 'spectate' : 'overview') });

  // NDC bounding box of the ellipse scaled by k (bodies head high when head > 0) seen from distance d at pitch p, no lens shift
  function bbox(d, p, k, head) {
    fit.position.set(0, Math.sin(p) * d, Math.cos(p) * d); fit.lookAt(0, 0, 0); fit.updateMatrixWorld(true);
    let x1 = -9; let y0 = 9; let y1 = -9;
    for (let i = 0; i < PTS; i++) {
      const a = (i / PTS) * Math.PI * 2;
      for (const h of head && Math.sin(a) < 0 ? [0, head] : [0]) {  // heads only matter at the far side, under the top bar
        v.set(Math.cos(a) * ARENA.x * k, h, Math.sin(a) * ARENA.z * k).project(fit);
        x1 = Math.max(x1, Math.abs(v.x)); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
    return { x1, y0, y1 };
  }

  // distance that makes the spawn rim fill halfX of the half width, and its box
  function fitAt(p, halfX) {
    let lo = 4; let hi = 300;
    for (let i = 0; i < 40; i++) { const d = (lo + hi) / 2; const b = bbox(d, p, FIT_K, HEAD); if (b.x1 / halfX > 1) lo = d; else hi = d; }
    return { d: hi, b: bbox(hi, p, FIT_K, HEAD) };
  }

  // with the far rim pinned under the top bar: how far the heroes' area and the rim corners clear the bottom (design px; >= 0 fits)
  function clearance(p, d, sh) {
    const { w, h } = H.size; const u = H.size.u || 1; const hd = h / u; const wd = w / u;
    fit.position.set(0, Math.sin(p) * d, Math.cos(p) * d); fit.lookAt(0, 0, 0); fit.updateMatrixWorld(true);
    const px = (x, z) => { v.set(x, 0, z).project(fit); return [(v.x + 1) / 2 * wd, (1 - (v.y + sh)) / 2 * hd]; };
    let hero = 1e9; let rimc = 1e9;
    for (let i = 0; i < PTS * 2; i++) {
      const a = (i / (PTS * 2)) * Math.PI * 2; const c = Math.cos(a); const s = Math.sin(a);
      const q = px(c * (ARENA.x * HERO_K + HERO_RING), s * (ARENA.z * HERO_K + HERO_RING));
      if (q[0] > BLOCK.x0 - 4 && q[0] < BLOCK.x1 + 4) hero = Math.min(hero, hd - BLOCK.h - BLOCK_PAD - q[1]);
      const r = px(c * ARENA.x * FIT_K, s * ARENA.z * FIT_K);
      if (r[0] < BLOCK.x0 || r[0] > BLOCK.x1) rimc = Math.min(rimc, hd - MARGIN_BOT - r[1]);
    }
    return Math.min(hero, rimc);
  }

  function solve() {
    const { w, h } = H.size; const u = H.size.u || 1;
    const topY = 1 - 2 * (BAND_TOP + TOP_GAP) * u / h; const halfX = 1 - 2 * SIDE_FRAC;
    fit.aspect = w / h; fit.updateProjectionMatrix();
    let best = null;
    for (let p = PITCH_MAX; p >= PITCH_MIN - 1e-6; p -= 0.25 * Math.PI / 180) {
      const f = fitAt(p, halfX); const sh = topY - f.b.y1; const c = clearance(p, f.d, sh);
      if (!best || c > best.c) best = { p, d: f.d, sh, c };
      if (c >= 0) { best = { p, d: f.d, sh, c }; break; }
    }
    pitch = best.p; dist = best.d; shift = best.sh; C.fitClear = best.c;
    const hb = bbox(dist, pitch, HERO_K, 0);
    rim = { x: hb.x1, y0: hb.y0 + shift, y1: hb.y1 + shift };
  }

  function unitOf(B, uid) { return B && B.byUid && B.byUid.get(uid); }

  // push-in about the casting hero and screen shake, applied to the projection after the lens shift: ndc' = s * ndc + t.
  // The push and pull are clamped so the fit ring of the arena stays inside the frame; a chase view only gets the shake.
  function juiceView(chase) {
    const j = H.juice; if (!j) return;
    const el = camera.projectionMatrix.elements; const { w, h } = H.size;
    let s = 1; let tx = 0; let ty = 0;
    if (!chase && j.push > 0) {
      s = Math.min(1 + PUSH * j.push, (1 - RIM_PAD) / Math.max(rim.x, Math.abs(rim.y0), Math.abs(rim.y1)));
      let hx = 0; let hy = 0;
      if (j.pull.k > 0) { v.set(j.pull.x, 0, j.pull.z).project(camera); hx = v.x; hy = v.y; }
      tx = (1 - s) * hx; ty = (1 - s) * hy;
      tx = Math.max(-(1 - RIM_PAD) + s * rim.x, Math.min((1 - RIM_PAD) - s * rim.x, tx));
      ty = Math.max(-(1 - RIM_PAD) - s * rim.y0, Math.min((1 - RIM_PAD) - s * rim.y1, ty));
    }
    if (j.shake.px > 0) {
      tx += j.shake.x * 2 / w; ty += j.shake.y * 2 / h;
      if (!chase) { tx = Math.max(-(1 - SHAKE_PAD) + s * rim.x, Math.min((1 - SHAKE_PAD) - s * rim.x, tx)); ty = Math.max(-(1 - SHAKE_PAD) - s * rim.y0, Math.min((1 - SHAKE_PAD) - s * rim.y1, ty)); }
    }
    if (s === 1 && tx === 0 && ty === 0) return;
    el[0] *= s; el[5] *= s; el[8] = s * el[8] - tx; el[9] = s * el[9] - ty;
  }

  function update(B, dt) {
    const k = H.size.w + 'x' + H.size.h;
    if (k !== key) { key = k; solve(); if (H.fogK) H.fogK.invalidate(); }
    H.B = B;
    blend += (want - blend) * Math.min(1, dt * 3.5); if (Math.abs(want - blend) < 0.001) blend = want;
    const aspect = H.size.w / H.size.h;
    pos.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    look.set(0, 0, 0);
    let lens = shift; let fv = FOV_OVER; let fogBase = dist;
    const u = target ? unitOf(B, target) : null;
    if (blend > 0 && u) {
      // size the shot by the unit: the distance gives it CHASE_FILL of the frame height, the camera sits behind it on the line
      // from its target (or along its facing) and a little above, and the look point leans toward the target so it stays in view
      const h = Math.max(1.2, H.heightOf ? H.heightOf(target) : 2.7);
      const uy = u.fly ? (FLY_Y[u.kind] || 3.2) : 0;
      const tg = B.byUid.get(u.target); let dx = Math.cos(u.face); let dz = Math.sin(u.face); let dT = 0;
      if (tg && tg.alive) { const ax = tg.x - u.x; const az = tg.z - u.z; dT = Math.hypot(ax, az); if (dT > 0.8) { dx = ax / dT; dz = az / dT; } else dT = 0; }
      // the distance gives the unit CHASE_FILL of the frame height and keeps its widest extent (wings, a saucer) inside the frame width
      const wide = H.widthOf ? H.widthOf(target) : 0;
      const perFill = (f) => h / (2 * Math.tan(FOV_CHASE * Math.PI / 360) * f); // distance that gives height fraction f
      const D = Math.max(5, Math.min(Math.max(perFill(CHASE_FILL), wide * 2.2), perFill(CHASE_FILL_MIN)));
      const cx = u.x - dx * D * Math.cos(CHASE_PITCH); const cz = u.z - dz * D * Math.cos(CHASE_PITCH); const cy = uy + h * 0.5 + D * Math.sin(CHASE_PITCH);
      const ahead = Math.min(dT * 0.5, h * 2.5);
      const lx = u.x + dx * ahead; const lz = u.z + dz * ahead;
      const t = BZ.smooth(blend);
      pos.x += (cx - pos.x) * t; pos.y += (cy - pos.y) * t; pos.z += (cz - pos.z) * t;
      look.x += (lx - look.x) * t; look.y += (uy + h * 0.45 - look.y) * t; look.z += (lz - look.z) * t;
      fv = FOV_OVER + (FOV_CHASE - FOV_OVER) * t; lens = shift * (1 - t);
      fogBase = dist * (1 - t) + 30 * t;
    } else if (blend === 0 && target && !u) { target = 0; want = 0; }
    fov += (fv - fov) * Math.min(1, dt * 8);
    camera.fov = fov; camera.aspect = aspect; camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -lens;
    juiceView(blend > 0 && u);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    if (H.fogK && H.fogK.dirty && blend === 0 && !target) { camera.updateMatrixWorld(true); H.fogK.layout((x, y, z) => { v.set(x, y, z).project(camera); return Math.abs(v.x) < 1.04 && v.y > -1.02 && v.y < 1.0 && v.z < 1; }); }
    // the fog starts behind the far rim, so the spawn rim dissolves into the mist
    if (H.scene.fog) { H.scene.fog.near = fogBase + 14; H.scene.fog.far = fogBase + 60; }
    G.player.pos.set(focus.x, 0, focus.z); G.player.yaw = Math.atan2(pos.x - look.x, pos.z - look.z);
  }
  return C;
}
