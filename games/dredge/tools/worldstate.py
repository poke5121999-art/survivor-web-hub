"""WorldStateChanger của Game.unity -> data/worldstate.js (paudit).

Chạy:  python -I games/dredge/tools/worldstate.py          (vài giây; chỉ đọc)
Đọc:   D:/dredge-ref/ripped/ExportedProject/Assets/Scenes/Game.unity: mọi MonoBehaviour WorldStateChangerConfig (có trường
       visitedTheseDialogueNodes) và GameObject của nó (tên); docks (guid DockData) đổi ra id qua tên tài sản trong data/world_data.js + MonoBehaviour/<tên>.asset.meta.
       Hành động nằm trong serializationData.SerializedBytes (Odin nhị phân): chỉ bóc BooleanSetWorldStateAction
       (chuỗi UTF-16 "boolName" + chuỗi giá trị, "enabledIfMet" + 1 byte). GameObjectToggleWorldStateAction (bật / tắt vật cảnh,
       vd lửa trại ở bốn bến Old Mayor) chỉ đếm, chưa dựng.
Ra:    window.DR_WORLDSTATE = [{ name, persists, key, onDock, onUndock, visited[], vMode, unvisited[], uMode, zones (cờ ZoneEnum),
       zMode, docks[], dMode, bools: [[tên, giá trị]], toggles }]   (mode = ConditionMode: 1 WHITELIST, 2 BLACKLIST, 3 ALL, 4 ANY, 5 NONE)
Gốc:   WorldStateChanger.cs (xét lại mọi cấu hình chưa xong mỗi lần cập / rời bến), WorldStateChangerConfig.cs:73-125 (EvaluateCondition),
       BooleanSetWorldStateAction.cs:7-10. Bẫy: `[BẪY]` OldMayorDockEnabler đặt "old-mayor-available" — thiếu nó thì OldMayor_Intro
       không bao giờ chạy và kết tốt (LighthouseKeeper_BookAsk cần OldMayor_Intro) bị chặn.
Rerunnable: cùng đầu vào ra cùng đầu ra.
"""
import io, os, re, json, sys, struct

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
RIP = os.environ.get('DR_RIPPED', 'D:/dredge-ref/ripped/ExportedProject/Assets')
SCENE = os.path.join(RIP, 'Scenes', 'Game.unity')
OUT = os.path.join(GAME, 'data', 'worldstate.js')


def docs(path):
    """(classId, fileId, text) cho từng tài liệu YAML."""
    cur, head = [], None
    with io.open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('--- !u!'):
                if head:
                    yield head[0], head[1], ''.join(cur)
                m = re.match(r'--- !u!(\d+) &(-?\d+)', line)
                head, cur = (m.group(1), m.group(2)), []
            elif head:
                cur.append(line)
    if head:
        yield head[0], head[1], ''.join(cur)


def dock_ids():
    """guid DockData -> id (dock.xxx): DockData là Odin (id nằm trong byte), nên đi qua tên tài sản của DR_WORLD.DockData (tools/data.py)."""
    src = io.open(os.path.join(GAME, 'data', 'world_data.js'), encoding='utf-8').read()
    m = re.search(r'window\.\w+\s*=\s*', src)
    W = json.JSONDecoder().raw_decode(src, m.end())[0]
    out = {}
    for did, d in W['DockData'].items():
        meta = os.path.join(RIP, 'MonoBehaviour', d.get('asset', '') + '.asset.meta')
        if os.path.exists(meta):
            g = re.search(r'guid: ([0-9a-f]{32})', io.open(meta, encoding='utf-8', errors='replace').read())
            if g:
                out[g.group(1)] = did
    return out


def u16(s):
    return s.encode('utf-16-le')


def bool_actions(blob):
    """[(boolName, enabledIfMet)] từ SerializedBytes của Odin."""
    out, k = [], 0
    key, flag = u16('boolName'), u16('enabledIfMet')
    while True:
        i = blob.find(key, k)
        if i < 0:
            break
        p = i + len(key)
        if blob[p] != 0x01:
            k = p
            continue
        n = struct.unpack_from('<i', blob, p + 1)[0]
        name = blob[p + 5:p + 5 + 2 * n].decode('utf-16-le')
        j = blob.find(flag, p)
        val = bool(blob[j + len(flag)]) if j >= 0 else True
        out.append([name, val])
        k = p + 5 + 2 * n
    return out


def lst(text, key):
    m = re.search(r'\n  ' + key + r':(?: \[\])?\n((?:  - .*\n)*)', text)
    return [x[4:].strip() for x in m.group(1).splitlines()] if m else []


def num(text, key, d=0):
    m = re.search(r'\n  ' + key + r': (-?\d+)', text)
    return int(m.group(1)) if m else d


def main():
    names, cfgs = {}, []
    for cls, fid, t in docs(SCENE):
        if cls == '1':
            m = re.search(r'\n  m_Name: (.*)', t)
            names[fid] = m.group(1).strip() if m else ''
        elif cls == '114' and '\n  visitedTheseDialogueNodes:' in t and '\n  persistenceBoolKey:' in t:
            cfgs.append(t)
    D = dock_ids()
    out = []
    for t in cfgs:
        go = re.search(r'm_GameObject: \{fileID: (-?\d+)\}', t).group(1)
        hexs = re.search(r'SerializedBytes: ([0-9a-f]*)', t)
        blob = bytes.fromhex(hexs.group(1)) if hexs else b''
        z = re.search(r'\n  zones: ([0-9a-f]*)', t)
        zones = struct.unpack('<i', bytes.fromhex(z.group(1)))[0] if z and len(z.group(1)) == 8 else 0
        key = re.search(r'\n  persistenceBoolKey: ?(.*)', t)
        out.append({
            'name': names.get(go, ''), 'persists': bool(num(t, 'persists')), 'key': (key.group(1).strip() if key else ''),
            'onDock': bool(num(t, 'triggerOnDock', 1)), 'onUndock': bool(num(t, 'triggerOnUndock', 1)),
            'visited': lst(t, 'visitedTheseDialogueNodes'), 'vMode': num(t, 'dialogueConditionMode'),
            'unvisited': lst(t, 'unvisitedTheseDialogueNodes'), 'uMode': num(t, 'unvisitedDialogueConditionMode'),
            'zones': zones, 'zMode': num(t, 'zoneConditionMode'),
            'docks': [D.get(g, g) for g in re.findall(r'guid: ([0-9a-f]{32}), type: 2', t.split('\n  docks:')[1].split('\n  dockConditionMode')[0])] if '\n  docks:' in t else [],
            'dMode': num(t, 'dockConditionMode'),
            'bools': bool_actions(blob), 'toggles': blob.count(u16('GameObjectToggleWorldStateAction')),
        })
    out.sort(key=lambda c: c['name'])
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by games/dredge/tools/worldstate.py from Game.unity (WorldStateChangerConfig). Do not edit.\n')
        f.write('window.DR_WORLDSTATE = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
    for c in out:
        print('%-28s bools=%s toggles=%d visited=%s/%d unvisited=%s/%d docks=%s/%d' % (c['name'], c['bools'], c['toggles'], c['visited'], c['vMode'], c['unvisited'], c['uMode'], c['docks'], c['dMode']))
    print('->', OUT)


if __name__ == '__main__':
    main()
