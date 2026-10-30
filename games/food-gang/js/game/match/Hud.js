// SceneGame HUD on the sim (GameController timer, TeamScoreDisplay, QuantumKillDisplay/KillDisplay,
// QuantumLifeBarManager/LifeBar, RespawnDisplay, BossLifeBar, QuantumButtonDisplay, VirtualJoystick/VirtualButton,
// LoadingController/LoadingCellDisplay, READY / FIGHT / TIME OUT texts). Reads the runner, never the sim internals.
import { GoalType, TeamConfig, GamePhase, StatusFlags, PowerType, SimEventType, GameRules, has, isDead, hasPower } from '../../sim/index.js';
import { T, localize } from '../text.js';

const LIVES = 3;
const KILL_TARGET_FFA = 5, KILL_TARGET_TEAM = 9;

const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

// clip format: "1:29" while a minute is left, then "00:39"
export function formatTimer(secs) {
  const s = secs % 60;
  return secs >= 60 ? `${Math.floor(secs / 60)}:${String(s).padStart(2, '0')}` : `00:${String(s).padStart(2, '0')}`;
}

export class Hud {
  constructor(ctx, gameInst) {
    this.ctx = ctx;
    this.inst = gameInst;
    this.root = gameInst.root;
    const mb = (n) => this.root.script(n);
    const ref = (r) => (r ? gameInst.ref(r) : null);
    const nodeOf = (r) => { const x = ref(r); return x && x.node ? x.node : x; };
    this.ref = ref; this.nodeOf = nodeOf;
    const gc = mb('GameController').fields;
    this.timerText = ref(gc.m_timer);
    this.timerAnim = ref(gc.m_timerAnimator);
    this.timerRoot = nodeOf(gc.m_timerRoot);
    this.startAnim = ref(gc.m_startAnimation);
    this.startText = ref(gc.m_start);
    this.timeOutText = ref(gc.m_timeOut);
    this.hudGame = nodeOf(gc.m_hud);
    this.tuto = nodeOf(gc.m_tuto);
    this.bossBarNode = nodeOf(gc.m_bossLifeBar);
    this.lifeBarRoot = nodeOf(gc.m_lifeBarRoot);
    this.lastSecs = -1;
    localize(this.root);
    // GameController.Awake
    this.hudGame.setActive(false);
    if (this.tuto) this.tuto.setActive(false);
    this.timeOutText.node.setActive(false);
    this.startText.node.setActive(false);

    const rd = mb('RespawnDisplay').fields;
    this.controls = ref(rd.m_controls);
    this.respawn = nodeOf(rd.m_respawn);
    this.respawnTimerRoot = nodeOf(rd.m_timerRoot);
    this.respawnTimer = ref(rd.m_timer);
    for (const k of ['m_leftButton', 'm_rightButton', 'm_exit', 'm_spectatorName']) { const n = nodeOf(rd[k]); if (n) n.setActive(false); }
    this.respawn.setActive(false);
    this.controlsShown = true;
    this.lastRemaining = -1;
    this.gameOverSeen = false;

    const bd = mb('QuantumButtonDisplay').fields;
    this.btn = {
      actionIcon: ref(bd.m_actionIcon), specialIcon: ref(bd.m_specialIcon), actionCd: ref(bd.m_actionCooldown), specialCd: ref(bd.m_specialCooldown),
      specialButton: nodeOf(bd.m_specialButton), bgJoy: ref(bd.m_backgroundJoystick), bgJump: ref(bd.m_backgroundJump),
      bgAction: ref(bd.m_backgroundAction), bgSpecial: ref(bd.m_backgroundSpecial),
      joySprites: bd.m_joystickTeamSprites, controlSprites: bd.m_controlTeamSprites, actionSprites: bd.m_actionTeamSprites,
    };
    this.loadedSkin = -1; this.prevActionFill = 0; this.prevSpecialFill = 0;

    // kill feed cells (KillDisplay m_team1: kills by the local team)
    this.kills = [];
    for (const n of this.allNodes()) {
      const kd = n.script('KillDisplay');
      if (!kd) continue;
      const f = kd.fields;
      this.kills.push({ team1: !!f.m_team1, node: n, an: ref(f.m_animator), a1: ref(f.m_agent1), weapon: ref(f.m_weapon), a2: ref(f.m_agent2) });
    }
    for (const k of this.kills) if (k.an && k.an.runtime) k.an.runtime.play('Idle');

    // team score bubbles
    this.teams = [];
    for (const n of this.allNodes()) {
      const td = n.script('TeamScoreDisplay');
      if (!td) continue;
      const f = td.fields;
      this.teams.push({ team: f.m_team, node: n, text: ref(f.m_text), round: nodeOf(f.m_iconRound), alive: nodeOf(f.m_iconAlive),
        dead: nodeOf(f.m_iconDead), an: ref(f.m_animator), prev: -1, init: false });
    }

    // boss bar
    const bb = this.bossBarNode ? this.bossBarNode.script('BossLifeBar') : null;
    if (bb) this.boss = { fill: ref(bb.fields.m_sliderLifeFill), upd: ref(bb.fields.m_sliderLifeFillUpdate), name: ref(bb.fields.m_nameText), vel: 0 };

    // virtual controls
    const vj = this.findScript('VirtualJoystick');
    this.joy = vj ? { node: vj.node, handle: nodeOf(vj.fields.m_handle), bg: nodeOf(vj.fields.m_background), radius: vj.fields.m_radius || 80,
      fixed: !!vj.fields.m_fixJoystick, pointer: null, origin: null } : null;
    if (this.joy && this.joy.bg) this.joy.bgDefault = this.joy.bg.rect.pos.slice();
    this.vbuttons = [];
    for (const n of this.allNodes()) {
      const vb = n.script('VirtualButton');
      if (!vb) continue;
      this.vbuttons.push({ node: n, type: vb.fields.m_type, an: ref(vb.fields.m_animator), cdFeedback: ref(vb.fields.m_cooldownFeedback), pointer: null });
    }

    // versus screen
    const lc = mb('LoadingController').fields;
    this.loading = { panel: nodeOf(lc.m_panel), cells: (lc.m_cells || []).map((r) => ref(r)), versus: nodeOf(lc.m_versus),
      versusReverse: nodeOf(lc.m_versusReverse), versusTeam: nodeOf(lc.m_versusTeam), mode: ref(lc.m_gameMode), stage: ref(lc.m_stageName), appear: [] };

    this.lifeBars = new Map();
    this.lbOffsetY = mb('QuantumLifeBarManager').fields.m_lifeBarOffsetY || 1.8;
    this.killsShown = 0;
  }

