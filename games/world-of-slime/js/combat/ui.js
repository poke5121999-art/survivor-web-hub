// Giao diện chiến đấu, dựng theo prefab gốc trong ui/prefab (số là đơn vị prefab, HUD tự nhân uiScale như js/ui/hud.js):
//   ui_objects__MonsterHud  : thẻ trên đầu slime hoang (Name fs26, HPGauge = UI_Gauge_BG01_1 + UI_Gauge_EnemyHP)
//   ô mục tiêu giữa trên    : [ĐO TRONG ẢNH] goget_battle_whistle (ảnh slime, "LV.2", tên, thanh 295 x 22 có "26 / 26")
//   ui_play__PVPvs          : nền (0.078,0.118,0.133,0.8), TEAM A ở (-450,-15) / TEAM B ở (450,-15) fs36, VS = Game/UI_PVP_Versus 179x172
//   ui_play__PVP321Start    : Game/UI_PVP_3 / _2 / _1 / UI_PVP_Start giữa màn
//   ui_play__PVPUserSlot    : ô người chơi + ô slime 64 (Ui_Bg_Round_02_264px màu (0.039,0.176,0.29)), "1/1" trên Ui_Bg_Round_01_40px
//   ui_play__PVPUserInfoLayout : "Lv2" fs36 + tên fs23
//   ui_objects__LogUITitle  : dòng log lớn "Roasted\nLv2" fs41 (6:27)
// Thanh trên cùng của trận (5:24) đo trong khung t0109 (480x270 -> x4 = 1920, /0.8 = đơn vị prefab) [ĐO TRONG ẢNH].
import * as THREE from 'three';
import { R, F, text } from '../ui/hud.js?v=20261022e';
import { assetUrl } from '../assets.js?v=20261022e';
import { state } from '../state.js?v=20261022e';
import { L } from '../../data/quest_text.js?v=20261022e';

const NAME_COL = [0.86, 0.62, 0.96, 1];     // [ĐO TRONG ẢNH] chữ tên slime hoang tím hồng (220,158,245)
const DARK = [0.078, 0.118, 0.133, 0.8];    // PVPvs Background / Team1 Image
const SLOT = [0.039, 0.176, 0.29, 1];       // PVPUserSlot thumbnails

const CSS = `
#hud .cbt { position:absolute; inset:0; pointer-events:none; }
#hud .cbt-tag .txt, #hud .cbt-target .txt, #hud .cbt-top .txt, #hud .cbt-vs .txt { white-space:nowrap; }
#hud .cbt-num { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:17px; color:#fff;
  text-shadow:0 0 2px #3a1030, 0 0 2px #3a1030; letter-spacing:1px; }
#hud .cbt-vs .vsname { padding:0 26px; }
#hud .cbt-vs .vtitle { font-style:italic; font-weight:800; letter-spacing:2px; }
#hud .cbt-pop { animation: cbtpop .35s ease-out; }
@keyframes cbtpop { from { transform: translate(-50%,-50%) scale(1.8); opacity:0; } to { transform: translate(-50%,-50%) scale(1); opacity:1; } }
#hud .cbt-bubble { background:#fff; border-radius:14px; padding:10px 16px; max-width:230px; white-space:normal !important; color:#2a3340;
  font-size:21px; line-height:1.15; box-shadow:0 2px 0 rgba(0,0,0,.25); text-align:center; }
#hud .cbt-title .txt { white-space:pre; line-height:1.0; font-style:italic; }
#hud .cbt-fade { transition: opacity .4s; }
#hud .tametag { padding: 0 12px; }
`;

