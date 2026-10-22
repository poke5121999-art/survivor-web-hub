// Setting (Esc / nút menu): bố cục QualitySettingUI gốc (cột tab trái, tiêu đề + nút đóng trên, danh sách dòng
// SettingNormal / SettingSelect / SettingGauge), chữ theo clip 11:12 (Graphic) và 11:15 (Account).
// Tác dụng trên bản web:
//   Graphic Quality -> pixel ratio của renderer (Rất Thấp 0.5, Thấp 0.75, Trung Bình 1, Cao min(dpr, 1.5), Rất Cao min(dpr, 2)) [ĐỀ XUẤT]
//   Max FPS         -> chặn khung bằng requestAnimationFrame (30 / 45 / 60 / Không Giới Hạn)
//   Screen Mode     -> Fullscreen API (Toàn Màn Hình / Cửa Sổ)
//   Set Resolution  -> chỉ hiện cỡ cửa sổ (trình duyệt không đổi độ phân giải màn hình)
//   Shadow Quality  -> chỉ lưu: bản web chưa có bóng đổ thời gian thực
//   Camera Scale    -> nhân khoảng cách camera (FollowCamera.effDist) 0.50..1.20, mặc định 1.00 [ĐỀ XUẤT] khoảng giá trị
//   Âm lượng        -> Master = gain tổng, BGM = gain nhạc nền (phát lại bài khi đổi), FX = gain từng tiếng
// Thiết lập lưu ở localStorage['wos.settings'] (tiện ích từng máy).
import { paint } from '../ui/sprites.js?v=20261022c';
import { set } from '../state.js?v=20261022c';
import { makeLayer, T, notice, onTap } from './ui.js?v=20261022c';
import { L, LANG } from './text.js?v=20261022c';

const KEY = 'wos.settings';
export const DEFAULTS = { quality: 3, fps: 60, shadow: 2, camScale: 1, master: 10, bgm: 10, sfx: 10 };
export function loadSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || 'null') || {}) }; } catch (e) { return { ...DEFAULTS }; }
}
function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* bộ nhớ bị chặn */ } }

// ---- chặn FPS: bọc requestAnimationFrame một lần (vòng chơi three gọi window.requestAnimationFrame mỗi khung)
let fpsCap = 0;
const raf0 = window.requestAnimationFrame.bind(window), caf0 = window.cancelAnimationFrame.bind(window);
// Quyết định một lần mỗi khung trình duyệt (cùng timestamp): khung được chạy thì MỌI callback của khung đó chạy (vòng chơi,
// HUD, 9-slice...), khung bị bỏ thì tất cả dời sang khung sau. Chặn theo từng callback thì chỉ một callback mỗi khung lọt qua.
const ids = new Map(); let nextId = 1, lastT = -1e9, curT = -1, allow = true;
window.requestAnimationFrame = cb => {
  const id = nextId++;
  const run = t => {
    if (fpsCap) {
      if (t !== curT) { curT = t; allow = t - lastT >= 1000 / fpsCap - 2; if (allow) lastT = t; }
      if (!allow) { ids.set(id, raf0(run)); return; }
    }
    ids.delete(id); cb(t);
  };
  ids.set(id, raf0(run)); return id;
};
window.cancelAnimationFrame = id => { const r = ids.get(id); if (r != null) { caf0(r); ids.delete(id); } else caf0(id); };

const QUALITY_PR = [() => 0.5, () => 0.75, () => 1, () => Math.min(devicePixelRatio || 1, 1.5), () => Math.min(devicePixelRatio || 1, 2)];

