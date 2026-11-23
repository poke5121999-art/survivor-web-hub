// The ultimate's close-up. When a beast casts its ultimate the world stops (the sim takes no tick, juice.scale 0) while the
// camera swings down to a three-quarter close-up of the beast and its light gathers (the wind-up, played on the real
// clock); then the impact lands (fxmap releases the effects it held back), time crawls for a moment in slow motion while
// the camera holds and pulls back to the fight. A tap skips to the pull-back. The sim never runs during the wind-up and
// only slower during the slow motion, so a seed plays the same fight.
// It runs after the fight camera each frame: juice wraps camera.update, and this only overrides the camera it was handed,
// blending from and back to whatever camera.js computed (the same way bossintro.js does).
//   phase  gong (wind-up, held)  ->  bung (impact, slow motion, camera holds)  ->  out (blend back)  ->  idle
const THREE = window.THREE;

const T = { gong: 0.46, bung: 0.5, out: 0.38, inBlend: 0.24 };     // real seconds at x1
const FAST = { gong: 0.22, bung: 0.24, out: 0.26, inBlend: 0.14 }; // x2: shorter, no slow motion
const SLOW = 0.28;          // time scale in the bung phase
const AGAIN = 1.0;          // s: an ultimate this soon after the last close-up gets a short hold, no camera
const SHORT = 0.14;         // s: that short hold
const FOV = 40;
const PITCH = 27 * Math.PI / 180; // high enough to see the beast over the heads of the foes crowding it
const FILL = 0.42;          // share of the frame height the beast stands tall
const SWING = 1.25;         // rad off the beast's facing: near side-on, so the foes it faces do not stand between it and the lens
const BAR = { top: 30, bot: 44 }; // design px of the letterbox bars (over the top HUD band and the cards' upper edge)

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const mix = (a, b, k) => a + (b - a) * k;

