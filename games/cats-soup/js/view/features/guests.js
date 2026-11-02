// Feature "guests" (view part). Contract: js/view/registry.js. Rules: js/sim/features/guests.js, D:/catsoup-ref/rules/guests.md.
// 3D (own objects in ctx.scene): the frog prince and the season snail (sprites of resources npc/npc0..53 on art/guests/npc.webp),
// guest vehicles crossing the forest (art/guests, tools/export_prefabs.py guests places/sled ...), the golden butterfly, the hidden
// theme-14 guest, and the deco blocks (places/decoblock3001..3015) attached to the facility object of core's view.
// Taps on those go through a wrapper of camera.onTap (there is no core hook for non-facility taps); a deco block is a facility
// of type 21 so its tap arrives in onTap(work). Windows: the original prefab set_froggift, DOM lists for guests, deco shop /
// storage and wishlist, a quiz dialog for the hidden guest.
import * as THREE from 'three';
import * as B from '../../sim/big.js';
import * as U from '../../sim/features/guests.js';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import MeshoptDecoder from '../../../vendor/meshopt_decoder.js';
import { loadLib } from '../world.js';
import { cellPos, CELL } from '../forest.js';
import { find } from '../ngui.js';

const SHEET = { cols: 9, rows: 7, cell: 128 };   // art/guests/npc.webp: cell n = npc/npc<n>, 54 / 55 = npc_theme14 / npc_theme15
const FROG = 0, SNAIL = 1, HIDDEN = 54;           // the plain snail sprite is inferred (the season picks the real one, GameNPCManager.SnailImageIndex)
const UI = 'atlas_ui1_atlas';
let C = null;
let G = null;                                     // game.feat.guests
let layer = null;
let lib = null;                                   // art/guests prefab lib (deco blocks and vehicles)
let sheet = null;                                 // THREE.Texture of npc.webp
let root = null;                                  // THREE.Group of every object of this feature
let panelFrog = null;
let dlg = null;                                   // open dialog element
const npc = {};                                   // 'frog' | 'snail' | 'hidden' | 'butterfly' -> { obj, base }
const rides = new Map();                          // visit id -> THREE object
const icons = new Map();                          // deco block index -> Promise<dataURL>
let time = 0;
let butterflyCell = null, hiddenCell = null;
const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
const has = k => C.lang[k] != null;
const toast = text => C.hud.toast(text);
const play = n => { try { C.sound.play(n); } catch (e) { /* sound is optional */ } };
const num = b => B.format(b);

// ---- sprites ----
function cellSprite(cell, size) {
  const t = sheet.clone();
  t.needsUpdate = true;
  t.repeat.set(1 / SHEET.cols, 1 / SHEET.rows);
  t.offset.set((cell % SHEET.cols) / SHEET.cols, 1 - (Math.floor(cell / SHEET.cols) + 1) / SHEET.rows);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(size, size, 1);
  s.renderOrder = 20;
  s.userData.cell = cell;
  return s;
}
function shadow(w = 0.9) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  m.position.y = 0.03;
  m.scale.z = 0.6;
  return m;
}
// A hovering golden butterfly drawn on a canvas (the original one is a particle prefab that is not exported).
function butterflyTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  for (const s of [-1, 1]) {
    x.save();
    x.scale(s, 1);
    x.fillStyle = '#ffd34d';
    x.strokeStyle = '#b8801c';
    x.lineWidth = 4;
    x.beginPath(); x.ellipse(26, -16, 30, 24, -0.5, 0, 6.3); x.fill(); x.stroke();
    x.fillStyle = '#ffb02e';
    x.beginPath(); x.ellipse(20, 20, 20, 16, 0.5, 0, 6.3); x.fill(); x.stroke();
    x.restore();
  }
  x.fillStyle = '#7a4b12';
  x.fillRect(-4, -26, 8, 56);
  return new THREE.CanvasTexture(c);
}
function makeNpc(kind) {
  const g = new THREE.Group();
  let spr;
  if (kind === 'butterfly') {
    spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: butterflyTexture(), transparent: true, depthWrite: false }));
    spr.scale.set(0.9, 0.9, 1);
    spr.renderOrder = 20;
  } else {
    spr = cellSprite(kind === 'frog' ? FROG : kind === 'snail' ? SNAIL : HIDDEN, kind === 'frog' ? 1.25 : 1.35);
  }
  spr.position.y = kind === 'butterfly' ? 1.2 : 0.7;
  g.add(spr);
  if (kind !== 'butterfly') g.add(shadow());
  g.userData.spr = spr;
  g.userData.kind = kind;
  root.add(g);
  return g;
}
function showNpc(kind, cell, on) {
  let n = npc[kind];
  if (!on) { if (n) n.visible = false; return; }
  if (!n) n = npc[kind] = makeNpc(kind);
  n.visible = true;
  if (cell) { cellPos(cell[0], cell[1], n.position); n.position.x += 0.3; n.position.z -= 0.2; }
}

