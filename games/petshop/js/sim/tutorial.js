// The original first-run tutorial (class Tutorial, decoded from libil2cpp; scene component on @Holders/Tutorial).
// stepDataList order (TutorialStepType values); the save starts at index 1 (GameSavingManager.saveData.tutorialStep = 1,
// tutorialDone = 0). CompleteStepRoutine: index++, then 2.0 s later the next step is set up; the last step calls
// TutorialFinished at once (tutorialDone = 1, TaskManager starts). The objective text of a step is the I2 term named like
// the enum (PickUpBox, PlaceItems, ...); steps 1-3 show none.
export const TUT_STEPS = [0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
export const TUT_NAME = {
  0: 'None', 1: 'TranslationScreen', 2: 'WelcomeScreen', 3: 'NameYourStore', 4: 'NameChangeTip', 5: 'MoveCamera',
  6: 'MoveJoyStick', 7: 'FollowObjectiveTip', 8: 'PickUpBox', 9: 'PlaceItems', 10: 'PutBoxInTrash', 11: 'SetItemsPrice',
  12: 'OpenStore', 13: 'GoToCheckOut', 14: 'CustomerCheckOut_1', 15: 'CustomerCheckOut_2', 16: 'LeaveCheckOut',
  17: 'OpenMarketPlace', 18: 'CloseMarketPlace', 19: 'BoostDeliveryItem', 20: 'PickUpSecondBox', 21: 'PlaceInCage',
};
// the game event that completes each step (Tutorial.SetupTutorialStepEvent subscriptions)
const DONE_ON = {
  1: 'language', 2: 'welcome', 3: 'nameClosed', 5: 'look', 6: 'move', 8: 'pickTutBox', 9: 'tutBoxEmpty', 10: 'trash',
  11: 'priceClose', 12: 'storeOpen', 13: 'counterEnter', 14: 'paid', 15: 'paid', 16: 'counterLeave', 17: 'laptop',
  18: 'cartBought', 19: 'delivered', 20: 'pickDelivered', 21: 'productAdded',
};
export const TUT = {
  stepDelay: 2.0,        // CompleteStepRoutine WaitForSeconds(2)
  inputDelay: 0.75,      // MoveCamera / MoveJoyStick success routines
  welcomeAuto: 5.0,      // DOVirtual.DelayedCall(5, OnClickWelcomeScreen)
  capacity: { 12: 2, 15: 0, 19: null },   // GameManager.maxCustomerCapacity set at step start (null = restored)
  cashChange: 1575,      // CashPayment.ShowPaymentScreen at step 14: changeList[1]
};

export class Tutorial {
  constructor(sim) { this.sim = sim; this.wait = 0; this.pendingDone = 0; }

  get s() { return this.sim.s; }
  active() { return !this.s.tutorialDone; }
  type() { return this.active() ? TUT_STEPS[this.s.tutStep] : 0; }
  // waiting between steps: the previous step is done, the next one is not set up yet
  between() { return this.active() && this.wait > 0; }

  // a fresh store: the scene's tutorial Dog Food box (@Holders/Tutorial/1_DogFood, 12 items) becomes a real box
  setupFresh(box) {
    const s = this.s;
    s.tutorialDone = false;
    s.tutStep = 1;
    s.tutCap = null;
    s.tutBox = box ? box.id : 0;
    s.tutDelivered = [];
    this.enter();
  }

  enter() {
    const t = this.type(), s = this.s;
    if (t in TUT.capacity) s.tutCap = TUT.capacity[t];
    if (t === 9) { const b = s.boxes.find(x => x.id === s.tutBox); if (b) b.open = true; this.cab9 = this.tutCabinet(); }   // ProductDeliveryBox.OpenBox()
    if (t === 2) this.autoWelcome = TUT.welcomeAuto;
    this.sim.emit('tutStep', { step: t, name: TUT_NAME[t], index: s.tutStep });
  }

  // something happened in the game; completes the current step when it is the step's event
  event(name, data) {
    if (!this.active() || this.wait > 0 || this.pendingDone > 0) return;
    const t = this.type();
    if (DONE_ON[t] !== name) return;
    if (name === 'pickTutBox' && data !== this.s.tutBox) return;
    if (name === 'pickDelivered' && !this.s.tutDelivered.includes(data)) return;
    if (t === 5 || t === 6) { this.pendingDone = TUT.inputDelay; return; }
    this.complete();
  }

  complete() {
    const s = this.s, t = this.type();
    this.sim.emit('tutDone', { step: t, name: TUT_NAME[t] });
    s.tutStep++;
    if (s.tutStep >= TUT_STEPS.length) { this.finish(); return; }
    this.wait = TUT.stepDelay;
  }

  finish() {
    const s = this.s;
    s.tutorialDone = true;
    s.tutCap = null;
    this.sim.emit('tutFinished');
  }

  step(dt) {
    if (!this.active()) return;
    if (this.pendingDone > 0 && (this.pendingDone -= dt) <= 0) { this.pendingDone = 0; this.complete(); return; }
    if (this.wait > 0 && (this.wait -= dt) <= 0) { this.wait = 0; this.enter(); return; }
    if (this.type() === 2 && this.autoWelcome > 0 && (this.autoWelcome -= dt) <= 0) this.event('welcome');
  }

  // customer / checkout rules that read the tutorial step
  capacity(normal) { return this.active() && this.s.tutCap != null ? this.s.tutCap : normal; }
  basket(n) { const t = this.type(); return t === 13 || t === 14 ? 2 : n; }   // CustomerShopEnterSuccess: maxProductsToBuy = 2
  payMethod(m) { const t = this.type(); return t === 14 ? 1 : t === 15 ? 2 : m; }   // CustomerPaymentHelper.TutorialLogicHelper
  change(c) { return this.type() === 14 ? TUT.cashChange : c; }
  // step 9: only the first shelf's cabinet 1 keeps its collider. A save that comes into the tutorial with that cabinet
  // holding another product (or full) gets the first Rack cabinet that can take the box instead [ĐỀ XUẤT: no soft-lock].
  tutCabinet() {
    const s = this.s, b = s.boxes.find(x => x.id === s.tutBox);
    const ok = (f, i) => { const lay = this.sim.layoutOf(f).cabinets[i], st = f.cab[i]; return lay && lay.storage === 1 && st && (st.n === 0 || (st.p === (b ? b.type : 1) && st.n < lay.slots.length)); };
    const rack = s.furniture.find(f => f.kind === 'f');
    if (rack && ok(rack, 1)) return [rack.id, 1];
    for (const f of s.furniture) if (f.kind === 'f') for (let i = 0; i < f.cab.length; i++) if (ok(f, i)) return [f.id, i];
    return rack ? [rack.id, 1] : null;
  }
  canPlace(fid, i) {
    if (this.type() !== 9) return true;
    if (!this.cab9) this.cab9 = this.tutCabinet();
    return !!this.cab9 && this.cab9[0] === fid && this.cab9[1] === i;
  }
}
