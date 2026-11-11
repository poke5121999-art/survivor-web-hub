// Boo Haul robot TTS, web twin of Assets/Scripts/Port/Audio/Tts/TtsEngine.cs.
// Same functions, same order of floating point operations, same tables (rsynth_tables.json),
// so the web page and the game produce the same samples. Change one side, change the other,
// then regenerate the golden file (Tools/tts/make-golden.mjs); the EditMode parity test fails otherwise.
//
// Pipeline: text -> words -> NRL letter-to-sound rules (rsynth english.c, NRL Report 7948)
// -> phonemes -> Holmes elements (rsynth Elements.def) -> 10 ms frames -> parallel formant
// synth after Klatt (1980) with a Klatt (1990)-style natural glottal source.
// Licences: see THIRD_PARTY.md next to the C# port.

export const DEFAULT_RULES = {
  on: 1, maxChars: 80, gapSec: 2, vol: 0.8,
  pitchMin: 95, pitchMax: 160, botPitchMin: 70, botPitchMax: 90, speed: 1,
};

const P = { fn: 0, f1: 1, f2: 2, f3: 3, b1: 4, b2: 5, b3: 6, an: 7, a1: 8, a2: 9, a3: 10, a4: 11, a5: 12, a6: 13, ab: 14, av: 15, avc: 16, asp: 17, af: 18 };
const NP = 19;

