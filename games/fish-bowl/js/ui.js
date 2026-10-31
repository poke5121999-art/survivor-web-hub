// Fish Bowl 2D UI: renders the uGUI screens exported to art/ui/layout.json as absolutely positioned DOM.
// Units inside a screen container are Unity canvas units; the container is scaled by min(W/1920, H/1080)
// (CanvasScaler "Expand"), so its own size is W/s x H/s and anchors can be plain CSS percentages.
// Font: Plumpfull.ttf (the original), loaded by css/game.css for TMP "Plumpfull SDF", "Plumpfull" and legacy Text alike.

const REF_W = 1920, REF_H = 1080;
const css = (c) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
const rgb = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
const isWhite = (c) => c[0] > 0.999 && c[1] > 0.999 && c[2] > 0.999;
const px = (v) => `${+v.toFixed(3)}px`;

// DOTweenAnimation components on the rendered nodes, from the level dumps. Row:
// [path, animationType, endV3.x, y, z, endFloat, duration, delay, ease, loops, loopType, isFrom, isRelative, autoPlay, id]
// animationType: 1 Move (anchoredPosition), 3 Rotate, 5 Scale, 7 Fade, 11 PunchScale. Shake/Color/Text tweens are not reproduced.
const TWEENS = {"menu":[["Canvas/Panel/BG/Play_Button/Pop Fade Fx",5,0.0,0.0,0.0,1.5,0.8,0.0,6,-1,0,0,0,1,"popFadeFx"],["Canvas/Panel/BG/Play_Button/Pop Fade Fx",7,0.0,0.0,0.0,0.0,0.8,0.0,6,-1,0,0,0,1,"popFadeFx"],["Canvas/Panel/BG/Play_Button",5,0.0,0.0,0.0,0.0,1.0,1.0,30,1,0,1,0,1,"scale"],["Canvas/Panel/BG/Footer/MoreGames_Button",5,0.0,0.0,0.0,0.0,1.0,0.8,30,1,0,1,0,1,"scale"],["Canvas/Panel/BG/Title_BG",1,771.333,442.0,0.0,0.0,3.0,0.0,19,1,0,0,0,1,""],["Canvas/Panel/BG/Footer/RateUs_Button",5,0.0,0.0,0.0,0.0,1.0,0.4,30,1,0,1,0,1,"scale"],["Canvas/Panel/BG/Settings_Btn/Gear_Img",3,0.0,0.0,90.0,0.0,1.0,0.0,1,-1,2,0,1,1,""],["Canvas/Panel/BG/Play_ButtonForNeutral",11,0.1,0.1,0.1,0.0,1.0,0.0,6,-1,0,0,0,0,"punchScale"],["Canvas/Panel/BG/Play_ButtonForNeutral",5,0.0,0.0,0.0,1.0,2.0,0.0,24,1,0,0,0,1,"scale"],["Canvas/Panel/BG/Footer/PrivacyPolicy_Button",5,0.0,0.0,0.0,0.0,1.0,0.6,30,1,0,1,0,1,"scale"],["Canvas/Panel/BG/HandIndicator/Circle",5,0.0,0.0,0.0,0.0,1.0,0.5,4,-1,0,1,0,1,"Circle"],["Canvas/Panel/BG/HandIndicator/Circle",7,0.0,0.0,0.0,0.0,1.0,0.6,4,-1,0,0,0,1,"Circle"],["Canvas/Panel/BG/HandIndicator/Hand",5,0.0,0.0,0.0,0.95,0.5,0.0,4,-1,1,0,0,1,""],["Canvas/Panel/BG/HandIndicator/Hand",3,0.0,0.0,-15.0,0.0,0.5,0.0,4,-1,1,0,1,1,""]],"levels":[["Canvas/Panel/BG_Img/BtnsContainer_WithoutScroll/Level3Button/Play_Button",3,0.0,0.0,-15.0,0.0,1.0,0.0,7,-1,1,0,0,1,""],["Canvas/Panel/BG_Img/Footer/Play_Button",3,0.0,0.0,-15.0,0.0,1.0,0.0,7,-1,1,0,0,1,""],["Canvas/Panel/BG_Img/BtnsContainer_WithoutScroll/Level4Button/Play_Button",3,0.0,0.0,-15.0,0.0,1.0,0.0,7,-1,1,0,0,1,""],["Canvas/Panel/BG_Img/Footer/RateUs_Button",5,0.0,0.0,0.0,0.0,1.0,0.4,30,1,0,1,0,1,"scale"],["Canvas/Panel/BG_Img/BtnsContainer_WithoutScroll/Level2Button/Play_Button",3,0.0,0.0,-15.0,0.0,1.0,0.0,7,-1,1,0,0,1,""],["Canvas/Tutorial/Play",3,0.0,0.0,-15.0,0.0,1.0,0.0,7,-1,1,0,0,1,""],["Canvas/Panel/BG_Img/BtnsContainer_WithoutScroll/Level5Button/Play_Button",3,0.0,0.0,-8.0,0.0,1.0,0.0,7,-1,1,0,0,1,""],["Canvas/Tutorial/Play/HandIndicator/Hand",5,0.0,0.0,0.0,0.95,0.5,0.0,4,-1,1,0,0,1,""],["Canvas/Tutorial/Play/HandIndicator/Hand",3,0.0,0.0,-15.0,0.0,0.5,0.0,4,-1,1,0,1,1,""],["Canvas/Tutorial/Play/HandIndicator/Circle",7,0.0,0.0,0.0,0.0,1.0,0.6,4,-1,0,0,0,1,"Circle"],["Canvas/Tutorial/Play/HandIndicator/Circle",5,0.0,0.0,0.0,0.0,1.0,0.5,4,-1,0,1,0,1,"Circle"]],"hud":[["CF2-Canvas/CF2-Panel/GameStatus/Level Skip/Skjp Panel/No",5,0.0,0.0,0.0,0.0,1.0,1.0,15,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/CompletePopUpPanel/CompletedBG/BG_Glow",3,0.0,0.0,90.0,0.0,1.0,0.0,1,-1,2,0,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Next/Pop Fade Effect Img",7,0.0,0.0,0.0,0.0,0.8,0.0,6,-1,0,0,0,0,"popFadeFx"],["CF2-Canvas/CF2-Panel/GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Next/Pop Fade Effect Img",5,0.0,0.0,0.0,1.5,0.8,0.0,6,-1,0,0,0,0,"popFadeFx"],["CF2-Canvas/CF2-Panel/GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Restart",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/LevelCompletePanel/Panel/RateUs_Button",5,0.0,0.0,0.0,0.0,1.0,0.4,30,1,0,1,0,1,"scale"],["CF2-Canvas/CF2-Panel/GameStatus/Level Skip/Skjp Panel/Yes",5,0.0,0.0,0.0,0.0,1.0,0.2,15,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/Controls/ActionButton/Image",3,0.0,0.0,10.0,0.0,1.0,0.0,6,-1,1,0,0,1,""],["CF2-Canvas/CF2-Panel/GameStatusBtns/Pause",5,0.0,0.0,0.0,0.0,1.0,0.0,24,1,0,1,0,0,"pop"],["CF2-Canvas/CF2-Panel/GameStatus/LevelFailPanel/Panel/Main Buttons Container/Home",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/PausePanel/Panel/RateUs_Button",5,0.0,0.0,0.0,0.0,1.0,0.4,30,1,0,1,0,1,"scale"],["CF2-Canvas/CF2-Panel/GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Home",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/DialgogueSystem/DialoguePanel",11,0.2,0.01,0.01,0.0,0.5,0.0,4,1,0,0,0,0,"IsClose"],["CF2-Canvas/CF2-Panel/DialgogueSystem/DialoguePanel",1,0.0,40.0,0.0,0.0,0.5,0.0,1,1,0,0,1,0,"IsOpen"],["CF2-Canvas/CF2-Panel/DialgogueSystem/DialoguePanel",11,0.2,0.01,0.01,0.0,0.5,0.0,4,1,0,0,0,0,"IsOpen"],["CF2-Canvas/CF2-Panel/DialgogueSystem/DialoguePanel",7,0.0,0.0,0.0,1.0,0.5,0.0,1,1,2,0,0,0,"IsOpen"],["CF2-Canvas/CF2-Panel/DialgogueSystem/DialoguePanel",7,0.0,0.0,0.0,0.0,0.5,0.0,1,1,0,0,0,0,"IsClose"],["CF2-Canvas/CF2-Panel/DialgogueSystem/DialoguePanel",1,0.0,0.0,0.0,0.0,0.5,0.0,1,1,0,0,1,0,"IsClose"],["CF2-Canvas/CF2-Panel/GameStatus/PausePanel/Panel/Main Buttons Container/Resume/Pop Fade Effect Img",7,0.0,0.0,0.0,0.0,0.8,0.0,6,-1,0,0,0,0,"popFadeFx"],["CF2-Canvas/CF2-Panel/GameStatus/PausePanel/Panel/Main Buttons Container/Resume/Pop Fade Effect Img",5,0.0,0.0,0.0,1.5,0.8,0.0,6,-1,0,0,0,0,"popFadeFx"],["CF2-Canvas/CF2-Panel/GameStatus/Level Skip/Skjp Panel",5,0.0,0.0,0.0,0.0,1.0,0.0,15,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/LevelFailPanel/Panel/Main Buttons Container/Restart",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/PausePanel/Panel",1,200.0,500.0,0.0,0.0,1.0,0.0,21,1,0,1,1,1,""],["CF2-Canvas/CF2-Panel/GameStatus/PausePanel/Panel/Main Buttons Container/Home",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/Controls/ActionButton/TapMe_Txt",5,0.0,0.0,0.0,1.1,0.5,0.0,6,-1,1,0,0,1,""],["CF2-Canvas/CF2-Panel/GameStatusBtns/Skip",5,0.0,0.0,0.0,0.0,1.0,0.0,24,1,0,1,0,0,"pop"],["CF2-Canvas/CF2-Panel/GameStatus/CompletePopUpPanel/CompletedBG/Complete",7,0.0,0.0,0.0,1.0,1.0,0.0,21,1,0,0,0,1,""],["CF2-Canvas/CF2-Panel/Controls/Hint",5,0.0,0.0,0.0,0.0,1.0,0.0,24,1,0,1,0,1,"pop"],["CF2-Canvas/CF2-Panel/GameStatus/LevelCompletePanel/Panel",1,200.0,500.0,0.0,0.0,1.0,0.0,21,1,0,1,1,1,""],["CF2-Canvas/CF2-Panel/Timeline/Skip CutScene/Skjp Panel",5,0.0,0.0,0.0,0.0,1.0,0.0,15,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/Level Skip/Skjp Panel/Yes/Button/Vid Icon",3,0.0,0.0,25.0,0.0,0.7,0.0,1,-1,1,0,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/LevelFailPanel/Panel/Main Buttons Container/Restart/Pop Fade Effect Img",7,0.0,0.0,0.0,0.0,0.8,0.0,6,-1,0,0,0,0,"popFadeFx"],["CF2-Canvas/CF2-Panel/GameStatus/LevelFailPanel/Panel/Main Buttons Container/Restart/Pop Fade Effect Img",5,0.0,0.0,0.0,1.5,0.8,0.0,6,-1,0,0,0,0,"popFadeFx"],["CF2-Canvas/CF2-Panel/GameStatus/LevelCompletePanel/Panel/Main Buttons Container/Next",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/PausePanel/Panel/Main Buttons Container/Resume",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/Timeline/Skip CutScene/Skjp Panel/No",5,0.0,0.0,0.0,0.0,1.0,1.0,15,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/Level Skip/Skjp Panel/Yes/Tween",7,0.0,0.0,0.0,0.0,0.7,0.0,1,-1,0,0,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/Level Skip/Skjp Panel/Yes/Tween",5,0.0,0.0,0.0,1.2,0.7,0.0,1,-1,0,0,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/LevelFailPanel/Panel",1,200.0,500.0,0.0,0.0,1.0,0.0,21,1,0,1,1,1,""],["CF2-Canvas/CF2-Panel/GameStatus/PausePanel/Panel/Main Buttons Container/Restart",5,0.0,0.0,0.0,0.0,1.0,0.0,27,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/Timeline/Skip CutScene/Skjp Panel/Yes/Button/Vid Icon",3,0.0,0.0,25.0,0.0,0.7,0.0,1,-1,1,0,0,1,""],["CF2-Canvas/CF2-Panel/TaskSpecificControls/PullMoss_Button/Text",5,0.0,0.0,0.0,0.1,1.0,0.0,6,-1,1,0,1,1,""],["CF2-Canvas/CF2-Panel/JumpGoPRomptParent/JumpGoPrompt",5,0.0,0.0,0.0,0.9,0.3,0.0,6,-1,1,0,0,1,""],["CF2-Canvas/CF2-Panel/Timeline/Skip CutScene/Skjp Panel/Yes/Tween",7,0.0,0.0,0.0,0.0,0.7,0.0,1,-1,0,0,0,1,""],["CF2-Canvas/CF2-Panel/Timeline/Skip CutScene/Skjp Panel/Yes/Tween",5,0.0,0.0,0.0,1.2,0.7,0.0,1,-1,0,0,0,1,""],["CF2-Canvas/CF2-Panel/GameStatus/CompletePopUpPanel/CompletedBG",1,200.0,400.0,0.0,0.0,0.8,0.0,27,1,0,1,1,1,""],["CF2-Canvas/CF2-Panel/GameStatus/Wasted Text",7,0.0,0.0,0.0,0.0,1.5,0.0,13,1,0,1,0,1,""],["CF2-Canvas/CF2-Panel/TaskSpecificControls/FishJump_TouchBtn",5,0.0,0.0,0.0,1.3,0.3,0.0,18,-1,1,0,0,0,"jumpNow"],["CF2-Canvas/CF2-Panel/HintPanel_Img",1,537.0,105.722,0.0,0.0,1.0,0.0,15,1,0,0,0,1,""]]};

// DOTween Ease enum order -> CSS easing
const EASE_BEZ = {
  1: 'linear', 2: 'cubic-bezier(.12,0,.39,0)', 3: 'cubic-bezier(.61,1,.88,1)', 4: 'cubic-bezier(.37,0,.63,1)',
  5: 'cubic-bezier(.11,0,.5,0)', 6: 'cubic-bezier(.5,1,.89,1)', 7: 'cubic-bezier(.45,0,.55,1)',
  8: 'cubic-bezier(.32,0,.67,0)', 9: 'cubic-bezier(.33,1,.68,1)', 10: 'cubic-bezier(.65,0,.35,1)',
  11: 'cubic-bezier(.5,0,.75,0)', 12: 'cubic-bezier(.25,1,.5,1)', 13: 'cubic-bezier(.76,0,.24,1)',
  14: 'cubic-bezier(.64,0,.78,0)', 15: 'cubic-bezier(.22,1,.36,1)', 16: 'cubic-bezier(.83,0,.17,1)',
  17: 'cubic-bezier(.7,0,.84,0)', 18: 'cubic-bezier(.16,1,.3,1)', 19: 'cubic-bezier(.87,0,.13,1)',
  20: 'cubic-bezier(.55,0,1,.45)', 21: 'cubic-bezier(0,.55,.45,1)', 22: 'cubic-bezier(.85,0,.15,1)',
  29: 'cubic-bezier(.36,0,.66,-.56)', 30: 'cubic-bezier(.34,1.56,.64,1)', 31: 'cubic-bezier(.68,-.6,.32,1.6)',
};
const sampled = (fn) => `linear(${Array.from({ length: 33 }, (_, i) => +fn(i / 32).toFixed(4)).join(',')})`;
const outBounce = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
const outElastic = (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1);
const easeCss = (e) => EASE_BEZ[e] || (e === 24 ? sampled(outElastic) : e === 23 ? sampled((t) => 1 - outElastic(1 - t))
  : e === 27 ? sampled(outBounce) : e === 26 ? sampled((t) => 1 - outBounce(1 - t))
    : e === 28 ? sampled((t) => (t < 0.5 ? (1 - outBounce(1 - 2 * t)) / 2 : (1 + outBounce(2 * t - 1)) / 2))
      : e === 25 ? sampled((t) => (t < 0.5 ? (1 - outElastic(1 - 2 * t)) / 2 : (1 + outElastic(2 * t - 1)) / 2)) : 'ease-in-out');

export class UI {
  constructor(rootEl, layout, { spriteBase = './art/ui/sprites/' } = {}) {
    this.root = rootEl;
    this.layout = layout;
    this.base = spriteBase.endsWith('/') ? spriteBase : spriteBase + '/';
    this.screens = {};
    this.scale = 1;
    this._joy = { x: 0, y: 0 };
    this._cam = { dx: 0, dy: 0 };
    this._level = 1;
    this._locked = {};
    rootEl.classList.add('fb-ui-root');
    for (const [key, scr] of Object.entries(layout.screens)) this._build(key, scr);
    this._press();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    if (this.screens.levels) this.selectLevel(1);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this._refit());
  }

  // ---- building -------------------------------------------------------------------------------------------------
  _build(key, scr) {
    const box = document.createElement('div');
    box.className = 'fb-screen';
    box.dataset.screen = key;
    box.style.display = 'none';
    this.root.appendChild(box);
    const s = { key, box, nodes: scr.nodes, els: [], kids: scr.nodes.map(() => []), scaler: scr.scaler, anims: [] };
    this.screens[key] = s;
    scr.nodes.forEach((n, i) => { if (n.parent >= 0) s.kids[n.parent].push(i); });
    // Title_BG is tweened in from off-screen to its TitlePos marker (see the Move tween); the tween handles it
    scr.nodes.forEach((n, i) => {
      const el = document.createElement('div');
      el.className = 'fb-node';
      el.dataset.name = n.name;
      el.__n = n; el.__ov = null; el.__xf = '';
      (n.parent < 0 ? box : s.els[n.parent]).appendChild(el);
      s.els.push(el);
      if (n.image && n.image.enabled !== false) this._image(el, n, s);
      if (n.text) this._textInit(el, n.text);
      if (n.button) el.classList.add('fb-btn');
      if (n.canvasGroup) el.style.opacity = n.canvasGroup.alpha;
      if (n.mask) el.style.overflow = 'hidden';
      // the first-run tutorial dimmer would grey out every menu
      const off = !n.active || n.name === 'Tutorial';
      el.classList.toggle('fb-off', off);
      el.__active = !off;
    });
  }

  _image(el, n, s) {
    const im = n.image, c = im.color;
    const layer = document.createElement('div');
    layer.className = 'fb-img';
    el.appendChild(layer);
    el.__layer = layer;
    if (!im.sprite) { layer.style.background = css(c); return; }
    const sp = this.layout.sprites[im.sprite];
    const url = `url("${this.base}${im.sprite}.webp")`;
    const r = n.rect;
    const fullStretch = r && r.anchorMin[0] === 0 && r.anchorMin[1] === 0 && r.anchorMax[0] === 1 && r.anchorMax[1] === 1 &&
      r.sizeDelta[0] === 0 && r.sizeDelta[1] === 0;
    // full-screen backdrop: cover instead of distorting on a phone aspect
    const cover = fullStretch && im.type === 'simple' && sp && sp.w >= 1900;
    const sliced = im.type === 'sliced' && sp && sp.border.some((b) => b > 0);
    let slice, width;
    if (sliced) {
      const [l, b, rr, t] = sp.border;
      const f = (s.scaler.referencePixelsPerUnit || 100) / sp.ppu / (im.ppuMultiplier || 1);
      const k = (sp.px ? sp.px[0] : sp.w) / sp.w; // webp can be stored at a different pixel size than the sprite rect
      slice = `${t * k} ${rr * k} ${b * k} ${l * k}${im.fillCenter === false ? '' : ' fill'}`;
      width = `${px(t * f)} ${px(rr * f)} ${px(b * f)} ${px(l * f)}`;
    }
    const size = im.preserveAspect ? 'contain' : cover ? 'cover' : '100% 100%';
    const paint = (t, tint) => {
      t.className = tint ? 'fb-base fb-tint' : 'fb-base';
      if (sliced) {
        t.style.borderStyle = 'solid';
        t.style.borderWidth = width;
        if (tint) {
          t.style.borderColor = 'transparent';
          t.style.webkitMaskBoxImageSource = url;
          t.style.webkitMaskBoxImageSlice = slice;
          t.style.webkitMaskBoxImageWidth = width;
        } else {
          t.style.borderImage = `${url} ${slice} / ${width} stretch`;
        }
      } else if (tint) {
        Object.assign(t.style, { webkitMaskImage: url, webkitMaskSize: size, webkitMaskRepeat: 'no-repeat', webkitMaskPosition: 'center' });
      } else {
        Object.assign(t.style, { backgroundImage: url, backgroundSize: size, backgroundRepeat: 'no-repeat', backgroundPosition: 'center' });
      }
    };
    const base = document.createElement('div');
    paint(base, false);
    layer.appendChild(base);
    if (!isWhite(c)) {
      const tint = document.createElement('div');
      paint(tint, true);
      tint.style.background = rgb(c);
      layer.appendChild(tint);
    }
    if (c[3] < 1) layer.style.opacity = c[3];
    if (im.type === 'filled') this._clip(layer, im, im.fillAmount);
  }

  _clip(layer, im, v) {
    v = Math.max(0, Math.min(1, v));
    layer.style.clipPath = im.fillOrigin === 1 ? `inset(0 0 0 ${(1 - v) * 100}%)` : `inset(0 ${(1 - v) * 100}% 0 0)`;
  }

  // ---- rect / layout --------------------------------------------------------------------------------------------
  _xf(el) { el.style.transform = (el.__xf + (el.__down ? ' scale(.95)' : '')).trim(); }

  _applyRect(el, ov) {
    const n = el.__n, r = ov || el.__ov || n.rect;
    const st = el.style;
    if (!r || n.parent < 0) { // canvas root fills its container (its exported rect is the Unity world-space one)
      Object.assign(st, { left: '0', top: '0', width: '100%', height: '100%' });
      return;
    }
    const [amx, amy] = r.anchorMin, [axx, axy] = r.anchorMax, [sx, sy] = r.sizeDelta, [pvx, pvy] = r.pivot, [ax, ay] = r.anchoredPosition;
    st.left = `calc(${amx * 100}% + ${px(ax - pvx * sx)})`;
    st.bottom = `calc(${amy * 100}% + ${px(ay - pvy * sy)})`;
    st.width = `max(0px, calc(${(axx - amx) * 100}% + ${px(sx)}))`;
    st.height = `max(0px, calc(${(axy - amy) * 100}% + ${px(sy)}))`;
    st.top = 'auto';
    st.transformOrigin = `${pvx * 100}% ${(1 - pvy) * 100}%`;
    const [scx, scy] = r.scale;
    el.__xf = (scx === 1 && scy === 1 ? '' : `scale(${scx}, ${scy})`) + (r.rotZ ? ` rotate(${-r.rotZ}deg)` : '');
    this._xf(el);
  }

  _relayout(s) {
    s.els.forEach((el) => { el.__ov = null; this._applyRect(el); });
    s.els.forEach((el, i) => {
      const L = s.nodes[i].layout;
      if (L && L.type === 'grid') this._grid(s, i, el, L);
    });
  }

  // Unity GridLayoutGroup: children are forced to cellSize and top-left anchors.
  _grid(s, i, el, L) {
    const kids = s.kids[i].filter((k) => s.els[k].__active);
    if (!kids.length) return;
    const W = el.offsetWidth, H = el.offsetHeight;
    const [cw, ch] = L.cellSize, [spx, spy] = L.spacing, [pl, pb, pr, pt] = L.padding;
    const rows = L.constraint === 2 ? L.constraintCount : L.constraint === 1 ? Math.ceil(kids.length / L.constraintCount) : 1;
    const cols = L.constraint === 1 ? L.constraintCount : Math.ceil(kids.length / rows);
    const totW = cols * cw + (cols - 1) * spx, totH = rows * ch + (rows - 1) * spy;
    const al = L.childAlignment;
    const fx = al.endsWith('Left') ? 0 : al.endsWith('Right') ? 1 : 0.5;
    const fy = al.startsWith('Upper') ? 0 : al.startsWith('Lower') ? 1 : 0.5;
    const x0 = pl + (W - pl - pr - totW) * fx, y0 = pt + (H - pt - pb - totH) * fy;
    kids.forEach((k, j) => {
      const x = x0 + (j % cols) * (cw + spx), y = y0 + Math.floor(j / cols) * (ch + spy);
      const r0 = s.nodes[k].rect;
      const ov = { ...r0, anchorMin: [0, 1], anchorMax: [0, 1], sizeDelta: [cw, ch],
        anchoredPosition: [x + cw * r0.pivot[0], -(y + ch * (1 - r0.pivot[1]))] };
      s.els[k].__ov = ov;
      this._applyRect(s.els[k], ov);
    });
  }

  resize() {
    const W = this.root.clientWidth || window.innerWidth, H = this.root.clientHeight || window.innerHeight;
    const k = Math.min(W / REF_W, H / REF_H);
    this.scale = k;
    for (const s of Object.values(this.screens)) {
      s.box.style.width = px(W / k);
      s.box.style.height = px(H / k);
      s.box.style.transform = `scale(${k})`;
      if (s.box.style.display !== 'none') this._relayout(s);
    }
    this._refit();
  }

  // ---- text -----------------------------------------------------------------------------------------------------
  _textInit(el, t) {
    const wrap = document.createElement('div');
    wrap.className = 'fb-text';
    const span = document.createElement('span');
    wrap.appendChild(span);
    el.appendChild(wrap);
    const [h, v] = t.alignment || ['center', 'middle'];
    wrap.style.justifyContent = h === 'left' ? 'flex-start' : h === 'right' ? 'flex-end' : 'center';
    wrap.style.alignItems = v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';
    wrap.style.textAlign = h === 'left' ? 'left' : h === 'right' ? 'right' : 'center';
    span.style.color = css(t.color);
    // legacy Text: fontStyle 1/3 bold, 2/3 italic. TMP: bit 1 bold, 2 italic, 16 UpperCase (Plumpfull is already heavy, so no synthetic bold)
    if (t.fontStyle & 2) span.style.fontStyle = 'italic';
    if (!t.legacy && t.fontStyle & 16) span.style.textTransform = 'uppercase';
    if (t.fx) {
      span.style.setProperty('--ol', `${Math.min(0.3, t.fx._OutlineWidth || 0) * 0.5}em`);
      span.style.setProperty('--olc', css(t.fx._OutlineColor || [0, 0, 0, 1]));
      if (t.fx._UnderlayColor) span.style.textShadow = `0.03em 0.05em 0 ${css(t.fx._UnderlayColor)}`;
      span.classList.add('fb-outline');
    }
    span.textContent = t.text || '';
    el.__t = { wrap, span, auto: !!t.autoSize, size: (t.autoSize ? t.autoMax : 0) || t.fontSize || 40, min: t.autoSize ? t.autoMin : 0 };
  }

  // BestFit / TMP auto-size: largest size in [autoMin, autoMax] that fits the rect
  _fit(el) {
    const T = el.__t;
    if (!T || !el.__active) return;
    let size = T.size;
    T.span.style.fontSize = px(size);
    if (!T.auto) return;
    const w = T.wrap.clientWidth, h = T.wrap.clientHeight;
    while (size > (T.min || 10) && (T.span.offsetHeight > h + 1 || T.span.scrollWidth > w + 1)) {
      size -= 1;
      T.span.style.fontSize = px(size);
    }
  }

  _refit() {
    for (const s of Object.values(this.screens)) if (s.box.style.display !== 'none') s.els.forEach((el) => this._fit(el));
  }

  // ---- tweens (DOTweenAnimation) --------------------------------------------------------------------------------
  // Individual CSS properties (translate / rotate / scale / opacity) compose with the node's rect transform, so a tween is
  // expressed relative to the node's laid-out state.
  _startTween(s, i, row) {
    const [, type, vx, vy, vz, f, dur, delay, ease, loops, loopType, from, rel, , id] = row;
    const el = s.els[i], n = s.nodes[i], r = n.rect;
    const cur = { x: r.anchoredPosition[0], y: r.anchoredPosition[1], sc: r.scale[0] || 1, rot: r.rotZ,
      a: n.canvasGroup ? n.canvasGroup.alpha : 1 };
    let kf, opts = {};
    const pair = (a, b) => (from ? [b, a] : [a, b]); // [start, end] of the tween; isFrom plays end->current
    if (type === 1) {
      let ex = rel ? cur.x + vx : vx, ey = rel ? cur.y + vy : vy;
      const tp = s.nodes.find((m) => m.name === 'TitlePos');
      if (n.name === 'Title_BG' && tp) [ex, ey] = tp.rect.anchoredPosition; // dumped end value is a stale designer value
      const [a, b] = from ? [[ex, ey], [cur.x, cur.y]] : [[cur.x, cur.y], [ex, ey]];
      kf = { translate: [`${a[0] - cur.x}px ${-(a[1] - cur.y)}px`, `${b[0] - cur.x}px ${-(b[1] - cur.y)}px`] };
    } else if (type === 3) {
      if (loopType === 2) { // Incremental: keep turning by vz every cycle
        kf = { rotate: ['0deg', `${-vz}deg`] };
        opts.iterationComposite = 'accumulate';
      } else {
        const e = rel ? cur.rot + vz : vz;
        const [a, b] = from ? [e, cur.rot] : [cur.rot, e];
        kf = { rotate: [`${-(a - cur.rot)}deg`, `${-(b - cur.rot)}deg`] };
      }
    } else if (type === 5) {
      const [a, b] = from ? [f / cur.sc, 1] : [1, f / cur.sc];
      kf = { scale: [`${a}`, `${b}`] };
    } else if (type === 7) {
      const [a, b] = from ? [f, cur.a] : [cur.a, f];
      kf = { opacity: [a, b] };
    } else if (type === 11) { // punch scale: out to 1+v and settle
      kf = { scale: ['1', `${1 + vx}`, '1'] };
    } else return null;
    const a = el.animate(kf, {
      duration: Math.max(1, dur * 1000), delay: delay * 1000, easing: easeCss(ease), fill: loops < 0 ? 'backwards' : 'both',
      iterations: loops < 0 ? Infinity : Math.max(1, loops), direction: loopType === 1 ? 'alternate' : 'normal', ...opts,
    });
    a.__id = id; a.__i = i;
    s.anims.push(a);
    return a;
  }

  _playTweens(s, { i, id, auto } = {}) {
    const rows = TWEENS[s.key] || [];
    const sub = i == null ? null : new Set(this._subtree(s, i));
    s.anims = s.anims.filter((a) => {
      if ((sub && !sub.has(a.__i)) || (id !== undefined && a.__id !== id)) return true;
      a.cancel();
      return false;
    });
    for (const row of rows) {
      const idx = s.nodes.findIndex((n) => n.path === row[0]);
      if (idx < 0 || (sub && !sub.has(idx))) continue;
      if (id !== undefined ? row[14] !== id : auto && !row[13]) continue;
      this._startTween(s, idx, row);
    }
    // menu Play button: pulse 1 -> 1.08 once its scale-in is done
    if (auto && s.key === 'menu') {
      const pi = s.nodes.findIndex((n) => n.name === 'Play_Button');
      if (pi >= 0 && (!sub || sub.has(pi))) {
        const a = s.els[pi].animate({ scale: ['1', '1.08'] }, { duration: 550, delay: 2000, easing: 'ease-in-out', iterations: Infinity, direction: 'alternate', fill: 'backwards' });
        a.__i = pi; a.__id = 'pulse';
        s.anims.push(a);
      }
    }
  }

  _subtree(s, i) {
    const out = [i];
    for (const k of s.kids[i]) out.push(...this._subtree(s, k));
    return out;
  }

  // Play the tween(s) with this DOTween id on a node (non-autoPlay ones, e.g. "pop", "jumpNow", "IsOpen"); id omitted = all of its tweens.
  tween(key, path, id) {
    const { s, i } = this._find(key, path);
    this._playTweens(s, { i, id });
  }

  // Jump finite tweens to their end (tests, fast-forward); looping ones keep running.
  skipTweens() {
    for (const s of Object.values(this.screens)) for (const a of s.anims) if (a.effect.getComputedTiming().iterations !== Infinity) a.finish();
  }

  // ---- input ----------------------------------------------------------------------------------------------------
  _press() {
    const down = (e) => {
      const el = e.target.closest && e.target.closest('.fb-btn');
      if (!el || !el.__n) return;
      el.__down = true; this._xf(el);
      const up = () => { el.__down = false; this._xf(el); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    };
    this.root.addEventListener('pointerdown', down);
  }

  // Click / tap
  on(key, path, handler) {
    const el = this.el(key, path);
    el.classList.add('fb-btn');
    el.addEventListener('click', (e) => { e.stopPropagation(); handler(e); });
    return el;
  }

  // Hold: handler(true) on pointer down, handler(false) on release / cancel / leave.
  onPress(key, path, handler) {
    const el = this.el(key, path);
    el.classList.add('fb-btn');
    let id = null;
    el.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId; el.setPointerCapture(id); e.preventDefault(); handler(true);
    });
    const end = (e) => { if (e.pointerId !== id) return; id = null; handler(false); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    return el;
  }

  // Virtual stick on "Joystick-Region (LeftRightForward)": value = offset from the stick centre / radius, y up. joystick() -> {x, y}.
  _initJoystick(key = 'hud') {
    if (!this.screens[key] || this._joyEl) return;
    const region = this.el(key, 'Joystick-Region (LeftRightForward)');
    const hat = this.el(key, 'Joystick-Region (LeftRightForward)/Joystick/Joystick-Hat');
    this._joyEl = region;
    region.style.pointerEvents = 'auto';
    region.style.touchAction = 'none';
    let id = null;
    const move = (e) => {
      const b = region.getBoundingClientRect();
      const R = b.width / 2;
      let dx = (e.clientX - (b.left + R)) / R, dy = (e.clientY - (b.top + b.height / 2)) / R;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this._joy = { x: dx, y: -dy };
      const hr = R / this.scale * 0.55; // hat travel in canvas units
      hat.style.translate = `${dx * hr}px ${dy * hr}px`;
    };
    region.addEventListener('pointerdown', (e) => { if (id !== null) return; id = e.pointerId; region.setPointerCapture(id); e.preventDefault(); move(e); });
    region.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; this._joy = { x: 0, y: 0 }; hat.style.translate = ''; };
    region.addEventListener('pointerup', end);
    region.addEventListener('pointercancel', end);
    region.addEventListener('lostpointercapture', end);
  }

  joystick() { this._initJoystick(); return { ...this._joy }; }

  // Drag deltas (CSS px) on "CameraPad" accumulated since the last call.
  _initCameraPad(key = 'hud') {
    if (!this.screens[key] || this._camEl) return;
    const pad = this.el(key, 'CameraPad');
    this._camEl = pad;
    pad.style.pointerEvents = 'auto';
    pad.style.touchAction = 'none';
    const last = new Map();
    pad.addEventListener('pointerdown', (e) => { last.set(e.pointerId, [e.clientX, e.clientY]); pad.setPointerCapture(e.pointerId); e.preventDefault(); });
    pad.addEventListener('pointermove', (e) => {
      const p = last.get(e.pointerId);
      if (!p) return;
      this._cam.dx += e.clientX - p[0]; this._cam.dy += e.clientY - p[1];
      last.set(e.pointerId, [e.clientX, e.clientY]);
    });
    const end = (e) => last.delete(e.pointerId);
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    pad.addEventListener('lostpointercapture', end);
  }

  cameraPad() {
    this._initCameraPad();
    const d = this._cam;
    this._cam = { dx: 0, dy: 0 };
    return d;
  }

  // ---- lookup ---------------------------------------------------------------------------------------------------
  // Exact path first, then any node whose path ends with "/<path>" (first in document order wins).
  _find(key, path) {
    const s = this.screens[key];
    if (!s) throw new Error(`screen "${key}" not found`);
    let i = s.nodes.findIndex((n) => n.path === path);
    if (i < 0) i = s.nodes.findIndex((n) => n.path.endsWith('/' + path));
    if (i < 0) throw new Error(`node "${path}" not found in screen "${key}"`);
    return { s, i, el: s.els[i] };
  }

  // ---- public API -----------------------------------------------------------------------------------------------
  show(key) {
    const s = this.screens[key];
    s.box.style.display = 'block';
    this._relayout(s);
    s.els.forEach((el) => this._fit(el));
    this._playTweens(s, { auto: true });
    if (key === 'hud') { this._initJoystick(); this._initCameraPad(); }
  }
  hide(key) {
    const s = this.screens[key];
    s.box.style.display = 'none';
    s.anims.forEach((a) => a.cancel());
    s.anims = [];
  }
  el(key, path) { return this._find(key, path).el; }

  setActive(key, path, on, { ancestors = false } = {}) {
    const { s, i, el } = this._find(key, path);
    const was = el.__active;
    const set = (e, v) => { e.__active = v; e.classList.toggle('fb-off', !v); };
    set(el, on);
    if (on && ancestors) for (let p = s.nodes[i].parent; p > 0; p = s.nodes[p].parent) set(s.els[p], true);
    const par = s.nodes[i].parent;
    const shown = s.box.style.display !== 'none';
    if (par >= 0 && s.nodes[par].layout && shown) this._relayout(s);
    if (shown) {
      s.els.forEach((e) => this._fit(e));
      if (on && !was) this._playTweens(s, { i, auto: true }); // DOTweenVisualManager: autoPlay tweens restart on enable
    }
  }

  setText(key, path, str) {
    const { el } = this._find(key, path);
    if (!el.__t) {
      const nm = el.__n.name;
      this._textInit(el, {
        text: '', color: [1, 1, 1, 1], alignment: ['center', 'middle'], autoSize: false,
        fontSize: nm === 'TimelineText' ? 110 : nm === 'SubtitlesText' ? 44 : 40,
        fontStyle: 1, fx: { _OutlineWidth: 0.2, _OutlineColor: [0, 0, 0, 1] },
      });
    }
    el.__t.span.textContent = str;
    this._fit(el);
  }

  // Slider (its Fill and Handle children follow) or a filled image itself.
  setFill(key, path, v) {
    v = Math.max(0, Math.min(1, v));
    const { s, i } = this._find(key, path);
    const n = s.nodes[i];
    const desc = (name) => {
      const walk = (j) => {
        for (const k of s.kids[j]) { if (s.nodes[k].name === name) return k; const r = walk(k); if (r != null) return r; }
        return null;
      };
      return walk(i);
    };
    const fi = n.slider ? desc('Fill') : i;
    if (fi == null) throw new Error(`slider "${path}" has no Fill child`);
    const fn = s.nodes[fi], fel = s.els[fi];
    if (fn.image && fn.image.type === 'filled' && fel.__layer) this._clip(fel.__layer, fn.image, v);
    else { const r = fn.rect; this._applyRect(fel, { ...r, anchorMax: [v, r.anchorMax[1]] }); }
    if (n.slider) {
      const h = desc('Handle');
      if (h != null) {
        const r = s.nodes[h].rect;
        this._applyRect(s.els[h], { ...r, anchorMin: [v, r.anchorMin[1]], anchorMax: [v, r.anchorMax[1]] });
      }
    }
  }

  // hud Fader: full-screen black image whose CanvasGroup alpha is driven here
  fade(alpha) {
    const { el } = this._find('hud', 'Fader');
    el.style.opacity = alpha;
    el.style.pointerEvents = alpha > 0.01 ? 'auto' : 'none';
  }

  // ---- level select ---------------------------------------------------------------------------------------------
  // LevelSelectionManager has useScrollView = 0: BtnsContainer_WithoutScroll holds the five cards stacked at one spot
  // and only the current one is active (left/right step through them); the Play button is the separate Footer/Play_Button.
  selectLevel(n) {
    this._level = n;
    for (let i = 1; i <= 5; i++) this.setActive('levels', `BtnsContainer_WithoutScroll/Level${i}Button`, i === n);
  }

  // The export has no lock art (Lock_Image has no sprite), so a locked card gets a dark veil and a drawn padlock.
  setLevelState(n, { locked } = {}) {
    const el = this.el('levels', `BtnsContainer_WithoutScroll/Level${n}Button/Lock_Image`);
    if (locked !== undefined) {
      this._locked[n] = !!locked;
      if (!el.__lock) {
        el.__lock = true;
        el.__layer.style.background = 'rgba(0,0,0,.55)';
        el.__layer.style.borderRadius = '40px';
        const lk = document.createElement('div');
        lk.className = 'fb-padlock';
        el.appendChild(lk);
      }
      this.setActive('levels', `BtnsContainer_WithoutScroll/Level${n}Button/Lock_Image`, !!locked);
    }
    return { locked: !!this._locked[n] };
  }
}
