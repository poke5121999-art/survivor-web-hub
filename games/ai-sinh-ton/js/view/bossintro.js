// Boss entrance: when a boss spawns inside the live loop, the fight holds (game.cine, main.js advance) while a 2.9 to 3.6 s
// scene plays: letterbox bars, the camera leaves the fight framing for a low close-up of the boss, the boss makes its own
// entrance (falls, rises, tears out of a rift, ...), lands with shake, a short hit-stop and slow motion, and its name comes up
// large in the lower bar. A tap anywhere ends it on the spot. The sim never runs during it, so a seed plays the same fight.
// It runs after the fight camera each frame (main.js present): it only moves the boss's drawn root and overrides the camera
// it was handed, blending from and back to whatever camera.js computed.
const THREE = window.THREE;
const BZ = window.BZ;

const T_IN = 0.5;          // s of intro clock: fight camera -> close-up
const T_OUT = 0.55;        // close-up -> fight camera
const SLOW = { rate: 0.3, span: 0.12 }; // after the landing the intro clock (and the view) runs at 0.3 for 0.12 s of intro time (0.4 s real)
const FOV = 46;
const PITCH = 12 * Math.PI / 180; // the close-up looks down this much: low enough to feel big, high enough to clear the rim's props
const FILL = 0.42;         // share of the frame height the boss stands tall in the close-up
const SIDE = 0.6;          // rad the camera swings off the line arena centre -> boss (a three-quarter view)
const BAR = { top: 46, bot: 88 }; // design px: the bars cover the top HUD band and the hero cards
const CLEAR_TOP = 70;      // design px: the HUD's boss bar hangs under the top bar down to 68; the boss is framed below it
const LIGHT = { hemi: 0.6, sun: 0.35 }; // extra share of the theme's light on the close-up (night chapters leave a dark boss unreadable)
const SHAKE = { land: 4, heavy: 3, mid: 2.4, rumble: 1.2 }; // px, within juice's limits (its strongest is 4)
const STOP_MS = 90;

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const outCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const mix = (a, b, k) => a + (b - a) * k;

// per boss kind: entrance style, landing time L and total T on the intro clock, the line under the name, the pose it strikes
// after landing (bossacts POSES), the landing sound and the colours of its dust
const KIND = {
  giant: { style: 'fall', L: 1.35, T: 3.3, sub: 'Bước chân làm rung chuyển mặt đất', pose: 'roar', snd: 'boom', col: [0x8a7a62, 0x5e5240, 0xb9a988] },
  thrower: { style: 'burst', L: 1.3, T: 3.2, sub: 'Kẻ trồi lên từ lòng đá', pose: 'roar', snd: 'boom', col: [0x7c7f86, 0x5a5c62, 0xa8a290] },
  phantom: { style: 'rift', L: 1.45, T: 3.3, fill: 0.84, sub: 'Hồn oán xé toạc màn đêm', pose: 'screech', snd: 'screech', col: [0x9a5cff, 0x40206e, 0xd8b8ff] },
  queen: { style: 'dive', L: 1.4, T: 3.2, sub: 'Nữ hoàng của bầy dơi đêm', pose: 'call', snd: 'screech', col: [0x3a2440, 0x7a2a5a, 0xc24a7a] },
  brood: { style: 'silk', L: 1.4, T: 3.3, sub: 'Mẹ của muôn vạn tơ độc', pose: 'spit', snd: 'land', col: [0x8adf3a, 0x3e7a1a, 0xd8f0a0] },
  vampire: { style: 'mist', L: 1.45, T: 3.3, sub: 'Kẻ khát máu ngàn năm', pose: 'surge', snd: 'roar', col: [0xb01818, 0x5a0a08, 0xff5a4a] },
  alien: { style: 'beam', L: 1.4, T: 3.2, sub: 'Sứ giả từ vì sao lạ', pose: 'surge', snd: 'thunder', col: [0x5aff9a, 0x1a8a5a, 0xd0ffe0] },
  pharaoh: { style: 'sand', L: 1.5, T: 3.3, sub: 'Vị vua cát vừa thức giấc', pose: 'surge', snd: 'roar', col: [0xe0b04a, 0x9a6a20, 0xfff0b0] },
  ufo: { style: 'charge', L: 1.3, T: 3.1, sub: 'Cỗ máy lạ từ bầu trời', pose: 'sway', snd: 'boom', col: [0x6ac8ff, 0x2a5aa0, 0xe0f4ff] },
  guardian: { style: 'rise', L: 1.55, T: 3.4, sub: 'Kẻ canh giữ từ thuở hồng hoang', pose: 'surge', snd: 'boom', col: [0x8a8a7a, 0x4e5a4a, 0x9ae0d0] },
  dragon: { style: 'swoop', L: 1.45, T: 3.4, fill: 0.5, sub: 'Chúa tể của hư không', pose: 'surge', snd: 'roar', col: [0x7a3aff, 0x2a0a5a, 0xff6ad8] },
};
const OLD_BOSS = new Set(['giant', 'thrower', 'phantom', 'queen', 'brood']);

