// A role's pack (PackItemData): items of any wood type in one ordered stack, capacity counted over all of them
// together (rules/chop-carry.md C2-C3). Currencies never sit in a pack in this build: they go to the wallet.
export class Pack {
  constructor(max, items = []) {
    this.max = max;
    this.items = items;
  }

  get count() { return this.items.length; }
  get full() { return this.max >= 0 && this.items.length >= this.max; }
  get room() { return this.max < 0 ? Infinity : Math.max(0, this.max - this.items.length); }
  has(type) { return this.items.includes(type); }
  countOf(type) { return this.items.reduce((n, t) => n + (t === type), 0); }

  add(type) {
    if (this.full) return false;
    this.items.push(type);
    return true;
  }

  // Takes the topmost item of a type (the stack on the back pops from the top).
  take(type) {
    const i = this.items.lastIndexOf(type);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }
}
