// HUD buttons that come in one by one. Shop, spin and phone keep the original's own unlocks (cashier mat, blender, first
// car); upgrade is there from the start and gets the original's tutorial arrow (ShowUpgradeButtonAndArrow, on until
// HasSeenUpgradeMenu). [ĐỀ XUẤT] Rolling offer, Customise and Map have no gate in the decompile (rules/hud-unlocks.md),
// so they open at Store 1 tutorial steps instead of all at once. Every newly shown button pops in with the original
// arrow sprite and a one-line tip until it is pressed or has shown for TIP_SECONDS (so an ignored button does not hold
// back the next one). State: global.unlocks[id] = 'new' | 'seen' (absent = locked).

export const TIP_SECONDS = 15;

// done(step): Store 1's TaskManager chain (js/sim/tasks.js) is past that task. 8 = first eggs shelved, 10 = first carry
// upgrade, 14 = last tutorial task.
export const FEATURES = [
  { id: 'upgrade', btn: '#upbtn', own: false, tip: 'Upgrade your carry!', when: c => c.upgradeTask },
  { id: 'shop', btn: '#shopbtn', own: false, tip: 'Shop: cash & gem bundles', when: c => c.shop },
  { id: 'rolling', btn: '#robtn', own: true, tip: 'Free gifts! Claim one by one', when: c => c.done(8) },
  { id: 'spin', btn: '#spinbtn', own: false, tip: 'Daily spin for free gems', when: c => c.spin },
  { id: 'custom', btn: '#custombtn', own: true, tip: 'Dress up: skins, outfits, pets', when: c => c.done(10) },
  { id: 'phone', btn: '#phonebtn', own: false, tip: 'Car order: fill it for big cash', when: c => c.phone },
  { id: 'map', btn: '#mapbtn', own: true, tip: 'City map: your other marts', when: c => c.done(14) },
];

export class Unlocks {
  constructor(root, g) {
    this.root = root;
    this.g = g;
    this.tips = new Map();
    for (const f of FEATURES) {
      const b = root.querySelector(f.btn);
      if (!b) continue;
      b.addEventListener('click', () => this.seen(f.id));
    }
  }

  // Saves from before this existed: whatever is already open counts as seen, so returning players get no tips.
  migrate(ctx) {
    if (this.g.unlocks) return;
    this.g.unlocks = {};
    for (const f of FEATURES) if (f.id !== 'upgrade' && (ctx.all || f.when(ctx))) this.g.unlocks[f.id] = 'seen';
  }

  seen(id) {
    if (this.g.unlocks && this.g.unlocks[id] === 'new') this.g.unlocks[id] = 'seen';
  }

  // ctx: { done(step), upgradeTask, shop, spin, phone, all, busy }; all = past Store 1 (a second mart reached); busy = a
  // menu or the next-mart card is up, so the tip waits (and its clock stops) rather than lying across it. dt in seconds.
  update(ctx, dt) {
    this.migrate(ctx);
    const u = this.g.unlocks;
    for (const f of FEATURES) if (!u[f.id] && (f.when(ctx) || (ctx.all && f.own))) u[f.id] = 'new';
    // One tip at a time, the earliest unseen in the list, and only on a button that is actually on screen.
    let shown = null;
    for (const f of FEATURES) {
      const b = this.root.querySelector(f.btn);
      if (!b) continue;
      if (f.own) b.style.display = u[f.id] ? '' : 'none';
      const visible = b.style.display !== 'none';
      if (!shown && !ctx.busy && u[f.id] === 'new' && visible && !(f.id === 'phone' && !ctx.phone)) shown = f;
    }
    if (shown) {
      this.shownFor = (this.shownId === shown.id ? this.shownFor : 0) + dt;
      this.shownId = shown.id;
      if (this.shownFor >= TIP_SECONDS) { u[shown.id] = 'seen'; shown = null; }
    }
    for (const f of FEATURES) this.tip(f, f === shown);
  }

  tip(f, on) {
    const b = this.root.querySelector(f.btn);
    if (!b) return;
    let t = this.tips.get(f.id);
    if (on && !t) {
      t = document.createElement('span');
      t.className = 'newtip';
      t.innerHTML = `<i class="point"></i><b>NEW!</b> ${f.tip}`;
      b.appendChild(t);
      b.classList.add('popin');
      this.tips.set(f.id, t);
    } else if (!on && t) {
      t.remove();
      b.classList.remove('popin');
      this.tips.delete(f.id);
    }
  }
}
