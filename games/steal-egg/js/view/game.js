// Draws the sim each frame on the GamePlay scene: the player (Player1 rig), the three rivals (their scene "enemy"
// rigs), the seven nest animals, every egg and brainrot as an instance of its original prefab at its one location,
// gates, world labels, hit effects, HUD and sound. Reads sim.state and the events of each step; writes only through
// sim.action (HUD buttons, ui.js).
//
//   gv.beforeStep()                       before each sim step (interpolation start)
//   gv.afterStep(events, dt, quiet)       after each step: events -> HUD / effects / sound, then everything ages by dt
//   gv.draw(dt, alpha)                    lay the scene out for a frame (alpha = interpolation inside the step)
import * as THREE from 'three';
import { faceYaw } from './rig.js';
import { Fx } from './fx.js';
import { Sound } from './sound.js';
import { Ui } from './ui.js';
import { Panels } from './panels.js';
import { Text3D } from './text3d.js';
import { t, tf } from './vi.js';
import { Tutorial } from '../sim/tutorial.js';

const Y = new THREE.Vector3(0, 1, 0);
const G = 9.81;
const where = it => (it.at.nest != null ? 'nest' : it.at.ground ? 'ground' : it.at.carried != null ? 'carried' : it.at.stowed != null ? 'stowed' : 'farm');
const two = n => String(n).padStart(2, '0');
const mmss = s => `${two(Math.floor(s / 60))}:${two(s % 60)}`;
// rules/combat.md: KnockbackRoutine launches the player with verticalVelocity 30 u/s under gravity for 1.0 s
// (cc.Move in metres); Hitme then keeps the ragdoll down 2.0 s. The view draws that arc on top of the sim's ground
// position and lands the body by the end of Hitme (the ragdoll fall itself is not simulated).
const KNOCK_UP = 30, KNOCK_TIME = 1, HITME = 2;
const FALL_TIME = 0.3;                                  // ragdoll collapse
const LABEL_FONT = '"Insanibu", "Baloo 2", "Arial Black", sans-serif';

