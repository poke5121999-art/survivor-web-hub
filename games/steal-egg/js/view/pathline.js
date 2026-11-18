// NavmeshPathDraw guide lines, drawn the way the original draws them (rules/upgrades-shop.md section 2, rules/tutorial.md
// sections 3-4, art/world/lines.json from tools/export_lines.py).
//
// Two scene objects drive a line:
//   SpeedUpgradePathGuide (Player1/PathContainer): every max(0.1, checkInterval) = 0.25 s of game time RefreshGuide looks for
//     an unpurchased speed plan with cost <= coins (CanAffordNow); found -> ShowGuide: SetActive(true) on its pathDraw node
//     ("NavmeshPathDraw (3)", material Arrow 2) and SetDestination(shopTarget); none -> HideGuide = pathDraw.Stop().
//   TutorialManager: pathDraw = Player1/PathContainer/path (material Arrow). ShowGuidance(target) -> SetDestination(target);
//     no target / HideGuidance -> ClearPath.
// NavmeshPathDraw.Update: while a destination is set and not stopped, every max(0.03, recalculationTime 0.01) s of game time
// Draw(): NavMesh path from the player (origin = PlayerCarryController.transform) to the destination, both ends and every
// corner sampled onto the navmesh within navMeshSampleDistance 4 (unchanged when nothing is that near), each corner lifted
// by clamp(groundOffset 0.04, 0.01, 0.15), then LineRenderer.positionCount + SetPositions with those WORLD corners.
//
// The quirk this reproduces: all 30 LineRenderers have useWorldSpace = false, so Unity reads the corners in the renderer's
// own local space and the line is drawn at node.localToWorld(corner). For the Player1 nodes (rotated -90 deg about X,
// scale 4, under Player1 scale 0.4) that is a line about 1.6 x the corner's coordinates away from the player, and it
// travels with the player because the node does. The points are therefore stored LOCAL and mapped through the node's
// current world matrix every frame, exactly like the renderer does.
//
// Also like the original:
//  - ClearPath / Stop only set destination = null and stopped = true. Nothing empties the LineRenderer or disables it, so
//    after a hide the last points stay on screen (frozen in local space) and keep following the node.
//  - before the first Draw the serialized 2 points (local (0,0,0) -> (0,0,1)) are what an enabled renderer shows: for the
//    tutorial's active "path" object a 1.6 m strip standing on Player1.
//  - the objects only update and render while they are active in the hierarchy: with Player2..6 picked, Player1 is
//    inactive and nothing is drawn.
// Rendering: LineRenderer alignment View (strip faces the camera), width 0.7 x curve (one key of 1.0, world units), Tile
// texture mode (one tile per unit of length, material scale 1), colour = material _Color x vertex gradient (white), the
// "pointer" chevron texture, transparent, no depth write, double sided. The original material is the Standard shader in Fade
// mode (lit); it is drawn unlit here. No scrolling: the material's _Speed (-1) is not read by the Standard shader and no
// scroller component sits on these objects.
import * as THREE from 'three';

const SAMPLE = 4;                       // navMeshSampleDistance
const OFFSET = Math.min(0.15, Math.max(0.01, 0.04));   // groundOffset clamp, as in Draw
const RECALC = Math.max(0.03, 0.01);    // Update: max(0.03, recalculationTime)

const v3 = new THREE.Vector3();

