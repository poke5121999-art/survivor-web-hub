// Level 5. PerformGestureTask: the shapes of the RecognizedEvents list (Loop, Heart, Bolt, Circle, Triangle) are
// shown one at a time; drawing one well enough (gesture.js score >= scoreToAccept, one stroke) runs its
// onGesturedRecognizedEvent, both fish play the Action-layer state named by AnimToPlay ("1st".."5th" -> Happy clips),
// a "Great / Nice / Perfect" pops up, and after the last shape the level is complete. The Gesture Recognizer canvas of
// the scene is not in the UI export, so the draw area and the reference card are drawn here (css in index.html).
import * as THREE from 'three';
import { Base } from '../components.js';
import { Rig } from '../anim.js';
import { PATTERNS, score } from '../gesture.js';

const ref = s => s.slice(1).split('#')[0];
const NEXT_DELAY = 2.6; // s of the happy animation before the next shape

export class PerformGestureTask extends Base {
  onEnable() {
    if (this.started) return;
    this.started = true;
    const g = this.game, d = this.data;
    this.list = d.recognizedEventsList.map(r => g.component(ref(r), 'RecognizedEvents'));
    this.count = d.recognizedCount;
    this.max = Math.max(d.maxRecognizedCount, this.list.length);
    const ff = g.find(ref(d.femaleFishAnim));
    this.female = ff.children.find(c => c.userData.node?.k?.Animator) || ff;
    this.femaleRig = new Rig(g.stage.lib, this.female);
    this.femaleRig.play('IDLE', 0);
    this.busy = 0;
    // their playOnAwake would fire as the task object turns on; they play on recognised shapes only
    const fx = g.particles;
    for (const r of d.victoryTextParticles) { const o = g.find(ref(r)); if (o) for (const e of fx.at(o, true)) { e.auto = false; fx.clear(e); } }
    this.ui = null;
  }

  onDisable() { this.dispose(); }

  get current() { return this.list.find(r => !r.recognized) || null; }

  // DOM: reference card with the shape + the free draw area (LeftArea) and a result line.
  build() {
    const layer = this.game.fx;
    const root = document.createElement('div');
    root.className = 'gesture';
    root.innerHTML = '<div class="g-area"><canvas></canvas><div class="g-tip">Draw the shape here</div></div>'
      + '<div class="g-ref"><canvas width="220" height="220"></canvas><div class="g-name"></div></div><div class="g-result"></div>';
    layer.appendChild(root);
    const area = root.querySelector('.g-area');
    const cv = area.querySelector('canvas');
    const stroke = [];
    let drawing = null;
    const fit = () => { cv.width = area.clientWidth; cv.height = area.clientHeight; };
    const xy = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    area.addEventListener('pointerdown', e => {
      if (this.busy > 0) return;
      e.preventDefault();
      area.setPointerCapture(e.pointerId);
      drawing = e.pointerId;
      stroke.length = 0;
      stroke.push(xy(e));
      this.paint(stroke);
    });
    area.addEventListener('pointermove', e => { if (e.pointerId !== drawing) return; stroke.push(xy(e)); this.paint(stroke); });
    const end = e => {
      if (e.pointerId !== drawing) return;
      drawing = null;
      this.recognize(stroke.slice());
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);
    this.ui = { root, area, cv, ref: root.querySelector('.g-ref canvas'), name: root.querySelector('.g-name'),
      result: root.querySelector('.g-result'), fit };
    requestAnimationFrame(fit);
    addEventListener('resize', fit);
    this.showCurrent();
  }

  paint(stroke) {
    const c = this.ui.cv.getContext('2d');
    c.clearRect(0, 0, this.ui.cv.width, this.ui.cv.height);
    if (stroke.length < 2) return;
    c.lineWidth = 10; c.lineCap = c.lineJoin = 'round'; c.strokeStyle = '#fff';
    c.shadowColor = 'rgba(0,80,160,.8)'; c.shadowBlur = 8;
    c.beginPath();
    stroke.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  }

