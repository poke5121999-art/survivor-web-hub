// Đường đua 3D: art/tracks/<id>/{track.glb, meta.json, lm*.png} (sinh bởi tools/export_track.py). tools/trackview.html dùng chung tệp này.
// Game gốc là dự án Unity không gian màu tuyến tính (shader QF_Gamma giải lightmap ×4,59 = 2^2,2). Tô màu theo shader
// (tên lưu ở extras.shader):
// - QF_PBR/Env/NssTerrain2Layer: chép từ shader GLES3 gốc. Albedo, màu vật liệu, lightmap giải sRGB → tuyến tính;
//   lin = 0,96·albedo·(lightmap×5 + nắng·N·L·shadowmask), rồi mã hoá sRGB vì target của postfx chứa màu hiển thị.
//   Bỏ phần phản xạ probe/GGX: địa hình gốc nhám 0,9, kim loại 0 nên phần này chỉ vài phần trăm.
// - Còn lại (NssStandard, QF_Gamma, QF/ cũ): công thức gamma albedo × (lightmap ×2 + nắng × shadowmask) + phát sáng.
//   NssStandard gốc cũng tính tuyến tính như trên, nhưng mặt đường 11CityNew kim loại 0,49, nhám 0,19 nên ánh trời phản
//   xạ (probe cầu, không xuất) chiếm phần lớn độ sáng; tính tuyến tính mà thiếu phần đó thì đường tối hẳn (đo 135 → 100).
(function (TD) {
  'use strict';
  const THREE = window.THREE;
  const TV = { root: null, meta: null, skies: [] };
const VS = `
    attribute vec2 uv2; attribute vec4 vcol;
    varying vec2 vUv; varying vec2 vUv2; varying vec3 vN; varying vec4 vCol;
    #include <fog_pars_vertex>
    void main() {
      vUv = uv; vUv2 = uv2; vCol = vcol;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;
  const FS = `
    uniform sampler2D map; uniform sampler2D lightMap; uniform sampler2D emissiveMap;
    uniform sampler2D map2, mask2; uniform float hasMap2, hasMask2; uniform vec3 tint2; uniform vec4 uvST2, maskST2;
    uniform vec4 l2a; uniform vec4 l2b; // (contrast, heightOffset, inputVertexAlpha, normalZMask), (zMul, zAdd, intensity1, intensity2)
    uniform vec3 l2c; // (_ALLOW_BLEND_WITH_POWER, _NormalZMaskPower, _VertexColorPower)
    uniform float hasMap, hasLM, hasEm, unlit, alphaTest, opacity, lmScale, sunScale, pbr;
    uniform vec3 tint, emissive, sunCol, toSun, ambient, sunLin, ambLin;
    varying vec2 vUv; varying vec2 vUv2; varying vec3 vN; varying vec4 vCol;
    #include <fog_pars_fragment>
    vec3 s2l(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
    vec3 l2s(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    void main() {
      vec4 a = hasMap > 0.5 ? texture2D(map, vUv) : vec4(1.0);
      if (pbr > 0.5) a.rgb = s2l(a.rgb);
      vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
      if (hasMap2 > 0.5) {
        // trọng số lớp 1 của NssTerrain2Layer, chép từ shader GLES3 của game
        float a8 = mix(vCol.a, 1.0 - vCol.a, l2a.z);
        float z = clamp(N.y, 0.0, 1.0) * abs(l2b.x);
        if (l2c.x > 0.5) { a8 = pow(max(a8, 0.001), l2c.z + 0.01); z = pow(max(z, 0.001), l2c.y + 0.01); }
        z = clamp(z + l2b.y, 0.0, 1.0);
        float t = l2b.x >= 0.0 ? z : 1.0 - z;
        float t2 = a8 + l2a.w * max(t - a8, 0.0);
        float w1 = t2;
        if (hasMask2 > 0.5) {
          float h1 = (1.0 - max(l2a.y, 0.5)) * (texture2D(mask2, vUv * maskST2.xy + maskST2.zw).r + 1.0);
          w1 = min(clamp(h1 - 2.0 * l2a.y * t2, 0.0, 1.0) / (1.0 - min(l2a.x, 0.999)), 1.0);
        }
        vec3 c2 = texture2D(map2, vUv * uvST2.xy + uvST2.zw).rgb;
        if (pbr > 0.5) c2 = s2l(c2);
        a.rgb = mix(c2, a.rgb, w1) * mix(tint2 * l2b.w, tint * l2b.z, w1) * vCol.rgb;
      } else a.rgb *= tint;
      if (a.a < alphaTest) discard;
      float ndl = max(dot(N, toSun), 0.0);
      vec3 c;
      if (unlit > 0.5) c = a.rgb;
      else if (pbr > 0.5) {
        vec3 light;
        if (hasLM > 0.5) {
          vec4 lm = texture2D(lightMap, vUv2);
          light = s2l(lm.rgb) * 5.0 + sunLin * ndl * lm.a;
        } else light = ambLin + sunLin * ndl;
        vec3 lin = 0.96 * a.rgb * light;
        if (hasEm > 0.5) lin += s2l(texture2D(emissiveMap, vUv).rgb) * emissive;
        c = l2s(lin);
      } else {
        vec3 light;
        if (hasLM > 0.5) {
          vec4 lm = texture2D(lightMap, vUv2);
          light = lm.rgb * lmScale + sunCol * sunScale * ndl * lm.a;
        } else light = ambient + sunCol * sunScale * ndl;
        c = a.rgb * light;
        if (hasEm > 0.5) c += texture2D(emissiveMap, vUv).rgb * emissive;
      }
      gl_FragColor = vec4(c, a.a * opacity);
      #include <fog_fragment>
    }`;

  function vec(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

  TV.load = async function (scene, renderer, id, onProgress) {
    const BASE = TD.TRACKS[id].art.replace(/[^/]*$/, ''), V = '?v=' + (TD.REV || '');
    const meta = await (await fetch(BASE + 'meta.json' + V)).json();
    const tl = new THREE.TextureLoader();
    const lms = await Promise.all(meta.lightmaps.map((l) => new Promise((res) => tl.load(BASE + l.file + V, (t) => { t.flipY = false; res(t); },
      undefined, () => { console.warn('lightmap ' + l.file); res(null); }))));
    const lmScale = (meta.lightmaps[0] && meta.lightmaps[0].rgbScale) || 2;
    const sunScale = meta.sunScale || 1;
    const sun = meta.sun || { dir: [0, -1, 0], color: [1, 1, 1], intensity: 1 };
    const toSun = vec(sun.dir).multiplyScalar(-1).normalize();
    const sunCol = new THREE.Color(sun.color[0], sun.color[1], sun.color[2]).multiplyScalar(sun.intensity);
    const amb = meta.ambient ? new THREE.Color(...meta.ambient.sky).multiplyScalar(meta.ambient.intensity) : new THREE.Color(0.5, 0.5, 0.5);
    // GraphicsSettings.m_LightsUseLinearIntensity = false: Unity nhân cường độ vào màu gamma rồi mới đổi sang tuyến tính.
    // Ambient phẳng (RenderSettings) cũng đổi sang tuyến tính.
    const sunLin = sunCol.clone().convertSRGBToLinear();
    const ambLin = amb.clone().convertSRGBToLinear();
    if (meta.fog && meta.fog.enabled) {
      const fc = new THREE.Color(...meta.fog.color);
      scene.fog = meta.fog.mode === 'linear' ? new THREE.Fog(fc, meta.fog.start, meta.fog.end) : new THREE.FogExp2(fc, meta.fog.density);
    } else scene.fog = null;
    scene.background = new THREE.Color(...(meta.fog ? meta.fog.color : [0.5, 0.6, 0.8]));
    const loader = new THREE.GLTFLoader();
    loader.setMeshoptDecoder(window.MeshoptDecoder);
    const gltf = await new Promise((res, rej) => loader.load(BASE + meta.glb + V, res, (e) => onProgress && e.total && onProgress(e.loaded / e.total), rej));
    const stats = { meshes: 0, tris: 0, noMap: [], lmMissing: [], pbr: 0 };
  gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material, x = m.userData || {};
      // GLTFLoader đánh dấu sRGB, và three r140 trên WebGL2 khi đó tải texture dạng SRGB8_ALPHA8: GPU tự giải về tuyến
      // tính lúc đọc. Shader này cần giá trị thô: nhánh gamma dùng thẳng, nhánh PBR tự giải sRGB (s2l).
      for (const t of [m.map, m.emissiveMap, m.aoMap, m.metalnessMap]) if (t) t.encoding = THREE.LinearEncoding;
      const pbr = /^QF_PBR\/Env\/NssTerrain2Layer/.test(x.shader || '') && !x.sky && !x.unlit;
      const lmi = x.lightmap != null ? x.lightmap : -1;
      const lmTex = lmi >= 0 ? lms[lmi] : null;
      if (lmi >= 0 && !lmTex) stats.lmMissing.push(o.name);
      if (!m.map && !x.sky) stats.noMap.push(o.name);
      if (pbr) stats.pbr++;
      const sm = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, fog: !x.sky,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
          map: { value: null }, lightMap: { value: null }, emissiveMap: { value: null }, map2: { value: null },
          mask2: { value: null }, hasMask2: { value: 0 }, maskST2: { value: new THREE.Vector4(1, 1, 0, 0) },
          l2a: { value: new THREE.Vector4() }, l2b: { value: new THREE.Vector4() }, l2c: { value: new THREE.Vector3() },
          hasMap2: { value: 0 }, tint2: { value: new THREE.Color(1, 1, 1) }, uvST2: { value: new THREE.Vector4(1, 1, 0, 0) },
          hasMap: { value: m.map ? 1 : 0 }, hasLM: { value: lmTex ? 1 : 0 }, hasEm: { value: m.emissiveMap ? 1 : 0 },
          unlit: { value: x.unlit || x.sky ? 1 : 0 }, alphaTest: { value: m.alphaTest || 0 }, opacity: { value: 1 },
          lmScale: { value: lmScale }, sunScale: { value: sunScale }, pbr: { value: pbr ? 1 : 0 },
          tint: { value: new THREE.Color().copy(m.color) }, emissive: { value: new THREE.Color().copy(m.emissive) },
          sunCol: { value: sunCol }, toSun: { value: toSun }, ambient: { value: amb }, sunLin: { value: sunLin }, ambLin: { value: ambLin },
        }]),
      });
      if (x.layer2) {
        const L = x.layer2, u = sm.uniforms;
        // bộ xuất đặt lớp 2 vào ô occlusion và mặt nạ cao độ vào ô metallicRoughness
        if (m.aoMap) { m.aoMap.anisotropy = renderer.capabilities.getMaxAnisotropy(); u.map2.value = m.aoMap; u.hasMap2.value = 1; }
        if (L.mask && m.metalnessMap) {
          u.mask2.value = m.metalnessMap; u.hasMask2.value = 1;
          u.maskST2.value.set(L.mask.uvScale[0], L.mask.uvScale[1], L.mask.uvOffset[0], L.mask.uvOffset[1]);
        }
        u.l2a.value.set(L.heightContrast, L.heightOffset, L.inputVertexAlpha, L.normalZMask);
        u.l2b.value.set(L.normalZMaskMul, L.normalZMaskAdd, L.intensity1, L.intensity2); u.tint2.value.setRGB(L.tint[0], L.tint[1], L.tint[2]);
        u.l2c.value.set(L.blendPower ? 1 : 0, L.normalZMaskPower || 0, L.vertexColorPower || 0);
        u.uvST2.value.set(L.uvScale[0], L.uvScale[1], L.uvOffset[0], L.uvOffset[1]);
        const c = o.geometry.getAttribute('color');
        if (c) o.geometry.setAttribute('vcol', c);
      }
      sm.uniforms.map.value = m.map; sm.uniforms.lightMap.value = lmTex; sm.uniforms.emissiveMap.value = m.emissiveMap;
      // GLTFLoader r140 chép baseColorFactor nguyên trạng, tức màu gamma Unity đã lưu. Unity dự án tuyến tính đổi màu vật
      // liệu sang tuyến tính trước khi đưa vào shader, nên nhánh tuyến tính đổi theo. Nhánh gamma giữ phép mã hoá sRGB thêm
      // một lần như bản cũ (làm màu nhạt hơn màu gốc ~6%) để Thành Phố 11 không đổi khi chưa có phần phản xạ.
      if (pbr) for (const k of ['tint', 'tint2', 'emissive']) sm.uniforms[k].value.convertSRGBToLinear();
      else for (const k of ['tint', 'emissive']) sm.uniforms[k].value.convertLinearToSRGB();
      sm.side = m.side;
      sm.transparent = m.transparent;
      sm.depthWrite = !m.transparent;
      if (x.sky) { sm.depthWrite = false; sm.side = THREE.DoubleSide; o.renderOrder = -10; o.frustumCulled = false; o.userData.sky = true; }
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      for (const t of [m.map, m.emissiveMap]) if (t) t.anisotropy = maxAniso;
      o.material = sm;
      stats.meshes++;
      stats.tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    TV.skies = [];
    gltf.scene.traverse((o) => { if (o.isMesh && o.userData.sky) TV.skies.push([o, o.position.clone(), o.scale.x]); });
    TV.skyC = meta.sky ? vec(meta.sky.center) : new THREE.Vector3(); TV.skyR = meta.sky ? meta.sky.radius : 1;
    if (TV.root) scene.remove(TV.root);
    TV.root = gltf.scene; TV.meta = meta; TV.stats = stats;
    TV.sun = { toSun, sunCol, amb };
    scene.add(gltf.scene);
    return TV;
  };

  // Vòm trời rộng hơn 20 km: co về quanh camera để mọi hướng vẫn như cũ mà nằm gọn trong far.
  TV.update = function (camera) {
    for (const [o, p0, s0] of TV.skies) {
      const k = Math.min(1, 0.9 * camera.far / (TV.skyR + camera.position.distanceTo(TV.skyC)));
      o.scale.setScalar(s0 * k);
      o.position.copy(camera.position).multiplyScalar(1 - k).addScaledVector(p0, k);
    }
  };

  TD.trackView = TV;
})(globalThis.TD = globalThis.TD || {});
