/*
 * UI của Ca Trực Đêm 3D: giữ giao diện game Unity (sảnh, popup, HUD trong ca, bảng kết ca) bằng DOM/CSS phủ lên canvas three.js.
 *
 *   import { UI } from './ui/ui.js';
 *   UI.mount(document.body);
 *   UI.showLobby(({ mode }) => { ...vào ca... });
 *   UI.hud.update({ hp, hpMax, stamina, carry, pad, haul, quota, noise, slots, minimap });
 *   UI.showRunEnd({ win, houses, ... });   UI.toast('...');
 *
 * Dữ liệu meta (đội, vàng, gacha, cửa hàng) là dữ liệu giả cho tới khi nối save hub / GameSpark. Bố cục và hình theo bản Unity.
 * Luật: UI co giãn theo khung nhìn (khung thiết kế 640x360, scale đều), hoạt ảnh pop xoay quanh tâm, lời chữ theo luật
 * "lời nhẹ" (gục / hạ / nhân vật, không dùng chết / giết / xác).
 * Ảnh: đường dẫn bắt đầu bằng art/ hoặc uiart/ trong tệp này được tools/import-ui.js quét để chép đúng tệp cần.
 */
const BASE = new URL('./', import.meta.url);

// ----- dữ liệu giả của sảnh -------------------------------------------------
const CREW = [
  { id: 'bao', name: 'Flare', epi: 'Đèn Pin', star: 3, sheet: 'art/crew/bao.png', sk: 'Chói Loà', skd: 'Loé đèn: mọi quái trong 5,5 m đứng hình 3 giây.' },
  { id: 'hue', name: 'Halo', epi: 'Y Tá Ca Ba', star: 3, sheet: 'art/crew/hue.png', sk: 'Vòng Hồi', skd: 'Vòng hồi máu cho đồng đội trong 4 m.' },
  { id: 'tam', name: 'Atlas', epi: 'Cửu Vạn', star: 3, sheet: 'art/crew/tam.png', sk: 'Gồng', skd: 'Gồng 8 giây: đồ nặng như nhẹ.' },
  { id: 'ky', name: 'Pick', epi: 'Thợ Khoá', star: 3, sheet: 'art/crew/ky.png', sk: 'Mở Toang', skd: 'Mở mọi cửa kẹt trong 9 m.' },
  { id: 'linh', name: 'Shade', epi: 'Bóng Đêm', star: 4, sheet: 'art/crew/linh.png', sk: 'Tàng Hình', skd: 'Quái không thấy bạn trong 6 giây.' },
  { id: 'dung', name: 'Quake', epi: 'Xà Beng', star: 4, sheet: 'art/crew/dung.png', sk: 'Xung Chấn', skd: 'Chấn động: choáng quái trong 5 m.' },
  { id: 'mai', name: 'Lure', epi: 'Tay Nhử', star: 4, sheet: 'art/crew/mai.png', sk: 'Mồi Nhử', skd: 'Tạo mồi kéo quái đi chỗ khác 9 giây.' },
  { id: 'phuc', name: 'Hook', epi: 'Cứu Hộ', star: 4, sheet: 'art/crew/phuc.png', sk: 'Kéo Về', skd: 'Kéo đồng đội đã gục về chỗ bạn.' },
  { id: 'son', name: 'Barb', epi: 'Kẽm Gai', star: 4, sheet: 'art/crew/son.png', sk: 'Lồng Sắt', skd: 'Nhốt quái trong lồng 9 giây.' },
  { id: 'nga', name: 'Blink', epi: 'Chớp Giật', star: 5, sheet: 'art/crew/nga.png', sk: 'Chớp', skd: 'Dịch chuyển 6,5 m về phía trước.' },
  { id: 'khoi', name: 'Oracle', epi: 'Mắt Thần', star: 5, sheet: 'art/crew/khoi.png', sk: 'Thấu Thị', skd: 'Thấy quái xuyên tường 12 giây.' },
  { id: 'van', name: 'Frost', epi: 'Kho Lạnh', star: 5, sheet: 'art/crew/van.png', sk: 'Đóng Băng', skd: 'Đóng băng quái trong 8 m, 4,5 giây.' },
  { id: 'hai', name: 'Magnet', epi: 'Từ Trường', star: 5, sheet: 'art/crew/hai.png', sk: 'Kéo Đồ', skd: 'Hút 2 món đồ gần nhất trong 5 m thành một túi vàng.' },
  { id: 'tuyet', name: 'Seraph', epi: 'Bất Tử', star: 5, sheet: 'art/crew/tuyet.png', sk: 'Thiên Thần', skd: 'Dựng dậy mọi đồng đội đã gục; cả đội không gục trong 5 giây.' },
];
const BY_ID = Object.fromEntries(CREW.map(c => [c.id, c]));
// ảnh cần cho tính năng có thể dùng sau (biểu tượng kỹ năng, ô đội) — liệt kê để import chép
const SKILL_ICON = id => `art/hud/skill-${id}.png`;
const TILE = { 3: 'uiart/hero/tile_blue.png', 4: 'uiart/hero/tile_purple.png', 5: 'uiart/hero/tile_gold.png' };
const ICON = { gold: 'uiart/icon/gold.png', gem: 'uiart/icon/gem.png', paid: 'uiart/icon/paid_gem.png' };
void ['art/hud/skill-bao.png', 'art/hud/skill-hue.png', 'art/hud/skill-tam.png', 'art/hud/skill-ky.png', 'art/hud/skill-linh.png', 'art/hud/skill-dung.png', 'art/hud/skill-mai.png',
  'art/hud/skill-phuc.png', 'art/hud/skill-son.png', 'art/hud/skill-nga.png', 'art/hud/skill-khoi.png', 'art/hud/skill-van.png', 'art/hud/skill-hai.png', 'art/hud/skill-tuyet.png'];

