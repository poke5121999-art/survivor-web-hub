// Beast models for the UI: portraits on cards, the HUD and gacha, and the big turning model of the beast and equipment
// pages, all from the shared builder at the form the account owns (acc.heroes[id].form / .branch, default 1 / none).
import { buildBeast } from '../view/beast/index.js?v=20261124a';

export const beastSpec = (meta, id) => { const h = (meta && meta.acc.heroes[id]) || {}; return { id, form: h.form || 1, branch: h.branch || null }; };

// a beast standing on its own group, idling; `turn` spins it slowly unless the caller drives rotation itself
export function beastModel(meta, id, opts = {}) {
  const b = buildBeast(beastSpec(meta, id), { lod: 'portrait', ...opts });
  const st = { anim: 'idle', animT: 0, move: 'walk', speed: 0, air: 0, face: 0 };
  return {
    root: b.root, beast: b,
    update(dt) { st.animT += dt; b.update(st, dt); },
    dispose() { b.dispose(); },
  };
}

// the kit's portrait hook: ui.portrait(id) calls this for its model
export function installBeastPortraits(ui, meta) { ui.portraitModel = (id) => beastModel(meta, id); }
