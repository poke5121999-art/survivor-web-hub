// HUD trong trận: prefab NGUI gốc `racehud` (data/ugui.js), mã này chỉ đổi giá trị từng nút (đường dẫn ở tools/UI.md).
// Bố cục cảm ứng mặc định "OneSide" của bản gốc: bàn lái thoi bên trái, Drift to bên phải, phun nhỏ, phanh, hồi về đường.
// "TwoSide" (mỗi bên một bộ nút) vẫn có, chọn bằng TD.save.d.settings.hand = 'twoside'.
// Hạng sống, giờ đua, nhãn trạng thái (H.event) cũng dựng ở đây.
// Trên máy tính (không cảm ứng) ẩn cụm nút, giữ đồng hồ tốc độ, thanh nitro, hạng, vòng, bản đồ nhỏ.
(function (TD) {
  'use strict';
  const H = { over: {}, inst: null, cd: null, finish: null, canvas: null, ctx: null, w: 0, h: 0, dpr: 1, touch: false, mm: null, lay: null };
  const SN = 'DynamicUI/AnchorButtom/IG_SigleSpeedNitrogen/';
  const MM = 'StaticUI/AnchorTopRight/Offset/IG_MiniMapContainer/';
  const TL = 'HalfDyanamicUI/HangingView/AnchorTopLeft/';
  const TR = 'StaticUI/AnchorTopRight/Offset/';
  // Hai bố cục cảm ứng gốc. 'one' (OperatingMode_OneSide) là mặc định của bản gốc: một bàn lái hình thoi bên trái,
  // Drift to bên phải. 'two' (OperatingMode_TwoSide) là bản đối xứng, chọn bằng TD.save.d.settings.hand = 'twoside'.
  const C1 = 'OperatingMode_OneSide/KeysRoot/', L1 = C1 + 'AnchorLeftDown/Offset/', R1 = C1 + 'AnchorRightDown/Offset/';
  const C2 = 'OperatingMode_TwoSide', L2 = C2 + '/AnchorLeftDown/Offset/', R2 = C2 + '/AnchorRightDown/Offset/';
  const LAYOUTS = {
    one: {
      root: 'OperatingMode_OneSide', other: C2,
      // pad: vùng bấm TurnKeyRegion chia đôi; nút nào không nằm trong cây này bị tắt
      buttons: [[L1 + 'SteerBtnRoot/TurnKeyRegion', 'pad'], [R1 + 'DriftBtn', 'drift'], [R1 + 'SmallBoostButton', 'nitro'], [R1 + 'BrakeBtn', 'brake'], [L1 + 'ResetButton', 'reset']],
      boost: [R1 + 'SmallBoostButton'],
      press: { left: [L1 + 'SteerBtnRoot/LSteerButton'], right: [L1 + 'SteerBtnRoot/RSteerButton'], drift: [R1 + 'DriftBtn'], brake: [R1 + 'BrakeBtn'], nitro: [R1 + 'SmallBoostButton'] },
      hide: [R1 + 'ActiveFeatureBtn', R1 + 'PropParent', R1 + 'RearviewMirrorBtn', R1 + 'JumpBtn', C1 + 'AnchorCenter'],
    },
    two: {
      root: C2, other: 'OperatingMode_OneSide',
      buttons: [[L2 + 'LSteerButton', 'left'], [R2 + 'RSteerButton', 'right'], [L2 + 'LDriftButton', 'drift'], [R2 + 'RDriftButton', 'drift'],
        [L2 + 'SmallBoostButton', 'nitro'], [R2 + 'SmallBoostButton', 'nitro'], [L2 + 'BrakeBtn', 'brake'], [R2 + 'BrakeBtn', 'brake'], [L2 + 'ResetButton', 'reset']],
      boost: [L2 + 'SmallBoostButton', R2 + 'SmallBoostButton'],
      press: { left: [L2 + 'LSteerButton'], right: [R2 + 'RSteerButton'], drift: [L2 + 'LDriftButton', R2 + 'RDriftButton'], brake: [L2 + 'BrakeBtn', R2 + 'BrakeBtn'], nitro: [L2 + 'SmallBoostButton', R2 + 'SmallBoostButton'] },
      hide: [L2 + 'ActiveFeatureBtn', R2 + 'ActiveFeatureBtn', L2 + 'LeftPropParent', R2 + 'RightPropParent', L2 + 'LeftJumpBtn', R2 + 'RightJumpBtn'],
    },
  };
  // Nút của chế độ đạo cụ / ECU / nhảy: không có trong đua tốc độ đơn.
  const HIDE = ['DynamicUI/AnchorButtom/ECUEnergy', 'DynamicUI/AnchorButtom/HideRoot', 'StaticUI/AnchorButtom/HideRoot', MM + 'SeasonContractRoot', MM + 'BackCamBtn',
    MM + 'LimitRallyRoot'];

  function q(p) { return H.inst && H.inst.q(p); }
  H.q = q;
  function setOff(p, off) { const n = q(p); if (n) n.off = off; }

  // Bảng xếp hạng sống góc trên trái: dựng sẵn 8 hàng `rankitem` + 1 hàng `myrankitem` rồi mỗi khung gán theo hạng.
  const ROW_Y0 = 88, ROW_H = 35, MY_H = 52;
  function buildRankList() {
    const host = q(TL.slice(0, -1));
    if (!host) return;
    const mk = (key) => {
      const n = TD.ugui.clone(TD.UGUI.prefabs[key]);
      n.off = 1; host.k.push(n);
      // Chỉ giữ nền, tên, ảnh đại diện: các biểu tượng cờ chiếm điểm, huy hiệu xếp hạng, bong bóng chat... thuộc chế độ khác.
      for (const c of n.k) if (!['BG', 'Name', 'Head', 'Collider'].includes(c.n)) c.off = 1;
      const pick = (nm, f) => n.k.find((c) => c.n === nm && f(c));
      return { n, bg: n.k.find((c) => c.n === 'BG'), head: n.k.find((c) => c.n === 'Head'),
        name: pick('Name', (c) => key === 'myrankitem' ? !c.off : c.txt && c.txt.c[0] === 1 && c.off) };
    };
    H.rows = []; for (let i = 0; i < 8; i++) H.rows.push(mk('rankitem'));
    H.myRow = mk('myrankitem');
  }
  const TEAM_TINT = [[1, .45, .42], [.45, .72, 1]];   // Đội Đỏ / Đội Xanh (TD.TEAMS)
  const TINT = [[1, .62, .55], [.6, .85, 1], [.7, 1, .65], [1, .9, .5], [.85, .7, 1], [1, .75, .9], [.75, 1, 1], [1, .85, .7]];
  function updateRankList(race, me) {
    if (!H.rows) return;
    const order = race.karts.slice().sort((a, b) => (a.place || 99) - (b.place || 99));
    let y = ROW_Y0, ri = 0;
    for (const r of H.rows) r.n.off = 1;
    H.myRow.n.off = 1;
    for (const k of order) {
      const mine = k === me, r = mine ? H.myRow : H.rows[ri++];
      if (!r) continue;
      const h = mine ? MY_H : ROW_H;
      r.n.off = 0; r.n.p = [mine ? 34 : 42, -(y + h / 2)]; y += h;
      if (r.bg && r.bg.img) r.bg.img.c = mine ? [0.12, 0.44, 0.97, 0.78] : k.team === 0 ? [0.45, 0.06, 0.06, 0.6] : k.team === 1 ? [0.05, 0.18, 0.45, 0.6] : [0.03, 0.05, 0.1, 0.5];
      if (r.name && r.name.txt) { r.name.off = 0; r.name.txt.s = k.name; if (!mine) r.name.txt.fs = 18; }
      if (r.head) {
        r.head.off = 0;
        const t = r.head.k && r.head.k[0];
        if (t && t.img) t.img.c = (mine ? [1, 1, 1] : k.team != null ? TEAM_TINT[k.team] : TINT[k.id % TINT.length]).concat(1);
      }
    }
  }

  // Khối thời gian góc trên phải: giờ đua to, thêm hai dòng nhỏ "Kỷ lục" và "Vòng đơn" nhân từ prefab IG_PersonalRecord.
  function buildTimes() {
    const pr = q(TR + 'IG_PersonalRecord');
    if (!pr || !pr.k) return;
    const root = pr.k[0];
    root.p = [root.p[0] - 36, root.p[1]];   // hai dòng nhỏ thẳng mép phải với giờ đua to
    const lap = TD.ugui.clone(root);
    lap.p = [root.p[0], root.p[1] - 22];
    pr.k.push(lap);
    H.tm = { rec: root.k.find((c) => c.n === 'Label_Number'), lap: lap.k.find((c) => c.n === 'Label_Number'), lapT: lap.k.find((c) => c.n === 'TitleLabel'),
      big: q(TR + 'IG_FGTime/Root/Label_Number') };
    if (H.tm.lapT) H.tm.lapT.txt.s = 'Vòng đơn';
  }
  const fmt = (t) => {
    if (t == null || !isFinite(t)) return '--:--.--';
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };
  function updateTimes(race, k) {
    const T = H.tm; if (!T) return;
    const run = race.goT != null;
    const t = k.finishT != null ? k.finishT : run ? race.t - race.goT : 0;
    if (T.big) T.big.txt.s = fmt(t);
    const best = H.over.rec ? H.over.rec(race) : TD.save && TD.save.d.best[race.trackId];
    if (T.rec) T.rec.txt.s = fmt(best);
    if (T.lap) T.lap.txt.s = fmt(k.lapStartT != null && k.finishT == null ? race.t - k.lapStartT : run ? t : 0);
  }

  // Nhãn trạng thái trượt vào cạnh số tốc độ: "Drift Thẳng Nhanh", "Boost CWW", "Duy trì Nitro"...
  const LABELS = { start: 'Xuất Phát Nhanh', mini: 'Drift Thẳng Nhanh', dual: 'CW Boots', perfect: 'Boost CWW', nitro: 'Duy trì Nitro' };
  H.event = function (e, mine) {
    if (!mine) return;
    if (e.type === 'miniboost') H.say(LABELS[e.kind] || LABELS.mini);
    else if (e.type === 'nitro_start') H.say(LABELS.nitro);
  };
  H.say = function (s) { H.lab = { s, t: 0 }; };
  function drawStatus(g) {
    const L = H.lab; if (!L) return;
    const a = L.t < 0.2 ? L.t / 0.2 : L.t > 1.4 ? Math.max(0, 1 - (L.t - 1.4) / 0.4) : 1;
    if (a <= 0) { H.lab = null; return; }
    const r = H.inst.rectOf(SN + 'HideRoot/Speed/Speed/Label', H.w, H.h);
    if (!r) return;
    const u = H.h / 720, fs = Math.round(26 * u), ease = 1 - Math.pow(1 - Math.min(1, L.t / 0.25), 3);
    const x = r.x + r.w + 70 * u + (1 - ease) * 60 * u, y = r.y + r.h / 2 - 6 * u;
    g.save(); g.globalAlpha = a;
    g.font = 'italic 700 ' + fs + 'px skui_CafetaBold, sans-serif'; g.textBaseline = 'middle';
    const w = g.measureText(L.s).width;
    const gr = g.createLinearGradient(x - 24 * u, 0, x + w + 36 * u, 0);
    gr.addColorStop(0, 'rgba(255,140,20,0)'); gr.addColorStop(0.25, 'rgba(255,150,30,0.85)'); gr.addColorStop(1, 'rgba(255,90,10,0)');
    g.fillStyle = gr; g.beginPath();
    g.moveTo(x - 24 * u, y + fs * 0.62); g.lineTo(x - 4 * u, y - fs * 0.62); g.lineTo(x + w + 36 * u, y - fs * 0.62); g.lineTo(x + w + 16 * u, y + fs * 0.62); g.closePath(); g.fill();
    g.lineWidth = Math.max(2, 3 * u); g.strokeStyle = 'rgba(120,40,0,0.85)'; g.lineJoin = 'round'; g.strokeText(L.s, x, y);
    g.fillStyle = '#fff'; g.fillText(L.s, x, y);
    g.restore();
  }

  H.init = function (canvas) {
    H.canvas = canvas; H.ctx = canvas.getContext('2d');
    H.inst = TD.ugui.inst('racehud');
    H.cd = TD.ugui.inst('countdown');
    for (const p of HIDE) setOff(p, true);
    for (const l of Object.values(LAYOUTS)) for (const p of l.hide) setOff(p, true);
    // KeysRoot của OneSide là khung 100×100 giữa màn, trong khi các UIAnchor con neo theo màn: cho nó phủ kín màn.
    const kr = q(C1.slice(0, -1)); if (kr) { kr.a = [0, 0, 1, 1]; kr.p = [0, 0]; kr.sz = [0, 0]; }
    // Nút lái trái của TwoSide dùng chung sprite mũi tên phải với nút phải: lật gương.
    const ls = q(L2 + 'LSteerButton'); if (ls) ls.sc = [-1, 1];
    const l1 = q(L1 + 'SteerBtnRoot/LSteerButton'); if (l1) l1.sc = [-1, 1];
    // Ba nút cùng tên DecimalLabel (một số, hai dấu chấm): lấy nút đang mang chữ số.
    const sp = q(SN + 'HideRoot/Speed/Speed');
    H.dec = sp && (sp.k || []).find((n) => n.n === 'DecimalLabel' && n.txt && /\d/.test(n.txt.s));
    H.press = {};
    H.pickLayout();
    buildRankList();
    buildTimes();
    H.resize();
    addEventListener('resize', H.resize);
  };

  H.pickLayout = function () {
    const st = TD.save && TD.save.d && TD.save.d.settings;
    H.lay = LAYOUTS[st && st.hand === 'twoside' ? 'two' : 'one'];
    setOff(H.lay.other, true);
  };

  H.resize = function () {
    const c = H.canvas;
    H.dpr = Math.min(2, devicePixelRatio || 1);
    H.w = innerWidth; H.h = innerHeight;
    c.width = Math.round(H.w * H.dpr); c.height = Math.round(H.h * H.dpr);
    c.style.width = H.w + 'px'; c.style.height = H.h + 'px';
  };

  H.setTouch = function (on) {
    H.touch = on;
    H.pickLayout();
    setOff(LAYOUTS.one.root, true); setOff(LAYOUTS.two.root, true);
    if (on) setOff(H.lay.root, false);
    TD.input.setRects(on ? H.rects : null);
  };

  H.rects = function () {
    const out = [];
    for (const [p, id] of H.lay.buttons) {
      const r = H.inst.rectOf(p, H.w, H.h);
      if (!r) continue;
      if (id === 'pad') {
        // Bàn lái: vùng gốc 480×280 hơi tràn mép trái màn; cắt theo màn rồi chia đôi, nửa trái = -1, nửa phải = +1.
        const x0 = Math.max(0, r.x), x1 = r.x + r.w, mid = (x0 + x1) / 2;
        out.push({ id: 'left', x: x0, y: r.y, w: mid - x0, h: r.h }, { id: 'right', x: mid, y: r.y, w: x1 - mid, h: r.h });
        continue;
      }
      // Nút gốc nhỏ (phanh 58×70 ở chuẩn 1280×720 còn ~31 px trên màn 390 px): nới vùng bấm tới 44 px, hình giữ nguyên.
      const w = Math.max(44, r.w), h = Math.max(44, r.h);
      out.push({ id, x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h });
    }
    // Nút của plugin (ô đạo cụ, cờ luyện tập): mỗi plugin trả [{ id, x, y, w, h }] theo pixel CSS.
    for (const p of TD.racePlugins || []) if (p.rects) { try { out.push(...p.rects(H)); } catch (e) { console.error(e); } }
    return out;
  };

  // Minimap: vẽ ruy băng đường một lần vào canvas nhỏ, mỗi khung chỉ vẽ chấm xe lên trên.
  function buildMinimap(T) {
    const n = T.n, xs = T.x, zs = T.z;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]); }
    const S = 256, pad = 18, k = (S - pad * 2) / Math.max(x1 - x0, z1 - z0);
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const P = (i) => [pad + (xs[i] - x0) * k + ((S - pad * 2) - (x1 - x0) * k) / 2, pad + (zs[i] - z0) * k + ((S - pad * 2) - (z1 - z0) * k) / 2];
    g.lineJoin = g.lineCap = 'round';
    for (const [w, col] of [[11, 'rgba(10,20,40,0.55)'], [6, 'rgba(235,245,255,0.92)']]) {
      g.strokeStyle = col; g.lineWidth = w; g.beginPath();
      for (let i = 0; i < n; i++) for (const j of T.next[i]) { const a = P(i), b = P(j); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      g.stroke();
    }
    const c0 = T.cps[T.startCp], s = [pad + (c0.x - x0) * k + ((S - pad * 2) - (x1 - x0) * k) / 2, pad + (c0.z - z0) * k + ((S - pad * 2) - (z1 - z0) * k) / 2];
    g.fillStyle = '#ffd34a'; g.fillRect(s[0] - 5, s[1] - 2, 10, 4);
    H.mm = { c, k, x0, z0, x1, z1, S, pad, map: (x, z) => [pad + (x - x0) * k + ((S - pad * 2) - (x1 - x0) * k) / 2, pad + (z - z0) * k + ((S - pad * 2) - (z1 - z0) * k) / 2] };
  }

  H.start = function (race) {
    buildMinimap(race.T);
    const tot = q(MM + 'Turns/FGLap/Label_Nums'); if (tot && tot.txt) tot.txt.s = String(race.laps);
    H.lastCd = null; H.goT = 0; H.lab = null;
    // Plugin ghi đè được: over.rec(race) → thời gian "Kỷ lục" riêng (vd vòng nhanh nhất luyện tập). Dọn mỗi trận.
    H.over = {};
  };

  H.update = function (race, k, dt) {
    if (!H.inst) return;
    const kmh = Math.abs(k.speed) * 3.6;
    const sp = q(SN + 'HideRoot/Speed/Speed/Label');
    if (sp && sp.txt) sp.txt.s = String(Math.floor(kmh));
    if (H.dec) H.dec.txt.s = String(Math.floor(kmh * 10) % 10);
    const fg = q(SN + 'N2o/N2OShow/N2OProgress Bar/Foreground');
    if (fg && fg.img) fg.img.fa = Math.max(0, Math.min(1, k.nitro.gauge));
    const rank = q('HalfDyanamicUI/HangingView/AnchorTopLeft/RankPanel/Rank/Num');
    if (rank && rank.txt) rank.txt.s = String(k.place || 1);
    const tab = q('HalfDyanamicUI/HangingView/AnchorTopLeft/RankPanel/Rank/Tab');
    if (tab && tab.txt) tab.txt.s = ['', 'st', 'nd', 'rd'][k.place] || 'th';
    const lap = q(MM + 'Turns/FGLap/Label_Number');
    if (lap && lap.txt) lap.txt.s = String(Math.max(1, Math.min(race.laps, k.lap)));
    // Ô nitro: số bình đang có hiện trên nút phun (mỗi bên), mờ khi trống.
    for (const bp of H.lay.boost) {
      const b = q(bp);
      if (b && b.img) b.img.c = k.nitro.charges > 0 || k.nitro.miniWindowT > 0 ? [1, 1, 1, 1] : [0.55, 0.55, 0.6, 0.85];
      const m = q(bp + '/Mask');
      if (m && m.img) { m.img.fa = k.nitro.boostT > 0 ? k.nitro.boostT / TD.TUNING.nitroTime : 0; }
    }
    // Nút đang giữ thì co nhẹ như nút NGUI gốc khi bấm.
    const t = TD.input.touch;
    for (const id in H.lay.press) for (const pp of H.lay.press[id]) {
      const n = q(pp); if (!n) continue;
      const b = n._sc0 || (n._sc0 = n.sc || [1, 1]);
      n.sc = t[id] ? [b[0] * 0.93, b[1] * 0.93] : b;
    }
    updateRankList(race, k); updateTimes(race, k);
    if (H.lab) H.lab.t += dt;
    H.charges = k.nitro.charges;
    H.inst.tick(dt);
    // Đếm ngược: 3 → 2 → 1 → GO theo race.countdown.
    if (race.phase === 'countdown') {
      const c = Math.ceil(race.countdown);
      if (c !== H.lastCd) {
        H.lastCd = c;
        const idx = { 3: '01', 2: '02', 1: '03' }[c];
        for (const s of ['01', '02', '03', 'go']) { const n = H.cd.q('UIFX_CountDown_' + s); if (n) n.off = s !== idx; }
        H.cdPop = 0;
      }
    } else if (H.lastCd !== 'go' && race.phase === 'race') {
      H.lastCd = 'go'; H.goT = 1.0; H.cdPop = 0;
      for (const s of ['01', '02', '03', 'go']) { const n = H.cd.q('UIFX_CountDown_' + s); if (n) n.off = s !== 'go'; }
    }
    if (H.goT > 0) H.goT -= dt;
    H.cdPop = (H.cdPop || 0) + dt;
  };

  H.draw = function (race, karts, me) {
    const g = H.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, H.canvas.width, H.canvas.height);
    g.setTransform(H.dpr, 0, 0, H.dpr, 0, 0);
    H.inst.draw(g, H.w, H.h);
    drawStatus(g);
    if (TD.main && TD.main.plug) TD.main.plug('draw', g, H);
    // bản đồ nhỏ vào ô MiniMapTexture
    const r = H.inst.rectOf(MM + 'MiniMapRoot/MiniMapTexture', H.w, H.h);
    if (r && H.mm) {
      const m = H.mm, s = Math.min(r.w, r.h) / m.S, ox = r.x + (r.w - m.S * s) / 2, oy = r.y + (r.h - m.S * s) / 2;
      g.drawImage(m.c, ox, oy, m.S * s, m.S * s);
      for (const k of karts) {
        const p = m.map(k.x, k.z), x = ox + p[0] * s, y = oy + p[1] * s, isMe = k === me;
        g.beginPath(); g.arc(x, y, isMe ? 5 : 3.6, 0, Math.PI * 2);
        g.fillStyle = isMe ? '#ffd23a' : '#ff5a4e'; g.fill();
        g.lineWidth = 1.4; g.strokeStyle = '#102030'; g.stroke();
      }
    }
    // Hai ô nitro dưới thanh tiến độ: biểu tượng bình nitro gốc, sáng khi có.
    const bar = H.inst.rectOf(SN + 'N2o/N2OShow/N2OProgress Bar/Background', H.w, H.h);
    if (bar && TD.ugui.drawFrame) {
      const sz = bar.h * 1.15;
      for (let i = 0; i < TD.TUNING.maxCharges; i++) {
        const x = bar.x + bar.w + 6 + i * (sz * 0.95), y = bar.y + bar.h / 2 - sz / 2;
        TD.ugui.drawFrame(g, 'ID_PropsItem_N2oProp', { x, y, w: sz, h: sz });
        if (i >= H.charges) { g.fillStyle = 'rgba(8,16,30,0.72)'; g.beginPath(); g.arc(x + sz / 2, y + sz / 2, sz * 0.47, 0, Math.PI * 2); g.fill(); }
      }
    }
    if ((race.phase === 'countdown' && race.countdown <= 3) || H.goT > 0) {
      g.save();
      const pop = Math.max(0, 1 - H.cdPop * 4);
      const sc = 1 + pop * 0.6;
      g.translate(H.w / 2, H.h / 2); g.scale(sc, sc); g.translate(-H.w / 2, -H.h / 2);
      g.globalAlpha = race.phase === 'race' ? Math.max(0, Math.min(1, H.goT * 2)) : 1;
      H.cd.draw(g, H.w, H.h);
      g.restore();
    }
  };

  TD.hud = H;
})(globalThis.TD = globalThis.TD || {});
