// Camera director. Overview: the Minecraft Dungeons camera, measured on the owner's clip (~/handoff/ast-par/cam/mcd-camera.md):
// a fixed diagonal view at 47 degrees of pitch through a 27-degree lens, no rotation. The diagonal comes from the world's
// 45-degree block grid (the camera looks straight down -z), so block edges run at about 36 degrees on screen as in the clip.
// The distance is no longer the one that fits the whole pad: the beasts stand 1.0-1.55 m, half MCD's hero, and at the
// whole-pad distance they were 16-21 px tall on a 360 px frame. The camera frames the fight's real cluster instead: every
// living unit on the pad (feet to head), plus the gate of each pack due in the next SPAWN_LOOK seconds, kept inside the
// play band (under the top HUD pieces, over the hero cards, both read from js/ui/hud.js at run time). The distance is the
// closest that holds the cluster, between TIGHT_FILL (a 2.7 m reference stands that share of the frame height) and the
// whole-pad fit; it pulls back fast (a pack about to arrive, a spread fight) and closes in slowly. The pan follows the
// cluster's centre, and the lens shift centres it between the bands. A boss widens the far bound to its own framing while
// it lives, and the lift slides the picture up or down when a tall body or a flyer would still reach a band.
// During a run between pads the camera frames the team only and eases out to the whole-pad distance, so the next pad shows.
// Spectate: a chase camera behind and above one unit, blended in and out.
import { ARENA } from '../sim/battle.js?v=20261122a';
import { FLY_Y } from './keys.js?v=20261122a';
const THREE = window.THREE;
const BZ = window.BZ;

// ---- the overview (MCD) ----
const PITCH = 47 * Math.PI / 180; // MCD: block edges at 34-38 degrees on screen = sin(pitch) 0.73 at a 45-degree yaw
const FOV_OVER = 27;              // MCD: vertical lens from the lean of upright posts at the frame side (26-28 degrees)
const MCD_FILL = 0.107;           // MCD: its hero stands 0.10-0.12 of the frame height; the whole-pad fit is never closer than this
const TIGHT_FILL = 0.175;         // the closest framing: a 2.7 m reference at the centre stands this share (a 1.4 m beast ~0.09, MCD's hero)
const HERO_H = 2.7;
export const PLAY = {             // the play band in design px (frame 780 wide): what the HUD leaves to the fight
  top: 38,                        // under the top corner pieces (js/ui/hud.js, 3-33) and a margin
  topBoss: 40,                    // while a boss lives the left cluster grows to its boss row (5-35)
  cards: { x0: 241.5, x1: 538.5, y: 252 }, // the hero card block with the flame headroom, bottom centre
  side: 10,                       // rim points stay this far from the left and right edges
  bottom: 6,                      // and outside the card block, this far above the bottom edge
};
// The numbers above are only the fallback before the HUD exists: every frame the camera reads the HUD's own rectangles
// (C.bandOf, wired in main.js to hud.band()) and refits when they change, so a HUD redesign moves the band with it.
const TOP_MARGIN = 5;   // design px kept between the lowest top HUD piece and the band
const GAP = 3;          // design px between the band edges and the fitted rim
const FIT_K = 1.04;     // the spawn rim is at 1.04 of the ellipse
const HERO_K = 0.9;     // heroes stay inside this share of the ellipse
const HEAD_FAR = 2.3;   // metres of body at the far rim that must stay under the top band (a monster at 1.05 scale)
const SINK = 1.7;       // metres under the floor a monster climbing over the near rim is drawn at: it stays over the cards too
const BOSS_BLEND = 1.2; // 1/s: the pull back to the boss framing while the boss rises (under its intro)
const PTS = 48;
const FOLLOW = 2.2;     // 1/s: how fast the pan catches the cluster's centre
const ZOOM_OUT = 4;     // 1/s: pulling back to hold the cluster (fast: nothing may leave the frame)
const ZOOM_IN = 0.8;    // 1/s: closing in when the cluster shrinks (slow: no pumping)
const ZOOM_RATE = 0.35; // the most the distance may change per second, as a share of the whole-pad distance
const SPAWN_LOOK = 1.6; // s: a pack due this soon has its gate framed before it steps out
const CL_SIDE = 0.6;    // m: half width kept around each unit
const CL_GAP = 6;       // design px kept between the cluster's box and the band edges
const RUN_Y = 0.5;       // MCD: the hero's feet at 0.49-0.53 of the frame height
const LIFT = 5;         // 1/s: how fast the picture slides up or down during a run to keep the team's feet at RUN_Y
const PUSH = 0.028;      // push-in on an ultimate: 2.8% scale about the casting hero, clamped so the rim stays in the frame
const RIM_PAD = 0.012;   // NDC margin kept between the rim and the frame edge while pushing
const SHAKE_PAD = 0.003;
// ---- the chase view ----
const FOV_CHASE = 58;
const CHASE_FILL = 0.26; // share of the frame height the followed unit stands tall
const CHASE_FILL_MIN = 0.15; // never pull back so far that the unit gets small, whatever its width
const CHASE_PITCH = 22 * Math.PI / 180;

