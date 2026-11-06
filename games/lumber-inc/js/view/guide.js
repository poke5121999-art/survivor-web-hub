// Tutorial display for js/sim/guide.js (rules/workers-guide-camera.md B1):
//   arrows  the two FarmGuideArrow prefabs of art/guide. GuideArrowPrefab (m_Type 0) stands by the player and points
//           at the target, its child sliding 0.4 m to and fro; GuideArrowPrefab1 (m_Type 1) hangs over the target and
//           bobs from 3 m to 2.6 m. Both DOTween yoyo loops of 0.4 s, linear.
//   word    GuideWordPanel: the YD_img_02 bubble 320 px under the top edge, 500 px wide, Poppins Bold 24 white.
//   hand    GuideHandPanel: the Common_guidehand finger pressing on a UI button.
// CameraFocusCommand is applied by main.js from `focus()`.
import * as THREE from 'three';

const BOB = 0.4;
const NEAR = 3; // the arrow by the player hides once the target is this close

export class GuideView {
  constructor({ scene3, arrows, world, sim, host, ui }) {
    Object.assign(this, { world, sim, host, ui, t: 0, tree: null, word: '', hand: null });
    const tpl = name => arrows.root.children.find(o => o.name === name);
    const paint = o => o.traverse(m => { if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ color: 0xff5c00 }); });
    this.man = tpl('GuideArrowPrefab').clone(true);
    this.pos = tpl('GuideArrowPrefab1').clone(true);
    for (const o of [this.man, this.pos]) { paint(o); o.position.set(0, 0, 0); o.visible = false; scene3.add(o); }
    this.manChild = this.man.children[0];
    this.posChild = this.pos.children[0];
    this.manZ = this.manChild.position.z;
    this.posY = this.posChild.position.y;
    this.names = new Map();
    world.nodes.forEach((n, i) => { if (!this.names.has(n.n)) this.names.set(n.n, i); });

    this.bubble = document.createElement('div');
    this.bubble.style.cssText = 'position:absolute;left:50%;top:0;width:500px;box-sizing:border-box;padding:16px 13px 16px 20px;display:none;pointer-events:none;z-index:15;transform-origin:50% 0';
    this.text = document.createElement('div');
    this.text.style.cssText = 'position:relative;font:24px LumberUI,sans-serif;color:#fff;text-align:center;line-height:1.15;text-shadow:1.2px 1.8px 0 rgba(0,0,0,.45)';
    this.bubble.appendChild(this.text);
    ui.sprite(this.bubble, { sprite: 'YD_img_02', color: [1, 1, 1, 1], type: 'sliced' });
    host.appendChild(this.bubble);

    this.finger = document.createElement('div');
    this.finger.style.cssText = 'position:absolute;width:104px;height:124px;display:none;pointer-events:none;z-index:40;transform-origin:0 0';
    ui.sprite(this.finger, { sprite: 'Common_guidehand', color: [1, 1, 1, 1], type: 'simple' });
    host.appendChild(this.finger);
  }

  at(name) {
    const i = this.names.get(name);
    return i == null ? null : this.world.pos(i);
  }

  // The tree the TreeChopCommand arrow marks: the nearest standing one of forest 1, kept until it falls.
  chopTarget() {
    const p = this.sim.state.player;
    if (this.tree && this.tree.state === 0) return this.tree.pos;
    const d = t => (t.pos.x - p.x) ** 2 + (t.pos.z - p.z) ** 2;
    this.tree = this.sim.forest.trees.filter(t => t.forest === 1 && t.state === 0).sort((a, b) => d(a) - d(b))[0] || null;
    return this.tree && this.tree.pos;
  }

  focus() {
    const f = this.sim.guide.show.focus;
    if (!f) return null;
    const p = this.at(f.target);
    return p && { pos: p, level: f.level };
  }

  update(dt, uiNode) {
    this.t += dt;
    const show = this.sim.guide.show;
    const yo = Math.abs(((this.t / BOB) % 2) - 1); // 1 -> 0 -> 1, linear
    const goal = show.tree ? this.chopTarget() : show.arrow ? this.at(show.arrow) : null;
    if (!show.tree) this.tree = null;
    const p = this.sim.state.player;
    this.pos.visible = !!goal && !show.focus;
    if (goal) {
      this.pos.position.set(goal.x, show.tree ? 3 : 0, goal.z);
      this.posChild.position.y = this.posY - 0.4 * (1 - yo);
    }
    const far = goal && Math.hypot(goal.x - p.x, goal.z - p.z) > NEAR;
    this.man.visible = !!far && !show.focus;
    if (far) {
      this.man.position.set(p.x, 0.15, p.z);
      // The arrow mesh points down its local -z (Unity +z after the z flip), so look away from the goal.
      this.man.lookAt(2 * p.x - goal.x, 0.15, 2 * p.z - goal.z);
      this.manChild.position.z = this.manZ - 0.4 * (1 - yo);
    }

    const scale = this.host.clientWidth / 750;
    const word = show.word ? this.ui.t(show.word) : '';
    if (word !== this.word) { this.word = word; this.text.textContent = word; }
    this.bubble.style.display = word ? 'block' : 'none';
    if (word) {
      const [ox, oy] = (show.offset || '0|0').split('|').map(Number);
      this.bubble.style.transform = `translate(${-250 * scale + ox * scale}px, ${(320 - oy) * scale}px) scale(${scale})`;
      this.bubble.style.transformOrigin = '0 0';
    }

    const el = show.hand && uiNode(show.hand);
    this.finger.style.display = el ? 'block' : 'none';
    if (el) {
      const r = el.getBoundingClientRect(), h = this.host.getBoundingClientRect();
      const press = 1 - 0.12 * yo;
      this.finger.style.transform = `translate(${r.left - h.left + r.width / 2}px, ${r.top - h.top + r.height / 2}px) scale(${scale * press})`;
    }
  }
}
