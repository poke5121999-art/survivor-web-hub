// Remote co-op players in the hall: RemoteAvatarSlots + RemoteAvatarView + the remote half of PlayerAvatar
// (SetRemoteState, UpdateBase, UpdateUpper, PlayToolAction, PlayEmote, Props, ApplyPalette) + Nameplates.
// Rules: rules/coop.md D.1-D.3 and E. Decompile: udk/code/decomp/Game.Player/Game/Player/PlayerAvatar.c
// (UpdateBase @0x1807C2320, UpdateUpper @0x1807C2950, StartAction @0x1807BFE00, PlayToolAction @0x1807B88A0,
// PlayEmote @0x1807B7E90, Props @0x1807BACB0, ApplyPalette @0x1807AFE60), Game.Net.Fun/Nameplates.c; serialized
// values from dumps/mb.jsonl (Game.Player.PlayerAvatar, Game.Net.RemoteAvatarView, Game.Net.Fun.Nameplates).
//
//   const ra = new RemoteAvatars(scene, { T });   await ra.load();
//   ra.push(id, snap, now); ra.remove(id); ra.update(dt, cam, now);
//
// Art: art/avatar/avatar.glb (+ avatar.json materials/clips/layers/states), the same PlayerAvatar as bustedstage.js.
// One template is loaded; each view is a SkeletonUtils clone (geometry and textures shared, materials cloned per view so
// the slot tint and the spawn fade stay per player).
import * as THREE from 'three';
import { V } from '../rev.js';
import { buildMaterial } from './scenegraph.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { clone as skeletonClone } from '../../vendor/SkeletonUtils.js';

// RemoteAvatarSlots.slots (3 views) and RemoteAvatarView.spawnFadeTime; TeleportDistance 3 (dump:697448)
const NET = { views: 3, spawnFadeTime: 0.3, teleportDistance: 3 };
// Nameplates (mb NetUI/Nameplates)
const PLATE = { headHeight: 2.2, nearDistance: 3, farDistance: 24, farScale: 0.36, baseScale: 0.85, fullUntil: 14, fadeTo: 45,
  farAlpha: 0.45, hideBeyond: 90, fadeSpeed: 6, minScreenZ: 0.2,
  // PLACEHOLDER: the plate's pixel size and font are TextMeshPro settings not recovered; plate height at scale 1 is taken
  // as 7.5% of the viewport height, Fredoka 600 (the game's UI font), white text with a dark outline.
  heightFrac: 0.075 };
// VoiceHeadIcons (mb NetUI/VoiceUI/HeadIcons; rules/voice.md K): headHeight 2.25, worldSizeAtNear 0.32, nearDistance 4,
// farDistance 22, fadeDistance 35, releaseHold 0.35, fadeSpeed 10; pulse 1 + 0.07 sin(t·11 + id)
const TALK = { headHeight: 2.25, worldSizeAtNear: 0.32, nearDistance: 4, farDistance: 22, fadeDistance: 35, fadeBand: 6, releaseHold: 0.35, fadeSpeed: 10 };
// NetPlayerRow.Colors (UI) and PlayerAvatar.stripeColors / beanieColors (mb, sRGB) - index = player id & 3
const UI_COLORS = ['#FFC83D', '#4FC3D9', '#F07A5A', '#A98BF0'];
export const STRIPE = [[0.95, 0.93, 0.9], [0.91, 0.28, 0.23], [1.0, 0.77, 0.19], [0.31, 0.7, 1.0]];
export const BEANIE = [[0.17, 0.19, 0.23], [0.56, 0.12, 0.16], [0.79, 0.54, 0.07], [0.12, 0.37, 0.56]];
// PlayerAvatar locomotion (mb): runSpeed, sneakSpeed, maxPlaybackScale, speedSharpness
const LOCO = { runSpeed: 5.5, sneakSpeed: 2.75, maxPlaybackScale: 1.8, speedSharpness: 10 };
// Remote interpolator, SIMPLIFIED. The original (rules/coop.md E) renders behind by an adaptive delay 0.066..0.25 s
// driven by a lateness histogram, slews a clock offset, time-warps 0.97..1.03 and corrects with an error spring
// (w 10, max 1.5 m/s). Here: samples are stamped with their arrival time, the view renders a fixed 0.1 s behind,
// extrapolates up to 0.1 s past the newest sample, and snaps (fresh buffer + spawn fade) on a jump of more than 3 m.
const INTERP = { delay: 0.1, maxExtrapolate: 0.1, snap: NET.teleportDistance, cap: 32 };

