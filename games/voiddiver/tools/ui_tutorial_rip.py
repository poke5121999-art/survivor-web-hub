# -*- coding: utf-8 -*-
"""ui_tutorial_rip.py - boc giao dien huong dan cua tutorial (Campaign 1100) tu ban demo VOID DIVER.

    set PYTHONIOENCODING=utf-8
    python tools/ui_tutorial_rip.py

Ra (art/ui/tutorial/):
    guides.json      bang huong dan nam tren san cua tung sector (TutorialGuides/Keyboard, TutorialGuide) +
                     khung bo qua cat canh (CutscenePanel) + phim cua hop thoai (DialogPopup/Keys[]) +
                     bang phim HUD (StageScene/.../KeyGuidePanel!)
    <Texture>.webp   anh RawImage cua bang huong dan (ImgTuto01..)
    key/<Sprite>.webp   anh phim (Escape_Key, F_Key, Space_Key, Ctrl_Key, O_Key, Tab_Key...) + vong do giu (circle_38_*)

Do duoc (2026-09-25):
- Bang huong dan la con cua prefab sector (remote_prefab_assets_sector): <SectorId>/StaticDecoration/TutorialGuides/
  {Keyboard,Gamepad}/<Ten>TutorialGuide[Pad]; 10004 thi StaticDecoration/TutorialGuide/DirectionTutorialGuide*.
  II_DeviceBasedObjectController bat nhom Keyboard hoac Gamepad theo thiet bi. Khong MonoBehaviour nao an/hien theo buoc.
- Moi bang: WorldSpaceCanvas xoay X 90 do (nam phang tren san), RawImage (material Mtl_DE_WorldUI_Lit) kich thuoc tinh bang
  met, chu TMP scale 0.01 (1 px = 1 cm), LocalizationText.Key.
- Toa do trong json: Unity, tuong doi goc sector (chua xoay sector), yaw do Unity (+ la quay +z sang +x).
"""
import io, json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vd_common as vd

GAME = os.path.dirname(HERE)
OUT = os.path.join(GAME, 'art', 'ui', 'tutorial')
MONO = 'be9e4d904692f945f3910b57349aeb09_monoscripts'
SECTORS = ('10009', '10001', '10004')


def comps(g):
    for c in g.m_Component:
        ob = c.component if hasattr(c, 'component') else c
        try:
            o = ob.deref()
        except FileNotFoundError as e:
            if any(b in str(e).lower() for b in vd.BUILTIN):
                continue
            raise
        if o is not None:
            yield o


def tr_of(g):
    for o in comps(g):
        if o.type.name in ('Transform', 'RectTransform'):
            return o.read()


def go_of(tr):
    return tr.m_GameObject.deref().read()


def children(tr):
    return [c.deref().read() for c in tr.m_Children]


def root_of(tr):
    while tr.m_Father.path_id:
        tr = tr.m_Father.deref().read()
    return tr


def mat4(tr):
    """Ma tran cuc bo (Unity) tu TRS."""
    p, q, s = tr.m_LocalPosition, tr.m_LocalRotation, tr.m_LocalScale
    x, y, z, w = q.x, q.y, q.z, q.w
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4)
    m[:3, :3] = r * np.array([s.x, s.y, s.z])
    m[:3, 3] = [p.x, p.y, p.z]
    return m


def world_of(tr, stop):
    """Ma tran tu tr len toi (khong gom) stop."""
    m = np.eye(4)
    while tr is not None and tr.m_GameObject.path_id != stop.m_GameObject.path_id:
        m = mat4(tr) @ m
        tr = tr.m_Father.deref().read() if tr.m_Father.path_id else None
    return m


def class_map(env):
    """path_id MonoScript -> ten day du (Namespace.Class), khop ten trong vd-ref/cache/monoscripts.json."""
    out = {}
    for o in env.objects:
        if o.type.name == 'MonoScript':
            d = o.read()
            out[o.path_id] = (d.m_Namespace + '.' if d.m_Namespace else '') + d.m_ClassName
    return out


def mb_class(o, cmap):
    try:
        return cmap.get(o.parse_monobehaviour_head().m_Script.path_id, '?')
    except FileNotFoundError:
        raise
    except Exception:
        return '?'


