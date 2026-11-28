// The arrest cinematic (BustedDirector.Play, rules/finale.md §H): White 2.3 s -> Shots 9 s per player (front mugshot at
// 2.8 s, profile at 6.0 s) -> photo Strip 2.6 s -> dip 0.4 s -> Cell 4.7 s (bars slam at 1.5 s) -> After 3 s ->
// "THE END!" typed 0.3 s per letter, flips to "THE END?" -> +2.6 s -> done. Hold Skip 1 s (after the first second).
// The 3D sets (booking room, cell, the burglar) come from ./art/busted/ (Finale/Busted in level0) when present.
import * as THREE from 'three';
import { runClock } from '../sim/finale.js';

export const BEAT = { white: 2.3, shot: 9.0, strip: 2.6, toCell: 0.4, cell: 4.7, after: 3.0, typeAt: 0.5, typeStep: 0.3, flip: 1.1, endHold: 2.6, skipAfter: 1, skipHold: 1 };
const SHOT = { pushIn: 2.4, front: 2.8, card1: 4.3, turn: 4.5, turnLen: 0.8, profile: 6.0, card2: 7.4, peek: 7.5 };
// cell door travel after the slam (F/BustedDirector.c:1523-1550): 1 = open, 0 = shut
export function barsTravel(t) {
  if (t < 0) return 1;
  if (t < 0.95) { const u = t / 0.95; return 1 - (0.82 * u * u * u + 0.18 * u * u); }
  if (t < 1.15) return 0.04 * Math.sin(Math.PI * (t - 0.95) / 0.2);
  if (t < 1.27) return 0.0112 * Math.sin(Math.PI * (t - 1.15) / 0.12);
  return 0;
}
export const bulbSwing = (s) => 15 * Math.exp(-s / 2.6) * Math.sin(2 * Math.PI * s / 1.7);

