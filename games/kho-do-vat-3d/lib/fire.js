// Stylised low-poly fire: a few flickering flame cones + optional point light.
import * as THREE from '../vendor/three.module.min.js';

let FIRE_MAT = null;
const fireTime = { value: 0 };
function fireMaterial() {
  if (FIRE_MAT) return FIRE_MAT;
  FIRE_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  FIRE_MAT.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = fireTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aPhase;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float hgt = clamp(position.y, 0.0, 1.0);
float ph = aPhase*6.2831;
transformed.x += sin(uTime*7.0 + ph + position.y*5.0) * 0.18 * hgt;
transformed.z += cos(uTime*6.1 + ph*1.3 + position.y*4.0) * 0.18 * hgt;
transformed.y *= 0.8 + 0.35*(0.5+0.5*sin(uTime*9.0 + ph*2.0));
transformed.xz *= 1.0 - 0.15*sin(uTime*11.0+ph);`);
  };
  return FIRE_MAT;
}
export function tickFire(t) { fireTime.value = t; }

// makeFire({ radius, height, count, light, seed }) -> Group (tris in userData)
export function makeFire({ radius = 0.25, height = 0.5, count = 5, light = false, seed = 1 } = {}) {
  const grp = new THREE.Group(); grp.name = 'fire';
  const cols = [new THREE.Color('#ff5a14'), new THREE.Color('#ffa21f'), new THREE.Color('#ffe066')].map((c) => c);
  const geos = [];
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < count; i++) {
    const layer = i % 3;
    const r = radius * (0.55 - layer * 0.12) * (0.8 + rnd() * 0.4);
    const h = 1; // unit height, scaled below
    const g = new THREE.ConeGeometry(r, h, 6, 3, true);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3), ph = new Float32Array(pos.count);
    const p = rnd();
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      const c = cols[Math.min(2, layer + (y > 0.6 ? 1 : 0))];
      col.set([c.r, c.g, c.b], k * 3); ph[k] = p;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const a = rnd() * Math.PI * 2, d = layer === 0 ? radius * 0.35 * rnd() : radius * 0.25 * rnd();
    g.scale(1, height * (1 - layer * 0.18) * (0.75 + rnd() * 0.5), 1);
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    g.deleteAttribute('uv');
    geos.push(g);
  }
  // merge
  let vc = 0, ic = 0; for (const g of geos) { vc += g.attributes.position.count; ic += g.index.count; }
  const out = new THREE.BufferGeometry();
  const P = new Float32Array(vc * 3), C = new Float32Array(vc * 3), F = new Float32Array(vc), I = new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    P.set(g.attributes.position.array, vo * 3); C.set(g.attributes.color.array, vo * 3); F.set(g.attributes.aPhase.array, vo);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) I[io + i] = ix[i] + vo;
    io += ix.length; vo += n;
  }
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('aPhase', new THREE.BufferAttribute(F, 1));
  out.setIndex(new THREE.BufferAttribute(I, 1));
  // keep the shader's wobble driven by unit height: vertex y is in metres; scale wobble by height
  const mesh = new THREE.Mesh(out, fireMaterial());
  mesh.renderOrder = 2;
  grp.add(mesh);
  grp.userData.fireDraws = 1; grp.userData.fireTris = ic / 3;
  if (light) {
    const L = new THREE.PointLight(0xff8a2a, 2.5, radius * 14, 1.6);
    L.position.y = height * 0.6; grp.add(L);
    grp.userData.light = L;
  }
  grp.userData.update = (t) => {
    if (grp.userData.light) grp.userData.light.intensity = 2.2 + Math.sin(t * 13) * 0.3 + Math.sin(t * 7.3) * 0.3;
  };
  return grp;
}
