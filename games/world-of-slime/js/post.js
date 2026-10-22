// Hậu kỳ màu toàn màn. Vẽ cảnh vào render target (tuyến tính, half float), rồi một quad đổi sang sRGB và nhân ma trận màu affine:
//   out = M * c_srgb + o   (sRGB 0..1)
// GRADE theo ClientMapData.mapLightType (enum gốc SMEditor.Common.Enums.MapLightType: 0 Common, 1 IndoorCommon, 2 Cave, 3 Fog).
// NGÀY / ĐÊM (F5b): game có chu kỳ ngày đêm theo giờ server: RealtimeBaseLight.Refresh đặt Light.color của đèn chính =
// CommonDataSet.LightTypeData[lightType].lightGradient.Evaluate(t), t = (giây trong ngày % scaledDaySeconds) / scaledDaySeconds
// (scaledDaySeconds chia timeScale ở Initialize; nightStartHour 19, nightEndHour 6). Gradient lightType 0: xanh đêm
// (0.294, 0.440, 0.786) tới 0.199, cam 0.219, ấm 0.246, TRẮNG 0.290..0.701, ấm 0.745, cam 0.772, xanh đêm từ 0.792.
// LightType 1 (nhà trong) trắng suốt ngày. Ảnh demo thật D:\wos-ref\pilot (x2, v3, out2...) chụp lúc ĐÊM (đèn xanh nhân lên cát
// vàng ra xám-xanh), clip DcGavHFwqtk chụp ban NGÀY. Bản web mặc định là ban ngày như clip; `?time=HH:MM` chọn giờ trong ngày
// (giờ thật 24 h, coi scaledDaySeconds = 86400 [ĐỀ XUẤT]: timeScale nằm trong scene, chưa đọc).
import * as THREE from 'three';
import { PARAMS } from './config.js?v=20261022f';

// ĐÊM (đèn xanh của gradient): hồi quy ridge (λ 0.01) trên cặp mẫu cùng chất liệu web|ảnh thật D:\wos-ref\proof\larus
// (out2 đất/cỏ/cây/bụi/mái, x2 cỏ), sai số trung bình 6/255. Từ F5b chỉ dùng khi `?time=` rơi vào đêm.
export const GRADE_NIGHT = {
  0: { m: [0.521, 0.148, 0.249, -0.147, 0.902, 0.381, -0.137, 0.308, 1.2], o: [-0.108, -0.146, -0.171] },
};
// NGÀY (F5b, đèn trắng): ridge về ma trận đơn vị (λ 0.02) trên 6 chất liệu web ?grade=0 | khung clip 2:03.5 cùng chỗ
// (D:\wos-ref\proof\day: cát (196,171,121)->(245,214,152), cỏ (99,188,81)->(116,180,97), bụi, mái xanh, ván, thùng), sai số 4..12/255.
export const GRADE = {
  0: { m: [1.228, 0.020, 0.065, 0.279, 0.822, 0.125, 0.124, 0.047, 1.036], o: [-0.045, -0.010, -0.028] },   // ngoài trời (110), ban ngày
  1: { m: [1.22, 0, 0, 0, 1.22, 0, 0, 0, 1.22], o: [-0.03, -0.03, -0.03] },   // nhà trong (257, 478): ở x1.15 vách w1 0.77, sàn v9 0.79; ở x1.3 sàn quầy inn1 1.19: lấy giữa, nền tối giữ nguyên
  // rừng dựng theo clip (shadow_forest_entrance; 2 = Cave trong enum gốc, bản đồ thật chưa có nên số này là của bản web).
  // F5b: ridge về đơn vị (λ 0.02) trên cụm màu k-means (k 6) của web ?grade=0 | khung clip 5:51-6:00 (D:\wos-ref\proof\day\forest):
  // đất (75,125,105)->(93,146,125), đường (119,147,124)->(140,162,138), tán cây (12,85,60)->(51,81,74), cỏ cao (72,115,93)->(82,127,110).
  // Bản F1 (x1.1 + lệch) làm đất sáng hơn clip và cây xanh lá gắt; bản này kéo cây về xanh lam-xám như clip.
  2: { m: [0.832, 0.159, 0.035, 0.050, 1.017, 0.100, -0.083, 0.082, 1.072], o: [0.038, -0.008, 0.021] },
};

// Gradient đèn chính lightType 0 (CommonDataSet.json LightTypeData[0], ctime/65535): độ "đêm" 0..1 = 1 - (r - 0.294) / 0.706
// (đỏ là kênh đổi nhiều nhất). Trả 0 suốt ban ngày.
const KEYS = [[0, 1], [13040, 1], [14352, 0], [16139, 0], [18981, 0], [45940, 0], [48824, 0], [50593, 0], [51917, 1], [65535, 1]];
export function nightness(hours) {
  const t = ((hours % 24) + 24) % 24 / 24 * 65535;
  for (let i = 1; i < KEYS.length; i++) if (t <= KEYS[i][0]) {
    const [a, va] = KEYS[i - 1], [b, vb] = KEYS[i]; return va + (vb - va) * (t - a) / ((b - a) || 1);
  }
  return 1;
}
// giờ trong game: ?time=HH:MM (mặc định 12:00 = ban ngày như clip)
export function gameHours() {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(PARAMS.get('time') || '');
  return m ? +m[1] + (+m[2] || 0) / 60 : 12;
}
// grade cho một mapLightType ở giờ h: trộn tuyến tính ngày -> đêm theo nightness (chỉ loại có bản đêm đo được)
export function gradeFor(lightType, h = gameHours()) {
  const d = GRADE[lightType]; if (!d) return null;
  const n = GRADE_NIGHT[lightType] ? nightness(h) : 0; if (n <= 0) return d;
  const N = GRADE_NIGHT[lightType], mix = (a, b) => a.map((v, i) => v + (b[i] - v) * n);
  return { m: mix(d.m, N.m), o: mix(d.o, N.o) };
}

export class Post {
  constructor(renderer, msaa) {
    this.r = renderer;
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(s.x, s.y, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { t: { value: this.rt.texture }, M: { value: new THREE.Matrix3() }, o: { value: new THREE.Vector3() }, on: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D t; uniform mat3 M; uniform vec3 o; uniform float on; varying vec2 vUv;
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main() { vec3 c = toSRGB(max(texture2D(t, vUv).rgb, 0.0)); if (on > 0.5) c = M * c + o; gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setGrade(g) {
    this.mat.uniforms.on.value = g ? 1 : 0;
    if (!g) return;
    const m = g.m; this.mat.uniforms.M.value.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
    this.mat.uniforms.o.value.set(...g.o);
  }
  resize() { const s = this.r.getDrawingBufferSize(new THREE.Vector2()); this.rt.setSize(s.x, s.y); }
  render(scene, cam) {
    this.r.setRenderTarget(this.rt); this.r.render(scene, cam);
    this.r.setRenderTarget(null); this.r.render(this.scene, this.cam);
  }
}