export class Arrest {
  constructor(o) { this.o = o; this.active = false; this.photos = []; this.stage = null; }
  // timeline for n players (ShotScale 0.8 with >= 2 players)
  plan(players = 1) {
    const shots = BEAT.shot * players * (players >= 2 ? 0.8 : 1), L = this.o.T('ending.end.title').length;
    const b = { white: 0, shots: BEAT.white, strip: BEAT.white + shots };
    b.toCell = b.strip + BEAT.strip; b.cell = b.toCell + BEAT.toCell; b.after = b.cell + BEAT.cell; b.cont = b.after + BEAT.after;
    b.flip = b.cont + BEAT.typeAt + BEAT.typeStep * (L - 1) + BEAT.flip; b.end = b.flip + BEAT.endHold;
    return b;
  }
  async ensureStage() {
    if (this.stage !== null) return this.stage;
    try { const { BustedStage } = await import('./bustedstage.js'); this.stage = await new BustedStage(this.o).load(); } catch (e) { this.stage = false; this.stageError = String(e && e.message || e); console.warn('busted stage', this.stageError); }
    return this.stage;
  }
  play(record, done) {
    this.record = record; this.done = done; this.t = 0; this.skip = 0; this.active = true; this.photos = [];
    this.b = this.plan(record.players || 1);
    const T = this.o.T;
    const el = document.createElement('div'); el.id = 'arrest';
    el.innerHTML = `<div class="aWhite"></div><div class="aCaption"></div>
      <div class="aPlacard hidden"><div class="pn">${T('net.player', 1)}</div><div class="pi"></div><div class="pc">${T('ending.placard.charge')}</div></div>
      <div class="aThumbs"></div><div class="aPhoto hidden"><img alt=""></div><div class="aStrip hidden"></div>
      <div class="aSkip"><span class="ring"></span><b>E</b> ${T('ending.skip')}</div>`;
    document.body.appendChild(el); this.el = el;
    el.querySelector('.pi').innerHTML = `${T('ending.placard.finisher', record.finisher || 1)}<br>${T('ending.placard.time', runClock(record.seconds))}`;
    this.o.sfx('Appear', { vol: 0.6 });
    this.ensureStage().then(s => { if (s && this.active) s.begin(this); });
  }
  update(dt, input) {
    if (!this.active) return;
    dt = Math.min(dt, 0.1); this.t += dt; const t = this.t, b = this.b, el = this.el;
    // skip: hold Interact / Primary / the Skip button after 1 s
    const held = input && (input.keys.has('KeyE') || input.keys.has('Space') || input.primary || input.touch.interactHeld);
    if (t > BEAT.skipAfter && held) { this.skip += dt; if (this.skip >= BEAT.skipHold) return this.finish(); } else this.skip = Math.max(0, this.skip - dt * 2);
    el.querySelector('.aSkip .ring').style.background = `conic-gradient(#f9c52f ${Math.min(1, this.skip) * 360}deg, #ffffff33 0deg)`;
    // white: full for the White beat, dips in/out around the cell move
    let white = t < b.shots ? 1 : t < b.shots + 0.4 ? 1 - (t - b.shots) / 0.4 : 0;
    if (t >= b.toCell && t < b.cell) white = (t - b.toCell) / BEAT.toCell; else if (t >= b.cell && t < b.cell + 0.4) white = 1 - (t - b.cell) / 0.4;
    el.querySelector('.aWhite').style.opacity = white.toFixed(3);
    if (t - dt < 1.3 && t >= 1.3) this.o.sfx('UiClick', { vol: 1.2 });              // WhiteClick: the handcuffs
    if (t - dt < b.cell + 1.5 && t >= b.cell + 1.5) this.o.audio.playAny('shovel_hit_', 4, { vol: 0.9, pitch: 0.5 });   // the bars slam
    // placard over the mugshots while the shots run
    el.querySelector('.aPlacard').classList.add('hidden');   // the placard is drawn on the 3D board (bustedstage)
    // caption: "THE END!" typed, then "THE END?" with a punch
    const cap = el.querySelector('.aCaption');
    if (t >= b.cont) {
      const T = this.o.T, full = T('ending.end.title'), n = Math.max(0, Math.min(full.length, Math.floor((t - b.cont - BEAT.typeAt) / BEAT.typeStep) + 1));
      const flipped = t >= b.flip, k = flipped ? Math.max(0, 1 - (t - b.flip) / 0.3) : 0;
      cap.textContent = flipped ? T('ending.end.asked') : full.slice(0, t - b.cont >= BEAT.typeAt ? n : 0);
      cap.style.transform = `translate(-50%,-50%) scale(${1 + 0.07 * k})`;
    } else cap.textContent = '';
    // photo strip beat: the shots side by side (BustedUI/Strip), then the thumbs stay up (BustedUI/Thumbs)
    const strip = el.querySelector('.aStrip'), inStrip = t >= b.strip && t < b.toCell;
    if (inStrip && strip.classList.contains('hidden')) { strip.innerHTML = this.photosNow().map(u => `<img src="${u}" alt="">`).join(''); strip.classList.remove('hidden'); el.querySelector('.aThumbs').classList.add('hidden'); }
    if (!inStrip && !strip.classList.contains('hidden')) strip.classList.add('hidden');
    if (this.stage) this.stage.update(dt, t, b, this);
    if (t >= b.end) this.finish();
  }
  photosNow() { return this.stage ? this.stage.photos : []; }
  // the photo just taken pops up as a polaroid (BustedUI/Photo), then flies to the thumb row at the card time
  photoShow(url) {
    const ph = this.el && this.el.querySelector('.aPhoto'); if (!ph) return;
    ph.querySelector('img').src = url; ph.classList.remove('hidden', 'fly'); void ph.offsetWidth; ph.classList.add('pop');
  }
  photoFly() {
    const ph = this.el && this.el.querySelector('.aPhoto'); if (!ph || ph.classList.contains('hidden')) return;
    ph.classList.add('fly');
    const url = ph.querySelector('img').src;
    setTimeout(() => { if (!this.el) return; ph.classList.add('hidden'); ph.classList.remove('pop', 'fly'); const th = this.el.querySelector('.aThumbs'); const i = document.createElement('img'); i.src = url; th.appendChild(i); }, 450);
  }
  finish() {
    if (!this.active) return;
    this.active = false;
    if (this.stage) { this.photos = this.stage.photos.slice(); this.stage.end(); }
    if (this.el) this.el.remove(); this.el = null;
    const d = this.done; this.done = null; if (d) d();
  }
  // main loop asks: draw this scene instead of the hall while the cinematic runs
  view() { return this.active && this.stage && this.stage.ready ? this.stage : null; }
}
