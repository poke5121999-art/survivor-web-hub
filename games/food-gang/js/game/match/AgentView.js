// Agent view on each skin_* prefab (QuantumAgentView): follows the interpolated agent, drives the skin Animator
// from AgentState and SimEvents, blinks the flash tint (hit / heal / poison / invincibility / BlinkRed),
// handles invisibility, death FX and respawn. Reads the sim, never writes it.
import { StatusFlags, has, isDead } from '../../sim/index.js';

const WHITE = [1, 1, 1], HEAL = [0.3, 1, 0.3], RED = [1, 0.15, 0.15], POISON = [0.55, 1, 0.2];

export class AgentView {
  constructor(ctx, agentId, inst) {
    this.ctx = ctx;
    this.id = agentId;
    this.inst = inst;
    this.root = inst.root;
    this.visualRoot = this.root.find('visual_root');
    this.visualScaleX = this.visualRoot ? Math.abs(this.visualRoot.ls[0]) || 1 : 1;
    this.slotLifebar = this.root.findDeep('SLOT_LIFEBAR');
    const an = this.root.inChildren('Animator')[0];
    this.an = an && an.runtime ? an.runtime : null;
    this.renderers = this.root.inChildren('SpriteRenderer');
    this.sortingGroup = this.root.get('SortingGroup');
    this.layerArmRight = this.an ? this.an.layerIndex('ArmRight') : -1;
    this.layerArmRightMelee = this.an ? this.an.layerIndex('ArmRightMelee') : -1;
    this.poisonFx = null;
    this.wasPoisoned = false; this.poseLocked = false; this.isJumping = false; this.wasGrounded = true;
    this.wasSpecial = false; this.wasMelee = false;
    this.blinkHit = 0; this.blinkHeal = 0; this.blinkRed = 0; this.blinkRedSpeed = 4;
    this.blinkPoison = 0; this.blinkPoisonCoef = 1; this.blinkInv = 0;
    this.pos = [0, 0, 0];
    const a = this.agent;
    if (this.sortingGroup) this.sortingGroup.order = a.slot === ctx.runner.localSlot ? 10 : 5 - a.slot;
    if (a.isBoss) for (let i = 0; i < 3; i++) this.root.ls[i] *= 1.5;
    ctx.runner.agentPos(agentId, this.pos);
    this.root.lp[0] = this.pos[0]; this.root.lp[1] = this.pos[1];
    this.isDead = isDead(a);
    if (this.visualRoot) this.visualRoot.setActive(!this.isDead);
    // animation events of this skin's clips come back here (QuantumAnimationEventSink)
    this.root.agentView = this;
  }

  get agent() { return this.ctx.runner.state.agents[this.id]; }
  get isLocal() { return this.agent.slot === this.ctx.runner.localSlot; }

  onEvent(e) {
    switch (e.type) {
      case 0: this.onJumped(); break;                                        // AgentJumped
      case 1: this.onActionStarted(e); break;                                // AgentActionStarted
      case 5: this.playActionSfx(e.flag, 'shootSfx'); break;                 // AgentShootTriggered
      case 3: this.playActionSfx(this.agent.currentIsSpecial, 'meleeSfx'); break; // AgentMeleeWindowOpened
      case 6: if (!this.poseLocked) { this.blinkHit = 0.75; this.playActionSfx(this.agent.currentIsSpecial, 'buffSfx'); } break;
      case 8: this.blinkHit = 0.4; break;                                    // AgentHitBlocked
      case 7: this.onTookDamage(e); break;                                   // AgentTookDamage
      case 9: this.onDied(); break;                                          // AgentDied
      case 10: this.onRespawned(); break;                                    // AgentRespawned
      default: break;
    }
  }

  onJumped() {
    this.isJumping = true;
    if (this.an && !this.poseLocked) this.an.setTrigger('Jump');
    this.ctx.audio.sfxAt('Jump', this.pos[0], this.pos[1]);
  }

