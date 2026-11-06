// My Mini Mart Together - main menu. Pure DOM, no framework. See css/menu.css.
const T = {
  vi: {
    newStore: 'Cửa hàng mới', loadStore: 'Tải cửa hàng', joinStore: 'Vào cửa hàng', options: 'Tùy chọn', exit: 'Thoát',
    chooseName: 'Đặt tên cho cửa hàng', private: 'Riêng tư', public: 'Công khai',
    hintPrivate: 'Chỉ vào được bằng mã phòng', hintPublic: 'Hiện trong danh sách Vào cửa hàng',
    difficulty: 'Độ khó', diffHint: 'Ô mua đắt thêm 50% mỗi bậc', back: 'Quay lại', create: 'Tạo',
    layout: 'Bố cục', pads: 'ô mua', region: 'Khu vực', mapTitle: 'Máy chủ gần bạn',
    savesTitle: 'Cửa hàng đã lưu', noSaves: 'Chưa có cửa hàng nào được lưu.', load: 'Tải', del: 'Xoá', delSure: 'Xoá thật?',
    progress: 'Tiến độ', ago: 'Chơi lần cuối', justNow: 'vừa xong', min: 'phút trước', hour: 'giờ trước', day: 'ngày trước',
    hostAs: 'Mở cho bạn bè', roomsTitle: 'Phòng công khai', loading: 'Đang tải...', noRooms: 'Chưa có phòng công khai nào.',
    loadFail: 'Không tải được danh sách phòng', refresh: 'Làm mới', host: 'Chủ', full: 'Đầy',
    roomCode: 'Mã phòng', join: 'Vào', codePh: 'ABC123', codeBad: 'Mã phòng gồm 6 ký tự',
    optTitle: 'Tùy chọn', playerName: 'Tên người chơi', music: 'Nhạc nền', sfx: 'Hiệu ứng', language: 'Ngôn ngữ', done: 'Xong',
    creating: 'Đang mở cửa hàng...', loadingStore: 'Đang tải cửa hàng...', joining: 'Đang vào cửa hàng...',
    failed: 'Có lỗi xảy ra', defName: (n) => 'Cửa hàng của ' + n,
    noticeT: 'Chơi cùng bạn bè!', notice: 'Mở cửa hàng, mời tối đa vài người bạn, cùng nhập hàng, xếp kệ và thu ngân. Chủ phòng giữ tiến độ.'
  },
  en: {
    newStore: 'New Store', loadStore: 'Load Store', joinStore: 'Join Store', options: 'Options', exit: 'Exit',
    chooseName: 'Choose a name for your store', private: 'Private', public: 'Public',
    hintPrivate: 'Join by code only', hintPublic: 'Listed in Join Store',
    difficulty: 'Difficulty', diffHint: 'Each level makes pads 50% pricier', back: 'Back', create: 'Create',
    layout: 'Layout', pads: 'pads', region: 'Region', mapTitle: 'Server near you',
    savesTitle: 'Saved stores', noSaves: 'No saved stores yet.', load: 'Load', del: 'Delete', delSure: 'Really?',
    progress: 'Progress', ago: 'Last played', justNow: 'just now', min: 'min ago', hour: 'h ago', day: 'd ago',
    hostAs: 'Open to friends', roomsTitle: 'Public rooms', loading: 'Loading...', noRooms: 'No public rooms right now.',
    loadFail: 'Could not load rooms', refresh: 'Refresh', host: 'Host', full: 'Full',
    roomCode: 'Room code', join: 'Join', codePh: 'ABC123', codeBad: 'Room code has 6 characters',
    optTitle: 'Options', playerName: 'Player name', music: 'Music', sfx: 'Sound FX', language: 'Language', done: 'Done',
    creating: 'Opening your store...', loadingStore: 'Loading store...', joining: 'Joining store...',
    failed: 'Something went wrong', defName: (n) => n + "'s Mart",
    noticeT: 'Play with friends!', notice: 'Open a store, invite your friends, restock shelves and run the checkout together. The host keeps the progress.'
  }
};

