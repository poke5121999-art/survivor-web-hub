/*
 * Điểm câu / nạo vét (HarvestPOI trong markers.json): vệt nước động trên mặt biển, kho cá bền theo sổ lưu,
 * Space để câu → minigame của UI (DRMinigame) → tạo con cá theo ItemManager.CreateFishItem (CODE.md 4.1, 4.2, 4.4).
 *   DRSpots.init(scene, world)  DRSpots.update(dt, x, z)  DRSpots.interact()  DRSpots.nearest(fn)
 */
(function (root) {
  'use strict';
  const T = root.THREE, R = root.DRRules, CFG = root.DR_CONFIG, ITEMS = root.DR_ITEMS;
  const LISTENER_R = root.DR_BOAT.colliderSize.spheres.find(s => s.node === 'POIInteractionListener').radius; // 1,5 m
  const SHOW_R = 170, MAX_SHOWN = 64; // [ĐỀ XUẤT] bán kính vẽ vệt nước, sương đêm che phần xa
  const Sp = root.DRSpots = { list: [], byId: {}, fishing: false, cur: null };
  let mesh = null, near = null, regenT = 0, showT = 0, fallbackT = 0;

  function firstItem(d) { return ITEMS[(d.items && d.items[0]) || (d.nightItems && d.nightItems[0])]; }

  function init(scene, world) {
    for (const m of world.data.markers.markers) {
      const d = m.harvestPOIData;
      if (m.kind !== 'harvestPOI' || !d || m.active === false) continue;
      const it = firstItem(d);
      if (!it || !it.harvestableType) continue; // điểm nhiệm vụ / vật phẩm lạ: ngoài pha 1
      const col = (m.colliders || [])[0];
      const sp = { id: String(d.id), x: m.pos[0], z: m.pos[2], d, dredge: it.harvestableType === 'DREDGE', r: col ? col.radius : 2 };
      Sp.list.push(sp); Sp.byId[sp.id] = sp;
    }
    mesh = rippleMesh();
    scene.add(mesh);
  }

  function rippleMesh() {
    const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: Object.assign({ fogColor: { value: new T.Color() }, fogDensity: { value: 0 }, uNightK: { value: 0 } }, root.DRWater.uniforms),
      vertexShader: root.DRWater.GLSL_WAVE + `
attribute vec3 aInfo; varying vec2 vUv; varying vec3 vInfo;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  wp.y = drWave(wp.xz, drSteepAt(wp.xz) * uWaveSteep).x + 0.05;
  vUv = uv; vInfo = aInfo;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uGameTime; uniform float uNightK;
varying vec2 vUv; varying vec3 vInfo;
#include <common>
#include <fog_pars_fragment>
float hs(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
  if (r > 1.0) discard;
  float t = uGameTime + vInfo.y * 10.0;
  float kind = vInfo.x, fade = vInfo.z;
  float a = 0.0; vec3 c = vec3(0.86, 0.92, 0.9);
  // vòng gợn lan ra
  for (int i = 0; i < 3; i++) {
    float ph = fract(t * 0.35 + float(i) / 3.0);
    float ring = 1.0 - smoothstep(0.0, 0.06, abs(r - ph * 0.95));
    a += ring * (1.0 - ph) * 0.55;
  }
  // bong bóng nổi lên rồi vỡ
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float cyc = floor(t * 0.8 + fi * 0.37);
    vec2 bc = vec2(hs(vec2(fi, cyc)), hs(vec2(cyc, fi + 3.1))) * 1.1 - 0.55;
    float life = fract(t * 0.8 + fi * 0.37);
    float br = 0.05 + 0.05 * life;
    float b = 1.0 - smoothstep(br * 0.6, br, length(p - bc));
    a += b * (1.0 - life) * 0.9;
  }
  float core = 1.0 - smoothstep(0.0, 0.85, r);
  if (kind > 0.5) {
    // nạo vét: bóng tối xoáy dưới nước, bọt nâu đục (HarvestTypeTagConfig DREDGE)
    float sw = sin(atan(p.y, p.x) * 3.0 + r * 8.0 - t * 1.5) * 0.5 + 0.5;
    c = mix(vec3(0.05, 0.03, 0.02), vec3(0.46, 0.24, 0.18), a);
    a = max(a * 0.7, core * (0.45 + 0.2 * sw));
  } else {
    c = mix(vec3(0.02, 0.06, 0.07), c, clamp(a * 2.0, 0.0, 1.0));
    a = max(a, core * 0.28);
  }
  c *= mix(1.0, 0.45, uNightK);
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * fade * (1.0 - smoothstep(0.85, 1.0, r)));
  #include <encodings_fragment>
  #include <fog_fragment>
}`
    });
    const im = new T.InstancedMesh(g, m, MAX_SHOWN);
    im.geometry.setAttribute('aInfo', new T.InstancedBufferAttribute(new Float32Array(MAX_SHOWN * 3), 3));
    im.count = 0; im.frustumCulled = false; im.renderOrder = 2;
    return im;
  }

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

  const _m = new T.Matrix4();
  function update(dt, x, z) {
    const D = root.DR;
    if (!D.s || !mesh) return;
    // HarvestPOI.cs: hồi kho mỗi giây thật
    regenT += dt;
    if (regenT >= 1) { regenT = 0; for (const sp of Sp.list) if (Math.abs(sp.x - x) < 600 && Math.abs(sp.z - z) < 600) regen(sp); }
    showT += dt;
    if (showT >= 0.25) {
      showT = 0;
      const vis = Sp.list.map(sp => ({ sp, d: Math.hypot(sp.x - x, sp.z - z) })).filter(o => o.d < SHOW_R).sort((a, b) => a.d - b.d).slice(0, MAX_SHOWN);
      const info = mesh.geometry.attributes.aInfo.array;
      mesh.count = vis.length;
      const day = isDay();
      vis.forEach((o, i) => {
        const r = rec(o.sp), list = R.spotList(o.sp.d, day) || [];
        const fade = r.stock < 1 ? 0 : list.length ? 1 : 0.35;
        const sc = (o.sp.r + 1) * 2;
        _m.makeScale(sc, 1, sc).setPosition(o.sp.x, 0, o.sp.z);
        mesh.setMatrixAt(i, _m);
        info[i * 3] = o.sp.dredge ? 1 : 0; info[i * 3 + 1] = (Number(o.sp.id) % 97) / 97; info[i * 3 + 2] = fade;
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aInfo.needsUpdate = true;
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
      D.view.nearSpot = { id: near.id, name: near.dredge ? 'Bóng hình dưới đáy' : 'Vùng nước động', status: statusOf(near, r), stock: r.stock, maxStock: near.d.maxStock, kind: near.dredge ? 'dredge' : 'fish' };
    } else D.view.nearSpot = null;
    // không có minigame của UI: cá tự lên sau secondsToPassivelyCatch (tiến độ thụ động của HarvestMinigame)
    if (Sp.cur && Sp.cur.fallback) {
      fallbackT += dt;
      if (fallbackT >= Sp.cur.fallback) finish({ caught: true });
    }
  }

  // ---- câu ----
  function interact() {
    const D = root.DR, ns = D.view.nearSpot;
    if (!near || !ns || ns.status !== 'ok' || Sp.cur) return false;
    const sp = near;
    if (!D.setMode('harvest', { spotId: sp.id })) return false;
    root.DRBoat.stop();
    if (root.DRAudio) DRAudio.play('fish.cast');
    const day = isDay(), st = root.DRBoat.stats, v = D.s.vars;
    const itemId = R.pickWeighted(R.spotList(sp.d, day), ITEMS);
    const item = ITEMS[itemId], dredge = item.harvestableType === 'DREDGE';
    // HarvestMinigameView.cs:306-310 (không có mồi ở pha 1)
    let trophy = false;
    if (!dredge && (v['rod-fish-caught'] || 0) > 0 && (v['fish-before-next-trophy-notch'] || 0) <= 0 && Math.random() < CFG.trophyNotchSpawnChance) {
      trophy = true; v['fish-before-next-trophy-notch'] = CFG.fishToCatchBetweenTrophyNotches;
    }
    const cfg = (dredge ? CFG.DredgingDifficultyConfigs : CFG.FishingDifficultyConfigs)[item.harvestDifficulty];
    const speed = dredge ? st.dredging : st.fishing;
    Sp.cur = { sp, itemId, item, dredge, trophy, fallback: 0 };
    Sp.fishing = true;
    D.emit('harvestStart', Sp.cur);
    if (root.DRMinigame && typeof DRMinigame.open === 'function') {
      DRMinigame.open({ type: item.harvestMinigameType, cfg, speed, trophy, itemId, spotId: sp.id, onDone: finish });
    } else {
      fallbackT = 0;
      Sp.cur.fallback = cfg.secondsToPassivelyCatch / (dredge ? speed : 1);
    }
    return true;
  }

  function finish(result) {
    const D = root.DR, cur = Sp.cur;
    if (!cur) return;
    Sp.cur = null; Sp.fishing = false;
    const caught = result && typeof result === 'object' ? !!(result.caught != null ? result.caught : (result.success != null ? result.success : result.ok)) : !!result;
    const trophyHit = !!(result && typeof result === 'object' && (result.trophy || result.trophyHit));
    let made = null;
    if (caught) made = createCatch(cur, trophyHit);
    if (D.mode === 'harvest') D.setMode('sail');
    if (made && !made.placed) {
      if (root.DRCargo && typeof DRCargo.open === 'function') DRCargo.open({ keys: ['INVENTORY'], holding: made.holding });
      else if (root.DRHud) DRHud.toast('Khoang đầy — đành thả ' + made.item.name + ' về biển');
    }
    D.emit('harvestEnd', { caught, made });
  }

  // ItemManager.CreateFishItem (ItemManager.cs:250-335) + HarvestMinigameView.cs:372-391
  function createCatch(cur, trophyHit) {
    const D = root.DR, S = D.s, v = S.vars, st = root.DRBoat.stats, day = isDay();
    let id = cur.itemId, item = cur.item, aberrant = false;
    const isFish = (root.DRGrid.subOf(item) & root.DRGrid.SUB.FISH) !== 0;
    if (isFish && v['can-catch-aberrations'] && item.aberrations && item.aberrations.length && (S.caught[id] || 0) > 0) {
      const p = R.aberrationChance(CFG, day, v['aberration-spawn-modifier'] || 0, st.aberrationBonus || 0, false, false);
      if (Math.random() < p) {
        const ok = item.aberrations.filter(a => ITEMS[a] && (ITEMS[a].minWorldPhaseRequired || 0) <= S.worldPhase);
        const fresh = ok.filter(a => !(S.caught[a] > 0));
        const pool = fresh.length ? fresh : ok;
        if (pool.length) {
          id = pool[Math.floor(Math.random() * pool.length)]; item = ITEMS[id]; aberrant = true;
          v['aberration-spawn-modifier'] = 0; v['num-aberrations-caught'] = (v['num-aberrations-caught'] || 0) + 1;
        }
      } else v['aberration-spawn-modifier'] = (v['aberration-spawn-modifier'] || 0) + CFG.spawnChanceIncreasePerNonAberrationCaught;
    }
    let extra = null;
    if (isFish) extra = { size: R.rollSize(CFG, trophyHit), fresh: CFG.maxFreshness };
    else if (item.canBeReplacedWithResearchItem && ITEMS['research-item'] && Math.random() < CFG.researchItemDredgeSpotSpawnChance) {
      id = 'research-item'; item = ITEMS[id];
    }
    // POIDataModel: kho −1 cho mỗi lần thu hoạch (chưa có nghiên cứu Fishing Sustain ở pha 1)
    if (id !== 'research-item') { const r = rec(cur.sp); r.stock = Math.max(0, r.stock - 1); }
    if (isFish) {
      S.caught[id] = (S.caught[id] || 0) + 1;
      if (!cur.dredge) {
        v['rod-fish-caught'] = (v['rod-fish-caught'] || 0) + 1;
        v['fish-before-next-trophy-notch'] = (v['fish-before-next-trophy-notch'] || 0) - 1;
      }
    }
    if (root.DRAudio) DRAudio.play(aberrant ? 'fish.new.aberration' : 'fish.new');
    const inst = D.give(id, extra);
    const cm = isFish && extra ? Math.round(R.lerp(item.minSizeCentimeters || 0, item.maxSizeCentimeters || 0, extra.size)) : 0;
    if (inst && root.DRHud) DRHud.toast('Bắt được ' + item.name + (cm ? ' — ' + cm + ' cm' : '') + (trophyHit ? ' (cá cúp)' : ''));
    root.DRBoat.refresh();
    const out = { id, item, inst, aberrant, trophy: trophyHit, placed: !!inst, holding: Object.assign({ id }, extra || {}) };
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