  patternId(rec) {
    const name = rec.path.match(/\(([^)]+)\)$/)[1];
    return Object.keys(PATTERNS).find(k => k.toLowerCase() === name.toLowerCase());
  }

  showCurrent() {
    const rec = this.current;
    if (!this.ui || !rec) return;
    const id = this.patternId(rec), p = PATTERNS[id];
    const c = this.ui.ref.getContext('2d'), W = this.ui.ref.width, pad = 30;
    c.clearRect(0, 0, W, W);
    c.lineWidth = 12; c.lineCap = c.lineJoin = 'round'; c.strokeStyle = '#ffd23f';
    c.beginPath();
    const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    pts.forEach(([x, y], i) => { const X = pad + x * (W - 2 * pad), Y = pad + (1 - y) * (W - 2 * pad); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.stroke();
    this.ui.name.textContent = rec.path.match(/\(([^)]+)\)$/)[1];
    this.ui.root.dataset.pattern = id;
  }

  recognize(stroke) {
    const rec = this.current;
    if (!rec || stroke.length < 2) return;
    const id = this.patternId(rec);
    const s = score(id, stroke.map(([x, y]) => [x, -y]));
    this.lastScore = s;
    if (s >= rec.data.scoreToAccept) {
      this.game.events.run(rec.data.onGesturedRecognizedEvent);
      this.flash(this.handlerText('recognizedText') || 'Correct!');
    } else {
      this.flash(this.handlerText('unrecognizedText') || 'Draw again!');
      setTimeout(() => this.paint([]), 400); // clearNotRecognizedLines
    }
  }

  handlerText(key) {
    const k = Object.keys(this.game.comps).find(p => p.startsWith(this.path) && p.endsWith('DrawArea Free'));
    return k && this.game.comps[k].ExampleGestureHandler?.[key];
  }

  flash(text) {
    if (!this.ui) return;
    this.ui.result.textContent = text;
    this.ui.result.classList.remove('show');
    void this.ui.result.offsetWidth;
    this.ui.result.classList.add('show');
  }

  RecognizedCountIncrement() {
    const g = this.game;
    this.count++;
    this.busy = NEXT_DELAY;
    this.PlaySpecificAnim();
    this.PlayVicotryParticles();
    g.sound.play(g.comps.Manager['AS.UIManager'].clickSoundClip.name);
    setTimeout(() => this.paint([]), 600);
    this.CheckMaxRecognized();
  }

  // Action layer state "1st".."5th" of the FemaleFish / Fish controllers, for the shape just drawn.
  PlaySpecificAnim() {
    const g = this.game;
    const rec = this.list.slice().reverse().find(r => r.recognized) || this.list[0];
    const state = rec.data.AnimToPlay;
    const action = g.controllers.FemaleFish.layers.find(l => l.name === 'Action');
    const clip = action?.states?.[state]?.clip;
    const name = clip ? clip.split('@')[0] : 'Happy swim';
    this.femaleRig.play(name, 0.2);
    g.fish.once(name, 0.2);
    const key = g.stage.lib.byName(name);
    const dur = key ? g.stage.lib.clips[key].duration : 2;
    this.backToIdle = dur;
  }

  // one of victoryTextParticles (Great / Nice / Perfect text bursts) at random
  PlayVicotryParticles() {
    const list = this.data.victoryTextParticles;
    this.game.playFx(ref(list[Math.floor(Math.random() * list.length)]));
  }

  CheckMaxRecognized() {
    if (this.count < this.max) return;
    this.finished = true;
    this.game.after(NEXT_DELAY, () => this.game.complete(false));
  }

  update(dt) {
    const g = this.game;
    const ready = !g.tl && g.control && g.state === 'playing';
    if (ready && !this.ui && !this.finished) this.begin();
    if (this.ui) this.ui.root.style.display = ready && !this.finished ? '' : 'none';
    if (this.busy > 0 && (this.busy -= dt) <= 0) this.showCurrent();
    if (this.backToIdle != null && (this.backToIdle -= dt) <= 0) { this.backToIdle = null; this.femaleRig.play('IDLE', 0.3); }
    this.femaleRig.update(dt);
  }

  begin() {
    const g = this.game, d = this.data;
    g.driver = this;
    g.swimControls(false);
    const female = this.female.getWorldPosition(new THREE.Vector3());
    g.fish.face(female);
    const both = ref(d.bothFishVcam);
    g.shots = [{ path: both, weight: 1 }];
    this.build();
  }

  drive(dt) { this.game.fish.anim('IDLE'); this.game.fish.animate(dt); }

  dispose() {
    if (this.ui) { this.ui.root.remove(); removeEventListener('resize', this.ui.fit); this.ui = null; }
  }

  // tests: where to draw and what
  get drawInfo() {
    if (!this.ui || this.busy > 0 || !this.current) return null;
    const b = this.ui.area.getBoundingClientRect();
    return { pattern: this.patternId(this.current), x: b.left, y: b.top, w: b.width, h: b.height, count: this.count };
  }
}

export class RecognizedEvents extends Base {
  constructor(...a) { super(...a); this.recognized = !!this.data.recognized; }
  RecognizedCheck(v) { this.recognized = !!v; }
}