// ---- deco blocks and guest vehicles (art/guests prefabs) ----
function decorate() {
  if (!lib) return;
  for (const w of C.game.state.works) {
    if (!U.isBlock(w.a)) continue;
    const e = C.view.works.get(w.id);
    if (!e || e.obj.userData.deco) continue;
    const key = `places/decoblock${w.a}`;
    if (!lib.roots.has(key)) continue;
    e.obj.userData.deco = true;
    e.obj.add(lib.instantiate(key));
  }
}
function field() {
  const f = C.game.field();
  let sx = 0, sy = 0;
  for (const [x, y] of f) { sx += x; sy += y; }
  return cellPos(sx / f.length, sy / f.length);
}
function syncRides() {
  const s = C.game.state.guests;
  const centre = field();
  for (const v of s.visits) {
    let o = rides.get(v.id);
    if (!o) {
      const row = G.guestRow(C.game, v.idx);
      const key = row && `places/${row.resName}`;
      o = new THREE.Group();
      if (lib && key && lib.roots.has(key)) o.add(lib.instantiate(key));
      else o.add(guestIcon(row));
      o.userData.visit = v.id;
      root.add(o);
      rides.set(v.id, o);
    }
    const [x, z] = U.visitPos(v);
    // The map is mirrored in z (cellPos); the run keeps its direction on screen.
    o.position.set(centre.x + x, 0.4 + Math.sin(v.t * 2) * 0.15, centre.z + z);
    o.rotation.y = v.v === 0 ? 0 : Math.PI / 2;
  }
  for (const [id, o] of rides) if (!s.visits.some(v => v.id === id)) { root.remove(o); rides.delete(id); }
}
function guestIcon(row) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  s.scale.set(2, 2, 1);
  s.position.y = 1;
  if (row) C.ng.sprite('atlas_item_atlas', `guest_${row.resName}`).then(url => {
    if (url) new THREE.TextureLoader().load(url, t => { s.material.map = t; s.material.needsUpdate = true; });
  });
  return s;
}

// Icon of a deco block: one render of its prefab to a transparent canvas (the original draws it from the 3D object, there is no
// sprite for it in the atlases).
let iconR = null, iconScene = null, iconCam = null;
function blockIcon(a) {
  if (icons.has(a)) return icons.get(a);
  const p = (async () => {
    if (!lib) return null;
    await lib.ready();
    if (!iconR) {
      iconR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      iconR.outputColorSpace = THREE.LinearSRGBColorSpace;
      iconR.setSize(160, 160);
      iconR.setClearColor(0x000000, 0);
      iconScene = new THREE.Scene();
      iconCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 40);
      iconCam.position.set(-6, 5, 6);
      iconCam.lookAt(0, 0, 0);
    }
    const o = lib.instantiate(`places/decoblock${a}`);
    iconScene.add(o);
    iconScene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    iconCam.position.set(c.x - 6, c.y + 5, c.z + 6);
    iconCam.lookAt(c);
    iconCam.updateMatrixWorld(true);
    // Fit by the projected corners of the bounding box, so a flat patch fills the icon like a tall tree.
    let r = 0.3;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(iconCam.matrixWorldInverse);
      r = Math.max(r, Math.abs(v.x), Math.abs(v.y));
    }
    r *= 1.08;
    iconCam.left = -r; iconCam.right = r; iconCam.top = r; iconCam.bottom = -r;
    iconCam.updateProjectionMatrix();
    iconR.render(iconScene, iconCam);
    const url = iconR.domElement.toDataURL('image/png');
    iconScene.remove(o);
    return url;
  })().catch(() => null);
  icons.set(a, p);
  return p;
}
function iconEl(kind, key) {
  const d = el('gu-ico');
  if (kind === 'block') blockIcon(key).then(u => { if (u) d.style.backgroundImage = `url(${u})`; else C.ng.paint(d, UI, 'icon_block', false); });
  else if (kind === 'guest') C.ng.paint(d, 'atlas_item_atlas', `guest_${key}`, false);
  else if (kind === 'sprite') C.ng.paint(d, key[0], key[1], false);
  return d;
}

