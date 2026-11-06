// Feature "tower" (view part): the Cat Tower ("THAP CAT"). Contract: js/view/registry.js. Rules: js/sim/features/tower.js,
// D:/catsoup-ref/rules/tower.md. The tower is its own scene in the original (Tower_Manager), so it gets its own small
// THREE renderer on a canvas laid over the forest: an isometric room per floor (floor mesh, two back walls, the exported
// towerprops/* meshes) with the cats placed on that floor wandering about. Panels (shop, storage, expand, cats, guide
// mission, accumulated reward) are DOM built with the game's own atlas sprites and strings.
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import MeshoptDecoder from '../../../vendor/meshopt_decoder.js';
import { loadLib } from '../world.js';
import { Rig } from '../anim.js';
import { texture } from '../shaders.js';
import { find } from '../ngui.js';
import * as B from '../../sim/big.js';
import * as T from '../../sim/features/tower.js';

const BUTTON = 'mainUI/set_bottomRight/bt_catTower';
const UI1 = 'atlas_ui1_atlas', FOOD = 'atlas_food_atlas';
const PROP_ATLAS = ['atlas_prop_furniture_floor_atlas', 'atlas_prop_furniture_wall_atlas', 'atlas_prop_other_atlas'];
const C = 0.25;                       // world units per grid cell (a 2x2 chair is 0.5 wide; fitted against the exported meshes)
const WALL_UNITS = T.WALL_H * C;
const YAW = Math.PI / 4, PITCH = 0.62; // isometric camera: the exported meshes carry a 45 degree yaw to face it
const CAT_SIZE = 1;                   // cats keep their forest size: standing 0.5 high, like a table (0.52)

// Shop / storage tabs, from the original storage_prop_type*_0 strings: furniture, decoration, room design, floors.
const TABS = [
  { key: 1, label: 'storage_prop_type1_0', test: p => p.type === 3 && p.detail <= 5 },
  { key: 2, label: 'storage_prop_type2_0', test: p => (p.type === 3 && p.detail > 5) || p.type === 4 },
  { key: 3, label: 'storage_prop_type3_0', test: p => p.type === 2 || p.type === 5 || p.type === 6 },
  { key: 5, label: 'storage_prop_type5_0', test: p => p.type === 1 || p.type === 7 },
];

const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };

export default {
  id: 'tower',

  mount(ctx) {
    this.ctx = ctx;
    this.game = ctx.game;
    ctx.css('css/tower.css');
    // ctx.t fills each {n} once; strings like CatTower_SizePopup_desc ("{0}R x {0}C") use one twice.
    this.t = (key, ...a) => {
      let r = ctx.lang[key] ?? key;
      a.forEach((v, i) => { r = r.split(`{${i}}`).join(v); });
      return r.replace(/\[[0-9a-fA-F]{6}\]|\[-\]|\[\/?[a-z]\]/g, '');
    };
    this.floor = 0;
    this.sel = null;                       // selected placed piece
    this.objs = new Map();                 // piece id -> {group, sig}
    this.libs = new Map();
    this.cats = new Map();                 // cat id -> {obj, rig, ...}
    this.iconAtlas = new Map();
    for (const a of PROP_ATLAS) for (const n of Object.keys(ctx.ng.atlases[a]?.sprites || {})) if (!this.iconAtlas.has(n)) this.iconAtlas.set(n, a);
    ctx.hud.bind(BUTTON, () => this.press());
    this.btn = find(ctx.root, BUTTON);
    this.acc = find(ctx.root, `${BUTTON}/accReward`);
    this.disable = find(ctx.root, `${BUTTON}/disable`);
    this.able = find(ctx.root, `${BUTTON}/default/able_build`);
    this.since = 1;
    this.on = false;
    window.__tower = this;
  },

  // ---- HUD button ----
  update(dt) {
    const g = this.game;
    this.since += dt;
    if (this.since >= 0.5) {
      this.since = 0;
      const open = T.isOpen(g);
      if (this.acc) this.acc.style.display = open && T.ticks(g) > 0 ? '' : 'none';
      if (this.disable) this.disable.style.display = !open && g.copies(T.TOWER_WORK) < 1 ? '' : 'none';
      if (this.able) this.able.style.display = !open && T.canOpen(g) ? '' : 'none';
      if (this.on) this.refreshBars();
    }
    if (this.on) {
      if (this.dirty) { this.dirty = false; this.syncScene(); this.since = 1; }
      this.frame(dt);
    }
  },

  press() {
    const { hud } = this.ctx, t = this.t, g = this.game;
    if (T.isOpen(g)) { this.enter(); return; }
    if (g.copies(T.TOWER_WORK) < 1) {
      hud.toast(t('buildRequire', t('tab_buildType1'), t(`title_build${T.TOWER_WORK}`), '').replace(/\s*\n\s*/g, ' '));
      return;
    }
    // UI_Stage.UIOn_CatTower: the first time the build row is paid (mag_buildCattower).
    const c = T.openCost(g);
    hud.open(t('title_catTower'), '', [{ title: t('mag_buildCattower') }], list => {
      const row = el('row tw-row');
      row.appendChild(this.icon(UI1, 'icon_tower', 110));
      const txt = el('txt');
      txt.appendChild(el('', t('mag_buildCattower'), 'b'));
      txt.appendChild(el('', t('cattowerActivating'), 'small'));
      row.appendChild(txt);
      const buy = el('buy');
      const btn = el(`price ${T.canPay(g, c.type, c.value) ? '' : 'off'}`, `${this.cur(c.type)} ${c.value}`);
      btn.onclick = () => {
        if (!T.open(g)) { hud.toast(t(c.type === 3 ? 'msg_shortGem' : 'msg_shortCoin')); return; }
        hud.close();
        hud.toast(t('cattowerActivated'));
        this.enter();
      };
      buy.appendChild(btn);
      row.appendChild(buy);
      list.appendChild(row);
    });
  },

  onEvent(e) {
    if (!this.on) return;
    if (['towerPlace', 'towerMove', 'towerStore', 'towerSize', 'towerSell', 'towerBuy', 'towerFloor', 'towerCat', 'towerCatOut', 'towerCats', 'towerMission', 'towerIdle'].includes(e.type)) {
      this.dirty = true;
      if (this.ctx.hud.panel && this.ctx.hud.panel.refresh) this.ctx.hud.panel.refresh();
    }
    if (e.type === 'towerMission' && e.reward) this.ctx.hud.toast(this.rewardText(e.reward.type, e.reward.value));
  },

  // ---- small builders ----
  cur(type) { return type === 3 ? '💎' : '🪑'; },
  spriteBox(atlas, name, h, cls = '') {
    const d = this.ctx.hud.sprite(atlas, name, cls);
    const i = this.ctx.ng.spriteInfo(atlas, name);
    if (i) { d.style.width = `${Math.round(i[2] * h / i[3])}px`; d.style.height = `${h}px`; } else { d.style.width = d.style.height = `${h}px`; }
    return d;
  },
  icon(atlas, name, h) { return this.spriteBox(atlas, name, h, 'tw-ic'); },
  propIcon(p, h) {
    const a = this.iconAtlas.get(p.resName);
    return a ? this.spriteBox(a, p.resName, h, 'tw-ic prop') : el('tw-ic prop', '?');
  },
  propName(p) { return this.t(`title_${p.resName}`); },
  rewardText(type, value) {
    const t = this.t;
    if (type === 4) return `🪑 ${value}`;
    if (type === 3) return `💎 ${value}`;
    if (type === 1) return `💰 ${B.format(B.fromNumber(value))}`;
    if (type === T.GUIDE_REWARD_PROP) { const p = T.propOf(this.game, value); return p ? this.propName(p) : '?'; }
    return `${type}: ${value}`;
  },
  floorLabel(n) { return n === 0 ? this.t('FloorNumber_lobby') : this.t('FloorNumber', n); },

  // ---- enter / leave ----
  async enter() {
    if (this.on) return;
    const g = this.game;
    this.ctx.hud.close();
    if (!this.dom) this.build();
    this.on = true;
    this.dom.root.style.display = 'block';
    this.fit();
    T.settle(g);
    if (!T.hasLayer(g, this.floor)) this.floor = 0;
    await this.ensureScene();
    this.setFloor(this.floor, true);
    if (T.canClaimIdle(g)) this.openIdle();
  },

  leave() {
    this.on = false;
    this.select(null);
    this.ctx.hud.close();
    if (this.dom) this.dom.root.style.display = 'none';
  },

  // ---- overlay DOM ----
  build() {
    const { hud } = this.ctx, t = this.t;
    const root = el('tw');
    const cv = document.createElement('canvas');
    cv.className = 'tw-cv';
    root.appendChild(cv);
    // top: exit, title, money
    const top = el('tw-top');
    const back = el('tw-btn round');
    back.appendChild(this.icon(UI1, 'icon_forest_exit', 84));
    back.onclick = () => this.leave();
    top.appendChild(back);
    const ttl = el('tw-title');
    ttl.appendChild(el('', t('title_catTower'), 'h1'));
    this.floorTitle = el('', '', 'h2');
    ttl.appendChild(this.floorTitle);
    top.appendChild(ttl);
    const money = el('tw-money');
    this.coinEl = el('', '0', 'b');
    this.gemEl = el('', '0', 'b');
    const c1 = el('m'); c1.appendChild(this.icon(UI1, 'icon_coin', 56)); c1.appendChild(this.coinEl);
    const c2 = el('m'); c2.appendChild(this.icon(UI1, 'icon_gem', 56)); c2.appendChild(this.gemEl);
    money.appendChild(c1); money.appendChild(c2);
    top.appendChild(money);
    root.appendChild(top);
    // guide mission strip
    this.msnEl = el('tw-msn');
    this.msnEl.onclick = () => this.openMission();
    root.appendChild(this.msnEl);
    // floors (elevator)
    this.floorsEl = el('tw-floors');
    root.appendChild(this.floorsEl);
    // bottom bar
    const bar = el('tw-bar');
    const mk = (icon, label, fn, atlas = UI1) => {
      const b = el('tw-btn');
      b.appendChild(this.icon(atlas, icon, 92));
      b.appendChild(el('', label, 'span'));
      b.onclick = fn;
      bar.appendChild(b);
      return b;
    };
    mk('icon_furnitureshop', t('title_catTowerShop_short'), () => this.openShop());
    mk('icon_storage', t('title_catTowerStorage'), () => this.openStorage());
    mk('icon_cat', t('info_catTowerArrange'), () => this.openCats());
    mk('icon_elevator', t('title_catTowerExpand'), () => this.openExpand());
    mk('icon_photo', '', () => this.photo());
    this.idleBtn = mk('icon_gold', t('title_toweroffline'), () => this.openIdle());
    root.appendChild(bar);
    // selected piece
    this.selEl = el('tw-sel');
    const rot = el('tw-btn small'); rot.appendChild(this.icon(UI1, 'icon_rotate', 72));
    rot.onclick = () => { if (this.sel && !T.rotate(this.game, this.floor, this.sel)) hud.toast(t('msg_no_build')); this.dirty = true; };
    const sto = el('tw-btn small'); sto.appendChild(this.icon(UI1, 'icon_storage_in', 72));
    sto.onclick = () => { if (this.sel) { const o = this.sel; this.select(null); T.store(this.game, this.floor, o); } };
    this.selName = el('', '', 'b');
    this.selEl.appendChild(this.selName); this.selEl.appendChild(rot); this.selEl.appendChild(sto);
    root.appendChild(this.selEl);
    hud.el.appendChild(root);
    this.dom = { root, cv };
    this.pointer();
    addEventListener('resize', () => { if (this.on) this.fit(); });
  },

  fit() {
    if (!this.renderer) return;
    const stage = document.getElementById('stage');
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    this.camFit();
  },

  refreshBars() {
    const g = this.game, s = g.state;
    this.coinEl.textContent = String(s.coin);
    this.gemEl.textContent = String(s.gem);
    const L = s.tower.layers[this.floor];
    this.floorTitle.textContent = `${this.floorLabel(this.floor)}  ${L ? `${T.gridSize(g, this.floor)}x${T.gridSize(g, this.floor)}` : ''}`;
    // guide mission
    const row = T.missionRow(g);
    this.msnEl.style.display = row ? '' : 'none';
    if (row) {
      const key = `${row.index}:${s.tower.mission.n}:${s.tower.mission.ready}`;
      if (this.msnKey !== key) {
        this.msnKey = key;
        this.msnEl.textContent = '';
        this.msnEl.appendChild(el('', this.t(row.title).replace(/^\[[^\]]*\]\s*/, ''), 'b'));
        this.msnEl.appendChild(el('', `${s.tower.mission.n}/${row.missionCount}`, 'i'));
        this.msnEl.classList.toggle('ready', T.canClaimMission(g));
      }
    }
    // floors
    const fk = JSON.stringify([T.floorList(g), this.floor, T.canBuildFloor(g, Math.max(...T.floorList(g)) + 1)]);
    if (this.fk !== fk) {
      this.fk = fk;
      this.floorsEl.textContent = '';
      const list = T.floorList(g).slice().reverse();
      const next = Math.max(...T.floorList(g)) + 1;
      if (T.canBuildFloor(g, next)) {
        const b = el('f add', '+');
        b.onclick = () => this.openExpand(2);
        this.floorsEl.appendChild(b);
      }
      for (const n of list) {
        const b = el(`f${n === this.floor ? ' on' : ''}`, this.floorLabel(n));
        b.onclick = () => this.setFloor(n);
        this.floorsEl.appendChild(b);
      }
    }
    this.idleBtn.style.display = T.canClaimIdle(g) ? '' : 'none';
  },

  // ---- THREE scene ----
  async ensureScene() {
    if (this.renderer) return;
    const cv = this.dom.cv;
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
    this.room = new THREE.Group();
    this.scene.add(this.room);
    this.fixed = new THREE.Group();                // floor, walls
    this.pieces = new THREE.Group();               // placed props
    this.catGroup = new THREE.Group();
    this.room.add(this.fixed, this.pieces, this.catGroup);
    // footprint marker
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.45, depthTest: false, side: THREE.DoubleSide }));
    m.renderOrder = 50;
    m.visible = false;
    this.marker = m;
    this.room.add(m);
    this.ray = new THREE.Raycaster();
    this.themeLib = await this.lib('theme');
    this.fit();
  },

  lib(id) {
    if (!this.libs.has(id)) this.libs.set(id, loadLib('.', `tower/${id}`, GLTFLoader, MeshoptDecoder));
    return this.libs.get(id);
  },

  async propLib(idx) {
    const m = this.game.data.tower.prefab[idx];
    if (!m) return null;
    return { lib: await this.lib(`c${m[0]}`), key: m[1] };
  },

  // Camera: orthographic isometric, framed on the room.
  camFit() {
    if (!this.cam) return;
    const n = this.game && T.hasLayer(this.game, this.floor) ? T.gridSize(this.game, this.floor) : 12;
    const size = n * C;
    const diag = size * Math.SQRT2;
    const w = diag * 1.18 * (this.zoom || 1);
    const h = w * 1920 / 1080;
    const cam = this.cam;
    cam.left = -w / 2; cam.right = w / 2; cam.top = h / 2; cam.bottom = -h / 2;
    const target = new THREE.Vector3(size / 2, WALL_UNITS * 0.25, size / 2);
    const d = 20;
    cam.position.set(target.x + d * Math.cos(PITCH) * Math.sin(YAW), target.y + d * Math.sin(PITCH), target.z + d * Math.cos(PITCH) * Math.cos(YAW));
    cam.lookAt(target);
    // lift the room a little so the bottom bar does not cover it
    cam.setViewOffset(1000, 1000, 0, 40, 1000, 1000);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  },

  setFloor(n, force = false) {
    if (!force && n === this.floor) return;
    this.floor = n;
    this.select(null);
    this.fk = null;
    this.sceneKey = null;
    this.clearPieces();
    this.camFit();
    this.dirty = true;
    this.syncScene();
    this.refreshBars();
  },

  clearPieces() {
    for (const [, e] of this.objs) this.pieces.remove(e.group);
    this.objs.clear();
    for (const [, c] of this.cats) this.catGroup.remove(c.obj);
    this.cats.clear();
  },

  // Rebuild what depends on the layer (floor, walls, size) and diff the placed pieces.
  async syncScene() {
    const g = this.game, n = this.floor, L = g.state.tower.layers[n];
    if (!L || !this.scene || !this.themeLib) return;
    const key = `${n}|${L.floor}|${L.wall}|${L.area}|${L.pattern}`;
    if (key !== this.sceneKey) { this.sceneKey = key; this.buildShell(L, key); }
    const want = new Map(L.props.map(o => [o.id, o]));
    for (const [id, e] of this.objs) if (!want.has(id)) { this.pieces.remove(e.group); this.objs.delete(id); if (this.sel && this.sel.id === id) this.select(null); }
    for (const o of L.props) {
      const sig = `${o.g}|${o.x}|${o.y}|${o.r}`;
      let e = this.objs.get(o.id);
      if (!e) { e = { group: new THREE.Group(), sig: '', o }; this.pieces.add(e.group); this.objs.set(o.id, e); this.loadPiece(e, o); }
      e.o = o;
      if (e.sig !== sig) { e.sig = sig; this.placePiece(e); }
    }
    this.syncCats();
  },

  async buildShell(L, key) {
    const g = this.game, n = T.gridSize(g, this.floor), size = n * C;
    const theme = this.themeLib;
    const [floorLib, floorKey] = L.floor ? await this.propLibPair(L.floor, 'towerprops/default_floor') : [theme, 'towerprops/default_floor'];
    const [wallLib, wallKey] = L.wall ? await this.propLibPair(L.wall, 'towerprops/default_wall_2') : [theme, 'towerprops/default_wall_2'];
    if (key !== this.sceneKey) return;
    this.fixed.clear();
    // floor, stretched over the whole room
    const fl = floorLib.instantiate(floorKey);
    fl.updateMatrixWorld(true);
    const fs = new THREE.Box3().setFromObject(fl).getSize(new THREE.Vector3());
    const fg = new THREE.Group();
    fg.add(fl);
    fl.scale.set(size / fs.x, 1, size / fs.z);
    fl.updateMatrixWorld(true);
    const fb = new THREE.Box3().setFromObject(fl);
    fl.position.set(size / 2 - (fb.min.x + fb.max.x) / 2, 0, size / 2 - (fb.min.z + fb.max.z) / 2);
    this.fixed.add(fg);
    // walls: west (x = 0 plane, along z) and north (z = 0 plane, along x, the same mesh turned -90 degrees)
    for (const side of ['wl', 'wr']) {
      const w = wallLib.instantiate(wallKey);
      const wg = new THREE.Group();
      wg.add(w);
      w.updateMatrixWorld(true);
      const s0 = new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3());
      w.scale.set(1, WALL_UNITS / s0.y, size / s0.z);
      w.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(w);
      const mid = side === 'wl' ? size / 2 : -size / 2;
      w.position.set(-b.max.x, -b.min.y, mid - (b.min.z + b.max.z) / 2);
      if (side === 'wr') wg.rotation.y = -Math.PI / 2;
      this.fixed.add(wg);
    }
    this.camFit();
  },

  async propLibPair(idx, fallback) {
    const r = await this.propLib(idx);
    return r ? [r.lib, r.key] : [this.themeLib, fallback];
  },

  async loadPiece(e, o) {
    const p = T.propOf(this.game, o.p);
    const r = await this.propLib(o.p);
    if (!this.objs.has(o.id) || this.objs.get(o.id) !== e) return;
    let obj;
    if (r) {
      obj = r.lib.instantiate(r.key);
      obj.traverse(c => { c.userData.pieceId = o.id; });
    } else {
      // no exported mesh: a block of the footprint
      const [w, h] = T.footprint(p, 0);
      obj = new THREE.Mesh(new THREE.BoxGeometry(w * C, Math.max(p.sy, 1) * C, h * C), new THREE.MeshBasicMaterial({ color: 0xd9b88f }));
      obj.position.y = Math.max(p.sy, 1) * C / 2;
      const wrap = new THREE.Group(); wrap.add(obj); obj = wrap;
      obj.traverse(c => { c.userData.pieceId = o.id; });
    }
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    e.inner = obj;
    e.center = bb.getCenter(new THREE.Vector3());
    e.bbox = bb;
    e.group.add(obj);
    this.placePiece(e);
  },

  // Footprint centre in world space of a piece, and its group transform. The exported prefab pivots differ per prop, so the
  // mesh is centred on its footprint by its own bounding box.
  placePiece(e) {
    const o = e.o, p = T.propOf(this.game, o.p);
    if (!e.inner) return;
    const [w, h] = T.footprint(p, o.r);
    const grp = e.group;
    const c = e.center;
    if (o.g === 'wl' || o.g === 'wr') {
      // inside the wall's frame (see buildShell): x leaves the wall into the room, z runs along it, y is up
      const along = (o.x + w / 2) * C, up = (o.y + h / 2) * C;
      grp.rotation.set(0, o.g === 'wl' ? 0 : -Math.PI / 2, 0);
      grp.position.set(0, 0, 0);
      e.inner.rotation.set(0, 0, 0);
      e.inner.position.set(-e.bbox.min.x + 0.003, up - c.y, (o.g === 'wl' ? along : -along) - c.z);
      return;
    }
    const cx = (o.x + w / 2) * C, cz = (o.y + h / 2) * C;
    const rot = (o.r || 0) * Math.PI / 2;
    e.inner.position.set(-c.x, 0, -c.z);
    grp.rotation.set(0, rot, 0);
    grp.position.set(cx, 0, cz);
    if (o.g === 'c') grp.position.y = 0.004;
    if (o.g === 'd') grp.position.y = 0.006;
  },

  // ---- cats on this floor ----
  syncCats() {
    const g = this.game, ids = new Set(T.catsOn(g, this.floor).map(c => c.id));
    for (const [id, c] of this.cats) if (!ids.has(id)) { this.catGroup.remove(c.obj); this.cats.delete(id); }
    for (const cat of T.catsOn(g, this.floor)) if (!this.cats.has(cat.id)) this.addCat(cat);
  },

  addCat(cat) {
    const { view } = this.ctx;
    const obj = view.catLib.instantiate(view.catLib.keys()[0]);
    const info = view.catTypes[cat.type];
    if (info) {
      const tex = texture(view.texBase, info.tex).tex;
      obj.traverse(o => {
        const u = o.isSkinnedMesh && o.material.uniforms;
        if (!u || !u.map || !u.fragMode || u.fragMode.value !== 0) return;
        const m = o.material.clone();
        m.uniforms = { ...u, map: { value: tex } };
        o.material = m;
      });
    }
    const wrap = new THREE.Group();
    wrap.add(obj);
    obj.scale.setScalar(CAT_SIZE);
    const rig = new Rig(view.animLib, obj);
    const e = { obj: wrap, inner: obj, rig, cell: null, path: [], wait: Math.random() * 2, anim: null, id: cat.id };
    const cell = this.freeCell();
    e.cell = cell;
    wrap.position.set((cell[0] + 0.5) * C, 0, (cell[1] + 0.5) * C);
    this.catGroup.add(wrap);
    this.cats.set(cat.id, e);
  },

  blocked() {
    const g = this.game, L = g.state.tower.layers[this.floor], n = T.gridSize(g, this.floor);
    const b = new Set();
    for (const o of L.props) {
      if (o.g !== 'f') continue;
      const [w, h] = T.footprint(T.propOf(g, o.p), o.r);
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) b.add((o.x + i) + (o.y + j) * n);
    }
    return b;
  },

  freeCell() {
    const n = T.gridSize(this.game, this.floor), b = this.blocked();
    const free = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (!b.has(i + j * n)) free.push([i, j]);
    return free.length ? free[Math.floor(Math.random() * free.length)] : [0, 0];
  },

  path(from, to) {
    const n = T.gridSize(this.game, this.floor), b = this.blocked();
    const key = c => c[0] + c[1] * n;
    const prev = new Map([[key(from), null]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      if (c[0] === to[0] && c[1] === to[1]) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c[0] + dx, z = c[1] + dz;
        if (x < 0 || z < 0 || x >= n || z >= n || b.has(x + z * n) || prev.has(x + z * n)) continue;
        prev.set(x + z * n, c);
        q.push([x, z]);
      }
    }
    if (!prev.has(key(to))) return [];
    const out = [];
    for (let c = to; c && key(c) !== key(from); c = prev.get(key(c))) out.unshift(c);
    return out;
  },

  stepCats(dt) {
    for (const e of this.cats.values()) {
      if (e.path.length) {
        const [cx, cz] = e.path[0];
        const tx = (cx + 0.5) * C, tz = (cz + 0.5) * C, p = e.obj.position;
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz), step = 0.5 * dt;
        e.obj.rotation.y = Math.atan2(dx, dz) + Math.PI;
        if (d <= step) { p.x = tx; p.z = tz; e.cell = e.path.shift(); } else { p.x += dx / d * step; p.z += dz / d * step; }
        this.catAnim(e, 'run');
      } else {
        this.catAnim(e, 'idle0');
        e.wait -= dt;
        if (e.wait <= 0) {
          e.wait = 2 + Math.random() * 4;
          if (Math.random() < 0.7) e.path = this.path(e.cell, this.freeCell()).slice(0, 14);
        }
      }
      e.rig.update(dt);
    }
  },

  catAnim(e, s) { if (e.anim !== s) { e.anim = s; e.rig.play(e.rig.has(s) ? s : 'idle0'); } },

  // ---- per frame ----
  frame(dt) {
    if (!this.renderer || !this.cam) return;
    this.stepCats(dt);
    if (this.sel) this.markSel();
    this.renderer.render(this.scene, this.cam);
  },

  // ---- selecting / dragging pieces ----
  select(o) {
    this.sel = o;
    this.marker.visible = !!o;
    if (!this.selEl) return;
    this.selEl.style.display = o ? 'flex' : 'none';
    if (o) this.selName.textContent = this.propName(T.propOf(this.game, o.p));
  },

  markSel() {
    const o = this.drag ? this.drag.to : this.sel;
    if (!o) return;
    this.markFootprint(o.g, o.x, o.y, o.r, this.drag ? this.drag.ok : true);
  },

  markFootprint(gr, x, y, r, ok) {
    const p = T.propOf(this.game, this.sel.p), [w, h] = T.footprint(p, r);
    const m = this.marker;
    m.material.color.set(ok ? 0x66e0ff : 0xff6a6a);
    m.scale.set(w * C, 1, h * C);
    m.rotation.set(0, 0, 0);
    m.scale.set(w * C, 1, h * C);
    if (gr === 'wl') { m.rotation.set(0, 0, Math.PI / 2); m.scale.set(h * C, 1, w * C); m.position.set(0.004, (y + h / 2) * C, (x + w / 2) * C); }
    else if (gr === 'wr') { m.rotation.set(Math.PI / 2, 0, 0); m.scale.set(w * C, 1, h * C); m.position.set((x + w / 2) * C, (y + h / 2) * C, 0.004); }
    else m.position.set((x + w / 2) * C, 0.01, (y + h / 2) * C);
    m.visible = true;
  },

  ndc(ev) {
    const r = this.dom.cv.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
  },

  // The cell under a pointer for the selected piece (floor or wall plane).
  cellAt(ev, p) {
    this.ray.setFromCamera(this.ndc(ev), this.cam);
    const n = T.gridSize(this.game, this.floor), [w, h] = T.footprint(p, this.sel.r);
    const hit = new THREE.Vector3();
    if (p.type === 4) {
      let best = null;
      for (const [g, plane] of [['wl', new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)], ['wr', new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)]]) {
        if (!this.ray.ray.intersectPlane(plane, hit)) continue;
        const along = g === 'wl' ? hit.z : hit.x;
        if (along < -0.02 || along > n * C + 0.02 || hit.y < -0.02 || hit.y > WALL_UNITS + 0.02) continue;
        const d = this.ray.ray.origin.distanceTo(hit);
        if (!best || d < best.d) best = { g, x: Math.round(along / C - w / 2), y: Math.round(hit.y / C - h / 2), d };
      }
      if (!best) return null;
      return { g: best.g, x: Math.max(0, Math.min(n - w, best.x)), y: this.sel && T.propOf(this.game, this.sel.p).forceEdge ? 0 : Math.max(0, Math.min(T.WALL_H - h, best.y)), r: this.sel.r };
    }
    if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return { g: this.sel.g, x: Math.max(0, Math.min(n - w, Math.round(hit.x / C - w / 2))), y: Math.max(0, Math.min(n - h, Math.round(hit.z / C - h / 2))), r: this.sel.r };
  },

  pickPiece(ev) {
    this.ray.setFromCamera(this.ndc(ev), this.cam);
    const hits = this.ray.intersectObjects(this.pieces.children, true);
    for (const h of hits) {
      let id = null;
      h.object.traverseAncestors(a => { if (id == null && a.userData.pieceId != null) id = a.userData.pieceId; });
      if (id == null && h.object.userData.pieceId != null) id = h.object.userData.pieceId;
      if (id != null) return this.game.state.tower.layers[this.floor].props.find(o => o.id === id);
    }
    return null;
  },

  pointer() {
    const cv = this.dom.cv;
    let down = null;
    cv.addEventListener('pointerdown', ev => {
      if (!this.cam) return;
      const hit = this.pickPiece(ev);
      down = { x: ev.clientX, y: ev.clientY, hit, moved: false };
      if (hit && this.sel === hit) {
        this.drag = { to: { ...hit }, ok: true };
        cv.setPointerCapture(ev.pointerId);
      }
    });
    cv.addEventListener('pointermove', ev => {
      if (!down) return;
      if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 8) down.moved = true;
      if (this.drag && down.moved) {
        const c = this.cellAt(ev, T.propOf(this.game, this.sel.p));
        if (c) { this.drag.to = c; this.drag.ok = T.fits(this.game, this.floor, this.sel.p, c.g, c.x, c.y, c.r, this.sel); }
      }
    });
    const up = ev => {
      if (!down) return;
      const d = down; down = null;
      if (this.drag) {
        const t = this.drag.to, ok = this.drag.ok;
        this.drag = null;
        if (d.moved && ok) T.move(this.game, this.floor, this.sel, t.g, t.x, t.y, t.r);
        else if (d.moved) this.ctx.hud.toast(this.t('msg_no_build'));
        this.marker.visible = !!this.sel;
        this.dirty = true;
        return;
      }
      if (d.moved) return;
      this.select(d.hit || null);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', () => { down = null; this.drag = null; });
    cv.addEventListener('wheel', ev => { ev.preventDefault(); this.zoom = Math.max(0.5, Math.min(1.6, (this.zoom || 1) * (ev.deltaY > 0 ? 1.08 : 0.92))); this.camFit(); }, { passive: false });
  },

  photo() {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.cam);
    try {
      const a = document.createElement('a');
      a.href = this.dom.cv.toDataURL('image/png');
      a.download = `thap-meo-${this.floor}.png`;
      a.click();
    } catch (e) { /* download blocked */ }
    T.photo(this.game);
    this.ctx.hud.toast('📷');
  },

  // ---- panels ----
  tabsFor(list) {
    const t = this.t;
    return TABS.map(tb => ({ ...tb, title: t(tb.label).replace(/\s*\(.*\)\s*$/, ''), items: list.filter(tb.test) })).filter(tb => tb.items.length);
  },

  openShop() {
    const { hud } = this.ctx, t = this.t, g = this.game;
    const tabs = this.tabsFor(T.shopList(g));
    hud.open(t('title_catTowerShop_short'), '', tabs, (list, tab) => {
      for (const p of tab.items) {
        const row = el('row tw-row');
        row.appendChild(this.propIcon(p, 120));
        const txt = el('txt');
        txt.appendChild(el('', this.propName(p), 'b'));
        const [w, h] = p.type === 3 || p.type === 5 ? T.footprint(p, 0) : [p.sx, p.sy];
        txt.appendChild(el('', `${w}x${h}  ·  ${T.have(g, p.index)}/${p.maxStorage}`, 'small'));
        row.appendChild(txt);
        const buy = el('buy');
        const full = T.have(g, p.index) >= p.maxStorage;
        const btn = el(`price ${full || !T.canPay(g, p.costType, p.cost) ? 'off' : ''}`, full ? 'MAX' : `${this.cur(p.costType)} ${p.cost}`);
        btn.onclick = () => {
          if (full) return;
          if (!T.buy(g, p.index, 1)) { hud.toast(t('msg_shortCoin')); return; }
          hud.panel.refresh();
        };
        buy.appendChild(btn);
        row.appendChild(buy);
        list.appendChild(row);
      }
    });
  },

  openStorage() {
    const { hud } = this.ctx, t = this.t, g = this.game;
    const owned = g.data.tower.props.filter(p => T.have(g, p.index) > 0);
    if (!owned.length) { hud.toast(`${t('msg_emptyTowerProp1')} ${t('msg_emptyTowerProp2')}`); return; }
    const tabs = this.tabsFor(owned);
    hud.open(t('title_catTowerStorage'), t('info_catTowerStorage'), tabs, (list, tab) => {
      for (const p of tab.items.filter(p => T.have(g, p.index) > 0)) {
        const row = el('row tw-row');
        row.appendChild(this.propIcon(p, 120));
        const txt = el('txt');
        txt.appendChild(el('', this.propName(p), 'b'));
        txt.appendChild(el('', `${T.spare(g, p.index)}/${T.have(g, p.index)}`, 'small'));
        row.appendChild(txt);
        const buy = el('buy');
        const place = el(`price ${T.spare(g, p.index) < 1 ? 'off' : ''}`, '▼');
        place.onclick = () => {
          const L = g.state.tower.layers[this.floor];
          const o = T.place(g, this.floor, p.index);
          if (!o) { hud.toast(t('msg_no_build')); return; }
          hud.close();
          if (o !== true) { this.select(L.props.find(x => x.id === o.id)); }
          this.dirty = true;
        };
        buy.appendChild(place);
        if (T.sellable(g, p.index) > 0) {
          const sell = el('price sell', `${t('sell')} +${p.resale}`);
          sell.onclick = () => { T.sell(g, p.index, 1); hud.panel.refresh(); };
          buy.appendChild(sell);
        }
        row.appendChild(buy);
        list.appendChild(row);
      }
      const keep = el('row tw-row keep', t('msg_towerpropKeepAll'));
      keep.onclick = () => { this.select(null); T.storeAll(g, this.floor); hud.panel.refresh(); };
      list.appendChild(keep);
    });
  },

  openCats() {
    const { hud } = this.ctx, t = this.t, g = this.game, n = this.floor;
    hud.open(t('info_catTowerArrange'), t('CurrentCatsFloor', T.catsOn(g, n).length) + '  ' + t('MaxCatsFloor', T.catCap(g, n)), [{ title: this.floorLabel(n) }], list => {
      for (const cat of g.state.cats) {
        const at = g.state.tower.cats[cat.id];
        const row = el('row tw-row');
        row.appendChild(this.spriteBox(FOOD, `cat${cat.type}`, 110, 'tw-ic'));
        const txt = el('txt');
        txt.appendChild(el('', t(`catType${cat.type}`), 'b'));
        txt.appendChild(el('', at == null ? '' : this.floorLabel(at), 'small'));
        row.appendChild(txt);
        const buy = el('buy');
        const here = at === n;
        const btn = el(`price ${!here && T.catsOn(g, n).length >= T.catCap(g, n) ? 'off' : ''}`, here ? '✔' : '+');
        btn.onclick = () => {
          if (here) T.removeCat(g, cat.id);
          else if (!T.placeCat(g, cat.id, n)) { hud.toast(t('info_floorAddition02')); return; }
          this.syncCats();
          this.openCats();
        };
        buy.appendChild(btn);
        row.appendChild(buy);
        list.appendChild(row);
      }
    });
  },

  // UI_TowerExpand: three tabs of the original (size, cats, construction), one row per floor.
  openExpand(tab = 0) {
    const { hud } = this.ctx, t = this.t, g = this.game;
    const tabs = [{ k: 'size', title: t('CatTower_SizeSetting') }, { k: 'cats', title: t('info_catTowerArrange') }, { k: 'build', title: t('title_floorConstruction', '').replace(/\s*$/, '') }];
    hud.open(t('title_catTowerExpand'), '', tabs, (list, tb) => {
      if (tb.k === 'size') {
        for (const n of T.floorList(g)) {
          const info = T.sizeInfo(g, n);
          const row = el('row tw-row col');
          row.appendChild(el('', n === 0 ? t('title_floorExpansion_lobby') : t('CatTower_SizeSetting_main', n), 'b'));
          const chips = el('chips');
          info.values.forEach((v, lv) => {
            const cost = lv > info.max ? null : lv === info.max + 0 && lv > info.max ? null : lv;
            const state = lv === info.level ? 'cur' : lv <= info.max ? 'own' : lv === info.max + 1 ? 'buy' : 'lock';
            const chip = el(`chip ${state}`);
            chip.appendChild(el('', t('CatTower_SizePopup_desc', v), 'b'));
            const sub = state === 'cur' ? t('CatTower_SizePopup_bt_now') : state === 'buy' ? `${this.cur(g.data.tower.info.find(r => r.type === 1 && r.layer === n).costType[lv])} ${g.data.tower.info.find(r => r.type === 1 && r.layer === n).cost[lv]}` : state === 'lock' ? '🔒' : t('CatTower_SizeSetting_bt');
            chip.appendChild(el('', sub, 'small'));
            chip.onclick = () => {
              if (state === 'cur' || state === 'lock') return;
              const before = g.state.tower.layers[n].props.length;
              if (!T.setSize(g, n, lv)) { hud.toast(t('msg_shortCoin')); return; }
              const out = before - g.state.tower.layers[n].props.length;
              hud.toast(out ? t('CatTower_SizePopup_RoomCleaning').split('.')[0] : t('CatTower_SizePopup_result', lv + 1));
              hud.panel.refresh();
            };
            chips.appendChild(chip);
          });
          row.appendChild(chips);
          list.appendChild(row);
        }
      } else if (tb.k === 'cats') {
        for (const n of T.floorList(g)) {
          const info = T.catInfo(g, n);
          const row = el('row tw-row');
          const txt = el('txt');
          txt.appendChild(el('', n === 0 ? t('title_floorAddition_lobby') : t('title_floorAddition', n), 'b'));
          txt.appendChild(el('', info.next ? t('info_floorAddition01', info.values[info.level + 1]) : t('info_floorAddition02'), 'small'));
          txt.appendChild(el('', `${t('CurrentCatsFloor', T.catsOn(g, n).length)} / ${t('MaxCatsFloor', T.catCap(g, n))}`, 'small'));
          row.appendChild(txt);
          const buy = el('buy');
          if (info.next) {
            const btn = el(`price ${T.canPay(g, info.next.type, info.next.value) ? '' : 'off'}`, `${this.cur(info.next.type)} ${info.next.value}`);
            btn.onclick = () => { if (!T.buyCatSlot(g, n)) hud.toast(t('msg_shortGem')); else hud.panel.refresh(); };
            buy.appendChild(btn);
          } else buy.appendChild(el('done', '✔'));
          row.appendChild(buy);
          list.appendChild(row);
        }
      } else {
        for (let n = 1; n <= T.FLOORS; n++) {
          const row = el('row tw-row');
          const txt = el('txt');
          txt.appendChild(el('', t('title_floorConstruction', n), 'b'));
          const built = T.hasLayer(g, n);
          txt.appendChild(el('', built ? t('info_floorConstruction03') : T.canBuildFloor(g, n) ? t('info_floorConstruction01', n) : t('info_floorConstruction02', n - 1), 'small'));
          row.appendChild(txt);
          const buy = el('buy');
          if (built) buy.appendChild(el('done', '✔'));
          else {
            const c = T.floorCost(g, n), ok = T.canBuildFloor(g, n);
            const btn = el(`price ${ok && T.canPay(g, c.type, c.value) ? '' : 'off'}`, ok ? `${this.cur(c.type)} ${c.value}` : '🔒');
            btn.onclick = () => { if (!ok) return; if (!T.buildFloor(g, n)) hud.toast(t('msg_shortCoin')); else { hud.panel.refresh(); this.fk = null; } };
            buy.appendChild(btn);
          }
          row.appendChild(buy);
          list.appendChild(row);
        }
      }
    });
    if (tab && hud.panel) hud.el.querySelectorAll('.panel .tabs div')[tab].click();
  },

  openMission() {
    const { hud } = this.ctx, t = this.t, g = this.game;
    hud.open(t('tower_mission_title_01'), '', [{ title: t('tower_mission_title_01') }], list => {
      const cur = g.state.tower.mission;
      const rows = g.data.tower.missions;
      for (const r of rows) {
        const done = cur.cur < 0 || r.index < cur.cur;
        const now = cur.cur === r.index;
        if (!done && !now) continue;
        const row = el(`row tw-row mis ${done ? 'claimed' : ''}`);
        const txt = el('txt');
        txt.appendChild(el('', t(r.title).replace(/^\[[^\]]*\]\s*/, ''), 'b'));
        const pname = r.missionValue2 === 9999 ? t('FurnitureCattower') : (T.propOf(g, r.missionValue2) ? this.propName(T.propOf(g, r.missionValue2)) : '');
        txt.appendChild(el('', t(r.name, r.missionCount, pname), 'small'));
        if (now) txt.appendChild(el('', `${cur.n}/${r.missionCount}`, 'small'));
        row.appendChild(txt);
        const buy = el('buy');
        buy.appendChild(el('rw', this.rewardText(r.rewardType, r.rewardValue)));
        if (now) {
          const ok = T.canClaimMission(g);
          const btn = el(`price ${ok ? '' : 'off'}`, t('getReward'));
          btn.onclick = () => { if (ok) T.claimMission(g); };
          buy.appendChild(btn);
        } else buy.appendChild(el('done', '✔'));
        row.appendChild(buy);
        list.appendChild(row);
      }
    });
  },

  openIdle() {
    const { hud } = this.ctx, t = this.t, g = this.game;
    T.settle(g);
    hud.open(t('title_toweroffline'), '', [{ title: t('title_toweroffline') }], list => {
      list.appendChild(el('row tw-row note', t('toweroffline_popup_desc')));
      const row = el('row tw-row');
      row.appendChild(this.icon(UI1, 'icon_gold', 100));
      const txt = el('txt');
      txt.appendChild(el('', `${B.format(T.pending(g))}`, 'b'));
      txt.appendChild(el('', `${T.ticks(g)}/${T.MAX_TICKS}`, 'small'));
      row.appendChild(txt);
      const buy = el('buy');
      const ok = T.canClaimIdle(g);
      const claim = el(`price ${ok ? '' : 'off'}`, t('getReward'));
      claim.onclick = () => { if (ok) { T.claimIdle(g, false); hud.close(); } };
      const ads = el(`price ads ${ok ? '' : 'off'}`, `▶ x${T.ADS_FACTOR}`);
      ads.onclick = () => { if (ok) { T.claimIdle(g, true); hud.close(); } };
      buy.appendChild(claim); buy.appendChild(ads);
      row.appendChild(buy);
      list.appendChild(row);
    });
  },
};
