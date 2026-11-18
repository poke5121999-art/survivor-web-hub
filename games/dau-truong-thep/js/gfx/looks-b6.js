// Looks, batch 6: Bọ Cạp, Lươn Điện, Nhện Thép, Băng Nha (Ve Sầu moved to looks-k8.js, Kiếm Thần to looks-k15.js with his ported kit). Render only (see looks.js for the hooks).
// Each look's own shape carries it; bursts are only brief flashes where blows land.
// Clip notes (bilibili BV1Kp4y1b7i6, mapping in ~/handoff/dtt-ref/bili/MAP.md):
//   毒蝎女王 p52 (Bọ Cạp): magenta-violet sting streaks, a violet swirl round her when she spins, magenta poison bubbles on
//     the foes she hits.
//   电魂 p51 (Lươn Điện): violet-white plasma orbs crackling, a cyan electric bubble round the caster, a blue storm cloud.
//   米卡莎 p56 (Nhện Thép = Mikasa): its looks moved to looks-k18.js with the kit ported from the clip (kit lane K18).
//   冰雪女王 p81 (Băng Nha): white frost arcs flying out, a big ice-blue frost dome with snow swirling, an ice prison.
//   李白 p65 (Kiếm Thần): red flame swords falling in fire columns, white blades ringing the caster, a red flying sword.
import * as THREE from '../../vendor/three.module.min.js';
import { orbPos } from '../sim.js';
import { C, own, stop, sigil, shell, pillar, trail, burst } from './lookkit.js';
import { zap, forks, ribbonMesh, fillRibbon } from './looks-b5.js';

const R = (a, b) => a + Math.random() * (b - a);
const keep = (g) => { g.userData.keep = true; return g; };
const basic = (c, add, op = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
function held(kit, objs) { const h = { on: true }; own(kit, objs, 1e9, () => h.on); return h; }
function fadeAll(g, k) { g.traverse((m) => { if (m.material) { if (m.userData.op === undefined) m.userData.op = m.material.opacity; m.material.opacity = m.userData.op * k; } }); }
function order(g, n) { g.traverse((m) => { m.frustumCulled = false; if (m.material) m.renderOrder = n + (m.material.blending === THREE.AdditiveBlending ? 0 : 1); }); return g; }
const WHITE = C(2.4, 2.4, 2.5);
const discGeo = keep(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2)), annGeo = keep(new THREE.RingGeometry(0.88, 1, 56).rotateX(-Math.PI / 2));
const ballGeo = keep(new THREE.SphereGeometry(0.4, 12, 8));
const flatShape = (P) => { const s = new THREE.Shape(); s.moveTo(P[0][0], P[0][1]); for (const p of P.slice(1)) s.lineTo(p[0], p[1]); return keep(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)); };

// Lươn Điện (Razor) moved to looks-k17.js with its ported kit.

// ---- Nhện Thép (Mikasa) moved to looks-k18.js with the kit ported from clip p56 (kit lane K18) ---------------------

// ---- Băng Nha moved to looks-k9.js with the kit ported from clip p81; Kiếm Thần still borrows BN_WHITE -------------------------
const BN_WHITE = C(2.3, 2.5, 2.6);

export const B6 = {};   // vesau, bang, bocap, nhenthep, kiemthan and luondien moved to looks-k8.js / looks-k9.js / looks-k10.js / looks-k18.js / looks-k15.js / looks-k17.js with their ported kits
