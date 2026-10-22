// Giao diện của chuỗi nhiệm vụ: hội thoại (DialogueUI + ChoicePopup + DialogueIllust), băng chữ QuestStart / QuestComplete /
// LevelUpPrefab, LogUI ("User EXP + 40"), tên bản đồ khi vào, nhật ký nhiệm vụ (QuestUI, J), Tiềm năng (PerkUI, K),
// quầy hàng (BuyShopUI + BuyItemPopup), popup Notice. Dựng trong #hud (đơn vị canvas Unity, scale s như HUD).
// - Hội thoại, băng chữ, log: số RectTransform chép từ prefab ui/prefab/ui_view__DialogueUI.json, ui_popup__ChoicePopup.json,
//   ui_play__QuestStart.json, ui_play__QuestComplete.json, ui_objects__LevelUpPrefab.json, ui_objects__LogUICommon.json.
// - Bảng toàn màn (QuestUI, PerkUI, BuyShopUI) bố cục lồng nhiều layout group không có trong JSON (bẫy 11 ARCH.md), nên
//   đặt theo khung hình [ĐO TRONG ẢNH]: X(px) với px đo trên ảnh 1280x720 (q1.png: K = 1.875; clip 3:57, 10:39: K = 2).
import * as THREE from 'three';
import { R, F, text, css, C } from './hud.js?v=20261022c';
import { paint, uiUrl, used } from './sprites.js?v=20261022c';
import { assetUrl } from '../assets.js?v=20261022c';
import { state, set } from '../state.js?v=20261022c';
import { L } from '../../data/quest_text.js?v=20261022c';
import { DIALOGUE, NPC_ART, NPC_THUMB, TUTORIALS, QUEST, SHOP, PERKS, BAG_SLOTS, ITEM_ICON } from '../quest/data.js?v=20261022c';

const NAVY = [0.09, 0.27, 0.42, 1], NAVY2 = [0.16, 0.38, 0.56, 1], ORANGE = '#ff8a2a';   // TMP màu chữ; cam [ĐO TRONG ẢNH] 2:24 "healed"
const TYPE_CPS = 40;              // [ĐỀ XUẤT] chữ/giây của TypewriterByCharacter (giá trị trên prefab không có trong JSON)
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// "<o>chữ</o>" -> [{ s, o }]
function segs(str) {
  const out = []; const re = /<o>(.*?)<\/o>/gs; let i = 0, m;
  while ((m = re.exec(str))) { if (m.index > i) out.push({ s: str.slice(i, m.index), o: false }); out.push({ s: m[1], o: true }); i = re.lastIndex; }
  if (i < str.length) out.push({ s: str.slice(i), o: false });
  return out;
}
function rich(el, str, n = Infinity) {          // n = số ký tự hiện (typewriter)
  let left = n, h = '';
  for (const g of segs(str)) {
    if (left <= 0) break;
    const s = g.s.slice(0, left); left -= g.s.length;
    h += g.o ? `<span style="color:${ORANGE}">${esc(s).replace(/\n/g, '<br>')}</span>` : esc(s).replace(/\n/g, '<br>');
  }
  el.innerHTML = '<span class="rt">' + h + '</span>';   // một khối: khung chữ là flex, nút chữ rời sẽ thành mục flex riêng (mất dấu cách)
}
const plainLen = str => segs(str).reduce((a, g) => a + g.s.length, 0);
const img = (parent, src, o = {}) => {
  const e = R(parent, { ...o, tag: 'img' }); e.draggable = false; e.alt = ''; e.crossOrigin = 'anonymous';
  e.onerror = () => (window.__wosErrors = window.__wosErrors || []).push('story image load failed: ' + src);
  e.src = /^img\//.test(src) ? assetUrl(src) : src; return e;
};
const fmt = n => n.toLocaleString('en-US');

// đặt theo ảnh: (x, y) góc trái trên, (w, h) cỡ, đơn vị px ảnh 1280x720; ar = neo mép phải, ac = neo giữa
function X(parent, K, x, y, w, h, o = {}) {
  const e = document.createElement(o.tag || 'div'); e.className = 'u' + (o.cls ? ' ' + o.cls : '');
  const s = e.style;
  s.left = o.ar ? `calc(100% - ${(1280 - x) * K}px)` : o.ac ? `calc(50% + ${(x - 640) * K}px)` : x * K + 'px';
  s.top = o.ab ? `calc(100% - ${(720 - y) * K}px)` : o.am ? `calc(50% + ${(y - 360) * K}px)` : y * K + 'px';
  if (w != null) s.width = w * K + 'px'; if (h != null) s.height = h * K + 'px';
  if (o.spr) paint(e, o.spr, { color: o.col, sliced: o.sl });
  if (o.n) e.dataset.hud = o.n;
  parent.appendChild(e); return e;
}
// Popup_01_Medium / Popup_01_Small có lề trong suốt (bóng) quanh thân: alpha bbox (60,40)-(762,518) / (60,40)-(900,677).
// Viền sliced vẽ 1:1 đơn vị canvas nên lề = số px nguồn. panel() nhận (x, y, w, h) là THÂN THẤY ĐƯỢC trong ảnh và trả lớp
// nội dung đặt đúng thân đó.
const MARGIN = { 'Container/Popup_01_Medium': [60, 40, 60, 62], 'Container/Popup_01_Small': [60, 40, 60, 63] };
function panel(parent, K, x, y, w, h, spr, o = {}) {
  const [l, t, r, b] = MARGIN[spr].map(v => v / K);
  const outer = X(parent, K, x - l, y - t, w + l + r, h + t + b, { ...o, spr, sl: true });
  return X(outer, K, l, t, w, h, {});
}
function T(parent, str, size, color = [1, 1, 1, 1], cls = '') {   // chữ có <o>
  const e = document.createElement('span'); e.className = 'txt ' + cls; e.style.fontSize = size + 'px'; e.style.color = css(color);
  rich(e, str); parent.appendChild(e); return e;
}

export class Story {
  constructor(hud, { renderer, onModal } = {}) {
    this.hud = hud; this.renderer = renderer; this.onModal = onModal || (() => {});
    const host = hud.root;
    this.fx = R(host, { a: [0, 0, 1, 1], n: 'storyFx', cls: 'story-fx' });
    this.layer = R(host, { a: [0, 0, 1, 1], n: 'storyUi', cls: 'story-ui' });
    this.queue = []; this.fxBusy = false; this.logs = [];
    this.modalStack = [];
    this.buildLog();
    addEventListener('keydown', e => this.key(e), true);
    this.engine = null;
  }

