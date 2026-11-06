// Lazy loading of customization art (tools/build_custom.py): data/custom.json, one art/skins/<asset>.webp per skin,
// art/ropes.webp and the shop icons art/custom-ui.webp. Nothing here is fetched until a non-default item is equipped
// or a menu that shows these items is opened.

// A skin ready to draw: frames {spriteName: [img, rect]} with rect = [x, y, w, h, pivotX, pivotY, ppu].
// Effect variants go through fx.js (loaded only for them): static material ops baked once per frame, animated ones
// (art/fx/anim.json, by item id) redrawn on read; `fx` then says which ({animated, ops, anim, render, sample}).
export function makeCustom(json, image) {
  let data = null;
  const cache = new Map();
  const once = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };
  const lib = {
    data: () => once('data', () => json('./data/custom.json').then((d) => (data = d))),
    // animated effect ops of every effect skin; an old deploy without the file leaves them static
    anim: () => once('anim', () => json('./art/fx/anim.json').catch(() => ({}))),
    // item: a Meta item of kind 'skins'; resolves to {frames, states, dance, fx?}
    skin: (it) => once('skin:' + it.id, async () => {
      const d = await lib.data();
      const s = d.skins[it.asset];
      const img = await image('./art/skins/' + it.asset + '.webp');
      if (!it.fx) {
        const frames = {};
        for (const [name, r] of Object.entries(s.sheet)) frames[name] = [img, r];
        return { id: it.id, frames, states: s.states, dance: s.dance };
      }
      const [{ skinFrames }, anim] = await Promise.all([import('./fx.js'), lib.anim()]);
      const { frames, fx } = await skinFrames(img, s.sheet, it.fx, anim[it.id] || null, image);
      return { id: it.id, frames, states: s.states, dance: s.dance, fx };
    }),
    ropes: () => once('ropes', () => image('./art/ropes.webp')),
    icons: () => once('icons', () => Promise.all([lib.data(), image('./art/custom-ui.webp')]).then(([d, img]) => ({ rects: d.icons, img }))),
    get loaded() { return data; },
  };
  return lib;
}
