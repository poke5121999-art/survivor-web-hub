// Mech models built from primitives, one design per MECHS key, painted in the team colour.
// A mech is a root group with a hull (turns toward movement), a turret (turns toward aim), optional legs, a ground ring and a shield bubble.
// Models face +x. Sim angle a maps to rotation.y = -a.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { TEAMS, MECHS } from '../data.js';
import { visibleTo, hidden } from '../sim.js';

const DARK = 0x2b3038, STEEL = 0x8d98a6, PALE = 0xdfe6ee;
const X = -Math.PI / 2;

// Each design fills batches: hull, turret, glowH (lights on the hull), glowT (lights on the turret), leg0..legN.
// paint = team colour, trim = the mech's own accent.
const DESIGNS = {
  trau(b, paint, trim) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.use('hull', DARK).push().move(sx * 0.72, 0.34, sz * 0.88);
      b.box(0.8, 0.5, 0.46);
      for (const e of [-0.4, 0.4]) b.push().move(e, 0, 0).rotX(X).cyl(0.33, 0.33, 0.46, 10).pop();
      b.tint(paint).push().move(0, 0.4, 0).box(1.2, 0.1, 0.56).pop();
      b.pop();
    }
    b.use('hull', STEEL).prism([[1.2, 0.5], [1.38, 0], [1.2, -0.5], [-1.1, -0.62], [-1.28, 0], [-1.1, 0.62]], 0.42, 1.0);
    b.tint(paint).prism([[0.95, 0.42], [1.05, 0], [0.95, -0.42], [-0.9, -0.5], [-1.0, 0], [-0.9, 0.5]], 1.0, 1.22);
    b.tint(0xe0a81e).push().move(1.5, 0.55, 0).rotZ(0.22).box(0.16, 0.72, 2.1).pop();
    b.tint(DARK).push().move(1.42, 0.55, 0).box(0.2, 0.2, 1.5).pop();
    for (const sz of [-1, 1]) {
      b.tint(DARK).push().move(-1.15, 1.2, sz * 0.32).rotZ(-0.5).cyl(0.11, 0.13, 0.5, 8).pop();
      b.use('glowH').push().move(-1.3, 0.75, sz * 0.32).box(0.04, 0.14, 0.34).pop().use('hull');
    }
    b.use('turret', paint).push().move(-0.05, 1.5, 0).cyl(0.62, 0.72, 0.52, 8).pop();
    b.tint(trim).push().move(-0.05, 1.8, 0).cyl(0.4, 0.52, 0.12, 8).pop();
    b.tint(DARK).push().move(0.58, 1.5, 0).box(0.42, 0.44, 0.66).pop();
    b.tint(STEEL).push().move(1.4, 1.52, 0).rotZ(X).cyl(0.15, 0.17, 1.5, 12).pop();
    b.tint(DARK).push().move(2.12, 1.52, 0).box(0.34, 0.32, 0.4).pop();
    for (const sz of [-1, 1]) b.tint(paint).push().move(-0.1, 1.48, sz * 0.74).box(0.9, 0.42, 0.1).pop();
    b.tint(DARK).push().move(-0.5, 2.15, 0.3).cyl(0.015, 0.02, 0.9, 5).pop();
    b.use('glowT').push().move(0.5, 1.82, 0.3).box(0.16, 0.08, 0.16).pop().push().move(2.3, 1.52, 0).rotZ(X).cyl(0.1, 0.1, 0.03, 10).pop();
    return { muzzle: 2.3, legs: 0, height: 2.0 };
  },
  soi(b, paint, trim) {
    for (let i = 0; i < 2; i++) {
      const sz = i ? 1 : -1;
      b.use('leg' + i, DARK).push().move(-0.15, 0.78, sz * 0.56).rotZ(0.6).box(0.7, 0.2, 0.2).pop();
      b.push().move(-0.3, 0.38, sz * 0.56).rotZ(-0.5).box(0.2, 0.72, 0.18).pop();
      b.tint(STEEL).push().move(0.05, 0.08, sz * 0.56).box(0.7, 0.16, 0.36).pop();
      b.tint(paint).push().move(-0.42, 0.72, sz * 0.62).box(0.3, 0.3, 0.12).pop();
    }
    b.use('hull', paint).prism([[1.2, 0], [0.3, 0.52], [-0.8, 0.42], [-0.98, 0], [-0.8, -0.42], [0.3, -0.52]], 0.86, 1.3);
    b.tint(STEEL).prism([[0.95, 0], [0.25, 0.36], [-0.6, 0.3], [-0.6, -0.3], [0.25, -0.36]], 1.3, 1.42);
    b.tint(trim).push().move(-0.9, 1.5, 0).rotZ(0.5).box(0.5, 0.36, 0.06).pop();
    for (const sz of [-1, 1]) {
      b.tint(DARK).push().move(-0.98, 1.05, sz * 0.25).rotZ(X).cyl(0.14, 0.17, 0.3, 8).pop();
      b.use('glowH').push().move(-1.14, 1.05, sz * 0.25).rotZ(X).cyl(0.11, 0.11, 0.03, 8).pop().use('hull');
    }
    b.use('glowH').push().move(0.72, 1.36, 0).box(0.34, 0.06, 0.3).pop();
    b.use('turret', DARK).push().move(0, 1.5, 0).cyl(0.36, 0.42, 0.16, 10).pop();
    b.push().move(0, 1.58, 0).box(0.3, 0.14, 1.3).pop();
    for (const sz of [-1, 1]) {
      b.tint(paint).push().move(0.15, 1.58, sz * 0.66).box(0.95, 0.3, 0.3).pop();
      b.tint(trim).push().move(-0.3, 1.58, sz * 0.66).rotX(X).cyl(0.2, 0.2, 0.34, 10).pop();
      for (const dy of [-0.07, 0.07]) b.tint(STEEL).push().move(0.95, 1.58 + dy, sz * 0.66).rotZ(X).cyl(0.05, 0.05, 0.75, 6).pop();
      b.use('glowT').push().move(0.64, 1.75, sz * 0.66).box(0.12, 0.04, 0.1).pop().use('turret');
    }
    return { muzzle: 1.35, legs: 2, height: 1.9 };
  },
  ung(b, paint, trim) {
    for (let i = 0; i < 4; i++) {
      const a = 0.785 + i * 1.5708;
      b.use('leg' + i, DARK).push().rotY(a);
      b.push().move(0.72, 1.05, 0).rotZ(0.38).box(0.95, 0.12, 0.12).pop();
      b.tint(STEEL).push().move(1.22, 0.6, 0).rotZ(-1.32).box(1.25, 0.1, 0.1).pop();
      b.tint(paint).push().move(1.12, 1.2, 0).box(0.2, 0.2, 0.2).pop();
      b.tint(DARK).push().move(1.38, 0.05, 0).cyl(0.14, 0.18, 0.1, 6).pop();
      b.pop();
    }
    b.use('hull', DARK).push().move(0, 1.12, 0).cyl(0.5, 0.42, 0.46, 6).pop();
    b.tint(paint).push().move(0, 1.37, 0).cyl(0.42, 0.52, 0.1, 6).pop();
    b.use('glowH').push().move(0, 0.86, 0).cyl(0.2, 0.3, 0.06, 6).pop();
    b.use('turret', paint).push().move(-0.25, 1.62, 0).box(0.9, 0.3, 0.46).pop();
    b.tint(DARK).push().move(-0.85, 1.6, 0).box(0.4, 0.36, 0.34).pop();
    for (const sz of [-1, 1]) b.tint(STEEL).push().move(1.15, 1.62, sz * 0.12).box(2.5, 0.1, 0.07).pop();
    for (const x of [0.4, 1.1, 1.8]) b.tint(DARK).push().move(x, 1.62, 0).box(0.1, 0.2, 0.36).pop();
    b.tint(trim).push().move(-0.1, 1.86, 0.2).rotZ(X).cyl(0.09, 0.11, 0.5, 8).pop();
    b.use('glowT').push().move(1.2, 1.62, 0).box(2.3, 0.04, 0.1).pop();
    b.push().move(0.17, 1.86, 0.2).rotZ(X).cyl(0.07, 0.07, 0.03, 8).pop();
    return { muzzle: 2.45, legs: 4, height: 2.0 };
  },
  hac(b, paint, trim) {
    b.use('hull', DARK).push().move(0, 0.72, 0).ball(0.7, 1, 0.45).pop();
    b.tint(paint).push().move(0, 0.98, 0).cyl(0.98, 0.86, 0.26, 16).pop();
    b.tint(PALE).push().move(0, 1.14, 0).cyl(0.7, 0.96, 0.1, 16).pop();
    for (let i = 0; i < 3; i++) {
      const a = 3.1416 + (i - 1) * 2.094;
      b.push().rotY(a).tint(trim).push().move(1.02, 1.0, 0).box(0.5, 0.12, 0.34).pop();
      b.tint(DARK).push().move(1.26, 0.9, 0).cyl(0.14, 0.1, 0.34, 8).pop();
      b.use('glowH').push().move(1.26, 0.7, 0).cyl(0.09, 0.02, 0.1, 8).pop().use('hull').pop();
    }
    b.use('glowH').push().move(0, 1.2, 0).geo(new THREE.TorusGeometry(0.8, 0.035, 6, 32).rotateX(Math.PI / 2)).pop();
    b.use('turret', PALE).push().move(0, 1.34, 0).ball(0.42, 1, 0.8).pop();
    b.tint(paint).push().move(0.36, 1.4, 0).box(0.36, 0.26, 0.4).pop();
    b.tint(STEEL).push().move(0.8, 1.4, 0).rotZ(X).cyl(0.1, 0.13, 0.7, 10).pop();
    b.tint(DARK).push().move(-0.42, 1.7, 0).rotZ(0.6).cyl(0.3, 0.04, 0.16, 10).pop();
    b.use('glowT').push().move(1.08, 1.4, 0).geo(new THREE.TorusGeometry(0.16, 0.035, 6, 16).rotateY(Math.PI / 2)).pop();
    b.push().move(0.1, 1.7, 0).ball(0.09, 0).pop();
    return { muzzle: 1.25, legs: 0, height: 1.8, hover: true };
  },
};

function shieldMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color() }, uTime: { value: 0 }, uHit: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uHit; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float f = pow(1.0 - max(0.0, dot(vN, vV)), 2.2);
        float bands = 0.5 + 0.5 * sin(vP.y * 9.0 - uTime * 4.0);
        float a = f * (0.75 + bands * 0.5) + 0.07 + uHit * 0.5;
        gl_FragColor = vec4(uColor * (1.4 + uHit * 2.0) * a, a);
      }`,
  });
}

export function makeMechs(G, tex) {
  const group = new THREE.Group();
  const baseMat = tex.material('metal', { reflect: 1.1 });
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 40).rotateX(-Math.PI / 2);
  const aimGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([1.15, 0, -0.09, 1.15, 0, 0.09, 4.2, 0, 0], 3));
  const bubbleGeo = new THREE.IcosahedronGeometry(1, 3);
  const views = new Map();

  function build(key, team) {
    const def = MECHS[key], b = new Builder(0.42);
    const paint = new THREE.Color(TEAMS[team].color).lerp(new THREE.Color(0.5, 0.5, 0.5), 0.12).multiplyScalar(0.9), info = DESIGNS[key](b, paint, new THREE.Color(def.tint));
    const geos = b.build();
    const mat = baseMat.clone();
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAMS[team].color).multiplyScalar(2.6).addScalar(0.25), toneMapped: false });
    const root = new THREE.Group(), hull = new THREE.Group(), turret = new THREE.Group(), legs = [];
    const add = (parent, g, m, cast) => { if (!g) return null; const mesh = new THREE.Mesh(g, m); mesh.castShadow = cast; mesh.receiveShadow = cast; parent.add(mesh); return mesh; };
    add(hull, geos.hull, mat, true); add(hull, geos.glowH, glow, false);
    add(turret, geos.turret, mat, true); add(turret, geos.glowT, glow, false);
    for (let i = 0; i < info.legs; i++) legs.push(add(hull, geos['leg' + i], mat, true));
    root.add(hull, turret);
    return { root, hull, turret, legs, mat, glow, info, def };
  }

  function view(u) {
    let v = views.get(u.id);
    if (v && v.mech === u.mech && v.team === u.team) return v;
    if (v) group.remove(v.root);
    v = build(u.mech, u.team);
    v.mech = u.mech; v.team = u.team;
    const mine = u.id === G.me;
    const tc = new THREE.Color(TEAMS[u.team].color);
    v.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: mine ? new THREE.Color(1.6, 1.6, 1.6) : tc.clone().multiplyScalar(1.5), transparent: true, opacity: mine ? 0.95 : 0.8, depthWrite: false, toneMapped: false }));
    v.ring.scale.setScalar(u.radius * 1.15); v.ring.position.y = 0.06; v.ring.renderOrder = 2;
    v.root.add(v.ring);
    if (mine) {
      v.aim = new THREE.Mesh(aimGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
      v.aim.position.y = 0.07; v.aim.renderOrder = 2; v.root.add(v.aim);
    }
    v.bubble = new THREE.Mesh(bubbleGeo, shieldMaterial());
    v.bubble.scale.setScalar(u.radius * 1.45); v.bubble.position.y = 1.0; v.bubble.visible = false; v.bubble.renderOrder = 5;
    v.root.add(v.bubble);
    v.kick = 0; v.flash = 0; v.walk = 0; v.spawn = 1; v.headingV = u.heading; v.lastX = u.x; v.lastZ = u.z; v.wasAlive = false;
    group.add(v.root); views.set(u.id, v);
    return v;
  }

  function sync(m, alpha, dt, time) {
    const myTeam = m.units[G.me] ? m.units[G.me].team : 0;
    const seen = new Set();
    for (const u of m.units) {
      const v = view(u); seen.add(u.id);
      const show = u.alive && visibleTo(m, u, myTeam);
      v.root.visible = show;
      if (!show) { v.wasAlive = u.alive; continue; }
      if (!v.wasAlive) { v.spawn = 0; v.wasAlive = true; v.lastX = u.x; v.lastZ = u.z; }
      const x = u.px + (u.x - u.px) * alpha, z = u.pz + (u.z - u.pz) * alpha;
      const moved = Math.hypot(x - v.lastX, z - v.lastZ); v.lastX = x; v.lastZ = z;
      v.walk += moved;
      v.spawn = Math.min(1, v.spawn + dt * 2.5);
      v.root.position.set(x, 0, z);
      v.root.scale.setScalar(0.4 + 0.6 * v.spawn);
      let dh = u.heading - v.headingV; while (dh > Math.PI) dh -= 6.2832; while (dh < -Math.PI) dh += 6.2832;
      v.headingV += dh * Math.min(1, dt * 12);
      v.hull.rotation.y = -v.headingV;
      const speed = moved / Math.max(dt, 1e-3);
      const bob = v.info.hover ? Math.sin(time * 2.6 + u.id) * 0.07 + 0.12 : Math.abs(Math.sin(v.walk * 2.4)) * Math.min(0.05, speed * 0.008);
      v.hull.position.y = bob;
      v.turret.rotation.y = -u.aim;
      v.kick = Math.max(0, v.kick - dt * 7);
      const k = v.kick * v.kick * 0.3;
      v.turret.position.set(-Math.cos(u.aim) * k, bob, -Math.sin(u.aim) * k);
      for (let i = 0; i < v.legs.length; i++) {
        const ph = v.walk * 2.6 + i * (v.legs.length === 2 ? Math.PI : Math.PI / 2 * (i % 2 ? 3 : 1));
        v.legs[i].position.x = Math.sin(ph) * 0.22; v.legs[i].position.y = Math.max(0, Math.cos(ph)) * 0.09;
      }
      v.flash = Math.max(0, v.flash - dt * 6);
      const stun = u.stunT > 0 ? 0.25 + 0.2 * Math.sin(time * 30) : 0;
      v.mat.emissive.setRGB(v.flash + stun, v.flash + stun, v.flash + stun * 0.4);
      const ghost = hidden(u);
      const op = ghost ? 0.45 : 1;
      if ((v.mat.opacity !== op)) { v.mat.opacity = op; v.mat.transparent = op < 1; v.mat.needsUpdate = true; v.glow.opacity = op; v.glow.transparent = op < 1; }
      const sh = u.shield > 0 || u.invulnT > 0;
      v.bubble.visible = sh;
      if (sh) {
        const un = v.bubble.material.uniforms;
        un.uTime.value = time; un.uHit.value = Math.max(0, un.uHit.value - dt * 5);
        if (u.invulnT > 0 && u.shield <= 0) un.uColor.value.setRGB(1, 1, 1); else un.uColor.value.set(TEAMS[u.team].color).lerp(new THREE.Color(1, 0.9, 0.4), 0.35);
      }
      if (v.aim) v.aim.rotation.y = -u.aim;
      v.ring.material.opacity = (u.id === G.me ? 0.95 : 0.8) * (0.85 + 0.15 * Math.sin(time * 3 + u.id));
    }
    for (const [id, v] of views) if (!seen.has(id)) { group.remove(v.root); views.delete(id); }
  }

  function event(e) {
    const v = views.get(e.id);
    if (!v) return;
    if (e.t === 'fire') v.kick = 1;
    else if (e.t === 'hit') { v.flash = Math.min(1, 0.35 + e.amt / 500); if (e.absorbed) v.bubble.material.uniforms.uHit.value = 1; }
  }

  // Muzzle position in world space, for flashes.
  function muzzle(u, side, out) {
    const v = views.get(u.id), len = v ? v.info.muzzle : u.radius;
    const c = Math.cos(u.aim), s = Math.sin(u.aim);
    return out.set(u.x + c * len - s * side, 1.55, u.z + s * len + c * side);
  }

  function clear() { for (const v of views.values()) group.remove(v.root); views.clear(); }

  // Renders one mech alone into a square data URL, for menus and the HUD.
  const shots = {};
  function portrait(key, team, size = 128) {
    const id = key + team + size;
    if (shots[id]) return shots[id];
    const r = G.renderer, v = build(key, team), scene = new THREE.Scene();
    scene.environment = G.scene.environment;
    scene.add(v.root, new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-2, 5, 3); scene.add(sun);
    v.turret.rotation.y = -0.5; v.hull.rotation.y = -0.15;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(4.6, 5.0, 5.6); cam.lookAt(0.25, 0.95, 0);
    const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
    const prev = r.getRenderTarget(), col = new THREE.Color(), a = r.getClearAlpha();
    r.getClearColor(col); r.setClearColor(0x000000, 0);
    r.setRenderTarget(rt); r.clear(); r.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(rt, 0, 0, size, size, px);
    r.setRenderTarget(prev); r.setClearColor(col, a);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    rt.dispose(); v.mat.dispose(); v.glow.dispose();
    v.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    return (shots[id] = cv.toDataURL());
  }

  return { group, sync, event, muzzle, clear, portrait, views };
}