// ---- popups ----
function closeDialog() { if (dlg) { dlg.remove(); dlg = null; } }
function popup(build) {
  closeDialog();
  const pop = el('gu-pop');
  const click = el('gu-click');
  click.onclick = closeDialog;
  pop.appendChild(click);
  build(pop);
  layer.appendChild(pop);
  dlg = pop;
  return pop;
}
function bindNode(n, fn) { for (const b of n.querySelectorAll('.w')) { b.style.pointerEvents = 'auto'; b.style.cursor = 'pointer'; b.onclick = fn; } n.classList.add('btn'); }
const energyIcon = () => C.hud.sprite(UI, 'icon_energy', 'spr');
const goldIcon = () => C.hud.sprite(UI, 'icon_gold', 'spr');

// set_froggift: the frog prince (free = 1/20, ad = all, paid at once) or the snail (the ad button only).
function openGift(kind) {
  const g = C.game;
  const frog = kind === 'frog';
  popup(pop => {
    const root = C.ng.build(panelFrog.roots[0]);
    pop.appendChild(root);
    find(root, 'title').box.textContent = C.t(frog ? 'frogGift' : 'npc_snail');
    find(root, 'txt_info').box.textContent = frog ? C.t('info_frogGift') : '';
    const heart = find(root, 'num_heart');
    heart.box.textContent = '';
    const amount = frog ? G.frogEnergy(g) : G.snailGold(g);
    const free = frog ? B.div(amount, U.FROG_FREE_DIVIDE) : null;
    const rw = el('gu-reward');
    rw.appendChild(frog ? energyIcon() : goldIcon());
    rw.appendChild(el('', `+${num(frog ? free : amount)}`, 'span'));
    root.appendChild(rw);
    rw.style.top = '-62px';
    const ads = find(root, 'bt_earnAds'), earn = find(root, 'bt_earn');
    const adsT = find(root, 'bt_earnAds/txt_adsT');
    if (adsT) adsT.style.display = 'none';
    const txt = find(root, 'bt_earnAds/txt');
    if (txt) txt.box.textContent = frog ? `+${num(amount)}` : C.t('getReward');
    const adsLb = find(root, 'bt_earnAds/txt_ads');
    if (adsLb) adsLb.box.textContent = C.t('showAds');
    const earnLb = find(root, 'bt_earn/txt');
    if (earnLb) earnLb.box.textContent = C.t('getReward');
    if (!frog) { earn.style.display = 'none'; ads.style.left = '0px'; }
    bindNode(ads, () => { const r = frog ? G.claimFrog(g, true) : G.claimSnail(g); if (r) { play('007_Powerup upgrade 35'); toast(`+${num(r)}`); } closeDialog(); });
    if (frog) bindNode(earn, () => { const r = G.claimFrog(g, false); if (r) { play('007_Powerup upgrade 35'); toast(`+${num(r)}`); } closeDialog(); });
    const pic = el('gu-frog');
    const cell = frog ? FROG : SNAIL;
    pic.style.backgroundImage = 'url(art/guests/npc.webp)';
    pic.style.backgroundPosition = `${-(cell % SHEET.cols) * 220 * 1.0}px ${-Math.floor(cell / SHEET.cols) * 220}px`;
    pic.style.backgroundSize = `${SHEET.cols * 220}px ${SHEET.rows * 220}px`;
    pic.style.zIndex = '300';
    pic.style.top = '-400px';
    rw.style.zIndex = '300';
    root.appendChild(pic);
  });
}

