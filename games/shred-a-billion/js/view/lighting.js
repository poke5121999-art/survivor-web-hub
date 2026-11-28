// Baked per-vertex lighting that reproduces Unity URP's realtime light model for the vault's 61 lights
// (URP: diffuse = albedo * sum(color * intensity * distAtten * spotAtten * NdotL) + albedo * ambient; no 1/PI),
// so the phone draws one cheap unlit pass. Trilight ambient from level0 RenderSettings.
import * as THREE from 'three';

const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
// RenderSettings m_AmbientSkyColor / Equator / Ground (sRGB), intensity 1
export const AMBIENT = {
  sky: [lin(0.72), lin(0.66), lin(0.58)],
  equator: [lin(0.62), lin(0.58), lin(0.54)],
  ground: [lin(0.52), lin(0.52), lin(0.44)],
};
export const FOG = { color: [0.45, 0.42, 0.45], start: 45, end: 190 };

export class LightField {
  constructor(lights) {
    this.L = lights.filter(l => l.type !== 1).map(l => {
      const outer = (l.spot || 30) * Math.PI / 180 / 2;
      // URP: inner spot angle; when unset Unity uses inner = outer * (1 - 0.1)... keep the exported value when present
      const innerDeg = l.inner && l.inner > 0 ? l.inner : (l.spot || 30) * 0.8;
      const inner = innerDeg * Math.PI / 180 / 2;
      const cosO = Math.cos(outer), cosI = Math.cos(inner);
      const inv = 1 / Math.max(cosI - cosO, 1e-3);
      return { type: l.type, p: l.pos, d: l.dir, c: l.color.map(v => v * l.intensity), r2: l.range * l.range, invR2: 1 / (l.range * l.range), range: l.range, sInv: inv, sOff: -cosO * inv };
    });
    this.dirs = lights.filter(l => l.type === 1).map(l => ({ d: l.dir, c: l.color.map(v => v * l.intensity) }));
    // spatial hash (xz, 8 m) for range queries
    this.cell = 8; this.grid = new Map();
    this.L.forEach((l, i) => {
      const r = l.range, c = this.cell;
      for (let x = Math.floor((l.p[0] - r) / c); x <= Math.floor((l.p[0] + r) / c); x++)
        for (let z = Math.floor((l.p[2] - r) / c); z <= Math.floor((l.p[2] + r) / c); z++) {
          const k = x * 73856093 ^ z * 19349663;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(i);
        }
    });
  }

  ambient(ny, out) {
    // Unity trilight: lerp ground->equator->sky by normal.y
    const a = AMBIENT;
    if (ny >= 0) for (let k = 0; k < 3; k++) out[k] = a.equator[k] + (a.sky[k] - a.equator[k]) * ny;
    else for (let k = 0; k < 3; k++) out[k] = a.equator[k] + (a.ground[k] - a.equator[k]) * -ny;
    return out;
  }

