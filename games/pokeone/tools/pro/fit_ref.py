"""Tách một ảnh bản đồ PRO tham chiếu thành các con tem tile PRO (nhà, cây, rào, đèn, hoa…) đặt theo ô.

  python tools/pro/fit_ref.py <ảnh> <cells.json> <ra.stamps> [--scale 0.5] [--path 228,216,140|none]
                              [--path-auto 38:16,16;38:19,14] [--walk 180,224,160;...] [--trees S:c,r,WxH;...]
                              [--objects S:c,r,WxH@x,y[~r];...] [--clear x0,y0,x1,y1;...] [--conf 30]
                              [--base 60:23,8,1x1] [--lambda 9000]

<cells.json> do match_ref.py sinh (5 ô tile gần nhất cho mỗi ô). Cách làm:
  1. Thư viện vật: mỗi vùng liền nhau (alpha > 0, lưới 4 px) của các tấm có mặt trong cells.json là một vật, khung
     theo ô 32 px. Vùng quá to (> 12×12 ô, kiểu mảng rừng lát) bị bỏ, chỉ còn dùng từng ô lẻ.
  2. Ứng viên: mỗi ô bỏ phiếu cho (vật, gốc đặt) mà ô tile gần nhất của nó thuộc về. Thêm từng ô lẻ top-3 làm ứng viên 1×1.
  3. Nền: mẫu --base lát lặp (cỏ, sàn gỗ 2×2) + đường cát tự nối (ô có >= 35 % điểm ảnh màu --path) giống brushes.txt.
  4. Tham lam lười: lặp chọn ứng viên giảm sai số nhiều nhất (so ở độ phân giải 4 px để khử độ mờ của ảnh tham chiếu),
     phủ lên canvas, dừng khi mức giảm < lambda.
Ra: <ra.stamps> (một dòng mỗi con tem: `S:c,r,WxH x,y foot=N`, xếp theo đáy từ bắc xuống nam; foot = số hàng dưới cùng
vào lớp nền, phần trên vào lớp over), <ra.stamps>.grid.txt (lưới gợi ý: . cỏ , đường # chặn) và <ra.stamps>.png (tham
chiếu | dựng lại). Lưới gợi ý (chặn = chân con tem nhiều ô, hoặc ô mà màu tham chiếu không phải màu --walk / --path)
chỉ để chép rồi sửa tay (cửa, mốc, cỏ gặp Pokémon)."""
import heapq, json, os, sys, collections
import numpy as np
from PIL import Image

CAT = os.environ.get('PRO_CATALOG', r'D:\pro-ref\catalog')
T, K = 32, 4          # ô 32 px, so ở khối 4 px
C = T // K


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


_sheets = {}


class Sheet:
    # Giữ uint8 (144 tấm float32 không vừa bộ nhớ Python 32-bit); cắt ra mới đổi sang 0..1.
    def __init__(self, s):
        self.a = np.asarray(Image.open(os.path.join(CAT, f'raw_{s}.png')).convert('RGBA'))

    def __getitem__(self, key):
        return self.a[key].astype(np.float32) / 255


def sheet(s):
    if s not in _sheets:
        _sheets[s] = Sheet(s)
    return _sheets[s]


def coarse(rgba):
    """RGBA (H,W,4) 0..1 -> màu nhân alpha và alpha ở lưới 4 px."""
    h, w = rgba.shape[0] // K, rgba.shape[1] // K
    a = rgba[..., 3:4]
    pm = (rgba[..., :3] * a).reshape(h, K, w, K, 3).mean((1, 3))
    al = a.reshape(h, K, w, K, 1).mean((1, 3))
    return pm, al