  onActionStarted(e) {
    if (!this.an || this.poseLocked) return;
    // the decompiled view picks the melee arm trigger from the MeleeMode flag, not from the action type
    if (e.flag) this.an.setTrigger('Special');
    else this.an.setTrigger(has(this.agent, StatusFlags.MeleeMode) ? 'ActionMelee' : 'Action');
    const act = this.ctx.db.actions[e.int];
    if (act && act.totalFrames > 0) this.an.setFloat('AttackSpeed', 1);
  }

  playActionSfx(isSpecial, kind) {
    const a = this.agent;
    const idx = isSpecial ? a.specialRef : a.actionRef;
    const act = this.ctx.db.actions[idx];
    const va = act && this.ctx.viewDb.action(act.name);
    const list = va && va[kind];
    if (!list || !list.length) return;
    const ev = Math.max(0, a.actionEventIndex - 1);
    let key = ev < list.length && list[ev] ? list[ev] : null;
    if (!key) key = list.find(Boolean) || null;
    if (key) this.ctx.audio.sfxAt(key, this.pos[0], this.pos[1]);
  }

  onTookDamage(e) {
    if (this.poseLocked) return;
    if (e.value < 0) {
      this.blinkHeal = 0.75;
      this.ctx.prefabs.spawnFx(this.ctx.viewDb.healFx, [this.pos[0], this.pos[1], 0]);
      return;
    }
    this.blinkHit = 0.75;
    if (this.an) this.an.setTrigger('Hit');
    this.ctx.audio.sfxAt('Hit', this.pos[0], this.pos[1]);
  }

  onDied() {
    this.isDead = true;
    const a = this.agent;
    const sk = this.ctx.viewDb.skin(this.ctx.db.skins[a.skin].name);
    if (sk && sk.deathFx) this.ctx.prefabs.spawnFx(sk.deathFx, [this.pos[0], this.pos[1], 0], a.isBoss ? 1.5 : 1);
    this.ctx.audio.sfxAt('Death', this.pos[0], this.pos[1]);
    if (this.visualRoot) this.visualRoot.setActive(false);
    this.dropPoisonFx();
    this.resetBlink();
  }

  onRespawned() {
    this.isDead = false;
    const p = this.agent.pos;
    this.pos[0] = p.x; this.pos[1] = p.y;
    this.root.lp[0] = p.x; this.root.lp[1] = p.y;
    if (this.visualRoot) this.visualRoot.setActive(true);
    if (this.an) { this.an.setController(this.an.comp.ctrl); this.wasMelee = false; }   // Animator.Rebind
    this.resetBlink();
    this.wasSpecial = false; this.wasGrounded = true; this.isJumping = false;
  }

  resetBlink() {
    this.blinkHit = this.blinkHeal = this.blinkPoison = this.blinkInv = this.blinkRed = 0;
    this.blinkPoisonCoef = 1;
  }

  triggerBlinkRed(speed) { this.blinkRed = 1; this.blinkRedSpeed = Math.max(0.1, speed || 4); }

  onWalk() { if (this.isLocal && !this.poseLocked) this.ctx.audio.sfxAt('Walk', this.pos[0], this.pos[1]); }

  dropPoisonFx() {
    if (this.poisonFx) this.poisonFx.root.destroy();
    this.poisonFx = null;
    this.wasPoisoned = false;
  }

  // victory / defeat pose at game over (Animator layer Victory)
  setEndGameState(victory, defeat) {
    this.resetBlink();
    this.poseLocked = true;
    this.dropPoisonFx();
    if (this.isDead || !this.an) return 0;
    const v = victory ? 1 + Math.floor(Math.random() * 3) : 0;
    this.an.setBool('Defeat', defeat);
    this.an.setInteger('Victory', v);
    this.an.setBool('IsMoving', false);
    this.an.setBool('IsActioning', false);
    this.an.setBool('IsActioningSpecial', false);
    return v;
  }

