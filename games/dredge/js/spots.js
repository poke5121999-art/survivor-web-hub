/*
 * Điểm câu / nạo vét (HarvestPOI trong markers.json): hạt của prefab gốc, kho cá bền theo sổ lưu,
 * Space -> màn thu hoạch (DRMinigame = HarvestMinigameView) + khoang docked bên phải -> con cá tạo theo ItemManager.CreateFishItem (CODE.md 4.1,
 * 4.2, 4.4) rồi nằm trên con trỏ (BEING_HARVESTED) tới khi người chơi đặt vào khoang/khay hoặc giữ Z vứt; khay 6x3 sau con đầu khi xong Quest_Intro.
 *   DRSpots.init(scene, world)  DRSpots.update(dt, x, z)  DRSpots.interact()  DRSpots.nearest(fn)
 *
 * Hạt điểm câu (HarvestPOI.Start + HarvestableParticles.cs; tham số bóc bởi tools/harvest_ui.py -> DR_HARVEST_UI.spotfx):
 *  - mô phỏng trên CPU đúng các mô-đun ParticleSystem mà prefab bật: hình phát (cầu/vòng/donut), đời, cỡ, xoay 3D, vận tốc theo đời
 *    (VelocityModule.y: cá nổi lên ~23 % đời đầu, bơi, lặn xuống 25 % đời cuối), quỹ đạo orbitalY, trọng lực, cỡ/xoay theo đời, prewarm;
 *  - số hạt của HarvestableParticleSystem = particlesPerStock × floor(kho) (HarvestableParticles.UpdateParticles, không trần 15);
 *    toggleObjects (mảnh vụn nạo vét) tắt hẳn và vòng nước (toggleParticles) ngừng phát khi floor(kho) = 0;
 *  - vẽ bằng MESH THẬT của prefab (CodMesh, TrinketPieceMesh1-4, WoodPieceMesh1-4, SphereLowPoly...) + bảng màu AnimalColours /
 *    DredgeParticles_Texture; cá căn theo hướng bay (m_RenderAlignment 4 = Velocity), mảnh vụn theo xoay 3D (2 = Local);
 *  - cá/mảnh vụn nằm DƯỚI mặt nước: đỉnh được kéo về điểm cắt mặt nước theo tia nhìn (ảnh trên màn hình không đổi, mặt nước và thân
 *    thuyền vẫn che đúng), rồi mờ theo độ sâu bằng đúng công thức alpha của js/water.js (mix(1, _ShallowColor.a, e^(−sâu/_Depth)));
 *  - vòng nước động: DisturbedWaterParticles(_0) = cầu thấp đa giác xám trắng nổi lên rồi chìm (vận tốc y +0,5, trọng lực ×0,5);
 *    điểm có món đầu requiresAdvancedEquipment dùng SurfaceOozeParticles (HarvestPOI.cs:104) [không có điểm nào như vậy trong dữ liệu];
 *  - khoảng cách vẽ = LODGroup của prefab (cỡ / (2·tan(FOV/2) · screenRelativeHeight), lodBias 1 của mức High): cá ~142 m, vòng ~107 m;
 *  - điểm cổ vật: DRParticles.spawn('RelicParticles') (cột sáng hồng, than hồng, mảnh vụn) — hệ hạt dùng chung, chủ VFX vẽ;
 *  - điểm "đặc biệt" (aberrant): SpecialFishParticles (xoáy cực quang #00f8ff26 + tia sáng quay) bật/tắt theo
 *    HarvestPOIDataModel.RollForSpecial mỗi khi đổi ngày/đêm hoặc sau 0,5 ngày (vẽ phẳng trên mặt nước như trước).
 * Tiếng gần điểm (HarvestPOIHandler.PlayRandomHarvestProximityClip): một trong 3 clip của loại (PickRandom), chờ hết clip + 1-2,5 s,
 *   chỉ khi điểm VALID (kho ≥ 1, đúng giờ; KHÔNG xét dụng cụ), tắt dần 2 -> 8 m.
 * Vào điểm (PlayerPOIInteraction.cs:144, HarvestPOIDataModel.IsHarvestable): chỉ cần VALID; thiếu dụng cụ thì panel báo
 *   (InvalidEquipmentIndicator, thẻ loại lấp lánh, CannotStartText), chỉ còn cần câu trên ô hỏng thì minigame chạy KHÔNG có mục tiêu.
 */
