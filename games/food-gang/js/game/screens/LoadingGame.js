// SceneLoadingGame (SceneLoadingGameController + QuantumMatchmaker, META §12.2/§12.10): "Searching opponents...",
// player count 1/4 -> 4/4 at BotFillAt (1 s offline), launch at LobbyDuration (2 s) and the exit button hides.
// With an online session the count follows session.players and the match starts on its 'start' event.
import { Screen, wait } from './base.js';

const BOT_FILL_AT = 1.0, LOBBY_DURATION = 2.0;

export class LoadingGameScreen extends Screen {
  constructor(app, req) { super(app, 'SceneLoadingGame', 0); this.req = req; this.phase = 'search'; }

  async init() {
    const f = this.fields('SceneLoadingGameController');
    this.count = this.ref(f.m_playerCountText);
    this.exit = this.node(f.m_exitButton);
    this.on('OnClickExit', () => this.cancel());
    this.setCount(1);
  }

  setCount(n) { this.players = n; if (this.count) this.count.setText(`${n}/4`); }

  cancel() {
    if (this.phase !== 'search') return;
    this.phase = 'cancel';
    if (this.session) try { this.session.leave(); } catch (e) { console.warn(e); }
    this.finish({ cancel: true });
  }

  finish(r) { if (this.resolveRun) { const f = this.resolveRun; this.resolveRun = null; f(r); } }

  // session: an Online session (quick match) or null for the offline bots
  run(session, friend = false) {
    return new Promise((resolve) => {
      this.resolveRun = async (r) => {
        if (r.cancel) await this.app.fade(() => this.close());
        resolve(r);
      };
      if (session) this.runOnline(session);
      else this.runOffline(friend);
    });
  }

  async runOffline(friend) {
    const e = this.engine;
    const t0 = e.realTime;
    while (this.phase === 'search' && e.realTime - t0 < LOBBY_DURATION) {
      if (e.realTime - t0 >= BOT_FILL_AT || friend) this.setCount(4);
      await wait(e, 0.05);
    }
    if (this.phase !== 'search') return;
    this.launching();
    this.finish({ request: this.req });
  }

  runOnline(session) {
    this.session = session;
    const upd = () => this.setCount(Math.max(1, Math.min(4, (session.players || []).length || 1)));
    session.on('lobby', upd);
    session.on('start', (s) => { if (this.phase !== 'search') return; this.launching(); this.finish({ request: s.request, runnerOptions: s.runnerOptions, session }); });
    session.on('error', (err) => {
      if (this.phase !== 'search') return;
      this.app.toast(err && err.key ? err.key : 'info.private.servererror');
      // no server answer: the original falls back to bots offline
      this.session = null;
      this.runOffline(false);
    });
    session.on('closed', () => { if (this.phase === 'search') this.cancel(); });
    upd();
  }

  launching() { this.phase = 'launch'; this.setCount(4); if (this.exit) this.exit.setActive(false); }

  debug() { return { phase: this.phase, count: this.count ? this.count.text : '', exit: this.btnPos(this.exit) }; }
}