// Simplified world map, viewBox 0 0 200 100. One polygon per area.
const MAP = [
  ['na', '#1f8a6a', '10,16 30,8 58,9 68,20 62,30 52,40 46,50 38,47 28,37 14,29'],
  ['sa', '#b8321f', '44,53 58,52 69,60 63,75 54,93 48,88 46,69'],
  ['eu', '#2f58e0', '89,19 109,13 123,20 119,32 104,38 92,34 87,27'],
  ['africa', '#a8603f', '89,40 112,38 125,52 118,71 106,81 98,67 88,52'],
  ['asia', '#a8246e', '122,13 150,9 185,17 189,35 171,48 150,52 134,42 122,34'],
  ['india', '#7a1a40', '135,45 152,47 147,63 141,65'],
  ['oceania', '#5a3ad0', '160,66 188,64 191,82 171,87 158,78']
];
const SVGNS = 'http://www.w3.org/2000/svg';

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list') e[k] = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}

function ensureAssets() {
  const head = document.head;
  if (!head.querySelector('link[data-mm-css]'))
    head.append(h('link', { rel: 'stylesheet', href: new URL('../css/menu.css', import.meta.url).href, 'data-mm-css': '' }));
  if (!head.querySelector('link[href*="Londrina"]'))
    head.append(h('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Londrina+Solid:wght@400;900&display=swap' }));
}

