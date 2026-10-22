// HUD dựng bằng HTML/CSS từ bố cục prefab gốc (ui/prefab/ui_play__PlaySceneUIController.json và các prefab con).
// Toạ độ là đơn vị canvas của Unity: gốc #hud có kích thước (màn / s) rồi scale(s), nên mọi số dưới đây chép thẳng
// từ RectTransform (anchorMin/Max, anchoredPosition, sizeDelta, pivot, localScale), trục y hướng lên (dùng `bottom`).
// s theo SM.Common.UI.SMUniformCanvasScaler.Apply (IL2CPP): r = cao màn (px thiết bị) / 1080, s = r^dampen,
// dampen 0.7 khi r >= 1, nội suy smoothstep tới 1.15 ở 720 px, dưới đó 1.15 + 0.35*log2(720/h) (trần 1.6);
// bản PC (PlatformPreview.UseStandaloneUIScale) nhân thêm StandaloneScale = 0.8.
// Vị trí/cỡ nút PC khác mobile: PlaySceneButtonBatch.buttonInfos (standalonePosition/Size vs defaultPosition/Size).
import * as THREE from 'three';
import { paint, tinted, uiUrl, used } from './sprites.js?v=20261022b';
import { assetUrl } from '../assets.js?v=20261022b';
import { state, on } from '../state.js?v=20261022b';
import { t } from '../../data/loc_vi.js?v=20261022b';