// ----- tiện ích -------------------------------------------------------------
const u = rel => new URL(rel, BASE).href;
function h(tag, cls, html, style) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  if (style) d.style.cssText = style;
  return d;
}
const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
const num = n => Math.round(n).toLocaleString('vi-VN');
const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const img = (src, cls) => `<img class="${cls || 'pix'}" src="${u(src)}" alt="">`;
function sprite(c, cls, style) { // khung đầu của tấm 3x4 (96x144), nhìn thẳng
  return h('div', cls, '', `background-image:url(${u(c.sheet)});${style || ''}`);
}
function btn(cls, label, fn, style) {
  const b = h('button', 'ub ' + cls, label, style);
  if (fn) b.addEventListener('click', e => { e.stopPropagation(); fn(e); });
  return b;
}

// ----- trạng thái -----------------------------------------------------------
let root, stage, lobbyEl, hudEl, modalEl, runendEl, toastEl, toastT = 0;
let onStart = null;
let lobbyScreen = 'home';
let lead = 'mai';
let stageK = 1;
const hudRefs = {};
let cssReady = Promise.resolve();

function fit() {
  const W = innerWidth, H = innerHeight, k = Math.min(W / 640, H / 360);
  stageK = k;
  stage.style.width = W / k + 'px';
  stage.style.height = H / k + 'px';
  stage.style.transform = `scale(${k})`;
  stage.style.setProperty('--vw', W / k / 100 + 'px');
  stage.style.setProperty('--vh', H / k / 100 + 'px');
}

function mount(rootEl) {
  if (root) return UI;
  root = h('div', 'ui-root');
  stage = h('div', 'ui-stage');
  root.appendChild(stage);
  lobbyEl = h('div', 'ui-layer lobby hidden');
  hudEl = h('div', 'ui-layer hud hidden');
  runendEl = h('div', 'ui-layer runend-wrap hidden');
  modalEl = h('div', 'ui-layer ui-modal hidden');
  toastEl = h('div', 'toast');
  stage.append(lobbyEl, hudEl, runendEl, modalEl, toastEl);
  (rootEl || document.body).appendChild(root);
  const links = ['squad-extract.css', 'ui-kit.css', 'ui.css'].map(f => new Promise(res => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = u(f); l.onload = l.onerror = () => res();
    document.head.appendChild(l);
  }));
  cssReady = Promise.all(links);
  buildHud();
  fit();
  addEventListener('resize', fit);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !modalEl.classList.contains('hidden')) closeModal(); });
  return UI;
}

