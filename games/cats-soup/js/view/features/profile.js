// Feature "profile" (view part): the profile window (nickname, introduction, title, picture, frame) opened from the
// profile slot of the HUD cat counter and the "more" menu, and the photo mode behind bt_screenShot (HUD hidden, stickers,
// a frame, PNG download). Rules: js/sim/features/profile.js, D:/catsoup-ref/rules/profile.md. Contract: js/view/registry.js.
import { find } from '../ngui.js';
import * as B from '../../sim/big.js';

const UI1 = 'atlas_ui1_atlas';
const FOOD = 'atlas_food_atlas';
const SHOT = 'atlas_Screenshot_atlas';
const SLOT = 'mainUI/set_topLeft/set_cat/set_userProfileSlot';
const CAMERA = 'mainUI/set_bottomRight/rightBottomSide/bt_screenShot';

const el = (cls = '', text = '', tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; };

export default {
  id: 'profile',

  mount(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    this.sim = ctx.game.feat.profile;
    this.data = ctx.game.data.profile;
    this.ui = ctx.root.parentElement;
    ctx.css('css/profile.css');
    this.face = find(ctx.root, `${SLOT}/imagePrimary`);
    this.frameNode = find(ctx.root, `${SLOT}/imageFrame`);
    this.slot = find(ctx.root, SLOT);
    this.camBtn = find(ctx.root, CAMERA);
    this.stickers = [];
    this.layer = null;
    this.cam = null;
    this.paintKey = '';
    this.t = 0;

    ctx.hud.addMenu({ sec: 'etc', key: 'UI_Profile_Title02', sprite: 'bt_userProfile', run: () => this.open() });
    this.bindAll();
    window.__profileView = this;
  },

  // The profile slot (UI_Stage.UIOn_UserProfile) and the camera button.
  bindAll() {
    const ctx = this.ctx;
    const mine = new Map();
    const grab = (node, fn) => {
      if (!node) return;
      for (const w of node.querySelectorAll('.w')) { w.style.pointerEvents = 'auto'; w.style.cursor = 'pointer'; mine.set(w, fn); }
    };
    grab(this.slot, () => this.open());
    if (this.camBtn) { this.camBtn.classList.add('btn'); grab(this.camBtn, () => this.startCamera()); }
    this.binds = mine;
    this.rebind();
    void ctx;
  },
  rebind() { for (const [w, fn] of this.binds) if (w.onclick !== fn) w.onclick = fn; },

  update(dt) {
    this.t += dt;
    if (this.t > 0.4) { this.t = 0; this.paintSlot(); }
    if (this.camBtn) this.camBtn.classList.toggle('pf-ready', this.game.state.profile.mission > 0 && !this.cam);
    if (this.want) {
      // renderer.render ran before this hook returns; a microtask runs right after the animation callback, while the
      // WebGL drawing buffer still holds the frame (no preserveDrawingBuffer needed).
      const done = this.want;
      this.want = null;
      queueMicrotask(() => done(this.grabCanvas()));
    }
    if (this.refresh) { const r = this.refresh; this.refresh = null; r(); }
  },

  onEvent() {},

  // ---- shared helpers ----
  spr(atlas, name, w, h, sliced = false, cls = '') {
    const d = el(`pf-spr ${cls}`);
    d.style.width = `${w}px`;
    d.style.height = `${h}px`;
    this.ctx.ng.paint(d, atlas, name, sliced);
    return d;
  },
  fit(atlas, name, max) {
    const s = this.ctx.ng.spriteInfo(atlas, name);
    const k = s ? Math.min(max / s[2], max / s[3]) : 1;
    return s ? [Math.round(s[2] * k), Math.round(s[3] * k)] : [max, max];
  },
  icon(atlas, name, max, cls = '') { const [w, h] = this.fit(atlas, name, max); return this.spr(atlas, name, w, h, false, cls); },
  cond(row) {
    if (row.type === 1) return this.ctx.t('ConditionType1', row.value).split('\n').pop();
    return this.ctx.t('ConditionType2', '?').split('\n')[0];
  },
  defaultNick() {
    let n = '';
    try { const w = window.HubSave && window.HubSave.whoAmI && window.HubSave.whoAmI(); if (w && w.signedIn && w.name) n = String(w.name); } catch (e) { /* guest */ }
    return (n || this.ctx.t('noName')).slice(0, this.sim.NICK_MAX);
  },
  nick() { return this.sim.nickname(this.game, this.defaultNick()); },
  imgOf(idx) { const r = this.sim.row(this.game, 'images', idx); return r ? r.image : 'cat23'; },
  frameOf(idx) { const r = this.sim.row(this.game, 'outlines', idx); return r ? r.image : 'cat_box1'; },

  paintSlot() {
    const p = this.game.state.profile;
    const key = `${p.image}:${p.frame}`;
    if (this.face && this.face.box) this.ctx.ng.paint(this.face.box, FOOD, this.imgOf(p.image), false);
    if (this.frameNode && this.frameNode.box && key !== this.paintKey) { this.paintKey = key; this.ctx.ng.paint(this.frameNode.box, UI1, this.frameOf(p.frame), true); }
  },

  closeLayer() {
    if (this.layer) { this.layer.remove(); this.layer = null; }
  },

  // ======== profile window ========
  open() {
    if (this.cam) return;
    const { hud } = this.ctx;
    if (hud.panel) hud.close();
    this.closeLayer();
    this.tab = this.tab || 'image';
    const L = el('pf-layer');
    const dim = el('pf-dim');
    dim.onclick = () => this.closeLayer();
    L.appendChild(dim);
    this.layer = L;
    this.card = el('pf-card');
    L.appendChild(this.card);
    this.ui.appendChild(L);
    this.draw();
  },

  draw() {
    const { t } = this.ctx;
    const g = this.game, sim = this.sim, p = g.state.profile;
    const c = this.card;
    const keepIntro = c.querySelector('.pf-intro') ? c.querySelector('.pf-intro').value : null;
    const keepNick = c.querySelector('.pf-nick') ? c.querySelector('.pf-nick').value : null;
    c.textContent = '';
    const head = el('pf-head');
    head.appendChild(el('pf-title', t('UI_Profile_Title01')));
    const x = el('pf-x', '×');
    x.onclick = () => this.closeLayer();
    head.appendChild(x);
    c.appendChild(head);

    // avatar + name + title
    const top = el('pf-top');
    const av = el('pf-avatar');
    av.appendChild(this.icon(FOOD, this.imgOf(p.image), 150, 'pf-av-img'));
    av.appendChild(this.spr(UI1, this.frameOf(p.frame), 190, 190, true, 'pf-av-frame'));
    top.appendChild(av);
    const info = el('pf-info');
    const tl = p.title ? t(sim.row(g, 'titles', p.title).name) : t('UI_PlayerTitle_NoneSelected');
    info.appendChild(el('pf-ptitle', tl));
    const nr = el('pf-row');
    const ni = el('pf-nick', '', 'input');
    ni.maxLength = sim.NICK_MAX;
    ni.value = keepNick != null ? keepNick : this.nick();
    nr.appendChild(ni);
    const nb = el('pf-btn pf-nick-ok', t('UI_Profile_Apply'));
    nb.onclick = () => { if (sim.setNick(g, ni.value)) { this.ctx.hud.toast(t('msg_alreadySave')); this.draw(); } };
    nr.appendChild(nb);
    info.appendChild(nr);
    top.appendChild(info);
    c.appendChild(top);

    // stats
    const st = sim.stats(g);
    const sb = el('pf-stats');
    sb.appendChild(el('', t('UI_Profile_CatCount', st.cats)));
    sb.appendChild(el('', t('UI_Profile_ForestLevel', st.forest)));
    sb.appendChild(el('', t('UI_Profile_BuildingCount', st.buildings)));
    c.appendChild(sb);

    // introduction
    c.appendChild(el('pf-label', t('UI_ProfileIntro_Title')));
    const ir = el('pf-row');
    const ia = el('pf-intro', '', 'textarea');
    ia.placeholder = t('UI_ProfileIntro_Placeholder');
    ia.maxLength = sim.INTRO_MAX - 1;
    ia.value = keepIntro != null ? keepIntro : p.intro;
    ir.appendChild(ia);
    const ib = el('pf-btn pf-intro-ok', t('UI_Profile_Apply'));
    ib.onclick = () => { if (sim.setIntro(g, ia.value)) { this.ctx.hud.toast(t('UI_ProfileIntro_Success')); this.draw(); } };
    ir.appendChild(ib);
    c.appendChild(ir);

    // pickers
    const tabs = el('pf-tabs');
    for (const [id, label] of [['image', null], ['frame', t('title_profileoutline')], ['title', t('UI_PlayerTitle_Title02')]]) {
      const b = el(`pf-tab ${this.tab === id ? 'on' : ''}`);
      if (id === 'image') b.appendChild(this.icon(FOOD, this.imgOf(p.image), 56)); else b.textContent = label;
      b.onclick = () => { this.tab = id; this.draw(); };
      tabs.appendChild(b);
    }
    c.appendChild(tabs);
    const grid = el('pf-grid');
    c.appendChild(grid);
    if (this.tab === 'title') this.drawTitles(grid);
    else this.drawGrid(grid, this.tab === 'image' ? 'images' : 'outlines');
  },

  drawGrid(grid, list) {
    const g = this.game, sim = this.sim, p = g.state.profile, { t, hud } = this.ctx;
    const isImg = list === 'images';
    for (const r of this.data[list]) {
      const own = sim.isOwned(g, r);
      const on = (isImg ? p.image : p.frame) === r.index;
      const cell = el(`pf-cell ${own ? '' : 'lock'} ${on ? 'on' : ''}`);
      cell.dataset.idx = r.index;
      cell.appendChild(isImg ? this.icon(FOOD, r.image, 96) : this.spr(UI1, r.image, 110, 110, true));
      if (!own) cell.appendChild(this.icon(UI1, 'icon_lock', 46, 'pf-lockico'));
      if (on) cell.appendChild(el('pf-using', t('UI_Profile_Applying')));
      cell.onclick = () => {
        if (!own) { hud.toast(this.cond(r)); return; }
        if (isImg ? sim.setImage(g, r.index) : sim.setFrame(g, r.index)) { hud.toast(t('UI_Profile_RepresentativeImageChanged')); this.paintSlot(); this.draw(); }
      };
      grid.appendChild(cell);
    }
  },

  drawTitles(grid) {
    const g = this.game, sim = this.sim, p = g.state.profile, { t, hud } = this.ctx;
    grid.classList.add('titles');
    for (const r of this.data.titles) {
      const own = sim.isOwned(g, r);
      const on = p.title === r.index;
      const row = el(`pf-trow ${own ? '' : 'lock'} ${on ? 'on' : ''}`);
      row.dataset.idx = r.index;
      row.appendChild(el('pf-tname', t(r.name)));
      row.appendChild(el('pf-tcond', own ? (on ? t('UI_Profile_Applying') : '') : this.cond(r)));
      row.onclick = () => {
        if (!own) { hud.toast(this.cond(r)); return; }
        if (sim.setTitle(g, on ? 0 : r.index)) this.draw();
      };
      grid.appendChild(row);
    }
  },

  // ======== photo mode ========
  startCamera() {
    if (this.cam) return;
    const { hud, root, t } = this.ctx;
    if (hud.panel) hud.close();
    this.closeLayer();
    hud.card.style.display = 'none';
    root.style.visibility = 'hidden';
    hud.el.style.visibility = 'hidden';
    const sim = this.sim, g = this.game;
    const cam = { stickers: [], frame: g.state.profile.deco.frame || 0, tab: 'sticker', sel: null };
    this.cam = cam;
    const L = el('pf-cam');
    cam.el = L;
    cam.frameEl = el('pf-camframe');
    L.appendChild(cam.frameEl);
    cam.stickerLayer = el('pf-stickers');
    L.appendChild(cam.stickerLayer);
    const close = el('pf-camclose', '×');
    close.onclick = () => this.endCamera();
    L.appendChild(close);
    cam.bar = el('pf-cambar');
    cam.tray = el('pf-tray');
    cam.bar.appendChild(cam.tray);
    const row = el('pf-camrow');
    for (const [id, name, atlas] of [['sticker', 'Photo_sticker1', SHOT], ['frame', 'Photo_box1', SHOT]]) {
      const b = el(`pf-camtab ${cam.tab === id ? 'on' : ''}`);
      b.dataset.tab = id;
      b.appendChild(this.icon(atlas, name, 64));
      b.onclick = () => { cam.tab = id; this.drawTray(); };
      row.appendChild(b);
    }
    const shutter = el('pf-shutter');
    shutter.appendChild(this.icon(UI1, 'icon_camera_normal', 84));
    shutter.onclick = () => this.shoot();
    row.insertBefore(shutter, row.children[1]);
    cam.bar.appendChild(row);
    L.appendChild(cam.bar);
    this.ui.appendChild(L);
    this.drawTray();
    this.drawFrame();
    void sim; void t;
  },

  endCamera() {
    const cam = this.cam;
    if (!cam) return;
    cam.el.remove();
    this.cam = null;
    const { hud, root } = this.ctx;
    root.style.visibility = '';
    hud.el.style.visibility = '';
    hud.card.style.display = '';
  },

  // Paints the photo frame as a nine-slice border; the sprite loads asynchronously, so only the latest pick may land.
  async drawFrame() {
    const cam = this.cam, el = cam.frameEl;
    const r = this.sim.row(this.game, 'frames', cam.frame);
    const tok = (cam.frameTok = (cam.frameTok || 0) + 1);
    el.dataset.frame = r ? r.index : '';
    if (!r) { el.style.border = 'none'; el.style.borderImage = 'none'; return; }
    const url = await this.ctx.ng.sprite(SHOT, r.image);
    if (!url || tok !== cam.frameTok || this.cam !== cam) return;
    const [w, h, l, rr, t, b] = this.ctx.ng.spriteInfo(SHOT, r.image).slice(2, 8);
    void w; void h;
    el.style.boxSizing = 'border-box';
    el.style.borderStyle = 'solid';
    el.style.borderWidth = `${t}px ${rr}px ${b}px ${l}px`;
    el.style.borderImage = `url(${url}) ${t} ${rr} ${b} ${l} stretch`;
  },

  drawTray() {
    const cam = this.cam, g = this.game, sim = this.sim, { t, hud } = this.ctx;
    if (!cam) return;
    for (const b of cam.bar.querySelectorAll('.pf-camtab')) b.classList.toggle('on', b.dataset.tab === cam.tab);
    cam.tray.textContent = '';
    const list = cam.tab === 'sticker' ? this.data.stickers : this.data.frames;
    for (const r of list) {
      const own = sim.isOwned(g, r);
      const used = cam.tab === 'sticker' ? cam.stickers.some(s => s.row.index === r.index) : cam.frame === r.index;
      const cell = el(`pf-tcell ${own ? '' : 'lock'} ${used ? 'on' : ''}`);
      cell.dataset.idx = r.index;
      cell.appendChild(cam.tab === 'sticker' ? this.icon(SHOT, r.image, 96) : this.spr(SHOT, r.image, 100, 100, true));
      if (!own) cell.appendChild(this.icon(UI1, 'icon_lock', 40, 'pf-lockico'));
      cell.onclick = () => {
        if (!own) { hud.toast(this.cond(r)); return; }
        if (cam.tab === 'sticker') {
          if (used) { hud.toast(t('ui_popup_cannot_add_sticker')); return; }
          this.addSticker(r);
        } else {
          cam.frame = cam.frame === r.index && r.index !== 0 ? 0 : r.index;
          g.state.profile.deco.frame = cam.frame;
          this.drawFrame();
        }
        this.drawTray();
      };
      cam.tray.appendChild(cell);
    }
  },

  // A sticker: { row, x, y (centre in the 1080x1920 space), k (scale), flip }. Drag to move; the selected one shows
  // smaller / bigger / mirror / remove buttons.
  addSticker(row) {
    const cam = this.cam;
    const s = { row, x: 540 + (cam.stickers.length % 3) * 40 - 40, y: 800 + (cam.stickers.length % 4) * 50, k: 1.6, flip: false };
    cam.stickers.push(s);
    s.el = el('pf-sticker');
    s.el.dataset.idx = row.index;
    s.img = this.icon(SHOT, row.image, 100, 'pf-simg');
    s.el.appendChild(s.img);
    const tools = el('pf-stools');
    const btn = (txt, fn, cls = '') => { const b = el(`pf-stool ${cls}`, txt); b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); fn(); }; tools.appendChild(b); };
    btn('−', () => { s.k = Math.max(0.6, s.k - 0.3); this.placeSticker(s); }, 'minus');
    btn('+', () => { s.k = Math.min(5, s.k + 0.3); this.placeSticker(s); }, 'plus');
    if (row.flip) btn('⇋', () => { s.flip = !s.flip; this.placeSticker(s); }, 'flip');
    btn('×', () => this.removeSticker(s), 'del');
    s.el.appendChild(tools);
    let drag = null;
    s.el.onpointerdown = e => {
      e.stopPropagation();
      this.selectSticker(s);
      const k = this.ui.getBoundingClientRect().width / 1080;
      drag = { px: e.clientX, py: e.clientY, x: s.x, y: s.y, k };
      s.el.setPointerCapture(e.pointerId);
    };
    s.el.onpointermove = e => {
      if (!drag) return;
      s.x = Math.max(0, Math.min(1080, drag.x + (e.clientX - drag.px) / drag.k));
      s.y = Math.max(0, Math.min(1920, drag.y + (e.clientY - drag.py) / drag.k));
      this.placeSticker(s);
    };
    s.el.onpointerup = s.el.onpointercancel = () => { drag = null; };
    cam.stickerLayer.appendChild(s.el);
    this.placeSticker(s);
    this.selectSticker(s);
  },
  placeSticker(s) {
    s.el.style.left = `${s.x}px`;
    s.el.style.top = `${s.y}px`;
    s.img.style.transform = `scale(${s.flip ? -s.k : s.k}, ${s.k})`;
    s.el.style.setProperty('--k', s.k);
  },
  selectSticker(s) {
    const cam = this.cam;
    cam.sel = s;
    for (const o of cam.stickers) o.el.classList.toggle('sel', o === s);
    if (s) cam.stickerLayer.appendChild(s.el);
  },
  removeSticker(s) {
    const cam = this.cam;
    cam.stickers = cam.stickers.filter(o => o !== s);
    s.el.remove();
    this.drawTray();
  },

  // ---- capture ----
  grabCanvas() {
    const src = document.getElementById('game');
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  },

  async shoot() {
    const cam = this.cam;
    if (!cam || cam.busy) return;
    cam.busy = true;
    try {
      // Hide the buttons while grabbing so the next frame is clean; stickers and frame are drawn by hand below.
      const base = await new Promise(res => { this.want = res; });
      const out = await this.compose(base, cam);
      const blob = await new Promise(res => out.toBlob(res, 'image/png'));
      const r = this.sim.photo(this.game);
      if (r.gold) this.ctx.hud.toast(`${this.ctx.t('smg_quickPhoto')} +${B.format(r.gold)}`);
      this.preview(blob, out);
    } finally { cam.busy = false; }
  },

  loadImg(atlas, name) {
    return this.ctx.ng.sprite(atlas, name).then(url => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }));
  },

  async compose(base, cam) {
    const k = base.width / 1080;
    const c = document.createElement('canvas');
    c.width = base.width;
    c.height = base.height;
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    const fr = this.sim.row(this.game, 'frames', cam.frame);
    if (fr) {
      const img = await this.loadImg(SHOT, fr.image);
      const info = this.ctx.ng.spriteInfo(SHOT, fr.image);
      if (img) this.slice(x, img, info.slice(4, 8), 0, 0, c.width, c.height, k);
    }
    for (const s of cam.stickers) {
      const img = await this.loadImg(SHOT, s.row.image);
      if (!img) continue;
      const w = img.width * s.k * k * (100 / Math.max(img.width, img.height)) * 1;
      const h = img.height * s.k * k * (100 / Math.max(img.width, img.height));
      x.save();
      x.translate(s.x * k, s.y * k);
      if (s.flip) x.scale(-1, 1);
      x.drawImage(img, -w / 2, -h / 2, w, h);
      x.restore();
    }
    return c;
  },

  // Nine-slice [left, right, top, bottom] borders of the sprite, drawn at scale k.
  slice(x, img, [l, r, t, b], dx, dy, dw, dh, k) {
    const W = img.width, H = img.height;
    const L = l * k, R = r * k, T = t * k, B = b * k;
    const sx = [0, l, W - r, W], sy = [0, t, H - b, H];
    const tx = [dx, dx + L, dx + dw - R, dx + dw], ty = [dy, dy + T, dy + dh - B, dy + dh];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 1) continue;   // the middle of a frame is empty (the picture)
      const w = sx[i + 1] - sx[i], h = sy[j + 1] - sy[j];
      if (w <= 0 || h <= 0 || tx[i + 1] - tx[i] <= 0 || ty[j + 1] - ty[j] <= 0) continue;
      x.drawImage(img, sx[i], sy[j], w, h, tx[i], ty[j], tx[i + 1] - tx[i], ty[j + 1] - ty[j]);
    }
  },

  preview(blob, canvas) {
    const cam = this.cam;
    const url = URL.createObjectURL(blob);
    window.__photo = { blob, url, width: canvas.width, height: canvas.height, size: blob.size };
    const P = el('pf-preview');
    const img = el('pf-pimg', '', 'img');
    img.src = url;
    P.appendChild(img);
    const bar = el('pf-prow');
    const save = el('pf-btn pf-save', '⬇');
    save.onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `cats-soup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    const back = el('pf-btn pf-back', '×');
    back.onclick = () => P.remove();
    bar.append(save, back);
    P.appendChild(bar);
    cam.el.appendChild(P);
  },
};