  *allNodes() { const st = [this.root]; while (st.length) { const n = st.pop(); yield n; for (const c of n.children) st.push(c); } }
  findScript(name) { for (const n of this.allNodes()) { const s = n.script(name); if (s) return s; } return null; }

  // ------------------------------------------------------------------------------------------- start sequence

  // searching: SceneLoadingGame lobby look of the clip, the local fighter's cell filled and spinning m_loading on the
  // others until revealVersus() (QuantumMatchmaker BotFillAt)
  showVersus(names, modeLabel, stageName, searching = false) {
    const L = this.loading, s = this.ctx.runner.state, gd = this.ctx.gameData;
    L.panel.setActive(true);
    L.pending = [];
    // cell order: team 1 on the left of "VS", then the others (LoadingController.SetMode / SetSlot)
    const order = s.agents.slice().sort((a, b) => (a.team - b.team) || (a.slot - b.slot));
    L.cells.forEach((cell, i) => {
      if (!cell) return;
      const a = order[i];
      cell.node.setActive(!!a);
      if (!a) return;
      const f = cell.fields;
      const vs = this.ctx.viewDb.skinById(this.ctx.db.skins[a.skin].skinId);
      const skinImg = this.ref(f.m_skin), bg = this.ref(f.m_background), nm = this.ref(f.m_name);
      if (vs && vs.icon && skinImg) { skinImg.setSprite(vs.icon); skinImg.enabled = true; }
      // LoadingCellDisplay.SetData: background sprite "bg_skin_<team>", name in the team colour
      if (bg) bg.setSprite('sprite:bg_skin_' + Math.max(1, Math.min(4, a.team)));
      const tc = gd.m_colorsTeam[a.team - 1];
      if (nm) { nm.setText(names[a.slot] || ''); if (tc) nm.color = tc.slice(); }
      const wait = searching && a.slot !== this.ctx.runner.localSlot;
      const root = this.nodeOf(f.m_root); if (root) root.setActive(!wait);
      const ld = this.nodeOf(f.m_loading); if (ld) ld.setActive(wait);
      if (wait) { (L.pending = L.pending || []).push({ root, ld, i }); return; }
      const ch = this.nodeOf(f.m_choosing); if (ch) ch.setActive(false);
      const ar = this.nodeOf(f.m_animationRoot) || cell.node;
      ar.ls[0] = ar.ls[1] = 0.001;
      L.appear.push({ node: ar, t: -0.12 * i, d: f.m_appearDuration || 0.3 });
    });
    const team = s.teams !== TeamConfig.FreeForAll;
    // FFA: one VS between the first two cells; 2v2: VS in the middle; 1v3 boss on the right: VS after the first cell
    if (L.versus) L.versus.setActive(!team || (s.teams === TeamConfig.OneVersusThree && !s.bossOnLeft));
    if (L.versusTeam) L.versusTeam.setActive(s.teams === TeamConfig.TwoVersusTwo);
    if (L.versusReverse) L.versusReverse.setActive(s.teams === TeamConfig.OneVersusThree && s.bossOnLeft);
    if (L.mode) L.mode.setText(modeLabel);
    if (L.stage) L.stage.setText(stageName);
  }