// ----- sảnh -----------------------------------------------------------------
function purse(parent) {
  const p = h('div', 'purse');
  p.innerHTML = `<div class="pill gear">${img('uiart/icon/settings.png')}</div>` +
    `<div class="pill">${img(ICON.gold)}12.500</div><div class="pill">${img(ICON.gem)}860</div><div class="pill">${img(ICON.paid)}120</div>`;
  p.firstChild.addEventListener('click', () => showSettings());
  p.children[1].addEventListener('click', () => go('shop'));
  parent.appendChild(p);
}
function backBtn(parent) { parent.appendChild(btn('back', '←', () => go('home'))); }
function title(parent, t) { parent.appendChild(h('div', 'title', t)); }

const SCREENS = {
  home(el) {
    const c = BY_ID[lead];
    el.appendChild(btn('gold', 'XẾP HẠNG', null, 'left:8px;top:8px;width:66px;height:16px'));
    purse(el);
    const hero = h('div', 'home-hero');
    hero.innerHTML = img('uiart/hero/pedestal.png', 'pix ped');
    hero.appendChild(sprite(c, 'spr'));
    el.appendChild(hero);
    const L = h('div', 'col', '', 'left:8px;top:132px;width:54px');
    L.append(btn('', 'Roll Hero', () => go('gacha')), btn('', 'Shop', () => go('shop')));
    const R = h('div', 'col', '', 'right:8px;top:46px;width:62px');
    const q = btn('', 'Quest', () => go('quest')); q.appendChild(h('span', 'dot', '1'));
    const g = btn('', 'HƯỚNG DẪN', () => toast('Hướng dẫn: kéo đồ ra bệ, đừng làm vỡ.')); g.appendChild(h('span', 'dot', '1'));
    R.append(q, g, btn('', 'Sổ tay quái', () => toast('Sổ tay quái chưa mở trong bản 3D.')),
      h('div', 'sel', 'Ngẫu nhiên'), h('div', 'sel', 'Màn 1'));
    const B = h('div', 'col', '', 'left:8px;bottom:12px;flex-direction:row;width:auto');
    B.append(btn('', 'Hero', () => go('squad'), 'width:50px;height:24px'), btn('', 'Team', () => go('squad'), 'width:44px;height:24px'));
    el.append(L, R, B);
    el.appendChild(btn('green playbtn', 'CHƠI', () => go('modes')));
  },
  modes(el) {
    backBtn(el); title(el, 'CHỌN CHẾ ĐỘ');
    const grid = h('div', 'modes');
    const defs = [
      ['📜', 'Ải 5 nhà', 'Một mình đi hết 5 nhà, thắng là xong ca.', 'CHƠI', null, false, 'houses'],
      ['👥', 'Chơi với bạn', 'Mở phòng, rủ bạn cùng đi ca.', 'CHƠI', null, false, 'coop'],
      ['⚔️', 'Đấu đội 5v5', 'Hai đội 5 người đấu nhau, ghế trống có bot.', 'CHƠI', null, false, 'pvp'],
      ['⚡', 'Vô tận một mình', 'Một mình, nhà nào cũng đi tiếp tới khi gục.', 'BẮT ĐẦU', 'solo', true, 'endless'],
      ['⚡', 'Vô tận cùng bạn', 'Cùng bạn, nhà nào cũng đi tiếp tới khi cả đội gục.', 'BẮT ĐẦU', 'coop', true, 'endless-coop'],
    ];
    defs.forEach(d => {
      const m = h('div', 'mode' + (d[5] ? ' gold' : ''));
      m.innerHTML = `<div class="ic">${d[0]}</div><div class="nm">${d[1]}</div><div class="ds">${d[2]}</div>` +
        (d[5] ? `<div class="tag">XẾP HẠNG</div><div class="meta">Theme cố định<br>Hầm Mộ Cổ<br><i>Chưa có điểm lưu</i></div>` : '');
      m.appendChild(btn('green', d[3], () => start(d[6])));
      grid.appendChild(m);
    });
    el.appendChild(grid);
    el.appendChild(btn('gold rankbtn', 'BẢNG XẾP HẠNG'));
  },
  squad(el) {
    backBtn(el); title(el, 'BIỆT ĐỘI'); purse(el);
    const grid = h('div', 'squad-grid');
    CREW.forEach(c => {
      const t = h('div', 'tile' + (c.id === lead ? ' sel2' : ''), '', `background-image:url(${u(TILE[c.star])})`);
      t.appendChild(sprite(c, 'spr'));
      t.appendChild(h('div', 'st', '★'.repeat(c.star)));
      t.addEventListener('click', () => { lead = c.id; go('squad'); });
      grid.appendChild(t);
    });
    el.appendChild(grid);
    const c = BY_ID[lead];
    const d = h('div', 'detail');
    d.appendChild(sprite(c, 'big', ''));
    d.insertAdjacentHTML('beforeend', `<div class="nm">${c.name}</div><div class="ep">${c.epi}</div><div class="stars">${'★'.repeat(c.star)}</div>` +
      `<div class="sk"><b>${c.sk}</b>${c.skd}</div>` +
      `<div class="stats"><div>Máu<b>${95 + c.star * 10}</b></div><div>Sức mang<b>${24 + c.star * 4}</b></div><div>Tốc chạy<b>${100 + c.star}%</b></div><div>Hồi chiêu<b>${24 - c.star}s</b></div></div>`);
    d.appendChild(btn('green', 'CHỌN', () => { toast('Đã chọn ' + c.name + ' làm tổ trưởng.'); go('home'); }));
    el.appendChild(d);
  },
  gacha(el) {
    backBtn(el); title(el, 'ROLL HERO'); purse(el);
    const c = BY_ID.tuyet;
    const st = h('div', 'gacha-stage');
    st.appendChild(sprite(c, 'spr'));
    st.insertAdjacentHTML('beforeend', `<div class="nm">${c.name} · ${'★'.repeat(5)}</div><div class="rate">Tỉ lệ 5★: 1,5% · bảo hiểm sau 80 lượt</div>`);
    el.appendChild(st);
    const b = h('div', 'gacha-btns');
    b.append(btn('gold', 'x1 · ' + '160', () => toast('Quay thử: Lure (4★)'), 'left:0;top:0;position:absolute'),
      btn('green', 'x10 · 1.500', () => toast('Quay x10 chưa nối máy chủ.'), 'right:0;top:0;position:absolute'));
    el.appendChild(b);
  },
  shop(el) {
    backBtn(el); title(el, 'SHOP'); purse(el);
    const t = h('div', 'tabs-v');
    ['Gold', 'Gem', 'Paid Gem', 'Skin'].forEach((n, i) => t.appendChild(btn(i ? '' : 'on', n)));
    el.appendChild(t);
    const g = h('div', 'shop-grid');
    [['6.000 vàng · còn 20/20', 50], ['28.000 vàng · còn 10/10', 200]].forEach(([tx, pr]) => {
      const c = h('div', 'card');
      c.innerHTML = `${img(ICON.gold)}<div class="tx">${tx}</div><div class="pr">${img(ICON.gem)}${pr}</div>`;
      c.addEventListener('click', () => toast('Mua: cần nối kho đồ.'));
      g.appendChild(c);
    });
    el.appendChild(g);
  },
  quest(el) {
    backBtn(el); purse(el);
    const w = h('div', 'q-wrap');
    const tb = h('div', 'q-tabs');
    tb.append(btn('on', 'HÀNG NGÀY'), btn('', 'HÀNG TUẦN'));
    w.appendChild(tb);
    [['Quay gacha 5 lần', 1, 5, '1.000', ''], ['Đỡ đồng đội dậy 3 lần', 0, 3, '600', '10'], ['Qua 4 tầng', 0, 4, '800', '20'],
      ['Giao đủ 12.000 giá trị đồ', 0, 12000, '900', ''], ['Dùng kỹ năng 15 lần', 0, 15, '500', '10']].forEach(r => {
      const row = h('div', 'q-row');
      row.innerHTML = `<div class="t">${r[0]}</div><div class="bar"><i style="width:${r[1] / r[2] * 100}%"></i></div><div class="p">${r[1]}/${num(r[2])}</div>` +
        `<div class="rw"><span>${r[3]}</span>${r[4] ? `<span>🪙 ${r[4]}</span>` : ''}</div>`;
      row.appendChild(btn('', 'CHƯA XONG'));
      w.appendChild(row);
    });
    el.appendChild(w);
  },
};

