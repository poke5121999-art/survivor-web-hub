// Nền UI gốc (data/hs-ui.js + js/sk/ugui.js) vẽ trên canvas #hud ở pixel thiết bị, làm mượt ảnh BẬT cho sprite UI.
// Cung cấp: ngôn ngữ (I2 terms), Layer (một bản dựng prefab + nút bấm, hiệu ứng nhấn 0.95 như DOTween punch), toast, vẽ SK trong UI.
(function () {
  'use strict';
  const TT = window.TT = window.TT || {};
  const SK = window.SK, U = window.SK_UI, ug = SK.ugui;
  const UI = TT.ui = { lang: 'vi', ready: false, w: 0, h: 0, ctx: null, canvas: null, tweens: [], paused: false };

  // Chuỗi ngoài bảng I2 của game gốc (toast "chế độ solo", tên nhiệm vụ...). Giữ cạnh nhau để dễ dịch.
  const STR = {
    solo: { vi: 'Chế độ solo: chưa có', en: 'Solo mode: not available' },
    stopThem: { vi: 'CHẶN HỌ LẠI!', en: 'STOP THEM!' },
    level5: { vi: 'Cần cấp 5 để đổi tên', en: 'Reach level 5 to rename' },
    full: { vi: 'Năng lượng đã đầy', en: 'Energy is full' },
    poor: { vi: 'Không đủ tiền', en: 'Not enough money' },
    noAds: { vi: 'Chế độ solo: chưa có quảng cáo', en: 'Solo mode: no ads' },
    plusGold: { vi: '+ %n vàng', en: '+ %n gold' },
    caught: { vi: 'bắt', en: 'caught' },
    quit: { vi: 'Thoát phòng?', en: 'Leave room?' },
    stats: { vi: 'Số trận', en: 'Matches' },
    wins: { vi: 'Thắng', en: 'Wins' },
    hideWins: { vi: 'Thắng khi trốn', en: 'Hide wins' },
    seekWins: { vi: 'Thắng khi tìm', en: 'Seek wins' },
    seekerName: { vi: 'Người tìm', en: 'Seeker' },
    hiderName: { vi: 'Người trốn', en: 'Hider' },
    noSkill: { vi: 'Chưa có kỹ năng', en: 'No skill yet' },
    low: { vi: 'THẤP', en: 'LOW' }, medium: { vi: 'VỪA', en: 'MEDIUM' }, high: { vi: 'CAO', en: 'HIGH' }
  };
  UI.str = k => (STR[k] || {})[UI.lang] || (STR[k] || {}).vi || k;
  UI.term = k => { const e = U.terms[k]; return e ? (e[UI.lang] || e.vi || k) : k; };

  UI.fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ---- khởi tạo: canvas hud, làm mượt ảnh luôn bật cho ugui, nạp sheet + font
  const smoothDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'imageSmoothingEnabled');
  UI.setSmooth = (ctx, on) => smoothDesc.set.call(ctx, on);   // đi vòng qua chặn của ugui: dùng cho pixel art SK trong UI

  UI.init = function (hudCanvas, hctx) {
    UI.canvas = hudCanvas; UI.ctx = hctx;
    Object.defineProperty(hctx, 'imageSmoothingEnabled', { get() { return smoothDesc.get.call(hctx); }, set() { smoothDesc.set.call(hctx, true); } });
    smoothDesc.set.call(hctx, true);
    return ug.load().then(() => { UI.ready = ug.ok; return ug.ok; });
  };

  // ---- chữ theo ngôn ngữ
  UI.applyLang = function (n) {
    if (n.txt && n.txt.term && !n.txt.dyn) {
      const e = U.terms[n.txt.term];
      if (e) n.txt.s = n.txt.uc ? (e[UI.lang] || e.vi || '').toUpperCase() : (e[UI.lang] || e.vi || '');
    }
    for (const c of n.k || []) UI.applyLang(c);
  };
  // chữ tính từ mã (số, tên): đánh dấu dyn để đổi ngôn ngữ không ghi đè
  UI.setText = function (n, s) { if (n && n.txt) { n.txt.s = s; n.txt.dyn = 1; } };
  UI.show = (n, on) => { if (!n) return; if (on) delete n.off; else n.off = 1; };

  UI.sfx = function (name) { try { if (TT.audio && TT.audio.play) TT.audio.play(name); } catch (e) { /* tiếng không được làm hỏng UI */ } };
  UI.vibrate = function (ms) { try { if (TT.save.d.settings.vib && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* không hỗ trợ */ } };

  // ---- hiệu ứng nhấn: xuống 0.95, thả bật nhẹ (DOTween punch)
  function startTween(n, kind) {
    const base = n.__base || (n.__base = n.sc ? n.sc.slice() : [1, 1]);
    let tw = UI.tweens.find(t => t.n === n);
    if (!tw) UI.tweens.push(tw = { n, base, t: 0, kind });
    tw.kind = kind; tw.t = 0; tw.from = n.sc ? n.sc[0] / base[0] : 1;
  }
  UI.update = function (dt) {
    for (let i = UI.tweens.length - 1; i >= 0; i--) {
      const tw = UI.tweens[i], n = tw.n;
      tw.t += dt;
      let k;
      if (tw.kind === 'down') { const u = Math.min(1, tw.t / 0.06); k = tw.from + (0.95 - tw.from) * u; }
      else { const u = Math.min(1, tw.t / 0.28); k = u < 0.25 ? 0.95 + 0.11 * (u / 0.25) : 1.06 - 0.06 * ((u - 0.25) / 0.75); }
      n.sc = [tw.base[0] * k, tw.base[1] * k];
      if (tw.kind === 'up' && tw.t >= 0.28) { n.sc = tw.base.slice(); if (tw.base[0] === 1 && tw.base[1] === 1) delete n.sc; delete n.__base; UI.tweens.splice(i, 1); }
    }
  };

  // ---- Layer: một bản dựng prefab + danh sách nút theo "phạm vi" (scope) để cửa sổ trên cùng nhận bấm trước
  class Layer {
    constructor(key) {
      this.key = key; this.H = ug.inst(key); this.root = this.H.root; this.btns = []; this.scope = 'main'; this.press = null;
      UI.applyLang(this.root);
    }
    q(path) { return this.H.q(path); }
    // nút: path (từ gốc prefab), fn, scope ('main' mặc định; '*' = luôn bật)
    bind(path, fn, scope) { this.btns.push({ path, fn, scope: scope || 'main', node: this.H.q(path) }); }
    rect(path) { return this.H.rectOf(path, UI.w, UI.h); }
    hit(x, y) {
      for (let i = this.btns.length - 1; i >= 0; i--) {
        const b = this.btns[i];
        if (b.scope !== this.scope && b.scope !== '*') continue;
        const R = this.H.rectOf(b.path, UI.w, UI.h);
        if (R && x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h) return b;
      }
      return null;
    }
    // x, y theo pixel thiết bị. Trả true nếu một nút nhận.
    down(x, y) {
      const b = this.hit(x, y);
      this.press = b;
      if (b && b.node) startTween(b.node, 'down');
      return !!b;
    }
    up(x, y) {
      const b = this.press; this.press = null;
      if (!b) return false;
      if (b.node) startTween(b.node, 'up');
      const again = this.hit(x, y);
      if (again === b) { UI.sfx('fx_btn1'); b.fn(); }
      return true;
    }
    cancel() { if (this.press && this.press.node) startTween(this.press.node, 'up'); this.press = null; }
    draw(ctx) { ctx.save(); this.H.draw(ctx, UI.w, UI.h); ctx.restore(); }
  }
  UI.Layer = Layer;

  // tìm con theo tên (con thứ n trùng tên: 'List[1]'), để đổi tên các nút trùng cho rectOf
  UI.child = function (n, seg) {
    const m = /^(.*?)(?:\[(\d+)\])?$/.exec(seg), want = +(m[2] || 0);
    let i = 0;
    for (const c of n.k || []) if (c.n === m[1] && i++ === want) return c;
    return null;
  };
  UI.find = function (root, path) { let n = root; for (const s of path.split('/')) { n = n && UI.child(n, s); } return n; };

  // bỏ cờ off của nút và mọi tổ tiên
  UI.reveal = function (root, path) {
    let n = root; const out = [];
    for (const s of path.split('/')) { n = UI.child(n, s); if (!n) return null; delete n.off; out.push(n); }
    return n;
  };

  // ---- ảnh nền menu gốc: 'LOADING SCREEN 2' phủ kín giữ tỉ lệ (như ui_preview bg=art)
  UI.drawArt = function (ctx, name, w, h) {
    const f = U.frames[name];
    ctx.fillStyle = '#2a9fe8'; ctx.fillRect(0, 0, w, h);
    if (!f) return;
    const k = Math.max(w / f[2], h / f[3]);
    ug.drawFrame(ctx, name, { x: (w - f[2] * k) / 2, y: (h - f[3] * k) / 2, w: f[2] * k, h: f[3] * k });
  };

  // ---- vẽ nhân vật SK (pixel art, không làm mượt) vào ô R theo toạ độ nút: cao ~ hpx
  UI.drawHero = function (ctx, heroId, R, t, scale) {
    const D = SK.D, hd = D && D.heroes && D.heroes[heroId];
    if (!hd) return;
    const s0 = hd.s0, fr = SK.animFrame(s0.idle, t), xf = SK.animPose(s0.idle, t, s0.bodyPath);
    ctx.save();
    UI.setSmooth(ctx, false);
    ctx.translate(R.x + R.w / 2, R.y + R.h * 0.82);
    ctx.scale(scale, scale);
    SK.draw(ctx, 'shadow2', 0, 0);
    SK.draw(ctx, fr, xf.dx, xf.dy, { sx: xf.sx, sy: xf.sy, rot: xf.rot });
    ctx.restore();
  };

  // ---- kích thước theo canvas hud; chất lượng đồ hoạ (SettingMenu 81-89): 0 thấp, 1 vừa, 2 cao
  UI.resize = function () {
    const c = UI.canvas; if (!c) return;
    const q = TT.save ? TT.save.d.settings.quality : 2, cap = [1, 1.5, 3][q] || 3;
    const dpr = Math.min(cap, window.devicePixelRatio || 1);
    SK.view.dpr = dpr;
    c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr);
    c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px';
    UI.w = c.width; UI.h = c.height; UI.dpr = dpr;
  };
  // css px -> pixel thiết bị
  UI.toDev = (cx, cy) => [cx * UI.w / innerWidth, cy * UI.h / innerHeight];

  // ---- toast (Launcher2.popupAlert): PopupAlert của prefab menu, tự ẩn sau 2 s
  UI.makeToast = function (layer) {
    const n = layer.q('PopupAlert'), txt = layer.q('PopupAlert/AlertTextText (TMP)');
    let left = 0;
    return {
      show(s) { UI.setText(txt, s); delete n.off; left = 2; },
      update(dt) { if (left > 0 && (left -= dt) <= 0) n.off = 1; }
    };
  };
})();
