# Chợ Phiên — bóc hình cho khung trên (quầy lều / xe), thảm làn theo gặp gỡ, khung token kỹ năng và quầng orb sự kiện.
# Chạy lại được:  py -3 -I games/bazaar/tools/stall.py [stall] [glow] [carpets] [tokens] [orbs]   (không đối số = tất cả)
# Nguồn: bundle bản demo (D:/Steam/.../The Bazaar Demo), UnityPy, bản Unity dự phòng 6000.3.11f1.
#  - stall:   mesh SM_Merchant_Tent_Platform_01 / SM_Merchant_Cart_Platform_01 / SM_Merchant_Tent_01 / Merchant_Cart_SM của
#             BoardButton_Merchant_Default_P, chiếu từ trên xuống (vật liệu URP Unlit nên chiếu UV là đúng hình camera thấy),
#             tấm đá thêm bản tắt (T_Merchants_Bases_Deactivated_C = rerollInactiveTexture, RerollButton.cs:136-185).
#             In ra hộp bao theo đơn vị thế giới (u) để top.js đặt ảnh (cách làm theo D:/bazaar-ref/notes/audit2/render_stall.py).
#  - glow:    viền sáng xanh khi rê chuột = mặt nạ FX_Platform_01 (lều) / FX_Platform_02 (xe) của FX_Highlight (vật liệu
#             FX_RerollLight/Glow/Center, FX_ExitLight/Glow/Center): kênh R = ruột, G = quầng, B = nét, A = quầng rộng.
#  - carpets: thảm Carpet_*_TD 2048x512 → art/board/carpets/<tên>.webp 1024x256, chỉ các thảm mà gặp gỡ của web dùng;
#             bảng thẻ → thảm từ D:/bazaar-ref/notes/audit2/out/carpet_by_encounter.tsv (carpetmap.py) → data/carpets.js.
#  - tokens:  khung kỹ năng Skill_Token_{Tier}_P (mesh SkillFrame_{Tier}_SM, tex SkillFrame_Token_TD) chiếu từ trên xuống
#             → art/ui/stall/token/<tier>.webp (bản 2D không có trong demo).
#  - orbs:    quầng orb FX_SimpleBacking_01_M (FX_Glow_01_T) + vòng FX_BubbleCircle_M, màu = startColor của hạt Backing / Detail
#             trong ParentReward_{Tier}_PV (FX_Reward_Idle_*) → art/ui/stall/orb/<tier>_glow.webp, ring.webp.
import sys, os, io, json, re, warnings
import numpy as np
from PIL import Image
warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
import UnityPy
UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.11f1"

D = "D:/Steam/steamapps/common/The Bazaar Demo/TheBazaar_Data/StreamingAssets/aa/StandaloneWindows64"
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, "art", "ui", "stall")
CARPET_OUT = os.path.join(GAME, "art", "board", "carpets")
CARPET_TSV = "D:/bazaar-ref/notes/audit2/out/carpet_by_encounter.tsv"
CARPET_SRC = "D:/bazaar-ref/notes/audit2/out/carpets"
PPU = 120  # px mỗi đơn vị thế giới cho ảnh xuất: sân khấu web 70,7 px/u (bước ổ 1,55 u = 109,6 px), ×1,7 cho màn DPR 2
TIERS = ["Bronze", "Silver", "Gold", "Diamond", "Legendary"]


def B(name):
    return D + "/" + name + ".bundle"


def save_webp(im, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "WEBP", quality=q, method=6)
    return os.path.getsize(path)


# ---------- chiếu mesh từ trên xuống ----------
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx, aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz)


def qrot(q, v):
    x, y, z, w = q; vx, vy, vz = v
    cx, cy, cz = y*vz-z*vy, z*vx-x*vz, x*vy-y*vx
    dx, dy, dz = y*cz-z*cy, z*cx-x*cz, x*cy-y*cx
    return (vx+2*(w*cx+dx), vy+2*(w*cy+dy), vz+2*(w*cz+dz))