// Butterfly.ButterflyEvent: the mail-ads popup: normal reward or twice it with the ad.
function openButterfly() {
  const g = C.game;
  closeDialog();
  const box = el('sp-box');
  const dim = el('sp-dim gu-dlg');
  box.appendChild(el('sp-title', C.t('butterfly')));
  const x = el('sp-x', '×');
  x.onclick = closeDialog;
  box.appendChild(x);
  const base = U.BUTTERFLY_BASE;
  const row = el('sp-row');
  row.appendChild(C.hud.sprite(UI, 'icon_butterfly', 'spr'));
  row.appendChild(el('gu-res', `+${base}`));
  box.appendChild(row);
  if (has('msg_ads_reward')) box.appendChild(el('gu-desc', C.t('msg_ads_reward')));
  const b1 = el('sp-btn', C.t('getReward'));
  b1.onclick = () => { const n = G.claimButterfly(g, false); if (n) { play('007_Powerup upgrade 35'); toast(`+${n}`); } closeDialog(); };
  const b2 = el('sp-btn blue');
  b2.appendChild(el('', C.t('showAds'), 'span'));
  b2.appendChild(el('', `+${base * 2}`, 'small'));
  b2.onclick = () => { const n = G.claimButterfly(g, true); if (n) { play('007_Powerup upgrade 35'); toast(`+${n}`); } closeDialog(); };
  box.appendChild(b1);
  box.appendChild(b2);
  dim.appendChild(box);
  layer.appendChild(dim);
  dlg = dim;
}

// UI_HiddenGuest_Theme14: a question with three answers; right 30 (rare 60), wrong 15 (rare 30) special money.
function openQuiz() {
  const g = C.game;
  const h = g.state.guests.hidden;
  if (!h.on) return;
  closeDialog();
  const dim = el('sp-dim gu-dlg');
  const box = el('sp-box');
  const q = G.quizRow(g, h.quiz);
  box.appendChild(el('sp-title', C.t('hiddennpc_Halloween_title')));
  box.appendChild(el('gu-desc', C.t(h.rare ? 'hiddennpc_Halloween_rare_desc' : 'hiddennpc_Halloween_desc')));
  box.appendChild(el('gu-q', C.t(q.question_title)));
  const ans = el('gu-ans');
  ans.style.display = 'flex'; ans.style.flexDirection = 'column'; ans.style.gap = '14px';
  for (const a of G.quizAnswers(g, h.quiz)) {
    const b = el('sp-btn', C.t(a));
    b.onclick = () => {
      const r = G.answerHidden(g, a);
      if (!r) return;
      for (const k of ans.children) k.onclick = null;
      b.classList.add(r.correct ? 'ok' : 'no');
      box.appendChild(el('gu-res', C.t(r.correct ? 'hiddennpc_correct' : 'hiddennpc_wrong')));
      box.appendChild(el('gu-res', `+${r.value}`));
      setTimeout(closeDialog, 1600);
    };
    ans.appendChild(b);
  }
  box.appendChild(ans);
  const x = el('sp-x', '×');
  x.onclick = closeDialog;
  box.appendChild(x);
  dim.appendChild(box);
  layer.appendChild(dim);
  dlg = dim;
}

// ---- lists ----
const row = (...kids) => { const r = el('row'); for (const k of kids) r.appendChild(k); return r; };
const txt = (b, small) => { const t = el('txt'); t.appendChild(el('', b, 'b')); if (small) t.appendChild(el('', small, 'small')); return t; };

