# Đổ bảng chữ I2 Localization (localization.ab, MonoBehaviour I2LanguagesFull) ra JSON.
# Chạy: PYTHONIOENCODING=utf-8 python dump_localization.py
# Ra: D:\sk86-ref\decoded\localization.json = {term: {mã ngôn ngữ: chữ}}  (en-US, vi, zh-CN, ...)
#     D:\sk86-ref\decoded\localization_en_vi.json = {term: [en, vi]} gọn cho tra cứu
import UnityPy, json, os

AB = r'D:\sk86-ref\UnityDataAssetPack\assets\AssetBundles\localization.ab'
OUT = r'D:\sk86-ref\decoded'

env = UnityPy.load(AB)
src = next(o.read_typetree() for o in env.objects if o.type.name == 'MonoBehaviour')['mSource']
langs = [l.get('Code') or l.get('Name') for l in src['mLanguages']]
full, small = {}, {}
for t in src['mTerms']:
    row = {langs[i]: s for i, s in enumerate(t['Languages']) if i < len(langs) and s}
    full[t['Term']] = row
    small[t['Term']] = [row.get('en-US', ''), row.get('vi', '')]
os.makedirs(OUT, exist_ok=True)
json.dump(full, open(os.path.join(OUT, 'localization.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
with open(os.path.join(OUT, 'localization_en_vi.json'), 'w', encoding='utf-8') as f:
    lines = (json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False) for k, v in small.items())
    f.write('{\n' + ',\n'.join(lines) + '\n}\n')
print(len(full), 'term; ngôn ngữ:', langs)
