// DayNightCycle.UpdateSkybox (disassembled): t = clamp01((now - startHour) / (endHour - startHour)) over the shop clock,
// c = clamp01(lightCurve.Evaluate(t)); skybox _Tint = Lerp(dayTint, nightTint, c); skybox _Rotation = t * 360 *
// rotationSpeed; RenderSettings.ambientSkyColor = Lerp(daySkyColor, nightSkyColor, c). SetUpSunRise puts the clock back
// at startHour (next day). Values come from the store scene's DayNightCycle component; the sky is level1's material
// "Sky" (Skybox/6 Sided, art/sky, tools/export_sky.py).
import * as THREE from 'three';

// AnimationCurve.Evaluate for non-weighted keys: cubic Hermite between keys with outSlope / inSlope.
export function evalCurve(curve, t) {
  const K = curve.m_Curve;
  if (!K.length) return 0;
  if (t <= K[0].time) return K[0].value;
  if (t >= K[K.length - 1].time) return K[K.length - 1].value;
  let i = 0;
  while (t > K[i + 1].time) i++;
  const a = K[i], b = K[i + 1], dt = b.time - a.time, s = (t - a.time) / dt;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * a.value + (s3 - 2 * s2 + s) * a.outSlope * dt + (-2 * s3 + 3 * s2) * b.value + (s3 - s2) * b.inSlope * dt;
}

const clamp01 = v => Math.max(0, Math.min(1, v));
const lerpC = (a, b, c) => [a.r + (b.r - a.r) * c, a.g + (b.g - a.g) * c, a.b + (b.b - a.b) * c];

export class DayNight {
  // dn = DayNightCycle component (scene.json), sky = art/sky/sky.json, base = art/sky URL
  constructor({ scene3, camera, dn, sky, base, ambient, hemi, equator, ground }) {
    Object.assign(this, { camera, dn, ambient, hemi, equator, ground });
    this.group = new THREE.Group();
    this.group.renderOrder = -1;
    const R = 150;
    const loader = new THREE.TextureLoader();
    const tex = name => { const t = loader.load(`${base}/${sky.faces[name]}`); t.colorSpace = THREE.NoColorSpace; return t; };
    // Facing the Front face, Left is on the left, Right on the right, Back behind (the faces join seamlessly that way).
    // Unity +z (front) is three -z.
    const faces = [
      ['_FrontTex', [0, 0, -R], [0, 0, 0]], ['_LeftTex', [-R, 0, 0], [0, Math.PI / 2, 0]],
      ['_RightTex', [R, 0, 0], [0, -Math.PI / 2, 0]], ['_BackTex', [0, 0, R], [0, Math.PI, 0]],
      ['_UpTex', [0, R, 0], [Math.PI / 2, 0, 0]], ['_DownTex', [0, -R, 0], [-Math.PI / 2, 0, 0]],
    ];
    this.mats = [];
    for (const [name, p, r] of faces) {
      if (!sky.faces[name]) continue;
      const m = new THREE.MeshBasicMaterial({ map: tex(name), depthWrite: false, depthTest: false, fog: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * R + 0.5, 2 * R + 0.5), m);
      mesh.position.fromArray(p); mesh.rotation.set(r[0], r[1], r[2]);
      mesh.renderOrder = -1;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.mats.push(m);
    }
    this.exposure = (sky.floats && sky.floats._Exposure) || 1;
    scene3.add(this.group);
    this.state = { t: 0, c: 0 };
  }

  // hour = shop clock in hours (sim.s.time)
  update(hour) {
    const dn = this.dn;
    const t = dn.startHour === dn.endHour ? 0 : clamp01((hour - dn.startHour) / (dn.endHour - dn.startHour));
    const c = clamp01(evalCurve(dn.lightCurve, t));
    this.state = { t, c };
    // Skybox/6 Sided: texture * _Tint * unity_ColorSpaceDouble (2 in Gamma space) * _Exposure
    const tint = lerpC(dn.dayTint, dn.nightTint, c);
    for (const m of this.mats) m.color.setRGB(tint[0] * 2 * this.exposure, tint[1] * 2 * this.exposure, tint[2] * 2 * this.exposure);
    // _Rotation in degrees about +y; three.js is right-handed with z negated [GUESS: the sign]
    this.group.rotation.y = -THREE.MathUtils.degToRad(t * 360 * dn.rotationSpeed);
    this.group.position.copy(this.camera.position);
    // Trilight ambient: equator everywhere + hemisphere (sky - equator) / (ground - equator); only the sky colour moves
    const sky = lerpC(dn.daySkyColor, dn.nightSkyColor, c);
    if (this.hemi) this.hemi.color.setRGB(sky[0] - this.equator.r, sky[1] - this.equator.g, sky[2] - this.equator.b);
    return this.state;
  }
}