(function (root) {
  'use strict';
  const T = root.THREE, R = root.DRRules, CFG = root.DR_CONFIG, ITEMS = root.DR_ITEMS;
  const LISTENER_R = root.DR_BOAT.colliderSize.spheres.find(s => s.node === 'POIInteractionListener').radius; // 1,5 m
  const SHOW_R = 170, MAX_SHOWN = 64; // [ĐỀ XUẤT] bán kính vẽ xoáy điểm đặc biệt, sương đêm che phần xa
  const MAX_EMIT = 24;                // [ĐỀ XUẤT] số điểm mô phỏng hạt cùng lúc (gần camera nhất)
  const SFXD = (root.DR_HARVEST_UI && root.DR_HARVEST_UI.spotfx) || null;
  const Sp = root.DRSpots = { list: [], byId: {}, fishing: false, cur: null };
  const URLB = f => new URL(f, document.baseURI).href;
  let mesh = null, near = null, regenT = 0, showT = 0, tAnim = 0, sfxT = 0, sfxFor = null, scene = null;

  const firstId = (d, day) => { const l = (R.spotList(d, day) || []).length ? R.spotList(d, day) : (d.items || d.nightItems || []); return l && l[0]; };
  const firstItem = d => ITEMS[(d.items && d.items[0]) || (d.nightItems && d.nightItems[0])];
  const firstItemId = d => (d.items && d.items[0]) || (d.nightItems && d.nightItems[0]);

  function init(sc, world) {
    scene = sc;
    for (const m of world.data.markers.markers) {
      const d = m.harvestPOIData;
      if (m.kind !== 'harvestPOI' || !d || m.active === false) continue;
      const it = firstItem(d);
      if (!it || !it.harvestableType) continue; // điểm nhiệm vụ / vật phẩm lạ: ngoài pha 1
      const col = (m.colliders || [])[0];
      const sp = { id: String(d.id), x: m.pos[0], y: m.pos[1] || 0, z: m.pos[2], d, dredge: it.harvestableType === 'DREDGE', r: col ? col.radius : 2, special: false, spDay: null, spT: -1 };
      Sp.list.push(sp); Sp.byId[sp.id] = sp;
    }
    mesh = specialMesh();
    scene.add(mesh);
    loadLibrary();
  }

  // ============================================================================================ hạt: thư viện mesh + vật liệu
  // AnimationCurve Hermite [t, v, inSlope, outSlope]; tiếp tuyến null = khoá "constant" (bậc thang)
  function curve(keys, t) {
    if (!keys || !keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    const l = keys[keys.length - 1];
    if (t >= l[0]) return l[1];
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      if (t > b[0]) continue;
      const dd = b[0] - a[0], u = (t - a[0]) / dd;
      if (a[3] == null || b[2] == null) return a[1];
      const m0 = a[3] * dd, m1 = b[2] * dd, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b[1] + (u3 - u2) * m1;
    }
    return l[1];
  }
  // MinMaxCurve gọn của tool: số | [min, max] | {k, c} | {k, c0, c}; rnd = số ngẫu nhiên cố định của hạt
  function mm(v, t, rnd) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return v[0] + (v[1] - v[0]) * rnd;
    if (v.cst === undefined) v.cst = constOf(v);                         // đường cong phẳng (vd. vel.x khoá (0,0) (1,0)): tính một lần
    if (v.cst !== null) return v.cst;
    if (v.c0) return (curve(v.c0, t) + (curve(v.c, t) - curve(v.c0, t)) * rnd) * v.k;
    return curve(v.c, t) * v.k;
  }
  function constOf(v) {
    const flat = c => c && c.every(k => k[1] === c[0][1] && !k[2] && !k[3]);
    if (!flat(v.c) || (v.c0 && !(flat(v.c0) && v.c0[0][1] === v.c[0][1]))) return null;
    return v.c.length ? v.c[0][1] * v.k : 0;
  }
  // Gradient: alpha theo đời (Unity nội suy tuyến tính giữa khoá)
  function gradA(g, t) {
    const a = g && g.a; if (!a || !a.length) return 1;
    if (t <= a[0][0]) return a[0][1];
    for (let i = 1; i < a.length; i++) if (t <= a[i][0]) return a[i - 1][1] + (a[i][1] - a[i - 1][1]) * (t - a[i - 1][0]) / ((a[i][0] - a[i - 1][0]) || 1);
    return a[a.length - 1][1];
  }
  const s2l = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  // Quaternion.Euler của Unity (độ hoặc rad, thứ tự Z -> X -> Y) rồi đổi sang three.js (đổi dấu z: (x,y,z,w) -> (−x,−y,z,w))
  const _qx = new T.Quaternion(), _qy = new T.Quaternion(), _qz = new T.Quaternion(), AX = new T.Vector3(1, 0, 0), AY = new T.Vector3(0, 1, 0), AZ = new T.Vector3(0, 0, 1);
  function unityEuler(x, y, z, out) {
    _qx.setFromAxisAngle(AX, x); _qy.setFromAxisAngle(AY, y); _qz.setFromAxisAngle(AZ, z);
    out.copy(_qy).multiply(_qx).multiply(_qz);
    return out;
  }
  const toThree = q => q.set(-q.x, -q.y, q.z, q.w);

  const LIB = { geo: {}, ready: false, tex: {}, mats: {}, rend: new Map() };
  function loadLibrary() {
    if (!SFXD || !SFXD.meshes) return;
    const M = SFXD.meshes;
    fetch(URLB(M.file)).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + M.file); return r.arrayBuffer(); }).then(buf => {
      const P = new Int16Array(buf, M.pos, M.nv * 3), N = new Int8Array(buf, M.nor, M.nv * 3), U = new Uint16Array(buf, M.uv, M.nv * 2), I = new Uint16Array(buf, M.idx, M.ni);
      for (const [name, m] of Object.entries(M.list)) {
        const pos = new Float32Array(m.nv * 3), nor = new Float32Array(m.nv * 3), uv = new Float32Array(m.nv * 2), bb = m.bb;
        for (let i = 0; i < m.nv; i++) for (let k = 0; k < 3; k++) {
          pos[i * 3 + k] = bb[k] + (P[(m.vo + i) * 3 + k] + 32768) / 65535 * (bb[3 + k] - bb[k]);
          nor[i * 3 + k] = N[(m.vo + i) * 3 + k] / 127;
        }
        for (let i = 0; i < m.nv * 2; i++) uv[i] = U[m.vo * 2 + i] / 65535;
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(pos, 3));
        g.setAttribute('normal', new T.BufferAttribute(nor, 3));
        g.setAttribute('uv', new T.BufferAttribute(uv, 2));
        g.setIndex(new T.BufferAttribute(I.slice(m.io, m.io + m.ni), 1));
        g.userData.zc = (bb[2] + bb[5]) / 2; g.userData.len = Math.max(bb[5] - bb[2], 1e-3);
        LIB.geo[name] = g;
      }
      LIB.ready = true;
    }).catch(e => console.error('[spots] particle meshes not loaded:', e.message));
  }
  const geoOf = name => LIB.geo[(SFXD.meshes.alias || {})[name] || name] || null;
  function texOf(file) {
    if (!file) return null;
    if (!LIB.tex[file]) {
      const d = SFXD.tex[file];
      const t = new T.TextureLoader().load(URLB(d ? d.src : file));
      t.encoding = T.sRGBEncoding; t.magFilter = T.NearestFilter; t.minFilter = T.NearestFilter; t.generateMipmaps = false; // bảng màu ô vuông: lấy mẫu điểm
      LIB.tex[file] = t;
    }
    return LIB.tex[file];
  }

  // Vật liệu cá / mảnh vụn: nằm dưới mặt nước -> chiếu về mặt nước theo tia nhìn + mờ theo độ sâu (js/water.js), ánh sáng toon của Lit_Shader
  // (DRSky.GLSL_ENV: albedo × (nắng·mây + đèn phụ + ambient + 1 − mask.b), không N·L). FishParticle_Shader: FlapSpeed / FlapAmount.
  function underMat(matDef) {
    const key = 'u:' + matDef.name + ':' + (matDef.tex || '');
    if (LIB.mats[key]) return LIB.mats[key];
    const fish = /FishParticle|BirdParticle/.test(matDef.shader || '');
    const fl = matDef.floats || {};
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: Object.assign({ fogColor: { value: new T.Color() }, fogDensity: { value: 0 }, uMap: { value: texOf(matDef.tex) },
        uFlap: { value: new T.Vector2(fish ? fl.FlapSpeed || 0 : 0, fish ? fl.FlapAmount || 0 : 0) }, uEmis: { value: fl.Emissive ? 1 : 0 } },
      root.DRWater.uniforms, root.DRSky ? DRSky.uniforms : {}),
      vertexShader: root.DRWater.GLSL_WAVE + `
uniform vec2 uFlap;
attribute vec4 aFx;              // x: alpha (cỡ theo đời đã ở ma trận), y: pha vẫy, z: đuôi (zc), w: dài thân
varying vec2 vUv; varying vec3 vW; varying float vDepth; varying float vA;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  // [ĐỀ XUẤT] FishParticle_Shader bị AssetRipper bỏ thân: vẫy đuôi = lệch ngang x theo sin(uDrTime·FlapSpeed·0,25 + pha),
  // biên độ FlapAmount·0,04 m nhân với khoảng cách ra sau tâm thân (đuôi ở −z mesh gốc = +z three.js)
  float tail = clamp((p.z - aFx.z) / max(aFx.w, 0.001) * 2.0, 0.0, 1.0);
  p.x += sin(uGameTime * uFlap.x * 0.25 + aFx.y) * uFlap.y * 0.04 * tail * aFx.w;
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  float h = drWave(wp.xz, drSteepAt(wp.xz) * uWaveSteep).x;
  vDepth = h - wp.y;
  vec3 S = wp.xyz;
  if (vDepth > 0.0) {
    float t = (h - cameraPosition.y) / (wp.y - cameraPosition.y);
    S = cameraPosition + (wp.xyz - cameraPosition) * clamp(t, 0.0, 1.0);
  }
  vec4 mvPosition = viewMatrix * vec4(S, 1.0);
  mvPosition.xyz -= normalize(mvPosition.xyz) * min(0.15, length(mvPosition.xyz) * 0.5); // nhích về camera để qua phép thử chiều sâu của mặt nước
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv; vW = wp.xyz; vA = aFx.x;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform sampler2D uMap; uniform float uEmis; uniform float uShallowA; uniform float uWaterDepth;
varying vec2 vUv; varying vec3 vW; varying float vDepth; varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 alb = texture2D(uMap, vUv).rgb;
  vec3 L = drEnvLights(vW); float mb = drEnvMaskB(vW.xz);
  vec3 col = alb * drEnvLight(vW, 1.0, L, mb) + alb * uEmis * 0.6;
  float kS = exp(-max(vDepth, 0.0) / max(0.05, uWaterDepth));
  float aw = vDepth > 0.0 ? mix(1.0, uShallowA, kS) : 0.0;
  gl_FragColor = vec4(col, clamp((1.0 - aw) * vA, 0.0, 1.0));
  #include <encodings_fragment>
  #include <fog_fragment>
}`
    });
    m.userData.under = true;
    LIB.mats[key] = m;
    return m;
  }
  // FloatingParticle_Shader (DisturbedWaterParticles): cầu thấp đa giác đục, màu hạt; [ĐỀ XUẤT] thân shader bị bỏ khi xuất -> phong phẳng
  // không bóng như vệt bọt BoatTrailParticles của js/vfx.js; phần chìm bị mặt nước (vẽ sau) che như bản gốc
  function floatMat() {
    if (!LIB.mats.float) LIB.mats.float = new T.MeshPhongMaterial({ color: 0xffffff, specular: 0x000000, shininess: 0, flatShading: true });
    return LIB.mats.float;
  }
  // Mỗi cặp (mesh, vật liệu) = một InstancedMesh, tăng dung lượng khi cần
  const _m4 = new T.Matrix4(), _col = new T.Color(), _eu = new T.Euler(), _pv = new T.Matrix4(), _fr = new T.Frustum(), _bs = new T.Sphere();
  function rendererOf(meshName, mat) {
    const key = meshName + '|' + mat.uuid;
    let r = LIB.rend.get(key);
    if (r) return r;
    const g = geoOf(meshName);
    if (!g) return null;
    r = { key, g, mat, mesh: null, cap: 0, n: 0, under: !!mat.userData.under };
    LIB.rend.set(key, r);
    grow(r, 32);
    return r;
  }
  function grow(r, cap) {
    if (r.mesh) { scene.remove(r.mesh); r.mesh.dispose(); }
    const g = r.g.clone();
    if (r.under) { const a = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(T.DynamicDrawUsage); g.setAttribute('aFx', a); }
    const im = new T.InstancedMesh(g, r.mat, cap);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    if (!r.under) { im.setColorAt(0, _col.setRGB(1, 1, 1)); im.instanceColor.setUsage(T.DynamicDrawUsage); }
    im.count = 0; im.frustumCulled = false;
    im.renderOrder = r.under ? 2 : 0;   // cá/mảnh vụn vẽ SAU nước (1); cầu nổi đục vẽ trước, nước che phần chìm
    im.name = 'spotfx:' + r.key;
    scene.add(im);
    r.mesh = im; r.cap = cap;
  }

  // ============================================================================================ hạt: mô phỏng
  const rand = Math.random;
  // một điểm trong hình phát (toạ độ cục bộ Unity của hình), rồi Scale -> Rotation (Euler ZXY, độ) -> Position của ShapeModule
  const _q = new T.Quaternion(), _v = new T.Vector3();
  function shapePoint(sh, flat, out) {
    if (!sh) return out.set(0, 0, 0);
    const thick = flat ? 0.5 : sh.thick;
    const type = flat ? 10 : sh.type;
    const arc = (sh.arc == null ? 360 : sh.arc) * Math.PI / 180;
    if (type === 0 || type === 2) {                          // Sphere / Hemisphere (thể tích theo radiusThickness)
      let x, y, z, l;
      do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-6);
      l = Math.sqrt(l);
      const rr = sh.radius * (1 - thick * (1 - Math.cbrt(rand())));
      out.set(x / l * rr, y / l * rr, (type === 2 ? Math.abs(z) : z) / l * rr);
    } else if (type === 17) {                                // Donut: vòng bán kính radius trong mặt XY, ống donutRadius
      const a = rand() * arc, b = rand() * Math.PI * 2, d = sh.donut * (1 - thick * (1 - Math.sqrt(rand())));
      const rr = sh.radius + d * Math.cos(b);
      out.set(rr * Math.cos(a), rr * Math.sin(a), d * Math.sin(b));
    } else {                                                 // Circle (10) và còn lại: đĩa trong mặt XY
      const a = rand() * arc, rr = sh.radius * (1 - thick * (1 - Math.sqrt(rand())));
      out.set(rr * Math.cos(a), rr * Math.sin(a), 0);
    }
    const s = sh.scale || [1, 1, 1];
    out.set(out.x * s[0], out.y * s[1], out.z * s[2]);
    const rt = sh.rot || [0, 0, 0], D2R = Math.PI / 180;
    unityEuler(rt[0] * D2R, rt[1] * D2R, rt[2] * D2R, _q);
    out.applyQuaternion(_q);
    const p = sh.pos || [0, 0, 0];
    return out.set(out.x + p[0], out.y + p[1], out.z + p[2]);
  }

  // bán kính cầu bao để loại hệ ngoài khung nhìn: cỡ hình phát + độ lệch + 6 m cho cá bơi vòng / trôi [ĐỀ XUẤT]
  function cullROf(def) {
    const sh = def.shape || {}, sc = sh.scale || [1, 1, 1], ps = sh.pos || [0, 0, 0];
    return ((sh.radius || 0) + (sh.donut || 0)) * Math.max(Math.abs(sc[0]), Math.abs(sc[1]), Math.abs(sc[2])) + Math.hypot(ps[0], ps[1], ps[2]) + 6;
  }
  // mọi hệ cùng một hình dạng đối tượng (V8 giữ vòng lặp nóng ở dạng đơn hình)
  function mkSys(def, mat, meshes, sp, o) {
    return { def, mat, meshes, ps: [], acc: 0, t: 0, burst: false, harvest: !!o.harvest, toggle: !!o.toggle, ring: !!o.ring, toggleP: !!o.toggleP, sim: def.sim,
      origin: new T.Vector3(sp.x + def.pos[0], (sp.y || 0) + def.pos[1], sp.z - def.pos[2]), flat: false, lodSize: o.lodSize, lodH: o.lodH, maxP: 0, lag: 0, cullR: cullROf(def) };
  }
  // Dựng trạng thái hạt cho một điểm (gọi khi điểm vào tầm, huỷ khi ra tầm)
  function systemsOf(sp) {
    if (!SFXD) return [];
    const it = firstItem(sp.d), fid = firstItemId(sp.d), si = SFXD.items[fid], pf = si && SFXD.prefabs[si.p];
    if (!pf) return [];
    const out = [];
    const relic = si.p === 'RelicParticles';
    for (const def of pf.sys) {
      const r = def.render;
      if (!r || r.mode !== 4 || !r.meshes.length || relic || !def.on || !r.on) continue;   // cổ vật: cả prefab do DRParticles vẽ
      const mat = r.mats[0];
      if (!mat) continue;
      const fish = !!def.harvest;
      const lod = (pf.lod || []).find(l => l.node === def.node && l.n > 0);
      const sys = mkSys(def, underMat(mat), r.meshes, sp, { harvest: fish, toggle: !!def.toggleObject, lodSize: lod ? lod.size : 0, lodH: lod ? lod.h[0] : 0 });
      if (fish && si.ovr) { sys.origin.y = si.depth; sys.flat = !!si.flat; }         // HarvestableParticles.SetHarvestParticleOverride
      out.push(sys);
    }
    // vòng nước động (HarvestableParticles.Init): ooze nếu món đầu cần dụng cụ nâng cao
    const wname = it && it.requiresAdvancedEquipment && pf.ooze ? pf.ooze : pf.water, W = wname && SFXD.water[wname];
    const rootLod = (pf.lod || []).find(l => l.node === si.p);
    if (W) for (const def of W.sys) {
      const r = def.render;
      if (!r || r.mode !== 4 || !r.meshes.length || !def.on) continue;
      out.push(mkSys(def, floatMat(), r.meshes, sp, { ring: true, toggleP: true, lodSize: rootLod ? rootLod.size : 0, lodH: rootLod ? rootLod.h[0] : 0 }));
    }
    return out;
  }

  function spawn(sys, n) {
    const d = sys.def;
    for (let i = 0; i < n; i++) {
      if (sys.ps.length >= sys.maxP) return;
      const rnd = rand();
      shapePoint(d.shape, sys.flat, _v);
      _v.z = -_v.z;                                                 // Unity -> three.js
      const p = { x: _v.x, y: _v.y, z: _v.z, vx: 0, vy: 0, vz: 0, age: 0, life: mm(d.life, 0, rand()), size0: mm(d.size, 0, rand()), rnd, rnd2: rand(),
        rx: 0, ry: 0, rz: 0, mesh: sys.meshes[Math.floor(rand() * sys.meshes.length)], col: null, ph: rand() * 6.283, kill: Infinity, wx: 0, wy: 0, wz: 0,
        dx: 0, dy: 0, dz: 0, q0: null, rend: null };
      if (!(p.life > 0)) p.life = Infinity;
      if (d.rot3) { p.rx = mm(d.rot3[0], 0, rand()); p.ry = mm(d.rot3[1], 0, rand()); p.rz = mm(d.rot3[2], 0, rand()); }
      else p.ry = mm(d.rot, 0, rand());
      p.q0 = toThree(unityEuler(p.rx, p.ry, p.rz, new T.Quaternion()));   // xoay ban đầu không đổi suốt đời hạt
      const c = d.color || {};
      const c4 = c.col || (c.min ? c.min.map((v, k) => v + (c.max[k] - v) * p.rnd2) : [1, 1, 1, 1]);
      p.col = [s2l(c4[0]), s2l(c4[1]), s2l(c4[2])];
      if (sys.sim === 1) { p.x += sys.origin.x; p.y += sys.origin.y; p.z += sys.origin.z; }   // mô phỏng trong không gian thế giới
      sys.ps.push(p);
    }
  }

  const G = 9.81;
  function stepSys(sys, dt, active) {
    const d = sys.def;
    sys.t += dt;
    // phát: burst lúc đầu vòng + rateOverTime, chặn ở maxP
    const emit = active && !(sys.toggleP && !active);
    if (emit) {
      if (!sys.burst) { sys.burst = true; for (const b of d.bursts || []) spawn(sys, Math.round(mm(b.n, 0, rand()))); }
      sys.acc += mm(d.rate, 0, rand()) * dt;
      const n = Math.floor(sys.acc);
      if (n > 0) { sys.acc -= n; if (sys.ps.length < sys.maxP) spawn(sys, n); }
      if (sys.ps.length >= sys.maxP) sys.acc = Math.min(sys.acc, 1);
    }
    const vel = d.vel, g = mm(d.grav, 0, 0) * G, lim = d.limit;
    for (let i = sys.ps.length - 1; i >= 0; i--) {
      const p = sys.ps[i];
      p.age += dt;
      if (p.age >= p.life || p.age >= p.kill) { sys.ps.splice(i, 1); continue; }
      const t = p.life === Infinity ? 0 : p.age / p.life;
      p.vy -= g * dt;                                              // trọng lực (thế giới)
      if (lim) {                                                    // ClampVelocityModule: kéo tốc độ vượt ngưỡng về ngưỡng theo dampen [ĐỀ XUẤT: quy về 30 khung/giây]
        const mag = mm(lim.mag, t, p.rnd), sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        if (sp > mag) { const k = 1 - (1 - Math.pow(1 - lim.dampen, dt * 30)) * (sp - mag) / sp; p.vx *= k; p.vy *= k; p.vz *= k; }
      }
      let lx = 0, ly = 0, lz = 0, ox = p.x, oz = p.z;
      if (vel) {
        lx = mm(vel.x, t, p.rnd); ly = mm(vel.y, t, p.rnd); lz = -mm(vel.z, t, p.rnd);
        const w = mm(vel.orb[1], t, p.rnd);                       // orbitalY quanh trục y của hệ (Unity +ω = three.js −ω)
        if (w) {
          const cx = sys.sim === 1 ? sys.origin.x : 0, cz = sys.sim === 1 ? sys.origin.z : 0;
          const a = -w * dt, c = Math.cos(a), s = Math.sin(a), rx = p.x - cx, rz = p.z - cz;
          p.x = cx + rx * c + rz * s; p.z = cz - rx * s + rz * c;
        }
      }
      p.x += (p.vx + lx) * dt; p.y += (p.vy + ly) * dt; p.z += (p.vz + lz) * dt;
      p.dx = (p.x - ox) / Math.max(dt, 1e-4); p.dz = (p.z - oz) / Math.max(dt, 1e-4); p.dy = p.vy + ly;
      if (d.rotOL != null) {                                        // RotationOverLifetime: tốc độ góc (rad/s), Unity -> three đổi dấu x, y
        if (Array.isArray(d.rotOL) && d.rotOL.length === 3 && typeof d.rotOL[0] === 'object') {
          p.wx -= mm(d.rotOL[0], t, p.rnd) * dt; p.wy -= mm(d.rotOL[1], t, p.rnd) * dt; p.wz += mm(d.rotOL[2], t, p.rnd) * dt;
        } else p.wy -= mm(d.rotOL, t, p.rnd) * dt;
      }
    }
  }

  // HarvestableParticles.ParticlesAmount = floor(GetStockCount(false)): 0 khi giờ này không có món; maxP = pps × amount
  function setAmount(em, amount) {
    for (const sys of em.sys) {
      if (sys.harvest) {
        const num = em.pps * amount;
        sys.maxP = num === 0 && amount > 0 ? 1 : num;
        if (sys.ps.length > sys.maxP) for (let i = sys.maxP; i < sys.ps.length; i++) sys.ps[i].kill = Math.min(sys.ps[i].kill, sys.ps[i].age + 0.2);
      } else sys.maxP = sys.def.maxP;
    }
    em.amount = amount;
  }

  function makeEmitter(sp) {
    const fid = firstItemId(sp.d), si = SFXD && SFXD.items[fid], pf = si && SFXD.prefabs[si.p];
    const em = { sp, sys: systemsOf(sp), pps: pf ? pf.pps : 1, amount: -1, relic: null, relicName: si && si.p === 'RelicParticles' ? 'RelicParticles' : null };
    const amount = amountOf(sp);
    setAmount(em, amount);
    // prewarm (looping + prewarm): mô phỏng trước một vòng lengthInSec để bầy cá đã ở trạng thái ổn định khi hiện ra
    for (const sys of em.sys) if (sys.def.prewarm && sys.def.loop) {
      const tot = Math.min(sys.def.dur || 5, 30), st = 0.1;
      for (let t = 0; t < tot; t += st) stepSys(sys, st, amount > 0);
    }
    return em;
  }
  function amountOf(sp) {
    const r = rec(sp), list = R.spotList(sp.d, isDay()) || [];
    return list.length ? Math.max(0, Math.floor(r.stock)) : 0;          // kho âm (lùi giờ bằng DR_DEBUG.setTime -> regenStock dt < 0) không được thành maxP âm
  }
  function killEmitter(em) {
    if (em.relic) { try { em.relic.stop(); } catch (e) { /* hệ hạt dùng chung là phần phụ */ } em.relic = null; }
  }

  const EMIT = new Map();      // id điểm -> emitter
  let emitT = 0;
  const _qa = new T.Quaternion(), _qb = new T.Quaternion(), _sc = new T.Vector3(), _pos = new T.Vector3(), _f = new T.Vector3(), _x = new T.Vector3(), _y = new T.Vector3(), _mb = new T.Matrix4();
  function updateParticles(dt, cam) {
    if (!SFXD || !SFXD.meshes) return;
    const D = root.DR;
    // chọn điểm trong tầm vẽ (LOD xa nhất), làm mới 4 lần/giây
    emitT -= dt;
    if (emitT <= 0) {
      emitT = 0.25;
      const cx = cam ? cam.position.x : D.s.boat.x, cz = cam ? cam.position.z : D.s.boat.z;
      const want = Sp.list.map(sp => ({ sp, d: Math.hypot(sp.x - cx, sp.z - cz) })).filter(o => o.d < SHOW_R).sort((a, b) => a.d - b.d).slice(0, MAX_EMIT);
      const keep = new Set(want.map(o => o.sp.id));
      for (const [id, em] of EMIT) if (!keep.has(id)) { killEmitter(em); EMIT.delete(id); }
      for (const o of want) if (!EMIT.has(o.sp.id)) EMIT.set(o.sp.id, makeEmitter(o.sp));
      for (const em of EMIT.values()) {
        const a = amountOf(em.sp);
        if (a !== em.amount) setAmount(em, a);
        // RelicParticles: hệ hạt dùng chung, bật khi điểm còn hàng, tắt khi cạn (toggleObjects của prefab)
        if (em.relicName && a > 0 && !em.relic && root.DRParticles) {
          em.relic = DRParticles.spawn('RelicParticles', { pos: [em.sp.x, em.sp.y || 0, em.sp.z], loop: true });
        } else if (em.relic && a <= 0) { try { em.relic.stop(); } catch (e) { /* hệ hạt dùng chung là phần phụ */ } em.relic = null; }
      }
    }
    for (const r of LIB.rend.values()) r.n = 0;
    const fovK = cam ? 2 * Math.tan(T.MathUtils.degToRad(cam.fov / 2)) : 0.728;
    if (cam) { cam.updateMatrixWorld(); _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pv); }
    for (const em of EMIT.values()) {
      const active = em.amount > 0;
      for (const sys of em.sys) {
        if (sys.toggle && !active) { sys.ps.length = 0; continue; }  // toggleObjects tắt hẳn GameObject
        // LODGroup: hiện khi cỡ/(2·tan(FOV/2)·khoảng cách) ≥ screenRelativeHeight (lodBias 1)
        // Renderer ngoài khung nhìn cũng không vẽ (Unity tự loại)
        const hidden = !!cam && ((sys.lodH && sys.lodSize / (fovK * Math.max(cam.position.distanceTo(sys.origin), 0.01)) < sys.lodH) ||
          !_fr.intersectsSphere(_bs.set(sys.origin, sys.cullR)));
        if (hidden) {
          // [ĐỀ XUẤT] hệ bị ẩn vẫn mô phỏng nhưng gộp bước 0,25 s (prewarm cũng bước 0,1 s): không ai thấy nên khỏi bước từng khung
          sys.lag += dt;
          if (sys.lag >= 0.25) { stepSys(sys, sys.lag, active); sys.lag = 0; }
          continue;
        }
        if (sys.lag) { stepSys(sys, sys.lag, active); sys.lag = 0; }
        stepSys(sys, dt, active);
        if (!LIB.ready || !sys.ps.length) continue;
        drawSys(sys);
      }
    }
    for (const r of LIB.rend.values()) {
      if (!r.mesh) continue;
      r.mesh.count = r.n;
      r.mesh.visible = r.n > 0;                                         // lưới rỗng khỏi vào danh sách vẽ
      if (r.n) {
        const im = r.mesh.instanceMatrix, ex = r.under ? r.mesh.geometry.attributes.aFx : r.mesh.instanceColor;
        im.updateRange.offset = 0; im.updateRange.count = r.n * 16; im.needsUpdate = true;   // chỉ đẩy phần đang dùng lên GPU
        ex.updateRange.offset = 0; ex.updateRange.count = r.n * ex.itemSize; ex.needsUpdate = true;
      }
    }
  }
  function drawSys(sys) {
    const d = sys.def, align = d.render.align;
    for (const p of sys.ps) {
      const r = p.rend || (p.rend = rendererOf(p.mesh, sys.mat));
      if (!r) continue;
      if (r.n >= r.cap) grow(r, r.cap * 2);
      const t = p.life === Infinity ? 0 : p.age / p.life;
      const size = p.size0 * (d.sizeOL != null ? mm(d.sizeOL, t, p.rnd) : 1);
      if (sys.sim === 1) _pos.set(p.x, p.y, p.z); else _pos.set(sys.origin.x + p.x, sys.origin.y + p.y, sys.origin.z + p.z);
      if (align === 4 && (p.dx || p.dy || p.dz)) {
        // Velocity: trục tới (+z Unity của mesh = −z three.js) theo vận tốc
        _f.set(-p.dx, -p.dy, -p.dz).normalize();
        _x.crossVectors(AY, _f); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); _x.normalize();
        _y.crossVectors(_f, _x);
        _mb.makeBasis(_x, _y, _f);
        _qa.setFromRotationMatrix(_mb);
        if (p.wy) _qa.multiply(_qb.setFromAxisAngle(AY, p.wy));
      } else {
        _qa.copy(p.q0);
        if (p.wx || p.wy || p.wz) _qa.multiply(_qb.setFromEuler(_eu.set(p.wx, p.wy, p.wz)));
      }
      _sc.setScalar(Math.max(size, 1e-4));
      _m4.compose(_pos, _qa, _sc);
      r.mesh.setMatrixAt(r.n, _m4);
      if (r.under) {
        const g = r.g.userData, A = r.mesh.geometry.attributes.aFx.array, o = r.n * 4;
        A[o] = d.colOL ? gradA(d.colOL.grad, t) : 1; A[o + 1] = p.ph; A[o + 2] = g.zc; A[o + 3] = g.len;
      } else r.mesh.setColorAt(r.n, _col.setRGB(p.col[0], p.col[1], p.col[2]));
      r.n++;
    }
  }

  // ============================================================================================ xoáy điểm đặc biệt (phẳng trên mặt nước)
  function specialMesh() {
    const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: Object.assign({ fogColor: { value: new T.Color() }, fogDensity: { value: 0 }, uNightK: { value: 0 }, uT: { value: 0 } }, root.DRWater.uniforms),
      vertexShader: root.DRWater.GLSL_WAVE + `
attribute vec3 aInfo; attribute float aSize;
varying vec2 vUv; varying vec3 vInfo; varying float vSizeM;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  wp.y = drWave(wp.xz, drSteepAt(wp.xz) * uWaveSteep).x + 0.05;
  vUv = uv; vInfo = aInfo; vSizeM = aSize;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uT; uniform float uNightK;
varying vec2 vUv; varying vec3 vInfo; varying float vSizeM;
#include <common>
#include <fog_pars_fragment>
float hs(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 m = (vUv - 0.5) * vSizeM;
  float rr = length(m);
  if (rr > vSizeM * 0.5) discard;
  float seed = vInfo.y * 97.0, fade = vInfo.z, t = uT;
  // SpecialFishParticles: Swirls (#00f8ff, alpha 0,15, đời 7 s, cỡ 2-3) + hạt sáng quay quanh (đời 1-2 s, bán kính 0,53, orbital ±5)
  float sw = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float cyc = floor(t / 7.0 + fi * 0.5);
    float ph = fract(t / 7.0 + fi * 0.5);
    float env = smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.86, 1.0, ph));
    float sz = mix(2.0, 3.0, hs(vec2(cyc, fi + seed)));
    float rn = rr / (sz * ph + 0.3);
    float ang = atan(m.y, m.x);
    float pat = 0.5 + 0.5 * sin(ang * 3.0 + rn * 6.0 - t * (0.8 + fi * 0.5) + fi * 2.0);
    sw += env * pat * (1.0 - smoothstep(0.55, 1.0, rn));
  }
  float sa = clamp(sw, 0.0, 1.0) * 0.55;
  float sp = 0.0;
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    float lt = fract(t / mix(1.0, 2.0, hs(vec2(fi, seed + 21.0))) + hs(vec2(fi, seed + 5.0)));
    float ang = hs(vec2(fi, seed + 2.0)) * 6.28 + t * mix(-5.0, 5.0, hs(vec2(fi, seed + 4.0))) / (0.53 + 1.0);
    float rad = 0.53 + 0.2 * (hs(vec2(fi, seed + 8.0)) - 0.5) + 0.35 * lt;
    float env = lt < 0.1 ? lt / 0.1 * 0.61 : lt < 0.32 ? mix(0.61, 1.0, (lt - 0.1) / 0.22) : lt < 0.68 ? mix(1.0, 0.61, (lt - 0.32) / 0.36) : mix(0.61, 0.0, (lt - 0.68) / 0.32);
    float d = length(m - rad * vec2(cos(ang), sin(ang)));
    sp += env * (1.0 - smoothstep(0.0, mix(0.05, 0.3, hs(vec2(fi, seed + 6.0))) * 0.9, d));
  }
  vec3 col = mix(vec3(0.0, 0.97, 1.0), vec3(1.0), clamp(sp, 0.0, 1.0));
  float a = clamp(sa + sp * 0.8, 0.0, 1.0) * fade;
  col *= mix(1.0, 0.45, uNightK);
  gl_FragColor = vec4(col, a);
  #include <encodings_fragment>
  #include <fog_fragment>
}`
    });
    const im = new T.InstancedMesh(g, m, MAX_SHOWN);
    const att = (n, k) => im.geometry.setAttribute(n, new T.InstancedBufferAttribute(new Float32Array(MAX_SHOWN * k), k));
    att('aInfo', 3); att('aSize', 1);
    im.count = 0; im.frustumCulled = false; im.renderOrder = 2;
    return im;
  }

  // ---------------------------------------------------------------------------------------------- kho / trạng thái
  function rec(sp) {
    const S = root.DR.s;
    let r = S.spots[sp.id];
    if (!r) r = S.spots[sp.id] = { stock: sp.d.startStock, lastUpdate: S.time };
    return r;
  }
  function regen(sp) {
    const r = rec(sp), tmp = { stock: r.stock, maxStock: sp.d.maxStock, doesRestock: sp.d.doesRestock, lastUpdate: r.lastUpdate };
    R.regenStock(CFG, tmp, root.DR.s.time);
    r.stock = tmp.stock; r.lastUpdate = tmp.lastUpdate;
    return r;
  }
  // TimeController.IsDaytime với dawnTime/duskTime của cảnh
  function isDay() { const tc = root.DRWorld.data.scene.logic.TimeController[0].fields; return R.isDay(root.DR.s.time, tc.dawnTime, tc.duskTime); }
  // HarvestPOIDataModel.IsHarvestable: chỉ giờ + kho quyết định có vào được không ('ok' = VALID)
  function queryOf(sp, r) {
    const list = R.spotList(sp.d, isDay()) || [];
    if (sp.d.usesTimeSpecificStock && !list.length) return 'wrong_time';
    if (r.stock < 1) return 'no_stock';
    return 'ok';
  }
  // HarvestMinigameView.RefreshHarvestTarget: PlayerStats.GetHasEquipmentForHarvestType — câu trên ô hỏng VẪN tính (PlayerStats.cs:240-252,
  // CalculateRodStats không loại ô hỏng khi gom HarvestableTypes); HasUndamagedEquipment chỉ xét cần câu không nằm trên ô hỏng, chỉ cho cá
  function gearOf(item) {
    const D = root.DR, inv = D.grid('INVENTORY'), Gd = root.DRGrid;
    if (!inv || !item) return { has: false, undamaged: false };
    const type = item.harvestableType, adv = !!item.requiresAdvancedEquipment;
    let has = false, und = false;
    for (const inst of inv.items) {
      const d = ITEMS[inst.id];
      if (!d || !(Gd.typeOf(d) & Gd.TYPE.EQUIPMENT)) continue;
      const sub = Gd.subOf(d);
      if (!(sub & (Gd.SUB.ROD | Gd.SUB.DREDGE))) continue;
      const types = d.harvestableTypes || [];
      if (!types.includes(type)) continue;
      if (!adv || ((sub & Gd.SUB.ROD) && d.isAdvancedEquipment)) has = true;   // AdvancedHarvestableTypes chỉ gom từ cần câu
      if ((sub & Gd.SUB.ROD) && !Gd.onDamaged(inv, inst)) und = true;
    }
    const isFish = (Gd.subOf(item) & Gd.SUB.FISH) !== 0;
    return { has, undamaged: isFish ? und : true };
  }
  function statusOf(sp, r) { return queryOf(sp, r); }
  // HarvestPOIDataModel.RollForSpecial: không bao giờ cho điểm nạo vét; cần CanCatchAberrations; xác suất ngày/đêm (hoặc ghi đè)
  // chỉ khi món đầu của danh sách là cá có dị biến. Gọi lại khi đổi ngày/đêm hoặc sau 0,5 ngày (HarvestPOI.Update).
  function rollSpecial(sp, day) {
    const D = root.DR.s, d = sp.d;
    if (sp.dredge || !D.vars['can-catch-aberrations']) return false;
    const list = day ? d.items : (d.usesTimeSpecificStock ? d.nightItems : d.items), it = ITEMS[(list || [])[0]];
    if (!it || !it.aberrations || !it.aberrations.length) return false;
    const p = day ? (d.overrideDefaultDaySpecialChance ? d.overriddenDaytimeSpecialChance : CFG.specialSpotChanceDay)
      : (d.overrideDefaultNightSpecialChance ? d.overriddenNighttimeSpecialChance : CFG.specialSpotChanceNight);
    return Math.random() < p;
  }
  function tickSpecial(sp, day, now) {
    if (sp.spDay === null || day !== sp.spDay || now > sp.spT + 0.5) {
      sp.special = rollSpecial(sp, day); sp.spDay = day; sp.spT = now;
    }
  }

  // móc kiểm thử: hạt của một điểm — test/dredge-fishing.js
  Sp._perf = () => { let ps = 0, sys = 0, drawn = 0, rend = 0, on = 0; for (const em of EMIT.values()) for (const y of em.sys) { sys++; ps += y.ps.length; }
    for (const r of LIB.rend.values()) { rend++; drawn += r.n; if (r.n) on++; } return { emit: EMIT.size, sys, ps, drawn, rend, on }; };
  Sp._fx = id => {
    const sp = Sp.byId[id], em = EMIT.get(String(id));
    if (!sp || !em) return null;
    const fid = firstItemId(sp.d), si = SFXD.items[fid], pf = si && SFXD.prefabs[si.p];
    const h = em.sys.find(s => s.harvest), ring = em.sys.find(s => s.ring), deb = em.sys.filter(s => !s.harvest && !s.ring);
    return { prefab: si && si.p, pps: pf && pf.pps, n: h ? h.ps.length : 0, maxP: h ? h.maxP : 0, ring: ring ? ring.ps.length : 0, debris: deb.reduce((a, s) => a + s.ps.length, 0),
      special: sp.special ? 1 : 0, stock: rec(sp).stock, amount: em.amount, first: firstId(sp.d, isDay()), relic: !!em.relic, meshes: LIB.ready };
  };
  // từng hạt cá của điểm: tuổi/đời, y thế giới, độ cao mặt nước tại đó, độ sâu (dương = dưới mặt nước)
  Sp._fish = id => {
    const em = EMIT.get(String(id)), h = em && em.sys.find(s => s.harvest);
    if (!h) return null;
    return h.ps.map(p => {
      const x = h.origin.x + p.x, y = h.origin.y + p.y, z = h.origin.z + p.z;
      const s = root.DRWater.wave(x, z, Math.min(1, root.DRWorld.steep01(x, z) * 10) * root.DRWater.uniforms.uWaveSteep.value)[0];   // drSteepAt của shader
      return { t: p.life === Infinity ? 0 : p.age / p.life, y, surface: s, depth: s - y, vy: p.dy };
    });
  };
  const PCAT = { FISH_SMALL: 'small', FISH_MEDIUM: 'medium', FISH_LARGE: 'large', TRINKET: 'trinket', MATERIAL: 'material', RELIC: 'relic' };
  const _m = new T.Matrix4();
  function update(dt, x, z) {
    const D = root.DR;
    if (!D.s || !mesh) return;
    tAnim += dt; mesh.material.uniforms.uT.value = tAnim;
    // HarvestPOI.cs: hồi kho mỗi giây thật
    regenT += dt;
    if (regenT >= 1) {
      regenT = 0;
      const day = isDay();
      for (const sp of Sp.list) if (Math.abs(sp.x - x) < 600 && Math.abs(sp.z - z) < 600) { regen(sp); tickSpecial(sp, day, D.s.time); }
    }
    showT += dt;
    if (showT >= 0.25) {
      showT = 0;
      const vis = Sp.list.filter(sp => sp.special && rec(sp).stock >= 1).map(sp => ({ sp, d: Math.hypot(sp.x - x, sp.z - z) })).filter(o => o.d < SHOW_R).sort((a, b) => a.d - b.d).slice(0, MAX_SHOWN);
      const G2 = mesh.geometry.attributes;
      mesh.count = vis.length;
      vis.forEach((o, i) => {
        const sp = o.sp, sc = Math.max((sp.r + 1) * 2, 7);
        _m.makeScale(sc, 1, sc).setPosition(sp.x, 0, sp.z);
        mesh.setMatrixAt(i, _m);
        G2.aInfo.array.set([sp.dredge ? 1 : 0, (Number(sp.id) % 97) / 97, 1], i * 3);
        G2.aSize.array[i] = sc;
      });
      mesh.instanceMatrix.needsUpdate = true; G2.aInfo.needsUpdate = true; G2.aSize.needsUpdate = true;
    }
    mesh.material.uniforms.uNightK.value = root.DRSky ? DRSky.env.night : 0;
    updateParticles(dt, root.DRCamera && DRCamera.cam);
    // điểm gần nhất trong tầm POIInteractionListener (mọi HarvestPOI, kể cả nạo vét khi chưa có cần cẩu: panel tự báo thiếu dụng cụ)
    near = null;
    if (D.mode === 'sail' || D.mode === 'harvest') {
      let best = 1e9;
      for (const sp of Sp.list) {
        const d = Math.hypot(sp.x - x, sp.z - z);
        if (d > sp.r + LISTENER_R || d >= best) continue;
        best = d; near = sp;
      }
    }
    if (near) {
      const r = regen(near), g = gearOf(ITEMS[firstId(near.d, isDay())]);
      D.view.nearSpot = { id: near.id, name: near.dredge ? 'Bóng hình dưới đáy' : 'Vùng nước động', status: statusOf(near, r), stock: r.stock, maxStock: near.d.maxStock,
        kind: near.dredge ? 'dredge' : 'fish', special: near.special, equipment: g.has ? (g.undamaged ? 'ok' : 'broken') : 'missing' };
    } else D.view.nearSpot = null;
    proximitySfx(dt, x, z);
  }

  // HarvestPOIHandler.PlayRandomHarvestProximityClip: chỉ khi IsHarvestable == VALID; sfxClips[loại].PickRandom(), chờ audioClip.length +
  // Random.Range(1, 2,5) rồi phát tiếp; tên clip + độ dài lấy từ HarvestPOIHandler.sfxClips (PlayerContainer.prefab, tools/harvest_ui.py)
  function proximitySfx(dt, x, z) {
    const D = root.DR;
    if (!root.DRAudio || D.mode !== 'sail' || !near) { sfxFor = null; return; }
    const r = rec(near);
    if (queryOf(near, r) !== 'ok') { sfxFor = null; return; }
    if (sfxFor !== near.id) { sfxFor = near.id; sfxT = 0; }
    sfxT -= dt;
    if (sfxT > 0) return;
    const it = ITEMS[firstId(near.d, isDay())], cat = it && it.harvestPOICategory, list = SFXD && SFXD.poiSfx && SFXD.poiSfx[cat];
    if (!list || !list.length) { sfxT = 5; return; }
    const clip = list[Math.floor(Math.random() * list.length)], dist = Math.hypot(near.x - x, near.z - z);
    const vol = Math.max(0, Math.min(1, 1 - (dist - 2) / 6));       // AudioRolloffMode.Linear, min 2 m, max 8 m
    DRAudio.play(clip.n, vol);
    sfxT = (clip.dur || 2) + 1 + Math.random() * 1.5;
    Sp.lastProx = { name: clip.n, cat: PCAT[cat] || cat, gap: sfxT - (clip.dur || 2) };
  }

  // ---------------------------------------------------------------------------------------------- câu
  function pickNext(cur) {                                              // HarvestPOI.Harvestable.GetNextHarvestableItem
    const day = isDay();
    const itemId = R.pickWeighted(R.spotList(cur.sp.d, day), ITEMS);
    cur.itemId = itemId; cur.item = ITEMS[itemId]; cur.dredge = cur.item.harvestableType === 'DREDGE';
  }
  // HarvestMinigameView.RefreshHarvestTarget: trạng thái panel. Thiếu dụng cụ -> 'no_equipment' (chuỗi gốc luôn là bản ".dredge" vì mã gốc
  // gán .fish rồi ghi đè ngay bằng .dredge, HarvestMinigameView.cs:503-504); có dụng cụ nhưng chỉ trên ô hỏng -> broken (không mục tiêu)
  function viewInfo(cur) {
    const sp = cur.sp, r = regen(sp), first = firstItem(sp.d), item = cur.item, q = queryOf(sp, r), g = gearOf(item || first);
    return {
      kind: sp.dredge ? 'dredge' : 'fish', stock: r.stock, maxStock: sp.d.maxStock, status: q !== 'ok' ? q : g.has ? 'ok' : 'no_equipment',
      harvestType: item ? item.harvestableType : first.harvestableType, advanced: !!(first && first.requiresAdvancedEquipment), special: sp.special,
      broken: g.has && !g.undamaged, equipShiny: !g.has
    };
  }
  // HarvestMinigameView.StartGame: dấu cúp (không có mồi ở pha 1)
  function rollTrophy() {
    const v = root.DR.s.vars, cur = Sp.cur;
    if (!cur || cur.dredge) return false;
    if ((v['rod-fish-caught'] || 0) > 0 && (v['fish-before-next-trophy-notch'] || 0) <= 0 && Math.random() < CFG.trophyNotchSpawnChance) {
      v['fish-before-next-trophy-notch'] = CFG.fishToCatchBetweenTrophyNotches;
      return true;
    }
    return false;
  }
  function viewOpts(cur) {
    const st = root.DRBoat.stats, dredge = cur.dredge;
    const cfg = (dredge ? CFG.DredgingDifficultyConfigs : CFG.FishingDifficultyConfigs)[cur.item.harvestDifficulty];
    return { type: cur.item.harvestMinigameType, cfg, speed: dredge ? st.dredging : st.fishing, itemId: cur.itemId, spotId: cur.sp.id, info: viewInfo(cur), rollTrophy, onDone: finish };
  }

  // Harvester.OnEnable -> UI.ToggleInventorySolo(true): khoang (chỉ tab INVENTORY) trượt vào bên phải cạnh bảng câu, không che màn
  function openHold(cur) {
    if (!root.DRCargo || typeof DRCargo.open !== 'function') return;
    cur.cargo = DRCargo.open({ right: { tabs: ['INVENTORY'] }, docked: true, onClose: () => { if (Sp.cur === cur) { cur.cargo = null; cur.tray = false; } } });
  }
  // HarvestMinigameView.OnProgressComplete: khay mở khi đã xong storageTrayUnlockQuest (world_data.js: Quest_Intro), một lần mỗi phiên
  const TRAY_QUEST = (((root.DR_WORLD || {}).HarvestMinigameView || {}).HarvestMinigameView || {}).storageTrayUnlockQuest || null;
  const trayUnlocked = () => !!(TRAY_QUEST && root.DRQuests && DRQuests.state(TRAY_QUEST) === 'COMPLETED');

  function interact() {
    const D = root.DR, ns = D.view.nearSpot;
    if (!near || !ns || ns.status !== 'ok' || Sp.cur) return false;   // PlayerPOIInteraction: chỉ HarvestPOI VALID mới nhận lệnh
    const sp = near;
    if (!D.setMode('harvest', { spotId: sp.id })) return false;
    root.DRBoat.stop();
    Sp.cur = { sp, itemId: null, item: null, dredge: false, cargo: null, tray: false, held: null };
    pickNext(Sp.cur);
    D.emit('harvestStart', Sp.cur);                                     // phát khi vào điểm: {sp, itemId, item}
    DRMinigame.open(viewOpts(Sp.cur));                                  // giờ thế giới chỉ trôi khi minigame chạy (DRMinigame.isOpen), không phải lúc chờ bắt đầu
    openHold(Sp.cur);
    return true;
  }

  // Harvester.OnLeaveActionPressed: chỉ rời được khi con trỏ không cầm gì. Đổi chế độ thì khoang docked tự đóng (cargo.js nghe 'mode'),
  // khay chạy ResetStorageTray (đồ còn lại bị huỷ, tính là vứt).
  function leave(caughtAny) {
    const D = root.DR;
    Sp.cur = null; Sp.fishing = false;
    if (D.mode === 'harvest') D.setMode('sail');
    D.emit('harvestEnd', { caught: !!caughtAny, made: null });         // phát khi rời điểm
  }

  // Kết quả của một phiên: {caught, trophy, aborted}. aborted = rời màn (Esc / nút Rời) -> về lái thuyền.
  function finish(result) {
    const D = root.DR, cur = Sp.cur;
    if (!cur) return;
    const caught = result && typeof result === 'object' ? !!(result.caught != null ? result.caught : (result.success != null ? result.success : result.ok)) : !!result;
    const trophyHit = !!(result && typeof result === 'object' && (result.trophy || result.trophyHit));
    if (!caught) { leave(false); return; }
    if (!cur.tray && cur.cargo && trayUnlocked()) { cur.tray = true; cur.cargo.setLeft({ kind: 'tray' }); }   // ShowStorageTray trước SpawnItem
    const made = createCatch(cur, trophyHit);
    D.emit('harvestEnd', { caught, made });                             // phát khi xong một con: {caught, made}
    const again = () => {                                               // HarvestMinigameView.RefreshHarvestTarget sau OnItemPlaceComplete / OnItemRemovedFromCursor
      cur.held = null;
      if (Sp.cur !== cur || D.mode !== 'harvest') return;
      pickNext(cur);
      if (root.DRMinigame && DRMinigame.isShown()) DRMinigame.refresh(viewOpts(cur)); else DRMinigame.open(viewOpts(cur));
    };
    // gọi thẳng không qua minigame (DR_DEBUG.catchNow của test/dredge-story.js): bỏ qua cả con trỏ, món vào khoang như móc gỡ lỗi cũ
    const viaMinigame = !!(root.DRMinigame && DRMinigame.phase && DRMinigame.phase() === 'held');
    if (!viaMinigame) {
      const extra = Object.assign({}, made.holding); delete extra.id;
      if (D.give(made.id, extra)) { again(); return; }
    }
    // GridManager.AddItemOfTypeToCursor(item, BEING_HARVESTED): món nằm trên con trỏ, CHƯA vào khoang; người chơi đặt hoặc giữ Z để vứt
    if (!cur.cargo) openHold(cur);
    const h = { inst: made.holding, src: 'harvest', onPlaced: () => again(), onDiscarded: () => again() };
    if (cur.cargo && cur.cargo.hold && cur.cargo.hold(h)) cur.held = made.holding;
    else { console.error('[spots] catch not held: cargo hold unavailable'); again(); }
  }

  // ItemManager.CreateFishItem (ItemManager.cs:250-335) + HarvestMinigameView.cs:372-391
  function createCatch(cur, trophyHit) {
    const D = root.DR, S = D.s, v = S.vars, st = root.DRBoat.stats, day = isDay();
    let id = cur.itemId, item = cur.item, aberrant = false;
    const sp = cur.sp, r0 = rec(sp), special = !!sp.special;
    const isFish = (root.DRGrid.subOf(item) & root.DRGrid.SUB.FISH) !== 0;
    if (isFish && v['can-catch-aberrations'] && item.aberrations && item.aberrations.length && (S.caught[id] || 0) > 0) {
      const force = special && r0.stock < 2;                            // FishAberrationGenerationMode.FORCE
      const p = R.aberrationChance(CFG, day, v['aberration-spawn-modifier'] || 0, st.aberrationBonus || 0, special, !!v['has-caught-aberration-at-special-spot']);
      if (force || Math.random() < p) {
        const ok = item.aberrations.filter(a => ITEMS[a] && (ITEMS[a].minWorldPhaseRequired || 0) <= S.worldPhase);
        const fresh = ok.filter(a => !(S.caught[a] > 0));
        const pool = fresh.length ? fresh : ok;
        if (pool.length) {
          id = pool[Math.floor(Math.random() * pool.length)]; item = ITEMS[id]; aberrant = true;
          v['aberration-spawn-modifier'] = 0; v['num-aberrations-caught'] = (v['num-aberrations-caught'] || 0) + 1;
          if (special) v['has-caught-aberration-at-special-spot'] = true;
          sp.special = false;                                           // IsAberration -> SetIsCurrentlySpecial(false)
        }
      } else v['aberration-spawn-modifier'] = (v['aberration-spawn-modifier'] || 0) + CFG.spawnChanceIncreasePerNonAberrationCaught;
    }
    let extra = null;
    if (isFish) extra = { size: R.rollSize(CFG, trophyHit), fresh: CFG.maxFreshness };
    else if (item.canBeReplacedWithResearchItem && ITEMS['research-item'] && Math.random() < CFG.researchItemDredgeSpotSpawnChance) {
      id = 'research-item'; item = ITEMS[id];
    }
    // BannersUI.OnItemSeen xét GetCaughtCountById(id) == 0 TRƯỚC IncrementCaughtCounterById (ItemManager.SetItemSeen) -> loài mới
    const wasNew = !(S.caught[id] > 0);
    // POIDataModel: kho −1 cho mỗi lần thu hoạch (chưa có nghiên cứu Fishing Sustain ở pha 1)
    // HarvestMinigameView.cs:377: món affectedByFishingSustain không trừ kho khi Random.value <= ResearchedFishingSustainModifier (sách đọc xong)
    const keepStock = item.affectedByFishingSustain && !(Math.random() > (root.DRBooks ? DRBooks.mod('FISHING_SUSTAIN') : 0));
    if (id !== 'research-item' && !keepStock) { const r = rec(sp); r.stock = Math.max(0, r.stock - 1); }
    if (isFish) {
      S.caught[id] = (S.caught[id] || 0) + 1;
      if (!cur.dredge) {
        v['rod-fish-caught'] = (v['rod-fish-caught'] || 0) + 1;
        v['fish-before-next-trophy-notch'] = (v['fish-before-next-trophy-notch'] || 0) - 1;
      }
    }
    const inst = Object.assign({ id }, extra || {});                    // instance chưa thuộc lưới nào (BEING_HARVESTED)
    const cm = isFish && extra ? Math.round(R.lerp(item.minSizeCentimeters || 0, item.maxSizeCentimeters || 0, extra.size)) : 0;
    // trophy theo ItemManager.SetItemSeen: size ≥ TrophyMaxSize -> TriggerTrophyFishCaught
    const trophy = !!(isFish && extra && extra.size >= CFG.trophyMaxSize);
    const out = { id, item, inst, aberrant, trophy: trophyHit, trophySize: trophy, size: extra ? extra.size : null, isNew: wasNew && isFish, cm, placed: false,
      relic: String(item.subtype) === 'RELIC', holding: inst };
    D.emit('catch', out);                                               // phát khi có món mới (banner, âm thanh, nhiệm vụ nghe)
    return out;
  }

  function nearest(fn, x, z) {
    let best = null, bd = 1e9;
    for (const sp of Sp.list) {
      if (fn && !fn(sp)) continue;
      const d = Math.hypot(sp.x - x, sp.z - z);
      if (d < bd) { bd = d; best = sp; }
    }
    return best;
  }

  // ---- r2deploy: điểm câu tạm (BaitAbility.DeployBait dựng BaitPOI lúc chạy, không lưu sổ). def = { id, x, z, r, d } (d như harvestPOIData).
  // Trả { sp, remove() }; remove() gỡ điểm khỏi danh sách và xoá kho trong DR.s.spots. Thêm vào, không đổi luồng câu sẵn có.
  Sp.addTemp = function (def) {
    const id = String(def.id);
    if (Sp.byId[id]) throw new Error('spot id already in use: ' + id);
    const sp = { id, x: def.x, y: 0, z: def.z, d: def.d, dredge: false, r: def.r || 2, special: false, spDay: null, spT: -1, temp: true };
    Sp.list.push(sp); Sp.byId[id] = sp;
    return { sp, remove() { const i = Sp.list.indexOf(sp); if (i >= 0) Sp.list.splice(i, 1); delete Sp.byId[id]; if (root.DR.s && root.DR.s.spots) delete root.DR.s.spots[id]; } };
  };

  Object.assign(Sp, { init, update, interact, finish, nearest, regen, rec });
  Object.defineProperty(Sp, 'mesh', { get: () => mesh });
})(window);