export class GameView {
  constructor({ sim, view, data, fxJson, fxGlb, sfxJson, rects = {}, tweens = {}, seedbtn = null, artBase, version, mute = false,
    onPurchase = () => {}, onPause = () => {} }) {
    this.sim = sim;
    this.view = view;
    this.D = sim.D;
    this.world = view.world;
    this.scene = view.scene;
    const world = this.world;
    this.sound = new Sound({ sfxJson, base: artBase, version, muted: mute });
    this.fx = new Fx({ fxJson, fxGlb, world, base: artBase, version });
    this.scene.add(this.fx.group);
    const pauseGame = on => { window.__game.paused = on; onPause(on); };
    this.ui = new Ui({ sim, hud: view.hud, sound: this.sound, onPurchase, onPause: pauseGame });
    this.panels = new Panels({ sim, hud: view.hud, view, sound: this.sound, tweens, seedbtn, spriteBase: `${artBase}/ui/sprites`, version,
      onPurchase, onPause: pauseGame });
    for (const root of ['PanelsAndButtons', 'TextDisplayer', 'CoinPanel']) view.hud.show(root, true);
    this.itemsRoot = new THREE.Group();
    this.itemsRoot.name = 'items';
    this.labelsRoot = new THREE.Group();
    this.labelsRoot.name = 'labels';
    this.scene.add(this.itemsRoot, this.labelsRoot);
    this.items = new Map();
    this.counters = { spawned: 0, despawned: 0 };
    this.time = 0;

    // Scene objects the original replaces or hides at runtime: the scene-placed start eggs (the sim spawns every egg),
    // the tutorial pointer (shown only on a target), the fourth EnemyAI (inactive in the scene).
    world.objects.forEach(o => { const k = o.userData.node.k; if (k && k.EggItem) o.visible = false; });
    world.show('pointer', false);

    // Player
    const p = sim.state.actors[0];
    this.player = { obj: view.player, rig: view.playerRig, prev: new THREE.Vector3().fromArray(p.pos), cur: new THREE.Vector3().fromArray(p.pos),
      anchor: world.node('Player1/MemeRotPos'), draw: new THREE.Vector3(), tilt: 0, stepAcc: 0, wasGrounded: true, attackT: -1 };
    // Rivals: actors 1..3 drawn by their scene rigs.
    this.rivals = this.D.rivals.map((r, i) => {
      const obj = world.objects[r.node], n = obj.userData.node, ai = n.k.EnemyAI;
      const path = world.path(obj);
      const a = sim.state.actors[i + 1];
      return {
        obj, rig: obj.userData.rig || null, q0: obj.quaternion.clone(), yaw0: r.homeYaw, def: r, path,
        anchor: ai && ai.memerotPos ? world.objects[ai.memerotPos.n] : obj,
        prev: new THREE.Vector3().fromArray(a.pos), cur: new THREE.Vector3().fromArray(a.pos), tilt: 0, attackT: -1,
        blood: Object.keys(fxJson.systems).find(k => k.startsWith(`${path}/Blood`) && !k.slice(path.length + 1).includes('/')) || null,
        die: (sfxJson.byGameObject[`level2:${world.path(world.objects[ai.Die.n])}`] || [])[0] || null,
      };
    });
    // Animals
    this.animals = this.D.animals.map((d, i) => {
      const obj = world.objects[d.node], aec = obj.userData.node.k.AnimalEggController;
      const rigObj = aec.animator ? world.objects[aec.animator.n] : null;
      const sp = aec.sleepParticles ? world.path(world.objects[aec.sleepParticles.n]) : null;
      const an = sim.state.animals[i];
      const audio = n => (n ? (sfxJson.byGameObject[`level2:${world.path(world.objects[n.n])}`] || [])[0] : null);
      return {
        obj, rig: rigObj && rigObj.userData.rig, q0: obj.quaternion.clone(), yaw0: d.yaw, sleepFx: sp && fxJson.systems[sp] ? sp : null,
        prev: new THREE.Vector3().fromArray(an.pos), cur: new THREE.Vector3().fromArray(an.pos),
        voice: (sfxJson.byGameObject[`level2:${world.path(obj)}`] || [])[0] || null,
        snore: audio(aec.sleepingAudio), run: audio(aec.walkingAudio), state: null,
      };
    });
    // Gates: farm 0 = PlayerGateController, 1..3 = AIGateController.
    this.gates = sim.state.farms.map((f, i) => {
      const node = world.objects[i === 0 ? this.D.gates.player.node : this.D.gates.ai[i - 1].node];
      const c = node.userData.node.k.PlayerGateController || node.userData.node.k.AIGateController;
      const slide = world.objects[c.slidingGate.n];
      const timerNode = world.objects[c.timerText.n];
      const label = tmpText(timerNode, { rects, path: world.path(timerNode) });
      const op = c.openLocalPosition, cl = c.closedLocalPosition;
      return { slide, timerNode, label, open: new THREE.Vector3(op.x, op.y, -op.z), closed: new THREE.Vector3(cl.x, cl.y, -cl.z) };
    });
    // Upgrade pad world texts (FarmUpgradeZone.upgradePriceText / capacityText): two TextMeshPro 3D texts on the slanted
    // board "player form/Cube (2)", each at its RectTransform anchoredPosition (art/world/rects.json; the scene export
    // kept only the zero m_LocalPosition), 20 x 5 box, auto size up to m_fontSizeMax, m_fontColor; material "Insanibu Atlas
    // Material" _OutlineWidth 0.248 black (about a quarter of it per side of the em in canvas strokes).
    const fu = world.objects.find(o => o.userData.node.k && o.userData.node.k.FarmUpgradeZone).userData.node.k.FarmUpgradeZone;
    this.pad = [fu.upgradePriceText.n, fu.capacityText.n].map(n => {
      const node = world.objects[n], tmp = node.userData.node.k['TMPro.TextMeshPro'], c = tmp.m_fontColor;
      return { label: tmpText(node, { rects, path: world.path(node), maxSize: tmp.m_fontSizeMax, outline: 0.248 / 4, outlineColor: '#000' }), color: [c.r, c.g, c.b] };
    });
    // TutorialManager: instruction panel + bobbing 3D arrow (scene object "pointer"); flags live in the sim save.
    sim.state.tutorial.flags = sim.state.tutorial.flags || {};
    this.tutorial = new Tutorial(sim.state, this.D, sim.state.tutorial.flags, { seed: sim.state.rng });
    this.pointer = world.node('pointer');
    if (this.pointer) this.pointer.userData.s0 = this.pointer.scale.clone();

    this.fx.playAwake(k => !/\/sleep/.test(k));
    this.animalsSync(true);
  }

