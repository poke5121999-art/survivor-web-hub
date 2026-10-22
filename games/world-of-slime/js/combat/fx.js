// Hiệu ứng đạn / trúng dựng lại từ prefab FX gốc (F5a). Game gốc dùng ParticleSystem của Unity (billboard); web không chạy
// được, nên tools/export_fx.py ghi từng lớp hạt (cỡ, màu đầu, tốc độ phát, vật liệu MixMaster/Particles/Particle Default) vào
// fx/index.json + texture GỐC ở fx/tex/. Ở đây mỗi lớp là một tấm quay về camera dùng đúng texture đó:
// - _UseChannel 1: màu = R*_RColor + G*_GColor + B*_BColor (texture là mặt nạ 3 kênh), không thì tex.rgb*_Color.
// - Trộn theo _SrcBlend/_DstBlend: (1,10) premultiplied, (5,1) cộng, (5,10) alpha thường.
// - Chỉ đọc giá trị đầu: đường cong màu/cỡ theo thời gian sống không có trong index, thay bằng mờ dần tuyến tính [ĐỀ XUẤT].
// Lớp dùng: quả cầu = Bubble + Center_Light + vệt Side_Choppy_A/B (phát theo rate khi bay) + Shadow (mặt đất);
// trúng = Flash + Hit + Shock_Ring + lớp sprite sheet của hệ (Fire 4x4, Lightning 3x3...) + tia Particle. Drops chưa dựng.
import * as THREE from 'three';
import { loadJSON, loadTex } from '../assets.js?v=20261022f';

let INDEX = null, loading = null;
export function loadFx() {
  if (!loading) loading = loadJSON('fx/index.json').then(d => (INDEX = d)).catch(() => (INDEX = {}));
  return loading;
}
export const fxReady = () => !!INDEX;

const VS = `uniform vec4 uvRect; varying vec2 vUv; void main() { vUv = uv * uvRect.xy + uvRect.zw; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform sampler2D map; uniform vec3 cR, cG, cB, cC; uniform vec4 tint; uniform float useCh, opacity, premul;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  vec3 c = useCh > 0.5 ? t.r * cR + t.g * cG + t.b * cB : t.rgb * cC;
  float a = (useCh > 0.5 ? max(t.r, max(t.g, t.b)) * t.a : t.a) * tint.a * opacity;
  c *= tint.rgb;
  gl_FragColor = vec4(premul > 0.5 ? c * a : c, a);
  #include <colorspace_fragment>
}`;
const lin = c => new THREE.Color(c[0], c[1], c[2]).convertSRGBToLinear();
const avg = v => Array.isArray(v) ? (v[0] + v[1]) / 2 : (typeof v === 'number' ? v : (v && v.scalar) || 0);
const geo = new THREE.PlaneGeometry(1, 1);
const matCache = new Map();

function layerMat(l) {
  const m = l.material; if (!m || !m.tex || !m.tex._MainTex) return null;
  const key = l.name + '|' + m.name + '|' + JSON.stringify(l.color);
  if (matCache.has(key)) { const c = matCache.get(key).clone(); c.uniforms.uvRect.value = new THREE.Vector4(1, 1, 0, 0); return c; }
  const C = m.colors || {}, F = m.floats || {};
  const col = Array.isArray(l.color) ? l.color : (l.color && l.color.max) || [1, 1, 1, 1];
  const src = F._SrcBlend ?? 5, dst = F._DstBlend ?? 10;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: loadTex(m.tex._MainTex, { srgb: false }) },
      cR: { value: lin(C._RColor || [1, 1, 1]) }, cG: { value: lin(C._GColor || [1, 1, 1]) }, cB: { value: lin(C._BColor || [1, 1, 1]) },
      cC: { value: lin(C._Color || C._TintColor || [1, 1, 1]) },
      tint: { value: new THREE.Vector4(...lin(col).toArray(), col[3] ?? 1) },
      useCh: { value: F._UseChannel > 0.5 ? 1 : 0 }, opacity: { value: 1 }, premul: { value: src === 1 ? 1 : 0 },
      uvRect: { value: new THREE.Vector4(1, 1, 0, 0) },
    },
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: src === 1 ? THREE.OneFactor : THREE.SrcAlphaFactor,
    blendDst: dst === 1 ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
  });
  matCache.set(key, mat);
  return mat.clone();
}

function quad(l, sizeMul = 1) {
  const mat = layerMat(l); if (!mat) return null;
  const q = new THREE.Mesh(geo, mat);
  const s = avg(l.size) * l.scale * sizeMul;
  q.scale.set(s, s, s); q.userData.base = s; q.renderOrder = 5; q.frustumCulled = false;
  return q;
}
const byName = (d, n) => d && d.layers.find(l => l.name === n && l.active);

