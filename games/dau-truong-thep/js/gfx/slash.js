// Melee swing of a blade arm, render only: the arm is a model part of kind 'slash' (pivot at the shoulder) that the
// view swings round the vertical axis on each `fire` or `skill` event of its unit, with a crescent ribbon of light
// following the blade tip and sparks where its hits land. Events are what both online ends see, so the swing looks
// the same on host and guest; nothing here touches the match.
//   part spec: { name, on: 'turret', kind: 'slash', p: [shoulder], model: true, tip: [x, y, z] (tip minus p), r0 }
import * as THREE from '../../vendor/three.module.min.js';

// Timeline in seconds: wind-up (blade pulled back), swing (ease-out), hold, return.
const WIND = 0.08, SWING = 0.07, HOLD = 0.1, BACK = 0.2, FADE = 0.13;
// Arm yaw at the end of the wind-up and of the swing (a left arm: + pulls the blade out and back, - sweeps it across).
const A0 = 0.95, A1 = -0.95;
const ease3 = (u) => 1 - (1 - u) ** 3, smooth = (u) => u * u * (3 - 2 * u);

// Yaw of the arm and progress of the swing (0..1) at t seconds after the trigger.
function pose(t, big) {
  const a0 = A0 * (big ? 1.2 : 1), a1 = A1 * (big ? 1.25 : 1);
  if (t < WIND) return [a0 * smooth(t / WIND), 0];
  if (t < WIND + SWING) { const u = (t - WIND) / SWING; return [a0 + (a1 - a0) * ease3(u), ease3(u)]; }
  if (t < WIND + SWING + HOLD) return [a1, 1];
  if (t < WIND + SWING + HOLD + BACK) return [a1 * (1 - smooth((t - WIND - SWING - HOLD) / BACK)), 1];
  return [0, 1];
}

const VERT = 'attribute vec2 aFE; varying vec2 vFE; void main() { vFE = aFE; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// aFE.x: fraction along the sweep (0 at the wind-up end), aFE.y: 0 at the inner radius, 1 at the blade tip.
const FRAG = `uniform vec3 uColor; uniform float uHead, uFade; varying vec2 vFE;
  void main() {
    float f = vFE.x, e = vFE.y;
    float tail = smoothstep(uHead - 0.55, uHead, f) * step(f, uHead + 0.002);
    float w = 0.06 + 0.3 * sin(3.14159 * clamp(f / max(uHead, 0.05), 0.0, 1.0));
    float body = smoothstep(1.0 - w, 1.0 - w + 0.05, e) * (1.0 - smoothstep(0.97, 1.0, e));
    float core = smoothstep(0.86, 0.95, e) * (1.0 - smoothstep(0.95, 1.0, e));
    float a = tail * body * uFade * (0.35 + 0.65 * e);
    gl_FragColor = vec4((uColor * 1.6 + vec3(3.0) * core) * a, a);
  }`;

// The ribbon: a ring sector round the shoulder pivot swept from the wind-up yaw to the swing yaw, at the tip height.
export function slashTrail(spec, color) {
  const n = 28, tip = spec.tip, r1 = Math.hypot(tip[0], tip[2]), r0 = spec.r0 ?? r1 * 0.55, base = Math.atan2(-tip[2], tip[0]);
  const a0 = A0 * 1.25, a1 = A1 * 1.3, pos = [], fe = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, a = base + a0 + (a1 - a0) * f;
    for (const [r, e] of [[r0, 0], [r1 * 1.04, 1]]) { pos.push(Math.cos(a) * r, tip[1], -Math.sin(a) * r); fe.push(f, e); }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFE', new THREE.Float32BufferAttribute(fe, 2));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uHead: { value: 0 }, uFade: { value: 0 } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.fromArray(spec.p); mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 5;
  // The ribbon maps the big swing's arc; a normal swing covers the fraction of it the arm actually turns through.
  mesh.userData.span = [a0, a1];
  return mesh;
}

// Per frame: pose the arm and drive the ribbon. p.t is seconds since the last trigger (undefined: at rest).
export function slashPose(p, pv, dt) {
  if (p.t === undefined) { pv.rotation.y = 0; if (p.trail) p.trail.visible = false; return; }
  p.t += dt;
  const [yaw, prog] = pose(p.t, p.big);
  pv.rotation.y = yaw;
  pv.rotation.x = -0.18 * Math.sin(Math.PI * prog) * (p.t < WIND + SWING + HOLD ? 1 : 0);
  const tr = p.trail; if (!tr) return;
  const [s0, s1] = tr.userData.span, swingEnd = WIND + SWING;
  if (p.t < WIND) { tr.visible = false; return; }
  const yaw0 = A0 * (p.big ? 1.2 : 1);
  const head = (yaw - s0) / (s1 - s0), start = (yaw0 - s0) / (s1 - s0);
  tr.visible = true;
  const u = tr.material.uniforms;
  u.uHead.value = Math.max(start + 0.01, p.t < swingEnd ? head : (A1 * (p.big ? 1.25 : 1) - s0) / (s1 - s0));
  u.uFade.value = p.t < swingEnd ? 1 : Math.max(0, 1 - (p.t - swingEnd) / FADE);
  if (u.uFade.value <= 0) tr.visible = false;
}

// On an event of the unit: a weapon shot or a skill cast starts a swing (a skill swings wider).
export function slashStart(v, e) {
  for (const p of v.parts) if (p.spec.kind === 'slash' && (e.t === 'fire' || e.t === 'skill')) { p.t = 0; p.big = e.t === 'skill'; }
}

// A hit landed by a unit that is mid-swing: a short white-hot spark burst and flash at the victim, thrown along the swing.
export function slashHit(v, e, fx, color) {
  if (!fx || !fx.sparks) return;
  const p = v.parts.find((q) => q.spec.kind === 'slash');
  if (!p || p.t === undefined || p.t > 0.6) return;
  const dx = e.x - v.root.position.x, dz = e.z - v.root.position.z, d = Math.hypot(dx, dz) || 1;
  fx.sparks(e.x, 1.1, e.z, 12, color, 9, 0.22, 0.05, 0.5, 18, -dz / d, dx / d, 0.45);
  fx.sparks(e.x, 1.1, e.z, 5, WHITE, 6, 0.15, 0.04, 0.3, 18);
  if (fx.flash) fx.flash(e.x, 1.2, e.z, color, 0.6, 0.12);
}
const WHITE = new THREE.Color(3, 3, 3);
