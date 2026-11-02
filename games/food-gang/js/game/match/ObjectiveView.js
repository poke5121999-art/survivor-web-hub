// View of the web-only objective modes (js/sim/Systems/Objectives.js) [ĐỀ XUẤT], drawn with Food Gang's own art:
//   Push the Fridge: the reward fridge (fridge_reward_01) rides the cart path; finish lines in the team colours; it wobbles
//     while pushed and its face shows; a bar under the timer is not needed: the fridge itself is the progress.
//   Defend the Fridge: the big reward fridge (fridge_reward_03) at the defenders' end, a life bar over it, a flash on
//     every hit (comfort-capped like the fighters), its door opens when it breaks.
import { GoalType } from '../../sim/index.js';
import { cartPos, cartPath, houseRect, defenderTeam, OBJECTIVE_EVENT } from '../../sim/Systems/Objectives.js';

const TEAM_COL = [null, [0.1, 0.72, 0.84, 1], [0.89, 0.24, 0.16, 1]];
// sprite pivot sits at the centre of the 672x480 source frame; content bottom = (oy - py) / ppu
const BOTTOM = (sp) => (sp.oy - sp.py) / sp.ppu;

function spriteNode(engine, name, sprite, scale, order, color = [1, 1, 1, 1]) {
  const inst = engine.spawn({ name, kind: 'prefab', roots: [0], nodes: [{ id: 0, name, parent: -1, active: 1, layer: 0, tf: { p: [0, 0, 0], r: 0, s: [scale[0], scale[1], 1] },
    comps: [{ type: 'SpriteRenderer', enabled: 1, sprite: 'sprite:' + sprite, color, flip: [0, 0], layer: 0, order, mat: 'mat:Sprite-Unlit-Default', drawMode: 0, size: [1, 1], maskInteraction: 0 }] }] }, null);
  return { inst, node: inst.root, sr: inst.root.get('SpriteRenderer') };
}

export class ObjectiveView {
  constructor(ctx) {
    this.ctx = ctx;
    const s = ctx.runner.state, E = ctx.engine;
    this.goal = s.goal;
    this.parts = [];
    this.flash = 0;
    this.t = 0;
    if (s.goal === GoalType.Payload) {
      this.body = spriteNode(E, 'PayloadFridge', 'fridge_reward_01_close', [0.6, 0.6], -40);
      this.face = spriteNode(E, 'PayloadFace', 'fridge_reward_face_01', [0.6, 0.6], -39);
      this.parts.push(this.body, this.face);
      // finish lines: team 1 pushes to +goal (team 2's side), so the +goal line is team 1's target
      const P = cartPath(s.mapIndex);
      for (const [t, team] of [[P.goal, 1], [-P.goal, 2]]) {
        const p = cartPos(s.mapIndex, t);
        const pole = spriteNode(E, 'FinishLine', 'Square', [0.18, 3.2], -41, TEAM_COL[team]);
        pole.node.lp[0] = p.x; pole.node.lp[1] = p.y + 1.6; pole.node.lp[2] = 0.5;
        const flag = spriteNode(E, 'FinishFlag', 'Square', [0.9, 0.55], -41, TEAM_COL[team]);
        flag.node.lp[0] = p.x + (team === 1 ? -0.45 : 0.45); flag.node.lp[1] = p.y + 2.9; flag.node.lp[2] = 0.5;
        this.parts.push(pole, flag);
      }
    } else if (s.goal === GoalType.Siege) {
      const h = houseRect(s);
      this.house = h;
      this.body = spriteNode(E, 'SiegeFridge', 'fridge_reward_03_close', [0.85, 0.85], -40);
      const sp = this.body.sr.spriteObj;
      this.body.node.lp[0] = h.cx; this.body.node.lp[1] = (h.cy - h.hy) - BOTTOM(sp) * 0.85; this.body.node.lp[2] = 0.6;
      this.face = spriteNode(E, 'SiegeFace', 'fridge_reward_face_03', [0.85, 0.85], -39);
      this.face.node.lp[0] = h.cx; this.face.node.lp[1] = h.cy + 0.2; this.face.node.lp[2] = 0.55;
      const def = defenderTeam(s);
      this.barBg = spriteNode(E, 'SiegeBarBg', 'Square', [2.6, 0.32], -38, [0.08, 0.08, 0.08, 0.85]);
      this.barFill = spriteNode(E, 'SiegeBar', 'Square', [2.5, 0.22], -37, TEAM_COL[def]);
      for (const b of [this.barBg, this.barFill]) { b.node.lp[0] = h.cx; b.node.lp[1] = h.cy + h.hy + 0.9; b.node.lp[2] = 0.5; }
      this.parts.push(this.body, this.face, this.barBg, this.barFill);
    }
    for (const p of this.parts) p.node.updateWorld(null);
  }

  onEvent(e) {
    if (e.type === OBJECTIVE_EVENT.ObjectiveHit) this.flash = 1;
  }

  update(dt) {
    if (!this.body) return;
    const s = this.ctx.runner.state;
    this.t += dt;
    const cf = this.ctx.engine.comfort, fc = cf ? cf.flash : 1;
    if (this.goal === GoalType.Payload) {
      const p = cartPos(s.mapIndex, s.cartT || 0);
      const push = s.cartPush || 0, moving = push === 1 || push === 2;
      const sp = this.body.sr.spriteObj;
      const wob = moving ? Math.sin(this.t * 14) * 2.5 : 0;
      const n = this.body.node;
      n.lp[0] = p.x; n.lp[1] = p.y - BOTTOM(sp) * 0.6; n.lp[2] = 0.6;
      n.setEuler(0, 0, wob);
      this.face.node.lp[0] = p.x; this.face.node.lp[1] = p.y + 1.15; this.face.node.lp[2] = 0.55;
      this.face.node.setEuler(0, 0, wob);
      // tint: the pushing team's colour, white when contested / idle
      const col = moving ? TEAM_COL[push] : [1, 1, 1, 1];
      this.body.sr.flashColor = col.slice(0, 3);
      this.body.sr.flashAmount = moving ? 0.18 : 0;
    } else {
      const k = s.objHpMax ? Math.max(0, s.objHp / s.objHpMax) : 1;
      this.barFill.node.ls[0] = 2.5 * k;
      this.barFill.node.lp[0] = this.house.cx - 1.25 * (1 - k);
      this.flash = Math.max(0, this.flash - dt * 6);
      this.body.sr.flashColor = [1, 1, 1];
      this.body.sr.flashAmount = this.flash * 0.7 * fc;
      if (k <= 0 && this.body.sr.spriteRef !== 'sprite:fridge_reward_03_open') {
        this.body.sr.setSprite('sprite:fridge_reward_03_open');
        this.face.node.setActive(false);
      }
    }
    for (const p of this.parts) p.node.updateWorld(null);
  }

  debug() {
    const s = this.ctx.runner.state;
    return this.goal === GoalType.Payload ? { cartT: s.cartT, push: s.cartPush, x: this.body && this.body.node.lp[0] } : { hp: s.objHp, hpMax: s.objHpMax, x: this.house && this.house.cx };
  }

  dispose() { for (const p of this.parts) p.inst.root.destroy(); this.parts = []; }
}
