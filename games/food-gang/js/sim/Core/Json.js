// JsonNode accessors of FG.Sim (the parser itself is JSON.parse). Numbers become float32 the way
// `(float)n.Num` does; ints truncate like `(int)n.Num`.
import { f } from './Vec2.js';

const isNum = (v) => typeof v === 'number';

export const Json = Object.freeze({
  F: (o, key, def = 0) => (o != null && isNum(o[key]) ? f(o[key]) : def),
  I: (o, key, def = 0) => (o != null && isNum(o[key]) ? Math.trunc(o[key]) | 0 : def),
  B: (o, key) => o != null && o[key] === true,
  S: (o, key) => (o != null && typeof o[key] === 'string' ? o[key] : null),
  V: (o, key) => {
    const n = o == null ? null : o[key];
    return Array.isArray(n) && n.length >= 2 ? { x: f(n[0]), y: f(n[1]) } : { x: 0, y: 0 };
  },
  count: (n) => (Array.isArray(n) ? n.length : 0),
});
