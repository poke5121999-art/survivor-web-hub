"use strict";
// J.cs re-implemented the JS number semantics of the original HTML game in C#; in the browser they are the
// native ones. Loaded before the generated game.
class J {
	static Round(x) { return Math.round(x); }
	static RoundI(x) { return Math.round(x) | 0; }
	static Sign(x) { return Math.sign(x); }
	static I32(d) { return d | 0; }
	static U32(d) { return d >>> 0; }
	static Imul(a, b) { return Math.imul(a, b); }
	static Hypot$d$d(a, b) { return Math.hypot(a, b); }
	static Hypot$d$d$d(a, b, c) { return Math.hypot(a, b, c); }
	static Log2(x) { return Math.log2(x); }
	static Log10(x) { return Math.log10(x); }
	static SeedRandom(seed) { J.testRng = seed === 0 ? null : new Rng().$ctor(seed); }
	static Random() { return J.testRng ? J.testRng.Next() : Math.random(); }
	static Str$d(v) { return String(v); }
	static Str$i(v) { return String(v); }
	static ToFixed(v, digits) { return v.toFixed(digits); }
	static StableSort$List$Func(list, cmp) { $stableSort(list, list.length, cmp); }
	static StableSort$TA$i$Func(arr, count, cmp) { $stableSort(arr, count, cmp); }
	static Sin(x) { return Math.sin(x); }
	static Cos(x) { return Math.cos(x); }
	static Atan2(y, x) { return Math.atan2(y, x); }
	static Exp(x) { return Math.exp(x); }
	static Pow(x, y) { return Math.pow(x, y); }
}
J.testRng = null;
function $stableSort(a, count, cmp) {
	const head = Array.prototype.slice.call(a, 0, count);
	head.sort((x, y) => { const r = cmp(x, y); return r !== r ? 0 : r; });
	for (let i = 0; i < count; i++) a[i] = head[i];
}