  // LateUpdate
  update(dt) {
    const r = this.ctx.runner, a = this.agent;
    r.agentPos(this.id, this.pos);
    this.root.lp[0] = this.pos[0]; this.root.lp[1] = this.pos[1];
    if (isDead(a) && !this.isDead) { this.isDead = true; if (this.visualRoot) this.visualRoot.setActive(false); }
    if (this.isDead) return;
    // art faces left at a positive visual_root scale (tools/README.md, measured on the clips)
    if (this.visualRoot) this.visualRoot.ls[0] = a.facingLeft ? this.visualScaleX : -this.visualScaleX;
    if (!this.poseLocked && this.an) {
      const an = this.an;
      const grounded = a.grounded;
      if (!grounded && a.velocity.y <= 0) this.isJumping = false;
      this.wasGrounded = grounded;
      an.setBool('IsGrounded', grounded);
      an.setBool('IsMoving', Math.abs(a.velocity.x) > 0.2 && Math.abs(a.directionX) > 0.01);
      an.setBool('IsActioning', a.isActioning && !a.currentIsSpecial);
      an.setBool('IsActioningSpecial', a.isActioning && a.currentIsSpecial);
      const special = has(a, StatusFlags.Special);
      an.setBool('IsSpecial', special);
      const melee = has(a, StatusFlags.MeleeMode);
      an.setBool('IsMelee', melee);
      if (special && !this.wasSpecial) this.blinkHit = 2;
      this.wasSpecial = special;
      if (melee !== this.wasMelee) {
        if (this.layerArmRight >= 0) an.setLayerWeight(this.layerArmRight, melee ? 0 : 1);
        if (this.layerArmRightMelee >= 0) an.setLayerWeight(this.layerArmRightMelee, melee ? 1 : 0);
        this.wasMelee = melee;
      }
    }
    const poisoned = has(a, StatusFlags.Poison);
    if (poisoned !== this.wasPoisoned) {
      if (poisoned && this.ctx.viewDb.poisonFx) {
        this.poisonFx = this.ctx.prefabs.spawn(this.ctx.viewDb.poisonFx, this.root, [0, 1, 0]);
      } else this.dropPoisonFx();
      this.wasPoisoned = poisoned;
    }
    this.updateBlink(a, dt);
  }

  updateBlink(a, dt) {
    if (this.blinkHit > 0) this.blinkHit = Math.max(0, this.blinkHit - dt * 5);
    if (this.blinkHeal > 0) this.blinkHeal = Math.max(0, this.blinkHeal - dt * 2);
    if (this.blinkRed > 0) this.blinkRed = Math.max(0, this.blinkRed - dt * this.blinkRedSpeed);
    if (has(a, StatusFlags.Poison)) {
      this.blinkPoison += dt * this.blinkPoisonCoef * 5;
      if (this.blinkPoison > 1 || this.blinkPoison < 0) { this.blinkPoisonCoef = -this.blinkPoisonCoef; this.blinkPoison = Math.max(0, Math.min(1, this.blinkPoison)); }
    } else this.blinkPoison = 0;
    let col = WHITE, flash = Math.min(1, Math.max(0, this.blinkHit));
    if (this.blinkHeal > flash) { flash = this.blinkHeal; col = HEAL; }
    if (this.blinkRed > flash) { flash = this.blinkRed; col = RED; }
    if (this.blinkPoison * 0.6 > flash) { flash = this.blinkPoison * 0.6; col = POISON; }
    let alpha = 1;
    if (has(a, StatusFlags.Invisibility)) alpha = this.ctx.runner.isAlly(a) ? 0.35 : 0;
    else if (has(a, StatusFlags.Invincibility) && !this.poseLocked) {
      this.blinkInv += dt * 10;
      alpha = (this.blinkInv % 1) < 0.5 ? 0.45 : 1;
    }
    for (const sr of this.renderers) { sr.flashAmount = flash; sr.flashColor = col; sr.alphaMul = alpha; }
  }

  destroy() { this.dropPoisonFx(); this.root.destroy(); }
}
