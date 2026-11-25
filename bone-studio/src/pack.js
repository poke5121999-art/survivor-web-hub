// Texture packer: places rectangles on pages (skyline bottom-left). Pure; the caller draws the pixels.
// items: [{ name, w, h }] → pages: [{ width, height, regions: [{ name, x, y, w, h }] }]
export function pack(items, { maxSize = 2048, padding = 2, pot = true } = {}) {
  const todo = items.map((it) => ({ ...it })).sort((a, b) => b.h - a.h || b.w - a.w);
  const big = todo.find((it) => it.w + padding * 2 > maxSize || it.h + padding * 2 > maxSize);
  if (big) throw new Error(`ảnh "${big.name}" ${big.w}x${big.h} lớn hơn trang atlas ${maxSize}`);
  const pages = [];
  while (todo.length) {
    const sky = [{ x: 0, y: 0, w: maxSize }], regions = [];
    for (let i = 0; i < todo.length; i++) {
      const it = todo[i], w = it.w + padding, h = it.h + padding;
      let best = null;
      for (let s = 0; s < sky.length; s++) {
        let x = sky[s].x, y = 0, wl = w, j = s;
        if (x + w > maxSize) break;
        while (wl > 0) { y = Math.max(y, sky[j].y); wl -= sky[j].w; j++; if (wl > 0 && j >= sky.length) { y = Infinity; break; } }
        if (y + h <= maxSize && (!best || y < best.y || (y === best.y && x < best.x))) best = { s, x, y };
      }
      if (!best) continue;
      regions.push({ name: it.name, x: best.x + padding / 2 | 0, y: best.y + padding / 2 | 0, w: it.w, h: it.h });
      // update skyline
      const seg = { x: best.x, y: best.y + h, w };
      const out = [];
      for (const k of sky) {
        if (k.x + k.w <= seg.x || k.x >= seg.x + seg.w) { out.push(k); continue; }
        if (k.x < seg.x) out.push({ x: k.x, y: k.y, w: seg.x - k.x });
        if (k.x + k.w > seg.x + seg.w) out.push({ x: seg.x + seg.w, y: k.y, w: k.x + k.w - seg.x - seg.w });
      }
      out.push(seg); out.sort((a, b) => a.x - b.x);
      sky.length = 0;
      for (const k of out) { const last = sky[sky.length - 1]; if (last && last.y === k.y && last.x + last.w === k.x) last.w += k.w; else sky.push({ ...k }); }
      todo.splice(i--, 1);
    }
    if (!regions.length) throw new Error("không xếp được ảnh nào vào trang atlas");
    let W = Math.max(...regions.map((r) => r.x + r.w)) + padding, H = Math.max(...regions.map((r) => r.y + r.h)) + padding;
    if (pot) { W = 2 ** Math.ceil(Math.log2(W)); H = 2 ** Math.ceil(Math.log2(H)); }
    pages.push({ width: Math.min(W, maxSize), height: Math.min(H, maxSize), regions });
  }
  return pages;
}
