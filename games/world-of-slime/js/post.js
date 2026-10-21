// Hậu kỳ màu toàn màn (shader gốc chưa dịch ngược: game có LUT/weather làm Larus xám-xanh, nhà trong sáng ấm hơn).
// Vẽ cảnh vào render target (tuyến tính, half float), rồi một quad đổi sang sRGB và nhân ma trận màu affine:
//   out = M * c_srgb + o   (sRGB 0..1)
// GRADE theo ClientMapData.mapLightType. Số [ĐO TRONG ẢNH]: hồi quy ridge (λ 0.01) trên cặp mẫu cùng chất liệu
// web|ảnh thật (D:\wos-ref\proof\larus: out2 đất/cỏ/cây/bụi/mái, x2 cỏ), sai số trung bình 6/255. Có thể là thời tiết
// (DistrictType 10 weathers 20001 80%, 20002 20%) chứ không phải đèn bản đồ: chưa đo được ảnh trời khác.
import * as THREE from 'three';

export const GRADE = {
  0: { m: [0.521, 0.148, 0.249, -0.147, 0.902, 0.381, -0.137, 0.308, 1.2], o: [-0.108, -0.146, -0.171] },   // ngoài trời (110)
  1: { m: [1.22, 0, 0, 0, 1.22, 0, 0, 0, 1.22], o: [-0.03, -0.03, -0.03] },   // nhà trong (257, 478): ở x1.15 vách w1 0.77, sàn v9 0.79; ở x1.3 sàn quầy inn1 1.19: lấy giữa, nền tối giữ nguyên
};

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