function go(name) {
  lobbyScreen = name;
  lobbyEl.replaceChildren();
  (SCREENS[name] || SCREENS.home)(lobbyEl);
  lobbyEl.classList.remove('hidden');
}
function start(mode) {
  hideLobby();
  if (onStart) onStart({ mode, crew: lead });
}
function hideLobby() { lobbyEl.classList.add('hidden'); lobbyEl.replaceChildren(); }

// ----- popup ----------------------------------------------------------------
function popup(titleText, build) {
  modalEl.replaceChildren();
  const card = h('div', 'mcard pop-anim');
  const hd = h('div', 'pop-h');
  hd.appendChild(h('div', 'pop-t', titleText));
  const x = h('button', 'b chev', '✕'); x.addEventListener('click', closeModal);
  hd.appendChild(x);
  card.appendChild(hd);
  const body = h('div', 'pop-b');
  card.appendChild(body);
  build(body);
  const wrap = h('div', '', '', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72)');
  wrap.appendChild(card);
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  modalEl.appendChild(wrap);
  modalEl.classList.remove('hidden');
}
function closeModal() { modalEl.classList.add('hidden'); modalEl.replaceChildren(); }
function pbtn(cls, label, fn) {
  const b = h('button', 'b ' + cls, label);
  b.addEventListener('click', fn);
  return b;
}
function showSettings() {
  popup('Cài đặt', b => {
    [['Nhạc', 70], ['Tiếng', 85], ['Rung', 40]].forEach(([n, v]) => b.appendChild(h('div', 'row', `<span>${n}</span><div class="sl" style="--v:${v}%"><i style="width:${v}%"></i></div>`)));
    b.appendChild(pbtn('ghost', 'Sổ tay', () => toast('Sổ tay chưa mở trong bản 3D.')));
    b.appendChild(pbtn('ghost danger', 'Bỏ ca', () => showConfirm()));
    b.appendChild(pbtn('', 'Xong', closeModal));
  });
}
function showConfirm() {
  popup('Bỏ ca giữa chừng?', b => {
    b.appendChild(h('div', 'mline', 'Ra sớm thì chỉ giữ được phần đã giao lên bệ. Phần đang vác trên tay mất hết.'));
    b.appendChild(pbtn('ghost danger', 'Bỏ ca', closeModal));
    b.appendChild(pbtn('', 'Chơi tiếp', closeModal));
  });
}

