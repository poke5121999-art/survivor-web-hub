// Voxel prototype switch (?vox=1). Without the flag this file only defines BZ.vox = { on: false } and nothing else loads.
// With it, main.js awaits BZ.vox.load() before the world is built; every module under js/vox/ registers itself here.
// Options: ?voxq=low|medium|high (voxel detail, defaults to the game's quality tier), ?voxhero=<id> (default mua),
// ?voxz=<type> (default walker), ?voxpost=0, ?voxaudio=0, ?voxanim=0, ?voxfx=0, ?voxstreet=0 switch one part off for bisecting.
const BZ = (window.BZ = window.BZ || {});
const P = BZ.params || Object.fromEntries(new URLSearchParams(location.search));
const V = (BZ.vox = { on: P.vox === '1', mods: {}, order: [], hero: P.voxhero || 'mua', ztype: P.voxz || 'walker', want: (k) => P['vox' + k] !== '0' });
// a module registers a factory; BZ.vox.make(G) runs them in load order and hangs each result on G.vox[name]
V.register = (name, make) => { V.mods[name] = make; if (!V.order.includes(name)) V.order.push(name); };
const FILES = ['voxelize', 'zombie', 'street', 'fx', 'audio', 'anim', 'post', 'ui'];
V.load = async () => {
  for (const f of FILES) {
    try { await import('./' + f + '.js?v=' + (document.querySelector('script[src*="vox/boot.js"]') || { src: '' }).src.split('v=')[1]); }
    catch (e) { console.error('[vox] module ' + f + ' failed to load', e); }
  }
};
V.make = (G) => {
  const X = { update(dt, rdt) { for (const k of V.order) { const m = X[k]; if (m && m.update) { try { m.update(dt, rdt); } catch (e) { if (!X._err) { X._err = 1; console.error('[vox] ' + k + '.update threw', e); } } } } } };
  G.vox = X;
  const tier = P.voxq || G.quality.name; X.q = tier === 'low' ? 'low' : tier === 'high' ? 'high' : 'medium'; X.low = X.q === 'low';
  for (const k of V.order) { try { X[k] = V.mods[k](G) || null; } catch (e) { console.error('[vox] ' + k + ' failed to start', e); } }
  return X;
};