export function createCamera(H) {
  const { camera, G } = H;
  const fit = new THREE.PerspectiveCamera(FOV_OVER, 780 / 360, 1, 500);
  const focus = new THREE.Vector3();
  const v = new THREE.Vector3(); const look = new THREE.Vector3(); const pos = new THREE.Vector3();
  let dist = 36; const pitch = PITCH; let shift = 0; let rim = { x0: -0.95, x1: 0.95, y0: -0.5, y1: 0.7 }; let key = ''; let blend = 0; let want = 0; let target = 0; let fov = FOV_OVER;
  const pan = { x: 0, z: 0, lo: { x: 0, z: 0 }, hi: { x: 0, z: 0 }, init: false, lift: 0 };
  const C = { focus, pan, PLAY, bandOf: null, band: null, get bossK() { return bossK; }, get R() { return ARENA.z * FIT_K; }, get dist() { return dist; }, get shift() { return shift; }, get pitch() { return pitch; }, get fovOver() { return FOV_OVER; }, mode: 'overview', spectate(uid) { target = uid || 0; want = target ? 1 : 0; H.spectateUid = target; }, update };
  Object.defineProperty(C, 'mode', { get: () => (target ? 'spectate' : 'overview') });

  // the fit camera at distance d panned to (px, pz), lens shift sh; design px of a world point
  function place(d, px, pz) { fit.position.set(px, Math.sin(pitch) * d, pz + Math.cos(pitch) * d); fit.lookAt(px, 0, pz); fit.updateMatrixWorld(true); }
  function toPx(x, y, z, sh, out) {
    const u = H.size.u || 1; v.set(x, y, z).project(fit);
    out[0] = (v.x + 1) / 2 * H.size.w / u; out[1] = (1 - (v.y + sh)) / 2 * H.size.h / u; return out;
  }
  const q = [0, 0];
  // the rim's box in design px: top of the far half with heads, bottom split into the card column and the rest
  // F: the framing being fitted, { head: metres of body on the far half, top: the band's top, side: metres of body
  // sticking out sideways at the left and right points, near: the share of the ellipse whose near half must clear the
  // cards, sink: metres under the floor there }
  function rimBox(sh, F) {
    const wd = H.size.w / (H.size.u || 1); let top = 1e9; let botC = -1e9; let botS = -1e9; let x0 = 1e9; let x1 = -1e9;
    for (let i = 0; i < PTS; i++) {
      const a = (i / PTS) * Math.PI * 2; const nk = Math.sin(a) > 0 ? F.near / FIT_K : 1;
      const x = Math.cos(a) * (ARENA.x * FIT_K * nk + F.side); const z = Math.sin(a) * ARENA.z * FIT_K * nk;
      toPx(x, 0, z, sh, q); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
      top = Math.min(top, q[1]);
      if (z > 0) toPx(x, -F.sink, z, sh, q);
      if (q[0] > PLAY.cards.x0 - 4 && q[0] < PLAY.cards.x1 + 4) botC = Math.max(botC, q[1]); else botS = Math.max(botS, q[1]);
      if (z < 0) { toPx(x, F.head, z, sh, q); top = Math.min(top, q[1]); }
    }
    return { top, botC, botS, x0, x1, wd };
  }
  // how far the box clears the band (design px; >= 0 fits)
  function clear(b, F) {
    const hd = H.size.h / (H.size.u || 1);
    return Math.min(b.top - F.top - GAP, PLAY.cards.y - GAP - b.botC, hd - PLAY.bottom - b.botS, b.x0 - PLAY.side, b.wd - PLAY.side - b.x1);
  }
  // lens shift that centres the rim's box in the band (the far heads to the top band, the near rim to the cards)
  function centreShift(d, px, pz, F) {
    place(d, px, pz); const b = rimBox(0, F); const hd = H.size.h / (H.size.u || 1);
    const want = (F.top + Math.min(PLAY.cards.y, hd)) / 2; const have = (b.top + Math.max(b.botC, b.botS - (hd - PLAY.cards.y))) / 2;
    return (have - want) * 2 / hd;
  }

  // the framing for F: the closest distance (never closer than MCD's scale) where the rim fits the band, the lens shift
  // that centres it, and how far the pan may go each way before the rim leaves the frame or the band
  function solve(F) {
    const { w, h } = H.size; const u = H.size.u || 1;
    fit.fov = FOV_OVER; fit.aspect = w / h; fit.updateProjectionMatrix();
    // MCD's scale: the distance where a hero at the centre stands MCD_FILL of the frame height
    let lo = 4; let hi = 400;
    for (let i = 0; i < 40; i++) { const d = (lo + hi) / 2; place(d, 0, 0); toPx(0, 0, 0, 0, q); const y0 = q[1]; toPx(0, HERO_H, 0, 0, q); if ((y0 - q[1]) / (h / u) > MCD_FILL) lo = d; else hi = d; }
    const S = { dist: hi, shift: 0, lo: { x: 0, z: 0 }, hi: { x: 0, z: 0 }, clear: 0, mcd: hi, tight: hi };
    S.tight = hi * MCD_FILL / TIGHT_FILL; // the lens is narrow: on-screen size goes as 1/distance
    lo = S.mcd; hi = 400;
    const fits = (d) => { const sh = centreShift(d, 0, 0, F); place(d, 0, 0); return clear(rimBox(sh, F), F) >= 0; };
    if (!fits(lo)) { for (let i = 0; i < 40; i++) { const d = (lo + hi) / 2; if (fits(d)) hi = d; else lo = d; } S.dist = hi; } else S.dist = lo;
    S.shift = centreShift(S.dist, 0, 0, F); place(S.dist, 0, 0); S.clear = clear(rimBox(S.shift, F), F);
    for (const ax of ['x', 'z']) for (const s of [-1, 1]) {
      let a = 0; let b = 30;
      for (let i = 0; i < 24; i++) { const m = (a + b) / 2; place(S.dist, ax === 'x' ? m * s : 0, ax === 'z' ? m * s : 0); if (clear(rimBox(S.shift, F), F) >= Math.min(0, S.clear)) a = m; else b = m; }
      (s < 0 ? S.lo : S.hi)[ax] = a * s;
    }
    return S;
  }
  // the wave pads' framing (fixed per frame size) and the boss framing (per boss: its height, flight and width)
  let base = null; let bossF = null; let bossKey = ''; let bossK = 0;
  function readBand() {
    const b = C.bandOf ? C.bandOf() : null; if (!b) return;
    const t = b.top + TOP_MARGIN; const tb = b.topBoss + TOP_MARGIN; const c = b.cards;
    if (t === PLAY.top && tb === PLAY.topBoss && c.x0 === PLAY.cards.x0 && c.x1 === PLAY.cards.x1 && c.y === PLAY.cards.y) return;
    PLAY.top = t; PLAY.topBoss = tb; PLAY.cards = { x0: c.x0, x1: c.x1, y: c.y }; key = ''; C.band = { top: t, topBoss: tb, cards: PLAY.cards };
  }
  function framings(B) {
    readBand();
    const k = H.size.w + 'x' + H.size.h;
    if (k !== key) { key = k; base = solve({ head: HEAD_FAR, top: PLAY.top, side: 0, near: FIT_K, sink: SINK }); bossKey = ''; C.fitClear = base.clear; C.mcdDist = base.mcd; C.tightDist = base.tight; }
    const bu = B && B.boss ? B.byUid.get(B.boss) : null;
    if (bu && bu.alive && H.heightOf) {
      const bk = k + ':' + bu.uid;
      if (bk !== bossKey) {
        const fly = bu.fly ? (FLY_Y[bu.kind] || 3.2) : 0; const wide = H.widthOf ? H.widthOf(bu.uid) : 0;
        if (wide > 0) { bossKey = bk; bossF = solve({ head: Math.max(HEAD_FAR, fly + H.heightOf(bu.uid)), top: PLAY.topBoss, side: Math.min(2, Math.max(0, wide / 2 - 0.5)), near: HERO_K, sink: 0 }); C.bossFit = { head: +(fly + H.heightOf(bu.uid)).toFixed(2), wide: +wide.toFixed(2), dist: +bossF.dist.toFixed(1) }; }
      }
      return 1;
    }
    return 0;
  }

  function unitOf(B, uid) { return B && B.byUid && B.byUid.get(uid); }

  // the team's centre in the scene's frame (during a run, where the heroes are drawn on the bridge)
  function teamCentre(B, out) {
    let n = 0; let x = 0; let y = 0; let z = 0;
    if (B && B.heroes) for (const u of B.heroes) {
      if (!u.alive) continue; const r = H.world && H.world.heroAt ? H.world.heroAt(u.slot, u.x, u.z) : null;
      x += r ? r.x : u.x; y += r ? r.y : 0; z += r ? r.z : u.z; n++;
    }
    out.x = n ? x / n : 0; out.y = n ? y / n : 0; out.z = n ? z / n : 0; return n;
  }
  const tc = { x: 0, y: 0, z: 0 };
  // during a run: slide the picture so the team's feet (up or down a stair) sit at RUN_Y of the height, where MCD keeps
  // its hero while the world slides under it; more of the next area shows above
  function runLift() {
    const hd = H.size.h / (H.size.u || 1);
    v.set(tc.x, tc.y, tc.z).project(camera); return (1 - v.y) / 2 * hd - RUN_Y * hd;
  }

  // the cluster's box in NDC through the drawn camera, for the juice clamps
  function heroRim() {
    let x0 = 9; let x1 = -9; let y0 = 9; let y1 = -9;
    for (let i = 0; i < np; i++) {
      const o = i * 6;
      for (let c = 0; c < 4; c++) {
        v.set(pts[o] + (c & 1 ? pts[o + 4] : -pts[o + 4]), c & 2 ? pts[o + 2] : pts[o + 1], pts[o + 3]).project(camera);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
    rim = np ? { x0, x1, y0, y1 } : { x0: -0.95, x1: 0.95, y0: -0.5, y1: 0.7 };
  }

  // push-in about the casting hero and screen shake, applied to the projection after the lens shift: ndc' = s * ndc + t.
  // The push and pull are clamped so the heroes' area stays inside the frame; a chase view only gets the shake.
  function juiceView(chase) {
    const j = H.juice; if (!j) return;
    const el = camera.projectionMatrix.elements; const { w, h } = H.size;
    let s = 1; let tx = 0; let ty = 0;
    const clampT = (pad) => { tx = Math.max(-(1 - pad) - s * rim.x0, Math.min((1 - pad) - s * rim.x1, tx)); ty = Math.max(-(1 - pad) - s * rim.y0, Math.min((1 - pad) - s * rim.y1, ty)); };
    if (!chase && (j.push > 0 || j.shake.px > 0)) heroRim();
    if (!chase && j.push > 0) {
      s = Math.min(1 + PUSH * j.push, (1 - RIM_PAD) / Math.max(Math.abs(rim.x0), Math.abs(rim.x1), Math.abs(rim.y0), Math.abs(rim.y1)));
      let hx = 0; let hy = 0;
      if (j.pull.k > 0) { v.set(j.pull.x, 0, j.pull.z).project(camera); hx = v.x; hy = v.y; }
      tx = (1 - s) * hx; ty = (1 - s) * hy; clampT(RIM_PAD);
    }
    if (j.shake.px > 0) { tx += j.shake.x * 2 / w; ty += j.shake.y * 2 / h; if (!chase) clampT(SHAKE_PAD); }
    if (s === 1 && tx === 0 && ty === 0) return;
    el[0] *= s; el[5] *= s; el[8] = s * el[8] - tx; el[9] = s * el[9] - ty;
  }

  // ---- the cluster: what the overview must hold, flat [x, foot y, head y, z, half width, must] per entry (must: a hero, an ally or the boss), in the pad's frame ----
  const pts = []; let np = 0; const cc = { x: 0, z: 0 }; const dbg = C.dbg = {};
  function addPt(x, y0, y1, z, hw, must) { const o = np * 6; pts[o] = x; pts[o + 1] = y0; pts[o + 2] = y1; pts[o + 3] = z; pts[o + 4] = hw; pts[o + 5] = must ? 1 : 0; np++; }
  // every living unit on this pad (a monster of a room ahead waits there, off the fight) and the gate of each pack due
  // within SPAWN_LOOK; during a run only the team, where it is drawn on the bridge
  function gather(B, run) {
    np = 0; if (!B || !B.units) return 0;
    const wr = B.plan && B.plan.waveRoom; const sec = H.world ? H.world.sec : 0;
    let x0 = 1e9; let x1 = -1e9; let z0 = 1e9; let z1 = -1e9;
    const take = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    for (const u of B.units) {
      if (!u.alive || (run && !u.hero)) continue;
      if (u.team === 1 && u.room !== undefined && wr && wr[u.room] !== sec) continue;
      const h = H.heightOf ? H.heightOf(u.uid) : 2.2;
      // a hero is framed where it is drawn: on the bridge during a run, or held where it stood until a regroup plays
      const r = u.hero && H.world && H.world.heroAt ? H.world.heroAt(u.slot, u.x, u.z) : null;
      if (r || run) { const x = r ? r.x : u.x; const y = r ? r.y : 0; const z = r ? r.z : u.z; addPt(x, y, y + h, z, CL_SIDE, 1); take(x, z); continue; }
      const y0 = u.fly ? (FLY_Y[u.kind] || 3.2) : 0;
      const yb = !u.fly && u.z > 0 && Math.hypot(u.x / ARENA.x, u.z / ARENA.z) > 0.95 ? y0 - SINK : y0;
      const hw = u.boss && C.bossFit ? Math.max(CL_SIDE, C.bossFit.wide / 2) : CL_SIDE;
      addPt(u.x, yb, y0 + h, u.z, hw, u.team === 0 || u.boss); take(u.x, u.z);
    }
    if (!run && B.queue && B.queue.length && B.plan && B.plan.rooms) {
      const room = B.plan.rooms[Math.max(0, Math.min(B.plan.rooms.length - 1, wr ? wr[B.wave - 1] : B.wave - 1))];
      const gates = room && room.gates;
      if (gates) for (const g of B.queue) {
        if (g.at - B.waveT > SPAWN_LOOK) break;
        // a pack queued with an angle and no gate (the survive rule's cycled packs) takes the gate battle.js gateOf picks
        const gi = g.gate !== undefined ? g.gate : g.ang !== undefined && gates.length ? Math.floor((((g.ang % 6.283) + 6.283) % 6.283) / 6.283 * gates.length) % gates.length : -1;
        const q = gates[gi]; if (!q) continue; addPt(q.x, 0, HEAD_FAR, q.z, 1.2, 0); take(q.x, q.z);
      }
    }
    cc.x = np ? (x0 + x1) / 2 : 0; cc.z = np ? (z0 + z1) / 2 : 0;
    return np;
  }
  // the cluster at distance d with the pan at (px, pz): how much room it leaves in the band (design px, >= 0 fits) and
  // the lens shift (design px, content moved up) that centres it between the top band and the cards or the frame foot.
  // When it cannot fit, the shift still keeps the team and the boss in the band and lets a monster at the edge go first.
  const fitOut = { room: 0, o: 0 };
  function clusterFit(d, px, pz, top) {
    place(d, px, pz); const hd = H.size.h / (H.size.u || 1); const wd = H.size.w / (H.size.u || 1);
    let lo = -1e9; let hi = 1e9; let x0 = 1e9; let x1 = -1e9; let mlo = -1e9; let mhi = 1e9;
    for (let i = 0; i < np; i++) {
      const o = i * 6; const hw = pts[o + 4];
      toPx(pts[o] - hw, pts[o + 2], pts[o + 3], 0, q); const ty = q[1]; const ax = q[0];
      toPx(pts[o] + hw, pts[o + 1], pts[o + 3], 0, q); const by = q[1]; const bx = q[0];
      const inCards = bx > PLAY.cards.x0 && ax < PLAY.cards.x1;
      const h1 = ty - top - CL_GAP; const l1 = by - (inCards ? PLAY.cards.y : hd - PLAY.bottom) + CL_GAP;
      hi = Math.min(hi, h1); lo = Math.max(lo, l1); if (pts[o + 5]) { mhi = Math.min(mhi, h1); mlo = Math.max(mlo, l1); }
      x0 = Math.min(x0, ax); x1 = Math.max(x1, bx);
    }
    fitOut.room = Math.min(hi - lo, x0 - PLAY.side - CL_GAP, wd - PLAY.side - CL_GAP - x1); fitOut.o = (lo + hi) / 2;
    if (hi < lo && mlo <= mhi) fitOut.o = Math.max(mlo, Math.min(mhi, fitOut.o));
    return fitOut;
  }
  // the closest distance in [near, far] that holds the cluster at the pan (px, pz); far when nothing closer does
  function clusterWant(px, pz, near, far, top) {
    if (clusterFit(near, px, pz, top).room >= 0) return near;
    if (clusterFit(far, px, pz, top).room < 0) return far;
    let a = near; let b = far;
    for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (clusterFit(m, px, pz, top).room >= 0) b = m; else a = m; }
    return b;
  }

  function update(B, dt) {
    const bossWant = framings(B) && bossF ? 1 : 0; bossK += (bossWant - bossK) * Math.min(1, dt * BOSS_BLEND); if (Math.abs(bossWant - bossK) < 0.002) bossK = bossWant;
    const F = bossK > 0 && bossF ? bossF : base; const mix = (a, b) => a + (b - a) * (F === base ? 0 : bossK);
    const far = mix(base.dist, F.dist); const near = Math.min(far, base.tight);
    H.B = B;
    blend += (want - blend) * Math.min(1, dt * 3.5); if (Math.abs(want - blend) < 0.001) blend = want;
    const run = !!(H.world && H.world.busy);
    const bu = B && B.boss ? B.byUid.get(B.boss) : null;
    if (gather(B, run)) {
      // the pan may roam further from the pad's centre the closer the camera stands
      const t = far > near ? Math.max(0, Math.min(1, (far - dist) / (far - near))) : 0;
      const loX = mix(base.lo.x, F.lo.x) * (1 - t) - ARENA.x * 0.75 * t; const hiX = mix(base.hi.x, F.hi.x) * (1 - t) + ARENA.x * 0.75 * t;
      const loZ = mix(base.lo.z, F.lo.z) * (1 - t) - ARENA.z * 0.75 * t; const hiZ = mix(base.hi.z, F.hi.z) * (1 - t) + ARENA.z * 0.75 * t;
      const gx = Math.max(loX, Math.min(hiX, cc.x)); const gz = Math.max(loZ, Math.min(hiZ, cc.z));
      const f = pan.init ? Math.min(1, dt * FOLLOW) : 1; pan.x += (gx - pan.x) * f; pan.z += (gz - pan.z) * f;
      pan.x = Math.max(loX, Math.min(hiX, pan.x)); pan.z = Math.max(loZ, Math.min(hiZ, pan.z));
      // the distance and lens shift that hold the cluster at the pan as it is now (a lagging pan never drops a unit)
      const top = bu && bu.alive ? PLAY.topBoss : PLAY.top;
      const dW = run ? far : clusterWant(pan.x, pan.z, near, far, top);
      if (!pan.init) dist = dW; else {
        let step = (dW - dist) * Math.min(1, dt * (dW > dist ? ZOOM_OUT : ZOOM_IN));
        if (dW < dist) step = Math.max(step, -ZOOM_RATE * far * dt);
        dist += step;
      }
      // the lens shift that centres the cluster at the distance the camera stands at now
      const sW = run ? mix(base.shift, F.shift) : clusterFit(dist, pan.x, pan.z, top).o * 2 / (H.size.h / (H.size.u || 1));
      dbg.dW = dW; dbg.near = near; dbg.far = far; dbg.room = fitOut.room; dbg.o = fitOut.o; dbg.np = np; dbg.run = run;
      shift += (sW - shift) * (pan.init ? Math.min(1, dt * 6) : 1);
      pan.init = true;
      if (run) teamCentre(B, tc);
    } else { pan.init = false; dist = far; shift = mix(base.shift, F.shift); }
    pan.lo.x = mix(base.lo.x, F.lo.x); pan.hi.x = mix(base.hi.x, F.hi.x); pan.lo.z = mix(base.lo.z, F.lo.z); pan.hi.z = mix(base.hi.z, F.hi.z);
    const aspect = H.size.w / H.size.h;
    pos.set(pan.x, Math.sin(pitch) * dist, pan.z + Math.cos(pitch) * dist);
    look.set(pan.x, 0, pan.z); focus.set(pan.x, 0, pan.z);
    let lens = shift; let fv = FOV_OVER; let fogBase = dist;
    const u = target ? unitOf(B, target) : null;
    if (blend > 0 && u) {
      // size the shot by the unit: the distance gives it CHASE_FILL of the frame height, the camera sits behind it on the line
      // from its target (or along its facing) and a little above, and the look point leans toward the target so it stays in view
      const h = Math.max(1.2, H.heightOf ? H.heightOf(target) : 2.7);
      const uy = u.fly ? (FLY_Y[u.kind] || 3.2) : 0;
      const tg = B.byUid.get(u.target); let dx = Math.cos(u.face); let dz = Math.sin(u.face); let dT = 0;
      if (tg && tg.alive) { const ax = tg.x - u.x; const az = tg.z - u.z; dT = Math.hypot(ax, az); if (dT > 0.8) { dx = ax / dT; dz = az / dT; } else dT = 0; }
      // the distance gives the unit CHASE_FILL of the frame height and keeps its widest extent (wings, a saucer) inside the frame width
      const wide = H.widthOf ? H.widthOf(target) : 0;
      const perFill = (f) => h / (2 * Math.tan(FOV_CHASE * Math.PI / 360) * f); // distance that gives height fraction f
      const D = Math.max(5, Math.min(Math.max(perFill(CHASE_FILL), wide * 2.2), perFill(CHASE_FILL_MIN)));
      const cx = u.x - dx * D * Math.cos(CHASE_PITCH); const cz = u.z - dz * D * Math.cos(CHASE_PITCH); const cy = uy + h * 0.5 + D * Math.sin(CHASE_PITCH);
      const ahead = Math.min(dT * 0.5, h * 2.5);
      const lx = u.x + dx * ahead; const lz = u.z + dz * ahead;
      const t = BZ.smooth(blend);
      pos.x += (cx - pos.x) * t; pos.y += (cy - pos.y) * t; pos.z += (cz - pos.z) * t;
      look.x += (lx - look.x) * t; look.y += (uy + h * 0.45 - look.y) * t; look.z += (lz - look.z) * t;
      fv = FOV_OVER + (FOV_CHASE - FOV_OVER) * t; lens = shift * (1 - t);
      fogBase = dist * (1 - t) + 30 * t;
    } else if (blend === 0 && target && !u) { target = 0; want = 0; }
    fov += (fv - fov) * Math.min(1, dt * 8);
    camera.fov = fov; camera.aspect = aspect; camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -lens;
    // the vertical follow (the team's height during a run between pads), off in the chase view
    const lw = blend > 0 || !run ? 0 : runLift(); pan.lift += (lw - pan.lift) * Math.min(1, dt * LIFT);
    if (pan.lift !== 0) { lens += pan.lift * 2 / (H.size.h / (H.size.u || 1)); camera.projectionMatrix.elements[9] = -lens; }
    juiceView(blend > 0 && u);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // haze starts just past the fight: the far rim softens a little, what lies far below fades into the abyss colour
    if (H.scene.fog) { H.scene.fog.near = fogBase + 3; H.scene.fog.far = fogBase + 46; }
    G.player.pos.set(focus.x, 0, focus.z); G.player.yaw = Math.atan2(pos.x - look.x, pos.z - look.z);
  }
  return C;
}
