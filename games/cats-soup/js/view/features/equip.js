// Feature "equip" (view part): worn outfits on the 3D cats, the fitting room and the equipment inventory.
// Contract: js/view/registry.js. Rules and citations: D:/catsoup-ref/rules/equip.md.
//
// How an item sits on a cat (UnitFactory.SetAppearance / SetAccessory, UnitFactory.c:4440 and :2500):
//   hat (type 0) and plain accessories (hideAcce 0, 13): the prefab Resources "equip/<resName>" is parented to the head bone
//     "Bip001 Head" with local position 0 and rotation Euler(-90, 0, 90), scaled by the cat's headSize * 0.5 + 0.5;
//   other accessories: the spine bones (hideAcce 16, 17 Spine/Spine1, 18, 20, 23 Spine2), the cat root (15 and the riding
//     kinds), or a floating follower (11, 12, 14: balloons);
//   cloth (type 1): not a mesh, the texture "equiptex/<resName>" is laid over the fur texture (GameManager.MergeTexture);
//   friends (type 3): a prefab that follows the cat on the ground, one each side.
// Items are exported in chunks (art/equip/c<k>/, tools/export_equip.py) and a chunk loads when a worn item needs it.
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/GLTFLoader.js';
import MeshoptDecoder from '../../../vendor/meshopt_decoder.js';
import { loadLib } from '../world.js';
import { texture } from '../shaders.js';
import { Rig } from '../anim.js';

const ATLAS = { 0: 'atlas_equip1_atlas', 1: 'atlas_equip2_atlas', 2: 'atlas_equip3_atlas', 3: 'atlas_equip4_atlas' };
const SLOT_TYPE = [0, 1, 2, 2, 3, 3];              // equipment type shown by each of the six worn slots
const FILTERS = ['all', 'head', 'body', 'face', 'waist', 'back', 'tail', 'mount_fly', 'misc', 'friend']; // fitting_room_filter_type1 = index
const PAGE = 40;

// Unity Quaternion.Euler(-90, 0, 90) in the exported frame (point (x, y, -z), quaternion (-x, -y, z, w)).
const HAT_Q = (() => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2, 'YXZ'));
  return new THREE.Quaternion(-q.x, -q.y, q.z, q.w);
})();
const BONE = { head: 'Bip001 Head', spine0: 'Bip001 Spine', spine1: 'Bip001 Spine1', spine2: 'Bip001 Spine2' };
// Attach point by AccePositionKind (Equip.hideAcce). `bone` = parent, `rot` = Euler(-90, 0, 90) applied, `float` = follower.
// (inferred) for the kinds whose case body was not read: they sit on the cat root with the prefab's own pose.
const PLACE = {
  0: { bone: 'head', rot: true }, 13: { bone: 'head', rot: true },
  16: { bone: 'spine0', rot: true }, 17: { bone: 'spine1', rot: true },
  18: { bone: 'spine2' }, 23: { bone: 'spine2' }, 20: { bone: 'spine2', rot: true },
  11: { float: [0.16, 0.62, 0.02] }, 12: { float: [0.16, 0.66, 0.02] }, 14: { float: [0.16, 0.58, 0.02] },
};
const PET_AT = [[0.22, 0, -0.12], [-0.22, 0, -0.12]];

let libs = null;
function chunkLib(base, k) {
  libs = libs || new Map();
  if (!libs.has(k)) libs.set(k, loadLib(base, `equip/c${k}`, GLTFLoader, MeshoptDecoder));
  return libs.get(k);
}

