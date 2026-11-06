// State replication: the host keeps the last state it sent as a plain JSON tree and sends only what changed.
// Patch shape (all recursive):
//   object  -> { key: patch, ... , $d: [deleted keys] }
//   array   -> { $a: { index: patch }, $n: length }        plain arrays, by index
//   keyed   -> { $k: [ids in order], $a: { id: patch } }    arrays whose every item has an `id`, so a customer leaving
//                                                           does not resend everyone behind it
//   leaf    -> value, or { $: value } when the value is itself an object or array
// Floats are rounded to 1/100 before comparing, which is finer than anything the view draws and keeps slow timers
// from sending every tick. Sets become { member: 1 } so adding one name does not resend the whole set.

const ROUND = 100;
const DROP = new Set(['path']);   // agent paths: the view never reads them, and they change on every repath

export function plain(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : (Number.isFinite(v) ? Math.round(v * ROUND) / ROUND : (v > 0 ? 1e9 : -1e9));
  if (v == null || typeof v !== 'object') return v;
  if (v instanceof Set) { const o = {}; for (const k of v) o[k] = 1; return { $set: o }; }
  if (Array.isArray(v)) return v.map(plain);
  const o = {};
  for (const k of Object.keys(v)) {
    if (DROP.has(k)) continue;
    const x = v[k];
    if (typeof x === 'function' || x === undefined) continue;
    o[k] = plain(x);
  }
  return o;
}

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
const keyed = a => a.length > 0 && a.every(x => isObj(x) && x.id != null);

const whole = v => (v != null && typeof v === 'object' ? { $: v } : v);

// Returns undefined when equal.
export function diff(a, b) {
  if (a === b) return undefined;
  if (typeof a !== typeof b || a == null || b == null || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return whole(b);
  if (Array.isArray(b)) {
    if (keyed(b) && (a.length === 0 || keyed(a))) {
      const old = new Map(a.map(x => [x.id, x]));
      const ch = {};
      let any = a.length !== b.length || a.some((x, i) => x.id !== b[i].id);
      for (const x of b) {
        const d = old.has(x.id) ? diff(old.get(x.id), x) : whole(x);
        if (d !== undefined) { ch[x.id] = d; any = true; }
      }
      return any ? { $k: b.map(x => x.id), $a: ch } : undefined;
    }
    const ch = {};
    let any = a.length !== b.length;
    for (let i = 0; i < b.length; i++) {
      const d = i < a.length ? diff(a[i], b[i]) : whole(b[i]);
      if (d !== undefined) { ch[i] = d; any = true; }
    }
    return any ? { $a: ch, $n: b.length } : undefined;
  }
  const out = {};
  let any = false;
  for (const k of Object.keys(b)) {
    const d = k in a ? diff(a[k], b[k]) : whole(b[k]);
    if (d !== undefined) { out[k] = d; any = true; }
  }
  const gone = Object.keys(a).filter(k => !(k in b));
  if (gone.length) { out.$d = gone; any = true; }
  return any ? out : undefined;
}

// Applies a patch to a plain tree and returns the new value (objects and arrays are updated in place).
export function apply(t, p) {
  if (p == null || typeof p !== 'object') return p;
  if ('$' in p) return p.$;
  if ('$k' in p) {
    const old = new Map((Array.isArray(t) ? t : []).map(x => [x.id, x]));
    return p.$k.map(id => (id in p.$a ? apply(old.get(id), p.$a[id]) : old.get(id)));
  }
  if ('$a' in p) {
    const arr = Array.isArray(t) ? t : [];
    arr.length = p.$n;
    for (const i of Object.keys(p.$a)) arr[i] = apply(arr[i], p.$a[i]);
    return arr;
  }
  const o = isObj(t) ? t : {};
  for (const k of Object.keys(p)) {
    if (k === '$d') continue;
    o[k] = apply(o[k], p[k]);
  }
  if (p.$d) for (const k of p.$d) delete o[k];
  return o;
}

// Plain tree back to live values: { $set } -> Set.
export function live(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(live);
  if (v.$set) return new Set(Object.keys(v.$set));
  const o = {};
  for (const k of Object.keys(v)) o[k] = live(v[k]);
  return o;
}

// Copies `src` into `dst` keeping dst's object identities where both are objects (the view holds references into
// sim.state between frames).
export function assignDeep(dst, src) {
  for (const k of Object.keys(dst)) if (!(k in src)) delete dst[k];
  for (const k of Object.keys(src)) {
    const s = src[k], d = dst[k];
    if (isObj(s) && isObj(d) && !(s instanceof Set) && !(d instanceof Set)) assignDeep(d, s);
    else dst[k] = s;
  }
  return dst;
}