  // --- per step -----------------------------------------------------------------------------------------------------
  beforeStep() {
    const s = this.sim.state;
    this.player.prev.fromArray(s.actors[0].pos);
    this.rivals.forEach((r, i) => r.prev.fromArray(s.actors[i + 1].pos));
    this.animals.forEach((a, i) => a.prev.fromArray(s.animals[i].pos));
  }

  afterStep(events, dt, quiet = false) {
    const s = this.sim.state;
    this.player.cur.fromArray(s.actors[0].pos);
    this.rivals.forEach((r, i) => r.cur.fromArray(s.actors[i + 1].pos));
    this.animals.forEach((a, i) => a.cur.fromArray(s.animals[i].pos));
    for (const e of events) this.onEvent(e, quiet);
    this.tutorial.onEvents(events);
    this.tutorial.update(dt, s);
    if (this.tutorial.dirty || events.some(e => e.type === 'tutorial')) { s.tutorial.flags = this.tutorial.save(); this.tutorial.dirty = false; }
    this.time += dt;
    this.fx.step(dt);
    this.ui.step(dt);
    for (const rec of this.items.values()) if (rec.fall) rec.fall.t += dt;
    this.player.attackT = this.player.attackT >= 0 ? this.player.attackT + dt : -1;
    for (const r of this.rivals) r.attackT = r.attackT >= 0 ? r.attackT + dt : -1;
    if (!quiet) this.footsteps(dt);
    // ParticleOnMove on Player1/Poof: play while the player moves more than 0.01 per frame.
    const moved = this.player.prev.distanceTo(this.player.cur) > 0.01;
    if (moved && !this.fx.isPlaying('Player1/Poof/Dust')) this.fx.play('Player1/Poof');
  }

  onEvent(e, quiet) {
    const snd = (n, v = 1) => { if (!quiet) this.sound.play(n, v); };
    this.ui.onEvent(e);
    switch (e.type) {
      case 'attack':
        if (e.actor === 0) {
          this.player.attackT = 0;
          if (this.player.rig) this.player.rig.overlay('AttackState').play('mixamo_com', 0.25, true);
          this.fx.play('Player1/SwordSlashThickBlue');
          snd('sfx_attack_mp3cut_net');
        }
        break;
      case 'rivalAttack': {
        const r = this.rivals[e.actor - 1];
        if (r) { r.attackT = 0; if (r.rig) { r.rig.state = null; r.rig.play('Attack', 0.25); } }
        break;
      }
      case 'hit':
        if (e.target === 0) { this.fx.play('Player1/Blood'); snd('hard_slap_46388'); }
        else {
          const r = this.rivals[e.target - 1];
          if (r && r.blood) this.fx.play(r.blood);
          snd('hard_slap_46388', this.near(r && r.cur));
          if (r && r.die) snd(r.die, this.near(r.cur));
        }
        break;
      case 'death': if (e.actor === 0) snd('scriming_1'); break;
      case 'animateCoin': snd('coin_collision_sound_342335'); break;
      case 'sell': snd('sell'); break;
      case 'farmUpgrade': snd('purchase'); break;
      case 'hatchStart': if (e.farm === 0) snd('sweet_game_over_sound_effect_230470'); break;
      case 'animalWake': {
        const a = this.animals[e.animal];
        if (a && a.voice) snd(a.voice, this.near(a.cur));
        break;
      }
      case 'toast': if (e.text === 'Some one is stealing your Brainrot') snd('alarme_342932_2'); break;
      case 'drop': {
        const rec = this.items.get(e.item);
        if (rec && e.from) rec.fall = { from: e.from, t: 0 };
        break;
      }
      default:
    }
  }

  near(v) {
    if (!v) return 1;
    return Sound.falloff(v.distanceTo(this.player.cur));
  }