def chain(objs, tr):
    stack = []; t = tr
    while t is not None:
        d = t.read_typetree(); stack.append(d)
        f = d["m_Father"]["m_PathID"]
        t = objs.get(f) if f else None
    pos = (0, 0, 0); rot = (0, 0, 0, 1); sc = (1, 1, 1)
    for d in reversed(stack):
        lp = d["m_LocalPosition"]; lr = d["m_LocalRotation"]; ls = d["m_LocalScale"]
        rp = qrot(rot, (lp["x"]*sc[0], lp["y"]*sc[1], lp["z"]*sc[2]))
        pos = (pos[0]+rp[0], pos[1]+rp[1], pos[2]+rp[2])
        rot = qmul(rot, (lr["x"], lr["y"], lr["z"], lr["w"]))
        sc = (sc[0]*ls["x"], sc[1]*ls["y"], sc[2]*ls["z"])
    return pos, rot, sc


def mesh_arrays(mesh):
    vl, tl, fl = [], [], []
    for ln in mesh.export().splitlines():
        q = ln.split()
        if not q: continue
        if q[0] == "v": vl.append([float(x) for x in q[1:4]])
        elif q[0] == "vt": tl.append([float(x) for x in q[1:3]])
        elif q[0] == "f":
            ids = [[int(t) if t else 0 for t in w.split("/")] for w in q[1:]]
            for n in range(1, len(ids)-1): fl.append([ids[0], ids[n], ids[n+1]])
    vm, vv, uu, idx = {}, [], [], []
    for tri in fl:
        row = []
        for t in tri:
            key = (t[0], t[1] if len(t) > 1 else 0)
            if key not in vm:
                vm[key] = len(vv); vv.append(vl[key[0]-1]); uu.append(tl[key[1]-1] if key[1] and tl else [0, 0])
            row.append(vm[key])
        idx.append(row)
    v = np.array(vv, float); v[:, 0] *= -1  # OBJ của UnityPy lật trục X (Unity tay trái)
    return v, np.array(uu, float), np.array(idx, int)


def raster(wv, uvs, tris, tex, x0w, z1w, W, H, ppu):
    img = np.zeros((H, W, 4), np.uint8); zb = np.full((H, W), -1e9)
    ta = np.asarray(tex.convert("RGBA")); th, tw = ta.shape[:2]
    for (i, j, k) in tris:
        p = [wv[i], wv[j], wv[k]]
        sx = [(q[0]-x0w)*ppu for q in p]; sy = [(z1w-q[2])*ppu for q in p]
        a0 = max(int(min(sx)), 0); a1 = min(int(max(sx))+1, W-1); b0 = max(int(min(sy)), 0); b1 = min(int(max(sy))+1, H-1)
        if a1 < a0 or b1 < b0: continue
        den = (sy[1]-sy[2])*(sx[0]-sx[2])+(sx[2]-sx[1])*(sy[0]-sy[2])
        if abs(den) < 1e-9: continue
        xs, ys = np.meshgrid(np.arange(a0, a1+1)+0.5, np.arange(b0, b1+1)+0.5)
        a = ((sy[1]-sy[2])*(xs-sx[2])+(sx[2]-sx[1])*(ys-sy[2]))/den
        b = ((sy[2]-sy[0])*(xs-sx[2])+(sx[0]-sx[2])*(ys-sy[2]))/den
        c = 1-a-b
        m = (a >= -1e-4) & (b >= -1e-4) & (c >= -1e-4)
        if not m.any(): continue
        zz = a*p[0][1]+b*p[1][1]+c*p[2][1]
        u = a*uvs[i][0]+b*uvs[j][0]+c*uvs[k][0]; v = a*uvs[i][1]+b*uvs[j][1]+c*uvs[k][1]
        tx = np.clip((u % 1.0*tw).astype(int), 0, tw-1); ty = np.clip(((1-(v % 1.0))*th).astype(int), 0, th-1)
        col = ta[ty, tx]
        sub = img[b0:b1+1, a0:a1+1]; zs = zb[b0:b1+1, a0:a1+1]
        upd = m & (zz > zs) & (col[..., 3] > 8)
        sub[upd] = col[upd]; zs[upd] = zz[upd]
    return Image.fromarray(img, "RGBA")