  revealVersus() {
    const L = this.loading;
    for (const p of L.pending || []) {
      if (p.root) p.root.setActive(true);
      if (p.ld) p.ld.setActive(false);
      const cell = L.cells[p.i];
      const ar = this.nodeOf(cell.fields.m_animationRoot) || cell.node;
      ar.ls[0] = ar.ls[1] = 0.001;
      L.appear.push({ node: ar, t: -0.08 * p.i, d: cell.fields.m_appearDuration || 0.3 });
    }
    L.pending = [];
  }

  hideVersus() { this.loading.panel.setActive(false); }

  displayReady() {
    this.startText.node.setActive(true);
    this.startText.setText(T('game.ready'));
    this.playAnim(this.startAnim);
  }

  displayStart() {
    this.startText.node.setActive(true);
    this.startText.setText(T('game.start'));
    this.playAnim(this.startAnim);
    this.ctx.audio.sfx('Play');
    this.hudGame.setActive(true);
    const anyBoss = this.ctx.runner.state.agents.some((a) => a.isBoss);
    if (this.bossBarNode) this.bossBarNode.setActive(anyBoss);
  }

  hideStart() { this.startText.node.setActive(false); }

  showGameOverText(text) {
    const t = this.timeOutText;
    t.node.setActive(true);
    t.setText(text);
    const an = t.node.get('Animation');
    if (an && an.runtime) an.runtime.play('game_text_smash');
  }

  playAnim(c) {
    if (c && c.runtime) { const k = (c.clip || '').replace(/^clip:/, ''); c.runtime.play(k); }
  }

  // ------------------------------------------------------------------------------------------------ events

  onEvent(e) {
    if (e.type === SimEventType.AgentDied) this.onAgentDied(e);
  }

  agentName(a) { return this.ctx.names[a.slot] || this.ctx.db.skins[a.skin].name; }

  teamColor(team) { const c = this.ctx.gameData.m_colorsTeam[team - 1]; return c ? c.slice() : [1, 1, 1, 1]; }

