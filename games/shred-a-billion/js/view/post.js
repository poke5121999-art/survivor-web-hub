// Final pass approximating the game's URP GlobalVolumeProfile (sharedassets0):
// ColorAdjustments postExposure +0.35 EV, saturation +10; Tonemapping mode 1 = Unity "Neutral";
// Vignette intensity 0.34 smoothness 0.5 color (0.06,0.04,0.08); Bloom threshold 0.95 intensity 0.8 scatter 0.65 (cheap version).
import * as THREE from 'three';

const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene; uniform sampler2D tBloom;
uniform float uExposure, uSat, uVig, uVigSmooth, uBloom; uniform vec3 uVigColor; uniform vec2 uAspect;
vec3 nc(vec3 x){ const float a=0.2,b=0.29,c=0.24,d=0.272,e=0.02,f=0.3; return ((x*(a*x+c*b)+d*e)/(x*(a*x+b)+d*f))-e/f; }
vec3 neutral(vec3 x){ vec3 ws = vec3(1.0)/nc(vec3(5.3)); return nc(x*ws)*ws; }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(vec3(0.0031308), c)); }
void main(){
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(vec3(0.0), mix(vec3(l), c, uSat));
  c = neutral(c);
  vec2 d = (vUv - 0.5) * uAspect;
  float v = pow(clamp(1.0 - dot(d, d) * uVig * 2.0, 0.0, 1.0), uVigSmooth * 5.0);
  c = mix(uVigColor, c, v);
  gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;
const BRIGHT = `precision highp float; varying vec2 vUv; uniform sampler2D t; uniform float uTh, uExposure;
void main(){ vec3 c = texture2D(t, vUv).rgb * uExposure; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * max(0.0, l - uTh) / max(l, 1e-4), 1.0); }`;
const BLUR = `precision highp float; varying vec2 vUv; uniform sampler2D t; uniform vec2 uDir;
void main(){ vec3 s = texture2D(t, vUv).rgb * 0.227027;
 s += (texture2D(t, vUv + uDir*1.3846).rgb + texture2D(t, vUv - uDir*1.3846).rgb) * 0.3162162;
 s += (texture2D(t, vUv + uDir*3.2308).rgb + texture2D(t, vUv - uDir*3.2308).rgb) * 0.0702703; gl_FragColor = vec4(s, 1.0); }`;

export class Post {
  constructor(renderer, { bloom = true } = {}) {
    this.r = renderer;
    this.bloomOn = bloom;
    const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
    this.b1 = new THREE.WebGLRenderTarget(4, 4, { type });
    this.b2 = new THREE.WebGLRenderTarget(4, 4, { type });
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = (fs, uniforms) => { const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
      const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return { s, m }; };
    this.final = quad(FS, { tScene: { value: this.rt.texture }, tBloom: { value: this.b1.texture }, uExposure: { value: Math.pow(2, 0.35) },
      uSat: { value: 1.1 }, uVig: { value: 0.34 }, uVigSmooth: { value: 0.5 }, uVigColor: { value: new THREE.Vector3(0.06, 0.04, 0.08) },
      uBloom: { value: bloom ? 0.8 * 0.35 : 0 }, uAspect: { value: new THREE.Vector2(1, 1) } });
    this.bright = quad(BRIGHT, { t: { value: this.rt.texture }, uTh: { value: 0.95 }, uExposure: { value: Math.pow(2, 0.35) } });
    this.blur = quad(BLUR, { t: { value: null }, uDir: { value: new THREE.Vector2() } });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // we encode in the final shader
    renderer.toneMapping = THREE.NoToneMapping;
  }
  setSize(w, h) {
    this.rt.setSize(w, h);
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    this.b1.setSize(bw, bh); this.b2.setSize(bw, bh);
    this.bw = bw; this.bh = bh;
    const a = w / h; this.final.m.uniforms.uAspect.value.set(a > 1 ? 1 : a, a > 1 ? 1 / a : 1);
  }
  // overlay: {scene, camera} drawn after a depth clear (first-person viewmodel never clips into walls)
  render(scene, camera, overlay) {
    const r = this.r;
    r.setRenderTarget(this.rt); r.render(scene, camera);
    if (overlay) { const ac = r.autoClear; r.autoClear = false; r.clearDepth(); r.render(overlay.scene, overlay.camera); r.autoClear = ac; }
    if (this.bloomOn) {
      r.setRenderTarget(this.b1); r.render(this.bright.s, this.cam);
      for (let i = 0; i < 2; i++) {
        this.blur.m.uniforms.t.value = this.b1.texture; this.blur.m.uniforms.uDir.value.set(1.5 / this.bw, 0);
        r.setRenderTarget(this.b2); r.render(this.blur.s, this.cam);
        this.blur.m.uniforms.t.value = this.b2.texture; this.blur.m.uniforms.uDir.value.set(0, 1.5 / this.bh);
        r.setRenderTarget(this.b1); r.render(this.blur.s, this.cam);
      }
    }
    r.setRenderTarget(null); r.render(this.final.s, this.cam);
  }
}
