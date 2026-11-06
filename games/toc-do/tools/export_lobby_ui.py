# Xuất ảnh sảnh, chọn chế độ, ghép phòng, màn tải từ APK -> art/lobby/*.webp (nhánh Sảnh).
# Chạy: ~/zingspeed-ref/venv/bin/python -I games/toc-do/tools/export_lobby_ui.py [--sheet đường_dẫn.png]
#       ... export_lobby_ui.py --stage   sân khấu sảnh 3D Lobby_L_Art.unity -> art/lobby/stage.glb + stage.json (camera gốc)
#
# Nguồn (đường dẫn container gốc, tra bằng zs.find):
#   uitextures/id_lobby/icon_4*          ô chế độ ở sảnh (Xuất Phát, Giải Đấu, Cốt Truyện, Khu Giải Trí)
#   ui/room/#normalwaitingroom/.../utex  thẻ "Chọn kiểu phòng đua" (og_selectgamemodeldialog: nền + hình bánh xe / heo UFO)
#   ui/gamemode/#sweetbumpergame/uitextures/id_loadingbg  dải thẻ người chơi màn tải (loadingplayerblue/red/yellowitem)
#   uitextures/id_thing/id_car/01ncar/ncar_<id>  biểu tượng xe trên thẻ người chơi
#   ID_HeroIconLoading_01 / Icon_PlayerQQ_Splited  chân dung mẫu trên thẻ màn tải, dùng làm ảnh đại diện nam/nữ
#   atlas NGUI og_lobby / og_common      biểu tượng thanh dưới, xu, cài đặt, khoá, chấm đỏ, nút quay lại
# APK không có ô "Huấn Luyện" màu lục của bản VN 2020 (sprite Icon_4Training chỉ được tham chiếu, không có ảnh):
# dựng tạm bằng cách xoay sắc độ ô Cốt Truyện (Icon_4StoryLine_02) sang lục, xem training_tile().
import colorsys
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402
import build_ui  # noqa: E402
import ui_rip  # noqa: E402
import zs  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

OUT = os.path.join(HERE, '..', 'art', 'lobby')
RB = 'assets/resforassetbundles/'
CARS = ['04', '06', '16', '55', '175', '254', '284', '297']

# tên tệp ra -> đường dẫn container của Texture2D gốc
TEX = {
    'tile_start': 'uitextures/id_lobby/icon_4pvp_01@rgba32_splited.png',
    'tile_rank': 'uitextures/id_lobby/icon_4championships_01@rgba32_splited.png',
    'tile_story': 'uitextures/id_lobby/icon_4storyline_02@rgba32_splited.png',
    'tile_leisure': 'uitextures/id_lobby/icon_4pve_02@rgba32_splited.png',
    'mode_speed': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/bg_singlespeed_splited.png',
    'mode_speedTeam': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/bg_teamspeed_splited.png',
    'mode_item': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/bg_singleprop_splited.png',
    'mode_itemTeam': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/bg_teamprop_splited.png',
    'icon_speed': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/icon_singlespeed_2_splited.png',
    'icon_speedTeam': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/icon_teamspeed_2_splited.png',
    'icon_item': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/icon_singleprop_2_splited.png',
    'icon_itemTeam': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/utex/icon_encounterprop_2_splited.png',
    'match_bg': 'ui/#common/artwork/reftex/bg_view15_splited.png',
    'avatar_ring': 'uitextures/id_thing/id_headportrait/00default/default_00000_splited.png',
}
TEX.update({'car_' + c: 'uitextures/id_thing/id_car/01ncar/ncar_%05d_splited.png' % int(c) for c in CARS})

# Texture không có đường dẫn container riêng (prefab trỏ thẳng tới): tên tệp ra -> (prefab dùng nó, m_Name của Texture2D)
BY_NAME = {
    'card_blue': ('ui/#loading/loadingplayerblueitem.prefab', 'ID_LoadingBG_01_Splited'),
    'card_red': ('ui/#loading/loadingplayerreditem.prefab', 'ID_LoadingBG_03_Splited'),
    'card_gold': ('ui/#loading/loadingplayeryellowitem.prefab', 'ID_LoadingBG_04_Splited'),
    'avatar_nam': ('ui/#loading/loadingplayerblueitem.prefab', 'ID_HeroIconLoading_01'),
    'avatar_nu': ('ui/#lobbyhome/moderoot.prefab', 'Icon_PlayerQQ_Splited'),
}

