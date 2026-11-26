"use strict";
// Runtime for the C# -> JS translation (tools/xlate): .NET semantics the generated code relies on.

const $_ = { v: null };
const $DEFAULT = Symbol("default");

function $unsupported() { throw new Error("untranslated construct reached"); }
function $throw(e) { throw e; }

// Host-side access to a translated type's statics (the generated code uses the holder directly).
function $statics(T, names, cc) {
	for (const n of names) {
		Object.defineProperty(T, n, { configurable: true, get() { return cc()[n]; }, set(v) { cc()[n] = v; } });
	}
	T.$cctor = cc;
}

// ---- numbers ----
function $d2i(x) {
	if (x !== x || x >= 2147483648 || x < -2147483648) return -2147483648;
	return x < 0 ? Math.ceil(x) | 0 : Math.floor(x) | 0;
}
function $d2u(x) {
	if (x !== x) return 0;
	const t = Math.trunc(x);
	return t >>> 0;
}
function $round(x) {
	const f = Math.floor(x), d = x - f;
	if (d > 0.5) return f + 1;
	if (d < 0.5) return f;
	return (f % 2 === 0) ? f : f + 1;
}
function $roundMode(x, mode) {
	if (mode === 1) return x < 0 ? -Math.round(-x) : Math.round(x);
	return $round(x);
}
function $round2(x, digits) {
	const p = Math.pow(10, digits);
	return $round(x * p) / p;
}
function $round3(x, digits, mode) {
	const p = Math.pow(10, digits);
	return $roundMode(x * p, mode) / p;
}
function $ieeeRem(a, b) { return a - b * $round(a / b); }
function $dblEquals(a, b) { return a === b || (a !== a && b !== b); }
function $cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

// .NET Framework double.ToString(): "G" with 15 significant digits.
function $ds(x) {
	if (x !== x) return "NaN";
	if (x === Infinity) return "Infinity";
	if (x === -Infinity) return "-Infinity";
	if (x === 0) return (1 / x < 0) ? "-0" : "0";
	let s = x.toPrecision(15);
	let mant = s, exp = 0;
	const ei = s.indexOf("e");
	if (ei >= 0) { mant = s.slice(0, ei); exp = parseInt(s.slice(ei + 1), 10); }
	else {
		const ax = Math.abs(Number(s));
		exp = ax === 0 ? 0 : Math.floor(Math.log10(ax));
		if (Math.pow(10, exp) > ax) exp--;
	}
	if (exp >= 15 || exp < -5) {
		let m = Number(mant).toPrecision(15);
		if (m.indexOf("e") >= 0) m = m.slice(0, m.indexOf("e"));
		const digits = (Math.abs(x) / Math.pow(10, exp)).toPrecision(15);
		let d = digits.indexOf(".") >= 0 ? digits.replace(/0+$/, "").replace(/\.$/, "") : digits;
		return (x < 0 ? "-" : "") + d + "E" + (exp < 0 ? "-" : "+") + String(Math.abs(exp)).padStart(2, "0");
	}
	if (s.indexOf(".") >= 0 && ei < 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
	else if (ei >= 0) s = Number(s).toString();
	return s;
}
function $os(x) {
	if (x == null) return "";
	switch (typeof x) {
		case "string": return x;
		case "number": return $ds(x);
		case "boolean": return x ? "True" : "False";
		case "function": return "System.Action";
	}
	if (typeof x.ToString === "function") return x.ToString();
	if (Array.isArray(x)) return "[" + x.map($os).join(", ") + "]";
	return String(x);
}
function $enumStr(T, v) {
	if (T && T.$names && T.$names[v] !== undefined) return T.$names[v];
	return String(v);
}
function $chars(s) {
	const out = new Uint16Array(s.length);
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}
function $toChars(s) { return $chars(s); }
function $newString(c, n) {
	if (typeof c === "number") return String.fromCharCode(c).repeat(n);
	if (n === undefined) return String.fromCharCode.apply(null, Array.from(c));
	return String.fromCharCode.apply(null, Array.from(c).slice(n, n + arguments[2]));
}
function $strContains(s, x) { return s.indexOf(typeof x === "number" ? String.fromCharCode(x) : x) >= 0; }
function $strIndexOf(s, x, from) { return s.indexOf(typeof x === "number" ? String.fromCharCode(x) : x, from); }
function $strLastIndexOf(s, x) { return s.lastIndexOf(typeof x === "number" ? String.fromCharCode(x) : x); }
function $strReplace(s, a, b) {
	if (typeof a === "number") a = String.fromCharCode(a);
	if (typeof b === "number") b = String.fromCharCode(b);
	return s.split(a).join(b == null ? "" : b);
}
function $cmpOrd(a, b) {
	if (a === b) return 0;
	if (a == null) return -1;
	if (b == null) return 1;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) {
		const d = a.charCodeAt(i) - b.charCodeAt(i);
		if (d !== 0) return d;
	}
	return a.length - b.length;
}
function $cmpStr(a, b) { return a === b ? 0 : a == null ? -1 : b == null ? 1 : a.localeCompare(b, "en"); }
function $strHash(s) {
	// Mono's string hash (deterministic): h = h * 31 + c over UTF-16 units.
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
	return h;
}
function $hash(x) {
	if (x == null) return 0;
	if (typeof x === "string") return $strHash(x);
	if (typeof x === "number") return x | 0;
	if (typeof x.GetHashCode === "function") return x.GetHashCode();
	return 0;
}
function $equals(a, b) {
	if (a === b) return true;
	if (a == null || b == null) return false;
	if (typeof a.Equals$Object === "function") return a.Equals$Object(b);
	if (typeof a.Equals === "function") return a.Equals(b);
	if (typeof a === "number" && typeof b === "number") return a !== a && b !== b;
	return false;
}
function $key(x) {
	if (x != null && typeof x === "object") {
		if (typeof x.$key === "function") return x.$key();
		if (Array.isArray(x)) return x.map($key).join("\u0001");
	}
	return x;
}

