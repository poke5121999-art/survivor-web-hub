// Không gian tên TD, bản lưu cục bộ và vài tiện ích dùng chung.
// Bản lưu nằm trong localStorage; trình duyệt chặn bộ nhớ (thẻ ẩn danh, iframe) thì game vẫn chạy với bản tạm.
(function (TD) {
  'use strict';
  TD.REV = TD.REV || '';
  const KEY = 'td.save.v1', CLOUD_ID = 'toc-do';
  const DEF = () => ({ v: 1, car: '04', driver: 'nam', track: '11citynew', name: 'Tay Đua', coins: 0, races: 0, wins: 0, xp: 0,
    best: {}, paint: {}, settings: { music: true, sfx: true, shake: true, hand: 'one' }, ver: 0, at: 0 });
  // Bảng màu sơn chọn thêm ngoài màu gốc của xe: [màu 1, màu 2] là hệ số nhân qua mặt nạ như _paintColor1/2 gốc.
  TD.PAINTS = [
    { name: 'Đỏ', c: [[1, 0.06, 0.06], [0.95, 0.9, 0.85]] },
    { name: 'Cam', c: [[1, 0.42, 0.02], [0.1, 0.1, 0.12]] },
    { name: 'Lục', c: [[0.1, 0.85, 0.2], [1, 0.95, 0.4]] },
    { name: 'Tím', c: [[0.55, 0.15, 1], [0.1, 0.9, 1]] },
    { name: 'Hồng', c: [[1, 0.25, 0.65], [1, 1, 1]] },
    { name: 'Đen', c: [[0.08, 0.08, 0.1], [1, 0.8, 0.1]] },
  ];
  TD.PAINTS.forEach((p, i) => { TD.PAINTS[i] = p.c; TD.PAINTS[i].name = p.name; });
  const S = { d: DEF() };
  // Bản lưu là chuỗi sửa được bằng devtools và bản đám mây có thể cũ: bù khoá thiếu, vứt id lạ.
  function norm(d) {
    const o = Object.assign(DEF(), d, { settings: Object.assign(DEF().settings, d.settings) });
    const paint = {}, np = TD.PAINTS.length;
    if (o.paint && typeof o.paint === 'object') for (const k of Object.keys(o.paint)) if (TD.CARS[k] && o.paint[k] >= 0 && o.paint[k] <= np) paint[k] = o.paint[k] | 0;
    o.paint = paint;
    o.ver = o.ver | 0; o.at = Number(o.at) || 0;
    o.xp = Math.max(0, Math.floor(Number(o.xp) || 0));   // bản lưu cũ không có xp
    if (!TD.CARS[o.car]) o.car = Object.keys(TD.CARS)[0];
    if (!TD.TRACKS[o.track]) o.track = Object.keys(TD.TRACKS)[0];
    if (!TD.DRIVERS[o.driver]) o.driver = Object.keys(TD.DRIVERS)[0];
    return o;
  }
  S.load = function () {
    let d = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const j = JSON.parse(raw); if (j && j.v === 1) d = j; }
    } catch (e) { /* bộ nhớ bị chặn: dùng bản tạm */ }
    S.d = norm(d || {});
    S.sync();
    return S.d;
  };
  let timer = 0;
  function local() { try { localStorage.setItem(KEY, JSON.stringify(S.d)); } catch (e) { /* bộ nhớ bị chặn */ } }
  function cloudOn() { try { return !!(window.HubSave && window.HubSave.storeSave && (!window.HubSave.isAvailable || window.HubSave.isAvailable())); } catch (e) { return false; } }
  function push() {
    timer = 0;
    if (!cloudOn()) return;
    try { Promise.resolve(window.HubSave.storeSave(CLOUD_ID, S.d, { version: S.d.ver })).catch(() => {}); } catch (e) { /* không chặn game */ }
  }
  S.save = function () {
    S.d.ver++; S.d.at = Date.now();
    local();
    if (cloudOn()) { clearTimeout(timer); timer = setTimeout(push, 3000); }
  };
  // Lúc vào game: bản đám mây mới hơn (theo at) thì lấy; cũ hơn thì để lần lưu tới đẩy lên. Không đụng bản đang đua.
  S.sync = async function () {
    try {
      if (!cloudOn()) return 'local';
      const r = await window.HubSave.loadSave(CLOUD_ID);
      if (!(r && r.ok && r.found && r.payload && r.payload.v === 1)) return 'local';
      const c = norm(r.payload);
      if (c.at <= S.d.at) return 'local';
      for (let i = 0; i < 120 && !document.querySelector('#ui .lobby, #ui:empty'); i++) await new Promise((ok) => setTimeout(ok, 500));
      if (c.at <= S.d.at) return 'local';
      S.d = c; local();
      if (document.querySelector('#ui .lobby') && TD.menu && TD.main) { TD.main.showCar(S.d.car, S.d.driver); TD.kartView.repaintHuman(); TD.menu.lobby(); }
      return 'cloud';
    } catch (e) { return 'local'; }
  };
  TD.save = S;

  // Cấp người chơi: cấp L cần 100 + 95·(L−1) XP để lên cấp L+1 (clip gốc: LV.2 hiện 34/195). Trần cấp 99 cho vòng lặp hữu hạn.
  TD.LEVEL = {
    need: (lv) => 100 + 95 * (lv - 1),
    of(xp) {
      let lv = 1;
      while (lv < 99 && xp >= TD.LEVEL.need(lv)) { xp -= TD.LEVEL.need(lv); lv++; }
      return { lv, into: lv >= 99 ? 0 : xp, need: TD.LEVEL.need(lv) };
    },
    // XP theo hạng về đích (hạng 1 = 79 như thẻ thưởng ở clip gốc); không về đích: 10.
    forPlace: (place, dnf) => (dnf ? 10 : [0, 79, 62, 50, 40, 32, 25][place] || 20),
  };

  const warned = new Set();
  TD.warnOnce = function (k, msg) { if (!warned.has(k)) { warned.add(k); console.warn(msg); } };

  TD.fmtTime = function (t) {
    if (t == null || !isFinite(t)) return '--:--.--';
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };

  TD.BOT_NAMES = ['Gió Bấc', 'Tia Chớp', 'Mèo Hoang', 'Bão Lửa', 'Sói Bạc', 'Cá Mập', 'Đại Bàng', 'Hổ Vằn', 'Kỳ Lân', 'Rồng Xanh',
    'Báo Đốm', 'Sao Băng', 'Phượng Hoàng', 'Nhện Đỏ', 'Thỏ Trắng', 'Ong Vàng'];
})(globalThis.TD = globalThis.TD || {});
