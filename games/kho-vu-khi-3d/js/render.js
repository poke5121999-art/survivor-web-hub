// Saltline light and post for a weapon showcase (render.md): one directional sun at 9 with PCSS soft shadows,
// sky PMREM at environment 2 and no hemi/ambient, HDR half-float target with MSAA, 6-level Jimenez bloom,
// anamorphic streak, grade = mix(ACES, AgX 'punchy', 0.25) + split tone + S-curve + vignette, final FXAA/sharpen/grain.
// Every shader string and the sky/PCSS/shadow-fit code come from js/sl/render-sl.js (generated from Saltline).
import * as THREE from '../vendor/three.module.min.js';
import { SUN_DIR, SUN_COLOR, SUN_INTENSITY } from './sky.js';
import {
  createSky, captureEnv, fitSunShadow, installPCSS, POST_VERT, POST_COMMON, BLOOM_DOWN, BLOOM_UP, STREAK, GRADE, FINAL,
} from './sl/render-sl.js';

let stockLights = null;
export const QUALITY = {
  high: { msaa: 4, shadow: 4096, dpr: 2, fxaa: 0, bloom: true, tex: 1024 },
  low: { msaa: 0, shadow: 2048, dpr: 1, fxaa: 1, bloom: true, tex: 512 },
};