  // ---------------------------------------------------------------- modal
  pushModal(name, el, onKey) {
    this.modalStack.push({ name, el, onKey });
    this.fx.classList.add('modal');   // băng chữ ẩn dưới bảng/hội thoại (log trái vẫn hiện, như 10:45)
    set({ modal: name }); this.onModal(name);
  }
  popModal(name) {
    const i = this.modalStack.findLastIndex(m => m.name === name);
    if (i < 0) return;
    const [m] = this.modalStack.splice(i, 1); m.el.remove();
    const top = this.modalStack[this.modalStack.length - 1];
    set({ modal: top ? top.name : null }); this.onModal(top ? top.name : null);
    if (!top) this.fx.classList.remove('modal');
    // đợi một nhịp: bảng mở ngay sau khi khung thoại đóng (Tiềm năng, quầy) phải chặn băng chữ như clip 3:54-4:00
    if (!top) setTimeout(() => this.flush(), 60);
  }
  key(e) {
    const top = this.modalStack[this.modalStack.length - 1];
    if (!top) {
      if (e.code === 'KeyJ' && !e.repeat) { e.stopPropagation(); this.openQuestLog(); }
      else if (e.code === 'KeyK' && !e.repeat) { e.stopPropagation(); this.openPerk(); }
      return;
    }
    e.stopPropagation(); if (e.code === 'Space' || e.code === 'Tab' || /^Arrow/.test(e.code)) e.preventDefault();
    if (e.repeat) return;
    top.onKey && top.onKey(e);
  }

  // ---------------------------------------------------------------- hội thoại
  // mở hội thoại từ node `start`; ctx = { npc, box, act(cmd) -> nodeId | undefined } ; trả Promise khi đóng
  talk(start, ctx) {
    return new Promise(done => {
      const D = this.buildDialogue();
      const st = { node: null, n: 0, full: 0, timer: null, sel: 0, choices: null, ctx, done, D, waitingAfter: [] };
      this.dlg = st;
      this.pushModal('dialogue', D.root, e => {
        if (e.code === 'ControlLeft') this.skip();
        else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') this.advance();
        else if (st.choices && (e.code === 'ArrowUp' || e.code === 'KeyW')) this.hl(st.sel - 1);
        else if (st.choices && (e.code === 'ArrowDown' || e.code === 'KeyS')) this.hl(st.sel + 1);
        else if (e.code === 'Escape' && st.choices) this.choose(st.choices.length - 1);
      });
      this.capture(D, ctx);
      this.show(start);
    });
  }
  buildDialogue() {
    const root = R(this.layer, { a: [0, 0, 1, 1], n: 'dialogue', cls: 'dlg' });
    R(root, { a: [0, 0, 1, 0], sz: [0, 400], pv: [0.5, 0], spr: 'Common/Ui_Gradient_Vertical_01', col: [0.632, 0.632, 0.632, 0.561] });
    const D = { root };
    const np = R(root, { a: [0, 0, 0.35, 0.65], sz: [400, 0], n: 'npcPortrait' });
    D.portrait = R(np, { a: [0, 0, 1, 1], p: [0, -375], sz: [0, 750], tag: 'img', cls: 'portrait' });
    D.portrait.draggable = false; D.portrait.alt = '';
    D.illust = R(root, { a: [0, 1, 1, 1], p: [0, -150], sz: [0, 540], pv: [0.5, 1], spr: 'Common/Ui_Bg_Rectangle_01_16px', col: [0.11, 0.13, 0.14, 0.78], n: 'dialogueIllust' });
    D.illustImg = R(D.illust, { a: [0.5, 0.5], p: [0, 35], sz: [1046, 418], tag: 'img', cls: 'illustimg' });
    const tl = R(D.illust, { a: [0.5, 1], p: [0, -12], sz: [447, 96.77], pv: [0.5, 1], spr: 'Common/Popup_Title_01', cls: 'center' });
    D.illustTitle = text(tl, '', 32); D.illustTitle.style.marginTop = '-12px';
    D.illustDesc = R(D.illust, { a: [0, 0.5, 1, 0.5], p: [0, -190], sz: [-500, 120], cls: 'center illustdesc' });
    D.illust.hidden = true;
    const skip = R(root, { a: [1, 1], p: [-160, -140], sz: [80, 80], spr: 'Common/Btn_Square_07', cls: 'btn', n: 'dialogueSkip' });
    R(skip, { a: [0.5, 0.5], sz: [50, 50], spr: 'Icon/Icon_Skip' });
    if (this.hud.pc) R(skip, { a: [1, 0], p: [-6, 6], sz: [32, 32], spr: 'resources/Common/key_LeftCtrl' });
    skip.addEventListener('pointerdown', e => { e.stopPropagation(); this.skip(); });
    const bub = D.bubble = R(root, { a: [0.24, 0.06, 0.76, 0.06], sz: [-40, 267], pv: [0.5, 0], n: 'bubble' });
    const nm = R(bub, { a: [0, 1], p: [0, -4], sz: [380, 380], pv: [0, 0], cls: 'rtmask' });
    D.npcRt = R(nm, { a: [0.5, 0.5], p: [0, -88], sz: [360, 360], tag: 'canvas' });
    const pm = R(bub, { a: [1, 1], p: [0, -4], sz: [380, 380], pv: [1, 0], cls: 'rtmask' });
    D.plRt = R(pm, { a: [0.5, 0.5], p: [0, -88], sz: [360, 360], tag: 'canvas' });
    D.normal = R(bub, { a: [0, 0, 1, 1], p: [0, -2], cls: 'frame' });
    D.name = R(bub, { a: [0, 1], p: [40, -36.93], pv: [0, 0], auto: true, cls: 'namepill' });
    D.nameBg = paint(D.name, 'Common/Ui_Bg_Rectangle_Round_05_Medium', { color: [0.04, 0.18, 0.29, 1], sliced: true });
    D.nameText = text(D.name, '', 36);
    D.tw = R(bub, { a: [0, 0, 1, 1], sz: [-220, -80], cls: 'tw' });
    D.tw.dataset.hud = 'dialogueText';
    const ab = D.arrow = R(bub, { a: [1, 0], p: [-45, 30], sz: [76, 68], pv: [1, 0], spr: 'DialogueUI/Dialogue_Arrowbase' });
    R(ab, { a: [1, 0], p: [0, 5], sz: [76, 68], pv: [1, 0], spr: 'DialogueUI/Dialogue_Arrow', cls: 'bob' });
    if (this.hud.pc) R(ab, { a: [0.5, 0.5], p: [38.9, 36], sz: [32, 32], spr: 'resources/Common/key_Spacebar' });
    D.choices = R(root, { a: [1, 0], p: [-320, 440], pv: [0.5, 0.5], auto: true, cls: 'choices', n: 'choices' });
    root.addEventListener('pointerdown', e => { if (e.button === 0) this.advance(); });
    return D;
  }
  // chibi người nói + người chơi trên mép khung thoại (RenderTexture của NPCRenderTextureMask / PlayerRenderTextureMask)
  capture(D, ctx) {
    try {
      if (ctx.npcObject) snapshot(this.renderer, ctx.npcObject, D.npcRt, ctx.npcHeight);
      else D.npcRt.hidden = true;
      // b1.png: hộp (không có người nói) thì không có chibi người chơi
      if (ctx.playerObject && ctx.npcObject) snapshot(this.renderer, ctx.playerObject, D.plRt, ctx.playerHeight);
      else D.plRt.hidden = true;
    } catch (e) { (window.__wosErrors = window.__wosErrors || []).push('dialogue snapshot: ' + e.message); }
  }
  show(id) {
    const st = this.dlg, D = st.D;
    if (!id) return this.closeDialogue();
    const node = DIALOGUE[id];
    if (!node) { (window.__wosErrors = window.__wosErrors || []).push('dialogue node not found: ' + id); return this.closeDialogue(); }
    st.id = id; st.node = node;
    if (node.act) { const r = st.ctx.act(node.act, id); if (r && r !== id) return this.show(r); }
    const dark = node.style === 'dark';
    const who = node.sp === 'box' ? L('box.name') : node.sp;
    D.root.dataset.speaker = who; D.root.dataset.node = id;
    D.normal.querySelectorAll('.spr').forEach(x => x.remove());
    paint(D.normal, 'DialogueUI/Dialogue_Frame_Round', { color: dark ? [0.08, 0.12, 0.13, 0.8] : [0.9, 0.93, 0.98, 0.8], sliced: true });
    D.tw.style.color = css(dark ? [1, 1, 1, 1] : NAVY);
    D.tw.classList.toggle('dark', dark);
    D.nameText.textContent = who;
    const art = NPC_ART[node.sp];
    D.portrait.hidden = !art;
    if (art && D.portrait.dataset.src !== art) { D.portrait.dataset.src = art; D.portrait.crossOrigin = 'anonymous'; D.portrait.src = assetUrl(art); }
    const tut = node.illust && TUTORIALS[node.illust];
    D.illust.hidden = !tut;
    if (tut) { D.illustImg.src = assetUrl(tut.img); D.illustTitle.textContent = L(tut.title); D.illustDesc.innerHTML = ''; T(D.illustDesc, L(tut.desc), 34); }   // prefab 28; khung 1:42 chữ cao ~17 px ở 720p -> 34 [ĐO TRONG ẢNH]
    st.line = L(node.t || id, { name: state.player.name, cost: st.ctx.cost });
    st.full = plainLen(st.line); st.n = 0; st.choices = null;
    D.choices.innerHTML = ''; D.choices.hidden = true; D.arrow.hidden = true;
    clearInterval(st.timer);
    const t0 = performance.now();
    st.timer = setInterval(() => {
      st.n = Math.min(st.full, Math.floor((performance.now() - t0) / 1000 * TYPE_CPS) + 1);
      rich(D.tw, st.line, st.n);
      if (st.n >= st.full) this.lineDone();
    }, 30);
    rich(D.tw, st.line, 0);
  }
  lineDone() {
    const st = this.dlg, D = st.D;
    clearInterval(st.timer); st.timer = null; st.n = st.full; rich(D.tw, st.line);
    D.arrow.hidden = false;   // h2.png: mũi tên vẫn hiện khi có lựa chọn
    if (st.node.choices) this.showChoices(st.node.choices);
  }
  showChoices(list) {
    const st = this.dlg, D = st.D;
    st.choices = list; D.choices.innerHTML = ''; D.choices.hidden = false;
    list.forEach((c, i) => {
      const b = F(D.choices, 500, 80, { cls: 'choice btn' });
      b.dataset.i = i; b.dataset.hud = 'choice';
      b.sprU = paint(b, 'DialogueUI/Dialogue_List_Unpressed', { sliced: true });
      b.sprP = paint(b, 'DialogueUI/Dialogue_List_Pressed', { sliced: true });
      const ic = { before: 'Icon/quest_marker_before', progress: 'Icon/quest_marker_progress', complete: 'Icon/quest_marker_complete',
        heal: 'DialogueUI/Dialogue_Icon_Heal', buy: 'DialogueUI/Dialogue_Icon_BuyShop', sell: 'DialogueUI/Dialogue_Icon_SellShop',
        talk: 'DialogueUI/Dialogue_Icon_Normal', exit: 'DialogueUI/Dialogue_Icon_Exit' }[c.icon] || 'DialogueUI/Dialogue_Icon_Normal';
      const big = /^(before|progress|complete)$/.test(c.icon);
      F(b, 8, 1); const icn = F(b, 50, big ? 62 : 50, { spr: ic }); icn.style.margin = '0 10px 0 12px';
      const tx = text(b, L(c.t, { name: state.player.name }), 27); tx.dataset.hud = 'choiceText';
      b.addEventListener('pointerdown', e => { e.stopPropagation(); this.choose(i); });
      b.addEventListener('pointerenter', () => this.hl(i));
    });
    this.hl(0);
  }
  hl(i) {
    const st = this.dlg; if (!st || !st.choices) return;
    st.sel = (i + st.choices.length) % st.choices.length;
    [...st.D.choices.children].forEach((b, k) => { b.classList.toggle('sel', k === st.sel); b.sprP.style.opacity = k === st.sel ? '1' : '0'; b.sprU.style.opacity = k === st.sel ? '0' : '1'; });
  }
  choose(i) {
    const st = this.dlg; if (!st || !st.choices) return;
    const c = st.choices[i]; st.choices = null;
    let to = c.to;
    if (c.act) { const r = st.ctx.act(c.act, st.id); if (r) to = r; }
    if (this.dlg !== st) return;
    this.show(to);
  }
  advance() {
    const st = this.dlg; if (!st) return;
    if (st.timer) return this.lineDone();
    if (st.choices) return this.choose(st.sel);
    this.show(st.node.next);
  }
  // DialogueSkip (LCtrl): chạy thẳng tới dòng có lựa chọn kế tiếp (hành động trên đường vẫn chạy), không có thì đóng
  skip() {
    const st = this.dlg; if (!st) return;
    let guard = 40;
    while (guard-- > 0 && this.dlg === st) {
      if (st.timer) this.lineDone();
      if (st.node.choices || !st.node.next) break;
      this.show(st.node.next);
    }
    if (this.dlg === st && !st.node.choices) this.closeDialogue();
  }
  closeDialogue() {
    const st = this.dlg; if (!st) return;
    clearInterval(st.timer); this.dlg = null;
    this.popModal('dialogue');
    st.done();
  }

