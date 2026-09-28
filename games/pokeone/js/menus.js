/*
 * Vỏ giao diện PokéOne kiểu PRO: HUD, menu, hộp thoại — dựng bằng DOM + sprite atlas PRO (js/proui.js),
 * không còn cây NGUI (data/ui.js đã bỏ). Bố cục tham chiếu D:\pro-ref\ref\gamegui.txt (không gian
 * 1366×768 tâm màn hình, NGUI y hướng lên); hàm `at()` dưới đây đổi toạ độ đó sang CSS trái/trên.
 *
 *   P1.ui.hud(parent?)            HUD → { view, el, refresh(), destroy() }
 *   P1.ui.open(name, arg?)        'menu' | 'party' | 'bag' | 'dex' | 'trainer' | 'options' | 'pokebox' → Promise
 *   P1.ui.close() / closeAll() / isOpen() / refresh()
 *   P1.ui.shop([{ id, price }])   → Promise;  P1.ui.heal() → Promise
 *   P1.ui.learnMove(mon, moveId)  → Promise<slot đã ghi | null>;  P1.ui.evolve(mon, dex) → Promise<bool>
 *   P1.ui.message({ title, text, yes, no }) → Promise<bool>;  P1.ui.toast(text)
 *   P1.ui.textInput(el, opt) / P1.ui.pressAndHold(el, fn) / P1.ui.onEl(el, fn)
 *   P1.ui.paintPlayer(canvas, look, gender, dir, frame)   vẽ nhân vật (thân→áo→tóc→mũ) lên canvas nhỏ
 *   P1.ui.itemByKey(key)
 *   P1.dialog.say(textOrLines, { name? }) → Promise;  P1.dialog.choose(text, options) → Promise<index>
 *
 * Góc dưới phải 440×280 px (STAGE_W-440..STAGE_W, STAGE_H-280..STAGE_H) để trống cho khung chat (js/chat.js).
 */
