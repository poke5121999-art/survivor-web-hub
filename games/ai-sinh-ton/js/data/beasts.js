// The beasts and their forms (SCOPE section 3). heroDef(spec) resolves the def the sim fights with for a
// team entry { id, form, branch, ... }: the same shape as an entry of HEROES plus `move` and `passive`.
import { HERO } from './heroes.js?v=20261122a';

export function heroDef(spec) {
  return HERO[spec.id];
}