# tên tệp ra -> tên sprite NGUI (tìm trong các atlas ATLAS theo thứ tự)
SPRITES = {
    'bar_garage': 'Icon_2Room',
    'bar_skills': 'Icon_2Licence',
    'bar_ach': 'Icon_2Achievement',
    'bar_shop': 'Btn_Shop',
    'bar_quests': 'Icon_TaskHead',
    'bar_bg': 'BG_Bottom',
    'lock': 'Icon_Lock',
    'back': 'Btn_Back',
    'redpoint': 'Icon_RedPoint_07',
    'coin': 'Icon_1Gold',
    'gear': 'Icon_1Setting',
    'exp_fg': 'Icon_ProgressYellow',
    'tag_recommend': 'Tag_Recommend',
    'title_floor': 'BG_TabFloor_01',
    'title_arrow': 'Icon_Arrow_Yellow_01',
    'btn_cancel': 'Btn_Cancel_new',
}
ATLAS = {
    'og_lobby': 'ui/#lobbyhome/artwork/atlas/og_lobby/og_lobby.prefab',
    'og_lobby_ui3': 'ui/#lobbyhome/artwork/atlas/og_lobby_ui3/og_lobby_ui3.prefab',
    'og_common': 'ui/#common/artwork/atlas/og_common/og_common.prefab',
    'og_normalwaitingroom_ui3': 'ui/room/#normalwaitingroom/artwork/atlas/og_normalwaitingroom_ui3/og_normalwaitingroom_ui3.prefab',
    'og_room_ui3': 'ui/room/#roomcommon/artwork/atlas/og_room_ui3/og_room_ui3.prefab',
}
MAXD = 512   # cạnh dài tối đa; ảnh gốc lớn nhất là 512


def bundles_for(paths):
    want = {RB + p for p in paths}
    return sorted({r['f'] for r in zs.index() if want.intersection(r['cont'])})


def load_textures(paths):
    """{đường dẫn container: PIL RGBA}. Bản _splited đi kèm _splitedalpha (kênh alpha tách riêng) thì ghép lại."""
    alpha = {p: p.replace('_splited.png', '_splitedalpha.png') for p in paths}
    allp = set(paths) | set(alpha.values())
    env, _ = zs.load_with_deps(bundles_for(allp), depth=0)
    got = {}
    for path, obj in env.container.items():
        rel = path[len(RB):] if path.startswith(RB) else path
        if rel in allp and obj.type.name == 'Texture2D':
            got[rel] = obj.read().image.convert('RGBA')
    out = {}
    for p in paths:
        if p not in got:
            raise SystemExit('texture not found: ' + p)
        im = got[p]
        a = got.get(alpha[p])
        if a is not None:
            im.putalpha(a.convert('L').resize(im.size))
        out[p] = im
    return out


def load_named(want):
    """want = {tên ra: (prefab, m_Name)} -> {tên ra: PIL}: dựng prefab bằng build_ui.Builder (lần theo con trỏ UITexture
    sang bundle khác), lấy ảnh theo tên."""
    rip = ui_rip.Rip()
    built, out = {}, {}
    for k, (prefab, n) in want.items():
        if prefab not in built:
            built[prefab] = build_ui.Builder(rip)
            built[prefab].node(build_ui.container(rip, prefab[len('ui/'):]), (.5, .5), True)
        imgs = built[prefab].images
        if n not in imgs:
            raise SystemExit('texture not found: %s in %s' % (n, prefab))
        out[k] = imgs[n][0].convert('RGBA')
    return out


def load_sprites(want):
    """want = {tên sprite} -> {tên: PIL}. Đọc UIAtlas (MonoBehaviour có mSprites) + _MainTex của material qua ui_rip.Rip
    (tự nạp bundle chứa texture theo tên CAB, như build_ui.py). Một bundle atlas có thể chứa nhiều UIAtlas."""
    rip = ui_rip.Rip()
    out, names = {}, set(want)
    for apath in ATLAS.values():
        for rel in bundles_for([apath]):
            for cab in rip.load(rel):
                for o in list(rip.files[cab].objects.values()):
                    if o.type.name != 'MonoBehaviour' or not names:
                        continue
                    try:
                        t = rip.tree(cab, o)
                    except Exception:
                        continue
                    sprites = {s['name']: s for s in t.get('mSprites') or []}
                    hit = names & set(sprites)
                    mat = rip.resolve(t.get('material'), cab) if hit else None
                    img = None
                    for name, envt in (rip.tree(*mat)['m_SavedProperties']['m_TexEnvs'] if mat else []):
                        if name == '_MainTex':
                            img = rip._texture(envt['m_Texture'], mat[0])
                    if img is None:
                        continue
                    img = img.convert('RGBA')
                    for n in hit:
                        sp = sprites[n]
                        out[n] = img.crop((sp['x'], sp['y'], sp['x'] + sp['width'], sp['y'] + sp['height']))
                    names -= hit
    if names:
        raise SystemExit('sprites not found: %s' % sorted(names))
    return out


