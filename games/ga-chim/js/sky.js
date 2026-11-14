// Storm sky at blue hour: moving cloud deck, a burning gap low toward the sun, sheet lightning.
// Captured into a cube render target and prefiltered as the scene environment (no HDRI).
import * as THREE from '../vendor/three.module.min.js';
import { NOISE } from './glsl.js';
import { U, keepAlpha } from './mats.js';

export const SUN_DIR = new THREE.Vector3(-0.32, 0.07, -0.945).normalize();

const SKY_FRAG = /* glsl */`
uniform float uTime, uFlash, uEnvPass;
uniform vec3 uSun;
varying vec3 vDir;
${NOISE}
vec3 skyColor(vec3 d){
  float y = d.y;
  float sd = max(dot(d, uSun), 0.0);
  float az = dot(normalize(vec3(d.x,0.,d.z)), normalize(vec3(uSun.x,0.,uSun.z)));
  vec3 zen = vec3(0.020, 0.028, 0.045);
  vec3 hor = vec3(0.085, 0.095, 0.115);
  vec3 c = mix(hor, zen, smoothstep(-0.02, 0.55, y));
  // the gap: a band of hot light under the cloud deck toward the sun
  float band = smoothstep(0.26, 0.0, abs(y - 0.035)) * smoothstep(0.55, 1.0, az);
  vec3 hot = mix(vec3(1.0, 0.38, 0.12), vec3(1.0, 0.72, 0.42), smoothstep(0.85, 1.0, az));
  c += hot * band * 1.6;
  c += vec3(1.0, 0.62, 0.32) * pow(sd, 48.0) * 6.0;
  c += vec3(1.0, 0.5, 0.25) * pow(sd, 6.0) * 0.55;
  // cloud deck: project onto a plane
  if (y > -0.02) {
    vec2 p = d.xz / (y + 0.09) * 1.3;
    float t = uTime * 0.012;
    float n = fbm2(p*0.7 + vec2(t, t*0.4));
    float n2 = fbm2(p*2.3 - vec2(t*1.7, 0.0) + n*1.5);
    float dens = smoothstep(0.32, 0.78, n*0.7 + n2*0.5);
    float under = smoothstep(0.4, 1.0, az) * smoothstep(0.35, 0.02, y);
    vec3 cloudDark = vec3(0.028, 0.032, 0.042);
    vec3 cloudLit = mix(vec3(0.11, 0.105, 0.11), hot * 0.9, under);
    vec3 cc = mix(cloudDark, cloudLit, (1.0 - n2) * 0.6 + under * 0.8 * (1.0 - dens*0.5));
    // rim light on cloud edges near the sun
    cc += hot * pow(1.0 - dens, 3.0) * under * 1.2;
    float fade = smoothstep(-0.02, 0.12, y);
    c = mix(c, cc, dens * fade * (1.0 - band*0.65));
    // lightning illuminates the deck from inside
    float fl = uFlash * (0.4 + 0.6 * fbm2(p*0.4 + 7.0));
    c += vec3(0.55, 0.6, 0.8) * fl * dens * fade;
  }
  // below horizon: dark ground haze
  c = mix(c, vec3(0.05, 0.055, 0.065), smoothstep(0.0, -0.08, y));
  return c;
}
void main(){
  vec3 d = normalize(vDir);
  gl_FragColor = vec4(skyColor(d), 0.0);
}`;

export function makeSky(G) {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFlash: U.uFlash, uSun: { value: SUN_DIR }, uEnvPass: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(geo, m);
  sky.renderOrder = -10; sky.frustumCulled = false;
  G.scene.add(sky);

  // Environment capture: sky alone into a cube, prefiltered. Re-captured rarely (lightning uses a scalar).
  const envScene = new THREE.Scene();
  const skyCopy = new THREE.Mesh(geo, m);
  envScene.add(skyCopy);
  // a dark ground disc so reflections below the horizon are not sky-coloured
  const groundM = new THREE.MeshBasicMaterial({ color: 0x0b0c0e, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(800, 32), groundM);
  disc.rotation.x = -Math.PI / 2; disc.position.y = -2; envScene.add(disc);
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.5, 2000, cubeRT);
  const pmrem = new THREE.PMREMGenerator(G.renderer);
  function capture() {
    cubeCam.update(G.renderer, envScene);
    const rt = pmrem.fromCubemap(cubeRT.texture);
    if (G.scene.environment && G.scene.environment !== rt.texture) G.scene.environment.dispose();
    G.scene.environment = rt.texture;
  }
  capture();
  return { mesh: sky, capture, sun: SUN_DIR };
}