export function createUltCam(game, J) {
  const H = game.host; const camera = H.camera;
  const aim = new THREE.PerspectiveCamera(FOV, 1, 0.3, 500);
  const shot = new THREE.Vector3(); const look = new THREE.Vector3();
  let S = null; let lastEnd = -9; let clock = 0;
  const U = { active: false, count: 0, log: [], get scene() { return S; } };

  const enabled = () => !(game.settings && game.settings.ultCam === false);
  const fxOf = () => game.actors && game.actors.fx;

  // ---- letterbox bars: a modal kit screen like the boss entrance (the HUD under it takes no taps) ----
  let ui = null;
  function bars() {
    if (ui || !game.ui) return ui;
    const scr = game.ui.screen('ultcam', { modal: true });
    const mat = () => new THREE.MeshBasicMaterial({ color: 0x07060a, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat()); const bot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat());
    scr.put(top, 0, 0, 1); scr.put(bot, 0, 0, 1); ui = { scr, top, bot, shown: false }; return ui;
  }
  function layoutBars(k) {
    const b = bars(); if (!b) return;
    if (k > 0.01 && !b.shown) { game.ui.show('ultcam', { transition: 'none' }); b.shown = true; }
    if (k <= 0.01) { if (b.shown) { game.ui.hide('ultcam', { transition: 'none' }); b.shown = false; } return; }
    const Hd = game.ui.H; const th = BAR.top * k; const bh = BAR.bot * k;
    b.top.scale.set(800, Math.max(0.01, th), 1); b.top.position.set(390, -th / 2, 1);
    b.bot.scale.set(800, Math.max(0.01, bh), 1); b.bot.position.set(390, -(Hd - bh / 2), 1);
  }

  // Called by fxmap at the ultimate event, before anything else draws it: decides whether this ultimate gets a held
  // wind-up and starts it. Returns the hold in real seconds (0: play at once).
  function begin(e) {
    if (!J.enabled || J.silent) return 0;
    const u = game.B && game.B.byUid.get(e.uid); if (!u) return 0;
    const fast = game.speed >= 2;
    if (S && S.phase === 'gong') { S.extra.push(e.uid); return Math.max(0.01, S.D.gong - S.t); } // a second ultimate in the same moment joins the release
    if (S || clock - lastEnd < AGAIN || !enabled()) { short(e.uid); return SHORT; }
    const D = fast ? FAST : T;
    S = { uid: e.uid, key: e.key, phase: 'gong', t: 0, D, fast, extra: [], skipped: false, k: 0 };
    U.active = true; U.count++; U.log.push({ uid: e.uid, key: e.key, at: clock });
    if (U.log.length > 20) U.log.shift();
    frame(u);
    return D.gong;
  }
  // an ultimate without the camera: the world holds for a beat, then the effects land
  const shorts = [];
  function short(uid) { shorts.push({ uid, t: SHORT }); }

  // where the close-up stands: in front of the beast, swung off its facing, its height filling FILL of the frame
  function frame(u) {
    const h = Math.max(1.2, (H.heightOf ? H.heightOf(u.uid) : 2) || 2);
    const D = h / (2 * Math.tan((FOV * Math.PI) / 360) * FILL);
    // of the two side-on spots, the one with fewer foes standing between the lens and the beast (a crowd in front of the
    // lens fills the close-up with bodies)
    const between = (a) => {
      const cx = u.x + Math.cos(a) * D; const cz = u.z + Math.sin(a) * D; let n = 0;
      for (const f of game.B.enemies) {
        if (!f.alive) continue; const vx = cx - u.x; const vz = cz - u.z; const t = Math.max(0, Math.min(1, ((f.x - u.x) * vx + (f.z - u.z) * vz) / (vx * vx + vz * vz)));
        if (t > 0.08 && Math.hypot(f.x - u.x - vx * t, f.z - u.z - vz * t) < 1.4 + t * 1.5) n++;
      }
      return n;
    };
    const aL = u.face + SWING; const aR = u.face - SWING; const a = between(aL) <= between(aR) ? aL : aR;
    const node = game.actors.nodeOf ? game.actors.nodeOf(u.uid) : null;
    const bx = node ? node.position.x : u.x; const bz = node ? node.position.z : u.z; const by = node ? node.position.y : 0;
    S.base = { x: bx, y: by, z: bz, h, D, a, face: u.face };
  }
  function place(k, push) {
    const b = S.base; const D = b.D * push;
    shot.set(b.x + Math.cos(b.a) * D * Math.cos(PITCH), b.y + b.h * 0.55 + D * Math.sin(PITCH), b.z + Math.sin(b.a) * D * Math.cos(PITCH));
    look.set(b.x + Math.cos(b.face) * b.h * 0.35, b.y + b.h * 0.5, b.z + Math.sin(b.face) * b.h * 0.35);
    const el = camera.projectionMatrix.elements; const e8 = el[8]; const e9 = el[9];
    aim.position.copy(shot); aim.up.set(0, 1, 0); aim.lookAt(look);
    camera.position.lerp(shot, k); camera.quaternion.slerp(aim.quaternion, k);
    camera.fov = mix(camera.fov, FOV, k); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
    const j = H.juice; const { w, h } = H.size; const sx = j && j.shake.px > 0 ? (j.shake.x * 2) / w : 0; const sy = j && j.shake.px > 0 ? (j.shake.y * 2) / h : 0;
    const lift = (BAR.bot - BAR.top) / (game.ui ? game.ui.H : 360);
    el[8] = e8 * (1 - k) - sx * k; el[9] = e9 * (1 - k) - (sy + lift) * k;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function release() {
    const fx = fxOf(); if (!fx || !S) return;
    fx.release(S.uid); for (const uid of S.extra) fx.release(uid);
    J.hit(60, { force: true }); J.kick(3.4);
  }
  function skip() {
    if (!S) return;
    if (S.phase === 'gong') { release(); S.phase = 'out'; S.t = 0; S.outFrom = S.k; S.D = { ...S.D, out: 0.2 }; }
    else if (S.phase === 'bung') { S.phase = 'out'; S.t = 0; S.outFrom = S.k; }
    S.skipped = true;
  }

  // real seconds in, before the sim advances; returns the time scale it asks for (0 hold, SLOW, 1)
  function tick(dt) {
    clock += dt;
    let scale = 1;
    for (let i = shorts.length - 1; i >= 0; i--) { const s = shorts[i]; s.t -= dt; if (s.t <= 0) { const fx = fxOf(); if (fx) fx.release(s.uid); shorts.splice(i, 1); } else scale = 0; }
    if (!S) return scale;
    S.t += dt;
    if (S.phase === 'gong') { scale = 0; if (S.t >= S.D.gong) { release(); S.phase = 'bung'; S.t = 0; } }
    else if (S.phase === 'bung') { scale = S.fast ? 1 : SLOW; if (S.t >= S.D.bung) { S.phase = 'out'; S.t = 0; S.outFrom = 1; } }
    else if (S.phase === 'out') { const k = smooth(S.t / S.D.out); scale = S.fast ? 1 : mix(SLOW, 1, k); if (S.t >= S.D.out) { S = null; U.active = false; lastEnd = clock; layoutBars(0); return Math.min(1, scale); } }
    return scale;
  }
  // after camera.update: override the picture
  function apply() {
    if (!S || !S.base) return;
    const u = game.B && game.B.byUid.get(S.uid);
    if (u && S.phase !== 'out') { const node = game.actors.nodeOf ? game.actors.nodeOf(u.uid) : null; if (node) { S.base.x = node.position.x; S.base.z = node.position.z; S.base.y = node.position.y; } }
    let k; let push;
    if (S.phase === 'gong') { k = smooth(S.t / S.D.inBlend); push = mix(1.25, 1.05, smooth(S.t / S.D.gong)); }
    else if (S.phase === 'bung') { k = 1; push = mix(1.05, 1.22, smooth(S.t / S.D.bung)); }
    else { k = (S.outFrom ?? 1) * (1 - smooth(S.t / S.D.out)); push = 1.22; }
    S.k = k;
    if (k > 0.001) place(k, push);
    layoutBars(Math.min(1, k * 1.4));
    for (const o of H.scene.children) if (k > 0.3 && o.isGroup && o.userData && o.userData.bg && o.userData.fg) o.visible = false;
  }
  function reset() { if (S) { const fx = fxOf(); if (fx) { fx.release(S.uid); for (const uid of S.extra) fx.release(uid); } } for (const s of shorts) { const fx = fxOf(); if (fx) fx.release(s.uid); } shorts.length = 0; S = null; U.active = false; layoutBars(0); }
  Object.assign(U, { begin, tick, apply, skip, reset, holding: () => !!(S && S.phase === 'gong') || shorts.length > 0, T, FAST, SLOW });
  return U;
}