// quả cầu bay: trả { obj, update(dt, cam, scene), dispose(scene) } hoặc null nếu chưa có dữ liệu prefab
export function makeBall(prefab, sizeMul = 1) {
  const d = INDEX && INDEX[prefab]; if (!d) return null;
  const g = new THREE.Group(); g.name = prefab;
  const bb = [];
  for (const n of ['Bubble', 'Center_Light']) { const l = byName(d, n); const q = l && quad(l, sizeMul); if (q) { g.add(q); bb.push(q); } }
  if (!bb.length) return null;
  const shadowL = byName(d, 'Shadow');
  const shadow = shadowL && quad(shadowL, sizeMul);
  if (shadow) shadow.rotation.x = -Math.PI / 2;
  const trailL = ['Side_Choppy_A', 'Side_Choppy_B'].map(n => byName(d, n)).filter(Boolean);
  const trail = []; let acc = 0, t = 0;
  return {
    obj: g, shadow,
    update(dt, cam, scene, groundY) {
      t += dt;
      for (const q of bb) { q.quaternion.copy(cam.quaternion); const p = 1 + 0.08 * Math.sin(t * 18); q.scale.setScalar(q.userData.base * p); }
      if (shadow) { if (!shadow.parent) scene.add(shadow); shadow.position.set(g.position.x, (groundY ?? g.position.y - 0.45) + 0.03, g.position.z); }
      // vệt vòng tròn: phát theo rateOverTime (5..7/s mỗi lớp), sống 1..1.5 s, mờ dần [ĐỀ XUẤT] đường cong
      for (const l of trailL) {
        acc += dt * avg(l.rate);
        while (acc >= 1) {
          acc -= 1;
          const q = quad(l, sizeMul * 0.5); if (!q) break;
          q.position.copy(g.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25));
          q.userData.life = avg(l.life); q.userData.age = 0; scene.add(q); trail.push(q);
        }
      }
      for (const q of trail) {
        q.userData.age += dt; q.quaternion.copy(cam.quaternion);
        const k = q.userData.age / q.userData.life; q.material.uniforms.opacity.value = Math.max(0, 1 - k);
        q.scale.setScalar(q.userData.base * (1 - 0.5 * k));
        if (k >= 1) { scene.remove(q); q.userData.dead = true; }
      }
      for (let i = trail.length - 1; i >= 0; i--) if (trail[i].userData.dead) trail.splice(i, 1);
    },
    dispose(scene) {
      scene.remove(g); if (shadow) scene.remove(shadow);
      // vệt còn lại tự mờ: giao cho hitFx-style cleaner
      return trail.length ? trail : null;
    },
  };
}

// hiệu ứng trúng: Flash + Hit + Shock_Ring, sống theo startLifetime; trả { update(dt, cam) -> done }
export function makeHit(prefab, pos) {
  const d = INDEX && INDEX[prefab]; if (!d) return null;
  const parts = [];
  for (const n of ['Flash', 'Hit', 'Shock_Ring']) {
    const l = byName(d, n); const q = l && quad(l, n === 'Flash' ? 0.5 : 0.6);   // [ĐỀ XUẤT] x0.5..0.6: cỡ đầu trước SizeOverLifetime
    if (!q) continue;
    q.position.copy(pos); q.userData.life = Math.max(0.15, avg(l.life)); q.userData.age = 0; q.userData.grow = n === 'Shock_Ring';
    parts.push(q);
  }
  // lớp riêng của hệ (Fire 4x4, Lightning 3x3, Leaf 2x2, Splash...): tấm sprite sheet chạy hết khung trong startLifetime,
  // số tấm = burst (3) [ĐỀ XUẤT] vị trí lệch ngẫu nhiên 0.3 m
  const el = d.layers.find(l => l.active && l.uv && l.material && !/UnitMask|Unmask/.test(l.name));
  if (el) {
    const nb = Math.max(1, Math.round(el.bursts[0] || 1));
    for (let i = 0; i < nb; i++) {
      const q = quad(el, 0.6); if (!q) break;
      q.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      q.userData.life = avg(el.life); q.userData.age = -i * 0.05; q.userData.sheet = el.uv; parts.push(q);
    }
  }
  // tia bắn ra (Particle, Stretched Billboard, FX_Tex_Bubble tô 3 kênh): 6 hạt bay toả 2.5 m/s [ĐỀ XUẤT] tốc độ
  const sp = byName(d, 'Particle');
  if (sp) for (let i = 0; i < 6; i++) {
    const q = quad(sp, 0.25); if (!q) break;
    const a = i / 6 * Math.PI * 2 + Math.random() * 0.5;
    q.position.copy(pos); q.userData.vel = new THREE.Vector3(Math.cos(a) * 2.5, 1.2 + Math.random(), Math.sin(a) * 2.5);
    q.userData.life = avg(sp.life); q.userData.age = 0; parts.push(q);
  }
  if (!parts.length) return null;
  const g = new THREE.Group(); parts.forEach(p => g.add(p));
  return {
    obj: g,
    update(dt, cam) {
      let alive = false;
      for (const q of parts) {
        q.userData.age += dt; q.quaternion.copy(cam.quaternion);
        const k = Math.max(0, Math.min(1, q.userData.age / q.userData.life));
        q.visible = q.userData.age >= 0;
        if (q.userData.vel) q.position.addScaledVector(q.userData.vel, dt);
        if (q.userData.sheet) {
          const [tx, ty] = q.userData.sheet, f = Math.min(tx * ty - 1, Math.floor(k * tx * ty));
          q.material.uniforms.uvRect.value.set(1 / tx, 1 / ty, (f % tx) / tx, 1 - (Math.floor(f / tx) + 1) / ty);
          q.material.uniforms.opacity.value = 1 - k * k;
        } else q.material.uniforms.opacity.value = 1 - k;
        q.scale.setScalar(q.userData.base * (q.userData.grow ? 0.4 + 0.8 * k : 1));
        if (k < 1) alive = true;
      }
      return !alive;
    },
  };
}

// trail sprites left after a ball hits: fade them out
export function fadeTrail(list, dt, cam, scene) {
  for (const q of list) {
    q.userData.age += dt; q.quaternion.copy(cam.quaternion);
    const k = q.userData.age / q.userData.life; q.material.uniforms.opacity.value = Math.max(0, 1 - k);
    if (k >= 1 && !q.userData.dead) { scene.remove(q); q.userData.dead = true; }
  }
  return list.every(q => q.userData.dead);
}