export function createBossIntro(game) {
  const H = game.host; const G = H.G; const camera = H.camera;
  const aim = new THREE.PerspectiveCamera(FOV, 1, 0.5, 500); aim.rotation.order = 'YXZ';
  const V = () => new THREE.Vector3();
  const shotPos = V(); const shotLook = V(); const look = V(); const base = V(); const cur = V(); const tmp = V();
  let S = null;            // the running scene
  let settle = null;       // { uid }: after the scene the boss stays where it landed while the sim finishes its arrival
  const props = [];        // meshes this scene added to the world
  const I = { active: false, log: [], count: 0, skip, get scene() { return S; }, update, enabled: true };

  // ---- UI: two bars, the name, its line, the skip hint (a modal kit screen: the HUD under it takes no taps) ----
  let U = null;
  function makeUI() {
    const ui = game.ui; if (!ui) return null;
    const scr = ui.screen('bossintro', { modal: true });
    const mat = () => new THREE.MeshBasicMaterial({ color: 0x07060a, transparent: true, opacity: 0.94, depthWrite: false, toneMapped: false });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat()); const bot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat());
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, depthWrite: false, toneMapped: false }));
    scr.put(top, 0, 0, 1); scr.put(bot, 0, 0, 1); scr.put(line, 0, 0, 3);
    return { ui, scr, top, bot, line, name: null, sub: null, hint: null };
  }
  function dropText(k) { if (U && U[k]) { U[k].dispose(); U[k] = null; } }
  function showUI(def, name) {
    if (!U) U = makeUI(); if (!U) return;
    const ui = U.ui; dropText('name'); dropText('sub'); dropText('hint');
    // the name shrinks until it fits 720 design px; the canvas raster pads for the marks over and under Vietnamese letters
    let size = 38; let t = null;
    for (; size >= 20; size -= 2) { if (t) t.dispose(); t = ui.text(name, { size, align: 'center', valign: 'mid', upper: true, color: 0xffd23a, outline: 0x2a0a10 }); if (t.w <= 720) break; }
    U.name = t; U.scr.put(t, 390, 0, 6);
    U.sub = ui.text(def.sub, { size: 12, align: 'center', valign: 'mid', color: 0xf3e3c0, outlineW: 1.4, maxW: 700 }); U.scr.put(U.sub, 390, 0, 6);
    U.hint = ui.text('Chạm để bỏ qua', { size: 10, align: 'right', valign: 'mid', color: 0xc8c0d8, outlineW: 1.2 }); U.scr.put(U.hint, 768, 0, 6);
    ui.show('bossintro', { transition: 'none' });
    layoutUI(0, 0);
  }
  // b: bars in 0..1; n: name in 0..1 (its pop)
  function layoutUI(b, n) {
    if (!U) return; const Hd = U.ui.H; const e = outCubic(b);
    const th = BAR.top * e; const bh = BAR.bot * e;
    U.top.scale.set(800, Math.max(0.01, th), 1); U.top.position.set(390, -th / 2, 1);
    U.bot.scale.set(800, Math.max(0.01, bh), 1); U.bot.position.set(390, -(Hd - bh / 2), 1);
    const by = Hd - bh; const k = outCubic(n);
    if (U.name) { U.name.pos(390, by + 33, 6); const s = 1 + (1 - k) * 0.35; U.name.scale.set(s, s, 1); U.name.setOpacity(k); U.name.visible = k > 0.01; }
    if (U.sub) { U.sub.pos(390, by + 68, 6); U.sub.setOpacity(clamp01(n * 2 - 1)); U.sub.visible = n > 0.55; }
    const lw = 460 * k; U.line.scale.set(Math.max(0.01, lw), 2, 1); U.line.position.set(390, -(by + 54), 3); U.line.visible = k > 0.01;
    if (U.hint) { U.hint.pos(768, th / 2 + 1, 6); U.hint.setOpacity(e); U.hint.visible = b > 0.6; }
  }
  function hideUI() { if (!U) return; dropText('name'); dropText('sub'); dropText('hint'); U.ui.hide('bossintro', { transition: 'none' }); }

  // ---- world props: rings, a rift, a beam, a thread ----
  function prop(geo, color, o = {}) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o.op ?? 1, depthWrite: false, side: THREE.DoubleSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false }));
    m.renderOrder = 7; m.frustumCulled = false; H.scene.add(m); props.push(m); return m;
  }
  // the beam's light: bright at the floor, thinning toward the sky, broken into vertical streaks that crawl (map offset)
  let beamT = null;
  function beamTex() {
    if (beamT) return beamT;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const c = cv.getContext('2d');
    for (let x = 0; x < 64; x++) {
      const k = 0.45 + 0.55 * Math.abs(Math.sin(x * 0.9) * Math.sin(x * 0.37 + 1));
      const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, `rgba(255,255,255,${0.35 * k})`); g.addColorStop(1, `rgba(255,255,255,${k})`);
      c.fillStyle = g; c.fillRect(x, 0, 1, 128);
    }
    beamT = new THREE.CanvasTexture(cv); beamT.wrapS = THREE.RepeatWrapping; beamT.repeat.set(3, 1); beamT.userData.shared = true; return beamT;
  }
  function dropProps() { for (const m of props) { H.scene.remove(m); if (!m.userData.rock) { m.geometry.dispose(); m.material.dispose(); } } props.length = 0; }
  function flatAt(m, p, y) { m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(p.x, y, p.z); }

  const bodyOf = (uid) => { const n = game.actors.nodeOf(uid); if (!n) return null; return G.zombies.list.find((q) => q.body.root === n) || null; };

  // every visible vertex under root in world space (sampled, at most ~400 per mesh; instances included): a mesh's own box would
  // count the corners of a rotated or round part (a saucer, a tilted abdomen) that hold no geometry
  const VW = new THREE.Vector3(); const VM = new THREE.Matrix4(); const VI = new THREE.Matrix4();
  function eachVertex(root, fn) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      for (let a = o; a; a = a.parent) { if (!a.visible) return; if (a === root) break; }
      const pos = o.geometry.attributes.position; const step = Math.max(1, Math.floor(pos.count / 400)); const inst = o.isInstancedMesh ? o.count : 0;
      for (let k = 0; k < Math.max(1, inst); k++) {
        if (inst) { o.getMatrixAt(k, VI); VM.multiplyMatrices(o.matrixWorld, VI); } else VM.copy(o.matrixWorld);
        for (let i = 0; i < pos.count; i += step) fn(VW.fromBufferAttribute(pos, i).applyMatrix4(VM));
      }
    });
  }
  // extent of the body relative to point p: { bot, top, w } (w the widest horizontal extent through p)
  function localBox(root, p) {
    let bot = 1e9; let top = -1e9; let r = 0;
    eachVertex(root, (v) => { bot = Math.min(bot, v.y - p.y); top = Math.max(top, v.y - p.y); r = Math.max(r, Math.hypot(v.x - p.x, v.z - p.z)); });
    if (bot > top) return { bot: 0, top: 2, w: 1 };
    return { bot, top, w: 2 * r };
  }
  // Fits the close-up to the body in screen space: a few rounds of distance and aim so its projected box (vertices, through the
  // close-up lens with its lift) fills BAND_FILL of the clear band between the boss bar and the lower bar, centred in it.
  // Poses and wing beats after this need room, so a flier gets less of the band (the dragon's wings beat through metres: less
  // still); a kind may set its own share (`fill`).
  const BAND_FILL = { ground: 0.76, fly: 0.68 };
  const FP = new THREE.Vector3();
  function fitShot(root, fly) {
    const Hd = U ? U.ui.H : 360; const w = H.size.w; const h = H.size.h; const lift = (BAR.bot - CLEAR_TOP) / Hd;
    const top = 1 - 2 * CLEAR_TOP / Hd; const bot = -1 + 2 * BAR.bot / Hd; const bandH = top - bot; const want = bandH * (S.def.fill || (fly ? BAND_FILL.fly : BAND_FILL.ground));
    const tanH = Math.tan(FOV * Math.PI / 360);
    let D = Math.max(6, S.h / (2 * tanH * FILL)); let dy = 0;
    aim.fov = FOV; aim.aspect = w / h;
    for (let it = 0; it < 6; it++) {
      aim.position.set(base.x + Math.cos(S.ang) * D, S.cy + D * Math.tan(PITCH), base.z + Math.sin(S.ang) * D); aim.up.set(0, 1, 0); aim.lookAt(base.x, S.cy + dy, base.z);
      aim.updateMatrixWorld(true); aim.updateProjectionMatrix(); aim.projectionMatrix.elements[9] = -lift;
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      eachVertex(root, (v) => { FP.copy(v).applyMatrix4(aim.matrixWorldInverse).applyMatrix4(aim.projectionMatrix); x0 = Math.min(x0, FP.x); x1 = Math.max(x1, FP.x); y0 = Math.min(y0, FP.y); y1 = Math.max(y1, FP.y); });
      if (x1 < x0) break;
      const ratio = Math.max((y1 - y0) / want, (x1 - x0) / 1.7);
      // the box's centre sits (y0 + y1) / 2 in ndc; one ndc unit is about D * tanH metres at the boss
      dy += ((y0 + y1) / 2 - (top + bot) / 2) * D * tanH;
      D = Math.max(5, D * ratio);
    }
    return { D, dy };
  }
  function start(e) {
    if (!I.enabled || S || !game.B) return;
    const def = KIND[e.kind] || KIND.giant;
    S = { uid: e.uid, kind: e.kind, def, name: e.name || '', t: 0, real: 0, z: null, fired: new Set(), wasSlow: false, simT: game.B.t, ended: '' };
    I.active = true; I.count++; game.cine = true;
    I.log.push({ uid: e.uid, kind: e.kind, simT: game.B.t, at: performance.now() });
    if (I.log.length > 20) I.log.shift();
    showUI(def, S.name);
    game.events && game.events.emit('bossintro:start', { kind: e.kind, uid: e.uid });
  }

  function end(why) {
    if (!S) return;
    const uid = S.uid; const z = S.z;
    if (z && z.alive) { const b = z.body; b.root.position.copy(z.pos); b.root.scale.setScalar(z.T.scale); b.root.rotation.x = 0; b.root.rotation.z = 0; }
    if (S.light) { H.hemi.intensity = S.light.hemi; H.sun.intensity = S.light.sun; }
    S.ended = why; I.lastEnd = { why, t: S.t, real: S.real, kind: S.kind };
    S = null; I.active = false; game.cine = false; settle = { uid };
    if (game.juice) game.juice.slow = 1;
    dropProps(); hideUI();
    game.events && game.events.emit('bossintro:end', { why, uid });
  }
  function skip() { if (S) end('skip'); }
  if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { if (S) skip(); }, true);

  // ---- the entrance motions: offset (metres, world), scale, y stretch, extra yaw and tilt for intro time t ----
  // o: unit vector from the arena centre out through the boss; s: o turned 90 degrees; h: the boss's height
  const M = { ox: 0, oy: 0, oz: 0, sc: 1, sy: 1, yaw: 0, rz: 0, rx: 0 };
  function motion(t) {
    const { def, o, s, h } = S; const L = def.L;
    M.ox = 0; M.oy = 0; M.oz = 0; M.sc = 1; M.sy = 1; M.yaw = 0; M.rz = 0; M.rx = 0;
    const land = clamp01((t - L) / 0.28); const squash = t >= L ? 1 - 0.16 * Math.sin(Math.PI * land) : 1;
    switch (def.style) {
      case 'fall': { const f = clamp01((t - 0.35) / (L - 0.35)); M.oy = 24 * (1 - f * f); M.rx = -0.25 * (1 - f); M.sy = squash; break; }
      case 'rise': { const f = clamp01((t - 0.35) / (L - 0.35)); M.oy = -h * 1.15 * (1 - outCubic(f)); M.rz = 0.04 * Math.sin(t * 40) * (1 - f); break; }
      case 'burst': {
        const b0 = L; const f = clamp01((t - b0) / 0.55);
        M.oy = t < b0 ? -h * 1.3 : -h * 1.3 * (1 - f) + 3.2 * Math.sin(Math.PI * f);
        M.rx = t < b0 ? 0 : -0.35 * Math.sin(Math.PI * f); break;
      }
      case 'rift': { const f = clamp01((t - 0.85) / (L - 0.85)); M.sc = t < 0.85 ? 0.01 : 0.3 + 0.7 * outCubic(f); M.ox = o.x * 1.6 * (1 - outCubic(f)); M.oz = o.z * 1.6 * (1 - outCubic(f)); M.rz = 0.25 * Math.sin(t * 7) * (1 - f); break; }
      case 'dive': { const f = clamp01((t - 0.2) / (L - 0.2)); const r = 6 * Math.pow(1 - f, 1.2); const a = (1 - f) * Math.PI * 3; M.ox = o.x * r * Math.cos(a) + s.x * r * Math.sin(a); M.oz = o.z * r * Math.cos(a) + s.z * r * Math.sin(a); M.oy = 13 * Math.pow(1 - f, 1.6); M.yaw = (1 - f) * Math.PI * 3; M.rz = 0.5 * (1 - f); break; }
      case 'silk': { const f = clamp01((t - 0.3) / (L - 0.3)); const d = outCubic(f); M.oy = 16 * (1 - d) + (t > L ? 0.6 * Math.sin(Math.PI * land) * (1 - land) : 0); M.yaw = Math.sin(t * 3) * 0.6 * (1 - f); break; }
      case 'mist': { const f = clamp01((t - 0.75) / (L - 0.75)); M.sc = t < 0.75 ? 0.01 : 0.08 + 0.92 * outCubic(f); M.oy = -0.6 * (1 - f); M.yaw = (1 - outCubic(f)) * Math.PI * 4; break; }
      case 'beam': { const f = clamp01((t - 0.7) / (L - 0.7)); M.sc = t < 0.7 ? 0.01 : 1; M.sy = t < 0.7 ? 1 : mix(3, 1, outCubic(f)) * (t >= L ? squash : 1); M.oy = 7 * (1 - outCubic(f)); if (t >= 0.7 && t < L) M.sc = mix(0.25, 1, outCubic(f)); break; }
      case 'sand': { const f = clamp01((t - 0.55) / (L - 0.55)); M.oy = -h * 1.1 * (1 - outCubic(f)); M.yaw = (1 - outCubic(f)) * Math.PI * 3; break; }
      case 'charge': { const f = clamp01((t - 0.15) / (L - 0.15)); const d = 1 - outCubic(f); M.ox = (o.x * 0.35 - s.x * S.sideSign) * 30 * d; M.oz = (o.z * 0.35 - s.z * S.sideSign) * 30 * d; M.oy = 7 * d; M.rz = t < L ? 0.45 * d + 0.1 : 0.3 * Math.sin((t - L) * 14) * Math.max(0, 1 - (t - L) / 0.8); M.rx = t < L ? -0.35 * (1 - f) : 0; break; }
      case 'swoop': {
        const f = clamp01((t - 0.15) / (L - 0.15)); const e = outCubic(f); const q = 1 - e;
        // a curve from high off the far side (the camera stands on the near side), out over the abyss and in onto its cruise height
        const px = -s.x * S.sideSign * 24 * q * q + o.x * 20 * q * (1 - q); const pz = -s.z * S.sideSign * 24 * q * q + o.z * 20 * q * (1 - q);
        M.ox = px; M.oz = pz; M.oy = 15 * q * q + 2 * q * (1 - q); M.rz = -0.6 * Math.sin(Math.PI * f); M.yaw = q * 1.4; break;
      }
      default: break;
    }
    return M;
  }

  // ---- fx moments ----
  const once = (k, t, at) => { if (S.fired.has(k) || S.t < at) return false; S.fired.add(k); return true; };
  function shake(px) { if (game.juice && game.juice.kick) game.juice.kick(px); }
  function sound(name, gain = 1) { try { if (G.audio && G.audio.playAt) G.audio.playAt(name, base, { gain }); } catch (err) { console.error('bossintro sound ' + name + ' failed: ' + err.message); } }
  // shock front: a ring of glowing motes racing out along the ground (particles, no flat disc)
  function ring(col, r0, r1, life, y = 0.25) {
    const n = 26; const sp = (r1 - r0) / life;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2; const d = V().set(Math.cos(a), 0, Math.sin(a));
      G.fx.puff(base.clone().addScaledVector(d, r0).setY((base.y > 1 ? base.y - 0.4 : 0) + y), { glow: true, vel: d.multiplyScalar(sp), drag: 1.2, s0: 0.7, s1: 0.15, life, c0: 0xffffff, c1: col, a0: 0.9, stretch: 2.2, spin: 0 });
    }
  }
  // a crater: lit rock slabs heaved up round the spot, tilted outward, that sink back before the scene ends
  const rockMats = new Map();
  const rockMat = (c) => { let m = rockMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }); rockMats.set(c, m); } return m; };
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  function crater(r, cols) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3; const rr = r * (0.75 + Math.random() * 0.35);
      const m = new THREE.Mesh(rockGeo, rockMat(cols[i % 2])); const k = 0.25 + Math.random() * 0.3;
      m.scale.set(k * 1.5, k, k * 1.1); m.position.set(base.x + Math.cos(a) * rr, 0.05, base.z + Math.sin(a) * rr);
      m.rotation.set((Math.random() - 0.5) * 0.6, -a, 0.5 + Math.random() * 0.4); m.castShadow = false; m.receiveShadow = true;
      m.userData.rock = { y: k * 0.4, t0: S.t }; H.scene.add(m); props.push(m);
    }
  }
  function dustRing(cols, n, r, up = 1.2) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; const d = tmp.set(Math.cos(a), 0, Math.sin(a));
      G.fx.puff(base.clone().addScaledVector(d, r * 0.4).setY(base.y + 0.3), { vel: d.clone().multiplyScalar(5 + Math.random() * 3).setY(up), drag: 2.2, s0: 0.8, s1: 2.6, life: 0.9 + Math.random() * 0.4, c0: cols[2], c1: cols[1], a0: 0.8 });
    }
  }
  function fxAt(t) {
    const { def, h } = S; const L = def.L; const col = def.col; const top = base.clone().setY(base.y + h * 0.5);
    switch (def.style) {
      case 'fall':
        if (once('whoosh', t, 0.6)) sound('wind', 0.6);
        if (once('land', t, L)) { crater(2.6 * S.scale, col); dustRing(col, 16, 2.4); G.fx.burst(base.clone().setY(base.y + 0.3), 46, col, { speed: 9, size: 0.34, life: 1.3, grav: 18 }); G.fx.pop(base.clone().setY(base.y + 0.4), 1.4, [0xfff0c0, col[0]]); ring(0xffe0a0, 1, 9, 0.7); }
        break;
      case 'rise':
        for (let i = 0; i < 8; i++) if (once('rb' + i, t, 0.35 + i * 0.15)) { G.fx.burst(base.clone().setY(base.y + 0.2), 10, col, { speed: 6, size: 0.3, life: 1.1 }); shake(SHAKE.rumble); }
        if (once('crack', t, 0.4)) crater(2.2 * S.scale, col);
        if (once('land', t, L)) { dustRing(col, 14, 2); G.fx.pop(top, 1.3, [col[2], col[0]]); ring(col[2], 1, 8, 0.7); }
        break;
      case 'burst':
        for (let i = 0; i < 5; i++) if (once('bulge' + i, t, 0.45 + i * 0.16)) { G.fx.puff(base.clone().setY(base.y + 0.2), { vel: tmp.set(0, 1.4, 0), drag: 1.5, s0: 0.8, s1: 2, life: 0.7, c0: col[2], c1: col[1], a0: 0.7 }); shake(SHAKE.rumble); }
        if (once('land', t, L)) { crater(2 * S.scale, col); G.fx.burst(base.clone().setY(base.y + 0.4), 60, col, { speed: 11, size: 0.4, life: 1.4, grav: 20, dir: tmp.set(0, 1, 0), push: 4 }); dustRing(col, 12, 1.8, 2.4); ring(0xffe8b0, 1, 7, 0.6); }
        if (once('drop', t, L + 0.55)) { G.fx.burst(base.clone().setY(base.y + 0.2), 14, col, { speed: 4, size: 0.2 }); shake(SHAKE.rumble); }
        break;
      case 'rift': {
        // the tear: dark smoke packed in a tall slit, its edges crackling with violet arcs
        if (t > 0.25 && t < L + 0.15 && Math.floor(t * 30) !== S.lastTrail) {
          S.lastTrail = Math.floor(t * 30); const open = clamp01((t - 0.25) / 0.45); const hh = (h * 0.75 + 0.6) * open; const c = base.clone().addScaledVector(S.o, 0.9).setY(base.y + hh);
          const side = V().set(-Math.sin(S.ang), 0, Math.cos(S.ang)); const w = 1.2 * S.scale * open;
          for (let k = 0; k < 2; k++) { const v = (Math.random() * 2 - 1); G.fx.puff(c.clone().add(V().set(0, v * hh, 0)).addScaledVector(side, (Math.random() - 0.5) * w * Math.sqrt(1 - v * v)), { vel: V().set(0, 0.2, 0), s0: 0.7 * open + 0.2, s1: 1.1, life: 0.5, c0: 0x14051e, c1: 0x30104a, a0: 0.9 }); }
          const ea = Math.random() * Math.PI * 2; const eb = ea + 0.5; const pa = (q) => c.clone().add(V().set(0, Math.sin(q) * hh, 0)).addScaledVector(side, Math.cos(q) * w);
          G.fx.arc(pa(ea), pa(eb), col[2]);
        }
        for (let i = 0; i < 6; i++) if (once('wisp' + i, t, 0.35 + i * 0.16)) G.fx.puff(top.clone().addScaledVector(S.o, 1.2), { glow: true, vel: tmp.set(Math.random() - 0.5, 1, Math.random() - 0.5), s0: 0.6, s1: 1.6, life: 0.8, c0: col[0], c1: col[1], a0: 0.8 });
        if (once('land', t, L)) { G.fx.pop(top, 1.4, [col[2], col[0]]); ring(col[0], 1, 8, 0.7); }
        break;
      }
      case 'dive':
        if (S.z && t < L && Math.floor(t * 30) !== S.lastTrail) { S.lastTrail = Math.floor(t * 30); const p = S.z.body.root.position; G.fx.puff(p.clone().setY(p.y + 1), { vel: tmp.set(Math.random() - 0.5, 0.4, Math.random() - 0.5), drag: 1, s0: 0.5, s1: 1.4, life: 0.6, c0: col[0], c1: col[1], a0: 0.7 }); }
        if (once('land', t, L)) { G.fx.pop(top, 1.2, [col[2], col[1]]); ring(col[2], 1, 8, 0.7, 0.06); dustRing(col, 10, 1.6); }
        break;
      case 'silk':
        if (once('thread', t, 0.25)) { const m = prop(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), 0xf4f4ff, { op: 0.85 }); m.userData.thread = true; }
        if (once('land', t, L)) { G.fx.pop(base.clone().setY(base.y + 0.5), 1.3, [col[2], col[0]]); G.fx.burst(base.clone().setY(base.y + 0.4), 36, col, { speed: 7, size: 0.22, life: 1 }); ring(col[0], 1, 8, 0.7); dustRing([0, col[1], col[2]], 12, 2); }
        break;
      case 'mist':
        for (let i = 0; i < 10; i++) if (once('mist' + i, t, 0.25 + i * 0.1)) { for (let k = 0; k < 3; k++) { const a = Math.random() * 6.283; const r = 0.6 + Math.random() * 0.8; const p = base.clone().add(tmp.set(Math.cos(a) * r, 0.3 + k * 0.8, Math.sin(a) * r)); G.fx.puff(p, { vel: V().set(-Math.sin(a) * 2, 1.4, Math.cos(a) * 2), drag: 1, s0: 0.5, s1: 1.4, life: 0.9, c0: 0xc42a2a, c1: 0x4a0808, a0: 0.55 }); G.fx.puff(p, { glow: true, vel: V().set(-Math.sin(a) * 3, 2, Math.cos(a) * 3), drag: 1.5, s0: 0.25, s1: 0.05, life: 0.7, c0: 0xff6a5a, c1: col[0], a0: 1 }); } }
        if (once('land', t, L)) { G.fx.pop(top, 1.4, [col[2], col[0]]); G.fx.burst(top, 40, [col[0], col[2]], { speed: 8, size: 0.16, life: 1 }); ring(col[0], 1, 8, 0.7); }
        break;
      case 'beam':
        if (once('beam', t, 0.25)) { const m = prop(new THREE.CylinderGeometry(1, 1, 40, 24, 1, true), col[0], { add: true, op: 0.55 }); m.material.map = beamTex(); m.userData.beam = true; const c = prop(new THREE.CylinderGeometry(0.45, 0.45, 40, 16, 1, true), 0xffffff, { add: true, op: 0.8 }); c.material.map = beamTex(); c.userData.beam = true; c.userData.core = true; }
        if (once('land', t, L)) { G.fx.pop(base.clone().setY(base.y + 0.5), 1.5, [col[2], col[0]]); ring(col[0], 1, 9, 0.7); ring(0xffffff, 0.5, 5, 0.45); }
        break;
      case 'sand':
        if (t > 0.25 && t < L + 0.2 && Math.floor(t * 20) !== S.lastTrail) { S.lastTrail = Math.floor(t * 20); const a = t * 9; for (let k = 0; k < 2; k++) { const aa = a + k * Math.PI; G.fx.puff(base.clone().add(tmp.set(Math.cos(aa) * 1.8, 0.3 + Math.random() * h * 0.6, Math.sin(aa) * 1.8)), { vel: V().set(-Math.sin(aa) * 4, 1.2, Math.cos(aa) * 4), drag: 1.2, s0: 0.6, s1: 1.8, life: 0.8, c0: col[0], c1: col[1], a0: 0.7 }); } }
        if (once('rb', t, 0.6)) { crater(2 * S.scale, col); shake(SHAKE.rumble); }
        if (once('land', t, L)) { G.fx.pop(top, 1.4, [col[2], col[0]]); dustRing(col, 14, 2.2); ring(col[0], 1, 8, 0.7); }
        break;
      case 'charge':
        if (S.z && t < L && Math.floor(t * 30) !== S.lastTrail) { S.lastTrail = Math.floor(t * 30); const p = S.z.body.root.position; G.fx.puff(p.clone(), { glow: true, vel: tmp.set(0, 0, 0), s0: 1.2, s1: 0.2, life: 0.4, c0: col[0], c1: col[1], a0: 0.8 }); }
        if (once('land', t, L)) { G.fx.pop(top, 1.4, [col[2], col[0]]); ring(col[0], 1, 9, 0.7); ring(0xffffff, 0.5, 5, 0.4); }
        break;
      case 'swoop':
        if (S.z && t < L && Math.floor(t * 24) !== S.lastTrail) { S.lastTrail = Math.floor(t * 24); const p = S.z.body.root.position; G.fx.puff(p.clone().setY(p.y + 1), { glow: true, vel: tmp.set(0, 0.3, 0), s0: 1.4, s1: 0.4, life: 0.5, c0: col[0], c1: col[1], a0: 0.7 }); }
        if (once('land', t, L)) { G.fx.pop(top, 1.6, [col[2], col[0]]); ring(col[0], 1, 11, 0.8); ring(col[2], 0.5, 6, 0.5); dustRing(col, 12, 2); }
        break;
      default: break;
    }
    if (once('impact', t, L)) {
      const heavy = ['fall', 'burst', 'rise', 'swoop', 'silk'].includes(def.style);
      shake(heavy ? SHAKE.land : SHAKE.mid);
      if (game.juice && game.juice.hit) game.juice.hit(heavy ? STOP_MS : 50, { force: true });
      if (heavy && H.world && H.world.quake && !base.y) H.world.quake(base.x, base.z);
      sound(def.snd, 1); if (game.vibrate) game.vibrate(heavy ? 60 : 30);
    }
    if (once('pose', t, L + 0.18)) {
      sound('roar', 0.8);
      // the roar or lean the boss strikes, through the same pose table its skills use (bossacts), so the pool's rest values come back after
      const acts = game.actors.bossActs; if (acts && S.z) acts.set(S.uid, { pose: def.pose, t: 0, lock: 1.1, dur: 1.4 });
    }
  }
  function stepProps(dt) {
    const { def, h } = S; const L = def.L; const t = S.t;
    for (const m of props) {
      const r = m.userData.ring;
      if (r) { r.t += dt; const k = clamp01(r.t / r.life); m.scale.setScalar(mix(r.r0, r.r1, outCubic(k))); m.material.opacity = 0.9 * (1 - k); continue; }
      if (m.userData.rock) { const up = clamp01((t - m.userData.rock.t0) / 0.12); const down = clamp01((t - (S.def.T - 0.6)) / 0.5); m.position.y = mix(-0.3, m.userData.rock.y, up) - down * 0.8; continue; }
      if (m.userData.rift) {
        const open = clamp01((t - 0.25) / 0.45) * (1 - clamp01((t - L) / 0.25)); const w = 1.3 * S.scale * open; const hh = h * 0.75 + 0.6;
        m.position.copy(base).addScaledVector(S.o, 0.9).setY(base.y + hh); m.scale.set(Math.max(0.01, w), Math.max(0.01, hh * open), 1);
        m.lookAt(camera.position.x, base.y + hh, camera.position.z); m.visible = open > 0.01;
        if (m.userData.rift === 'edge') m.material.opacity = 0.7 + 0.3 * Math.sin(t * 30);
        continue;
      }
      if (m.userData.beam) {
        const on = clamp01((t - 0.25) / 0.3) * (1 - clamp01((t - L) / 0.3)); const r = (m.userData.core ? 0.6 : 1.4) * S.scale * on;
        if (m.material.map) m.material.map.offset.x = t * 0.6;
        m.position.set(base.x, base.y + 20, base.z); m.scale.set(Math.max(0.01, r), 1, Math.max(0.01, r)); m.visible = on > 0.01; m.material.opacity = (m.userData.core ? 0.8 : 0.5) * on; continue;
      }
      if (m.userData.thread && S.z) {
        const p = S.z.body.root.position; const y0 = p.y + h * 0.8; const len = 40; m.position.set(p.x, y0 + len / 2, p.z); m.scale.set(1, len, 1);
        m.visible = t < L + 0.25; continue;
      }
    }
  }

  function update(real) {
    if (settle) {
      const B = game.B; const u = B && B.byUid.get(settle.uid); const z = u && u.alive ? bodyOf(settle.uid) : null;
      if (!z || !u || u.spawnT <= 0 || S) settle = null;
      else { z.body.root.position.copy(z.pos); z.body.root.scale.setScalar(z.T.scale); }
    }
    if (!S) return;
    const B = game.B; const u = B && B.byUid.get(S.uid);
    if (!B || !u || !u.alive || B.phase !== 'fight') { end('gone'); return; }
    if (!S.z) {
      S.z = bodyOf(S.uid); if (!S.z) return;
      const z = S.z; base.copy(z.pos);
      const r = Math.hypot(base.x, base.z) || 1; S.o = V().set(base.x / r, 0, base.z / r); S.s = V().set(-S.o.z, 0, S.o.x);
      S.scale = z.T.scale; S.light = { hemi: H.hemi.intensity, sun: H.sun.intensity };
      // the body's real extent at its normal size (a saucer is 11 m wide, its legs hang 2 m under its root): the shot is fitted to it
      const b0 = z.body; b0.root.position.copy(base); b0.root.scale.setScalar(z.T.scale); b0.root.updateMatrixWorld(true);
      const ext = localBox(b0.root, base);
      S.h = Math.max(1.5, ext.top - ext.bot); S.cyOff = (ext.top + ext.bot) / 2; S.cy = base.y + S.cyOff; S.w = ext.w;
      // the camera: outside the rim looking in, swung SIDE off the line through the arena centre (a three-quarter view), so nothing
      // of the arena stands between it and the boss and the fight it is about to join is behind it
      // of the two three-quarter sides, the one the sun lights (host.js puts the sun at -12, +14 from the focus)
      const a0 = Math.atan2(S.o.z, S.o.x); const sunA = Math.atan2(14, -12);
      const ang = Math.cos(a0 + SIDE - sunA) >= Math.cos(a0 - SIDE - sunA) ? a0 + SIDE : a0 - SIDE; S.sideSign = ang > a0 ? 1 : -1;
      S.ang = ang; const f0 = fitShot(b0.root, z.T.fly); S.D = S.fitD = f0.D; S.dy = S.fitDy = f0.dy;
      S.yaw0 = Math.atan2(Math.cos(ang), Math.sin(ang)); // face the camera
    }
    // the intro clock: real time, stopped by a hit-stop, slowed for SLOW.span after the landing
    const stopped = game.juice && game.juice.stopped;
    const L = S.def.L;
    const slow = S.t >= L && S.t < L + SLOW.span;
    const rate = stopped ? 0 : slow ? SLOW.rate : 1;
    S.t += real * rate; S.real += real;
    if (game.juice) game.juice.slow = slow ? SLOW.rate : 1;
    const t = S.t; const T = S.def.T;
    if (t >= T) { end('done'); return; }

    // the boss's drawn body: where the sim holds it, plus the entrance
    const z = S.z; const b = z.body; const m = motion(t);
    base.copy(z.pos); S.cy = base.y + S.cyOff;
    b.root.position.set(base.x + m.ox, base.y + m.oy, base.z + m.oz);
    b.root.scale.set(z.T.scale * m.sc, z.T.scale * m.sc * m.sy, z.T.scale * m.sc);
    b.root.rotation.y = S.yaw0 + m.yaw; if (t < L + 0.18) { b.root.rotation.z = m.rz; b.root.rotation.x = m.rx; } else if (!OLD_BOSS.has(S.kind) && S.def.style === 'charge') b.root.rotation.z = m.rz;
    b.root.updateMatrixWorld(true);
    fxAt(t); stepProps(real * rate);
    // the body at its spawn is not the body in the scene (a flier opens its wings, a kit boss starts its own idle): fit again
    // just after the landing and once in the pose, never closer than before, and ease the camera there
    for (const at of [0.05, 0.5]) if (once('fit' + at, t, L + at)) { const f = fitShot(b.root, z.T.fly); if (f.D > S.fitD) { S.fitD = f.D; S.fitDy = f.dy; } }
    const ease = 1 - Math.exp(-real * 7); S.D += (S.fitD - S.D) * ease; S.dy += (S.fitDy - S.dy) * ease;

    // the camera: blend in, a slow push while it holds, blend out to whatever the fight camera computed this frame
    const kIn = smooth(t / T_IN); const kOut = 1 - smooth((t - (T - T_OUT)) / T_OUT); const k = Math.min(kIn, kOut);
    const push = 1.12 - 0.12 * smooth(t / T);
    const D = S.D * push; const camY = S.cy + D * Math.tan(PITCH);
    const lookY = S.cy + S.dy;
    shotPos.set(base.x + Math.cos(S.ang) * D, Math.max(base.y + 0.6, camY), base.z + Math.sin(S.ang) * D);
    shotLook.set(base.x, lookY, base.z);
    // before the landing the shot follows the boss in (up into the sky, down out of the ground) but never loses the spot
    cur.set(b.root.position.x, Math.max(base.y - S.h * 0.3, b.root.position.y + (S.cy - base.y) * m.sc * m.sy), b.root.position.z);
    const follow = t < L ? 0.7 : 0.7 * (1 - smooth((t - L) / 0.35));
    look.copy(shotLook).lerp(cur, follow);
    if (S.def.style === 'charge' || S.def.style === 'swoop' || S.def.style === 'dive') { const far = cur.distanceTo(shotLook); if (far > D * 0.9) look.copy(shotLook).lerp(cur, Math.min(follow, D * 0.9 / far)); }
    applyCam(k, look);
    // the units' health bars draw over everything (no depth test) and face the fight camera: in the close-up they would sit on
    // the boss's body, so they stay off until the scene ends (actors.js shows them again on its next sync)
    for (const o of H.scene.children) if (o.isGroup && o.userData && o.userData.bg && o.userData.fg) o.visible = false;
    if (S.light) { H.hemi.intensity = S.light.hemi * (1 + LIGHT.hemi * k); H.sun.intensity = S.light.sun * (1 + LIGHT.sun * k); }
    layoutUI(clamp01(t / 0.3) * (1 - clamp01((t - (T - 0.3)) / 0.3)), clamp01((t - L - 0.08) / 0.3) * (1 - clamp01((t - (T - 0.35)) / 0.25)));
  }

  function applyCam(k, lookAt) {
    if (k <= 0) return;
    const el = camera.projectionMatrix.elements; const e8 = el[8]; const e9 = el[9];
    aim.position.copy(shotPos); aim.up.set(0, 1, 0); aim.lookAt(lookAt);
    camera.position.lerp(shotPos, k); camera.quaternion.slerp(aim.quaternion, k);
    camera.fov = mix(camera.fov, FOV, k); camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
    // the fight camera's lens shift and its own shake fade out; the close-up takes the juice shake straight (it honours the setting)
    const j = H.juice; const { w, h } = H.size; const sx = j && j.shake.px > 0 ? j.shake.x * 2 / w : 0; const sy = j && j.shake.px > 0 ? j.shake.y * 2 / h : 0;
    // the picture rides up by half the difference of the bars, so the boss is centred in the band they leave open
    const lift = (BAR.bot - CLEAR_TOP) / ((U ? U.ui.H : 360));
    el[8] = e8 * (1 - k) - sx * k; el[9] = e9 * (1 - k) - (sy + lift) * k;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  game.on((e) => {
    if (e.e === 'boss' && game.stepping) start(e);
  });
  I.reset = () => { if (S) end('reset'); settle = null; };
  // the boss's projected box in design units of the frame, for tools/bossintro-test.mjs
  I.boxOf = (uid) => {
    const n = game.actors.nodeOf(uid); if (!n) return null;
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9; let any = false; const p = V();
    eachVertex(n, (v) => { p.copy(v).project(camera); if (p.z > 1) return; any = true; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    if (!any) return null;
    return { x0: Math.max(-1, x0), x1: Math.min(1, x1), y0: Math.max(-1, y0), y1: Math.min(1, y1), raw: [x0, x1, y0, y1] };
  };
  I.uiDbg = () => (U ? { shown: U.ui.isShown('bossintro'), name: U.name ? { w: U.name.w, x: U.name.position.x, y: -U.name.position.y, vis: U.name.visible } : null, H: U.ui.H } : null);
  return I;
}
