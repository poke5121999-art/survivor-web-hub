// SceneReward (RewardController + RewardQueueSystem, META §6.4): a fridge (Box1/2/3 prefab) waits for a tap, bursts
// open, then every reward shows in turn: a new fighter (model, name, rarity, "New fighter!"), tokens on the fighter's
// level bar, a power badge, or an item (coins, gems, fridge, mode, arena). Tap for the next; ITEMS REMAINING counts down.
import { Screen, wait } from './base.js';
import { T } from '../text.js';
import { RewardType, Reward } from '../../meta/index.js';
import { SkinCell, powerIcon } from './SkinDisplay.js';
import { rewardIcon, rewardName } from './common.js';
import { BoxOpened } from '../../meta/events.js';

const tier = (n, steps) => { let i = 0; while (i < steps.length - 1 && n >= steps[i + 1]) i++; return i + 1; };
const COIN_TIERS = [0, 300, 1000, 3000], GEM_TIERS = [0, 100, 300, 800, 2000, 5000];

export class RewardScreen extends Screen {
  constructor(app, res, box = 0) {
    super(app, 'SceneReward', 0);
    this.res = res;
    const opened = res.events.find((e) => e instanceof BoxOpened);
    this.box = box || (opened ? opened.box ?? opened.type : 0);
    this.queue = res.rewards.slice();
    this.index = -1;
    this.state = 'appear';
  }

  async init() {
    const { app } = this;
    const f = this.f = this.fields('RewardController');
    this.an = this.ref(f.m_animator);
    for (const k of ['m_item', 'm_token', 'm_power', 'm_skin', 'm_itemRemainingRoot']) this.setActive(f[k], false);
    this.skin = new SkinCell(this, this.ref(f.m_skinDisplay));
    this.token = new SkinCell(this, this.ref(f.m_tokenSkinDisplay));
    await app.ensureSprites(this.queue.filter((r) => r.type !== 'league').map(rewardIcon).filter(Boolean).concat(['pack_currency_freemium_01', 'pack_currency_premium_01']));
    const pfs = this.queue.filter((r) => r.type === RewardType.Skin && r.skinId).map((r) => app.skins.prefab(r.skinId));
    if (this.box >= RewardType.Box1 && this.box <= RewardType.Box3) pfs.push(f['m_box' + (this.box - RewardType.Box1 + 1)]);
    await app.prefabs.preload(pfs);
    this.on('NextReward', () => this.next());
    this.on('OpenBox', () => this.openBox());
    this.tap = (type, p) => { if (type === 'up' && this.app.screens.at(-1) === this && !p.button) this.onTap(); };
    this.engine.onPointer(this.tap);
    const prev = this.onClose; this.onClose = () => { this.engine.pointerHooks = (this.engine.pointerHooks || []).filter((x) => x !== this.tap); if (prev) prev(); };
    app.audio.sfx('PanelAppear');
    if (this.box >= RewardType.Box1 && this.box <= RewardType.Box3) this.showBox();
    else this.next();
  }

  showBox() {
    const name = this.f['m_box' + (this.box - RewardType.Box1 + 1)];
    const inst = this.app.prefabs.spawn(name, this.node(this.f.m_boxRoot));
    this.boxInst = this.adopt(inst);
    this.state = 'box';
    this.app.audio.sfx('BoxAppear');
    this.remaining(this.queue.length);
  }

  onTap() {
    if (this.state === 'box') this.openBox();
    else if (this.state === 'item') this.next();
  }

  async openBox() {
    if (this.state !== 'box') return;
    this.state = 'opening';
    const r = this.boxInst && this.boxInst.root;
    this.app.audio.sfx('BoxPressed');
    if (r) {
      const close = r.findDeep('fridge_close'), open = r.findDeep('fridge_open');
      // short squash before the door flies open (the box prefab has no animator; RewardController drives it)
      for (let i = 0; i < 6; i++) { r.ls[0] = 1 + (i % 2 ? -0.06 : 0.06); r.ls[1] = 1 + (i % 2 ? 0.06 : -0.06); await wait(this.engine, 0.05); }
      r.ls[0] = r.ls[1] = 1;
      if (close) close.setActive(false);
      if (open) open.setActive(true);
      for (const ps of r.inChildren('ParticleSystem')) if (ps.runtime) ps.runtime.play();
    }
    this.app.audio.sfx('BoxPop');
    this.app.settings.vibrate(40);
    await wait(this.engine, 0.45);
    if (r) r.setActive(false);
    this.next();
  }

