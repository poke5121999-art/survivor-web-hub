// The look of a beast's skills: its element's colours and how far it has evolved. Form 1 keeps the beast's own colour
// near the element's; form 2 burns hotter and grows; form 3 turns to the element's awakened colour (a second hue), with
// branch b on its own variant. Everything that sizes or counts an effect reads `tier` from here, so a form-2 cast is
// bigger and denser than form 1 by the same factors everywhere.

// element of each beast, also under the id of the human hero it replaced (the roster before Addendum 10 still runs)
const ELEMENT_OF = {
  tegiap: 'dat', nhim: 'bang', loc: 'moc', chon: 'gio', ech: 'lua', cu: 'gio', duoi: 'bang', kyda: 'lua', oc: 'moc',
  haily: 'dat', bosat: 'set', bao: 'set', nhen: 'moc', muc: 'moc',
  thep: 'dat', mua: 'bang', yta: 'moc', gio: 'gio', phao: 'lua', bong: 'gio', bang: 'bang', hoa: 'lua', doc: 'moc',
  ky: 'dat', sam: 'set', soi: 'set',
};

// [core, edge, deep] per element and form; form 3 per branch (a is also the unbranched form 3)
const ELEMENT = {
  dat: { 1: [0xfff0c8, 0xe0a040, 0x6a4a26], 2: [0xffe8d0, 0xff6a28, 0x5a1a06], a: [0xe8ffd8, 0x58d890, 0x1e5a3a], b: [0xfff0f0, 0xd87858, 0x5a2418] },
  lua: { 1: [0xffe8a0, 0xff6a20, 0x7a1a06], 2: [0xf0f6ff, 0xffb020, 0x6a1a04], a: [0xfff4d0, 0xff8a30, 0x3a1206], b: [0xe8f0ff, 0xff5aa0, 0x5a0a3a] },
  bang: { 1: [0xf0fbff, 0x78c8ff, 0x1a4a7a], 2: [0xf0fffc, 0x40e0e8, 0x0a3a5a], a: [0xf4f0ff, 0x9a8aff, 0x2a1a6a], b: [0xf4f0ff, 0x9a8aff, 0x2a1a6a] },
  gio: { 1: [0xeefff8, 0x58e0c0, 0x105a4a], 2: [0xf4fff0, 0x90f060, 0x1a4a1a], a: [0xf8f0ff, 0xb88aff, 0x3a1a7a], b: [0xf8f0ff, 0xb88aff, 0x3a1a7a] },
  set: { 1: [0xfffce0, 0xffd838, 0x7a5a06], 2: [0xffffff, 0x9ad8ff, 0x1a3a8a], a: [0xffffff, 0xb070ff, 0x3a0a8a], b: [0xfff8e8, 0xffa040, 0x6a3a0a] },
  moc: { 1: [0xf0ffd8, 0x78d848, 0x1e5a14], 2: [0xfffbe0, 0xf0d040, 0x5a4a0a], a: [0xfff6d8, 0xffc858, 0x6a4a0a], b: [0xffe0ea, 0xd8306a, 0x4a0a1e] },
};
// beasts whose skill colour is their own, not their element's (ink is not green, a shadow owl is not teal)
const OWN = {
  muc: { 1: [0xf2ecff, 0x8a6aff, 0x24145a], 2: [0xf0f4ff, 0x5a7aff, 0x101a5a], a: [0xfff6d8, 0x6a5aff, 0x0a0a3a], b: [0xfff6d8, 0x6a5aff, 0x0a0a3a] },
  cu: { 1: [0xf6eaff, 0xa070ff, 0x2a0a5a], 2: [0xfae8ff, 0xc050ff, 0x3a0a5a], a: [0xfff4d8, 0xe0b0ff, 0x1a0a3a], b: [0xfff4d8, 0xe0b0ff, 0x1a0a3a] },
  bong: { 1: [0xf6eaff, 0xa070ff, 0x2a0a5a], 2: [0xfae8ff, 0xc050ff, 0x3a0a5a], a: [0xfff4d8, 0xe0b0ff, 0x1a0a3a], b: [0xfff4d8, 0xe0b0ff, 0x1a0a3a] },
};
// form scale of size, count and lifetime
const TIER = { 1: { size: 1, count: 1, life: 1 }, 2: { size: 1.25, count: 1.45, life: 1.15 }, 3: { size: 1.5, count: 1.9, life: 1.3 } };

const C = new (window.THREE.Color)(); const C2 = new (window.THREE.Color)();
const mix = (a, b, t) => C.setHex(a).lerp(C2.setHex(b), t).getHex();

// a unit (sim unit, live or a plain { kind, def }) -> { el, form, branch, tier, core, edge, deep, glow }
export function skinOf(u, color) {
  const def = (u && u.def) || {};
  const id = (u && u.kind) || def.id;
  const el = def.element || ELEMENT_OF[id] || 'dat';
  const form = Math.max(1, Math.min(3, def.form || 1));
  const branch = form === 3 ? def.branch || 'a' : null;
  const P = OWN[id] || ELEMENT[el] || ELEMENT.dat;
  const p = form === 3 ? P[branch] || P.a : P[form];
  // form 1 leans toward the beast's own colour so a team of one element still tells its members apart
  const own = color != null ? color : def.color;
  const edge = form === 1 && own != null && !OWN[id] ? mix(p[1], own, 0.45) : p[1];
  return { el, form, branch, tier: TIER[form], core: p[0], edge, deep: p[2], glow: mix(edge, p[0], 0.4), key: id + '.' + form + (branch || '') };
}

export const ELEMENTS = Object.keys(ELEMENT);
export { ELEMENT_OF, TIER, mix as mixHex };
