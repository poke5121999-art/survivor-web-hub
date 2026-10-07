/*
 * Điểm câu / nạo vét (HarvestPOI trong markers.json): hiệu ứng trên mặt biển theo prefab hạt gốc, kho cá bền theo sổ lưu,
 * Space -> màn thu hoạch (DRMinigame = HarvestMinigameView) -> con cá tạo theo ItemManager.CreateFishItem (CODE.md 4.1, 4.2, 4.4).
 *   DRSpots.init(scene, world)  DRSpots.update(dt, x, z)  DRSpots.interact()  DRSpots.nearest(fn)
 *
 * Hiệu ứng điểm (HarvestPOI.cs + HarvestableParticles.cs; tham số bóc bởi tools/harvest_ui.py -> DR_HARVEST_UI.spotfx):
 *  - bầy cá/mảnh vụn: số hạt = particlesPerStock x floor(kho), bơi vòng quanh (orbitalY) trong "bánh donut" bán kính/độ dày của prefab,
 *    to dần 0 -> 1 trong 11% đời và nhỏ về 0 ở 90% đời (SizeModule); hình bóng = mesh thật nhìn từ trên xuống;
 *  - nước xáo động (DisturbedWaterParticles): 10 hạt/giây, sống 0,5-1 s, to 0,5-1,1, trong đĩa bán kính 1 m;
 *  - điểm "đặc biệt" (aberrant): SpecialFishParticles (xoáy cực quang xanh lam #00f8ff26 + tia sáng quay) bật/tắt theo
 *    HarvestPOIDataModel.RollForSpecial mỗi khi đổi ngày/đêm hoặc sau 0,5 ngày.
 * Tiếng gần điểm (HarvestPOIHandler.PlayRandomHarvestProximityClip): clip theo harvestPOICategory, cách nhau 1-2,5 s, tắt dần 2 -> 8 m.
 */
