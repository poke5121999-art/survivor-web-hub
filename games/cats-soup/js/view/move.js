// Move mode ("Quản Lý Rừng", UI_MoveMode, map.md section 3): the HUD gives way to the original set_moveMode layout
// (art/ui/panels/set_movemode.json). Drag a facility to an empty cell or onto another one to swap; the selected one can
// go to the facility storage, come back out, or everything goes at once; the forest size can be set to any size up to
// the largest unlocked; "Hoàn tác" steps back through every change of this session. Deco blocks and the second forest
// of the original are not in this build, so their buttons stay hidden.
import * as THREE from 'three';
import { find } from './ngui.js';
import { CELL, cellPos } from './forest.js';

export class MoveMode {
  constructor({ game, view, scene, camera, hud, ng, root, json }) {
    Object.assign(this, { game, view, scene, camera, hud, ng, root, json });
    this.on = false;
    this.el = null;
    this.sel = null;
    this.undo = [];
    this.last = null;
    this.grid = new THREE.Group();
    this.grid.visible = false;
    scene.add(this.grid);
    this.cellGeo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2);
    this.cellMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
    this.selMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.45, depthWrite: false });
    this.mark = new THREE.Mesh(this.cellGeo, this.selMat);
    this.mark.renderOrder = 2;
    this.mark.visible = false;
    scene.add(this.mark);
    this.v = new THREE.Vector3();
  }

  async enter(work = null) {
    if (this.on) return;
    this.on = true;
    this.hud.close();
    this.hud.select(null);
    this.root.style.display = 'none';
    this.hud.el.classList.add('moving');
    if (!this.tree) this.tree = await this.json('art/ui/panels/set_movemode.json');
    this.el = this.ng.build(this.tree.roots[0]);
    this.wrap = document.createElement('div');
    this.wrap.className = 'root movemode';
    this.wrap.appendChild(this.el);
    this.root.parentElement.appendChild(this.wrap);
    const hide = p => { const n = find(this.el, p); if (n) n.style.display = 'none'; };
    ['root/set_storage/bt_blockStorage', 'root/set_storage/bt_blockShop', 'root/set_keep_all/bt_changeForest', 'root/set_topLeft',
      'root/set_bottom/panelKeep', 'root/set_bt'].forEach(hide);
    const label = find(this.el, 'root/set_center/set_title/Label');
    if (label && label.box) label.box.textContent = this.hud.t('title_forestdeco');
    this.bind('root/set_bottom/bt_close', () => this.exit());
    this.bind('root/set_keep/bt_keep', () => this.keep());
    this.bind('root/set_storage/bt_storage', () => this.openStorage());
    this.bind('root/set_keep_all/bt_keep_all', () => this.step(() => this.game.keepAll()));
    this.bind('root/set_keep_all/bt_forestSize', () => this.openSize());
    this.bind('root/set_keep_all/bt_revert', () => this.revert());
    this.camera.onGrab = (x, y) => this.grab(x, y);
    this.camera.onDrag = (x, y) => this.drag(x, y);
    this.camera.onDrop = (x, y, moved) => this.drop(x, y, moved);
    this.drawGrid();
    this.select(work);
  }

  exit() {
    if (!this.on) return;
    this.on = false;
    this.hud.close();
    if (this.wrap) this.wrap.remove();
    this.el = this.wrap = null;
    this.root.style.display = '';
    this.hud.el.classList.remove('moving');
    this.camera.onGrab = this.camera.onDrag = this.camera.onDrop = null;
    this.grid.visible = false;
    this.mark.visible = false;
    this.sel = null;
    this.undo.length = 0;
  }

  bind(path, fn) {
    const n = this.el && find(this.el, path);
    if (!n) return;
    for (const b of n.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = fn; }
  }

  // Every change goes through here so "Hoàn tác" can restore the layout before it.
  step(fn) {
    const before = this.game.layout();
    const ok = fn();
    if (ok) { this.undo.push(before); this.drawGrid(); }
    else this.hud.toast(this.hud.t('msg_no_build'));
    if (this.sel && !this.game.state.works.includes(this.sel)) this.select(null);
    this.refreshStorageCount();
    return ok;
  }

  revert() {
    const l = this.undo.pop();
    if (!l) return;
    this.game.restoreLayout(l);
    this.select(null);
    this.drawGrid();
    this.refreshStorageCount();
  }

  keep() {
    if (this.sel) this.step(() => this.game.keepWork(this.sel));
  }

  select(w) {
    this.sel = w;
    const keep = this.el && find(this.el, 'root/set_keep');
    if (keep) keep.style.display = w ? '' : 'none';
    const info = this.el && find(this.el, 'root/set_bottom/Info');
    if (info) {
      info.style.display = w ? '' : 'none';
      if (w) {
        const a = this.game.work.get(w.a);
        const icon = find(info, 'icon');
        if (icon && icon.box) this.ng.paint(icon.box, 'atlas_build_atlas', `build${a.index}`, false);
        const cat = find(info, 'icon_cat');
        if (cat) cat.style.display = 'none';
        const tab = a.type === 3 ? 'tab_buildType1' : a.type === 4 ? 'tab_buildType2' : 'tab_buildType0';
        for (const [p, k] of [['text_title', `title_build${a.index}`], ['text_type', tab]]) {
          const n = find(info, p);
          if (n && n.box) { n.box.textContent = this.hud.t(k); n.box.style.whiteSpace = 'nowrap'; n.box.style.overflow = 'hidden'; }
        }
      }
    }
    this.refreshStorageCount();
  }

  // The keep button floats above the selected facility (screen pixels of the 1080x1920 UI, origin at the centre).
  update() {
    if (!this.on || !this.el) return;
    const keep = find(this.el, 'root/set_keep');
    const e = this.sel && this.view.works.get(this.sel.id);
    if (!keep || !e) return;
    e.obj.getWorldPosition(this.v);
    this.v.y += 1.6;
    this.v.project(this.camera.cam);
    keep.style.left = `${this.v.x * 540}px`;
    keep.style.top = `${-this.v.y * 960}px`;
  }

  refreshStorageCount() {
    const n = this.el && find(this.el, 'root/set_storage/bt_storage/num');
    if (n && n.box) n.box.textContent = `x${this.game.state.storage.length}`;
  }

  drawGrid() {
    this.grid.clear();
    for (const [x, y] of this.game.field()) {
      const m = new THREE.Mesh(this.cellGeo, this.cellMat);
      cellPos(x, y, m.position);
      m.position.y = 0.02;
      m.renderOrder = 1;
      this.grid.add(m);
    }
    this.grid.visible = true;
  }

  cellAt(x, y) {
    const p = this.camera.ground(x, y);
    return [Math.round(p.x / CELL), Math.round(-p.z / CELL)];
  }

  grab(x, y) {
    const [cx, cy] = this.cellAt(x, y);
    this.last = [cx, cy];
    const w = this.game.workAt(cx, cy);
    if (!w) return false;
    this.select(w);
    this.dragging = this.view.works.get(w.id) || null;
    return !!this.dragging;
  }

  drag(x, y) {
    if (!this.dragging) return;
    const p = this.camera.ground(x, y);
    this.dragging.drag = (this.dragging.drag || new THREE.Vector3()).set(p.x, 0.15, p.z);
    const c = this.cellAt(x, y);
    const ok = this.game.inField(c[0], c[1]);
    this.mark.visible = ok;
    if (ok) { cellPos(c[0], c[1], this.mark.position); this.mark.position.y = 0.03; }
  }

  drop(x, y, moved) {
    const e = this.dragging;
    this.dragging = null;
    this.mark.visible = false;
    if (!e) return;
    e.drag = null;
    if (moved < 8) return;
    const c = this.cellAt(x, y);
    this.last = c;
    if (c[0] === e.w.pos[0] && c[1] === e.w.pos[1]) return;
    if (!this.game.inField(c[0], c[1])) return;
    this.step(() => this.game.moveWork(e.w, c));
  }

  openStorage() {
    const g = this.game;
    this.hud.open(this.hud.t('title_facilityStorage'), '', [{ title: this.hud.t('title_storage_category_04') }], list => {
      if (!g.state.storage.length) {
        const row = document.createElement('div');
        row.className = 'row locked';
        row.textContent = '—';
        list.appendChild(row);
      }
      for (const w of g.state.storage) {
        const a = g.work.get(w.a);
        const row = document.createElement('div');
        row.className = 'row';
        row.appendChild(this.hud.sprite('atlas_build_atlas', `build${a.index}`, 'icon'));
        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.innerHTML = '<b></b><small></small>';
        txt.querySelector('b').textContent = this.hud.t(`title_build${a.index}`);
        txt.querySelector('small').textContent = `Lv.${w.lv}`;
        row.appendChild(txt);
        const right = document.createElement('div');
        right.className = 'buy';
        const btn = document.createElement('div');
        btn.className = 'price';
        btn.textContent = '⤴';
        btn.onclick = () => { if (this.step(() => g.keepOut(w.id, this.last))) this.hud.panel.refresh(); };
        right.appendChild(btn);
        row.appendChild(right);
        list.appendChild(row);
      }
    });
  }

  // UI_ForestSizePreview: every size of MapSize_Main with its strings; sizes up to maxMapSize can be picked, the next
  // ones show how many more facilities unlock them (forest expansion itself stays the HUD "expand" button).
  openSize() {
    const g = this.game;
    const t = (k, ...a) => this.hud.t(k, ...a);
    this.hud.open(t('title_forestResize'), '', [{ title: t('title_forestResize') }], list => {
      g.mapSizes.forEach((m, n) => {
        const row = document.createElement('div');
        row.className = n > g.state.maxMapSize ? 'row locked' : 'row';
        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.innerHTML = '<b></b><small></small>';
        txt.querySelector('b').textContent = t('forestdeco_SizeSetting_main', n + 1);
        txt.querySelector('small').textContent = n > g.state.maxMapSize
          ? t('forestdeco_SizeSetting_remaining_msg', Math.max(0, m.openRequire - g.ownedCount()))
          : t('forestdeco_SizeSetting_desc', m.H_Size, m.V_Size, m.SpaceSize);
        row.appendChild(txt);
        if (n <= g.state.maxMapSize) {
          const right = document.createElement('div');
          right.className = 'buy';
          const btn = document.createElement('div');
          const cur = n === g.state.mapSize;
          btn.className = cur ? 'done' : 'price';
          btn.textContent = cur ? t('forestdeco_SizeSetting_bt_now') : t(n < g.state.mapSize ? 'forestdeco_SizeSetting_bt_sizedown' : 'forestdeco_SizeSetting_bt_sizeup');
          if (!cur) btn.onclick = () => { if (this.step(() => g.setMapSize(n))) { this.camera.target.set(0, 0, 0); this.camera.update(); this.hud.panel.refresh(); } };
          right.appendChild(btn);
          row.appendChild(right);
        }
        list.appendChild(row);
      });
    });
  }
}