// Áp thiết lập vào game (W = window.WOS). Gọi lúc vào game và mỗi lần đổi.
export function applySettings(W, s, changed) {
  fpsCap = s.fps > 0 && s.fps < 200 ? s.fps : 0;
  if (W && W.renderer && (!changed || changed === 'quality')) {
    const pr = QUALITY_PR[s.quality] ? QUALITY_PR[s.quality]() : 1;
    if (Math.abs(W.renderer.getPixelRatio() - pr) > 1e-3) { W.renderer.setPixelRatio(pr); dispatchEvent(new Event('resize')); }
  }
  if (W && W.camera) W.camScale = s.camScale;
  const a = W && W.audio;
  if (a) {
    a._wosSfx = s.sfx / 10; a._wosBgm = s.bgm / 10;
    if (a.master) a.master.gain.value = 0.8 * s.master / 10;
    if (changed === 'bgm' && a.bgmName && a.ctx && a.ctx.state === 'running') { a.bgmVol = (a._bgmBase ?? a.bgmVol) * a._wosBgm; a._bgmStart(); }
  }
}

// Gắn Setting vào game: W.openSetting(), Camera Scale, âm lượng, FPS. Gọi một lần sau khi boot xong.
export function attachSetting(W, platform) {
  const s = loadSettings();
  // Camera Scale: FollowCamera.effDist() * camScale (game.js đặt lại dist theo baseDist mỗi khung, nên nhân ở effDist)
  const cam = W.camera;
  if (cam && !cam._wosScaled) {
    const eff = cam.effDist.bind(cam); cam.effDist = () => eff() * (W.camScale || 1); cam._wosScaled = true;
  }
  const a = W.audio;
  if (a && !a._wosWrapped) {
    a._wosWrapped = true;
    const play = a.play.bind(a);
    a.play = (name, o = {}) => play(name, { ...o, gain: (o.gain ?? 1) * (a._wosSfx ?? 1) });
    const pb = a.playBgm.bind(a);
    a.playBgm = name => { const r = pb(name); const e = a.bgmEvent && a.index ? a.bgmEvent(name) : null; a._bgmBase = e ? (e.volume ?? 1) : a.bgmVol; a.bgmVol = (a._bgmBase ?? 1) * (a._wosBgm ?? 1); return r; };
    // AudioContext chỉ có sau lần nhập đầu: áp lại gain tổng khi nó xuất hiện
    const iv = setInterval(() => { if (a.master) { a.master.gain.value = 0.8 * loadSettings().master / 10; clearInterval(iv); } }, 500);
  }
  applySettings(W, s);
  W.openSetting = () => openSetting(W, platform);
  W.settings = s;
}

