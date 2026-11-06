/*
 * Bản đồ (MapWindow, phím M; "Map [M]" trong khoang): tờ giấy toàn màn hình, lưới cột A..S (19) x hàng 1..15, đất theo texture gốc
 * (Map_TheMarrows... trong cây MapContents), nhãn vùng uốn cung, nhãn bến chỉ hiện sau khi cập bến, thuyền người chơi xoay theo hướng.
 * Cây RectTransform và sprite lấy từ data/encyclopedia.js (tools/book_ui.py), dựng bằng js/book_kit.js.
 *   DRMap.open()  DRMap.close()  DRMap.isOpen()  DRMap._debug()
 * Toạ độ: MapWindow.GetMapPositionFromWorldPosition(x, z) = (x, z) * proportion / 0.95, proportion = mapViewRectWidth / 2000 (MapWindow.Awake);
 *   y của bản đồ = z của Unity = -z của three.js (xem tools/README.md "Hướng bản đồ"). Thuyền: MapWindow.Show chọn
 *   boatSprites[round(eulerAngles.y / 22,5)] (17 phần tử, chỉ số 16 = 0).
 * Bản đồ gốc có bản "advancedMap" kéo/thu phóng và đặt cờ (MapStamp): web chưa làm, chỉ có bản cơ bản (thấy trọn thế giới, scale 1).
 * Chặn lái: giống DRBook (js/encyclopedia.js dùng chung DRBook.modal): DR.timeScale = 0, nuốt phím lái, Esc/X đóng.
 */