// Animator: base layer states (avatar.json states) and their crossfade times from UpdateBase
const BASE = [
  { name: 'Locomotion', clips: ['Idle', 'Walk', 'Run'], th: [0, 1.25, 5.5], ref: LOCO.runSpeed },   // _base 0
  { name: 'CrouchLoco', clips: ['CrouchIdle', 'CrouchWalk'], th: [0, 2.75], ref: LOCO.sneakSpeed },   // _base 1
  { name: 'Fly', clips: ['Fly'], th: [0], ref: 0 },                                                   // _base 4
  // co-op fun tumble (rules/fun.md A.6): Fall in the air, then GetUpBack/Front held at its first frame while down and
  // played at TumbleGetUpSpeed 1.8 on the get-up; back or front comes from the tumbling player's own client
  { name: 'Fall', clips: ['Fall'], th: [0], ref: 0 },
  { name: 'GetUpBack', clips: ['GetUpBack'], th: [0], ref: 0, once: 1.8 },
  { name: 'GetUpFront', clips: ['GetUpFront'], th: [0], ref: 0, once: 1.8 },
];
// Jump / Fall / Land (_base 2, 3, 5) are not driven: the snapshot carries no grounded flag or vertical velocity.
const B_LOCO = 0, B_CROUCH = 1, B_FLY = 2, B_FALL = 3, B_UPB = 4, B_UPF = 5;
// Upper layer (masked to the avatar.json "Upper" bones). Holds loop; actions play once.
// PlayToolAction: tool 0 Grab (len 0.5, speed 1.2), 1 Scoop (0.6667, 1.15), 2 ShovelSwing (0.7, 1.1), 3 vacuum: none
// (the vacuum has no one-shot; it shows VacuumSuck while usingTool, a flag the snapshot does not carry).
// PlayEmote: Wave, 1.4333 s, props hidden for that time. StartAction only passes len/speed to _actionUntil; no Animator
// speed is set, so the clip itself plays at 1x and the layer starts fading when len/speed runs out.
const UPPER = ['ShovelHold', 'VacuumHold', 'Grab', 'Scoop', 'ShovelSwing', 'Wave'];
const U_SHOVEL_HOLD = 0, U_VAC_HOLD = 1, U_WAVE = 5;
const TOOL_ACTION = [{ u: 2, len: 0.5, speed: 1.2 }, { u: 3, len: 0.6666667, speed: 1.15 }, { u: 4, len: 0.7, speed: 1.1 }, null];
const EMOTE_LEN = 1.4333333;
const PROPS = [null, 'Prop_bucket', 'Prop_shovel', 'Prop_vacuum'];   // tool 0 hand: no prop; tool >= 4 shows Hand

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const outCubic = (t) => { t = clamp01(t); const u = 1 - t; return 1 - u * u * u; };
const moveTowards = (a, b, step) => (Math.abs(b - a) <= step ? b : a + Math.sign(b - a) * step);
const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