  onAgentDied(e) {
    const r = this.ctx.runner;
    const victim = r.agent(e.agent);
    if (!victim) return;
    const killer = r.agent(e.other);
    const me = r.localAgent;
    const mine = !!(killer && me && killer.team === me.team);
    for (const k of this.kills) {
      if (k.team1 !== mine) continue;
      let icon = null;
      if (killer) {
        const act = this.ctx.db.actions[e.flag ? killer.specialRef : killer.actionRef];
        const va = act && this.ctx.viewDb.action(act.name);
        if (va) icon = va.icon;
      }
      if (k.a1) { k.a1.setText(killer ? this.agentName(killer) : ''); k.a1.color = killer ? this.teamColor(killer.team) : [1, 1, 1, 1]; }
      if (k.a2) { k.a2.setText(this.agentName(victim)); k.a2.color = this.teamColor(victim.team); }
      if (k.weapon && icon) k.weapon.setSprite(icon);
      // KillDisplay.ShowQuantumKill: Animator.CrossFade("Appear", 0, 0, 0) (the controller has no Claim transition)
      if (k.an && k.an.runtime) k.an.runtime.play('Appear', 0, 0);
      this.killsShown++;
    }
  }

  // ------------------------------------------------------------------------------------------------ per frame

  update(dt) {
    for (const ap of this.loading.appear) {
      ap.t += dt;
      const k = ap.t <= 0 ? 0.001 : ap.t >= ap.d ? 1 : Math.max(0.001, easeOutBack(ap.t / ap.d));
      ap.node.ls[0] = ap.node.ls[1] = k;
    }
    const r = this.ctx.runner;
    if (!r) return;
    this.updateTimer();
    this.updateTeams();
    this.updateBoss(dt);
    this.updateButtons();
    this.updateRespawn();
  }

  updateTimer() {
    const r = this.ctx.runner, s = r.state;
    const hasTimer = s.timerMax > 0;
    if (this.timerRoot && this.timerRoot.activeSelf !== hasTimer) this.timerRoot.setActive(hasTimer);
    if (!hasTimer) return;
    const secs = Math.ceil(r.timerRemaining);
    if (secs === this.lastSecs) return;
    this.lastSecs = secs;
    this.timerText.setText(formatTimer(secs));
    if (secs <= 10 && secs > 0 && s.phase === GamePhase.Playing) {
      if (this.timerAnim && this.timerAnim.runtime) this.timerAnim.runtime.play('Focus', 0, 0);
      this.ctx.audio.sfx('Time');
    }
  }

  updateTeams() {
    const s = this.ctx.runner.state;
    const ls = s.goal === GoalType.LastSurvivor;
    for (const t of this.teams) {
      if (!t.init) {
        t.init = true;
        // the tutorial shows no score bubbles (clip frame): only the dummies counter text
        t.node.setActive(!this.tutorial && s.agents.some((a) => a.team === t.team && !a.isDummy));
        t.max = s.teams === TeamConfig.FreeForAll ? KILL_TARGET_FFA : KILL_TARGET_TEAM;
        // life icons only in LastSurvivor, the round bubble otherwise
        if (t.round) t.round.setActive(!ls);
      }
      if (!t.node.activeSelf) continue;
      let score, dead = false;
      if (ls) {
        score = 0; dead = true;
        for (const a of s.agents) {
          if (a.team !== t.team) continue;
          score += Math.max(0, LIVES - a.deathCount);
          if (!isDead(a) || has(a, StatusFlags.RespawnWait)) dead = false;
        }
      } else score = GameRules.teamScore(s, t.team);
      if (score !== t.prev) {
        if (t.prev >= 0 && t.an && t.an.runtime) t.an.runtime.setTrigger('Score');
        t.prev = score;
        t.text.setText(s.goal === GoalType.Kill5 ? `${score}/${t.max}` : String(score));
      }
      if (t.alive) t.alive.setActive(ls && !dead);
      if (t.dead) t.dead.setActive(ls && dead);
    }
  }

