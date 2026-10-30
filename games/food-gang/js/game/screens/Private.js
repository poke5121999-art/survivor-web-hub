// Party battle (ScenePrivate*, META §13) over the online service (js/net/online.js through ../net.js):
// ScenePrivateBattle (Create / Join) -> ScenePrivateJoin (4-letter code) -> ScenePrivateLobby (code, 4 player cells,
// mode / arena / difficulty, Customize for the host, Fighters, Battle!) -> ScenePrivateConfiguration.
// Without the service the screens open in an offline state: the lobby says "Server unavailable" and Battle! is off.
import { Screen } from './base.js';
import { T } from '../text.js';
import { CustomMatchOptions } from '../../meta/events.js';
import { CollectionScreen } from './Collection.js';
import { bindNameField } from './TutoEnd.js';

const DIFF = ['config.diff.veryeasy', 'config.diff.easy', 'config.diff.normal', 'config.diff.hard', 'config.diff.veryhard'];
const errKey = (e) => (e && /code|room|version|notfound|badcode/i.test(String(e.code || '') + String(e.message || '')) ? 'info.private.badcode' : 'info.private.servererror');

function configLabels(app, cfg) {
  const db = app.meta.db;
  const mode = cfg.modeIndex >= 0 && db.randomModes[cfg.modeIndex] ? T(db.randomModes[cfg.modeIndex].text) : T('config.random.mode');
  const map = cfg.mapIndex >= 0 ? T('stage.' + db.maps[cfg.mapIndex].stageId) : T('config.random.map');
  const di = Math.max(0, (db.rules.friendRoomDifficulties || [0, 25, 50, 75, 100]).indexOf(cfg.difficultyInt));
  return { mode, map, diff: T(DIFF[di] || DIFF[2]) };
}

export class PrivateBattleScreen extends Screen {
  constructor(app) { super(app, 'ScenePrivateBattle', 0); }

  async init() {
    const f = this.pf = this.fields('ScenePrivateBattleController');
    this.setActive(f.m_spinner, false);
    const ver = this.script('VersionDisplay'); if (ver) this.text(ver.fields.versionText, 'Version 2.2.4 web');
    this.on('OnClickBack', () => this.close());
    this.on('OnClickCreate', () => this.create());
    this.on('OnClickJoin', () => this.join());
    this.onState(f.m_buttonCreate, true);
    this.onState(f.m_buttonJoin, true);
    await this.app.net.ready;
  }

  async create() {
    const { app } = this;
    const cfg = new CustomMatchOptions();
    const session = app.net.available() ? app.net.createPrivate(cfg) : null;
    await this.lobby(session, cfg, true);
  }

  async join() {
    const s = await this.app.popup(PrivateJoinScreen);
    const r = await s.done();
    if (r && r.session) await this.lobby(r.session, new CustomMatchOptions(), false);
  }

  async lobby(session, cfg, host) {
    const s = await this.app.popup(PrivateLobbyScreen, session, cfg, host);
    const r = await s.done();
    if (r && r.type === 'private') { this.result = r; this.close(); }
  }

  debug() { return { create: this.btnPos(this.node(this.pf.m_buttonCreateBtn)), join: this.btnPos(this.node(this.pf.m_buttonJoinBtn)), online: this.app.net.available() }; }
}

export class PrivateJoinScreen extends Screen {
  constructor(app) { super(app, 'ScenePrivateJoin', 0); }

  async init() {
    const f = this.jf = this.fields('ScenePrivateJoinController');
    this.field = this.ref(f.m_inputField);
    if (this.field) { this.field.uppercase = true; this.field.onEndEdit = () => this.updateState(); this.field.onValueChanged = () => this.updateState(); }
    this.setActive(f.m_spinner, false);
    this.on('OnClickBack', () => this.close());
    this.on('OnClickJoin', () => this.join());
    this.updateState();
  }

  code() { return String(this.field && this.field.value !== undefined ? this.field.value : '').toUpperCase().trim(); }
  updateState() { this.onState(this.jf.m_joinButtonState, this.code().length === 4); }

  // ScenePrivateJoinController.OnClickJoin: ToUpper().Trim(), exactly 4 letters
  join() {
    const { app } = this;
    const code = this.code();
    if (code.length !== 4) { app.toast('info.private.join.code'); return; }
    if (!app.net.available()) { app.toast('info.private.servererror'); return; }
    this.setActive(this.jf.m_spinner, true);
    const s = app.net.joinPrivate(code);
    const off = () => this.setActive(this.jf.m_spinner, false);
    s.on('lobby', () => { if (this.closed) return; off(); this.result = { session: s }; this.close(); });
    s.on('error', (e) => { off(); app.toast(errKey(e)); });
  }

  debug() { return { field: this.field ? this.btnPos(this.field.node) : null, join: this.btnPos(this.node(this.jf.m_joinButton)) }; }
}

export class PrivateLobbyScreen extends Screen {
  constructor(app, session, cfg, host) { super(app, 'ScenePrivateLobby', 0); this.session = session; this.cfg = cfg; this.host = host; }

