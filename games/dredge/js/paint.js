/*
 * DREDGE — Biển Mù, W8 (WORLD-GAPS.md §6): sơn thuyền, cờ, dây cờ nhỏ, kiểu còi.
 * Nguồn gốc: PlayerColorCustomizer.cs (RefreshBoatColors / RefreshBoatBunting / RefreshBoatFlag / OnUpgradesChanged),
 *   DredgeDialogueRunner.cs:630-661 (ChangeBoatColor / ChangeBoatFlag / ChangeBoatBunting / ChangeBoatHorn), FoghornAbility.RefreshFoghornStyle.
 * Dữ liệu: data/paint.js (tools/boat.py --paint): bảng màu nóc/thân 8 ô, chỉ số mặc định theo tier, ảnh gốc + mặt nạ _ColorMask của từng vật liệu
 *   LitBoat, 7 ảnh cờ. Tiệm Sơn (Painter) trong bản gốc chỉ là hội thoại Yarn (Painter_Customize*), không có cửa sổ riêng ⇒ không đăng ký điểm đến
 *   nào; phần thực thi nằm ở bốn lệnh Yarn bên dưới.
 *
 * Màu: LitBoat_Shader = albedo * (mask.r*_Roof_Color + mask.g*_Hull_Color + mask.b*_Base_Color) trong không gian tuyến tính (đo từ DXBC, xem
 *   tools/boat.py). Ở đây dựng lại ảnh 16x16 trên canvas (giống bước nướng của tools/boat.py) mỗi khi đổi màu; mỗi tên vật liệu glb một ảnh dùng chung.
 *   Vật liệu của mọi lưới được đăng ký qua DRPaint.hook (js/boat.js gọi), mang userData.paint = { roof, hull, roofIndex, hullIndex } (màu gamma của bảng).
 * Lệnh Yarn (đăng ký bằng DRYarn.command, thay bản chỉ-lưu-biến của js/yarn.js):
 *   ChangeBoatColor <vùng 0 nóc | 1 thân> <chỉ số>   SaveData.Roof/HullColorIndex + HasChangedBoatColors = true
 *   ChangeBoatFlag <kiểu>   0 = tắt cờ, N = flagMaterials[N-1] (Flag<N>_Mat)
 *   ChangeBoatBunting <0|1> bật mọi nút BuntingAccessory
 *   ChangeBoatHorn <n>      foghorn-style-index; js/abilities.js đọc biến này mỗi lần bấm còi (pitchValues[n])
 * Khi nâng vỏ mà chưa từng đổi màu (HasChangedBoatColors = false): chỉ số = mặc định của tier mới (OnUpgradesChanged).
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  const ver = (me && me.src.match(/\?v=[^&]*/) || [''])[0];
  const P = root.DR_PAINT, T = () => root.THREE;
  if (!P) { console.warn('[paint] data/paint.js chưa nạp'); return; }

  const lin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const srgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
  const b64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const S = () => root.DR && root.DR.s;

  // ---- trạng thái SaveData
  function indices() {
    const s = S(), v = s ? s.vars : {};
    const tier = s ? s.hullTier : 1, changed = !!v['has-changed-boat-colors'];
    const pick = (k, def) => v[k] == null ? (changed ? 0 : (def[String(tier)] | 0)) : (v[k] | 0);   // SaveData: biến thiếu = 0; bản lưu cũ chưa có thì lấy mặc định của tier
    return { roof: pick('roof-color-index', P.defRoof), hull: pick('hull-color-index', P.defHull) };
  }
  function cosmetics() {
    const v = S() ? S().vars : {};
    return { flag: v['boat-flag-style'] | 0, bunting: !!v['is-boat-bunting-enabled'] };
  }

  // ---- ảnh màu: một canvas 16x16 cho mỗi tên vật liệu
  const baked = {};   // tên -> { tex, cv, data }
  function bakeTo(name, roofRGB, hullRGB) {
    const d = P.mats[name], b = baked[name];
    if (!d || !b) return;
    if (!d.albedoBytes) { d.albedoBytes = b64(d.albedo); d.maskBytes = b64(d.mask); }
    const R = roofRGB.map(lin), H = hullRGB.map(lin), B = d.base.map(lin);
    const out = b.ctx.createImageData(d.w, d.h), o = out.data, A = d.albedoBytes, M = d.maskBytes;
    for (let i = 0, n = d.w * d.h; i < n; i++) {
      const mr = M[i * 3] / 255, mg = M[i * 3 + 1] / 255, mb = M[i * 3 + 2] / 255;
      for (let c = 0; c < 3; c++) {
        const t = mr * R[c] + mg * H[c] + mb * B[c];
        const v = srgb(Math.min(1, Math.max(0, lin(A[i * 4 + c] / 255) * t)));
        o[i * 4 + c] = Math.round(v * 255);
      }
      o[i * 4 + 3] = A[i * 4 + 3];
    }
    b.ctx.putImageData(out, 0, 0);
    b.tex.needsUpdate = true;
  }
  function bakeFor(name, srcMap) {
    if (baked[name]) return baked[name];
    const d = P.mats[name], cv = document.createElement('canvas');
    cv.width = d.w; cv.height = d.h;
    const tex = new (T().CanvasTexture)(cv);
    if (srcMap) {   // cùng cách lấy mẫu với ảnh glb: không lọc (ô màu), kẹp mép, không lật
      if ('colorSpace' in srcMap) tex.colorSpace = srcMap.colorSpace;   // three r152+
      if ('encoding' in srcMap) tex.encoding = srcMap.encoding;         // bản three cũ hơn (vendor/) dùng encoding
      tex.flipY = srcMap.flipY;
      tex.magFilter = srcMap.magFilter; tex.minFilter = srcMap.minFilter;
      tex.wrapS = srcMap.wrapS; tex.wrapT = srcMap.wrapT; tex.generateMipmaps = srcMap.generateMipmaps;
    }
    return (baked[name] = { tex, cv, ctx: cv.getContext('2d') });
  }

  // ---- đăng ký vật liệu / nút
  const mats = [], flagMats = [], accessories = { flag: [], bunting: [] }, flagTex = {};
  function hook(m, src) {
    const name = src && src.name;
    if (P.mats[name]) {
      bakeFor(name, src.map);
      m.map = baked[name].tex;
      m.userData.paintName = name;
      mats.push(m);
      stamp(m);
      bakeTo(name, P.roof[indices().roof] || P.roof[0], P.hull[indices().hull] || P.hull[0]);
    } else if (/^Flag\d+_Mat$/.test(name || '')) {
      m.userData.flagSrcMap = src.map;
      flagMats.push(m);
      applyFlag();
    }
  }
  function stamp(m) {
    const i = indices();
    m.userData.paint = { roof: (P.roof[i.roof] || P.roof[0]).slice(), hull: (P.hull[i.hull] || P.hull[0]).slice(), roofIndex: i.roof, hullIndex: i.hull };
  }
  function attach(model) {
    accessories.flag = []; accessories.bunting = [];
    model.traverse(o => {
      const n = o.userData.name || o.name;
      if (n === 'FlagAccessory') accessories.flag.push(o);
      else if (n === 'BuntingAccessory') accessories.bunting.push(o);
    });
    apply();
  }

  // ---- áp dụng
  function applyColors() {
    const i = indices(), roof = P.roof[i.roof], hull = P.hull[i.hull];
    if (!roof || !hull) { console.warn('[paint] chỉ số màu ngoài bảng:', i); return; }   // bản gốc sẽ ném ngoại lệ; ở đây giữ màu cũ
    for (const m of mats) stamp(m);
    for (const name of Object.keys(baked)) bakeTo(name, roof, hull);
  }
  function flagTexture(style) {
    if (flagTex[style]) return flagTex[style];
    const f = P.flags[style - 1], t = new (T().TextureLoader)().load(f.file + ver);
    if ('colorSpace' in t && T().SRGBColorSpace) t.colorSpace = T().SRGBColorSpace;
    if ('encoding' in t && T().sRGBEncoding) t.encoding = T().sRGBEncoding;
    t.flipY = false; t.wrapS = t.wrapT = T().RepeatWrapping;
    return (flagTex[style] = t);
  }
  function applyFlag() {
    const style = cosmetics().flag, on = style > 0 && style <= P.flags.length;
    for (const o of accessories.flag) o.visible = on;                       // flagObject.SetActive(style != 0)
    if (!on) return;
    for (const m of flagMats) { m.map = flagTexture(style); m.userData.flagStyle = style; }   // flagMeshRenderer.material = flagMaterials[style - 1]
  }
  function applyBunting() { const on = cosmetics().bunting; for (const o of accessories.bunting) o.visible = on; }
  function apply() { if (!S()) return; applyColors(); applyFlag(); applyBunting(); }

  // ---- lệnh Yarn
  const Y = root.DRYarn, intArg = x => (Number(x) | 0);
  function setVar(k, v) { S().vars[k] = v; if (root.DR.emit) root.DR.emit('boatCosmetic', k, v); }
  if (Y && Y.command) {
    Y.command('ChangeBoatColor', a => {
      const area = intArg(a[0]), index = intArg(a[1]);
      if (area === 0) setVar('roof-color-index', index); else if (area === 1) setVar('hull-color-index', index);   // area khác: bản gốc không ghi chỉ số
      S().vars['has-changed-boat-colors'] = true;
      applyColors();
    });
    Y.command('ChangeBoatFlag', a => { setVar('boat-flag-style', intArg(a[0])); applyFlag(); });
    Y.command('ChangeBoatBunting', a => { setVar('is-boat-bunting-enabled', intArg(a[0]) !== 0); applyBunting(); });
    Y.command('ChangeBoatHorn', a => { setVar('foghorn-style-index', intArg(a[0])); });
  }
  if (root.DR && root.DR.on) {
    // PlayerColorCustomizer.OnUpgradesChanged: nâng vỏ mà chưa đổi màu ⇒ chỉ số = mặc định của tier mới
    root.DR.on('upgrade', e => {
      const s = S();
      if (!s || !e || e.kind !== 'hull' || s.vars['has-changed-boat-colors']) return;
      s.vars['roof-color-index'] = P.defRoof[String(e.tier)] | 0; s.vars['hull-color-index'] = P.defHull[String(e.tier)] | 0;
      applyColors();
    });
    root.DR.on('load', apply);
    root.DR.on('newgame', apply);
  }

  root.DRPaint = { hook, attach, apply, indices, cosmetics, data: P, mats, flagMats, accessories, baked };
})(window);
