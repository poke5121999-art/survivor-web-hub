import { loadGame } from "./load.mjs";
const g = loadGame();
console.log(g.eval(`
(() => {
  const out = [];
  let t = performance.now(), s = 0;
  for (let i = 0; i < 3e6; i++) s += G$E.Hash2(i * 0.37, i * 0.11, 5);
  out.push("G$E.Hash2 " + (performance.now() - t).toFixed(0) + "ms");
  const h = G$E.Hash2;
  t = performance.now();
  for (let i = 0; i < 3e6; i++) s += h(i * 0.37, i * 0.11, 5);
  out.push("local ref " + (performance.now() - t).toFixed(0) + "ms");
  function H2(x, y, seed) {
    let num = (((Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0) + Math.imul(((seed | 0) + 1013) | 0, 362437)) | 0;
    let num2 = Math.imul(num ^ (num >>> 13), 1274126177);
    return (((num2 >>> 0) ^ ((num2 >>> 0) >>> 16)) >>> 0) / 4294967296;
  }
  t = performance.now();
  for (let i = 0; i < 3e6; i++) s += H2(i * 0.37, i * 0.11, 5);
  out.push("plain fn " + (performance.now() - t).toFixed(0) + "ms");
  out.push(G$E.Hash2.toString().slice(0, 300));
  return out.join("\\n");
})()`));
