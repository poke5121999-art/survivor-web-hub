// Feature "theme" (view part): what the forest and the facilities look like. Contract: js/view/registry.js.
// Rules and citations: D:/catsoup-ref/rules/theme.md.
//   - facility skins: WorkPlaceInfo._workSkinObjs of the exported prefab (tools/export_theme.py -> data/theme.json "skins",
//     art/theme/skin<work>/): the skin position k (index in Work.existWorkSkins) swaps the mesh and material of the named
//     MeshFilter / SkinnedMeshRenderer node, switches the Actives lists and tints materials. The swap happens here, on the
//     object core drew (view.works.get(id).obj), no core change.
//   - forest themes: the three ground textures, the far-tree sprite and the camera colour of Theme.json row k are written
//     into the uniforms the Forest already uses (Spawn.SetThemeGround), UI = the original ui/functionwork/set_theme prefab.
//   - lamps: the sprite prefab lamp/lamp<k> (art/theme/lamps<k div 25>) replaces the lantern under each handLight/p.
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import MeshoptDecoder from '../../../vendor/meshopt_decoder.js';
import { loadLib } from '../world.js';
import { texture } from '../shaders.js';
import { find } from '../ngui.js';

const LAMP_CHUNK = 25;
const DAY_SKY = [0.4274, 0.5569, 0.3294], NIGHT_SKY = [0.16, 0.22, 0.24];   // main.js light(): the clear colour by day and by night

const libs = new Map();
const libOf = (base, id) => {
  if (!libs.has(id)) libs.set(id, loadLib(base, id, GLTFLoader, MeshoptDecoder));
  return libs.get(id);
};
const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };

export default {
  id: 'theme',
  ready: false,

  async mount(ctx) {
    Object.assign(this, { ctx, game: ctx.game, hud: ctx.hud, ng: ctx.ng, view: ctx.view, scene: ctx.scene });
    this.T = ctx.game.feat.theme;
    this.skins = ctx.game.data.theme.skins;
    ctx.css('css/theme.css');
    this.t = (key, fb, ...a) => (ctx.lang[key] != null ? ctx.t(key, ...a) : (fb ?? key));
    this.texBase = `${ctx.base}/art/tex`;
    this.root = el('th');
    ctx.hud.el.appendChild(this.root);
    this.btn = el('th-skin btn');
    this.btn.onclick = () => this.hud.selected && this.openSkins(this.hud.selected);
    ctx.hud.el.appendChild(this.btn);
    // The forest theme screen (the original opens it from the lucky jar's fairy); here a HUD button under the left column.
    this.open_ = el('th-open btn');
    this.open_.appendChild(this.icon('atlas_ui1_atlas', 'icon_brush', 90));
    this.open_.appendChild(el('', this.t('theme'), 'small'));
    this.open_.onclick = () => this.open();
    ctx.hud.addMenu({ sec: 'forest', key: 'theme', sprite: 'icon_brush', run: () => this.open() });
    this.dusk = ctx.game.isNight() ? 1 : 0;
    this.shown = null;
    // Facilities sit on the ground tile of their skin (Work.get_BaseTile, map.md 2a): core builds the forest with
    // Work.baseTile, so the tile lookup is wrapped here.
    const forest = this.view.forest, build = forest.build.bind(forest);
    forest.build = (fields, at) => build(fields, (x, y) => {
      const w = this.game.workAt(x, y);
      return w ? this.T.baseTile(this.game, w) : at(x, y);
    });
    this.tree = await ctx.panel('set_theme');
    this.paintGround(true);
    this.view.rebuildForest();
    this.ready = true;
    window.__theme = this;
  },

  onEvent(e) {
    if (!this.ready) return;
    if (e.type === 'themeSet') this.paintGround();
    if (e.type === 'skin' && e.tileChanged) this.view.rebuildForest();
    if (e.type === 'build' || e.type === 'move' || e.type === 'keepOut') this.view.rebuildForest();
    if (['skinGet', 'lampGet', 'themeGet', 'themeBuy', 'lamp', 'skin', 'sign', 'themeShop'].includes(e.type)) this.refresh();
  },

  // ---- forest theme ----
  // Spawn.SetThemeGround: layer 0 tiles take ground_base, tiles over 16 ground_base_2, edges and the background ground_back.
  paintGround(first) {
    const g = this.game, forest = this.view.forest, map = forest.map;
    const gr = this.T.groundOf(g, this.T.currentTheme(g));
    const set = (uniforms, stem) => { if (stem) uniforms.map.value = texture(this.texBase, stem).tex; };
    set(map.materials[0].mat.uniforms, gr.base);
    set(map.materials[1].mat.uniforms, gr.back);
    set(map.fallback.mat.uniforms, gr.base2);
    this.farTree = gr.farTree;
    this.farRec = gr;
    this.bg = gr.bg;
    this.sky = null;
    if (!first) this.paintTrees();
    this.themePainted = this.T.currentTheme(g);
  },

  // The far trees are one InstancedMesh per forest build whose sprite material is shared; its texture follows the theme.
  paintTrees() {
    if (this.farRec) this.view.forest.setFarTree(this.farRec);
  },

  // Camera colour of the theme (Spawn.ChangeMainCamBgColor); main.js sets the clear colour of theme 0 itself, other themes
  // get scene.background, darkened toward night in step with main.js light().
  skyColor(dt) {
    const night = this.game.isNight() ? 1 : 0;
    this.dusk = THREE.MathUtils.clamp(this.dusk + (night ? dt : -dt) / 2, 0, 1);
    if (this.T.currentTheme(this.game) === 0) { this.scene.background = null; return; }
    const c = this.scene.background instanceof THREE.Color ? this.scene.background : (this.scene.background = new THREE.Color());
    const k = [0, 1, 2].map(i => 1 + ((NIGHT_SKY[i] / DAY_SKY[i]) - 1) * this.dusk);
    c.setRGB(this.bg[0] * k[0], this.bg[1] * k[1], this.bg[2] * k[2]);
  },

  update(dt) {
    if (!this.ready) return;
    if (this.themePainted !== this.T.currentTheme(this.game)) this.paintGround();
    this.skyColor(dt);
    if (this.farTree && this.treeFor !== this.view.forest.group.children.find(c => c.isInstancedMesh)) { this.paintTrees(); this.treeFor = this.view.forest.group.children.find(c => c.isInstancedMesh); }
    for (const [, e] of this.view.works) this.dress(e);
    this.drawButton();
  },

  // ---- facilities: skin, lamp ----
  dress(e) {
    const g = this.game, w = e.w;
    if (!w || e.thBusy) return;
    const r = this.T.rec(g, w);
    if (e.thSkin !== r.skin) { e.thBusy = true; this.applySkin(e, r.skin).catch(err => console.error('theme skin', err)).finally(() => { e.thBusy = false; }); }
    else if (e.thLamp !== r.lamp && this.T.hasLamp(g, w)) { e.thBusy = true; this.applyLamp(e, r.lamp).catch(err => console.error('theme lamp', err)).finally(() => { e.thBusy = false; }); }
  },

  async applySkin(e, skin) {
    const g = this.game, w = e.w, d = this.skins[w.a];
    const a = g.work.get(w.a);
    const pos = a.existWorkSkins.indexOf(skin);
    if (!d) { e.thSkin = skin; return; }
    const objects = e.obj.userData.objects;
    const at = n => objects[n - d.base];
    // WorkWorker.DisplayEquipedWorkSkin runs at spawn too: the Actives lists decide which nodes show (the prefab's own flags
    // do not always match skin position 0). Meshes and colours of position 0 are what the prefab already draws.
    if (d.act) {
      for (const list of d.act) for (const n of list) { const o = at(n); if (o) o.visible = false; }
      for (const n of d.act[pos] || []) { const o = at(n); if (o) o.visible = true; }
    }
    if (skin === 0 && !e.thSwapped) { e.thSkin = skin; return; }
    e.thSwapped = true;
    if (d.mesh && d.lib) {
      const lib = await libOf(this.ctx.base, d.lib);
      for (const m of d.mesh) {
        const key = m.picks[pos];
        if (!key) continue;
        const node = at(m.node);
        if (!node) continue;
        this.swapMesh(node, lib.instantiate(key), !!m.sk);
      }
    }
    if (d.color) await this.tint(e, d, pos);
    e.thSkin = skin;
  },

  // MeshFilter nodes: drop the node's own renderers, take the meshes of the skin prefab. SkinnedMeshRenderer nodes keep the
  // skeleton the facility already has and get the new geometry on it.
  swapMesh(node, src, skinned) {
    if (skinned) {
      const old = node.children.filter(c => c.isSkinnedMesh);
      const skeleton = (old[0] || node.userData.thSkeleton || {}).skeleton || node.userData.thSkeleton;
      if (!skeleton) return;
      node.userData.thSkeleton = skeleton;
      const identity = new THREE.Matrix4();
      old.forEach(c => node.remove(c));
      for (const c of src.children.filter(x => x.isMesh)) {
        const sm = new THREE.SkinnedMesh(c.geometry, c.material);
        sm.bind(skeleton, identity);
        sm.frustumCulled = false;
        node.add(sm);
      }
      return;
    }
    node.children.filter(c => c.isMesh).forEach(c => node.remove(c));
    for (const c of src.children.filter(x => x.isMesh)) node.add(c);
  },

  // MaterialColors: the material named in the recipe is tinted per skin position (the soup colour of the cooking pots).
  async tint(e, d, pos) {
    const lib = await this.view.placeLib(e.w.a);
    for (const cc of d.color) {
      const col = cc.colors[pos];
      if (!col) continue;
      const idx = lib.scene.materials.findIndex(m => m.name === cc.material);
      if (idx < 0) continue;
      const shared = lib.materials[idx].mat.uniforms.tint;
      e.obj.traverse(o => {
        if (!o.isMesh || !o.material.uniforms || (o.material.uniforms.tint !== shared && !o.userData.thOwn)) return;
        if (!o.userData.thOwn) {
          o.material = o.material.clone();
          o.material.uniforms = { ...o.material.uniforms, tint: { value: new THREE.Vector4() } };
          o.userData.thOwn = true;
        }
        o.material.uniforms.tint.value.set(col[0], col[1], col[2], col[3]);
      });
    }
  },

  async applyLamp(e, lamp) {
    const hl = e.obj.getObjectByName('handLight');
    const p = hl && (hl.getObjectByName('p') || hl);
    if (!p) { e.thLamp = lamp; return; }
    const old = p.children.filter(c => /^lamp\d+$/.test(c.name));
    if (lamp === 0 && !e.thLampSwapped) { e.thLamp = lamp; return; }
    const lib = lamp === 0 ? this.view.lampLib : await libOf(this.ctx.base, `theme/lamps${Math.floor(lamp / LAMP_CHUNK)}`);
    const key = `lamp/lamp${lamp}`;
    if (!lib || !lib.roots.has(key)) { e.thLamp = lamp; return; }
    old.forEach(c => p.remove(c));
    p.add(lib.instantiate(key));
    e.thLampSwapped = true;
    e.thLamp = lamp;
  },

  // ---- skin panel (the facility card gets a button) ----
  eligible(w) {
    const T = this.T, g = this.game;
    return !!w && g.state.works.includes(w) && (T.skinList(g, w).length > 1 || T.signList(g, w).length > 1 || (T.hasLamp(g, w) && T.lampList(g).length > 1));
  },

  drawButton() {
    const w = this.hud.selected;
    const on = this.eligible(w) && !this.screen;
    this.btn.style.display = on ? 'flex' : 'none';
    this.open_.style.display = this.screen || this.hud.panel ? 'none' : '';
    if (on && this.btn.dataset.l !== this.t('skin')) { this.btn.dataset.l = this.t('skin'); this.btn.textContent = `🎨 ${this.t('skin')}`; }
  },

  openSkins(w) {
    const T = this.T, g = this.game;
    const tabs = [
      { key: 'skin', title: this.t('skinwork') },
      { key: 'sign', title: this.t('levelSign') },
      ...(T.hasLamp(g, w) ? [{ key: 'lamp', title: this.t('lamp') }] : []),
    ];
    this.skinWork = w;
    this.hud.open(this.t(`title_build${w.a}`), '', tabs, (list, tab) => {
      if (tab.key === 'skin') this.drawSkinRows(list, w);
      else if (tab.key === 'sign') this.drawSignRows(list, w);
      else this.drawLampRows(list, w);
    });
  },

  refresh() { if (this.hud.panel && this.skinWork) this.hud.panel.refresh(); if (this.screen) this.drawTheme(); },

  icon(atlas, name, size = 120) {
    const d = this.hud.sprite(atlas, name, 'th-ico');
    const s = this.ng.spriteInfo(atlas, name);
    if (s) { const k = Math.min(size / s[2], size / s[3]); d.style.width = `${Math.round(s[2] * k)}px`; d.style.height = `${Math.round(s[3] * k)}px`; }
    return d;
  },

  row(list, icon, name, info, right, cls = '') {
    const row = el(`row th-row ${cls}`);
    row.appendChild(icon);
    const txt = el('txt');
    txt.appendChild(el('', name, 'b'));
    txt.appendChild(el('', info, 'small'));
    row.appendChild(txt);
    const buy = el('buy');
    buy.appendChild(right);
    row.appendChild(buy);
    list.appendChild(row);
    return row;
  },

  action(text, fn, off) {
    const b = el(`price ${off ? 'off' : ''}`, text);
    if (!off && fn) b.onclick = fn;
    return b;
  },

  drawSkinRows(list, w) {
    const T = this.T, g = this.game;
    for (const s of T.skinList(g, w)) {
      const nm = s.index === 0 ? this.t(`title_build${w.a}`) : this.t(`skinwork_name_${s.index}`, `#${s.index}`);
      const info = s.index === 0 ? '' : this.t(`skinwork_info_${s.index}`, '');
      let right;
      if (s.equipped) right = el('done', '✔');
      else if (s.own) right = this.action(this.t('equip'), () => { T.equipSkin(g, w, s.index); });
      else if (s.buyable) right = this.action(s.gems ? `💎 ${s.gems}` : `🪙 ${s.coin}`, () => {
        if (!T.buySkin(g, w, s.index)) this.hud.toast(this.t('msg_shortGem')); else T.equipSkin(g, w, s.index);
      });
      else right = this.action(`🔒 ${s.realMoney ? this.t('package') : this.t('event')}`, null, true);
      const row = this.row(list, this.icon('atlas_item_atlas', s.row.resName), nm, info, right, s.own ? '' : 'locked-skin');
      row.dataset.skin = s.index;
    }
  },

  drawSignRows(list, w) {
    const T = this.T, g = this.game;
    for (const s of T.signList(g, w)) {
      const nm = `${this.t('levelSign')} ${s.index + 1}`;
      const info = s.lv ? `Lv.${s.lv}` : '';
      let right;
      if (s.equipped) right = el('done', '✔');
      else if (s.own) right = this.action(this.t('equip'), () => { T.equipSign(g, w, s.index); });
      else right = this.action('🔒', null, true);
      this.row(list, this.icon('atlas_img_atlas', 'signPost'), nm, info, right).dataset.sign = s.index;
    }
  },

  drawLampRows(list, w) {
    const T = this.T, g = this.game;
    const cur = T.lampOf(g, w);
    for (const i of T.lampList(g)) {
      const right = i === cur ? el('done', '✔') : this.action(this.t('equip'), () => { T.equipLamp(g, w, i); });
      this.row(list, this.icon('atlas_item_atlas', `lamp${i}`), this.t(`lamp${i}`, `#${i}`), '', right).dataset.lamp = i;
    }
  },

  // ---- theme and lamp screen (ui/functionwork/set_theme) ----
  open() {
    if (this.screen || !this.tree) return;
    this.hud.close();
    this.screen = el('th-screen');
    this.screen.appendChild(el('th-dim'));
    const title = el('th-title', this.t('theme'));
    this.screen.appendChild(title);
    const x = el('th-x', '×');
    x.onclick = () => this.close();
    this.screen.appendChild(x);
    const wrap = el('th-nroot');
    this.node = this.ng.build(this.tree.roots[0]);
    wrap.appendChild(this.node);
    this.screen.appendChild(wrap);
    this.root.appendChild(this.screen);
    for (const p of ['set_active/set3', 'set_active/ing_brush', 'set_ready']) { const n = find(this.node, p); if (n) n.style.display = 'none'; }
    const list = this.T.themeList(this.game);
    this.ti = Math.max(0, list.findIndex(x => x.current));
    const lamps = this.T.lampList(this.game);
    this.li = Math.max(0, lamps.indexOf(this.game.state.theme.lampType));
    const bind = (path, fn) => {
      const n = find(this.node, path);
      if (!n) return;
      n.classList.add('btn');
      for (const b of n.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = fn; }
      n.style.pointerEvents = 'auto';
    };
    const step = (n, dir, key) => {
      const len = key === 'ti' ? this.T.themeList(this.game).length : this.T.lampList(this.game).length;
      this[key] = (this[key] + dir + len) % len;
      this.drawTheme();
    };
    bind('set_active/set1/bt_side/bt_l', () => step(1, -1, 'ti'));
    bind('set_active/set1/bt_side/bt_r', () => step(1, 1, 'ti'));
    bind('set_active/set2/bt_side/bt_l', () => step(2, -1, 'li'));
    bind('set_active/set2/bt_side/bt_r', () => step(2, 1, 'li'));
    bind('set_active/set1/bt_select', () => { const x = this.T.themeList(this.game)[this.ti]; if (x && this.T.setTheme(this.game, x.index)) this.drawTheme(); });
    bind('set_active/set1/set_buy/bt_buy', () => this.buyTheme());
    bind('set_active/set2/bt_select', () => {
      const i = this.T.lampList(this.game)[this.li];
      this.confirm(this.t('msg_changeLampAll').replace(/\s*\\n\s*/g, '\n'), () => { this.T.equipLampAll(this.game, i); this.drawTheme(); });
    });
    this.drawTheme();
  },

  close() {
    if (this.screen) this.screen.remove();
    this.screen = null;
    this.node = null;
  },

  label(path, text) { const n = find(this.node, path); if (n && n.box) n.box.textContent = text; },
  show(path, on) { const n = find(this.node, path); if (n) n.style.display = on ? '' : 'none'; return n; },

  drawTheme() {
    if (!this.node) return;
    const T = this.T, g = this.game;
    const list = T.themeList(g);
    this.ti = Math.min(this.ti, list.length - 1);
    const x = list[this.ti];
    const spr = find(this.node, 'set_active/set1/spr_grade');
    if (spr && spr.box) this.ng.paint(spr.box, 'atlas_item_atlas', `theme${x.index}`, false);
    this.label('set_active/set1/txt_title', this.t(`theme${x.index}`, `theme${x.index}`));
    this.show('set_active/set1/bt_select', x.own && !x.current);
    this.show('set_active/set1/set_buy', !x.own);
    this.show('set_active/set1/v', x.current);
    this.label('set_active/set1/set_buy/bt_buy/Label', String(x.cost));
    const bb = find(this.node, 'set_active/set1/set_buy/bt_buy');
    if (bb) bb.style.opacity = x.buyable ? '' : '0.5';
    const lamps = T.lampList(g);
    this.li = Math.min(this.li, lamps.length - 1);
    const li = lamps[this.li];
    const icon = find(this.node, 'set_active/set2/icon');
    if (icon && icon.box) this.ng.paint(icon.box, 'atlas_item_atlas', `lamp${li}`, false);
    this.label('set_active/set2/txt_info', this.t(`lamp${li}`, `lamp${li}`));
    this.show('set_active/set2/bt_select', li !== g.state.theme.lampType);
    this.show('set_active/set2/v (1)', li === g.state.theme.lampType);
  },

  buyTheme() {
    const x = this.T.themeList(this.game)[this.ti];
    if (!x || x.own) return;
    if (!x.buyable) return;
    if (this.game.state.gem < x.cost) { this.hud.toast(this.t('msg_shortGem')); return; }
    this.confirm(`${this.t('msg_confirmBuy')}\n💎 ${x.cost}`, () => { if (this.T.buyTheme(this.game, x.index)) this.drawTheme(); });
  },

  // A yes / no question in the style of CommonPopupManager.StartPopup.
  confirm(text, yes) {
    const m = el('th-confirm');
    const box = el('box');
    box.appendChild(el('msg', text));
    const row = el('btns');
    const ok = el('price', this.t('ok', 'OK'));
    const no = el('price off', this.t('cancel', 'Hủy'));
    ok.onclick = () => { m.remove(); yes(); };
    no.onclick = () => m.remove();
    row.append(no, ok);
    box.appendChild(row);
    m.appendChild(box);
    this.root.appendChild(m);
  },
};
