import row1 from './row1.js';
import row2 from './row2.js';
import row3 from './row3.js';
import guns from './guns.js';
import tools from './tools.js';
import traced from './traced.js';
// Reference-cell order (cell 01..72); weapons traced from the sheet replace the hand-built ones at their cell slot.
const ORDER = ['cleaver-saw', 'pruning-saw', 'sickle', 'utility-knife-red', 'kitchen-knife', 'dagger', 'knife-green', 'meat-tenderiser', 'boning-knife-teal', 'chef-knife', 'big-cleaver', 'fillet-knife', 'boning-knife-long', 'thrower-slim', 'thrower-slot', 'thrower-hex',
  'bat-nails-tape', 'bat-saw-blade', 'bat-wire', 'sledgehammer-tape', 'gear-hammer', 'pipe-wrench-club', 'valve-mace', 'katana-red', 'katana-dark', 'katana-hook', 'saw-axe', 'fire-axe', 'pickaxe-rust', 'wrench-giant', 'chainsaw-sword', 'ladder-saw',
  'thrower-teal-hex', 'thrower-teal-slim', 'knife-brown-wrap', 'knife-red-bands', 'knife-orange-wrap', 'hatchet-red', 'hatchet-orange', 'karambit', 'knife-small-blue', 'kukri', 'machete', 'sharpening-steel', 'knife-teal-thin', 'multitool-red', 'kunai-green', 'kunai-purple', 'frying-pan-nails', 'stop-sign-shield', 'tray-shield',
  'rifle-side-fold', 'ak-taped', 'shovel-rifle', 'shotgun-pump-tape', 'smg-fold-stock', 'machine-pistol-a', 'machine-pistol-b'];
const all = Object.fromEntries([...row1, ...row2, ...row3, ...guns, ...traced].map((w) => [w.id, w]));
export const weapons = [...ORDER.map((id) => all[id]), ...tools];
export const byId = Object.fromEntries(weapons.map((w) => [w.id, w]));
