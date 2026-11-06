"""Localization XML TextAssets -> data/lang.json. Usage: export_lang.py TEXT_DIR OUT"""
import sys, os, json, xml.etree.ElementTree as ET
src, out = sys.argv[1:3]
res = {}
for fn in sorted(os.listdir(src)):
    name = fn.split('__')[0]
    if name in ('BillingMode', 'LanguageSettings'): continue
    root = ET.fromstring(open(os.path.join(src, fn), encoding='utf-8-sig').read())
    res[name] = {e.get('Key'): (e.text or '') for e in root.iter('Localizable')}
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print({k: len(v) for k, v in res.items()})
