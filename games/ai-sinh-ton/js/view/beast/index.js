// The beast builder (SCOPE section 6): every beast form is made from code on one shared kit.
//   buildBeast({ id, form, branch }, opts) -> Beast
//   Beast = { root: THREE.Group, height, update(state, dt), setPose(name), dispose() }
//   state = { anim: 'idle'|'run'|'attack'|'cast'|'ult'|'hit'|'stun'|'die'|'evolve', animT, move, speed, air, face }
// This placeholder draws a coloured blob so callers can be wired before the kit exists; W-creature replaces it.
const THREE = window.THREE;

export const formKey = (id, form = 1, branch = null) => `${id}.${form}${form === 3 && branch ? branch : ''}`;

export function buildBeast(spec, opts = {}) {
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshStandardMaterial({ color: opts.color || 0xc0a070 }));
  m.position.y = 0.45; root.add(m);
  return { root, height: 0.9, key: formKey(spec.id, spec.form, spec.branch), update() {}, setPose() {}, dispose() { m.geometry.dispose(); m.material.dispose(); } };
}
