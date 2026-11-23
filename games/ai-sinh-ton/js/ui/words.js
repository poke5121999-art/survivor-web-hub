// The game's heroes are beasts now. Lines that come from the rule modules (guide steps, unlock names, refusals) still say
// "tướng" until their owners rewrite them; every such line passes through here on its way to the screen.
export const beastWords = (s) => (typeof s === 'string' ? s.replace(/tướng/g, 'thú').replace(/Tướng/g, 'Thú').replace(/TƯỚNG/g, 'THÚ') : s);
