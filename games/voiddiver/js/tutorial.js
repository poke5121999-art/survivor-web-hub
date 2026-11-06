// Bảng hướng dẫn nằm trên sàn của tutorial: ảnh phím (ImgTuto01..06) + chữ LocalizedText, dựng theo
// art/ui/tutorial/guides.json (tools/ui_tutorial_rip.py). Bản gốc là WorldSpaceCanvas nằm phẳng trong chính prefab sector
// (10009/10001/10004 → StaticDecoration/TutorialGuides/{Keyboard,Gamepad}), material Mtl_DE_WorldUI_Lit, luôn hiện, không ẩn theo bước
// Lua. Elara nói "Nhìn kỹ dưới sàn sẽ thấy thông tin hữu ích" (LQ_1100_9201) là nói về các bảng này. docs/DIVE.md §10.
(function (VD) {
  'use strict';
  const THREE = window.THREE;
  const DIR = 'art/ui/tutorial/';
  const PX_PER_M = 200;          // độ phân giải canvas chữ (TMP gốc: 1 px = 1 cm trên sàn)
  const LIFT = 0.02;             // nhấc khỏi sàn cho khỏi z-fighting — không có trong bảng

  const T = { data: null, group: null, meshes: [] };
  const TX = k => (VD.TEXT && VD.TEXT[k]) || '';

  T.load = function () {
    if (!T._p) T._p = fetch(DIR + 'guides.json').then(r => (r.ok ? r.json() : null)).then(j => (T.data = j)).catch(() => null);
    return T._p;
  };

  // Hộp của một phần tử UI trong canvas (đơn vị canvas = mét): anchorMin = anchorMax nên chỉ cần điểm neo + apos + pivot.
  function rectOf(p, canvas) {
    const cw = canvas ? canvas.size[0] : 100, ch = canvas ? canvas.size[1] : 100;
    const px = (p.anchor[0] - 0.5) * cw + p.apos[0], py = (p.anchor[1] - 0.5) * ch + p.apos[1];
    const w = p.size[0] * p.scale[0], h = p.size[1] * p.scale[1];
    const x0 = px - p.pivot[0] * w, y0 = py - p.pivot[1] * h;
    return { x0, y0, x1: x0 + w, y1: y0 + h, w, h };
  }

  // Canvas xoay X +90°: trục x canvas → x của bảng, trục y canvas → +z (forward) của bảng. Rồi yaw Unity, rồi vào sector.
  function toWorld(sec, g, cx, cy) {
    const x = cx * g.scale[0], z = cy * g.scale[2];
    const a = g.yaw * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const ux = g.pos[0] + x * c + z * s, uz = g.pos[2] - x * s + z * c;
    return VD.world.sectorPoint(sec, ux, uz);
  }

  function quad(sec, g, r, y, mat) {
    const pts = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]].map(([cx, cy]) => toWorld(sec, g, cx, cy));
    const pos = new Float32Array(12);
    pts.forEach(([x, z], i) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 2;
    return m;
  }

  // Material Lit gốc ăn ánh sáng: ở web cho qua bản vá tầm nhìn của môi trường (ngoài nón đèn thì tối như sàn).
  function material(map, color) {
    const mat = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (color) { mat.color.setRGB(color[0], color[1], color[2]); mat.opacity = color[3]; }
    // Bản vá nhân sáng trong nón (×1,55..3) cho vật liệu môi trường tối; bảng trắng thì cháy sáng, nên hạ nền xuống. [SUY LUẬN]
    mat.color.multiplyScalar(0.62);
    return VD.render && VD.render.patchSight ? VD.render.patchSight(mat) : mat;
  }

  const loader = new THREE.TextureLoader();
  function imageTex(name) {
    const t = loader.load(DIR + name + '.webp');
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }

  // Chữ TMP: Pretendard (LocalizationTextFont), cỡ m_fontSize (tự co tới m_fontSizeMin), căn theo m_HorizontalAlignment
  // (1 trái, 2 giữa, 4 phải) / m_VerticalAlignment (256 trên, 512 giữa, 1024 dưới), xuống dòng theo từ.
  function textTex(p, r) {
    const text = (TX(p.key) || String(p.text || '').replace(/^#/, '')).replace(/\\n/g, '\n').replace(/<[^>]+>/g, '');
    const W = Math.max(8, Math.round(r.w * PX_PER_M)), H = Math.max(8, Math.round(r.h * PX_PER_M));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const unit = p.scale[0] * PX_PER_M;        // px canvas cho mỗi đơn vị cỡ chữ TMP
    let size = (p.fontSize || 20) * unit, lines;
    const minSize = (p.fontSizeMin || 8) * unit;
    const wrap = () => {
      g.font = `400 ${size}px Pretendard, system-ui, sans-serif`;
      const out = [];
      for (const para of text.split('\n')) {
        let cur = '';
        for (const w of para.split(' ')) {
          const t = cur ? cur + ' ' + w : w;
          if (cur && g.measureText(t).width > W) { out.push(cur); cur = w; } else cur = t;
        }
        out.push(cur);
      }
      return out;
    };
    for (;;) {
      lines = wrap();
      const tooWide = lines.some(l => g.measureText(l).width > W), tooTall = lines.length * size * 1.2 > H;
      if (!p.autoSize || (!tooWide && !tooTall) || size <= minSize) break;
      size = Math.max(minSize, size - unit);
    }
    const c = p.color || [1, 1, 1, 1];
    g.fillStyle = '#fff';
    g.textBaseline = 'top';
    const lh = size * 1.2, total = lines.length * lh;
    let y = p.vAlign === 512 ? (H - total) / 2 : p.vAlign === 1024 ? H - total : 0;
    for (const l of lines) {
      const w = g.measureText(l).width;
      const x = p.hAlign === 1 ? 0 : p.hAlign === 4 ? W - w : (W - w) / 2;
      g.fillText(l, x, y + size * 0.08);
      y += lh;
    }
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return { tex: t, color: c };
  }

  // Dựng bảng của mọi sector đang nạp có trong guides.json: cả nhóm Keyboard lẫn Gamepad (ảnh ImgTuto0xPad, chữ riêng).
  // II_DeviceBasedObjectController gốc hiện nhóm theo thiết bị đang dùng; bản web theo VD.input.device, đổi khi có 'vd-device'.
  T.build = async function (sectors, scene) {
    T.clear();
    await T.load();
    if (!T.data || !T.data.sectors) return 0;
    try { if (document.fonts && document.fonts.load) await document.fonts.load('400 40px Pretendard'); } catch (e) { /* chữ dự phòng */ }
    T.group = new THREE.Group();
    T.group.name = 'tutorialGuides';
    T.sets = {};
    let n = 0;
    for (const dev of ['keyboard', 'gamepad']) {
      const grp = T.sets[dev] = new THREE.Group();
      grp.name = 'tutorialGuides_' + dev;
      T.group.add(grp);
      for (const sec of sectors) {
        const set = T.data.sectors[String(sec.cell.id)];
        if (!set) continue;
        for (const g of set[dev] || []) {
          let k = 0;
          for (const p of g.parts || []) {
            const r = rectOf(p, g.canvas), y = g.pos[1] + LIFT + (k++) * 0.002;
            let mesh;
            if (p.kind === 'image' && p.texture) mesh = quad(sec, g, r, y, material(imageTex(p.texture), p.color));
            else if (p.kind === 'text') { const tt = textTex(p, r); mesh = quad(sec, g, r, y, material(tt.tex, tt.color)); }
            if (!mesh) continue;
            mesh.userData = { guide: g.name, sector: sec.cell.id, part: p.node, key: p.key || p.texture, device: dev };
            grp.add(mesh); T.meshes.push(mesh);
          }
          if (dev === 'keyboard') n++;
        }
      }
    }
    T.setDevice(VD.input && VD.input.device);
    scene.add(T.group);
    return n;
  };

  T.setDevice = function (dev) {
    if (!T.sets) return;
    const pad = dev === 'gamepad';
    T.sets.keyboard.visible = !pad;
    T.sets.gamepad.visible = pad;
  };
  addEventListener('vd-device', e => T.setDevice(e.detail));

  T.clear = function () {
    if (T.group && T.group.parent) T.group.parent.remove(T.group);
    for (const m of T.meshes) { m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
    T.meshes = []; T.group = null; T.sets = null;
  };

  // Tâm các bảng trong toạ độ three (kiểm thử / gỡ lỗi). Mặc định nhóm đang hiện; dev = 'keyboard' | 'gamepad' để chọn.
  T.list = function (dev) {
    const out = new Map();
    const want = dev || (VD.input && VD.input.device === 'gamepad' ? 'gamepad' : 'keyboard');
    for (const m of T.meshes) {
      if (m.userData.device !== want) continue;
      const k = m.userData.sector + '/' + m.userData.guide;
      const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3());
      if (!out.has(k)) out.set(k, { sector: m.userData.sector, guide: m.userData.guide, x: c.x, z: c.z, parts: [] });
      out.get(k).parts.push(m.userData.key);
    }
    return [...out.values()];
  };

  // ---------------------------------------------------------------- Timeline gốc (tools/ui_tutorial_timeline.py → timeline.json)
  // intro = IntroTimelineObject (TL_World_OBJ_PhoneBooth_Intro), cutscene1100 = IngameCutScene_Chapter_01_TutorialCampaign_1.
  T.loadTimeline = function () {
    if (!T._tp) T._tp = fetch(DIR + 'timeline.json').then(r => (r.ok ? r.json() : null)).then(j => (T.tl = j)).catch(() => null);
    return T._tp;
  };
  T.loadTimeline();
  // Đường cong StreamedClip: đoạn từ khoá k: v(t) = ((a x + b) x + c) x + d, x = t − t_k. Trước khoá đầu lấy giá trị khoá đầu.
  T.curve = function (set, key, t, def) {
    const ks = set && set.curves && set.curves[key];
    if (!ks || !ks.length) return def;
    let k = ks[0];
    if (t <= k[0]) return k[4];
    for (let i = ks.length - 1; i >= 0; i--) if (ks[i][0] <= t) { k = ks[i]; break; }
    const x = t - k[0];
    return ((k[1] * x + k[2]) * x + k[3]) * x + k[4];
  };
  T.marker = (set, name, def) => { for (const tr of (set && set.tracks) || []) for (const m of tr.markers || []) if (m.signal === name) return m.time; return def; };
  T.clips = (set, cls) => ((set && set.tracks) || []).filter(tr => !tr.muted && tr.class.endsWith(cls)).flatMap(tr => tr.clips);
  T.timelineFor = prefab => { const tl = T.tl; if (!tl) return null; for (const k in tl) if (tl[k] && tl[k].prefab === prefab) return tl[k]; return null; };

  // Camera cắt cảnh: Vcam (Cinemachine, FOV 10) con của VcamOffset, VcamOffset con của CutSceneOffset, gốc prefab đặt ở điểm Lua.
  // AnimationTrack "Animation Track" (TrackOffset = ApplyTransformOffsets) ghi vị trí gốc VcamOffset: thế giới = offset.pos +
  // xoay(offset.euler.y) × đường cong; Vcam: vị trí cục bộ theo đường cong, nghiêng xuống theo quaternion của nút Vcam.
  // Trả điểm Vcam nhìn xuống sàn (toạ độ Unity so với gốc prefab) + khoảng cách tới đó. [SUY LUẬN: cách ghép offset theo
  // TrackOffset của Timeline; góc yaw 315° / nghiêng 30° trùng góc camera chơi nên web giữ góc, chỉ dời tâm + đổi khoảng cách]
  T.cutsceneCam = function (set, t) {
    const n = set.nodes || {}, tr = (set.tracks || []).find(x => x.name === 'Animation Track' && x.offset) || { offset: { pos: [0, 0, 0], euler: [0, 0, 0] } };
    const cso = n.CutSceneOffset || [0, 0, 0], vc = n['CutSceneOffset/VcamOffset/Vcam'] || [0, 0, 0, 0, 0, 0, 1];
    const C = (k, d) => T.curve(set, 'Animation Track|' + k, t, d);
    const rx = C(':localPosition.x', 0), rz = C(':localPosition.z', 0);
    const yaw = tr.offset.euler[1] * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const ox = tr.offset.pos[0] + rx * cy + rz * sy, oz = tr.offset.pos[2] - rx * sy + rz * cy;
    const vx = C('Vcam:localPosition.x', vc[0]), vy = C('Vcam:localPosition.y', vc[1]), vz = C('Vcam:localPosition.z', vc[2]);
    const pitch = 2 * Math.asin(Math.max(-1, Math.min(1, vc[3])));        // quaternion quanh X
    const lz = vz + vy / Math.tan(pitch || 0.5236);                       // tia nhìn của Vcam chạm sàn (cục bộ VcamOffset)
    const wx = cso[0] + ox + vx * cy + lz * sy, wz = cso[2] + oz - vx * sy + lz * cy;
    return { x: wx, z: wz, dist: vy / Math.sin(pitch || 0.5236), board: C('Vcam:m_Alpha', 0), shake: C('Vcam/cm:m_AmplitudeGain', 0) };
  };

  VD.tutorial = T;
})(window.VD = window.VD || {});
