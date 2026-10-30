// SceneVIP (ActivatePass, META §10): KING on the podium, weekly / monthly subscription buttons (web: the click is the
// purchase: VIP time + KING through MetaService.claimIap), SUBSCRIBE NOW! / SWITCH SUBSCRIPTION!, terms and privacy.
// Prices are the scene's own placeholders: the store prices are not in the rip [ĐỀ XUẤT].
import { Screen } from './base.js';
import { MetaRng, Profile } from '../../meta/index.js';
import { SkinCell } from './SkinDisplay.js';

export class VipScreen extends Screen {
  constructor(app) { super(app, 'SceneVIP', 0); }

  async init() {
    const { app } = this;
    const f = this.pf = this.fields('ActivatePass');
    const cell = this.script('SkinSettingDisplay');
    if (cell) { this.skin = new SkinCell(this, cell); await this.skin.set(app.meta.R.vipSkinId, { forceColor: true }); }
    this.on('Close', () => this.close());
    this.on('BuySeasonPass', () => this.buy('pass'));
    this.on('BuyMonthlyPass', () => this.buy('passmonthly'));
    this.on('Open', (o, b) => { const u = b.node.script('OpenUrl'); if (u) window.open(u.fields.m_urlAndroid, '_blank', 'noopener'); });
    this.update();
  }

  update() {
    const p = this.app.profile, vip = Profile.isVip(p, new Date());
    this.setActive(this.pf.m_stateSubscribe, !vip);
    this.setActive(this.pf.m_stateSwitch, vip);
    // the check badge stands for the plan already running (ActivatePass.UpdateDisplay)
    const left = p.vipUntil - Date.now() / 1000;
    this.setActive(this.pf.m_badgeWeekly, vip && left <= 8 * 86400);
    this.setActive(this.pf.m_badgeMonthly, vip && left > 8 * 86400);
  }

  async buy(id) {
    const { app } = this;
    const res = app.meta.claimIap(app.profile, id, new Date(), new MetaRng(Date.now() & 0x7fffffff));
    if (!res.ok) { app.toast(res.error); return; }
    app.save();
    app.emit('profile');
    if (res.rewards.length) await app.showRewards(res);
    this.update();
    this.close();
  }

  debug() { return { weekly: this.btnPos(this.node(this.pf.m_buttonWeekly)), monthly: this.btnPos(this.node(this.pf.m_buttonMonthly)), vipUntil: this.app.profile.vipUntil }; }
}
