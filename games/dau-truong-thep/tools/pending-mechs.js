// Newer tanks that already have a style row (js/gfx/styles.js) but no sim entry in data.js yet. The look tools fill a
// stand-in MECHS entry for them (the sim data of the chassis they borrowed, with their own role from
// dtt-kits-SCOPE.md section 1) so their models can be built and shot before the sim lands. Real entries always win.
'use strict';
const ROLE = { dieuthuyen: 'control', thuytinh: 'control', samthep: 'control', cuuvi: 'trickster', kiemthan: 'bruiser',
  suatrang: 'support', khidot: 'tank', retdo: 'bruiser', nhenthep: 'flanker', taothao: 'bruiser', bongua: 'flanker',
  moclan: 'bruiser', anduong: 'sniper', chuottui: 'support', vesau: 'support' };

// Fill MECHS in place (Node side or in the page, same code) and return the keys that were missing.
function fillPending(MECHS, STYLES, BOSSES, role) {
  const added = [];
  for (const k of Object.keys(STYLES)) {
    if (MECHS[k] || (BOSSES && BOSSES[k])) continue;
    const base = MECHS[STYLES[k].chassis] || MECHS.soi;
    MECHS[k] = Object.assign(JSON.parse(JSON.stringify(base)), { roleKey: role[k] || base.roleKey, tint: STYLES[k].body, hover: !!(STYLES[k].frame && STYLES[k].frame.move === 'hover') || base.hover });
    added.push(k);
  }
  return added;
}

module.exports = { ROLE, fillPending, fillSrc: fillPending.toString() };