def main_tex(mat):
    te = mat.m_SavedProperties.m_TexEnvs
    for k, tv in (te.items() if isinstance(te, dict) else te):
        if k in ("_BaseMap", "_MainTex", "_BaseColorMap", "_Base_Color") and tv.m_Texture.m_PathID:
            try: return tv.m_Texture.read().image
            except Exception: pass
    return None


def go_parts(env, names):
    """{tên GameObject: [(vị trí, quay, tỉ lệ, mesh, vật liệu)]} cho các GameObject có MeshFilter + MeshRenderer."""
    objs = {o.path_id: o for o in env.objects}
    out = {}
    for o in env.objects:
        if o.type.name != "GameObject": continue
        g = o.read_typetree()
        if g["m_Name"] not in names: continue
        comps = [objs.get(c["component"]["m_PathID"]) for c in g["m_Component"]]
        tr = next((c for c in comps if c and c.type.name == "Transform"), None)
        mf = next((c for c in comps if c and c.type.name == "MeshFilter"), None)
        mr = next((c for c in comps if c and c.type.name == "MeshRenderer"), None)
        if not (tr and mf and mr): continue
        try: mesh = mf.read().m_Mesh.read()
        except Exception as e: print(g["m_Name"], "mesh lỗi", e); continue
        try: mat = mr.read().m_Materials[0].read()
        except Exception: mat = None
        out.setdefault(g["m_Name"], []).append(chain(objs, tr) + (mesh, mat))
    return out


def world_verts(part):
    pos, rot, sc, mesh, mat = part
    v, uv, tris = mesh_arrays(mesh)
    wv = [qrot(rot, (p[0]*sc[0], p[1]*sc[1], p[2]*sc[2])) for p in v]
    return [(p[0]+pos[0], p[1]+pos[1], p[2]+pos[2]) for p in wv], uv, tris


def render_part(part, tex, ppu=PPU, pad=0.0):
    wv, uv, tris = world_verts(part)
    xs = [p[0] for p in wv]; zs = [p[2] for p in wv]
    x0, x1, z0, z1 = min(xs)-pad, max(xs)+pad, min(zs)-pad, max(zs)+pad
    W, H = int(round((x1-x0)*ppu)), int(round((z1-z0)*ppu))
    return raster(wv, uv.tolist(), tris.tolist(), tex, x0, z1, W, H, ppu), (x0, z0, x1, z1)


# ---------- 1) quầy lều / xe ----------
def stall():
    extra = ["defaultlocalgroup_assets_assets_thebazaar_art_environments_tentsnew_sm_merchant_cart_platform_01.fbx",
             "defaultlocalgroup_assets_assets_thebazaar_art_environments_tentsnew_sm_merchant_tent_platform_01.fbx",
             "defaultlocalgroup_assets_assets_thebazaar_art_environments_tentsnew_t_merchants_bases_deactivated_c.png"]
    env = UnityPy.load(B("board_prefabs_assets_all"), *[B(x) for x in extra])
    off = None
    for o in env.objects:
        if o.type.name == "Texture2D":
            t = o.read()
            if "Deactivated" in t.m_Name: off = t.image
    todo = {"SM_Merchant_Tent_Platform_01": "platform_tent", "SM_Merchant_Cart_Platform_01": "platform_cart",
            "SM_Merchant_Tent_01": "tent", "Merchant_Cart_SM": "cart"}
    parts = go_parts(env, set(todo))
    layout = {}
    for nm, key in todo.items():
        lst = parts.get(nm) or []
        if not lst: print("THIẾU", nm); continue
        part = lst[0]
        tex = main_tex(part[4]) if part[4] is not None else None
        if tex is None: print("THIẾU tex", nm); continue
        im, bb = render_part(part, tex)
        n = save_webp(im, os.path.join(OUT, key + ".webp"))
        layout[key] = [round(x, 3) for x in bb]
        print(key, im.size, n, "byte, hộp u (x0,z0,x1,z1) =", layout[key])
        if key.startswith("platform") and off is not None:
            im2, _ = render_part(part, off)
            n = save_webp(im2, os.path.join(OUT, key + "_off.webp"))
            print(key + "_off", im2.size, n, "byte")
    print("STALL_LAYOUT", json.dumps(layout))


