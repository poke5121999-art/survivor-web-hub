/*
 * Thời gian, ánh sáng, sương, bầu trời, hậu kỳ màu và hoảng loạn.
 *   TimeController: t += dt / (hourDurationInSeconds·24) · modifier; mặt trời góc lightAngleMin + 360·t quanh trục
 *   Euler (x, −90°, 0) ⇒ đi từ đông (+x) qua đỉnh xuống tây; màu nắng / ambient từ gradient sunColour /
 *   ambientLightColor; FogController: mật độ defaultFogDensityOverDay, màu defaultFogColorOverDay (+ FogPropertyModifier).
 *   PlayerSanity: sanity += sanityRate · dt · modifier (CODE.md 3).
 *
 * Môi trường dựng lại từ bytecode DXBC của shader gốc (tools/env.py --dis; số liệu ở data/env.js):
 *   - Sương của MỌI vật liệu có fog (kể cả nước, thuyền của luồng khác): ShaderChunk.fog_* bị thay bằng công thức
 *     Lit_Shader: tính theo khoảng cách tới _FogCenter (= thuyền), đường cos tới far = 350 + 337·_FogDensity·(_FogRemove − 1),
 *     trừ theo độ cao (y/_FogHeight), sàn tuyến tính d/350, nhân kênh B của WaveMask, đèn phụ (đèn thuyền) xua sương,
 *     màu sương ánh cam (0,752941; 0,235294; 0) về phía mặt trời lúc thấp. Uniform dùng chung tự cắm vào mọi vật liệu
 *     (Material.prototype.onBeforeCompile được bọc, khoá cache chương trình giữ nguyên).
 *   - Trời: Sky_Shader (màu trời × (nắng + ambient), mây Sky_RGB.r, sao .b, trăng .g, đĩa mặt trời HDR, dải sương chân trời).
 *   - Hậu kỳ (URP, ColorGradingMode LDR): Bloom (threshold 1, intensity 2, scatter 0,7) → LUT ColorLookup tra trong sRGB →
 *     ColorAdjustments của volume vùng (Stellar Basin, Devil's Spine) → sRGB. Quang sai màu theo sanity (SanityChromaticAberration).
 *     Chèn bằng cách bọc renderer.render cho đúng (scene, màn hình); các lần render khác (render target) đi thẳng.
 *
 *   DRSky.init(scene, world)  DRSky.update(dt, ctx)  DRSky.passTime(hours, reason)
 *   DRSky.env      { isDay, night, dayK, sunDir, sunColor[], ambientColor[], fogColor[] (sRGB như gradient), fogColorLinear (THREE.Color),
 *                    fogDensityRaw (_FogDensity), fogHeight, fogCenter, fogFar, sceneLights, sceneLightness, cloudiness, wind, ... }
 *   DRSky.uniforms uniform dùng chung (uDrFogC, uDrFogD, uDrSunDir, uDrSunCol, uDrAmb, ...) — ai tự viết ShaderMaterial có fog
 *                  thì #include <fog_pars_fragment> là có sẵn hàm drEnvFogAmount / drEnvFogColor / drEnvLights / drEnvCloud.
 *   DRSky.post     { enabled, stats }   DRSky.GLSL_ENV   DRSky.envTex(name)
 *   DRSky.weather  { cur, prev, k, ... }  thời tiết tự bốc thăm theo vùng/ngày-đêm, lerp 15 s, sét, WeatherTrigger (khối "thời tiết" bên dưới);
 *                  DRSky.env.{cloudiness, cloudDarkness, auroraAmount, waveSteepness, foamAmount, weather, tod} là giá trị sống mỗi khung
 */
