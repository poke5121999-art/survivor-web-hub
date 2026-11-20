// Game feel: hit-stop, time scale, camera shake and push-in, and the short ultimate scene. It only delays when sim ticks are
// taken and when the view advances (one multiplier, `scale`); the sim itself never sees it, so runs stay deterministic.
// The camera reads `view` (shake in CSS px, push 0..1, the pull focus) and applies it inside its own rim clamp.
const HEAVY_FX = new Set(['boss_slam', 'tailspin', 'bloodnova', 'orbring', 'emp', 'wail']); // enemy bursts that land hard
const HEAVY_DASH = new Set(['dive', 'charge_boss', 'charge', 'blooddash']);                   // only when a boss does them
const STOP = { ult: 55, heavy: 50, streak: 45, bossDeath: 120 };
const STOP_GAP = 0.35;     // s between two hit-stops
const SHAKE = { ult: 3.6, heavy: 2.4, streak: 1.4, bossDeath: 4 };
const SHAKE_LIFE = 0.26;
const SCENE = { slow: 0.26, hold: 0.3, holdAgain: 0.12, rampIn: 0.05, rampOut: 0.25, again: 1.2 };
const STREAK = { n: 8, within: 0.5 };
// Gió's ultimate keeps the push for the whole run of cuts (until the sim clock passes `span`), slows gently, and stops 33 ms on each
// cut and 45 ms on the last: ten cuts plus the cast's own stop stay under 0.45 s of freeze
const BLADES = { span: 1.65, slow: 0.75, push: 3, cut: 30, last: 40, realMax: 3 };

