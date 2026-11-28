// Pockets dialogue (Game.Intro.DialogueScreen, rules/intro.md §3): lower-third panel, portrait by mood with talk/blink
// frames, typing at 46 chars/s (+0.16 s after punctuation), Enter/Space/click = next (finish typing first),
// Esc = skip all; 0.3 s input guard; 6 page pips. The game pauses while it is open.
import { T } from '../sim/i18n.js';
const UI = './art/ui/';
const MOODS = ['neutral', 'sly', 'surprised', 'delighted'];
const PAGES = [['intro.thief.p1', 1], ['intro.thief.p2', 3], ['intro.thief.p3', 2], ['intro.thief.p4', 1], ['intro.thief.p5', 0]];
const D = { cps: 46, punct: 0.16, guard: 0.3, mouthStep: 0.075 };
// mb:Game.Intro.DialoguePortrait "ThiefPortrait": canvas 768x932, overlay rects (x, y from the bottom, w, h) per mood
const PORTRAIT = { w: 768, h: 932, moods: {
  neutral: { blink: [372, 592, 300, 148], half: [508, 504, 112, 56], open: [508, 492, 112, 68] },
  sly: { blink: [468, 580, 208, 144], half: [504, 472, 156, 104], open: [504, 464, 156, 112] },
  surprised: { blink: [440, 604, 228, 148], half: [524, 500, 64, 72], open: [524, 488, 64, 84] },
  delighted: { blink: [400, 608, 284, 140], half: [484, 476, 168, 124], open: [484, 468, 168, 132] } } };
const PUNCT = '.,!?:;…';

export class Dialogue {
  constructor(root, sfx, blip) { this.root = root; this.sfx = sfx; this.blip = blip; this.open = false; }
  // pages: [[textKey, moodIndex], ...] (default: the intro script)
  show(onDone, pages) {
    this.pages = pages || PAGES;
    this.open = true; this.onDone = onDone; this.page = 0; this.t = 0; this.blinkT = 1.2;
    this.root.innerHTML = `<div class="screen dlgScreen" id="dlg"><div class="dlg">
      <div class="portrait"><img id="dlgFace" alt=""><img id="dlgMouth" alt=""><img id="dlgEyes" alt=""></div><div class="dlgBody"><div class="dlgName">${T('intro.thief.name')}</div><div class="dlgText" id="dlgText"></div>
      <div class="dlgFoot"><span class="pips" id="dlgPips"></span><button class="sbtn dlgSkip" id="dlgSkip"><b>Esc</b>${T('intro.dialogue.skip')}</button><span><b>Enter</b><span id="dlgNext"></span></span></div></div></div></div>`;
    this.$ = (id) => this.root.querySelector('#' + id);
    this.$('dlg').addEventListener('pointerdown', (e) => { e.preventDefault(); this.next(); });
    this.$('dlgSkip').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.skip(); });
    this.startPage();
  }
  startPage() {
    const [key, mood] = this.pages[this.page];
    this.text = T(key); this.shown = 0; this.wait = 0; this.mood = MOODS[mood]; this.guard = this.t + D.guard;
    this.$('dlgPips').innerHTML = this.pages.map((_, i) => `<i class="${i <= this.page ? 'on' : ''}"></i>`).join('') + '<i></i>';
    this.$('dlgNext').textContent = T(this.page === this.pages.length - 1 ? 'intro.dialogue.done' : 'intro.dialogue.next');
  }
  next() {
    if (!this.open || this.t < this.guard) return;
    if (this.shown < this.text.length) { this.shown = this.text.length; return; }
    this.sfx('UiClick');
    if (++this.page >= this.pages.length) return this.close();
    this.startPage();
  }
  skip() { if (this.open && this.t >= this.guard) this.close(); }
  close() { this.open = false; this.root.innerHTML = ''; const f = this.onDone; this.onDone = null; f && f(); }
  update(dt) {
    if (!this.open) return;
    this.t += dt;
    const typing = this.shown < this.text.length;
    if (typing) {
      this.wait -= dt;
      while (this.wait <= 0 && this.shown < this.text.length) {
        const ch = this.text[this.shown++]; this.wait += 1 / D.cps + (PUNCT.includes(ch) ? D.punct : 0);
        if (ch !== ' ' && this.shown % 2 === 0) this.blip();
      }
      this.$('dlgText').textContent = this.text.slice(0, this.shown);
    }
    this.blinkT -= dt; const blink = this.blinkT < 0.12; if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 2;
    const mouth = typing ? (Math.floor(this.t / D.mouthStep) % 2 ? 'half' : 'open') : null;
    const key = this.mood + '|' + mouth + '|' + blink;
    if (this.face !== key) {
      this.face = key; const M = PORTRAIT.moods[this.mood];
      this.$('dlgFace').src = `${UI}thief_${this.mood}.webp`;
      const place = (el, r, src) => { if (!r) { el.style.display = 'none'; return; } el.style.display = ''; el.src = src;
        Object.assign(el.style, { left: r[0] / PORTRAIT.w * 100 + '%', bottom: r[1] / PORTRAIT.h * 100 + '%', width: r[2] / PORTRAIT.w * 100 + '%', height: r[3] / PORTRAIT.h * 100 + '%' }); };
      place(this.$('dlgMouth'), mouth && M[mouth], `${UI}thief_${this.mood}_talk${mouth === 'half' ? 1 : 2}.webp`);
      place(this.$('dlgEyes'), blink && M.blink, `${UI}thief_${this.mood}_blink.webp`);
    }
  }
}
