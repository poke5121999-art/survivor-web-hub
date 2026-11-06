// UnityEvent dispatch. Every persistent call in data/components.json is {target "@path#Type", type, method, mode, arg}.
// Built-in Unity / DOTween methods resolve through HANDLERS ("Type.Method"); calls on the game's own MonoBehaviours go
// to the component instance (game.component(path, Type)) when it has a method of that name. Unknown pairs log once.
import { parseRef, shortType } from './unity.js';

const UI_ROOT = 'CF2-Rig/'; // the HUD canvas lives in the Controller scene under CF2-Rig; ui.js paths start at CF2-Canvas

const HANDLERS = {
  'GameObject.SetActive': (g, path, on) => g.setActive(path, on),
  'ParticleSystem.Play': (g, path) => g.particle(path),
  'Collider.set_isTrigger': (g, path, on) => g.triggers.setIsTrigger(path, on),
  'DOTweenAnimation.DOPlay': (g, path) => g.tween(path, 'play'),
  'DOTweenAnimation.DORestart': (g, path) => g.tween(path, 'restart'),
  'DOTweenAnimation.DOKill': (g, path) => g.tween(path, 'kill'),
  'DOTweenAnimation.DOPlayById': (g, path, id) => g.tween(path, 'playById', id),
};

const warned = new Set();
function warnOnce(key, e) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[fish-bowl] no handler for ${key}`, e.target);
}

export class Events {
  constructor(game) { this.game = game; }

  run(list) { for (const e of list || []) this.call(e); }

  call(e) {
    const ref = parseRef(e.target);
    if (!ref || !e.method) return;
    const type = shortType(e.type);
    const key = `${type}.${e.method}`;
    const arg = this.arg(e);
    if (ref.path.startsWith(UI_ROOT)) return this.game.uiCall(ref.path.slice(UI_ROOT.length), key, arg);
    const h = HANDLERS[key];
    if (h) return h(this.game, ref.path, arg);
    const inst = this.game.component(ref.path, type);
    if (inst && typeof inst[e.method] === 'function') return inst[e.method](arg);
    warnOnce(key, e);
  }

  // PersistentListenerMode: 1 void, 2 object, 3 int, 4 float, 5 string, 6 bool
  arg(e) {
    if (e.mode !== 2) return e.mode === 1 ? undefined : e.arg;
    const r = parseRef(e.arg);
    if (!r) return null;
    const t = shortType(r.type);
    if (!t || t === 'Transform' || t === 'GameObject') return this.game.find(r.path);
    if (t === 'HintString') return this.game.comps[r.path]?.HintString?.hintSentence || '';
    return this.game.component(r.path, t) || { path: r.path, type: t };
  }
}