  // ThirdPersonController.OnFootstep: one of FootstepAudioClips[10] at FootstepAudioVolume 0.5 per planted foot of
  // the Run blend (two per cycle); OnLand: LandingAudioClip.
  footsteps(dt) {
    const p = this.sim.state.actors[0], pl = this.player;
    if (p.grounded && !pl.wasGrounded) this.sound.play('player_land', 0.5);
    pl.wasGrounded = p.grounded;
    if (!p.grounded || p.blend < 0.5 || p.combat.state !== 'ok') { pl.stepAcc = 0; return; }
    pl.stepAcc += dt;
    if (pl.stepAcc >= 0.3) {
      pl.stepAcc = 0;
      this.sound.play(`player_footstep_${two(1 + Math.floor(Math.random() * 10))}`, 0.5);
    }
  }

  // --- draw ---------------------------------------------------------------------------------------------------------
  draw(dt, alpha) {
    const s = this.sim.state, v = this.view;
    this.drawPlayer(dt, alpha);
    this.drawRivals(dt, alpha);
    this.animalsSync(false, alpha);
    for (const r of v.rigs) r.update(dt);
    v.follow.update(dt, this.player.draw);
    // GoToGamePlay.ShowShop -> PlayerManager.ShowPlayerCamera(true): MainCamera off, the player's "Camera" child on
    if (this.panels.shopOpen && this.panels.camNode) {
      this.panels.camNode.updateWorldMatrix(true, false);
      this.panels.camNode.matrixWorld.decompose(v.camera.position, v.camera.quaternion, new THREE.Vector3());
    }
    this.drawGates();
    this.drawItems();
    this.drawPad();
    this.fx.draw(v.camera);
    this.ui.draw();
    this.panels.draw(dt);
    this.drawTutorial(dt);
    this.sounds();
    this.lastDraw = s.t;
  }

  drawPlayer(dt, alpha) {
    const p = this.sim.state.actors[0], pl = this.player, obj = pl.obj;
    pl.draw.lerpVectors(pl.prev, pl.cur, alpha);
    const c = p.combat;
    let lift = 0, down = 0;
    if (c.state === 'knock') { const tt = Math.min(c.t, KNOCK_TIME); lift = KNOCK_UP * tt - 0.5 * G * tt * tt; down = 1; }
    else if (c.state === 'hitme') {
      const top = KNOCK_UP * KNOCK_TIME - 0.5 * G * KNOCK_TIME * KNOCK_TIME, k = Math.min(1, c.t / HITME);
      lift = top * (1 - k * k); down = 1;
    } else if (c.state === 'dying' || c.state === 'dead') down = 1;
    pl.draw.y += Math.max(0, lift);
    pl.tilt += Math.sign(down - pl.tilt) * Math.min(Math.abs(down - pl.tilt), dt / FALL_TIME);
    obj.position.copy(pl.draw);
    faceYaw(obj, p.yaw);
    const rig = pl.rig;
    tilt(rig && rig.humanRoot, pl.tilt);
    if (!rig) return;
    playerBase(rig, p);
    const hand = rig.overlay('HandRig');
    if (p.carry) hand.play('Ymca Dance'); else hand.stop();
    const atk = rig.overlay('AttackState');
    if (atk.playing() && atk.normTime() >= 0.8897) atk.stop(0.25);
  }

  drawRivals(dt, alpha) {
    const s = this.sim.state;
    this.rivals.forEach((r, i) => {
      const a = s.actors[i + 1], b = a.brain, obj = r.obj;
      obj.position.lerpVectors(r.prev, r.cur, alpha);
      obj.quaternion.setFromAxisAngle(Y, a.yaw - r.yaw0).multiply(r.q0);
      // GotHitRagdoll: down after the 0.3 s lead; on recovery the rival is put back home standing (no get-up anim)
      const down = b && b.stun && b.stun.phase === 'down' ? 1 : 0;
      r.tilt = down ? Math.min(1, r.tilt + dt / FALL_TIME) : 0;
      const rig = r.rig;
      tilt(rig && rig.humanRoot, r.tilt);
      if (!rig) return;
      const def = r.def, moving = a.moving && !(b && b.stun);
      if (rig.state === 'Attack' && r.attackT >= 0) {
        const st = rig.layer.states.Attack, clip = st && rig.lib.clips[st.clip];
        const len = clip ? clip.duration / (st.speed || 1) : 1.1;
        if (r.attackT < len * 0.8958) return this.rivalCarry(rig, a);
        r.attackT = -1;
      }
      const want = !moving ? 'Idle' : (a.speed || 0) >= (def.walkSpeed + def.runSpeed) / 2 ? 'Running' : 'Walking';
      if (rig.state !== want) rig.play(want, 0.25);
      this.rivalCarry(rig, a);
    });
  }