  remaining(n) {
    this.setActive(this.f.m_itemRemainingRoot, n > 0 && this.box > 0);
    this.text(this.f.m_itemRemaining, String(n));
  }

  async next() {
    if (this.state === 'claim' || this.closed) return;
    if (this.busy) return;
    this.busy = true;
    try {
      this.index++;
      for (const k of ['m_item', 'm_token', 'm_power', 'm_skin']) this.setActive(this.f[k], false);
      if (this.index >= this.queue.length) { await this.claim(); return; }
      this.remaining(this.queue.length - this.index - 1);
      await this.show(this.queue[this.index]);
      this.state = 'item';
    } finally { this.busy = false; }
  }

  async show(r) {
    const { app, f } = this;
    // the rays turn behind every reward (clip frame of a road reward)
    const halo = this.node(f.m_halo); if (halo) halo.setActive(true);
    this.current = r;
    switch (r.type) {
      case RewardType.Skin: {
        this.setActive(f.m_skin, true);
        await this.skin.set(r.skinId, { forceColor: true });
        const p = this.node(f.m_particles); if (p) p.setActive(true);
        app.audio.sfx('Reward');
        break;
      }
      case RewardType.Token: {
        this.setActive(f.m_token, true);
        await this.token.set(r.skinId, { model: false });
        this.text(f.m_tokenCount, '+' + r.count);
        app.audio.sfx('TokenBar');
        break;
      }
      case RewardType.Power: {
        this.setActive(f.m_power, true);
        this.setImage(f.m_powerImage, powerIcon(r.skinId, r.powerId));
        this.setImage(f.m_powerImageFlash, powerIcon(r.skinId, r.powerId));
        this.text(f.m_powerName, T(`power.name.${r.skinId}.${r.powerId}`));
        this.text(f.m_powerDescription, T(`power.description.${r.skinId}.${r.powerId}`));
        this.text(f.m_powerTypeLabel, T(r.powerId === 1 ? 'info.specialpower' : 'info.passivepower'));
        app.audio.sfx('Reward');
        break;
      }
      case 'league': {
        // new sub-league reached: league badge, "New league!" + its name [ĐỀ XUẤT: the scene that showed league.up is not in the rip]
        this.setActive(f.m_item, true);
        const lg = app.gameData.m_leagues.find((l) => l.m_id === r.row.id);
        if (lg) { await app.ensureSprites([lg.m_icon]); this.setImage(f.m_itemImage, lg.m_icon); this.setImage(f.m_itemImageFlash, lg.m_icon); }
        this.text(f.m_itemCount, r.row.name);
        this.text(f.m_itemName, T('league.up'));
        app.audio.sfx('Victory');
        break;
      }
      default: {
        this.setActive(f.m_item, true);
        let icon = rewardIcon(r);
        if (r.type === RewardType.Freemium) icon = 'sprite:pack_currency_freemium_0' + tier(r.count, COIN_TIERS);
        if (r.type === RewardType.Premium) icon = 'sprite:pack_currency_premium_0' + tier(r.count, GEM_TIERS);
        await app.ensureSprites([icon]);
        this.setImage(f.m_itemImage, icon);
        this.setImage(f.m_itemImageFlash, icon);
        this.text(f.m_itemCount, r.type === RewardType.Freemium || r.type === RewardType.Premium ? 'x' + r.count : r.count > 1 ? 'x' + r.count : '');
        this.text(f.m_itemName, rewardName(app, r) || '');
        app.audio.sfx('Reward');
      }
    }
  }

  async claim() {
    this.state = 'claim';
    if (this.an && this.an.runtime) this.an.runtime.setTrigger('Claim');
    await wait(this.engine, 0.35);
    this.app.emit('profile');
    this.close();
  }

  debug() {
    const r = this.current;
    return { state: this.state, box: this.box, index: this.index, count: this.queue.length,
      current: r ? { type: r.type === 'league' ? 'league' : RewardType.name(r.type), count: r.count, skinId: r.skinId } : null };
  }
}
