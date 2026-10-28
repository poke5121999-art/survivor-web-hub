// Lazy loading of customization art (tools/build_custom.py): data/custom.json, one art/skins/<asset>.webp per skin,
// art/ropes.webp and the shop icons art/custom-ui.webp. Nothing here is fetched until a non-default item is equipped
// or a menu that shows these items is opened.

// A skin ready to draw: frames {spriteName: [img, rect]} with rect = [x, y, w, h, pivotX, pivotY, ppu].
// Effect variants bake their material ops (fx.js, loaded only for them) into one canvas per frame.
async function frames(img, sheet, ops) {
  const out = {};
  const { bake } = ops ? await import('./fx.js') : {};
  for (const [name, r] of Object.entries(sheet)) {
    if (!ops) { out[name] = [img, r]; continue; }
    const { canvas, pad } = bake(img, r, ops);
    out[name] = [canvas, [0, 0, canvas.width, canvas.height, r[4] + pad, r[5] + pad, r[6]]];
  }
  return out;
}

export function makeCustom(json, image) {
  let data = null;
  const cache = new Map();
  const once = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };
  const lib = {
    data: () => once('data', () => json('./data/custom.json').then((d) => (data = d))),
    // item: a Meta item of kind 'skins'; resolves to {frames, states, dance}
    skin: (it) => once('skin:' + it.id, async () => {
      const d = await lib.data();
      const s = d.skins[it.asset];
      const img = await image('./art/skins/' + it.asset + '.webp');
      return { id: it.id, frames: await frames(img, s.sheet, it.fx), states: s.states, dance: s.dance };
    }),
    ropes: () => once('ropes', () => image('./art/ropes.webp')),
    icons: () => once('icons', () => Promise.all([lib.data(), image('./art/custom-ui.webp')]).then(([d, img]) => ({ rects: d.icons, img }))),
    get loaded() { return data; },
  };
  return lib;
}