def rgba(c):
    return [round(c.r, 4), round(c.g, 4), round(c.b, 4), round(c.a, 4)]


def save_img(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert('RGBA').save(path, 'WEBP', quality=92, method=6)


def rect(tr):
    return {'size': [round(tr.m_SizeDelta.x, 3), round(tr.m_SizeDelta.y, 3)],
            'apos': [round(tr.m_AnchoredPosition.x, 3), round(tr.m_AnchoredPosition.y, 3)],
            'pivot': [tr.m_Pivot.x, tr.m_Pivot.y], 'anchor': [tr.m_AnchorMin.x, tr.m_AnchorMin.y, tr.m_AnchorMax.x, tr.m_AnchorMax.y],
            'scale': [round(tr.m_LocalScale.x, 4), round(tr.m_LocalScale.y, 4)]}


def read_graphic(tr, cmap, textures):
    """RawImage / TMP tren mot node canvas."""
    g = go_of(tr)
    out = None
    for o in comps(g):
        if o.type.name != 'MonoBehaviour':
            continue
        cn = mb_class(o, cmap)
        if cn == 'UnityEngine.UI.RawImage':
            d = o.read()
            tex = vd.deref(d.m_Texture)
            mat = vd.deref(d.m_Material)
            name = tex.m_Name if tex else None
            if tex and name not in textures:
                textures[name] = tex
            uv = d.m_UVRect
            out = dict(kind='image', node=g.m_Name, texture=name, color=rgba(d.m_Color),
                       material=mat.m_Name if mat else None, uv=[uv.x, uv.y, uv.width, uv.height], **rect(tr))
        elif cn == 'TMPro.TextMeshProUGUI':
            t = o.read_typetree()
            out = out or {}
            out.update(kind='text', node=g.m_Name, text=t.get('m_text'), color=[round(t['m_fontColor'][k], 4) for k in 'rgba'],
                       fontSize=t.get('m_fontSize'), fontSizeMin=t.get('m_fontSizeMin'), fontSizeMax=t.get('m_fontSizeMax'),
                       autoSize=bool(t.get('m_enableAutoSizing')), hAlign=t.get('m_HorizontalAlignment'), vAlign=t.get('m_VerticalAlignment'),
                       **rect(tr))
        elif cn == 'LocalizationText':
            out = out or {}
            out['key'] = o.read_typetree().get('Key')
    return out


def guide_entry(tr, sector_root, cmap, textures):
    g = go_of(tr)
    m = world_of(tr, sector_root)          # guide -> goc sector (Unity)
    fwd = m[:3, :3] @ np.array([0, 0, 1.0])
    yaw = math.degrees(math.atan2(fwd[0], fwd[2]))
    sc = [float(np.linalg.norm(m[:3, i])) for i in range(3)]
    ent = {'name': g.m_Name, 'pos': [round(float(v), 4) for v in m[:3, 3]], 'yaw': round(yaw, 3), 'scale': [round(v, 4) for v in sc], 'parts': []}
    for canvas in children(tr):
        if go_of(canvas).m_Name != 'WorldSpaceCanvas':
            continue
        ent['canvas'] = rect(canvas)
        for part in children(canvas):
            gr = read_graphic(part, cmap, textures)
            if gr:
                ent['parts'].append(gr)
    return ent


def cmd_guides(env, cmap, textures):
    out = {}
    for o in env.objects:
        if o.type.name != 'GameObject' or o.peek_name() not in ('TutorialGuides', 'TutorialGuide'):
            continue
        tr = tr_of(o.read())
        if tr is None or tr.m_Father.path_id == 0:
            continue
        # Chi lay nhom duoi StaticDecoration cua sector (TutorialGuide con co the la ten cua prefab khac).
        if go_of(tr.m_Father.deref().read()).m_Name != 'StaticDecoration':
            continue
        root = root_of(tr)
        sid = go_of(root).m_Name
        if sid not in SECTORS:
            continue
        # Toa do theo goc prefab sector; Sector.csv cung dung goc nay.
        groups = {}
        kids = children(tr)
        names = [go_of(k).m_Name for k in kids]
        if 'Keyboard' in names or 'Gamepad' in names:
            for k in kids:
                groups[go_of(k).m_Name.lower()] = [guide_entry(c, root, cmap, textures) for c in children(k)]
        else:
            both = [guide_entry(c, root, cmap, textures) for c in kids]
            groups['keyboard'] = both
            groups['gamepad'] = both
        out[sid] = groups
        print('  sector', sid, {k: len(v) for k, v in groups.items()}, flush=True)
    return out


def sprite_of(o, cmap, key):
    d = o.read()
    p = getattr(d, key, None)
    return vd.deref(p) if p is not None else None


def panel_sprites(env, cmap, sub, root_name, sprites):
    """Sprite (Image.m_Sprite) trong mot prefab UI: ten node -> ten sprite."""
    res = []
    for o in env.objects:
        if o.type.name != 'GameObject' or o.peek_name() != sub:
            continue
        tr = tr_of(o.read())
        if root_name and go_of(root_of(tr)).m_Name != root_name:
            continue

        def walk(t, path):
            g = go_of(t)
            for c in comps(g):
                if c.type.name == 'MonoBehaviour' and mb_class(c, cmap) == 'UnityEngine.UI.Image':
                    d = c.read()
                    sp = vd.deref(d.m_Sprite)
                    if sp is not None:
                        sprites[sp.m_Name] = sp
                        res.append({'node': path + g.m_Name, 'sprite': sp.m_Name, 'color': rgba(d.m_Color), 'type': d.m_Type,
                                    'fillMethod': d.m_FillMethod, 'fillOrigin': d.m_FillOrigin, **rect(t)})
                if c.type.name == 'MonoBehaviour' and mb_class(c, cmap) == 'LocalizationText':
                    res.append({'node': path + g.m_Name, 'key': c.read_typetree().get('Key')})
            for ch in children(t):
                walk(ch, path + g.m_Name + '/')
        walk(tr, '')
        return res
    return res


def save_sprites(sprites):
    # Goi ben trong ham doc cua with_deps: anh sprite nam trong atlas o bundle khac, thieu CAB thi with_deps nap them roi chay lai.
    for name, sp in list(sprites.items()):
        img = sp.image
        save_img(img, os.path.join(OUT, 'key', name + '.webp'))
        print('  sprite', name, img.size, flush=True)
        del sprites[name]


def main():
    os.makedirs(OUT, exist_ok=True)
    textures, sprites = {}, {}
    res = {'source': 'VOID DIVER demo, tools/ui_tutorial_rip.py', 'units': 'Unity, met, tuong doi goc prefab sector'}

    def run_sector(env):
        cmap = class_map(env)
        res['sectors'] = cmd_guides(env, cmap, textures)
        for name, tex in textures.items():
            save_img(tex.image, os.path.join(OUT, name + '.webp'))
            print('  tex', name, tex.m_Width, 'x', tex.m_Height, flush=True)
        res['textures'] = {n: [t.m_Width, t.m_Height] for n, t in textures.items()}
    vd.with_deps(vd.bfile('remote_prefab_assets_sector'), run_sector, deps=[vd.bfile(MONO)])

    def run_scene(env):
        cmap = class_map(env)
        res['cutscenePanel'] = panel_sprites(env, cmap, 'CutscenePanel', None, sprites)
        # Bang "Huong Dan [O]" goc phai duoi HUD (InGameKeyGuidePanelView): cac dong Attack/Dash/Run/MiniMap/Inventory/Emoji/Ping.
        res['keyGuidePanel'] = panel_sprites(env, cmap, 'KeyGuidePanel!', 'StageScene', sprites)
        save_sprites(sprites)
    vd.with_deps(vd.bfile('remote_prefab_assets_scene'), run_scene, deps=[vd.bfile(MONO)])

    def run_popup(env):
        cmap = class_map(env)
        res['dialogKeys'] = panel_sprites(env, cmap, 'Keys[]', 'DialogPopup', sprites)
        save_sprites(sprites)
    vd.with_deps(vd.bfile('remote_prefab_assets_popup'), run_popup, deps=[vd.bfile(MONO)])

    with open(os.path.join(OUT, 'guides.json'), 'w', encoding='utf-8') as fh:
        json.dump(res, fh, ensure_ascii=False, separators=(',', ':'))
    print('wrote', os.path.join(OUT, 'guides.json'))


if __name__ == '__main__':
    main()