  updateBoss(dt) {
    if (!this.boss || !this.bossBarNode || !this.bossBarNode.activeSelf) return;
    const s = this.ctx.runner.state;
    const boss = s.agents.find((a) => a.isBoss);
    if (!boss) return;
    if (this.boss.name) this.boss.name.setText(this.agentName(boss));
    const f = boss.hpMax > 0 ? Math.max(0, Math.min(1, boss.hpCurrent / boss.hpMax)) : 0;
    this.boss.fill.value = f;
    this.boss.upd.value = smoothBar(this.boss, this.boss.upd.value, f, dt);
  }

  updateButtons() {
    const r = this.ctx.runner, a = r.localAgent, B = this.btn;
    if (!a) return;
    if (this.loadedSkin !== a.skin) {
      this.loadedSkin = a.skin;
      const db = this.ctx.db, vdb = this.ctx.viewDb;
      const ai = db.actions[a.actionRef], si = db.actions[a.specialRef];
      const va = ai && vdb.action(ai.name), vs = si && vdb.action(si.name);
      if (va && va.icon && B.actionIcon) B.actionIcon.setSprite(va.icon);
      if (vs && vs.icon && B.specialIcon) B.specialIcon.setSprite(vs.icon);
      if (B.specialButton) B.specialButton.setActive(hasPower(a, PowerType.SpecialUnlocked) && a.specialRef >= 0);
      const idx = Math.max(0, a.team - 1);
      const pick = (l) => (l && l.length ? l[Math.min(idx, l.length - 1)] : null);
      if (B.bgJoy && pick(B.joySprites)) B.bgJoy.setSprite(pick(B.joySprites));
      if (B.bgJump && pick(B.controlSprites)) B.bgJump.setSprite(pick(B.controlSprites));
      if (B.bgAction && pick(B.actionSprites)) B.bgAction.setSprite(pick(B.actionSprites));
      if (B.bgSpecial && pick(B.actionSprites)) B.bgSpecial.setSprite(pick(B.actionSprites));
    }
    const fa = a.cooldownActionMax > 0 ? Math.max(0, Math.min(1, a.cooldownAction / a.cooldownActionMax)) : 0;
    const fs = a.cooldownSpecialMax > 0 ? Math.max(0, Math.min(1, a.cooldownSpecial / a.cooldownSpecialMax)) : 0;
    if (B.actionCd) B.actionCd.fillAmount = fa;
    if (B.specialCd) B.specialCd.fillAmount = fs;
    if (this.prevActionFill > 0 && fa <= 0) this.cooldownFeedback(false);
    if (this.prevSpecialFill > 0 && fs <= 0) this.cooldownFeedback(true);
    this.prevActionFill = fa; this.prevSpecialFill = fs;
  }

  cooldownFeedback(special) {
    for (const b of this.vbuttons) {
      if (b.type === 0 || (b.type === 2) !== special) continue;
      if (b.cdFeedback && b.cdFeedback.runtime && b.node.activeInHierarchy) b.cdFeedback.runtime.play('ui_cooldown_feedback');
    }
  }

  setControls(on) {
    if (this.controlsShown === on) return;
    this.controlsShown = on;
    const cg = this.controls;
    if (cg) { cg.alpha = on ? 1 : 0; cg.interactable = on; cg.blocks = on; }
    if (!on) { this.releaseJoystick(); for (const b of this.vbuttons) this.setButton(b, false); this.ctx.input.resetVirtual(); }
  }

  updateRespawn() {
    const r = this.ctx.runner, a = r.localAgent;
    if (!a) return;
    if (r.state.phase === GamePhase.GameOver) {
      if (!this.gameOverSeen) { this.gameOverSeen = true; this.respawn.setActive(false); this.setControls(false); }
      return;
    }
    const waiting = isDead(a);
    if (this.respawn.activeSelf !== waiting) this.respawn.setActive(waiting);
    this.setControls(!waiting);
    if (!waiting) { this.lastRemaining = -1; return; }
    const can = has(a, StatusFlags.RespawnWait);
    if (this.respawnTimerRoot) this.respawnTimerRoot.setActive(can);
    const rem = Math.ceil(Math.max(0, a.respawnTimer));
    if (rem !== this.lastRemaining) { this.lastRemaining = rem; this.respawnTimer.setText(String(rem)); }
  }

