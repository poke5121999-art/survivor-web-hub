// net.html: online Food Gang dev page. One page = one player.
//   ?act=create|join|quick  &code=XXXXXX  &name=Ann &skin=1..16 &level=1..20
//   &mode=-1..6 &map=-1..2 &diff=0..100      private room config (CustomMatchOptions)
//   &players=N                               private: call setReady once N players are in the room (default 2)
//   &render=game                             the real match screen (MatchScene + views) instead of the 2D debug view
//   &bot=1                                   scripted wandering input instead of the keyboard
//   &delay=ms &jitter=ms &drop=0..1          impair what this page sends;  &net=loop  BroadcastChannel instead of UGS
//   &short=s                                 host: start the timer at s seconds before the end
//   &driver=0                                no hidden-tab driver (shows the freeze the driver prevents)
//   &lead=0                                  client: draw the own agent on the delayed playback like everyone else
// window.fgNet: { info(), script(dirX, down) / script(null), crash(), leave() } for test/food-gang-net.js.
import { GameDb, isDead, InputFrame, InputButtons } from '../sim/index.js';
import { MetaDb, MetaService, MetaRng, newSkinProgress } from '../meta/index.js';
import { teamForSlot } from '../meta/matchmaking.js';
import { Online } from './online.js';
import { DevPlayer, ScriptedInput } from './devplayer.js';

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) ? Number(Q.get(k)) : d);
const BASE = new URL('../../', import.meta.url).href;
const out = document.getElementById('info');
const cv = document.getElementById('cv');

class Keys {
  constructor() {
    this.down = new Set();
    this.last = 0;
    addEventListener('keydown', (e) => this.down.add(e.code));
    addEventListener('keyup', (e) => this.down.delete(e.code));
  }
  getInput() {
    const k = (c) => this.down.has(c);
    const dir = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    const b = (k('KeyW') || k('ArrowUp') || k('Space') ? InputButtons.Jump : 0) | (k('KeyJ') ? InputButtons.Action : 0) | (k('KeyK') ? InputButtons.Special : 0);
    const f = InputFrame.make(dir, b, b & ~this.last);
    this.last = b;
    return f;
  }
}

async function main() {
  const [simText, metaText] = await Promise.all([fetch(BASE + 'data/simdata.json').then((r) => r.text()), fetch(BASE + 'data/metadata.json').then((r) => r.text())]);
  const db = GameDb.load(simText);
  const meta = new MetaService(MetaDb.load(metaText));
  const impair = Q.has('delay') || Q.has('jitter') || Q.has('drop') ? { delay: num('delay', 0), jitter: num('jitter', 0), drop: num('drop', 0) } : null;
  Online.configure({ meta, impair, ownLead: Q.get('lead') !== '0', driver: Q.get('driver') !== '0' });
  const p = meta.newProfile(new Date(), new MetaRng(Date.now() & 0x7fffffff));
  p.name = Q.get('name') || `P${(Math.random() * 1000) | 0}`;
  const skin = Math.max(1, Math.min(16, num('skin', 1)));
  if (!p.skins.some((s) => s.id === skin)) p.skins.push(newSkinProgress(skin, 1));
  p.skins.find((s) => s.id === skin).level = Math.max(1, Math.min(20, num('level', 5)));
  p.skinSelected = skin;
  p.gameCount = 5;
  const act = Q.get('act') || 'quick';
  const request = act === 'quick' ? meta.buildMatchRequest(p, new Date(), new MetaRng(Date.now() & 0x7fffffff)).request : null;
  // quick match: &mode=0..6 pins the deck draw (Kill5 / LastSurvivor have no timer, so &short cannot end them)
  if (request && Q.has('mode') && meta.db.randomModes[num('mode', -1)]) {
    const m = meta.db.randomModes[num('mode', -1)];
    request.goal = m.goal; request.team = m.team; request.modeText = m.text; request.modeIndex = num('mode', -1);
    for (const sl of request.slots) if (sl) sl.team = teamForSlot(sl.slot, m.team, request.bossOnLeft);
  }
  const config = { modeIndex: num('mode', -1), mapIndex: num('map', -1), difficultyInt: num('diff', 50) };
  const scripted = new ScriptedInput((Date.now() & 0xffff) + 1);
  const game = Q.get('render') === 'game';
  const player = new DevPlayer({ db, profile: p, act, code: Q.get('code'), request, config, autoReady: true, readyWhen: num('players', 2), short: num('short', 0),
    input: Q.get('bot') === '1' ? scripted : new Keys() });
  let app = null;
  if (game) {
    app = await bootGame();
    player.startHook = (req, net) => startGame(app, player, req, net);
    if (Q.get('bot') === '1') setInterval(() => { if (!scripted.fixed) { const f = scripted.getInput(); app.input.scripted = { dirX: (f.encodedDirection - 127) / 127, down: f.down }; } }, 16);
  }
  player.begin();
  window.fgNet = {
    player, app,
    info: () => player.info(),
    script(dirX, down = 0) {
      const fixed = dirX === null ? null : { dirX, down };
      if (app) app.input.scripted = fixed;
      player.input.fixed = fixed;
      scripted.fixed = fixed;
    },
    // a crashed tab: no bye, no keepalive, nothing sent any more
    crash() { const r = player.session.role; if (r) { r.dispose(); r.link.send = () => {}; } player.stop(); if (player.scene) player.scene.runner.running = false; },
    leave() { player.session.leave(); },
  };
  if (!game) draw2d(player);
  setInterval(() => { out.textContent = text(player); }, 250);
}