// Special guests (UI_CollectGuest + the guest switches of UI_Theme): collect with the six items, switch on / off, the 3 % each.
function openGuests() {
  const g = C.game;
  C.hud.open(C.t('extracat'), '', [{ title: C.t('extracat') }], list => {
    const head = row(txt(C.t('msg_guestEffect', Math.round(G.discount(g) * 100)).replace(/\s*\/\s*/g, ' '), `${G.onCount(g)}/${G.maxOn(g)}`));
    head.classList.add('head');
    list.appendChild(head);
    for (const r of G.guestList(g)) {
      const have = G.isPossess(g, r.index);
      const can = G.canCollect(g, r.index);
      const need = G.needEquips(g, r.index);
      const rw = row(iconEl('guest', r.resName), txt(C.t(`guest_name_${r.index}`).replace(/<[^>]*>\s*/, ''), have || !need.length ? C.t(`guest_info_${r.index}`) : C.t('guide_collectGuest')));
      if (!have && !can) rw.classList.add('locked');
      const right = el('buy');
      if (have) {
        const on = G.isOn(g, r.index);
        const t = el(`tgl ${on ? 'on' : ''}`, on ? 'ON' : 'OFF');
        t.onclick = () => {
          if (!G.onOff(g, r.index)) toast(C.t('popup_guest_max_message01', G.maxOn(g)));
          C.hud.panel.refresh();
        };
        right.appendChild(t);
      } else if (need.length) {
        const miss = G.missing(g, r.index).length;
        right.appendChild(el('gu-n', `${need.length - miss}/${need.length}`));
        const t = el(`tgl get ${can ? '' : 'off'}`, C.t('get'));
        t.onclick = () => { if (G.collect(g, r.index)) { play('007_Powerup upgrade 35'); C.hud.panel.refresh(); } else toast(C.t('msg_shortGuestCondition')); };
        right.appendChild(t);
      } else {
        right.appendChild(el('gu-n', '🔒'));
      }
      rw.appendChild(right);
      list.appendChild(rw);
    }
  });
}

// Deco blocks: UIBlockShop (title_blockShop) and UIBlockStorageMini (title_blockStorage). Placing one puts it on the next empty
// cell near the view centre; moving it afterwards is the ordinary move mode.
function openDeco(tab = 0) {
  const g = C.game;
  const tabs = [{ title: C.t('title_blockShop'), k: 'shop' }, { title: C.t('title_blockStorage'), k: 'store' }];
  C.hud.open(C.t('title_forestdeco'), '', tabs, (list, t) => {
    if (t.k === 'shop') {
      for (const b of G.shopList(g)) {
        const rw = row(iconEl('block', b.index), txt(C.t(`decoblockName${b.index}`), `${G.blockCount(g, b.index)}/${b.maxStorage}`));
        const right = el('buy');
        const ok = G.canBuyBlock(g, b.index);
        const btn = el(`price ${ok ? '' : 'off'}`);
        btn.textContent = G.isLimit(g, b.index) ? 'MAX' : b.blockCostValue === 0 ? C.t('get') : `${b.blockCostType === 3 ? '💎' : '🪙'} ${b.blockCostValue}`;
        btn.onclick = () => {
          if (G.buyBlock(g, b.index)) { play('007_Powerup upgrade 35'); C.hud.panel.refresh(); } else toast(C.t(b.blockCostType === 3 ? 'msg_shortGem' : 'msg_shortCoin'));
        };
        right.appendChild(btn);
        rw.appendChild(right);
        list.appendChild(rw);
      }
      return;
    }
    let any = false;
    for (const b of G.blockList(g)) {
      const spare = G.spareBlocks(g, b.index), stored = g.state.storage.filter(w => w.a === b.index);
      const total = spare + stored.length;
      if (!total) continue;
      any = true;
      const rw = row(iconEl('block', b.index), txt(C.t(`decoblockName${b.index}`), `x${total}   ${C.t('storage_decoblock_Type1')}: ${G.placedBlocks(g, b.index)}`));
      const right = el('buy');
      const btn = el('price', '⤴');
      btn.onclick = () => {
        const near = C.camera.target ? [Math.round(C.camera.target.x / CELL), Math.round(-C.camera.target.z / CELL)] : null;
        const placed = stored.length ? g.keepOut(stored[0].id, near) : G.placeBlock(g, b.index, nearCell(near));
        if (placed) { play('007_Powerup upgrade 35'); C.hud.panel.refresh(); } else toast(C.t('msg_no_build'));
      };
      right.appendChild(btn);
      rw.appendChild(right);
      list.appendChild(rw);
    }
    if (!any) list.appendChild(el('row locked', '—'));
  });
  if (tab) { const t = C.hud.panel.el.querySelectorAll('.tabs div')[tab]; if (t) t.click(); }
}
function nearCell(near) {
  const g = C.game;
  const cells = g.emptyCells();
  if (!cells.length) return null;
  if (!near) return cells[0];
  const d = c => (c[0] - near[0]) ** 2 + (c[1] - near[1]) ** 2;
  return cells.sort((a, b) => d(a) - d(b))[0];
}

