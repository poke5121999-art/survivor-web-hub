// The beasts and their forms (SCOPE section 3). heroDef(spec) resolves the def the sim fights with for a team entry
// { id, form, branch, ... }: the same shape as an entry of HEROES plus `move`, `passive`, `passives` (every passive up
// to this form, oldest first), `form`, `branch`, `look`, `atk0` (form-1 attack, what the ultimate charge is scaled by).
// A form builds on the one before: form 3 takes form 2's skill patches, then its own. An old hero id resolves through
// LEGACY_IDS, so a team or a test written with the human roster still fights.
import { HERO, LEGACY_IDS } from './heroes.js?v=20261122a';

export const FORM_MUL = [1, 1, 1.25, 1.6];
export const formKey = (id, form = 1, branch = null) => `${id}.${form}${form === 3 && branch ? branch : ''}`;
export const beastId = (id) => (HERO[id] ? id : LEGACY_IDS[id] || null);

// the form entry (F) of a beast, or null; form 3 of a branching beast needs its branch
export function formOf(id, form, branch) {
  const h = HERO[beastId(id)];
  if (!h || form < 2) return null;
  const f = h.forms[form - 1];
  if (!f) return null;
  if (f.branches) return f.branches[branch] || null;
  return f;
}
export const branchesOf = (id) => { const h = HERO[beastId(id)]; const f = h && h.forms[2]; return f && f.branches ? Object.keys(f.branches) : []; };
export const maxForm = (id) => { const h = HERO[beastId(id)]; return h ? h.forms.length : 0; };

const cache = new Map();
export function heroDef(spec) {
  const id = beastId(spec.id);
  if (!id) return undefined;
  const base = HERO[id];
  let form = Math.max(1, Math.min(base.forms.length, spec.form | 0 || 1));
  let branch = form === 3 && branchesOf(id).length ? (branchesOf(id).includes(spec.branch) ? spec.branch : branchesOf(id)[0]) : null;
  const key = formKey(id, form, branch);
  if (cache.has(key)) return cache.get(key);
  const def = { ...base, atk0: base.atk, form, branch, look: key, passives: [base.passive] };
  for (let k = 2; k <= form; k++) {
    const F = formOf(id, k, branch);
    for (const slot of ['attack', 's1', 's2', 'ult']) if (F.patch && F.patch[slot]) def[slot] = { ...def[slot], ...F.patch[slot] };
    if (F.move) def.move = F.move;
    if (F.passive) def.passives = [...def.passives, F.passive];
  }
  const F = formOf(id, form, branch);
  if (F) { def.formName = F.name; def.hp = Math.round(base.hp * F.mul); def.atk = Math.round(base.atk * F.mul * 100) / 100; }
  else def.formName = base.name;
  def.passive = def.passives[def.passives.length - 1];
  cache.set(key, Object.freeze(def));
  return def;
}
