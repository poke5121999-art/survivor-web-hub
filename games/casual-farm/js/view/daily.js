// Daily spin (DailySpinScreen + _DailySpin_RewardScreen), the welcome-mart cash screen (MartWelcomeScreen) and the
// one-time gem gift (Update_Gems), rebuilt from the prefabs in art/ui/menus. Rules and numbers: sim/daily.js.
// Ad buttons grant without the video, like every other ad in this build.
import {
  SLOTS, SPIN_TIME, WHEEL_START, GEM_SPIN, AD_SPINS, spinState, rollSlot, landing, slotAt, dealWheel, reward,
  secondsToMidnight, martCash,
} from '../sim/daily.js';

// The reward screen's per-booster icon and line.
const BOOST = {
  machine: { icon: 'MachineSpeedBoostUI', text: 'Faster machines' },
  player: { icon: 'playerSpeedBoostIcon', text: 'Speed boost' },
  customer: { icon: 'extraCustomersIcon', text: 'Extra customers' },
  worker: { icon: 'workersSpeedBoostIcon', text: 'Faster workers' },
  cash: { icon: 'revenueBoostIcon', text: 'Double income' },
};
// DOTween Ease 9 (OutCubic) on the wheel's DOBlendableLocalRotateBy.
const outCubic = x => 1 - (1 - x) ** 3;
const fmt = n => n.toLocaleString('en-US');

export class Daily {
  // g: the global save; wallet: { cheapest(), addCash(n), boost(kind, s) }; save(): persist g; unlocked(): spin button on.
  constructor({ art, sound, g, wallet, save, unlocked, rng = Math.random }) {
    this.g = g;
    this.unlocked = unlocked || (() => true);
    this.wallet = wallet;
    this.save = save;
    this.sound = sound;
    this.rng = rng;
    const m = n => `${art}/ui/menus/${n}.webp`;
    this.m = m;
    g.gems = g.gems || 0;
    g.welcomed = g.welcomed || {};
  }