  // irradiance (linear rgb) at point p with normal n
  at(px, py, pz, nx, ny, nz, out) {
    this.ambient(ny, out);
    const k = Math.floor(px / this.cell) * 73856093 ^ Math.floor(pz / this.cell) * 19349663;
    const list = this.grid.get(k);
    if (list) for (const i of list) {
      const l = this.L[i];
      const dx = l.p[0] - px, dy = l.p[1] - py, dz = l.p[2] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= l.r2) continue;
      const id = 1 / Math.sqrt(Math.max(d2, 1e-6));
      const lx = dx * id, ly = dy * id, lz = dz * id;
      const ndl = nx * lx + ny * ly + nz * lz;
      if (ndl <= 0) continue;
      const f = d2 * l.invR2;
      let sm = 1 - f * f; if (sm < 0) sm = 0; sm *= sm;
      let att = sm / Math.max(d2, 1e-4);
      if (l.type === 0) {
        const cd = -(lx * l.d[0] + ly * l.d[1] + lz * l.d[2]);
        let s = cd * l.sInv + l.sOff; s = s < 0 ? 0 : s > 1 ? 1 : s;
        att *= s * s;
        if (att <= 0) continue;
      }
      const w = att * ndl;
      out[0] += l.c[0] * w; out[1] += l.c[1] * w; out[2] += l.c[2] * w;
    }
    for (const dl of this.dirs) {
      const ndl = -(nx * dl.d[0] + ny * dl.d[1] + nz * dl.d[2]);
      if (ndl > 0) { out[0] += dl.c[0] * ndl; out[1] += dl.c[1] * ndl; out[2] += dl.c[2] * ndl; }
    }
    return out;
  }

  // bake into a 'color' attribute of a world-space, non-indexed geometry
  bake(geo) {
    const P = geo.attributes.position, N = geo.attributes.normal;
    const n = P.count;
    const col = new Float32Array(n * 3);
    const o = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      this.at(P.getX(i), P.getY(i), P.getZ(i), N.getX(i), N.getY(i), N.getZ(i), o);
      col[i * 3] = o[0]; col[i * 3 + 1] = o[1]; col[i * 3 + 2] = o[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
}

// Split triangles until no world-space edge is longer than maxEdge (so vertex lighting resolves spot pools).
export function tessellate(geo, maxEdge) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position.array, N = g.attributes.normal ? g.attributes.normal.array : null;
  const U = g.attributes.uv ? g.attributes.uv.array : null;
  const outP = [], outN = [], outU = [];
  const m2 = maxEdge * maxEdge;
  const stack = [];
  for (let t = 0; t < P.length / 9; t++) {
    const tri = [];
    for (let v = 0; v < 3; v++) {
      const i = t * 3 + v;
      tri.push({ p: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: N ? [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]] : [0, 1, 0], u: U ? [U[i * 2], U[i * 2 + 1]] : [0, 0] });
    }
    stack.push(tri);
    let guard = 0;
    while (stack.length && guard++ < 100000) {
      const [a, b, c] = stack.pop();
      const d = (x, y) => (x.p[0] - y.p[0]) ** 2 + (x.p[1] - y.p[1]) ** 2 + (x.p[2] - y.p[2]) ** 2;
      const ab = d(a, b), bc = d(b, c), ca = d(c, a);
      const mx = Math.max(ab, bc, ca);
      if (mx <= m2) {
        for (const v of [a, b, c]) { outP.push(...v.p); outN.push(...v.n); outU.push(...v.u); }
        continue;
      }
      const mid = (x, y) => ({ p: x.p.map((v, k) => (v + y.p[k]) / 2), n: x.n.map((v, k) => (v + y.n[k]) / 2), u: x.u.map((v, k) => (v + y.u[k]) / 2) });
      if (mx === ab) { const m = mid(a, b); stack.push([a, m, c], [m, b, c]); }
      else if (mx === bc) { const m = mid(b, c); stack.push([a, b, m], [a, m, c]); }
      else { const m = mid(c, a); stack.push([a, b, m], [m, b, c]); }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  if (U) out.setAttribute('uv', new THREE.Float32BufferAttribute(outU, 2));
  return out;
}

// Unlit material that multiplies albedo by the baked vertex light and adds Unity emission.
export function bakedMaterial(src) {
  const m = new THREE.MeshBasicMaterial({ color: src.color, map: src.map || null, vertexColors: true, transparent: src.transparent,
    opacity: src.opacity, side: src.side, alphaTest: src.alphaTest || 0, depthWrite: src.depthWrite, fog: true });
  const em = src.emissive ? src.emissive.clone() : new THREE.Color(0, 0, 0);
  const emMap = src.emissiveMap || null;
  m.userData.emissive = em;
  if (em.r + em.g + em.b > 0) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uEmissive = { value: em };
      sh.uniforms.uEmMap = { value: emMap };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uEmissive;' + (emMap ? '\nuniform sampler2D uEmMap;' : ''))
        .replace('vec3 outgoingLight = reflectedLight.indirectDiffuse;',
          'vec3 outgoingLight = reflectedLight.indirectDiffuse + uEmissive' + (emMap ? ' * texture2D(uEmMap, vMapUv).rgb' : '') + ';');
    };
    m.customProgramCacheKey = () => 'em' + (emMap ? 'm' : '');
  }
  m.name = src.name;
  return m;
}