export function mountMenu(root, ctl) {
  ensureAssets();
  root.classList.add('mm-root');
  let lang = ctl.lang === 'en' ? 'en' : 'vi';
  const t = (k, ...a) => { const v = T[lang][k]; return typeof v === 'function' ? v(...a) : v; };
  const opts = Object.assign({ name: 'Player', music: 0.6, sfx: 0.8 }, ctl.options);
  const martOf = (id) => ctl.marts.find((m) => m.id === id) || ctl.marts[0] || { id: '', name: '', icon: '', mats: 0 };
  const regionOf = (id) => ctl.regions.find((r) => r.id === id);
  const form = { name: null, isPrivate: true, difficulty: 0, mart: ctl.marts[0] && ctl.marts[0].id, region: ctl.region || (ctl.regions[0] && ctl.regions[0].id) };
  let screen = 'main', shown = true, busyOn = false, joinTimer = 0, joinToken = 0, toastTimer = 0;
  let loadPrivate = true, rooms = null, roomsState = 'loading';
  let nameDirty = false;

  const stage = h('div', { class: 'mm-stage' });
  const words = h('nav', { class: 'mm-words' });
  const langs = h('div', { class: 'mm-langs' });
  const notice = h('div', { class: 'mm-notice' });
  const logo = h('div', { class: 'mm-logo' }, h('b', null, 'MY MINI MART'), h('b', null, 'TOGETHER'));
  const busyEl = h('div', { class: 'mm-busy', hidden: true, role: 'alert' });
  const toast = h('div', { class: 'mm-toast', hidden: true, role: 'alert' });
  const menu = h('div', { class: 'mm-menu', 'data-screen': 'main' }, logo, words, stage, langs, notice);
  root.replaceChildren(menu, busyEl, toast);

  function go(s) {
    if (screen === 'options' && s !== 'options') saveOpts();
    screen = s;
    clearInterval(joinTimer); joinTimer = 0;
    render();
    if (s === 'join' && shown) { refreshRooms(); joinTimer = setInterval(refreshRooms, 10000); }
    const f = stage.querySelector('input'); if (f && s !== 'join' && matchMedia('(pointer:fine)').matches) f.focus();
  }

  function saveOpts() {
    opts.name = (opts.name || '').trim().slice(0, 16) || 'Player';
    try { ctl.saveOptions && ctl.saveOptions({ name: opts.name, music: opts.music, sfx: opts.sfx }); } catch (e) { /* ignore */ }
  }

  function fmtAgo(ms) {
    const d = Math.max(0, Date.now() - ms), m = Math.floor(d / 60000);
    if (m < 1) return t('justNow');
    if (m < 60) return m + ' ' + t('min');
    if (m < 1440) return Math.floor(m / 60) + ' ' + t('hour');
    return Math.floor(m / 1440) + ' ' + t('day');
  }

  const panel = (title, cls, ...kids) => h('div', { class: 'mm-panel ' + (cls || '') }, h('div', { class: 'mm-title' }, title), ...kids);
  const icon = (m) => h('img', { class: 'mm-ico', src: m.icon, alt: '', width: 40, height: 40, loading: 'lazy', decoding: 'async' });
  const back = () => h('button', { class: 'mm-btn', type: 'button', onclick: () => go('main') }, t('back'));
  const toggle = (label, onPrev, onNext) => {
    const b = h('b', null, label);
    return [h('div', { class: 'mm-toggle' }, h('button', { class: 'mm-arrow', type: 'button', 'aria-label': '<', onclick: onPrev }, '<'), b,
      h('button', { class: 'mm-arrow', type: 'button', 'aria-label': '>', onclick: onNext }, '>')), b];
  };

  // ---------- screens ----------
  function screenNew() {
    if (!nameDirty) form.name = t('defName', opts.name);
    const input = h('input', { class: 'mm-input', type: 'text', maxLength: 28, value: form.name, placeholder: t('chooseName'),
      oninput: (e) => { form.name = e.target.value; nameDirty = true; }, onkeydown: (e) => { if (e.key === 'Enter') create(); } });
    const hint1 = h('div', { class: 'mm-hint' }), hint2 = h('div', { class: 'mm-hint' }, t('diffHint'));
    const [privRow, privB] = toggle('', () => flipPriv(), () => flipPriv());
    const [diffRow, diffB] = toggle('', () => setDiff(-1), () => setDiff(1));
    const paintPriv = () => { privB.textContent = form.isPrivate ? t('private') : t('public'); hint1.textContent = form.isPrivate ? t('hintPrivate') : t('hintPublic'); };
    const paintDiff = () => { diffB.textContent = t('difficulty') + ': ' + form.difficulty; };
    const flipPriv = () => { form.isPrivate = !form.isPrivate; paintPriv(); };
    const setDiff = (d) => { form.difficulty = (form.difficulty + d + 6) % 6; paintDiff(); };
    paintPriv(); paintDiff();
    const create = () => {
      const name = (form.name || '').trim() || t('defName', opts.name);
      run(ctl.newStore({ name, isPrivate: form.isPrivate, difficulty: form.difficulty, mart: form.mart, region: form.region }), t('creating'));
    };
    const left = h('div', { class: 'mm-col mm-w-name' },
      panel(t('chooseName'), '', h('div', { class: 'mm-body' }, input, privRow, hint1, diffRow, hint2,
        h('div', { class: 'mm-btns' }, back(), h('button', { class: 'mm-btn go', type: 'button', onclick: create }, t('create'))))));

    // map
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 100'); svg.setAttribute('class', 'mm-map'); svg.setAttribute('role', 'group');
    const paths = {};
    for (const [area, col, pts] of MAP) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', 'M' + pts + 'Z'); p.setAttribute('fill', col); p.setAttribute('stroke-linejoin', 'round');
      p.addEventListener('click', () => pickArea(area));
      svg.append(p); paths[area] = p;
    }
    const mapName = h('div', { class: 'mm-mapname' });
    const paintMap = () => {
      const r = regionOf(form.region);
      for (const a in paths) paths[a].classList.toggle('on', !!r && r.area === a);
      if (r) svg.append(paths[r.area]); // selected on top so the outline shows
      mapName.textContent = r ? r.label : '-';
    };
    const pickArea = (area) => {
      const list = ctl.regions.filter((r) => r.area === area);
      if (!list.length) return;
      const i = list.findIndex((r) => r.id === form.region);
      form.region = list[(i + 1) % list.length].id; // first click: first region; click again: next in same area
      paintMap();
    };
    paintMap();

    // layout
    const prevImg = h('img', { alt: '', width: 120, height: 120, decoding: 'async' });
    const prevName = h('b'), prevPads = h('span');
    const items = ctl.marts.map((m) => h('button', { class: 'mm-mart', type: 'button', onclick: () => { form.mart = m.id; paintMart(); } }, m.name));
    const paintMart = () => {
      const m = martOf(form.mart);
      ctl.marts.forEach((x, i) => items[i].classList.toggle('on', x.id === m.id));
      prevImg.src = m.icon; prevName.textContent = m.name; prevPads.textContent = m.mats + ' ' + t('pads');
    };
    paintMart();
    const right = h('div', { class: 'mm-col mm-w-right' },
      h('div', { class: 'mm-panel' }, svg, mapName),
      panel(t('layout'), '', h('div', { class: 'mm-layout' },
        h('div', { class: 'mm-marts' }, h('div', { class: 'mm-martlist' }, items)),
        h('div', { class: 'mm-prev' }, prevImg, prevName, prevPads))));
    stage.append(left, right);
  }

  function screenLoad() {
    let saves = [];
    try { saves = ctl.listSaves() || []; } catch (e) { saves = []; }
    saves = saves.slice().sort((a, b) => b.savedAt - a.savedAt);
    const hint = h('div', { class: 'mm-hint' });
    const [row, b] = toggle('', flip, flip);
    function flip() { loadPrivate = !loadPrivate; paint(); }
    function paint() { b.textContent = loadPrivate ? t('private') : t('public'); hint.textContent = loadPrivate ? t('hintPrivate') : t('hintPublic'); }
    paint();
    const list = h('div', { class: 'mm-list' });
    if (!saves.length) list.append(h('div', { class: 'mm-note' }, t('noSaves')));
    for (const s of saves) {
      const m = martOf(s.mart);
      const delBtn = h('button', { class: 'mm-btn bad sm', type: 'button' }, t('del'));
      let armed = 0;
      delBtn.onclick = () => {
        if (!armed) { delBtn.textContent = t('delSure'); armed = setTimeout(() => { armed = 0; delBtn.textContent = t('del'); }, 3000); return; }
        clearTimeout(armed); try { ctl.deleteSave(s.id); } catch (e) { /* ignore */ }
        render();
      };
      list.append(h('div', { class: 'mm-row' }, icon(m),
        h('div', { class: 'mm-grow' }, h('b', null, s.name), h('span', null, m.name + ' - ' + t('difficulty') + ' ' + s.difficulty + ' - ' + t('ago') + ': ' + fmtAgo(s.savedAt))),
        h('div', { class: 'mm-meta' }, t('progress'), h('br'), s.done + '/' + s.total),
        h('button', { class: 'mm-btn go sm', type: 'button', onclick: () => run(ctl.loadStore(s.id, { isPrivate: loadPrivate, region: form.region }), t('loadingStore')) }, t('load')),
        delBtn));
    }
    stage.append(h('div', { class: 'mm-col mm-w-wide' },
      panel(t('savesTitle'), '', h('div', { class: 'mm-body' }, list, h('div', { class: 'mm-lbl' }, t('hostAs')), row, hint, h('div', { class: 'mm-btns' }, back())))));
  }

  function screenJoin() {
    const list = h('div', { class: 'mm-list', 'data-rooms': '' });
    const code = h('input', { class: 'mm-input mm-code', type: 'text', maxLength: 6, placeholder: t('codePh'), autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
      oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); },
      onkeydown: (e) => { if (e.key === 'Enter') doCode(); } });
    const doCode = () => {
      if (code.value.length !== 6) { showError(t('codeBad')); code.focus(); return; }
      run(ctl.joinStore({ code: code.value }), t('joining'));
    };
    stage.append(h('div', { class: 'mm-col mm-w-wide' },
      panel(t('roomsTitle'), '', h('div', { class: 'mm-body' }, list,
        h('div', { class: 'mm-btns' }, back(), h('button', { class: 'mm-btn', type: 'button', onclick: refreshRooms }, t('refresh'))),
        h('div', { class: 'mm-lbl' }, t('roomCode')),
        h('div', { class: 'mm-join' }, code, h('button', { class: 'mm-btn go', type: 'button', onclick: doCode }, t('join')))))));
    paintRooms();
  }

  function paintRooms() {
    const list = stage.querySelector('[data-rooms]'); if (!list) return;
    list.replaceChildren();
    if (roomsState === 'loading' && !rooms) { list.append(h('div', { class: 'mm-note' }, h('span', { class: 'mm-spin' }), ' ' + t('loading'))); return; }
    if (roomsState === 'error' && !rooms) { list.append(h('div', { class: 'mm-note err' }, t('loadFail'))); return; }
    if (!rooms || !rooms.length) { list.append(h('div', { class: 'mm-note' }, t('noRooms'))); return; }
    for (const r of rooms) {
      const m = martOf(r.mart), reg = regionOf(r.region), full = r.players >= r.max;
      list.append(h('button', { class: 'mm-row', type: 'button', disabled: full, onclick: () => run(ctl.joinStore({ lobbyId: r.id }), t('joining')) },
        icon(m),
        h('div', { class: 'mm-grow' }, h('b', null, r.name), h('span', null, m.name + ' - ' + t('host') + ': ' + r.host)),
        h('div', { class: 'mm-meta' }, (full ? t('full') + ' ' : '') + r.players + '/' + r.max, h('br'), reg ? reg.label : r.region)));
    }
  }

  function refreshRooms() {
    if (screen !== 'join' || !shown) return Promise.resolve();
    const tok = ++joinToken;
    if (!rooms) { roomsState = 'loading'; paintRooms(); }
    let p; try { p = Promise.resolve(ctl.listRooms()); } catch (e) { p = Promise.reject(e); }
    return p.then((r) => { if (tok !== joinToken) return; rooms = Array.isArray(r) ? r : []; roomsState = 'ok'; paintRooms(); },
      () => { if (tok !== joinToken) return; roomsState = 'error'; rooms = null; paintRooms(); });
  }

  function screenOptions() {
    const name = h('input', { class: 'mm-input', type: 'text', maxLength: 16, value: opts.name,
      oninput: (e) => { opts.name = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') go('main'); } });
    const slider = (key) => h('input', { class: 'mm-range', type: 'range', min: 0, max: 1, step: 0.05, value: opts[key], 'aria-label': t(key), oninput: (e) => { opts[key] = +e.target.value; } });
    const langBtns = h('div', { class: 'mm-btns' }, ['vi', 'en'].map((l) => h('button', { class: 'mm-btn' + (l === lang ? ' go' : ''), type: 'button', onclick: () => setLang(l) }, l.toUpperCase())));
    stage.append(h('div', { class: 'mm-col mm-w-opt' }, panel(t('optTitle'), '', h('div', { class: 'mm-body' },
      h('div', { class: 'mm-lbl' }, t('playerName')), name,
      h('div', { class: 'mm-lbl' }, t('music')), slider('music'),
      h('div', { class: 'mm-lbl' }, t('sfx')), slider('sfx'),
      h('div', { class: 'mm-lbl' }, t('language')), langBtns,
      h('div', { class: 'mm-btns' }, h('button', { class: 'mm-btn go', type: 'button', onclick: () => go('main') }, t('done')))))));
  }

  // ---------- chrome ----------
  function render() {
    menu.dataset.screen = screen;
    words.replaceChildren(
      ...[['new', 'newStore'], ['load', 'loadStore'], ['join', 'joinStore'], ['options', 'options']].map(([s, k]) =>
        h('button', { class: 'mm-word' + (screen === s ? ' on' : ''), type: 'button', onclick: () => go(s) }, t(k))),
      h('a', { class: 'mm-word', href: '../../index.html' }, t('exit')));
    langs.replaceChildren(...['vi', 'en'].map((l) => h('button', { class: 'mm-lang' + (l === lang ? ' on' : ''), type: 'button', onclick: () => setLang(l) }, l.toUpperCase())));
    notice.replaceChildren(h('b', null, t('noticeT')), t('notice'));
    stage.replaceChildren();
    if (screen === 'new') screenNew();
    else if (screen === 'load') screenLoad();
    else if (screen === 'join') screenJoin();
    else if (screen === 'options') screenOptions();
    stage.hidden = screen === 'main';
    document.documentElement.lang = lang;
  }

  function setLang(l) {
    if (l === lang) return;
    try { ctl.setLang(l); } catch (e) { /* ignore */ }
    lang = l; render();
    if (screen === 'join') paintRooms();
  }

  function run(p, text) {
    busy(text);
    return Promise.resolve(p).catch((e) => { busy(null); showError((e && e.message) || t('failed')); });
  }

  function busy(text) {
    busyOn = !!text;
    busyEl.hidden = !busyOn;
    busyEl.replaceChildren(...(busyOn ? [h('div', null, h('span', { class: 'mm-spin' }), h('span', null, text))] : []));
  }

  function showError(text) {
    toast.textContent = text; toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
  }

  function show() {
    shown = true; root.hidden = false; root.style.display = '';
    if (screen === 'join') { refreshRooms(); clearInterval(joinTimer); joinTimer = setInterval(refreshRooms, 10000); }
  }
  function hide() {
    shown = false; root.hidden = true; busy(null); toast.hidden = true;
    clearInterval(joinTimer); joinTimer = 0; joinToken++;
  }

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !busyOn && screen !== 'main') { e.preventDefault(); go('main'); }
  });
  // Esc even when focus is on body (no element inside root focused)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && shown && !busyOn && screen !== 'main' && !root.contains(e.target)) go('main');
  });

  // Cheap CSS fallback until the parent's 3D canvas exists behind the menu.
  const hasCanvas = () => document.querySelector('canvas:not(.mm-root canvas)');
  if (hasCanvas()) root.classList.add('mm-live');
  else {
    const mo = new MutationObserver(() => { if (hasCanvas()) { root.classList.add('mm-live'); mo.disconnect(); } });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  render();
  requestAnimationFrame(() => { try { performance.mark('mm-menu-visible'); } catch (e) { /* ignore */ } });
  return { show, hide, busy, error: showError, refreshRooms };
}
