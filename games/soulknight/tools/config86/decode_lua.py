# Giải runtime_lua.ab (Soul Knight 8.6.0): 252 TextAsset base64 → mã Lua nguồn (xLua).
# [ĐO] Chuỗi gỡ (đọc ngược RuntimeLuaSourceLoader.DecryptSource → DESCrypt.Decrypt):
#   Base64 → DES-CBC, IV = 8 byte 0 (tham số iv = "" đệm thành char[8]), đệm PKCS7
#   khoá = 8 ký tự đầu của GameConfigManager.SecretKey (thiếu thì đệm \0)
#   SecretKey = XORCrypt.Decrypt('*1"8ku|', '-PS`2AWO&')   (string literal #3282, #5076)
#     XORCrypt: b[i] ^= ((i%15)*(i%5) & 0xFF) % 92 ^ key[i % len(key)]  → '\x07`uQI4-' (7 ký tự)
# Chạy: PYTHONIOENCODING=utf-8 python decode_lua.py
# Ra: D:\sk86-ref\decoded\lua\<đường dẫn trong bundle>.lua  (+ _index.json: tên asset → tệp)
import base64, json, os, re

import UnityPy
from Crypto.Cipher import DES

AB = r'D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles\runtime_lua.ab'
OUT = r'D:\sk86-ref\decoded\lua'


def xor_crypt(data, key):
    b = bytearray(data.encode('utf-8'))
    for i in range(len(b)):
        b[i] ^= (((i % 15) * (i % 5)) & 0xFF) % 92 ^ ord(key[i % len(key)])
    return bytes(b)


KEY = (xor_crypt('*1"8ku|', '-PS`2AWO&') + bytes(8))[:8]


def decrypt(b64):
    c = base64.b64decode(b64)
    p = DES.new(KEY, DES.MODE_CBC, bytes(8)).decrypt(c)
    return p[:-p[-1]] if 0 < p[-1] <= 8 else p


def main():
    env = UnityPy.load(AB)
    paths = {}
    for o in env.objects:
        if o.type.name == 'AssetBundle':
            for name, info in o.read_typetree()['m_Container']:
                paths[info['asset']['m_PathID']] = name
    index, n = {}, 0
    for o in env.objects:
        if o.type.name != 'TextAsset':
            continue
        d = o.read()
        s = d.m_Script
        raw = s.encode('utf-8', 'surrogateescape') if isinstance(s, str) else bytes(s)
        src = decrypt(raw)
        p = paths.get(o.path_id, d.m_Name)
        p = re.sub(r'^.*?/encryptedsrc/', '', p, flags=re.I)
        p = re.sub(r'\.(bytes|txt)$', '', p)
        if not p.endswith('.lua'):
            p += '.lua'
        fn = os.path.join(OUT, *p.split('/'))
        os.makedirs(os.path.dirname(fn), exist_ok=True)
        open(fn, 'wb').write(src)
        index[p] = {'asset': d.m_Name, 'bytes': len(src)}
        n += 1
    json.dump(index, open(os.path.join(OUT, '_index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(n, 'tệp lua ->', OUT, '; khoá', KEY.hex())


if __name__ == '__main__':
    main()
