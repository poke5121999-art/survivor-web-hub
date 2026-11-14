// Storm sky following the Saltline recipe: horizon colour toward the sun, clear burning gap under a
// projected cloud deck with self-shadowed relief and warm rake light, sun aureole, sheet lightning.
// The environment capture (uEnv = 1) drops the sun disc (the directional light is the sun) and clamps fireflies.
import * as THREE from '../vendor/three.module.min.js';
import { U } from './mats.js';

// low golden-hour sun (elevation ~13 degrees), behind the far end of the yard
export const SUN_DIR = new THREE.Vector3(-0.33, 0.225, -0.917).normalize();
export const SUN_COLOR = new THREE.Color(1, 0.72, 0.42);
export const PALETTE = { zen: new THREE.Color(0.055, 0.085, 0.13), hor: new THREE.Color(0.95, 0.55, 0.28), horAway: new THREE.Color(0.16, 0.22, 0.30), fog: new THREE.Color(0.42, 0.47, 0.52) };

function noiseTex() {
  const n = 256, d = new Uint8Array(n * n * 4); let x = 2654435769 >>> 0;
  for (let i = 0; i < d.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; d[i] = x & 255; }
  const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

const SKY_FRAG = /* glsl */`
uniform sampler2D tNoise; uniform float uTime, uFlash, uEnv; uniform vec3 uSunDir, uSunCol, uZen, uHor, uHorAway, uFlashDir;
varying vec3 vDir;
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  float a = texture2D(tNoise, (i+.5)/256.).r, b = texture2D(tNoise, (i+vec2(1,0)+.5)/256.).r, c = texture2D(tNoise, (i+vec2(0,1)+.5)/256.).r, d = texture2D(tNoise, (i+vec2(1,1)+.5)/256.).r;
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
const mat2 RS = mat2(1.6,1.2,-1.2,1.6);
float fbm5(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p=RS*p+17.3; a*=.5; } return s/.96875; }
float fbm3(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*n2(p); p=RS*p+17.3; a*=.5; } return s/.875; }
vec3 horizonColor(vec3 d){
  float ts = clamp(dot(normalize(d.xz+1e-5), normalize(uSunDir.xz))*.5+.5, 0., 1.);
  vec3 c = mix(uHorAway, uHorAway*1.25+vec3(.05,.03,.02), smoothstep(.2,.75,ts));
  c = mix(c, uHor*vec3(1.9,1.55,1.2), pow(ts,6.));
  c = mix(c, vec3(1.,.6,.24)*3.4, pow(ts,34.));
  return c; }
void main(){
  vec3 d = normalize(vDir); float h = d.y; float mu = dot(d, uSunDir);
  float ts = clamp(dot(normalize(d.xz+1e-5), normalize(uSunDir.xz))*.5+.5, 0., 1.);
  vec3 hc = horizonColor(d);
  vec3 col;
  if (h > -0.02) {
    vec3 midC = mix(vec3(.15,.24,.36), vec3(.72,.50,.34), pow(ts,3.));
    vec3 clearC = mix(hc, midC, smoothstep(0.,.17,h));
    clearC = mix(clearC, vec3(.085,.145,.24), smoothstep(.10,.5,h));
    float s = max(mu,0.);
    clearC += uSunCol*vec3(1.,.86,.68)*(pow(s,8.)*.14 + pow(s,64.)*.55 + pow(s,600.)*2.2 + pow(s,6000.)*14.);
    // cloud deck
    vec2 cuv = d.xz/(max(h,0.)+.10)*vec2(.62,.95) + vec2(-.012,.004)*uTime;
    vec2 warp = vec2(fbm3(cuv*.7), fbm3(cuv*.7+5.2));
    float dens = fbm5(cuv*1.1 + warp*.8);
    float big = fbm3(cuv*.35 + 3.1);
    float ridge = 1. - abs(2.*fbm3(cuv*3.1 + warp) - 1.);
    float body = dens*.74 + big*.36 + (ridge-.5)*.12;
    float edge = mix(.030, .285, pow(ts, 1.7));
    float cov = smoothstep(.31, .50, body) * smoothstep(edge*.0, edge, h + .02);
    cov *= 1. - .93*smoothstep(.972, .9985, mu);
    float scud = smoothstep(.55, .75, fbm3(cuv*2.3 - uTime*.01)) * .35;
    cov = clamp(cov + scud*(1.-cov)*smoothstep(.0,.06,h), 0., 1.);
    float relief = clamp((fbm5(cuv*1.1 + warp*.8 + normalize(uSunDir.xz)*.22) - dens)*4.5 + .5, 0., 1.);
    float thick = smoothstep(.35, .9, body);
    vec3 under = mix(vec3(.155,.195,.255), vec3(.030,.042,.064), thick);
    float nearSun = pow(ts, 3.) * smoothstep(.45, .0, h);
    vec3 cloud = under + uHor*vec3(1.30,.66,.40)*nearSun*(.05 + 2.2*pow(relief,3.))*1.15;
    cloud += uHor*vec3(1.4,.8,.45) * pow(1.-cov, 2.) * nearSun * .9;
    cloud += vec3(.55,.68,1.) * uFlash * pow(max(dot(d, uFlashDir),0.), 5.) * (.6 + relief);
    col = mix(clearC, cloud, cov);
    col = mix(hc, col, 1. - exp(-max(h,0.)*11.));
    float veil = 1. - cov;
    col += uSunCol * smoothstep(.999905, .999955, mu) * 110. * veil * (1. - uEnv);
  } else {
    col = mix(uHorAway*.42, vec3(.060,.064,.070), uEnv) + uHor*pow(ts,8.)*.25*exp(h*20.);
  }
  col = mix(col, min(col, vec3(6.)), uEnv);
  gl_FragColor = vec4(col, 0.0);
}`;

export function makeSky(G) {
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const uniforms = {
    tNoise: { value: noiseTex() }, uTime: U.uTime, uFlash: U.uFlash, uEnv: { value: 0 },
    uSunDir: { value: SUN_DIR }, uSunCol: { value: SUN_COLOR }, uZen: { value: PALETTE.zen }, uHor: { value: PALETTE.hor }, uHorAway: { value: PALETTE.horAway },
    uFlashDir: { value: new THREE.Vector3(-0.5, 0.5, -0.7).normalize() },
  };
  const vs = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww; }';
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(geo, m); sky.renderOrder = -1000; sky.frustumCulled = false;
  G.scene.add(sky);
  function capture() {
    const envM = m.clone(); envM.uniforms = Object.assign({}, uniforms, { uEnv: { value: 1 } });
    const s = new THREE.Scene(); s.add(new THREE.Mesh(geo, envM));
    const pm = new THREE.PMREMGenerator(G.renderer);
    const rt = pm.fromScene(s, 0, 0.1, 100);
    if (G.scene.environment) G.scene.environment.dispose();
    G.scene.environment = rt.texture; G.scene.environmentIntensity = 2;
    pm.dispose(); envM.dispose();
  }
  capture();
  return { mesh: sky, capture, sun: SUN_DIR, uniforms };
}
