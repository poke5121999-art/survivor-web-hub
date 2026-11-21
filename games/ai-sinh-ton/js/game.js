// The glue between the loop (main.js), the account (meta.js), the 3D UI kit and the screens.
//
// Screen contract: a module in js/ui/ exports create<Name>(game) and returns { name, show(args), hide(), update(dt) }.
// It builds its nodes once inside game.ui.screen(name). Screens never touch each other: they call game.goto(),
// the commands below, and listen on game.events.
import { createMeta } from './meta.js?v=20261120f';
import { castUlt, pickCard, battleReport } from './sim/battle.js?v=20261120f';
import { stageDef } from './data/stages.js?v=20261120f';
import { tutorialStage } from './data/unlocks.js?v=20261120f';

const SETTINGS_KEY = 'aisinhton.settings.v1';
const SAVE_KEY = 'aisinhton.save.v1';
const OWN_PREFIX = 'aisinhton.';
// query parameters that shape a run or a test account: the reload after a wipe starts clean without them
const RELOAD_DROP = ['preset', 'autostart', 'stage', 'wave', 'seed', 'team', 'autoult', 'autopick', 'spectate'];
const SETTINGS_DEF = { quality: '', sound: true, vibrate: true, reduceFlash: false, autoPick: false, autoUlt: false };
const RESULT_DELAY = 1.4;