// Wishlist (UI_Wishlist): wished items first, then the unowned ones of the shops grouped by WishList.json event.
function itemSprite(kind, i) {
  const g = C.game;
  if (kind === 'equip') {
    const e = g.t.Equip.find(x => x.index === i);
    if (!e) return null;
    for (const a of ['atlas_equip1_atlas', 'atlas_equip2_atlas', 'atlas_equip3_atlas', 'atlas_equip4_atlas']) if (C.ng.spriteInfo(a, e.resName)) return [[a, e.resName], has(`name_${e.resName}`) ? C.t(`name_${e.resName}`) : e.resName];
    return [null, e.resName];
  }
  const f = g.t.Furniture.find(x => x.index === i);
  if (!f) return null;
  for (const a of ['atlas_furniture1_atlas', 'atlas_furniture2_atlas']) if (C.ng.spriteInfo(a, f.resName)) return [[a, f.resName], has(`name_${f.resName}`) ? C.t(`name_${f.resName}`) : f.resName];
  return [null, f.resName];
}
function openWish() {
  const g = C.game;
  const tabs = [{ title: C.t('title_wishlist'), k: 'mine' }, { title: C.t('equipment'), k: 'add', kind: 'equip' }, { title: C.t('furniture'), k: 'add', kind: 'furniture' }];
  C.hud.open(C.t('title_wishlist'), `${G.wishList(g).length}/${U.WISH_MAX}`, tabs, (list, t) => {
    const mk = (kind, i, remove) => {
      const s = itemSprite(kind, i);
      if (!s) return null;
      const rw = row(s[0] ? iconEl('sprite', s[0]) : el('gu-ico'), txt(s[1], G.owns(g, kind, i) ? '✔' : ''));
      const right = el('buy');
      const b = el(remove ? 'gu-x' : `price ${G.wished(g, kind, i) ? 'off' : ''}`, remove ? '×' : G.wished(g, kind, i) ? '♥' : '♡');
      b.onclick = () => { if (remove ? G.delWish(g, kind, i) : G.addWish(g, kind, i)) C.hud.panel.refresh(); else if (!remove && !G.wished(g, kind, i)) toast(C.t('title_addwishlist_full')); };
      right.appendChild(b);
      rw.appendChild(right);
      return rw;
    };
    if (t.k === 'mine') {
      if (!G.wishList(g).length) list.appendChild(el('row locked', C.t('msg_noWishlist')));
      for (const [kind, i] of G.wishList(g)) { const r = mk(kind, i, true); if (r) list.appendChild(r); }
      return;
    }
    const events = new Map(g.data.guests.wishlist.map(r => [r.index, r]));
    const rows = (t.kind === 'equip' ? g.t.Equip.filter(e => e.type < 10) : g.t.Furniture).filter(e => !G.owns(g, t.kind, e.index));
    const by = new Map();
    for (const e of rows) { if (!by.has(e.addEvent)) by.set(e.addEvent, []); by.get(e.addEvent).push(e); }
    const keys = [...by.keys()].sort((a, b) => a - b).slice(0, 12);
    for (const k of keys) {
      const ev = events.get(k);
      list.appendChild(el('row gu-event', ev && has(ev.eventString) ? C.t(ev.eventString) : C.t('title_wishlist_3333')));
      for (const e of by.get(k).slice(0, 12)) { const r = mk(t.kind, e.index, false); if (r) list.appendChild(r); }
    }
  });
}

// ---- taps ----
function groundHit(x, y) {
  const p = C.camera.ground(x, y);
  const best = { d: 1.1, what: null };
  const test = (o, what, r = 1.1) => {
    if (!o || !o.visible) return;
    const d = Math.hypot(o.position.x - p.x, o.position.z - p.z);
    if (d < Math.min(best.d, r)) { best.d = d; best.what = what; }
  };
  for (const k of ['frog', 'snail', 'hidden', 'butterfly']) test(npc[k], k);
  for (const [id, o] of rides) test(o, { ride: id }, 1.6);
  return best.what;
}
function onTapAt(x, y) {
  if (window.__move && window.__move.on) return false;
  if (C.hud.panel || dlg) return false;
  const w = groundHit(x, y);
  if (!w) return false;
  if (w === 'frog' || w === 'snail') openGift(w);
  else if (w === 'butterfly') openButterfly();
  else if (w === 'hidden') openQuiz();
  else if (w.ride) {
    const v = C.game.state.guests.visits.find(o => o.id === w.ride);
    if (v) toast(C.t(`guest_name_${v.idx}`).replace(/<[^>]*>\s*/, ''));
  }
  return true;
}