export function createTts(tables) {
  const S = tables.synth;
  const elements = tables.elements;
  const elmByName = new Map();
  elements.forEach((e, i) => elmByName.set(e.name, i));
  const phMap = new Map();
  let phMaxLen = 1;
  for (const pe of tables.phToElm) {
    phMap.set(pe.ph, pe.elms.map((n) => elmByName.get(n)).filter((x) => x !== undefined));
    if (pe.ph.length > phMaxLen) phMaxLen = pe.ph.length;
  }
  const ruleSets = tables.rules.map((r) => r.r); // [punct, A..Z], each flat [left, match, right, out]*
  const pauseElm = elmByName.get(S.pauseElement);

  // ---------------- text -> phonemes ----------------
  const isVowel = (c) => c === 'A' || c === 'E' || c === 'I' || c === 'O' || c === 'U';
  const isUpper = (c) => c >= 'A' && c <= 'Z';
  const isConsonant = (c) => isUpper(c) && !isVowel(c);
  const isAlpha = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
  const isVoiced = (c) => 'BDVGJLMNRWZ'.indexOf(c) >= 0 && c !== '';
  const isFront = (c) => c === 'E' || c === 'I' || c === 'Y';

  function leftMatch(pat, w, pos) { // pos = index of last char before match
    if (pat.length === 0) return true;
    let t = pos;
    const at = (i) => (i >= 0 && i < w.length ? w[i] : '');
    for (let k = pat.length - 1; k >= 0; k--) {
      const p = pat[k];
      if (isAlpha(p) || p === "'" || p === ' ') {
        if (p !== at(t)) return false;
        t--; continue;
      }
      switch (p) {
        case '#': if (!isVowel(at(t))) return false; t--; while (isVowel(at(t))) t--; break;
        case ':': while (isConsonant(at(t))) t--; break;
        case '^': if (!isConsonant(at(t))) return false; t--; break;
        case '.': if (!isVoiced(at(t))) return false; t--; break;
        case '+': if (!isFront(at(t))) return false; t--; break;
        default: return false;
      }
    }
    return true;
  }

  function rightMatch(pat, w, pos) { // pos = index of first char after match
    if (pat.length === 0) return true;
    let t = pos;
    const at = (i) => (i >= 0 && i < w.length ? w[i] : '');
    for (let k = 0; k < pat.length; k++) {
      const p = pat[k];
      if (isAlpha(p) || p === "'" || p === ' ') {
        if (p !== at(t)) return false;
        t++; continue;
      }
      switch (p) {
        case '#': if (!isVowel(at(t))) return false; t++; while (isVowel(at(t))) t++; break;
        case ':': while (isConsonant(at(t))) t++; break;
        case '^': if (!isConsonant(at(t))) return false; t++; break;
        case '.': if (!isVoiced(at(t))) return false; t++; break;
        case '+': if (!isFront(at(t))) return false; t++; break;
        case '%':
          if (at(t) === 'E') {
            t++;
            if (at(t) === 'L') { t++; if (at(t) === 'Y') { t++; } else { t--; } }
            else if (at(t) === 'R' || at(t) === 'S' || at(t) === 'D') t++;
            break;
          } else if (at(t) === 'I') {
            t++;
            if (at(t) === 'N') { t++; if (at(t) === 'G') { t++; break; } }
            return false;
          }
          return false;
        default: return false;
      }
    }
    return true;
  }

  // Applies the NRL rules to one upper-case word; returns its phoneme string (ends with ' ').
  function nrl(word) {
    const w = ' ' + word + ' ';
    let out = '';
    let i = 1;
    while (i < w.length) {
      const c = w[i];
      const set = ruleSets[isUpper(c) ? c.charCodeAt(0) - 64 : 0];
      let next = i + 1; // no rule: skip the char
      for (let r = 0; r < set.length; r += 4) {
        const match = set[r + 1];
        if (w.startsWith(match, i) === false) continue;
        const end = i + match.length;
        if (!leftMatch(set[r], w, i - 1)) continue;
        if (!rightMatch(set[r + 2], w, end)) continue;
        out += set[r + 3];
        next = end;
        break;
      }
      i = next;
    }
    return out;
  }

  function sayNumber(v, words) { // v: 0..999999999
    const C = tables.cardinals, T = tables.twenties;
    if (v >= 1000000) { sayNumber(Math.floor(v / 1000000), words); words.push('million'); v %= 1000000; if (v === 0) return; }
    if (v >= 1000) { sayNumber(Math.floor(v / 1000), words); words.push('thousand'); v %= 1000; if (v === 0) return; }
    if (v >= 100) { words.push(C[Math.floor(v / 100)]); words.push('hundred'); v %= 100; if (v === 0) return; }
    if (v >= 20) { words.push(T[Math.floor(v / 10) - 2]); v %= 10; if (v === 0) return; }
    words.push(C[v]);
  }

  function wordPhones(raw) {
    const up = raw.toUpperCase();
    let hasVowel = false, allCaps = true;
    for (const ch of raw) { if ('AEIOUYaeiouy'.indexOf(ch) >= 0) hasVowel = true; if (ch >= 'a' && ch <= 'z') allCaps = false; }
    const letters = up.replace(/'/g, '');
    if (!hasVowel || (allCaps && letters.length > 1 && letters.length <= 3)) {
      let s = '';
      for (const ch of letters) for (const part of tables.letterNames[ch.charCodeAt(0) - 65].split(' ')) s += nrl(part.toUpperCase());
      return s;
    }
    return nrl(up);
  }

  // Clamped text -> phoneme string. Unsupported characters act as word breaks.
  function phonemize(text, maxChars) {
    const s = clampText(text, maxChars);
    let out = ' ';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (isAlpha(c)) {
        let j = i;
        while (j < s.length && (isAlpha(s[j]) || (s[j] === "'" && j + 1 < s.length && isAlpha(s[j + 1])))) j++;
        out += wordPhones(s.substring(i, j));
        i = j;
      } else if (c >= '0' && c <= '9') {
        let j = i;
        while (j < s.length && s[j] >= '0' && s[j] <= '9') j++;
        const digits = s.substring(i, j);
        const words = [];
        if (digits.length <= 9) sayNumber(parseInt(digits, 10), words);
        else for (const d of digits) words.push(tables.cardinals[d.charCodeAt(0) - 48]);
        for (const wd of words) out += nrl(wd.toUpperCase());
        i = j;
      } else {
        if ('.,!?;:'.indexOf(c) >= 0) out += ' ';
        i++;
      }
    }
    return out.trim() === '' ? '' : out; // nothing speakable: no pause frames either
  }

  // ---------------- phonemes -> elements ----------------
  // Returns {idx, dur, str, n, frames}; stress: rsynth phone_to_elm plus an automatic primary
  // stress on the first vowel of each word (NRL rules carry no stress marks).
  function phonesToElements(ph) {
    const idx = [], dur = [], str = [];
    let stress = 0, frames = 0, wordStart = true;
    let i = 0;
    while (i < ph.length) {
      let found = null, len = 0;
      for (let l = Math.min(phMaxLen, ph.length - i); l >= 1; l--) {
        const e = phMap.get(ph.substr(i, l));
        if (e !== undefined) { found = e; len = l; break; }
      }
      if (found) {
        i += len;
        for (const x of found) {
          const e = elements[x];
          if (e.vowel) { if (wordStart && stress === 0) stress = S.autoStress; wordStart = false; }
          else stress = 0;
          if (x === pauseElm) wordStart = true;
          const d = Math.floor((e.du + e.ud) / 2);
          idx.push(x); dur.push(d); str.push(stress);
          frames += d;
        }
      } else {
        const ch = ph[i++];
        if (ch === "'") stress = 3; else if (ch === ',') stress = 2; else if (ch === '+') stress = 1;
      }
    }
    return { idx, dur, str, n: idx.length, frames };
  }

  // ---------------- Holmes interpolation (rsynth holmes.c) ----------------
  function linear(a, b, t, d) {
    if (t <= 0) return a;
    if (t >= d) return b;
    return a + (b - a) * (t / d);
  }
  function interpolate(sv, st, ev, et, mid, t, d) {
    const steady = d - (st + et);
    if (steady >= 0) {
      if (t < st) return linear(sv, mid, t, st);
      t -= st;
      if (t <= steady) return mid;
      return linear(mid, ev, t - steady, et);
    }
    const f = 1.0 - t / d;
    const sp = linear(sv, mid, t, st);
    const ep = linear(ev, mid, d - t, et);
    return f * sp + (1.0 - f) * ep;
  }
  // set_trans: out arrays v/t for all params. a dominates b; ext: use a's external times.
  function setTrans(v, t, a, b, ext) {
    for (let k = 0; k < NP; k++) {
      const o = k * 5;
      const tt = ext ? a.p[o + 3] : a.p[o + 4];
      t[k] = tt;
      v[k] = tt ? a.p[o + 1] + a.p[o + 2] * b.p[o] * 0.01 : b.p[o];
    }
  }

  // ---------------- formant synth ----------------
  function makeRes() { return { a: 0, b: 0, c: 0, p1: 0, p2: 0 }; }
  function setabc(r, f, bw, sr) {
    const rr = Math.exp((-Math.PI / sr) * bw);
    r.c = -(rr * rr);
    r.b = rr * Math.cos((2 * Math.PI / sr) * f) * 2.0;
    r.a = 1.0 - r.b - r.c;
  }
  function setabcg(r, f, bw, sr, g) {
    if (f >= sr * 0.5) { r.a = 0; r.b = 0; r.c = 0; return; } // above Nyquist: mute this formant
    setabc(r, f, bw, sr); r.a *= g;
  }
  function setzero(r, f, bw, sr) {
    setabc(r, f, bw, sr);
    r.a = 1.0 / r.a; r.b *= -r.a; r.c *= -r.a;
  }
  function res(r, x) { const y = r.a * x + r.b * r.p1 + r.c * r.p2; r.p2 = r.p1; r.p1 = y; return y; }
  function antires(r, x) { const y = r.a * x + r.b * r.p1 + r.c * r.p2; r.p2 = r.p1; r.p1 = x; return y; }
  function dbToLin(db) { if (db <= 0) return 0; if (db > 87) db = 87; return Math.pow(10, (db - 60) / 20); }

  function synthesize(text, voice, sampleRate, maxChars) {
    const sr = sampleRate;
    const ph = phonemize(text, maxChars);
    const el = phonesToElements(ph);
    const frameLen = Math.max(1, Math.floor(sr * S.frameMs / 1000 / voice.speed + 0.5));
    const out = new Float32Array(el.frames * frameLen);
    if (el.frames === 0) return out;
    const pitchMul = voice.pitchHz / S.f0Ref;
    const tilt = Math.min(24, Math.max(0, S.tiltDefault * 2 * (1 - voice.brightness)));

    // synth state
    const rnz = makeRes(), rnp = makeRes(), r1 = makeRes(), r2 = makeRes(), r3 = makeRes(), r4 = makeRes(), r5 = makeRes(), r6 = makeRes(), rout = makeRes(), rlp = makeRes();
    setabc(rlp, Math.floor(S.lpF * sr / 10000), Math.floor(S.lpB * sr / 10000), sr);
    let seed = S.seed >>> 0, nlast = 0, vlast = 0, glotlast = 0;
    let nper = 0, T0 = 0, nopen = 0, nmod = 0, ampVoice = 0, ampBreth = 0, nga = 0, ngb = 0, vwave = 0, decay = 0, onemd = 0;
    let frameNo = 0;
    let w = 0; // write index
    let peak = 0;

    const tp = new Float64Array(NP);
    const sv = new Float64Array(NP), st = new Float64Array(NP), ev = new Float64Array(NP), et = new Float64Array(NP);
    const n = el.n;
    const E = (k) => elements[k];
    // flat rsynth layout reader: j counts (elm, dur, stress) triples * 3
    const flat = (j) => { const q = Math.floor(j / 3), r = j % 3; if (q >= n) return 0; return r === 0 ? el.idx[q] : r === 1 ? el.dur[q] : el.str[q]; };
    const nflat = n * 3;

    let le = E(0);
    let top = S.f0TopMul * S.f0Hz10;
    let ssv = 0, sst = S.stressSlope, sev = 0, set_ = S.stressSlope; // stress_s / stress_e
    let tstress = 0, ntstress = 0;
    let i = 0;
    while (i < nflat) {
      const ce = E(flat(i)); const dur = flat(i + 1); i += 3;
      if (dur > 0) {
        const ne = i < nflat ? E(flat(i)) : E(0);
        if (ce.rk > le.rk) setTrans(sv, st, ce, le, false); else setTrans(sv, st, le, ce, true);
        if (ne.rk > ce.rk) setTrans(ev, et, ne, ce, true); else setTrans(ev, et, ce, ne, false);
        for (let t = 0; t < dur; t++, tstress++) {
          const base = top * S.f0BaseMul;
          if (tstress === ntstress) {
            let j = i;
            ssv = sev; sst = set_;
            tstress = 0; ntstress = dur;
            while (j <= nflat) {
              let e = j < nflat ? E(flat(j++)) : E(0);
              let du = j < nflat ? flat(j++) : 0;
              const s = j < nflat ? flat(j++) : 3;
              if (s || e.vowel) {
                let d = 0;
                sev = s ? s / 3 : 0.1;
                do {
                  d += du;
                  e = j < nflat ? E(flat(j++)) : E(0);
                  du = flat(j++);
                } while (e.vowel && flat(j++) === s);
                ntstress += Math.floor(d / 2);
                break;
              }
              ntstress += du;
            }
          }
          for (let k = 0; k < NP; k++) tp[k] = interpolate(sv[k], st[k], ev[k], et[k], ce.p[k * 5], t, dur);
          let f0 = (base + (top - base) * interpolate(ssv, sst, sev, set_, 0, tstress, ntstress)) * pitchMul;
          top -= S.f0DeclinPerFrame;

          // ---- frame_init (all-parallel model)
          frameNo++;
          if (voice.flutter > 0) {
            const tt = frameNo * S.flutterTime;
            const fh = S.flutterHz;
            f0 += (voice.flutter / 50) * (f0 / 1000) * (Math.sin(2 * Math.PI * fh[0] * tt) + Math.sin(2 * Math.PI * fh[1] * tt) + Math.sin(2 * Math.PI * fh[2] * tt)) * 10;
          }
          let avdb = tp[P.av] - S.avOffset; if (avdb < 0) avdb = 0;
          const ampAsp = dbToLin(tp[P.asp]) * S.aspGain;
          const ampFric = dbToLin(tp[P.af]) * S.fricGain;
          const ampByp = dbToLin(S.ampAdj + tp[P.ab]) * S.bypassGain;
          const g = S.parGains;
          setabc(rnp, S.fnp, S.bnp, sr);
          setzero(rnz, tp[P.fn], S.bnz, sr);
          setabcg(r1, tp[P.f1], tp[P.b1], sr, dbToLin(S.ampAdj + tp[P.a1]) * g[0]);
          setabcg(r2, tp[P.f2], tp[P.b2], sr, dbToLin(S.ampAdj + tp[P.a2]) * g[1]);
          setabcg(r3, tp[P.f3], tp[P.b3], sr, dbToLin(S.ampAdj + tp[P.a3]) * g[2]);
          setabcg(r4, S.f4, S.b4p, sr, dbToLin(S.ampAdj + tp[P.a4]) * g[3]);
          setabcg(r5, S.f5, S.b5p, sr, dbToLin(S.ampAdj + tp[P.a5]) * g[4]);
          setabcg(r6, S.f6, S.b6p, sr, dbToLin(S.ampAdj + tp[P.a6]) * g[5]);
          setabcg(rout, 0, sr, sr, dbToLin(S.gain0 - 3)); // f=0 low-pass, bw = sr
          const aturb = tp[P.avc];

          for (let ns = 0; ns < frameLen; ns++) {
            seed = (Math.imul(seed, 1664525) + 1) >>> 0;
            const nrand = (seed | 0) >> 18;
            let noise = nrand + S.noiseTilt * nlast;
            nlast = noise;
            if (nper > nmod) noise *= 0.5;
            let sourc = ampFric * noise;
            let voice_ = 0;
            for (let n4 = 0; n4 < 4; n4++) {
              let v;
              if (nper < nopen) { nga -= ngb; vwave += nga; v = vwave * S.natGlotOut; }
              else { vwave = 0; v = 0; }
              if (nper >= T0) {
                nper = 0;
                // pitch_synch_par_reset
                if (f0 > 0) {
                  T0 = Math.floor((40 * sr) / f0);
                  ampVoice = dbToLin(avdb);
                  nmod = T0; if (avdb > 0) nmod >>= 1;
                  ampBreth = dbToLin(aturb) * S.breathGain;
                  nopen = 4 * S.kopen;
                  if (nopen >= T0 - 1) nopen = T0 - 2;
                  if (nopen < 40) nopen = 40;
                  ngb = Math.floor(S.natGlotK / (nopen * nopen) + 0.5);
                  nga = ngb * nopen * 0.333;
                } else {
                  T0 = 4; ampVoice = 0; nmod = T0; ampBreth = 0; nga = 0; ngb = 0;
                }
                if (T0 !== 4 || ns === 0) { decay = S.tiltPerDb * tilt; onemd = decay > 0 ? 1.0 - decay : 1.0; }
              }
              voice_ = res(rlp, v);
              nper++;
            }
            voice_ = voice_ * onemd + vlast * decay;
            vlast = voice_;
            if (nper < nopen) voice_ += ampBreth * nrand;
            let glot = ampVoice * voice_ + ampAsp * noise;
            glot = antires(rnz, glot);
            glot = res(rnp, glot);
            let o = res(r1, glot);
            sourc += glot - glotlast;
            glotlast = glot;
            o = res(r6, sourc) - o;
            o = res(r5, sourc) - o;
            o = res(r4, sourc) - o;
            o = res(r3, sourc) - o;
            o = res(r2, sourc) - o;
            o = ampByp * sourc - o;
            o = res(rout, o) / S.outScale;
            out[w++] = o;
            const ab = o < 0 ? -o : o;
            if (ab > peak) peak = ab;
          }
        }
      }
      le = ce;
    }
    if (peak > 0) {
      const k = S.peak / peak;
      for (let q = 0; q < out.length; q++) out[q] = out[q] * k;
    }
    return out;
  }

  return { phonemize, phonesToElements, synthesize };
}

export function clampText(text, maxChars) {
  const m = maxChars > 0 ? maxChars : DEFAULT_RULES.maxChars;
  const s = text == null ? '' : String(text);
  return s.length > m ? s.substring(0, m) : s;
}

// FNV-1a over UTF-16 code units: same hash in C# (TtsVoice.ForId).
export function hashId(id) {
  let h = 2166136261 >>> 0;
  const s = id == null ? '' : String(id);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// Deterministic voice for a player uid (or bot id when isBot).
export function voiceForId(id, rules, isBot) {
  const r = Object.assign({}, DEFAULT_RULES, rules || {});
  const h = hashId(id);
  const u1 = (h & 0xffff) / 65535;
  const u2 = (h >>> 16) / 65535;
  const lo = isBot ? r.botPitchMin : r.pitchMin, hi = isBot ? r.botPitchMax : r.pitchMax;
  return {
    pitchHz: lo + u1 * (hi - lo),
    speed: r.speed * (1 + (u2 * 2 - 1) * 0.08),
    flutter: 20,
    brightness: isBot ? 0.35 : 0.5,
  };
}

// 16-bit PCM mono WAV bytes.
export function toWav(samples, sampleRate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let v = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return new Uint8Array(buf);
}