  rivalCarry(rig, a) {
    const l = rig.overlay('CarryBrainRot');
    if (!l) return;
    if (a.carry) l.play('Standing 2H Cast Spell 01'); else l.stop();
  }

  // AnimalEggController: SetSleepingVisuals (animator "sleep", sleep particles, snore/walk audio), UpdateSpeedAnimation.
  animalsSync(first, alpha = 1) {
    const s = this.sim.state;
    this.animals.forEach((a, i) => {
      const an = s.animals[i];
      a.obj.position.lerpVectors(a.prev, a.cur, alpha);
      a.obj.quaternion.setFromAxisAngle(Y, an.yaw - a.yaw0).multiply(a.q0);
      const sleeping = an.state === 'sleep';
      if (a.state !== an.state || first) {
        a.state = an.state;
        if (a.sleepFx) { if (sleeping) this.fx.play(a.sleepFx); else this.fx.stop(a.sleepFx); }
        if (a.rig) a.rig.play(sleeping && a.rig.has('sleep') ? 'sleep' : a.rig.layer.default, 0.25);
      }
      if (a.rig) a.rig.set('Speed', an.moving ? 1 : 0);
    });
  }

  // TutorialPointer.UpdatePointerPosition: above the target, bob 0.25 at 4 rad/s, spin 65 deg/s, scale pulse 8 %.
  drawTutorial(dt) {
    const v = this.tutorial.view;
    this.ui.instruction(v.text);
    const ptr = this.pointer;
    if (!ptr) return;
    ptr.visible = !!v.pointer;
    if (!v.pointer) return;
    const tt = this.time, p = v.pointer.pos;
    ptr.position.set(p[0], p[1] + 1.4 + 0.25 * Math.sin(tt * 4), p[2]);
    ptr.rotateY(65 * Math.PI / 180 * dt);
    ptr.scale.copy(ptr.userData.s0).multiplyScalar(1 + 0.08 * Math.sin(tt * 4));
  }

  sounds() {
    const s = this.sim.state;
    this.animals.forEach((a, i) => {
      const an = s.animals[i], d = this.near(a.cur), sleeping = an.state === 'sleep';
      if (a.snore) this.sound.loop(a.snore, sleeping && d > 0, `snore${i}`, d);
      if (a.run) this.sound.loop(a.run, !sleeping && an.moving && d > 0, `run${i}`, d);
    });
  }

  drawGates() {
    const s = this.sim.state;
    this.gates.forEach((g, i) => {
      const gate = s.farms[i].gate;
      g.slide.position.lerpVectors(g.closed, g.open, gate.slide);
      const show = !gate.open && gate.remaining > 0;
      g.label.object.visible = show;
      if (show) g.label.set([{ text: mmss(Math.max(0, Math.ceil(gate.remaining))) }]);
    });
  }

  drawPad() {
    const ui = this.sim.state.ui, cap = ui.capacity;
    if (!cap) return;
    const texts = [cap.cost > 0 ? tf('Upgrade Price: ${0}', cap.cost) : t('Upgrade Price: MAX'), tf('Brainrot Capacity: {0}/{1}', cap.placed, cap.max)];
    this.pad.forEach((p, k) => p.label.set([{ text: texts[k], color: p.color }]));
  }

  // --- items --------------------------------------------------------------------------------------------------------
  spawnItem(id, it) {
    const D = this.D, v = this.view;
    let obj;
    if (it.kind === 'egg') obj = v.spawn('eggs', it.eggType);
    else obj = v.spawn('brainrots', D.seedIndex.get(it.seed).prefab);
    obj.userData.itemId = id;
    obj.position.set(0, 0, 0);
    const box = visibleBox(obj);
    const rec = { id, kind: it.kind, obj, key: it.kind === 'egg' ? it.eggType : it.seed, bottom: Number.isFinite(box.min.y) ? box.min.y : 0,
      height: Number.isFinite(box.max.y) ? box.max.y - box.min.y : 0.5, label: null, fall: null };
    if (it.kind === 'egg') {
      const objs = obj.userData.objects;
      rec.transition = objs.find(o => o.name === 'memerot (2)') || null;
      // EggItem.eggVisualObject (the Box* mesh); other children stay as authored (hidden ones stay hidden)
      rec.visual = objs.filter(o => o.parent === obj && o !== rec.transition && o.visible);
      if (rec.transition) rec.transition.visible = false;
    } else {
      rec.info = obj.userData.objects.find(o => o.userData.node && o.userData.node.k && o.userData.node.k.BillboardObject) || null;
    }
    this.itemsRoot.add(obj);
    this.items.set(id, rec);
    this.counters.spawned++;
    return rec;
  }