  // The HUD calls this once it has written its own markup into root.
  mount(root) {
    const m = this.m;
    root.insertAdjacentHTML('beforeend', `
      <div class="mshade dspin" id="spinmenu"><div class="panel" style="--bg:url('${m('bg-spin')}')">
        <div class="head"><img class="hdr" src="${m('header-dailySpin')}" alt=""><i class="timer ol"></i></div>
        <div class="mid">
          <img class="back" src="${m('image-spin-bg')}" alt="">
          <div class="wheel"><img class="face" src="${m('image-spin')}" alt=""><div class="icons"></div></div>
          <div class="lights">${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join('')}</div>
          <i class="hub"></i>
          <img class="ptr" src="${m('Triangle~2')}" alt="">
        </div>
        <div class="foot">
          <a class="sb ol spin" data-act="spin" style="--b:url('${m('button-green')}')">Spin</a>
          <a class="sb ol rv" data-act="rv" style="--b:url('${m('button-green~2')}')"><img src="${m('icon-rewarded')}" alt="">Extra Spin<s class="ol"></s></a>
          <a class="sb ol gem" data-act="gem" style="--b:url('${m('button-blue')}')"><img src="${m('icon-gem')}" alt="">Extra Spin<s class="ol">x${GEM_SPIN}</s></a>
        </div>
        <a class="sb x" data-act="close" style="--b:url('${m('button-exit')}')"></a>
      </div></div>
      <div class="mshade dreward" id="spinreward"><div class="panel">
        <b class="title ol">Reward</b><b class="desc ol"></b>
        <div class="box"><img class="shine" src="${m('shine')}" alt=""><img class="icon" alt=""><b class="ol amt"></b></div>
        <div class="foot"><a class="tb ol" data-act="claim" style="--c:#ffc236">Claim</a></div>
      </div></div>
      <div class="mshade dwelcome" id="martwelcome"><div class="panel">
        <b class="title ol">Congratulations!</b>
        <div class="box"><img class="icon" alt=""><b class="name ol"></b>
          <p class="ol">Welcome to your <span class="y">New Mart !</span><br>Here's your reward:</p>
          <div class="pay"><img src="${m('cashIcon')}" alt=""><b class="ol amt"></b></div></div>
        <div class="foot"><a class="tb ol" data-act="claim" style="--c:#ffc236">Claim</a>
          <a class="tb ol" data-act="double" style="--c:#5ef0c7"><img src="${m('adIcon')}" alt="">100% extra</a></div>
      </div></div>
      <div class="mshade dgems" id="gemgift"><div class="panel">
        <b class="title ol">Gems</b>
        <div class="info"><p class="ol">Use <span class="p">Gems</span> to skip ads and get rewards</p></div>
        <p class="ol free">Here are some free gems</p>
        <div class="pay"><img src="${m('icon-gem')}" alt=""><b class="ol amt"></b></div>
        <div class="foot"><a class="tb ol" data-act="claim" style="--c:#ffc236">Claim</a></div>
      </div></div>`);
    this.menu = root.querySelector('#spinmenu');
    this.rew = root.querySelector('#spinreward');
    this.welcome = root.querySelector('#martwelcome');
    this.gift = root.querySelector('#gemgift');
    this.wheelEl = this.menu.querySelector('.wheel');
    this.angle = WHEEL_START;
    this.menu.addEventListener('click', e => this.menuClick(e));
    this.rew.addEventListener('click', e => { if (e.target.closest('[data-act="claim"]')) this.claim(); });
    this.welcome.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b && this.welcomeAmount) this.claimWelcome(b.dataset.act === 'double' ? 2 : 1);
    });
    this.gift.addEventListener('click', e => {
      if (!e.target.closest('[data-act="claim"]') || !this.giftAmount) return;
      this.tap();
      this.g.gems += this.giftAmount;
      this.giftAmount = 0;
      this.gift.classList.remove('open');
      this.save();
    });
  }

  get isOpen() { return this.menu.classList.contains('open') || this.rew.classList.contains('open'); }

  tap(cancel) { if (this.sound) this.sound.play(cancel ? 'cancel' : 'tap'); }

  open() {
    // DailySpinMenuController.Awake deals the booster slots each time the screen is built.
    this.wheel = dealWheel(this.rng);
    const icons = SLOTS.map((s, i) => {
      const c = (s.z[0] + s.z[1]) / 2;
      const r = s.kind === 'booster' ? `<img src="${this.m(BOOST[this.wheel[i]].icon)}" alt=""><b class="ol">5 mins</b>`
        : s.kind === 'gems' ? `<img src="${this.m('icon-gem')}" alt=""><b class="ol g">${reward(i, this.wheel, this.ctx()).amount}</b>`
          : `<img src="${this.m('extraCashIcon')}" alt=""><b class="ol c">${fmt(reward(i, this.wheel, this.ctx()).amount)}</b>`;
      return `<div class="slot${s.golden ? ' gold' : ''}" style="--a:${c}deg">${r}</div>`;
    }).join('');
    this.menu.querySelector('.icons').innerHTML = icons;
    this.setAngle(this.angle);
    this.menu.classList.add('open');
    this.update(true);
  }

  close() { this.menu.classList.remove('open'); }

  ctx() { return { cheapest: this.wallet.cheapest(), g: this.g }; }

  // CSS turns clockwise; the original's z is counter-clockwise.
  setAngle(a) { this.wheelEl.style.transform = `rotate(${-a}deg)`; }

  menuClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b || this.spinning) return;
    const act = b.dataset.act, st = spinState(this.g);
    if (act === 'close') { this.tap(true); this.close(); return; }
    if (act === 'spin' && st.free) this.spin();
    else if (act === 'rv' && !st.free && st.ads > 0) this.spin();
    else if (act === 'gem' && !st.free && st.ads === 0) {
      if (this.g.gems < GEM_SPIN) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
      this.g.gems -= GEM_SPIN;
      this.spin();
    }
  }

  spin() {
    this.tap();
    this.g.spin.used++;
    this.save();
    const i = rollSlot(this.rng());
    const from = this.angle, to = landing(from, i, this.rng());
    this.spinning = { from, to, start: performance.now(), slot: i };
    if (this.sound) this.sound.play('spin');
    this.update(true);
  }

  // AwardTheWinner: the slot under the pointer at the end pays.
  award() {
    const i = slotAt(this.angle);
    this.pending = reward(i, this.wheel, this.ctx());
    const p = this.pending, r = this.rew;
    const icon = p.kind === 'boost' ? BOOST[p.boost].icon : p.kind === 'gems' ? 'icon-gem' : 'extraCashIcon';
    r.querySelector('.icon').src = this.m(icon);
    r.querySelector('.desc').textContent = p.kind === 'boost' ? BOOST[p.boost].text : p.kind === 'gems' ? 'Gems' : 'Cash';
    r.querySelector('.desc').className = `desc ol k-${p.kind}`;
    r.querySelector('.amt').textContent = p.kind === 'boost' ? `${p.seconds / 60} mins` : fmt(p.amount);
    r.querySelector('.amt').className = `ol amt k-${p.kind}`;
    r.classList.add('open');
    if (this.sound) this.sound.play('spinReward');
  }

  claim() {
    const p = this.pending;
    if (!p) return;
    this.tap();
    this.pending = null;
    this.rew.classList.remove('open');
    if (p.kind === 'boost') this.wallet.boost(p.boost, p.seconds);
    else if (p.kind === 'gems') this.g.gems += p.amount;
    else this.wallet.addCash(p.amount);
    this.save();
    this.update(true);
  }

  // UpdateScreenController (welcomeScreenType 2): once per mart on its first load, x2 from the ad button.
  showWelcome({ id, name, icon, level }) {
    const amount = martCash(level);
    if (!amount || this.g.welcomed[id]) return false;
    this.welcomeId = id;
    this.welcomeAmount = amount;
    this.welcome.querySelector('.icon').src = icon;
    this.welcome.querySelector('.name').textContent = name;
    this.welcome.querySelector('.amt').textContent = fmt(amount);
    this.welcome.classList.add('open');
    return true;
  }

  claimWelcome(mult) {
    this.tap();
    this.g.welcomed[this.welcomeId] = true;
    this.wallet.addCash(this.welcomeAmount * mult);
    this.welcomeAmount = 0;
    this.welcome.classList.remove('open');
    this.save();
  }

  // CanvasManager.CheckShouldGiveGem (HasReceivedGem): the third booster button of a session gives RvToGem(1) gems once.
  boosterShown() {
    this.boostersSeen = (this.boostersSeen || 0) + 1;
    if (this.boostersSeen !== 3 || this.g.gotGem) return;
    this.g.gotGem = true;
    this.giftAmount = GEM_SPIN;
    this.gift.querySelector('.amt').textContent = this.giftAmount;
    this.gift.classList.add('open');
    this.save();
  }

  update(force) {
    if (this.spinning) {
      const s = this.spinning, k = Math.min(1, (performance.now() - s.start) / (SPIN_TIME * 1000));
      this.angle = s.from + (s.to - s.from) * outCubic(k);
      this.setAngle(this.angle);
      const on = Math.floor(performance.now() / 150) % 2;
      this.menu.querySelector('.lights').classList.toggle('alt', !!on);
      if (k >= 1) {
        this.angle = s.to % 360;
        this.spinning = null;
        this.award();
      }
    }
    if (!this.menu.classList.contains('open')) return;
    const now = performance.now();
    if (!force && now - (this.t || 0) < 500) return;
    this.t = now;
    const st = spinState(this.g), busy = !!this.spinning;
    const f = this.menu.querySelector('.foot');
    f.querySelector('.spin').style.display = st.free ? '' : 'none';
    f.querySelector('.rv').style.display = !st.free && st.ads > 0 ? '' : 'none';
    f.querySelector('.rv s').textContent = st.ads;
    f.querySelector('.gem').style.display = !st.free && st.ads === 0 ? '' : 'none';
    f.querySelector('.gem').classList.toggle('poor', this.g.gems < GEM_SPIN);
    f.classList.toggle('busy', busy);
    const left = secondsToMidnight(), h = Math.floor(left / 3600), mi = Math.floor(left % 3600 / 60);
    this.menu.querySelector('.timer').textContent = st.free ? '' : `Free Spin in: ${h}h ${mi}m`;
  }

  // DailySpinButtonController: the HUD dot shows while today's free spin is unused.
  freeReady() { return spinState(this.g).free; }
}