// ----- toast ----------------------------------------------------------------
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ----- HUD ------------------------------------------------------------------
const NOISE_TIER = ['Im lặng', 'Bước chân', 'Chạy', 'Va đập', 'Ồn lớn'];
function buildHud() {
  const R = hudRefs;
  hudEl.innerHTML =
    `<div class="hint"></div>` +
    `<div class="moneyp"><b><span class="haul">$0</span><em class="quota">/ $0</em></b></div>` +
    `<div class="noise"><div class="seg">${'<i></i>'.repeat(10)}</div><u></u></div>` +
    `<div class="gear"></div>` +
    `<div class="mini"><canvas width="62" height="64"></canvas></div>` +
    `<div class="bars"><div class="bar hp"><div class="tr" style="background-image:url(${u('art/hud/bar_hp_track.png')})"></div><div class="fl"><img src="${u('art/hud/bar_hp.png')}" alt=""></div></div>` +
    `<div class="bar st"><div class="tr" style="background-image:url(${u('art/hud/bar_st_track.png')})"></div><div class="fl"><img src="${u('art/hud/bar_st.png')}" alt=""></div></div></div>` +
    `<div class="carry" hidden></div>` +
    `<div class="padp" hidden><b><span class="pv"></span><em class="pq"></em></b><div class="hold"><i></i></div></div>` +
    `<div class="slots"></div>` +
    `<div class="skill" hidden><div class="ic"></div><div class="cd"></div></div>` +
    `<div class="touch">` +
    `<div class="stick" style="left:14px;bottom:30px"></div><div class="stick" style="right:14px;bottom:8px;width:60px;height:60px"></div>` +
    `<div class="tb" style="right:84px;bottom:52px"><i style="background-image:url(${u('art/hud/ic_interact.png')})"></i></div>` +
    `<div class="tb" style="right:70px;bottom:100px"><i style="background-image:url(${u('art/hud/ic_dash.png')})"></i></div>` +
    `<div class="tb" style="right:76px;bottom:150px;display:none"></div></div>`;
  const q = s => hudEl.querySelector(s);
  Object.assign(R, {
    hint: q('.hint'), haul: q('.haul'), quota: q('.quota'), noiseSeg: [...hudEl.querySelectorAll('.noise i')], noiseLbl: q('.noise u'),
    hp: q('.hp .fl'), st: q('.st .fl'), hpImg: q('.hp .fl img'), carry: q('.carry'), pad: q('.padp'), padV: q('.pv'), padQ: q('.pq'), padHold: q('.hold i'),
    slots: q('.slots'), skill: q('.skill'), skillIc: q('.skill .ic'), skillCd: q('.skill .cd'), mini: q('.mini canvas'),
  });
  q('.gear').addEventListener('click', () => showSettings());
  q('.gear').style.pointerEvents = 'auto';
}
let slotKey = '';
function setSlots(slots) {
  const R = hudRefs;
  const list = (slots || []).slice(0, 4);
  while (list.length < 4) list.push(null);
  const key = JSON.stringify(list);
  if (key === slotKey) return;
  slotKey = key;
  R.slots.replaceChildren();
  list.forEach((s, i) => {
    const on = !!(s && s.on);
    const d = h('div', 'slot', '', `background-image:url(${u(on ? 'art/hud/slot_on.png' : 'art/hud/slot_off.png')})`);
    if (s && s.icon != null) d.appendChild(h('div', 'ic', '', `background-position:${-24 * s.icon}px 0`));
    if (s && s.count) d.appendChild(h('div', 'n', String(s.count)));
    d.appendChild(h('div', 'k', String(i + 1)));
    R.slots.appendChild(d);
  });
  R.slots.appendChild(h('div', 'dropb'));
}
const hud = {
  show() { hudEl.classList.remove('hidden'); },
  hide() { hudEl.classList.add('hidden'); },
  /** state: { hp, hpMax, stamina(0..1), carry:{value,value0}|null, pad:{value,quota,hold(0..1)}|null, haul, quota, noise(0..1),
   *           slots:[{icon?,count?,on?}], minimap: canvas | (ctx,w,h)=>void | null, hint?, touch?, skill?:{id,cd(0..1)} } */
  update(s) {
    const R = hudRefs;
    if (hudEl.classList.contains('hidden')) hudEl.classList.remove('hidden');
    hudEl.classList.toggle('is-touch', !!s.touch);
    const hp = clamp01(s.hp / (s.hpMax || 100));
    R.hp.style.width = hp * 100 + '%';
    R.hpImg.src = u(hp < 0.3 ? 'art/hud/bar_hp_red.png' : 'art/hud/bar_hp.png');
    R.st.style.width = clamp01(s.stamina) * 100 + '%';
    R.haul.textContent = money(s.haul || 0);
    R.quota.textContent = s.quota ? '/ ' + money(s.quota) : '';
    R.hint.textContent = s.hint || '';
    const nz = clamp01(s.noise), on = Math.round(nz * 10);
    R.noiseSeg.forEach((n, i) => { n.className = i < on ? (i >= 8 ? 'on hotter' : i >= 6 ? 'on hot' : 'on') : ''; });
    R.noiseLbl.textContent = NOISE_TIER[Math.min(4, Math.floor(nz * 4.999))];
    if (s.carry) {
      R.carry.hidden = false;
      const lost = s.carry.value0 > s.carry.value;
      R.carry.innerHTML = money(s.carry.value) + (lost ? `<s>${money(s.carry.value0)}</s>` : '');
    } else R.carry.hidden = true;
    if (s.pad) {
      R.pad.hidden = false;
      R.padV.textContent = money(s.pad.value);
      R.padQ.textContent = ' / ' + money(s.pad.quota);
      R.padHold.style.width = clamp01(s.pad.hold) * 100 + '%';
    } else R.pad.hidden = true;
    setSlots(s.slots);
    if (s.skill) {
      R.skill.hidden = false;
      R.skillIc.style.backgroundImage = `url(${u(SKILL_ICON(s.skill.id))})`;
      R.skillCd.style.display = s.skill.cd > 0 ? 'block' : 'none';
    } else R.skill.hidden = true;
    const c = R.mini, ctx = c.getContext('2d');
    ctx.fillStyle = '#0c3b1d'; ctx.fillRect(0, 0, c.width, c.height);
    const mm = s.minimap;
    if (typeof mm === 'function') mm(ctx, c.width, c.height);
    else if (mm && mm.width) ctx.drawImage(mm, 0, 0, c.width, c.height);
  },
};

