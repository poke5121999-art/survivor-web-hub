// Hình vật thể trong màn lặn: rương, cửa, bốt điện thoại/Elara, bẫy, thùng dầu, trigger, đồ rơi.
// Prefab gốc (remote_prefab_assets_object) bóc bằng tools/rip_objects.py → art/object/<Prefab>.glb + .json, manifest VD.OBJECTS.
// Prefab 2.5D có hai nhóm con Front/Back (sprite mặt trước/sau); cửa có Open/Close; lối thoát dùng Spine World_PhoneBooth
// và NPC_Campaign (hình Elara). Mọi thứ ở đây chỉ là hình: luật nằm ở dive.js.
(function (VD) {
  'use strict';
  const THREE = window.THREE;
  const O = { cache: new Map(), live: new Set(), spineMap: { NPC_Campaign_SW: 'NPC_Campaign' } };

  function man() { return (VD.OBJECTS && VD.OBJECTS.prefab) || {}; }
  O.has = name => !!man()[name];
  O.info = name => man()[name] || null;

  // Bộ Spine riêng của vật thể nằm ở art/object/spine/: đăng ký vào VD.ASSETS.spine lúc chạy để VD.loadSpine tìm được
  // (không sửa data/assets.js).
  function registerSpines() {
    const sp = VD.OBJECTS && VD.OBJECTS.spine;
    if (!sp || O._reg) return;
    O._reg = true;
    VD.ASSETS = VD.ASSETS || {}; VD.ASSETS.spine = VD.ASSETS.spine || {};
    for (const n of Object.keys(sp)) if (!VD.ASSETS.spine[n]) VD.ASSETS.spine[n] = { dir: sp[n].dir };
  }

  const matCache = new Map();
  function convert(m) {
    if (matCache.has(m)) return matCache.get(m);
    const out = new THREE.MeshLambertMaterial({
      map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1),
      transparent: m.transparent, alphaTest: m.alphaTest || (m.map ? 0.3 : 0), side: THREE.DoubleSide,
    });
    if (out.map) { out.map.magFilter = THREE.NearestFilter; out.map.minFilter = THREE.NearestMipmapLinearFilter; out.map.encoding = THREE.sRGBEncoding; }
    out.name = m.name;
    if (VD.render && VD.render.patchSight) VD.render.patchSight(out);
    matCache.set(m, out);
    return out;
  }

  function load(name) {
    if (O.cache.has(name)) return O.cache.get(name);
    const info = O.info(name);
    const p = (async () => {
      if (!info) throw new Error('không có prefab trong VD.OBJECTS: ' + name);
      const json = await fetch(info.json).then(r => { if (!r.ok) throw new Error(info.json + ' ' + r.status); return r.json(); });
      let scene = null;
      if (info.glb) {
        const loader = new THREE.GLTFLoader();
        if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
        scene = await new Promise((res, rej) => loader.load(info.glb, g => res(g.scene), undefined, rej));
        scene.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material); });
      }
      return { json, scene };
    })();
    O.cache.set(name, p);
    return p;
  }
  O.load = load;

  // Hướng camera trên mặt đất (three): camera nằm ở (+x, +z) so với mục tiêu.
  const TO_CAM = { x: Math.SQRT1_2, z: Math.SQRT1_2 }, SCREEN_RIGHT = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };

  // Tạo một vật thể. opts: { pos:{x,z}, fwd:{x,z} (three), scene, state }. Trả handle đồng bộ; hình nạp sau.
  O.create = function (name, opts) {
    registerSpines();
    const h = {
      name, root: new THREE.Group(), json: null, meshes: [], spines: [], ready: false, removed: false,
      state: opts.state || null, face: 'Front', flip: false, groupsOn: {},
    };
    h.root.position.set(opts.pos.x, opts.y || 0, opts.pos.z);
    (opts.scene || VD.render.scene).add(h.root);
    const f = opts.fwd || { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
    // Front khi mặt vật hướng về camera; lật trái/phải theo trục ngang màn hình (như Spine NW/SW + lật). [SUY LUẬN]
    const toward = f.x * TO_CAM.x + f.z * TO_CAM.z;
    h.face = toward >= -1e-3 ? 'Front' : 'Back';
    const sx = f.x * SCREEN_RIGHT.x + f.z * SCREEN_RIGHT.z;
    h.flip = h.face === 'Front' ? sx > 0.01 : sx < -0.01;
    h.fwd = f;
    load(name).then(({ json, scene }) => {
      if (h.removed) return;
      h.json = json;
      if (scene) {
        const c = scene.clone(true);
        c.traverse(o => { if (o.isMesh) h.meshes.push(o); });
        h.body = c;
        h.root.add(c);
      }
      for (const s of json.spines || []) addSpine(h, s);
      h.ready = true;
      O.apply(h);
      O.live.add(h);
    }).catch(e => { console.warn('[objects] ' + name + ': ' + (e.message || e)); });
    return h;
  };

  function addSpine(h, s) {
    const bundleName = O.spineMap[s.skeleton] || s.skeleton;
    if (!bundleName || !VD.loadSpine) return;
    VD.loadSpine(bundleName).then(b => {
      if (h.removed) return;
      const vis = new VD.UnitVisual(b, { scale: (s.scale && s.scale[0]) || 1, shadow: 0.01 });
      vis.shadow.visible = false;
      vis.root.position.set(s.pos[0], s.pos[1], s.pos[2]);
      h.root.add(vis.root);
      const anim = s.anim || (vis.has('idle') ? 'idle' : null);
      if (anim && vis.has(anim)) vis.play(anim, s.loop !== false, 1);
      h.spines.push({ def: s, vis });
      O.apply(h);
    }).catch(e => console.warn('[objects] spine ' + bundleName + ': ' + (e.message || e)));
  }

  // Nhóm hiển thị theo trạng thái: Front/Back theo hướng; Open/Close theo h.state ('open'|'closed');
  // lối thoát: h.state ∈ 'idle'|'activating'|'activated'|'finished' → Model / phonebooth_Called / _Loop / _Leave.
  const EXIT_GROUP = { idle: /^Model(\/|$)/, activating: /phonebooth_Called/, activated: /phonebooth_Loop/, finished: /phonebooth_Leave/ };
  O.apply = function (h) {
    if (!h.ready) return;
    const isExit = /Exit$/.test(h.name);
    const vis = path => {
      if (!path) return true;
      if (/(^|\/)PingCollider|(^|\/)UI(\/|$)|(^|\/)Light(\/|$)/.test(path)) return false;
      if (/(^|\/)Front(\/|$)/.test(path) && h.face !== 'Front') return false;
      if (/(^|\/)Back(\/|$)/.test(path) && h.face !== 'Back') return false;
      if (/(^|\/)Open(\/|$)/.test(path) && h.state !== 'open') return false;
      if (/(^|\/)Close(\/|$)/.test(path) && h.state === 'open') return false;
      if (isExit) {
        const st = h.state || 'idle';
        if (/^Model(\/|$)/.test(path) || /phonebooth_/.test(path)) return EXIT_GROUP[st] ? EXIT_GROUP[st].test(path) : false;
      }
      if (h.hideGroups && h.hideGroups.some(r => r.test(path))) return false;
      return true;
    };
    for (const m of h.meshes) {
      const ud = m.userData || {};
      m.visible = vis(ud.path) && (ud.active !== false || /(^|\/)(Front|Back|Open|Close)(\/|$)/.test(ud.path || ''));
    }
    for (const s of h.spines) {
      let on = vis(s.def.path);
      // SkeletonAnimation_NW mặc định tắt trong prefab; bật đúng một hướng.
      if (/SkeletonAnimation_NW/.test(s.def.path)) on = false;
      s.vis.root.visible = on;
    }
    // Lật trái/phải theo màn hình = phản chiếu qua mặt phẳng đứng chứa hướng camera, tức đổi chỗ x ↔ z.
    if (h.body) {
      h.body.matrixAutoUpdate = false;
      if (h.flip) h.body.matrix.set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1); else h.body.matrix.identity();
    }
  };
  // Bốt điện thoại (World_PhoneBooth): enter_start (4 s) khi đang tới, enter_loop khi đứng chờ, enter_end khi rời đi.
  const BOOTH_ANIM = { activating: ['enter_start', false, 'enter_loop'], activated: ['enter_loop', true], finished: ['enter_end', false] };
  O.setState = function (h, st) {
    if (!h || h.state === st) return;
    h.state = st; O.apply(h);
    const a = BOOTH_ANIM[st];
    if (a) for (const s of h.spines) {
      if (s.def.skeleton !== 'World_PhoneBooth' || !s.vis.has(a[0])) continue;
      for (const k in s.vis.meshes) {
        const m = s.vis.meshes[k];
        m.state.setAnimation(0, a[0], a[1]);
        if (a[2]) m.state.addAnimation(0, a[2], true, 0);
      }
    }
  };
  O.play = function (h, pathRe, anim, loop) {
    for (const s of h.spines) if (pathRe.test(s.def.path) && s.vis.has(anim)) s.vis.play(anim, loop !== false, 1, true);
  };
  O.remove = function (h) {
    if (!h) return;
    h.removed = true;
    if (h.root.parent) h.root.parent.remove(h.root);
    for (const s of h.spines) s.vis.dispose();
    O.live.delete(h);
  };

  // Đồ rơi (prefab DropGoods): gốc là Canvas Billboard mang Image icon của món hàng + hạt DropItemFX_Quest.
  // Ở đây: icon gốc trên một tấm quad luôn quay về camera, nhún nhẹ. Hạt phát sáng chưa có (VFX prefab chưa bóc).
  const texCache = new Map();
  function tex(url) {
    if (!texCache.has(url)) {
      const t = new THREE.TextureLoader().load(url);
      t.encoding = THREE.sRGBEncoding; t.magFilter = THREE.LinearFilter;
      texCache.set(url, t);
    }
    return texCache.get(url);
  }
  O.drop = function (iconUrl, pos) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: tex(iconUrl), transparent: true, alphaTest: 0.05, depthWrite: false });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), mat);   // không có trong bảng: cỡ icon ~0,6 m
    q.position.y = 0.55; q.renderOrder = 5;
    g.add(q);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
    g.add(shadow);
    g.position.set(pos.x, 0, pos.z);
    VD.render.scene.add(g);
    const h = { root: g, quad: q, t: Math.random() * 6, isDrop: true };
    O.live.add(h);
    return h;
  };

  // Vòng đánh dấu vùng (SpecialField SphereFieldExit, 5 m quanh bốt đang mở). Hạt gốc chưa bóc: vẽ một vành mảnh.
  O.ring = function (pos, radius, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(radius - 0.08, radius, 64),
      new THREE.MeshBasicMaterial({ color: color || 0x7fe3ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, 0.03, pos.z);
    VD.render.scene.add(m);
    return m;
  };

  O.update = function (dt, camera) {
    for (const h of O.live) {
      if (h.isDrop) {
        h.t += dt;
        h.quad.quaternion.copy(camera.quaternion);
        h.quad.position.y = 0.55 + Math.sin(h.t * 2.4) * 0.05;
        continue;
      }
      for (const s of h.spines) if (s.vis.root.visible) s.vis.update(dt, camera);
    }
  };
  O.clear = function () {
    for (const h of Array.from(O.live)) { if (h.isDrop) { if (h.root.parent) h.root.parent.remove(h.root); O.live.delete(h); } else O.remove(h); }
  };

  VD.objects = O;
})(window.VD = window.VD || {});
