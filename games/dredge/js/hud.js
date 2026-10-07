/*
 * HUD luôn bật khi đang lái thuyền / câu: bánh xe thời gian, mắt hoảng loạn, tiền, độ sâu, la bàn, ô hỏng thân tàu,
 * gợi ý tương tác và thông báo nổi. Đọc DR.s và DR.view mỗi khung hình (DR.view do engine ghi).
 *   DRHud.toast(text, ms)
 */
(function (root) {
  'use strict';
  const me = document.currentScript;
  if (!document.querySelector('link[href*="ui.css"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('../css/ui.css', (me && me.src) || location.href).href;
    document.head.appendChild(l);
  }

  const MSG = {
    need_rod: 'Cần cần câu', no_equipment: 'Cần loại cần câu khác', wrong_time: 'Không có cá giờ này',
    no_stock: 'Hết cá', need_advanced: 'Cần cần câu nâng cao'
  };
  // Mốc kho theo HarvestMinigameView: >=5 nhiều, >=3 vừa, >0 ít, 0 hết.
  const bucket = s => s >= 5 ? 3 : s >= 3 ? 2 : s > 0 ? 1 : 0;
  const BUCKET_TXT = ['Hết cá', 'Cá còn ít', 'Cá vừa phải', 'Cá dồi dào'];
  const pad2 = n => (n < 10 ? '0' : '') + n;

  let el = null;
  const cache = {};
  const pending = [];
  let toasts = null;

  function div(cls, parent, html) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (html) d.innerHTML = html;
    if (parent) parent.appendChild(d);
    return d;
  }
  // Chỉ ghi DOM khi giá trị đổi.
  function put(key, val, fn) { if (cache[key] !== val) { cache[key] = val; fn(val); } }

  function build() {
    if (el) return;
    el = div('dr-ui', document.body); el.id = 'dr-hud';
    const tl = div('hud-tl', el);
    const w = div('hud-wheel', tl, '<div class="wheel"></div><div class="orb"><i class="dr-mask"></i></div><div class="txt"><div class="day"></div><div class="clock"></div></div>');
    const eye = div('hud-eye', tl, '<div class="shut dr-mask"></div><div class="lid dr-mask"></div><div class="pupil"></div>');
    const hull = div('hud-hull', el);
    const tr = div('hud-tr', el, '<div class="hud-funds"><small>Tiền</small><span></span></div><div class="hud-depth"><span class="ic dr-mask"></span><span class="v"></span></div><div class="hud-zone"></div>');
    const comp = div('hud-compass', el, '<div class="rose"></div><div class="ring"></div>');
    const prompt = div('hud-prompt', el, '<b></b><span></span>');
    const bag = document.createElement('button');
    bag.className = 'dr-btn hud-bag'; bag.textContent = 'Hành lý';
    bag.title = 'Mở khoang thuyền (Tab / I)';
    bag.onclick = () => { if (root.DRCargo && DR.mode === 'sail') DRCargo.open({ keys: ['INVENTORY'], title: 'Khoang thuyền' }); };
    el.appendChild(bag);
    toasts = div('hud-toasts', el);
    // Chạm vào gợi ý = nhấn Space (màn cảm ứng không có phím).
    prompt.onclick = () => {
      for (const t of ['keydown', 'keyup']) root.dispatchEvent(new KeyboardEvent(t, { code: 'Space', key: ' ', bubbles: true }));
    };
    el._ = { w, eye, hull, tr, comp, prompt, bag };
    pending.splice(0).forEach(p => toast(p[0], p[1]));
  }

  function toast(text, ms) {
    if (!el) { pending.push([text, ms]); return; }
    const t = div('hud-toast', toasts); t.textContent = text;
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 600); }, ms || 3200);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!el || !root.DR || !DR.s) return;
    const on = (DR.mode === 'sail' || DR.mode === 'harvest') && !(root.DRMinigame && DRMinigame.isOpen());
    put('on', on, v => el.classList.toggle('on', v));
    if (!on) return;
    const s = DR.s, v = DR.view || {}, u = el._;

    // Thời gian: phần nguyên = ngày (bắt đầu từ ngày 1), phần lẻ 0 = nửa đêm.
    const f = s.time - Math.floor(s.time), hh = Math.floor(f * 24), mm = Math.floor((f * 24 - hh) * 60);
    put('day', Math.floor(s.time) + 1, d => u.w.querySelector('.day').textContent = 'Ngày ' + d);
    put('clock', pad2(hh) + ':' + pad2(mm), c => u.w.querySelector('.clock').textContent = c);
    const isDay = v.isDay != null ? v.isDay : (f > 0.25 && f < 0.75);
    put('dn', isDay, d => {
      const i = u.w.querySelector('.orb i');
      // Biến CSS giải url() theo tệp css, không theo trang: đưa đường dẫn tuyệt đối.
      i.style.setProperty('--m', 'url(' + new URL('art/ui/sprites/' + (d ? 'sun-icon' : 'moon-icon') + '.webp', document.baseURI).href + ')');
      i.style.setProperty('--c', d ? '#ffd104' : '#cfe3ff');
    });
    const sz = u.w.offsetWidth;
    u.w.querySelector('.orb').style.transform = 'rotate(' + ((f - 0.5) * 360).toFixed(1) + 'deg) translateY(' + (-sz * 0.4).toFixed(1) + 'px) rotate(' + (-(f - 0.5) * 360).toFixed(1) + 'deg)';

    // Mắt hoảng loạn: 0 nhắm .. 4 đỏ.
    const stage = root.DRRules ? DRRules.panicStage(s.sanity) : 0;
    put('eye', stage, st => {
      u.eye.dataset.stage = st;
      const lid = u.eye.querySelector('.lid'), shut = u.eye.querySelector('.shut'), pu = u.eye.querySelector('.pupil');
      shut.style.opacity = st === 0 ? 1 : 0;
      shut.style.setProperty('--c', '#cfe3ff');
      lid.style.opacity = st === 0 ? 0 : 1;
      lid.style.transform = 'scaleY(' + [0.1, 0.35, 0.6, 0.85, 1][st] + ')';
      lid.style.setProperty('--c', ['#e9dcc2', '#e9dcc2', '#f2d9a0', '#ff9a3b', '#dc2c38'][st]);
      pu.style.opacity = st === 0 ? 0 : 1;
      pu.style.transform = 'scale(' + [0, 0.6, 0.8, 1, 1.15][st] + ')';
      pu.style.filter = st >= 3 ? 'sepia(1) saturate(6) hue-rotate(-30deg)' : 'none';
    });

    put('funds', s.funds, fu => u.tr.querySelector('.hud-funds span').textContent = '$' + fu.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const depth = v.depthM == null ? '--' : Math.round(v.depthM) + ' m';
    put('depth', depth, d => u.tr.querySelector('.hud-depth .v').textContent = d);
    put('zone', v.zone || '', z => u.tr.querySelector('.hud-zone').textContent = z);

    put('hdg', Math.round((v.heading || 0) * 573) / 10, a => u.comp.querySelector('.rose').style.transform = 'rotate(' + (-a) + 'deg)');

    // Thân tàu: ô hỏng so với ngưỡng chết (chết khi hỏng > ngưỡng).
    const inv = DR.grid('INVENTORY');
    const total = DRRules.damageThreshold(DR_CONFIG, s.hullTier) + 1, bad = Math.min(total, inv ? inv.damage.length : 0);
    put('hull', total + ':' + bad, () => {
      u.hull.innerHTML = '';
      for (let i = 0; i < total; i++) u.hull.appendChild(Object.assign(document.createElement('i'), { className: i < bad ? 'bad' : 'ok' }));
      u.hull.title = 'Thân tàu: ' + bad + '/' + total + ' ô hỏng';
    });

    // Gợi ý tương tác: bến ưu tiên hơn điểm câu; đang câu thì ẩn.
    let html = '', warn = false;
    if (DR.mode === 'sail') {
      if (v.nearDock) html = '<b>Cập bến — Space</b><span>' + esc(v.nearDock.name) + '</span>';
      else if (v.nearSpot) {
        const sp = v.nearSpot, ok = !sp.status || sp.status === 'ok';
        if (ok) {
          const b = bucket(sp.stock);
          html = '<b>Câu cá — Space</b><span>' + esc(sp.name || '') + (sp.name ? ' · ' : '') + BUCKET_TXT[b] +
            '<span class="hud-stock">' + [1, 2, 3].map(i => '<i class="' + (i <= b ? 'f' : '') + '"></i>').join('') + '</span></span>';
        } else {
          warn = true;
          html = '<b>' + (MSG[sp.status] || sp.status) + '</b><span>' + esc(sp.name || '') + '</span>';
        }
      }
    }
    put('prompt', html + warn, () => { u.prompt.innerHTML = html || '<b></b><span></span>'; u.prompt.classList.toggle('on', !!html); u.prompt.classList.toggle('warn', warn); });
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function init() { build(); requestAnimationFrame(frame); }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);

  root.DRHud = { toast, _debug: () => ({ cache: Object.assign({}, cache) }) };
})(window);
