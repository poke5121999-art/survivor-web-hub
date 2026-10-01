/*
 * Bố cục cây: thuần, vào là doc + view, ra là toạ độ thẻ và danh sách đường nối.
 *
 * Mỗi người trong dòng là một "khối": thẻ của họ, vợ/chồng xếp xen phải-trái (người thứ nhất
 * bên phải, thứ hai bên trái...), con cái treo dưới theo thứ tự nút cưới từ trái sang phải để
 * dây không cắt nhau. Chiều rộng cây con = max(khối, tổng các cây con của con cái).
 */
(function (GP) {
  'use strict';

  const CARD = { w: 184, h: 78 };
  const GAP_SPOUSE = 30, GAP_SIB = 34, GAP_ROOT = 110, ROW = 172;

  function layout(t, view) {
    const M = GP.model;
    const x = M.ix(t);
    const collapsed = (view && view.collapsed) || {};
    const focus = view && view.focus && t.people[view.focus] ? M.anchorOf(t, view.focus, x) : null;
    const roots = focus ? [focus] : M.roots(t, x);
    const gen0 = focus ? M.ancestors(t, focus, x).length : 0;

    const cards = [];
    const links = [];
    const widths = {};

    function block(id) {
      const left = [], right = [];
      (x.unionsOf[id] || []).filter((u) => u.b).forEach((u, i) => (i % 2 ? left : right).push(u.b));
      return left.reverse().concat([id], right);
    }

    function groups(id, blk) {
      const at = (u) => (u.b ? blk.indexOf(u.b) : blk.indexOf(id));
      return (x.unionsOf[id] || []).filter((u) => u.children.length).slice().sort((a, b) => at(a) - at(b));
    }

    const open = (id) => !collapsed[id] && M.kidsOf(t, id, x).length > 0;
    const blockW = (n) => n * CARD.w + (n - 1) * GAP_SPOUSE;

    function measure(id) {
      if (widths[id] != null) return widths[id];
      const bw = blockW(block(id).length);
      let kw = 0;
      if (open(id)) {
        const kids = groups(id, block(id)).flatMap((u) => u.children);
        kw = kids.reduce((s, c) => s + measure(c), 0) + GAP_SIB * (kids.length - 1);
      }
      return (widths[id] = Math.max(bw, kw));
    }

    function place(id, left, depth) {
      const w = measure(id);
      const blk = block(id);
      const bw = blockW(blk.length);
      const y = depth * ROW;
      const gen = gen0 + depth + 1;
      const kids = M.kidsOf(t, id, x);
      const hidden = collapsed[id] ? M.descendants(t, id, x).length : 0;
      let bx = left + (w - bw) / 2;
      blk.forEach((pid, i) => {
        cards.push({ id: pid, x: bx + i * (CARD.w + GAP_SPOUSE), y, gen, blood: pid === id, anchor: id,
          kids: pid === id ? kids.length : 0, hidden: pid === id ? hidden : 0, collapsed: pid === id && !!collapsed[id] });
      });
      for (const u of x.unionsOf[id] || []) if (u.b) links.push({ key: 'm' + u.id, type: 'm', a: u.a, b: u.b });
      if (!open(id)) return;
      const gs = groups(id, blk);
      const kw = gs.reduce((s, u) => s + u.children.reduce((a, c) => a + measure(c), 0), 0) +
        GAP_SIB * (gs.reduce((s, u) => s + u.children.length, 0) - 1);
      let cx = left + (w - kw) / 2;
      for (const u of gs) {
        for (const c of u.children) {
          links.push({ key: 'c' + c, type: 'c', a: u.a, b: u.b, c });
          place(c, cx, depth + 1);
          cx += measure(c) + GAP_SIB;
        }
      }
    }

    let left = 0;
    for (const r of roots) { place(r, left, 0); left += measure(r) + GAP_ROOT; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of cards) {
      minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + CARD.w); maxY = Math.max(maxY, c.y + CARD.h);
    }
    const bounds = cards.length ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : { x: 0, y: 0, w: 0, h: 0 };
    return { cards, links, bounds };
  }

  GP.CARD = CARD;
  GP.layout = layout;
})(typeof window !== 'undefined' ? (window.GP = window.GP || {}) : module.exports);
