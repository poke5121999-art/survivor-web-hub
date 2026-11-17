// HUD bound to the sim: state.ui (derived each step by the sim) decides which original panel is up, buttons call
// sim.action like the original onClick listeners. Texts are the original strings translated (vi.js).
//   coins     coins.AnimateCoinChange: label tweens 0.5 s OutQuad, FormatNumber k/M/B; coin fly (PlayCoinAnimation:
//             10 images from the canvas centre to a random point in the unit circle * spreadRadius 300 in 0.3 s, then
//             to the counter in flyDuration 0.6 s)
//   health    playerHealth.DOValue(hp, 0.3 s)
//   toast     TextDisplayer.ShowText: displayText DOAnchorPos (0, 250) in 0.5 s OutBack, stay 2.0 s, back InBack
//   steal     PlayerCarryController.stealFillImage (Canvas/InGame/Image, radial 360 from the bottom, clockwise)
import { t, tf } from './vi.js';

const P = {
  place: 'PanelsAndButtons/place btn', placeText: 'PanelsAndButtons/place btn/Text (TMP)',
  sell: 'PanelsAndButtons/SellPanle', sellBtn: 'PanelsAndButtons/SellPanle/Sell',
  upgrade: 'PanelsAndButtons/UPGRADE BUTTON', upgradeText: 'PanelsAndButtons/UPGRADE BUTTON/Text (TMP)',
  lock: 'PanelsAndButtons/lockUnlockPlayerHouse', lock60: 'PanelsAndButtons/lockUnlockPlayerHouse/lockfor1mint',
  lock180: 'PanelsAndButtons/lockUnlockPlayerHouse/lockfor3minuts',
  revive: 'InGame/Fadepanel', reviveBtn: 'InGame/Fadepanel/Panel/Panel/Button', noThanks: 'InGame/Fadepanel/Panel/Panel/Button (1)',
  steal: 'InGame/Image', toast: 'TextDisplayer/displayText', toastText: 'TextDisplayer/displayText/Text (TMP)',
  coins: 'InGame/TopPanel/Coins', shop: 'InGame/ShopButton', attack: 'InGame/Attack',
  pause: 'InGame/TopPanel/Pause', pausePanel: 'PauseGame', resume: 'PauseGame/Panel/Resume', restart: 'PauseGame/Panel/Restart',
  home: 'PauseGame/Panel/Home', setting: 'InGame/TopPanel/Setting',
  instruction: 'instruction panel', instructionText: 'instruction panel/Text (TMP)',
};
const TOAST = { hiddenY: 1142.9878, shownY: 250, move: 0.5, stay: 2.0 };
const COIN_FLY = { spread: 300, spreadTime: 0.3, fly: 0.6 };

const outQuad = x => 1 - (1 - x) * (1 - x);
const outBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
const inBack = x => { const c1 = 1.70158, c3 = c1 + 1; return c3 * x ** 3 - c1 * x * x; };