  // ---------------------------------------------------------------- băng chữ + log
  // việc hiệu ứng xếp hàng, chạy khi không có bảng nào mở (clip: băng hiện sau khi khung thoại đóng)
  enqueue(fn, ms) { this.queue.push({ fn, ms }); this.flush(); }
  flush() {
    if (this.fxBusy || state.modal || !this.queue.length) return;
    const { fn, ms } = this.queue.shift();
    this.fxBusy = true;
    const el = fn();
    // băng sau chỉ hiện khi băng trước mờ hết (0.4 s), không chồng nhau
    setTimeout(() => { if (el) el.classList.add('out'); setTimeout(() => { if (el) el.remove(); this.fxBusy = false; this.flush(); }, el ? 400 : 0); }, ms);
  }
  questStart(q) {     // ui_play__QuestStart
    this.enqueue(() => {
      const root = R(this.fx, { a: [0, 0, 1, 1], n: 'questStart', cls: 'banner' });
      root.dataset.title = L(q.title);
      const box = R(root, { a: [0, 1, 1, 1], p: [0, -240], sz: [0, 160] });
      const tl = R(box, { a: [0, 1, 1, 1], p: [0, -48.5], cls: 'center' }); text(tl, L(q.title), 65, [1, 1, 1, 1], 'bannertxt');
      const deco = R(box, { a: [0, 1, 1, 1], p: [0, -95], sz: [0, 3], cls: 'row center' }); deco.style.gap = '10px';
      F(deco, 300, 3, { spr: 'Common/Ui_Bg_Rectangle_01_16px', col: [1, 1, 1, 0.39] }); F(deco, 20, 18, { spr: 'Common/Popup_Bg_Symbol_02', col: [1, 1, 1, 0.59] });
      F(deco, 300, 3, { spr: 'Common/Ui_Bg_Rectangle_01_16px', col: [1, 1, 1, 0.39] });
      const grp = R(box, { a: [0.5, 0.5], p: [0, -49.7], sz: [1350.6, 0], cls: 'row center' }); grp.style.gap = '10px';
      F(grp, 60, 60, { spr: q.town }); text(grp, L(q.group), 40, [1, 1, 1, 1], 'bannertxt');
      return root;
    }, 2600);
  }
  questComplete(q) {  // ui_play__QuestComplete
    this.enqueue(() => {
      const root = R(this.fx, { a: [0.5, 0.5], p: [0, 280], sz: [1600, 190], n: 'questComplete', cls: 'banner' });
      root.dataset.title = L(q.title);
      this.ribbon(root, true);
      const c = R(root, { a: [0.5, 0.5], p: [0, 120], sz: [230, 219] });
      R(c, { a: [0.5, 0.5], p: [0, 3.8], sz: [158, 150], pv: [0.5, 0.42], spr: 'Levelup/Ui_LevelUp_Icon_03' });
      const t1 = R(c, { a: [0.5, 0.5], p: [0, -82], sz: [600, 70], cls: 'center' }); text(t1, L('ui.questComplete'), 28, [0.6, 1, 1, 1], 'bannertxt');
      // ContentsText prefab ghi 28 nhưng khung 4:18 thấy chữ tên cao gấp đôi dòng "Quest complete!": 56 [ĐO TRONG ẢNH]
      const t2 = R(c, { a: [0.5, 0.5], p: [0, -137], sz: [1300, 70], cls: 'center' }); text(t2, L(q.title), 56, [1, 1, 1, 1], 'bannertxt');
      return root;
    }, 2600);
  }
  levelUp(lv) {       // ui_objects__LevelUpPrefab
    this.enqueue(() => {
      const root = R(this.fx, { a: [0.5, 0.5], p: [0, 280], sz: [1600, 190], n: 'levelUp', cls: 'banner' });
      root.dataset.level = String(lv);
      this.ribbon(root, false);
      const c = R(root, { a: [0.5, 0.5], p: [0, 120], sz: [230, 219] });
      const ic = R(c, { a: [0.5, 0.5], p: [0, -17.6], sz: [230, 220], pv: [0.5, 0.42], spr: 'Levelup/Ui_LevelUp_Icon_01' });
      R(ic, { a: [0, 0, 1, 1], spr: 'Levelup/Ui_LevelUp_Icon_02' });
      const lt = R(ic, { a: [0.5, 0.5], p: [0, -9.7], sz: [265, 252], cls: 'center' }); text(lt, String(lv), 64, [1, 1, 1, 1], 'bannertxt');
      R(c, { a: [0.5, 0.5], p: [0, -110], sz: [300, 106], spr: 'Levelup/Ui_LevelUp_Text' });
      const t = R(c, { a: [0.5, 0.5], p: [0, -171], sz: [600, 70], cls: 'center' }); text(t, L('ui.sp'), 28, [1, 1, 1, 1], 'bannertxt');
      return root;
    }, 2600);
  }
  ribbon(root, top) {  // BgLeft + BgRight (một nửa lật gương) Ui_LevelUp_Bg 800x300
    const bg = R(root, { a: [0, 0, 1, 1] });
    for (const m of [1, -1]) {
      const b = R(bg, { a: top ? [0.5, 1] : [0.5, 0.5], sz: [800, 300], pv: [0, top ? 1 : 0.5], spr: 'Levelup/Ui_LevelUp_Bg', sl: true });
      if (m < 0) { b.style.transformOrigin = '0 50%'; b.style.transform = 'scaleX(-1)'; }
    }
  }
  // tên bản đồ khi vào (v9.png: giấy cuộn + biểu tượng Larus + bút lông, hai vạch, chữ lớn) [ĐO TRONG ẢNH]
  // tên bản đồ khi vào: ui_play__MapTextLayout (1500x520 neo đỉnh): giấy 285x170 + biểu tượng thị trấn + bút, hai vạch,
  // chữ fs90 ở -350. PaperBg là sprite chưa xuất (cab ref) nên vẽ bằng gradient xanh theo v9.png [ĐỀ XUẤT]; vị trí giấy (-206)
  // và cỡ biểu tượng (200) [ĐO TRONG ẢNH] v9.png vì VerticalLayoutGroup không ghi trong JSON.
  placeTitle(name) {
    this.enqueue(() => {
      const root = R(this.fx, { a: [0.5, 1], sz: [1500, 520], pv: [0.5, 1], n: 'placeTitle', cls: 'banner' });
      root.dataset.title = name;
      const paper = R(root, { a: [0.5, 1], p: [0, -206], sz: [285, 170], cls: 'paper' });
      R(paper, { a: [0, 0, 1, 1], spr: 'MapText/UI_Map_Reveal_Paper_Outline', col: [0.75, 0.95, 1, 1], sl: true });
      R(paper, { a: [0.5, 0.5], p: [0, 2], sz: [200, 200], spr: 'Town/Town_Larus' });
      R(paper, { a: [0, 0], p: [220.5, 26.6], sz: [58, 124], pv: [0, 0], spr: 'MapText/UI_Map_Reveal_Pen' });
      R(root, { a: [0.5, 1], p: [-320, -277.4], sz: [300, 3], spr: 'Common/Ui_Bg_Rectangle_01_16px', col: [0.64, 0.98, 0.94, 1], cls: 'pline' });
      R(root, { a: [0.5, 1], p: [320, -277.4], sz: [300, 3], spr: 'Common/Ui_Bg_Rectangle_01_16px', col: [0.64, 0.98, 0.94, 1], cls: 'pline' });
      const tl = R(root, { a: [0.5, 1], p: [0, -350], cls: 'center' }); text(tl, name, 90, [1, 1, 1, 1], 'placetxt');
      return root;
    }, 2400);
  }
  buildLog() {        // LogRoot (0,0.5) (38,70) rộng 550, pivot (0,1): dòng mới xếp xuống dưới
    this.logRoot = R(this.fx, { a: [0, 0.5], p: [38, 70], sz: [550, 0], pv: [0, 1], n: 'logRoot', cls: 'logroot' });
  }
  log(title, value, icon) {   // ui_objects__LogUICommon: [icon] Title + Value
    const run = () => {
      const w = document.createElement('div'); w.className = 'f logline'; w.dataset.hud = 'log';
      paint(w, 'ui_objects/ui_gradient_01/ui_gradient_01', { color: [0, 0, 0, 0.6] });
      if (icon) { const i = F(w, 40, 40, { tag: 'img' }); i.src = assetUrl(icon); i.crossOrigin = 'anonymous'; i.style.objectFit = 'contain'; }
      text(w, title, 26, [0.83, 0.93, 1, 1], 'outline');
      if (value != null) { text(w, value[0], 34, [0.6, 1, 0.88, 1], 'outline'); text(w, value.slice(1), 27, [0.6, 1, 0.88, 1], 'outline'); }
      w.dataset.text = title + (value || '');
      this.logRoot.appendChild(w);
      setTimeout(() => { w.classList.add('out'); setTimeout(() => w.remove(), 500); }, 4200);
    };
    if (state.modal && state.modal !== 'shop') this.queue.push({ fn: () => (run(), null), ms: 0 }); else run();
  }
  // Toast có chân dung NPC (10:45 "Thanks for your purchase!")
  npcToast(thumb, msg) {
    const K = 2;
    const el = X(this.layer, K, 472, 50, 336, 66, { ac: true, spr: 'Common/Ui_Bg_Round_01_54px', col: [0.04, 0.18, 0.29, 0.85], sl: true, cls: 'npctoast row center', n: 'npcToast' });
    const im = X(el, K, -2, -6, 78, 78, { tag: 'img' }); im.src = assetUrl(thumb); im.crossOrigin = 'anonymous'; im.style.objectFit = 'cover'; im.style.borderRadius = '50%';
    const t = X(el, K, 80, 0, 250, 66, { cls: 'center' }); text(t, msg, 30);
    el.dataset.text = msg;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2200);
  }
  toast(msg) { this.hud.toast(msg); }

  // ---------------------------------------------------------------- popup Notice (1:00, 10:45)
  popup({ title, body, buttons }) {
    return new Promise(res => {
      const K = 2;
      const root = R(this.layer, { a: [0, 0, 1, 1], n: 'popup', cls: 'view dimlight' });
      const box = panel(root, K, 418, 190, 444, 330, 'Container/Popup_01_Small', { ac: true, am: true });
      const tp = X(box, K, 104, -2, 236, 64, { spr: 'Common/Popup_Title_01', cls: 'center' }); text(tp, title, 40);
      const bd = X(box, K, 30, 90, 384, 120, { cls: 'center wrap' }); T(bd, body, 30, NAVY2);
      const row = X(box, K, 0, 230, 444, 64, { cls: 'row center' }); row.style.gap = '56px';
      const finish = v => { this.popModal('popup'); res(v); };
      buttons.forEach((b, i) => {
        const btn = F(row, 232, 124, { spr: b.green ? 'Common/Btn_Square_01_Medium_Green' : 'Common/Btn_Square_01_Medium_Blue', cls: 'btn center' });
        btn.dataset.hud = 'popupBtn'; btn.dataset.v = b.v; text(btn, b.t, 42, NAVY);
        btn.addEventListener('pointerdown', e => { e.stopPropagation(); finish(b.v); });
      });
      this.pushModal('popup', root, e => {
        if (e.code === 'Escape') finish(buttons[0].v);
        else if (e.code === 'Space' || e.code === 'Enter') finish(buttons[buttons.length - 1].v);
      });
    });
  }
  notice(body) { return this.popup({ title: L('ui.notice'), body, buttons: [{ t: L('ui.ok'), v: true, green: true }] }); }

  // ---------------------------------------------------------------- khung chung của bảng toàn màn
  view(name, K, title, icon, sub) {
    const root = R(this.layer, { a: [0, 0, 1, 1], n: name, cls: 'view dim' });
    const hdr = X(root, K, 44, 22, 500, 36, { cls: 'row' }); hdr.style.alignItems = 'center'; hdr.style.gap = '14px';
    F(hdr, 30 * K, 30 * K, { spr: icon });
    text(hdr, title + (sub ? ' / ' : ''), 22 * K, [0.74, 0.95, 1, 1]);
    if (sub) text(hdr, sub, 17 * K, [0.74, 0.95, 1, 1]);
    const close = X(root, K, 1195, 18, 62, 45, { ar: true, spr: 'Common/Btn_Square_04_Medium', cls: 'btn', n: 'close' });
    R(close, { a: [0.5, 0.5], p: [5, 0], sz: [27 * K, 27 * K], spr: 'Icon/Icon_Close_Btn' });
    close.addEventListener('pointerdown', e => { e.stopPropagation(); this.popModal(name); });
    return root;
  }

  // ---------------------------------------------------------------- nhật ký nhiệm vụ (J) theo q1.png
  openQuestLog() {
    if (this.modalStack.some(m => m.name === 'questlog')) return;
    const E = this.engine, K = 1.875;
    const root = this.view('questlog', K, L('ui.quest'), 'DialogueUI/Dialogue_Icon_Quest', L('ui.all'));
    // cột phân loại trái (Category_Quest_All / Larus) + phím Q / E
    X(root, K, 41, 103, 32, 48, { spr: 'Category/Category_BG_Top', col: [1, 1, 1, 0.78] }); X(root, K, 43, 111, 28, 28, { spr: 'Category/Category_Quest_AllON' });
    X(root, K, 41, 170, 32, 56, { spr: 'Category/Category_BG_Bottom', col: [1, 1, 1, 0.78] }); X(root, K, 43, 183, 28, 28, { spr: 'Category/Category_Quest_LarusOFF' });
    if (this.hud.pc) { X(root, K, 49, 64, 17, 17, { spr: 'resources/Common/key_Q' }); X(root, K, 49, 234, 17, 17, { spr: 'resources/Common/key_E' }); }
    const tabs = X(root, K, 133, 97, 537, 43, { spr: 'Common/Ui_Bg_Round_02_Medium_54px', col: [0.08, 0.12, 0.13, 0.59], sl: true });
    const list = X(root, K, 133, 164, 537, 500, {});
    const detail = X(root, K, 733, 85, 510, 605, { ar: true, n: 'questDetail' });
    let tab = 'active';
    const draw = () => {
      tabs.innerHTML = ''; list.innerHTML = ''; detail.innerHTML = '';
      paint(tabs, 'Common/Ui_Bg_Round_02_Medium_54px', { color: [0.08, 0.12, 0.13, 0.59], sliced: true });
      [['active', L('ui.inprogress')], ['done', L('ui.complete')]].forEach(([k, label], i) => {
        const t = X(tabs, K, 4 + i * 266, 2, 262, 39, { cls: 'btn center', n: 'questTab' }); t.dataset.tab = k;
        if (tab === k) paint(t, 'Common/Btn_Square_02_Small_Blue', { sliced: true });
        text(t, label, 18 * K, tab === k ? NAVY : [0.9, 0.95, 1, 1]);
        t.addEventListener('pointerdown', e => { e.stopPropagation(); tab = k; draw(); });
      });
      const qs = E.listQuests(tab);
      if (!qs.length) { const em = X(list, K, 0, 120, 537, 40, { cls: 'center' }); text(em, L('ui.none') === 'ui.none' ? '' : '', 18 * K); return; }
      const fold = X(list, K, 0, 0, 537, 35, { spr: 'Common/Ui_Bg_Round_01_54px', col: [0.08, 0.12, 0.13, 0.5], sl: true, cls: 'row' });
      fold.style.alignItems = 'center';
      X(fold, K, 18, 5, 24, 24, { spr: 'Town/Town_Larus' });
      const ft = X(fold, K, 62, 0, 400, 35, { cls: 'row' }); ft.style.alignItems = 'center'; text(ft, L('grp.larus'), 16 * K);
      const fc = X(fold, K, 470, 0, 52, 35, { cls: 'row' }); fc.style.alignItems = 'center'; fc.style.justifyContent = 'flex-end';
      text(fc, (tab === 'done' ? qs.length : 0) + '/' + qs.length, 16 * K);
      qs.forEach((q, i) => {
        const y = 38 + i * 40;
        const row = X(list, K, 20, y, 507, 36, { spr: 'Common/Ui_Bg_Round_01_54px', col: i === 0 ? [0.85, 0.93, 1, 1] : [0.85, 0.93, 1, 0.55], sl: true, cls: 'row', n: 'questRow' });
        row.dataset.q = q.id; row.style.alignItems = 'center';
        if (i === 0) { const ar = X(list, K, 0, y + 10, 14, 16, { spr: 'Icon/Icon_Arrow_Small_Up' }); ar.style.transform = 'rotate(90deg)'; }
        const th = X(row, K, 11, 2, 32, 32, { cls: 'thumbc' });
        const ti = document.createElement('img'); ti.src = assetUrl(NPC_THUMB[q.target] || NPC_THUMB.Allen); ti.crossOrigin = 'anonymous'; th.appendChild(ti);
        const tt = X(row, K, 60, 0, 280, 36, { cls: 'row' }); tt.style.alignItems = 'center'; tt.style.gap = '8px';
        text(tt, L(q.title), 16 * K, NAVY); F(tt, 22 * K, 22 * K, { spr: 'QuestUI/Icon_Quest_Favorites_On' });
        const pr = E.progressOf(q);
        const st = X(row, K, 340, 0, 155, 36, { cls: 'row' }); st.style.alignItems = 'center'; st.style.justifyContent = 'flex-end'; st.style.gap = '26px';
        text(st, tab === 'done' ? L('ui.complete') : L('ui.inprogress'), 16 * K, NAVY2); text(st, pr.done + '/' + pr.need, 16 * K, NAVY);
      });
      const q = qs[0];
      // ô chi tiết (InnerLayout Popup_01_Medium): dải bản đồ + chibi NPC + tên, tên nhiệm vụ, vị trí, mô tả, mục tiêu
      const pan = panel(detail, K, 0, 0, 510, 605, 'Container/Popup_01_Medium');
      const band = X(pan, K, 6, 4, 498, 236, { cls: 'band' });
      const chib = X(band, K, 186, 30, 120, 150, { tag: 'img' }); chib.src = assetUrl(NPC_THUMB[q.target] || NPC_THUMB.Allen); chib.crossOrigin = 'anonymous'; chib.style.objectFit = 'contain';
      const nmp = X(band, K, 214 - 30, 197, 120, 26, { cls: 'center' });
      const pill = document.createElement('span'); pill.className = 'npcpill'; pill.textContent = q.target; pill.style.fontSize = 13 * K + 'px'; nmp.appendChild(pill);
      X(pan, K, 468, 236, 34, 66, { spr: 'QuestUI/UI_Quest_FavoritesFlag' }); X(pan, K, 474, 262, 22, 22, { spr: 'QuestUI/Icon_Quest_Favorites_On' });
      const t1 = X(pan, K, 35, 262, 420, 30, { cls: 'row' }); t1.style.alignItems = 'center'; text(t1, L(q.title), 21 * K, NAVY).dataset.hud = 'questDetailTitle';
      const t2 = X(pan, K, 38, 294, 420, 22, { cls: 'row' }); t2.style.alignItems = 'center'; t2.style.gap = '6px';
      F(t2, 12 * K, 14 * K, { spr: 'QuestUI/Icon_Location', col: [0.47, 0.8, 0.7, 1] }); text(t2, L('map.' + q.map), 16 * K, NAVY);
      X(pan, K, 35, 324, 437, 1, { cls: 'hline' });
      const ds = X(pan, K, 34, 340, 430, 70, { cls: 'qdesc' }); T(ds, L(q.desc || q.objectives[0].text), 15 * K, NAVY2, 'wrapl');
      q.objectives.forEach((o, i) => {
        const ob = X(pan, K, 37, 416 + i * 32, 433, 27, { spr: 'Common/Ui_Bg_Round_01_54px', col: [0.83, 0.92, 1, 1], sl: true, cls: 'row', n: 'questObjective' });
        ob.style.alignItems = 'center';
        const c = E.count(q.id, o.id);
        const tx = X(ob, K, 10, 0, 380, 27, { cls: 'row' }); tx.style.alignItems = 'center'; text(tx, E.objText(q, o), 13 * K, NAVY);
        const dot = X(ob, K, 406, 3, 21, 21, { cls: 'odot' + (c >= o.need || tab === 'done' ? ' on' : '') });
      });
    };
    draw();
    this.pushModal('questlog', root, e => {
      if (e.code === 'Escape' || e.code === 'KeyJ') this.popModal('questlog');
      else if (e.code === 'KeyQ' || e.code === 'KeyE') { tab = tab === 'active' ? 'done' : 'active'; draw(); }
    });
  }

  // ---------------------------------------------------------------- Tiềm năng (K) theo clip 3:54-3:57
  openPerk() {
    if (this.modalStack.some(m => m.name === 'perk')) return;
    const E = this.engine, K = 2, P = PERKS[0];
    const root = this.view('perk', K, L('ui.potential'), 'Game/Btn_PlayScene_Index');
    const spv = X(root, K, 980, 26, 190, 32, { ar: true, cls: 'row' }); spv.style.alignItems = 'center'; spv.style.justifyContent = 'space-between';
    text(spv, L('ui.potential'), 17 * K); const spText = text(spv, '0', 17 * K); spText.dataset.hud = 'perkSP';
    X(root, K, 323, 290, 150, 140, { cls: 'perkglow' });
    const me = X(root, K, 370, 325, 66, 66, { spr: 'PerkUI/Perk_PlayerThumb' });
    const mecv = document.createElement('canvas'); mecv.className = 'perkme'; me.appendChild(mecv);
    try { const src = this.hud.el.playerThumb; mecv.width = src.width; mecv.height = src.height; mecv.getContext('2d').drawImage(src, 0, 0); } catch (e) { /* chưa có chân dung */ }
    X(root, K, 436, 355, 46, 5, { cls: 'perkline' });
    const node = X(root, K, 479, 327, 62, 62, { spr: 'PerkUI/Perk_Skill_Thumb_Bg', cls: 'btn', n: 'perkNode' });
    const nic = document.createElement('img'); nic.src = assetUrl(P.icon); nic.crossOrigin = 'anonymous'; nic.className = 'perkicon'; node.appendChild(nic);
    R(node, { a: [0, 0, 1, 1], sz: [12, 12], spr: 'PerkUI/Perk_Skill_Thumb_Outline' });
    const lvl = X(root, K, 481, 393, 58, 28, { spr: 'Common/Ui_Bg_Round_01_32px', col: [0.04, 0.18, 0.29, 0.9], sl: true, cls: 'center' });
    const lvlText = text(lvl, '', 17 * K); lvlText.dataset.hud = 'perkLevel';
    const info = panel(root, K, 912, 90, 318, 595, 'Container/Popup_01_Medium', { ar: true, n: 'perkInfo' });
    const it = X(info, K, 0, 10, 318, 26, { cls: 'center' }); text(it, L('ui.potentialInfo'), 17 * K, NAVY);
    for (const k of [0, 1]) {
      const card = X(info, K, 16, 47 + k * 103, 284, 88, { spr: 'Common/Ui_Bg_Round_01_54px', col: [0.86, 0.93, 1, 1], sl: true });
      const ci = X(card, K, 8, 16, 52, 52, { cls: 'perkcirc' }); const cim = document.createElement('img'); cim.src = assetUrl(P.icon); cim.crossOrigin = 'anonymous'; ci.appendChild(cim);
      const nm = X(card, K, 68, 12, 200, 22, { cls: 'row' }); text(nm, L(P.name), 14 * K, NAVY);
      const lv = X(card, K, 240, 12, 36, 22, { cls: 'row' }); text(lv, 'Lv' + (k + 1), 14 * K, NAVY);
      const d = X(card, K, 69, 36, 205, 40, {}); T(d, L(P.desc), 13.5 * K, NAVY, 'wrapl');
    }
    const cond = X(info, K, 10, 258, 298, 232, { spr: 'Common/Ui_Bg_Round_01_54px', col: [0.9, 0.95, 1, 1], sl: true });
    const ct = X(cond, K, 0, 6, 298, 22, { cls: 'center' }); text(ct, L('ui.condition'), 16 * K, NAVY);
    const learn = X(info, K, 60, 510, 196, 66, { spr: 'Common/Btn_Square_01_Medium_Green', cls: 'btn row center', n: 'perkLearn' });
    learn.style.gap = '16px'; text(learn, L('ui.learn'), 21 * K, NAVY);
    const sp = F(learn, 80 * K, 32 * K, { spr: 'Common/Ui_Bg_Round_02_Medium_32px', col: [0.2, 0.5, 0.45, 0.6], sl: true, cls: 'row center' }); sp.style.gap = '20px';
    text(sp, 'SP', 15 * K, NAVY); text(sp, String(P.cost), 15 * K, [0.85, 0.1, 0.1, 1]);
    info.hidden = true;
    const draw = () => { spText.textContent = String(E.save.sp); lvlText.textContent = (E.save.perks[P.id] || 0) + '/' + P.max; };
    draw();
    node.addEventListener('pointerdown', e => { e.stopPropagation(); info.hidden = false; node.classList.add('sel'); });
    learn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const r = E.learnPerk(P.id);
      if (!r.ok) this.hud.toast(L('ui.notEnoughSP'), 2000);
      draw();
    });
    this.pushModal('perk', root, e => { if (e.code === 'Escape' || e.code === 'KeyK') this.popModal('perk'); });
    return new Promise(res => { const iv = setInterval(() => { if (!root.isConnected) { clearInterval(iv); res(); } }, 100); });
  }

  // ---------------------------------------------------------------- quầy hàng (10:39-10:45)
  openShop(npc) {
    const E = this.engine, K = 2, list = SHOP[npc] || [];
    const root = this.view('shop', K, L('ui.buy'), 'DialogueUI/Dialogue_Icon_BuyShop', L('ui.consumable'));
    const money = X(root, K, 1015, 22, 165, 35, { ar: true, spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.08, 0.12, 0.13, 0.59], sl: true });
    X(money, K, 6, 5, 25, 25, { spr: 'Icon/Icon_Currency_Coin' });
    const mt = X(money, K, 40, 0, 113, 35, { cls: 'row' }); mt.style.alignItems = 'center'; mt.style.justifyContent = 'flex-end';
    const goldText = text(mt, '', 18 * K); goldText.dataset.hud = 'shopGold';
    X(root, K, 43, 106, 30, 42, { spr: 'Category/Category_BG_Middle_Vertical', col: [1, 1, 1, 0.78] }); X(root, K, 45, 113, 26, 26, { spr: 'BuySellShopUI/Category_Inventory_ConsumableON' });
    if (this.hud.pc) { X(root, K, 50, 77, 14, 14, { spr: 'resources/Common/key_Q' }); X(root, K, 50, 162, 14, 14, { spr: 'resources/Common/key_E' }); }
    let sel = 0;
    const cells = [];
    for (let i = 0; i < 9; i++) {
      const it = list[i];
      const c = X(root, K, 118 + i * 80.5, 105, 76, 84, { cls: 'shopcell' + (it ? ' btn' : ' empty'), n: it ? 'shopCell' : null });
      if (it) {
        paint(c, 'Common/UI_Frame_Item_Box01');
        const im = X(c, K, 13, 6, 50, 50, { tag: 'img' }); im.src = assetUrl(it.icon); im.crossOrigin = 'anonymous'; im.style.objectFit = 'contain';
        const pr = X(c, K, 0, 60, 76, 18, { cls: 'row center' }); pr.style.gap = '4px';
        F(pr, 14 * K, 14 * K, { spr: 'Icon/Icon_Currency_Coin' }); text(pr, String(it.price), 12 * K, NAVY);
        c.dataset.item = it.item;
        c.addEventListener('pointerdown', e => { e.stopPropagation(); sel = i; draw(); });
      }
      cells.push(c);
    }
    const bag = X(root, K, 122, 662, 118, 30, { spr: 'Common/Ui_Bg_Rectangle_Round_02_68px', col: [0.08, 0.12, 0.13, 0.59], sl: true, cls: 'row center', ab: true });
    bag.style.gap = '24px'; text(bag, L('ui.bag'), 15 * K); const bagText = text(bag, '', 15 * K); bagText.dataset.hud = 'shopBag';
    const det = panel(root, K, 912, 90, 318, 600, 'Container/Popup_01_Medium', { ar: true, n: 'shopDetail' });
    const top = X(det, K, 6, 4, 306, 180, { cls: 'shoptop' });
    const nm = X(top, K, 16, 40, 200, 34, { cls: 'row' }); const nameText = text(nm, '', 22 * K, NAVY2);
    const ty = X(top, K, 16, 78, 200, 20, { cls: 'row' }); text(ty, L('ui.consumable'), 14 * K, [0.09, 0.27, 0.42, 0.5]);
    const own = X(top, K, 16, 101, null, 20, { spr: 'Common/Ui_Bg_Round_02_Medium_32px', col: NAVY, sl: true, cls: 'row center' }); own.style.gap = '8px';
    text(own, L('ui.owned'), 13 * K); const ownText = text(own, '0', 13 * K); ownText.dataset.hud = 'shopOwned';
    const big = X(top, K, 186, 52, 100, 100, { tag: 'img' }); big.crossOrigin = 'anonymous'; big.style.objectFit = 'contain';
    const ds = X(det, K, 22, 200, 280, 100, {});
    const buy = X(det, K, 100, 515, 118, 58, { spr: 'Common/Btn_Square_01_Medium_Green', cls: 'btn center', n: 'shopBuy' }); text(buy, L('ui.buy'), 21 * K, NAVY);
    const draw = () => {
      goldText.textContent = fmt(E.save.gold);
      bagText.textContent = E.bagCount() + '/' + BAG_SLOTS;
      cells.forEach((c, i) => c.classList.toggle('sel', i === sel));
      const it = list[sel];
      nameText.textContent = it && it.name ? L(it.name) : '…';
      ownText.textContent = String(it && it.item != null ? E.save.items[it.item] || 0 : 0);
      big.src = it ? assetUrl(it.icon) : '';
      ds.innerHTML = ''; if (it && it.desc) T(ds, L(it.desc), 14 * K, NAVY2, 'wrapl');
    };
    draw();
    buy.addEventListener('pointerdown', async e => {
      e.stopPropagation();
      const it = list[sel]; if (!it || !it.name) { this.hud.toast(L('ui.buy') + ' · chưa có'); return; }
      const n = await this.buyPopup(it);
      if (!n) return;
      const ok = await this.popup({ title: L('ui.notice'), body: L('ui.confirmBuy'), buttons: [{ t: L('ui.cancel'), v: false }, { t: L('ui.confirm'), v: true, green: true }] });
      if (!ok) return;
      const r = E.buy(it, n);
      if (!r.ok) { this.hud.toast(L('ui.notEnoughGold')); return; }
      this.npcToast('img/thumb/Thumb_NPC_Larus_Shop_Normal.webp', L('ui.thanks'));
      draw();
    });
    this.pushModal('shop', root, e => { if (e.code === 'Escape') this.popModal('shop'); });
    return new Promise(res => { const iv = setInterval(() => { if (!root.isConnected) { clearInterval(iv); res(); } }, 100); });
  }
  // BuyItemPopup: Min / - / số / + / +10, giá, Hủy / Mua; trả số lượng hoặc 0
  buyPopup(it) {
    return new Promise(res => {
      const K = 2, E = this.engine;
      const root = R(this.layer, { a: [0, 0, 1, 1], n: 'buyPopup', cls: 'view dimlight' });
      const box = panel(root, K, 418, 150, 444, 415, 'Container/Popup_01_Small', { ac: true, am: true });
      const tp = X(box, K, 104, -2, 236, 64, { spr: 'Common/Popup_Title_01', cls: 'center' }); text(tp, L('ui.buy'), 21 * K);
      const ib = X(box, K, 89, 82, 85, 98, { spr: 'Common/UI_Frame_Item_Box01' });
      const im = X(ib, K, 12, 14, 60, 60, { tag: 'img' }); im.src = assetUrl(it.icon); im.crossOrigin = 'anonymous'; im.style.objectFit = 'contain';
      const n1 = X(box, K, 190, 96, 200, 24, { cls: 'row' }); text(n1, L(it.name), 16 * K, NAVY2);
      const n2 = X(box, K, 190, 126, 200, 20, { cls: 'row' }); text(n2, L('ui.consumable'), 14 * K, [0.09, 0.27, 0.42, 0.5]);
      const ow = X(box, K, 190, 150, null, 22, { spr: 'Common/Ui_Bg_Round_02_Medium_32px', col: NAVY, sl: true, cls: 'row center' }); ow.style.gap = '8px';
      text(ow, L('ui.owned'), 13 * K); text(ow, String(E.save.items[it.item] || 0), 13 * K);
      let n = 1;
      const btn = (x, w, label, icon, fn, nm) => {
        const b = X(box, K, x, 200, w, 46, { spr: icon === undefined ? 'Common/Btn_Square_03_Medium' : 'Common/Btn_Square_03_Medium', sl: true, cls: 'btn center', n: nm });
        if (icon) F(b, 30 * K, 30 * K, { spr: icon, col: NAVY }); else text(b, label, 16 * K, NAVY);
        b.addEventListener('pointerdown', e => { e.stopPropagation(); fn(); upd(); });
        return b;
      };
      X(box, K, 104, 200, 236, 46, { spr: 'Common/Btn_Square_03_Large', sl: true });
      btn(40, 52, L('ui.min'), null, () => { n = 1; }, 'buyMin');
      btn(106, 50, '-', 'Icon/Icon_Minus', () => { n = Math.max(1, n - 1); }, 'buyMinus');
      btn(288, 50, '+', 'Icon/Icon_Plus', () => { n = Math.min(99, n + 1); }, 'buyPlus');
      btn(352, 52, '+10', null, () => { n = Math.min(99, n + 10); }, 'buyPlus10');
      const cnt = X(box, K, 160, 200, 124, 46, { cls: 'center' }); const cntText = text(cnt, '1', 19 * K, NAVY); cntText.dataset.hud = 'buyCount';
      const cost = X(box, K, 150, 262, 144, 34, { cls: 'row center' }); cost.style.gap = '40px';
      F(cost, 22 * K, 22 * K, { spr: 'Icon/Icon_Currency_Coin' }); const costText = text(cost, '', 19 * K, NAVY2); costText.dataset.hud = 'buyCost';
      const upd = () => { cntText.textContent = String(n); costText.textContent = fmt(n * it.price); };
      upd();
      const finish = v => { this.popModal('buyPopup'); res(v); };
      const row = X(box, K, 0, 322, 444, 64, { cls: 'row center' }); row.style.gap = '56px';
      for (const [label, v, green, nm] of [[L('ui.cancel'), 0, false, 'buyCancel'], [L('ui.buy'), 1, true, 'buyOk']]) {
        const b = F(row, 232, 124, { spr: green ? 'Common/Btn_Square_01_Medium_Green' : 'Common/Btn_Square_01_Medium_Blue', cls: 'btn center', n: nm });
        text(b, label, 21 * K, NAVY);
        b.addEventListener('pointerdown', e => { e.stopPropagation(); finish(v ? n : 0); });
      }
      this.pushModal('buyPopup', root, e => { if (e.code === 'Escape') finish(0); });
    });
  }
}

// chụp mô hình (NPC / người chơi) vào canvas 2D bằng renderer của game: khung nửa thân như al1.png [ĐỀ XUẤT]
function snapshot(renderer, object, canvas, height) {
  const size = 256, rt = new THREE.WebGLRenderTarget(size, size);
  const sc = new THREE.Scene(); const par = object.parent; const pos = object.position.clone(), rot = object.rotation.clone();
  sc.add(object); object.position.set(0, 0, 0); object.rotation.set(0, Math.PI, 0); object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object); const h = height || (box.max.y - box.min.y);
  const look = new THREE.Vector3(0, box.min.y + h * 0.62, 0);
  const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 80);
  cam.position.set(0, look.y + h * 0.55, -h * 3.0); cam.lookAt(look);
  const old = renderer.getClearAlpha(), oc = renderer.getClearColor(new THREE.Color());
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
  const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(null); renderer.setClearColor(oc, old); rt.dispose();
  if (par) par.add(object); object.position.copy(pos); object.rotation.copy(rot); object.updateMatrixWorld(true);
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d'), im = g.createImageData(size, size);
  for (let y = 0; y < size; y++) im.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(im, 0, 0);
}
export { ITEM_ICON, QUEST };
