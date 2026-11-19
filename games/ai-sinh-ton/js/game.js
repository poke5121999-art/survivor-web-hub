// The glue between the loop (main.js), the account (meta.js), the 3D UI kit and the screens.
//
// Screen contract: a module in js/ui/ exports create<Name>(game) and returns { name, show(args), hide(), update(dt) }.
// It builds its nodes once inside game.ui.screen(name). Screens never touch each other: they call game.goto(),
// the commands below, and listen on game.events.
import { createMeta } from './meta.js';
import { castUlt, pickCard } from './sim/battle.js';
import { stageDef } from './data/stages.js';

const SETTINGS_KEY = 'aisinhton.settings.v1';
const SETTINGS_DEF = { quality: '', sound: true, vibrate: true, reduceFlash: false, autoPick: false };
const RESULT_DELAY = 1.4;
export const LAST_STAGE = 10;

// [module path, factory name]; a module that is not there yet is skipped so the game still boots
const SCREENS = [
  ['./ui/home.js', 'createHome'], ['./ui/heroes.js', 'createHeroes'], ['./ui/gacha.js', 'createGacha'], ['./ui/soon.js', 'createSoon'],
  ['./ui/hud.js', 'createHud'], ['./ui/pick.js', 'createPick'], ['./ui/result.js', 'createResult'],
];
const V = new URL(import.meta.url).search;

function loadSettings() {
  try { return { ...SETTINGS_DEF, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return { ...SETTINGS_DEF }; }
}

function makeEvents() {
  const map = new Map();
  return {
    on(name, fn) { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); },
    emit(name, data) { for (const fn of map.get(name) || []) { try { fn(data); } catch (e) { console.error(`[events] handler for "${name}" threw`, e); } } },
  };
}

export async function attachGame(game, { params }) {
  const host = game.host;
  const frame = document.getElementById('frame');
  game.events = makeEvents();
  game.settings = loadSettings();
  game.meta = createMeta(); game.meta.load();
  game.screens = {}; game.screen = ''; game.lastReward = null; game.stageN = 1;

  let ui = null;
  try { const kit = await import('./ui/kit.js' + V); ui = kit.createUI({ THREE: host.THREE, renderer: host.renderer, frame }); } catch (e) { console.error('ui kit not loaded: ' + (e && e.message)); }
  game.ui = ui; window.__ui = ui;

  game.setSetting = (key, value) => {
    game.settings[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(game.settings)); } catch (e) {}
    if (key === 'sound' && game.audio.setVolume) game.audio.setVolume(value ? 1 : 0);
    game.events.emit('setting', { key, value });
  };
  if (game.audio.setVolume) game.audio.setVolume(game.settings.sound ? 1 : 0);
  game.vibrate = (ms) => { if (game.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };

  // world point -> design units of the UI (360 wide, y down)
  const P = new host.THREE.Vector3();
  game.project = (x, z, y = 0) => {
    P.set(x, y, z).project(host.camera);
    const u = frame.clientWidth / 360;
    return { x: ((P.x + 1) / 2) * 360, y: (((1 - P.y) / 2) * frame.clientHeight) / u, behind: P.z > 1 };
  };

  game.goto = (name, args) => {
    const next = game.screens[name];
    if (!next) { console.error('screen not found: ' + name); return; }
    const prev = game.screens[game.screen];
    if (prev && prev !== next && !(args && args.over)) prev.hide();
    game.screen = name; next.show(args || {});
    game.events.emit('screen', { name });
  };

  // ---- battle commands ----
  let endT = -1;
  game.startBattle = (n, opts = {}) => {
    game.stageN = n; game.lastReward = null; endT = -1;
    game.setPaused(false);
    const B = game.start(n, { seed: opts.seed || ((Date.now() % 1e9) | 1), teamSpec: opts.teamSpec || game.meta.teamSpec(), auto: opts.auto || { ult: false, pick: false }, wave: opts.wave });
    game.events.emit('battle:start', { stage: n });
    if (game.screens.hud) game.goto('hud', { stage: n });
    return B;
  };
  game.castUlt = (slot) => !!game.B && !game.paused && castUlt(game.B, slot);
  game.pick = (slot, k) => !!game.B && pickCard(game.B, slot, k);
  game.autoPick = () => {
    const B = game.B; if (!B || B.phase !== 'pick') return;
    for (let i = 0; i < B.heroes.length; i++) if (B.picked[i] < 0) pickCard(B, i, 0);
  };
  // slot 0..3 picks a hero, a uid above 3 picks any unit, anything negative goes back to the overview
  game.spectate = (who) => {
    const B = game.B; if (!B) return 0;
    let uid = 0;
    if (who >= 0 && who < B.heroes.length) uid = B.heroes[who].uid; else if (who >= B.heroes.length && B.byUid.get(who)) uid = who;
    if (uid && game.watching === uid) uid = 0;
    game.watching = uid; game.cam.spectate(uid);
    game.events.emit('spectate', { uid });
    return uid;
  };
  game.setSpeed = (n) => { game.speed = n; game.events.emit('speed', { speed: n }); };
  game.setPaused = (b) => { game.paused = !!b; game.events.emit('paused', { paused: game.paused }); };
  game.leaveBattle = () => { game.stop(); game.watching = 0; game.setPaused(false); game.setSpeed(1); game.events.emit('battle:end', {}); game.goto('home', {}); };
  game.retry = () => game.startBattle(game.stageN);
  game.nextStage = () => game.startBattle(Math.min(LAST_STAGE, game.stageN + 1));
  game.openSettings = () => { if (game.screens.result) game.goto('result', { mode: 'settings', over: true }); };
  game.stageInfo = (n) => stageDef(n);

  game.on((e) => {
    game.events.emit('sim:' + e.e, e);
    if (e.e === 'won' || e.e === 'lost') endT = RESULT_DELAY;
  });

  function finish() {
    const B = game.B; if (!B) return;
    const won = B.phase === 'won';
    const r = game.meta.finishStage({ stage: game.stageN, won, wavesCleared: won ? 5 : Math.max(0, B.wave - 1), seconds: B.t });
    game.lastReward = { ...r, won, seconds: B.t, kills: B.kills, stage: game.stageN, heroes: B.heroes.map((u) => ({ id: u.kind, dealt: u.dealt, taken: u.taken, healed: u.healed, kills: u.kills || 0 })) };
    game.vibrate(won ? [30, 60, 30] : 60);
    game.events.emit('battle:result', game.lastReward);
    if (game.screens.result) game.goto('result', { mode: 'result', over: true });
  }

  if (ui) {
    for (const [path, factory] of SCREENS) {
      try {
        const mod = await import(path + V);
        const made = mod[factory](game);
        for (const s of Array.isArray(made) ? made : [made]) game.screens[s.name] = s;
      } catch (e) {
        if (!/Failed to fetch|not found|404|Cannot find module/i.test(String(e && e.message))) console.error(`screen ${path} failed: ` + (e && e.stack ? e.stack : e));
      }
    }
    new ResizeObserver(() => ui.resize()).observe(frame);
    ui.resize();
  }

  const glue = {
    update(dt, real) {
      if (endT > 0) { endT -= real; if (endT <= 0) finish(); }
      if (!ui) return;
      for (const name in game.screens) { const s = game.screens[name]; if (s.update) s.update(real); }
      ui.update(real);
    },
    overlay: ui ? () => ui.render() : undefined,
    boot() {
      if (game.B) { if (game.screens.hud) game.goto('hud', { stage: game.stageN }); } else if (game.screens.home) game.goto('home', {});
    },
  };
  return glue;
}