// ---------------------------------------------------------------- giao diện
const CATS = [
  { k: 'graphic', icon: 'Graphic', title: 'catGraphic' },
  { k: 'volume', icon: 'Sound', title: 'catVolume' },
  { k: 'language', icon: 'Language', title: 'Language' },
  { k: 'account', icon: 'Account', title: 'catAccount' },
];
let open = null;
export function openSetting(W, platform) {
  if (open) return open;
  const layer = makeLayer(platform === 'pc');
  layer.box.classList.add('setting'); layer.box.dataset.stage = 'setting';
  const s = loadSettings();
  set({ modal: 'setting' });
  const R = layer.root;
  const el = (parent, cls, css = {}) => { const e = document.createElement('div'); e.className = cls; Object.assign(e.style, css); parent.appendChild(e); return e; };
  el(R, 'sdim');
  const head = el(R, 'shead');
  const hic = el(head, 'shicon'); paint(hic, 'DialogueUI/Dialogue_Icon_Option');
  const htitle = T(head, '', 36, [0.737, 0.954, 1, 1], 'stitle');
  const close = el(R, 'sclose btn'); close.dataset.ui = 'settingClose'; paint(close, 'Common/Btn_Square_04_Medium');
  const cx = el(close, 'u', { left: '40px', top: '18px', width: '54px', height: '54px' }); paint(cx, 'Icon/Icon_Close_Btn');
  const catCol = el(R, 'scats');
  const list = el(R, 'slist'); list.dataset.ui = 'settingList';
  let cat = 0;
  const catEls = CATS.map((c, i) => {
    const b = el(catCol, 'scat btn'); b.dataset.ui = 'settingCat'; b.dataset.k = c.k;
    paint(b, i === 0 ? 'Category/Category_BG_Top' : i === CATS.length - 1 ? 'Category/Category_BG_Bottom' : 'Category/Category_BG_Middle_Vertical', { color: [1, 1, 1, 0.784] });
    const ic = el(b, 'u scicon'); b._ic = ic;
    onTap(b, () => { cat = i; draw(); });
    return b;
  });
  const commit = (k, v) => { s[k] = v; saveSettings(s); W.settings = s; applySettings(W, s, k); };
  const section = t => { const h = el(list, 'ssec'); T(h, t, 30, [1, 1, 1, 0.95]); };
  const row = (label, desc, n) => {
    const r = el(list, 'srow'); r.dataset.ui = 'row'; if (n) r.dataset.k = n;
    const tx = el(r, 'slab'); T(tx, label, 34, [0.086, 0.271, 0.424, 1], 'b'); if (desc) T(tx, desc, 25, [0.243, 0.486, 0.69, 1], 'd');
    return el(r, 'sctl');
  };
  const select = (ctl, key, opts, val) => {
    const box = el(ctl, 'ssel');
    const sel = document.createElement('select'); sel.dataset.ui = 'select'; sel.dataset.k = key;
    for (const [v, t] of opts) { const o = document.createElement('option'); o.value = String(v); o.textContent = t; sel.appendChild(o); }
    sel.value = String(val); box.appendChild(sel);
    const ar = el(box, 'sarrow'); paint(ar, 'Icon/Icon_Arrow_Down');
    sel.addEventListener('change', () => commit(key, isNaN(+sel.value) ? sel.value : +sel.value));
    return sel;
  };
  const gauge = (ctl, key, min, max, step, val, fmt) => {
    const g = el(ctl, 'sgauge');
    const rg = document.createElement('input'); rg.type = 'range'; rg.min = min; rg.max = max; rg.step = step; rg.value = val; rg.dataset.ui = 'range'; rg.dataset.k = key;
    g.appendChild(rg); const c = T(g, fmt(val), 28, [0.243, 0.486, 0.69, 1], 'scount');
    const fillPct = () => rg.style.setProperty('--p', ((rg.value - min) / (max - min) * 100) + '%');
    fillPct();
    rg.addEventListener('input', () => { c.textContent = fmt(+rg.value); fillPct(); if (key !== 'bgm') commit(key, +rg.value); });
    rg.addEventListener('change', () => commit(key, +rg.value));
    return rg;
  };
  const action = (ctl, label, fn, n) => {
    const b = el(ctl, 'sbtn btn'); b.dataset.ui = n; paint(b, 'Common/Btn_Square_02_Small_Blue', { sliced: true });
    T(b, label, 28, [0.086, 0.271, 0.424, 1]); const ar = el(b, 'u sbarrow'); paint(ar, 'Icon/Icon_Arrow_Option');
    onTap(b, fn); return b;
  };
  const draw = () => {
    catEls.forEach((b, i) => { b._ic.querySelectorAll('.spr').forEach(x => x.remove()); paint(b._ic, 'OptionUI/Category_Option_' + CATS[i].icon + (i === cat ? 'ON' : 'OFF')); b.classList.toggle('on', i === cat); });
    htitle.textContent = CATS[cat].title === 'Language' ? (LANG === 'en' ? 'Language' : 'Ngôn Ngữ') : L(CATS[cat].title);
    list.innerHTML = ''; list.dataset.cat = CATS[cat].k;
    const k = CATS[cat].k;
    if (k === 'graphic') {
      section(L('secSettings'));
      select(row(L('gq'), L('gqD'), 'quality'), 'quality', [[0, L('veryLow')], [1, L('low')], [2, L('medium')], [3, L('high')], [4, L('veryHigh')]], s.quality);
      select(row(L('fps'), L('fpsD'), 'fps'), 'fps', [[30, '30'], [45, '45'], [60, '60'], [999, L('unlimited')]], s.fps);
      section(L('secResolution'));
      const fs = !!document.fullscreenElement;
      const sm = select(row(L('screen'), L('screenD'), 'screen'), 'screen', [['full', L('full')], ['win', platform === 'pc' ? L('borderless') : L('windowed')]], fs ? 'full' : 'win');
      sm.addEventListener('change', () => {
        try { if (sm.value === 'full') document.documentElement.requestFullscreen().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* không hỗ trợ */ }
      });
      const rs = select(row(L('res'), L('resD'), 'res'), 'res', [['cur', `${innerWidth}x${innerHeight}`]], 'cur'); rs.disabled = true;
      select(row(L('shadow'), L('shadowD'), 'shadow'), 'shadow', [[0, L('off')], [1, L('low')], [2, L('high')]], s.shadow);
      gauge(row(L('cam'), L('camD'), 'camScale'), 'camScale', 0.5, 1.2, 0.01, s.camScale, v => v.toFixed(2));
    } else if (k === 'volume') {
      section(L('catVolume'));
      gauge(row(L('master'), L('masterD'), 'master'), 'master', 0, 10, 1, s.master, v => String(v));
      gauge(row(L('bgm'), L('bgmD'), 'bgm'), 'bgm', 0, 10, 1, s.bgm, v => String(v));
      gauge(row(L('sfx'), L('sfxD'), 'sfx'), 'sfx', 0, 10, 1, s.sfx, v => String(v));
    } else if (k === 'language') {
      section(LANG === 'en' ? 'Language' : 'Ngôn Ngữ');
      const ls = select(row(LANG === 'en' ? 'Language' : 'Ngôn Ngữ', '', 'lang'), 'lang', [['vi', 'Tiếng Việt'], ['en', 'English']], LANG);
      ls.addEventListener('change', () => { const u = new URL(location.href); if (ls.value === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang'); location.href = u.href; });
    } else {
      section(L('catAccount'));
      action(row(L('logout'), L('logoutD'), 'logout'), L('logout'), toTitle, 'logout');
      section(L('secGame'));
      action(row(L('toTitle'), L('toTitleD'), 'toTitle'), L('titleBtn'), toTitle, 'toTitle');
      action(row(L('exit'), L('exitD'), 'exit'), L('exit'), () => notice(layer, { body: L('exitNote') }), 'exit');
      action(row(L('reset'), L('resetD'), 'reset'), L('resetBtn'), async () => {
        const yes = await notice(layer, { body: L('resetAsk'), buttons: [{ t: L('cancel'), v: false }, { t: L('confirm'), v: true, green: true }], n: 'resetConfirm' });
        if (!yes) return;
        try { localStorage.removeItem('wos.save'); } catch (e) { /* bộ nhớ bị chặn */ }
        reloadToTitle();
      }, 'reset');
    }
  };
  const reloadToTitle = () => { const u = new URL(location.href); for (const p of ['fresh', 'intro', 'quest']) u.searchParams.delete(p); location.href = u.href; };
  async function toTitle() { await notice(layer, { body: L('toTitleAsk') }); reloadToTitle(); }
  const shut = () => { if (!open) return; removeEventListener('keydown', key, true); layer.destroy(); open = null; set({ modal: null }); };
  const key = e => {
    if (layer.box.querySelector('[data-ui="notice"], [data-ui="resetConfirm"]')) return;   // popup tự nhận phím
    e.stopPropagation();
    if (e.code === 'Escape') { e.preventDefault(); shut(); }
  };
  addEventListener('keydown', key, true);
  onTap(close, shut);
  draw();
  open = { layer, close: shut, draw, s };
  W.settingUI = open;
  return open;
}
