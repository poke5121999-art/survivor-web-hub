// Màn tải: nền img/login_bg.mp4 (video màn đăng nhập gốc), logo Login/Login_Logo_Title_En, slime "Loading"
// (LoadingIcon/UI_Loading_0..29, 30 khung) và thanh Login_Loading_Gauge_Bg/Fill (sliced). Thanh chạy theo byte thật
// (assets.loadProgress). Bố cục màn đăng nhập gốc nằm trong scene chưa bóc nên vị trí ở đây là [ĐỀ XUẤT],
// cùng hệ đơn vị canvas 1080 với HUD.
import { assetUrl, loadProgress } from '../assets.js?v=20261022e';
import { paint, uiUrl } from './sprites.js?v=20261022e';
import { uiScale } from './hud.js?v=20261022e';
import { t } from '../../data/loc_vi.js?v=20261022e';

const FRAMES = 30;
const KEEP = [];   // giữ tham chiếu ảnh khung: ảnh bị thu gom giữa chừng thì trình duyệt huỷ yêu cầu (ERR_ABORTED)

export function showLoading(desktop) {
  const box = document.createElement('div'); box.id = 'loading';
  const v = document.createElement('video');
  Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true }); v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  v.src = assetUrl('img/login_bg.mp4'); box.appendChild(v);
  const root = document.createElement('div'); root.className = 'lroot'; box.appendChild(root);
  const u = (css, spr, opt) => { const e = document.createElement('div'); e.className = 'u'; Object.assign(e.style, css); if (spr) paint(e, spr, opt); root.appendChild(e); return e; };
  const logo = u({ left: '50%', top: '12%', width: '900px', height: '486px', transform: 'translateX(-50%) scale(0.8)', transformOrigin: '50% 0' }, 'Login/Login_Logo_Title_En');
  logo.dataset.hud = 'loadingLogo';
  const icon = u({ left: '50%', bottom: '150px', width: '176px', height: '160px', transform: 'translateX(-50%)',
    backgroundSize: '100% 100%', backgroundImage: `url("${uiUrl('LoadingIcon/UI_Loading_0')}")` });
  const bar = u({ left: '50%', bottom: '100px', width: '900px', height: '20px', transform: 'translateX(-50%)' }, 'Login/Login_Loading_Gauge_Bg', { sliced: true });
  bar.dataset.hud = 'loadingBar';
  const fill = document.createElement('div'); fill.className = 'u';
  Object.assign(fill.style, { left: '0', top: '-14px', height: '48px', width: '0px' });
  paint(fill, 'Login/Login_Loading_Gauge_Fill', { sliced: true }); bar.appendChild(fill);
  const label = document.createElement('div'); label.className = 'ltxt'; label.style.bottom = '40px'; label.style.fontSize = '30px';
  root.appendChild(label);
  document.body.appendChild(box);

  // preload khung hoạt hình để không nháy
  const frames = []; for (let i = 0; i < FRAMES; i++) { const im = new Image(); im.src = uiUrl('LoadingIcon/UI_Loading_' + i); frames.push(im); KEEP.push(im); }   // không crossOrigin: cùng mục đệm với background-image CSS
  let shown = 0, f = 0, raf = 0, last = 0, phase = '', armed = false;   // armed: đã biết tổng byte bản đồ (trước đó chỉ có vài tệp nhỏ, % sẽ vọt 99)
  const layout = () => {
    const s = uiScale(desktop);
    Object.assign(root.style, { width: innerWidth / s + 'px', height: innerHeight / s + 'px', transform: `scale(${s})` });
  };
  layout(); addEventListener('resize', layout);
  const tick = now => {
    raf = requestAnimationFrame(tick);
    if (now - last > 1000 / 30) { last = now; const n = (f + 1) % FRAMES; if (frames[n].complete && frames[n].naturalWidth) { f = n; icon.style.backgroundImage = `url("${frames[f].src}")`; } }   // chỉ đổi khung đã tải xong, khỏi huỷ yêu cầu dở khi màn tải biến mất
    const p = loadProgress();
    const frac = p.total ? p.loaded / p.total : 0;
    if (armed) shown = Math.max(shown, Math.min(0.99, frac));                 // không lùi khi có thêm tệp vào hàng
    fill.style.width = Math.max(44, 900 * shown) + 'px';
    box.dataset.progress = shown.toFixed(3);
    const mb = n => (n / 1048576).toFixed(1);
    label.textContent = `${t('IAP.PriceLoading')} ${Math.round(shown * 100)}%  (${mb(p.loaded)} / ${mb(p.total)} MB)${phase ? ' · ' + phase : ''}`;
  };
  raf = requestAnimationFrame(tick);
  return {
    el: box,
    phase(s) { phase = s; },
    arm() { armed = true; },
    done() {
      shown = 1; fill.style.width = '900px';
      box.classList.add('done'); box.dataset.progress = '1';
      setTimeout(() => { cancelAnimationFrame(raf); removeEventListener('resize', layout); box.remove(); v.removeAttribute('src'); }, 600);
    },
    fail(msg) { cancelAnimationFrame(raf); label.textContent = msg; },
  };
}