// C# format strings for numbers (subset used by the game: F, N, D, X, P, custom 0/#).
function $fmt(x, f) {
	if (f == null || f === "") return $os(x);
	if (typeof x !== "number") return $os(x);
	const m = /^([FfNnDdXxPpEeGgRr])(\d*)$/.exec(f);
	if (m) {
		const k = m[1].toUpperCase(), p = m[2] === "" ? null : parseInt(m[2], 10);
		switch (k) {
			case "F": return $fixed(x, p == null ? 2 : p);
			case "N": return $group($fixed(x, p == null ? 2 : p));
			case "D": { const s = String(Math.abs(Math.trunc(x))).padStart(p || 0, "0"); return x < 0 ? "-" + s : s; }
			case "X": { const s = (x >>> 0).toString(16).padStart(p || 0, "0"); return m[1] === "x" ? s : s.toUpperCase(); }
			case "P": return $group($fixed(x * 100, p == null ? 2 : p)) + " %";
			case "R": return String(x);
			case "G": return p ? String(Number(x.toPrecision(p))) : $ds(x);
			case "E": return x.toExponential(p == null ? 6 : p).replace(/e([+-])(\d)$/, "E$10$2").toUpperCase();
		}
	}
	return $custom(x, f);
}
function $fixed(x, p) {
	const k = Math.pow(10, p);
	const r = (x < 0 ? -1 : 1) * Math.round(Math.abs(x) * k + 1e-9 * 0) / k;
	return r.toFixed(p);
}
function $group(s) {
	const neg = s[0] === "-";
	if (neg) s = s.slice(1);
	const [i, d] = s.split(".");
	const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return (neg ? "-" : "") + g + (d !== undefined ? "." + d : "");
}
function $custom(x, f) {
	const sec = f.split(";");
	if (sec.length > 1 && x < 0) { f = sec[1]; x = -x; }
	else if (sec.length > 2 && x === 0) f = sec[2];
	else f = sec[0];
	const pct = f.indexOf("%") >= 0;
	if (pct) x *= 100;
	const dot = f.indexOf(".");
	const intPart = dot >= 0 ? f.slice(0, dot) : f;
	const decPart = dot >= 0 ? f.slice(dot + 1).replace(/[^0#]/g, "") : "";
	const minDec = (decPart.match(/0/g) || []).length;
	const maxDec = decPart.length;
	let s = $fixed(Math.abs(x), maxDec);
	if (maxDec > minDec) {
		let [a, b] = s.split(".");
		b = (b || "").replace(/0+$/, "");
		while (b.length < minDec) b += "0";
		s = b.length ? a + "." + b : a;
	}
	const minInt = (intPart.replace(/[^0#]/g, "").match(/0/g) || []).length;
	let [ip, dp] = s.split(".");
	if (ip === "0" && minInt === 0) ip = "";
	ip = ip.padStart(minInt, "0");
	if (intPart.indexOf(",") >= 0) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const prefix = intPart.replace(/[0#,]/g, ""), suffix = f.slice(dot >= 0 ? dot + 1 : f.length).replace(/[0#]/g, "");
	return (x < 0 && Math.abs(x) >= 0.5 * Math.pow(10, -maxDec) ? "-" : "") + prefix + ip + (dp !== undefined ? "." + dp : "") + suffix;
}
function $fmtStr(fmt, args) {
	return fmt.replace(/\{\{|\}\}|\{(\d+)(?:,(-?\d+))?(?::([^}]*))?\}/g, (m, i, al, f) => {
		if (m === "{{") return "{";
		if (m === "}}") return "}";
		let s = $fmt(args[+i], f);
		if (al) { const n = +al; s = n < 0 ? s.padEnd(-n) : s.padStart(n); }
		return s;
	});
}

// ---- collections ----
function $arr(n, v) { const a = new Array(n); a.fill(v); return a; }
function $arrS(n, mk) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = mk(); return a; }
function $arr2(Typed, n0, n1, dflt) {
	const d = Typed ? new Typed(n0 * n1) : $arr(n0 * n1, dflt);
	return { d, n0, n1, length: n0 * n1 };
}
function $isArray(x) { return Array.isArray(x) || ArrayBuffer.isView(x); }
function $isEnumerable(x) { return x != null && typeof x !== "string" && (Array.isArray(x) || ArrayBuffer.isView(x) || x instanceof $Dict || x instanceof $HSet); }
function $isType(x, name) { return x != null && x.constructor && x.constructor.name === name; }
function $listRemove(l, x) { const i = l.indexOf(x); if (i < 0) return false; l.splice(i, 1); return true; }
function $addRange(l, src) { for (const x of src) l.push(x); }
function $removeAll(l, pred) {
	let j = 0;
	for (let i = 0; i < l.length; i++) if (!pred(l[i])) l[j++] = l[i];
	const n = l.length - j;
	l.length = j;
	return n;
}
function $find(l, pred) { for (const x of l) if (pred(x)) return x; return null; }
function $arrClear(a, i, n) {
	const v = ArrayBuffer.isView(a) ? 0 : (typeof a[i] === "boolean" ? false : null);
	if (ArrayBuffer.isView(a)) a.fill(0, i, i + n);
	else for (let k = i; k < i + n; k++) a[k] = typeof a[k] === "number" ? 0 : typeof a[k] === "boolean" ? false : v;
}
function $arrCopy(src, si, dst, di, n) {
	if (ArrayBuffer.isView(src) && ArrayBuffer.isView(dst) && src.constructor === dst.constructor) { dst.set(src.subarray(si, si + n), di); return; }
	if (src === dst && si < di) { for (let k = n - 1; k >= 0; k--) dst[di + k] = src[si + k]; return; }
	for (let k = 0; k < n; k++) dst[di + k] = src[si + k];
}
function $arrResize(box, n) {
	const a = box.v;
	if (a == null) { box.v = new Array(n).fill(null); return; }
	if (ArrayBuffer.isView(a)) { const b = new a.constructor(n); b.set(a.subarray(0, Math.min(n, a.length))); box.v = b; return; }
	const b = a.slice(0, n);
	const fill = a.length > 0 && typeof a[0] === "number" ? 0 : null;
	while (b.length < n) b.push(fill);
	box.v = b;
}
function $init(obj, f) { f(obj); return obj; }
function $initInto(obj, f) { f(obj); return obj; }
function $getOr(d, k, dflt) { const b = { v: dflt }; return d.tryGet(k, b, dflt) ? b.v : dflt; }

// Dictionary<K,V> with .NET enumeration order: entries in slot order, removed slots reused LIFO.
class $Dict {
	constructor(structKeys, comparer) {
		this.idx = new Map();
		this.ks = [];
		this.vs = [];
		this.live = [];
		this.free = [];
		this.n = 0;
		this.sk = !!structKeys;
		this.ci = comparer && comparer.$ignoreCase;
	}
	$k(k) { return this.sk ? $key(k) : (this.ci && typeof k === "string" ? k.toLowerCase() : k); }
	get size() { return this.n; }
	get Count() { return this.n; }
	has(k) { return this.idx.has(this.$k(k)); }
	get(k) {
		const i = this.idx.get(this.$k(k));
		if (i === undefined) throw new Error("KeyNotFoundException: " + $os(k));
		return this.vs[i];
	}
	tryGet(k, box, dflt) {
		const i = this.idx.get(this.$k(k));
		if (i === undefined) { box.v = dflt === undefined ? null : dflt; return false; }
		box.v = this.vs[i];
		return true;
	}
	set(k, v) {
		const kk = this.$k(k);
		const i = this.idx.get(kk);
		if (i !== undefined) { this.vs[i] = v; return v; }
		this.$insert(kk, k, v);
		return v;
	}
	$insert(kk, k, v) {
		let i;
		if (this.free.length) i = this.free.pop();
		else { i = this.ks.length; this.ks.push(null); this.vs.push(null); this.live.push(false); }
		this.ks[i] = k; this.vs[i] = v; this.live[i] = true;
		this.idx.set(kk, i);
		this.n++;
	}
	add(k, v) {
		const kk = this.$k(k);
		if (this.idx.has(kk)) throw new Error("ArgumentException: duplicate key " + $os(k));
		this.$insert(kk, k, v);
	}
	tryAdd(k, v) {
		const kk = this.$k(k);
		if (this.idx.has(kk)) return false;
		this.$insert(kk, k, v);
		return true;
	}
	delete(k) {
		const kk = this.$k(k);
		const i = this.idx.get(kk);
		if (i === undefined) return false;
		this.idx.delete(kk);
		this.ks[i] = null; this.vs[i] = null; this.live[i] = false;
		this.free.push(i);
		this.n--;
		return true;
	}
	clear() { this.idx.clear(); this.ks.length = 0; this.vs.length = 0; this.live.length = 0; this.free.length = 0; this.n = 0; }
	*[Symbol.iterator]() { for (let i = 0; i < this.ks.length; i++) if (this.live[i]) yield [this.ks[i], this.vs[i]]; }
	keysList() { const r = []; for (let i = 0; i < this.ks.length; i++) if (this.live[i]) r.push(this.ks[i]); return r; }
	valuesList() { const r = []; for (let i = 0; i < this.ks.length; i++) if (this.live[i]) r.push(this.vs[i]); return r; }
	containsValue(v) { for (let i = 0; i < this.ks.length; i++) if (this.live[i] && this.vs[i] === v) return true; return false; }
}
function $dict(pairs) { const d = new $Dict(); for (const [k, v] of pairs) d.add(k, v); return d; }
function $dictFrom(src) { const d = new $Dict(src.sk); for (const [k, v] of src) d.add(k, v); return d; }

class $HSet {
	constructor(structKeys, comparer) { this.d = new $Dict(structKeys, comparer); }
	get size() { return this.d.n; }
	get Count() { return this.d.n; }
	add(x) { return this.d.tryAdd(x, true); }
	has(x) { return this.d.has(x); }
	delete(x) { return this.d.delete(x); }
	clear() { this.d.clear(); }
	unionWith(src) { for (const x of src) this.add(x); }
	*[Symbol.iterator]() { for (const kv of this.d) yield kv[0]; }
}
function $hset(src) { const s = new $HSet(); for (const x of src) s.add(x); return s; }

class $SB {
	constructor(s) { this.parts = s ? [s] : []; this.len = s ? s.length : 0; }
	Append(s) { s = s == null ? "" : String(s); this.parts.push(s); this.len += s.length; return this; }
	get Length() { return this.len; }
	set Length(n) { const s = this.ToString().slice(0, n); this.parts = [s]; this.len = s.length; }
	ToString() { const s = this.parts.join(""); this.parts = [s]; return s; }
	Clear() { this.parts = []; this.len = 0; return this; }
	toString() { return this.ToString(); }
}

// .NET introsort (ArraySortHelper<T>), so ties order exactly like List.Sort / Array.Sort in C#.
function $cmpFn(c) {
	if (c == null) return $defaultCompare;
	if (typeof c === "function") return c;
	if (typeof c.Compare === "function") return (a, b) => c.Compare(a, b);
	throw new Error("comparer");
}
function $defaultCompare(a, b) {
	if (typeof a === "string") return $cmpStr(a, b);
	if (a != null && typeof a.CompareTo === "function") return a.CompareTo(b);
	return a < b ? -1 : a > b ? 1 : 0;
}
function $sort(a, cmp, index, length) {
	index = index || 0;
	length = length === undefined ? a.length - index : length;
	if (length < 2) return;
	const c = $cmpFn(cmp);
	const depth = 2 * (Math.floor(Math.log2(length)) + 1);
	$introSort(a, index, index + length - 1, depth, c);
}
function $swapIfGreater(a, c, i, j) {
	if (i !== j && c(a[i], a[j]) > 0) { const t = a[i]; a[i] = a[j]; a[j] = t; }
}
function $swap(a, i, j) { const t = a[i]; a[i] = a[j]; a[j] = t; }
function $introSort(a, lo, hi, depth, c) {
	while (hi > lo) {
		const n = hi - lo + 1;
		if (n <= 16) {
			if (n === 1) return;
			if (n === 2) { $swapIfGreater(a, c, lo, hi); return; }
			if (n === 3) { $swapIfGreater(a, c, lo, hi - 1); $swapIfGreater(a, c, lo, hi); $swapIfGreater(a, c, hi - 1, hi); return; }
			$insertionSort(a, lo, hi, c);
			return;
		}
		if (depth === 0) { $heapSort(a, lo, hi, c); return; }
		depth--;
		const p = $pickPivot(a, lo, hi, c);
		$introSort(a, p + 1, hi, depth, c);
		hi = p - 1;
	}
}
function $pickPivot(a, lo, hi, c) {
	const mid = lo + ((hi - lo) >> 1);
	$swapIfGreater(a, c, lo, mid);
	$swapIfGreater(a, c, lo, hi);
	$swapIfGreater(a, c, mid, hi);
	const pivot = a[mid];
	$swap(a, mid, hi - 1);
	let left = lo, right = hi - 1;
	while (left < right) {
		while (c(a[++left], pivot) < 0) { }
		while (c(pivot, a[--right]) < 0) { }
		if (left >= right) break;
		$swap(a, left, right);
	}
	$swap(a, left, hi - 1);
	return left;
}
function $heapSort(a, lo, hi, c) {
	const n = hi - lo + 1;
	for (let i = n >> 1; i >= 1; i--) $downHeap(a, i, n, lo, c);
	for (let i = n; i > 1; i--) { $swap(a, lo, lo + i - 1); $downHeap(a, 1, i - 1, lo, c); }
}
function $downHeap(a, i, n, lo, c) {
	const d = a[lo + i - 1];
	while (i <= (n >> 1)) {
		let child = 2 * i;
		if (child < n && c(a[lo + child - 1], a[lo + child]) < 0) child++;
		if (!(c(d, a[lo + child - 1]) < 0)) break;
		a[lo + i - 1] = a[lo + child - 1];
		i = child;
	}
	a[lo + i - 1] = d;
}
function $insertionSort(a, lo, hi, c) {
	for (let i = lo; i < hi; i++) {
		let j = i;
		const t = a[i + 1];
		while (j >= lo && c(t, a[j]) < 0) { a[j + 1] = a[j]; j--; }
		a[j + 1] = t;
	}
}

// System.Random (legacy subtractive generator, seeded or not).
class $Random {
	constructor(seed) {
		if (seed === undefined) seed = (Math.random() * 2147483647) | 0;
		this.sa = new Int32Array(56);
		const sub = seed === -2147483648 ? 2147483647 : Math.abs(seed);
		let mj = 161803398 - sub;
		this.sa[55] = mj;
		let mk = 1;
		for (let i = 1; i < 55; i++) {
			const ii = (21 * i) % 55;
			this.sa[ii] = mk;
			mk = mj - mk;
			if (mk < 0) mk += 2147483647;
			mj = this.sa[ii];
		}
		for (let k = 1; k < 5; k++)
			for (let i = 1; i < 56; i++) {
				let v = this.sa[i] - this.sa[1 + (i + 30) % 55];
				if (v < 0) v += 2147483647;
				this.sa[i] = v;
			}
		this.inext = 0;
		this.inextp = 21;
	}
	$sample() {
		if (++this.inext >= 56) this.inext = 1;
		if (++this.inextp >= 56) this.inextp = 1;
		let r = this.sa[this.inext] - this.sa[this.inextp];
		if (r === 2147483647) r--;
		if (r < 0) r += 2147483647;
		this.sa[this.inext] = r;
		return r;
	}
	NextDouble() { return this.$sample() * (1.0 / 2147483647); }
	Next(a, b) {
		if (a === undefined) return this.$sample();
		if (b === undefined) return Math.floor(this.$sample() * (1.0 / 2147483647) * a);
		const range = b - a;
		if (range <= 2147483647) return Math.floor(this.$sample() * (1.0 / 2147483647) * range) + a;
		throw new Error("large range");
	}
}

// ---- delegates ----
const $bound = new WeakMap();
function $bind(obj, name) {
	let m = $bound.get(obj);
	if (!m) $bound.set(obj, m = new Map());
	let f = m.get(name);
	if (!f) m.set(name, f = obj[name].bind(obj));
	return f;
}
function $dadd(a, b) {
	if (a == null) return b;
	if (b == null) return a;
	const list = (a.$list || [a]).concat(b.$list || [b]);
	const f = function () { let r; for (const g of list) r = g.apply(this, arguments); return r; };
	f.$list = list;
	return f;
}
function $dsub(a, b) {
	if (a == null || b == null) return a;
	const list = (a.$list || [a]).slice();
	const rm = b.$list || [b];
	for (let i = list.length - rm.length; i >= 0; i--) {
		let ok = true;
		for (let k = 0; k < rm.length; k++) if (list[i + k] !== rm[k]) { ok = false; break; }
		if (ok) { list.splice(i, rm.length); break; }
	}
	if (list.length === 0) return null;
	if (list.length === 1) return list[0];
	const f = function () { let r; for (const g of list) r = g.apply(this, arguments); return r; };
	f.$list = list;
	return f;
}

// ---- exceptions ----
function $exc(type, msg) { const e = new Error(msg); e.$type = type; return e; }
function $isExc(e, type) {
	const t = (e && e.$type) || (e instanceof TypeError ? "NullReferenceException" : e instanceof RangeError ? "IndexOutOfRangeException" : "Exception");
	if (type === t || type === "SystemException") return true;
	if (type === "ArgumentException" && t === "ArgumentOutOfRangeException") return true;
	return false;
}

// ---- unmapped BCL / Unity members: implemented in rt-x.js and host shims ----
const $x = new Proxy(Object.create(null), {
	get(t, k) {
		if (k in t) return t[k];
		if (typeof k === "symbol") return undefined;
		return (...a) => { throw new Error("runtime member missing: $x." + String(k)); };
	},
});