// One NavmeshPathDraw + its LineRenderer.
class PathDraw {
  constructor({ node, line, material, texture, nav, origin, scene }) {
    this.node = node;
    this.line = line;
    this.nav = nav;
    this.origin = origin;                              // () -> [x, y, z] of PlayerCarryController.transform
    this.local = line.positions.map(p => [p[0], p[1], p[2]]);   // LineRenderer positions, local space
    this.enabled = line.enabled;
    this.destination = null;                           // () -> [x, y, z] | null
    this.stopped = true;
    this.timer = 0;
    this.draws = 0;
    this.last = null;                                  // { origin, destination, corners } of the latest Draw
    const hw = line.widthMultiplier * line.widthCurve[0][1] / 2;
    this.halfWidth = hw;
    this.tile = [line.textureScale[0] * material.scale[0], line.textureScale[1] * material.scale[1]];
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      map: texture, color: new THREE.Color(material.color[0], material.color[1], material.color[2]), opacity: material.color[3],
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.name = `pathline:${line.path}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // GameObject.activeInHierarchy
  get active() { for (let o = this.node; o; o = o.parent) if (!o.visible) return false; return true; }

  sample(p) {
    const c = this.nav.closest(p);
    return Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]) <= SAMPLE ? c : [p[0], p[1], p[2]];
  }

  setDestination(fn) {
    this.destination = fn;
    if (!fn) { this.clearPath(); return; }
    this.stopped = false;
    this.enabled = true;
    this.draw();
  }

  clearPath() { this.destination = null; this.stopped = true; }

  // NavmeshPathDraw.Draw
  draw() {
    const o = this.origin(), d = this.destination && this.destination();
    if (!o || !d) return;
    const a = this.sample(o), b = this.sample(d);
    const path = this.nav.path(a, b);
    this.draws++;
    if (!path) { this.local = []; this.last = { origin: a, destination: b, corners: [] }; return; }
    const corners = [a, ...path].map(c => this.sample(c));
    this.last = { origin: a, destination: b, corners };
    this.local = corners.map(c => [c[0], c[1] + OFFSET, c[2]]);   // world corners handed to a local-space renderer
  }

  // NavmeshPathDraw.Update
  update(dt) {
    if (!this.active || this.stopped || this.destination == null) return;
    this.timer += dt;
    if (this.timer >= RECALC) { this.timer = 0; this.draw(); }
  }

  // Current world positions of the renderer's points (what the LineRenderer draws): node.localToWorld(local).
  worldPoints() {
    this.node.updateWorldMatrix(true, false);
    return this.local.map(p => { v3.set(p[0], p[1], p[2]).applyMatrix4(this.node.matrixWorld); return [v3.x, v3.y, v3.z]; });
  }

  get visible() { return this.enabled && this.active && this.local.length >= 2; }

  // View-aligned strip: a left/right vertex pair per point, u = length so far in the tile direction, v = 0 / 1.
  render(camera) {
    const m = this.mesh;
    m.visible = this.visible;
    if (!m.visible) return;
    const pts = this.worldPoints(), n = pts.length, hw = this.halfWidth;
    const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
    let len = 0;
    const cam = camera.position;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
      // tangent: mean of the neighbouring segment directions
      let tx = 0, ty = 0, tz = 0;
      for (const [a, b] of [[i - 1, i], [i, i + 1]]) {
        if (a < 0 || b >= n) continue;
        const dx = pts[b][0] - pts[a][0], dy = pts[b][1] - pts[a][1], dz = pts[b][2] - pts[a][2], l = Math.hypot(dx, dy, dz) || 1;
        tx += dx / l; ty += dy / l; tz += dz / l;
      }
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      // side = tangent x (camera - point), scaled to half width
      const cx = cam.x - p[0], cy = cam.y - p[1], cz = cam.z - p[2];
      let sx = ty * cz - tz * cy, sy = tz * cx - tx * cz, sz = tx * cy - ty * cx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx *= hw / sl; sy *= hw / sl; sz *= hw / sl;
      pos.set([p[0] - sx, p[1] - sy, p[2] - sz, p[0] + sx, p[1] + sy, p[2] + sz], i * 6);
      uv.set([len * this.tile[0], 0, len * this.tile[0], 1], i * 4);
      if (i) { const k = 2 * i; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = m.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
  }
}

export class PathLines {
  constructor({ sim, world, scene, camera, linesJson, artBase, version = '' }) {
    this.sim = sim;
    this.world = world;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'pathlines';
    scene.add(this.group);
    const q = version ? `?v=${version}` : '';
    this.textures = new Map();
    const tex = name => {
      if (!this.textures.has(name)) {
        const t = new THREE.TextureLoader().load(`${artBase}/tex/${name}.webp${q}`);
        t.colorSpace = THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        this.textures.set(name, t);
      }
      return this.textures.get(name);
    };
    const byPath = new Map(linesJson.lines.map(l => [l.path, l]));
    const player = () => { const p = sim.state.actors[0]; return this.playerPos ? this.playerPos() : p.pos; };
    const make = node => {
      const line = byPath.get(world.path(node));
      return line && new PathDraw({ node, line, material: linesJson.materials[line.mat], texture: tex(linesJson.materials[line.mat].tex),
        nav: sim.nav, origin: player, scene: this.group });
    };
    const mbNode = key => world.objects.find(o => o.userData.node.k && o.userData.node.k[key]);

    // SpeedUpgradePathGuide
    const sg = mbNode('SpeedUpgradePathGuide');
    this.guide = null;
    if (sg) {
      const k = sg.userData.node.k.SpeedUpgradePathGuide;
      this.guide = {
        host: sg, interval: Math.max(0.1, k.checkInterval), nextCheck: 0, pathVisible: false,
        shop: world.objects[k.shopTarget.n], draw: make(world.objects[k.pathDraw.n]), plan: null,
      };
      this.guide.draw.node.updateWorldMatrix(true, false);
      // Start: CollectPlans, HideGuide
      this.guide.draw.clearPath();
    }
    // TutorialManager
    const tm = mbNode('TutorialManager');
    this.tutorial = tm ? { draw: make(world.objects[tm.userData.node.k.TutorialManager.pathDraw.n]) } : null;
    this.all = [this.guide && this.guide.draw, this.tutorial && this.tutorial.draw].filter(Boolean);
  }

  // The player position PlayerCarryController.transform has at the time of a Draw: the drawn player object.
  setPlayer(fn) { this.playerPos = fn; }

  // SpeedUpgradePathGuide.FindAffordableUnpurchasedPlan: first plan in planId order with !isUpgraded && cost <= coins
  affordablePlan() {
    const s = this.sim.state, bought = s.upgrades.speedPlans;
    return [...this.sim.D.speedPlans].sort((a, b) => a.plan - b.plan).find(p => !bought[p.plan] && s.coins >= 0 && p.cost <= s.coins) || null;
  }

  // time = game time (stops with Time.timeScale = 0); tutorialPointer = TutorialManager's current target {pos} or null
  update(time, tutorialPointer) {
    const dt = this.t == null ? 0 : Math.max(0, time - this.t);
    this.t = time;
    const g = this.guide;
    if (g && g.draw) {
      // SpeedUpgradePathGuide.Update runs while its object is active in the hierarchy
      let on = true;
      for (let o = g.host; o; o = o.parent) if (!o.visible) on = false;
      if (on && g.nextCheck <= time) {
        g.nextCheck = time + g.interval;
        g.plan = this.affordablePlan();
        if (g.plan) {
          // ShowGuide
          g.draw.node.visible = true;
          if (g.draw.stopped || !g.draw.destination) g.draw.setDestination(() => g.shop.getWorldPosition(v3).toArray());
          else g.draw.draw();
          g.pathVisible = true;
        } else {
          // HideGuide = pathDraw.Stop(): destination null, stopped; the renderer keeps its last points
          g.draw.clearPath();
          g.pathVisible = false;
        }
      }
    }
    const t = this.tutorial;
    if (t) {
      // ShowGuidance(text, target) -> SetDestination(target) (the Transform: later moves of the target are followed);
      // no target / HideGuidance -> ClearPath
      const p = tutorialPointer && tutorialPointer.pos;
      t.dest = p || null;
      if (p && !t.draw.destination) t.draw.setDestination(() => t.dest);
      else if (!p && t.draw.destination) t.draw.clearPath();
    }
    for (const d of this.all) d.update(dt);
  }

  draw() { for (const d of this.all) d.render(this.camera); }
}
