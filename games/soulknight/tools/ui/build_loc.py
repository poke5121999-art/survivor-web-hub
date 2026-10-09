# -*- coding: utf-8 -*-
"""localization.ab (I2 Localization, không mã hoá) -> $SK86/decoded/localization_en_vi.json = {term: [en, vi]}.

Chạy: PYTHONIOENCODING=utf-8 python games/soulknight/tools/ui/build_loc.py
build_ui.py và các lever khác đọc tệp này (chữ tiếng Việt chính thức của game).
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import skrip  # noqa: E402
import UnityPy  # noqa: E402

OUT = os.path.join(skrip.REF, 'decoded', 'localization_en_vi.json')


def main():
    env = UnityPy.load(os.path.join(skrip.AB86, 'localization.ab'))
    src = next(o.read_typetree()['mSource'] for o in env.objects if o.type.name == 'MonoBehaviour')
    codes = [l.get('Code') for l in src['mLanguages']]
    en, vi = codes.index('en-US'), codes.index('vi')
    out = {}
    for t in src['mTerms']:
        L = t['Languages']
        out[t['Term']] = [L[en] if en < len(L) else '', L[vi] if vi < len(L) else '']
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print('languages', codes, 'terms', len(out), 'vi rỗng', sum(1 for v in out.values() if not v[1]), '->', OUT)


if __name__ == '__main__':
    main()