// [module path, factory name]; a module that is not there yet is skipped so the game still boots
const SCREENS = [
  ['./ui/home.js', 'createHome'], ['./ui/heroes.js', 'createHeroes'], ['./ui/gacha.js', 'createGacha'], ['./ui/equip.js', 'createEquip'], ['./ui/soon.js', 'createSoon'],
  ['./ui/hud.js', 'createHud'], ['./ui/pick.js', 'createPick'], ['./ui/result.js', 'createResult'], ['./ui/guide.js', 'createGuide'], ['./ui/account.js', 'createAccountPanel'],
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
  // the preset only shapes a brand-new account: a save that exists wins
  let hasSave = false; try { hasSave = !!localStorage.getItem('aisinhton.save.v1'); } catch (e) { hasSave = false; }
  game.meta = createMeta({ preset: hasSave ? undefined : params.preset }); game.meta.load();
  if (!hasSave && game.meta.acc.cheatUnlock) game.meta.save();
  game.screens = {}; game.screen = ''; game.lastReward = null; game.stageN = 1;

  let ui = null;
  try { const kit = await import('./ui/kit.js?v=20261120f'); ui = kit.createUI({ THREE: host.THREE, renderer: host.renderer, frame }); } catch (e) { console.error('ui kit not loaded: ' + (e && e.message)); }
  game.ui = ui; window.__ui = ui;

  // Wipes every key this game owns on the device and reloads as a brand-new account. The hub login keys, the shared
  // 'blockadez.lang' and any unrelated key stay. Nothing may be written between the wipe and the reload.
  game.deleteAccount = () => {
    if (game.accountWiped) return [];
    game.accountWiped = true;
    game.meta.save = () => false;
    const removed = [];
    for (const store of [() => localStorage, () => sessionStorage]) {
      try {
        const s = store(), keys = [];
        for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(OWN_PREFIX)) keys.push(k); }
        for (const k of [SETTINGS_KEY, SAVE_KEY]) if (!keys.includes(k)) keys.push(k);
        for (const k of keys) { s.removeItem(k); removed.push(k); }
      } catch (e) { console.error('storage not reachable while deleting the account: ' + (e && e.message)); }
    }
    const url = new URL(location.href);
    for (const p of RELOAD_DROP) url.searchParams.delete(p);
    game.events.emit('account:deleted', { removed });
    location.replace(url.toString());
    return removed;
  };

  game.setSetting = (key, value) => {
    if (game.accountWiped) return;
    game.settings[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(game.settings)); } catch (e) {}
    if (key === 'sound' && game.audio.setVolume) game.audio.setVolume(value ? 1 : 0);
    game.events.emit('setting', { key, value });
  };
  if (game.audio.setVolume) game.audio.setVolume(game.settings.sound ? 1 : 0);
  game.vibrate = (ms) => { if (game.settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } };

  // world point -> design units of the UI (780 wide landscape frame, y down)
  const P = new host.THREE.Vector3();
  game.project = (x, z, y = 0) => {
    P.set(x, y, z).project(host.camera);
    const u = frame.clientWidth / 780;
    return { x: ((P.x + 1) / 2) * 780, y: (((1 - P.y) / 2) * frame.clientHeight) / u, behind: P.z > 1 };
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
  // the scripted first stage tells the guide where it is: each moment fires once
  const tut = { on: false, fired: {}, joinWait: false };
  const fireTutorial = (k) => { if (tut.on && !tut.fired[k]) { tut.fired[k] = true; game.events.emit('tutorial:' + k, {}); } };
  game.startBattle = (n, opts = {}) => {
    game.stageN = n; game.lastReward = null; endT = -1; game.frozen = false;
    game.setPaused(false);
    const acc = game.meta.acc;
    const tutorial = opts.tutorial !== false && !acc.ftue.session && n === 1 && acc.cleared === 0;
    const B = game.start(tutorial ? tutorialStage(stageDef(1)) : n, { seed: opts.seed || ((Date.now() % 1e9) | 1), teamSpec: opts.teamSpec || game.meta.teamSpec(), auto: opts.auto || { ult: false, pick: false }, wave: opts.wave, joinSpec: (id) => ({ id, mul: 1 }) });
    tut.on = tutorial; tut.fired = {}; tut.joinWait = false; game.tutorial = tutorial;
    game.events.emit('battle:start', { stage: n });
    if (game.screens.hud) game.goto('hud', { stage: n });
    if (tutorial) fireTutorial('start');
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
  game.leaveBattle = () => { game.frozen = false; tut.on = false; game.tutorial = false; game.stop(); game.watching = 0; game.setPaused(false); game.setSpeed(1); game.events.emit('battle:end', {}); game.goto('home', {}); };
  game.retry = () => game.startBattle(game.stageN);
  game.nextStage = () => game.startBattle(game.stageN + 1);
  game.openSettings = () => { if (game.screens.result) game.goto('result', { mode: 'settings', over: true }); };
  game.stageInfo = (n) => stageDef(n);

  game.on((e) => {
    game.events.emit('sim:' + e.e, e);
    if (e.e === 'won' || e.e === 'lost') endT = RESULT_DELAY;
    if (tut.on) {
      if (e.e === 'ult_ready') fireTutorial('ult_ready'); else if (e.e === 'pick') fireTutorial('pick');
      else if (e.e === 'join') tut.joinWait = true;
      else if (e.e === 'wave' && tut.joinWait) { tut.joinWait = false; fireTutorial('join'); } else if (e.e === 'boss') fireTutorial('boss');
    }
  });

  function finish() {
    const B = game.B; if (!B) return;
    const won = B.phase === 'won';
    if (!won && B.stage && B.stage.tutorial) {
      game.vibrate(60); game.frozen = false;
      if (ui) ui.toast('Chưa sao! Thử lại nào, mình giúp thêm');
      game.startBattle(1); return;
    }
    const r = game.meta.finishStage({ stage: game.stageN, won, wavesCleared: won ? 5 : Math.max(0, B.wave - 1), seconds: B.t });
    game.lastReward = { ...r, won, seconds: B.t, kills: B.kills, stage: game.stageN, heroes: B.heroes.map((u) => ({ id: u.kind, dealt: u.dealt, taken: u.taken, healed: u.healed, kills: u.kills || 0 })), report: battleReport(B) };
    game.vibrate(won ? [30, 60, 30] : 60);
    game.events.emit('battle:result', game.lastReward);
    if (game.screens.result) game.goto('result', { mode: 'result', over: true });
    if (won) fireTutorial('won');
    tut.on = false;
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

  // a ready ultimate goes off one second after it is ready when the switch is on and unlocked
  function autoUlt() {
    const B = game.B;
    if (!B || B.phase !== 'fight' || game.paused || game.frozen || !game.settings.autoUlt || !game.meta.unlocked('autoult')) return;
    for (const u of B.heroes) if (u.alive && u.ult >= 1 && u.ultReady && B.t - u.ultReadyT >= 1) castUlt(B, u.slot);
  }

  const glue = {
    update(dt, real) {
      if (endT > 0) { endT -= real; if (endT <= 0) finish(); }
      autoUlt();
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