  // life bars follow SLOT_LIFEBAR in screen space (late, after the camera moved)
  updateLifeBars(views, dt) {
    const r = this.ctx.runner, s = r.state, engine = this.ctx.engine;
    if (this.tutorial) {
      const me = r.localAgent;
      let best = -1, bd = 1e9;
      for (const a of s.agents) if (a.isDummy && !isDead(a) && me) { const d = Math.abs(a.pos.x - me.pos.x) + Math.abs(a.pos.y - me.pos.y); if (d < bd) { bd = d; best = a.id; } }
      this.tutoTarget = best;
    }
    const cv = this.lifeBarRoot.get('Canvas');
    const k = cv && cv.scale ? cv.scale : 1;
    for (const v of views) {
      const a = v.agent;
      let bar = this.lifeBars.get(a.id);
      if (!bar) bar = this.createLifeBar(v, a);
      const visible = !isDead(a) && s.phase !== GamePhase.GameOver && !(has(a, StatusFlags.Invisibility) && !r.isAlly(a));
      if (bar.root.activeSelf !== visible) bar.root.setActive(visible);
      if (!visible) continue;
      bar.fill.value = a.hpMax > 0 ? Math.max(0, Math.min(1, a.hpCurrent / a.hpMax)) : 0;
      bar.upd.value = smoothBar(bar, bar.upd.value, bar.fill.value, dt);
      if (bar.score && bar.scoreOn && bar.lastScore !== a.killCount) { bar.lastScore = a.killCount; bar.score.setText(String(a.killCount)); }
      if (bar.arrow) bar.arrow.setActive(a.id === this.tutoTarget);
      const w = (v.slotLifebar || v.root).world;
      const p = engine.worldToScreen(w[12], w[13] + (v.slotLifebar ? 0 : this.lbOffsetY), w[14]);
      if (!p) continue;
      const rc = bar.root.rect;
      rc.amin[0] = rc.amin[1] = rc.amax[0] = rc.amax[1] = 0;
      rc.pos[0] = p[0] / k; rc.pos[1] = p[1] / k;
    }
  }

  createLifeBar(v, a) {
    const inst = this.ctx.prefabs.spawn(this.ctx.viewDb.lifeBarPrefab, this.lifeBarRoot);
    const f = inst.root.script('LifeBar').fields;
    const ref = (x) => (x ? inst.ref(x) : null);
    const nodeOf = (x) => { const c = ref(x); return c && c.node ? c.node : c; };
    const bar = { root: inst.root, fill: ref(f.m_sliderLifeFill), upd: ref(f.m_sliderLifeFillUpdate), score: ref(f.m_score), vel: 0, lastScore: -1 };
    const fillImg = ref(f.m_lifeFill);
    const sp = this.ctx.gameData.m_lifebarTeam[a.team - 1];
    if (fillImg && sp) fillImg.setSprite(sp);
    const nm = ref(f.m_name);
    if (nm) { nm.setText(this.agentName(a)); nm.color = this.teamColor(a.team); }
    const boss = nodeOf(f.m_iconBoss); if (boss) boss.setActive(!!a.isBoss);
    const arrow = nodeOf(f.m_iconArrow); if (arrow) arrow.setActive(false);
    // tutorial: the arrow marks the dummy to shoot, dummies carry no name
    if (a.isDummy) { bar.arrow = arrow; if (nm) nm.node.setActive(false); }
    const s = this.ctx.runner.state;
    // kill count next to the bar only where a player's own kills decide: FFA deathmatch / kill race
    bar.scoreOn = !this.tutorial && s.teams === TeamConfig.FreeForAll && s.goal !== GoalType.LastSurvivor;
    const sr = nodeOf(f.m_scoreRoot); if (sr) sr.setActive(bar.scoreOn);
    bar.fill.value = 1; bar.upd.value = 1;
    this.lifeBars.set(a.id, bar);
    return bar;
  }

  // ------------------------------------------------------------------------------------------------ pointer