// ---- hooks ----
export default {
  id: 'guests',
  async mount(ctx) {
    C = ctx;
    G = ctx.game.feat.guests;
    ctx.css('css/guests.css');
    layer = ctx.hud.el;
    root = new THREE.Group();
    ctx.scene.add(root);
    panelFrog = await ctx.panel('set_froggift');
    sheet = await new Promise(res => new THREE.TextureLoader().load(`${ctx.base}/art/guests/npc.webp${globalThis.CS_V || ''}`, res));
    sheet.colorSpace = THREE.NoColorSpace;
    loadLib(ctx.base, 'guests', GLTFLoader, MeshoptDecoder).then(l => { lib = l; }).catch(e => console.error('guests art', e));
    ctx.hud.moveActions = { ...(ctx.hud.moveActions || {}), bt_blockShop: () => openDeco(0), bt_blockStorage: () => openDeco(1) };
    ctx.hud.addMenu({ sec: 'etc', key: 'extracat', sprite: 'icon_frog', run: openGuests });
    ctx.hud.addMenu({ sec: 'forest', key: 'title_blockShop', sprite: 'icon_blockShop', run: () => openDeco(0) });
    ctx.hud.addMenu({ sec: 'etc', key: 'title_wishlist', sprite: 'bt_wishlist', run: openWish });
    // Client pixel of an object of this feature (tests click there).
    const screen = o => {
      const v = new THREE.Vector3().copy(o.position);
      v.y += 0.6;
      v.project(ctx.camera.cam);
      const r = ctx.camera.canvas.getBoundingClientRect();
      return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
    };
    window.__guests = { screen, focus: o => { ctx.camera.target.set(o.position.x, 0, o.position.z); ctx.camera.update(); }, decorated: () => ctx.game.state.works.filter(w => U.isBlock(w.a) && ctx.view.works.get(w.id) && ctx.view.works.get(w.id).obj.userData.deco).length, openGift, openButterfly, openQuiz, openGuests, openDeco, openWish, blockIcon, close: closeDialog, npc, rides, hit: groundHit };
  },
  // A deco block is a type 21 facility: the tap is consumed here so the facility card (levels, upgrade) does not open.
  onTapAt(x, y) { return onTapAt(x, y); },

  onTap(work) {
    if (!U.isBlock(work.a)) return false;
    toast(C.t(`decoblockName${work.a}`));
    return true;
  },
  update(dt) {
    if (!C || !sheet) return;
    time += dt;
    const g = C.game, s = g.state.guests;
    decorate();
    syncRides();
    showNpc('frog', s.frog.cell, s.frog.on);
    showNpc('snail', s.snail.cell, s.snail.on);
    if (s.hidden.on && !hiddenCell) hiddenCell = g.emptyCells()[Math.floor(g.rng() * Math.max(1, g.emptyCells().length))] || [0, 0];
    if (!s.hidden.on) hiddenCell = null;
    showNpc('hidden', hiddenCell, s.hidden.on);
    const ready = s.butterfly.ready;
    if (ready && !butterflyCell) butterflyCell = g.emptyCells()[Math.floor(g.rng() * Math.max(1, g.emptyCells().length))] || [0, 0];
    if (!ready) butterflyCell = null;
    showNpc('butterfly', butterflyCell, ready);
    for (const k of ['frog', 'snail', 'hidden', 'butterfly']) {
      const n = npc[k];
      if (!n || !n.visible) continue;
      const spr = n.userData.spr;
      spr.position.y = (k === 'butterfly' ? 1.2 : 0.7) + Math.sin(time * (k === 'butterfly' ? 4 : 2.2)) * (k === 'butterfly' ? 0.18 : 0.06);
      if (k === 'butterfly') { const f = 0.8 + Math.abs(Math.sin(time * 9)) * 0.3; spr.scale.set(0.9 * f, 0.9, 1); }
    }
  },
  onEvent(e) {
    if (e.type === 'guestVisit') toast(C.t('msg_guestInfo1'));
  },
};
