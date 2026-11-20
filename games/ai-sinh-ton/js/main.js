// Boot and loop. States: 'home' (empty arena, the UI kit draws on top) and 'battle'. The sim runs at 30 Hz from an
// accumulator; the view renders every frame. window.__G and the __sim/__step hooks let the Node tools drive it.
import { createHost } from './view/host.js?v=20261120d';
import { createActors } from './view/actors.js?v=20261120d';
import { createCamera } from './view/camera.js?v=20261120d';
import { createJuice } from './view/juice.js?v=20261120d';
import { createBattle, step, DT } from './sim/battle.js?v=20261120d';
import { stageDef, expectedLevel } from './data/stages.js?v=20261120d';
import { levelMul } from './data/economy.js?v=20261120d';
import { attachGame } from './game.js?v=20261120d';
import { createOrient } from './orient.js?v=20261120d';

const DEFAULT_TEAM = ['thep', 'mua', 'yta', 'gio'];
const MAX_CATCHUP = 8;

const q = new URLSearchParams(location.search);
const params = Object.fromEntries(q);

async function boot() {
  const frame = document.getElementById('frame'); const canvas = document.getElementById('view');
  const host = await createHost({ frame, canvas, params });
  const actors = createActors(host);
  const cam = createCamera(host);
  const listeners = [];

  const game = {
    state: 'home', B: null, host, actors, cam, fx: host.G.fx, audio: host.G.audio, speed: 1, paused: false, listeners, stageDef,
    on(fn) { listeners.push(fn); },
    start(stage, opts = {}) {
      if (stage && stage.custom) { opts = { ...(stage.opts || {}), ...opts }; stage = stage.custom; }
      const n = typeof stage === 'number' ? stage : (stage && stage.n) || 1;
      const L = Math.max(1, expectedLevel(n));
      const ids = opts.team || DEFAULT_TEAM;
      actors.clear();
      game.B = createBattle({
        stage, seed: opts.seed || 1, wave: opts.wave || 1, auto: opts.auto || {}, joinSpec: opts.joinSpec || null,
        team: opts.teamSpec || ids.map((id) => ({ id, mul: opts.mul || levelMul(L), atkFlat: opts.atkFlat ?? 6 * n, hpFlat: opts.hpFlat ?? 40 * n })),
        onEvent: (e) => { actors.onEvent(e); for (const fn of listeners) fn(e); },
      });
      host.B = game.B; host.setStage(game.B.stage, game.B.wave); game.state = 'battle'; game.stageN = n; acc = 0; juice.reset();
      if (opts.spectate !== undefined && game.B.heroes[opts.spectate]) cam.spectate(game.B.heroes[opts.spectate].uid);
      return game.B;
    },
    stop() { actors.clear(); cam.spectate(0); host.B = null; host.world.settle(); game.B = null; game.state = 'home'; juice.reset(); },
  };
  const juice = createJuice(game); host.juice = juice.view; game.juice = juice;
  window.__G = game;
  window.__stats = host.stats;
  const glue = await attachGame(game, { params });
  createOrient(game, frame);

  let acc = 0;
  function present(dt, realDt = dt) {
    const B = game.B;
    if (B) actors.sync(B, dt);
    cam.update(B, dt); host.update(dt); glue.update(dt, realDt); host.render(glue.overlay);
  }
  function advance(dt) {
    const B = game.B;
    if (!B || game.paused || game.frozen || B.phase !== 'fight' || host.world.busy) return;
    acc += dt * game.speed * juice.scale;
    let n = 0;
    while (acc >= DT && n++ < MAX_CATCHUP && B.phase === 'fight') { step(B); acc -= DT; }
    if (acc > DT * MAX_CATCHUP) acc = 0;
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    juice.update(dt);
    advance(dt);
    present(game.paused ? 0.0001 : Math.max(0.0001, dt * game.speed * juice.scale), dt);
    requestAnimationFrame(loop);
  }

  window.__sim = (secs) => {
    const B = game.B; if (!B) return;
    const ticks = Math.round(secs / DT);
    juice.silent = true;
    host.world.settle();
    try { for (let i = 0; i < ticks && B.phase === 'fight'; i++) step(B); } finally { juice.silent = false; }
    host.B = B; host.syncSection(true);
    for (let i = 0; i < 24; i++) { actors.sync(B, 1 / 30); cam.update(B, 1 / 30); }
    host.update(1 / 30); glue.update(1 / 30, 1 / 30); host.render(glue.overlay);
  };
  window.__step = (n = 1) => { for (let i = 0; i < n; i++) present(1 / 60); };

  if (params.autostart || params.stage) {
    const spec = params.team ? params.team.split(',') : DEFAULT_TEAM;
    game.start(+params.stage || 1, {
      seed: +params.seed || 1, wave: +params.wave || 1, team: spec,
      auto: { ult: !!params.autoult, pick: params.autopick ? 'best' : false },
      spectate: params.spectate !== undefined ? +params.spectate : undefined,
    });
  }
  glue.boot();
  present(1 / 60);
  window.__ready = true;
  requestAnimationFrame(loop);
}

boot().catch((err) => { console.error(err && err.stack ? err.stack : String(err)); });