(function (root) {
  'use strict';
  const T = root.THREE, R = root.DRRules, CFG = root.DR_CONFIG, E = root.DR_ENV;
  // đèn three.js cho vật liệu Lambert/Phong còn lại (thuyền, phao, bọt): cường độ đúng như bản gốc — RenderSettings.m_AmbientIntensity 1
  // (Game.unity, m_AmbientMode 3 = Flat) và DirectionalLight.intensity. Hệ số đoán cũ 0,55 / 0,85 làm thuyền tối hơn gốc lúc chiều tối.
  const AMB_K = 1, SUN_K = 1;
  const FS = E.fogShader, MAXL = 4;

  const S = root.DRSky = {
    env: {
      isDay: true, night: 0, dayK: 1, sunDir: new T.Vector3(0, 1, 0), fogDensity: 0, fogFar: 365, timeMode: 'idle', timeMod: 0,
      sunColor: [1, 1, 1], ambientColor: [1, 1, 1], fogColor: [1, 1, 1], fogColorLinear: new T.Color(), fogDensityRaw: 0,
      fogHeight: 30, fogCenter: new T.Vector3(), sceneLights: 0, sceneLightness: 0, cloudiness: 0.4, cloudDarkness: 0.2, wind: 0.1
    },
    // [ĐỀ XUẤT] bóng đổ của mặt trời (URP: 1 cascade, 70 m, 1024², bóng cứng) tắt mặc định để giữ ngân sách khung hình; ?shadows=1 để bật
    gameTime: 0, forced: null, shadows: /[?&]shadows=1/.test(root.location.search)
  };
  let TC = null, sun = null, amb = null, scene = null, dome = null, fogMods = [], sanityVols = [], postVols = [];

  // ---------------------------------------------------------------- uniform dùng chung + GLSL
  const v4 = () => [0, 1, 2, 3].map(() => new T.Vector4());
  const U = S.uniforms = {
    uDrFogC: { value: new T.Vector3() }, uDrFogD: { value: 0 }, uDrFogH: { value: 30 }, uDrFogR: { value: FS.remove },
    uDrSunDir: { value: new T.Vector3(0, 1, 0) }, uDrSunCol: { value: new T.Color() }, uDrAmb: { value: new T.Color() },
    uDrMask: { value: null }, uDrCloud: { value: null }, uDrCloudy: { value: 0.4 }, uDrWind: { value: E.wind }, uDrTime: { value: 0 },
    uDrNightL: { value: 0 }, uDrFlick: { value: null }, uDrTint: { value: new T.Color(0, 0, 0) }, uDrTintK: { value: 0 },
    uDrLP: { value: v4() }, uDrLC: { value: v4() }, uDrLD: { value: v4() }, uDrLN: { value: 0 }
  };
  const f6 = x => Number(x).toFixed(6);
  const GLSL_ENV = `
#ifndef DR_ENV_GLSL
#define DR_ENV_GLSL
uniform vec3 uDrFogC; uniform float uDrFogD; uniform float uDrFogH; uniform float uDrFogR;
uniform vec3 uDrSunDir; uniform vec3 uDrSunCol; uniform vec3 uDrAmb;
uniform sampler2D uDrMask; uniform sampler2D uDrCloud; uniform float uDrCloudy; uniform float uDrWind; uniform float uDrTime;
uniform float uDrNightL; uniform sampler2D uDrFlick; uniform vec3 uDrTint; uniform float uDrTintK;
uniform vec4 uDrLP[${MAXL}]; uniform vec4 uDrLC[${MAXL}]; uniform vec4 uDrLD[${MAXL}]; uniform int uDrLN;
vec3 drS2L(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float drS2L(float c) { return c < 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
// WaveMask.b (Lit_Shader: t1.z ở xz/_WorldSize + 0,5; ngoài thế giới coi như 1)
float drEnvMaskB(vec2 xz) {
  vec2 uv = (xz + 750.0) / 1500.0;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return min(texture2D(uDrMask, uv).b, 1.0);
}
// vòng đèn phụ URP: suy giảm (1 − (d²/r²)²)² / d², nón spot bình phương, mỗi đèn kẹp [0,1] rồi cộng
vec3 drEnvLights(vec3 wp) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < ${MAXL}; i++) {
    if (i >= uDrLN) break;
    vec4 P = uDrLP[i]; vec4 C = uDrLC[i]; vec4 D = uDrLD[i];
    vec3 d = P.xyz - wp; float d2 = max(dot(d, d), 0.000061);
    float f = d2 * P.w; f = max(0.0, 1.0 - f * f); f = f * f / d2;
    float sp = clamp(dot(D.xyz, d * inversesqrt(d2)) * C.w + D.w, 0.0, 1.0);
    s += clamp(C.rgb * (f * sp * sp), 0.0, 1.0);
  }
  return s;
}
float drEnvFogAmount(vec3 wp, vec3 L, float mb) {
  float d = distance(wp, uDrFogC);
  float far = ${f6(FS.far)} + uDrFogD * ${f6(FS.densityK)} * (uDrFogR - 1.0);
  float f = (1.0 - cos(clamp(d / far, 0.0, 1.0) * 3.141593)) * 0.5;
  f *= mb * max(0.0, 1.0 - ${f6(FS.lightClearK)} * length(L));
  f -= clamp(wp.y / uDrFogH, 0.0, 1.0);
  return max(f, min(d / ${f6(FS.linearFar)}, 1.0));
}
vec3 drEnvFogColor(vec3 wp) {
  vec3 V = normalize(cameraPosition - wp);
  float g = clamp(dot(V, -uDrSunDir), 0.0, 1.0);
  g = g * g * max(0.0, 1.0 - abs(uDrSunDir.y) + min(2.0 * uDrSunDir.y, 0.0));
  vec3 c = mix(fogColor, mix(fogColor, vec3(${E.fogShader.glow.map(f6).join(', ')}), 0.5), g);
  vec3 dark = mix(vec3(0.01), uDrTint, min(distance(wp, uDrFogC) / 100.0, 1.0));
  return mix(c, dark, uDrTintK);
}
// mây che nắng (tọa độ Unity: z đổi dấu); nước dưới y = 0 luôn sáng
float drEnvCloud(vec3 wp) {
  vec2 uv = vec2(wp.x, -wp.z) * ${f6(E.cloudShadow.scale)} + vec2(uDrWind * ${f6(E.cloudShadow.windK)} * uDrTime, 0.0);
  float n = drS2L(texture2D(uDrCloud, uv).r);
  float c0 = uDrCloudy - ${f6(E.cloudShadow.soft)};
  return min(1.0, clamp(-wp.y, 0.0, 1.0) + clamp((n - c0) / ${f6(E.cloudShadow.soft)}, 0.0, 1.0));
}
// ánh sáng toon của Lit_Shader: KHÔNG có N·L — albedo × (nắng·mây·bóng + đèn phụ + ambient + (1 − mask.b))
vec3 drEnvLight(vec3 wp, float shadow, vec3 L, float mb) {
  return uDrSunCol * (drEnvCloud(wp) * shadow) + L + uDrAmb + (1.0 - mb) + vec3(uDrTintK, 0.0, 0.0);
}
#endif
`;
  S.GLSL_ENV = GLSL_ENV;

  // ---- ShaderChunk: sương gốc cho mọi vật liệu có fog
  const CH = T.ShaderChunk;
  CH.fog_pars_vertex = `#ifdef USE_FOG
varying float vFogDepth;
varying vec3 vDrFogW;
vec3 drV2W(vec4 mv) { vec3 p = mv.xyz - viewMatrix[3].xyz; return vec3(dot(viewMatrix[0].xyz, p), dot(viewMatrix[1].xyz, p), dot(viewMatrix[2].xyz, p)); }
#endif`;
  CH.fog_vertex = `#ifdef USE_FOG
vFogDepth = - mvPosition.z;
vDrFogW = drV2W(mvPosition);
#endif`;
  CH.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor;
varying float vFogDepth;
varying vec3 vDrFogW;
${GLSL_ENV}
#endif`;
  CH.fog_fragment = `#ifdef USE_FOG
#ifndef DR_OWN_FOG
{ vec3 drLf = drEnvLights(vDrFogW); gl_FragColor.rgb = mix(gl_FragColor.rgb, drEnvFogColor(vDrFogW), drEnvFogAmount(vDrFogW, drLf, drEnvMaskB(vDrFogW.xz))); }
#endif
#endif`;

  // ---- cắm uniform dùng chung vào mọi vật liệu (bọc onBeforeCompile; toString giữ nguyên để khoá cache không đổi)
  const OBC = '__drObc';
  function inject(sh) { for (const k in U) if (!(k in sh.uniforms)) sh.uniforms[k] = U[k]; }
  const plainObc = function (sh) { inject(sh); };
  plainObc.toString = () => T.Material.prototype.__drOrigObcSrc;
  Object.defineProperty(T.Material.prototype, '__drOrigObcSrc', { value: String(T.Material.prototype.onBeforeCompile) });
  Object.defineProperty(T.Material.prototype, 'onBeforeCompile', {
    configurable: true,
    get() { return this[OBC] || plainObc; },
    set(f) {
      if (typeof f !== 'function') { this[OBC] = null; return; }
      const w = function (sh, r) { inject(sh); return f.call(this, sh, r); };
      w.toString = () => String(f);
      Object.defineProperty(this, OBC, { value: w, writable: true, configurable: true });
    }
  });

  // ---------------------------------------------------------------- Unity Gradient / AnimationCurve
  function gradient(g, t) {
    const c = g.colors;
    if (t <= c[0][0]) return [c[0][1], c[0][2], c[0][3]];
    for (let i = 1; i < c.length; i++) if (t <= c[i][0]) {
      const a = c[i - 1], b = c[i], k = (t - a[0]) / (b[0] - a[0] || 1);
      if (g.mode === 1) return [a[1], a[2], a[3]]; // GradientMode.Fixed
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
    }
    const l = c[c.length - 1];
    return [l[1], l[2], l[3]];
  }
  function curve(cv, t) {
    const k = cv.keys;
    if (!k.length) return 0;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) {
      const a = k[i - 1], b = k[i], d = b[0] - a[0];
      if (Math.abs(a[3]) > 1e20 || Math.abs(b[2]) > 1e20) return a[1]; // tiếp tuyến vô hạn = bậc thang
      const u = (t - a[0]) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * d + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * b[2] * d;
    }
    return k[k.length - 1][1];
  }
  const s2l = x => x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  const lin = (c, out) => (out || new T.Color()).setRGB(s2l(c[0]), s2l(c[1]), s2l(c[2]));

  // ---------------------------------------------------------------- texture môi trường
  const texCache = {};
  function envTex(path, opt) {
    if (texCache[path]) return texCache[path];
    const t = new T.TextureLoader().load(path + (S.rev ? '?v=' + S.rev : ''));
    t.wrapS = t.wrapT = (opt && opt.clamp) ? T.ClampToEdgeWrapping : T.RepeatWrapping;
    if (opt && opt.nearest) { t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter; t.generateMipmaps = false; }
    texCache[path] = t;
    return t;
  }
  S.envTex = envTex;

  // ---------------------------------------------------------------- trời (Sky_Shader)
  function skyDome() {
    const K = E.sky;
    const m = new T.ShaderMaterial({
      // vẽ SAU vật đục, depthTest ở mặt phẳng xa: chỉ tô điểm ảnh trời thật sự lộ ra (shader trời nặng, đừng tô cả màn hình)
      depthWrite: false, depthTest: true, side: T.BackSide, fog: false,
      uniforms: Object.assign({
        tRGB: { value: envTex(K.textures.rgb) }, tWarp: { value: envTex(K.textures.warp) }, tAur: { value: envTex(K.textures.aurora) },
        uSkyCol: { value: lin(K.skyColor) }, uSunRad: { value: K.sunRadius }, uSunInt: { value: K.sunIntensity },
        uFarTile: { value: K.cloudFarTiling }, uTOD: { value: 0.5 }, uAurora: { value: 0 }, uCloudDark: { value: 0.2 },
        uFogLin: { value: new T.Color() }
      }, U),
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform sampler2D tRGB; uniform sampler2D tWarp; uniform sampler2D tAur;
uniform vec3 uSkyCol; uniform float uSunRad; uniform float uSunInt; uniform float uFarTile; uniform float uTOD; uniform float uAurora;
uniform float uCloudDark; uniform vec3 uFogLin;
uniform vec3 uDrSunDir; uniform vec3 uDrSunCol; uniform vec3 uDrAmb; uniform float uDrCloudy; uniform float uDrWind; uniform float uDrTime; uniform float uDrFogD;
varying vec3 vD;
vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main() {
  vec3 d = normalize(vD);
  vec3 du = vec3(d.x, d.y, -d.z);            // hướng theo trục Unity
  vec3 Lu = vec3(uDrSunDir.x, uDrSunDir.y, -uDrSunDir.z);
  float sd = clamp(dot(du, Lu), 0.0, 1.0);
  float hor = max(0.0, 1.0 - abs(Lu.y) + min(2.0 * Lu.y, 0.0));
  vec3 F = mix(uFogLin, mix(uFogLin, vec3(0.752941, 0.235294, 0.0), 0.5), sd * sd * hor);
  vec3 glowF = F * pow(sd, 15.0);
  vec3 sunC = step(1.0 - uSunRad, sd) * vec3(uSunInt, uSunInt, uSunInt * 0.768151) + glowF;
  float phi = atan(du.z, du.x), th = asin(clamp(du.y, -1.0, 1.0));
  // [ĐỀ XUẤT] UV lưới cầu trời gốc không xuất được: dùng (φ/2π + 0,5, θ/π + 0,5)
  vec2 suv = vec2(phi * 0.159155 + 0.5, th * 0.31831 + 0.5);
  float wob = s2l(texture2D(tWarp, suv * vec2(0.3, 0.01) + uDrTime * 0.01).rrr).r * 0.03;
  vec4 au = texture2D(tAur, vec2((phi * 0.159155 + wob) * 2.0, th * 0.63662 * 4.0));
  vec3 aur = s2l(au.rgb) * au.a;
  float band = s2l(texture2D(tRGB, vec2(phi * 0.31831, th * 5.092957)).rrr).r;
  vec2 sp = du.xz * 0.7 / (du.y + 1.0);
  float star = s2l(texture2D(tRGB, sp * 6.0).bbb).b - (Lu.y + 1.0) * 0.5;
  vec3 lightC = clamp(uDrSunCol, 0.0, 1.0) + uDrAmb;
  vec3 base = uSkyCol * lightC + clamp(aur * uAurora + star, 0.0, 1.0);
  vec3 lightS = clamp(lightC, 0.0, 1.0);
  float mo = fract(uTOD + 0.4) * 52.0 - 26.0;
  float moon = s2l(texture2D(tRGB, clamp(sp * 26.0 + mo, 0.0, 1.0)).ggg).g;
  vec3 c6 = moon + base + sunC;
  float om = 1.0 - du.y;
  float hb = clamp(pow(clamp(band + pow(max(om, 0.0), 20.0 * (1.0 - uDrCloudy)), 0.0, 1.0), 15.0) * uDrCloudy, 0.0, 1.0);
  c6 += hb * (lightS - c6);
  vec2 cuv = du.xz * 0.7 / max(du.y + uFarTile, 0.02);
  float wt = uDrWind * uDrTime;
  float n = s2l(texture2D(tRGB, cuv * vec2(0.5, 0.6) + vec2(0.09 * wt, 0.0)).rrr).r + s2l(texture2D(tRGB, cuv * 0.25 + vec2(0.03 * wt, 0.0)).rrr).r;
  float cov = du.y > -0.05 ? min(1.0, pow(max(n + uDrCloudy, 0.0), 80.0)) : 0.0;
  float sh = clamp(1.0 - (n - (1.0 - uDrCloudy)), 0.7, 1.0);
  vec3 cc = (glowF * (cov * sh * sh * sh * sh * sh) * uSunInt + lightS * sh) * (1.0 - uCloudDark);
  vec3 sky = mix(c6, cc, cov);
  float fd = min(uDrFogD, 0.85), k = (1.0 - fd) * (1.0 - fd) * 25.0;
  float fb = min(1.0, pow(max(om, 0.0), k));
  gl_FragColor = vec4(mix(sky, F, fb), 1.0);
}`
    });
    const mesh = new T.Mesh(new T.SphereGeometry(900, 48, 24), m);
    mesh.frustumCulled = false; mesh.renderOrder = 1e6; mesh.name = 'sky';
    return mesh;
  }

  // ---------------------------------------------------------------- hậu kỳ
  const P = S.post = { enabled: true, ready: false, stats: { passes: 0 } };
  const FSQ_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  function fsMat(frag, uniforms) {
    return new T.ShaderMaterial({ vertexShader: FSQ_V, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, fog: false });
  }
  function setupPost(renderer) {
    const gl = renderer.getContext(), isGL2 = renderer.capabilities.isWebGL2;
    const half = isGL2 || renderer.extensions.has('OES_texture_half_float');
    const type = half ? T.HalfFloatType : T.UnsignedByteType;
    P.renderer = renderer; P.type = type;
    P.scene = new T.Scene(); P.cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    P.quad = new T.Mesh(new T.PlaneGeometry(2, 2)); P.quad.frustumCulled = false; P.scene.add(P.quad);
    const opt = { type, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false };
    P.rt = new T.WebGLRenderTarget(4, 4, { type, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: true });
    if (isGL2) P.rt.samples = 4;
    P.mips = []; P.ups = [];
    for (let i = 0; i < 4; i++) { P.mips.push(new T.WebGLRenderTarget(4, 4, opt)); P.ups.push(new T.WebGLRenderTarget(4, 4, opt)); }
    const B = (E.post.volumes.find(v => v.global && v.active) || { components: {} }).components;
    const bloom = B.Bloom || { threshold: 1, intensity: 2, scatter: 0.7 }, ca = B.ChromaticAberration || { intensity: 0 };
    const lutPath = B.ColorLookup && B.ColorLookup.texturePath;
    P.bloom = { threshold: bloom.threshold != null ? bloom.threshold : 0.9, intensity: bloom.intensity != null ? bloom.intensity : 0,
      scatter: 0.05 + 0.9 * (bloom.scatter != null ? bloom.scatter : 0.7) }; // URP: lerp(0,05; 0,95; scatter)
    P.ca = ca.intensity || 0;
    P.prefilter = fsMat(`uniform sampler2D tSrc; uniform float uTh; uniform float uKnee; varying vec2 vUv;
void main(){ vec3 c = min(texture2D(tSrc, vUv).rgb, vec3(65472.0));
  float br = max(c.r, max(c.g, c.b)); float s = clamp(br - uTh + uKnee, 0.0, 2.0 * uKnee); s = s * s / (4.0 * uKnee + 0.0001);
  c *= max(br - uTh, s) / max(br, 0.0001); gl_FragColor = vec4(max(c, 0.0), 1.0); }`,
    { tSrc: { value: null }, uTh: { value: P.bloom.threshold }, uKnee: { value: P.bloom.threshold * 0.5 } });
    // [ĐỀ XUẤT] chuỗi mờ Gauss 9+5 tap của URP thay bằng lọc đôi (dual filter) — cùng dạng mip, rẻ hơn
    P.down = fsMat(`uniform sampler2D tSrc; uniform vec2 uTx; varying vec2 vUv;
void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv + uTx * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTx * vec2(1.0, -1.0)).rgb;
  c += texture2D(tSrc, vUv + uTx * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTx * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0); }`, { tSrc: { value: null }, uTx: { value: new T.Vector2() } });
    P.up = fsMat(`uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTx; uniform float uScatter; varying vec2 vUv;
void main(){ vec3 c = vec3(0.0);
  c += texture2D(tLow, vUv + uTx * vec2(-2.0, 0.0)).rgb + texture2D(tLow, vUv + uTx * vec2(2.0, 0.0)).rgb;
  c += texture2D(tLow, vUv + uTx * vec2(0.0, -2.0)).rgb + texture2D(tLow, vUv + uTx * vec2(0.0, 2.0)).rgb;
  c += (texture2D(tLow, vUv + uTx * vec2(-1.0, -1.0)).rgb + texture2D(tLow, vUv + uTx * vec2(1.0, -1.0)).rgb
     + texture2D(tLow, vUv + uTx * vec2(-1.0, 1.0)).rgb + texture2D(tLow, vUv + uTx * vec2(1.0, 1.0)).rgb) * 2.0;
  gl_FragColor = vec4(mix(texture2D(tHigh, vUv).rgb, c / 12.0, uScatter), 1.0); }`,
    { tLow: { value: null }, tHigh: { value: null }, uTx: { value: new T.Vector2() }, uScatter: { value: P.bloom.scatter } });
    P.uber = fsMat(`uniform sampler2D tSrc; uniform sampler2D tBloom; uniform sampler2D tLut; uniform float uBloom; uniform float uCA;
uniform float uLutK; uniform vec3 uFilter; uniform float uContrast; uniform float uHue; varying vec2 vUv;
vec3 lutS(vec3 uvw) { uvw.z *= 31.0; float sh = floor(uvw.z);
  vec2 uv = uvw.xy * 31.0 * vec2(1.0 / 1024.0, 1.0 / 32.0) + vec2(0.5 / 1024.0, 0.5 / 32.0); uv.x += sh / 32.0;
  return mix(texture2D(tLut, uv).rgb, texture2D(tLut, uv + vec2(1.0 / 32.0, 0.0)).rgb, uvw.z - sh); }
vec3 l2s(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toLogC(vec3 x) { return mix(5.301883 * x + 0.092819, 0.244161 * log2(5.555556 * x + 0.047996) * 0.30103 + 0.386036, step(0.011361, x)); }
vec3 fromLogC(vec3 x) { return mix((x - 0.092819) / 5.301883, (pow(vec3(10.0), (x - 0.386036) / 0.244161) - 0.047996) / 5.555556, step(5.301883 * 0.011361 + 0.092819, x)); }
vec3 rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-4;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
void main(){
  vec3 col;
  if (uCA > 0.0) { vec2 co = 2.0 * vUv - 1.0; vec2 dl = (vUv - co * dot(co, co) * uCA - vUv) / 3.0;
    col = vec3(texture2D(tSrc, vUv).r, texture2D(tSrc, vUv + dl).g, texture2D(tSrc, vUv + 2.0 * dl).b); }
  else col = texture2D(tSrc, vUv).rgb;
  col += texture2D(tBloom, vUv).rgb * uBloom;
  col = clamp(col, 0.0, 1.0);
  vec3 g = l2s(col); col = s2l(mix(g, lutS(g), uLutK));
  col = fromLogC((toLogC(col) - 0.4135884) * uContrast + 0.4135884);
  col = max(col * uFilter, 0.0);
  if (uHue != 0.0) { vec3 h = rgb2hsv(col); h.x = fract(h.x + uHue); col = hsv2rgb(h); }
  gl_FragColor = vec4(l2s(clamp(col, 0.0, 1.0)), 1.0); }`,
    { tSrc: { value: null }, tBloom: { value: null }, tLut: { value: lutPath ? envTex(lutPath, { clamp: true, nearest: true }) : null },
      uBloom: { value: P.bloom.intensity }, uCA: { value: P.ca * 0.05 }, uLutK: { value: lutPath ? (B.ColorLookup.contribution || 0) : 0 },
      uFilter: { value: new T.Vector3(1, 1, 1) }, uContrast: { value: 1 }, uHue: { value: 0 } });
    P.copy = fsMat('uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }', { tSrc: { value: null } });
    renderer.info.autoReset = false;
    const orig = renderer.render.bind(renderer);
    P.origRender = orig;
    renderer.render = function (sc, cam) {
      if (sc !== scene || renderer.getRenderTarget() !== null || !P.enabled) {
        if (sc === scene && renderer.getRenderTarget() === null) renderer.info.reset();
        return orig(sc, cam);
      }
      renderPost(sc, cam);
    };
    P.ready = true;
  }
  const _sz = new T.Vector2();
  function pass(mat, target) { P.quad.material = mat; P.renderer.setRenderTarget(target); P.origRender(P.scene, P.cam); P.stats.passes++; }
  function renderPost(sc, cam) {
    const r = P.renderer;
    r.info.reset(); P.stats.passes = 0;
    r.getDrawingBufferSize(_sz);
    const w = Math.max(4, _sz.x | 0), h = Math.max(4, _sz.y | 0);
    if (P.rt.width !== w || P.rt.height !== h) {
      P.rt.setSize(w, h);
      let mw = w >> 1, mh = h >> 1;
      for (let i = 0; i < P.mips.length; i++) { P.mips[i].setSize(Math.max(2, mw), Math.max(2, mh)); P.ups[i].setSize(Math.max(2, mw), Math.max(2, mh)); mw >>= 1; mh >>= 1; }
    }
    r.setRenderTarget(P.rt); P.origRender(sc, cam);
    // bloom: lọc ngưỡng ở nửa độ phân giải, xuống 5 mức, lên lại trộn theo scatter
    let bloomTex = null;
    if (P.bloom.intensity > 0) {
      P.prefilter.uniforms.tSrc.value = P.rt.texture; pass(P.prefilter, P.mips[0]);
      for (let i = 1; i < P.mips.length; i++) {
        P.down.uniforms.tSrc.value = P.mips[i - 1].texture;
        P.down.uniforms.uTx.value.set(1 / P.mips[i - 1].width, 1 / P.mips[i - 1].height); pass(P.down, P.mips[i]);
      }
      let low = P.mips[P.mips.length - 1];
      for (let i = P.mips.length - 2; i >= 0; i--) {
        P.up.uniforms.tLow.value = low.texture; P.up.uniforms.tHigh.value = P.mips[i].texture;
        P.up.uniforms.uTx.value.set(0.5 / low.width, 0.5 / low.height); pass(P.up, P.ups[i]); low = P.ups[i];
      }
      bloomTex = low.texture;
    }
    const u = P.uber.uniforms;
    u.tSrc.value = P.rt.texture; u.tBloom.value = bloomTex || P.mips[P.mips.length - 1].texture;
    u.uBloom.value = bloomTex ? (P.curBloom != null ? P.curBloom : P.bloom.intensity) : 0;
    pass(P.uber, null);
  }

  // ---------------------------------------------------------------- volume hậu kỳ theo vùng
  function volumeWeight(v, x, y, z) {
    let best = Infinity;
    for (const c of v.colliders || []) {
      const sc = c.scale || [1, 1, 1], cen = c.center || [0, 0, 0];
      const cx = c.pos[0] + cen[0] * sc[0], cz = c.pos[2] + cen[2] * sc[2];
      if (c.shape === 'sphere') best = Math.min(best, Math.max(0, Math.hypot(x - cx, z - cz) - c.radius * Math.max(sc[0], sc[2])));
    }
    if (best === Infinity) return 0;
    if (best <= 0) return v.weight;
    return v.blendDistance > 0 ? v.weight * Math.max(0, 1 - best / v.blendDistance) : 0;
  }
  function updatePostVolumes(cam, sanity) {
    if (!P.ready) return;
    const f = [1, 1, 1]; let contrast = 0, hue = 0, th = P.bloom.threshold, bi = P.bloom.intensity, cai = P.ca;
    for (const v of postVols) {
      const k = volumeWeight(v, cam.x, cam.y, cam.z);
      v.w = k;
      if (k <= 0) continue;
      const ca = v.components.ColorAdjustments, bl = v.components.Bloom, ch = v.components.ChromaticAberration;
      if (ca && ca.colorFilter) for (let i = 0; i < 3; i++) f[i] += (ca.colorFilter[i] - f[i]) * k;
      if (ca && ca.contrast != null) contrast += (ca.contrast - contrast) * k;
      if (ca && ca.hueShift != null) hue += (ca.hueShift - hue) * k;
      if (bl && bl.threshold != null) th += (bl.threshold - th) * k;
      if (bl && bl.intensity != null) bi += (bl.intensity - bi) * k;
      if (ch && ch.intensity != null) cai += (ch.intensity - cai) * k;
    }
    P.prefilter.uniforms.uTh.value = th; P.prefilter.uniforms.uKnee.value = th * 0.5; P.curBloom = bi;
    const u = P.uber.uniforms;
    // URP: colorFilter.linear; hueShift/360; contrast/100 + 1
    u.uFilter.value.set(s2l(f[0]), s2l(f[1]), s2l(f[2]));
    u.uContrast.value = contrast / 100 + 1; u.uHue.value = hue / 360;
    const cv = E.post.sanityChromaticCurve;
    u.uCA.value = Math.max(cai, cv ? curve(cv, 1 - (sanity == null ? 1 : sanity)) : 0) * 0.05;
  }

  // ---------------------------------------------------------------- đèn phụ (đèn thuyền...) cho sương + ánh sáng toon
  let lightList = [], lightScan = 0;
  const _p = new T.Vector3(), _q = new T.Vector3(), lightPick = [];
  function updateLights(cx, cz) {
    if (--lightScan <= 0) {
      lightScan = 60; lightList = [];
      scene.traverse(o => { if ((o.isPointLight || o.isSpotLight) && o !== sun) lightList.push(o); });
    }
    // MAXL đèn gần thuyền nhất (không cấp phát mỗi khung)
    lightPick.length = 0;
    for (const l of lightList) {
      if (!l.visible || !(l.intensity > 0) || !(l.distance > 0)) continue;
      l.getWorldPosition(_p);
      const d = Math.hypot(_p.x - cx, _p.z - cz);
      let k = lightPick.length;
      while (k > 0 && lightPick[k - 1].d > d) k--;
      if (k >= MAXL) continue;
      lightPick.splice(k, 0, { l, x: _p.x, y: _p.y, z: _p.z, d });
      if (lightPick.length > MAXL) lightPick.pop();
    }
    U.uDrLN.value = lightPick.length;
    for (let i = 0; i < MAXL; i++) {
      const a = lightPick[i], LP = U.uDrLP.value[i], LC = U.uDrLC.value[i], LD = U.uDrLD.value[i];
      if (!a) { LP.set(0, -1e4, 0, 1); LC.set(0, 0, 0, 0); LD.set(0, 0, 0, 1); continue; }
      const l = a.l, c = l.color;
      LP.set(a.x, a.y, a.z, 1 / (l.distance * l.distance));
      // [ĐỀ XUẤT] cường độ three.js của đèn thuyền coi như cường độ URP (boat.js đã quy đổi)
      LC.set(c.r * l.intensity, c.g * l.intensity, c.b * l.intensity, 0);
      if (l.isSpotLight) {
        l.target.getWorldPosition(_q);
        const dx = a.x - _q.x, dy = a.y - _q.y, dz = a.z - _q.z, n = Math.hypot(dx, dy, dz) || 1;
        const co = Math.cos(l.angle), ci = Math.cos(l.angle * (1 - l.penumbra)), inv = 1 / Math.max(0.001, ci - co);
        LD.set(dx / n, dy / n, dz / n, -co * inv); LC.w = inv;
      } else LD.set(0, 0, 0, 1);
    }
  }

  // ---------------------------------------------------------------- khởi tạo
  function init(sc, world) {
    scene = sc;
    TC = E.time;
    const DL = world.data.scene.directionalLight;
    sun = new T.DirectionalLight(0xffffff, DL.intensity); sun.userData.base = DL.intensity;
    amb = new T.AmbientLight(0xffffff, AMB_K);
    scene.add(sun, sun.target, amb);
    scene.fog = new T.FogExp2(0x000000, 0.0001); // chỉ để three bật USE_FOG; công thức thật ở ShaderChunk
    scene.background = new T.Color(0);
    S.rev = ((document.querySelector('script[src*="js/sky.js"]') || {}).src || '').split('?v=')[1] || '';
    dome = skyDome(); scene.add(dome);
    U.uDrMask.value = world.maskTex;
    U.uDrCloud.value = envTex(E.textures.cloudShadow);
    U.uDrFlick.value = envTex(E.textures.flicker);
    fogMods = world.data.markers.markers.filter(m => m.kind === 'waterProperty' && m.fields && m.fields.FogPropertyModifier)
      .map(m => ({ x: m.pos[0], y: m.pos[1], z: m.pos[2], f: m.fields.FogPropertyModifier }));
    sanityVols = world.data.markers.volumes.filter(v => v.type === 'sanity' && v.active !== false && v.colliders && v.colliders.length)
      .map(v => ({ x: v.colliders[0].pos[0], z: v.colliders[0].pos[2], r: v.colliders[0].radius * Math.max(v.colliders[0].scale[0], v.colliders[0].scale[2]), f: v.fields }));
    postVols = E.post.volumes.filter(v => !v.global && v.active).map(v => Object.assign({ w: 0 }, v));
    root.DR.on('passTime', (hours, reason) => passTime(hours, reason));
    resetWeather();
    if (wx.pinned) { wx.pinned = W.pinned = nameOf(wx.pinned); if (wx.pinned) setNow(wx.pinned, false); }
    root.DR.on('weather', name => changeByName(name));   // lệnh Yarn ChangeWeather (yarn.js emit 'weather' sau khi ghi DR.s.weather)
    const r = root.DR_DEBUG && root.DR_DEBUG.renderer;
    if (r) setupPost(r);
    if (S.shadows && r) {
      r.shadowMap.enabled = true; r.shadowMap.type = T.BasicShadowMap; // URP: bóng cứng (m_SoftShadowsSupported 0)
      sun.castShadow = true;
      const sd = E.light.shadowDistance;
      sun.shadow.mapSize.set(E.light.shadowResolution, E.light.shadowResolution);
      Object.assign(sun.shadow.camera, { left: -sd, right: sd, top: sd, bottom: -sd, near: 1, far: 400 });
      sun.shadow.bias = -0.0015;
    }
  }

  // RestDestination gọi ForcefullyPassTime(hours, reason, SLEEP); ngủ thì sanity dùng SleepingSanityModifier.
  function passTime(hours, reason) {
    S.forced = { left: hours / 24, total: hours / 24, reason: reason || '', sleep: /sleep|rest|ngủ/i.test(reason || '') };
    const f = document.getElementById('dr-fade');
    if (f) f.classList.add('on');
    if (root.DRAudio) DRAudio.loop('ui.passTime.loop', 0.6);
  }

  function timeMode(ctx) {
    if (S.forced) return ['forced', 0];
    const mg = root.DRMinigame && typeof DRMinigame.isOpen === 'function' && DRMinigame.isOpen();
    if (mg || (root.DRSpots && DRSpots.fishing)) return ['fishing', 0];
    if (ctx.moving) return ['move', ctx.inputMag];
    return ['idle', 0];
  }

  // Tổng SanityModifier đang phủ lên SanityModifierDetector (cầu 1,5 m) của thuyền.
  function localSanity(x, z, day, lightsOn, st) {
    let sum = 0;
    for (const v of sanityVols) {
      const d = Math.hypot(x - v.x, z - v.z);
      if (d < v.r + 1.5) sum += R.sanityVolume(v.f, d, day);
    }
    // LightAbility bật SanityModifier con của thuyền; VariableSanityModifier ghi PlayerStats.SanityModifier vào giá trị đêm.
    // [ĐỀ XUẤT] chỉ ghi giá trị đêm (cờ affectsNightValue/affectsDayValue nằm ở prefab, chưa bóc)
    if (lightsOn && !day && st) sum += st.lightSanity;
    return sum;
  }

  // ---------------------------------------------------------------- thời tiết
  // Cổng từ WeatherController.cs (PickNewWeather 261-283, Update 295-449, ChangeWeather 452-505, OnTeleportComplete 246-259),
  // Lightning.cs:47-101 và WeatherTrigger.cs:17-32. Số liệu: data/weather.js (15 WeatherData, tools/data.py) và data/env.js `weather`
  // (transitionSec 15, kiểm vùng mỗi 5 s, Lightning 50–250 m, thunderDelay 0,005, 3 WeatherTrigger; tools/env.py).
  //   DRSky.weather = { cur, prev, k, name, ... }
  //     cur   WeatherParameters của thời tiết hiện tại kèm `name`, `.parameters` (= DR_WEATHER[name].parameters) và toString() = tên,
  //           nên DR_WEATHER[DRSky.weather.cur] cũng chạy; prev = ảnh chụp giá trị ĐANG SỐNG lúc đổi + đường cong/sfx của thời tiết
  //           cũ (như previousWeather gốc, :469-497); k = tiến độ chuyển 0..1 (1 = xong, chuyển 15 s).
  //     giá trị sống lerp 15 s: cloudiness, cloudDarkness, auroraAmount, waveSteepness, foamAmount, rain{rate,speed,splash,dropMin,dropMax},
  //           snow{rate,speed}, sfxVolume (thời tiết mới), prevSfxVolume (thời tiết cũ), lightning{playing,left,min,max}.
  //     rainK = rain.rate/2000, snowK = snow.rate/1000 (trần [Range] của WeatherController) → DRParticles setRate(k).
  //   Sự kiện: DR.emit('lightning', { x, z, dist, delay }) mỗi lần sét đánh (delay = dist·thunderDelay giây tới tiếng sấm).
  //   Hạt: DRParticles.spawn('Rain', { follow: 'camera', loop: true }), ('Snow', { follow: 'player', loop: true }), ('Lightning', { pos }).
  //   Truyện: DR.on('weather', tên) (lệnh Yarn ChangeWeather). Kiểm thử/chụp ảnh: ?weather=HeavyStorm ghim thời tiết (không đổi tự động).
  //   API: DRSky.weather.set(tên) đặt ngay · change(tên) như lệnh Yarn (chuyển 15 s; tên lạ = bốc thăm) · pick(vùng, ngày, rnd) → tên (không đổi gì)
  //        pin(tên|null) ghim/bỏ ghim · emitLightning() như EmitLightning của Yarn · random (đổi được khi kiểm thử) · triggers (3 WeatherTrigger).
  //   Chưa nối: yarn.js đang `stub('EmitLightning')` — gọi DRSky.weather.emitLightning() ở đó (tệp của luồng khác).
  const WE = E.weather || { transitionSec: 15, zoneCheckSec: 5, lightning: { minRange: 50, maxRange: 250, thunderDelay: 0.005 }, triggers: [] };
  const LT = WE.lightning;
  // ZoneEnum (ZoneEnum.cs); permittedZones trong data/weather.js ghi tên cờ, 'ALL' = −1, 'UNKNOWN_-128' = các bit trên 0x40
  const ZONE_BIT = { THE_MARROWS: 1, GALE_CLIFFS: 2, STELLAR_BASIN: 4, TWISTED_STRAND: 8, DEVILS_SPINE: 16, OPEN_OCEAN: 32, PALE_REACH: 64 };
  const maskOf = list => (list || []).reduce((m, n) => m | (n === 'ALL' ? -1 : n in ZONE_BIT ? ZONE_BIT[n] : /^UNKNOWN_(-?\d+)$/.test(n) ? Number(RegExp.$1) : 0), 0);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const mixf = (a, b, t) => a + (b - a) * clamp01(t);               // Mathf.Lerp
  const evalCurve = (cv, t) => curve({ keys: cv || [] }, t);        // AnimationCurve.Evaluate; đường cong rỗng = 0
  const WD = () => root.DR_WEATHER || {};
  const nameOf = key => {
    const all = WD();
    if (!key) return null;
    if (all[key]) return key;
    const k = String(key).toLowerCase();
    return Object.keys(all).find(n => n.toLowerCase() === k) || null;
  };
  // [ĐỀ XUẤT] Iron Rig không có ZoneCollider nên PlayerZoneDetector.GetCurrentZone() trả OPEN_OCEAN (PlayerZoneDetector.cs:28-35);
  // zoneAt() của web tách riêng IRON_RIG cho việc khác, ở đây gộp về OPEN_OCEAN đúng như bản gốc.
  const weatherZone = (x, z) => { const zn = root.DRWorld.zoneAt(x, z); return zn === 'IRON_RIG' ? 'OPEN_OCEAN' : zn; };
  const canExist = (name, zone) => {
    const w = WD()[name], bit = ZONE_BIT[zone] || 0;
    return !!w && (maskOf(w.permittedZones) & bit) === bit;
  };
  // MathUtil.GetRandomWeightedIndex (MathUtil.cs:6-39)
  function weightedIndex(w, value) {
    let sum = 0;
    for (let i = 0; i < w.length; i++) {
      if (w[i] === Infinity) return i;
      if (w[i] >= 0 && !isNaN(w[i])) sum += w[i];
    }
    let acc = 0, last = -1;
    for (let i = 0; i < w.length; i++) {
      if (isNaN(w[i]) || w[i] <= 0) continue;
      last = i; acc += w[i] / sum;
      if (acc >= value) return i;
    }
    return last; // [ĐỀ XUẤT] bản gốc trả −1 (rồi list[−1] văng lỗi) khi cộng dồn float hụt; ở đây lấy phần tử có trọng số cuối
  }

  // giá trị sống (các biến `_...` của WeatherController); khởi tạo từ Fine ở Awake (:212-219), rain/snow/sfx giữ 0 như scene
  const L = { cloudiness: 0.4, cloudDarkness: 0.2, auroraAmount: 0, waveSteepness: 0.1, foamAmount: 0.2, lightningDelayMin: 0, lightningDelayMax: 0,
    rainSpeed: 0, rainRate: 0, snowSpeed: 0, snowRate: 0, dropletHeightMin: 0, dropletHeightMax: 0, splashChance: 0, sfxVolume: 0, prevSfxVolume: 0 };
  const LG = { playing: false, left: 0, min: 0, max: 0 };
  const FX = { rain: null, snow: null, rainIdle: 0, snowIdle: 0 };
  const TRG = WE.triggers.map(t => Object.assign({ last: -Infinity, inside: false }, t));
  const wx = { clock: 0, cur: null, prev: null, curName: 'Fine', curP: null, tStart: -1e9, needs: false, dirty: false, zoneT: 0, sRef: null, last: null, pinned: null };
  const pin0 = /[?&]weather=([A-Za-z]+)/.exec(root.location.search);
  const descCache = {};
  const describe = (name, P) => {
    const o = Object.assign({}, P, { name, asset: name, parameters: P });
    Object.defineProperty(o, 'toString', { value: () => name });
    return o;
  };

  const W = S.weather = {
    cur: null, prev: null, k: 1, name: 'Fine', transitioning: false, rainK: 0, snowK: 0,
    rain: { rate: 0, speed: 0, splash: 0, dropMin: 0, dropMax: 0 }, snow: { rate: 0, speed: 0 },
    sfxVolume: 0, prevSfxVolume: 0, lightning: LG, triggers: TRG, pinned: null,
    random: Math.random   // đổi được (kiểm thử): mọi lần bốc thăm của WeatherController, Lightning, WeatherTrigger đi qua đây
  };

  function resetWeather() {
    const F = WD()[E.weatherFallback];
    if (!F) return;
    const P = F.parameters;
    Object.assign(L, { cloudiness: P.cloudiness, cloudDarkness: P.cloudDarkness, auroraAmount: P.auroraAmount, waveSteepness: P.waveSteepness,
      foamAmount: P.foamAmount, lightningDelayMin: P.lightningDelayMin, lightningDelayMax: P.lightningDelayMax });
    wx.curName = E.weatherFallback; wx.curP = P;
    W.cur = wx.cur = descCache[wx.curName] || (descCache[wx.curName] = describe(wx.curName, P));
    W.prev = null; W.name = wx.curName; wx.needs = false; W.k = 1; W.transitioning = false;
  }

  // WeatherController.ChangeWeather (:452-505): chụp giá trị đang sống làm previousWeather, bắt đầu chuyển 15 s tới `name`.
  function changeTo(name, save) {
    const w = WD()[name];
    if (!w || !wx.curP) return false;
    const C0 = wx.curP;
    wx.tStart = wx.clock; wx.needs = true;
    const pv = {
      durationHours: 0, weight: 0, cloudiness: L.cloudiness, cloudDarkness: L.cloudDarkness, auroraAmount: L.auroraAmount,
      waveSteepness: L.waveSteepness, foamAmount: L.foamAmount, lightningDelayMin: L.lightningDelayMin, lightningDelayMax: L.lightningDelayMax,
      rainSpeed: L.rainSpeed, rainRate: L.rainRate, dropletHeightMin: L.dropletHeightMin, dropletHeightMax: L.dropletHeightMax,
      splashChance: L.splashChance, sfxVolume: L.sfxVolume, snowSpeed: L.snowSpeed, snowRate: L.snowRate,
      hasRain: C0.hasRain, rainEnterCurve: C0.rainEnterCurve, rainExitCurve: C0.rainExitCurve,
      hasSnow: C0.hasSnow, snowEnterCurve: C0.snowEnterCurve, snowExitCurve: C0.snowExitCurve,
      sfx: C0.sfx, sfxEnterCurve: C0.sfxEnterCurve, sfxExitCurve: C0.sfxExitCurve, forbidStingers: false
    };
    W.prev = describe(wx.curName, pv);
    wx.prevP = pv;
    wx.curName = name; wx.curP = w.parameters;
    W.cur = wx.cur = descCache[name] || (descCache[name] = describe(name, w.parameters));
    W.name = name;
    const s = root.DR.s;
    if (save && s && root.DR.mode !== 'title') {   // SaveData.Weather / WeatherChangeTime (:500-504)
      s.weather = name;
      (s.vars = s.vars || {})['weather-time'] = s.time;
    }
    return true;
  }

  // WeatherController.Update: đoạn chuyển (:318-412) — `clock` là Time.time (đứng khi tạm dừng)
  function advanceTransition() {
    const C = wx.curP, P = wx.prevP, dur = WE.transitionSec;
    if (!wx.needs) return;
    if (wx.clock < wx.tStart + dur) {
      const n = (wx.clock - wx.tStart) / dur;
      L.cloudiness = mixf(P.cloudiness, C.cloudiness, n);
      L.cloudDarkness = mixf(P.cloudDarkness, C.cloudDarkness, n);
      L.auroraAmount = mixf(P.auroraAmount, C.auroraAmount, n);
      L.waveSteepness = mixf(P.waveSteepness, C.waveSteepness, n);
      L.foamAmount = mixf(P.foamAmount, C.foamAmount, n);
      L.lightningDelayMin = C.lightningDelayMin; L.lightningDelayMax = C.lightningDelayMax;
      L.splashChance = mixf(P.splashChance, C.splashChance, n);
      if (P.dropletHeightMin > 0) {
        L.dropletHeightMin = mixf(P.dropletHeightMin, C.dropletHeightMin, n);
        L.dropletHeightMax = mixf(P.dropletHeightMax, C.dropletHeightMax, n);
      } else { L.dropletHeightMin = C.dropletHeightMin; L.dropletHeightMax = C.dropletHeightMax; }
      // mưa/tuyết: đúng từng nhánh của bản gốc, kể cả chỗ nó đọc đường cong vào của thời tiết CŨ khi chỉ thời tiết mới có mưa (:345-348, :369-372)
      if (C.hasRain && P.hasRain) L.rainSpeed = mixf(P.rainSpeed, C.rainSpeed, evalCurve(C.rainEnterCurve, n));
      else if (C.hasRain) L.rainSpeed = mixf(1, C.rainSpeed, evalCurve(P.rainEnterCurve, n));
      else L.rainSpeed = mixf(L.rainSpeed, 1, n);
      if (C.hasRain) L.rainRate = mixf(P.rainRate, C.rainRate, evalCurve(C.rainEnterCurve, n));
      else if (P.hasRain) L.rainRate = mixf(P.rainRate, C.rainRate, evalCurve(P.rainExitCurve, n));
      else L.rainRate = mixf(L.rainRate, 0, n);
      if (C.hasSnow && P.hasSnow) L.snowSpeed = mixf(P.snowSpeed, C.snowSpeed, evalCurve(C.snowEnterCurve, n));
      else if (C.hasSnow) L.snowSpeed = mixf(1, C.snowSpeed, evalCurve(P.snowEnterCurve, n));
      else L.snowSpeed = mixf(L.snowSpeed, 1, n);
      if (C.hasSnow) L.snowRate = mixf(P.snowRate, C.snowRate, evalCurve(C.snowEnterCurve, n));
      else if (P.hasSnow) L.snowRate = mixf(P.snowRate, C.snowRate, evalCurve(P.snowExitCurve, n));
      else L.snowRate = mixf(L.snowRate, 0, n);
      L.sfxVolume = mixf(0, C.sfxVolume, evalCurve(C.sfxEnterCurve, n));
      L.prevSfxVolume = mixf(P.sfxVolume, 0, evalCurve(P.sfxExitCurve, n));
      W.k = clamp01(n);
    } else {
      Object.assign(L, { sfxVolume: C.sfxVolume, cloudiness: C.cloudiness, cloudDarkness: C.cloudDarkness, auroraAmount: C.auroraAmount,
        waveSteepness: C.waveSteepness, foamAmount: C.foamAmount, lightningDelayMin: C.lightningDelayMin, lightningDelayMax: C.lightningDelayMax,
        rainRate: C.rainRate, rainSpeed: C.rainSpeed, splashChance: C.splashChance, dropletHeightMin: C.dropletHeightMin,
        dropletHeightMax: C.dropletHeightMax, snowRate: C.snowRate, snowSpeed: C.snowSpeed });
      wx.needs = false; W.k = 1;
    }
    wx.dirty = true;
  }

  // WeatherController.PickNewWeather (:261-283): theo vùng, ngày/đêm và trọng số; setImmediate bỏ đoạn chuyển
  const candidates = (zone, day) => { const all = WD(); return Object.keys(all).filter(n => canExist(n, zone) && ((all[n].day && day) || (all[n].night && !day))); };
  W.pick = (zone, day, rnd) => {
    const list = candidates(zone, day);
    const i = weightedIndex(list.map(n => WD()[n].parameters.weight), (rnd || W.random)());
    return i < 0 ? null : list[i];
  };
  function pickNew(zone, day, immediate) {
    const n = W.pick(zone, day);
    if (n && changeTo(n, true) && immediate) wx.tStart = -99999;
  }
  // SetWeather (:550-556): đặt ngay, không chuyển
  function setNow(name, save) {
    if (!changeTo(name, save)) return false;
    wx.tStart = -99999; advanceTransition();
    return true;
  }
  // ChangeWeather(string) (:568-583): tên lạ → bốc thăm; lệnh Yarn ChangeWeather và WeatherTrigger đi vào đây
  function changeByName(name) {
    if (wx.pinned) return;
    const n = nameOf(name);
    if (n) changeTo(n, true);
    else if (wx.last) pickNew(weatherZone(wx.last.x, wx.last.z), root.DRSky.env.isDay, false);
  }
  W.change = changeByName;
  W.set = name => { const n = nameOf(name); return !!n && setNow(n, true); };
  W.pin = name => {
    const n = name ? nameOf(name) : null;
    wx.pinned = W.pinned = n;
    if (n) setNow(n, false);
  };

  // Lightning.cs: SetLightningDelay (:47-58), Update (:60-71), Emit (:73-94)
  function setLightningDelay(min, max) {
    LG.min = min; LG.max = max;
    if (min <= 0 || max <= 0) { LG.playing = false; return; }
    LG.playing = true; LG.left = min + (max - min) * W.random();
  }
  function strike(x0, z0) {
    const a = W.random() * Math.PI * 2, d = LT.minRange + (LT.maxRange - LT.minRange) * W.random();
    const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
    // sfx: Lightning_1–3 tại chỗ rồi Thunder 1–3 sau `delay` giây (Lightning.cs:86, :98); hạt: DRParticles 'Lightning' tại điểm đánh
    root.DR.emit('lightning', { x, z, dist: d, delay: d * LT.thunderDelay });
    if (root.DRParticles) root.DRParticles.spawn('Lightning', { pos: [x, 0, z] });
  }
  W.emitLightning = () => { const p = wx.last || { x: 0, z: 0 }; strike(p.x, p.z); };

  // WeatherTrigger.OnTriggerEnter (:17-32): cầu trigger đụng hộp va chạm của thuyền; Aurora chỉ bật ban đêm (SceneTimeResponder)
  function touches(t, b, half) {
    const dx = b.x - t.pos[0], dz = b.z - t.pos[2], c = Math.cos(b.yaw), sn = Math.sin(b.yaw);
    const lx = dx * c - dz * sn, lf = -dx * sn - dz * c;   // trục phải/trước của thân (boat.js: trước = (−sin, −cos))
    return Math.hypot(Math.max(Math.abs(lx) - half[0], 0), Math.max(Math.abs(lf) - half[1], 0)) < t.radius;
  }
  function stepTriggers(s, day) {
    const half = (root.DRBoat && DRBoat.half) || [1.2, 2.5];
    for (const t of TRG) {
      const inside = (!t.nightOnly || !day) && touches(t, s.boat, half);
      if (inside && !t.inside && !wx.pinned && s.time > t.last + t.cooldownDays) {
        t.last = s.time;                                    // cooldown tính từ lúc vào, kể cả khi bốc thăm trượt
        if (W.random() < t.chance) changeTo(t.weather, true);
      }
      t.inside = inside;
    }
  }

  // thuyền nhảy xa trong một khung (dịch chuyển tức thời) ≈ OnTeleportComplete (:246-259)
  function onTeleport(zone, day) {
    if (wx.pinned || canExist(wx.curName, zone)) return;
    L.rainRate = 0; L.snowRate = 0; L.auroraAmount = 0; L.prevSfxVolume = 0;
    pickNew(zone, day, true);
  }

  // hạt mưa/tuyết: một tay cầm DRParticles mỗi loại, tắt hẳn sau 10 s không mưa/tuyết; setRateOverTime(hạt/giây) mỗi khung (nhánh vfx)
  // ghi tốc độ phát tuyệt đối (hạt/giây) như rateOverTime của WeatherController; tay cầm chưa có setRateOverTime thì rơi về setRate(k) [ĐỀ XUẤT]
  function setRateAbs(h, perSec, k) { if (h.setRateOverTime) h.setRateOverTime(perSec); else if (h.setRate) h.setRate(k); }
  function stepFx(dt) {
    const rk = clamp01(L.rainRate / 2000), sk = clamp01(L.snowRate / 1000);
    W.rainK = rk; W.snowK = sk;
    if (rk > 0) {
      FX.rainIdle = 0;
      if (!FX.rain && root.DRParticles) FX.rain = root.DRParticles.spawn('Rain', { follow: 'camera', loop: true });
    } else if (FX.rain && (FX.rainIdle += dt) > 10) { if (FX.rain.stop) FX.rain.stop(); FX.rain = null; }
    if (FX.rain) {
      setRateAbs(FX.rain, L.rainRate, rk);
      // WeatherController.cs:417-419: simulationSpeed = _rainSpeed, sub-emitter 0 (vệt bắn) = _splashChance
      if (FX.rain.setSimulationSpeed) FX.rain.setSimulationSpeed(L.rainSpeed);
      if (FX.rain.setSubEmitProbability) FX.rain.setSubEmitProbability(0, L.splashChance);
    }
    if (sk > 0) {
      FX.snowIdle = 0;
      if (!FX.snow && root.DRParticles) FX.snow = root.DRParticles.spawn('Snow', { follow: 'player', loop: true });
    } else if (FX.snow && (FX.snowIdle += dt) > 10) { if (FX.snow.stop) FX.snow.stop(); FX.snow = null; }
    if (FX.snow) {
      setRateAbs(FX.snow, L.snowRate, sk);
      if (FX.snow.setSimulationSpeed) FX.snow.setSimulationSpeed(L.snowSpeed);
    }
  }

  // ván mới / nạp ván: lấy thời tiết đã lưu ngay (không chuyển 15 s), WeatherTrigger tính lại từ đầu (timeOfLastTrigger không lưu)
  function syncWeather(s) {
    wx.sRef = s;
    s.vars = s.vars || {};
    if (typeof s.vars['weather-time'] !== 'number') s.vars['weather-time'] = s.time;
    setNow(wx.pinned || nameOf(s.weather) || E.weatherFallback, false);
    L.prevSfxVolume = 0;
    for (const t of TRG) { t.inside = false; t.last = -Infinity; }
    wx.last = null; wx.zoneT = WE.zoneCheckSec;
  }

  // một khung của WeatherController + Lightning + WeatherTrigger; kết quả nằm ở L (giá trị sống) và W (công khai)
  function stepWeather(dt, ctx, s, day, playing) {
    wx.clock += dt;
    if (s && wx.sRef !== s) syncWeather(s);
    if (s && playing) {
      const zone = weatherZone(ctx.x, ctx.z);
      if (wx.last && Math.hypot(ctx.x - wx.last.x, ctx.z - wx.last.z) > 150) onTeleport(zone, day);
      wx.last = { x: ctx.x, z: ctx.z };
      wx.zoneT -= dt;
      if (wx.zoneT <= 0) {                                     // :299-307 — kiểm vùng mỗi 5 s
        wx.zoneT = WE.zoneCheckSec;
        if (!wx.pinned && !canExist(wx.curName, zone)) pickNew(zone, day, false);
      }
      const v = s.vars;                                        // :309-317 — hết durationHours thì bốc thăm lại (không khi đang chuyển)
      if (v['weather-time'] > s.time) v['weather-time'] = s.time;   // thời gian lùi (móc setTime): neo lại
      if (!wx.pinned && !wx.needs && s.time > v['weather-time'] + wx.curP.durationHours / 24) pickNew(zone, day, false);
      stepTriggers(s, day);
    }
    advanceTransition();
    if (wx.dirty) { setLightningDelay(L.lightningDelayMin, L.lightningDelayMax); wx.dirty = false; }   // :429-432 (bốc lại hẹn giờ mỗi khung khi đang chuyển)
    if (LG.playing && playing && wx.last) {
      LG.left -= dt;
      if (LG.left <= 0) { strike(wx.last.x, wx.last.z); LG.left = LG.min + (LG.max - LG.min) * W.random(); }
    }
    W.transitioning = wx.needs;
    W.rain.rate = L.rainRate; W.rain.speed = L.rainSpeed; W.rain.splash = L.splashChance; W.rain.dropMin = L.dropletHeightMin; W.rain.dropMax = L.dropletHeightMax;
    W.snow.rate = L.snowRate; W.snow.speed = L.snowSpeed; W.sfxVolume = L.sfxVolume; W.prevSfxVolume = L.prevSfxVolume;
    stepFx(dt);
  }
  if (pin0) wx.pinned = W.pinned = pin0[1];   // chuẩn hoá tên ở init() khi đã có DR_WEATHER

  function update(dt, ctx) {
    const D = root.DR, s = D.s;
    const playing = s && D.mode !== 'title' && !ctx.paused;
    let mode = 'idle', input = 0;
    if (playing) {
      [mode, input] = timeMode(ctx);
      const before = s.time;
      s.time = R.advance(CFG, s.time, dt, mode, input);
      if (S.forced) {
        S.forced.left -= s.time - before;
        if (S.forced.left <= 0) {
          const reason = S.forced.reason; S.forced = null;
          const f = document.getElementById('dr-fade');
          if (f) f.classList.remove('on');
          if (root.DRAudio) { DRAudio.loop('ui.passTime.loop', 0); DRAudio.play('ui.passTime.complete'); }
          D.emit('passTimeDone', reason);
        }
      }
    }
    const tmod = R.timeModifier(CFG, mode, input);
    const env = S.env;
    env.timeMode = mode; env.timeMod = tmod;
    S.gameTime += dt * (S.forced ? CFG.forcedTimePassageSpeedModifier : 1);
    const gt = S.gameTime % 1000; // GameManager.gameTime quấn ở 1000
    root.DRWater.uniforms.uGameTime.value = gt;
    U.uDrTime.value = gt;

    const t = s ? R.timeOfDay(s.time) : 0.3;
    const day = R.isDay(s ? s.time : 0.3, TC.dawnTime, TC.duskTime);
    // sanity
    if (playing && tmod > 0) {
      const st = root.DRBoat && DRBoat.stats;
      const local = localSanity(ctx.x, ctx.z, day, s.lightsOn, st);
      const sleeping = !!(S.forced && S.forced.sleep);
      const rate = R.sanityRate(CFG, day, local, 0, sleeping, 0);
      s.sanity = R.stepSanity(s.sanity, rate, dt, tmod);
    }

    // ánh sáng: directionalLight.color = sunColour(t), RenderSettings.ambientLight = ambientLightColor(t) (sRGB → tuyến tính)
    const ang = T.MathUtils.degToRad(TC.lightAngleMin + 360 * t);
    env.sunDir.set(Math.cos(ang), Math.sin(ang), 0);
    U.uDrSunDir.value.copy(env.sunDir);
    const sc = gradient(TC.sunColour, t), ac = gradient(TC.ambientLightColor, t);
    env.sunColor = sc; env.ambientColor = ac;
    lin(sc, sun.color); lin(sc, U.uDrSunCol.value).multiplyScalar(sun.userData.base);
    sun.intensity = sun.userData.base * SUN_K;
    sun.position.set(ctx.x + env.sunDir.x * 200, Math.max(5, env.sunDir.y * 200), ctx.z);
    sun.target.position.set(ctx.x, 0, ctx.z);
    lin(ac, amb.color); lin(ac, U.uDrAmb.value);
    const dayK = Math.max(sc[0], sc[1], sc[2]);
    env.isDay = day; env.dayK = dayK; env.night = 1 - dayK;
    env.sceneLights = curve(TC.sceneLights, t);
    // WeatherController: _cloudiness/_cloudDarkness/_auroraAmount/_waveSteepness/_foamAmount sống theo WeatherData hiện tại, lerp 15 s
    stepWeather(dt, ctx, s, day, playing);
    env.cloudiness = L.cloudiness; env.cloudDarkness = L.cloudDarkness; env.auroraAmount = L.auroraAmount; env.wind = E.wind;
    env.waveSteepness = L.waveSteepness; env.foamAmount = L.foamAmount; env.weather = wx.curName; env.tod = t;
    // TimeController.RecalculateSceneLightness: 1 khi đêm hoặc mây đen (cloudDarkness + cloudiness > ngưỡng), ngày 0
    env.sceneLightness = (!day || L.cloudDarkness + L.cloudiness > TC.cloudLightEnableThreshold) ? 1 : 0;
    U.uDrNightL.value = env.sceneLightness; U.uDrCloudy.value = L.cloudiness;

    // sương (FogController + FogPropertyModifier mạnh nhất tại thuyền; đo bằng khoảng cách 3D như Vector3.Distance)
    let dens = curve(E.fog.densityOverDay, t), col = gradient(E.fog.colorOverDay, t), fh = E.fog.height;
    let best = null, bk = 0;
    for (const m of fogMods) {
      const d = Math.hypot(ctx.x - m.x, -m.y, ctx.z - m.z);
      const k = d > m.f.partialValueRadius ? 0 : d < m.f.fullValueRadius ? 1 : 1 - R.invLerp(m.f.fullValueRadius, m.f.partialValueRadius, d);
      if (k > bk) { bk = k; best = m; }
    }
    if (best) {
      const fp = best.f.fogProperty, d2 = curve(fp.fogDensityOverDay, t), c2 = gradient(fp.fogColorOverDay, t);
      dens += (d2 - dens) * bk; fh += (fp.fogHeight - fh) * bk; col = col.map((v, i) => v + (c2[i] - v) * bk);
    }
    env.fogColor = col; env.fogDensityRaw = dens; env.fogHeight = fh; env.fogModifier = best ? best.f.fogProperty.name || bk : null;
    env.fogCenter.set(ctx.x, 0, ctx.z);
    U.uDrFogC.value.set(ctx.x, 0, ctx.z); U.uDrFogD.value = dens; U.uDrFogH.value = fh;
    // tương thích: mật độ quy đổi để luồng khác (nếu còn đọc) có số dương nhỏ; tầm xa tối đa của sương gốc là 350 m quanh thuyền
    env.fogDensity = 1.98 / (FS.far - FS.densityK * Math.max(0, Math.min(1.02, dens)) * (1 - FS.remove) + 1);
    env.fogFar = FS.linearFar + 15;
    lin(col, env.fogColorLinear);
    // hậu kỳ bật: render target tuyến tính ⇒ màu sương tuyến tính; tắt: three trộn sương sau mã hoá sRGB ⇒ giữ giá trị sRGB
    if (P.ready && P.enabled) scene.fog.color.copy(env.fogColorLinear); else scene.fog.color.setRGB(col[0], col[1], col[2]);
    scene.background.copy(scene.fog.color);
    const u = dome.material.uniforms;
    u.uFogLin.value.copy(env.fogColorLinear);
    u.uTOD.value = t; u.uAurora.value = L.auroraAmount || 0; u.uCloudDark.value = L.cloudDarkness;
    if (ctx.cam) dome.position.copy(ctx.cam);

    updateLights(ctx.x, ctx.z);
    updatePostVolumes(ctx.cam || env.fogCenter, s ? s.sanity : 1);
    root.DRWorld.setNight(env.sceneLights);
    if (root.DRWorld.updateAmbient) root.DRWorld.updateAmbient(dt, ctx, env);
  }

  Object.assign(S, { init, update, passTime, gradient, curve });
  Object.defineProperty(S, 'sun', { get: () => sun });
  Object.defineProperty(S, 'ambient', { get: () => amb });
})(window);
