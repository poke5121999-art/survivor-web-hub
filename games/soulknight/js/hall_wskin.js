// Skin vũ khí khởi đầu (Giá Skin Vũ Khí trong sảnh) + vẽ vũ khí khởi đầu bằng hình skin trong ván.
// Dữ liệu: data/sk-wskin.js (tools/wskin/build_wskin.py) = 354 skin của 40 nhân vật [CFG weapons.json: prefab weapon_init_<hero>xx[N],
// OriginalWeapon weapon_init_<hero>x; tên Việt [LOC weapon/<khoá>]]. Mỗi skin chỉ ghi phần hình khác vũ khí khởi đầu của web
// (ov: đổi sprite/màu theo nút, add: nút thêm, cv: đường sprite của clip); chỉ số, nòng, hoạt ảnh giữ nguyên (chỉ đổi hình).
// Cách có skin ở game gốc là Máy Quay Trứng Skin Vũ Khí / thẻ Beep / cửa hàng nhiệm vụ ngày [LOC activity_egg_machine_weapon_skin,
// bp/reward_info, daily_commission/shop/tab/weapon_skins], không có bảng giá riêng: dùng Price của prefab (50) tính bằng đá [CFG weapons.Price;
// đơn vị đá là ƯỚC LƯỢNG, xem tools/polish/GAPS.md]. Lời thoại: "Ngoại Hình Gốc / Đổi Skin / Đang Sử Dụng" [LOC ui/weapon_skin_original,
// ui/change_weapon_skin, ui/weapon_skin_in_use].
// Lưu lựa chọn: localStorage 'sk.wskin.v1' = { own: [id skin], sel: { hero: id skin } } (không đụng hồ sơ chính của lobby.js).
(function () {
  'use strict';
  const SK = window.SK, DS = SK && SK.DS, X = window.SK_WSKIN;
  if (!SK || !DS || !X || !X.skins) return;
  const PRICE = 50;   // [CFG weapons.Price của weapon_init_*xx*]

  const byId = {}, byHero = {};
  for (const s of X.skins) { byId[s.id] = s; (byHero[s.hero] = byHero[s.hero] || []).push(s); }

  // ---------------------------------------------------------------- trạng thái
  const KEY = 'sk.wskin.v1';
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  function load() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* hồ sơ trắng */ }
    o = isObj(o) ? o : {};
    const own = Array.isArray(o.own) ? o.own.filter(k => byId[k]) : [], sel = {};
    if (isObj(o.sel)) for (const h of Object.keys(o.sel)) if (byId[o.sel[h]] && byId[o.sel[h]].hero === h && own.indexOf(o.sel[h]) >= 0) sel[h] = o.sel[h];
    return { own: own.filter((k, i, a) => a.indexOf(k) === i), sel };
  }
  let S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* chế độ riêng tư: chơi tiếp, không lưu */ } }

  // ---------------------------------------------------------------- vẽ trong ván
  // w86 dẫn xuất từ vũ khí gốc (chung hoạt ảnh, máy trạng thái, đạn qua prototype), chỉ rig khác. Lưu theo (id skin, w86 gốc).
  const cache = new Map();
  function skinW86(e, sk) {
    let m = cache.get(e);
    if (!m) cache.set(e, m = {});
    if (m[sk.id]) return m[sk.id];
    const rig = e.rig.map(n => n);
    for (const [i, d] of sk.ov) if (rig[i]) rig[i] = Object.assign({}, rig[i], d);
    for (const a of sk.add || []) rig.push(Object.assign({}, a));
    const d = Object.assign(Object.create(e), { rig, wskin: sk.id });
    // cv: đường sprite của clip skin đè đường cùng nút của clip gốc cùng thứ tự (các nút w đổi hình theo hoạt ảnh: Đặc Nhiệm, Siêu Việt...)
    if (sk.cv && e.CL) {
      d.CL = e.CL.map((c, ci) => {
        const ov = sk.cv.filter(o => o[0] === ci);
        if (!ov.length || !c) return c;
        return Object.assign({}, c, { cv: c.cv.filter(v => !(v.k === 'spr' && ov.some(o => o[1] === v.n))).concat(ov.map(o => ({ n: o[1], k: 'spr', s: o[2] }))) });
      });
    }
    // _gp (gun_point có đường bật tắt) tính lười trên chính bản dẫn xuất, rig cùng chỉ số gun_point nên kết quả như bản gốc
    return (m[sk.id] = d);
  }
  const mainFrame = rig => { const n = rig.find(q => q.n === 'w' && q.f && q.f !== 'nothing') || rig.find(q => q.f && q.f !== 'nothing' && q.n !== 'gun_point'); return n ? n.f : null; };
  // Hình 'w' của skin trên rig gốc của prefab (SK_W86.weapons: dùng cả khi def không có w86, như Người Điều Khiển Gió vẽ bằng def.sprite).
  const baseRig = sk => { const e = window.SK_W86 && SK_W86.weapons[sk.base]; return e && e.rig; };
  const rigCache = {};
  const skinRig = sk => { const r = baseRig(sk); return r && (rigCache[sk.id] = rigCache[sk.id] || skinW86({ rig: r }, sk).rig); };
  // Skin nằm trên chính vũ khí (w.wskin = id) chứ không trong w.def: rooms.js refreshWeapons dựng lại w.def từ DS.weapons mỗi khi buff đổi.
  // actors.js đọc qua SK.wskinW86 (cây hình, trong pose) và SK.wskinSprite (vũ khí vẽ bằng một sprite, như Người Điều Khiển Gió).
  function dress(w, hero) {
    const sk = byId[S.sel[hero]];
    if (w && w.def && sk && w.def.prefab === sk.base) w.wskin = sk.id;
    return w;
  }
  SK.wskinW86 = w => { const sk = byId[w.wskin]; return sk && w.def.w86 ? skinW86(w.def.w86, sk) : null; };
  SK.wskinSprite = w => { const sk = byId[w.wskin], r = sk && skinRig(sk); return r ? mainFrame(r) : null; };
  SK.wskinDress = dress;

  // ---------------------------------------------------------------- API
  const api = SK.wskin = {
    count: X.skins.length,
    all: () => X.skins.slice(),
    heroes: () => Object.keys(byHero),
    skins: hero => (byHero[hero] || []).slice(),
    get: id => byId[id] || null,
    price: () => PRICE,
    owned: id => S.own.indexOf(id) >= 0,
    selected: hero => S.sel[hero] || null,
    buy(id) {
      const sk = byId[id], P = SK.profile;
      if (!sk) return { ok: false, err: 'không có skin này' };
      if (api.owned(id)) return { ok: false, err: 'đã sở hữu' };
      if (!P || !P.spend(PRICE)) return { ok: false, err: 'không đủ đá quý' };
      S.own.push(id); save();
      return { ok: true };
    },
    // id = null: trở về ngoại hình gốc
    select(hero, id) {
      if (id == null) { delete S.sel[hero]; save(); return true; }
      const sk = byId[id];
      if (!sk || sk.hero !== hero || !api.owned(id)) return false;
      S.sel[hero] = id; save(); return true;
    },
    reset() { S = { own: [], sel: {} }; save(); },
    dress, mainFrame
  };

  // ---------------------------------------------------------------- Giá Skin Vũ Khí trong sảnh
  const L = SK.lobby, P = SK.profile, UI = SK.HALL_UI, H = window.SK_HALL;
  if (!L || !P || !UI || !H || !SK.hall || !SK.hall.addZone) return;
  const { esc, fmt, gemImg } = L, { dlg, CLOSE } = UI;
  const heroName = id => (DS.heroes[id] && DS.heroes[id].name) || id;
  const heroList = () => api.heroes().filter(h => DS.heroes[h]);
  let curHero = null;

  function previewFrame(sk) { const r = skinRig(sk); return r && mainFrame(r); }
  function paintPreviews() {
    for (const cv of document.querySelectorAll('canvas[data-wsk]')) {
      const ctx = cv.getContext('2d'), sk = byId[cv.dataset.wsk], base = DS.weapons[DS.heroes[cv.dataset.hero].weapon];
      ctx.clearRect(0, 0, cv.width, cv.height);
      const name = sk ? previewFrame(sk) : base && base.sprite, f = name && SK.frame(name);
      if (!f) continue;
      const k = Math.min(1, (cv.width - 4) / f[3], (cv.height - 4) / f[4]);
      ctx.save(); ctx.translate(cv.width / 2, cv.height / 2); ctx.scale(k, k);
      SK.draw(ctx, name, 0, 0); ctx.restore();
    }
  }
  function shelf(note) {
    const hs = heroList();
    if (!curHero || hs.indexOf(curHero) < 0) curHero = hs.indexOf(P.selected) >= 0 ? P.selected : hs[0];
    const list = api.skins(curHero), cur = api.selected(curHero);
    let html = '<h3>Skin Vũ Khí</h3><p>Nhân vật: <select id="sk-ws-hero">' + hs.map(h => '<option value="' + h + '"' + (h === curHero ? ' selected' : '') + '>' + esc(heroName(h)) + '</option>').join('') +
      '</select> Bạn có <b id="sk-ws-gems">' + fmt(P.gems) + '</b> ' + gemImg + '</p>';
    html += '<ul class="sk-list" id="sk-ws-list"><li data-id=""><canvas width="48" height="32" data-hero="' + curHero + '"></canvas><span>Ngoại Hình Gốc</span>' +
      (cur ? '<button class="hs-btn" data-act="sel" data-id="">Đổi Skin</button>' : '<b>Đang Sử Dụng</b>') + '</li>' +
      list.map(sk => {
        const own = api.owned(sk.id);
        const act = sk.id === cur ? '<b>Đang Sử Dụng</b>' : own ? '<button class="hs-btn ok" data-act="sel" data-id="' + sk.id + '">Đổi Skin</button>' :
          '<button class="hs-btn" data-act="buy" data-id="' + sk.id + '"' + (P.gems < PRICE ? ' disabled' : '') + '>' + fmt(PRICE) + ' ' + gemImg + '</button>';
        return '<li data-id="' + sk.id + '"><canvas width="48" height="32" data-wsk="' + sk.id + '" data-hero="' + sk.hero + '"></canvas><span>' + esc(sk.vi) + '</span>' + act + '</li>';
      }).join('') + '</ul>';
    if (note) html += '<p id="sk-ws-note">' + esc(note) + '</p>';
    dlg(html, [CLOSE]);
    paintPreviews();
    const sel = document.getElementById('sk-ws-hero');
    if (sel) sel.onchange = () => { curHero = sel.value; shelf(); };
    for (const b of document.querySelectorAll('#sk-ws-list button[data-act]')) b.onclick = () => {
      const id = b.dataset.id;
      if (b.dataset.act === 'buy') { const r = api.buy(id); shelf(r.ok ? 'Đã mở ' + byId[id].vi + '.' : 'Chưa mở được: ' + r.err + '.'); }
      else { api.select(curHero, id || null); shelf(id ? 'Đã đổi sang ' + byId[id].vi + '.' : 'Đã về ngoại hình gốc.'); }
    };
  }

  // Giá đặt cạnh Rương, ở ô đi được gần nhất [ƯỚC LƯỢNG vị trí]; không có hình riêng ở game gốc nên vẽ giá gỗ cắm vài vũ khí skin.
  const chest = H.slots.find(s => s.slot === 'chest') || { x: -8.9, y: 6.3 };
  const spots = [[0, -2.2], [0, -3.2], [2.4, -2.2], [-2.4, -2.2], [2.4, -3.2], [-2.4, -3.2], [0, 2.2]].map(d => [chest.x + d[0], chest.y + d[1]]);
  const at = spots.find(([x, y]) => SK.hall.walkable(x, y) && SK.hall.walkable(x + 1, y) && SK.hall.walkable(x - 1, y)) || spots[0];
  function drawRack(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#5a3d28'; ctx.fillRect(x - 17, y - 22, 34, 4); ctx.fillRect(x - 17, y - 8, 34, 4);
    ctx.fillRect(x - 17, y - 24, 3, 26); ctx.fillRect(x + 14, y - 24, 3, 26);
    ctx.fillStyle = '#2a1c12'; ctx.fillRect(x - 14, y - 20, 28, 12);
    ctx.restore();
    const hs = heroList(), pick = [hs[0], hs[Math.floor(hs.length / 2)], hs[hs.length - 1]];
    pick.forEach((h, i) => {
      const sk = byHero[h] && byHero[h][0], nm = sk && previewFrame(sk), f = nm && SK.frame(nm);
      if (!f) return;
      const k = Math.min(1, 9 / f[3], 12 / f[4]);
      ctx.save(); ctx.translate(x - 9 + i * 9, y - 14); ctx.scale(k, k); SK.draw(ctx, nm, 0, 0); ctx.restore();
    });
  }
  SK.hall.addZone('wskin_rack', at[0], at[1], null, {
    name: 'Giá Skin Vũ Khí', loc: 'weapon_skin_name_2', box: [at[0] - 1.2, at[1] - 1, at[0] + 1.2, at[1] + 1],
    draw: (ctx, x, y) => drawRack(ctx, x, y), use: () => shelf()
  });
  api.shelf = shelf;
})();
