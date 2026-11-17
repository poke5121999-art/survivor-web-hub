// Build any stickman part entry: rings along an axis (loft.mjs) or a two-sided height field (plate.mjs), packed or not.
import { buildLoft } from './loft.js';
import { buildPlate } from './plate.js';
import { unpack } from './pack.js';
export const buildPart = (L, weights) => { const U = unpack(L); return U.kind === 'plate' ? buildPlate(U, weights) : buildLoft(U, weights); };
export { unpack };