# ---------- 2) viền sáng xanh khi rê ----------
# Màu hạt của FX_Platform_* không đọc được (hệ hạt nằm trong prefab, startColor theo Gradient) nên lấy màu đo từ khung clip
# ref/merchant-enter/30.jpg (viền #5ccfff, ruột biểu tượng #3aa8ff, nét gần trắng) [ĐO TRÊN CLIP].
def glow():
    env = UnityPy.load(B("board_prefabs_assets_all"), B("materials_fx_assets_all"), B("textures_fx_assets_all"))
    want = {"FX_RerollGlow_01_Blend": "glow_reroll", "FX_ExitGlow_01_M": "glow_exit"}
    for o in env.objects:
        if o.type.name != "Material": continue
        m = o.read()
        if m.m_Name not in want: continue
        tex = main_tex(m)
        if tex is None: print("THIẾU", m.m_Name); continue
        a = np.asarray(tex.convert("RGBA")).astype(float) / 255
        R, G, Bc, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
        # cộng dồn (blend cộng như hạt): quầng rộng A + quầng G màu xanh, ruột R xanh đậm, nét B gần trắng
        col = np.zeros(a.shape[:2] + (3,))
        alp = np.zeros(a.shape[:2])
        for ch, rgb, k in ((A, (0.24, 0.62, 1.0), 0.55), (G, (0.36, 0.81, 1.0), 0.9), (R, (0.23, 0.66, 1.0), 0.75), (Bc, (0.88, 0.97, 1.0), 1.0)):
            col += ch[..., None] * np.array(rgb) * k
            alp = np.maximum(alp, ch * k)
        col = np.clip(col, 0, 1)
        out = np.dstack([col * 255, np.clip(alp, 0, 1) ** 0.6 * 255]).astype(np.uint8)  # quầng mềm sáng hơn (hạt cộng dồn nhiều lớp)
        im = Image.fromarray(out, "RGBA")
        # mặt nạ vuông 512 phủ lên ô 6,5 x 3,29 u: xuất 780 x 395 (PPU) rồi để CSS kéo đúng hộp bấm
        im = im.resize((int(6.5 * PPU), int(3.29 * PPU)), Image.LANCZOS)
        if want[m.m_Name] == "glow_reroll": im = im.transpose(Image.FLIP_LEFT_RIGHT)  # biểu tượng reroll ở góc dưới-phải ô trái
        n = save_webp(im, os.path.join(OUT, want[m.m_Name] + ".webp"))
        print(want[m.m_Name], im.size, n, "byte")