// coins.FormatNumber (coins.c:40-62).
export function formatCoins(n) {
  const f = Math.fround;
  const one = v => { const r = Math.round(f(v) * 10) / 10; return String(r); };
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${one(n / 1000)}k`;
  if (n < 1e9) return `${one(n / 1e6)}M`;
  return `${one(n / 1e9)}B`;
}

export class Ui {
  constructor({ sim, hud, sound, onPurchase = () => {}, onPause = () => {} }) {
    this.sim = sim;
    this.hud = hud;
    this.sound = sound;
    this.onPurchase = onPurchase;
    this.onPause = onPause;
    this.coinShown = sim.state.coins;
    this.coinTween = null;
    this.hpShown = sim.state.actors[0].hp;
    this.hpTween = null;
    this.toasts = [];
    this.toast = null;
    this.flies = [];
    this.log = [];                          // toasts shown, for tests
    this.shown = {};
    this.bind();
    hud.coins = formatCoins(this.coinShown);
    hud.setHealth(this.hpShown);
    for (const k of ['place', 'sell', 'upgrade', 'lock', 'revive', 'steal', 'form 1', 'form 2', 'form 3']) this.set(k, false);
  }

  node(k) { return this.hud.node(P[k] || `PanelsAndButtons/${k}`); }

  set(k, on) {
    if (this.shown[k] === on) return;
    this.shown[k] = on;
    this.hud.show(P[k] || `PanelsAndButtons/${k}`, on);
  }

  bind() {
    const sim = this.sim;
    const click = (k, f) => {
      const el = this.node(k);
      if (!el) return;
      el.addEventListener('click', e => { e.stopPropagation(); this.sound.play('click'); f(); });
    };
    click('place', () => sim.action('place'));
    click('sellBtn', () => sim.action('sell'));
    click('upgrade', () => { if (sim.action('upgradeFarm')) this.onPurchase(); });
    click('lock60', () => { if (sim.action('lockGate', { long: false })) this.onPurchase(); });
    click('lock180', () => { if (sim.action('lockGate', { long: true })) this.onPurchase(); });       // ad: granted at once
    for (const f of [1, 2, 3]) click(`form ${f}`, () => sim.action('unlockAiGate', { farm: f }));   // ad: granted at once
    click('reviveBtn', () => sim.action('revive'));                                                  // ad: granted at once
    click('noThanks', () => sim.action('noThanks'));
    click('coins', () => { if (sim.action('adCoins')) this.onPurchase(); });                        // coins.WatchAds: +100
    // ShopButton, Setting, Pause and their panels: panels.js (Drop 2)
  }

  // TextDisplayer.ShowText; a new message restarts the sequence like a new DOTween sequence on the same panel.
  show(text) {
    this.log.push(text);
    if (this.log.length > 30) this.log.shift();
    this.hud.setText(P.toastText, text);
    this.toast = { t: 0 };
    this.sound.play('new_notification_09_352705');
  }

  onEvent(e) {
    const s = this.sim.state;
    switch (e.type) {
      case 'toast': this.show(t(e.text)); break;
      case 'coins': this.coinTween = { from: this.coinShown, to: e.coins, t: 0 }; break;
      case 'animateCoin': this.flyCoins(); break;
      case 'hit': case 'revive': case 'health':
        if (e.target === 0 || e.type !== 'hit') this.hpTween = { from: this.hpShown, to: s.actors[0].hp, t: 0 };
        break;
      default:
    }
  }

  flyCoins() {
    const panel = this.hud.node('CoinPanel');
    if (!panel) return;
    const r = this.hud.rect(P.coins), s = this.hud.scale, cw = this.hud.size[0] / s, ch = this.hud.size[1] / s;
    const target = [r.x / s + 55 - cw / 2, r.cy / s - ch / 2];
    for (let i = 0; i < 10; i++) {
      const el = this.hud.node(`CoinPanel/Image${i ? ` (${i})` : ''}`);
      if (!el) continue;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * COIN_FLY.spread;
      this.hud.show(`CoinPanel/Image${i ? ` (${i})` : ''}`, true);
      this.flies.push({ el, t: 0, mid: [Math.cos(a) * d, Math.sin(a) * d], target });
    }
  }

  // Age tweens by dt (every sim step, drawn or not).
  step(dt) {
    if (this.coinTween) {
      const tw = this.coinTween;
      tw.t += dt;
      const k = Math.min(1, tw.t / 0.5);
      this.coinShown = Math.round(tw.from + (tw.to - tw.from) * outQuad(k));
      if (k >= 1) { this.coinShown = tw.to; this.coinTween = null; }
    }
    if (this.hpTween) {
      const tw = this.hpTween;
      tw.t += dt;
      const k = Math.min(1, tw.t / 0.3);
      this.hpShown = tw.from + (tw.to - tw.from) * k;
      if (k >= 1) this.hpTween = null;
    }
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t > TOAST.move * 2 + TOAST.stay) this.toast = null;
    }
    for (const f of this.flies) f.t += dt;
    this.flies = this.flies.filter(f => {
      if (f.t < COIN_FLY.spreadTime + COIN_FLY.fly) return true;
      f.el.style.translate = '';
      f.el.classList.add('ugui-off');
      return false;
    });
  }

  // Panels from state.ui, texts, tween positions. Cheap: only DOM writes when something changed.
  draw() {
    const s = this.sim.state, ui = s.ui, hud = this.hud;
    hud.coins = formatCoins(this.coinShown);
    if (this.hpDrawn !== this.hpShown) { hud.setHealth(this.hpShown); this.hpDrawn = this.hpShown; }
    this.set('place', !!ui.placeButton);
    if (ui.placeButton) hud.setText(P.placeText, t(ui.placeButton));
    this.set('sell', !!ui.sellTarget);
    this.set('upgrade', !!ui.upgradePanel);
    if (ui.upgradePanel && ui.capacity) hud.setText(P.upgradeText, ui.capacity.cost > 0 ? tf('UPGRADE ${0}', ui.capacity.cost) : t('MAX LEVEL'));
    this.set('lock', !!ui.gateLock);
    for (const f of [1, 2, 3]) this.set(`form ${f}`, ui.aiGateUnlock === f);
    this.set('revive', !!ui.deathPanel);
    this.set('steal', !!ui.stealFill);
    if (ui.stealFill) this.fill(ui.stealFill.progress);
    // toast
    const el = hud.node(P.toast);
    if (el) {
      let y = TOAST.hiddenY;
      if (this.toast) {
        const tt = this.toast.t;
        if (tt < TOAST.move) y = TOAST.hiddenY + (TOAST.shownY - TOAST.hiddenY) * outBack(tt / TOAST.move);
        else if (tt < TOAST.move + TOAST.stay) y = TOAST.shownY;
        else y = TOAST.shownY + (TOAST.hiddenY - TOAST.shownY) * inBack(Math.min(1, (tt - TOAST.move - TOAST.stay) / TOAST.move));
      }
      const tr = `0px ${TOAST.hiddenY - y}px`;
      if (el.style.translate !== tr) el.style.translate = tr;
    }
    for (const f of this.flies) {
      let x, y;
      if (f.t < COIN_FLY.spreadTime) { const k = outQuad(f.t / COIN_FLY.spreadTime); x = f.mid[0] * k; y = f.mid[1] * k; }
      else { const k = Math.min(1, (f.t - COIN_FLY.spreadTime) / COIN_FLY.fly); x = f.mid[0] + (f.target[0] - f.mid[0]) * k; y = f.mid[1] + (f.target[1] - f.mid[1]) * k; }
      f.el.style.translate = `${x}px ${y}px`;
    }
  }

  // Radial 360 fill from the bottom, clockwise (Image.fillOrigin 0, fillClockwise true).
  fill(v) {
    const layer = this.hud.node(P.steal).querySelector(':scope > .ugui-img');
    const deg = Math.max(0, Math.min(1, v)) * 360;
    const m = `conic-gradient(from 180deg, #000 ${deg}deg, transparent ${deg}deg)`;
    if (layer.style.maskImage !== m) { layer.style.maskImage = m; layer.style.webkitMaskImage = m; }
  }

  // Tutorial instruction panel (TutorialManager text), shown while there is a text.
  instruction(text) {
    this.set('instruction', !!text);
    if (text) this.hud.setText(P.instructionText, t(text));
  }
}