def components(s):
    """Vùng alpha liền nhau (8 hướng) ở lưới 4 px -> [(c0, r0, w, h)] theo ô, kèm bảng ô -> vùng."""
    al = sheet(s).a[..., 3].reshape(256, K, 256, K).max((1, 3)) > 0
    lab = np.zeros((256, 256), np.int32)
    out = []
    for y0 in range(256):
        for x0 in range(256):
            if not al[y0, x0] or lab[y0, x0]:
                continue
            n = len(out) + 1
            st = [(y0, x0)]
            lab[y0, x0] = n
            ys, xs = [y0], [x0]
            while st:
                y, x = st.pop()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        Y, X = y + dy, x + dx
                        if 0 <= Y < 256 and 0 <= X < 256 and al[Y, X] and not lab[Y, X]:
                            lab[Y, X] = n
                            st.append((Y, X))
                            ys.append(Y)
                            xs.append(X)
            c0, r0 = min(xs) // C, min(ys) // C
            out.append((c0, r0, max(xs) // C - c0 + 1, max(ys) // C - r0 + 1))
    cell_of = collections.defaultdict(set)
    for i, (c0, r0, w, h) in enumerate(out):
        sub = lab[r0 * C:(r0 + h) * C, c0 * C:(c0 + w) * C] == i + 1
        for r in range(h):
            for c in range(w):
                if sub[r * C:(r + 1) * C, c * C:(c + 1) * C].any():
                    cell_of[(c0 + c, r0 + r)].add(i)
    return out, cell_of


def auto_cell(f, g, n, s, w, e, nw, ne, sw, se):
    """Như autoCell của build_maps.js: f = góc khung 3×3, g = góc khối góc trong 2×2 (lỗ ở tâm)."""
    F = lambda dx, dy: (f[0] + dx, f[1] + dy)
    if not n and not w: return F(0, 0)
    if not n and not e: return F(2, 0)
    if not s and not w: return F(0, 2)
    if not s and not e: return F(2, 2)
    if not n: return F(1, 0)
    if not s: return F(1, 2)
    if not w: return F(0, 1)
    if not e: return F(2, 1)
    if not se: return g
    if not sw: return (g[0] + 1, g[1])
    if not ne: return (g[0], g[1] + 1)
    if not nw: return (g[0] + 1, g[1] + 1)
    return F(1, 1)


def main():
    src, cells_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
    scale = float(arg('--scale', '1'))
    path_arg = arg('--path', '228,216,140')
    path_rgb = None if path_arg == 'none' else np.array(list(map(int, path_arg.split(','))), np.float32)
    pa, pg = [tuple(int(v) for v in t.replace(':', ',').split(',')) for t in arg('--path-auto', '38:16,16;38:19,14').split(';')]
    bs, bc, br, bw, bh = [int(v) for v in arg('--base', '60:23,8,1x1').replace(':', ',').replace('x', ',').split(',')]
    lam = float(arg('--lambda', '9000'))
    ref = Image.open(src).convert('RGB')
    if scale != 1:
        ref = ref.resize((round(ref.width / scale), round(ref.height / scale)), Image.BICUBIC)
    H, W = ref.height // T, ref.width // T
    R = np.asarray(ref).astype(np.float32)[:H * T, :W * T] / 255
    Rc = R.reshape(H * C, K, W * C, K, 3).mean((1, 3))
    cells = json.load(open(cells_json))

    # nền: cỏ + đường
    pathm = np.zeros((H, W), bool)
    for y in range(H):
        for x in range(W):
            q = R[y * T:(y + 1) * T, x * T:(x + 1) * T] * 255
            pathm[y, x] = path_rgb is not None and (np.abs(q - path_rgb).sum(-1) < 40).mean() >= 0.35
    base = np.zeros((H * T, W * T, 4), np.float32)
    for y in range(H):
        for x in range(W):
            gc, gr = bc + x % bw, br + y % bh
            base[y * T:(y + 1) * T, x * T:(x + 1) * T] = sheet(bs)[gr * T:(gr + 1) * T, gc * T:(gc + 1) * T]
            if pathm[y, x]:
                same = lambda dx, dy: not (0 <= x + dx < W and 0 <= y + dy < H) or pathm[y + dy, x + dx]
                c, r = auto_cell(pa[1:], pg[1:], same(0, -1), same(0, 1), same(-1, 0), same(1, 0), same(-1, -1), same(1, -1), same(-1, 1), same(1, 1))
                t = sheet(pa[0])[r * T:(r + 1) * T, c * T:(c + 1) * T]
                a = t[..., 3:4]
                base[y * T:(y + 1) * T, x * T:(x + 1) * T, :3] = t[..., :3] * a + base[y * T:(y + 1) * T, x * T:(x + 1) * T, :3] * (1 - a)
    canvas = coarse(base)[0]

    # Ô đi được theo màu tham chiếu: đa số điểm ảnh là màu nền (--walk, mặc định cỏ) hoặc màu đường.
    walk_rgb = [np.array(list(map(int, c.split(','))), np.float32) for c in arg('--walk', '180,224,160').split(';')]
    if path_rgb is not None:
        walk_rgb.append(path_rgb)
    walk_frac = float(arg('--walk-frac', '0.55'))
    walkable = np.zeros((H, W), bool)
    for y in range(H):
        for x in range(W):
            q = R[y * T:(y + 1) * T, x * T:(x + 1) * T] * 255
            near = np.zeros(q.shape[:2], bool)
            for c in walk_rgb:
                near |= np.abs(q - c).sum(-1) < 45
            walkable[y, x] = near.mean() >= walk_frac
    # Ô phẳng nhận ra từ kết quả dò (top-3): cỏ cao lá, gờ đất -> đi được (--flat 'S:c,r;...', --flat-sheets '41').
    flat = {tuple(int(v) for v in t.replace(':', ',').split(',')) for t in
            arg('--flat', '58:30,0;58:31,1;58:31,0;58:30,1;1:6,0;1:7,0;1:6,1;1:7,1;39:16,8;39:17,8;39:18,8;39:17,11').split(';')}
    flat_sheets = set(map(int, arg('--flat-sheets', '41').split(',')))
    for y, x, bs in cells:
        if any(tuple(b[:3]) in flat or b[0] in flat_sheets for b in bs[:3]):
            walkable[y, x] = True

    # Rừng: PRO lát cây chồng nhau dày đặc, một ô tham chiếu lẫn nhiều cây nên dò ô lẻ ra khảm vụn. Trồng cây theo lưới
    # so le 2×2 trên ô không đi được, từ bắc xuống nam (cây phía nam đè cây phía bắc như khi vẽ), mỗi gốc chọn loại cây
    # (--trees) giảm sai số nhiều nhất; không giảm được (nhà, hàng rào, ao) thì bỏ trống.
    trees = [tuple(int(v) for v in t.replace(':', ',').replace('x', ',').split(',')) for t in
             arg('--trees', '1:8,0,4x5;1:12,0,4x5;1:8,5,4x5;1:12,5,4x5;2:8,0,3x4;2:11,0,3x4;2:8,4,3x4;2:11,4,3x4;'
                 '1:16,0,4x5;1:20,0,4x5;1:16,5,4x5;1:20,5,4x5;1:16,14,4x5;1:20,14,4x5;1:16,19,4x5;1:20,19,4x5').split(';')]
    forest, covered = [], np.zeros((H, W), bool)
    def foot_of(s, c, r, w, h):
        op = (sheet(s)[r * T:(r + h) * T, c * T:(c + w) * T][..., 3] > 0.8).reshape(h, T, w, T).mean((1, 3))
        body = [j for j in range(h) if op[j].max() >= 0.25]
        j = body[-1] if body else h - 1
        cols = [i for i in range(w) if op[j, i] >= 0.5] or [int(op[j].argmax())]
        return j, cols
    tree_feet = {t: foot_of(*t) for t in trees}

    # thư viện vật + ứng viên
    used_sheets = sorted({b[0] for _, _, bs in cells for b in bs[:3]})
    lib, cell_of = {}, {}
    for s in used_sheets:
        comps, co = components(s)
        lib[s], cell_of[s] = comps, co
    votes = collections.Counter()
    for y, x, bs in cells:
        for rank, (s, c, r, _) in enumerate(bs[:5]):
            for i in cell_of.get(s, {}).get((c, r), ()):
                c0, r0, w, h = lib[s][i]
                if w > 12 or h > 12:
                    continue
                votes[(s, c0, r0, w, h, x - (c - c0), y - (r - r0))] += 1.0 / (1 + rank)
    # Vật nhiều ô phải được đa số ô của nó ủng hộ (>= 40 % số ô có hình), không thì chỉ là trùng màu mờ (cây tuyết,
    # cây quả mọc giữa rừng thông).
    def filled(k):
        s, c0, r0, w, h = k[:5]
        a = sheet(s).a[r0 * T:(r0 + h) * T, c0 * T:(c0 + w) * T, 3]
        return max(1, int(((a > 0).reshape(h, T, w, T).mean((1, 3)) >= 0.25).sum()))
    cands = [k for k, v in votes.items() if (k[3] > 1 or k[4] > 1) and v >= max(1.5, 0.4 * filled(k))]
    # Ô lẻ: chỉ nhận khi chắc chắn — là ô tốt nhất, sai số < --conf, và là vật nhỏ trọn vẹn (vùng alpha của nó trong
    # tấm <= 2×2 ô, không phải ô nền đục hay mảng bóng mờ) hoặc thuộc danh sách phẳng (cỏ lá, gờ). Ô không chắc để
    # trống: rừng (B) phủ kín, còn lại là nền trơn — không bao giờ để lại mảnh vụn của vật lớn.
    conf = float(arg('--conf', '30'))
    def single_ok(s, c, r):
        if (s, c, r) in flat or s in flat_sheets:   # cỏ lá, gờ: nhận cả khi khớp kém (ảnh mờ nhất ở đây)
            return True
        a = sheet(s).a[r * T:(r + 1) * T, c * T:(c + 1) * T, 3]
        nz = a[a > 0]
        cov = (a > 0).mean()
        if not nz.size or cov > 0.9 or cov < 0.08 or (nz > 200).mean() < 0.7:   # nền đục, chấm vụn, bóng mờ
            return False
        comps = [lib[s][i] for i in cell_of.get(s, {}).get((c, r), ())]
        if comps and all(w <= 2 and h <= 2 for _, _, w, h in comps):
            return True
        # Mảnh của vật lớn nối tiếp cả lên trên lẫn xuống dưới (thân/tán cây, tường) thì bỏ; hàng rào, luống hoa thì giữ.
        return min((a[0] > 0).mean(), (a[-1] > 0).mean()) < 0.3
    for y, x, bs in cells:
        s, c, r, e = bs[0]
        if (e < conf or (s, c, r) in flat or s in flat_sheets) and single_ok(s, c, r):
            cands.append((s, c, r, 1, 1, x, y))
    cands = list(dict.fromkeys(cands))
    art = {}

    def stamp(k):
        if k[:5] not in art:
            s, c, r, w, h = k[:5]
            art[k[:5]] = coarse(sheet(s)[r * T:(r + h) * T, c * T:(c + w) * T])
        return art[k[:5]]

    def gain(k):
        s, c, r, w, h, x, y = k
        pm, al = stamp(k)
        X0, Y0, X1, Y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if X0 >= X1 or Y0 >= Y1:
            return -1, None
        pm = pm[(Y0 - y) * C:(Y1 - y) * C, (X0 - x) * C:(X1 - x) * C]
        al = al[(Y0 - y) * C:(Y1 - y) * C, (X0 - x) * C:(X1 - x) * C]
        cur = canvas[Y0 * C:Y1 * C, X0 * C:X1 * C]
        new = pm + (1 - al) * cur
        ref_ = Rc[Y0 * C:Y1 * C, X0 * C:X1 * C]
        # giảm tổng bình phương sai số (thang 0..255) trên các khối 4 px
        g = (((cur - ref_) ** 2).sum() - ((new - ref_) ** 2).sum()) * 255 * 255
        return g, (Y0, Y1, X0, X1, new)

    def greedy(cs):
        """Tham lam lười: chọn ứng viên giảm sai số nhiều nhất, phủ lên canvas, lặp tới khi mức giảm < lambda."""
        heap, picked = [], []
        for i, k in enumerate(cs):
            g, _ = gain(k)
            if g > lam:
                heapq.heappush(heap, (-g, i))
        while heap:
            ng, i = heapq.heappop(heap)
            g, upd = gain(cs[i])
            if g < lam:
                continue
            if heap and g < -heap[0][0] - 1e-6:
                heapq.heappush(heap, (-g, i))
                continue
            Y0, Y1, X0, X1, new = upd
            canvas[Y0 * C:Y1 * C, X0 * C:X1 * C] = new
            picked.append(cs[i])
        return picked

    canopy = {}

    def canopy_cells(t):
        if t not in canopy:
            s_, c_, r_, w_, h_ = t
            op = (sheet(s_).a[r_ * T:(r_ + h_) * T, c_ * T:(c_ + w_) * T, 3] > 200).reshape(h_, T, w_, T).mean((1, 3))
            canopy[t] = [(i, j) for j in range(h_) for i in range(w_) if op[j, i] >= 0.5]
        return canopy[t]

    def canopy_on(m, t, x0, y0):
        cs = [(x0 + i, y0 + j) for i, j in canopy_cells(t) if 0 <= x0 + i < W and 0 <= y0 + j < H]
        return sum(m[y, x] for x, y in cs) / max(1, len(cs))

    def canopy_on_walk(t, x0, y0):
        return canopy_on(walkable, t, x0, y0)

    def cover(ks, m):
        for s_, c_, r_, w_, h_, x_, y_ in ks:
            m[max(0, y_):max(0, y_ + h_), max(0, x_):max(0, x_ + w_)] = True

    # A: vật nhiều ô được bỏ phiếu (nhà, cổng, cây lớn, đèn, rào).
    # Vật người dựng chỉ ra (--objects 'S:c,r,WxH@x,y;...': tranh máy dò không ra, như lab Oak) đặt trước; --clear
    # 'x0,y0,x1,y1;...' là vùng không trồng cây (ao, vườn hoa, hàng rào).
    fixed = []
    for o in filter(None, arg('--objects', '').split(';')):
        spec, at = o.split('@')
        s_, c_, r_, w_, h_ = [int(v) for v in spec.replace(':', ',').replace('x', ',').split(',')]
        at, _, rad = at.partition('~')      # '@x,y~2': thử lệch ±2 ô, lấy chỗ giảm sai số nhiều nhất
        x_, y_ = map(int, at.split(','))
        rad = int(rad or 0)
        k = max(((s_, c_, r_, w_, h_, x_ + dx, y_ + dy) for dx in range(-rad, rad + 1) for dy in range(-rad, rad + 1)),
                key=lambda kk: gain(kk)[0])
        _, upd = gain(k)
        if upd:
            Y0, Y1, X0, X1, new = upd
            canvas[Y0 * C:Y1 * C, X0 * C:X1 * C] = new
        fixed.append(k)
    big = fixed + greedy([k for k in cands if k[3] * k[4] > 1])
    taken = np.zeros((H, W), bool)
    cover(big, taken)
    for r_ in filter(None, arg('--clear', '').split(';')):
        x0, y0, x1, y1 = map(int, r_.split(','))
        taken[y0:y1 + 1, x0:x1 + 1] = True
    # B: rừng trên ô không đi được, chưa có vật. Loại cây mỗi gốc theo phiếu của các ô dưới tán (ô gần nhất có thuộc
    # tranh cây đó không) để giữ đúng tỉ lệ cây tròn/thông từng vùng; hoà phiếu thì lấy loại giảm sai số nhiều nhất.
    # Gốc có phiếu thì trồng kể cả khi sai số không giảm (ô rừng không chắc thành cây nguyên, không thành mảnh vụn);
    # không phiếu mà cũng không giảm sai số (nhà, ao, rào) thì bỏ trống.
    tree_tiles = {t: {(t[0], t[1] + i, t[2] + j) for i in range(t[3]) for j in range(t[4])} for t in trees}
    top3 = {(x, y): {tuple(bs[0][:3])} for y, x, bs in cells}   # chỉ ô tốt nhất: top-3 hay lẫn cây cùng màu
    def tree_votes(t, x0, y0):
        return sum(1 for i, j in canopy_cells(t) if tree_tiles[t] & top3.get((x0 + i, y0 + j), set()))
    for fy in range(-1, H + 2):
        for fx in range((fy % 2) - 2, W + 2, 2):
            best = None
            for t in trees:
                j, cols = tree_feet[t]
                k = (*t, fx - cols[0], fy - j)
                feet = [(fx - cols[0] + i, fy) for i in cols]
                if any(0 <= x < W and 0 <= y < H and (walkable[y, x] or taken[y, x]) for x, y in feet):
                    continue
                if canopy_on_walk(t, k[5], k[6]) > 0.3 or canopy_on(taken, t, k[5], k[6]) > 0.2:   # tán đè lối đi / vật
                    continue
                g, upd = gain(k)
                if upd is None:
                    continue
                v = tree_votes(t, k[5], k[6])
                if v < 0.3 * len(canopy_cells(t)) and g <= 0:   # không phải rừng (nhà, ao, rào): để nền trơn
                    continue
                score = (v, g)
                if best is None or score > best[0]:
                    best = (score, k, upd)
            if best:
                _, k, (Y0, Y1, X0, X1, new) = best
                canvas[Y0 * C:Y1 * C, X0 * C:X1 * C] = new
                forest.append(k)
    cover(forest, covered)
    # C: chi tiết ô lẻ (hoa, cỏ cao, gờ, biển) ở chỗ chưa bị cây che.
    small = greedy([k for k in cands if k[3] * k[4] == 1 and not covered[k[6], k[5]]])
    chosen = big + forest + small
    print(f'{W}x{H} ô, {len(forest)} cây rừng, {len(cands)} ứng viên, chọn {len(chosen)} con tem '
          f'({sum(1 for k in chosen if k[3] * k[4] > 1)} nhiều ô)')

    # hàng đáy (foot), vùng chặn, dựng lại ở độ phân giải thật
    lines, solid = [], np.zeros((H, W), bool)
    img = base.copy()
    rows = []
    for k in chosen:
        s, c, r, w, h, x, y = k
        px = sheet(s)[r * T:(r + h) * T, c * T:(c + w) * T]
        op = (px[..., 3] > 0.8).reshape(h, T, w, T).mean((1, 3))
        body = [j for j in range(h) if op[j].max() >= 0.25]
        base_row = body[-1] if body else h - 1
        foot = h - base_row
        rows.append((y + base_row, x, k, foot, op, base_row))
    rows.sort(key=lambda t: (t[0], t[1]))
    for by, _, k, foot, op, base_row in rows:
        s, c, r, w, h, x, y = k
        lines.append(f'{s}:{c},{r},{w}x{h} {x},{y}' + (f' foot={foot}' if foot != 1 or h != 1 else ''))
        if w * h > 1:   # chỉ hàng chân chặn; thân/tán phía trên do mặt nạ màu quyết định (tường nhà, kẽ rừng)
            for i in range(w):
                if op[base_row, i] >= 0.5 and 0 <= y + base_row < H and 0 <= x + i < W:
                    solid[y + base_row, x + i] = True
        px = sheet(s)[r * T:(r + h) * T, c * T:(c + w) * T]
        for j in range(h):
            for i in range(w):
                X, Y = x + i, y + j
                if 0 <= X < W and 0 <= Y < H:
                    t = px[j * T:(j + 1) * T, i * T:(i + 1) * T]
                    a = t[..., 3:4]
                    reg = img[Y * T:(Y + 1) * T, X * T:(X + 1) * T]
                    reg[..., :3] = t[..., :3] * a + reg[..., :3] * (1 - a)
    open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    grid = chr(10).join(''.join('#' if solid[y, x] or not walkable[y, x] else ',' if pathm[y, x] else '.' for x in range(W)) for y in range(H))
    open(out + '.grid.txt', 'w', encoding='utf-8', newline='\n').write(grid + '\n')
    side = Image.new('RGB', (W * T * 2 + 8, H * T))
    side.paste(Image.fromarray((R * 255).astype(np.uint8)), (0, 0))
    side.paste(Image.fromarray((img[..., :3] * 255).astype(np.uint8)), (W * T + 8, 0))
    side.save(out + '.png')
    err = np.sqrt(((coarse(img)[0] - Rc) ** 2).mean()) * 255
    print(f'sai số RMSE (khối 4 px) {err:.1f}; ghi {out}, .grid.txt, .png')


if __name__ == '__main__':
    main()
