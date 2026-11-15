// Soft studio post for chibi pages (hand-written): scene -> MSAA half-float target with depth, screen-space ambient
// occlusion from depth (Lanternfall's post uses the same idea: 8 sample pairs, radius in metres), a 9-tap blur, then
// AO multiply + optional vignette + three's tone mapping / sRGB in the final quad. Use instead of renderer.render.
import { THREE } from '../lf-host.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const AO_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tD; uniform mat4 uInvProj; uniform vec2 uRes; uniform float uR, uK, uP11, uOrtho;
vec3 vpos(vec2 uv){ float d = texture2D(tD, uv).x; vec4 c = vec4(uv*2.-1., d*2.-1., 1.); vec4 v = uInvProj*c; return v.xyz/v.w; }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
void main(){
  float d = texture2D(tD, vUv).x; if (d >= .99999) { gl_FragColor = vec4(1.); return; }
  vec3 P = vpos(vUv); vec3 N = normalize(cross(dFdx(P), dFdy(P)));
  float rpx = uR * uP11 / mix(max(.05, -P.z), 1., uOrtho) * .5 * uRes.y; rpx = clamp(rpx, 2., 90.);
  float a0 = h12(gl_FragCoord.xy)*6.2831, occ = 0.;
  for (int i = 0; i < 12; i++) {
    float t = (float(i)+.5)/12., a = a0 + float(i)*2.3999;
    vec2 off = vec2(cos(a), sin(a)) * rpx * t / uRes;
    vec3 S = vpos(vUv + off) - P; float l2 = dot(S,S);
    float r2 = uR*uR; occ += max(0., dot(N, S)/sqrt(l2+1e-6) - .08) * max(0., 1. - l2/r2);
  }
  float ao = clamp(1. - uK*occ/12., 0., 1.); gl_FragColor = vec4(ao, ao, ao, 1.);
}`;
const FIN_FS = `precision highp float; varying vec2 vUv; uniform sampler2D tC, tA; uniform vec2 uAR; uniform float uVig, uAOMix, uExp;
// Khronos PBR Neutral highlight compression without its toe (the toe crushes near-black cloth and the backdrop), then sRGB encode
vec3 neutralTM(vec3 c){ float pk = max(c.r, max(c.g, c.b)); if (pk < .76) return c;
  float d = .24, np = 1. - d*d/(pk + d - .76); c *= np/pk; float g = 1. - 1./(.15*(pk - np) + 1.); return mix(c, vec3(np), g); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
void main(){
  vec3 c = texture2D(tC, vUv).rgb; float ao = 0., w = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { float k = (x==0&&y==0) ? 2. : 1.; ao += texture2D(tA, vUv + vec2(float(x), float(y))*uAR*1.5).r*k; w += k; }
  ao /= w; c *= mix(1., ao, uAOMix);
  vec2 q = vUv - .5; c *= 1. - uVig*dot(q,q)*1.2;
  gl_FragColor = vec4(toSRGB(clamp(neutralTM(c*uExp), 0., 1.)), 1.);
}`;

export function createPost(renderer, o = {}) {
  const P = { ao: o.ao === undefined ? 1.0 : o.ao, radius: o.radius || 0.18, strength: o.strength || 1.6, vignette: o.vignette === undefined ? 0.25 : o.vignette };
  let rt = null, rtAO = null;
  const qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  qs.add(quad);
  const mAO = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: AO_FS, uniforms: { tD: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2() }, uR: { value: P.radius }, uK: { value: P.strength }, uP11: { value: 1 }, uOrtho: { value: 0 } }, depthTest: false, depthWrite: false });
  const mFin = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FIN_FS, uniforms: { tC: { value: null }, tA: { value: null }, uAR: { value: new THREE.Vector2() }, uVig: { value: P.vignette }, uAOMix: { value: P.ao }, uExp: { value: 1 } }, depthTest: false, depthWrite: false, toneMapped: false });
  function ensure(w, h) {
    if (rt && rt.width === w && rt.height === h) return;
    if (rt) { rt.dispose(); rtAO.dispose(); }
    rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(w, h, THREE.UnsignedIntType) });
    rtAO = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), { type: THREE.UnsignedByteType });
  }
  function render(scene, cam) {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2()), w = s.x, h = s.y; ensure(w, h);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
    const u = mAO.uniforms; u.tD.value = rt.depthTexture; u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uRes.value.set(rtAO.width, rtAO.height);
    u.uP11.value = cam.projectionMatrix.elements[5]; u.uOrtho.value = cam.isOrthographicCamera ? 1 : 0; u.uR.value = P.radius; u.uK.value = P.strength;
    quad.material = mAO; renderer.setRenderTarget(rtAO); renderer.render(qs, qc);
    const f = mFin.uniforms; f.tC.value = rt.texture; f.tA.value = rtAO.texture; f.uAR.value.set(1 / rtAO.width, 1 / rtAO.height); f.uVig.value = P.vignette; f.uAOMix.value = P.ao; f.uExp.value = renderer.toneMappingExposure;
    quad.material = mFin; renderer.setRenderTarget(null); renderer.render(qs, qc);
  }
  return { render, params: P };
}