(function (root) {
  'use strict';
  const T = root.THREE, R = root.DRRules, CFG = root.DR_CONFIG, ITEMS = root.DR_ITEMS;
  const LISTENER_R = root.DR_BOAT.colliderSize.spheres.find(s => s.node === 'POIInteractionListener').radius; // 1,5 m
  const SHOW_R = 170, MAX_SHOWN = 64; // [ĐỀ XUẤT] bán kính vẽ hiệu ứng điểm, sương đêm che phần xa
  const SFXD = (root.DR_HARVEST_UI && root.DR_HARVEST_UI.spotfx) || null;
  const Sp = root.DRSpots = { list: [], byId: {}, fishing: false, cur: null };
  const URLB = f => new URL(f, document.baseURI).href;
  let mesh = null, near = null, regenT = 0, showT = 0, tAnim = 0, sfxT = 0, sfxFor = null;

  const firstId = (d, day) => { const l = (R.spotList(d, day) || []).length ? R.spotList(d, day) : (d.items || d.nightItems || []); return l && l[0]; };
  const firstItem = d => ITEMS[(d.items && d.items[0]) || (d.nightItems && d.nightItems[0])];
  const mix = (a, b, t) => a + (b - a) * t;
  const rng = a => Array.isArray(a) ? [Math.min(a[0], a[1]), Math.max(a[0], a[1])] : [a, a];

  function init(scene, world) {
    for (const m of world.data.markers.markers) {
      const d = m.harvestPOIData;
      if (m.kind !== 'harvestPOI' || !d || m.active === false) continue;
      const it = firstItem(d);
      if (!it || !it.harvestableType) continue; // điểm nhiệm vụ / vật phẩm lạ: ngoài pha 1
      const col = (m.colliders || [])[0];
      const sp = { id: String(d.id), x: m.pos[0], z: m.pos[2], d, dredge: it.harvestableType === 'DREDGE', r: col ? col.radius : 2, special: false, spDay: null, spT: -1 };
      Sp.list.push(sp); Sp.byId[sp.id] = sp;
    }
    mesh = spotMesh();
    scene.add(mesh);
  }

  // ---------------------------------------------------------------------------------------------- tham số hạt của từng điểm
  function fxOf(sp, day) {
    const id = firstId(sp.d, day);
    if (sp.fxId === id && sp.fx) return sp.fx;
    sp.fxId = id;
    const it = SFXD && SFXD.items[id], p = it && SFXD.prefabs[it.p];
    const fx = { n: 0, tile: -1, ext: 1, R: 1.6, donut: 0.9, orb: 1, life: 10, s0: 1, s1: 1.2, col: [0.4, 0.55, 0.3], kind: 0, depth: 0.5, pps: 1, maxP: 0, debris: false };
    if (p) {
      fx.pps = p.pps; fx.maxP = p.maxP || 0; fx.debris = !p.sil;
      fx.depth = Math.exp(-Math.abs(it.depth || -3) * 0.18);
      if (p.sil) {
        const [l0, l1] = rng(p.life), [s0, s1] = rng(p.size), [o0, o1] = rng(p.orb);
        fx.tile = p.sil.i; fx.ext = Math.max(p.sil.L, p.sil.W) * 64 / 60; fx.R = p.radius; fx.donut = p.shape === 17 ? p.donut : Math.max(0.3, p.radius * 0.35);
        fx.orb = (o0 + o1) / 2; fx.life = (l0 + l1) / 2; fx.s0 = s0; fx.s1 = s1;
        const c = p.color.replace('#', ''); fx.col = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255);
      } else fx.kind = 1;
    }
    sp.fx = fx;
    return fx;
  }

  function spotMesh() {
    const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const atlas = new T.TextureLoader().load(URLB((SFXD && SFXD.atlas.file) || 'art/ui/minigame/fish_atlas.webp'));
    atlas.flipY = false; atlas.minFilter = T.LinearFilter; atlas.generateMipmaps = false;
    const grid = SFXD ? new T.Vector2(SFXD.atlas.cols, SFXD.atlas.rows) : new T.Vector2(8, 5);
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: Object.assign({ fogColor: { value: new T.Color() }, fogDensity: { value: 0 }, uNightK: { value: 0 }, uT: { value: 0 }, uAtlas: { value: atlas }, uGrid: { value: grid } }, root.DRWater.uniforms),
      vertexShader: root.DRWater.GLSL_WAVE + `
attribute vec3 aInfo; attribute vec4 aFx1, aFx2, aFx3; attribute vec3 aCol; attribute float aSize;
varying vec2 vUv; varying vec3 vInfo; varying vec4 vFx1, vFx2, vFx3; varying vec3 vCol; varying float vSizeM;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  wp.y = drWave(wp.xz, drSteepAt(wp.xz) * uWaveSteep).x + 0.05;
  vUv = uv; vInfo = aInfo; vFx1 = aFx1; vFx2 = aFx2; vFx3 = aFx3; vCol = aCol; vSizeM = aSize;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uT; uniform float uNightK; uniform sampler2D uAtlas; uniform vec2 uGrid;
varying vec2 vUv; varying vec3 vInfo; varying vec4 vFx1, vFx2, vFx3; varying vec3 vCol; varying float vSizeM;
#include <common>
#include <fog_pars_fragment>
float hs(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 m = (vUv - 0.5) * vSizeM;               // mét, tâm điểm câu = 0
  float rr = length(m);
  if (rr > vSizeM * 0.5) discard;
  float seed = vInfo.y * 97.0, fade = vInfo.z, t = uT;
  vec3 col = vec3(0.0); float a = 0.0;

  // ---- bầy cá / mảnh vụn (HarvestableParticleSystem): n hạt, quỹ đạo orbitalY, size theo đời hạt
  float fa = 0.0;
  if (vFx1.x > 0.5) {
    for (int i = 0; i < 16; i++) {
      float fi = float(i); if (fi >= vFx1.x) break;
      float off = hs(vec2(fi, seed)), life = max(vFx3.x, 1.0);
      float lt = fract(t / life + off), cyc = floor(t / life + off);
      float hp = hs(vec2(fi * 1.7 + cyc, seed * 3.1)), hr = hs(vec2(fi + cyc * 2.3, seed + 7.0)), hz = hs(vec2(cyc + fi, seed + 11.0));
      float sz = mix(vFx3.y, vFx3.z, hz) * smoothstep(0.0, 0.11, lt) * (1.0 - smoothstep(0.9, 1.0, lt));
      if (vFx1.w < 0.5) {                         // cá: bơi vòng, đầu theo tiếp tuyến
        float w = vFx2.z * (0.6 + 0.8 * hp);
        float ang = hp * 6.2832 + w * t;
        float rad = vFx2.x + (hr - 0.5) * vFx2.y;
        vec2 pos = rad * vec2(cos(ang), sin(ang));
        vec2 tn = vec2(-sin(ang), cos(ang)) * (w < 0.0 ? -1.0 : 1.0);
        vec2 d = m - pos;
        vec2 l = vec2(dot(d, tn), dot(d, vec2(-tn.y, tn.x)));
        vec2 tuv = l / (vFx1.z * max(sz, 0.001)) + 0.5;
        if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
          vec2 cell = vec2(mod(vFx1.y, uGrid.x), floor(vFx1.y / uGrid.x));
          fa = max(fa, texture2D(uAtlas, (cell + tuv) / uGrid).r);
        }
      } else {                                    // mảnh vụn nổi: trôi chậm, xoay
        vec2 pos = (vec2(hp, hr) - 0.5) * 2.2 + 0.18 * vec2(sin(t * 0.35 + fi), cos(t * 0.3 + fi * 1.7));
        float ra = hz * 6.28 + t * 0.07 * (hp - 0.5);
        vec2 d = m - pos; d = vec2(cos(ra) * d.x + sin(ra) * d.y, -sin(ra) * d.x + cos(ra) * d.y);
        vec2 q = abs(d) - vec2(0.28 + 0.2 * hp, 0.14 + 0.1 * hr);
        fa = max(fa, (1.0 - smoothstep(0.0, 0.05, max(q.x, q.y))) * 0.9);
      }
    }
    vec3 fc = mix(vec3(0.02, 0.06, 0.06), vCol * 0.5, 0.45);
    if (vFx1.w > 0.5) fc = vec3(0.16, 0.11, 0.08);
    float k = fa * (vFx1.w > 0.5 ? 0.9 : 0.62 * vFx3.w) * fade;
    col = mix(col, fc, k); a = max(a, k);
  }

  // ---- nước xáo động (DisturbedWaterParticles): 10 hạt/s, sống 0,5-1 s, đường kính 0,5-1,1 m trong đĩa bán kính 1 m
  float fo = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float per = mix(0.5, 1.0, hs(vec2(fi, seed + 3.0)));
    float x = t / per + hs(vec2(fi * 3.1, seed));
    float lt = fract(x), cyc = floor(x);
    vec2 bc = vec2(hs(vec2(fi + cyc * 1.31, seed)), hs(vec2(cyc + 5.0, fi * 2.7 + seed))) * 2.0 - 1.0;
    bc *= min(1.0, 1.0 / max(length(bc), 1.0)) * 0.96;
    float dia = mix(0.5, 1.1, hs(vec2(cyc + fi, seed + 9.0)));
    float grow = lt < 0.11 ? mix(0.0, 0.54, lt / 0.11) : mix(0.54, 1.0, (lt - 0.11) / 0.89);
    float al = smoothstep(0.0, 0.05, lt) * (lt < 0.94 ? mix(1.0, 0.7, lt / 0.94) : mix(0.7, 0.0, (lt - 0.94) / 0.06));
    float rad = dia * 0.5 * grow, d = length(m - bc);
    float blob = (1.0 - smoothstep(rad * 0.55, rad, d)) * 0.5 + (1.0 - smoothstep(0.0, 0.06, abs(d - rad * 0.9))) * 0.5;
    fo += blob * al;
  }
  fo = clamp(fo, 0.0, 1.0);
  vec3 foam = vec3(0.86, 0.93, 0.91);
  float fk = fo * 0.62 * fade * (1.0 - smoothstep(vSizeM * 0.38, vSizeM * 0.5, rr));
  col = mix(col, foam, fk * (1.0 - a * 0.4)); a = max(a, fk);
  a = max(a, 0.0);

  // ---- điểm đặc biệt: xoáy cực quang (#00f8ff, alpha 0,15) + tia sáng quay (SpecialFishParticles)
  if (vFx2.w > 0.5) {
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
    vec3 cy = mix(vec3(0.0, 0.97, 1.0), vec3(1.0), clamp(sp, 0.0, 1.0));
    float ka = clamp(sa + sp * 0.8, 0.0, 1.0) * fade;
    col = mix(col, cy, ka / max(a + ka, 0.001)); a = max(a, ka);
  }

  col *= mix(1.0, 0.45, uNightK);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <encodings_fragment>
  #include <fog_fragment>
}`
    });
    const im = new T.InstancedMesh(g, m, MAX_SHOWN);
    const att = (n, k) => im.geometry.setAttribute(n, new T.InstancedBufferAttribute(new Float32Array(MAX_SHOWN * k), k));
    att('aInfo', 3); att('aFx1', 4); att('aFx2', 4); att('aFx3', 4); att('aCol', 3); att('aSize', 1);
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
  function statusOf(sp, r) {
    const st = root.DRBoat.stats;
    const v = Object.assign({}, sp.d, { stock: r.stock });
    return R.spotStatus(v, isDay(), st, ITEMS);
  }
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

  // móc kiểm thử: thuộc tính instance của một điểm (đàn cá n, ô atlas, bán kính, cờ đặc biệt...) — test/dredge-fishing.js
  Sp._fx = id => {
    const sp = Sp.byId[id]; if (!sp || !mesh) return null;
    const G = mesh.geometry.attributes, p = new T.Vector3(), m = new T.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m);
      if (Math.abs(p.x - sp.x) < 0.01 && Math.abs(p.z - sp.z) < 0.01) {
        const f1 = Array.from(G.aFx1.array.slice(i * 4, i * 4 + 4)), f2 = Array.from(G.aFx2.array.slice(i * 4, i * 4 + 4));
        return { n: f1[0], tile: f1[1], ext: f1[2], kind: f1[3], R: f2[0], donut: f2[1], orb: f2[2], special: f2[3], stock: rec(sp).stock, first: firstId(sp.d, isDay()) };
      }
    }
    return null;
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
      const vis = Sp.list.map(sp => ({ sp, d: Math.hypot(sp.x - x, sp.z - z) })).filter(o => o.d < SHOW_R).sort((a, b) => a.d - b.d).slice(0, MAX_SHOWN);
      const G = mesh.geometry.attributes, day = isDay();
      mesh.count = vis.length;
      vis.forEach((o, i) => {
        const sp = o.sp, r = rec(sp), list = R.spotList(sp.d, day) || [], fx = fxOf(sp, day);
        const fade = r.stock < 1 ? 0 : list.length ? 1 : 0.35;
        const sc = Math.max((sp.r + 1) * 2, (fx.R + fx.donut) * 2.2 + 1, 5);
        _m.makeScale(sc, 1, sc).setPosition(sp.x, 0, sp.z);
        mesh.setMatrixAt(i, _m);
        const n = Math.min(15, fx.debris ? Math.floor(r.stock) : (fx.maxP ? Math.min(fx.maxP, fx.pps * Math.floor(r.stock)) : 0));
        G.aInfo.array.set([sp.dredge ? 1 : 0, (Number(sp.id) % 97) / 97, fade], i * 3);
        G.aFx1.array.set([n, fx.tile, fx.ext, fx.kind], i * 4);
        G.aFx2.array.set([fx.R, fx.donut, fx.orb, sp.special && r.stock >= 1 ? 1 : 0], i * 4);
        G.aFx3.array.set([fx.life, fx.s0, fx.s1, fx.depth], i * 4);
        G.aCol.array.set(fx.col, i * 3);
        G.aSize.array[i] = sc;
      });
      mesh.instanceMatrix.needsUpdate = true;
      for (const k of ['aInfo', 'aFx1', 'aFx2', 'aFx3', 'aCol', 'aSize']) G[k].needsUpdate = true;
    }
    mesh.material.uniforms.uNightK.value = root.DRSky ? DRSky.env.night : 0;
    // điểm gần nhất trong tầm POIInteractionListener
    near = null;
    if (D.mode === 'sail' || D.mode === 'harvest') {
      const st = root.DRBoat.stats;
      let best = 1e9;
      for (const sp of Sp.list) {
        const d = Math.hypot(sp.x - x, sp.z - z);
        if (d > sp.r + LISTENER_R || d >= best) continue;
        if (sp.dredge && !(st && st.hasDredge)) continue;
        best = d; near = sp;
      }
    }
    if (near) {
      const r = regen(near);
      D.view.nearSpot = { id: near.id, name: near.dredge ? 'Bóng hình dưới đáy' : 'Vùng nước động', status: statusOf(near, r), stock: r.stock, maxStock: near.d.maxStock, kind: near.dredge ? 'dredge' : 'fish', special: near.special };
    } else D.view.nearSpot = null;
    proximitySfx(dt, x, z);
  }

  // HarvestPOIHandler: khi điểm đang trong tầm tương tác, phát clip ngẫu nhiên theo loại, cách 1-2,5 s sau khi clip hết
  function proximitySfx(dt, x, z) {
    const D = root.DR;
    if (!root.DRAudio || D.mode !== 'sail' || !near) { sfxFor = null; return; }
    const r = rec(near);
    if (statusOf(near, r) !== 'ok') { sfxFor = null; return; }
    if (sfxFor !== near.id) { sfxFor = near.id; sfxT = 0; }
    sfxT -= dt;
    if (sfxT > 0) return;
    const it = ITEMS[firstId(near.d, isDay())], cat = it && PCAT[it.harvestPOICategory];
    if (!cat) { sfxT = 5; return; }
    const key = 'fish.spot.' + cat, def = root.DR_AUDIO && DR_AUDIO[key], dist = Math.hypot(near.x - x, near.z - z);
    const vol = Math.max(0, Math.min(1, 1 - (dist - 2) / 6));       // AudioRolloffMode.Linear, min 2 m, max 8 m
    if (def) { DRAudio.play(key, vol); sfxT = (def.dur || 2) + 1 + Math.random() * 1.5; } else sfxT = 5;
  }

  // ---------------------------------------------------------------------------------------------- câu
  function pickNext(cur) {                                              // HarvestPOI.Harvestable.GetNextHarvestableItem
    const day = isDay();
    const itemId = R.pickWeighted(R.spotList(cur.sp.d, day), ITEMS);
    cur.itemId = itemId; cur.item = ITEMS[itemId]; cur.dredge = cur.item.harvestableType === 'DREDGE';
  }
  function viewInfo(cur) {
    const sp = cur.sp, r = regen(sp), first = firstItem(sp.d), item = cur.item;
    return {
      kind: sp.dredge ? 'dredge' : 'fish', stock: r.stock, maxStock: sp.d.maxStock, status: statusOf(sp, r),
      harvestType: item ? item.harvestableType : first.harvestableType, advanced: !!(first && first.requiresAdvancedEquipment), special: sp.special
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

  function interact() {
    const D = root.DR, ns = D.view.nearSpot;
    if (!near || !ns || ns.status !== 'ok' || Sp.cur) return false;
    const sp = near;
    if (!D.setMode('harvest', { spotId: sp.id })) return false;
    root.DRBoat.stop();
    Sp.cur = { sp, itemId: null, item: null, dredge: false };
    pickNext(Sp.cur);
    D.emit('harvestStart', Sp.cur);
    DRMinigame.open(viewOpts(Sp.cur));                                  // giờ thế giới chỉ trôi khi minigame chạy (DRMinigame.isOpen), không phải lúc chờ bắt đầu
    return true;
  }

  function leave(caughtAny) {
    const D = root.DR;
    Sp.cur = null; Sp.fishing = false;
    if (D.mode === 'harvest') D.setMode('sail');
    D.emit('harvestEnd', { caught: !!caughtAny, made: null });
  }

  // Kết quả của một phiên: {caught, trophy, aborted}. aborted = rời màn (Esc / nút Rời) -> về lái thuyền.
  function finish(result) {
    const D = root.DR, cur = Sp.cur;
    if (!cur) return;
    const caught = result && typeof result === 'object' ? !!(result.caught != null ? result.caught : (result.success != null ? result.success : result.ok)) : !!result;
    const trophyHit = !!(result && typeof result === 'object' && (result.trophy || result.trophyHit));
    if (!caught) { leave(false); return; }
    const made = createCatch(cur, trophyHit);
    const again = () => {                                               // HarvestMinigameView.RefreshHarvestTarget sau OnItemPlaceComplete
      if (!Sp.cur || D.mode !== 'harvest') return;
      pickNext(cur);
      if (root.DRMinigame && DRMinigame.isShown()) DRMinigame.refresh(viewOpts(cur)); else DRMinigame.open(viewOpts(cur));
    };
    D.emit('harvestEnd', { caught, made });
    const afterReveal = () => {
      if (!Sp.cur) return;
      if (made && !made.placed) {
        if (root.DRCargo && typeof DRCargo.open === 'function') {
          DRMinigame.wait();
          DRCargo.open({ keys: ['INVENTORY'], holding: made.holding, title: 'Khoang thuyền', onClose: () => again() });
        } else { if (root.DRHud) DRHud.toast('Khoang đầy — đành thả ' + made.item.name + ' về biển'); again(); }
      } else again();
    };
    if (root.DRMinigame && DRMinigame.isShown() && DRMinigame.reveal) DRMinigame.reveal(made, afterReveal); else afterReveal();
  }

  // ItemManager.CreateFishItem (ItemManager.cs:250-335) + HarvestMinigameView.cs:372-391
  function createCatch(cur, trophyHit) {
    const D = root.DR, S = D.s, v = S.vars, st = root.DRBoat.stats, day = isDay();
    let id = cur.itemId, item = cur.item, aberrant = false;
    const sp = cur.sp, r0 = rec(sp), special = !!sp.special;
    const wasNew = !(S.caught[id] > 0);
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
    // POIDataModel: kho −1 cho mỗi lần thu hoạch (chưa có nghiên cứu Fishing Sustain ở pha 1)
    if (id !== 'research-item') { const r = rec(sp); r.stock = Math.max(0, r.stock - 1); }
    if (isFish) {
      S.caught[id] = (S.caught[id] || 0) + 1;
      if (!cur.dredge) {
        v['rod-fish-caught'] = (v['rod-fish-caught'] || 0) + 1;
        v['fish-before-next-trophy-notch'] = (v['fish-before-next-trophy-notch'] || 0) - 1;
      }
    }
    const inst = D.give(id, extra);
    const cm = isFish && extra ? Math.round(R.lerp(item.minSizeCentimeters || 0, item.maxSizeCentimeters || 0, extra.size)) : 0;
    if (inst && root.DRHud) DRHud.toast('Bắt được ' + item.name + (cm ? ' — ' + cm + ' cm' : '') + (trophyHit ? ' (cá cúp)' : ''));
    root.DRBoat.refresh();
    const out = { id, item, inst, aberrant, trophy: trophyHit, isNew: wasNew && isFish, cm, placed: !!inst, holding: Object.assign({ id }, extra || {}) };
    D.emit('catch', out);
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

  Object.assign(Sp, { init, update, interact, finish, nearest, regen, rec });
  Object.defineProperty(Sp, 'mesh', { get: () => mesh });
})(window);
