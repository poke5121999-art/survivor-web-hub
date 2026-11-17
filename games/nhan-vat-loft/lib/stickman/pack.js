// Compact text form of a part's integer grids (ring radii, plate heights, colour runs): each value is the delta from
// the same column one row up, zigzagged and written as base-64 varint characters (5 data bits + a continue bit).
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function packInts(vals) {
  let s = '';
  for (const v of vals) { let z = v < 0 ? -2 * v - 1 : 2 * v; do { const d = z & 31; z = Math.floor(z / 32); s += A[d | (z ? 32 : 0)]; } while (z); }
  return s;
}
export function unpackInts(s) {
  const out = []; let z = 0, m = 1;
  for (const ch of s) { const d = A.indexOf(ch); z += (d & 31) * m; if (d & 32) m *= 32; else { out.push(z & 1 ? -(z + 1) / 2 : z / 2); z = 0; m = 1; } }
  return out;
}
const packGrid = (rows) => { const w = rows[0].length, flat = []; rows.forEach((r, i) => r.forEach((x, j) => flat.push(x - (i ? rows[i - 1][j] : 0)))); return w + ':' + packInts(flat); };
const unpackGrid = (s) => { const k = s.indexOf(':'), w = +s.slice(0, k), f = unpackInts(s.slice(k + 1)), rows = []; for (let i = 0; i < f.length / w; i++) rows.push(f.slice(i * w, i * w + w).map((x, j) => x + (i ? rows[i - 1][j] : 0))); return rows; };
// stations are evenly spaced, so a ring loft keeps [first, last, count] instead of the list
export function pack(L) {
  const o = { ...L };
  if (L.st) { o.st = [L.st[0], L.st[L.st.length - 1], L.st.length]; o.r = packGrid(L.r); }
  if (L.top) { o.top = packGrid(L.top); o.bot = packGrid(L.bot); }
  if (L.rle) o.rle = packInts(L.rle.map((x, k) => (k % 2 ? x + 1 : x)));
  return o;
}
export function unpack(L) {
  if (typeof (L.r || L.top || L.rle) !== 'string' && typeof L.rle !== 'string') return L;
  const o = { ...L };
  if (typeof L.r === 'string') { const [a, b, n] = L.st; o.st = Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1)); o.r = unpackGrid(L.r); }
  if (typeof L.top === 'string') { o.top = unpackGrid(L.top); o.bot = unpackGrid(L.bot); }
  if (typeof L.rle === 'string') o.rle = unpackInts(L.rle).map((x, k) => (k % 2 ? x - 1 : x));
  return o;
}
