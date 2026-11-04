// RenderSettings ambient "Trilight" (m_AmbientMode 1) as a three.js LightProbe.
//
// Unity turns the sky / equator / ground gradient into an ambient SH probe and every Standard surface takes
// albedo * (the gradient's radiance averaged over the hemisphere around its normal, cosine weighted). So a wall
// (normal horizontal) is lit mostly by the equator colour with some sky above and ground below, a floor by the sky
// colour blended toward the equator, and a ceiling by the ground colour.
//
// The previous web version (AmbientLight(equator) + HemisphereLight(sky - equator, ground - equator), both x PI x 1.05)
// lit a wall with (sky + ground) / 2 = 1.44 instead of ~1.0 and a floor with 2.77 instead of ~2.0: the equator dropped
// out at the horizon, and m_AmbientIntensity (1.05) was applied although Unity uses it only for the Skybox source.
//
// Radiance of the gradient: y > 0 -> lerp(equator, sky, y), y < 0 -> lerp(equator, ground, -y) [GUESS: Unity's exact
// interpolation is not in the data; m_AmbientProbe is all zeros in level1 because it is computed at run time].
// The colours are used as stored (Gamma colour space project, no linear conversion) [GUESS].
import * as THREE from 'three';

const N = 2048;
// Projection of the radiance onto three's 9 SH basis functions, separately for a unit sky / equator / ground colour.
// The gradient is linear in the three colours, so any (sky, eq, ground) is a weighted sum of these three.
const BASIS = (() => {
  const out = { sky: new Float64Array(9), eq: new Float64Array(9), ground: new Float64Array(9) };
  const sh = [];
  const d = new THREE.Vector3();
  const w = 4 * Math.PI / N;
  for (let i = 0; i < N; i++) {
    // Fibonacci sphere: evenly spread directions, equal solid angle each
    const y = 1 - (2 * i + 1) / N, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    d.set(Math.cos(a) * r, y, Math.sin(a) * r);
    THREE.SphericalHarmonics3.getBasisAt(d, sh);
    const t = Math.abs(y);
    const wSky = y > 0 ? t : 0, wGround = y < 0 ? t : 0, wEq = 1 - t;
    for (let k = 0; k < 9; k++) {
      out.sky[k] += wSky * sh[k] * w;
      out.ground[k] += wGround * sh[k] * w;
      out.eq[k] += wEq * sh[k] * w;
    }
  }
  return out;
})();

// probe: THREE.LightProbe; sky / eq / ground: [r, g, b] (or THREE.Color) in the project's Gamma values.
// three.js evaluates the irradiance (x PI) and divides by PI in the Lambert term, so albedo * average radiance results,
// the same product Unity's Standard shader forms with the ambient.
export function setTrilight(probe, sky, eq, ground) {
  const c = v => (Array.isArray(v) ? v : [v.r, v.g, v.b]);
  const s = c(sky), e = c(eq), g = c(ground);
  const co = probe.sh.coefficients;
  for (let k = 0; k < 9; k++) {
    co[k].set(
      s[0] * BASIS.sky[k] + e[0] * BASIS.eq[k] + g[0] * BASIS.ground[k],
      s[1] * BASIS.sky[k] + e[1] * BASIS.eq[k] + g[1] * BASIS.ground[k],
      s[2] * BASIS.sky[k] + e[2] * BASIS.eq[k] + g[2] * BASIS.ground[k]);
  }
}

// The average radiance a surface with this normal receives (what the shader multiplies the albedo by); for tests.
export function trilightAt(probe, normal) {
  return probe.sh.getIrradianceAt(normal, new THREE.Vector3()).divideScalar(Math.PI);
}