// 1D blend tree weights for parameter s over thresholds th (written into out)
function blend1D(th, s, out) {
  const n = th.length;
  for (let i = 0; i < n; i++) out[i] = 0;
  if (n === 1 || s <= th[0]) { out[0] = 1; return; }
  if (s >= th[n - 1]) { out[n - 1] = 1; return; }
  for (let i = 0; i < n - 1; i++) {
    if (s <= th[i + 1]) { const f = (s - th[i]) / (th[i + 1] - th[i]); out[i] = 1 - f; out[i + 1] = f; return; }
  }
}
// crossfade a weight vector toward one-hot `cur` at rate 1/fade (Animator.CrossFadeInFixedTime shape)
function crossfade(w, cur, fade, dt) {
  const k = fade > 0 ? dt / fade : 1;
  w[cur] = Math.min(1, w[cur] + k);
  let rest = 0;
  for (let i = 0; i < w.length; i++) if (i !== cur) rest += w[i];
  const scale = rest > 0 ? (1 - w[cur]) / rest : 0;
  for (let i = 0; i < w.length; i++) if (i !== cur) w[i] *= scale;
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3();

class View {
  constructor(owner) {
    const tpl = owner.tpl;
    this.root = skeletonClone(tpl.scene);
    this.root.visible = false;
    // per-view materials (textures shared): slot tint on C_Stripe / C_Beanie, opacity for the spawn fade
    const cache = new Map();
    this.mats = []; this.stripe = []; this.beanie = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      let m = cache.get(o.material);
      if (!m) {
        m = o.material.clone(); cache.set(o.material, m); this.mats.push(m);
        m.userData.baseTransparent = m.transparent; m.userData.baseOpacity = m.opacity;
        if (m.name === 'C_Stripe') this.stripe.push(m);
        else if (m.name === 'C_Beanie') this.beanie.push(m);
      }
      o.material = m;
    });
    this.props = PROPS.map((n) => (n ? this.root.getObjectByName(n) : null));
    // animation: base clips split into lower (unmasked bones) and upper (masked bones) actions so the Upper layer can
    // override the masked bones like a Unity override layer: upper bones = base * (1 - L) + upperState * L
    this.mixer = new THREE.AnimationMixer(this.root);
    const act = (clip) => { const a = this.mixer.clipAction(clip); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 0; a.setEffectiveWeight(0); a.play(); return a; };
    this.base = BASE.map((st) => st.clips.map((c) => { const s = tpl.split[c]; return s ? { lo: act(s.lo), up: act(s.up), dur: s.dur } : null; }));
    this.upper = UPPER.map((c) => { const s = tpl.upperClips[c]; return s ? { a: act(s.clip), dur: s.dur, loop: s.loop } : null; });
    this.baseW = new Float32Array(BASE.length); this.basePh = new Float32Array(BASE.length);
    this.blendW = BASE.map((st) => new Float32Array(st.clips.length));
    this.upW = new Float32Array(UPPER.length); this.upT = new Float32Array(UPPER.length);
    // name plate: a screen-sized sprite (Nameplates is a screen-space overlay; sizeAttenuation off keeps it in
    // viewport units) drawn on top of the world
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 96;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.plateMat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false });
    this.plate = new THREE.Sprite(this.plateMat); this.plate.center.set(0.5, 0); this.plate.renderOrder = 1000; this.plate.visible = false;
    this.plate.frustumCulled = false;
    this.aspect = 4;
    // voice head icon (shared texture: gold disc + the game's voice_mic glyph)
    this.talkMat = new THREE.SpriteMaterial({ map: owner.talkTex(), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false, opacity: 0 });
    this.talk = new THREE.Sprite(this.talkMat); this.talk.renderOrder = 1001; this.talk.visible = false; this.talk.frustumCulled = false;
    this.talkOn = false; this.talkUntil = -1; this.talkA = 0;
    // interpolation ring
    const n = INTERP.cap;
    this.st = new Float64Array(n); this.sx = new Float32Array(n); this.sy = new Float32Array(n); this.sz = new Float32Array(n);
    this.syaw = new Float32Array(n); this.smov = new Float32Array(n);
    this.id = null;
  }
  bind(id, snap, owner) {
    this.id = id; this.slot = (snap.slot | 0) & 3; this.name = null;
    this.count = 0; this.head = -1;
    this.speed = 0; this.baseState = -1; this.upState = -1; this.upWeight = 0; this.actionUntil = -1; this.actionLen = 0; this.emptyHandsUntil = -1;
    this.baseW.fill(0); this.upW.fill(0); this.basePh.fill(0); this.upT.fill(0);
    this.lastAct = snap.act | 0; this.lastEmote = snap.emote | 0;
    this.tool = -1; this.crouch = false; this.flying = false;
    this.fade = 0; this.fading = false; this.plateA = 0; this.yaw = snap.yaw || 0;
    this.applyPalette(this.slot);
    this.root.visible = true; this.plate.visible = false;
  }
  unbind() { this.id = null; this.root.visible = false; this.plate.visible = false; this.talk.visible = false; this.talkOn = false; this.talkA = 0; this.talkUntil = -1; }
  // ApplyPalette: PlayerAvatar.Tint sets _BaseColor on the C_Stripe / C_Beanie slots of the Body renderer
  applyPalette(slot) {
    const s = STRIPE[slot], b = BEANIE[slot];
    for (const m of this.stripe) m.color.setRGB(s[0], s[1], s[2], THREE.SRGBColorSpace);
    for (const m of this.beanie) m.color.setRGB(b[0], b[1], b[2], THREE.SRGBColorSpace);
  }
  drawPlate(name) {
    this.name = name;
    const c = this.cv.getContext('2d'), H = this.cv.height;
    c.clearRect(0, 0, this.cv.width, H);
    c.font = '600 52px Fredoka, "Trebuchet MS", sans-serif'; c.textBaseline = 'middle';
    const dotR = 14, gap = 14, pad = 10, tw = Math.min(this.cv.width - (pad * 2 + dotR * 2 + gap), c.measureText(name).width);
    const w = pad * 2 + dotR * 2 + gap + tw, x0 = (this.cv.width - w) / 2;
    c.fillStyle = UI_COLORS[this.slot]; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 4;
    c.beginPath(); c.arc(x0 + pad + dotR, H / 2, dotR, 0, Math.PI * 2); c.stroke(); c.fill();
    c.lineJoin = 'round'; c.lineWidth = 8; c.strokeStyle = 'rgba(10,14,28,0.85)'; c.fillStyle = '#fff';
    const tx = x0 + pad + dotR * 2 + gap;
    c.strokeText(name, tx, H / 2 + 2, tw); c.fillText(name, tx, H / 2 + 2, tw);
    this.tex.needsUpdate = true;
    this.aspect = this.cv.width / H;
  }
  // a network sample (stamped with its arrival time)
  push(snap, now) {
    const p = snap.pos;
    if (this.count > 0) {
      const h = this.head, dx = p[0] - this.sx[h], dy = p[1] - this.sy[h], dz = p[2] - this.sz[h];
      if (dx * dx + dy * dy + dz * dz > INTERP.snap * INTERP.snap) { this.count = 0; this.fade = 0; }   // teleport: snap + fade in
    }
    const i = this.head = (this.head + 1) % INTERP.cap;
    this.st[i] = now; this.sx[i] = p[0]; this.sy[i] = p[1]; this.sz[i] = p[2]; this.syaw[i] = snap.yaw || 0; this.smov[i] = +snap.moving || 0;
    if (this.count < INTERP.cap) this.count++;
    this.tool = snap.tool | 0; this.crouch = !!snap.crouch; this.flying = !!snap.flying; this.down = snap.down | 0; this.downBack = !!snap.back;
    const act = snap.act | 0, emote = snap.emote | 0;
    if (emote !== this.lastEmote) { this.lastEmote = emote; this.playEmote(now); }
    if (act !== this.lastAct) { this.lastAct = act; this.playToolAction(now); }
  }
  playToolAction(now) {
    const a = TOOL_ACTION[this.tool];
    if (!a || !this.upper[a.u]) return;
    // StartAction(force false): a new action may cut in once 65% of the previous one has run
    if (now < this.actionUntil - this.actionLen * 0.35) return;
    this.startUpper(a.u, 0.05); this.actionLen = a.len / a.speed; this.actionUntil = now + this.actionLen;
  }
  playEmote(now) {
    if (!this.upper[U_WAVE]) return;
    this.emptyHandsUntil = now + EMOTE_LEN;
    this.startUpper(U_WAVE, 0.05); this.actionLen = EMOTE_LEN; this.actionUntil = now + EMOTE_LEN;
  }
  startUpper(k, fade) {
    if (this.upWeight <= 0) { this.upW.fill(0); this.upW[k] = 1; }
    this.upState = k; this.upFade = fade; this.upT[k] = 0;
  }
  // interpolated pose at render time rt -> this.px/py/pz/yaw/mov
  sample(rt) {
    const n = this.count, cap = INTERP.cap, h = this.head;
    let i = h, k = 0;
    while (k < n - 1 && this.st[i] > rt) { i = (i - 1 + cap) % cap; k++; }
    if (this.st[i] > rt || i === h) {
      // older than the buffer (hold the oldest) or newer than the newest (extrapolate up to 0.1 s)
      this.px = this.sx[i]; this.py = this.sy[i]; this.pz = this.sz[i]; this.yaw = this.syaw[i]; this.mov = this.smov[i];
      if (i === h && n > 1 && rt > this.st[h]) {
        const j = (h - 1 + cap) % cap, span = this.st[h] - this.st[j];
        if (span > 1e-4) {
          const e = Math.min(rt - this.st[h], INTERP.maxExtrapolate) / span;
          this.px += (this.sx[h] - this.sx[j]) * e; this.py += (this.sy[h] - this.sy[j]) * e; this.pz += (this.sz[h] - this.sz[j]) * e;
        }
      }
      return;
    }
    const j = (i + 1) % cap, span = this.st[j] - this.st[i], f = span > 1e-6 ? clamp01((rt - this.st[i]) / span) : 1;
    this.px = this.sx[i] + (this.sx[j] - this.sx[i]) * f; this.py = this.sy[i] + (this.sy[j] - this.sy[i]) * f; this.pz = this.sz[i] + (this.sz[j] - this.sz[i]) * f;
    this.yaw = this.syaw[i] + wrapPi(this.syaw[j] - this.syaw[i]) * f;
    this.mov = this.smov[i] + (this.smov[j] - this.smov[i]) * f;
  }
  update(dt, cam, now, owner) {
    if (this.count === 0) return;
    this.sample(now - INTERP.delay);
    this.root.position.set(this.px, this.py, this.pz);
    this.root.rotation.set(0, this.yaw, 0);   // the avatar faces -Z at yaw 0, like the local player's forward
    // spawn / teleport fade-in (RemoteAvatarView.spawnFadeTime)
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / NET.spawnFadeTime);
      const on = this.fade < 1;
      if (on !== this.fading) {   // the OPAQUE program define depends on .transparent: recompile only on the switch
        this.fading = on;
        for (const m of this.mats) { m.transparent = on || m.userData.baseTransparent; m.needsUpdate = true; }
      }
      for (const m of this.mats) m.opacity = m.userData.baseOpacity * this.fade;
    }
    this.animate(dt, now);
    this.updatePlate(dt, cam, owner);
    this.updateTalk(dt, cam, now, owner);
  }
  // VoiceHeadIcons: shown while talking + releaseHold, constant screen size between 4 and 22 m, faces the camera; alpha 1
  // in CENTERED, in DIRECTIONAL fades out between 29 and 35 m. Sits above the name plate (both are screen-space sprites).
  updateTalk(dt, cam, now, owner) {
    if (!cam) { this.talk.visible = false; return; }
    if (this.talkOn) this.talkUntil = now + TALK.releaseHold;
    const show = this.talkOn || now < this.talkUntil;
    _v.set(this.px, this.py + TALK.headHeight, this.pz);
    cam.getWorldPosition(_c);
    const d = Math.max(0.01, _v.distanceTo(_c));
    const target = !show ? 0 : owner.voiceCentered ? 1 : clamp01((TALK.fadeDistance - d) / TALK.fadeBand);
    this.talkA = moveTowards(this.talkA, target, TALK.fadeSpeed * dt);
    const a = this.talkA * this.fade;
    this.talk.visible = a > 0.005;
    if (!this.talk.visible) return;
    this.talk.position.copy(_v);
    this.talkMat.opacity = a;
    const world = Math.min(TALK.farDistance, Math.max(TALK.nearDistance, d)) * TALK.worldSizeAtNear / TALK.nearDistance;
    const k = (world / d) * (1 + 0.07 * Math.sin(now * 11 + (this.id | 0)));
    this.talk.scale.set(k, k, 1);
    // bottom edge above the plate's top edge (center.y in units of the icon's own height)
    const plateH = this.plate.visible ? this.plate.scale.y : 0;
    this.talk.center.set(0.5, -(plateH / k) - 0.1);
  }
  animate(dt, now) {
    // UpdateBase: _speed eases to the horizontal speed with 1 - exp(-speedSharpness dt)
    this.speed += (this.mov - this.speed) * clamp01(1 - Math.exp(-LOCO.speedSharpness * dt));
    const want = this.down === 1 ? B_FALL : this.down >= 2 ? (this.downBack ? B_UPB : B_UPF) : this.flying ? B_FLY : this.crouch ? B_CROUCH : B_LOCO;
    if (want !== this.baseState) {
      // CrossFadeInFixedTime: Loco 0.2 s from crouch else 0.1 s, CrouchLoco 0.18 s, Fly 0.3 s
      this.baseFade = want === B_LOCO ? (this.baseState === B_CROUCH ? 0.2 : 0.1) : want === B_CROUCH ? 0.18 : 0.3;
      if (this.baseState < 0) { this.baseW.fill(0); this.baseW[want] = 1; }
      this.baseState = want; this.basePh[want] = 0;
    }
    crossfade(this.baseW, this.baseState, this.baseFade, dt);
    // UpdateUpper: layer weight target 1 while an action runs or a hold state applies; 10/s up, 4/s down, OutCubic
    const hold = this.tool === 2 ? U_SHOVEL_HOLD : this.tool === 3 ? U_VAC_HOLD : -1;
    let target = 0;
    if (now < this.actionUntil) target = 1;
    else if (hold >= 0 && this.upper[hold]) { if (this.upState !== hold) this.startUpper(hold, 0.2); target = 1; }
    this.upWeight = moveTowards(this.upWeight, target, (target > this.upWeight ? 10 : 4) * dt);
    if (target === 0 && this.upWeight <= 0) this.upState = -1;
    const L = this.upState >= 0 ? outCubic(this.upWeight) : 0;
    if (this.upState >= 0) crossfade(this.upW, this.upState, this.upFade, dt);
    // base layer: blend trees with synced normalized time; AnimSpeed = clamp(speed / runSpeed|sneakSpeed, 1, 1.8)
    // (the AnimSpeed parameter is taken as the Locomotion/CrouchLoco state speed multiplier [inferred from the name])
    for (let s = 0; s < BASE.length; s++) {
      const w = this.baseW[s], st = BASE[s], clips = this.base[s], bw = this.blendW[s];
      if (w <= 0) { for (const c of clips) if (c) { c.lo.setEffectiveWeight(0); c.up.setEffectiveWeight(0); } continue; }
      blend1D(st.th, this.speed, bw);
      let dur = 0;
      for (let j = 0; j < clips.length; j++) if (clips[j]) dur += bw[j] * clips[j].dur;
      const mul = st.ref > 0 ? Math.min(Math.max(this.speed / st.ref, 1), LOCO.maxPlaybackScale) : 1;
      if (st.once) this.basePh[s] = this.down === 3 && dur > 0 ? Math.min(0.999, this.basePh[s] + dt * st.once / dur) : this.down === 2 ? 0 : this.basePh[s];
      else if (dur > 0) this.basePh[s] = (this.basePh[s] + dt * mul / dur) % 1;
      for (let j = 0; j < clips.length; j++) {
        const c = clips[j]; if (!c) continue;
        const cw = w * bw[j], t = this.basePh[s] * c.dur;
        c.lo.time = t; c.up.time = t; c.lo.setEffectiveWeight(cw); c.up.setEffectiveWeight(cw * (1 - L));
      }
    }
    for (let k = 0; k < UPPER.length; k++) {
      const u = this.upper[k]; if (!u) continue;
      const w = L > 0 ? this.upW[k] * L : 0;
      if (w > 0 || k === this.upState) {
        this.upT[k] += dt;
        u.a.time = u.loop ? this.upT[k] % u.dur : Math.min(this.upT[k], u.dur - 1e-4);
      }
      u.a.setEffectiveWeight(w);
    }
    this.mixer.update(0);
    // Props: show the prop of the current tool; hidden while the wave empties the hands. (The prop "pop" spring on a
    // tool change is not ported.)
    const showTool = now < this.emptyHandsUntil ? -1 : this.tool;
    for (let t = 1; t < PROPS.length; t++) if (this.props[t]) this.props[t].visible = showTool === t;
  }
  // Nameplates.Update: anchor + headHeight, distance from the camera, scale and alpha by distance, fade at fadeSpeed.
  // The occlusion ray (every 0.1 s, alpha x occludedAlpha 0.4 when blocked) is skipped: the web hall has no physics
  // raycast against the original occluder layers, so plates are never dimmed by walls. Plates are not clamped to the
  // screen edge either (the original clamps them inside the canvas rect); off-screen plates just fade out.
  updatePlate(dt, cam, owner) {
    if (!cam) { this.plate.visible = false; return; }
    const name = owner.nameOf(this);
    if (name !== this.name) this.drawPlate(name);
    _v.set(this.px, this.py + PLATE.headHeight, this.pz);
    cam.getWorldPosition(_c);
    const d = _v.distanceTo(_c);
    this.plate.position.copy(_v);
    _v.applyMatrix4(cam.matrixWorldInverse);
    const zFront = -_v.z;                      // distance in front of the camera
    let target = 0;
    if (zFront > PLATE.minScreenZ && d <= PLATE.hideBeyond) {
      _v.applyMatrix4(cam.projectionMatrix);
      if (_v.x >= -1 && _v.x <= 1 && _v.y >= -1 && _v.y <= 1) {
        target = d <= PLATE.fullUntil ? 1 : 1 + (PLATE.farAlpha - 1) * clamp01((d - PLATE.fullUntil) / (PLATE.fadeTo - PLATE.fullUntil));
      }
    }
    this.plateA = moveTowards(this.plateA, target, PLATE.fadeSpeed * dt);
    const a = this.plateA * this.fade;
    this.plate.visible = a > 0.005;
    if (!this.plate.visible) return;
    this.plateMat.opacity = a;
    const s = (1 + (PLATE.farScale - 1) * clamp01((d - PLATE.nearDistance) / (PLATE.farDistance - PLATE.nearDistance))) * PLATE.baseScale;
    // sizeAttenuation off: sprite height in NDC = scale.y * P[1][1]; NDC height 2 = the whole viewport
    const h = (2 * PLATE.heightFrac * s) / (cam.projectionMatrix.elements[5] || 1);
    this.plate.scale.set(h * this.aspect, h, 1);   // P[0][0] = P[1][1] / aspect keeps the canvas aspect on screen
  }
}

