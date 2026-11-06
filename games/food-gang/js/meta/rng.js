// MetaRng (SplitMix64) and MetaTime, port of FG.Meta Core/MetaRng.cs.
// State is a BigInt so every draw matches the C# ulong sequence bit for bit.

const M64 = (1n << 64n) - 1n;
const GOLDEN = 0x9E3779B97F4A7C15n;
const MUL1 = 0xBF58476D1CE4E5B9n;
const MUL2 = 0x94D049BB133111EBn;
const FLOAT_DEN = 16777215; // (1 << 24) - 1

export class MetaRng {
  /** @param {number|bigint} seed a C# long */
  constructor(seed) {
    this.state = BigInt.asUintN(64, BigInt(seed)) ^ GOLDEN;
  }

  nextULong() {
    this.state = (this.state + GOLDEN) & M64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * MUL1) & M64;
    z = ((z ^ (z >> 27n)) * MUL2) & M64;
    return z ^ (z >> 31n);
  }

  /** Uniform int in [min, maxExclusive); min when the range is empty. */
  range(min, maxExclusive) {
    if (maxExclusive <= min) return min;
    const span = BigInt(maxExclusive) - BigInt(min);
    return min + Number(this.nextULong() % span);
  }

  /** Uniform float32 in [min, max], both ends reachable (C# Range(float, float)). */
  rangeFloat(min, max) {
    const u = Number(this.nextULong() >> 40n) / FLOAT_DEN;
    return Math.fround(min + Math.fround(max - min) * u);
  }

  get value() { return this.rangeFloat(0, 1); }

  nextInt() { return Number(BigInt.asIntN(32, this.nextULong())); }

  static seedOf(a, b = 0) {
    return BigInt.asIntN(64, BigInt(a) * 1000003n + BigInt(b));
  }
}

function floorDiv(a, b) { return Math.floor(a / b); }

const WEEK_EPOCH = Date.UTC(2018, 0, 1) / 1000;

/** UTC clock helpers; the meta never reads the system clock itself. Times are JS Dates (UTC). */
export const MetaTime = {
  Day: 86400,
  Hour: 3600,
  Week: 604800,

  /** Unix seconds of a Date (or of a millisecond number). */
  seconds(utc) {
    const ms = utc instanceof Date ? utc.getTime() : Number(utc);
    return Math.floor(ms / 1000);
  },

  fromSeconds(s) { return new Date(s * 1000); },

  dayStart(s) { return floorDiv(s, 86400) * 86400; },

  hourStart(s) { return floorDiv(s, 3600) * 3600; },

  /** Monday = 0 .. Sunday = 6. 1970-01-01 was a Thursday (index 3). */
  weekdayIndex(s) { return (((floorDiv(s, 86400) + 3) % 7) + 7) % 7; },

  weekStart(s) { return MetaTime.dayStart(s) - MetaTime.weekdayIndex(s) * 86400; },

  /** Weeks since Monday 2018-01-01 (MissionSystem.CurrentWeek). */
  currentWeek(s) { return floorDiv(MetaTime.weekStart(s) - WEEK_EPOCH, 604800); },
};
