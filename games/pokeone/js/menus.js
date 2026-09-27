/*
 * Menu trong game, hộp thoại và HUD, dựng từ panel NGUI gốc (data/ui.js) qua P1.ngui.
 * Panel nào dùng cho màn nào, và chỗ nào khác bản gốc: tools/README-shell.md.
 *
 *   P1.ui.hud(parent?)            HUD 'Panel - Game GUI' → { refresh(), destroy(), view }
 *   P1.ui.open(name, arg?)        'menu' | 'party' | 'bag' | 'dex' | 'trainer' | 'options' | 'save' | 'pokebox' → Promise
 *   P1.ui.close() / closeAll() / isOpen() / refresh()
 *   P1.ui.shop([{ id, price }])   → Promise;  P1.ui.heal() → Promise
 *   P1.ui.learnMove(mon, moveId)  → Promise<ô đã ghi | null>;  P1.ui.evolve(mon, dex) → Promise<bool>
 *   P1.ui.message({ title, text, yes, no }) → Promise<bool>;  P1.ui.toast(text)
 *   P1.dialog.say(textOrLines, { name? }) → Promise;  P1.dialog.choose(text, options) → Promise<index>
 *   P1.look                       lớp sprite người chơi (thân → áo → tóc → mũ) và màu tóc gốc
 */