export class RemoteAvatars {
  // opts.T: text lookup (T('net.player', n) -> "Player n"); opts.max: number of pooled views (default 3, the original's
  // RemoteAvatarSlots size; the test page raises it to show all four slots at once)
  constructor(scene, opts = {}) {
    this.scene = scene; this.T = opts.T || ((k, n) => 'Player ' + n); this.max = opts.max || NET.views;
    this.views = []; this.byId = new Map(); this.tpl = null; this.ok = false;
  }
  async load() {
    try {
      const base = './art/avatar/';
      const [g, meta] = await Promise.all([new GLTFLoader().loadAsync(base + 'avatar.glb' + V), fetch(base + 'avatar.json' + V).then((r) => r.json())]);
      const mats = meta.materials.map((m) => buildMaterial(base, m));
      g.scene.traverse((o) => {
        if (o.userData.active === false || o.userData.rendererEnabled === false) o.visible = false;
        if (o.isMesh) { const a = g.parser.associations.get(o.material); if (a && a.materials !== undefined) o.material = mats[a.materials]; o.frustumCulled = false; }
      });
      const layer = (meta.layers || []).find((l) => l.name === 'Upper');
      const upperBones = new Set((layer ? layer.maskedBones : []).map((p) => p.split('/').pop()));
      const node = (t) => t.name.slice(0, t.name.lastIndexOf('.'));
      const byName = new Map(g.animations.map((c) => [c.name, c]));
      const split = {}, upperClips = {};
      for (const st of BASE) for (const n of st.clips) {
        const c = byName.get(n); if (!c) continue;
        split[n] = { lo: new THREE.AnimationClip(n + '_lo', c.duration, c.tracks.filter((t) => !upperBones.has(node(t)))),
          up: new THREE.AnimationClip(n + '_up', c.duration, c.tracks.filter((t) => upperBones.has(node(t)))), dur: c.duration };
      }
      const clipMeta = new Map((meta.clips || []).map((c) => [c.name, c]));
      for (const n of UPPER) {
        const c = byName.get(n); if (!c) continue;
        upperClips[n] = { clip: new THREE.AnimationClip(n + '_upper', c.duration, c.tracks.filter((t) => upperBones.has(node(t)))), dur: c.duration,
          loop: clipMeta.has(n) ? !!clipMeta.get(n).loop : false };
      }
      this.tpl = { scene: g.scene, split, upperClips };
      this.ok = true;
    } catch (e) {
      console.warn('remote avatars: art failed to load, remote players are not drawn', e);
      this.ok = false;
    }
    return this;
  }
  view() {
    for (const v of this.views) if (v.id === null) return v;
    if (this.views.length >= this.max) return null;
    const v = new View(this); this.views.push(v);
    this.scene.add(v.root); this.scene.add(v.plate); this.scene.add(v.talk);
    return v;
  }
  nameOf(v) { return v.nameSrc || this.T('net.player', v.slot + 1); }
  push(id, snap, now) {
    if (!this.ok || !snap || !snap.pos) return;
    let v = this.byId.get(id);
    if (!v) { v = this.view(); if (!v) return; v.bind(id, snap, this); this.byId.set(id, v); }
    const slot = (snap.slot | 0) & 3;
    if (slot !== v.slot) { v.slot = slot; v.applyPalette(slot); v.name = null; }
    if ((snap.name || '') !== (v.nameSrc || '')) v.nameSrc = snap.name || '';
    v.push(snap, now);
  }
  // voice: main calls this every frame for each remote player id (rules/voice.md K)
  setTalking(id, on) { const v = this.byId.get(id); if (v) v.talkOn = !!on; }
  talkTex() {
    if (this._talkTex) return this._talkTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const tex = this._talkTex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const c = cv.getContext('2d');
    const disc = () => { c.clearRect(0, 0, 128, 128); c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(64, 66, 60, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgb(255,200,61)'; c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill(); };
    disc(); tex.needsUpdate = true;
    const img = new Image();
    img.onload = () => {
      const g = document.createElement('canvas'); g.width = g.height = 128; const x = g.getContext('2d');
      const h = 70, w = h * img.width / img.height;
      x.drawImage(img, 64 - w / 2, 64 - h / 2, w, h); x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgb(20,23,25)'; x.fillRect(0, 0, 128, 128);
      disc(); c.drawImage(g, 0, 0); tex.needsUpdate = true;
    };
    img.src = './art/ui/voice_mic.webp' + V;
    return tex;
  }
  remove(id) {
    const v = this.byId.get(id); if (!v) return;
    v.unbind(); v.nameSrc = ''; v.name = null; this.byId.delete(id);
  }
  update(dt, cam, now) {
    if (!this.ok) return;
    if (dt > 5) dt = 5;   // frame dt clamp 5 s (rules/coop.md E)
    for (let i = 0; i < this.views.length; i++) { const v = this.views[i]; if (v.id !== null) v.update(dt, cam, now, this); }
  }
}