(function (root) {
  'use strict';
  const K = root.DRBookKit, B = root.DR_BOOK;
  if (!K || !B) return;
  const MP = B.map.p;
  const PX_PER_M = MP.mapViewRectWidth / 2000 / 0.95;               // MapWindow.Awake: proportionOfWorldRepresentedOnMap / 0.95 (GetMapPositionFromWorldPosition)
  const STR = k => (root.DR_STR && DR_STR[k]) || '';
  const ART_UI = root.DR_UI || {};
  const SKIP = new Set(['DemoLabels', 'NotificationHolder', 'MapStampContainer', 'MapCursor']);   // DemoLabels = SKUSpecificDisabler (chỉ bản demo)
  const P = 'Map/Background/MapMask/MapContents/';
  const HALF = [MP.mapViewRectWidth / 2, MP.mapViewRectHeight / 2];

  let host = null, ctx = null, S = null, scale = 1;

  // ------------------------------------------------------------------ dữ liệu động
  const D = () => root.DR;
  function mapPos(x, zThree) { return [x * PX_PER_M, -zThree * PX_PER_M]; }          // (x, z three.js) → (mx, my) đơn vị canvas, my hướng lên
  function visited(dockId) { const s = D().s; return !!(s && s.vars && s.vars['has-visited-dock-' + dockId]); }
  function zoneOf(x, z) { return root.DRWorld && DRWorld.zoneAt ? DRWorld.zoneAt(x, z) : null; }
  const ZONE_KEY = { 'The Marrows': 'THE_MARROWS', 'Gale Cliffs': 'GALE_CLIFFS', "Devil's Spine": 'DEVILS_SPINE', 'Twisted Strand': 'TWISTED_STRAND', 'Stellar Basin': 'STELLAR_BASIN' };
  // [ĐỀ XUẤT] ZoneLabel.OnEnable của bản dịch ngược để trống; nhãn vùng hiện tên khi đã cập một bến của vùng hoặc đang ở trong vùng, nếu không là obscuredLabelKey
  function zoneSeen(zone) {
    const s = D().s; if (!s) return false;
    s.vars = s.vars || {};
    const b = s.boat; if (b && zoneOf(b.x, b.z) === zone) s.vars['zone-seen-' + zone] = true;
    if (root.DRDocks) for (const d of DRDocks.list) if (visited(d.id) && zoneOf(d.pos[0], d.pos[2]) === zone) return true;
    return !!s.vars['zone-seen-' + zone];
  }

  // ------------------------------------------------------------------ chữ uốn cung (script CurvedText của plugin TMP, trường m_radius / m_arcDegrees)
  const SVGNS = 'http://www.w3.org/2000/svg';
  function curveText(box, n, str) {
    const c = n.curve, tx = n.tx;
    box.classList.remove('bk-t');
    for (const ch of Array.from(box.children)) if (ch.classList && ch.classList.contains('bk-tx')) ch.remove();
    const w = box._size[0], h = box._size[1], R = Math.abs(c.r), th = Math.abs(c.arc) * Math.PI / 360;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none';
    const base = h / 2 + tx.s * 0.34;                                                  // đường cơ sở dưới tâm khung ~ nửa chiều cao chữ hoa
    const cx = w / 2, cy = base - R;                                                   // tâm cung nằm phía trên: đáy cung là "nụ cười" (r < 0 của script)
    const x1 = cx - R * Math.sin(th), x2 = cx + R * Math.sin(th), y = cy + R * Math.cos(th);
    const path = document.createElementNS(SVGNS, 'path');
    const id = 'bk-arc-' + n.n.replace(/\W/g, '');
    path.setAttribute('id', id); path.setAttribute('fill', 'none');
    path.setAttribute('d', 'M' + x1.toFixed(2) + ',' + y.toFixed(2) + ' A' + R + ',' + R + ' 0 0 0 ' + x2.toFixed(2) + ',' + y.toFixed(2));
    svg.appendChild(path);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('font-size', tx.s); t.setAttribute('fill', K.rgba(tx.c)); t.setAttribute('font-weight', tx.f === 'Hahmlet' ? '600' : '700');
    t.style.fontFamily = tx.f === 'Hahmlet' ? '"Hahmlet","Signika",serif' : '"Front Page Neue","Signika",sans-serif';
    const tp = document.createElementNS(SVGNS, 'textPath');
    tp.setAttribute('href', '#' + id); tp.setAttribute('startOffset', '50%'); tp.setAttribute('text-anchor', 'middle');
    tp.textContent = str.toUpperCase();                                                // m_fontStyle 17 = Bold | UpperCase
    t.appendChild(tp); svg.appendChild(t); box.appendChild(svg);
    box._curve = { svg, tp };
  }

  // ------------------------------------------------------------------ dựng
  function build() {
    host.innerHTML = '';
    const tree = Object.assign({}, B.map.tree, { on: 1 });                             // Container tắt sẵn trong scene; Show() bật
    ctx = K.mount(tree, host, {
      skip: n => SKIP.has(n.n) || /^DLC/.test(n.n),
      on: (n, box, path) => {
        if (n.curve && n.tx) curveText(box, n, n.tx.t);
      }
    });
    K.setText(ctx.byPath['Title/Text'], STR('map.header') || 'Map');
    // la bàn trên giấy (video t=1580: la bàn tròn giữa mép trên khung lưới, hướng bắc lên)
    // [ĐỀ XUẤT] vị trí / cỡ đo từ khung hình: tâm (+22, 161) so với tâm trên của canvas, 100 đơn vị; sprite Compass + CompassRing của HUD
    const cmp = K.el('div', 'bk-n', ctx.byPath['Map']);
    cmp.style.cssText = 'left:calc(50% + var(--s)*(22px - 50px));top:calc(var(--s)*(161px - 15px - 50px));width:' + K.px(100) + ';height:' + K.px(100) + ';pointer-events:none';
    for (const nm of ['Compass', 'CompassRing']) {
      const i = K.el('i', 'bk-bg si', cmp);
      i.style.setProperty('--sp', K.art(ART_UI[nm] || ('art/ui/sprites/' + nm + '.webp')));
    }
    // nhắc phím "Back" (PopupWindow.backAction)
    const back = K.el('button', 'bk-back', host);
    K.el('span', '', back, STR('prompt.back') || 'Back'); K.el('b', '', back, 'Esc');
    back.onclick = () => close();
    host.addEventListener('contextmenu', e => e.preventDefault());
  }

  function refresh() {
    const s = D().s, b = s.boat;
    // thuyền người chơi (YouAreHereMarker): vị trí theo toạ độ thế giới, kẹp trong khung nhìn như LateUpdate
    const [mx, my] = mapPos(b.x, b.z);
    const cx = Math.max(-HALF[0], Math.min(HALF[0], mx)), cy = Math.max(-HALF[1], Math.min(HALF[1], my));
    const you = ctx.byPath[P + 'YouAreHereMarker'];
    if (you) {
      const sd = you._n.rt.sd;
      you.style.left = 'calc(50% + var(--s)*' + (cx - sd[0] / 2) + 'px)';
      you.style.top = 'calc(50% + var(--s)*' + (-cy - sd[1] / 2) + 'px)';
    }
    const heading = D().view && D().view.heading != null ? D().view.heading : 0;     // rad, 0 = bắc, theo chiều kim đồng hồ (main.js)
    const idx = Math.round((heading * 180 / Math.PI) / 22.5) % 16;
    const boat = ctx.byPath[P + 'YouAreHereMarker/Boat'];
    if (boat) K.setSprite(boat, MP.boats[idx]);
    S.boatIdx = idx;
    // nhãn bến: chỉ chữ của bến đã cập (DockLabel.OnEnable)
    S.docks = [];
    for (const [path, box] of Object.entries(ctx.byPath)) {
      const n = box._n;
      if (n.dock && n.tx && /DockLabels\//.test(path)) {
        const v = visited(n.dock);
        box.style.visibility = v ? 'visible' : 'hidden';
        K.setText(box, STR(n.dock) || n.tx.t);
        S.docks.push({ id: n.dock, shown: v, text: v ? (STR(n.dock) || n.tx.t) : null });
      }
      if (n.zone && n.tx && /AreaLabels\//.test(path)) {
        const zone = ZONE_KEY[n.n], seen = zone ? zoneSeen(zone) : true;
        const txt = seen ? n.tx.t : (STR(n.zone.obs) || '???');
        if (box._curve) box._curve.tp.textContent = txt.toUpperCase(); else K.setText(box, txt);
      }
    }
    // dấu trên bản đồ: MapMarkers (nhiệm vụ) và nồi cua
    const cont = ctx.byPath[P + 'MapMarkers'];
    if (cont) {
      cont.innerHTML = '';
      const add = (x, zUnity, sprite, size) => {
        const mxy = [x * PX_PER_M, zUnity * PX_PER_M];
        const e = K.el('div', 'bk-marker', cont);
        e.style.left = 'calc(50% + var(--s)*' + mxy[0] + 'px)'; e.style.top = 'calc(50% + var(--s)*' + (-mxy[1]) + 'px)';
        e.style.width = K.px(size); e.style.height = K.px(size);
        const i = K.el('i', '', e);
        i.style.background = 'url(' + (ART_UI[sprite] ? K.art(ART_UI[sprite]).slice(4, -1) : '') + ') center / contain no-repeat';
        return e;
      };
      const mm = root.DR_MAPMARKERS || {};
      S.markers = [];
      for (const id of s.mapMarkers || []) {
        const m = mm[id]; if (!m) continue;
        add(m.x, m.z, m.mapMarkerType === 'IRONHAVEN_WRECK' ? 'IronhavenWreckMapMarker' : 'CrossMapMarker', 48);   // [ĐỀ XUẤT] cỡ 48: prefab marker không có trong AssetRipper
        S.markers.push(id);
      }
      for (const p of root.DRDeploy && DRDeploy.mapMarkers ? DRDeploy.mapMarkers() : []) {
        add(p.x, -p.z, p.prefab === 'MaterialPotMapMarker' ? 'FlotsamPotMapMarker' : 'CrabPotMapMarker', 40);
        S.markers.push(p.prefab);
      }
    }
  }

  function fit() { if (S) scale = K.fit(ctx, host, root.innerWidth, root.innerHeight); }

  function canOpen() {
    const d = D();
    if (!d || !d.s || !(d.mode === 'sail' || d.mode === 'dock')) return false;
    return !(root.DRBook && DRBook.busy());
  }
  function open() {
    if (S) return true;
    if (!canOpen()) return false;
    if (!host) { host = K.el('div', 'bk-host', document.body); host.id = 'dr-map'; root.addEventListener('resize', fit); }
    S = {};
    build();
    host.classList.add('on'); host.classList.remove('show');
    DRBook.modalOn('map', close);
    refresh();
    fit();
    if (document.fonts && document.fonts.load) document.fonts.load('50px "Front Page Neue"').then(() => { if (S) fit(); }).catch(() => {});
    requestAnimationFrame(() => { if (S) host.classList.add('show'); });
    try { root.DRAudio && DRAudio.play('ui.map.open'); } catch (e) { /* tiếng là phần phụ */ }
    return true;
  }
  function close() {
    if (!S) return false;
    S = null;
    host.classList.remove('on', 'show');
    DRBook.modalOff('map');
    try { root.DRAudio && DRAudio.play('ui.map.close'); } catch (e) { /* */ }
    return true;
  }

  root.DRMap = { open, close, isOpen: () => !!S };
  root.DRMap._debug = () => {
    if (!S) return null;
    const q = p => ctx.byPath[p] ? K.rect(ctx.byPath[p]) : null;
    return { scale, boatIdx: S.boatIdx, docks: S.docks, markers: S.markers, you: q(P + 'YouAreHereMarker'), contents: q(P.slice(0, -1)), mask: q('Map/Background/MapMask'), title: q('Title'),
      background: q('Map/Background'), grid: q('Map/Background/MapMask/GridLines'),
      letters: Object.keys(ctx.byPath).filter(p => /^Map\/Background\/LettersMask\/Letters\/[A-Z]$/.test(p)).map(p => ({ t: ctx.byPath[p]._tx.i.textContent, x: K.rect(ctx.byPath[p]).x })),
      numbers: Object.keys(ctx.byPath).filter(p => /Numbers\/\d+$/.test(p)).map(p => ({ t: ctx.byPath[p]._tx.i.textContent, y: K.rect(ctx.byPath[p]).y })),
      areas: Object.keys(ctx.byPath).filter(p => /AreaLabels\/[^/]+$/.test(p)).map(p => ({ n: ctx.byPath[p]._n.n, t: ctx.byPath[p]._curve ? ctx.byPath[p]._curve.tp.textContent : ctx.byPath[p]._tx && ctx.byPath[p]._tx.i.textContent })) };
  };
})(window);