  despawnItem(rec) {
    if (rec.label) rec.label.dispose();
    this.view.despawn(rec.obj);
    this.items.delete(rec.id);
    this.counters.despawned++;
  }

  anchorOf(actor) {
    return actor === 0 ? this.player.anchor : this.rivals[actor - 1].anchor;
  }

  drawItems() {
    const s = this.sim.state, D = this.D;
    for (const rec of [...this.items.values()]) {
      const it = s.items[rec.id];
      if (!it || it.kind !== rec.kind || (it.kind === 'egg' ? it.eggType : it.seed) !== rec.key) this.despawnItem(rec);
    }
    const nowS = this.sim.now();
    for (const id of Object.keys(s.items)) {
      const it = s.items[id];
      const rec = this.items.get(id) || this.spawnItem(id, it);
      const o = rec.obj, w = where(it);
      rec.where = w;
      o.visible = w !== 'stowed';
      let label = null;
      if (w === 'carried') {
        // PlayerCarryController / EnemyAI: SetParent(holder, true) + localPosition zero: the pivot sits at the holder
        const a = it.at.carried, anchor = this.anchorOf(a);
        anchor.getWorldPosition(o.position);
        o.rotation.set(0, s.actors[a].yaw, 0);
        rec.fall = null;
      } else if (w === 'nest' || w === 'ground' || w === 'farm') {
        const p = w === 'nest' ? s.animals[it.at.nest].nests[it.at.slot] : w === 'ground' ? it.at.ground : it.at.pos;
        // nest: the pivot at the nest point; ground (rigidbody at rest) and farm (FinalizePlacedObjectRoutine snaps the
        // bottom of the visible renderers to the floor + 0.01): the bottom on the floor
        o.position.set(p[0], w === 'nest' ? p[1] : p[1] - rec.bottom + (w === 'farm' ? 0.01 : 0), p[2]);
        if (w === 'ground' && rec.fall) {
          const y = rec.fall.from[1] - 0.5 * G * rec.fall.t * rec.fall.t;
          if (y > p[1]) o.position.y = y - rec.bottom; else rec.fall = null;
        }
        if (w !== 'carried') o.rotation.set(0, 0, 0);
      }
      if (it.kind === 'egg') {
        const hatching = !!it.hatch;
        if (rec.transition) rec.transition.visible = hatching;
        for (const vis of rec.visual) vis.visible = !hatching;
        // FarmEggCountdownDisplay (player farm): "mm:ss" until ready, then "Ready!"; offset (0, 1.25, 0).
        if (w === 'farm' && it.at.farm === 0 && !hatching) {
          const rem = Math.max(0, Math.floor(it.readyAt - nowS));
          label = { lines: [{ text: it.ready ? t('Ready!') : mmss(rem), color: it.ready ? [0.2, 1, 0.2] : [1, 1, 1] }], y: 1.25, h: 0.42 };
        }
      } else if (w === 'farm') {
        // MemeRotCharacter world labels: Name (red), "$" + ratePerSecond + "/s" (yellow), "Price $" + price (green).
        const b = D.seedIndex.get(it.seed);
        label = { lines: [{ text: b.name, color: [1, 0, 0] }, { text: `$${b.rate}/s`, color: [1, 0.894, 0] },
          { text: `${t('Price $')}${b.price}`, color: [0, 1, 0.213] }], info: rec.info, h: 0.14 };
      }
      this.itemLabel(rec, label);
    }
  }

  itemLabel(rec, label) {
    if (!label) { if (rec.label) rec.label.object.visible = false; return; }
    if (!rec.label) {
      rec.label = new Text3D({ font: LABEL_FONT, height: label.h });
      this.labelsRoot.add(rec.label.object);
    }
    const L = rec.label;
    L.object.visible = rec.obj.visible;
    L.set(label.lines);
    if (label.info) {
      label.info.getWorldPosition(L.object.position);
      L.object.position.y += L.object.scale.y * 0.5;
    } else {
      L.object.position.copy(rec.obj.position);
      L.object.position.y += rec.bottom + label.y;
    }
  }