  // engine pointer hook: on-screen joystick and buttons write the local input's virtual state
  onPointer(type, p, hit) {
    if (type === 'down') {
      if (!this.controlsShown || !this.hudGame.activeInHierarchy) { this.mouseFallback(type, p, hit); return; }
      const b = hit && this.buttonOf(hit);
      if (b && !b.pointer && b.node.activeInHierarchy) { b.pointer = p.id; this.setButton(b, true); if (b.an && b.an.runtime) b.an.runtime.setTrigger('Pressed'); return; }
      const j = this.joy;
      if (j && !j.pointer && (!hit || this.isUnder(hit, j.node)) && this.inRect(j.node, p.x, p.y)) {
        j.pointer = p.id;
        const k = this.hudScale();
        if (!j.fixed && j.bg) {
          const r = this.ctx.engine.ui.screenRect(j.bg.parent);
          j.bg.rect.pos[0] = (p.x - r[0]) / k; j.bg.rect.pos[1] = (p.y - r[1]) / k;
          j.origin = [p.x, p.y];
        } else { const w = j.bg.world; j.origin = [w[12], w[13]]; }
        this.dragJoystick(p);
        return;
      }
      this.mouseFallback(type, p, hit);
    } else if (type === 'move') {
      if (this.joy && this.joy.pointer === p.id) this.dragJoystick(p);
    } else {
      if (this.joy && this.joy.pointer === p.id) this.releaseJoystick();
      for (const b of this.vbuttons) if (b.pointer === p.id) { b.pointer = null; this.setButton(b, false); if (b.an && b.an.runtime) b.an.runtime.setTrigger('Normal'); }
      if (this.mousePointer === p.id) { this.mousePointer = null; this.ctx.input.mouseAction = false; }
    }
  }

  // left mouse outside the HUD attacks (desktop)
  mouseFallback(type, p, hit) {
    if (hit || !this.controlsShown) return;
    this.mousePointer = p.id;
    this.ctx.input.mouseAction = true;
  }

  hudScale() { const cv = this.root.find('HUD').get('Canvas'); return cv && cv.scale ? cv.scale : 1; }

  dragJoystick(p) {
    const j = this.joy, k = this.hudScale();
    let dx = (p.x - j.origin[0]) / k, dy = 0;
    const len = Math.abs(dx);
    if (len > j.radius) dx *= j.radius / len;
    if (j.handle) { j.handle.rect.pos[0] = dx; j.handle.rect.pos[1] = dy; }
    this.ctx.input.virtual.dirX = dx / j.radius;
  }

  releaseJoystick() {
    const j = this.joy;
    if (!j) return;
    j.pointer = null;
    this.ctx.input.virtual.dirX = 0;
    if (j.handle) { j.handle.rect.pos[0] = 0; j.handle.rect.pos[1] = 0; }
    if (j.bg && !j.fixed && j.bgDefault) { j.bg.rect.pos[0] = j.bgDefault[0]; j.bg.rect.pos[1] = j.bgDefault[1]; }
  }

  setButton(b, down) {
    const v = this.ctx.input.virtual;
    if (b.type === 0) v.jump = down; else if (b.type === 1) v.action = down; else if (b.type === 2) v.special = down;
  }

  buttonOf(n) { for (let x = n; x; x = x.parent) { const b = this.vbuttons.find((q) => q.node === x); if (b) return b; } return null; }
  isUnder(n, root) { for (let x = n; x; x = x.parent) if (x === root) return true; return false; }
  inRect(n, x, y) { const r = this.ctx.engine.ui.screenRect(n); return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]; }
}

// Mathf.SmoothDamp(cur, goal, ref vel, 0.35) for the delayed (white) part of a life bar; jumps up at once
function smoothBar(o, cur, goal, dt) {
  if (goal >= cur) { o.vel = 0; return goal; }
  const smooth = 0.35, omega = 2 / smooth, x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - goal;
  const temp = (o.vel + omega * change) * dt;
  o.vel = (o.vel - omega * temp) * exp;
  let out = goal + (change + temp) * exp;
  if (out < goal) { out = goal; o.vel = 0; }
  return out;
}