export function createJuice(game) {
  const view = { shake: { x: 0, y: 0, px: 0 }, push: 0, pull: { x: 0, z: 0, k: 0 } };
  const J = {
    view, scale: 1, enabled: true, silent: false, stopped: false, partial: false,
    stops: [],            // every hit-stop taken: { at, ms } (real seconds on the juice clock)
    scenes: 0, lastScene: null, kills: [], bossDown: new Set(),
  };
  let clock = 0; let deadline = 0; let lastStop = -9; let scene = null; let shakeAmp = 0; let shakeT = 9; let phase = 0; let lastSceneEnd = -9;

  const shakeOn = () => game.settings && game.settings.shake !== false && !game.settings.reduceFlash;
  const fast = () => game.speed >= 2;

  function hit(ms, o = {}) {
    if (!J.enabled || J.silent) return;
    if (!o.force && clock - lastStop < STOP_GAP) return;
    if (fast()) ms = Math.min(ms, 40);
    const now = performance.now(); deadline = Math.max(deadline, now + ms); lastStop = clock; J.stops.push({ at: clock, ms, t0: now, real: undefined, force: !!o.force });
    if (J.stops.length > 40) J.stops.shift();
  }
  function kick(px) {
    if (!J.enabled || J.silent || !shakeOn()) return;
    if (px >= shakeAmp * Math.pow(Math.max(0, 1 - shakeT / SHAKE_LIFE), 2)) { shakeAmp = px; shakeT = 0; phase = Math.random() * 6.283; }
  }

  function startScene(uid, o) {
    if (!J.enabled || J.silent) return;
    const again = clock - lastSceneEnd < SCENE.again || (scene && scene.t < scene.total);
    const hold = again ? SCENE.holdAgain : SCENE.hold;
    const B = game.B;
    scene = { t: 0, hold, total: SCENE.rampIn + hold + SCENE.rampOut, uid, slow: !fast(), slowTo: o ? o.slow : SCENE.slow, pushK: o ? o.push : 1, until: o && B ? B.t + o.span : undefined, real: 0 };
    J.scenes++; J.lastScene = { at: clock, hold, again, slow: scene.slow };
  }
  function skip() { if (scene) { scene.until = undefined; if (scene.t < SCENE.rampIn + scene.hold) scene.t = SCENE.rampIn + scene.hold; } }
  // 0 -> 1 over rampIn, 1 over hold, 1 -> 0 over rampOut
  function env() {
    if (!scene) return 0;
    const t = scene.t;
    if (t < SCENE.rampIn) return t / SCENE.rampIn;
    if (t < SCENE.rampIn + scene.hold) return 1;
    return Math.max(0, 1 - (t - SCENE.rampIn - scene.hold) / SCENE.rampOut);
  }

  J.onEvent = (e) => {
    if (J.silent || !J.enabled) return;
    const B = game.B;
    if (e.e === 'ult') { if (e.key !== 'blades') hit(STOP.ult); kick(SHAKE.ult); startScene(e.uid, e.key === 'blades' ? BLADES : undefined); return; }
    if (e.e === 'fx' && e.team === 1 && HEAVY_FX.has(e.key) && (e.part === 'burst' || e.part === 'cone')) { hit(STOP.heavy); kick(SHAKE.heavy); return; }
    if (e.e === 'dash' && HEAVY_DASH.has(e.key)) { const u = B && B.byUid.get(e.uid); if (u && u.boss) { hit(STOP.heavy); kick(SHAKE.heavy); } return; }
    if (e.e === 'die' && !e.expire) {
      const u = B && B.byUid.get(e.uid); if (!u || u.hero || u.summon) return;
      if (e.boss) { if (!J.bossDown.has(e.uid)) { J.bossDown.add(e.uid); hit(STOP.bossDeath, { force: true }); kick(SHAKE.bossDeath); } return; }
      const k = J.kills; k.push(e.t); while (k.length && e.t - k[0] > STREAK.within) k.shift();
      if (k.length >= STREAK.n) { k.length = 0; hit(STOP.streak); kick(SHAKE.streak); }
    }
  };
  // one cut of Gió's ultimate: a short stop on the wall clock, halved at x2, never during __sim (hit() ignores silent runs)
  J.slash = (i, last) => hit((last ? BLADES.last : BLADES.cut) * (fast() ? 0.5 : 1), { force: true });
  J.hit = hit; J.kick = kick; J.skip = skip;
  J.reset = () => { deadline = 0; scene = null; shakeAmp = 0; shakeT = 9; J.scale = 1; J.stopped = false; J.kills.length = 0; J.bossDown.clear(); view.shake.x = view.shake.y = view.shake.px = 0; view.push = 0; view.pull.k = 0; };
  if (typeof window !== 'undefined') window.addEventListener('pointerdown', skip, true);

  // real seconds in; sets scale and the camera view for this frame
  J.update = (dt) => {
    clock += dt;
    // the stop ends on the wall clock: a long frame cannot eat it, and the frame that crosses the deadline only runs its part past it
    let live = 1;
    if (deadline > 0) {
      const now = performance.now();
      if (now < deadline) J.stopped = true;
      else { J.stopped = false; live = Math.min(1, (now - deadline) / Math.max(1e-6, dt * 1000)); deadline = 0; for (const st of J.stops) if (st.real === undefined) st.real = now - st.t0; }
    } else J.stopped = false;
    let scale = 1;
    if (scene) {
      if (!J.stopped) scene.t += dt * live;
      if (scene.until !== undefined) { scene.real += dt; const B0 = game.B; if (B0 && B0.t < scene.until && scene.real < BLADES.realMax && scene.t > SCENE.rampIn) scene.t = SCENE.rampIn; }
      if (scene.t >= scene.total) { scene = null; lastSceneEnd = clock; }
    }
    const k = env();
    if (scene && scene.slow) scale = 1 - (1 - scene.slowTo) * k;
    view.push = k * (scene ? scene.pushK : 1);
    const B = game.B; const hero = scene && scene.slow && B && B.byUid.get(scene.uid);
    if (hero) { view.pull.x = hero.x; view.pull.z = hero.z; view.pull.k = k; } else view.pull.k = 0;
    scale *= live; J.partial = live < 1;
    if (J.stopped) scale = 0;
    J.scale = scale;
    // shake: one offset that turns around and decays, so its peak is the amplitude
    shakeT += dt;
    if (shakeT < SHAKE_LIFE && shakeOn() && J.enabled) {
      const f = Math.pow(1 - shakeT / SHAKE_LIFE, 2) * shakeAmp; const a = phase + shakeT * 80;
      view.shake.x = Math.cos(a) * f; view.shake.y = Math.sin(a * 1.3) * f; view.shake.px = f;
    } else { view.shake.x = view.shake.y = view.shake.px = 0; }
    return scale;
  };
  game.on((e) => J.onEvent(e));
  return J;
}