export default {
  id: 'equip',

  mount(ctx) {
    const { game, hud, ng, view } = ctx;
    const F = game.feat.equip;
    const art = game.data.equip;
    ctx.css('css/equip.css');
    const t = (k, ...a) => ctx.t(k, ...a);
    const el = (cls, text, tag = 'div') => { const d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; };
    const A = i => F.asset(game, i);
    const name = i => { const a = A(i); return a ? (ctx.lang[`title_${a.resName}`] ?? a.resName) : ''; };
    const spr = (i, h) => {
      const a = A(i);
      const atlas = ATLAS[a.type];
      const d = hud.sprite(atlas, a.resName, 'eq-ico');
      const s = ng.spriteInfo(atlas, a.resName);
      if (s) { const k = Math.min(h / s[3], h * 1.3 / s[2]); d.style.width = `${Math.round(s[2] * k)}px`; d.style.height = `${Math.round(s[3] * k)}px`; }
      else d.style.width = d.style.height = `${h}px`;
      return d;
    };
    const catName = cat => t(`catType${cat.type}`);

    // ---- dressing a cat object ----
    const furImage = info => {
      const e = texture(ctx.base + '/art/tex', info.tex);
      return e.full.then(() => e);
    };
    const bodyMeshes = obj => {
      const out = [];
      obj.traverse(o => { const u = o.isSkinnedMesh && o.material.uniforms; if (u && u.map && u.fragMode && u.fragMode.value === 0) out.push(o); });
      return out;
    };
    const clothCache = new Map();
    const clothTexture = async (info, resName) => {
      const key = `${info.tex}|${resName}`;
      if (!clothCache.has(key)) {
        clothCache.set(key, (async () => {
          const fur = await furImage(info);
          const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `${ctx.base}/art/equip/body/${resName}.webp${globalThis.CS_V || ''}`; });
          const c = document.createElement('canvas');
          c.width = fur.tex.image.naturalWidth || fur.tex.image.width; c.height = fur.tex.image.naturalHeight || fur.tex.image.height;
          const g = c.getContext('2d');
          g.drawImage(fur.tex.image, 0, 0);
          g.drawImage(img, 0, 0, c.width, c.height);      // MergeTexture: the outfit's opaque pixels cover the fur
          const tex = new THREE.CanvasTexture(c);
          tex.colorSpace = THREE.NoColorSpace; tex.flipY = false;
          tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
          return tex;
        })());
      }
      return clothCache.get(key);
    };

    function place(node, slotKind, entry, slotIdx) {
      const obj = entry.obj;
      const p = PLACE[slotKind] || {};
      const head = obj.getObjectByName(BONE.head);
      if (slotIdx >= 4) {                                  // friends stand beside the cat
        const at = PET_AT[slotIdx - 4];
        node.position.set(at[0], at[1], at[2]);
        obj.add(node);
      } else if (p.float) {
        node.userData.float = p.float;
        node.position.set(...p.float);
        obj.add(node);
      } else if (p.bone) {
        const bone = obj.getObjectByName(BONE[p.bone]) || head || obj;
        node.position.set(0, 0, 0);
        if (p.rot) node.quaternion.copy(HAT_Q);
        const s = entry.headScale;
        if (p.bone === 'head') node.scale.multiplyScalar(s);
        bone.add(node);
      } else {
        node.position.set(0, 0, 0);
        obj.add(node);
      }
    }

    // Applies the six worn slots to one cat entry {obj, rig}. Idempotent: it does nothing when the slots are unchanged.
    async function dress(entry, slots, catType) {
      const sig = slots.join(',');
      if (entry.eqSig === sig) return;
      entry.eqSig = sig;
      const tok = entry.eqTok = (entry.eqTok || 0) + 1;
      const info = view.catTypes[catType];
      entry.headScale = info ? info.head * 0.5 + 0.5 : 1;
      for (const o of entry.eqObjs || []) if (o.parent) o.parent.remove(o);
      entry.eqObjs = [];
      const furTex = info ? texture(ctx.base + '/art/tex', info.tex).tex : null;
      const meshes = bodyMeshes(entry.obj);
      const cloth = slots[1] && art.cloth[slots[1]];
      if (cloth && info) {
        const tex = await clothTexture(info, cloth);
        if (entry.eqTok !== tok) return;
        for (const m of meshes) m.material.uniforms.map.value = tex;
      } else if (furTex) for (const m of meshes) m.material.uniforms.map.value = furTex;
      for (let k = 0; k < slots.length; k++) {
        const idx = slots[k];
        if (!idx || SLOT_TYPE[k] === 1) continue;
        const p = art.prefab[idx];
        if (!p) continue;
        const lib = await chunkLib(ctx.base, p[0]);
        if (entry.eqTok !== tok) return;
        const node = lib.instantiate(p[1]);
        place(node, A(idx).hideAcce, entry, k);
        entry.eqObjs.push(node);
      }
    }

    // ---- inventory and fitting room ----
    let room = null;                                        // the open fitting room
    const close = () => {
      if (!room) return;
      room.el.remove();
      room.drag.remove();
      ctx.scene.remove(room.dummy.obj);
      ctx.camera.target.copy(room.save.target); ctx.camera.size = room.save.size; ctx.camera.update();
      room = null;
    };

    const abilityText = i => {
      const a = A(i);
      const ab = game.equipAbility.get(a.ability);
      const lv = Math.max(1, F.level(game, i));
      const v = `+${ab.initValue * game.t.LFactor[lv - 1].value}%`;
      if (ab.type === 1) return t('ability1', t(`title_build${ab.subIndex}`), v);
      if (ab.type === 3) { const f = game.food.get(ab.subIndex); return t('ability3', f ? t(`name_${f.resName}`) : '', v); }
      return t(`abilityS_${ab.subIndex}`, v);
    };
    const tagText = i => {
      const row = game.t.ItemTag.find(r => r.index === A(i).ItemTag);
      return row ? [row.tag1, row.tag2].filter(Boolean).map(k => t(k)).join(' ') : '';
    };
    const levelBar = i => {
      const d = F.entry(game, i);
      const lv = d ? d.lv : 0, exp = d ? d.exp : 0, max = F.maxLevel(game, i);
      const need = F.maxExpOf(game, i);
      const b = el('eq-lv');
      b.appendChild(el('t', `Lv.${lv}${lv >= max ? ' MAX' : ''}`));
      const bar = el('bar');
      const fill = el('fill');
      fill.style.width = `${need ? Math.min(100, (exp / need) * 100) : 100}%`;
      bar.appendChild(fill);
      bar.appendChild(el('n', need ? `${exp}/${need}` : 'MAX'));
      b.appendChild(bar);
      return b;
    };

    function openRoom(cat, tab = 0) {
      close();
      hud.close();
      const entry0 = view.cats.get(cat.id);
      const info = view.catTypes[cat.type];
      // A dummy cat in a corner of the scene, framed by the camera, so the working cats are left alone.
      const obj = view.catLib.instantiate(view.catLib.keys()[0]);
      if (info) {
        const tex = texture(ctx.base + '/art/tex', info.tex).tex;
        obj.traverse(o => {
          const u = o.isSkinnedMesh && o.material.uniforms;
          if (!u || !u.map || !u.fragMode || u.fragMode.value !== 0) return;
          const m = o.material.clone();
          m.uniforms = { ...u, map: { value: tex } };
          o.material = m;
        });
      }
      const rig = new Rig(view.animLib, obj);
      rig.play('idle0');
      const home = new THREE.Vector3(-300, 0, -300);
      obj.position.copy(home);
      obj.rotation.set(0, Math.PI / 4, 0);                 // faces the camera: the rig faces (-sin, -cos) and the camera looks along (+x, +z)
      ctx.scene.add(obj);
      const dummy = { obj, rig, catType: cat.type };

      const save = { target: ctx.camera.target.clone(), size: ctx.camera.size };
      ctx.camera.size = 0.95;
      ctx.camera.target.copy(home).add(new THREE.Vector3(0, 0.25, 0));
      ctx.camera.update();
      ctx.camera.pan(0, -ctx.camera.canvas.clientHeight * 0.23);

      const worn = F.worn(game, cat.id).slice();           // what the cat really wears
      const R = room = { cat, dummy, save, worn, preview: worn.slice(), tab, filter: 0, ownedOnly: false, sel: null, shown: 0, list: [], el: el('eq-room'), drag: el('eq-drag') };
      hud.el.appendChild(R.drag);
      hud.el.appendChild(R.el);
      let spin = null;
      R.drag.onpointerdown = e => { spin = { x: e.clientX, a: obj.rotation.y }; R.drag.setPointerCapture(e.pointerId); };
      R.drag.onpointermove = e => { if (spin) obj.rotation.y = spin.a + (e.clientX - spin.x) * 0.012; };
      R.drag.onpointerup = () => { spin = null; };
      draw();
      dress(dummy, R.preview, cat.type);
    }

    function draw() {
      const R = room;
      const cat = R.cat;
      R.el.textContent = '';
      const top = el('eq-top');
      top.appendChild(el('ttl', R.tab === 0 ? t('title_fittingroom') : t('title_costume_storage')));
      top.appendChild(el('who', catName(cat)));
      const x = el('x', '×');
      x.onclick = close;
      top.appendChild(x);
      R.el.appendChild(top);

      const sheet = el('eq-sheet');
      // the six slots of the cat: tap to take the item off the preview
      const slots = el('eq-slots');
      R.preview.forEach((idx, k) => {
        const s = el(`slot${idx ? ' on' : ''}`);
        if (idx) s.appendChild(spr(idx, 74)); else s.appendChild(el('e', ['👒', '👕', '👓', '👓', '🐾', '🐾'][k]));
        s.onclick = () => { if (idx) { R.preview[k] = 0; refresh(); } };
        slots.appendChild(s);
      });
      sheet.appendChild(slots);

      const tabs = el('eq-tabs');
      [t('title_fittingroom'), t('title_costume_storage')].forEach((label, k) => {
        const b = el(`tab${R.tab === k ? ' on' : ''}`, label);
        b.onclick = () => { R.tab = k; R.sel = null; draw(); };
        tabs.appendChild(b);
      });
      sheet.appendChild(tabs);

      const filt = el('eq-filters');
      FILTERS.forEach((f, k) => {
        const b = el(`f${R.filter === k ? ' on' : ''}`, t(`fittingroom_filter_${f}`));
        b.onclick = () => { R.filter = k; draw(); };
        filt.appendChild(b);
      });
      sheet.appendChild(filt);
      const own = el(`eq-own${R.ownedOnly ? ' on' : ''}`, `${R.ownedOnly ? '☑' : '☐'} ${t('fittingroom_filter_owned_costume')}`);
      own.onclick = () => { R.ownedOnly = !R.ownedOnly; draw(); };
      sheet.appendChild(own);

      const grid = el('eq-grid');
      sheet.appendChild(grid);
      R.grid = grid;
      R.list = items(R);
      R.shown = 0;
      more();
      grid.onscroll = () => { if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 200) more(); };

      R.infoEl = el('eq-info');
      sheet.appendChild(R.infoEl);
      info();
      const btns = el('eq-btns');
      const mk = (cls, label, fn) => { const b = el(`btn ${cls}`, label); b.onclick = fn; btns.appendChild(b); return b; };
      mk('grey', t('fittingroom_popup_return_btn'), () => { R.preview = R.worn.slice(); refresh(); });
      mk('grey', t('unEquipAll'), () => { R.preview = [0, 0, 0, 0, 0, 0]; refresh(); });
      R.apply = mk('blue', t('fittingroom_apply'), apply);
      sheet.appendChild(btns);
      R.el.appendChild(sheet);
    }

    function items(R) {
      const rows = game.t.Equip.filter(e => e.type <= 3 && e.index !== 0 && (R.filter === 0 || e.fitting_room_filter_type1 === R.filter));
      let out = rows.filter(e => {
        const d = F.entry(game, e.index);
        if (R.tab === 1) return d && (d.lv >= 1 || d.exp >= 1);                    // the inventory: owned cards and fragments
        if (e.fitting_room_show_owned && !F.owned(game, e.index)) return false;
        return !R.ownedOnly || F.owned(game, e.index);
      });
      // default order: owned first, higher level first, then table order (fittingroom_filter_sort_default)
      out = out.map(e => [e.index, F.level(game, e.index)]).sort((a, b) => (b[1] > 0) - (a[1] > 0) || b[1] - a[1] || a[0] - b[0]);
      return out.map(([i]) => i);
    }

    function more() {
      const R = room;
      const end = Math.min(R.list.length, R.shown + PAGE);
      for (; R.shown < end; R.shown++) R.grid.appendChild(cell(R.list[R.shown]));
      if (!R.list.length) R.grid.appendChild(el('empty', t('fittingroom_filter_no_results')));
    }

    function cell(i) {
      const R = room;
      const lv = F.level(game, i);
      const mine = R.preview.includes(i);
      const other = F.wearer(game, i);
      const c = el(`cell${lv ? '' : ' off'}${mine ? ' on' : ''}${R.sel === i ? ' sel' : ''}`);
      c.dataset.i = i;
      c.appendChild(spr(i, 96));
      if (lv) c.appendChild(el('lv', `Lv.${lv}`));
      else { const d = F.entry(game, i); if (d) c.appendChild(el('lv frag', `${d.exp}/${F.maxExpOf(game, i)}`)); }
      if (other != null && other !== R.cat.id) c.appendChild(el('use', '🐱'));
      c.onclick = () => tap(i);
      return c;
    }

    // Tapping an item selects it and tries it on the dummy; tapping a worn one takes it off the preview again.
    function tap(i) {
      const R = room;
      const a = A(i);
      const slot = F.slotFor(game, i, 0);
      const at = R.preview.indexOf(i);
      R.sel = i;
      if (at >= 0) R.preview[at] = 0;
      else {
        let s = slot;
        if (a.type >= 2 && R.preview[slot] && !R.preview[slot + 1]) s = slot + 1;         // the second accessory / friend slot
        R.preview[s] = i;
        if (a.type === 2) {
          const o = R.preview[s === 2 ? 3 : 2];
          if (o && F.clash(game, i, o)) { R.preview[s === 2 ? 3 : 2] = 0; hud.toast(t('desc_unable_acce_equip', name(o))); }
        }
      }
      refresh();
    }

    function refresh() {
      const R = room;
      dress(R.dummy, R.preview, R.cat.type);
      R.grid.querySelectorAll('.cell').forEach(c => {
        const i = +c.dataset.i;
        c.classList.toggle('on', R.preview.includes(i));
        c.classList.toggle('sel', R.sel === i);
      });
      const slots = R.el.querySelectorAll('.eq-slots .slot');
      R.preview.forEach((idx, k) => {
        const s = slots[k];
        s.textContent = '';
        s.classList.toggle('on', !!idx);
        if (idx) s.appendChild(spr(idx, 74)); else s.appendChild(el('e', ['👒', '👕', '👓', '👓', '🐾', '🐾'][k]));
      });
      info();
    }

    function info() {
      const R = room;
      R.infoEl.textContent = '';
      const i = R.sel;
      if (i == null) { R.infoEl.appendChild(el('hint', t('fittingroom_guide_popup_01'))); return; }
      R.infoEl.appendChild(spr(i, 100));
      const col = el('col');
      col.appendChild(el('nm', name(i)));
      col.appendChild(el('tag', tagText(i)));
      col.appendChild(el('ab', abilityText(i)));
      R.infoEl.appendChild(col);
      R.infoEl.appendChild(levelBar(i));
    }

    // fittingroom_apply: wear what the preview shows. Unowned items are left out (fittingroom_popup_apply_unowned), items
    // another cat wears are taken from that cat (fittingroom_popup_apply_in_use -> "Thay đổi" release).
    function apply() {
      const R = room;
      let skipped = 0, moved = 0;
      const cur = F.worn(game, R.cat.id);
      // unowned items are left out and the slot keeps what it had
      for (let k = 0; k < 6; k++) if (R.preview[k] && !F.owned(game, R.preview[k])) { R.preview[k] = cur[k]; skipped++; }
      for (let k = 0; k < 6; k++) if (cur[k] && R.preview[k] !== cur[k]) F.unwear(game, R.cat.id, k);
      for (let k = 0; k < 6; k++) {
        const i = R.preview[k];
        if (!i || cur[k] === i) continue;
        const by = F.wearer(game, i);
        const r = F.wear(game, R.cat.id, i, { slot: k % 2, steal: true });
        if (r.ok && by != null && by !== R.cat.id) moved++;
        else if (!r.ok) skipped++;
      }
      R.worn = F.worn(game, R.cat.id).slice();
      R.preview = R.worn.slice();
      hud.toast(skipped ? t('fittingroom_popup_apply_released_only') : moved ? t('fittingroom_popup_apply_in_use') : t('fittingroom_popup_apply_success'));
      refresh();
    }

    // ---- drawn cards: the results of reward type 5 (Popup_Gacha.ShowNewItem, Popup_EquipLevelUpList) ----
    let pop = null;
    function showDrawn(items) {
      if (pop) pop.remove();
      pop = el('eq-pop');
      const box = el('box');
      box.appendChild(el('ttl', t('title_gacha')));
      const list = el('list');
      for (const x of items) {
        const row = el('row');
        row.appendChild(spr(x.index, 110));
        const col = el('col');
        col.appendChild(el('nm', name(x.index)));
        col.appendChild(levelBar(x.index));
        row.appendChild(col);
        row.appendChild(el('exp', `+${x.exp}`));
        list.appendChild(row);
      }
      box.appendChild(list);
      const ups = items.filter(x => x.levels);
      if (ups.length) box.appendChild(el('note', t('clothing_popup_levelup_desc')));
      const ok = el('btn blue', 'OK');
      ok.onclick = () => { pop.remove(); pop = null; F.takeLevelUps(game); };
      box.appendChild(ok);
      pop.appendChild(box);
      hud.el.appendChild(pop);
    }

    const api = { ctx, openFor: cat => openRoom(typeof cat === 'number' ? game.state.cats.find(c => c.id === cat) : cat), close, dress, showDrawn };
    this.openFor = api.openFor;
    this.dress = dress;
    window.__equip = api;
    this.ctx = ctx;
    this.tick = dt => { if (room) room.dummy.rig.update(dt); };
    this.dressAll = () => {
      for (const cat of game.state.cats) {
        const e = view.cats.get(cat.id);
        if (e) dress(e, F.worn(game, cat.id), cat.type);
      }
    };
  },

  update(dt) {
    if (!this.dressAll) return;
    this.dressAll();
    const now = performance.now() / 1000;
    for (const e of this.ctx.view.cats.values()) for (const o of e.eqObjs || []) if (o.userData.float) o.position.y = o.userData.float[1] + Math.sin(now * 2) * 0.03;
    this.tick(dt);
  },

  onEvent(e) {
    if (e.type === 'reward' && e.reward && e.reward.type === 5 && window.__equip) window.__equip.showDrawn(e.reward.items);
  },
};

export const openFor = cat => (window.__equip ? window.__equip.openFor(cat) : null);
