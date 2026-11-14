// Base-mode towers: a stone keep in team colours crowned by a power crystal. The main tower is taller, wider and ringed with
// pylons. The crystal swells and pulls in light while it charges a shot; the main tower wears a ward (tethered to the living
// secondaries) while it cannot be hurt; cracks, smoke and fire spread as HP drops; on `towerDown` the keep tips over, sinks
// in a storm of rubble, and a burning stump stays behind.

import * as THREE from '../../vendor/three.module.min.js';
import { Builder } from './builder.js';
import { TEAMS } from '../data.js';
import { towerOpen } from '../sim.js';
import { premul, additive, K } from './fxkit.js';

const CRACK_FRAG = `
  uniform float uDmg, uHeat, uTime; varying vec3 vP;
  vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main() {
    vec2 uv = vec2(atan(vP.z, vP.x) * 1.9, vP.y * 1.15) + vec2(vP.y * 0.3, 0.0);
    vec2 i = floor(uv), f = fract(uv); float d1 = 8.0, d2 = 8.0; vec2 id = i;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)), r = g + h22(i + g) - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) d2 = d; }
    float e = sqrt(d2) - sqrt(d1);
    float reveal = step(h21(id), uDmg * 1.15);
    float line = (1.0 - smoothstep(0.0, 0.07, e)) * reveal;
    float soot = reveal * (1.0 - smoothstep(0.0, 0.35, e)) * 0.35 * uDmg;
    float glow = line * uHeat * (0.65 + 0.35 * sin(uTime * 4.0 + id.x * 3.0 + id.y));
    float a = clamp(line * 0.9 + soot, 0.0, 1.0);
    gl_FragColor = vec4(vec3(2.4, 0.7, 0.12) * glow, a);
  }`;