  async init() {
    const { app } = this;
    const f = this.lf = this.fields('ScenePrivateLobbyController');
    this.cells = (f.m_playerCells || []).map((r) => this.ref(r));
    this.on('OnClickBack', () => this.leave());
    this.on('OnClickCopyCode', () => this.copy());
    this.on('OnClickConfig', () => this.config());
    this.on('OnClickSkin', async () => { const s = await app.popup(CollectionScreen); await s.done(); this.renderPlayers(); });
    this.on('OnClickLaunch', () => this.launch());
    this.players = [{ name: app.profile.name, skin: app.profile.skinSelected, isHost: this.host, ready: false }];
    const s = this.session;
    if (s) {
      s.on('lobby', (info) => { if (this.closed) return; this.code = info.code; this.players = info.players || this.players; this.host = info.isHost ?? this.host; if (info.config) Object.assign(this.cfg, info.config); this.render(); });
      s.on('start', (st) => { if (this.closed) return; this.result = { type: 'private', request: st.request, runnerOptions: st.runnerOptions, session: s }; this.close(); });
      s.on('error', (e) => { if (this.closed) return; app.toast(errKey(e)); this.offline = true; this.render(); });
      s.on('closed', () => { if (!this.closed && !this.result) { this.offline = true; this.render(); } });
    } else this.offline = true;
    this.render();
  }

  render() {
    if (this.closed) return;
    const f = this.lf;
    this.text(f.m_codeText, this.offline ? '----' : this.code || '....');
    const L = configLabels(this.app, this.cfg);
    this.text(f.m_modeLabel, L.mode); this.text(f.m_mapLabel, L.map); this.text(f.m_diffLabel, L.diff);
    this.setActive(f.m_configButton, this.host && !this.offline);
    const w = this.ref(f.m_waitingText);
    if (w) { w.node.setActive(this.offline || !this.host); w.setText(this.offline ? T('info.private.servererror') : T('info.private.waiting.host')); }
    const canLaunch = !this.offline && this.host && this.players.length >= 2;
    this.onState(f.m_launchButtonState, canLaunch);
    this.setActive(f.m_launchButton, this.host || this.offline);
    this.renderPlayers();
  }

  // LoadingCellDisplay per seat: skin icon on the team background, name, "Picking a fighter..." while choosing
  renderPlayers() {
    const { app } = this, gd = app.gameData;
    this.cells.forEach((cell, i) => {
      if (!cell) return;
      const pl = this.players[i];
      const f = cell.fields;
      const R = (k) => (f[k] ? this.inst.ref(f[k]) : null);
      const N = (k) => { const x = R(k); return x && x.node ? x.node : x; };
      const root = N('m_root'), ld = N('m_loading'), ch = N('m_choosing');
      if (root) root.setActive(!!pl);
      if (ld) ld.setActive(!pl);
      if (ch) ch.setActive(!!(pl && pl.choosing));
      if (!pl) return;
      const vs = app.viewDb.skinById(pl.skin || 1);
      const img = R('m_skin'); if (img && vs && vs.icon) img.setSprite(vs.icon);
      const bg = R('m_background'); if (bg) bg.setSprite('sprite:bg_skin_' + (i < 2 ? 1 : 2));
      const nm = R('m_name'); if (nm) { nm.setText(pl.name || 'P' + (i + 1)); nm.color = (gd.m_colorsTeam[0] || [1, 1, 1, 1]).slice(); }
    });
  }

  async copy() {
    if (!this.code) return;
    try { await navigator.clipboard.writeText(this.code); } catch { /* clipboard blocked */ }
    this.app.toast('info.private.code.copied');
  }

  async config() {
    const s = await this.app.popup(PrivateConfigScreen, this.cfg);
    await s.done();
    if (this.session && this.session.setConfig) this.session.setConfig(this.cfg);
    this.render();
  }

  launch() {
    if (this.offline) { this.app.toast('info.private.servererror'); return; }
    if (this.players.length < 2) { this.app.toast('info.private.launch.min'); return; }
    this.session.setReady(true);
  }

  leave() { if (this.session && !this.result) try { this.session.leave(); } catch (e) { console.warn(e); } this.close(); }

  debug() { return { offline: !!this.offline, code: this.code || null, players: this.players.length, launch: this.btnPos(this.node(this.lf.m_launchButton)), config: this.btnPos(this.node(this.lf.m_configButton)) }; }
}

// ScenePrivateConfiguration: mode -1..6, arena -1..2, difficulty 0/25/50/75/100 cycle on click (§13.4)
export class PrivateConfigScreen extends Screen {
  constructor(app, cfg) { super(app, 'ScenePrivateConfiguration', 0); this.cfg = cfg; }
  async init() {
    const db = this.app.meta.db, diffs = db.rules.friendRoomDifficulties || [0, 25, 50, 75, 100];
    const c = this.cfg;
    this.on('OnClickMode', () => { c.modeIndex = c.modeIndex + 1 >= db.randomModes.length ? -1 : c.modeIndex + 1; this.render(); });
    this.on('OnClickMap', () => { c.mapIndex = c.mapIndex + 1 >= db.maps.length ? -1 : c.mapIndex + 1; this.render(); });
    this.on('OnClickDiff', () => { const i = diffs.indexOf(c.difficultyInt); c.difficultyInt = diffs[(i + 1) % diffs.length]; this.render(); });
    this.on('Close', () => this.close());
    this.render();
  }
  render() {
    const f = this.fields('ScenePrivateConfigurationController');
    const L = configLabels(this.app, this.cfg);
    this.text(f.m_modeText, L.mode); this.text(f.m_mapText, L.map); this.text(f.m_diffText, L.diff);
  }
  debug() { return { ...this.cfg }; }
}

export { bindNameField };