def training_tile(story):
    """Ô Huấn Luyện tạm: xoay sắc độ ô Cốt Truyện xanh dương (~0,57) sang lục ngọc (~0,42) như ô 训练 bản 2018."""
    a = np.asarray(story).astype(np.float32) / 255
    rgb = a[..., :3].reshape(-1, 3)
    hsv = np.array([colorsys.rgb_to_hsv(*p) for p in rgb])
    hsv[:, 0] = (hsv[:, 0] - 0.15) % 1
    rgb = np.array([colorsys.hsv_to_rgb(*p) for p in hsv]).reshape(a.shape[:2] + (3,))
    out = np.concatenate([rgb, a[..., 3:]], axis=2)
    return Image.fromarray((out * 255).round().astype(np.uint8), 'RGBA')


def save(name, im):
    bb = im.getchannel('A').getbbox()
    if bb:
        im = im.crop(bb)
    s = MAXD / max(im.size)
    if s < 1:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=90, method=6)
    return im


def export_stage():
    """Sân khấu sảnh Scenes/StateScene/Lobby_L_Art.unity (bản nhẹ của Lobby_Art) như export_podium.py: mỗi renderer×submesh
    một primitive, vật liệu ghi kiểu vẽ vào extras (opaque|blend|add, tint) để web vẽ bằng MeshBasic. Lưới dựng sẵn của Unity
    (unity default resources) không có trong APK: bỏ qua và ghi log."""
    import json
    import subprocess
    import export_podium as EP
    import export_track as T
    scene = 'Lobby_L_Art.unity'
    rows = [r for r in zs.find(scene) if any(c.endswith('/' + scene) for c in r['cont'])]
    env = T.load_with_deps([rows[0]['f']])
    S = T.Scene(T.find_scene_file(env, scene))
    glb, texs, meshes = T.GLB(), T.Textures(), T.MeshCache()
    tex_glb, mat_glb, prims, skipped = {}, {}, 0, []
    for pid, t in S.typ.items():
        if t != 'MeshRenderer':
            continue
        R = S.tt[pid]
        g = R['m_GameObject']['m_PathID']
        if not S.active[g] or not R['m_Enabled']:
            continue
        try:
            mesh = S.O[S.comp(g, 'MeshFilter')[0]].read().m_Mesh.deref_parse_as_object()
        except FileNotFoundError:
            skipped.append(S.path[g])
            continue
        M, world = meshes.get(mesh), S.world[g]
        rmats = S.O[pid].read().m_Materials
        for si, tri in enumerate(M['subs']):
            if si >= len(rmats) or not len(tri):
                continue
            mat = T.Mat(rmats[si].deref_parse_as_object())
            kind = EP.kind_of(mat)
            slot = '_MainTex' if '_MainTex' in mat.tex else mat.albedo_slot
            mk = (rmats[si].m_FileID, rmats[si].m_PathID)
            if mk not in mat_glb:
                tint = mat.c.get('_Color') or {'r': 1, 'g': 1, 'b': 1, 'a': 1}
                tc = [tint['r'], tint['g'], tint['b']] if max(tint['r'], tint['g'], tint['b']) > 0.02 else [1, 1, 1]
                gm = {'name': mat.name, 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.0, 'roughnessFactor': 1.0},
                      'extras': {'shader': mat.shader, 'kind': kind, 'tint': [round(x, 3) for x in tc], 'alpha': round(tint['a'], 3)}}
                ti = texs.get(mat, slot, 1024, kind != 'opaque') if slot else None
                if ti is not None:
                    if ti not in tex_glb:
                        tex_glb[ti] = glb.image(texs.images[ti]['data'])
                    gm['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex_glb[ti]}
                glb.j['materials'].append(gm)
                mat_glb[mk] = len(glb.j['materials']) - 1
            used = np.unique(tri)
            remap = np.full(len(M['pos']), -1, dtype=np.int64)
            remap[used] = np.arange(len(used))
            P = (((world[:3, :3] @ M['pos'][used].T).T + world[:3, 3]) * [1, 1, -1]).astype(np.float32)
            uv = M['uv0'][used] if M['uv0'] is not None else np.zeros((len(used), 2))
            su, sv, ou, ov = mat.st(slot) if slot else (1, 1, 0, 0)
            uv = uv * [su, sv] + [ou, ov]
            tr = remap[tri]
            if np.linalg.det(world[:3, :3]) > 0:
                tr = tr[:, [0, 2, 1]]
            attrs = {'POSITION': glb.acc(P, 'VEC3', 34962, True),
                     'TEXCOORD_0': glb.acc(np.stack([uv[:, 0], 1 - uv[:, 1]], 1).astype(np.float32), 'VEC2', 34962)}
            if M['col'] is not None and kind != 'opaque':
                attrs['COLOR_0'] = glb.acc(M['col'][used].astype(np.float32), 'VEC4', 34962)
            name = S.tt[g]['m_Name']
            glb.j['meshes'].append({'name': name, 'primitives': [{'attributes': attrs, 'indices': glb.acc(tr.reshape(-1).astype(np.uint32), 'SCALAR', 34963), 'material': mat_glb[mk]}]})
            glb.j['nodes'].append({'name': name, 'mesh': len(glb.j['meshes']) - 1})
            glb.j['scenes'][0]['nodes'].append(len(glb.j['nodes']) - 1)
            prims += 1
    raw, path = os.path.join(OUT, 'stage.raw.glb'), os.path.join(OUT, 'stage.glb')
    glb.write(raw)
    r = subprocess.run(['npx', '-y', '@gltf-transform/cli@4', 'meshopt', raw, path], capture_output=True, text=True)
    if r.returncode:
        os.replace(raw, path)
    else:
        os.remove(raw)
    cam = next(g for g, p in S.path.items() if p == '/Main Camera')
    cw = S.world[cam]
    fwd = cw[:3, :3] @ np.array([0, 0, 1.0])
    fov = next((S.O[c].read_typetree().get('field of view') for c in S.comps[cam] if S.typ.get(c) == 'Camera'), 40)
    meta = {'scene': scene, 'primitives': prims, 'skipped': skipped,
            'camera': {'p': [round(float(cw[0, 3]), 3), round(float(cw[1, 3]), 3), round(float(-cw[2, 3]), 3)],
                       'fwd': [round(float(fwd[0]), 3), round(float(fwd[1]), 3), round(float(-fwd[2]), 3)], 'fov': round(float(fov), 2)}}
    json.dump(meta, open(os.path.join(OUT, 'stage.json'), 'w'), indent=1)
    print(prims, 'primitive,', len(skipped), 'bỏ qua,', round(os.path.getsize(path) / 1e6, 2), 'MB', meta['camera'])


def main():
    if '--stage' in sys.argv:
        os.makedirs(OUT, exist_ok=True)
        return export_stage()
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    os.makedirs(OUT, exist_ok=True)
    tex = load_textures(list(TEX.values()))
    spr = load_sprites(set(SPRITES.values()))
    done = {}
    for name, p in TEX.items():
        done[name] = save(name, tex[p])
    for name, im in load_named(BY_NAME).items():
        done[name] = save(name, im)
    done['tile_training'] = save('tile_training', training_tile(tex[TEX['tile_story']]))
    for name, k in SPRITES.items():
        done[name] = save(name, spr[k])
    print(len(done), 'ảnh ->', os.path.normpath(OUT))
    if sheet:
        keys = sorted(done)
        W, cols = 160, 8
        rows = (len(keys) + cols - 1) // cols
        im = Image.new('RGBA', (cols * W, rows * (W + 16)), (40, 44, 60, 255))
        dr = ImageDraw.Draw(im)
        for i, k in enumerate(keys):
            t = done[k].copy()
            t.thumbnail((W - 8, W - 8))
            x, y = (i % cols) * W, (i // cols) * (W + 16)
            im.alpha_composite(t, (x + 4, y + 4))
            dr.text((x + 4, y + W), k, fill=(255, 255, 0, 255))
        im.save(sheet)


main()