# ---------- 3) thảm làn ----------
def carpets():
    enc_js = open(os.path.join(GAME, "data", "encounters.js"), encoding="utf-8").read()
    E = json.loads(enc_js[enc_js.index("{", enc_js.index("BZ_ENCOUNTERS")):enc_js.rindex("}") + 1])
    recs = {}
    for k in ("events", "pedestals", "combats", "starts"):
        for i, r in (E.get(k) or {}).items(): recs[i] = r
    rows = [l.rstrip("\r\n").split("\t") for l in open(CARPET_TSV, encoding="utf-8")][1:]
    mp, used, skipped, by_asset = {}, {}, 0, {}
    def take(cid, name):
        if not os.path.exists(os.path.join(CARPET_SRC, name + "_TD.png")): print("thiếu ảnh thảm", name); return
        mp[cid] = name; used[name] = used.get(name, 0) + 1
    for r in rows:
        if len(r) < 4 or not r[3]: continue
        name = r[3].replace("_CarpetData", "")
        m = re.match(r"(Merchant|Event|Monster|Pedestal)_(.+?)_(MerchantData|QuestData|CombatData|PedestalData)$", r[2] or "")
        if m: by_asset.setdefault(m.group(2).lower(), name)
        if not r[0]: continue
        if r[0] not in recs: skipped += 1; continue
        take(r[0], name)
    # thẻ thật không có dòng riêng (chỉ bản Tutorial / [DEBUG] dùng cùng tệp dữ liệu Merchant_<Tên>_MerchantData): khớp theo tên
    by_name = 0
    for i, r in recs.items():
        if i in mp: continue
        key = re.sub(r"[^a-z0-9]", "", (r.get("Title") or r.get("InternalName") or "").lower())
        if key and key in by_asset: take(i, by_asset[key]); by_name += 1
    print("khớp thêm theo tên tệp dữ liệu:", by_name)
    total = 0
    if os.path.isdir(CARPET_OUT):  # bỏ ảnh của lần chạy trước không còn gặp gỡ nào dùng
        for f in os.listdir(CARPET_OUT):
            if f.endswith(".webp") and f[:-5] not in used: os.remove(os.path.join(CARPET_OUT, f))
    for name in sorted(used):
        im = Image.open(os.path.join(CARPET_SRC, name + "_TD.png")).convert("RGB").resize((1024, 256), Image.LANCZOS)
        total += save_webp(im, os.path.join(CARPET_OUT, name + ".webp"), q=80)
    with open(os.path.join(GAME, "data", "carpets.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("// Sinh bởi tools/stall.py, đừng sửa tay. Thảm làn của từng thẻ gặp gỡ (EncounterAssetDataSO.encounterCarpet,\n"
                "// BoardManager.cs:1711-1720), bảng D:/bazaar-ref/notes/audit2/out/carpet_by_encounter.tsv. Ảnh: art/board/carpets/<tên>.webp.\n")
        f.write("window.BZ_CARPETS = " + json.dumps(mp, ensure_ascii=False, sort_keys=True, indent=0).replace("\n", "") + ";\n")
    print("thảm:", len(used), "ảnh,", total, "byte; gặp gỡ có thảm:", len(mp), "; dòng tsv không có trong web:", skipped)


# ---------- 4) khung token kỹ năng ----------
def tokens():
    env = UnityPy.load(B("skills_assets_all"))
    names = set("SkillFrame_%s_SM" % t for t in TIERS) | {"Skill_Frame_Shadow_SM"}
    parts = go_parts(env, names)
    for t in TIERS:
        lst = parts.get("SkillFrame_%s_SM" % t)
        if not lst: print("THIẾU khung", t); continue
        part = lst[0]
        tex = main_tex(part[4]) if part[4] is not None else None
        if tex is None: print("THIẾU tex khung", t); continue
        wv, _, _ = world_verts(part)
        xs = [p[0] for p in wv]; zs = [p[2] for p in wv]
        span = max(max(xs)-min(xs), max(zs)-min(zs))
        ppu = int(512 / span)
        im, bb = render_part(part, tex, ppu=ppu)
        # mặt sau của tấm đế (dưới icon) chiếu lên thành mảng atlas: đục tròn bán kính 0,415 u quanh tâm token để icon
        # (Icon_Skill_*, gán vào _skillIconMaterial) lộ ra; icon trên web phủ bán kính 0,42 u (80 % khung Đồng 1,054 u)
        a = np.array(im); hh, ww = a.shape[:2]
        yy, xx = np.mgrid[0:hh, 0:ww]
        cx, cy = (0 - bb[0]) * ppu, (bb[3] - 0) * ppu
        a[((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2) < (0.415 * ppu) ** 2, 3] = 0
        im = Image.fromarray(a, "RGBA")
        n = save_webp(im, os.path.join(OUT, "token", t.lower() + ".webp"))
        print("token", t, im.size, n, "byte, hộp u", [round(x, 3) for x in bb])


# ---------- 5) quầng orb ----------
def particle_colors(env):
    """{tier: {Backing: (r,g,b,a), Detail: (...)}} từ FX_Reward_Idle_<tier> trong ParentReward_<tier>_PV."""
    objs = {o.path_id: o for o in env.objects}
    out = {}
    for o in env.objects:
        if o.type.name != "GameObject": continue
        g = o.read_typetree()
        if g["m_Name"] not in ("Backing", "Detail"): continue
        comps = [objs.get(c["component"]["m_PathID"]) for c in g["m_Component"]]
        tr = next((c for c in comps if c and c.type.name == "Transform"), None)
        ps = next((c for c in comps if c and c.type.name == "ParticleSystem"), None)
        if not (tr and ps): continue
        path = []; t = tr
        while t is not None:
            d = t.read_typetree(); go = objs.get(d["m_GameObject"]["m_PathID"])
            path.append(go.read_typetree()["m_Name"] if go else "?")
            f = d["m_Father"]["m_PathID"]; t = objs.get(f) if f else None
        idle = next((p for p in path if p.startswith("FX_Reward_Idle_")), None)
        if not idle: continue
        tier = idle.replace("FX_Reward_Idle_", "")
        c = ps.read_typetree()["InitialModule"]["startColor"]["maxColor"]
        out.setdefault(tier, {})[g["m_Name"]] = (c["r"], c["g"], c["b"], c["a"])
    return out


def orbs():
    bundles = [B("defaultlocalgroup_assets_assets_thebazaar_art_rewards_parentreward_%s_pv.prefab" % t.lower()) for t in TIERS]
    bundles = [b for b in bundles if os.path.exists(b)]
    env = UnityPy.load(*bundles, B("materials_fx_assets_all"), B("textures_fx_assets_all"))
    cols = particle_colors(env)
    print("màu hạt:", json.dumps({k: {n: "#%02x%02x%02x/%.2f" % (int(c[0]*255), int(c[1]*255), int(c[2]*255), c[3]) for n, c in v.items()} for k, v in cols.items()}))
    glow_t = ring_t = None
    for o in env.objects:
        if o.type.name != "Material": continue
        m = o.read()
        if m.m_Name == "FX_SimpleBacking_01_M": glow_t = main_tex(m)
        elif m.m_Name == "FX_BubbleCircle_M": ring_t = main_tex(m)
    if glow_t is not None:
        g = np.asarray(glow_t.convert("RGBA")).astype(float) / 255
        lum = np.maximum(g[..., 3] * g[..., :3].max(axis=2), 0)
        for t, cc in cols.items():
            c = cc.get("Backing")
            if not c: continue
            out = np.dstack([np.full(lum.shape, c[0]*255), np.full(lum.shape, c[1]*255), np.full(lum.shape, c[2]*255), lum * c[3] * 255]).astype(np.uint8)
            im = Image.fromarray(out, "RGBA").resize((256, 256), Image.LANCZOS)
            print("orb glow", t, save_webp(im, os.path.join(OUT, "orb", t.lower() + "_glow.webp")), "byte")
    else: print("THIẾU FX_SimpleBacking_01_M")
    if ring_t is not None:
        im = ring_t.convert("RGBA").resize((256, 256), Image.LANCZOS)
        print("orb ring", save_webp(im, os.path.join(OUT, "orb", "ring.webp")), "byte")
    else: print("THIẾU FX_BubbleCircle_M (vòng orb)")
    with open(os.path.join(OUT, "orb", "colors.json"), "w", encoding="utf-8") as f:
        json.dump({k: {n: [round(x, 3) for x in c] for n, c in v.items()} for k, v in cols.items()}, f, indent=1)


if __name__ == "__main__":
    steps = sys.argv[1:] or ["stall", "glow", "carpets", "tokens", "orbs"]
    for s in steps:
        print("==", s); globals()[s]()