// ----- bảng kết ca (DOM/CSS thuần, bố cục như bản Unity, không dùng art Soul Knight) -----
function showRunEnd(r) {
  r = r || {};
  hideLobby(); hud.hide();
  const houses = r.houses || 5, reached = r.reached == null ? houses : r.reached;
  const crew = (r.crew && r.crew.length ? r.crew : [{ id: 'mai', at: reached, value: r.haul || 0 }]).slice(0, 4);
  const w = r.win;
  const gains = r.gains || {};
  const g = [gains.gold != null ? `🪙 ${num(gains.gold)}` : '', gains.gem ? `💎 ${num(gains.gem)}` : ''].filter(Boolean).join('   ');
  let ticks = '';
  for (let i = 0; i <= houses; i++) {
    const x = i / houses * 100;
    ticks += `<div class="re-major" style="left:${x}%"></div><div class="re-num" style="left:${x}%">${i}</div>`;
    if (i < houses) for (let k = 1; k < 4; k++) ticks += `<div class="re-minor" style="left:${x + k / 4 / houses * 100}%"></div>`;
  }
  const cnt = {}, seen = {};
  crew.forEach(m => { const a = m.at == null ? reached : m.at; cnt[a] = (cnt[a] || 0) + 1; });
  const who = crew.map((m, i) => {
    const c = BY_ID[m.id] || CREW[0];
    const a = m.at == null ? reached : m.at;
    const k = seen[a] = (seen[a] || 0) + 1;
    const x = Math.max(0, Math.min(houses, a)) / houses * 100 + (k - 1 - (cnt[a] - 1) / 2) * 6.5 - (a >= houses ? 3 : 0);
    return `<div class="re-who" style="left:${x}%;margin-top:${(i % 2) * 2}vh">` +
      `<div class="re-mat pix" style="background:url(${u(c.sheet)}) 0 0/300% 400% no-repeat;width:13.3vh;height:20vh;image-rendering:pixelated"></div>` +
      `<span class="re-at">${m.value != null ? money(m.value) : c.name}</span></div>`;
  }).join('').replace(/(\d+(?:\.\d+)?)vh/g, 'calc($1*var(--vh))');
  runendEl.innerHTML =
    `<div class="re-board pop-in"><div class="re-head"><h3 class="re-title">${w ? 'HOÀN THÀNH CA' : 'CA DỪNG Ở NHÀ ' + reached}</h3>` +
    `<span class="re-total">${money(r.haul || 0)}${r.quota ? ' / ' + money(r.quota) : ''}</span></div>` +
    `<div class="re-page"><div class="re-ruler"><div class="re-line"></div>${ticks}` +
    `<div class="re-icon re-end" style="left:100%"></div>${who}</div>` +
    `<div class="re-panel"><div class="re-gains">${g || '&nbsp;'}</div>` +
    `<div class="re-stats"><div class="re-stat"><b>${reached}/${houses}</b><span>Nhà đã qua</span></div>` +
    `<div class="re-stat"><b>${r.time || '0:00'}</b><span>Thời gian</span></div>` +
    `<div class="re-stat"><b>${r.downs == null ? 0 : r.downs}</b><span>Lần gục</span></div></div>` +
    `<div class="re-note">${r.note || (w ? 'Cả tổ lên xe, mang theo tất cả những gì đã giao lên bệ.' : 'Ra sớm thì chỉ giữ được phần đã giao lên bệ.')}</div></div></div>` +
    `<div class="re-side">${crew.map(m => { const c = BY_ID[m.id] || CREW[0]; return `<div class="re-row"><span>${c.name}</span><b>${m.value != null ? money(m.value) : ''}</b></div>`; }).join('')}</div>` +
    `<button class="b re-go ub gold"><span class="re-play">▶</span><span class="re-sec">Về sảnh</span></button></div>`;
  runendEl.classList.remove('hidden');
  runendEl.querySelector('.re-go').addEventListener('click', () => {
    runendEl.classList.add('hidden'); runendEl.replaceChildren();
    if (r.onClose) r.onClose(); else go('home');
  });
}