(function (P1) {
  'use strict';

  /* ---------------------------------------------------------------- dữ liệu gốc nhỏ */

  // TextureManager.HairColour (MonoBehaviour trong level1), đọc bằng tools/ttg.py. Cách đọc: README-shell.md.
  const HAIR_COLOURS = ['ffffff', 'ffe485', 'fbd345', 'de9e43', 'ff9434', 'ff5f34', 'fc4040', 'b92e2e', 'd3ff99', '80e85c',
    '37b558', '23724c', '9ef8ea', '83e3ff', '56a0fc', '4560b8', '38487b', 'eab3ff', 'ba6cd7', '6f3983', 'ff92da', 'fc5ec6',
    'dd3982', 'a02467', 'cd8e69', '946344', '553f32', '3f3936'];
  // Sprite trạng thái rút gọn có trong GUIAtlas (HUD và thẻ Pokémon dùng bộ này, trận dùng Icon_Status_*).
  const STATUS_SPRITE = { psn: 'psn', tox: 'psn', brn: 'burn', frz: 'freeze', par: 'paralize', slp: 'sleep' };
  // Màu tên theo tổng IV. Wiki chỉ có tên màu (RESEARCH.md §3); mã màu là đoán.
  const IV_HEX = { grey: '9a9a9a', white: 'ffffff', green: '5cd65c', blue: '668cff', purple: 'c77dff', gold: 'ffd700' };
  const BAG_TABS = ['General', 'Pokeball', 'Medicine', 'TM', 'Berries', 'Hold'];
  const BOX_SIZE = 24, BOX_COUNT = 10;                     // BoxView 520x340 vừa 4 hàng × 6 ô (UIGrid max 6)
  const DEX_BUTTONS = 45;                                  // PokedexHandler.MaxPokeButtons

  /* ---------------------------------------------------------------- tiện ích */

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = n => Math.max(0, Math.floor(n || 0)).toLocaleString('en-US');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pad2 = i => String(i).padStart(2, '0');
  const toId = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  function uiRoot() { return document.getElementById('ui') || document.body; }
  function host(cls) {
    const el = document.createElement('div');
    el.className = cls;
    uiRoot().appendChild(el);
    return el;
  }
  let layerEl = null;
  function layer() {
    if (!layerEl || !layerEl.isConnected) layerEl = host('p1-layer');
    return layerEl;
  }
  function build(key, parent, opts) { return P1.ngui.build(key, parent || layer(), opts); }
  function node(v, path) { return v.ui.need(path); }
  // Bật/tắt nhiều nút rồi dựng lại một lần (ui.show dựng lại sau mỗi lần gọi).
  function activate(v, list) {
    for (const [p, on] of list) { const n = typeof p === 'string' ? v.find(p) : p; if (n) n.active = !!on; }
    v.refresh();
  }
  function setTex(v, path, url, uv) {
    const n = typeof path === 'string' ? node(v, path) : path;
    n.w.tex = url || '';
    if (uv) n.w.uv = uv;
    n.drawn = null;
    v.ui.draw(n);
    return n;
  }
  function setSize(n, w, h) { n.w.size = [w, h]; n.drawn = null; }
  // Nút trùng tên (6 'PokeButton'...) chung một đường dẫn nên ui.on gắn cho cả nhóm: bắt click thẳng trên phần tử.
  function onEl(n, fn) { n.el.addEventListener('click', ev => { if (n.state !== 'disabled' && !n.noClick) fn(n, ev); }); }
  function hoverEl(n, enter, leave) {
    n.el.addEventListener('pointerenter', enter);
    n.el.addEventListener('pointerleave', leave);
  }
  function rectOf(n) { return n.el ? n.el.getBoundingClientRect() : null; }
  function inside(r, x, y) { return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }
  const frameUV = (row, col) => [col * 0.25, 1 - (row + 1) * 0.25, 0.25, 0.25];

  // Chép một nút của panel khác thành "prefab" để ui.add chèn được (ô nhập của màn đăng nhập vào màn tạo nhân vật...).
  function borrow(panel, suffix, key) {
    if (P1.UI_PREFABS[key]) return key;
    let hit = null;
    const walk = (d, path) => {
      if (hit) return;
      if (path.endsWith('/' + suffix)) { hit = { d, path }; return; }
      (d.c || []).forEach(c => walk(c, path + '/' + c.n));
    };
    walk(P1.UI[panel] || P1.UI_PREFABS[panel], panel);
    if (!hit) throw new Error('borrow: node not found ' + panel + '/' + suffix);
    const json = JSON.stringify(hit.d).split('"' + hit.path + '/').join('"' + key + '/').split('"' + hit.path + '"').join('"' + key + '"');
    P1.UI_PREFABS[key] = JSON.parse(json);
    return key;
  }

  // Giữ chuột trên nút +/- (PressAndHold gốc): lặp sau 0,4 s, rồi mỗi 0,08 s.
  function pressAndHold(n, fn) {
    let t = 0;
    const stop = () => { clearTimeout(t); t = 0; };
    n.el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      fn();
      const loop = () => { fn(); t = setTimeout(loop, 80); };
      t = setTimeout(loop, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(k => n.el.addEventListener(k, stop));
  }

  // Ô nhập chữ: NGUI UIInput chỉ là hình, gõ thật bằng <input> đặt đúng chỗ nhãn của ô.
  function textInput(v, path, opt) {
    opt = opt || {};
    const n = node(v, path);
    const lab = node(v, opt.label || n.path + '/Label');
    const cfg = (n.d.x && n.d.x.UIInput) || {};
    const placeholder = opt.placeholder != null ? opt.placeholder : lab.w.text;
    const el = document.createElement('input');
    el.className = 'p1-input';
    el.type = 'text';
    el.spellcheck = false;
    el.autocomplete = 'off';
    el.maxLength = opt.limit || cfg.characterLimit || 40;
    el.value = opt.value || '';
    el.setAttribute('aria-label', placeholder.replace(/\.+$/, ''));
    const c = (cfg.activeTextColor || '#ffffffff');
    el.style.color = c.slice(0, 7);
    el.style.caretColor = (cfg.caretColor || '#6b6b6bcc').slice(0, 7);
    lab.container.appendChild(el);
    const show = () => v.label(lab.path, el.value ? '' : placeholder);
    let raf = 0, last = '';
    const sync = () => {
      const st = lab.el.style;
      const key = st.transform + '|' + st.width + '|' + st.height + '|' + st.display + '|' + st.fontSize;
      if (key !== last) {
        last = key;
        Object.assign(el.style, { transform: st.transform, width: st.width, height: st.height, fontSize: st.fontSize,
          fontFamily: st.fontFamily, display: st.display, zIndex: String((+st.zIndex || 0) + 1) });
      }
      raf = requestAnimationFrame(sync);
    };
    sync();
    show();
    el.addEventListener('input', () => { show(); if (opt.onInput) opt.onInput(el.value); });
    el.addEventListener('keydown', ev => { if (ev.key === 'Enter' && opt.onEnter) opt.onEnter(el.value); if (ev.key === 'Escape') el.blur(); });
    n.el.addEventListener('pointerdown', () => setTimeout(() => el.focus(), 0));
    return {
      el,
      get value() { return el.value; },
      set value(s) { el.value = s; show(); },
      destroy() { cancelAnimationFrame(raf); el.remove(); },
    };
  }

  /* ---------------------------------------------------------------- dữ liệu vật phẩm */

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

  // Túi đồ gốc có 6 thẻ nhưng items.txt để Pocket = 0 cho mọi món (máy chủ gửi). Chia lại theo tên, xem README-shell.md.
  function pocketOf(key, it) {
    const name = it.name || key;
    if (/Ball$/.test(name)) return 'Pokeball';
    if (/^(TM|HM)\d/.test(name)) return 'TM';
    if (/Berry$/.test(name)) return 'Berries';
    if ((P1.ITEM_EFFECT && P1.ITEM_EFFECT[key]) || /Potion|Heal|Revive|Restore|Ether|Elixir|Antidote|Awakening|Candy|Water|Soda Pop|Lemonade|Milk|Protein|Iron|Calcium|Zinc|Carbos|HP Up|PP Up/.test(name)) return 'Medicine';
    if (/[Ww]hen held|holder|[Ii]f held/.test(it.desc || '')) return 'Hold';
    return 'General';
  }

  function bagAdd(key, n) {
    const bag = P1.state.bag;
    bag[key] = Math.max(0, (bag[key] || 0) + n);
    if (!bag[key] && !(key in { potion: 1, pokeball: 1 })) delete bag[key];
  }

  // Dùng vật phẩm ngoài trận: cùng bảng P1.ITEM_EFFECT của trận (engine.js). Trả câu báo, hoặc null nếu vô ích.
  function useOn(mon, key) {
    const eff = P1.ITEM_EFFECT && P1.ITEM_EFFECT[key];
    if (!eff) return null;
    const max = P1.mon.stats(mon).hp, name = P1.mon.name(mon);
    const out = [];
    if (eff.revive && mon.hp <= 0) { mon.hp = Math.max(1, Math.floor(max * eff.revive)); out.push(name + ' was revived!'); }
    if (eff.heal && mon.hp > 0 && mon.hp < max) {
      const amt = eff.heal === 'full' ? max : eff.heal === 'quarter' ? Math.floor(max / 4) : eff.heal;
      const before = mon.hp;
      mon.hp = Math.min(max, mon.hp + amt);
      out.push(name + ' recovered ' + (mon.hp - before) + ' HP.');
    }
    if (eff.cure && mon.status && mon.hp > 0 && (eff.cure === 'all' || eff.cure.includes(mon.status))) {
      mon.status = '';
      out.push(name + ' was cured.');
    }
    return out.length ? out.join(' ') : null;
  }

  /* ---------------------------------------------------------------- người chơi */

  const byNum = (a, b) => (+a) - (+b);
  const look = {
    HAIR_COLOURS,
    parts(gender) {
      const g = gender === 'female' ? 'female' : 'male', P = P1.PLAYER_PARTS || {};
      return {
        body: (P['body_' + g] || ['00_00']).slice(),
        clothe: (P['clothe_' + g] || ['00']).slice().sort(byNum),
        hair: (P['hair_' + g] || ['00']).slice().sort(byNum),
        hat: (P.hats || []).slice().sort(byNum),
      };
    },
    // Bốn lớp theo thứ tự vẽ gốc: thân → áo → tóc (nhân màu HairColour) → mũ. url null = không vẽ lớp đó.
    layers(player) {
      const g = player && player.gender === 'female' ? 'female' : 'male';
      const L = (player && player.look) || {};
      const base = 'art/sprite/player/';
      const hc = HAIR_COLOURS[L.hairColor | 0] || HAIR_COLOURS[0];
      return [
        { part: 'body', url: base + 'body_' + g + '/' + (L.body || '00_00') + '_1.png' },
        { part: 'clothe', url: L.clothe != null && L.clothe !== '' ? base + 'clothe_' + g + '/' + L.clothe + '_1.png' : null },
        { part: 'hair', url: L.hair != null && L.hair !== '' ? base + 'hair_' + g + '/' + L.hair + '_1.png' : null, tint: '#' + hc + 'ff' },
        { part: 'hat', url: L.hat ? base + 'hats/' + L.hat + '_1.png' : null },
      ];
    },
    frameUV,
  };
  P1.look = look;

  // Vẽ nhân vật vào 4 UITexture (GUICharacter.BodyParts gốc: Body, Clothes, Hair, Hat).
  function paintPlayer(v, paths, player, row, col) {
    const L = look.layers(player), uv = frameUV(row == null ? 2 : row, col == null ? 1 : col);
    L.forEach((l, i) => {
      if (!paths[i]) return;
      const n = v.find(paths[i]);
      if (!n) return;
      n.w.tex = l.url || '';
      n.w.uv = uv;
      n.w.color = l.tint || '#ffffffff';
      n.drawn = null;
    });
  }

  // Cấp huấn luyện viên: bản gốc do máy chủ tính, không có công thức trong máy khách. Đoán: đường "medium", bắt đầu Lv 5.
  function trainerLevel(exp) {
    exp = Math.max(0, exp | 0);
    const level = Math.max(5, Math.floor(Math.cbrt(exp + 125) + 1e-9));
    const lo = Math.pow(level, 3) - 125, hi = Math.pow(level + 1, 3) - 125;
    return { level, cur: exp - lo, need: hi - lo };
  }
  P1.trainerLevel = trainerLevel;

  const monName = m => P1.mon.name(m);
  const ivName = m => '[' + IV_HEX[P1.mon.ivColor(m)] + ']' + monName(m) + '[-]';
  const smallImg = m => 'art/sprite/poke/' + (m.shiny ? 'small64shiny' : 'small64') + '/' + m.dex + '.png';
  const bigImg = dex => 'art/sprite/poke/big/' + dex + '.png';
  const genderSym = g => g === 'M' ? '[M]' : g === 'F' ? '[F]' : '';
  function expFrac(m) {
    if (m.level >= 100) return 1;
    const a = P1.mon.expAt(m.dex, m.level), b = P1.mon.expAt(m.dex, m.level + 1);
    return clamp((m.exp - a) / Math.max(1, b - a), 0, 1);
  }
  function statusSprite(n, m) {
    const s = m.hp <= 0 ? 'Icon_Status_Fainted' : STATUS_SPRITE[m.status];
    n.active = !!s;
    if (s) { n.w.sprite = s; n.drawn = null; }
  }

  /* ---------------------------------------------------------------- ngăn xếp cửa sổ */

  const stack = [];
  let busy = 0;
  function mount(name, key, opts) {
    const v = build(key, layer(), opts);
    let resolve;
    const e = { name, v, cleanup: [], done: new Promise(r => { resolve = r; }) };
    e.close = val => {
      if (e.closed) return;
      e.closed = true;
      e.cleanup.splice(0).forEach(f => f());
      v.destroy();
      const i = stack.indexOf(e);
      if (i >= 0) stack.splice(i, 1);
      resolve(val);
    };
    stack.push(e);
    return e;
  }
  const top = () => stack[stack.length - 1];
  const find = name => stack.find(e => e.name === name);
  function closeAll() { while (stack.length) top().close(); }
  function closeOn(e, paths, val) {
    paths.forEach(p => { const n = e.v.find(p); if (n) onEl(n, () => e.close(val)); });
  }
  function changed() {
    huds.forEach(h => h.refresh());
    stack.forEach(e => { if (e.refresh) e.refresh(); });
  }

  /* ---------------------------------------------------------------- thông báo, hộp thông báo */

  let toasts = 0;
  // Splash Message gốc (nhãn trên dải Bg_Window 3000 px, TweenAlpha), mờ dần sau ~2 s.
  function toast(text) {
    const v = build('prefab:Splash Message', layer(), { resize: true });
    const slot = toasts++;
    v.ui.top.pos = [0, 230 - slot * 50];
    v.label('prefab:Splash Message', text);
    v.root.style.transition = 'opacity .35s';
    v.root.style.opacity = '0';
    requestAnimationFrame(() => { v.root.style.opacity = '1'; });
    setTimeout(() => { v.root.style.opacity = '0'; }, 2000);
    setTimeout(() => { v.destroy(); toasts = Math.max(0, toasts - 1); }, 2400);
    return v;
  }

  // prefab:Panel - Message Box (MSGBoxHandler): Okay, hoặc Yes/No. Promise<bool>.
  function message(o) {
    o = o || {};
    const e = mount('message', 'prefab:Panel - Message Box');
    const v = e.v;
    v.label('Label - Window Title', o.title || '');
    v.label('Label - Message', o.text || '');
    const two = o.no !== null && o.no !== undefined;
    activate(v, [['Input - Message Box', false], ['Button - Hold', false], ['Button - Use', false],
      ['Button - Okay', !two], ['Button - Yes', two], ['Button - No', two]]);
    v.label('Button - Okay/Label', o.yes || 'Okay');
    v.label('Button - Yes/Label', o.yes || 'Okay');
    if (two) v.label('Button - No/Label', o.no || 'Cancel');
    onEl(node(v, 'Button - Okay'), () => e.close(true));
    onEl(node(v, 'Button - Yes'), () => e.close(true));
    onEl(node(v, 'Button - No'), () => e.close(false));
    e.escValue = false;
    return e.done;
  }

  /* ---------------------------------------------------------------- HUD (Panel - Game GUI) */

  const huds = [];
  const SLOT = i => 'Table/Button - Pokemon' + (i ? ' (' + i + ')' : '');
  const BALL = i => 'Player Information/Sprite - Pokeball' + (i ? ' (' + i + ')' : '');
  const HP_W = 76, TRAINER_EXP_W = 132;   // bề ngang đầy của thanh (khung nút 122, nhãn tên bắt đầu ở x=40; đo trên ảnh)

  function hud(parent) {
    const wrap = document.createElement('div');
    wrap.className = 'p1-hud';
    (parent || uiRoot()).appendChild(wrap);
    const v = build('Panel - Game GUI', wrap);
    // Nút của tính năng trực tuyến (cửa hàng trang phục, thành tựu, bạn bè, PvP, hòm, thú cưỡi, bản đồ bay) tắt đi;
    // bốn biểu tượng còn lại xếp sát phải như hàng gốc.
    ['Interface Buttons/Sprite - Battery', 'Interface Buttons/Button - Shop', 'Interface Buttons/Button - Achievements',
      'Interface Buttons/Button - Social', 'Button - Lootbox', 'Button - Map', 'Button - Mount', 'Button - PVP',
      'Button - Area', 'Button - Quests', 'Sprite - Crown', 'Label - Please Wait']
      .forEach(p => { const n = v.find(p); if (n) n.active = false; });
    [['Button - Trainer', -122], ['Button - Bag', -88], ['Button - Pokedex', -54], ['Button - Settings', -19]]
      .forEach(([p, x]) => { node(v, 'Interface Buttons/' + p).pos[0] = x; });
    const open = { 'Button - Trainer': 'trainer', 'Button - Bag': 'bag', 'Button - Pokedex': 'dex', 'Button - Settings': 'options' };
    Object.keys(open).forEach(p => onEl(node(v, 'Interface Buttons/' + p), () => ui.open(open[p])));

    const h = { view: v, el: wrap, alive: true };
    for (let i = 0; i < 6; i++) {
      const n = node(v, SLOT(i));
      onEl(n, () => {
        if (!P1.state.party[i]) return;
        const card = find('party');
        if (card) card.select(i); else ui.open('party', i);
      });
      dragSource(v, n, (x, y) => {
        const party = P1.state.party;
        for (let j = 0; j < 6; j++) {
          if (j !== i && party[j] && inside(rectOf(node(v, SLOT(j))), x, y)) {
            [party[i], party[j]] = [party[j], party[i]];
            const card = find('party');
            if (card && card.index === i) card.select(j); else if (card && card.index === j) card.select(i);
            changed();
            return true;
          }
        }
        const box = find('pokebox');
        if (box && box.dropFromParty(i, x, y)) return true;
        return false;
      });
    }
    const timeLabel = () => {
      const d = new Date();
      let hh = d.getHours() % 12; if (!hh) hh = 12;
      return hh + ':' + pad2(d.getMinutes()) + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
    };
    h.refresh = () => {
      const st = P1.state;
      if (!st || !h.alive) return;
      const T = trainerLevel(st.trainerExp);
      node(v, 'Player Information/Label - Username').w.text = st.player.name;
      node(v, 'Player Information/Label - Level').w.text = 'Lv ' + T.level;
      node(v, 'Label - Trainer Exp').w.text = T.cur + ' / ' + T.need;
      setSize(node(v, 'Sprite - Exp Bar Dark'), TRAINER_EXP_W, 10);
      setSize(node(v, 'Sprite - Exp Bar'), Math.max(2, Math.round(TRAINER_EXP_W * T.cur / T.need)), 10);
      paintPlayer(v, ['Player Information/Texture - Body', 'Texture - Body/Texture - Clothes', 'Texture - Body/Texture - Hair',
        'Texture - Body/Texture - Hat'], st.player);
      for (let i = 0; i < 6; i++) {
        const m = st.party[i], b = node(v, BALL(i));
        b.w.sprite = !m ? 'Icon_Pokemon_Empty' : m.hp > 0 ? 'Icon_Pokemon_Alive' : 'Icon_Pokemon_Dead';
        b.drawn = null;
        const s = node(v, SLOT(i));
        s.active = !!m;
        if (!m) continue;
        const p = s.path + '/Sprite - Pokemon/';
        node(v, p + 'Label - Name').w.text = (m.shiny ? '[Shiny]' : '') + monName(m);
        node(v, p + 'Label - Level').w.text = 'Lv' + m.level;
        const max = P1.mon.stats(m).hp, f = clamp(m.hp / max, 0, 1);
        const hp = node(v, p + 'Sprite - Health');
        setSize(hp, Math.max(2, Math.round(HP_W * f)), 12);
        hp.active = m.hp > 0;
        hp.w.color = f > 0.5 ? '#ffffffff' : f > 0.2 ? '#ffd23cff' : '#ff4a4aff';   // đoán: bản gốc đổi màu ở mã
        setSize(node(v, p + 'Sprite - EXP Dark'), HP_W, 12);
        setSize(node(v, p + 'Sprite - EXP'), Math.max(2, Math.round(HP_W * expFrac(m))), 12);
        statusSprite(node(v, p + 'Sprite - Status'), m);
        node(v, p + 'Sprite - item').active = !!m.item;
        const t = node(v, p + 'Texture - Poke');
        t.w.tex = smallImg(m); t.drawn = null;
      }
      node(v, 'Label - Time').w.text = timeLabel();
      const map = st.map || '';
      node(v, 'Label - Location').w.text = (P1.MAP_NAMES && P1.MAP_NAMES[map]) || map.split('_').map(cap).join(' ');
      v.refresh();
    };
    const clock = setInterval(() => { if (h.alive) { v.label('Label - Time', timeLabel()); } }, 15000);
    h.destroy = () => {
      h.alive = false;
      clearInterval(clock);
      v.destroy();
      wrap.remove();
      const i = huds.indexOf(h);
      if (i >= 0) huds.splice(i, 1);
    };
    huds.push(h);
    h.refresh();
    return h;
  }

  // Kéo thả (UIDragDropItem gốc: PokemonHUDButton, PokeboxPokemon). Kéo quá 8 px mới tính là kéo; nhả thì gọi drop(x, y).
  function dragSource(v, n, drop) {
    let s = null;
    const move = ev => {
      if (!s) return;
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      if (!s.on && Math.hypot(dx, dy) < 8) return;
      s.on = true;
      const k = v.ui.scr.k;
      n.shift = [dx / k, -dy / k];
      v.ui.refresh();
    };
    const up = ev => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const was = s;
      s = null;
      if (!was || !was.on) return;
      n.shift = [0, 0];
      n.noClick = true;
      setTimeout(() => { n.noClick = false; }, 0);
      if (n.ui) v.ui.refresh();
      drop(ev.clientX, ev.clientY);
    };
    n.el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      s = { x: ev.clientX, y: ev.clientY, on: false };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  // Màn cần HUD (đội, hộp PC) mà thế giới chưa gắn HUD: gắn tạm, đóng màn thì gỡ.
  function ensureHud(e) {
    if (huds.some(h => h.alive)) return;
    const h = hud(layer());
    e.cleanup.push(() => h.destroy());
  }

  /* ---------------------------------------------------------------- menu Esc (Panel - Menu) */

  function menu() {
    const e = mount('menu', 'Panel - Menu');
    const v = e.v;
    // "Change Password" và "Logout" của bản trực tuyến đổi thành Lưu và Về màn đầu; "Exit Game" bỏ (trang web không tự đóng).
    v.label('Button - (1)/Label', 'Save Game');
    v.label('Button - (3)/Label', 'Title Screen');
    v.remove('Button - (4)');
    setSize(node(v, 'Sprite - Window'), 200, 188);
    v.refresh();
    onEl(node(v, 'Button - '), () => e.close());
    onEl(node(v, 'Button - (1)'), () => save());
    onEl(node(v, 'Button - (2)'), () => { e.close(); ui.open('options'); });
    onEl(node(v, 'Button - (3)'), () => {
      message({ title: 'Title Screen', text: 'Return to the title screen? Progress since your last save will be lost.', yes: 'Okay', no: 'Cancel' })
        .then(ok => { if (ok) { closeAll(); P1.scene.go('title'); } });
    });
    return e.done;
  }

  function save() {
    const ok = !!P1.save();
    toast(ok ? 'Game saved.' : 'The game could not be saved.');
    return Promise.resolve(ok);
  }

  /* ---------------------------------------------------------------- thẻ Pokémon (prefab:Panel - Pokemon Card) */

  const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  function party(index) {
    const e = mount('party', 'prefab:Panel - Pokemon Card');
    ensureHud(e);
    const v = e.v;
    const INFO = 'Pokemon Information', IVS = 'Pokemon IVs', EVS = 'Pokemon EVs', MOVES = 'Pokemon Moves';
    // Nút trả phí/trực tuyến của thẻ (reset IV $10.000, cộng/trừ EV bằng Poké Gold, "Not Tradable") không làm.
    activate(v, [['Label - Not Tradable', false], ['Texture - Pokemon', false], ['Button - Reset IV', false],
      ['Button - Reset EV', false], ['Button - Confirm EV', false], ['Table - Add Take EVs', false], ['Label - Egg', false]]);
    v.ui.top.walk(n => { if (n.name === 'Sprite - Lock') n.active = false; });
    const tabs = ['Tab - Info', 'Tab - Move', 'Tab - IV', 'Tab - EV'];
    let tab = 0;
    e.index = clamp(index | 0, 0, Math.max(0, P1.state.party.length - 1));
    const statTable = node(v, INFO + '/Table - Stat Numbers');
    const setTab = t => {
      tab = t;
      tabs.forEach((p, i) => { const n = node(v, p); n.w.sprite = i === t ? 'Btn_TabHighlighted_Tall_Yellow_Normal' : 'Btn_Tab_Tall_Normal'; if (n.normal) n.normal.sprite = n.w.sprite; n.drawn = null; });
      // Tab IV gộp thêm bảng chỉ số (Table - Stat Numbers nằm sẵn trong Pokemon Information, bản xuất để tắt).
      activate(v, [[INFO, t === 0 || t === 2], [INFO + '/Table', t === 0], [statTable, t === 2],
        [MOVES, t === 1], [IVS, t === 2], [EVS, t === 3]]);
    };
    tabs.forEach((p, i) => onEl(node(v, p), () => setTab(i)));
    closeOn(e, ['Sprite Title Bar/Button - Close']);
    onEl(node(v, 'Sprite - Held Item'), () => {
      const m = P1.state.party[e.index];
      if (!m || !m.item) return;
      bagAdd(m.item, 1);
      toast('Took the ' + itemByKey(m.item).name + ' from ' + monName(m) + '.');
      m.item = '';
      changed();
    });
    const rowLabel = (tbl, i) => node(v, tbl + '/Label - Stat Text (' + i + ')/Sprite - Bar/Label');
    e.refresh = () => {
      const m = P1.state.party[e.index];
      if (!m) { e.close(); return; }
      const sp = P1.mon.species(m.dex), st = P1.mon.stats(m), inf = (P1.SPECIES || {})[m.dex] || {};
      const types = (inf.types || sp.types || []).map(t => t.toLowerCase());
      const ball = itemByKey(m.ball || 'pokeball');
      setTex(v, 'Texture - Pokeball', ball && ball.img);
      node(v, 'Label - Pokemon Name').w.text = ivName(m);
      node(v, 'Label - Pokemon Level').w.text = (genderSym(m.gender) ? genderSym(m.gender) + ' ' : '') + '[Lv] ' + m.level;
      const t1 = node(v, 'Sprite - Type'), t2 = node(v, 'Sprite - Type 2');
      t1.w.sprite = types[0] || 'normal'; t1.drawn = null;
      t2.active = !!types[1]; if (types[1]) { t2.w.sprite = types[1]; t2.drawn = null; }
      const next = m.level >= 100 ? m.exp : P1.mon.expAt(m.dex, m.level + 1);
      node(v, 'Label - Exp').w.text = 'EXP: ' + m.exp + '/' + next;
      statusSprite(node(v, 'Sprite - Info Overlay/Sprite - Status'), m);
      const held = m.item ? itemByKey(m.item) : null;
      node(v, 'Texture - Held Item').active = !!(held && held.img);
      if (held && held.img) setTex(v, 'Texture - Held Item', held.img);
      setTex(v, 'Texture - Pokemon 2D', bigImg(m.dex));
      // Info: HP / EXP / Happiness, OT, Ability, Nature, ngày bắt, cấp khi bắt
      const bars = [[m.hp + '/' + st.hp, m.hp / st.hp], ['', expFrac(m)], [String(m.happiness), m.happiness / 255]];
      bars.forEach(([txt, f], i) => {
        const b = INFO + '/Table/Label - Stat Title' + (i ? ' (' + i + ')' : '') + '/Sprite - Bar/';
        node(v, b + 'Label').w.text = txt;
        setSize(node(v, b + 'Sprite - Fill'), Math.max(2, Math.round(92 * clamp(f, 0, 1))), 16);
      });
      const created = m.caughtAt ? new Date(m.caughtAt) : new Date(P1.state.created || Date.now());
      const infoText = [m.ot || P1.state.player.name, m.ability, m.nature,
        created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 'Lv ' + (m.metLevel || m.level)];
      ['Label - Stat Text', 'Label - Stat Text (1)', 'Label - Stat Text (2)', 'Label - Stat Text (3)', 'Label - Stat Text (4)']
        .forEach((p, i) => { node(v, INFO + '/Table/' + p + '/Sprite - Bar/Label').w.text = infoText[i]; });
      STAT_KEYS.forEach((k, i) => {
        rowLabel(INFO + '/Table - Stat Numbers', i + 1).w.text = k === 'hp' ? m.hp + '/' + st.hp : String(st[k]);
        rowLabel(IVS + '/Table - Stat Numbers', i + 1).w.text = String(m.ivs[k]);
        rowLabel(EVS + '/Table - EVs', i + 1).w.text = String(m.evs[k]);
      });
      node(v, 'Label - Reset Description').w.text = 'Stats  [' + IV_HEX[P1.mon.ivColor(m)] + '](IV ' + P1.mon.ivTotal(m) + '/186)[-]';
      node(v, 'Label - Reset Description').pos[1] = -36;
      const evTotal = STAT_KEYS.reduce((a, k) => a + m.evs[k], 0);
      node(v, 'Label - Total EVs').w.text = 'Effort Values [F0F000](Total: ' + evTotal + '/510)';
      // Moves: prefab:Sprite - Move trong lưới 284x57
      const grid = node(v, MOVES + '/Grid');
      grid.kids.slice().forEach(k => v.remove(k.path));
      m.moves.forEach((s, i) => {
        const mv = P1.Dex.moves.get(s.id);
        const r = v.add(grid.path, 'prefab:Sprite - Move', 'mv' + i);
        node(v, r.path + '/Label - Move Name').w.text = mv.name;
        node(v, r.path + '/Label - PP').w.text = 'PP: ' + s.pp + '/' + s.ppMax;
        node(v, r.path + '/Label - Power').w.text = 'Power: ' + (mv.basePower || '-');
        node(v, r.path + '/Label - Accuracy').w.text = 'Acc: ' + (mv.accuracy === true ? '-' : mv.accuracy + '%');
        node(v, r.path + '/Sprite - Type').w.sprite = mv.type.toLowerCase();
        const dt = node(v, r.path + '/Sprite - Damage Type');
        dt.active = mv.category !== 'Status';
        dt.w.sprite = mv.category === 'Special' ? 'special' : 'physical';
      });
      v.ui.top.walk(n => { n.drawn = null; });
      setTab(tab);
    };
    e.select = i => { if (P1.state.party[i]) { e.index = i; e.refresh(); } };
    e.refresh();
    return e.done;
  }

  /* ---------------------------------------------------------------- chọn Pokémon (Panel - Select Pokemon) */

  function selectPokemon(title) {
    const e = mount('select', 'Panel - Select Pokemon');
    const v = e.v;
    activate(v, [['MovesWindow', false]]);
    const win = node(v, 'Window');
    const buttons = win.kids.filter(k => k.name === 'PokeButton');
    const bgs = win.kids.filter(k => k.name === 'Backgrounds');
    const party = P1.state.party;
    const baseTitle = title || 'Choose a Pokemon';
    v.label('Window/Title Bar/Title', baseTitle);
    buttons.forEach((b, i) => {
      const m = party[i];
      b.active = !!m; bgs[i].active = !!m;
      if (!m) return;
      b.w.tex = bigImg(m.dex); b.drawn = null;     // ảnh 128 như tex gốc (art/ui/tex/250.png), Pokémon đứng lên ô nền
      onEl(b, () => e.close(i));
      hoverEl(b, () => v.label('Window/Title Bar/Title', monName(m) + '  Lv' + m.level + '  ' + m.hp + '/' + P1.mon.stats(m).hp + ' HP'),
        () => v.label('Window/Title Bar/Title', baseTitle));
    });
    v.refresh();
    closeOn(e, ['Window/Title Bar/Button - Close'], null);
    e.escValue = null;
    return e.done;
  }

  /* ---------------------------------------------------------------- túi đồ (Panel - Inventory) */

  function bag() {
    const e = mount('bag', 'Panel - Inventory');
    const v = e.v;
    let tab = 0, query = '';
    const firstTab = BAG_TABS.findIndex(t => Object.keys(P1.state.bag).some(k => P1.state.bag[k] > 0 && pocketOf(k, itemByKey(k)) === t));
    if (firstTab > 0) tab = firstTab;
    node(v, 'Label - Gold').parent.active = false;           // Poké Gold: tiền nạp của bản trực tuyến
    closeOn(e, ['Sprite Title Bar/Button - Close']);
    const search = textInput(v, 'Sprite - Search/Input - Search', { onInput: s => { query = s.toLowerCase(); e.refresh(); } });
    e.cleanup.push(() => search.destroy());
    const tabPaths = BAG_TABS.map(t => 'Tab - ' + t);
    tabPaths.forEach((p, i) => onEl(node(v, p), () => { tab = i; e.refresh(); }));
    const grid = node(v, 'Panel - Inventory Items/Grid');
    const sv = node(v, 'Panel - Inventory Items');
    const svHome = { pos: sv.pos.slice(), off: sv.pn.off.slice() };
    e.refresh = () => {
      tabPaths.forEach((p, i) => { const n = node(v, p); n.w.sprite = i === tab ? 'Btn_TabHighlighted_Tall_Yellow_Normal' : 'Btn_Tab_Tall_Normal'; if (n.normal) n.normal.sprite = n.w.sprite; n.drawn = null; });
      node(v, 'Label - Money').w.text = money(P1.state.money);
      grid.kids.slice().forEach(k => v.remove(k.path));
      sv.pos = svHome.pos.slice(); sv.pn.off = svHome.off.slice();
      const rows = Object.keys(P1.state.bag).filter(k => P1.state.bag[k] > 0)
        .map(k => ({ k, it: itemByKey(k) }))
        .filter(r => pocketOf(r.k, r.it) === BAG_TABS[tab] && (!query || r.it.name.toLowerCase().includes(query)))
        .sort((a, b) => (a.it.id || 9999) - (b.it.id || 9999));
      rows.forEach((r, i) => {
        const n = v.add(grid.path, 'prefab:Inventory Item', 'it' + pad2(i));
        node(v, n.path + '/Label - Name').w.text = r.it.name;
        node(v, n.path + '/Label - QTY').w.text = 'x' + P1.state.bag[r.k];
        setTex(v, n.path + '/Sprite/Texture - Icon', r.it.img || 'art/ui/tex/Unknown.png');
        onEl(n, () => itemMenu(r.k).then(() => { if (!e.closed) e.refresh(); }));
      });
      v.refresh();
    };
    e.refresh();
    return e.done;
  }

  // Bấm vào một món: prefab:Panel - Message Box với nút Use / Hold gốc, thêm Toss (bản sao nút Hold).
  function itemMenu(key) {
    const it = itemByKey(key);
    const e = mount('item', 'prefab:Panel - Message Box');
    const v = e.v;
    const usable = !!(P1.ITEM_EFFECT && P1.ITEM_EFFECT[key]);
    v.label('Label - Window Title', it.name);
    v.label('Label - Message', it.desc || '');
    node(v, 'Label - Message').w.overflow = 'shrink';
    const toss = v.add('Sprite - Window', 'prefab:Panel - Message Box/Sprite - Window/Button - Hold', 'Button - Toss');
    toss.pos = [-15, -65];
    activate(v, [['Input - Message Box', false], ['Button - Okay', false], ['Button - Yes', false], ['Button - Use', usable],
      ['Button - Hold', true], ['Button - No', true], [toss, true]]);
    v.label('Button - Toss/Label', 'Toss');
    v.label('Button - No/Label', 'Cancel');
    onEl(node(v, 'Button - No'), () => e.close(false));
    onEl(node(v, 'Button - Use'), () => {
      selectPokemon('Use ' + it.name + ' on…').then(i => {
        if (i == null) return;
        const m = P1.state.party[i];
        const msg = useOn(m, key);
        if (!msg) { toast('It won\'t have any effect.'); return; }
        bagAdd(key, -1);
        toast(msg);
        changed();
        e.close(true);
      });
    });
    onEl(node(v, 'Button - Hold'), () => {
      selectPokemon('Give ' + it.name + ' to…').then(i => {
        if (i == null) return;
        const m = P1.state.party[i];
        if (m.item) bagAdd(m.item, 1);
        m.item = key;
        bagAdd(key, -1);
        toast(monName(m) + ' is now holding the ' + it.name + '.');
        changed();
        e.close(true);
      });
    });
    onEl(toss, () => {
      message({ title: 'Toss', text: 'Throw away one ' + it.name + '?', yes: 'Okay', no: 'Cancel' }).then(ok => {
        if (!ok) return;
        bagAdd(key, -1);
        toast('Threw away one ' + it.name + '.');
        changed();
        e.close(true);
      });
    });
    e.escValue = false;
    return e.done;
  }

  /* ---------------------------------------------------------------- cửa hàng (Panel - Shop) */

  function shop(items) {
    const e = mount('shop', 'Panel - Shop');
    const v = e.v;
    const list = (items || []).map(x => { const k = itemKey(x.id); return { k, it: itemByKey(k), price: x.price | 0 }; });
    node(v, 'Gold Label').parent.active = false;
    activate(v, [['Label - Total Cost PokeGold', false], ['Button - Buy Poke Coin', false], ['Scrollbar', false]]);
    node(v, 'Button - Buy').pos[0] = 0;
    node(v, 'Label - Total Cost').pos[0] = 0;
    // ShrinkContent co cả chữ lẫn ký hiệu [PD] cao hơn khung 22: để nhãn tự giãn thay vì co chữ còn 3 px.
    node(v, 'Label - Total Cost').w.overflow = 'resizeFreely';
    closeOn(e, ['Sprite Title Bar/Button - Close (1)']);
    const grid = node(v, 'Scroll View - Shop Items/Grid');
    let sel = 0, amount = 1;
    const rows = list.map((r, i) => {
      const n = v.add(grid.path, 'prefab:Shop Item#3985', 'si' + pad2(i));
      node(v, n.path + '/lvlName').w.text = r.it.name + '\n[PD]' + money(r.price);
      setTex(v, n.path + '/Sprite/Icon', r.it.img || 'art/ui/tex/Unknown.png');
      onEl(n, () => { sel = i; amount = 1; e.refresh(); });
      return n;
    });
    e.refresh = () => {
      const r = list[sel];
      node(v, 'Money Label').w.text = money(P1.state.money);
      rows.forEach((n, i) => { const bg = node(v, n.path + '/Background'); bg.w.color = i === sel ? '#9fdcffff' : '#ffffffff'; bg.drawn = null; });
      if (r) {
        node(v, 'Label - Item Name').w.text = r.it.name;
        setTex(v, 'Texture - Item Icon', r.it.img || 'art/ui/tex/Unknown.png');
        node(v, 'Label - Amount').w.text = String(amount);
        node(v, 'Label - Total Cost').w.text = '[PD]' + money(r.price * amount);
      }
      v.refresh();
    };
    const step = d => { amount = clamp(amount + d, 1, 99); e.refresh(); };
    pressAndHold(node(v, 'Choose Amount/Button - Add'), () => step(1));
    pressAndHold(node(v, 'Choose Amount/Button - Take'), () => step(-1));
    onEl(node(v, 'Button - Buy'), () => {
      const r = list[sel];
      if (!r) return;
      const cost = r.price * amount;
      if (P1.state.money < cost) { toast('You don\'t have enough money.'); return; }
      P1.state.money -= cost;
      bagAdd(r.k, amount);
      toast('You bought ' + amount + 'x ' + r.it.name + '.');
      amount = 1;
      changed();
    });
    e.refresh();
    return e.done;
  }

  /* ---------------------------------------------------------------- hồi máu ở Trung tâm Pokémon */

  // Bản gốc: máy chủ gửi script (màn đen Panel - Script Blackout + tiếng hồi máu). Không có mã mô tả thời lượng; 0,35 s mờ vào/ra là đoán.
  async function heal() {
    busy++;
    try {
      // Panel depth 9 nằm dưới 'Panel - Game GUI' (depth 11): HUD vẫn hiện trên màn đen, như bản gốc.
      const under = host('p1-scene');
      const v = build('Panel - Script Blackout', under);
      v.root.style.transition = 'opacity .35s';
      v.root.style.opacity = '0';
      await wait(20);
      v.root.style.opacity = '1';
      await wait(380);
      P1.state.party.forEach(m => P1.mon.heal(m));
      changed();
      const src = await P1.audio.sfx('heal_pokemon');
      const dur = src && src.buffer ? src.buffer.duration * 1000 : 1200;
      await wait(Math.max(600, dur));
      v.root.style.opacity = '0';
      await wait(380);
      v.destroy();
      under.remove();
    } finally { busy--; }
  }

  /* ---------------------------------------------------------------- học chiêu / tiến hoá */

  // Hai panel nằm trong 'Widget - Hidden During Battle Or Script' (LearnHandler, EvolutionHandler).
  function hiddenWidget(which) {
    const e = mount(which, 'Widget - Hidden During Battle Or Script');
    // Panel con lưu alpha 0 kèm TweenAlpha 0→1 (mở ra mới hiện dần); build chỉ chạy tween của nút gốc nên đặt tay.
    ['Panel - Learn Move', 'Panel - Learn Evolution'].forEach(p => { node(e.v, p).alpha = 1; });
    activate(e.v, [['Panel - Learn Move', which === 'learn'], ['Panel - Learn Evolution', which === 'evolve']]);
    return e;
  }
  const typeHex = t => {
    const order = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];
    const cols = ['a8a878', 'c03028', 'a890f0', 'a040a0', 'e0c068', 'b8a038', 'a8b820', '705898', 'b8b8d0', 'f08030', '6890f0', '78c850', 'ffed00', 'f85888', '98d8d8', '7038f8', '705848', 'ee99ac'];
    return cols[order.indexOf(t)] || 'ffffff';   // BattleHandler.TypeColours
  };
  const moveDesc = mv => (P1.MOVE_DESC && P1.MOVE_DESC[mv.id]) || mv.shortDesc || mv.desc || '';

  function learnMove(mon, moveId) {
    const mv = P1.Dex.moves.get(moveId);
    if (mon.moves.length < 4) {
      P1.mon.learn(mon, mv.id);
      toast(monName(mon) + ' learned ' + mv.name + '!');
      changed();
      return Promise.resolve(mon.moves.length - 1);
    }
    const e = hiddenWidget('learn');
    const v = e.v, P = 'Panel - Learn Move/Sprite - Window/';
    v.label(P + 'Label - Learning', '[FF9900]' + monName(mon) + '[-] is trying to learn [FF9900]' + mv.name + '[-], Should it forget another move to learn it?');
    const fillInfo = (m, root, title) => {
      node(v, root + 'Label - Title PP').w.text = title;
      node(v, root + 'Label - Accuracy').w.text = m.accuracy === true ? '-' : m.accuracy + '%';
      node(v, root + 'Label - Power').w.text = m.basePower ? String(m.basePower) : '-';
      node(v, root + 'Label - Description').w.text = moveDesc(m);
      node(v, root + 'Sprite - Type').w.sprite = m.type.toLowerCase();
      const dt = node(v, root + 'Sprite - Damage Type');
      dt.active = m.category !== 'Status';
      dt.w.sprite = m.category === 'Special' ? 'special' : 'physical';
    };
    fillInfo(mv, P + 'Sprite - Info Background/', '[' + typeHex(mv.type) + ']' + mv.name + '[-]\nPP ' + mv.pp);
    setTex(v, P + 'Sprite - Platform/Texture - Pokemon', bigImg(mon.dex));
    const tip = node(v, P + 'Widget - Mouse Over Description');
    tip.active = false;
    const btn = i => P + 'Button - Learn Move' + (i ? ' (' + i + ')' : '');
    mon.moves.forEach((s, i) => {
      const old = P1.Dex.moves.get(s.id);
      v.label(btn(i) + '/Label', 'Forget ' + old.name);
      onEl(node(v, btn(i)), () => {
        P1.mon.learn(mon, mv.id, i);
        toast(monName(mon) + ' forgot ' + old.name + ' and learned ' + mv.name + '!');
        changed();
        e.close(i);
      });
      // ShowMoveDescription: rê chuột vào chiêu cũ hiện khung mô tả
      hoverEl(node(v, btn(i)), () => {
        tip.active = true;
        node(v, tip.path + '/Label - Move Name').w.text = old.name;
        node(v, tip.path + '/Label - Stats').w.text = 'Base Power: ' + (old.basePower || '-') + '\nAccuracy: ' + (old.accuracy === true ? '-' : old.accuracy);
        node(v, tip.path + '/Label - Description').w.text = moveDesc(old);
        node(v, tip.path + '/Sprite - Type/Label - Type').w.text = old.type;
        const dt = node(v, tip.path + '/Sprite - Move Damage Type');
        dt.active = old.category !== 'Status'; dt.w.sprite = old.category === 'Special' ? 'special' : 'physical';
        v.refresh();
      }, () => { tip.active = false; v.refresh(); });
    });
    v.label(P + 'Button - Dont Learn/Label', 'Do not learn ' + mv.name);
    onEl(node(v, P + 'Button - Dont Learn'), () => { toast(monName(mon) + ' did not learn ' + mv.name + '.'); e.close(null); });
    e.escValue = null;
    v.refresh();
    return e.done;
  }

  // EvolveAnimation gốc đổi qua lại mảng Texture2D theo stage. Ở đây: hai ảnh loài cũ/mới nhấp nháy nhanh dần.
  function evolve(mon, intoDex) {
    const e = hiddenWidget('evolve');
    const v = e.v, P = 'Panel - Learn Evolution/Sprite - Window/';
    const from = mon.dex, fromName = monName(mon), toName = P1.mon.species(intoDex).name;
    v.label(P + 'Label - Evolving', '[FF9900]' + fromName + '[-] is trying to evolve into [FF9900]' + toName + '[-], Do you want your Pokemon to evolve?');
    const tex = node(v, P + 'Sprite - Platform/Texture - Pokemon');
    setTex(v, tex, bigImg(from));
    let t = 0, stage = 0, running = true, raf = 0, last = performance.now();
    const loop = now => {
      if (!running) return;
      t += (now - last) / 1000; last = now;
      const period = Math.max(0.12, 0.9 - t * 0.12);
      const s = Math.floor(t / period) % 2;
      if (s !== stage) { stage = s; setTex(v, tex, bigImg(s ? intoDex : from)); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    e.cleanup.push(() => { running = false; cancelAnimationFrame(raf); });
    const finish = yes => {
      running = false;
      if (yes) {
        P1.mon.evolve(mon, intoDex);
        setTex(v, tex, bigImg(intoDex));
        P1.audio.cry(intoDex);
        if (P1.caught) P1.caught(intoDex);
        toast('Congratulations! Your ' + fromName + ' evolved into ' + toName + '!');
        changed();
        setTimeout(() => e.close(true), 900);
      } else {
        setTex(v, tex, bigImg(from));
        e.close(false);
      }
    };
    onEl(node(v, P + 'Sprite - Info Background/Button - Yes'), () => finish(true));
    onEl(node(v, P + 'Sprite - Info Background/Button - No'), () => finish(false));
    e.escValue = false;
    return e.done;
  }

  /* ---------------------------------------------------------------- Pokédex (Panel - Pokedex) */

  const liftCache = {};
  function lifted(url) {
    if (!liftCache[url]) {
      liftCache[url] = new Promise(res => {
        const img = new Image();
        img.onload = () => {
          const S = 256, cv = document.createElement('canvas');
          cv.width = cv.height = S;
          const ctx = cv.getContext('2d'), w = img.naturalWidth * 1.5, h = img.naturalHeight * 1.5;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, (S - w) / 2, S - h - 70, w, h);
          res(cv.toDataURL());
        };
        img.onerror = () => res(url);
        img.src = P1.ngui.base + url;
      });
    }
    return liftCache[url];
  }

  function dex() {
    const e = mount('dex', 'Panel - Pokedex');
    const v = e.v;
    const all = Object.keys(P1.SPECIES || {}).map(Number).sort((a, b) => a - b);
    const D = P1.state.dex;
    let query = '', row = 0, sel = 0, tab = 0;
    closeOn(e, ['Sprite Title Bar/Button - Close']);
    activate(v, [['Tab - Locations', false], ['Scrollbar', false]]);
    const search = textInput(v, 'Sprite - Left Panel/Input - Search', { onInput: s => { query = s.toLowerCase(); row = 0; e.refresh(); } });
    e.cleanup.push(() => search.destroy());
    const hide = node(v, 'Checkbox - Hide Unseen');
    onEl(hide, () => { row = 0; e.refresh(); });
    const gridPath = node(v, 'Sprite - Left Panel/Pokemons').path;
    const btns = [];
    for (let i = 0; i < DEX_BUTTONS; i++) {
      const b = v.add(gridPath, 'prefab:DexPokemon', 'dp' + pad2(i));
      btns.push(b);
      onEl(b, () => { if (b.dexNum && D.seen[b.dexNum]) { sel = b.dexNum; e.refresh(); } });
    }
    node(v, 'Sprite - Left Panel').el.addEventListener('wheel', ev => {
      ev.preventDefault();
      row = Math.max(0, row + (ev.deltaY > 0 ? 1 : -1));
      e.refresh();
    }, { passive: false });
    const setDexTab = t => {
      tab = t;
      ['Tab - Description', 'Tab - Moves'].forEach((p, i) => { const n = node(v, p); n.w.sprite = i === t ? 'Btn_TabHighlighted_Normal' : 'Btn_Tab_Normal'; if (n.normal) n.normal.sprite = n.w.sprite; n.drawn = null; });
      activate(v, [['Content - Description', t === 0], ['Content - Moves', t === 1]]);
    };
    onEl(node(v, 'Tab - Description'), () => setDexTab(0));
    onEl(node(v, 'Tab - Moves'), () => setDexTab(1));
    const movesGrid = node(v, 'Grid - Pokedex Moves');
    const chart = node(v, 'Chart Texture');
    e.refresh = () => {
      const list = all.filter(d => (!hide.toggled || D.seen[d]) &&
        (!query || String(d).includes(query) || (D.seen[d] && P1.SPECIES[d].name.toLowerCase().includes(query))));
      const maxRow = Math.max(0, Math.ceil(list.length / 5) - DEX_BUTTONS / 5);
      row = Math.min(row, maxRow);
      btns.forEach((b, i) => {
        const d = list[row * 5 + i];
        b.active = !!d;
        b.dexNum = d || 0;
        if (!d) return;
        node(v, b.path + '/Label').w.text = String(d).padStart(3, '0');
        const t = node(v, b.path + '/Texture');
        t.active = !!D.seen[d];
        t.w.tex = 'art/sprite/poke/small64/' + d + '.png'; t.drawn = null;
        node(v, b.path + '/Caught').active = !!D.caught[d];
        node(v, b.path + '/Highlight').active = d === sel;
        if (d === sel) { node(v, b.path + '/Highlight').w.color = '#ffffffff'; }
      });
      node(v, 'Label - Scene').w.text = money(Object.keys(D.seen).length);
      node(v, 'Label - Caught').w.text = money(Object.keys(D.caught).length);
      const info = sel && D.seen[sel];
      activate(v, [['Information', !!info], ['QuestionMark', !info]]);
      if (info) { showSpecies(sel); drawChart(sel); }
      v.refresh();
    };
    function showSpecies(d) {
      const S = P1.SPECIES[d], sp = P1.mon.species(d);
      node(v, 'Label - Pokemon Name').w.text = '#' + d + ' ' + S.name;
      node(v, 'Pokemon Species Type').w.text = S.category || '';
      node(v, 'Label - Weight / Height').w.text = 'Height: ' + S.height + 'm\nWeight: ' + S.weight + 'kg';
      node(v, 'Content - Description/Description').w.text = S.desc || '';
      const view = node(v, 'Pokemon View');
      // Ảnh 2D thay cho RenderTexture của model 3D. Ảnh big đặt Pokémon sát đáy khung, mà đáy khung bị dải tên che:
      // phóng 1,5 lần và nhấc lên trước khi gán.
      view.w.uv = null;
      lifted(bigImg(d)).then(url => { if (sel === d && !e.closed) setTex(v, view, url); });
      const types = node(v, 'Pokemon View/Sprite').kids.filter(k => k.name === 'Types');
      types.forEach((t, i) => { const ty = S.types[i]; t.active = !!ty; if (ty) { t.w.sprite = ty.toLowerCase(); t.drawn = null; } });
      const male = S.male;
      const genders = node(v, 'Genders');
      genders.active = !(male === 0 && sp.gender === 'N') && sp.gender !== 'N';
      setSize(node(v, 'GenderMale'), Math.max(2, Math.round(90 * clamp((male == null ? 50 : male) / 100, 0, 1))), 6);
      const ev = S.evs || {};
      [['HP', 'hp', 'HP'], ['ATK', 'atk', 'ATK'], ['DEF', 'def', 'DEF'], ['SPATK', 'spa', 'Sp. ATK'], ['SPDEF', 'spd', 'Sp. DEF'], ['SPD', 'spe', 'SPD']]
        .forEach(([n, k, t]) => { node(v, 'Label - EV ' + n).w.text = (ev[k] || 0) + '\n' + t; });
      const b = sp.baseStats;
      [['Label - Sp ATK', 'Sp.ATK', b.spa], ['Label - ATK', 'ATK', b.atk], ['Label - HP', 'HP', b.hp], ['Label - SPD', 'SPD', b.spe],
        ['Label - SPDEF', 'Sp.DEF', b.spd], ['Label - DEF', 'DEF', b.def]].forEach(([p, t, val]) => { node(v, 'StatChart/' + p).w.text = t + '\n' + val; });
      // Move/Ability: chiêu học theo cấp (learnset Showdown 7L..), ba khả năng
      movesGrid.kids.slice().forEach(k => v.remove(k.path));
      const ls = ((P1.Dex.data.Learnsets[sp.id] || {}).learnset) || {};
      const lv = [];
      Object.keys(ls).forEach(id => ls[id].forEach(src => { const m = /^7L(\d+)$/.exec(src); if (m) lv.push([+m[1], P1.Dex.moves.get(id).name]); }));
      lv.sort((a, c) => a[0] - c[0] || a[1].localeCompare(c[1]));
      // prefab:Pokedex Move 1 (chữ giữa, mẫu "Title Text") là dòng tiêu đề nhóm; prefab:Pokedex Move là dòng chiêu.
      const head = v.add(movesGrid.path, 'prefab:Pokedex Move 1', 'pm000');
      node(v, head.path + '/Label - Move Name').w.text = 'Level Up';
      lv.forEach(([l, name], i) => {
        const r = v.add(movesGrid.path, 'prefab:Pokedex Move', 'pm' + String(i + 1).padStart(3, '0'));
        node(v, r.path + '/Label - Move Name').w.text = 'Level ' + l + ' - ' + name;
      });
      const ab = S.abilities || [];
      const abTitle = i => 'Label - Ability Title' + (i ? ' (' + i + ')' : '');
      [ab[0], ab[1], ab[2]].forEach((a, i) => {
        const n = node(v, abTitle(i));
        n.active = !!a;
        if (!a) return;
        const A = P1.Dex.abilities.get(a);
        n.w.text = (i === 2 ? 'Hidden Ability - ' : '') + ((A && A.exists && A.name) || a);
        n.w.overflow = 'resizeFreely';
        node(v, n.path + '/Sprite/Label - Ability Description').w.text = (A && (A.shortDesc || A.desc)) || '';
      });
    }
    // Chart Texture là RenderTexture (rt:Chart) trong bản gốc: vẽ lục giác trắng ra ảnh, màu nút (#00abffd2) nhân lên như UITexture.
    function drawChart(d) {
      const b = P1.mon.species(d).baseStats, cv = document.createElement('canvas'), S = 170;
      cv.width = cv.height = S;
      const ctx = cv.getContext('2d');
      const order = [b.hp, b.atk, b.def, b.spe, b.spd, b.spa];   // đỉnh theo nhãn: HP trên, ATK phải-trên, DEF phải-dưới, SPD dưới, SpDEF trái-dưới, SpATK trái-trên
      ctx.beginPath();
      order.forEach((st, i) => {
        const a = -Math.PI / 2 + i * Math.PI / 3, r = (S / 2) * 0.92 * clamp(st / 150, 0.08, 1);
        const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      setTex(v, chart, cv.toDataURL());
    }
    setDexTab(0);
    sel = all.find(d => D.seen[d]) || 0;
    e.refresh();
    return e.done;
  }

  /* ---------------------------------------------------------------- thẻ huấn luyện viên (Panel - Trainer Card) */

  const BADGES = {
    Kanto: ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth'],
    Johto: ['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising'],
    Unova: ['trio', 'basic', 'insect', 'bolt', 'quake', 'jet', 'freeze', 'legend'],
  };
  function trainer() {
    const e = mount('trainer', 'Panel - Trainer Card');
    const v = e.v;
    closeOn(e, ['Sprite Title Bar/Button - Close']);
    e.refresh = () => {
      const st = P1.state, T = trainerLevel(st.trainerExp), S = st.stats || {};
      activate(v, [['Toggle - Private', false], ['Texture - Loading', false], ['Label - Guild Name', false],
        [node(v, 'Texture - Guild Logo').parent, false]]);
      node(v, 'Content').w.color = '#ffffffff';
      node(v, 'Label - Username').w.text = st.player.name;
      paintPlayer(v, ['Sprite - Player Stand/Texture - Body', 'Sprite - Player Stand/Texture - Body/Texture - Clothes',
        'Sprite - Player Stand/Texture - Body/Texture - Hair', 'Sprite - Player Stand/Texture - Body/Texture - Hat'], st.player);
      const have = new Set((st.badges || []).map(String));
      Object.keys(BADGES).forEach(region => {
        const holder = node(v, 'Sprite - Badges ' + region);
        holder.kids.forEach((b, i) => {
          b.w.color = have.has(BADGES[region][i]) ? '#ffffffff' : '#00000073';   // chưa có huy hiệu: tô tối (đoán)
          b.drawn = null;
        });
      });
      const sec = Math.floor(st.playSeconds || 0);
      const vals = [Math.floor(sec / 3600) + 'h ' + pad2(Math.floor(sec / 60) % 60) + 'm', S.steps | 0, S.fainted | 0,
        Object.keys(st.dex.caught).length, S.levelUps | 0, S.encounters | 0, S.ballsThrown | 0,
        Object.keys(st.dex.seen).length, Object.keys(st.dex.caught).length, 0, '', 'Kanto', T.level, '-', '', 0, 0];
      node(v, 'Label - Values').w.text = vals.join('\n');
      v.refresh();
    };
    e.refresh();
    return e.done;
  }

  /* ---------------------------------------------------------------- hộp PC (Panel - Pokebox) */

  function pokebox() {
    const e = mount('pokebox', 'Panel - Pokebox');
    ensureHud(e);
    const v = e.v;
    let boxNo = 0, query = '', lvMin = 0, lvMax = 100;
    closeOn(e, ['Sprite Title Bar/Button - Close']);
    activate(v, [['Button - Upgrade Box', false], ['Pokebox Release', false], ['Checkbox - Egg', false]]);
    const inp = [
      textInput(v, 'Pokebox Window/Input - Search', { onInput: s => { query = s.toLowerCase(); e.refresh(); } }),
      textInput(v, 'Input - Level Range', { limit: 3, onInput: s => { lvMin = +s || 0; e.refresh(); } }),
      textInput(v, 'Input - Level Range Max', { limit: 3, onInput: s => { lvMax = +s || 100; e.refresh(); } }),
    ];
    e.cleanup.push(() => inp.forEach(i => i.destroy()));
    const shiny = node(v, 'Checkbox - Shiny');
    onEl(shiny, () => e.refresh());
    onEl(node(v, 'Pokebox Window/Button - Search'), () => e.refresh());
    const numbers = node(v, 'Pokebox Window/Grid').kids;
    numbers.forEach((b, i) => onEl(b, () => { boxNo = i; e.refresh(); }));
    onEl(node(v, 'Button Left'), () => { boxNo = (boxNo + BOX_COUNT - 1) % BOX_COUNT; e.refresh(); });
    onEl(node(v, 'Button Right'), () => { boxNo = (boxNo + 1) % BOX_COUNT; e.refresh(); });
    const grid = node(v, 'BoxView/Grid');
    const inBox = b => P1.state.box.filter(m => (m.boxNo | 0) === b);
    const withdraw = m => {
      const party = P1.state.party;
      if (party.length >= 6) { toast('Your party is full.'); return; }
      P1.state.box.splice(P1.state.box.indexOf(m), 1);
      delete m.boxNo;
      party.push(m);
      toast(monName(m) + ' was taken out of Box ' + (boxNo + 1) + '.');
      changed();
    };
    e.dropFromParty = (i, x, y) => {
      if (!inside(rectOf(node(v, 'BoxView')), x, y)) return false;
      const party = P1.state.party;
      if (party.length <= 1) { toast('You can\'t deposit your last Pokémon.'); return true; }
      if (inBox(boxNo).length >= BOX_SIZE) { toast('Box ' + (boxNo + 1) + ' is full.'); return true; }
      const m = party.splice(i, 1)[0];
      m.boxNo = boxNo;
      P1.state.box.push(m);
      toast(monName(m) + ' was stored in Box ' + (boxNo + 1) + '.');
      const card = find('party');
      if (card) card.close();
      changed();
      return true;
    };
    e.refresh = () => {
      numbers.forEach((b, i) => {
        const n = inBox(i).length;
        const lab = b.kids.find(k => k.name === 'Label');
        lab.w.text = String(i + 1);
        const prog = b.kids.find(k => k.name === 'Sprite - Box Progress');
        setSize(prog, Math.max(2, Math.round(26 * n / BOX_SIZE)), 4);
        b.w.color = i === boxNo ? '#00c901ff' : '#ffffffff';   // PokeboxHandler.SelectColour
        if (b.normal) b.normal.color = b.w.color;
        b.drawn = null;
      });
      node(v, 'Label - Box Space').w.text = 'Box ' + (boxNo + 1) + ':  ' + inBox(boxNo).length + '/' + BOX_SIZE;
      grid.kids.slice().forEach(k => v.remove(k.path));
      inBox(boxNo).filter(m => (!query || monName(m).toLowerCase().includes(query) || (P1.SPECIES[m.dex].types || []).join(' ').toLowerCase().includes(query) || (m.nature || '').toLowerCase().includes(query))
        && m.level >= lvMin && m.level <= lvMax && (!shiny.toggled || m.shiny))
        .forEach((m, i) => {
          const b = v.add(grid.path, 'prefab:Pokebox Button', 'pb' + pad2(i));
          node(v, b.path + '/Pokemon Name').w.text = monName(m);
          node(v, b.path + '/Sprite/Level Label').w.text = 'Lv ' + m.level;
          node(v, b.path + '/ItemIcon').active = !!m.item;
          setTex(v, b.path + '/Pokemon Image', smallImg(m));
          onEl(b, () => withdraw(m));
          dragSource(v, b, (x, y) => {
            const h = huds.find(q => q.alive);
            if (h && inside(rectOf(node(h.view, 'HUD Pokemon')), x, y)) withdraw(m);
          });
        });
      v.refresh();
    };
    e.refresh();
    return e.done;
  }

  /* ---------------------------------------------------------------- cài đặt (Panel - Options, 4 thẻ) */

  // Cài đặt lưu theo khoá gốc (sMusicVolume...). Vài khoá có tên cũ trong core.js mà trận/thế giới đọc: ghi cả hai.
  const ALIAS = {
    sMusicVolume: ['musicVolume', v => v],
    sSFXVolume: ['soundVolume', v => v],
    sBumpSound: ['bumpSound', (v, d) => d.options[v] === 'Enabled'],
    sBattleCamera: ['battleCamera', (v, d) => d.options[v] === 'Rotate'],
    sBattleFlash: ['battleFlash', (v, d) => d.options[v] === 'Enabled'],
  };
  function getSetting(d) {
    const s = P1.settings;
    if (d.key === 'sWindowMode') return document.fullscreenElement ? 1 : 0;
    if (s[d.key] != null) return s[d.key];
    const a = ALIAS[d.key];
    if (a && d.kind === 'slider' && typeof s[a[0]] === 'number') return s[a[0]];
    return d.def;
  }
  function setSetting(d, val) {
    if (d.key === 'sWindowMode') {
      const el = document.documentElement;
      if (val === 1 && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
      if (val === 0 && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      return;
    }
    P1.setSetting(d.key, val);
    const a = ALIAS[d.key];
    if (a) P1.setSetting(a[0], a[1](val, d));
  }
  P1.getSetting = key => { const d = (P1.SETTINGS_DEF || []).find(x => x.key === key); return d ? getSetting(d) : P1.settings[key]; };

  const lerpHex = (cols, t) => {
    const c = cols.map(h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)));
    const f = clamp(t, 0, 1) * (c.length - 1), i = Math.min(c.length - 2, Math.floor(f)), u = f - i;
    return '#' + c[i].map((v, k) => Math.round(v + (c[i + 1][k] - v) * u).toString(16).padStart(2, '0')).join('') + 'ff';
  };
  const keyName = k => k.replace(/^Key(\d)$/, '$1').replace(/(Up|Down|Left|Right)Arrow$/, '$1 Arrow');

  function options() {
    const key = P1.scene.name === 'title' ? 'title:Panel - Options' : 'Panel - Options';
    const e = mount('options', key);
    const v = e.v;
    closeOn(e, ['Sprite Title Bar/Button - Close', 'Button - Close']);
    onEl(node(v, 'Button - Apply'), () => { toast('Settings saved.'); e.close(); });
    const cats = ['Button - Catagory', 'Button - Catagory (1)', 'Button - Catagory (2)', 'Button - Catagory (3)'];
    const grid = node(v, 'Scroll View - Settings/Grid');
    const sv = node(v, 'Scroll View - Settings');
    const svHome = { pos: sv.pos.slice(), off: sv.pn.off.slice() };
    let cat = 0, popupNode = null;
    const closePopup = () => { if (popupNode) { const p = popupNode; popupNode = null; v.remove(p.path); } };
    const outside = ev => { if (popupNode && !ev.target.closest('[data-name^="popopt"]')) setTimeout(closePopup, 0); };
    window.addEventListener('pointerdown', outside, true);
    e.cleanup.push(() => window.removeEventListener('pointerdown', outside, true));

    // UIPopupList gốc tự dựng danh sách từ sprite atlas (backgroundSprite Bg_Window, highlightSprite Bg_Hotkey_Icon).
    function popup(dd, d, cur, pick) {
      closePopup();
      const W = 140, IH = 24, n = d.options.length, H = n * IH + 12;
      const pk = 'shell:popup';
      P1.UI_PREFABS[pk] = { n: 'Popup', p: [0, 0], s: [1, 1], a: true, pn: { depth: 650, clip: 'none', alpha: 1 },
        c: [{ n: 'Bg', p: [0, 0], s: [1, 1], a: true, w: { kind: 'sprite', size: [W, H], pivot: 'Top', depth: 1, type: 'sliced', atlas: 'GUIAtlas', sprite: 'Bg_Window' } }]
          .concat(d.options.map((o, i) => ({ n: 'popopt' + i, p: [0, -6 - IH * i - IH / 2], s: [1, 1], a: true, col: 1,
            w: { kind: 'label', size: [W - 16, IH], pivot: 'Center', depth: 4, font: 'Aldrich 16', text: o, fontSize: 20, align: 'left', overflow: 'shrink' },
            c: [{ n: 'hl' + i, p: [0, 0], s: [1, 1], a: i === cur, w: { kind: 'sprite', size: [W - 8, IH], pivot: 'Center', depth: 2, type: 'sliced', atlas: 'GUIAtlas', sprite: 'Bg_Hotkey_Icon', color: '#ffffffa2' } }] }))) };
      const p = v.add(v.ui.top.path, pk, 'Popup');
      p.pos = [dd.world[4], dd.world[5] - 15];
      popupNode = p;
      p.kids.filter(k => k.name.startsWith('popopt')).forEach((k, i) => {
        hoverEl(k, () => { p.kids.forEach(q => { if (q.kids[0]) q.kids[0].active = q === k; }); v.refresh(); }, () => {});
        onEl(k, () => { closePopup(); pick(i); });
      });
      v.refresh();
    }

    function addRow(d, i) {
      const kind = d.kind === 'slider' ? 'prefab:Button - Setting Slider' : d.kind === 'key' ? 'prefab:Button - Key Setting' : 'prefab:Button - Setting Dropdown';
      const r = v.add(grid.path, kind, 'r' + pad2(i));
      node(v, r.path + '/Label - Title').w.text = d.label;
      r.def = d;
      if (d.kind === 'slider') {
        const sl = node(v, r.path + '/Slider'), fg = node(v, sl.path + '/Foreground'), th = node(v, sl.path + '/Thumb');
        delete fg.w.anc; fg.w.pivot = 'Left'; fg.pos = [-75, 0];
        delete th.w.anc; th.w.size = [12, 24];
        const cols = (sl.d.mb && sl.d.mb.UISliderColors && sl.d.mb.UISliderColors.colors) || ['#ffffffff'];
        const show = val => {
          fg.w.size = [Math.max(2, Math.round(150 * val)), 16];
          fg.w.color = lerpHex(cols, val);
          th.pos = [-75 + 150 * val, 0];
          fg.drawn = th.drawn = null;
        };
        show(getSetting(d));
        const at = ev => { const rc = sl.el.getBoundingClientRect(); return clamp((ev.clientX - rc.left) / rc.width, 0, 1); };
        let dragging = false;
        const move = ev => { if (!dragging) return; const val = Math.round(at(ev) * 100) / 100; setSetting(d, val); show(val); v.refresh(); };
        const up = () => { dragging = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        sl.el.addEventListener('pointerdown', ev => {
          dragging = true; move(ev);
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        });
      } else if (d.kind === 'key') {
        const binds = (d.options || []).filter(k => !k.startsWith('pad:')).map(keyName);
        node(v, r.path + '/Button - Set Key/Label').w.text = binds.join(' / ') || '-';
        node(v, r.path + '/Button - Remove').active = false;
      } else {
        const dd = node(v, r.path + '/Drop Down - Setting'), lab = node(v, dd.path + '/Label');
        if (d.key === 'sResolution') {
          lab.w.text = innerWidth + ' x ' + innerHeight;       // cỡ khung trình duyệt; không đổi được từ trang
        } else {
          const show = () => { lab.w.text = String(d.options[getSetting(d)] != null ? d.options[getSetting(d)] : ''); lab.drawn = null; };
          show();
          onEl(dd, () => popup(dd, d, getSetting(d), idx => { setSetting(d, idx); show(); v.refresh(); }));
        }
      }
    }
    const setCat = c => {
      cat = c;
      closePopup();
      cats.forEach((p, i) => { const t = node(v, p + '/Tabname'); t.w.color = i === c ? '#ffe400ff' : '#ffffffff'; t.drawn = null; });
      grid.kids.slice().forEach(k => v.remove(k.path));
      sv.pos = svHome.pos.slice(); sv.pn.off = svHome.off.slice();
      const id = (P1.SETTINGS_CATS || [])[c].id;
      // Dòng offline:true bản gốc ẩn khi không có máy chủ; nút "Set Defaults" bỏ vì phím chỉ xem, không gán lại.
      (P1.SETTINGS_DEF || []).filter(d => d.cat === id && !d.offline && d.kind !== 'button').forEach(addRow);
      v.refresh();
    };
    cats.forEach((p, i) => onEl(node(v, p), () => setCat(i)));
    setCat(0);
    return e.done;
  }

  /* ---------------------------------------------------------------- hộp thoại (Panel - Scripts) */

  let dv = null;
  const dialog = { active: false };
  const TEXT = 'Normal Text/Label - Script Text', BG = 'Normal Text/Sprite - Background';
  function scripts() {
    if (!dv || !dv.root.isConnected) {
      dv = build('Panel - Scripts', layer());
      activate(dv, [['Sprite - NPC Arrow', false], ['Sprite - Select Container', false]]);
    }
    return dv;
  }
  function showScripts(on) { const v = scripts(); v.ui.top.active = on; v.refresh(); }

  // Ngắt dòng chữ thoại (nhãn ResizeFreely chỉ giãn ngang): tối đa ~52 ký tự mỗi dòng, 3 dòng mỗi trang.
  function paginate(text) {
    const out = [];
    String(text).split(/\n\n+/).forEach(par => {
      const words = par.replace(/\n/g, ' ').split(/\s+/).filter(Boolean), lines = [];
      let line = '';
      const plain = s => s.replace(/\[[^\]]*\]/g, '');
      words.forEach(w => {
        const next = line ? line + ' ' + w : w;
        if (plain(next).length > 52 && line) { lines.push(line); line = w; } else line = next;
      });
      if (line) lines.push(line);
      for (let i = 0; i < lines.length; i += 3) out.push(lines.slice(i, i + 3).join('\n'));
    });
    return out.length ? out : [''];
  }
  // Tách chữ thành ký tự hiển thị và thẻ BBCode, để gõ từng chữ mà không cắt đôi thẻ màu.
  function tokens(s) {
    const t = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === '[') { const j = s.indexOf(']', i); if (j > i) { t.push({ tag: s.slice(i, j + 1) }); i = j + 1; continue; } }
      t.push({ ch: s[i++] });
    }
    return t;
  }
  // TypewriterEffect gốc: 35 ký tự/giây, keepFullDimensions (khung giữ cỡ cả câu, chữ chưa tới vẽ trong suốt).
  function typePage(text) {
    const v = scripts();
    const tw = (P1.UI['Panel - Scripts'] && ((node(v, TEXT).d.mb || {}).TypewriterEffect)) || { charsPerSecond: 35 };
    const tk = tokens(text), total = tk.filter(x => x.ch).length;
    const arrow = node(v, BG + '/Sprite - Arrow');
    let shown = -1, t0 = performance.now(), raf = 0, done = false, resolve;
    const render = n => {
      let c = 0, a = '', b = '';
      tk.forEach(x => { if (x.tag) { (c < n ? (a += x.tag) : (b += x.tag)); return; } if (c < n) a += x.ch; else b += x.ch; c++; });
      node(v, TEXT).w.text = n >= total ? text : a + '[ffffff00]' + b.replace(/\[[0-9a-fA-F]{6}\]|\[-\]/g, '') + '[-]';
      node(v, TEXT).drawn = null;
    };
    arrow.active = false;
    render(0);
    v.refresh();
    const p = new Promise(r => { resolve = r; });
    const tick = now => {
      const n = Math.min(total, Math.floor((now - t0) / 1000 * tw.charsPerSecond));
      if (n !== shown) { shown = n; render(n); v.ui.draw(node(v, TEXT)); }
      if (n >= total) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      render(total);
      arrow.active = true;
      v.refresh();
      resolve();
    };
    raf = requestAnimationFrame(tick);
    return { done: p, skip: finish, get finished() { return done; } };
  }

  // Một nguồn nhập cho hộp thoại: Space/Enter, click khung chữ, phím số 1-4 khi đang chọn.
  let dialogKey = null;
  window.addEventListener('keydown', ev => {
    if (!dialogKey || ev.repeat) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (dialogKey(ev.code)) { ev.preventDefault(); if (P1.input) { P1.input.take('a'); ['1', '2', '3', '4'].forEach(k => P1.input.take(k)); } }
  });

  async function say(textOrLines, opt) {
    opt = opt || {};
    while (dialog.active) await dialog.active;
    let release;
    dialog.active = new Promise(r => { release = r; });
    const v = scripts();
    showScripts(true);
    const pages = [].concat(textOrLines).flatMap(paginate);
    if (opt.name) pages[0] = '[FF9900]' + opt.name + ':[-] ' + pages[0];
    try {
      for (const page of pages) {
        const tp = typePage(page);
        await new Promise(res => {
          const adv = () => { if (!tp.finished) tp.skip(); else res(); };
          dialogKey = code => (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') ? (adv(), true) : false;
          node(v, BG).el.onclick = adv;
        });
      }
    } finally {
      dialogKey = null;
      node(v, BG).el.onclick = null;
      showScripts(false);
      dialog.active = false;
      release();
    }
  }

  async function choose(text, options) {
    while (dialog.active) await dialog.active;
    let release;
    dialog.active = new Promise(r => { release = r; });
    const v = scripts();
    showScripts(true);
    const cont = node(v, 'Sprite - Select Container');
    const grid = node(v, 'Grid - Select Container');
    grid.kids.slice().forEach(k => v.remove(k.path));
    ['Select Pokemon', 'Select Item', 'Select Move', 'Input'].forEach(p => { node(v, 'Sprite - Select Container/' + p).active = false; });
    const tp = typePage(paginate(text).join('\n'));
    let pick;
    const chosen = new Promise(r => { pick = r; });
    const rows = options.slice(0, 4).map((o, i) => {
      const b = v.add(grid.path, 'prefab:Button - Script Button', 'opt' + i);
      node(v, b.path).w.text = (i + 1) + '. ' + o;
      const hl = node(v, b.path + '/Sprite - Highlight');
      hoverEl(b, () => { hl.w.color = '#99e2ffff'; hl.drawn = null; v.ui.draw(hl); }, () => { hl.w.color = '#99e2ff00'; hl.drawn = null; v.ui.draw(hl); });
      onEl(b, () => pick(i));
      return b;
    });
    const layoutSelect = () => {
      const bg = node(v, BG), bottom = bg.world[5] - bg.w.size[1] / 2;
      cont.active = true;
      cont.pos = [0, bottom - 8];
      setSize(cont, 416, rows.length * 32 + 14);
      v.refresh();
    };
    layoutSelect();
    dialogKey = code => {
      const m = /^(?:Digit|Numpad)([1-4])$/.exec(code);
      if (m && +m[1] <= rows.length) { tp.skip(); pick(+m[1] - 1); return true; }
      if (code === 'Space' || code === 'Enter') { tp.skip(); return true; }
      return false;
    };
    node(v, BG).el.onclick = () => tp.skip();
    try {
      const i = await chosen;
      return i;
    } finally {
      dialogKey = null;
      node(v, BG).el.onclick = null;
      grid.kids.slice().forEach(k => v.remove(k.path));
      cont.active = false;
      showScripts(false);
      dialog.active = false;
      release();
    }
  }

  dialog.say = say;
  dialog.choose = choose;
  Object.defineProperty(dialog, 'open', { get: () => !!dialog.active });

  /* ---------------------------------------------------------------- Esc và API */

  function canOpenMenu() {
    if (P1.scene.name !== 'world') return false;
    const w = P1.scene.current;
    return !!P1.state && (!w || !w.mode || w.mode === 'explore');
  }
  window.addEventListener('keydown', ev => {
    if (ev.code !== 'Escape' || ev.repeat) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const e = top();
    const mine = dialog.active || busy || e || canOpenMenu();
    if (!mine) return;                      // cảnh khác (trận) tự đọc phím 'menu'
    if (P1.input) P1.input.take('menu');
    if (dialog.active || busy) return;
    if (e) { e.close(e.escValue); return; }
    ui.open('menu');
  });

  const SCREENS = { menu, party, bag, dex, trainer, options, pokebox };
  const ui = {
    hud,
    open(name, arg) {
      if (name === 'save') return save();
      const f = SCREENS[name];
      if (!f) throw new Error('screen not found: ' + name);
      closeAll();
      return f(arg);
    },
    close() { const e = top(); if (e) e.close(e.escValue); },
    closeAll,
    isOpen() { return stack.length > 0 || !!dialog.active || busy > 0; },
    top() { const e = top(); return e ? e.name : null; },
    // Cây NGUI của một màn đang mở ('hud', 'dialog', hoặc tên màn): cho thế giới và bài kiểm tìm nút.
    view(name) {
      if (name === 'hud') { const h = huds.find(q => q.alive); return h ? h.view : null; }
      if (name === 'dialog') return dv;
      const e = find(name);
      return e ? e.v : null;
    },
    refresh: changed,
    shop(items) { closeAll(); return shop(items); },
    heal,
    learnMove,
    evolve,
    message,
    toast,
    textInput,
    borrow,
    pressAndHold,
    onEl,
    paintPlayer,
    itemByKey,
  };
  P1.ui = ui;
  P1.dialog = dialog;
})(window.P1 = window.P1 || {});