(function (P1) {
  'use strict';

  const STAGE_W = 1366, STAGE_H = 768;

  /* ---------------------------------------------------------------- tiện ích chung */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = n => Math.max(0, Math.floor(n || 0)).toLocaleString('vi-VN');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pad2 = i => String(i).padStart(2, '0');
  const toId = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  function uiRoot() { return document.getElementById('ui') || document.body; }

  /* Sân khấu 1366×768 tâm giữ tỉ lệ NGUI: mọi màn/HUD dựng bên trong, JS co giãn theo cỡ cửa sổ
     (min(w/1366,h/768), có sàn để chữ không quá nhỏ trên điện thoại). */
  let stageEl = null;
  function stage() {
    if (stageEl && stageEl.isConnected) return stageEl;
    stageEl = document.createElement('div');
    stageEl.className = 'p1-stage';
    stageEl.style.width = STAGE_W + 'px';
    stageEl.style.height = STAGE_H + 'px';
    uiRoot().appendChild(stageEl);
    const fit = () => {
      const s = Math.max(0.32, Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H));
      stageEl.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
    };
    fit();
    window.addEventListener('resize', fit);
    return stageEl;
  }
  // Toạ độ kiểu NGUI (tâm màn = 0,0, y hướng lên, như D:\pro-ref\ref\gamegui.txt cột abs) → trái/trên CSS.
  function at(el, cx, cy, w, h) {
    if (w != null) el.style.width = w + 'px';
    if (h != null) el.style.height = h + 'px';
    el.style.position = 'absolute';
    el.style.left = (STAGE_W / 2 + cx - (w || 0) / 2) + 'px';
    el.style.top = (STAGE_H / 2 - cy - (h || 0) / 2) + 'px';
    return el;
  }
  function el(tag, cls, parent) {
    const e = document.createElement(tag || 'div');
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, cls, text) { const e = el('div', cls, parent); e.textContent = text == null ? '' : text; return e; }
  function spr(name, w, h, cls) {
    const e = P1.proui.el(name, w != null ? { w, h } : {});
    if (cls) e.className += ' ' + cls;
    return e;
  }
  // Ảnh có thể chưa rip xong (art/pro/*): lỗi thì thêm lớp để CSS vẽ ô giữ chỗ, không vỡ giao diện.
  function img(src, cls) {
    const e = el('img', cls);
    e.draggable = false; e.loading = 'eager';
    e.onerror = () => { e.classList.add('p1-img-missing'); };
    if (src) e.src = src;   // src='' vẫn nạp (trỏ về chính trang) và bật ảnh vỡ giả — bỏ qua khi chưa có gì để vẽ
    return e;
  }
  // hook: móc kiểm thử ổn định (data-p1), thay cho đường dẫn NGUI cũ đã mất khi bỏ cây NGUI.
  function button(parent, cls, onClick, hook) {
    const b = el('div', 'p1-btn ' + (cls || ''), parent);
    b.tabIndex = 0;
    if (hook) b.dataset.p1 = hook;
    onEl(b, onClick);
    return b;
  }
  // Nút trùng vùng bấm dùng chung: click chuột + Enter/Space khi có focus bàn phím.
  function onEl(n, fn) {
    n.addEventListener('click', ev => { if (!n.classList.contains('p1-disabled')) fn(ev); });
    n.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && !n.classList.contains('p1-disabled')) { ev.preventDefault(); fn(ev); } });
  }
  function hoverEl(n, enter, leave) { n.addEventListener('pointerenter', enter); n.addEventListener('pointerleave', leave); }
  function rectOf(n) { return n ? n.getBoundingClientRect() : null; }
  function inside(r, x, y) { return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }

  // Giữ chuột trên nút +/-: lặp sau 0,4 s rồi mỗi 0,08 s (Choose Amount gốc).
  function pressAndHold(n, fn) {
    let t = 0;
    const stop = () => { clearTimeout(t); t = 0; };
    n.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      fn();
      const loop = () => { fn(); t = setTimeout(loop, 80); };
      t = setTimeout(loop, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(k => n.addEventListener(k, stop));
  }

  // Ô nhập chữ định vị trên một div PRO (input thật để gõ bàn phím, ẩn nền, đặt đúng chỗ div).
  function textInput(hostEl, opt) {
    opt = opt || {};
    const e = document.createElement('input');
    e.type = 'text';
    e.className = 'p1-input';
    e.spellcheck = false;
    e.autocomplete = 'off';
    e.maxLength = opt.limit || 40;
    e.placeholder = opt.placeholder || '';
    e.value = opt.value || '';
    hostEl.appendChild(e);
    e.addEventListener('input', () => { if (opt.onInput) opt.onInput(e.value); });
    e.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && opt.onEnter) opt.onEnter(e.value);
      if (ev.key === 'Escape') e.blur();
      ev.stopPropagation();
    });
    return { el: e, get value() { return e.value; }, set value(s) { e.value = s; }, destroy() { e.remove(); } };
  }

  // Kéo-thả đơn giản (đổi chỗ Pokémon trong đội, gửi/rút hộp PC): ghost nhỏ theo chuột, thả thì hỏi onDrop(x,y).
  function dragSource(n, onDrop) {
    n.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      const r = n.getBoundingClientRect();
      if (Math.hypot(r.width, r.height) < 4) return;
      let moved = false, ghost = null;
      const start = { x: ev.clientX, y: ev.clientY };
      const move = mv => {
        if (!moved && Math.hypot(mv.clientX - start.x, mv.clientY - start.y) > 6) {
          moved = true;
          ghost = n.cloneNode(true);
          ghost.className += ' p1-drag-ghost';
          document.body.appendChild(ghost);
        }
        if (ghost) { ghost.style.left = (mv.clientX - r.width / 2) + 'px'; ghost.style.top = (mv.clientY - r.height / 2) + 'px'; }
      };
      const up = up_ => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (ghost) ghost.remove();
        if (moved) onDrop(up_.clientX, up_.clientY);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  /* ---------------------------------------------------------------- dữ liệu vật phẩm (thuần, giữ từ bản gốc) */

  let itemIndex = null;
  function itemByKey(key) {
    if (!itemIndex) {
      itemIndex = {};
      Object.keys(P1.ITEMS || {}).map(Number).sort((a, b) => a - b).forEach(id => {
        const it = P1.ITEMS[id];
        if (!it || !it.name || id === 0) return;
        const rec = Object.assign({ id }, it);
        const k = toId(it.name);
        if (!itemIndex[k]) itemIndex[k] = rec;
        if (it.battleId && !itemIndex[it.battleId]) itemIndex[it.battleId] = rec;
      });
    }
    if (typeof key === 'number' || /^\d+$/.test(key)) {
      const it = P1.ITEMS[key];
      return it ? Object.assign({ id: +key, key: toId(it.name) }, it) : null;
    }
    const rec = itemIndex[key];
    return rec ? Object.assign({ key }, rec) : { key, name: cap(key), desc: '', img: null };
  }
  const itemKey = id => (typeof id === 'number' || /^\d+$/.test(id)) ? toId(P1.ITEMS[id].name) : id;

  // Túi đồ gốc có 6 thẻ nhưng items.txt để Pocket = 0 cho mọi món (máy chủ gửi). Chia lại theo tên.
  function pocketOf(key, it) {
    const name = it.name || key;
    if (/Ball$/.test(name)) return 'Pokeball';
    if (/^(TM|HM)\d/.test(name)) return 'TM';
    if (/Berry$/.test(name)) return 'Berries';
    if ((P1.ITEM_EFFECT && P1.ITEM_EFFECT[key]) || /Potion|Heal|Revive|Restore|Ether|Elixir|Antidote|Awakening|Candy|Water|Soda Pop|Lemonade|Milk|Protein|Iron|Calcium|Zinc|Carbos|HP Up|PP Up/.test(name)) return 'Medicine';
    if (/[Ww]hen held|holder|[Ii]f held/.test(it.desc || '')) return 'Hold';
    return 'General';
  }
  // Thẻ túi đồ hiển thị (tên, biểu tượng backpack_icon_* gần đúng nhất trong atlas PRO).
  const POCKETS = [
    { key: 'General', label: 'Chung', icon: 'backpack_icon_misc' },
    { key: 'Pokeball', label: 'Poké Ball', icon: 'backpack_icon_balls' },
    { key: 'Medicine', label: 'Thuốc', icon: 'backpack_icon_medicine' },
    { key: 'TM', label: 'TM/HM', icon: 'backpack_icon_tmhm' },
    { key: 'Berries', label: 'Quả', icon: 'backpack_icon_berries' },
    { key: 'Hold', label: 'Vật cầm', icon: 'backpack_icon_keyitems' },
  ];

  function bagAdd(key, n) {
    const bag = P1.state.bag;
    bag[key] = Math.max(0, (bag[key] || 0) + n);
    if (!bag[key] && key !== 'potion' && key !== 'pokeball') delete bag[key];
  }

  // Dùng vật phẩm ngoài trận (P1.ITEM_EFFECT của engine.js). Trả câu báo, hoặc null nếu vô ích.
  function useOn(mon, key) {
    const eff = P1.ITEM_EFFECT && P1.ITEM_EFFECT[key];
    if (!eff) return null;
    const max = P1.mon.stats(mon).hp, name = P1.mon.name(mon);
    const out = [];
    if (eff.revive && mon.hp <= 0) { mon.hp = Math.max(1, Math.floor(max * eff.revive)); out.push(name + ' đã hồi sinh!'); }
    if (eff.heal && mon.hp > 0 && mon.hp < max) {
      const amt = eff.heal === 'full' ? max : eff.heal === 'quarter' ? Math.floor(max / 4) : eff.heal;
      const before = mon.hp;
      mon.hp = Math.min(max, mon.hp + amt);
      out.push(name + ' đã hồi ' + (mon.hp - before) + ' HP.');
    }
    if (eff.cure && mon.status && mon.hp > 0 && (eff.cure === 'all' || eff.cure.includes(mon.status))) {
      mon.status = '';
      out.push(name + ' đã hết trạng thái.');
    }
    return out.length ? out.join(' ') : null;
  }

  /* ---------------------------------------------------------------- ngoại hình người chơi (lớp PRO) */

  // Cấp huấn luyện viên: bản gốc do máy chủ tính, không có công thức trong máy khách. Đoán: đường "medium", bắt đầu Lv 5.
  function trainerLevel(exp) {
    exp = Math.max(0, exp | 0);
    const level = Math.max(5, Math.floor(Math.cbrt(exp + 125) + 1e-9));
    const lo = Math.pow(level, 3) - 125, hi = Math.pow(level + 1, 3) - 125;
    return { level, cur: exp - lo, need: hi - lo };
  }
  P1.trainerLevel = trainerLevel;

  const DIR_ROW = { up: 0, right: 1, down: 2, left: 3 };  // đo trên npc/sprite1: hàng 1 quay phải, hàng 3 quay trái
  // Tấm lớp người chơi PRO: một tấm 256² mỗi (lớp, tư thế) — hàng theo DIR_ROW (0 lưng/lên, 1 trái,
  // 2 mặt/xuống, 3 phải), 3 cột đầu là khung bước, ô 64px. Tên tệp = <tên lớp>_<tư thế>.png; tư thế đi
  // là P1.PRO.pose.walk ('1' xác minh từ rip, dự phòng nếu data/pro.js chưa có).
  function paintPlayer(canvas, look, gender, dir, frame) {
    const g = gender === 'female' || gender === 'f' ? 'f' : 'm';
    const order = (P1.PRO && P1.PRO.layerOrder) || ['body', 'cloth', 'hair', 'hat'];
    const pose = (P1.PRO && P1.PRO.pose && P1.PRO.pose.walk) || '1';
    const row = DIR_ROW[dir] != null ? DIR_ROW[dir] : 2;
    const col = ((frame | 0) % 3 + 3) % 3;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width, canvas.height) / 64;
    const ox = (canvas.width - 64 * scale) / 2, oy = canvas.height - 64 * scale;
    order.forEach(part => {
      const name = look && look[part];
      if (!name) return;
      const url = 'art/pro/player/' + g + '/' + part + '/' + name + '_' + pose + '.png';
      const im = P1.imgNow(url);
      if (!im) { P1.img(url).catch(() => {}); return; }
      ctx.drawImage(im, col * 64, row * 64, 64, 64, ox, oy, 64 * scale, 64 * scale);
    });
  }

  /* ---------------------------------------------------------------- hiển thị Pokémon (thuần) */

  const IV_HEX = { grey: '9a9a9a', white: 'ffffff', green: '5cd65c', blue: '668cff', purple: 'c77dff', gold: 'ffd700' };
  const STATUS_SPRITE = { psn: 'POISON', tox: 'BPOISON', brn: 'BURN', frz: 'FREEZE', par: 'PARALIZE', slp: 'SLEEP' };
  const monName = m => P1.mon.name(m);
  const iconOf = m => 'art/pro/poke/icon/' + m.dex + (m.shiny ? 's' : '') + '.png';
  const frontOf = m => 'art/pro/poke/front/' + m.dex + (m.shiny ? 's' : '') + '.png';
  const genderSym = g => g === 'M' ? '♂' : g === 'F' ? '♀' : '';
  function expFrac(m) {
    if (m.level >= 100) return 1;
    const a = P1.mon.expAt(m.dex, m.level), b = P1.mon.expAt(m.dex, m.level + 1);
    return clamp((m.exp - a) / Math.max(1, b - a), 0, 1);
  }

  /* ---------------------------------------------------------------- ngăn xếp cửa sổ (màn) */

  const stack = [];
  let busy = 0;
  function mount(name, build) {
    const root = el('div', 'p1-panel p1-panel-' + name);
    stage().appendChild(root);
    let resolve;
    const e = { name, root, cleanup: [], done: new Promise(r => { resolve = r; }) };
    e.close = val => {
      if (e.closed) return;
      e.closed = true;
      e.cleanup.splice(0).forEach(f => f());
      root.remove();
      const i = stack.indexOf(e);
      if (i >= 0) stack.splice(i, 1);
      resolve(val);
    };
    build(e);
    stack.push(e);
    return e;
  }
  const top = () => stack[stack.length - 1];
  const find = name => stack.find(e => e.name === name);
  function closeAll() { while (stack.length) top().close(); }
  function changed() { huds.forEach(h => h.alive && h.refresh()); stack.forEach(e => { if (e.refresh) e.refresh(); }); }

  /* ---------------------------------------------------------------- thông báo / hộp thoại chọn */

  let toastN = 0;
  function toast(text) {
    const e = el('div', 'p1-toast');
    const bg = spr('General_popup_bg', 480, 40, 'p1-toast-bg');
    e.appendChild(bg);
    txt(e, 'p1-toast-text', text);
    at(e, 0, 260 - (toastN++) * 46, 480, 40);
    stage().appendChild(e);
    requestAnimationFrame(() => { e.style.opacity = '1'; });
    setTimeout(() => { e.style.opacity = '0'; }, 2000);
    setTimeout(() => { e.remove(); toastN = Math.max(0, toastN - 1); }, 2400);
    return e;
  }

  function message(o) {
    o = o || {};
    return mount('message', e => {
      const box = el('div', 'p1-popup', e.root);
      at(box, 0, 0, 420, 220);
      box.appendChild(spr('General_popup_bg', 420, 220));
      txt(box, 'p1-popup-title', o.title || '');
      txt(box, 'p1-popup-text', o.text || '');
      const row = el('div', 'p1-popup-buttons', box);
      const two = o.no !== null && o.no !== undefined;
      if (two) {
        const yes = button(row, 'p1-btn-round', () => e.close(true), 'msg-yes'); yes.textContent = o.yes || 'Đồng ý';
        const no = button(row, 'p1-btn-round', () => e.close(false), 'msg-no'); no.textContent = o.no || 'Thôi';
      } else {
        const ok = button(row, 'p1-btn-round', () => e.close(true), 'msg-ok'); ok.textContent = o.yes || 'OK';
      }
      e.escValue = false;
    }).done;
  }

  /* ---------------------------------------------------------------- HUD (thanh đội, menu, giờ/bản đồ) */

  const huds = [];
  const MAP_NAMES = { pallet_house_2f: 'Nhà — Tầng 2', pallet_house_1f: 'Nhà — Tầng 1' };
  function mapLabel() {
    const id = (P1.state && P1.state.map) || '';
    return MAP_NAMES[id] || (P1.MAPS && P1.MAPS[id] && P1.MAPS[id].name) || id.replace(/_/g, ' ');
  }
  function timeSprite() {
    const p = P1.period ? P1.period() : 'day';
    return p === 'night' ? 'HUD_time_night' : p === 'morning' || p === 'evening' ? 'HUD_time_morning' : 'HUD_time_day';
  }

  const MENU_BUTTONS = [
    { key: 'party', label: 'Đội', icon: 'pokeball_icon_big' },
    { key: 'bag', label: 'Balo', icon: 'HUD_menu_button_icon_backpack' },
    { key: 'dex', label: 'Pokédex', icon: 'HUD_menu_button_icon_pokedex' },
    { key: 'trainer', label: 'Thẻ HLV', icon: 'HUD_menu_button_icon_trainer' },
    { key: 'market', label: 'Chợ trời', icon: 'HUD_menu_button_icon_shop' },
    { key: 'options', label: 'Cài đặt', icon: 'Button_menu' },
  ];

  function hud(parent) {
    const wrap = el('div', 'p1-hud');
    (parent || uiRoot()).appendChild(wrap);
    const root = el('div', 'p1-stage p1-hud-stage');
    root.style.width = STAGE_W + 'px'; root.style.height = STAGE_H + 'px';
    wrap.appendChild(root);
    const fit = () => {
      const s = Math.max(0.32, Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H));
      root.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
      // Màn rất nhỏ (điện thoại ngang, ~844×390): thanh đội thu gọn còn biểu tượng + thanh máu, bỏ tên/Lv/EXP
      // để không đè lên vùng chơi và khung chat (440×280 dành sẵn ở góc dưới phải).
      wrap.classList.toggle('p1-compact', innerWidth < 500 || innerHeight < 500);
    };
    fit();
    window.addEventListener('resize', fit);

    /* -- thanh đội, góc trên trái (neo theo góc màn hình: giá trị abs() gốc là điểm neo widget NGUI,
       không phải tâm hộp, nên ở đây đặt trực tiếp theo góc thay vì dịch máy qua at()). */
    const team = el('div', 'p1-team', root);
    team.style.left = '10px'; team.style.top = '10px'; team.style.width = '260px';
    const slots = [];
    for (let i = 0; i < 6; i++) {
      const s = el('div', 'p1-mon-slot', team);   // team xếp bằng flex column (CSS); .p1-compact đổi gap/cỡ ở đó
      s.dataset.p1 = 'hud-team-' + i;
      const ball = spr('BG_ball 1', 54, 54, 'p1-mon-ball'); s.appendChild(ball);
      const icon = img('', 'p1-mon-icon'); s.appendChild(icon);
      const bg = spr('HUD_pkmn_BG', 150, 40, 'p1-mon-bg'); s.appendChild(bg);
      const name = txt(s, 'p1-mon-name', '');
      const level = txt(s, 'p1-mon-level', '');
      const hpWrap = spr('hp_bar', 76, 10, 'p1-mon-hpbar'); s.appendChild(hpWrap);
      const hpFill = spr('hp_fill', 76, 10, 'p1-mon-hpfill'); hpWrap.appendChild(hpFill);
      const expFill = spr('exp_fill', 150, 4, 'p1-mon-expfill'); s.appendChild(expFill);
      const gender = txt(s, 'p1-mon-gender', '');
      const shiny = spr('shiny', 18, 18, 'p1-mon-shiny'); s.appendChild(shiny);
      const status = spr('POISON', 20, 20, 'p1-mon-status'); s.appendChild(status);
      slots.push({ s, icon, name, level, hpFill, expFill, gender, shiny, status });
      onEl(s, () => { if (!P1.state.party[i]) return; const card = find('party'); if (card) card.select(i); else ui.open('party', i); });
      dragSource(s, (x, y) => {
        const party = P1.state.party;
        for (let j = 0; j < 6; j++) {
          if (j !== i && party[j] && inside(rectOf(slots[j].s), x, y)) {
            [party[i], party[j]] = [party[j], party[i]];
            changed();
            return true;
          }
        }
        const box = find('pokebox');
        if (box && box.dropFromParty && box.dropFromParty(i, x, y)) return true;
        return false;
      });
    }

    /* -- menu dưới trái (6 nút: Đội/Balo/Pokédex/Thẻ HLV/Chợ trời/Cài đặt — rộng hơn bản gốc PRO vì
       ta thêm nút Đội và Chợ trời không có trong GameMenu gốc). */
    const MENU_W = 360, MENU_H = 78;
    const menu = el('div', 'p1-menu', root);
    menu.style.left = '8px'; menu.style.bottom = '8px'; menu.style.width = MENU_W + 'px'; menu.style.height = MENU_H + 'px';
    menu.appendChild(spr('HUD_menu_bg', MENU_W, MENU_H));
    const menuRow = el('div', 'p1-menu-row', menu);
    MENU_BUTTONS.forEach(b => {
      const btn = el('div', 'p1-menu-btn', menuRow);
      btn.title = b.label;
      btn.dataset.p1 = 'hud-menu-' + b.key;
      const bg = spr('HUD_menu_button_normal', 46, 46, 'p1-menu-btn-bg'); btn.appendChild(bg);
      const ic = spr(b.icon, 30, 30, 'p1-menu-btn-icon'); btn.appendChild(ic);
      onEl(btn, () => {
        if (b.key === 'market') { if (P1.market && P1.market.open) P1.market.open(); return; }
        ui.open(b.key);
      });
      if (b.key === 'market') btn.classList.toggle('p1-hidden', !(P1.market && P1.market.open));
    });
    const money0 = txt(menu, 'p1-menu-money', '');

    /* -- tên map + giờ, góc trên phải */
    const topRight = el('div', 'p1-topright', root);
    topRight.style.right = '10px'; topRight.style.top = '10px'; topRight.style.width = '260px'; topRight.style.height = '70px';
    const timeIcon = spr('HUD_time_day', 60, 60, 'p1-time-icon'); topRight.appendChild(timeIcon);
    const mapText = txt(topRight, 'p1-map-name', '');

    // view.root = <div> ngoài cùng (world.js ẩn/hiện HUD lúc vào trận qua hud.view.root.style.display).
    const h = { view: { root: wrap }, el: wrap, alive: true };
    h.refresh = () => {
      const st = P1.state;
      if (!st || !h.alive) return;
      money0.textContent = '₽' + money(st.money);
      mapText.textContent = mapLabel();
      P1.proui.apply(timeIcon, timeSprite());
      for (let i = 0; i < 6; i++) {
        const m = st.party[i], slot = slots[i];
        slot.s.classList.toggle('p1-empty', !m);
        if (!m) {
          // Dọn trạng thái sáng/huy hiệu còn sót lại từ lần slot này còn Pokémon (đội co lại): style.display
          // gắn trực tiếp thắng mọi luật CSS, nên .p1-empty một mình không đủ để ẩn nếu không dọn ở đây.
          slot.shiny.style.display = 'none';
          slot.status.style.display = 'none';
          continue;
        }
        slot.icon.src = iconOf(m);
        slot.name.textContent = (m.shiny ? '★' : '') + monName(m);
        slot.level.textContent = 'Lv' + m.level;
        const max = P1.mon.stats(m).hp, f = clamp(m.hp / max, 0, 1);
        slot.hpFill.style.width = Math.round(f * 76) + 'px';
        slot.hpFill.classList.toggle('p1-hp-low', f <= 0.2);
        slot.hpFill.classList.toggle('p1-hp-mid', f > 0.2 && f <= 0.5);
        slot.expFill.style.width = Math.round(expFrac(m) * 150) + 'px';
        slot.gender.textContent = genderSym(m.gender);
        slot.shiny.style.display = m.shiny ? 'block' : 'none';
        const ss = m.hp <= 0 ? null : STATUS_SPRITE[m.status];
        slot.status.style.display = ss ? 'block' : 'none';
        if (ss) P1.proui.apply(slot.status, ss);
      }
    };
    h.destroy = () => { h.alive = false; wrap.remove(); const i = huds.indexOf(h); if (i >= 0) huds.splice(i, 1); };
    huds.push(h);
    h.refresh();
    return h;
  }

  /* ---------------------------------------------------------------- Esc → menu (Lưu / Cài đặt / Về màn đầu) */

  function menu() {
    return mount('menu', e => {
      const box = el('div', 'p1-popup p1-esc-menu', e.root);
      at(box, 0, 0, 300, 260);
      box.appendChild(spr('backpack_no_scrollbar_bg', 300, 260));
      txt(box, 'p1-popup-title', 'Menu');
      const rows = el('div', 'p1-esc-rows', box);
      const mk = (label, fn, hook) => { const b = button(rows, 'p1-btn-row', fn, hook); b.textContent = label; return b; };
      mk('Lưu trò chơi', () => { P1.save(); toast('Đã lưu.'); }, 'menu-save');
      mk('Cài đặt', () => { e.close(); ui.open('options'); }, 'menu-options');
      mk('Về màn đầu', async () => {
        const yes = await message({ title: 'Về màn đầu?', text: 'Trò chơi đã lưu chưa lưu sẽ mất.', yes: 'Về', no: 'Ở lại' });
        if (yes) { closeAll(); P1.scene.go('title'); }
      }, 'menu-title');
      e.escValue = undefined;
    }).done;
  }

  /* ---------------------------------------------------------------- đội Pokémon (đầy đủ, IV, chiêu, dùng đồ) */

  function party(startIndex) {
    return mount('party', e => {
      const box = el('div', 'p1-popup p1-party', e.root);
      at(box, 0, 0, 620, 460);
      box.appendChild(spr('backpack_with_scrollbar_bg', 620, 460));
      const closeBtn = button(box, 'p1-btn-close', () => e.close(), 'close');
      closeBtn.appendChild(spr('close', 28, 28));
      const list = el('div', 'p1-party-list', box);
      const detail = el('div', 'p1-party-detail', box);
      const tabsEl = el('div', 'p1-tabs', detail);
      const tabs = ['Info', 'Move', 'IV', 'EV'];
      let tab = 0, index = startIndex || 0;
      const tabBtns = tabs.map((t, i) => { const b = button(tabsEl, 'p1-tab', () => { tab = i; render(); }, 'party-tab-' + i); b.textContent = t; return b; });
      const body = el('div', 'p1-party-body', detail);

      e.select = i => { index = i; render(); };
      e.index = index;

      function renderList() {
        list.innerHTML = '';
        P1.state.party.forEach((m, i) => {
          const row = el('div', 'p1-party-row' + (i === index ? ' p1-sel' : ''), list);
          row.dataset.p1 = 'party-row-' + i;
          row.appendChild(img(iconOf(m), 'p1-party-row-icon'));
          txt(row, 'p1-party-row-name', (m.shiny ? '★' : '') + monName(m) + '  Lv' + m.level);
          onEl(row, () => { index = i; e.index = i; render(); });
        });
      }
      function render() {
        e.index = index;
        renderList();
        tabBtns.forEach((b, i) => b.classList.toggle('p1-active', i === tab));
        const m = P1.state.party[index];
        body.innerHTML = '';
        if (!m) return;
        if (tab === 0) renderInfo(m);
        else if (tab === 1) renderMoves(m);
        else if (tab === 2) renderIV(m);
        else renderEV(m);
      }
      function renderInfo(m) {
        const sp = P1.mon.species(m.dex);
        body.appendChild(img(frontOf(m), 'p1-party-portrait'));
        const nm = txt(body, 'p1-party-name', (m.shiny ? '★ ' : '') + monName(m) + ' ' + genderSym(m.gender));
        nm.style.color = '#' + IV_HEX[P1.mon.ivColor(m)];
        txt(body, 'p1-party-sub', 'Lv' + m.level + '  #' + m.dex + ' ' + (sp.name || ''));
        const stats = P1.mon.stats(m);
        const st = el('div', 'p1-stat-grid', body);
        ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach(k => txt(st, 'p1-stat', k.toUpperCase() + ' ' + (k === 'hp' ? m.hp + '/' + stats.hp : stats[k])));
        const actions = el('div', 'p1-party-actions', body);
        const useBtn = button(actions, 'p1-btn-row', async () => {
          const key = await pickBagItem(k => P1.ITEM_EFFECT && P1.ITEM_EFFECT[itemKey(k)]);
          if (!key) return;
          const msg = useOn(m, key);
          if (msg) { bagAdd(key, -1); toast(msg); changed(); }
          else toast('Không có tác dụng.');
        }, 'party-use');
        useBtn.textContent = 'Dùng vật phẩm';
        if (P1.chat && P1.chat.showMon) { const b = button(actions, 'p1-btn-row', () => P1.chat.showMon(m), 'party-chat'); b.textContent = 'Khoe lên chat'; }
        if (P1.market && P1.market.listMon) { const b = button(actions, 'p1-btn-row', () => P1.market.listMon(m, 'party', index), 'party-market'); b.textContent = 'Đăng lên chợ'; }
      }
      function renderMoves(m) {
        const grid = el('div', 'p1-move-grid', body);
        m.moves.forEach(s => {
          const mv = P1.Dex.moves.get(s.id);
          const row = el('div', 'p1-move-row', grid);
          txt(row, 'p1-move-name', mv.name);
          txt(row, 'p1-move-type', (mv.type || '').toLowerCase());
          txt(row, 'p1-move-pp', s.pp + '/' + s.ppMax);
        });
      }
      function renderIV(m) {
        const grid = el('div', 'p1-stat-grid', body);
        Object.keys(m.ivs).forEach(k => txt(grid, 'p1-stat', k.toUpperCase() + ' ' + m.ivs[k] + '/31'));
      }
      function renderEV(m) {
        const grid = el('div', 'p1-stat-grid', body);
        Object.keys(m.evs).forEach(k => txt(grid, 'p1-stat', k.toUpperCase() + ' ' + m.evs[k] + '/252'));
      }
      e.refresh = render;
      render();
    }).done;
  }

  // Hộp chọn nhanh một món trong túi (dùng cho "Dùng vật phẩm" ở màn đội): lọc theo filter(key), trả key hoặc null.
  function pickBagItem(filter) {
    return mount('select', e => {
      const box = el('div', 'p1-popup p1-item-pick', e.root);
      at(box, 0, 0, 360, 320);
      box.appendChild(spr('backpack_no_scrollbar_bg', 360, 320));
      txt(box, 'p1-popup-title', 'Chọn vật phẩm');
      const grid = el('div', 'p1-item-grid', box);
      Object.keys(P1.state.bag).filter(k => P1.state.bag[k] > 0).forEach(k => {
        const it = itemByKey(k);
        if (filter && !filter(k)) return;
        const cell = el('div', 'p1-item-cell', grid);
        cell.dataset.p1 = 'pick-item-' + k;
        cell.appendChild(img(it.img || '', 'p1-item-icon'));
        txt(cell, 'p1-item-name', it.name + ' ×' + P1.state.bag[k]);
        onEl(cell, () => e.close(k));
      });
      const cancel = button(box, 'p1-btn-round p1-item-cancel', () => e.close(null), 'pick-cancel'); cancel.textContent = 'Huỷ';
      e.escValue = null;
    }).done;
  }

  /* ---------------------------------------------------------------- túi đồ */

  function bag() {
    return mount('bag', e => {
      const box = el('div', 'p1-popup p1-bag', e.root);
      at(box, 0, 0, 560, 440);
      box.appendChild(spr('backpack_with_scrollbar_bg', 560, 440));
      const closeBtn = button(box, 'p1-btn-close', () => e.close(), 'close');
      closeBtn.appendChild(spr('close', 28, 28));
      const tabsEl = el('div', 'p1-tabs p1-bag-tabs', box);
      const grid = el('div', 'p1-item-grid p1-bag-grid', box);
      const detail = el('div', 'p1-bag-detail', box);
      // Mở sẵn thẻ đầu tiên có đồ (mở vào thẻ 'Chung' trống trơn trông như hỏng nếu túi chưa có gì ở đó).
      const nonEmpty = POCKETS.find(p => Object.keys(P1.state.bag).some(k => P1.state.bag[k] > 0 && pocketOf(k, itemByKey(k)) === p.key));
      let pocket = (nonEmpty || POCKETS[0]).key;
      const tabBtns = POCKETS.map(p => {
        const b = el('div', 'p1-tab p1-pocket-tab', tabsEl);
        b.dataset.p1 = 'bag-pocket-' + p.key;
        b.appendChild(spr(p.icon + '_off', 32, 32));
        b.title = p.label;
        onEl(b, () => { pocket = p.key; render(); });
        return b;
      });
      let selected = null;
      function items() {
        return Object.keys(P1.state.bag).filter(k => P1.state.bag[k] > 0)
          .map(k => ({ key: k, it: itemByKey(k), n: P1.state.bag[k] }))
          .filter(r => pocketOf(r.key, r.it) === pocket);
      }
      function render() {
        tabBtns.forEach((b, i) => b.classList.toggle('p1-active', POCKETS[i].key === pocket));
        grid.innerHTML = '';
        items().forEach(r => {
          const cell = el('div', 'p1-item-cell' + (selected === r.key ? ' p1-sel' : ''), grid);
          cell.dataset.p1 = 'bag-item-' + r.key;
          cell.appendChild(img(r.it.img || '', 'p1-item-icon'));
          txt(cell, 'p1-item-name', r.it.name);
          txt(cell, 'p1-item-count', '×' + r.n);
          onEl(cell, () => { selected = r.key; render(); });
        });
        detail.innerHTML = '';
        const r = items().find(x => x.key === selected);
        if (!r) return;
        txt(detail, 'p1-item-desc-name', r.it.name);
        txt(detail, 'p1-item-desc', r.it.desc || '');
        const useBtn = button(detail, 'p1-btn-row', async () => {
          const dmy = await mount('item', ie => {
            const b2 = el('div', 'p1-popup p1-item-use', ie.root);
            at(b2, 0, 0, 320, 200);
            b2.appendChild(spr('backpack_no_scrollbar_bg', 320, 200));
            txt(b2, 'p1-popup-title', 'Dùng cho ai?');
            const gg = el('div', 'p1-item-grid', b2);
            P1.state.party.forEach((m, i) => {
              const cell = el('div', 'p1-item-cell', gg);
              cell.dataset.p1 = 'use-target-' + i;
              cell.appendChild(img(iconOf(m), 'p1-item-icon'));
              txt(cell, 'p1-item-name', monName(m));
              onEl(cell, () => ie.close(i));
            });
            const cancel = button(b2, 'p1-btn-round', () => ie.close(-1), 'use-cancel'); cancel.textContent = 'Huỷ';
            ie.escValue = -1;
          }).done;
          if (dmy < 0) return;
          const msg = useOn(P1.state.party[dmy], r.key);
          if (msg) { bagAdd(r.key, -1); toast(msg); selected = null; changed(); }
          else toast('Không có tác dụng.');
        }, 'bag-use');
        useBtn.textContent = 'Dùng';
      }
      e.refresh = render;
      render();
    }).done;
  }

  /* ---------------------------------------------------------------- Pokédex */

  function dex() {
    return mount('dex', e => {
      const box = el('div', 'p1-popup p1-dex', e.root);
      at(box, 0, 0, 700, 500);
      box.appendChild(spr('backpack_with_scrollbar_bg', 700, 500));
      const closeBtn = button(box, 'p1-btn-close', () => e.close(), 'close');
      closeBtn.appendChild(spr('close', 28, 28));
      const header = el('div', 'p1-dex-header', box);
      const search = textInput(header, { placeholder: 'Tìm...', onInput: () => { query = search.value.toLowerCase(); render(); } });
      search.el.dataset.p1 = 'dex-search';
      const counts = txt(header, 'p1-dex-counts', '');
      const grid = el('div', 'p1-dex-grid', box);
      const detail = el('div', 'p1-dex-detail', box);
      const all = Object.keys(P1.SPECIES || {}).map(Number).sort((a, b) => a - b);
      let query = '', sel = 0;
      function render() {
        const D = P1.state.dex;
        counts.textContent = 'Đã thấy: ' + Object.keys(D.seen).length + '  Đã bắt: ' + Object.keys(D.caught).length;
        grid.innerHTML = '';
        all.filter(d => !query || String(d).includes(query) || (D.seen[d] && P1.SPECIES[d].name.toLowerCase().includes(query)))
          .forEach(d => {
            const cell = el('div', 'p1-dex-cell' + (d === sel ? ' p1-sel' : ''), grid);
            cell.dataset.p1 = 'dex-cell-' + d;
            if (D.seen[d]) cell.appendChild(img(iconOf({ dex: d, shiny: false }), 'p1-item-icon'));
            txt(cell, 'p1-dex-num', '#' + String(d).padStart(3, '0'));
            if (D.caught[d]) cell.classList.add('p1-caught');
            onEl(cell, () => { if (D.seen[d]) { sel = d; render(); } });
          });
        detail.innerHTML = '';
        if (!D.seen[sel]) { txt(detail, 'p1-dex-unknown', '?'); return; }
        const S = P1.SPECIES[sel];
        detail.appendChild(img(frontOf({ dex: sel, shiny: false }), 'p1-dex-portrait'));
        txt(detail, 'p1-dex-name', '#' + sel + ' ' + S.name);
        txt(detail, 'p1-dex-desc', S.desc || '');
      }
      e.refresh = render;
      render();
    }).done;
  }

  /* ---------------------------------------------------------------- thẻ huấn luyện viên */

  function trainer() {
    return mount('trainer', e => {
      const box = el('div', 'p1-popup p1-trainer', e.root);
      at(box, 0, 0, 420, 320);
      box.appendChild(spr('backpack_no_scrollbar_bg', 420, 320));
      const closeBtn = button(box, 'p1-btn-close', () => e.close(), 'close');
      closeBtn.appendChild(spr('close', 28, 28));
      const canvas = el('canvas', 'p1-trainer-portrait', box);
      canvas.width = 128; canvas.height = 128;
      const name = txt(box, 'p1-trainer-name', '');
      const values = txt(box, 'p1-trainer-values', '');
      e.refresh = () => {
        const st = P1.state, T = trainerLevel(st.trainerExp);
        paintPlayer(canvas, st.player.look, st.player.gender, 'down', 0);
        name.textContent = st.player.name + '  (Lv' + T.level + ')';
        values.textContent = ['Tiền: ₽' + money(st.money),
          'Đã thấy: ' + Object.keys(st.dex.seen).length,
          'Đã bắt: ' + Object.keys(st.dex.caught).length].join('\n');
      };
      e.refresh();
    }).done;
  }

  /* ---------------------------------------------------------------- cài đặt (danh sách rút gọn, P1.SETTINGS_DEF cũ đã bỏ) */

  function options() {
    return mount('options', e => {
      const box = el('div', 'p1-popup p1-options', e.root);
      at(box, 0, 0, 420, 360);
      box.appendChild(spr('backpack_no_scrollbar_bg', 420, 360));
      const closeBtn = button(box, 'p1-btn-close', () => e.close(), 'close');
      closeBtn.appendChild(spr('close', 28, 28));
      txt(box, 'p1-popup-title', 'Cài đặt');
      const rows = el('div', 'p1-options-rows', box);
      function slider(label, key, hook, onChange) {
        const row = el('div', 'p1-option-row', rows);
        txt(row, 'p1-option-label', label);
        const s = el('input', 'p1-option-slider', row);
        s.type = 'range'; s.min = 0; s.max = 1; s.step = 0.01; s.value = P1.settings[key];
        s.dataset.p1 = hook;
        s.addEventListener('input', () => { const v = +s.value; P1.setSetting(key, v); if (onChange) onChange(v); });
        return s;
      }
      slider('Âm nhạc', 'musicVolume', 'opt-music');
      slider('Âm thanh', 'soundVolume', 'opt-sound');
      const row = el('div', 'p1-option-row', rows);
      txt(row, 'p1-option-label', 'Tốc độ chữ');
      const speedSel = el('select', 'p1-option-select', row);
      speedSel.dataset.p1 = 'opt-speed';
      [['slow', 'Chậm'], ['normal', 'Vừa'], ['fast', 'Nhanh']].forEach(([v, l]) => { const o = el('option', '', speedSel); o.value = v; o.textContent = l; });
      speedSel.value = P1.settings.textSpeed || 'normal';
      speedSel.addEventListener('change', () => P1.setSetting('textSpeed', speedSel.value));
      const bumpRow = el('div', 'p1-option-row', rows);
      const bump = el('input', '', bumpRow); bump.type = 'checkbox'; bump.checked = !!P1.settings.bumpSound;
      bump.dataset.p1 = 'opt-bump';
      bump.addEventListener('change', () => P1.setSetting('bumpSound', bump.checked));
      txt(bumpRow, 'p1-option-label', 'Rung khi đụng tường');
      bumpRow.insertBefore(bump, bumpRow.firstChild);
      e.escValue = undefined;
    }).done;
  }

  /* ---------------------------------------------------------------- hộp PC */

  function pokebox() {
    return mount('pokebox', e => {
      const box = el('div', 'p1-popup p1-pokebox', e.root);
      at(box, 0, 0, 620, 440);
      box.appendChild(spr('backpack_with_scrollbar_bg', 620, 440));
      const closeBtn = button(box, 'p1-btn-close', () => e.close(), 'close');
      closeBtn.appendChild(spr('close', 28, 28));
      const boxView = el('div', 'p1-box-grid', box);
      function render() {
        boxView.innerHTML = '';
        P1.state.box.forEach((m, i) => {
          const cell = el('div', 'p1-item-cell', boxView);
          cell.dataset.p1 = 'box-cell-' + i;
          cell.appendChild(img(iconOf(m), 'p1-item-icon'));
          txt(cell, 'p1-item-name', monName(m));
          onEl(cell, () => {
            if (P1.state.party.length >= 6) { toast('Đội đã đầy.'); return; }
            P1.state.party.push(m);
            P1.state.box.splice(i, 1);
            changed();
          });
        });
      }
      e.refresh = render;
      e.dropFromParty = (i, x, y) => {
        if (!inside(rectOf(boxView), x, y)) return false;
        const m = P1.state.party[i];
        if (!m) return false;
        P1.state.party.splice(i, 1);
        P1.state.box.push(m);
        changed();
        return true;
      };
      render();
    }).done;
  }

  const SCREENS = { menu, party, bag, dex, trainer, options, pokebox };

  /* ---------------------------------------------------------------- cửa hàng */

  function shop(items) {
    return mount('shop', e => {
      const box = el('div', 'p1-popup p1-shop', e.root);
      at(box, 0, 0, 560, 440);
      box.appendChild(spr('backpack_with_scrollbar_bg', 560, 440));
      const closeBtn = button(box, 'p1-btn-close', () => e.close(), 'close');
      closeBtn.appendChild(spr('close', 28, 28));
      const money0 = txt(box, 'p1-shop-money', '');
      const grid = el('div', 'p1-item-grid', box);
      const detail = el('div', 'p1-shop-detail', box);
      const list = (items || []).map(x => { const k = itemKey(x.id); return { k, it: itemByKey(k), price: x.price | 0 }; });
      let sel = 0, amount = 1;
      const cells = list.map((r, i) => {
        const cell = el('div', 'p1-item-cell', grid);
        cell.dataset.p1 = 'shop-item-' + i;
        cell.appendChild(img(r.it.img || '', 'p1-item-icon'));
        txt(cell, 'p1-item-name', r.it.name);
        txt(cell, 'p1-item-price', '₽' + money(r.price));
        onEl(cell, () => { sel = i; amount = 1; render(); });
        return cell;
      });
      function render() {
        money0.textContent = 'Tiền: ₽' + money(P1.state.money);
        cells.forEach((c, i) => c.classList.toggle('p1-sel', i === sel));
        detail.innerHTML = '';
        const r = list[sel];
        if (!r) return;
        txt(detail, 'p1-shop-name', r.it.name);
        const amtRow = el('div', 'p1-shop-amount', detail);
        const less = button(amtRow, 'p1-btn-round', () => {}, 'shop-less'); less.textContent = '−';
        const amtLabel = txt(amtRow, 'p1-shop-amount-label', String(amount));
        const more = button(amtRow, 'p1-btn-round', () => {}, 'shop-more'); more.textContent = '+';
        pressAndHold(less, () => { amount = clamp(amount - 1, 1, 99); amtLabel.textContent = String(amount); totalLabel.textContent = '₽' + money(r.price * amount); });
        pressAndHold(more, () => { amount = clamp(amount + 1, 1, 99); amtLabel.textContent = String(amount); totalLabel.textContent = '₽' + money(r.price * amount); });
        const totalLabel = txt(detail, 'p1-shop-total', '₽' + money(r.price * amount));
        const buy = button(detail, 'p1-btn-row', () => {
          const cost = r.price * amount;
          if (P1.state.money < cost) { toast('Không đủ tiền.'); return; }
          P1.state.money -= cost;
          bagAdd(r.k, amount);
          toast('Đã mua ' + amount + 'x ' + r.it.name + '.');
          amount = 1;
          changed();
        }, 'shop-buy');
        buy.textContent = 'Mua';
      }
      e.refresh = render;
      render();
    }).done;
  }

  /* ---------------------------------------------------------------- hồi máu ở Trung tâm Pokémon */

  async function heal() {
    busy++;
    try {
      const under = el('div', 'p1-blackout');
      stage().appendChild(under);
      under.style.opacity = '0';
      await wait(20);
      under.style.opacity = '1';
      await wait(380);
      P1.state.party.forEach(m => P1.mon.heal(m));
      changed();
      const src = P1.audio && P1.audio.sfx ? await P1.audio.sfx('heal_pokemon') : null;
      const dur = src && src.buffer ? src.buffer.duration * 1000 : 1200;
      await wait(Math.max(600, dur));
      under.style.opacity = '0';
      await wait(380);
      under.remove();
    } finally { busy--; }
  }

  /* ---------------------------------------------------------------- học chiêu */

  function learnMove(mon, moveId) {
    const mv = P1.Dex.moves.get(moveId);
    if (mon.moves.length < 4) {
      P1.mon.learn(mon, mv.id);
      toast(monName(mon) + ' đã học ' + mv.name + '!');
      changed();
      return Promise.resolve(mon.moves.length - 1);
    }
    return mount('learn', e => {
      const box = el('div', 'p1-popup p1-learn', e.root);
      at(box, 0, 0, 480, 360);
      box.appendChild(spr('backpack_no_scrollbar_bg', 480, 360));
      box.appendChild(img(frontOf(mon), 'p1-learn-portrait'));
      txt(box, 'p1-learn-text', monName(mon) + ' muốn học ' + mv.name + ', nhưng đã biết 4 chiêu. Quên chiêu nào?');
      const rows = el('div', 'p1-learn-rows', box);
      mon.moves.forEach((s, i) => {
        const old = P1.Dex.moves.get(s.id);
        const b = button(rows, 'p1-btn-row', () => {
          P1.mon.learn(mon, mv.id, i);
          toast(monName(mon) + ' đã quên ' + old.name + ', học ' + mv.name + '!');
          changed();
          e.close(i);
        }, 'learn-forget-' + i);
        b.textContent = 'Quên ' + old.name;
      });
      const dontLearn = button(box, 'p1-btn-row', () => { toast(monName(mon) + ' không học ' + mv.name + '.'); e.close(null); }, 'learn-dontlearn');
      dontLearn.textContent = 'Không học ' + mv.name;
      e.escValue = null;
    }).done;
  }

  /* ---------------------------------------------------------------- tiến hoá */

  function evolve(mon, intoDex) {
    return mount('evolve', e => {
      const box = el('div', 'p1-popup p1-evolve', e.root);
      at(box, 0, 0, 480, 380);
      box.appendChild(spr('evolution_BG', 480, 380));
      box.appendChild(spr('evolution_plattform', 300, 60));
      const fromName = monName(mon), toName = P1.mon.species(intoDex).name;
      const portrait = img(frontOf(mon), 'p1-evolve-portrait');
      box.appendChild(portrait);
      txt(box, 'p1-evolve-text', fromName + ' đang tiến hoá thành ' + toName + '. Bạn có muốn không?');
      const row = el('div', 'p1-popup-buttons', box);
      const yes = button(row, 'p1-btn-round', () => finish(true), 'evolve-yes'); yes.textContent = 'Có';
      const no = button(row, 'p1-btn-round', () => finish(false), 'evolve-no'); no.textContent = 'Không';
      let flick = 0, on = true;
      const timer = setInterval(() => { flick = 1 - flick; portrait.src = flick ? frontOf({ dex: intoDex, shiny: mon.shiny }) : frontOf(mon); }, 220);
      e.cleanup.push(() => clearInterval(timer));
      function finish(yesAnswer) {
        clearInterval(timer);
        if (yesAnswer) {
          P1.mon.evolve(mon, intoDex);
          portrait.src = frontOf(mon);
          if (P1.audio && P1.audio.cry) P1.audio.cry(intoDex);
          if (P1.caught) P1.caught(intoDex);
          toast('Chúc mừng! ' + fromName + ' đã tiến hoá thành ' + toName + '!');
          changed();
          setTimeout(() => e.close(true), 700);
        } else {
          portrait.src = frontOf(mon);
          e.close(false);
        }
      }
      e.escValue = false;
    }).done;
  }

  /* ---------------------------------------------------------------- hộp thoại NPC (kiểu NpcDialoguePanel) */

  const dialog = { active: false };
  let dv = null;
  function dialogView() {
    if (!dv || !dv.root.isConnected) {
      const root = el('div', 'p1-dialog');
      root.dataset.p1 = 'dialog-box';
      stage().appendChild(root);
      at(root, 0, 96, 900, 190);
      const bg = spr('window_place_for_buttons', 900, 190); root.appendChild(bg);
      const nameEl = txt(root, 'p1-dialog-name', '');
      const textEl = txt(root, 'p1-dialog-text', '');
      const arrow = spr('arrowright (1)', 20, 20, 'p1-dialog-arrow'); root.appendChild(arrow);
      // Danh sách lựa chọn nằm ngay dưới hộp thoại: đặt theo góc của root (900px), không dùng at()
      // (at() tính theo tâm sân khấu, choices lại là con của root chứ không phải con trực tiếp của stage).
      const choices = el('div', 'p1-dialog-choices', root);
      choices.style.left = '0'; choices.style.top = '100%'; choices.style.width = '900px';
      dv = { root, nameEl, textEl, arrow, choices };
    }
    return dv;
  }
  function showDialog(on) { dialogView().root.classList.toggle('p1-visible', on); }

  function paginate(text) {
    const out = [];
    String(text).split(/\n\n+/).forEach(par => {
      const words = par.replace(/\n/g, ' ').split(/\s+/).filter(Boolean), lines = [];
      let line = '';
      words.forEach(w => {
        const next = line ? line + ' ' + w : w;
        if (next.length > 64 && line) { lines.push(line); line = w; } else line = next;
      });
      if (line) lines.push(line);
      for (let i = 0; i < lines.length; i += 3) out.push(lines.slice(i, i + 3).join('\n'));
    });
    return out.length ? out : [''];
  }
  const SPEED_CPS = { slow: 20, normal: 35, fast: 70 };
  function typePage(text) {
    const v = dialogView();
    const cps = SPEED_CPS[P1.settings && P1.settings.textSpeed] || 35;
    let shown = -1, t0 = performance.now(), raf = 0, done = false, resolve;
    v.arrow.style.visibility = 'hidden';
    v.textEl.textContent = '';
    const p = new Promise(r => { resolve = r; });
    const tick = now => {
      const n = Math.min(text.length, Math.floor((now - t0) / 1000 * cps));
      if (n !== shown) { shown = n; v.textEl.textContent = text.slice(0, n); }
      if (n >= text.length) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      v.textEl.textContent = text;
      v.arrow.style.visibility = 'visible';
      resolve();
    };
    raf = requestAnimationFrame(tick);
    return { done: p, skip: finish, get finished() { return done; } };
  }

  let dialogKey = null;
  window.addEventListener('keydown', ev => {
    if (!dialogKey || ev.repeat) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (dialogKey(ev.code)) { ev.preventDefault(); if (P1.input) { P1.input.take('a'); ['1', '2', '3', '4', '5', '6'].forEach(k => P1.input.take(k)); } }
  });

  async function say(textOrLines, opt) {
    opt = opt || {};
    while (dialog.active) await dialog.active;
    let release;
    dialog.active = new Promise(r => { release = r; });
    const v = dialogView();
    v.nameEl.textContent = opt.name || '';
    showDialog(true);
    const pages = [].concat(textOrLines).flatMap(paginate);
    try {
      for (const page of pages) {
        const tp = typePage(page);
        await new Promise(res => {
          const adv = () => { if (!tp.finished) tp.skip(); else res(); };
          dialogKey = code => (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') ? (adv(), true) : false;
          v.root.onclick = adv;
        });
      }
    } finally {
      dialogKey = null;
      v.root.onclick = null;
      showDialog(false);
      dialog.active = false;
      release();
    }
  }

  async function choose(text, options) {
    while (dialog.active) await dialog.active;
    let release;
    dialog.active = new Promise(r => { release = r; });
    const v = dialogView();
    v.nameEl.textContent = '';
    showDialog(true);
    v.choices.innerHTML = '';
    v.choices.classList.add('p1-visible');
    const tp = typePage(paginate(text).join('\n'));
    let pick;
    const chosen = new Promise(r => { pick = r; });
    const rows = options.slice(0, 6).map((o, i) => {
      const b = el('div', 'p1-dialog-choice', v.choices);
      b.dataset.p1 = 'dialog-choice-' + i;
      b.textContent = (i + 1) + '. ' + o;
      hoverEl(b, () => b.classList.add('p1-hover'), () => b.classList.remove('p1-hover'));
      onEl(b, () => pick(i));
      return b;
    });
    dialogKey = code => {
      const m = /^(?:Digit|Numpad)([1-6])$/.exec(code);
      if (m && +m[1] <= rows.length) { tp.skip(); pick(+m[1] - 1); return true; }
      if (code === 'Space' || code === 'Enter') { tp.skip(); return true; }
      return false;
    };
    v.root.onclick = () => tp.skip();
    try {
      return await chosen;
    } finally {
      dialogKey = null;
      v.root.onclick = null;
      v.choices.innerHTML = '';
      v.choices.classList.remove('p1-visible');
      showDialog(false);
      dialog.active = false;
      release();
    }
  }

  dialog.say = say;
  dialog.choose = choose;
  Object.defineProperty(dialog, 'open', { get: () => !!dialog.active });

  /* ---------------------------------------------------------------- Esc và API */

  function canOpenMenu() {
    if (!P1.scene || P1.scene.name !== 'world') return false;
    const w = P1.scene.current;
    return !!P1.state && (!w || !w.mode || w.mode === 'explore');
  }
  window.addEventListener('keydown', ev => {
    if (ev.code !== 'Escape' || ev.repeat) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const e = top();
    const mine = dialog.active || busy || e || canOpenMenu();
    if (!mine) return;
    if (P1.input) P1.input.take('menu');
    if (dialog.active || busy) return;
    if (e) { e.close(e.escValue); return; }
    ui.open('menu');
  });

  const ui = {
    hud,
    open(name, arg) {
      const f = SCREENS[name];
      if (!f) throw new Error('screen not found: ' + name);
      closeAll();
      return f(arg);
    },
    close() { const e = top(); if (e) e.close(e.escValue); },
    closeAll,
    isOpen() { return stack.length > 0 || !!dialog.active || busy > 0; },
    top() { const e = top(); return e ? e.name : null; },
    refresh: changed,
    shop(items) { closeAll(); return shop(items); },
    heal,
    learnMove,
    evolve,
    message,
    toast,
    textInput,
    pressAndHold,
    onEl,
    paintPlayer,
    itemByKey,
  };
  P1.ui = ui;
  P1.dialog = dialog;
})(window.P1 = window.P1 || {});