function showLobby(cb) {
  onStart = cb || null;
  runendEl.classList.add('hidden'); hud.hide();
  go('home');
}

/** Cho preview / kiểm thử: dựng màn theo tên. */
function screen(name) {
  closeModal(); hideLobby(); hud.hide(); runendEl.classList.add('hidden'); runendEl.replaceChildren();
  toastEl.classList.remove('show');
  const S = {
    home: () => go('home'), modes: () => go('modes'), squad: () => go('squad'), gacha: () => go('gacha'), shop: () => go('shop'), quest: () => go('quest'),
    settings: () => { go('home'); showSettings(); },
    confirm: () => showConfirm(),
    toast: () => { go('home'); toast('Đã chọn Lure làm tổ trưởng.'); },
  };
  if (S[name]) { S[name](); return; }
  if (name === 'hud' || name === 'hud-touch' || name === 'hud-pad') {
    const slots = [{ icon: 0, on: true }, { icon: 1, count: 14 }, { icon: 2, count: 6 }, null];
    const base = { hp: 82, hpMax: 100, stamina: 0.7, haul: 1779, quota: 3234, noise: 0.45, slots, carry: null, pad: null,
      hint: 'Nhà 1/5 — cần $3,234 qua 1 bệ', skill: { id: 'mai', cd: 0 },
      minimap(ctx, w, hh) { ctx.fillStyle = '#17a14a'; ctx.fillRect(w * .1, hh * .15, w * .5, hh * .5); ctx.fillRect(w * .5, hh * .35, w * .4, hh * .4);
        ctx.fillStyle = '#fff'; ctx.fillRect(w * .3, hh * .3, 4, 4); } };
    if (name === 'hud-touch') base.touch = true;
    if (name === 'hud-pad') { base.carry = { value: 640, value0: 1000 }; base.pad = { value: 1779, quota: 3234, hold: 0.6 }; base.noise = 0.85; base.hp = 24; }
    hud.show(); hud.update(base);
    return;
  }
  if (name === 'runend-win') showRunEnd({ win: true, houses: 5, reached: 5, haul: 18420, quota: 16000, time: '12:48', downs: 1, gains: { gold: 3470, gem: 25 },
    crew: [{ id: 'mai', at: 5, value: 7200 }, { id: 'bao', at: 5, value: 5100 }, { id: 'son', at: 4, value: 3800 }, { id: 'hai', at: 5, value: 2320 }] });
  else if (name === 'runend-lose') showRunEnd({ win: false, houses: 5, reached: 3, haul: 6120, quota: 9000, time: '6:05', downs: 4, gains: { gold: 820 },
    crew: [{ id: 'mai', at: 3, value: 2500 }, { id: 'bao', at: 2, value: 1800 }, { id: 'son', at: 3, value: 1020 }, { id: 'hai', at: 1, value: 800 }] });
}

export const UI = { mount, showLobby, hud, showRunEnd, toast, screen, ready: () => cssReady, get scale() { return stageK; } };
export default UI;
