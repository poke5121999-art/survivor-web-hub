// Lớp vẽ: dựng cảnh 3D từ trạng thái trận mỗi khung (chỉ đọc trận, không ghi). Bản đồ glb + ánh sáng theo chủ đề,
// thợ lặn (diverView), cá mập (sharkView), kho báu, rương O₂, khoang cứu hộ, mũi xiên có dây, vùng kỹ năng, hạt, tiếng,
// camera bám người xem, mặt nạ đèn pin (lightmask). Đối thủ mà VS.sim.canSee nói không thấy thì không vẽ; kho báu chỉ vẽ
// khi nằm trong vùng thấy được của đội người xem, món đội đã từng thấy (VS.sim.known) thì còn dấu mờ khi chìm vào tối.
//
// Sự kiện lớp vẽ hiểu (m.events, onEvents): fire {owner}, hit|harpoonHit {target, x?, y?}, miss {x, y}, bite {by, target},
// down {id}, out {id}, bank {id, value, x?, y?}, pickup {id}, o2 {id}, revive|respawn {id}, stun {id}, skill {id, skill}.
// Đạn kind: harpoon, snipe, net, dart, jaw; zone kind: ink, bait, cage, flare, mine, o2gen (kind lạ thì bỏ qua, không lỗi);
// hiệu ứng actor vẽ biểu tượng: stun, sleep, slow/noDash (lưới), armor, reveal, lightOff, bleed (cá mập); stealth ở sharkView.
(function (VS) {
  'use strict';
  var HX = window.HX, T = window.HX_TUNING, D = window.HX_ASSETS.dave;
  var V = VS.view = {};
  // mask: bật mặt nạ đèn pin; allSeen: vẽ cả đối thủ không thấy (gỡ lỗi); camDist: ép khoảng cách camera (m, 0 = theo màn);
  // focus: { x, y } camera nhìn cố định một điểm thay vì bám người xem (phòng thử);
  // plainGrade: bỏ viền tối, loá, lệch màu viền (phụ thuộc chỗ trên màn) để so màu giữa các nhân vật (phòng thử)
  V.opts = { mask: true, allSeen: false, camDist: 0, focus: null, plainGrade: false };

  var SFX = ['harpoon_shot', 'harpoon_hit', 'harpoon_hit_rock', 'dave_hit1', 'dave_hit2', 'dave_hit3', 'dave_dead', 'o2_use', 'itembox', 'qte_success',
    'gear_sleep_shot', 'gear_strong_shot', 'gear_chain_shot', 'gear_paralysis_zap', 'gear_paralysis_hit', 'melee_hit', 'carving', 'dave_dash', 'o2_expand'];
  // tiếng khi bắn từng loại đạn / dùng kỹ năng (khoá có sẵn trong HX_ASSETS.audio)
  var PROJ_SND = { harpoon: 'harpoon_shot', snipe: 'gear_strong_shot', dart: 'gear_sleep_shot', sleep: 'gear_sleep_shot', net: 'gear_chain_shot', jaw: 'melee_hit' };
  var SKILL_SND = { 'quat-duoi': 'melee_hit', 'cua-xe': 'carving', 'cam-dien': 'gear_paralysis_zap', 'lao-vut': 'dave_dash', 'toc-bien': 'dave_dash', 'may-day': 'o2_expand', 'hut-nuoc': 'o2_expand' };
  var LOOT_ART = {
    1: ['Materials_Ruby', 'Materials_Diamond', 'Materials_Topaz', 'Materials_Amethyst', 'Materials_Aquamarine', 'Materials_Opal', 'extrasmall_gold', 'Small_gold_Thumbnail', 'Item_Pearl'],
    2: ['Item_GoldCup', 'Item_GoldFishStatue', 'Item_JadeFishStatue', 'Item_Skull', 'Item_StoneArtifacts', 'Item_MermanCuju', 'Item_Maki_Tablet', 'Item_StonePlate_WeddingSong', 'Item_Mike'],
    3: ['Crates01', 'Crates02', 'Item_Pinkbox_Thumbnail'],
  };
  var LOOT_LEN = { 1: 0.55, 2: 0.85, 3: 1.25 };   // cạnh dài khi vẽ (m): món nhỏ / vừa / to
  var SPEAR_LEN = D.spear.size[0] / D.spear.ppu * (D.scale || 1), SPEAR_W = D.spear.size[1] / D.spear.ppu * (D.scale || 1);
  var ROPE_W = 0.035;
  var ZONE_ICON = {
    mine: 'bdl:art/dtd/icon/Trap_SensorBomb_Thumbnail.png', o2gen: 'bdl:art/dtd/icon/OxygenGenerator_Thumbnail.png',
    net: 'hx:art/gear/icon/NetGun_Thumbnail.png',
  };

  var S = {
    gfx: null, fx: null, G: null, mask: null, ready: null, tags: null,
    m: null, loaded: false, loading: null, t: 0, zone: null, light: null, level: null, rays: null, dust: null, surface: null,
    chests: null, pods: null, views: {}, loot: {}, projs: {}, zones: {}, seenProj: {}, polys: [], halos: [], sfx: [], ov: {},
    cam: { x: 0, y: 0, lx: 0, ly: 0, snap: true }, focusId: -1, frameMs: 0, lootUrls: [], sharkIds: [], diverIds: [], theme: 'day',
  };

  function toScreen(x, y) { return S.gfx.worldToScreen(x, y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hashOf(v) { var s = String(v), h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // điểm (x, y) nằm trong đa giác pts phẳng [x0, y0, x1, y1, ...]
  function inside(pts, x, y) {
    var c = false, n = pts.length >> 1;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var ax = pts[i * 2], ay = pts[i * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c;
    }
    return c;
  }
  // chỗ (x, y) đang nằm trong vùng thấy được của đội người xem (mặt nạ tắt thì coi như sáng hết)
  function litAt(x, y) {
    if (!S.maskOn) return true;
    for (var i = 0; i < S.polys.length; i++) {
      var p = S.polys[i];
      if (p.pts && Math.abs(x - p.x) <= p.r + 0.5 && Math.abs(y - p.y) <= p.r + 0.5 && inside(p.pts, x, y)) return true;
    }
    return false;
  }

  // ---------- khởi động ----------
  V.init = function (canvas) {
    if (S.ready) return S.ready;
    var gfx = S.gfx = new HX.gfx.Gfx(canvas);
    S.fx = new HX.Fx(gfx);
    var caustic = gfx.tex('fx/E_Noise_Caustic_01A.png', true);
    caustic.wrapS = caustic.wrapT = THREE.RepeatWrapping;
    HX.gfx.water.uCaustic.value = caustic;
    S.mask = new VS.LightMask(gfx);
    S.tags = document.createElement('div');
    S.tags.className = 'vs-hud-tags';
    if (canvas.parentNode) canvas.parentNode.insertBefore(S.tags, canvas.nextSibling); else document.body.appendChild(S.tags);
    S.G = { gfx: gfx, fx: S.fx, audio: HX.audio, tags: S.tags };
    window.addEventListener('resize', function () { gfx.resize(); S.mask.resize(); });
    S.ready = Promise.all([
      S.fx.preload(['dive']), gfx.loadTex('fx/E_Noise_Caustic_01A.png', true), gfx.loadTex('fx/HarpoonProjectile.png'),
      gfx.loadTex('fx/HeadLight.png', true), gfx.loadTex('fx/E_Glow_01A.png', true), gfx.loadTex('fx/WaterFog.png', true),
      gfx.loadTex('props/O2Box_Body.png'), gfx.loadTex('props/O2Box_Head.png'), gfx.loadTex('props/Pod_ex.png'),
      VS.diverSheet.load(), HX.audio.load(SFX).catch(function () {}),
    ].concat(Object.keys(ZONE_ICON).map(function (k) { return gfx.loadTexUrl(VS.asset(ZONE_ICON[k])); }))).then(function () { return V; });
    return S.ready;
  };

  // ---------- kho báu ----------
  function lootTier(l) {
    var tiers = VS.TUNING.loot.tiers, v = l.value || 0;
    if (l.tier) return clamp(l.tier, 1, 3);
    return v <= tiers[0].value[1] ? 1 : v <= tiers[1].value[1] ? 2 : 3;
  }
  // l.art: 'bdl:…'/'hx:…' (VS.asset), tên ảnh trong art/dtd/loot của Biệt Đội Lặn, hoặc trống (chọn theo bậc).
  function lootUrl(l) {
    var a = l.art;
    if (a && a.indexOf(':') > 0) return VS.asset(a);
    if (a && a.indexOf('/') >= 0) return a;
    if (!a) { var pool = LOOT_ART[lootTier(l)]; a = pool[hashOf(l.id) % pool.length]; }
    return VS.asset('bdl:art/dtd/loot/' + a + (/\.png$/.test(a) ? '' : '.png'));
  }
  function lootView(l) {
    var url = lootUrl(l), tex = S.gfx.texUrl(url), tier = lootTier(l);
    var m = HX.gfx.sprite(tex, 1, 1, { alphaCut: 0.5, depthWrite: true });
    m.visible = false;
    S.gfx.scene.add(m);
    return { m: m, tex: tex, tier: tier, url: url, sized: false, ph: (hashOf(l.id) % 628) / 100, sparkT: Math.random() * 2, mark: null };
  }
  // Dấu mờ của món đội đã từng thấy mà giờ nằm trong tối: ảnh nhỏ trên lớp DOM (không qua mặt nạ tối).
  function showMark(v, x, y) {
    if (!v.mark) {
      v.mark = document.createElement('i');
      v.mark.className = 'vs-hud-mark';
      var im = document.createElement('img');
      im.alt = ''; im.src = v.url;
      v.mark.appendChild(im);
      S.tags.appendChild(v.mark);
    }
    var s = toScreen(x, y), s1 = toScreen(x + 1, y), px = Math.max(10, Math.round((s1.x - s.x) * LOOT_LEN[v.tier] * 0.85));
    var on = s.x > -40 && s.x < innerWidth + 40 && s.y > -40 && s.y < innerHeight + 40;
    v.mark.hidden = !on;
    if (on) { v.mark.style.width = px + 'px'; v.mark.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px) translate(-50%,-50%)'; }
  }
  function hideMark(v) { if (v.mark && !v.mark.hidden) v.mark.hidden = true; }
  function dropLoot(id) {
    var v = S.loot[id];
    S.gfx.scene.remove(v.m); v.m.material.dispose();
    if (v.mark) v.mark.remove();
    delete S.loot[id];
  }
  // Mã kho báu đội người xem đã từng soi thấy.
  function knownIds(m, viewer) {
    var out = {}, sim = VS.sim || {};
    if (!viewer || !viewer.team || !sim.known) return out;
    (sim.known(m, viewer.team) || []).forEach(function (l) { out[l.id] = 1; });
    return out;
  }
  function syncLoot(m, dt, viewer) {
    var seenIds = {}, known = knownIds(m, viewer);
    for (var i = 0; i < m.loot.length; i++) {
      var l = m.loot[i], v = S.loot[l.id] || (S.loot[l.id] = lootView(l));
      seenIds[l.id] = 1;
      if (!v.sized && v.tex.image && v.tex.image.width) {
        var iw = v.tex.image.width, ih = v.tex.image.height, k = LOOT_LEN[v.tier] / Math.max(iw, ih);
        v.w = iw * k; v.h = ih * k; v.sized = true;
      }
      if (!v.sized || l.st === 'banked') { v.m.visible = false; hideMark(v); continue; }
      var x = l.x, y = l.y, z = 0.05, sc = 1;
      if (l.st === 'carried') {
        var c = m.actors[l.by], cv = c && S.views[c.id];
        hideMark(v);
        if (!c || !cv || !cv.visible) { v.m.visible = false; continue; }
        // đồ đang mang treo sau lưng, món sau chồng lên món trước
        var k2 = (c.carry && c.carry.indexOf(l.id) >= 0) ? c.carry.indexOf(l.id) : 0;
        x = c.x - (cv.face || 1) * 0.38; y = c.y + 0.12 + k2 * 0.16; z = 0.095; sc = 0.6;
      } else {
        if (!litAt(l.x, l.y)) {
          v.m.visible = false;
          if (known[l.id]) showMark(v, l.x, l.y); else hideMark(v);
          continue;
        }
        hideMark(v);
        y += Math.sin(S.t * 1.6 + v.ph) * 0.04;
        v.sparkT -= dt;
        if (v.sparkT <= 0) {
          v.sparkT = 1.4 + Math.random() * 1.8;
          var cp = S.gfx.camera.position;
          if (Math.abs(x - cp.x) < 18 && Math.abs(y - cp.y) < 11) S.fx.spawn('glow', x + (Math.random() - 0.5) * v.w * 0.6, y + (Math.random() - 0.5) * v.h * 0.5, 0.08, 0, 0, 0.35 + v.tier * 0.12);
        }
      }
      v.m.visible = true;
      v.m.position.set(x, y, z);
      v.m.scale.set(v.w * sc, v.h * sc, 1);
    }
    Object.keys(S.loot).forEach(function (id) { if (!seenIds[id]) dropLoot(id); });
  }

  // ---------- đồ vẽ dựng tay: vòng, quạt, vệt (lưới tự dựng, vật liệu phẳng, dùng chung lưới theo khoá) ----------
  var DEG = Math.PI / 180, GEO = {};
  function geo(key, make) { return GEO[key] || (GEO[key] = make()); }
  function ringGeo(inner, arc) { return geo('ring:' + inner + ':' + arc, function () { return new THREE.RingGeometry(inner, 1, 40, 1, -arc / 2, arc); }); }
  function sectorGeo(arc) { return geo('sector:' + arc, function () { return new THREE.CircleGeometry(1, 36, -arc / 2, arc); }); }
  function discGeo() { return geo('disc', function () { return new THREE.CircleGeometry(1, 28); }); }
  // dải ngang dài 1, rộng 1, đuôi ở x = -1, đầu ở x = 0 (vệt tốc độ)
  function trailGeo() { return geo('trail', function () { var g = new THREE.PlaneGeometry(1, 1); g.translate(-0.5, 0, 0); return g; }); }
  // vòng răng cưa: bán kính 0,83..1 lệch ngẫu nhiên theo hạt, dùng cho sóng điện
  function jaggedGeo(seed) {
    return geo('jag:' + seed, function () {
      var n = 40, pos = [], idx = [], a = seed * 7919 + 13;
      function r() { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }
      for (var i = 0; i < n; i++) {
        var q = i / n * Math.PI * 2, o = 0.94 + r() * 0.06, inn = o - 0.025;
        pos.push(Math.cos(q) * inn, Math.sin(q) * inn, 0, Math.cos(q) * o, Math.sin(q) * o, 0);
        var j = (i + 1) % n;
        idx.push(i * 2, i * 2 + 1, j * 2, j * 2, i * 2 + 1, j * 2 + 1);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      return g;
    });
  }
  // thân cá mòi (mũi +x), thân + đuôi chữ V
  function fishGeo() {
    return geo('fish', function () {
      var s = new THREE.Shape();
      s.moveTo(0.5, 0); s.lineTo(0.05, 0.17); s.lineTo(-0.3, 0.05); s.lineTo(-0.55, 0.22); s.lineTo(-0.55, -0.22); s.lineTo(-0.3, -0.05); s.lineTo(0.05, -0.17); s.lineTo(0.5, 0);
      return new THREE.ShapeGeometry(s);
    });
  }
  // hàm Vồ Rắn: một nửa hàm = tam giác từ khớp (0, 0) ra mũi (0,9; 0), mép răng cưa
  function jawGeo() {
    return geo('jaw', function () {
      var s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(0.9, 0); s.lineTo(0.62, 0.1); s.lineTo(0.5, 0.02); s.lineTo(0.36, 0.12); s.lineTo(0.22, 0.03); s.lineTo(0.1, 0.12); s.lineTo(0, 0.05);
      return new THREE.ShapeGeometry(s);
    });
  }
  function flat(g, color, op, add, z) {
    var mt = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    var m = new THREE.Mesh(g, mt);
    m.position.z = z == null ? 0.3 : z; m.renderOrder = 6;
    S.gfx.scene.add(m);
    return m;
  }
  function dropMesh(m) {
    S.gfx.scene.remove(m);
    m.traverse(function (o) { if (o.material) o.material.dispose(); if (o.geometry && o.userData.ownGeo) o.geometry.dispose(); });
  }
  function place(m, x, y, rot, sx, sy) { m.position.x = x; m.position.y = y; m.rotation.z = rot || 0; m.scale.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, 1); }
  function eo(k) { k = k < 0 ? 0 : k > 1 ? 1 : k; return 1 - (1 - k) * (1 - k); }
  function headOf(a) { return a.ang != null ? a.ang : ((a.face || 1) > 0 ? 0 : Math.PI); }
  function effMag(a, kind, t) {
    var e = a && a.effects, best = null;
    if (!e) return null;
    for (var i = 0; i < e.length; i++) if (e[i].kind === kind && (e[i].until == null || e[i].until > t)) best = Math.max(best == null ? 0 : best, e[i].mag == null ? 1 : e[i].mag);
    return best;
  }

  // ---------- nét kỹ năng (sự kiện 'skill' {id, skill}) ----------
  // Mỗi nét: { t, dur, meshes, upd(f, dt, m) → false thì dừng sớm }. Chỉ đọc trận. Id kỹ năng lạ thì bỏ qua.
  var SKILL_FX = {
    // cung sóng trước mặt: quét ra rồi tan
    'quat-duoi': function (m, a, D) {
      var arc = (D.arc || 140) * DEG, R = D.r || 4.5, ang = headOf(a), x0 = a.x, y0 = a.y;
      var ring = flat(ringGeo(0.72, arc), 0xbfefff, 0.9, true), fill = flat(sectorGeo(arc), 0x7fd0ff, 0.26, true, 0.29);
      for (var i = 0; i < 7; i++) {
        var q = ang + (i / 6 - 0.5) * arc;
        S.fx.spawn('bubbleBig', x0 + Math.cos(q) * R * 0.7, y0 + Math.sin(q) * R * 0.7, 0.2, Math.cos(q) * 2.2, Math.sin(q) * 2.2, 1.3);
      }
      return { dur: 0.55, meshes: [ring, fill], upd: function (f) {
        var s = m.actors[a.id], k = f.t / f.dur, sc = R * (0.35 + 0.65 * eo(k * 1.7)), op = Math.pow(1 - k, 1.4);
        if (s) { x0 = s.x; y0 = s.y; }
        place(ring, x0, y0, ang, sc); place(fill, x0, y0, ang, sc);
        ring.material.opacity = 0.9 * op; fill.material.opacity = 0.26 * op;
      } };
    },
    // nón hút nước: chạy suốt thời gian kỹ năng, vòng cung co dần về miệng
    'hut-nuoc': function (m, a, D) {
      var arc = (D.arc || 70) * DEG, L = D.range || 8, id = a.id, chev = [], dur = D.dur || 2.5;
      var fill = flat(sectorGeo(arc), 0x5fd0ee, 0.14, true, 0.28);
      for (var i = 0; i < 4; i++) chev.push(flat(ringGeo(0.9, arc), 0xbfefff, 0.5, true, 0.29));
      return { dur: dur + 0.4, meshes: [fill].concat(chev), upd: function (f, dt) {
        var s = m.actors[id];
        if (!s) return false;
        var live = s.skill && s.skill.id === 'hut-nuoc' && s.skill.t > 0;
        // sống: mờ vào 0,2 s; hết kỹ năng: tan trong 0,3 s
        var k = live ? Math.min(1, f.t / 0.2) : Math.max(0, 1 - (f.t - Math.max(f.liveT || 0, 0)) / 0.3);
        if (live) f.liveT = f.t;
        var len = L * (0.25 + 0.75 * eo(f.t / 0.3)), ang = headOf(s);
        place(fill, s.x, s.y, ang, len); fill.material.opacity = 0.14 * k;
        for (var j = 0; j < chev.length; j++) {
          var ph = (f.t * 0.9 + j / chev.length) % 1;
          place(chev[j], s.x, s.y, ang, Math.max(0.2, len * (1 - ph)));
          chev[j].material.opacity = 0.55 * Math.sin(Math.PI * ph) * k;
        }
        if (live && Math.random() < dt * 22) {
          var q = ang + (Math.random() - 0.5) * arc, rr = len * (0.3 + Math.random() * 0.7);
          S.fx.spawn('bubbleBig', s.x + Math.cos(q) * rr, s.y + Math.sin(q) * rr, 0.2, -Math.cos(q) * 4, -Math.sin(q) * 4, 1);
        }
        if (!live && k <= 0) return false;
      } };
    },
    // vệt cưa: dải răng cưa từ chỗ bắt đầu lao tới chỗ cá mập đang ở
    'cua-xe': function (m, a, D) {
      var id = a.id, x0 = a.x, y0 = a.y, W = D.width || 1.4, maxL = D.dist || 6, N = 24;
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
      var idx = [];
      for (var i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
      g.setIndex(idx);
      var saw = flat(g, 0xff5a4f, 0.85, true); saw.userData.ownGeo = true;
      var core = flat(trailGeo(), 0xffffff, 0.8, true, 0.31), hx = x0 + 0.01, hy = y0, sparkT = 0;
      return { dur: 0.9, meshes: [saw, core], upd: function (f, dt) {
        var s = m.actors[id];
        if (s && f.t < 0.55) {
          var dx = s.x - x0, dy = s.y - y0, l = Math.hypot(dx, dy);
          if (l > maxL) { dx *= maxL / l; dy *= maxL / l; }
          if (l > 0.01) { hx = x0 + dx; hy = y0 + dy; }
          sparkT -= dt;
          if (sparkT <= 0 && l > 0.3) { sparkT = 0.05; S.fx.burst('spark', hx, hy, 2, 2.4, 0.3); }
        }
        var ex = hx - x0, ey = hy - y0, len = Math.hypot(ex, ey) || 0.01, nx = -ey / len, ny = ex / len, p = g.attributes.position.array;
        for (var i = 0; i <= N; i++) {
          var u = i / N, w = W / 2 * (i % 2 ? 0.4 : 1) * (0.35 + 0.65 * Math.min(1, u * 3));
          p[i * 6] = x0 + ex * u + nx * w; p[i * 6 + 1] = y0 + ey * u + ny * w; p[i * 6 + 2] = 0;
          p[i * 6 + 3] = x0 + ex * u - nx * w; p[i * 6 + 4] = y0 + ey * u - ny * w; p[i * 6 + 5] = 0;
        }
        g.attributes.position.needsUpdate = true;
        g.computeBoundingSphere();
        var op = 1 - Math.max(0, (f.t - 0.35) / 0.55);
        saw.material.opacity = 0.85 * op; core.material.opacity = 0.8 * op;
        place(core, hx, hy, Math.atan2(ey, ex), len, 0.08);
      } };
    },
    // bám: máu hút từ nạn nhân về cá mập, vòng đỏ nhịp quanh nạn nhân
    'khoet-thit': function (m, a, D) {
      var id = a.id, dur = D.dur || 5, ring = flat(ringGeo(0.92, Math.PI * 2), 0xff4a4a, 0.7, true), tick = 0;
      function victim(s) {
        if (s.holdId != null && s.holdId >= 0 && m.actors[s.holdId]) return m.actors[s.holdId];
        var best = null, bd = (D.range || 4) + 1.5;
        for (var i = 0; i < m.actors.length; i++) {
          var d = m.actors[i], dd = d.team === 'diver' && d.st !== 'out' ? Math.hypot(d.x - s.x, d.y - s.y) : 1e9;
          if (dd < bd) { bd = dd; best = d; }
        }
        return best;
      }
      return { dur: dur + 0.2, meshes: [ring], upd: function (f, dt) {
        var s = m.actors[id];
        if (!s || !(s.skill && s.skill.id === 'khoet-thit' && s.skill.t > 0)) { ring.material.opacity = 0; return f.t > 0.3 ? false : undefined; }
        var v = victim(s);
        if (!v) { ring.material.opacity = 0; return; }
        place(ring, v.x, v.y, 0, (v.r || 0.5) * (1.5 + 0.2 * Math.sin(f.t * 12)));
        ring.material.opacity = 0.55 + 0.25 * Math.sin(f.t * 12);
        tick -= dt;
        if (tick <= 0) { tick = 0.12; S.fx.spawn('blood', v.x, v.y, 0.3, (s.x - v.x) * 1.5, (s.y - v.y) * 1.5, 0.5); }
      } };
    },
    // sóng điện: ba vòng răng cưa lan ra rồi tan
    'cam-dien': function (m, a) {
      var x0 = a.x, y0 = a.y, ws = [];
      for (var i = 0; i < 3; i++) ws.push(flat(jaggedGeo(i + 1), i % 2 ? 0xfff08a : 0x9fe8ff, 0.8, true, 0.3 + i * 0.001));
      return { dur: 2.2, meshes: ws, upd: function (f) {
        for (var i = 0; i < ws.length; i++) {
          var k = (f.t - i * 0.3) / 1.6;
          if (k < 0 || k > 1) { ws[i].visible = false; continue; }
          ws[i].visible = true;
          place(ws[i], x0, y0, f.t * (3 + i), 0.6 + 34 * eo(k));
          ws[i].material.opacity = 0.8 * (1 - k);
        }
      } };
    },
    // vệt tốc độ sau lưng cá mập
    'lao-vut': function (m, a, D) { return speedTrail(m, a, D, 0xbfefff); },
    'toc-bien': function (m, a, D) { return speedTrail(m, a, D, 0xffc060); },
    // bong bóng đẩy bao quanh thợ lặn, bọt phụt ra phía sau
    'may-day': function (m, a, D) {
      var id = a.id, dur = D.dur || 4, ring = flat(ringGeo(0.93, Math.PI * 2), 0x9fe8ff, 0.55, true), halo = flat(discGeo(), 0x6fd0ff, 0.14, true, 0.29), tick = 0;
      return { dur: dur + 0.3, meshes: [ring, halo], upd: function (f, dt) {
        var s = m.actors[id];
        if (!s) return false;
        var live = s.skill && s.skill.id === 'may-day' && s.skill.t > 0, k = live ? Math.min(1, f.t / 0.2) : Math.max(0, 1 - (f.t - (f.liveT || 0)) / 0.3);
        if (live) f.liveT = f.t;
        var rr = (s.r || 0.5) * (1.9 + 0.12 * Math.sin(f.t * 10));
        place(ring, s.x, s.y, 0, rr); place(halo, s.x, s.y, 0, rr);
        ring.material.opacity = 0.55 * k; halo.material.opacity = 0.14 * k;
        tick -= dt;
        if (live && tick <= 0) {
          tick = 0.04;
          var sp = Math.hypot(s.vx || 0, s.vy || 0), bx = sp > 0.3 ? -(s.vx || 0) / sp : -(s.face || 1), by = sp > 0.3 ? -(s.vy || 0) / sp : 0;
          S.fx.spawn('bubbleBig', s.x + bx * rr * 0.8, s.y + by * rr * 0.8 + (Math.random() - 0.5) * 0.3, 0.25, bx * 3, by * 3, 1.4);
        }
        if (!live && k <= 0) return false;
      } };
    },
  };
  function speedTrail(m, a, D, color) {
    var id = a.id, dur = D.dur || 2, lines = [], tick = 0;
    for (var i = 0; i < 4; i++) lines.push(flat(trailGeo(), color, 0.5, true, 0.27));
    return { dur: dur + 0.3, meshes: lines, upd: function (f, dt) {
      var s = m.actors[id];
      if (!s) return false;
      var live = s.skill && s.skill.id === D.id && s.skill.t > 0, k = live ? Math.min(1, f.t / 0.15) : Math.max(0, 1 - (f.t - (f.liveT || 0)) / 0.3);
      if (live) f.liveT = f.t;
      var sp = Math.hypot(s.vx || 0, s.vy || 0), ang = sp > 0.5 ? Math.atan2(s.vy, s.vx) : headOf(s), r = s.r || 1, cx = Math.cos(ang), cy = Math.sin(ang);
      for (var i = 0; i < lines.length; i++) {
        var off = (i - 1.5) * r * 0.55, len = r * (2.4 + (i % 2) * 1.6) * (0.8 + 0.2 * Math.sin(f.t * 30 + i * 2));
        place(lines[i], s.x - cx * r * 0.8 - cy * off, s.y - cy * r * 0.8 + cx * off, ang, len, 0.06 + 0.03 * (i % 2));
        lines[i].material.opacity = 0.5 * k;
      }
      tick -= dt;
      if (live && tick <= 0) { tick = 0.05; S.fx.spawn('bubbleBig', s.x - cx * r, s.y - cy * r + (Math.random() - 0.5) * r, 0.25, -cx * 3, -cy * 3, 1.5); }
      if (!live && k <= 0) return false;
    } };
  }
  function addSkillFx(m, e) {
    var make = SKILL_FX[e.skill], a = m.actors[e.id], D = VS.SKILL_DATA && VS.SKILL_DATA[e.skill];
    if (!make || !a || !D) return;
    var v = S.views[a.id];
    if (!v || !v.visible) return;
    var f = make(m, a, D);
    if (f) { f.t = 0; S.sfx.push(f); }
  }
  function updateSkillFx(m, dt) {
    for (var i = S.sfx.length - 1; i >= 0; i--) {
      var f = S.sfx[i], ok = true;
      f.t += dt;
      if (f.t >= f.dur) ok = false;
      else if (f.upd(f, dt, m) === false) ok = false;
      if (!ok) { f.meshes.forEach(dropMesh); S.sfx.splice(i, 1); }
    }
  }
  function clearSkillFx() { S.sfx.forEach(function (f) { f.meshes.forEach(dropMesh); }); S.sfx = []; }

  // ---------- hiệu ứng trạng thái trên người: choáng, ngủ, lưới bám, giáp, lộ diện, mất đèn, chảy máu (cá mập) ----------
  // Thợ lặn chảy máu và thợ lặn / cá mập ngủ (đóng băng clip) đã có ở diverView / sharkView; ở đây là biểu tượng trên người.
  function iconTex(name) {
    S.icons = S.icons || {};
    if (S.icons[name]) return S.icons[name];
    var c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = c.height = 64;
    x.lineCap = 'round'; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (name === 'z') {
      x.font = '800 46px system-ui, sans-serif'; x.lineWidth = 6; x.strokeStyle = 'rgba(10,30,60,.9)'; x.fillStyle = '#d8ecff';
      x.strokeText('Z', 32, 34); x.fillText('Z', 32, 34);
    } else if (name === 'net') {
      // lưới: vòng tròn kẻ ô chéo
      x.strokeStyle = '#dcebf5'; x.lineWidth = 3;
      x.beginPath(); x.arc(32, 32, 29, 0, 6.3); x.stroke();
      x.save(); x.beginPath(); x.arc(32, 32, 29, 0, 6.3); x.clip();
      for (var k = -64; k <= 64; k += 12) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 64, 64); x.moveTo(k + 64, 0); x.lineTo(k, 64); x.stroke(); }
      x.restore();
    } else {
      x.strokeStyle = '#d6dde5'; x.fillStyle = 'rgba(214,221,229,.35)'; x.lineWidth = 5;
      x.beginPath(); x.arc(32, 28, 15, 0, 6.3); x.fill(); x.stroke();
      x.strokeRect(26, 46, 12, 8);
      x.strokeStyle = '#ff5a4f'; x.lineWidth = 6; x.beginPath(); x.moveTo(12, 56); x.lineTo(52, 8); x.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    return (S.icons[name] = t);
  }
  function glowSprite(w, tint, op) { return HX.gfx.sprite(S.gfx.tex('fx/E_Glow_01A.png', true), w, w, { additive: true, alphaCut: 0, tint: tint, opacity: op }); }
  function iconSprite(name, w) { return HX.gfx.sprite(iconTex(name), w, w, { alphaCut: 0.05, depthWrite: false }); }
  // vòng phẳng gắn vào nhóm (không để lại trong cảnh)
  function ringIn(g, parts, inner, color, op) { var r = flat(ringGeo(inner, Math.PI * 2), color, op, true, 0); S.gfx.scene.remove(r); g.add(r); parts.push(r); return r; }

  var OVERLAY = {
    stun: function (g, parts) { for (var i = 0; i < 3; i++) { var s = glowSprite(0.34, 0xffe45a, 1); g.add(s); parts.push(s); } },
    sleep: function (g, parts) { for (var i = 0; i < 2; i++) { var s = iconSprite('z', 0.4); g.add(s); parts.push(s); } },
    net: function (g, parts) { var s = iconSprite('net', 1); g.add(s); parts.push(s); },
    ripple: function (g, parts) { ringIn(g, parts, 0.94, 0x7fd0ff, 0.35); },
    armor: function (g, parts) {
      ringIn(g, parts, 0.95, 0xa8c8ff, 0.5);
      var f = flat(discGeo(), 0x8fb0ff, 0.1, true, 0); S.gfx.scene.remove(f); g.add(f); parts.push(f);
    },
    reveal: function (g, parts) { ringIn(g, parts, 0.95, 0xffd24a, 0.8); var s = glowSprite(1, 0xffd24a, 0.3); g.add(s); parts.push(s); },
    lightOff: function (g, parts) { var s = iconSprite('lamp', 0.5); g.add(s); parts.push(s); },
    bleed: function () {},
  };
  var OV_UPD = {
    stun: function (o, a, t) {
      var top = (a.r || 0.5) + 0.5;
      o.parts.forEach(function (s, i) { var q = t * 6 + i * 2.09; s.position.set(Math.cos(q) * 0.5, top + Math.sin(q) * 0.14, 0.02 * Math.cos(q)); s.material.uniforms.opacity.value = 0.7 + 0.3 * Math.sin(q * 2); });
    },
    sleep: function (o, a, t) {
      var top = (a.r || 0.5) + 0.3;
      o.parts.forEach(function (s, i) {
        var ph = (t * 0.6 + i * 0.5) % 1, sc = 0.25 + 0.3 * ph;
        s.position.set(0.15 + ph * 0.45, top + ph * 0.8, 0.02); s.scale.set(sc, sc, 1); s.material.uniforms.opacity.value = Math.min(1, (1 - ph) * 1.6);
      });
    },
    net: function (o, a, t) { var s = o.parts[0], r = (a.r || 0.5) * 2.6; s.scale.set(r, r, 1); s.rotation.z = Math.sin(t * 2) * 0.12; },
    ripple: function (o, a, t) { var r = (a.r || 0.5) * (1.15 + 0.08 * Math.sin(t * 6)); o.parts[0].scale.set(r, r, 1); o.parts[0].material.opacity = 0.3 + 0.12 * Math.sin(t * 6); },
    armor: function (o, a, t) {
      var r = (a.r || 0.5) * 1.35;
      o.parts.forEach(function (p) { p.scale.set(r, r, 1); });
      o.parts[0].material.opacity = 0.45 + 0.15 * Math.sin(t * 4); o.parts[1].material.opacity = 0.08 + 0.04 * Math.sin(t * 4);
    },
    reveal: function (o, a, t) {
      var r = (a.r || 0.5) * (1.7 + 0.15 * Math.sin(t * 5));
      o.parts[0].scale.set(r, r, 1); o.parts[0].material.opacity = 0.65 + 0.2 * Math.sin(t * 5);
      o.parts[1].scale.set(r * 2.2, r * 2.2, 1);
    },
    lightOff: function (o, a, t) { var s = o.parts[0]; s.position.set(0, (a.r || 0.5) + 0.55 + 0.05 * Math.sin(t * 3), 0.02); },
    bleed: function (o, a, t, dt, mag) {
      o.acc = (o.acc || 0) + dt * Math.min(10, 4 + (mag || 1));
      while (o.acc >= 1) { o.acc -= 1; S.fx.spawn('blood', a.x + (Math.random() - 0.5) * (a.r || 0.5), a.y + (Math.random() - 0.5) * 0.3, 0.25, 0, -0.5, 0.45); }
    },
  };
  function overlayKinds(a, t) {
    var out = [];
    if (effMag(a, 'stun', t) != null) out.push('stun');
    if (effMag(a, 'sleep', t) != null) out.push('sleep');
    var noDash = effMag(a, 'noDash', t) != null, slow = effMag(a, 'slow', t);
    if (noDash || (slow != null && slow >= 0.5)) out.push('net'); else if (slow != null) out.push('ripple');
    if (effMag(a, 'armor', t) != null) out.push('armor');
    if (effMag(a, 'reveal', t) != null) out.push('reveal');
    if (a.team === 'diver' && effMag(a, 'lightOff', t) != null) out.push('lightOff');
    if (a.team === 'shark' && effMag(a, 'bleed', t) != null) out.push('bleed');
    return out;
  }
  function syncOverlays(m, dt) {
    var seen = {}, t = m.t || 0;
    for (var i = 0; i < m.actors.length; i++) {
      var a = m.actors[i], v = S.views[a.id];
      if (!v || !v.visible || a.st === 'out' || !a.effects || !a.effects.length) continue;
      var kinds = overlayKinds(a, t);
      for (var j = 0; j < kinds.length; j++) {
        var kind = kinds[j], key = a.id + ':' + kind, o = S.ov[key];
        if (!o) {
          var g = new THREE.Group(), parts = [];
          OVERLAY[kind](g, parts);
          S.gfx.scene.add(g);
          o = S.ov[key] = { g: g, parts: parts, kind: kind };
        }
        seen[key] = 1;
        o.g.position.set(a.x, a.y, 0.3);
        OV_UPD[kind](o, a, S.t + a.id, dt, effMag(a, kind, t));
      }
    }
    Object.keys(S.ov).forEach(function (k) { if (!seen[k]) { dropMesh(S.ov[k].g); delete S.ov[k]; } });
  }
  function clearOverlays() { Object.keys(S.ov).forEach(function (k) { dropMesh(S.ov[k].g); }); S.ov = {}; }

  // ---------- mũi xiên, lưới, phi tiêu ----------
  var PROJ_KINDS = { harpoon: 1, snipe: 1, net: 1, dart: 1, sleep: 1, jaw: 1 };
  function projView(p) {
    var kind = p.kind || 'harpoon', o = { kind: kind, rope: null, m: null, spin: 0, extra: [] };
    if (!PROJ_KINDS[kind]) return null;
    if (kind === 'jaw') {
      // hàm cá mập: hai nửa hàm khép mở, dây đỏ sẫm nối về cá mập
      o.m = new THREE.Group();
      var up = flat(jawGeo(), 0xf1e8dc, 1, false, 0), lo = flat(jawGeo(), 0xf1e8dc, 1, false, 0), gum = flat(discGeo(), 0x7a1020, 0.9, false, -0.01);
      [up, lo, gum].forEach(function (x) { S.gfx.scene.remove(x); o.m.add(x); });
      gum.scale.set(0.22, 0.22, 1); lo.scale.y = -1; up.position.x = lo.position.x = -0.45; o.m.scale.set(1.6, 1.6, 1);
      o.up = up; o.lo = lo;
      o.m.renderOrder = 6;
    } else if (kind === 'net') {
      o.m = HX.gfx.sprite(iconTex('net'), 0.9, 0.9, { alphaCut: 0.05, depthWrite: false });
      o.spin = 7;
    } else {
      var dart = kind === 'dart' || kind === 'sleep', snipe = kind === 'snipe';
      o.m = HX.gfx.sprite(S.gfx.tex('fx/HarpoonProjectile.png'), SPEAR_LEN * (dart ? 0.7 : 1), SPEAR_W * (snipe ? 1.3 : dart ? 0.8 : 1), {
        alphaCut: 0.5, depthWrite: true, pivot: [1, 0.5], tint: dart ? 0xc89cff : snipe ? 0xffb0a0 : 0xffffff,
      });
      // vệt sáng sau đạn: ống ngắm đỏ nhạt dài, phi tiêu tím ngắn
      if (snipe || dart) {
        var tr = flat(trailGeo(), snipe ? 0xff8a70 : 0xb98cff, snipe ? 0.55 : 0.4, true, 0.1);
        o.extra.push(tr); o.trail = tr; o.trailLen = snipe ? 5 : 1.6; o.trailW = snipe ? 0.1 : 0.06;
      }
    }
    if (kind === 'harpoon' || kind === 'snipe' || kind === 'net' || kind === 'jaw') {
      o.rope = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: kind === 'jaw' ? 0x5a1722 : 0x14100c, side: THREE.DoubleSide }));
      o.rope.renderOrder = 1;
      S.gfx.scene.add(o.rope);
    }
    S.gfx.scene.add(o.m);
    return o;
  }
  function syncProjs(m, viewer, dt) {
    var alive = {};
    for (var i = 0; i < m.projs.length; i++) {
      var p = m.projs[i], o = S.projs[p.id];
      alive[p.id] = 1;
      if (o === undefined) {
        o = S.projs[p.id] = projView(p) || null;
        if (!S.seenProj[p.id]) {
          S.seenProj[p.id] = 1;
          var ow = m.actors[p.owner], ov = ow && S.views[ow.id];
          if (o && ov && ov.shot) ov.shot(S.t);
          if (o && ow) play(PROJ_SND[o.kind] || 'harpoon_shot', p.x, p.y, ow.team === 'diver' ? 0.55 : 0.7);
        }
      }
      if (!o) continue;
      var ang = Math.atan2(p.vy || 0, p.vx || 0);
      o.m.position.set(p.x, p.y, 0.12);
      o.m.rotation.z = o.spin ? S.t * o.spin : ang;
      if (o.up) {
        var open = 0.2 + 0.45 * (0.5 + 0.5 * Math.sin(S.t * 14));
        o.up.rotation.z = open; o.lo.rotation.z = -open;
      }
      if (o.trail) place(o.trail, p.x, p.y, ang, o.trailLen, o.trailW);
      if (o.kind === 'dart' && Math.random() < (dt || 0) * 18) S.fx.spawn('bubble', p.x, p.y, 0.1, 0, 0.3, 0.8);
      if (o.rope) {
        var own = m.actors[p.owner], vw = own && S.views[own.id];
        var show = !!own && !!vw && vw.visible;
        o.rope.visible = show;
        if (show) {
          var from = vw.ropeFrom ? vw.ropeFrom() : { x: own.x, y: own.y };
          var bare = o.kind === 'net' || o.kind === 'jaw';
          var tx = p.x - Math.cos(ang) * (bare ? 0 : SPEAR_LEN), ty = p.y - Math.sin(ang) * (bare ? 0 : SPEAR_LEN);
          var dx = tx - from.x, dy = ty - from.y, len = Math.hypot(dx, dy);
          o.rope.position.set((tx + from.x) / 2, (ty + from.y) / 2, 0.11);
          o.rope.rotation.z = Math.atan2(dy, dx);
          o.rope.scale.set(Math.max(0.01, len), o.kind === 'jaw' ? 0.07 : ROPE_W, 1);
        }
      }
    }
    Object.keys(S.projs).forEach(function (id) {
      if (alive[id]) return;
      dropProj(id);
    });
  }
  function dropProj(id) {
    var o = S.projs[id];
    delete S.projs[id];
    if (!o) return;
    dropMesh(o.m);
    o.extra.forEach(dropMesh);
    if (o.rope) { S.gfx.scene.remove(o.rope); o.rope.geometry.dispose(); o.rope.material.dispose(); }
  }

  // ---------- vùng kỹ năng (lồng, mực, mìn, pháo sáng, máy O₂, bầy cá) ----------
  var ZONE_KINDS = { ink: 1, bait: 1, swarm: 1, cage: 1, flare: 1, mine: 1, o2gen: 1, net: 1 };
  function zoneView(z) {
    var g = new THREE.Group(), parts = [], kind = z.kind, r = z.r || 2;
    function add(m, zz) { m.position.z = zz || 0; g.add(m); parts.push(m); return m; }
    function zring(color, op) {
      var ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r, 56), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      ring.userData.ownGeo = true;
      return add(ring, 0.05);
    }
    if (kind === 'ink') {
      add(HX.gfx.sprite(S.gfx.tex('fx/WaterFog.png', true), r * 2.6, r * 2.6, { alphaCut: 0.01, tint: 0x07080e, opacity: 0.92 }), 0.2);
      add(HX.gfx.sprite(S.gfx.tex('fx/WaterFog.png', true), r * 1.8, r * 1.8, { alphaCut: 0.01, tint: 0x07080e, opacity: 0.85 }), 0.21);
    } else if (kind === 'bait' || kind === 'swarm') {
      // bầy cá mòi: màn bạc mờ + 18 con bơi vòng quanh tâm
      add(HX.gfx.sprite(S.gfx.tex('fx/WaterFog.png', true), r * 2.4, r * 2.4, { alphaCut: 0.01, tint: 0x9fb2c2, opacity: 0.4 }), 0.2);
      for (var i = 0; i < 18; i++) {
        var f = flat(fishGeo(), i % 3 ? 0xc3d0da : 0xe6eef4, 0.95, false, 0.22 + (i % 4) * 0.005);
        S.gfx.scene.remove(f); g.add(f); parts.push(f);
        f.userData.fish = { rr: r * (0.25 + 0.7 * ((i * 0.618) % 1)), w: (0.8 + (i % 3) * 0.35) * (i % 2 ? 1 : -1), ph: i * 1.7, sz: 0.45 + (i % 3) * 0.12 };
      }
    } else if (kind === 'cage') {
      var ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r, 56), new THREE.MeshBasicMaterial({ color: 0xb8c2cc, side: THREE.DoubleSide }));
      ring.userData.ownGeo = true;
      add(ring, 0.15);
      for (var i2 = 0; i2 < 9; i2++) {
        var bar = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1), new THREE.MeshBasicMaterial({ color: 0x9aa6b2, side: THREE.DoubleSide }));
        var bx = -r + (i2 + 0.5) * (2 * r / 9), bh = 2 * Math.sqrt(Math.max(0, r * r - bx * bx));
        bar.scale.y = bh; bar.position.x = bx; bar.userData.ownGeo = true;
        add(bar, 0.15);
      }
    } else if (kind === 'flare') {
      add(HX.gfx.sprite(S.gfx.tex('fx/E_Glow_01A.png', true), 1.6, 1.6, { additive: true, alphaCut: 0, tint: 0xff7a3a, opacity: 1 }), 0.2);
      add(HX.gfx.sprite(S.gfx.tex('fx/HeadLight.png', true), r * 0.9, r * 0.9, { additive: true, alphaCut: 0, tint: 0xff9a5a, opacity: 0.18 }), 0.19);
    } else if (ZONE_ICON[kind]) {
      add(HX.gfx.sprite(S.gfx.texUrl(VS.asset(ZONE_ICON[kind])), 0.7, 0.7, { alphaCut: 0.4, depthWrite: true }), 0.06);
      add(HX.gfx.sprite(S.gfx.tex('fx/E_Glow_01A.png', true), 0.9, 0.9, { additive: true, alphaCut: 0, tint: kind === 'mine' ? 0xff3030 : 0x60d0ff, opacity: 0.8 }), 0.07);
      // vòng bán kính tác dụng: mìn đỏ mờ, máy O₂ xanh mờ
      if (kind === 'mine') zring(0xff4040, 0.22); else if (kind === 'o2gen') zring(0x60d0ff, 0.3);
    }
    S.gfx.scene.add(g);
    return { g: g, parts: parts, kind: kind, t: 0 };
  }
  // sprite dùng chung lưới tấm phẳng của gfx.js: chỉ trả lưới riêng (vòng, song lồng)
  function disposePart(p) { if (p.userData.ownGeo) p.geometry.dispose(); p.material.dispose(); }
  function syncZones(m, dt) {
    var alive = {}, list = m.zones || [];
    for (var i = 0; i < list.length; i++) {
      var z = list[i], key = z && z.id != null ? z.id : i;
      if (!z || !ZONE_KINDS[z.kind]) continue;
      var o = S.zones[key] || (S.zones[key] = zoneView(z));
      alive[key] = 1;
      o.t += dt;
      o.g.position.set(z.x, z.y, 0);
      if (o.kind === 'mine') o.parts[1].material.uniforms.opacity.value = Math.floor(S.t * 3) % 2 ? 0.9 : 0.15;
      if (o.kind === 'flare') o.parts[0].material.uniforms.opacity.value = 0.85 + 0.15 * Math.sin(S.t * 23);
      if (o.kind === 'ink') { o.parts[0].rotation.z = S.t * 0.2; o.parts[1].rotation.z = -S.t * 0.27; }
      if (o.kind === 'bait' || o.kind === 'swarm') {
        o.parts[0].rotation.z = S.t * 0.2;
        for (var q = 1; q < o.parts.length; q++) {
          var fp = o.parts[q], fd = fp.userData.fish, th = fd.ph + S.t * fd.w;
          fp.position.set(Math.cos(th) * fd.rr, Math.sin(th) * fd.rr * 0.8, fp.position.z);
          fp.rotation.z = th + (fd.w > 0 ? Math.PI / 2 : -Math.PI / 2);
          fp.scale.set(fd.sz, fd.sz, 1);
        }
      }
      if (o.kind === 'o2gen' && Math.random() < dt * 6) S.fx.spawn('bubble', z.x + (Math.random() - 0.5) * 0.4, z.y + 0.3, 0.1, 0, 0.6);
    }
    Object.keys(S.zones).forEach(function (k) {
      if (alive[k]) return;
      var o = S.zones[k];
      S.gfx.scene.remove(o.g);
      o.parts.forEach(disposePart);
      delete S.zones[k];
    });
  }

  // ---------- nạp / dỡ một trận ----------
  // glb của bản đồ nằm trong art/ của Hố Xanh; gắn số bản vì glb mới trùng tên tệp cũ
  function glbUrl(zone) { return HX.ROOT + 'art/' + zone.glb + (VS.REV ? '?v=' + VS.REV : ''); }
  function themeOf(m) {
    if (m.theme) return m.theme;
    for (var i = 0; i < VS.MAPS.length; i++) if (VS.MAPS[i].id === m.mapId) return VS.MAPS[i].theme;
    return 'day';
  }

  V.loadMatch = function (m, onProgress) {
    if (S.m) V.unloadMatch();
    var zone = window.HX_ZONES[m.mapId];
    if (!zone) return Promise.reject(new Error('map not found: ' + m.mapId));
    S.m = m; S.loaded = false; S.zone = zone; S.theme = themeOf(m);
    var prog = { glb: 0, rest: 0 }, report = function () { if (onProgress) onProgress(Math.min(1, prog.glb * 0.65 + prog.rest * 0.35)); };
    var sharkIds = [], diverIds = [];
    m.actors.forEach(function (a) {
      var list = a.team === 'shark' ? sharkIds : diverIds;
      if (list.indexOf(a.defId) < 0) list.push(a.defId);
    });
    S.sharkIds = sharkIds; S.diverIds = diverIds;
    var lootUrls = [];
    (m.loot || []).forEach(function (l) { var u = lootUrl(l); if (lootUrls.indexOf(u) < 0) lootUrls.push(u); });
    S.lootUrls = lootUrls;
    var done = 0, total = 3 + lootUrls.length;
    var tick = function (x) { done++; prog.rest = done / total; report(); return x; };
    var job = S.loading = Promise.all([
      S.ready || V.init(document.getElementById('gl')),
      HX.level.loadGlb(glbUrl(zone), function (p) { prog.glb = p; report(); }).then(function (g) { prog.glb = 1; report(); return g; }),
      HX.level.loadSpines(zone).then(tick),
      HX.Shark.preload(sharkIds, S.fx).then(tick),
      VS.diverSheet.load().then(function () { diverIds.forEach(VS.diverSheet.get); }).then(tick),
    ].concat(lootUrls.map(function (u) { return S.gfx.loadTexUrl(u).then(tick); }))).then(function (res) {
      if (S.m !== m || S.loading !== job) return null;
      build(m, res[1]);
      // thân cá mập gắn mô hình khi glb giải xong: chờ hết cho khung đầu đủ người
      return Promise.all(Object.keys(S.views).map(function (id) { return S.views[id].body ? S.views[id].body.ready : null; }));
    }).then(function () {
      if (S.m !== m || S.loading !== job) return;
      S.loaded = true; S.cam.snap = true;
      if (onProgress) onProgress(1);
    });
    return job;
  };

  function build(m, gltf) {
    var G = S.G;
    S.level = new HX.level.Layer(G, { zone: S.zone, yOff: 0 }, gltf);
    S.light = new HX.level.Light(S.zone, S.theme);
    S.rays = new HX.level.Rays(G);
    S.dust = new HX.level.Dust(G);
    S.surface = new HX.level.Surface(G);
    S.chests = new HX.level.Chests(G);
    S.pods = new HX.level.Pods(G);
    var di = 0;
    m.actors.forEach(function (a) {
      S.views[a.id] = a.team === 'shark' ? new VS.SharkView(G, a) : new VS.DiverView(G, a, di++);
    });
    S.t = 0; S.focusId = -1; S.seenProj = {};
    (m.projs || []).forEach(function (p) { S.seenProj[p.id] = 1; });
  }

  V.unloadMatch = function () {
    var G = S.G;
    S.loading = null;
    if (!G) { S.m = null; return; }
    Object.keys(S.views).forEach(function (id) { S.views[id].dispose(); });
    S.views = {};
    Object.keys(S.loot).forEach(dropLoot);
    S.loot = {};
    Object.keys(S.projs).forEach(dropProj);
    clearSkillFx(); clearOverlays();
    Object.keys(S.zones).forEach(function (k) {
      var o = S.zones[k];
      G.gfx.scene.remove(o.g);
      o.parts.forEach(disposePart);
    });
    S.zones = {};
    ['rays', 'dust', 'surface', 'chests', 'pods'].forEach(function (k) { if (S[k]) { S[k].remove(); S[k] = null; } });
    if (S.level) { S.level.remove(G); S.level = null; }
    if (S.zone) HX.level.dropGlb(glbUrl(S.zone));
    S.sharkIds.forEach(HX.Shark.drop);
    VS.diverSheet.disposeAll();
    S.lootUrls.forEach(function (u) { G.gfx.dropTexUrl(u); });
    S.fx.clear();
    HX.audio.stopAll();
    G.gfx.setMask(null);
    for (var i = 0; i < HX.gfx.LAMPS; i++) HX.gfx.water.uLamp.value[i] = 0;
    S.m = null; S.loaded = false; S.zone = null; S.light = null; S.polys = []; S.halos = [];
  };

  // ---------- tầm nhìn ----------
  // Đồng đội luôn vẽ; đối thủ chỉ vẽ khi luật tầm nhìn của mô phỏng nói thấy.
  function sight(m, viewer, a) {
    if (V.opts.allSeen || !viewer || !viewer.team || a.team === viewer.team) return true;
    var sim = VS.sim || {};
    if (sim.canSee) return !!sim.canSee(m, viewer.team, a);
    if (sim.visibleTo) return !!sim.visibleTo(m, viewer.team, a.x, a.y);
    return true;
  }

  // Người xem bị loại hẳn (thợ lặn hết lượt hồi sinh) thì camera theo đồng đội còn sống gần nhất; còn lượt (chờ hồi sinh)
  // hay là cá mập (luôn quay lại) thì camera ở với chính mình.
  function focusActor(m, viewer) {
    var me = viewer && m.actors[viewer.id];
    if (!me) return m.actors[0];
    if (!(me.st === 'out' && me.team === 'diver' && (m.tickets || 0) <= 0)) return me;
    var cur = m.actors[S.focusId];
    // đang xem một đồng đội còn sống thì giữ người đó, khỏi nhảy qua lại
    if (cur && cur !== me && cur.team === me.team && cur.st !== 'out') return cur;
    var best = me, bd = 1e9;
    for (var i = 0; i < m.actors.length; i++) {
      var a = m.actors[i];
      if (a === me || a.team !== me.team || a.st === 'out') continue;
      var d = Math.hypot(a.x - S.cam.x, a.y - S.cam.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  V.focus = function (m, viewer) { return focusActor(m, viewer); };
  // Độ sáng còn lại ngoài vùng thấy được: theo chủ đề bản đồ cho thợ lặn, sharkDark cho cá mập.
  function darkOf(viewer) {
    var Vt = VS.TUNING.vision, d = Vt.dark;
    if (viewer.team === 'shark' && Vt.sharkDark != null) return Vt.sharkDark;
    if (typeof d === 'number') return d;
    return d && d[S.theme] != null ? d[S.theme] : 0.1;
  }

  // Camera bám người xem (hay đồng đội đang theo dõi), nhìn trước theo vận tốc, giữ khung nhìn trong khung bản đồ.
  function updateCamera(f, dt) {
    var gfx = S.gfx, Vt = T.view, c = S.cam, snap = c.snap;
    gfx.distOverride = V.opts.camDist || 0;
    var vh = gfx.viewHalf();
    var tx = (f.vx || 0) * Vt.lookahead, ty = (f.vy || 0) * Vt.lookahead, tl = Math.hypot(tx, ty);
    if (tl > Vt.lookaheadMax) { tx *= Vt.lookaheadMax / tl; ty *= Vt.lookaheadMax / tl; }
    var k = snap ? 1 : 1 - Math.exp(-1.6 * dt);
    c.lx += (tx - c.lx) * k; c.ly += (ty - c.ly) * k;
    var x = f.x + c.lx, y = f.y + c.ly + 0.3, b = S.zone.bounds;
    x = b.maxX - b.minX > vh.w * 2 ? clamp(x, b.minX + vh.w, b.maxX - vh.w) : (b.minX + b.maxX) / 2;
    y = clamp(y, b.minY + vh.h * 0.55, Math.max(b.minY + vh.h * 0.55, Math.min(Vt.boundTop, b.maxY - vh.h * 0.3)));
    var k2 = snap ? 1 : 1 - Math.exp(-Vt.follow * dt);
    c.x += (x - c.x) * k2; c.y += (y - c.y) * k2;
    c.snap = false;
    gfx.camera.position.set(c.x, c.y, gfx.camDist());
    gfx.camera.updateMatrixWorld();
  }

  // Đèn pin của thợ lặn chiếu sáng đá và người trong shader nước (tối đa HX.gfx.LAMPS đèn).
  function updateLamps(m, env) {
    // Hố Xanh chỉ có một đèn và tắt hẳn ở vùng nông; ở đây mỗi thợ lặn một đèn nên hạ cường độ mỗi đèn
    var W = HX.gfx.water, n = 0, k = env.night ? 0.8 : clamp(0.15 + env.depth / 160, 0.15, 0.6);
    for (var i = 0; i < m.actors.length && n < HX.gfx.LAMPS; i++) {
      var a = m.actors[i];
      if (a.team !== 'diver' || !a.light || (a.st !== 'swim' && a.st !== 'held') || effMag(a, 'lightOff', m.t) != null) continue;
      var v = S.views[a.id], ang = v ? v.aimA : VS.DiverView.aimOf(a);
      W.uLampPos.value[n].set(a.x, a.y + 0.15, 0.6);
      W.uLampDir.value[n].set(Math.cos(ang), Math.sin(ang), -0.12).normalize();
      W.uLamp.value[n] = k;
      n++;
    }
    for (; n < HX.gfx.LAMPS; n++) W.uLamp.value[n] = 0;
  }

  // ---------- mỗi khung ----------
  V.render = function (m, dt, viewer) {
    if (!S.loaded || S.m !== m) return;
    var t0 = performance.now(), gfx = S.gfx;
    dt = Math.max(0, Math.min(0.25, dt || 0));
    S.t += dt;
    var f = V.opts.focus ? { id: -1, x: V.opts.focus.x, y: V.opts.focus.y, vx: 0, vy: 0 } : focusActor(m, viewer);
    S.focusId = f ? f.id : -1;
    if (f) updateCamera(f, dt);
    // vùng thấy được của đội người xem: dùng cho kho báu (chỉ vẽ khi sáng) và mặt nạ
    var sim = VS.sim || {};
    S.maskOn = !!(V.opts.mask && viewer && viewer.team && sim.visionPolys);
    S.polys = S.maskOn ? (sim.visionPolys(m, viewer.team) || []) : [];
    var env = S.light.update(gfx.camera.position.y);
    if (V.opts.plainGrade) { var P = HX.gfx.grade; P.uVig.value = 0; P.uChroma.value = 0; P.uBloom.value = 0; }
    S.rays.strength = env.rays;
    S.dust.depth = env.depth;
    updateLamps(m, env);
    var cp = gfx.camera.position, halos = [];
    for (var i = 0; i < m.actors.length; i++) {
      var a = m.actors[i], v = S.views[a.id];
      if (!v) continue;
      var seen = sight(m, viewer, a), mate = !viewer || a.team === viewer.team;
      v.update(a, dt, { visible: seen, mate: mate, self: !!viewer && a.id === viewer.id, t: S.t, mt: m.t, toScreen: toScreen,
        vol: clamp(1 - Math.hypot(a.x - cp.x, a.y - cp.y) / 30, 0, 1) });
      // đối thủ đang thấy được (có khi nhờ luật đèn hải đăng, mùi máu) mà nằm ngoài vùng sáng: quầng nhỏ cho khỏi chìm vào tối
      if (seen && !mate && a.st !== 'out') halos.push({ x: a.x, y: a.y, r: a.team === 'shark' ? (a.r || 1) * 2.2 : 1.5, k: 0.7 });
    }
    S.halos = halos;
    syncLoot(m, dt, viewer);
    S.chests.sync(m.o2 || [], m.t, dt);
    S.pods.sync(m.pods || [], dt);
    syncProjs(m, viewer, dt);
    syncZones(m, dt);
    syncOverlays(m, dt);
    updateSkillFx(m, dt);
    S.fx.update(dt);
    var vh = gfx.viewHalf();
    S.level.update(dt, cp, vh.w, vh.h);
    S.rays.update(S.t); S.dust.update(S.t); S.surface.update();
    // đá nhô trước mặt chơi che người đang theo dõi thì thưa dần quanh người đó
    if (f) {
      var p = new THREE.Vector3(f.x, f.y, 0).project(gfx.camera);
      HX.gfx.water.uCut.value.set((p.x + 1) / 2 * gfx.rtSize[0], (p.y + 1) / 2 * gfx.rtSize[1], T.view.cutRadius * gfx.rtSize[1] / (2 * vh.h));
    }
    if (S.maskOn) {
      S.mask.draw(S.polys, halos);
      gfx.setMask(S.mask.tex, darkOf(viewer));
    } else gfx.setMask(null);
    gfx.render(S.t);
    var ms = performance.now() - t0;
    S.frameMs = S.frameMs ? S.frameMs * 0.9 + ms * 0.1 : ms;
  };

  // ---------- sự kiện → hạt, tiếng ----------
  function play(key, x, y, vol) {
    var c = S.gfx.camera.position, k = clamp(1 - Math.hypot(x - c.x, y - c.y) / 30, 0, 1);
    if (k > 0.02) HX.audio.play(key, { vol: (vol == null ? 1 : vol) * k });
  }
  function actorOf(m, id) { return id != null ? m.actors[id] : null; }
  function posOf(m, e, id) {
    if (e.x != null && e.y != null) return { x: e.x, y: e.y };
    var a = actorOf(m, id);
    return a ? { x: a.x, y: a.y } : null;
  }
  var EV = {
    fire: function (m, e) { var v = S.views[e.owner != null ? e.owner : e.id]; if (v && v.shot) v.shot(S.t); },
    hit: function (m, e) {
      var tid = e.target != null ? e.target : e.id, p = posOf(m, e, tid);
      if (!p) return;
      S.fx.spawn('hit', p.x, p.y, 0.2, 0, 0, 0.9); S.fx.burst('spark', p.x, p.y, 3, 1.2, 0.2); S.fx.spawn('blood', p.x, p.y, 0.15, 0, 0, 0.9);
      var v = S.views[tid]; if (v && v.hurt) v.hurt();
      play('harpoon_hit', p.x, p.y, 0.8);
    },
    miss: function (m, e) {
      var p = posOf(m, e, e.owner);
      if (!p) return;
      S.fx.spawn('dust', p.x, p.y, 0.15, 0, 0, 0.8);
      play('harpoon_hit_rock', p.x, p.y, 0.6);
    },
    bite: function (m, e) {
      var tid = e.target != null ? e.target : e.id, p = posOf(m, e, tid);
      if (!p) return;
      var rec = S.fx.dive('bloodDave');
      if (rec) S.fx.play(rec, p.x, p.y, { z: 0.15, name: 'bite' }); else S.fx.spawn('blood', p.x, p.y, 0.15, 0, 0, 1.2);
      var v = S.views[tid]; if (v && v.hurt) v.hurt();
      play('dave_hit' + (1 + (hashOf(e.t + ':' + tid) % 3)), p.x, p.y, 0.9);
    },
    down: function (m, e) {
      var p = posOf(m, e, e.id);
      if (!p) return;
      var rec = S.fx.dive('bloodFatal');
      if (rec) S.fx.play(rec, p.x, p.y, { z: 0.15, name: 'down' }); else S.fx.spawn('blood', p.x, p.y, 0.15, 0, 0, 1.6);
      play('dave_dead', p.x, p.y, 0.8);
    },
    out: function (m, e) {
      var a = actorOf(m, e.id), p = posOf(m, e, e.id);
      if (!p) return;
      if (a && a.team === 'shark') { S.fx.spawn('blood', p.x, p.y, 0.1, 0, 0.2, 2.2); S.fx.burst('bubbleBig', p.x, p.y, 10, 1.4); }
      else { S.fx.spawn('column', p.x, p.y, 0.15, 0, 0.5, 1); S.fx.burst('bubble', p.x, p.y, 8, 1); }
    },
    bank: function (m, e) {
      var p = posOf(m, e, e.id);
      if (!p) return;
      S.fx.spawn('glow', p.x, p.y + 0.3, 0.2, 0, 0.2, 2.6);
      S.fx.burst('spark', p.x, p.y + 0.3, 6, 2.4, 0.2);
      S.fx.burst('bubbleBig', p.x, p.y, 14, 1.6);
      play('itembox', p.x, p.y, 0.8); play('qte_success', p.x, p.y, 0.45);
    },
    pickup: function (m, e) {
      var p = posOf(m, e, e.id);
      if (!p) return;
      S.fx.spawn('glow', p.x, p.y, 0.2, 0, 0.1, 1.1);
      play('itembox', p.x, p.y, 0.4);
    },
    o2: function (m, e) {
      var p = posOf(m, e, e.id);
      if (!p) return;
      S.fx.spawn('puff', p.x, p.y + 0.2, 0.1, 0, 0.3, 0.9); S.fx.burst('bubbleBig', p.x, p.y, 12, 1.2);
      play('o2_use', p.x, p.y, 0.8);
    },
    revive: function (m, e) { var p = posOf(m, e, e.id); if (p) { S.fx.spawn('puff', p.x, p.y, 0.1, 0, 0.3, 1); S.fx.burst('bubbleBig', p.x, p.y, 8, 1); } },
    stun: function (m, e) { var p = posOf(m, e, e.id); if (p) { S.fx.burst('spark', p.x, p.y, 5, 2, 0.2); play('gear_paralysis_hit', p.x, p.y, 0.5); } },
    skill: function (m, e) {
      var a = actorOf(m, e.id);
      if (!a || !e.skill) return;
      addSkillFx(m, e);
      if (SKILL_SND[e.skill]) play(SKILL_SND[e.skill], a.x, a.y, 0.6);
    },
  };
  EV.harpoonHit = EV.hit; EV.respawn = EV.revive;

  V.onEvents = function (m, events, viewer) {
    if (!S.loaded || S.m !== m || !events) return;
    for (var i = 0; i < events.length; i++) { var h = EV[events[i].type]; if (h) h(m, events[i], viewer); }
  };

  // ---------- toạ độ ----------
  V.screenToWorld = function (px, py) { return S.gfx ? S.gfx.screenToWorld(px, py) : { x: 0, y: 0 }; };
  V.worldToScreen = function (x, y) { return S.gfx ? S.gfx.worldToScreen(x, y) : { x: 0, y: 0 }; };
  V.snapCamera = function () { S.cam.snap = true; };

  // Số đo cho kiểm và bảng gỡ lỗi.
  V.stats = function () {
    if (!S.gfx) return null;
    var info = S.gfx.renderer.info;
    return {
      calls: S.gfx.stats.calls, triangles: S.gfx.stats.triangles, textures: info.memory.textures, geometries: info.memory.geometries,
      programs: info.programs ? info.programs.length : 0, frameMs: +S.frameMs.toFixed(2), particles: S.fx.count(), polys: S.mask.count,
      actors: Object.keys(S.views).length, loaded: S.loaded,
    };
  };
  V.debug = {
    state: function () { return S; },
    sight: sight,
    // khung trên màn hình (px CSS) của actor id theo tư thế vừa vẽ
    screenBox: function (id) {
      var v = S.views[id];
      if (!v) return null;
      return v instanceof VS.SharkView ? v.screenBox(S.gfx.camera) : v.screenBox(toScreen);
    },
    clearFx: function () { clearSkillFx(); clearOverlays(); },
    drawn: function (id) { var v = S.views[id]; return !!v && v.visible; },
    maskAt: function (sx, sy) { return S.mask.at(sx, sy); },
  };
  Object.defineProperty(V, 'gfx', { get: function () { return S.gfx; } });
})(window.VS = window.VS || {});