  // For tests: what the scene shows per item, and the carriers' state.
  stats() {
    const s = this.sim.state, out = { items: [], roots: this.itemsRoot.children.length, labels: 0, ...this.counters };
    for (const rec of this.items.values()) {
      rec.obj.updateMatrixWorld(true);
      out.items.push({ id: rec.id, kind: rec.kind, where: rec.where, visible: rec.obj.visible, pos: rec.obj.position.toArray(),
        simWhere: s.items[rec.id] ? where(s.items[rec.id]) : null });
    }
    this.labelsRoot.children.forEach(c => { if (c.visible) out.labels++; });
    out.actors = [this.player.obj, ...this.rivals.map(r => r.obj)].map((o, i) => {
      const a = s.actors[i], f = new THREE.Vector3(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));
      return { pos: o.position.toArray(), facing: [f.x, f.z], yaw: a.yaw, moving: !!a.moving, speed: a.speed || 0,
        anchor: (i === 0 ? this.player.anchor : this.rivals[i - 1].anchor).getWorldPosition(new THREE.Vector3()).toArray() };
    });
    return out;
  }
}

// Ragdoll stand-in: the mesh under the character root falls over backwards; the root and its carry anchor stay put,
// like the original where only the child rigidbodies go limp.
function tilt(node, k) {
  if (!node) return;
  if (!node.userData.q0) node.userData.q0 = node.quaternion.clone();
  node.quaternion.copy(node.userData.q0);
  if (k > 0) node.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -k * Math.PI / 2));
}

// Bounds of the meshes that are drawn (hidden children such as the hatch transition object do not count).
function visibleBox(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), b = new THREE.Box3();
  const walk = (o, on) => {
    on = on && o.visible;
    if (on && o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); }
    for (const c of o.children) walk(c, on);
  };
  walk(obj, true);
  if (box.isEmpty()) box.set(new THREE.Vector3(), new THREE.Vector3(0, 0.5, 0));
  return box;
}

// A world TextMeshPro (3D) drawn on a plane in its node: text box = RectTransform sizeDelta (default 20 x 5 units),
// auto-sized text. The node is moved to its RectTransform anchoredPosition (rects.json), which the scene export dropped.
function tmpText(node, { rects = {}, path = null, ...opts } = {}) {
  const rt = path && rects[path];
  if (rt) node.position.set(rt.anchoredPosition[0], rt.anchoredPosition[1], node.position.z);
  const label = new Text3D({ font: LABEL_FONT, rect: rt ? rt.sizeDelta : [20, 5], outline: 0.12, ...opts });
  // TMP draws in its local XY plane reading along +x, seen from local -z; with the exporter's z mirror that is three's
  // +z side, which is where PlaneGeometry faces: no extra turn.
  node.add(label.object);
  return label;
}

// StarterAssetsThirdPerson base layer: Idle Walk Run Blend, JumpStart -> InAir -> JumpLand (controllers.json).
function playerBase(rig, m) {
  rig.set('Speed', m.combat && m.combat.state !== 'ok' ? 0 : m.blend);
  rig.set('MotionSpeed', 1);
  rig.set('Grounded', m.grounded);
  rig.set('FreeFall', m.freeFall);
  const fade = (from, to) => {
    const tr = rig.ctrl.layers[0].transitions.find(x => x.from === from && x.to === to);
    return tr ? tr.duration : 0.15;
  };
  const s = rig.state;
  if (!m.grounded) {
    if (s === 'Idle Walk Run Blend' && m.jumping) rig.play('JumpStart', fade(s, 'JumpStart'));
    else if (s === 'Idle Walk Run Blend' && m.freeFall) rig.play('InAir', fade(s, 'InAir'));
    else if (s === 'JumpStart' && rig.time() >= 0.6637) rig.play('InAir', fade(s, 'InAir'));
  } else if (s === 'InAir' || s === 'JumpStart') rig.play('JumpLand', fade('InAir', 'JumpLand'));
  else if (s === 'JumpLand' && rig.time() >= 0.3995) rig.play('Idle Walk Run Blend', fade(s, 'Idle Walk Run Blend'));
}