export function makeTowers(G, fx) {
  const { add, ovr, str, glow, sparks, puffs, chunks, ground, release, ring, scorch, explosion, flash, kick, beam, endBeam, aimBeam, emitter, domeMaterial, domeGeo, rnd, N, low, TEAM_HDR } = fx;
  const { FIRE, EMBER, WHITE, SMOKE, SOOT, STONE, ARC } = fx.colors;
  const views = [];
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const W = new THREE.Vector3();

  // Seeded so a tower's rubble is the same every time it is rebuilt.
  const seeded = (seed) => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };

  function keep(b, t, main) {
    const r = t.r, H = main ? 7.2 : 4.6, rb = main ? r * 1.06 : r * 0.9, rt = main ? r * 0.82 : r * 0.7, team = TEAMS[t.color].color;
    // plinth
    b.use('stone', 0xcfc6b2).push().move(0, 0.22, 0).cyl(r * (main ? 1.42 : 1.2), r * (main ? 1.5 : 1.26), 0.44, 8).pop();
    b.tint(0xbdb39d).push().move(0, 0.55, 0).cyl(rb * 1.12, rb * 1.18, 0.3, 8).pop();
    // body
    b.tint(0xc9bfa9).push().move(0, 0.7 + H / 2, 0).cyl(rt, rb, H, 8).pop();
    // buttresses
    const nb = main ? 8 : 4;
    for (let i = 0; i < nb; i++) { const a = i * (6.283 / nb) + (main ? 0 : 0.785); b.tint(0xb3a993).push().move(Math.cos(a) * rb * 0.98, 0.7 + H * 0.2, Math.sin(a) * rb * 0.98).rotY(-a).rotZ(0.22).box(0.55, H * 0.42, 0.5).pop(); }
    // crown
    const cy = 0.7 + H;
    b.tint(0xd8cfbb).push().move(0, cy + 0.2, 0).cyl(rt * 1.28, rt * 1.05, 0.4, 8).pop();
    const nm = main ? 12 : 8;
    for (let i = 0; i < nm; i++) { const a = i * (6.283 / nm); b.tint(0xc4baa4).push().move(Math.cos(a) * rt * 1.18, cy + 0.65, Math.sin(a) * rt * 1.18).rotY(-a).box(0.34, 0.5, main ? 0.5 : 0.4).pop(); }
    // team paint: bands, banners, crown rim
    b.use('paint', team);
    for (const f of main ? [0.12, 0.5, 0.86] : [0.18, 0.78]) { const y = 0.7 + H * f, rr = rb + (rt - rb) * f; b.push().move(0, y, 0).cyl(rr * 1.04, rr * 1.04, 0.26, 8).pop(); }
    const nbn = main ? 8 : 4;
    for (let i = 0; i < nbn; i++) {
      const a = i * (6.283 / nbn) + 0.39, f0 = main ? 0.55 : 0.4, f1 = main ? 0.84 : 0.74, rr = rb + (rt - rb) * (f0 + f1) / 2 + 0.06, h = H * (f1 - f0);
      b.push().move(Math.cos(a) * rr, 0.7 + H * (f0 + f1) / 2, Math.sin(a) * rr).rotY(-a).rotZ(-0.04).box(0.08, h, main ? 0.75 : 0.62).pop();
      b.push().move(Math.cos(a) * (rr + 0.02), 0.7 + H * f0 - 0.18, Math.sin(a) * (rr + 0.02)).rotY(-a).rotX(0.785).box(0.07, 0.42, 0.42).pop();
    }
    b.push().move(0, cy + 0.02, 0).cyl(rt * 1.3, rt * 1.3, 0.14, 8).pop();
    // crystal cradle
    b.use('iron', 0x2b3138);
    const np = main ? 6 : 4, pr = main ? 0.95 : 0.7, ch = main ? 2.4 : 1.7;
    b.push().move(0, cy + 0.6, 0).cyl(pr * 0.7, pr * 1.0, 0.5, 8).pop();
    for (let i = 0; i < np; i++) { const a = i * (6.283 / np); b.push().move(Math.cos(a) * pr, cy + 0.85 + ch * 0.4, Math.sin(a) * pr).rotY(-a).rotZ(0.28).box(0.14, ch, 0.18).pop(); }
    if (main) {
      // corner turrets on the crown and pylons round the plinth
      for (let i = 0; i < 4; i++) {
        const a = i * 1.5708 + 0.785, x = Math.cos(a) * rt * 1.1, z = Math.sin(a) * rt * 1.1;
        b.use('stone', 0xd2c9b4).push().move(x, cy + 0.9, z).cyl(0.42, 0.48, 1.4, 8).pop();
        b.use('paint', team).push().move(x, cy + 2.0, z).cyl(0.02, 0.6, 0.9, 8).pop();
        const px = Math.cos(a) * r * 1.32, pz = Math.sin(a) * r * 1.32;
        b.use('iron', 0x2b3138).push().move(px, 0.9, pz).cyl(0.12, 0.26, 1.6, 4).pop();
      }
    }
    // glowing slits and plinth runes
    b.use('glow');
    for (let i = 0; i < 4; i++) { const a = i * 1.5708, f = main ? 0.32 : 0.55, rr = rb + (rt - rb) * f + 0.01; b.push().move(Math.cos(a) * rr, 0.7 + H * f, Math.sin(a) * rr).rotY(-a).box(0.06, main ? 0.8 : 0.55, 0.12).pop(); }
    for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.39; b.push().move(Math.cos(a) * rb * 1.16, 0.56, Math.sin(a) * rb * 1.16).rotY(-a).box(0.04, 0.08, 0.5).pop(); }
    if (main) for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785; b.push().move(Math.cos(a) * r * 1.32, 1.85, Math.sin(a) * r * 1.32).box(0.18, 0.3, 0.18).pop(); }
    return { H, cy: cy + 0.85 + ch * 0.62, rb, rt };
  }

  function rubble(b, t, main, dims) {
    const r = t.r, rnd2 = seeded(t.id + 7), { rb } = dims, team = TEAMS[t.color].color;
    b.use('stone', 0x8f877a).push().move(0, 0.22, 0).cyl(r * (main ? 1.42 : 1.2), r * (main ? 1.5 : 1.26), 0.44, 8).pop();
    b.tint(0x7d766a).push().move(0, 0.55, 0).cyl(rb * 1.12, rb * 1.18, 0.3, 8).pop();
    // jagged stump: wall segments of uneven height around the ring
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628, h = 0.5 + rnd2() * (main ? 2.6 : 1.8), rr = rb * 0.9;
      b.tint(rnd2() < 0.5 ? 0x6f685d : 0x857d70).push().move(Math.cos(a) * rr, 0.7 + h / 2, Math.sin(a) * rr).rotY(-a + rnd2() * 0.2).rotZ((rnd2() - 0.5) * 0.25).box(0.55, h, rb * 0.62).pop();
    }
    b.tint(0x2c2824).push().move(0, 0.75, 0).cyl(rb * 0.75, rb * 0.75, 0.1, 8).pop();
    // rubble heap
    for (let i = 0; i < (main ? 22 : 14); i++) {
      const a = rnd2() * 6.283, d = rb * (0.6 + rnd2() * 1.3), s = 0.3 + rnd2() * 0.7;
      b.tint(rnd2() < 0.3 ? 0x5e574d : 0x9a9182).push().move(Math.cos(a) * d, s * 0.3, Math.sin(a) * d).rotY(rnd2() * 6).rotX((rnd2() - 0.5) * 0.8).rotZ((rnd2() - 0.5) * 0.8).box(s * 1.2, s * 0.7, s).pop();
    }
    // a fallen crown block and a torn banner
    b.tint(0xa79e8c).push().move(rb * 1.5, 0.3, -rb * 0.4).rotY(0.6).rotZ(1.3).cyl(rb * 0.55, rb * 0.6, 0.6, 8).pop();
    b.use('paint', new THREE.Color(team).multiplyScalar(0.45).getHex()).push().move(-rb * 1.1, 0.06, rb * 0.9).rotY(0.8).box(1.4, 0.05, 0.7).pop();
    b.use('iron', 0x22272c);
    for (let i = 0; i < 3; i++) { const a = rnd2() * 6.283; b.push().move(Math.cos(a) * rb * 0.5, 1.1, Math.sin(a) * rb * 0.5).rotY(-a).rotZ(0.9 + rnd2() * 0.5).box(0.12, 1.5, 0.16).pop(); }
  }

  function glowCard(color, size) {
    const m = new THREE.Mesh(glowGeo, additive(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, uniforms: { uColor: { value: color.clone() }, uA: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main() { vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = pow(max(0.0, 1.0 - r), 2.2) + pow(max(0.0, 1.0 - r), 8.0) * 2.0; gl_FragColor = vec4((uColor + vec3(0.6) * pow(max(0.0, 1.0 - r), 8.0)) * a * uA, 0.0); }' })));
    m.scale.setScalar(size); m.renderOrder = 10;
    return m;
  }

  function build(t) {
    const main = t.kind === 'main', b = new Builder(0.4), rb = new Builder(0.4);
    const dims = keep(b, t, main); rubble(rb, t, main, dims);
    const g = b.build(), gr = rb.build();
    const stone = G.gfx.tex.material('ruin').clone(), paint = G.gfx.tex.material('metal').clone(), iron = G.gfx.tex.material('metal');
    const glowMat = new THREE.MeshBasicMaterial({ color: TEAM_HDR[t.color].clone().multiplyScalar(1.2), toneMapped: false });
    const root = new THREE.Group(), body = new THREE.Group(), ruin = new THREE.Group();
    const mesh = (geo, mat, parent, shadow = true) => { if (!geo) return null; const o = new THREE.Mesh(geo, mat); o.castShadow = shadow; o.receiveShadow = shadow; parent.add(o); return o; };
    mesh(g.stone, stone, body); mesh(g.paint, paint, body); mesh(g.iron, iron, body); mesh(g.glow, glowMat, body, false);
    const crack = premul(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      uniforms: { uDmg: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: CRACK_FRAG }));
    const cracks = mesh(g.stone, crack, body, false); cracks.visible = false; cracks.renderOrder = 1;
    const ruinStone = G.gfx.tex.material('ruin');
    mesh(gr.stone, ruinStone, ruin); mesh(gr.paint, paint, ruin); mesh(gr.iron, iron, ruin);
    ruin.visible = false;
    // crystal: faceted gem, a glow card, orbiting rings
    const cs = main ? 1.0 : 0.68, tc = TEAM_HDR[t.color];
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(cs, 0).scale(0.75, 1.5, 0.75), new THREE.MeshBasicMaterial({ color: tc.clone(), toneMapped: false }));
    crystal.position.y = dims.cy;
    const shell = new THREE.Mesh(new THREE.OctahedronGeometry(cs * 1.25, 0).scale(0.75, 1.5, 0.75), additive(new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(0.35), transparent: true, depthWrite: false, toneMapped: false, wireframe: true })));
    shell.position.y = dims.cy;
    const card = glowCard(tc, main ? 6 : 4.2); card.position.y = dims.cy;
    const ringGeo = new THREE.TorusGeometry(cs * 1.6, 0.05, 6, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: tc.clone().multiplyScalar(1.4), toneMapped: false });
    const rings = [];
    for (let i = 0; i < (main ? 2 : 1); i++) { const o = new THREE.Mesh(ringGeo, ringMat); o.position.y = dims.cy; o.scale.setScalar(1 + i * 0.35); body.add(o); rings.push(o); }
    body.add(crystal, shell, card);
    const ward = new THREE.Mesh(domeGeo, domeMaterial(tc.clone().lerp(new THREE.Color(1.6, 1.6, 1.6), 0.15)));
    ward.scale.set(t.r * 2.5, dims.cy + 2.2, t.r * 2.5); ward.visible = false; ward.renderOrder = 6;
    root.add(body, ruin, ward);
    root.position.set(t.x, 0, t.z);
    const mark = ground(5, t.x, t.z, t.r * (main ? 2.3 : 1.9), tc, { alpha: 0.5 });
    return { root, body, ruin, crystal, shell, card, rings, ward, mark, stone, paint, crack, cracks, dims, main, alive: true, fall: -1, hit: 0, pulse: 0, acc: 0, tele: null, tether: null, axis: new THREE.Vector3(1, 0, 0), fallT: 0, boomT: 0, cy: dims.cy, x: t.x, z: t.z };
  }

  function sync(m, dt, time) {
    while (views.length < m.towers.length) {
      const t = m.towers[views.length], v = build(t);
      fx.group.add(v.root); views.push(v);
      if (!t.alive) { v.alive = false; settle(v); }
    }
    const cam = G.camera;
    m.towers.forEach((t, i) => {
      const v = views[i];
      if (v.fall >= 0) stepFall(v, t, dt);
      if (!t.alive) {
        if (v.alive) { v.alive = false; if (v.fall < 0) settle(v); }
        if (v.tele) { endBeam(v.tele); v.tele = null; }
        if (v.tether) { endBeam(v.tether); v.tether = null; }
        v.acc += dt;
        if (v.fall < 0 && v.acc > (low ? 1.2 : 0.5)) { v.acc = 0; ovr.emit(t.x + rnd(-1, 1), 0.8, t.z + rnd(-1, 1), 0.25, rnd(0.8, 1.5), -0.1, SMOKE, 3, 0.8, 3, 0.5, -0.2, 0.22, K.SMOKE); }
        return;
      }
      const tc = TEAM_HDR[t.color], k = t.charge, ratio = t.hp / t.maxHp;
      v.hit = Math.max(0, v.hit - dt * 5); v.pulse = Math.max(0, v.pulse - dt * 3);
      // crystal: bob, spin, swell with charge, flare on the shot
      const bob = Math.sin(time * 1.6 + i) * 0.12;
      v.crystal.position.y = v.shell.position.y = v.card.position.y = v.cy + bob;
      v.crystal.rotation.y = time * (1.2 + k * 8); v.shell.rotation.y = -time * 0.7;
      v.crystal.scale.setScalar(1 + k * 0.35 + v.pulse * 0.4);
      v.crystal.material.color.copy(tc).multiplyScalar(1.1 + k * 2.5 + v.pulse * 3);
      v.card.quaternion.copy(cam.quaternion);
      v.card.material.uniforms.uA.value = 0.55 + k * 1.3 + v.pulse * 1.5 + Math.sin(time * 3 + i) * 0.08;
      v.card.scale.setScalar((v.main ? 6 : 4.2) * (1 + k * 0.5 + v.pulse * 0.4));
      v.rings.forEach((o, j) => { o.position.y = v.cy + bob; o.rotation.set(1.2 + Math.sin(time * 0.8 + j) * 0.3, time * (0.8 + j * 0.4 + k * 6) * (j ? -1 : 1), 0.3 * j); o.scale.setScalar((1 + j * 0.35) * (1 - k * 0.3)); });
      if (k > 0) {
        const n = Math.random() < (low ? 0.4 : 1) ? 1 : 0;
        for (let j = 0; j < n; j++) { const a = Math.random() * 6.283, e = rnd(-0.6, 0.8), d = 3.2; W.set(Math.cos(a) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(a) * Math.cos(e) * d); str.emit(t.x + W.x, v.cy + W.y, t.z + W.z, -W.x * 4, -W.y * 4, -W.z * 4, tc, 0.22, 0.06, 0.05, 0, 0, 0.9); }
        if (t.target >= 0) {
          const u = m.units[t.target];
          if (!v.tele) v.tele = beam(t.x, t.z, u.x, u.z, 0.5, tc, 99, 1, 0.3);
          aimBeam(v.tele, t.x, t.z, u.x, u.z, 0.3); v.tele.u.uA.value = 0.3 + k * 1.2; v.tele.mesh.scale.z = 0.4 + k * 0.8;
        }
      } else if (v.tele) { endBeam(v.tele); v.tele = null; }
      // ward and tether while the keep cannot be hurt
      const warded = !towerOpen(m, t);
      v.ward.visible = warded;
      if (warded) {
        const un = v.ward.material.uniforms; un.uTime.value = time; un.uA.value = 0.42; un.uHitT.value = Math.max(0, un.uHitT.value - dt * 2.5);
        if (!v.tether) v.tether = [];
        let n = 0;
        for (const o of m.towers) if (o.team === t.team && o.kind === 'sub' && o.alive) {
          const b = v.tether[n] || (v.tether[n] = beam(o.x, o.z, t.x, t.z, 0.9, tc, 99, 2, 0.22));
          aimBeam(b, o.x, o.z, t.x, t.z, 0.22); b.u.uA.value = 0.8; n++;
        }
        while (v.tether.length > n) endBeam(v.tether.pop());
      } else if (v.tether) { for (const b of v.tether) endBeam(b); v.tether = null; }
      // damage: cracks spread from 75%, smoke below half, fire below a quarter
      const dmg = Math.max(0, Math.min(1, (0.78 - ratio) / 0.62));
      v.cracks.visible = dmg > 0;
      v.crack.uniforms.uDmg.value = dmg; v.crack.uniforms.uHeat.value = ratio < 0.25 ? 1 : ratio < 0.5 ? 0.35 : 0; v.crack.uniforms.uTime.value = time;
      const char = 1 - dmg * 0.4;
      v.stone.color.setRGB(char, char * 0.97, char * 0.94);
      v.stone.emissive.copy(tc).multiplyScalar(v.hit * 0.25); v.paint.emissive.copy(tc).multiplyScalar(v.hit * 0.35);
      if (ratio < 0.5) {
        v.acc += dt * (low ? 0.5 : 1) * (ratio < 0.25 ? 2.2 : 1);
        while (v.acc > 0.09) {
          v.acc -= 0.09;
          const a = Math.random() * 6.283, y = rnd(0.55, 1.05) * v.dims.H + 0.7, rr = v.dims.rt * 1.05;
          ovr.emit(t.x + Math.cos(a) * rr, y, t.z + Math.sin(a) * rr, Math.cos(a) * 0.4 + 0.3, rnd(1.5, 2.6), Math.sin(a) * 0.4 - 0.2, ratio < 0.25 ? SOOT : SMOKE, rnd(2, 2.8), rnd(0.7, 1.0), 3.2, 0.7, -0.6, ratio < 0.25 ? 0.6 : 0.45, K.SMOKE);
          if (ratio < 0.25) {
            glow(t.x + Math.cos(a) * rr, y - 0.3, t.z + Math.sin(a) * rr, FIRE, rnd(0.3, 0.5), rnd(0.6, 1.0), 0.9, K.FLAME, 0.6, Math.cos(a) * 0.3, rnd(1.5, 2.5), Math.sin(a) * 0.3);
            if (Math.random() < 0.3) str.emit(t.x + Math.cos(a) * rr, y, t.z + Math.sin(a) * rr, Math.cos(a) * 2, rnd(2, 5), Math.sin(a) * 2, EMBER, 0.8, 0.04, 0.05, 6, 0.5, 1);
          }
        }
      }
    });
  }

  function crystalY(t) { const v = views[t.id]; return v ? v.cy : 5; }

  // The keep is gone: show the stump, a lasting scorch and slow smoke.
  function settle(v) {
    v.fall = -1; v.body.visible = false; v.ruin.visible = true; v.ward.visible = false;
    v.mark.u.uA.value = 0;
    emitter(1, v.x, v.z, 14, 0.9, WHITE, v.dims.rb);
  }

  function stepFall(v, t, dt) {
    v.fallT += dt;
    const k = Math.min(1, v.fallT / 1.7), e = k * k;
    v.body.quaternion.setFromAxisAngle(v.axis, e * 0.45);
    v.body.position.y = -e * (v.dims.H + 1.5) * 0.9;
    v.body.position.x = Math.sin(v.fallT * 40) * 0.08 * (1 - k); v.body.position.z = Math.cos(v.fallT * 37) * 0.08 * (1 - k);
    v.boomT -= dt;
    if (v.boomT <= 0 && k < 0.85) {
      v.boomT = 0.22;
      const y = (1 - e) * v.dims.H * rnd(0.3, 0.9), a = Math.random() * 6.283;
      explosion(t.x + Math.cos(a) * v.dims.rb, t.z + Math.sin(a) * v.dims.rb, rnd(1.2, 2), FIRE, false, { scorch: false });
      chunks(t.x, y + 0.5, t.z, N(3), STONE, 6, 7, 0.45, 3, 0, SOOT);
    }
    if (Math.random() < (low ? 0.4 : 1)) { const a = Math.random() * 6.283; ovr.emit(t.x + Math.cos(a) * v.dims.rb * 1.2, 0.4, t.z + Math.sin(a) * v.dims.rb * 1.2, Math.cos(a) * 3, rnd(0.5, 2), Math.sin(a) * 3, fx.dustColor(), 1.6, 1.6, 2.4, 1.6, -0.2, 0.55, K.DUST); }
    if (k >= 1) settle(v);
  }

  function event(e, m) {
    const t = m.towers[e.tower], v = views[e.tower];
    if (!t || !v) return;
    const tc = TEAM_HDR[t.color];
    if (e.t === 'towerFire') {
      const dx = Math.cos(e.a), dz = Math.sin(e.a), y = v.cy;
      v.pulse = 1;
      glow(t.x, y, t.z, WHITE, 0.14, v.main ? 5 : 3.6, 1, K.STAR, 1.5);
      glow(t.x + dx, y, t.z + dz, tc, 0.25, v.main ? 5 : 3.5, 0.9, K.GLOW, 1.4);
      sparks(t.x, y, t.z, N(10), tc, 9, 0.35, 0.07, 0.6, 4, dx, dz, 0.5);
      ring(t.x, t.z, t.r * 2.4, tc, 0.35, 0.8);
      flash(t.x, y, t.z, tc, 40, 0.2);
      kick(t.x, t.z, 0.15);
    } else if (e.t === 'towerHit') {
      const u = m.units[e.by], a = u ? Math.atan2(u.z - t.z, u.x - t.x) + rnd(-0.5, 0.5) : Math.random() * 6.283, y = rnd(1, v.dims.H * 0.8), rr = v.dims.rb * 0.95;
      const x = t.x + Math.cos(a) * rr, z = t.z + Math.sin(a) * rr;
      v.hit = Math.min(1, v.hit + 0.6);
      glow(x, y, z, WHITE, 0.07, 1.6, 0.9, K.STAR, 1.5);
      sparks(x, y, z, N(5), EMBER, 7, 0.35, 0.05, 0.6, 14, Math.cos(a), Math.sin(a), 0.6);
      fx.chips(x, y, z, N(4), STONE, 4, 0.8, 0.16);
      if (Math.random() < 0.5) puffs(x, y, z, 1, STONE, 0.2, 1.2, 0.9, 0.6, 2.2, 0.6, 0.45, K.DUST, 2.5);
    } else if (e.t === 'towerBlock') {
      const u = m.units[e.by] || null, a = u ? Math.atan2(u.z - t.z, u.x - t.x) : Math.random() * 6.283, s = v.ward.scale;
      const un = v.ward.material.uniforms; un.uHit.value.set(Math.cos(a), 0.35, Math.sin(a)); un.uHitT.value = 1;
      const x = t.x + Math.cos(a) * s.x * 0.92, z = t.z + Math.sin(a) * s.z * 0.92;
      sparks(x, 1.8, z, N(6), ARC, 6, 0.3, 0.05, 0.6, 4, Math.cos(a), Math.sin(a), 0.7);
      glow(x, 1.8, z, ARC, 0.2, 2.4, 0.9, K.GLOW, 1.3);
    } else if (e.t === 'towerDown') {
      const u = m.units[e.by], away = u ? Math.atan2(t.z - u.z, t.x - u.x) : Math.random() * 6.283;
      v.axis.set(Math.sin(away), 0, -Math.cos(away));
      v.fall = 0; v.fallT = 0; v.boomT = 0.15; v.alive = false; v.ruin.visible = true; v.ward.visible = false;
      if (v.tele) { endBeam(v.tele); v.tele = null; }
      const H = v.dims.H, y = v.cy;
      glow(t.x, y, t.z, WHITE, 0.3, 14, 1, K.GLOW, 1.3);
      glow(t.x, y, t.z, tc, 0.5, 10, 1, K.STAR, 1.5);
      for (let i = 0; i < N(20); i++) { const a = Math.random() * 6.283, el = rnd(-0.3, 1), s = rnd(6, 16); str.emit(t.x, y, t.z, Math.cos(a) * Math.cos(el) * s, Math.sin(el) * s, Math.sin(a) * Math.cos(el) * s, tc, rnd(0.5, 1.1), 0.1, 0.035, 12, 0.8, 1); }
      fx.chips(t.x, y, t.z, N(14), tc.clone().multiplyScalar(0.8), 9, 1.2, 0.22);
      explosion(t.x, t.z, v.main ? 5.5 : 4.2, FIRE, true, { scorch: false });
      for (let i = 0; i < 3; i++) { const yy = H * (0.3 + i * 0.3); for (let j = 0; j < N(3); j++) { const a = Math.random() * 6.283; ovr.emit(t.x + Math.cos(a) * 0.8, yy, t.z + Math.sin(a) * 0.8, Math.cos(a) * 3, rnd(1, 4), Math.sin(a) * 3, SMOKE, rnd(0.8, 1.2), rnd(1.6, 2.4), 2, 2.5, -1.5, 1, K.FIREBALL); } }
      chunks(t.x, H * 0.5, t.z, N(v.main ? 16 : 11), STONE, 9, 12, 0.6, 4, 1.5, SOOT);
      for (let i = 0, n = N(24); i < n; i++) { const a = (i / n) * 6.283; ovr.emit(t.x + Math.cos(a) * t.r, 0.5, t.z + Math.sin(a) * t.r, Math.cos(a) * 9, 0.8, Math.sin(a) * 9, fx.dustColor(), 1.4, 1.6, 2.8, 2.6, -0.1, 0.6, K.DUST); }
      ring(t.x, t.z, 12, tc, 0.9); ring(t.x, t.z, 8, WHITE, 0.5);
      fx.column(t.x, t.z, tc, 1.4, 22, v.main ? 2.2 : 1.6);
      scorch(t.x, t.z, t.r * 3.2, 7, 1.6, EMBER).life = 60;
      flash(t.x, y, t.z, FIRE, 120, 0.7);
      kick(t.x, t.z, 1.2);
    }
  }

  function clear() {
    for (const v of views) {
      fx.group.remove(v.root); release(v.mark);
      if (v.tele) endBeam(v.tele);
      if (v.tether) for (const b of v.tether) endBeam(b);
      v.root.traverse((o) => { if (o.geometry && o.geometry !== domeGeo) o.geometry.dispose(); });
      v.stone.dispose(); v.paint.dispose(); v.crack.dispose(); v.ward.material.dispose();
    }
    views.length = 0;
  }

  return { sync, event, clear, crystalY };
}
