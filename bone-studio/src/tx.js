// Copy-on-write transaction over a plain-JSON document. Never mutates the input; records an exact inverse.
export function transaction(doc) {
  let root = doc;
  const fresh = new WeakSet();
  const ops = [];
  const own = (o) => {
    if (fresh.has(o)) return o;
    const c = Array.isArray(o) ? o.slice() : { ...o };
    fresh.add(c);
    return c;
  };
  const get = (path) => path.reduce((o, k) => (o == null ? undefined : o[k]), root);
  const has = (path) => {
    const parent = get(path.slice(0, -1));
    return parent != null && typeof parent === "object" && Object.prototype.hasOwnProperty.call(parent, path[path.length - 1]);
  };
  function parentFor(path) {
    root = own(root);
    let o = root;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (o[k] == null) {
        ops.push({ path: path.slice(0, i + 1), had: false });
        o[k] = typeof path[i + 1] === "number" ? [] : {};
        fresh.add(o[k]);
      } else o[k] = own(o[k]);
      o = o[k];
    }
    return o;
  }
  return {
    get, has,
    set(path, value) {
      ops.push({ path, had: has(path), value: get(path) });
      parentFor(path)[path[path.length - 1]] = value;
    },
    del(path) {
      if (!has(path)) return;
      ops.push({ path, had: true, value: get(path) });
      const p = parentFor(path), k = path[path.length - 1];
      if (Array.isArray(p)) throw new Error("tx.del trên phần tử mảng không đảo ngược được; hãy set cả mảng");
      delete p[k];
    },
    get doc() { return root; },
    inverse() { return ops.slice().reverse(); },
  };
}

// Applies recorded inverse ops; returns the new doc.
export function applyPatch(doc, ops) {
  const t = transaction(doc);
  for (const op of ops) {
    if (op.had) t.set(op.path, op.value);
    else t.del(op.path);
  }
  return { doc: t.doc, inverse: t.inverse() };
}