export const C = {                       // màu Image.color / TMP fontColor chép từ prefab
  dark30: [0.078, 0.118, 0.133, 0.298], dark39: [0.078, 0.118, 0.133, 0.392], dark59: [0.078, 0.118, 0.133, 0.588],
  dark80: [0.078, 0.118, 0.133, 0.8], dark60: [0.078, 0.118, 0.133, 0.6], navy: [0.039, 0.176, 0.29, 1],
  gaugeBg: [0.031, 0.118, 0.188, 1], menuBg: [0.102, 0.235, 0.306, 1], slimeInv: [0.086, 0.153, 0.184, 0.4],
  questBg: [0.061, 0.085, 0.094, 0.298], rotate: [0.624, 0.827, 1, 1],
};
export const css = c => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] ?? 1})`;
const TXT_LV = [0.8, 0.925, 1, 1], TXT_MAP = [0.638, 0.87, 1, 1];

export function uiScale(desktop) {
  const dpr = devicePixelRatio || 1, r = Math.max(innerHeight * dpr / 1080, 1e-3), low = 720 / 1080;
  let d;
  if (r >= 1) d = 0.7;
  else if (r >= low) { const k = Math.min(1, Math.max(0, (r - 1) / (low - 1))); d = 0.7 + (1.15 - 0.7) * k * k * (3 - 2 * k); }
  else d = Math.min(1.15 + 0.35 * Math.log2(low / r), 1.6);
  return Math.pow(r, d) * (desktop ? 0.8 : 1) / dpr;
}

// RectTransform -> CSS. o: { a:[x,y] | [x0,y0,x1,y1], p, sz, pv, sc, auto (ContentSizeFitter), n (data-hud), cls,
// spr, col, sl (sliced), tag }
export function R(parent, o = {}) {
  const e = document.createElement(o.tag || 'div');
  e.className = 'u' + (o.cls ? ' ' + o.cls : '');
  if (o.n) e.dataset.hud = o.n;
  const a = o.a || [0.5, 0.5];
  const [ax0, ay0, ax1, ay1] = a.length === 2 ? [a[0], a[1], a[0], a[1]] : a;
  const [px, py] = o.p || [0, 0], [w, h] = o.sz || [0, 0], [vx, vy] = o.pv || [0.5, 0.5];
  const s = e.style;
  if (o.auto) {
    s.left = `calc(${ax0 * 100}% + ${px}px)`; s.bottom = `calc(${ay0 * 100}% + ${py}px)`;
    s.transform = `translate(${-vx * 100}%, ${vy * 100}%)` + (o.sc ? ` scale(${o.sc})` : '');
  } else {
    s.left = `calc(${ax0 * 100}% + ${px - vx * w}px)`; s.bottom = `calc(${ay0 * 100}% + ${py - vy * h}px)`;
    s.width = ax1 !== ax0 ? `calc(${(ax1 - ax0) * 100}% + ${w}px)` : w + 'px';
    s.height = ay1 !== ay0 ? `calc(${(ay1 - ay0) * 100}% + ${h}px)` : h + 'px';
    if (o.sc) { s.transform = `scale(${o.sc})`; s.transformOrigin = `${vx * 100}% ${(1 - vy) * 100}%`; }
  }
  if (o.spr) paint(e, o.spr, { color: o.col, sliced: o.sl });
  parent.appendChild(e);
  return e;
}
// phần tử con của layout group (flex), cỡ cố định
export function F(parent, w, h, o = {}) {
  const e = document.createElement(o.tag || 'div');
  e.className = 'f' + (o.cls ? ' ' + o.cls : '');
  if (o.n) e.dataset.hud = o.n;
  if (w != null) e.style.width = w + 'px';
  if (h != null) e.style.height = h + 'px';
  if (o.spr) paint(e, o.spr, { color: o.col, sliced: o.sl });
  parent.appendChild(e);
  return e;
}
export function text(parent, s, size, color = [1, 1, 1, 1], cls = '') {
  const e = document.createElement('span');
  e.className = 'txt' + (cls ? ' ' + cls : '');
  e.style.fontSize = size + 'px'; e.style.color = css(color);
  e.textContent = s; parent.appendChild(e);
  return e;
}
// ô hình của slime: RawImage render texture trong game; bản web dùng ảnh 2D img/sl/<id>.webp của chính slime đó
const slimeImg = id => assetUrl('img/sl/' + id + '.webp');
function img(parent, src, o) {
  const e = R(parent, { ...o, tag: 'img' }); e.draggable = false; e.alt = '';
  e.crossOrigin = 'anonymous';
  e.onerror = () => (window.__wosErrors = window.__wosErrors || []).push('hud image load failed: ' + src);
  e.src = src; return e;
}

// Nút PC (standalone) / mobile (default): PlaySceneButtonBatch.buttonInfos
const BTN = {
  pc: {
    item: [[-524, 130], [-424, 130], [-324, 130]], itemSize: 96, attack: [-161, 158], attackSize: 220,
    dash: [-624, 130], dashSize: 96, switch: [-95, 323], switchSize: 112,
  },
  mobile: {
    item: [[-445, 250], [-373, 377], [-240, 411]], itemSize: 120, attack: [-250, 226], attackSize: 220,
    dash: [-388, 120], dashSize: 120, switch: [-112, 342], switchSize: 140,
  },
};
const ITEM_KEYS = ['key_Q', 'key_E', 'key_R'];

export class Hud {
  constructor(platform, { map, onAction } = {}) {
    this.platform = platform; this.pc = platform === 'pc';
    this.map = map; this.onAction = onAction || (() => {});
    this.el = {}; this.tags = [];
    const host = document.getElementById('hud') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'hud' }));
    host.innerHTML = ''; host.classList.toggle('pc', this.pc); host.classList.toggle('mobile', !this.pc);
    this.root = host;
    this.world = R(host, { a: [0, 0, 1, 1], n: 'world', cls: 'world' });
    this.base = R(host, { a: [0, 0, 1, 1], n: 'base', cls: 'base' });
    this.build();
    this.layout();
    addEventListener('resize', () => this.layout());
    on(() => this.render());
    this.render();
  }

  layout() {
    this.s = uiScale(this.pc);
    const r = this.root.style;
    r.width = innerWidth / this.s + 'px'; r.height = innerHeight / this.s + 'px';
    r.transform = `scale(${this.s})`;
  }

  key(parent, k, size, p, a = [0.5, 0.5]) {        // ButtonKeymapOverlay: chỉ hiện trên PC (bàn phím)
    if (!this.pc) return null;
    return R(parent, { a, p, sz: [size, size], spr: 'resources/Common/' + k, cls: 'keycap' });
  }
  button(parent, act, o) {
    const b = R(parent, { ...o, cls: 'btn ' + (o.cls || '') });
    b.dataset.act = act;
    b.addEventListener('pointerdown', e => { e.stopPropagation(); this.onAction(act); b.classList.add('on'); });
    const up = () => b.classList.remove('on');
    b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    return b;
  }

  build() {
    const B = this.base, E = this.el, L = this.pc ? BTN.pc : BTN.mobile;

    // ---- PlayerInfo (góc trái trên), chế độ User
    const pi = E.playerInfo = R(B, { n: 'playerInfo', a: [0, 1], p: [130.8, -108], sz: [227, 170], sc: 0.8 });
    const portrait = R(pi, { a: [0, 0.5], p: [0, 0], sz: [227, 170], pv: [0, 0.5], spr: 'Game/UI_PlayerInfo_BG' });
    // PlayerThumb: RawImage chân dung người chơi (render texture). Bản web chụp avatar thật vào canvas, cắt theo
    // UI_PlayerInfo_BG_Mask (130 px) đúng vòng tròn trắng của nền.
    const th = E.playerThumbBox = R(portrait, { n: 'playerThumb', a: [0.5, 0.5], p: [17, 0], sz: [130, 130], cls: 'thumbmask' });
    th.style.webkitMaskImage = th.style.maskImage = `url("${uiUrl('Game/UI_PlayerInfo_BG_Mask')}")`; used.add('Game/UI_PlayerInfo_BG_Mask');
    E.playerThumb = document.createElement('canvas'); E.playerThumb.width = E.playerThumb.height = 256; th.appendChild(E.playerThumb);
    const sp = R(portrait, { a: [0, 0.5], p: [0, 0], sz: [100, 100], pv: [0, 0.5] });
    E.slimeThumb = img(sp, slimeImg('SL_Slime_Water'), { n: 'slimeThumb', a: [0.5, 0.5], p: [-7, 0], sz: [80, 80], sc: 1.1 });
    const lg = R(portrait, { a: [1, 0.5], p: [-72, 0], sz: [75, 170], pv: [0, 0.5], spr: 'Game/UI_PlayerInfo_Gauge', col: C.dark59 });
    E.levelFill = R(lg, { n: 'levelGauge', a: [0.5, 0.5], sz: [75, 170], spr: 'Game/UI_PlayerInfo_Gauge', cls: 'vfill' });
    const lv = R(pi, { a: [0.5, 0], p: [-20, 0], pv: [1, 0], auto: true, spr: 'Game/UI_PlayerInfo_BG_Lv', col: C.navy, sl: true, cls: 'pad lvbox' });
    E.levelText = text(lv, '1', 24, TXT_LV); lv.dataset.hud = 'level';

    // ---- Warning (BaseWarningLayout, dưới PlayerInfo): "Cảnh báo! Thể lực thấp!"
    const wl = E.warning = R(B, { n: 'warning', a: [0, 1], p: [40, -200], pv: [0, 1], auto: true, cls: 'col' });
    const wst = F(wl, null, 40, { spr: 'Common/Ui_Bg_Round_02_Medium_32px', col: C.dark39, sl: true, cls: 'row center warnpill' });
    const wic = F(wst, 34, 34, { spr: 'Game/Btn_PlayScene_Warning' }); wic.style.marginRight = '8px';
    text(wst, t('PlayScene.WarningStamina'), 24);
    // ---- ChatButton (góc trái dưới): bản web chơi một mình nên chưa có khung chat
    const chat = this.button(B, 'chat', { n: 'chat', a: [0, 0], p: [100, 80], sz: [72, 60], spr: 'Common/Ui_Bg_Round_02_264px', col: C.dark39 });
    R(chat, { a: [0.5, 0.5], p: [0, -2], sz: [50, 50], spr: 'Icon/Icon_Chat', col: [0.6, 1, 0.878, 1] });

    // ---- MenuHolder (HorizontalLayoutGroup spacing 40, mỗi nút LayoutElement 84x84), MainMenuButton
    const mh = R(B, { n: 'menu', a: [1, 1], p: [-456, -46], pv: [1, 1], auto: true, cls: 'row' }); mh.style.gap = '40px';
    for (const [n, spr, act] of [['menuBag', 'Game/Btn_PlayScene_Bag', 'inventory'], ['menuIndex', 'Game/Btn_PlayScene_Index', 'slimeindex'], ['menuMail', 'Game/Btn_PlayScene_Mail', 'mail']]) {
      const b = F(mh, 84, 84, { n, cls: 'btn', spr }); b.dataset.act = act;
      if (n === 'menuIndex') b.hidden = true;   // ảnh chụp bản demo thật (D:\wos-ref\pilot\inn1.png): chỉ có Túi + Thư; Index bật sau
      b.addEventListener('pointerdown', e => { e.stopPropagation(); this.onAction(act); });
    }
    const mm = this.button(B, 'escape', { n: 'mainMenu', a: [1, 1], p: [-300, -40], sz: [100, 100], pv: [1, 1] });
    const mmb = R(mm, { a: [0, 0, 1, 1], spr: 'Game/Icon_Menu_BG', col: C.menuBg });
    R(mmb, { a: [0.5, 0.5], sz: [60, 60], spr: 'Game/Icon_Menu' });

    // ---- MiniMap 200x200 + MapIDLayout + phím Tab
    const mini = E.minimap = this.button(B, 'minimap', { n: 'minimap', a: [1, 1], p: [-52, -38], sz: [200, 200], pv: [1, 1] });
    const bgm = R(mini, { a: [0.5, 0.5], sz: [200, 200], spr: 'Common/Ui_Bg_Round_04_256px', col: C.dark80, cls: 'masked' });
    bgm.style.webkitMaskImage = bgm.style.maskImage = `url("${uiUrl('Common/Ui_Bg_Round_04_256px')}")`;
    E.miniCanvas = document.createElement('canvas'); E.miniCanvas.className = 'minimap-img'; bgm.appendChild(E.miniCanvas);
    R(bgm, { a: [0, 0, 1, 1], sz: [24, 24], spr: 'Common/Ui_Minimap_Shadow', col: [0, 0, 0, 0.5] });
    E.miniMarker = R(bgm, { n: 'miniMarker', a: [0.5, 0.5], sz: [64, 64], spr: 'Game/icon_map_marker_player_me' });
    const mid = R(mini, { a: [0.5, 0], p: [-26.8, -50], sz: [300, 100], cls: 'row center' }); mid.style.gap = '8px';
    const mib = F(mid, 60, 60, { spr: 'Common/Ui_Bg_Round_01_32px', col: [1, 1, 1, 0.8], sl: true });
    E.mapIcon = img(mib, assetUrl(state.map.icon), { a: [0, 0, 1, 1] });
    const idl = F(mid, null, null, { cls: 'col' }); idl.style.gap = '6px';
    E.mapName = text(idl, '', 22, TXT_MAP); E.mapName.dataset.hud = 'mapName';
    E.mapDetail = text(idl, '', 22);
    this.key(mini, 'key_Tab', 48, [90.7, -86.3]);
    const wm = this.button(B, 'worldmap', { n: 'worldMap', a: [1, 1], p: [-240, -217], sz: [60, 60] });
    R(wm, { a: [0, 0, 1, 1], spr: 'DialogueUI/Dialogue_Icon_Map' });
    E.channel = R(B, { n: 'channel', a: [1, 1], p: [0, -8], sz: [110, 40], pv: [1, 1], cls: 'center' });
    E.channelText = text(E.channel, '', 20, [1, 1, 1, 0.698]);   // prefab 36 nhưng TMP tự co (auto size) vừa ô 110x40: đo khung hình ra ~20

    // ---- Category (Quest / Party), QuestBookmarkLayout
    const cat = R(B, { n: 'category', a: [1, 1], p: [-35, -433], sz: [96, 213.3], pv: [1, 0.5] });
    const cc = R(cat, { a: [0.5, 1], sz: [62, 0], pv: [0.5, 1] });
    const top = R(cc, { a: [0, 1], p: [31, -68], sz: [62, 76], spr: 'Category/Category_BG_Top', col: [1, 1, 1, 0.784] });
    E.catQuest = R(top, { a: [0.5, 0.5], p: [0, 6.8], sz: [60, 60] });
    const bot = R(cc, { a: [0, 1], p: [31, -144], sz: [62, 76], spr: 'Category/Category_BG_Bottom', col: [1, 1, 1, 0.784] });
    E.catParty = R(bot, { a: [0.5, 0.5], p: [0, -6], sz: [60, 60] });
    E.quest = R(B, { n: 'quest', a: [1, 0, 1, 1], p: [-140, -355], sz: [500, -830], pv: [1, 1], cls: 'questlist' });

    // ---- SlimeQuickSlotLayout (đáy giữa): HorizontalLayoutGroup spacing -22, ô 149x139 scale 0.9
    const bar = E.slimeBar = R(B, { n: 'slimeBar', a: [0.5, 0], p: [0, 80], pv: [0.5, 0], auto: true, cls: 'row top' });
    // spacing -22: CSS gap không nhận số âm, nên dùng margin-left âm cho ô thứ 2 trở đi (.slot ~ .slot)
    const inv = this.button(bar, 'slimeinventory', { a: [0, 0.5], p: [-70, 0], sz: [80, 80], spr: 'Common/Ui_Bg_Round_02_264px', col: C.slimeInv, n: 'slimeInventory' });
    R(inv, { a: [0, 0, 1, 1], sz: [-16, -16], spr: 'Game/sample_icon_slimelist' });
    E.slots = [];
    for (let i = 0; i < 6; i++) E.slots.push(this.slimeSlot(bar, i));

    // ---- nút hành động góc phải dưới
    E.items = L.item.map((p, i) => {
      const b = this.button(B, 'slot' + (i + 2), { n: 'item' + i, a: [1, 0], p, sz: [L.itemSize, L.itemSize] });
      R(b, { a: [0, 0, 1, 1], spr: 'Game/Icon_ButtonBG03' });
      R(b, { a: [0, 0, 1, 1], p: [0, 7.8], sz: [-40, -40], spr: 'InventoryUI/Icon_Inventory_Consumable', col: [1, 1, 1, 0.039] });
      this.key(b, ITEM_KEYS[i], 32, [0, -46]);
      return b;
    });
    const atk = E.attack = this.button(B, 'interactAttack', { n: 'attack', a: [1, 0], p: L.attack, sz: [L.attackSize, L.attackSize] });
    const mk = (sprBg, icon, rot) => {
      const g = R(atk, { a: [0, 0, 1, 1] });
      R(g, { a: [0, 0, 1, 1], spr: sprBg });
      if (rot) R(g, { a: [0.5, 0.5], p: [0, 6], sz: [140, 140], spr: 'Game/Icon_AutoAttack01', col: C.rotate, cls: 'spin' });
      R(g, { a: [0.5, 0.5], p: [0, 6], sz: icon[1], spr: icon[0] });
      return g;
    };
    E.atkEnabled = mk('Game/Icon_ButtonBG01', ['Game/Icon_AutoAttack03', [120, 120]], true);
    E.atkDisabled = mk('Game/Icon_ButtonBG01', ['Game/Icon_AutoAttack02', [120, 120]], false);
    E.atkDisabled.style.opacity = '0.6';   // [ĐỀ XUẤT] CanvasGroup của Disabled: ảnh chụp inn1 thấy nút mờ, alpha chưa đọc
    E.atkReturn = mk('Game/Icon_ButtonBG01_Red', ['Game/Icon_Whistle', [120, 120]], false);
    this.key(atk, 'key_Spacebar', 64, [0, -84]);
    E.dash = this.button(B, 'dash', { n: 'dash', a: [1, 0], p: L.dash, sz: [L.dashSize, L.dashSize] });
    R(E.dash, { a: [0, 0, 1, 1], spr: 'Game/Icon_ButtonBG03' });
    R(E.dash, { a: [0.5, 0.5], p: [0, 6.5], sz: [80, 80], spr: 'Game/Icon_Dash' });
    E.dashCd = R(E.dash, { a: [0.5, 0.5], p: [0, 6.5], sz: [90, 90], cls: 'cooldown' });
    this.key(E.dash, 'key_LeftShift', 32, [0, -46]);
    // ---- InteractButton (ActionDeactiveCanvas): hiện khi có NPC / vật xem được trong tầm; Icon_ChatNPC hoặc kính lúp.
    // Mobile = prefab (-523,475); PC [ĐO TRONG ẢNH] b2-b4.png (nút kính lúp ở (1000,464) trên 1280x720 -> (-555,510))
    E.interact = this.button(B, 'interact', { n: 'interact', a: [1, 0], p: this.pc ? [-555, 510] : [-523, 475], sz: [100, 100], spr: 'Common/Ui_Bg_Round_02_264px', col: [0.08, 0.12, 0.13, 0.63] });
    E.interactChat = R(E.interact, { a: [0, 0, 1, 1], sz: [-30, -30], spr: 'Game/Icon_ChatNPC' });
    E.interactLook = R(E.interact, { a: [0, 0, 1, 1], sz: [-30, -30], spr: 'Game/Icon_Magnifier' });
    this.key(E.interact, 'key_Spacebar', 48, [51.6, -45.1]);
    E.interact.hidden = true;
    E.switch = this.button(B, 'switch', { n: 'switch', a: [1, 0], p: L.switch, sz: [L.switchSize, L.switchSize] });
    const sw = R(E.switch, { a: [0, 0, 1, 1], spr: 'Game/Icon_ButtonBG02' });
    R(sw, { a: [0, 0, 1, 1], sz: [-50, -50], spr: 'Game/icon_Change' });
    this.key(E.switch, 'key_C', 32, [0, -50]);

    // ---- MainJoystick (chỉ mobile): vùng 450x450 ở (120,130), nền 256, tay cầm 128
    if (!this.pc) {
      E.joyArea = R(B, { n: 'joystick', a: [0, 0], p: [120, 130], sz: [450, 450], pv: [0, 0], cls: 'joyarea' });
      E.joyBg = R(E.joyArea, { a: [0.5, 0.5], sz: [256, 256], spr: 'Game/UI_PlayScene_JoystickBG' });
      E.joyHandle = R(E.joyBg, { a: [0.5, 0.5], sz: [128, 128], spr: 'Game/UI_Joystick_Handle' });
    }

    // ---- MiniMapUI (Tab): bản đồ lớn giữa màn
    E.bigMap = R(B, { n: 'bigMap', a: [0.5, 0.5], sz: [900, 900], spr: 'Common/Ui_Bg_Round_04_256px', col: [0.106, 0.125, 0.173, 0.6], cls: 'bigmap' });
    E.bigCanvas = document.createElement('canvas'); E.bigCanvas.className = 'minimap-img big'; E.bigMap.appendChild(E.bigCanvas);
    E.bigMarker = R(E.bigMap, { a: [0, 0], sz: [64, 64], spr: 'Game/icon_map_marker_player_me' });
    E.bigMap.hidden = true;

    // ---- toast cho bảng chưa dựng (Túi đồ, Bách khoa...): nền Ui_Bg_Round_01_54px như EmptyLayout
    E.toast = R(B, { n: 'toast', a: [0.5, 0.5], p: [0, 260], auto: true, spr: 'Common/Ui_Bg_Round_01_54px', col: C.dark80, sl: true, cls: 'pad toast' });
    E.toastText = text(E.toast, '', 26); E.toast.hidden = true;

    // ---- HUD trên đầu (FollowObject offset y 0.4): UserHud = tên; MyMonsterHud = tên + HP/MP/Thể lực
    E.userHud = R(this.world, { n: 'userHud', a: [0, 0], auto: true, pv: [0.5, 0], cls: 'col center hudtag' });
    E.userName = text(E.userHud, '', 26, [1, 1, 1, 1], 'outline');
    E.monHud = R(this.world, { n: 'monsterHud', a: [0, 0], auto: true, pv: [0.5, 0], cls: 'col center hudtag' });
    E.monName = text(E.monHud, '', 26, [1, 1, 1, 1], 'outline');
    F(E.monHud, 1, 14);
    E.monHp = this.gauge(E.monHud, 150, 20, 'Game/UI_Gauge_BG01_1', 'Game/UI_Gauge_HP');
    F(E.monHud, 1, 2);
    E.monMp = this.gauge(E.monHud, 150, 13, 'Game/UI_Gauge_BG02_1', 'Game/UI_Gauge_MP');
    F(E.monHud, 1, 2);
    E.monSt = this.gauge(E.monHud, 150, 13, 'Game/UI_Gauge_BG02_1', 'Game/UI_Gauge_Stamina');
  }

  gauge(parent, w, h, bg, front, flow = true) {   // nền sliced + GaugeFront lùi vào 2 px (sizeDelta -4), đầy theo chiều ngang
    const g = flow ? F(parent, w, h, { spr: bg, col: C.gaugeBg, sl: true }) : parent;
    const f = R(g, { a: [0, 0, 0, 1], p: [2, 0], sz: [w - 4, -4], pv: [0, 0.5] });
    paint(f, front, { sliced: true });
    g.fill = v => { f.style.width = Math.max(0, Math.min(1, v)) * (w - 4) + 'px'; };
    return g;
  }

  slimeSlot(bar, i) {
    const slot = F(bar, 149, 139, { n: 'slimeSlot' + i, cls: 'slot btn' });
    slot.style.transform = 'scale(0.9)'; slot.dataset.act = 'equip' + i;
    slot.addEventListener('pointerdown', e => { e.stopPropagation(); this.onAction('equip' + i); });
    const mk = sel => {
      const m = R(slot, { a: [0, 0, 1, 1], pv: [0.5, 0], sc: sel ? null : 0.9, cls: sel ? 'sel' : 'norm' });
      R(m, { a: [0, 0, 1, 1], spr: sel ? 'Game/UI_Slot_BG_Selected' : 'Game/UI_Slot_BG' });
      m.pic = img(m, slimeImg('SL_Slime_Water'), { a: [0.5, 0.5], p: sel ? [-12, 5] : [-14, 2], sz: [90, 90], sc: sel ? 1.3 : 1.2 });
      if (!sel) m.pic.style.opacity = '0.8';
      if (sel) R(m, { a: [0, 1], pv: [0, 1], sz: [44, 44], spr: 'Icon/Icon_PartnerMarker_Badge' }).hidden = true;   // khung hình gốc không thấy dấu này ở slime thường
      const al = sel ? 1 : 0.698;
      const g = (y, front) => {
        const gg = R(m, { a: [0.5, 0], p: [-9.5, y], sz: [90, 14], pv: [0.5, 0], spr: 'Game/UI_Gauge_BG02_1', col: C.gaugeBg, sl: true });
        this.gauge(gg, 90, 14, null, front, false);
        gg.lastChild.style.opacity = String(al);       // GaugeFront Color alpha 0.698 ở ô thường, 1 ở ô đang chọn
        return gg;
      };
      m.hp = g(-12.6, 'Game/UI_Gauge_HP_Small'); m.mp = g(-28.6, 'Game/UI_Gauge_MP'); m.st = g(-44.6, 'Game/UI_Gauge_Stamina');
      const ex = R(m, { a: [1, 0.5], p: [-58.7, 0], sz: [48, 139], pv: [0, 0.5] });
      m.exp = R(ex, { a: [0.5, 0.5], sz: [49, 139], spr: 'Game/UI_Slot_Gauge', col: [1, 1, 1, al], cls: 'vfill' });
      const lvb = R(m, { a: [0.5, 0], p: [sel ? -33.7 : -28.8, sel ? 15.2 : 13.5], sz: [54, sel ? 34 : 36], pv: [1, 0], spr: 'Common/Ui_Bg_Round_01_32px', col: sel ? C.navy : C.dark60, sl: true, cls: 'center' });
      m.lv = text(lvb, '1', 18, TXT_LV);
      R(m, { a: [0.5, 1], p: [14, 9], sz: [36, 36], pv: [1, 1], spr: 'Icon/Icon_Tamed' });   // SpecialSlime: tim hồng của slime đã thuần (khung V4Van)
      // ButtonKeymapOverlay (58,-65) không hiện phím số trên ảnh chụp demo thật (inn1) nên bỏ
      return m;
    };
    slot.norm = mk(false); slot.sel = mk(true);
    return slot;
  }

  questItem(q) {                                    // ui_play__QuestBookmarkLayout + ObjectiveLayout
    const box = document.createElement('div'); box.className = 'f qbox'; box.dataset.hud = 'questItem';
    paint(box, 'Game/UI_PlayScene_QuestBG', { color: C.questBg, sliced: true });
    const tl = F(box, null, 49, { cls: 'row center qtitle' }); tl.style.gap = '12px';
    text(tl, q.title, 30);
    const star = F(tl, 43, 43, { cls: 'star' }); star.style.transform = 'scale(0.85)';
    R(star, { a: [0, 0, 1, 1], spr: 'QuestUI/Icon_Quest_Favorites_On', col: [0, 0, 0, 0.314] });
    R(star, { a: [0, 0, 1, 1], spr: 'QuestUI/Icon_Quest_Favorites_On' });
    for (const o of q.objectives) {
      const ol = F(box, null, 36, { cls: 'row center qobj' });
      if (o.done) { const ci = F(ol, 47, 38, { spr: 'Icon/Icon_Check02' }); ci.style.transform = 'scale(0.7)'; }
      text(ol, o.text, 24, o.done ? [0.6, 1, 0.878, 1] : [1, 1, 1, 1]);
    }
    return box;
  }

  render() {
    const E = this.el, S = state;
    E.levelText.textContent = String(S.player.level);
    E.levelFill.style.clipPath = `inset(${(1 - S.player.exp) * 100}% 0 0 0)`;
    E.mapName.textContent = S.map.name; E.mapDetail.textContent = S.map.detail;
    E.channelText.textContent = 'CH ' + String(S.channel).padStart(2, '0');   // khung hình gốc: "CH 01"
    const catQ = S.minimapOpen ? 'OFF' : 'ON';
    paintOnce(E.catQuest, 'Category/Category_Playscene_Quest' + catQ);
    paintOnce(E.catParty, 'Category/Category_Playscene_PartyOFF');
    // nhiệm vụ
    E.quest.innerHTML = '';
    const content = document.createElement('div'); content.className = 'qcontent'; E.quest.appendChild(content);
    if (S.quest) content.appendChild(this.questItem(S.quest));
    else {
      const em = F(content, null, null, { n: 'questEmpty', spr: 'Common/Ui_Bg_Round_01_54px', col: C.dark30, sl: true, cls: 'pad20' });
      text(em, t('UI.QuestNotRegistered'), 24);
    }
    // đội slime
    S.party.forEach((sl, i) => {
      const slot = E.slots[i];
      slot.hidden = !sl;
      if (!sl) return;
      const sel = S.equipped === i;
      slot.norm.hidden = sel; slot.sel.hidden = !sel;
      for (const m of [slot.norm, slot.sel]) {
        if (m.pic.dataset.id !== sl.id) { m.pic.src = slimeImg(sl.id); m.pic.dataset.id = sl.id; }
        m.hp.fill(sl.hp); m.mp.fill(sl.mp); m.st.fill(sl.st); m.st.hidden = sl.st >= 1;   // inn1: thể lực đầy thì không có thanh thứ ba
        m.exp.style.clipPath = `inset(${(1 - sl.exp) * 100}% 0 0 0)`;
        m.lv.textContent = String(sl.level);
      }
    });
    const eq = S.equipped != null ? S.party[S.equipped] : null;
    if (eq && E.slimeThumb.dataset.id !== eq.id) { E.slimeThumb.src = slimeImg(eq.id); E.slimeThumb.dataset.id = eq.id; }
    // nút lớn: Return (huýt sáo) khi slime đang đánh, còn lại Enabled/Disabled theo CombatMode
    E.atkReturn.hidden = !S.battle; E.atkEnabled.hidden = S.battle || !S.autoBattle; E.atkDisabled.hidden = S.battle || S.autoBattle;
    E.attack.dataset.mode = S.battle ? 'return' : S.autoBattle ? 'enabled' : 'disabled';
    // Switch: trên PC chỉ hiện khi đang điều khiển slime (khung hình gốc PC không có nút này lúc thường)
    E.switch.hidden = this.pc && S.control === 'user';
    E.bigMap.hidden = !S.minimapOpen;
    // bảng/hội thoại mở: HUD chơi và thẻ tên ẩn (al1.png, q1.png chỉ còn bảng)
    this.base.hidden = !!S.modal; this.world.hidden = !!S.modal;
    E.warning.hidden = !S.warnStamina;
    E.userName.textContent = S.player.name;
    E.monName.textContent = eq ? eq.name : '';
    E.monHud.hidden = !eq;
    if (eq) { E.monHp.fill(eq.hp); E.monMp.fill(eq.mp); E.monSt.fill(eq.st); E.monSt.hidden = eq.st >= 1; }
  }

  toast(msg, ms = 1600) {
    const E = this.el; E.toastText.textContent = msg; E.toast.hidden = false;
    clearTimeout(this._tt); this._tt = setTimeout(() => { E.toast.hidden = true; }, ms);
  }

  // Ảnh chân dung: chụp avatar thật bằng renderer của game vào render target, rồi chép ra canvas PlayerThumb.
  portrait(renderer, object) {
    const size = 256, rt = new THREE.WebGLRenderTarget(size, size);
    const sc = new THREE.Scene(); const par = object.parent; const pos = object.position.clone(), rot = object.rotation.clone();
    sc.add(object); object.position.set(0, 0, 0); object.rotation.set(0, Math.PI, 0); object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object); const h = box.max.y - box.min.y;
    const head = new THREE.Vector3(0, box.min.y + h * 0.66, 0);   // [ĐỀ XUẤT] khung chân dung: đầu chibi chiếm ~45% chiều cao
    const cam = new THREE.PerspectiveCamera(22, 1, 0.05, 50);
    cam.position.set(0, head.y + h * 0.04, -h * 1.45); cam.lookAt(head);
    const old = renderer.getClearAlpha(), oc = renderer.getClearColor(new THREE.Color());
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(sc, cam);
    const px = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    renderer.setRenderTarget(null); renderer.setClearColor(oc, old); rt.dispose();
    if (par) par.add(object); object.position.copy(pos); object.rotation.copy(rot);
    const cv = this.el.playerThumb, g = cv.getContext('2d'), im = g.createImageData(size, size);
    for (let y = 0; y < size; y++) im.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(im, 0, 0);
  }

  // Ảnh bản đồ nhỏ: MiniMapImage là ảnh server/bake chưa có -> vẽ từ floors/landType của bản đồ [ĐỀ XUẤT]
  drawMinimap() {
    const m = this.map; if (!m) return;
    const cd = m.data.client, W = cd.width, H = cd.height, k = 8;
    const col = m.collide;
    for (const cv of [this.el.miniCanvas, this.el.bigCanvas]) {
      cv.width = W * k; cv.height = H * k;
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
      if (col) {
        // MiniMapLoader.MakeMiniMapFromBytesCollision: ảnh bản đồ nhỏ của game dựng từ chính lưới va chạm (ENABLE = đất,
        // WATER = nước); màu [ĐỀ XUẤT] (Color truyền vào GetColors nằm trên prefab, chưa đọc)
        const h = k / 2;
        for (let z = 0; z < col.height; z++) for (let x = 0; x < col.width; x++) {
          const f = col.flags[x + z * col.width];
          if (f & 64) g.fillStyle = 'rgba(84,214,246,0.9)';
          else if (!(f & 1)) g.fillStyle = 'rgba(150,200,214,0.75)';
          else continue;
          g.fillRect(x * h, (col.height - 1 - z) * h, h, h);
        }
        continue;
      }
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = z * W + x, f = cd.floors[i], lt = cd.landType[i];
        if (f == null || f < -100) continue;
        const water = lt === 3, blocked = m.blocked && m.blocked.has(i);
        if (blocked) continue;   // cây/đá: để lộ nền tối như khung hình gốc
        g.fillStyle = water ? 'rgba(84,214,246,1)' : `rgba(${96 + f * 24},${170 + f * 14},${196 + f * 8},${0.3 + f * 0.1})`;
        g.fillRect(x * k, (H - 1 - z) * k, k, k);
      }
    }
    this.mapPx = { W, H, k };
  }

  // thẻ tên NPC trên đầu (UserHud kiểu chữ trắng viền tối như userName; inn1.png "Amy", al4.png "Allen", "Wisp")
  setNpcs(list) {
    for (const t of this.npcTags || []) t.el.remove();
    this.npcTags = list.map(n => {
      const el = R(this.world, { n: 'npcHud', a: [0, 0], auto: true, pv: [0.5, 0], cls: 'col center hudtag' });
      el.dataset.npc = n.name;
      // dấu nhiệm vụ trên đầu (Icon/quest_marker_*: before "!", progress "?", complete "✓"), 2:15 / 4:27
      const mk = F(el, 54, 58, { cls: 'qmarker' }); mk.hidden = true;
      text(el, n.name, 26, [1, 1, 1, 1], 'outline');
      return { el, object: n.object, height: n.height, name: n.name, mk };
    });
  }

  // kind: 'before' | 'progress' | 'complete' | null theo tên NPC (js/quest/engine.js markerFor)
  setMarkers(fn) {
    for (const t of this.npcTags || []) {
      const k = fn(t.name);
      if (t.mk.dataset.k === (k || '')) continue;
      t.mk.dataset.k = k || ''; t.mk.hidden = !k;
      t.mk.querySelectorAll('.spr').forEach(x => x.remove());
      if (k) paint(t.mk, 'Icon/quest_marker_' + k);
    }
  }
  // InteractButton: kind 'npc' | 'box' | null
  setInteract(kind) {
    const E = this.el; if (E.interact.dataset.k === (kind || '')) return;
    E.interact.dataset.k = kind || ''; E.interact.hidden = !kind;
    E.interactChat.hidden = kind !== 'npc'; E.interactLook.hidden = kind !== 'box';
  }

  // mỗi khung: HUD theo đầu nhân vật, bản đồ nhỏ cuộn theo người chơi
  frame(cam, P, S, player, slime, yaw) {
    const E = this.el, s = this.s, v = new THREE.Vector3();
    const place = (el, obj, top) => {
      v.set(obj.position.x, obj.position.y + top + 0.4, obj.position.z).project(cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      el.style.visibility = vis ? '' : 'hidden';
      el.style.left = ((v.x + 1) / 2 * innerWidth / s) + 'px';
      el.style.bottom = ((v.y + 1) / 2 * innerHeight / s) + 'px';
    };
    place(E.userHud, player.object, player.height || 1.6);
    for (const t of this.npcTags || []) place(t.el, t.object, t.height || 1.6);
    if (!E.monHud.hidden) place(E.monHud, slime.object, slime.height || 0.8);
    if (this.mapPx) {
      const { W, H } = this.mapPx, z = 6;       // [ĐỀ XUẤT] bản đồ nhỏ: 1 ô = 6 đơn vị (khung 200 thấy ~33 ô ngang)
      const c = E.miniCanvas;
      c.style.width = W * z + 'px'; c.style.height = H * z + 'px';
      c.style.left = (100 - P.x * z) + 'px'; c.style.top = (100 - (H - P.z) * z) + 'px';
      E.miniMarker.style.transform = `rotate(${-yaw}rad)`;
      if (!E.bigMap.hidden) {
        const bz = Math.min(880 / W, 880 / H), b = E.bigCanvas;
        b.style.width = W * bz + 'px'; b.style.height = H * bz + 'px';
        b.style.left = (450 - W * bz / 2) + 'px'; b.style.top = (450 - H * bz / 2) + 'px';
        E.bigMarker.style.left = (450 - W * bz / 2 + P.x * bz - 32) + 'px';
        E.bigMarker.style.bottom = (450 - H * bz / 2 + P.z * bz - 32) + 'px';
        E.bigMarker.style.transform = `rotate(${-yaw}rad)`;
      }
    }
    // hồi chiêu lướt: vòng tối Ui_Bg_Round_02_264px kiểu ImgCooltime (filled radial)
    const cd = P.dashCd > 0 ? P.dashCd / P.dashCdMax : 0;
    E.dashCd.style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,0.588) ${cd * 360}deg, transparent 0)` : '';
  }
}

function paintOnce(el, key) {
  if (el.dataset.key === key) return;
  el.dataset.key = key; el.querySelectorAll('.spr').forEach(x => x.remove());
  paint(el, key);
}
export { tinted };