function skyNoise() {
  // 256x256 xorshift32 noise, seed 2654435769 (render.md §3)
  const n = 256, d = new Uint8Array(n * n * 4); let x = 2654435769 >>> 0;
  for (let i = 0; i < d.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; d[i] = x & 255; }
  const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

export class Render {
  constructor(canvas, qualityName = 'high') {
    this.q = QUALITY[qualityName] || QUALITY.high; this.qName = qualityName;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.autoClear = false;
    this.scene = new THREE.Scene();
    this.exposure = 1; this.agxMix = 0.25; this.bloomOn = true;
    // sky (backdrop + environment capture)
    this.sky = createSky(skyNoise());
    this.sky.mesh.matrixAutoUpdate = true;
    this.scene.add(this.sky.mesh);
    // sun
    const sun = this.sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    sun.castShadow = true; sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.02; sun.shadow.radius = +(new URLSearchParams(location.search).get('srad') || 0.06);
    sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.scene.add(sun, sun.target);
    this.fitShadow(new THREE.Box3(new THREE.Vector3(-2, -0.2, -1), new THREE.Vector3(2, 2, 1)));
    this.captureEnv();
    this.buildPost();
  }
  captureEnv() {
    const rt = captureEnv(this.renderer, this.sky);
    if (this.scene.environment) this.scene.environment.dispose();
    this.scene.environment = rt.texture; this.scene.environmentIntensity = 2;
  }
  fitShadow(box) {
    const fr = fitSunShadow(this.sun, box.min, box.max, box.min, box.max);
    if (!/[?&]pcss=0/.test(location.search)) {
      installPCSS(fr, { taps: this.q.msaa ? 24 : 12, searchTaps: 10 });
      // ANGLE/D3D11 leaves dFdx undefined inside getShadow (it is reached through a branch in the light loop), so the
      // receiver-plane slope became noise and the blocker search found the receiver itself (dotted shadows).
      // Take the derivatives once in main(), in uniform control flow, and hand them to the PCSS code.
      if (!/[?&]rpdb=0/.test(location.search)) {
        let c = THREE.ShaderChunk.shadowmap_pars_fragment;
        const a = 'vec3 dx = dFdx( sc ), dy = dFdy( sc );', b = 'float getShadow( sampler2D shadowMap, vec2 shadowMapSize';
        if (!c.includes(a) || !c.includes(b)) throw new Error('PCSS chunk anchor not found');
        c = c.replace(a, 'vec3 dx = slDX0, dy = slDY0;').replace(b, 'vec3 slDX0 = vec3(0.0), slDY0 = vec3(0.0);\n' + b);
        THREE.ShaderChunk.shadowmap_pars_fragment = c;
        if (stockLights === null) stockLights = THREE.ShaderChunk.lights_fragment_begin;
        THREE.ShaderChunk.lights_fragment_begin = `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
{ vec3 slS = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w; slDX0 = dFdx( slS ); slDY0 = dFdy( slS ); }
#endif
` + stockLights;
      } else {
        const c = THREE.ShaderChunk.shadowmap_pars_fragment, a = 'dz = clamp( dz, vec2( - maxSlope ), vec2( maxSlope ) );';
        THREE.ShaderChunk.shadowmap_pars_fragment = c.replace(a, 'dz = vec2( 0.0 );');
      }
      const m = location.search.match(/[?&]pcssdbg=(\w+)/);
      if (m) THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace('return mix( 1.0, lit, shadowIntensity );', m[1] === 'nb' ? 'return 1.0 - nb / 8.0;' : m[1] === 'pen' ? 'return clamp(penM * 10.0, 0.0, 1.0);' : 'return lit;');
    }
    this.shadowFrustum = fr;
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
  buildPost() {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quad = new THREE.Mesh(tri); this.quad.frustumCulled = false;
    this.postScene = new THREE.Scene(); this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (frag, uniforms, defines) => new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: frag, uniforms, defines: defines || {}, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
    // 1x1 'adapted luminance' texture: fixed exposure (uAuto 0); .g = sun visibility for the flare (off here)
    this.adapt = new THREE.DataTexture(new Float32Array([0.12, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType); this.adapt.needsUpdate = true;
    const expo = () => ({ tAdapt: { value: this.adapt }, uExposure: { value: 1 }, uKey: { value: 0.12 }, uMinE: { value: 0.6 }, uMaxE: { value: 2 }, uAuto: { value: 0 } });
    this.mDown = mk(BLOOM_DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
    this.mUp = mk(BLOOM_UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 0.62 } });
    this.mStreak = mk(STREAK, Object.assign({ tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uThreshold: { value: 2.2 } }, expo()));
    this.mGrade = mk(GRADE, Object.assign({
      tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tStreak: { value: null }, tDirt: { value: black },
      uSunCol: { value: SUN_COLOR.clone() }, uSunUv: { value: new THREE.Vector2(0.5, 0.5) }, uTime: { value: 0 }, uAspect: { value: 1 },
      uBloom: { value: 0.065 }, uDirt: { value: 0 }, uStreak: { value: 0.03 }, uFlare: { value: 0 }, uCA: { value: 0.0013 }, uVignette: { value: 0.3 },
      uDamage: { value: 0 }, uLowHealth: { value: 0 }, uAds: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uSaturation: { value: 1 },
      uSunOn: { value: 0 }, uThunder: { value: 0 }, uAgxMix: { value: 0.25 },
    }, expo()), { LOOK_POWER: '1.18', LOOK_SAT: '1.22' });
    this.mFinal = mk(FINAL, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uGrain: { value: 0.02 }, uSharpen: { value: 0.3 }, uFxaa: { value: this.q.fxaa } });
    this.black = black;
  }
  setQuality(name) {
    this.q = QUALITY[name] || QUALITY.high; this.qName = name;
    this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.mFinal.uniforms.uFxaa.value = this.q.fxaa;
    this.fitShadow(this.lastBox || new THREE.Box3(new THREE.Vector3(-2, -0.2, -1), new THREE.Vector3(2, 2, 1)));
    this.size = null;
  }
  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.dpr);
    const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr));
    if (this.size && this.size[0] === W && this.size[1] === H && this.size[2] === this.q.msaa) return;
    this.size = [W, H, this.q.msaa];
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false);
    this.renderer.domElement.width = W; this.renderer.domElement.height = H;
    (this.targets || []).forEach((t) => t.dispose());
    const rt = (w2, h2, type = THREE.HalfFloatType, o = {}) => new THREE.WebGLRenderTarget(w2, h2, Object.assign({ type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }, o));
    this.hdr = rt(W, H, THREE.HalfFloatType, { depthBuffer: true, samples: this.q.msaa });
    this.down = []; this.up = [];
    let w2 = Math.ceil(W / 2), h2 = Math.ceil(H / 2);
    for (let i = 0; i < 6; i++) { this.down.push(rt(w2, h2)); this.up.push(rt(w2, h2)); w2 = Math.max(2, Math.ceil(w2 / 2)); h2 = Math.max(2, Math.ceil(h2 / 2)); }
    this.streakA = rt(this.down[2].width, this.down[2].height); this.streakB = rt(this.down[2].width, this.down[2].height);
    this.ldr = rt(W, H, THREE.UnsignedByteType);
    this.targets = [this.hdr, ...this.down, ...this.up, this.streakA, this.streakB, this.ldr];
    this.W = W; this.H = H;
  }
  pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.postScene, this.postCam); }
  render(camera, t = 0) {
    const r = this.renderer;
    r.setRenderTarget(this.hdr); r.setClearColor(0x000000, 1); r.clear(true, true, false);
    r.render(this.scene, camera);
    // bloom: 6 down (Karis on the first), 5 up with tent mix .62
    let src = this.hdr.texture;
    for (let i = 0; i < 6; i++) {
      const d = this.down[i]; this.mDown.uniforms.tSrc.value = src; this.mDown.uniforms.uFirst.value = i === 0 ? 1 : 0;
      const sw = i === 0 ? this.W : this.down[i - 1].width, sh = i === 0 ? this.H : this.down[i - 1].height;
      this.mDown.uniforms.uTexel.value.set(1 / sw, 1 / sh); this.pass(this.mDown, d); src = d.texture;
    }
    let low = this.down[5].texture;
    for (let i = 4; i >= 0; i--) {
      this.mUp.uniforms.tLow.value = low; this.mUp.uniforms.tHigh.value = this.down[i].texture;
      this.mUp.uniforms.uTexel.value.set(1 / this.down[i + 1].width, 1 / this.down[i + 1].height);
      this.pass(this.mUp, this.up[i]); low = this.up[i].texture;
    }
    const s = this.mStreak.uniforms; s.uExposure.value = this.exposure;
    s.tSrc.value = this.down[2].texture; s.uDir.value.set(1.5 / this.down[2].width, 0); this.pass(this.mStreak, this.streakA);
    s.tSrc.value = this.streakA.texture; s.uDir.value.set(5 / this.down[2].width, 0); this.pass(this.mStreak, this.streakB);
    const g = this.mGrade.uniforms;
    g.tScene.value = this.hdr.texture; g.tBloom.value = this.bloomOn ? this.up[0].texture : this.black; g.tBlur.value = this.down[1].texture;
    g.tStreak.value = this.bloomOn ? this.streakB.texture : this.black; g.uTime.value = t; g.uAspect.value = this.W / this.H;
    g.uExposure.value = this.exposure; g.uAgxMix.value = this.agxMix;
    this.pass(this.mGrade, this.ldr);
    const f = this.mFinal.uniforms; f.tSrc.value = this.ldr.texture; f.uTexel.value.set(1 / this.W, 1 / this.H); f.uTime.value = t;
    this.pass(this.mFinal, null);
  }
}
