// HUD trong trận: prefab NGUI gốc `racehud` (data/ugui.js), mã này chỉ đổi giá trị từng nút (đường dẫn ở tools/UI.md).
// Bố cục cảm ứng "TwoSide" của bản gốc: mỗi bên một nút lái + Drift + phun nhỏ; nút phanh và hồi về đường.
// Trên máy tính (không cảm ứng) ẩn cụm nút, giữ đồng hồ tốc độ, thanh nitro, hạng, vòng, bản đồ nhỏ.
(function (TD) {
  'use strict';
  const H = { inst: null, cd: null, finish: null, canvas: null, ctx: null, w: 0, h: 0, dpr: 1, touch: false, mm: null };
  const CTRL = 'OperatingMode_TwoSide';
  const L = CTRL + '/AnchorLeftDown/Offset/', R = CTRL + '/AnchorRightDown/Offset/';
  const SN = 'DynamicUI/AnchorButtom/IG_SigleSpeedNitrogen/';
  const MM = 'StaticUI/AnchorTopRight/Offset/IG_MiniMapContainer/';
  const BUTTONS = [
    [L + 'LSteerButton', 'left'], [R + 'RSteerButton', 'right'], [L + 'LDriftButton', 'drift'], [R + 'RDriftButton', 'drift'],
    [L + 'SmallBoostButton', 'nitro'], [R + 'SmallBoostButton', 'nitro'], [L + 'BrakeBtn', 'brake'], [R + 'BrakeBtn', 'brake'],
    [L + 'ResetButton', 'reset'],
  ];
  // Nút của chế độ đạo cụ / ECU / nhảy: không có trong đua tốc độ đơn.
  const HIDE = [L + 'ActiveFeatureBtn', R + 'ActiveFeatureBtn', L + 'LeftPropParent', R + 'RightPropParent', L + 'LeftJumpBtn', R + 'RightJumpBtn',
    'DynamicUI/AnchorButtom/ECUEnergy', 'DynamicUI/AnchorButtom/HideRoot', 'StaticUI/AnchorButtom/HideRoot', MM + 'SeasonContractRoot', MM + 'BackCamBtn',
    MM + 'LimitRallyRoot'];

  function q(p) { return H.inst && H.inst.q(p); }
  function setOff(p, off) { const n = q(p); if (n) n.off = off; }

  H.init = function (canvas) {
    H.canvas = canvas; H.ctx = canvas.getContext('2d');
    H.inst = TD.ugui.inst('racehud');
    H.cd = TD.ugui.inst('countdown');
    for (const p of HIDE) setOff(p, true);
    for (const n of [R + 'ActiveFeatureBtn', L + 'ActiveFeatureBtn']) setOff(n, true);
    // Nút lái trái dùng chung sprite mũi tên phải với nút phải: lật gương.
    const ls = q(L + 'LSteerButton'); if (ls) ls.sc = [-1, 1];
    // Ba nút cùng tên DecimalLabel (một số, hai dấu chấm): lấy nút đang mang chữ số.
    const sp = q(SN + 'HideRoot/Speed/Speed');
    H.dec = sp && (sp.k || []).find((n) => n.n === 'DecimalLabel' && n.txt && /\d/.test(n.txt.s));
    H.press = {};
    H.resize();
    addEventListener('resize', H.resize);
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
    setOff(CTRL, !on);
    TD.input.setRects(on ? H.rects : null);
  };

  H.rects = function () {
    const out = [];
    for (const [p, id] of BUTTONS) {
      const r = H.inst.rectOf(p, H.w, H.h);
      if (!r) continue;
      // Nút gốc nhỏ (phanh 58×70 ở chuẩn 1280×720 còn ~31 px trên màn 390 px): nới vùng bấm tới 44 px, hình giữ nguyên.
      const w = Math.max(44, r.w), h = Math.max(44, r.h);
      out.push({ id, x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h });
    }
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
    H.lastCd = null; H.goT = 0;
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
    for (const side of [L, R]) {
      const b = q(side + 'SmallBoostButton');
      if (b && b.img) b.img.c = k.nitro.charges > 0 || k.nitro.miniWindowT > 0 ? [1, 1, 1, 1] : [0.55, 0.55, 0.6, 0.85];
      const m = q(side + 'SmallBoostButton/Mask');
      if (m && m.img) { m.img.fa = k.nitro.boostT > 0 ? k.nitro.boostT / TD.TUNING.nitroTime : 0; }
    }
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
