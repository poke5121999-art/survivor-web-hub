// Account-wide layer (FarmSave, rules: farmland-ref/rules/MONETIZATION.md): diamonds (HC), pets, bike, piggy bank, skins.
// Plain data in meta.fs (saved with the meta record, so it follows the cloud save); no THREE, node-testable.
// Remake substitutions, as casual-farm does: rewarded-video and real-money paths do not exist on the web, so
// [ĐỀ XUẤT] the piggy bank cracks for free once it is Ready (the IAP has no recoverable price) and the permanent pet /
// bike / VIP purchases are left out. Trials and HC rentals are the game's own numbers.
export const META = {
  startHC: 30,                       // FarmSave ctor HCBalance = 0x1e
  petTrialHours: 1, petRentHours: 5, petRentHC: 50,         // GC.AnimalTrialDurationHours, Cat/DogRentalHours, Cat/DogRentalPrice
  bikeTrialHours: 1, bikeRentHours: 5, bikeRentHC: 50,      // GC.BikeTrialDurationHours, BikeRentalHours, BikeRentalPrice
  catCoin: 1.25, dogBarn: 1.3, bikeSpeed: 1.7,               // GC.CatCoinMultiplier, DogBarnMultiplier, player BikeSpeedMultiplier
  piggyPerParcel: 5,                 // GC.UnlockHCGainAmount, every parcel unlock (HCDrop toPiggyBank)
  piggyFirst: 360, piggySecond: 600, piggyEvolution: 1.25,  // GC.FirstThreshold / SecondThreshold / PiggyBankEvolutionMultiplier
  skinStart: 40, skinStep: 8, skinMax: 300,                 // GC.SkinStartPrice / SkinPriceMultiplier / SkinMaxPrice
};
export const PETS = ['Cat', 'Dog'];
const H = 3600e3;

export class Meta {
  // fs: the saved record (or null for a new account); skins: GC.HumanSkinsNames available in this build
  constructor(fs, skins = []) {
    this.fs = Object.assign({ hc: META.startHC, pets: {}, triedPet: false, bike: 0, triedBike: false, onBike: false,
      piggy: 0, piggyLvl: 0, skin: 'BasePlayer', skins: [] }, fs || {});
    this.pool = skins;
    this.events = [];
  }

  // ---- diamonds ----
  spend(n) { if (this.fs.hc < n) return false; this.fs.hc -= n; this.events.push({ type: 'hc', d: -n }); return true; }
  add(n) { this.fs.hc += n; this.events.push({ type: 'hc', d: n }); }

  // ---- pets (PetsSpot / PopupPetsSpot): first card click is a free 1 h trial, then 50 HC for 5 h; wall clock ----
  hasPet(id, now = Date.now()) { return (this.fs.pets[id] || 0) > now; }
  petLeft(id, now = Date.now()) { return Math.max(0, (this.fs.pets[id] || 0) - now); }
  petOffer() { return this.fs.triedPet ? { kind: 'rent', hours: META.petRentHours, hc: META.petRentHC } : { kind: 'trial', hours: META.petTrialHours, hc: 0 }; }
  getPet(id, now = Date.now()) {
    if (!PETS.includes(id)) return false;
    const o = this.petOffer();
    if (o.hc && !this.spend(o.hc)) return false;
    this.fs.triedPet = true;
    this.fs.pets[id] = Math.max(now, this.fs.pets[id] || 0) + o.hours * H;
    this.events.push({ type: 'pet', id, kind: o.kind });
    return true;
  }

  // ---- bike (BikeSpot / BikeTrialPopup): free 1 h once, then 50 HC for 5 h; HUD button mounts / dismounts ----
  hasBike(now = Date.now()) { return this.fs.bike > now; }
  bikeOffer() { return this.fs.triedBike ? { kind: 'rent', hours: META.bikeRentHours, hc: META.bikeRentHC } : { kind: 'trial', hours: META.bikeTrialHours, hc: 0 }; }
  getBike(now = Date.now()) {
    const o = this.bikeOffer();
    if (o.hc && !this.spend(o.hc)) return false;
    this.fs.triedBike = true;
    this.fs.bike = Math.max(now, this.fs.bike) + o.hours * H;
    this.fs.onBike = true;
    this.events.push({ type: 'bike', kind: o.kind });
    return true;
  }
  toggleBike(now = Date.now()) {
    if (!this.hasBike(now)) return false;
    this.fs.onBike = !this.fs.onBike;
    this.events.push({ type: 'bikeToggle', on: this.fs.onBike });
    return true;
  }

  // ---- piggy bank: +5 HC per parcel unlock, cap 600 + 150 * level, Ready above 360 ----
  piggyCap() { return Math.floor(META.piggySecond + (META.piggyEvolution - 1) * this.fs.piggyLvl * META.piggySecond); }
  piggyReady() { return this.fs.piggy > META.piggyFirst; }
  addPiggy(n) { this.fs.piggy += Math.max(0, Math.min(n, this.piggyCap() - this.fs.piggy)); }
  crackPiggy() {
    if (!this.piggyReady()) return 0;
    const n = this.fs.piggy;
    this.fs.piggy = 0; this.fs.piggyLvl += 1;
    this.add(n);
    this.events.push({ type: 'piggy', n });
    return n;
  }

  // ---- skins (SkinSelector.UnlockRandom): HC price round5(min(300, 40 + 8 * owned)), uniform among locked ids ----
  skinPrice() { return Math.round(Math.min(META.skinMax, META.skinStep * this.fs.skins.length + META.skinStart) / 5) * 5; }
  lockedSkins() { return this.pool.filter(id => !this.fs.skins.includes(id)); }
  rollSkin(rng = Math.random) {
    const locked = this.lockedSkins();
    if (!locked.length || !this.spend(this.skinPrice())) return null;
    const id = locked[Math.floor(rng() * locked.length)];
    this.fs.skins.push(id);
    this.fs.skin = id;
    this.events.push({ type: 'skin', id });
    return id;
  }
  selectSkin(id) { if (id === 'BasePlayer' || this.fs.skins.includes(id)) { this.fs.skin = id; return true; } return false; }

  // modifiers the Farm applies this frame
  mods(now = Date.now()) {
    return { coin: this.hasPet('Cat', now) ? META.catCoin : 1, barn: this.hasPet('Dog', now) ? META.dogBarn : 1,
      speed: this.hasBike(now) && this.fs.onBike ? META.bikeSpeed : 1 };
  }
}
