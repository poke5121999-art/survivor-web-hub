// JSON helpers matching FG.Meta Core/Json.cs: the writer's escaping, C# float "R" formatting,
// and JsonNode's lenient typed getters (wrong type or missing key = default).

export class FormatError extends Error {
  constructor(message) { super(message); this.name = 'FormatException'; }
}

const F32_VIEW = new DataView(new ArrayBuffer(4));
const pow = (b, n) => b ** BigInt(n);

/**
 * Shortest decimal digits that read back to the same float32, decided exactly in BigInt (no parse,
 * so no double rounding): the fewest digits inside the rounding interval, closest to x, ties to an
 * even last digit (.NET Dragon4). Returns { digits, scale } with value = 0.d1d2... * 10^scale.
 */
function shortestFloatDigits(x) {
  F32_VIEW.setFloat32(0, x);
  const bits = F32_VIEW.getUint32(0);
  const expField = (bits >>> 23) & 0xff, frac = bits & 0x7fffff;
  const m = BigInt(expField === 0 ? frac : frac | 0x800000);
  const e = expField === 0 ? -149 : expField - 150;
  // the gap below is half as wide at a power of two (except the smallest normal)
  const lopsided = frac === 0 && expField > 1;
  const evenMantissa = (m & 1n) === 0n;
  for (let p = 1; p <= 9; p++) {
    const [mant, ex] = x.toExponential(p - 1).split('e');
    const exp10 = Number(ex);
    const k = exp10 - (p - 1);
    const p2 = Math.max(0, 2 - e), p10 = Math.max(0, -k);
    const xs = m * pow(2n, e + p2) * pow(10n, p10);
    const hiHalf = pow(2n, e - 1 + p2) * pow(10n, p10);
    const loHalf = lopsided ? pow(2n, e - 2 + p2) * pow(10n, p10) : hiHalf;
    const base = BigInt(mant.replace('.', ''));
    let best = null;
    for (const cand of [base - 1n, base, base + 1n]) {
      if (cand <= 0n) continue;
      const cs = cand * pow(10n, k + p10) * pow(2n, p2);
      const d = cs - xs;
      const inside = d >= 0n ? (evenMantissa ? d <= hiHalf : d < hiHalf) : (evenMantissa ? -d <= loHalf : -d < loHalf);
      if (!inside) continue;
      const dist = d < 0n ? -d : d;
      if (best === null || dist < best.dist || (dist === best.dist && (cand & 1n) === 0n)) best = { cand, dist };
    }
    if (best) {
      const s = best.cand.toString();
      // a carry (9.99 -> 10.0) adds a digit
      return { digits: s.replace(/0+$/, ''), scale: exp10 + 1 + (s.length - p) };
    }
  }
  throw new Error('float format: no round-trip digits for ' + x);
}

/** float.ToString("R", InvariantCulture) of .NET Core 3.0+ for a float32 value. */
export function formatFloat(v) {
  const x = Math.fround(v);
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'Infinity';
  if (x === -Infinity) return '-Infinity';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const neg = x < 0;
  const { digits, scale } = shortestFloatDigits(Math.abs(x));
  // .NET switches to E notation past max(digit count, 9) integer digits for a float
  const maxDigits = Math.max(digits.length, 9);
  let out = '';
  let digPos = scale;
  let scientific = false;
  if (digPos > maxDigits || digPos < -3) { digPos = 1; scientific = true; }
  let i = 0;
  if (digPos > 0) {
    do { out += i < digits.length ? digits[i++] : '0'; } while (--digPos > 0);
  } else out += '0';
  if (i < digits.length || digPos < 0) {
    out += '.';
    while (digPos < 0) { out += '0'; digPos++; }
    while (i < digits.length) out += digits[i++];
  }
  if (scientific) {
    const e = scale - 1;
    out += 'E' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
  }
  return (neg ? '-' : '') + out;
}

/** JsonWriter.Str escaping. */
export function quote(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = s.charCodeAt(i);
    if (c === '"') out += '\\"';
    else if (c === '\\') out += '\\\\';
    else if (c === '\n') out += '\\n';
    else if (c === '\r') out += '\\r';
    else if (c === '\t') out += '\\t';
    else if (code < 0x20) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += c;
  }
  return out + '"';
}

/** Marks a number to be written as a C# float. */
export class F32 {
  constructor(v) { this.v = Math.fround(v); }
}

export const f32 = v => new F32(v);

/**
 * Writes plain values the way JsonWriter does: objects keep insertion order, numbers are ints/longs,
 * F32 wraps floats, strings use JsonWriter escaping. undefined object fields are skipped.
 */
export function writeJson(v) {
  if (v === null || v === undefined) return 'null';
  if (v instanceof F32) return formatFloat(v.v);
  switch (typeof v) {
    case 'boolean': return v ? 'true' : 'false';
    case 'number': return String(v);
    case 'bigint': return v.toString();
    case 'string': return quote(v);
  }
  if (Array.isArray(v)) return '[' + v.map(writeJson).join(',') + ']';
  const parts = [];
  for (const k of Object.keys(v)) {
    if (v[k] === undefined) continue;
    parts.push(quote(k) + ':' + writeJson(v[k]));
  }
  return '{' + parts.join(',') + '}';
}

/** Parses JSON text; FormatException on bad input (JsonNode.Parse also skips a BOM). */
export function parseJson(text) {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw new FormatError('json: ' + e.message);
  }
}

// ---- JsonNode typed getters on parsed values

const isObj = n => n !== null && typeof n === 'object' && !Array.isArray(n);

export function field(n, key) {
  if (!isObj(n) || !Object.prototype.hasOwnProperty.call(n, key)) return undefined;
  return n[key];
}

const num = (n, key) => { const v = field(n, key); return typeof v === 'number' ? v : undefined; };

/** C# (int)double: truncate toward zero. */
export function toInt(d) { return Math.trunc(d) | 0; }

export function getI(n, key, def = 0) { const v = num(n, key); return v === undefined ? def : toInt(v); }
export function getL(n, key, def = 0) { const v = num(n, key); return v === undefined ? def : Math.trunc(v); }
export function getF(n, key, def = 0) { const v = num(n, key); return v === undefined ? def : Math.fround(v); }
export function getB(n, key, def = false) { const v = field(n, key); return typeof v === 'boolean' ? v : def; }
export function getS(n, key, def = null) { const v = field(n, key); return typeof v === 'string' ? v : def; }

export function getInts(n, key) {
  const v = field(n, key);
  return Array.isArray(v) ? v.map(x => (typeof x === 'number' ? toInt(x) : 0)) : [];
}

export function getStrings(n, key) {
  const v = field(n, key);
  return Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : null)) : [];
}

export function isArray(v) { return Array.isArray(v); }
