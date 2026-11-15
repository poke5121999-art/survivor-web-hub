// All roster specs: the owner's 6x20 sheet (rows 1-6, ids rRcC) and the zombie sheet (z1..z10).
// Add a character: append a spec to the row file (see SKILL-NOTES.md, "Adding a character from the sheet").
import row1 from './row1.js';
import row2 from './row2.js';
import row3 from './row3.js';
import row4 from './row4.js';
import row5 from './row5.js';
import row6 from './row6.js';
import zombies from './zombies.js';
export const ROSTER = [...row1, ...row2, ...row3, ...row4, ...row5, ...row6];
export const ZOMBIES = zombies;
