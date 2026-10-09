// Không gian tên TD, bản lưu cục bộ và vài tiện ích dùng chung.
// Bản lưu nằm trong localStorage; trình duyệt chặn bộ nhớ (thẻ ẩn danh, iframe) thì game vẫn chạy với bản tạm.
(function (TD) {
  'use strict';
  TD.REV = TD.REV || '';
  const KEY = 'td.save.v1';
  const DEF = () => ({ v: 1, car: '04', driver: 'nam', track: '11citynew', name: 'Tay Đua', coins: 0, races: 0, wins: 0,
    best: {}, settings: { music: true, sfx: true, shake: true, hand: 'two' } });
  const S = { d: DEF() };
  S.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.v === 1) S.d = Object.assign(DEF(), d, { settings: Object.assign(DEF().settings, d.settings) });
      }
    } catch (e) { /* bộ nhớ bị chặn: dùng bản tạm */ }
    if (!TD.CARS[S.d.car]) S.d.car = Object.keys(TD.CARS)[0];
    if (!TD.TRACKS[S.d.track]) S.d.track = Object.keys(TD.TRACKS)[0];
    if (!TD.DRIVERS[S.d.driver]) S.d.driver = Object.keys(TD.DRIVERS)[0];
    return S.d;
  };
  S.save = function () { try { localStorage.setItem(KEY, JSON.stringify(S.d)); } catch (e) { /* bộ nhớ bị chặn */ } };
  TD.save = S;

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