export class CombatUI {
  constructor(hud) {
    this.hud = hud;
    if (!document.getElementById('cbt-css')) { const st = document.createElement('style'); st.id = 'cbt-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.world = R(hud.root, { a: [0, 0, 1, 1], n: 'combatWorld', cls: 'cbt world' });
    this.top = R(hud.root, { a: [0, 0, 1, 1], n: 'combatTop', cls: 'cbt' });
    this.tags = new Map();
    this.buildTarget();
    this.v = new THREE.Vector3();
  }

  // ---- thẻ MonsterHud trên đầu slime hoang
  tag(m) {
    let t = this.tags.get(m);
    if (t) return t;
    const el = R(this.world, { n: 'monsterTag', a: [0, 0], auto: true, pv: [0.5, 0], cls: 'col center hudtag cbt-tag' });
    el.dataset.name = m.def.name;
    if (m.team === 'B') text(el, 'Lv' + m.def.level, 24, [0.8, 0.95, 1, 1], 'outline');   // MonsterHud Lv (5:27 "Lv1" trên tên trong trận đấu)
    const name = text(el, m.def.name, 26, NAME_COL, 'outline');
    F(el, 1, 6);
    const g = F(el, 150, 20, { spr: 'Game/UI_Gauge_BG01_1', col: [0.031, 0.118, 0.188, 1], sl: true });
    const f = R(g, { a: [0, 0, 0, 1], p: [2, 0], sz: [146, -4], pv: [0, 0.5], spr: 'Game/UI_Gauge_EnemyHP', sl: true });
    t = { el, name, fill: f };
    this.tags.set(m, t);
    return t;
  }
  dropTag(m) { const t = this.tags.get(m); if (t) { t.el.remove(); this.tags.delete(m); } }
  clearTags() { for (const m of [...this.tags.keys()]) this.dropTag(m); }

  // ---- ô mục tiêu giữa trên (goget_battle_whistle: tâm ảnh slime y ~258 dưới mép trên, thanh 295 rộng)
  buildTarget() {
    const r = this.targetEl = R(this.top, { n: 'combatTarget', a: [0.5, 1], p: [0, -330], sz: [400, 190], pv: [0.5, 0], cls: 'cbt-target' });
    this.tImg = R(r, { tag: 'img', a: [0.5, 1], p: [-12, -64], sz: [128, 128], pv: [0.5, 0.5] }); this.tImg.crossOrigin = 'anonymous';
    const lv = R(r, { a: [0.5, 1], p: [78, -104], auto: true, pv: [0.5, 0.5] }); this.tLv = text(lv, 'LV.2', 30, [0.8, 0.95, 1, 1], 'outline');
    const nm = R(r, { a: [0.5, 1], p: [0, -140], auto: true, pv: [0.5, 0.5], cls: 'row center' }); nm.style.gap = '8px'; this.tName = text(nm, '', 30, NAME_COL, 'outline');
    // F3: thẻ "Tame" (chữ xanh lá) / "Untamed" (chữ xám) trên nền tối bo tròn cạnh tên [ĐO TRONG ẢNH gmwall_tame_floralime_cube,
    // v4van_nickname_synthesis_lab]: Tame = loài đã có trong bách khoa ở mức Catch (SlimeIndex.DegreeStep02)
    this.tTag = F(nm, null, 36, { spr: 'Common/Ui_Bg_Round_01_32px', col: [0.05, 0.1, 0.14, 0.75], sl: true, cls: 'row center tametag', n: 'tameTag' });
    this.tTagText = text(this.tTag, '', 26, [1, 1, 1, 1]);
    const g = this.tBar = R(r, { a: [0.5, 1], p: [0, -172], sz: [295, 22], pv: [0.5, 0.5], spr: 'Game/UI_Gauge_BG01_1', col: [0.031, 0.118, 0.188, 1], sl: true });
    this.tFill = R(g, { a: [0, 0, 0, 1], p: [2, 0], sz: [291, -4], pv: [0, 0.5], spr: 'Game/UI_Gauge_EnemyHP', sl: true });
    this.tNum = document.createElement('div'); this.tNum.className = 'cbt-num'; g.appendChild(this.tNum);
    r.hidden = true;
  }
  showTarget(m, degreeOf) {
    const r = this.targetEl;
    if (!m || m.dead) { r.hidden = true; r.dataset.id = ''; return; }
    r.hidden = false;
    if (r.dataset.id !== m.def.id) {
      r.dataset.id = m.def.id; this.tImg.src = assetUrl('img/sl/' + m.def.model + '.webp');
      this.tName.textContent = m.def.name; this.tLv.textContent = 'LV.' + m.def.level;
    }
    const tame = degreeOf ? degreeOf(m) >= 2 : false;
    if (this.tTag.dataset.k !== String(tame)) {
      this.tTag.dataset.k = String(tame); this.tTagText.textContent = L(tame ? 'tame.tag.tame' : 'tame.tag.untamed');
      this.tTagText.style.color = tame ? 'rgb(150,240,140)' : 'rgb(215,222,226)';
    }
    this.tFill.style.width = 291 * Math.max(0, m.hp / m.maxHp) + 'px';
    this.tNum.textContent = Math.ceil(m.hp) + ' / ' + m.maxHp;
  }

  // mỗi khung: thẻ theo đầu slime
  frame(cam, list) {
    const s = this.hud.s, v = this.v;
    this.world.hidden = !!state.modal; this.top.style.visibility = state.modal ? 'hidden' : '';
    for (const m of list) {
      const t = this.tag(m);
      t.el.style.opacity = m.dead || m.trapped ? '0' : '1';
      if (m.dead || m.trapped) continue;
      v.set(m.object.position.x, m.object.position.y + (m.height || 0.8) + 0.4, m.object.position.z).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      t.el.style.visibility = vis ? '' : 'hidden';
      t.el.style.left = ((v.x + 1) / 2 * innerWidth / s) + 'px';
      t.el.style.bottom = ((v.y + 1) / 2 * innerHeight / s) + 'px';
      t.fill.style.width = 146 * Math.max(0, m.hp / m.maxHp) + 'px';
    }
    for (const b of this.bubbles || []) {
      if (!b.obj) continue;
      v.set(b.obj.position.x, b.obj.position.y + (b.h || 1.8) + 0.9, b.obj.position.z).project(cam);
      b.el.style.left = ((v.x + 1) / 2 * innerWidth / s) + 'px';
      b.el.style.bottom = ((v.y + 1) / 2 * innerHeight / s) + 'px';
    }
  }

  // ---- bóng thoại trên đầu (5:33 Rudga, 6:36 Martin): khung trắng bo góc chữ tối
  bubble(obj, h, msg, sec = 3) {
    this.bubbles = this.bubbles || [];
    const el = R(this.world, { n: 'bubble', a: [0, 0], auto: true, pv: [0.5, 0], cls: 'cbt-fade' });
    const b = document.createElement('div'); b.className = 'cbt-bubble txt'; b.textContent = msg; el.appendChild(b);
    el.dataset.text = msg;
    const rec = { el, obj, h };
    this.bubbles.push(rec);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.remove(); this.bubbles = this.bubbles.filter(x => x !== rec); }, 400); }, sec * 1000);
    return el;
  }

  // ---- đấu tay đôi
  // băng TEAM A vs TEAM B (PVPvs)
  versus(nameA, nameB, sec) {
    const root = R(this.top, { n: 'pvpVs', a: [0, 0, 1, 1], cls: 'cbt-vs cbt-fade' });
    R(root, { a: [0, 0, 1, 1], sz: [200, 0], spr: 'Common/Ui_Bg_Rectangle_01_16px', col: DARK });
    const team = (x, title, name) => {
      const l = R(root, { a: [0.5, 0.5], p: [x, -15], auto: true, pv: [0.5, 0.5], cls: 'col center' });
      l.style.gap = '24px';
      text(l, title, 52, [1, 1, 1, 1], 'outline vtitle');
      const pill = F(l, null, 64, { spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: DARK, sl: true, cls: 'row center vsname' });
      text(pill, name, 30, [1, 1, 1, 1]);
    };
    team(-450, 'TEAM A', nameA); team(450, 'TEAM B', nameB);
    R(root, { a: [0.5, 0.5], sz: [179, 172], spr: 'Game/UI_PVP_Versus' });
    setTimeout(() => { root.style.opacity = '0'; setTimeout(() => root.remove(), 400); }, sec * 1000);
    return root;
  }
  // 3-2-1 / Start (PVP321Start); kích thước theo ảnh gốc
  countdown(key) {
    const old = this.top.querySelector('[data-hud="pvpCount"]'); if (old) old.remove();
    const el = document.createElement('img'); el.className = 'u cbt-pop'; el.dataset.hud = 'pvpCount'; el.dataset.k = key;
    el.crossOrigin = 'anonymous'; el.src = assetUrl('ui/Game/UI_PVP_' + key + '.webp');
    Object.assign(el.style, { left: '50%', top: '42%', transform: 'translate(-50%,-50%)' });
    this.top.appendChild(el);
    setTimeout(() => el.remove(), 900);
    return el;
  }
  result(win) {
    const el = document.createElement('img'); el.className = 'u cbt-pop'; el.dataset.hud = 'pvpResult'; el.dataset.k = win ? 'Win' : 'Lose';
    el.crossOrigin = 'anonymous'; el.src = assetUrl('ui/Game/UI_PVP_' + (win ? 'Win' : 'Lose') + '.webp');
    Object.assign(el.style, { left: '50%', top: '40%', transform: 'translate(-50%,-50%)' });
    this.top.appendChild(el);
    return el;
  }
  // thanh trên cùng 5:24: [Lv2 tên | ô người | ô slime]  TEAM A  [04:59]  TEAM B  [ô slime | ô người | Rudga], dưới mỗi bên "1/1"
  topBar(a, b) {
    this.closeTopBar();
    const root = this.bar = R(this.top, { n: 'pvpTopBar', a: [0.5, 1], p: [0, -14], sz: [1400, 150], pv: [0.5, 1] });
    const side = (x, d, team, flag) => {
      const t = R(root, { a: [0.5, 1], p: [x, -14], auto: true, pv: [0.5, 1] }); text(t, team, 22, [1, 1, 1, 1], 'outline');
      const pill = R(root, { a: [0.5, 1], p: [x, -42], sz: [d.left ? 430 : 300, 72], pv: [0.5, 1], spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: DARK, sl: true, cls: 'row center' });
      pill.style.gap = '6px'; pill.style.flexDirection = d.left ? 'row' : 'row-reverse';
      const info = F(pill, null, 40, { cls: 'row center' }); info.style.gap = '10px';
      if (d.left) { text(info, 'Lv' + d.level, 26, [0.8, 0.95, 1, 1]); }
      text(info, d.name, 23, [1, 1, 1, 1]);
      for (const src of [d.player, d.slime]) {
        const s = F(pill, 56, 56, { spr: 'Common/Ui_Bg_Round_02_264px', col: SLOT, sl: true });
        if (src instanceof HTMLCanvasElement) { const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d').drawImage(src, 0, 0, 64, 64); c.style.cssText = 'position:absolute;inset:-4px;width:64px;height:64px'; s.appendChild(c); }
        else if (src) { const i = R(s, { tag: 'img', a: [0.5, 0.5], sz: [64, 64] }); i.crossOrigin = 'anonymous'; i.src = src; }
      }
      const n = R(root, { a: [0.5, 1], p: [x + (d.left ? 40 : -10), -122], sz: [90, 34], pv: [0.5, 1], spr: 'Common/Ui_Bg_Round_01_40px', col: flag, sl: true, cls: 'center' });
      d.alive = text(n, '1/1', 22, [1, 1, 1, 1]);
      return d;
    };
    this.barA = side(-300, { ...a, left: true }, 'TEAM A', [0.16, 0.5, 0.95, 0.95]);
    this.barB = side(300, { ...b, left: false }, 'TEAM B', [0.92, 0.25, 0.32, 0.95]);
    const tm = R(root, { a: [0.5, 1], p: [0, -48], sz: [170, 60], pv: [0.5, 1], spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: DARK, sl: true, cls: 'center' });
    this.timer = text(tm, '00:00', 30, [1, 1, 1, 1]);
    return root;
  }
  setTimer(sec) { if (this.timer) { const s = Math.max(0, Math.ceil(sec)); this.timer.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); } }
  setAlive(aAlive, bAlive) { if (this.barA) this.barA.alive.textContent = (aAlive ? 1 : 0) + '/1'; if (this.barB) this.barB.alive.textContent = (bAlive ? 1 : 0) + '/1'; }
  closeTopBar() { if (this.bar) { this.bar.remove(); this.bar = null; this.barA = this.barB = null; this.timer = null; } }

  // LogUITitle (fs41): "Roasted\nLv2" chèn vào cột log của js/ui/story.js
  logTitle(story, msg) {
    const w = document.createElement('div'); w.className = 'f logline cbt-title'; w.dataset.hud = 'log'; w.dataset.text = msg.replace('\n', ' ');
    text(w, msg, 41, [1, 1, 1, 1], 'outline');
    story.logRoot.appendChild(w);
    setTimeout(() => { w.classList.add('out'); setTimeout(() => w.remove(), 500); }, 4200);
  }
}