async function bootGame() {
  const [{ Engine }, { ViewDb }, { GameAudio }, { LocalInput }, { PrefabPool }] = await Promise.all([
    import('../engine/engine.js'), import('../game/viewdb.js'), import('../game/audio.js'), import('../game/match/LocalInput.js'), import('../game/match/prefabs.js')]);
  const engine = new Engine(cv, BASE, '');
  await engine.init();
  const A = engine.assets;
  const [sim, gd, adb, vdb] = await Promise.all([A.getJSON('data/simdata.json'), A.getJSON('data/assets/GameData.json'), A.getJSON('data/assets/AudioDB.json'), A.getJSON('data/assets/FgViewDb.json')]);
  const app = { engine, simDb: GameDb.load(sim), gameData: gd.fields, viewDb: new ViewDb(vdb), audio: new GameAudio(engine, adb), prefabs: new PrefabPool(engine) };
  app.input = new LocalInput(engine);
  engine.start();
  return app;
}

async function startGame(app, player, req, net) {
  const { MatchScene } = await import('../game/match/MatchScene.js');
  const m = new MatchScene(app);
  player.scene = m;
  await m.load(req, { runnerOptions: net });
  m.runStart(true).then(() => {
    player.startedAt = performance.now();
    if (player.short && player.role !== 'client') m.runner.state.timerElapsed = Math.max(0, m.runner.state.timerMax - player.short);
  });
  m.finished().then((o) => { player.outcome = o; });
  return m.runner;
}

function text(p) {
  const i = p.info();
  const lines = [`${Q.get('name') || ''} ${i.role || p.session && p.session.state} ${i.lobby ? 'room ' + i.lobby.code + ' ' + i.lobby.players.map((x) => x.name + (x.ready ? '*' : '')).join(' ') + (i.lobby.countdown != null ? ' ' + i.lobby.countdown + 's' : '') : ''}`];
  if (i.tick !== undefined) lines.push(`tick ${i.tick} phase ${i.phase} kills ${i.killSlot} deaths ${i.deathSlot}${i.over ? ' GAME OVER' : ''}`);
  if (i.net && i.net.rtt) lines.push(`down ${i.net.downBps} B/s up ${i.net.upBps} B/s rtt ${i.net.rtt.p50} ms input->ack ${i.net.inputAck.p50} ms visible ${i.net.inputVisible.p50} ms delay ${i.net.delayMs} ms hold ${i.net.holdPct}%`);
  if (i.net && i.net.clients) for (const c of i.net.clients) lines.push(`client slot ${c.slot}${c.gone ? ' (bot)' : ''} down ${c.downBps} B/s up ${c.upBps} B/s depth ${c.input.avgDepth} starved ${c.input.starved}`);
  if (i.error) lines.push(`error ${i.error.code}: ${i.error.message}`);
  lines.push(...i.log.slice(-6));
  return lines.join('\n');
}

const TEAM = ['#888', '#3d8bff', '#ff4d4d', '#ffd23d', '#4dff88'];

function draw2d(p) {
  const g = cv.getContext('2d');
  const frame = () => {
    requestAnimationFrame(frame);
    cv.width = innerWidth; cv.height = innerHeight;
    g.fillStyle = '#1a1a22'; g.fillRect(0, 0, cv.width, cv.height);
    const r = p.runner;
    if (!r) return;
    const k = cv.width / 48, ox = cv.width / 2, oy = cv.height * 0.72;
    const X = (x) => ox + x * k, Y = (y) => oy - y * k;
    g.strokeStyle = '#444'; g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(cv.width, Y(0)); g.stroke();
    const pos = [0, 0, 0];
    for (const a of r.state.agents) {
      r.agentPos(a.id, pos);
      g.globalAlpha = isDead(a) ? 0.25 : 1;
      g.fillStyle = TEAM[a.team] || '#fff';
      g.fillRect(X(pos[0]) - 0.4 * k, Y(pos[1]) - 1.6 * k, 0.8 * k, 1.6 * k);
      if (a.slot === r.localSlot) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(X(pos[0]) - 0.4 * k, Y(pos[1]) - 1.6 * k, 0.8 * k, 1.6 * k); }
      g.fillStyle = '#0f0'; g.fillRect(X(pos[0]) - 0.5 * k, Y(pos[1]) - 2 * k, k * Math.max(0, a.hpCurrent / Math.max(1, a.hpMax)), 0.15 * k);
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.fillText(`${a.slot}${a.isBot ? 'b' : ''}`, X(pos[0]) - 6, Y(pos[1]) - 2.2 * k);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ff0';
    for (const b of r.state.bullets) {
      const pb = r.findBullet(r.prev, b.id) || b;
      const x = pb.pos.x + (b.pos.x - pb.pos.x) * r.alpha, y = pb.pos.y + (b.pos.y - pb.pos.y) * r.alpha;
      g.beginPath(); g.arc(X(x), Y(y), 0.15 * k, 0, 7); g.fill();
    }
  };
  frame();
}

main().catch((e) => { out.textContent = 'error: ' + (e && e.stack || e); console.error(e); });
