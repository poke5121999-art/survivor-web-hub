# -*- coding: utf-8 -*-
"""Đọc cây UI gốc của túi đồ / bảng lục rương (uGUI) ra JSON + dàn ý chữ để dựng lại bằng DOM/CSS.

    set PYTHONIOENCODING=utf-8
    python ui_inventory_dump.py [TênPrefab ...]     # mặc định: các prefab trong PREFABS

Đầu ra (ngoài git, trong %TEMP%/voiddiver-rip/ui_inventory/):
    <Tên>.json   cây RectTransform (anchor, pivot, sizeDelta, anchoredPosition), Image (sprite, màu, type),
                 Text/TMP (chữ, cỡ, màu, căn), LocalizeText (khoá), mọi MonoBehaviour khác (typetree rút gọn)
    <Tên>.txt    dàn ý một dòng mỗi node để đọc bằng mắt
Chỉ để đo; ui_inventory_rip.py mới ghi ra art/.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vd_common as vd

MONO = 'be9e4d904692f945f3910b57349aeb09_monoscripts'
PREFABS = ['InventoryManagementPage', 'LootingInventory', 'SafeInventoryPanel', 'InventoryGoodsSlot',
           'DraggingGoodsSlot', 'GoodsTooltipPopup', 'GoodsTooltip', 'InventoryPanel', 'MyInventory',
           'QuickSlotSettingPanel', 'EquipmentInventoryPanel', 'GoodsSlot', 'InventoryGoodsSlotRow',
           'PlayerInventoryScroller', 'MenuPopup', 'InGameQuickSlotPanel']
BUNDLES = ['remote_prefab_assets_popup', 'remote_prefab_assets_slot', 'remote_prefab_assets_slotrow',
           'remote_prefab_assets_scene', 'dependencies_assets_prefab']
OUT = os.path.join(vd.CACHE, 'ui_inventory')
SKIP_KEYS = {'m_GameObject', 'm_Enabled', 'm_EditorHideFlags', 'm_EditorClassIdentifier', 'm_Script',
             'm_ObjectHideFlags', 'm_CorrespondingSourceObject', 'm_PrefabInstance', 'm_PrefabAsset'}


def v2(v):
    return [round(v.x, 2), round(v.y, 2)] if hasattr(v, 'x') else v


def col(c):
    if isinstance(c, dict):
        return [round(c.get(k, 0), 3) for k in ('r', 'g', 'b', 'a')]
    return c


def short_tt(t, depth=0):
    """Typetree rút gọn: PPtr → tên đích nếu được, mảng dài cắt bớt."""
    if isinstance(t, dict):
        if set(t.keys()) >= {'m_FileID', 'm_PathID'}:
            return t if t['m_PathID'] else None
        return {k: short_tt(v, depth + 1) for k, v in t.items() if k not in SKIP_KEYS}
    if isinstance(t, list):
        return [short_tt(x, depth + 1) for x in t[:40]]
    return t


def name_of_pptr(obj_reader_env, pptr_obj):
    try:
        o = pptr_obj.deref_parse_as_object()
        return getattr(o, 'm_Name', None) or type(o).__name__
    except FileNotFoundError:
        raise
    except Exception:
        return None


def main():
    names = sys.argv[1:] or PREFABS
    os.makedirs(OUT, exist_ok=True)
    cls = {}

    def go(env):
        for o in env.objects:
            if o.type.name == 'MonoScript':
                d = o.read()
                cls[(o.assets_file.name, o.path_id)] = d.m_ClassName
        found = {}
        for bname in BUNDLES:
            bf = vd.bfile(bname)
            for sf in vd.serialized_files(env, bf):
                # Không chỉ gốc prefab: InventoryManagementPage/LootingInventory nằm lồng trong popup khác.
                for o in sf.objects.values():
                    if o.type.name != 'RectTransform':
                        continue
                    tr = o.read()
                    g = vd.deref(tr.m_GameObject)
                    if g and g.m_Name in names:
                        prev = found.get(g.m_Name)
                        path = path_of(tr)
                        if not prev or len(path) < len(prev[2]):
                            found[g.m_Name] = (bname, tr, path)
        for n in names:
            if n not in found:
                print('KHÔNG THẤY', n)
                continue
            bname, tr, path = found[n]
            lines = ['# ' + bname + ' : ' + '/'.join(path)]
            tree = node(env, tr, 0, lines)
            json.dump({'bundle': bname, 'path': path, 'root': tree}, open(os.path.join(OUT, n + '.json'), 'w', encoding='utf-8'),
                      ensure_ascii=False, indent=1, default=str)
            open(os.path.join(OUT, n + '.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
            print(n, bname, len(lines), 'node ->', os.path.join(OUT, n + '.txt'))

    def path_of(tr):
        out = []
        while tr is not None:
            g = vd.deref(tr.m_GameObject)
            out.append(g.m_Name if g else '?')
            tr = tr.m_Father.deref_parse_as_object() if tr.m_Father.path_id else None
        return out[::-1]

    def script_name(mb):
        try:
            s = mb.m_Script.deref_parse_as_object()
            return s.m_ClassName
        except FileNotFoundError:
            raise
        except Exception:
            return '?'

    def node(env, tr, d, lines):
        g = vd.deref(tr.m_GameObject)
        n = {'name': g.m_Name, 'active': bool(g.m_IsActive), 'comps': []}
        if type(tr).__name__ == 'RectTransform':
            n['rect'] = {'amin': v2(tr.m_AnchorMin), 'amax': v2(tr.m_AnchorMax), 'pivot': v2(tr.m_Pivot),
                         'size': v2(tr.m_SizeDelta), 'pos': v2(tr.m_AnchoredPosition)}
        sc = tr.m_LocalScale
        if abs(sc.x - 1) > 1e-3 or abs(sc.y - 1) > 1e-3:
            n['scale'] = [round(sc.x, 3), round(sc.y, 3)]
        desc = []
        for c in (g.m_Components if hasattr(g, 'm_Components') else g.m_Component):
            ptr = c.component if hasattr(c, 'component') else c
            try:
                o = ptr.deref_parse_as_object()
            except FileNotFoundError as e:
                if 'cab-' in str(e).lower():
                    raise
                continue
            tn = type(o).__name__
            if tn in ('Transform', 'RectTransform'):
                continue
            if tn != 'MonoBehaviour':
                n['comps'].append({'type': tn})
                desc.append(tn)
                continue
            sn = script_name(o)
            t = ptr.deref().read_typetree()
            cmp = {'type': sn}
            if sn in ('Image', 'RawImage', 'NemoImage', 'SlicedFilledImage') or 'm_Sprite' in t:
                sp = t.get('m_Sprite') or {}
                spn = None
                if sp.get('m_PathID'):
                    try:
                        spn = o.m_Sprite.deref_parse_as_object().m_Name
                    except FileNotFoundError as e:
                        if 'cab-' in str(e).lower():
                            raise
                    except Exception:
                        spn = '?'
                mat = None
                if (t.get('m_Material') or {}).get('m_PathID'):
                    try:
                        mat = o.m_Material.deref_parse_as_object().m_Name
                    except FileNotFoundError as e:
                        if 'cab-' in str(e).lower():
                            raise
                    except Exception:
                        mat = '?'
                cmp.update({'sprite': spn, 'color': col(t.get('m_Color')), 'imgType': t.get('m_Type'),
                            'fillCenter': t.get('m_FillCenter'), 'ppu': t.get('m_PixelsPerUnitMultiplier'),
                            'raycast': t.get('m_RaycastTarget'), 'material': mat})
                desc.append('%s[%s %s%s]' % (sn, spn, col(t.get('m_Color')), ' mat=' + mat if mat else ''))
            elif 'm_text' in t or 'm_Text' in t:
                txt = t.get('m_text', t.get('m_Text'))
                fd = t.get('m_FontData') or {}
                font = None
                fp = t.get('m_fontAsset') or fd.get('m_Font')
                if fp and fp.get('m_PathID'):
                    try:
                        font = (o.m_fontAsset if hasattr(o, 'm_fontAsset') else o.m_FontData.m_Font).deref_parse_as_object().m_Name
                    except FileNotFoundError as e:
                        if 'cab-' in str(e).lower():
                            raise
                    except Exception:
                        font = '?'
                cmp.update({'text': txt, 'size': t.get('m_fontSize', fd.get('m_FontSize')),
                            'color': col(t.get('m_fontColor', t.get('m_Color'))), 'font': font,
                            'align': t.get('m_HorizontalAlignment', t.get('m_textAlignment', fd.get('m_Alignment'))),
                            'style': t.get('m_fontStyle', fd.get('m_FontStyle')),
                            'autoSize': t.get('m_enableAutoSizing', fd.get('m_BestFit')),
                            'sizeMin': t.get('m_fontSizeMin'), 'sizeMax': t.get('m_fontSizeMax'),
                            'spacing': t.get('m_characterSpacing'), 'lineSpacing': t.get('m_lineSpacing')})
                desc.append('%s[%r %s %s %s]' % (sn, (txt or '')[:40], cmp['size'], cmp['color'], font))
            else:
                cmp['fields'] = short_tt(t)
                s = json.dumps(cmp['fields'], ensure_ascii=False, default=str)
                desc.append('%s%s' % (sn, s[:400]))
            n['comps'].append(cmp)
        r = n.get('rect')
        rs = ''
        if r:
            rs = ' a%s-%s p%s s%s @%s' % (r['amin'], r['amax'], r['pivot'], r['size'], r['pos'])
        lines.append('  ' * d + '%s%s%s  | %s' % (g.m_Name, '' if g.m_IsActive else ' (OFF)', rs, ' ; '.join(desc)))
        n['children'] = [node(env, c.deref_parse_as_object(), d + 1, lines) for c in tr.m_Children]
        return n

    deps = [MONO, 'dependencies_assets_sprite', 'dependencies_assets_spriteatlas', 'dependencies_assets_fonts',
            'dependencies_assets_texture', 'shared_dependencies_assets_all'] + BUNDLES[1:]
    vd.with_deps(vd.bfile(BUNDLES[0]), go, deps=[vd.bfile(b) for b in deps])


if __name__ == '__main__':
    main()
